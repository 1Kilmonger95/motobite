import { useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { extractDriveFileId, isDriveUrl } from "../../lib/drive";
import { friendlyError } from "../../lib/errors";
import type { Chip } from "../../lib/types";
import { ErrorBox } from "../../components/ui";

type Props = {
  initial?: Chip;
  onSaved: (chip: Chip) => void;
  onCancel?: () => void;
};

export default function ChipForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [driveUrl, setDriveUrl] = useState(initial?.drive_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const urlOk = isDriveUrl(driveUrl);
  const fileId = useMemo(() => (urlOk ? extractDriveFileId(driveUrl) : null), [driveUrl, urlOk]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Escribe un nombre para el chip.");
    if (!urlOk) return setError("El enlace debe empezar con https://drive.google.com/ o https://docs.google.com/.");

    const payload = {
      name: name.trim(),
      description: description.trim(),
      drive_url: driveUrl.trim(),
      drive_file_id: fileId
    };

    setSaving(true);
    try {
      const query = initial
        ? supabase.from("chips").update(payload).eq("id", initial.id)
        : supabase.from("chips").insert(payload);
      const { data, error: err } = await query.select().single();
      if (err) setError(friendlyError(err));
      else onSaved(data as Chip);
    } catch {
      setError("No hay conexión con el servidor. Revisa tu Internet e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Nombre</label>
        <input id="name" className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="description">Descripción</label>
        <textarea id="description" className="input py-2" rows={3} maxLength={1000}
          value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="drive">Enlace de Google Drive del PDF</label>
        <input id="drive" className="input" inputMode="url" placeholder="https://drive.google.com/file/d/…"
          value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">
          Comparte el archivo como «Cualquier persona con el enlace» para que tu cliente pueda abrirlo.
        </p>
        {urlOk && fileId && <p className="mt-1 text-xs text-emerald-700">ID de archivo detectado: {fileId}</p>}
        {urlOk && !fileId && (
          <p className="mt-1 text-xs text-amber-700">
            No se pudo detectar el ID del archivo; se guardará solo el enlace.
          </p>
        )}
      </div>
      <ErrorBox message={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Guardando…" : initial ? "Guardar cambios" : "Registrar chip"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
