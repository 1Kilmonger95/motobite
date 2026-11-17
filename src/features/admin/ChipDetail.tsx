import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/status";
import { friendlyError } from "../../lib/errors";
import type { Chip, DeviceRow, TokenRow } from "../../lib/types";
import { Badge, ErrorBox, Spinner } from "../../components/ui";
import ChipForm from "./ChipForm";
import ActivationPanel from "./ActivationPanel";

export default function ChipDetail() {
  const { id } = useParams();
  const [chip, setChip] = useState<Chip | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const [c, t, d] = await Promise.all([
        supabase.from("chips").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("activation_tokens")
          .select("id, chip_id, status, expires_at, reserved_until, consumed_at, created_at")
          .eq("chip_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("device_activations")
          .select("id, chip_id, device_label, source_type, activated_at, status")
          .eq("chip_id", id)
          .order("activated_at", { ascending: false })
          .limit(20)
      ]);
      if (cancelled) return;
      const err = c.error ?? t.error ?? d.error;
      if (err) setError(friendlyError(err));
      else {
        setChip((c.data as Chip | null) ?? null);
        setTokens((t.data ?? []) as TokenRow[]);
        setDevices((d.data ?? []) as DeviceRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function toggleActive() {
    if (!chip) return;
    const next = !chip.active;
    if (!next && !window.confirm("¿Desactivar este chip? Mientras esté desactivado, nadie podrá activar sus enlaces.")) {
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.from("chips").update({ active: next }).eq("id", chip.id).select().single();
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setChip(data as Chip);
  }

  async function refreshTokens() {
    if (!id) return;
    const { data, error: err } = await supabase
      .from("activation_tokens")
      .select("id, chip_id, status, expires_at, reserved_until, consumed_at, created_at")
      .eq("chip_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (err) setError(friendlyError(err));
    else setTokens((data ?? []) as TokenRow[]);
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <Link to="/admin/chips" className="text-sm text-brand-600 underline">← Volver a chips</Link>
      <ErrorBox message={error} />
      {!chip && !error && <div className="card">No se encontró este chip.</div>}

      {chip && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{chip.name}</h1>
            <Badge className={chip.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}>
              {chip.active ? "Activo" : "Desactivado"}
            </Badge>
          </div>

          <div className="card space-y-4">
            {editing ? (
              <ChipForm
                initial={chip}
                onSaved={(c) => {
                  setChip(c);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <div>
                  <p className="text-sm text-slate-500">Descripción</p>
                  <p>{chip.description || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Documento en Google Drive</p>
                  <a href={chip.drive_url} target="_blank" rel="noopener noreferrer"
                    className="break-all text-brand-600 underline">{chip.drive_url}</a>
                  <p className="text-xs text-slate-500">
                    ID de archivo: {chip.drive_file_id ?? "no detectado"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Editar</button>
                  <button type="button" className={`btn ${chip.active ? "btn-danger" : "btn-primary"}`}
                    onClick={toggleActive} disabled={busy}>
                    {chip.active ? "Desactivar chip" : "Activar chip"}
                  </button>
                </div>
              </>
            )}
          </div>

          <ActivationPanel chip={chip} tokens={tokens} onChanged={refreshTokens} />

          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Dispositivos activados</h2>
            {devices.length === 0 ? (
              <p className="text-sm text-slate-500">Ningún dispositivo ha activado este chip.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{d.device_label ?? "Dispositivo sin nombre"} · {d.source_type === "drive" ? "Drive" : "Archivo local"}</span>
                    <span className="text-slate-500">{formatDate(d.activated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
