// MotoBite · Edge Function única (Etapas 4 y 5)
// Acciones de administrador (requieren sesión de admin): "issue", "revoke".
// Acciones públicas (el token del enlace es la credencial): "status", "reserve", "release", "confirm".
// Usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, que Supabase inyecta en las Edge Functions.
// IMPORTANTE: en la configuración de la función desactiva "Verify JWT": los clientes no tienen sesión
// y esta función valida por sí misma cada acción.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

type Db = SupabaseClient;

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PUBLIC_ACTIONS = new Set(["status", "reserve", "release", "confirm"]);
const RESERVATION_SECONDS = 900;
// Límites por minuto. Las redes móviles comparten IP entre muchos clientes, por eso el límite por IP es amplio
// y el protector principal es el límite por enlace.
const LIMIT_IP = Number(Deno.env.get("RATE_IP_PER_MIN") ?? 300);
const LIMIT_TOKEN = Number(Deno.env.get("RATE_TOKEN_PER_MIN") ?? 40);

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function rpcResponse(data: unknown, error: { message: string } | null): Response {
  if (error) {
    console.error("rpc_error", error.message); // nunca se registra el token
    return json({ error: "server_error" }, 500);
  }
  return json(data);
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

// Si el contador falla, se deja pasar la petición (no se tumba el servicio por un error del límite).
async function allowed(db: Db, key: string, limit: number): Promise<boolean> {
  const { data, error } = await db.rpc("check_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: 60 });
  if (error) {
    console.error("rate_limit_error", error.message);
    return true;
  }
  return data !== false;
}

async function handlePublic(db: Db, req: Request, body: Record<string, unknown>): Promise<Response> {
  const ipKey = `ip:${(await sha256Hex(clientIp(req))).slice(0, 16)}`; // no se guarda la IP real
  if (!(await allowed(db, ipKey, LIMIT_IP))) return json({ error: "rate_limited" }, 429);

  const token = String(body.token ?? "");
  if (!TOKEN.test(token)) return json({ ok: false, code: "not_found" });
  const tokenHash = await sha256Hex(token);
  if (!(await allowed(db, `tok:${tokenHash.slice(0, 16)}`, LIMIT_TOKEN))) return json({ error: "rate_limited" }, 429);

  const reservationId = body.reservation_id == null ? null : String(body.reservation_id);
  if (reservationId !== null && !UUID.test(reservationId)) return json({ error: "invalid_input" }, 400);

  switch (body.action) {
    case "status": {
      const { data, error } = await db.rpc("get_activation_status", { p_token_hash: tokenHash });
      return rpcResponse(data, error);
    }
    case "reserve": {
      const { data, error } = await db.rpc("reserve_activation", {
        p_token_hash: tokenHash,
        p_reservation_id: reservationId,
        p_ttl_seconds: RESERVATION_SECONDS
      });
      return rpcResponse(data, error);
    }
    case "release": {
      if (!reservationId) return json({ error: "invalid_input" }, 400);
      const { data, error } = await db.rpc("release_reservation", {
        p_token_hash: tokenHash,
        p_reservation_id: reservationId
      });
      return rpcResponse({ released: data === true }, error);
    }
    case "confirm": {
      const installationId = String(body.installation_id ?? "");
      const sourceType = String(body.source_type ?? "");
      const deviceLabel = body.device_label == null ? null : String(body.device_label).slice(0, 80);
      if (!reservationId || installationId.length < 16 || installationId.length > 128 ||
          !["drive", "local"].includes(sourceType)) {
        return json({ error: "invalid_input" }, 400);
      }
      const { data, error } = await db.rpc("confirm_activation", {
        p_token_hash: tokenHash,
        p_reservation_id: reservationId,
        p_installation_id: installationId,
        p_device_label: deviceLabel,
        p_source_type: sourceType
      });
      return rpcResponse(data, error);
    }
  }
  return json({ error: "invalid_input" }, 400);
}

async function handleAdmin(db: Db, req: Request, body: Record<string, unknown>): Promise<Response> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const { data: userData, error: userError } = await db.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  const { data: adminRow } = await db.from("admin_users").select("id").eq("user_id", userId).maybeSingle();
  if (!adminRow) return json({ error: "forbidden" }, 403);

  if (body.action === "issue") {
    const chipId = String(body.chip_id ?? "");
    const hours = Number(body.expires_in_hours);
    if (!UUID.test(chipId) || !Number.isInteger(hours) || hours < 1 || hours > 8760) {
      return json({ error: "invalid_input" }, 400);
    }
    // 256 bits de un generador criptográficamente seguro. Solo se guarda su SHA-256.
    const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();

    const { data, error } = await db.rpc("issue_activation_token", {
      p_chip_id: chipId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_created_by: userId
    });
    if (error) {
      if (error.message.includes("chip_not_found")) return json({ error: "chip_not_found" }, 404);
      if (error.message.includes("chip_inactive")) return json({ error: "chip_inactive" }, 409);
      console.error("rpc_error", error.message);
      return json({ error: "server_error" }, 500);
    }
    return json({ token, token_id: data, expires_at: expiresAt });
  }

  if (body.action === "revoke") {
    const tokenId = String(body.token_id ?? "");
    if (!UUID.test(tokenId)) return json({ error: "invalid_input" }, 400);
    const { data, error } = await db.rpc("revoke_activation_token", { p_token_id: tokenId });
    if (error) {
      console.error("rpc_error", error.message);
      return json({ error: "server_error" }, 500);
    }
    return json({ revoked: data === true });
  }

  return json({ error: "invalid_input" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_input" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false }
  });

  if (PUBLIC_ACTIONS.has(String(body.action))) return await handlePublic(db, req, body);
  return await handleAdmin(db, req, body);
});
