import type { TokenRow, TokenStatus } from "./types";

// El estado guardado puede estar desfasado (la base solo marca "vencido" al usar el enlace),
// así que el panel calcula el estado efectivo.
export function effectiveStatus(
  t: Pick<TokenRow, "status" | "expires_at" | "reserved_until">,
  now: number = Date.now()
): TokenStatus {
  if ((t.status === "pending" || t.status === "reserved") && new Date(t.expires_at).getTime() <= now) {
    return "expired";
  }
  if (t.status === "reserved" && t.reserved_until && new Date(t.reserved_until).getTime() <= now) {
    return "pending";
  }
  return t.status;
}

export const STATUS_LABEL: Record<TokenStatus, string> = {
  pending: "Pendiente",
  reserved: "Reservado",
  activated: "Activado",
  expired: "Vencido",
  revoked: "Revocado"
};

export const STATUS_STYLE: Record<TokenStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  reserved: "bg-blue-100 text-blue-800",
  activated: "bg-emerald-100 text-emerald-800",
  expired: "bg-slate-200 text-slate-700",
  revoked: "bg-red-100 text-red-800"
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}
