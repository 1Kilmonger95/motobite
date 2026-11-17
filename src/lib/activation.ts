import { callApi } from "./api";

export type BlockedReason =
  | "not_found" | "expired" | "revoked" | "consumed" | "chip_inactive" | "reserved_by_other";

export type StatusResult =
  | { kind: "usable"; name: string; description: string; expiresAt: string; chipActive: boolean }
  | { kind: "blocked"; reason: BlockedReason }
  | { kind: "error"; message: string };

export type ReserveOk = {
  ok: true;
  reservationId: string;
  reservedUntil: string;
  name: string;
  description: string;
  driveUrl: string;
  driveFileId: string | null;
};
export type ReserveResult = ReserveOk | { ok: false; code: BlockedReason | "error"; message?: string };

const NET = "No se pudo conectar con MotoBite. Revisa tu Internet e inténtalo de nuevo.";
const UNEXPECTED = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const RATE = "Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.";
const msgFor = (status: number) => (status === 0 ? NET : status === 429 ? RATE : UNEXPECTED);
const BLOCKED = new Set<string>(["not_found", "expired", "revoked", "consumed", "chip_inactive", "reserved_by_other"]);

export async function getStatus(token: string): Promise<StatusResult> {
  const r = await callApi({ action: "status", token });
  if (!r.ok) return { kind: "error", message: msgFor(r.status) };
  const d = r.data;
  if (d.ok !== true) return { kind: "blocked", reason: "not_found" };
  switch (d.status) {
    case "pending":
    case "reserved":
      return {
        kind: "usable",
        name: String(d.name ?? ""),
        description: String(d.description ?? ""),
        expiresAt: String(d.expires_at ?? ""),
        chipActive: d.chip_active !== false
      };
    case "expired":
      return { kind: "blocked", reason: "expired" };
    case "revoked":
      return { kind: "blocked", reason: "revoked" };
    case "activated":
      return { kind: "blocked", reason: "consumed" };
    default:
      return { kind: "error", message: UNEXPECTED };
  }
}

export async function reserveActivation(token: string, reservationId: string | null): Promise<ReserveResult> {
  const r = await callApi({ action: "reserve", token, reservation_id: reservationId });
  if (!r.ok) return { ok: false, code: "error", message: msgFor(r.status) };
  const d = r.data;
  if (d.ok === true) {
    return {
      ok: true,
      reservationId: String(d.reservation_id),
      reservedUntil: String(d.reserved_until),
      name: String(d.name ?? ""),
      description: String(d.description ?? ""),
      driveUrl: String(d.drive_url ?? ""),
      driveFileId: typeof d.drive_file_id === "string" ? d.drive_file_id : null
    };
  }
  const code = String(d.code ?? "");
  if (BLOCKED.has(code)) return { ok: false, code: code as BlockedReason };
  return { ok: false, code: "error", message: UNEXPECTED };
}

export async function releaseActivation(token: string, reservationId: string): Promise<void> {
  await callApi({ action: "release", token, reservation_id: reservationId });
}

export type ConfirmResult =
  | { ok: true }
  | {
      ok: false;
      code: "reservation_expired" | "invalid_reservation" | "consumed" | "revoked" | "expired" | "not_found" | "invalid_input" | "error";
    };

const CONFIRM_CODES = new Set(["reservation_expired", "invalid_reservation", "consumed", "revoked", "expired", "not_found", "invalid_input"]);

export async function confirmActivation(
  token: string,
  reservationId: string,
  installationId: string,
  deviceLabel: string,
  sourceType: "drive" | "local"
): Promise<ConfirmResult> {
  const r = await callApi({
    action: "confirm",
    token,
    reservation_id: reservationId,
    installation_id: installationId,
    device_label: deviceLabel,
    source_type: sourceType
  });
  if (!r.ok) return { ok: false, code: r.status === 400 ? "invalid_input" : "error" };
  if (r.data.ok === true) return { ok: true };
  const code = String(r.data.code ?? "");
  return CONFIRM_CODES.has(code) ? { ok: false, code: code as Exclude<ConfirmResult, { ok: true }>["code"] } : { ok: false, code: "error" };
}
