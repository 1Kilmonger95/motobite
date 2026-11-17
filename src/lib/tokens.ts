import { callApi } from "./api";

type CallResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

const NETWORK = "No se pudo contactar la función. Revisa tu Internet y que la función esté desplegada en Supabase.";

function explain(code: string, status: number): string {
  if (code === "chip_inactive") return "El chip está desactivado. Actívalo para emitir enlaces.";
  if (code === "chip_not_found") return "No se encontró el chip.";
  if (code === "invalid_input") return "Los datos enviados no son válidos.";
  if (code === "forbidden" || status === 403) return "Esta cuenta no tiene permisos de administrador.";
  if (status === 401) return "La función rechazó la sesión. Cierra sesión, entra de nuevo y reintenta.";
  if (status === 404) return "La función no está desplegada en Supabase.";
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

async function call(body: Record<string, unknown>): Promise<CallResult> {
  const r = await callApi(body);
  if (r.ok) return r;
  return { ok: false, error: r.status === 0 ? NETWORK : explain(r.code, r.status) };
}

export async function issueToken(
  chipId: string,
  expiresInHours: number
): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  const res = await call({ action: "issue", chip_id: chipId, expires_in_hours: expiresInHours });
  if (!res.ok) return res;
  const token = res.data.token;
  const expiresAt = res.data.expires_at;
  if (typeof token !== "string" || typeof expiresAt !== "string") {
    return { ok: false, error: "La respuesta del servidor no es válida." };
  }
  return { ok: true, token, expiresAt };
}

export async function revokeToken(tokenId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await call({ action: "revoke", token_id: tokenId });
  if (!res.ok) return res;
  if (res.data.revoked !== true) {
    return { ok: false, error: "El enlace ya no se podía revocar (quizá ya fue activado, vencido o revocado)." };
  }
  return { ok: true };
}

// Los enlaces usan el fragmento (#) para que el token no viaje al servidor de hosting.
export function activationUrl(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/a/${token}`;
}
