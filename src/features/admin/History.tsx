import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/status";
import { friendlyError } from "../../lib/errors";
import type { DeviceRow } from "../../lib/types";
import { Badge, ErrorBox, Spinner } from "../../components/ui";

type Row = DeviceRow & { last_seen_at: string; chipName: string };

function nameOf(chips: unknown): string {
  const c = Array.isArray(chips) ? chips[0] : chips;
  return (c as { name?: string } | null | undefined)?.name ?? "—";
}

export default function History() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("device_activations")
        .select("id, chip_id, device_label, source_type, activated_at, last_seen_at, status, chips(name)")
        .order("activated_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (err) {
        setError(friendlyError(err));
        setRows([]);
        return;
      }
      setRows(((data ?? []) as (Row & { chips?: unknown })[]).map((d) => ({ ...d, chipName: nameOf(d.chips) })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Historial de activaciones</h1>
      <ErrorBox message={error} />
      {!rows && <Spinner />}
      {rows && rows.length === 0 && !error && <div className="card text-center text-slate-500">Aún no hay dispositivos activados.</div>}

      <ul className="space-y-3">
        {rows?.map((d) => (
          <li key={d.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <Link to={`/admin/chips/${d.chip_id}`} className="font-semibold text-brand-600 underline">{d.chipName}</Link>
              <p className="text-sm">{d.device_label ?? "Dispositivo sin nombre"} · {d.source_type === "drive" ? "Desde Drive" : "Archivo del teléfono"}</p>
              <p className="text-xs text-slate-500">Activado: {formatDate(d.activated_at)}</p>
            </div>
            <Badge className={d.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}>
              {d.status === "active" ? "Activo" : "Reemplazado"}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        «Reemplazado» significa que se emitió un enlace nuevo para ese chip (por ejemplo, por cambio de teléfono). El PDF
        guardado en el teléfono anterior no se puede borrar de forma remota.
      </p>
    </div>
  );
}
