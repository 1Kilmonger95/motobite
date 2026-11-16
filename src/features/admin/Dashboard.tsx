import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { effectiveStatus, STATUS_LABEL, STATUS_STYLE } from "../../lib/status";
import { friendlyError } from "../../lib/errors";
import type { TokenRow, TokenStatus } from "../../lib/types";
import { Badge, ErrorBox, Spinner } from "../../components/ui";

type Stats = {
  chips: number;
  activeChips: number;
  devices: number;
  byStatus: Record<TokenStatus, number>;
};

const ORDER: TokenStatus[] = ["pending", "reserved", "activated", "expired", "revoked"];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, t, d] = await Promise.all([
        supabase.from("chips").select("id, active"),
        supabase.from("activation_tokens").select("status, expires_at, reserved_until"),
        supabase.from("device_activations").select("id", { count: "exact", head: true })
      ]);
      if (cancelled) return;
      const err = c.error ?? t.error ?? d.error;
      if (err) {
        setError(friendlyError(err));
        return;
      }
      const byStatus: Record<TokenStatus, number> = { pending: 0, reserved: 0, activated: 0, expired: 0, revoked: 0 };
      for (const row of (t.data ?? []) as Pick<TokenRow, "status" | "expires_at" | "reserved_until">[]) {
        byStatus[effectiveStatus(row)]++;
      }
      const chips = (c.data ?? []) as { id: string; active: boolean }[];
      setStats({
        chips: chips.length,
        activeChips: chips.filter((x) => x.active).length,
        devices: d.count ?? 0,
        byStatus
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel</h1>
        <Link to="/admin/chips/new" className="btn btn-primary">Registrar chip</Link>
      </div>

      <ErrorBox message={error} />
      {!stats && !error && <Spinner />}

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card"><p className="text-sm text-slate-500">Chips registrados</p><p className="text-3xl font-bold">{stats.chips}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Chips activos</p><p className="text-3xl font-bold">{stats.activeChips}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Dispositivos activados</p><p className="text-3xl font-bold">{stats.devices}</p></div>
          </div>

          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Enlaces de activación</h2>
            <div className="flex flex-wrap gap-3">
              {ORDER.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <Badge className={STATUS_STYLE[s]}>{STATUS_LABEL[s]}</Badge>
                  <span className="text-lg font-semibold">{stats.byStatus[s]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
