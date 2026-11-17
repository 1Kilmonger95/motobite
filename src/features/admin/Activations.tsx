import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { effectiveStatus, formatDate, STATUS_LABEL, STATUS_STYLE } from "../../lib/status";
import { friendlyError } from "../../lib/errors";
import { revokeToken } from "../../lib/tokens";
import type { TokenRow, TokenStatus } from "../../lib/types";
import { Badge, ErrorBox, Spinner } from "../../components/ui";

type Row = TokenRow & { chipName: string };

function nameOf(chips: unknown): string {
  const c = Array.isArray(chips) ? chips[0] : chips;
  return (c as { name?: string } | null | undefined)?.name ?? "—";
}

export default function Activations() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<TokenStatus | "all">("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("activation_tokens")
      .select("id, chip_id, status, expires_at, reserved_until, consumed_at, created_at, chips(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) {
      setError(friendlyError(err));
      setRows([]);
      return;
    }
    setError("");
    setRows(((data ?? []) as (TokenRow & { chips?: unknown })[]).map((t) => ({ ...t, chipName: nameOf(t.chips) })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(row: Row) {
    if (!window.confirm(`¿Revocar el enlace vigente de «${row.chipName}»? Quien lo abra verá que fue revocado.`)) return;
    setBusy(row.id);
    const res = await revokeToken(row.id);
    setBusy("");
    if (!res.ok) setError(res.error);
    await load();
  }

  const shown = (rows ?? []).filter((r) => filter === "all" || effectiveStatus(r) === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Activaciones</h1>
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as TokenStatus | "all")} aria-label="Filtrar por estado">
          <option value="all">Todos los estados</option>
          {(Object.keys(STATUS_LABEL) as TokenStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <ErrorBox message={error} />
      {!rows && <Spinner />}
      {rows && shown.length === 0 && <div className="card text-center text-slate-500">No hay enlaces con ese estado.</div>}

      <ul className="space-y-3">
        {shown.map((r) => {
          const st = effectiveStatus(r);
          const live = st === "pending" || st === "reserved";
          return (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <Link to={`/admin/chips/${r.chip_id}`} className="font-semibold text-brand-600 underline">{r.chipName}</Link>
                <p className="text-xs text-slate-500">
                  Creado: {formatDate(r.created_at)} · Vence: {formatDate(r.expires_at)}
                  {r.consumed_at && ` · Activado: ${formatDate(r.consumed_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={STATUS_STYLE[st]}>{STATUS_LABEL[st]}</Badge>
                {live && (
                  <button type="button" className="btn btn-danger min-h-[36px] px-3" disabled={busy === r.id} onClick={() => void revoke(r)}>
                    Revocar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">Se muestran los últimos 200 enlaces. Para emitir uno nuevo, entra al chip.</p>
    </div>
  );
}
