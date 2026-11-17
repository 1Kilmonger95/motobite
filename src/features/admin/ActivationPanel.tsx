import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import type { Chip, TokenRow } from "../../lib/types";
import { effectiveStatus, formatDate, STATUS_LABEL, STATUS_STYLE } from "../../lib/status";
import { activationUrl, issueToken, revokeToken } from "../../lib/tokens";
import { Badge, ErrorBox } from "../../components/ui";
import NfcWriter from "./NfcWriter";

const EXPIRY_OPTIONS = [
  { label: "24 horas", hours: 24 },
  { label: "3 días", hours: 72 },
  { label: "7 días", hours: 168 },
  { label: "30 días", hours: 720 },
  { label: "90 días", hours: 2160 }
];

type Props = {
  chip: Chip;
  tokens: TokenRow[];
  onChanged: () => Promise<void>;
};

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "chip";
}

export default function ActivationPanel({ chip, tokens, onChanged }: Props) {
  const [hours, setHours] = useState(168);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const live = tokens.find((t) => {
    const s = effectiveStatus(t);
    return s === "pending" || s === "reserved";
  });

  async function issue() {
    if (
      live &&
      !window.confirm(
        "Ya existe un enlace vigente. Al generar uno nuevo, el anterior quedará revocado y el chip NFC deberá regrabarse con el enlace nuevo. ¿Continuar?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setCopied(false);
    const res = await issueToken(chip.id, hours);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setIssued({ url: activationUrl(res.token), expiresAt: res.expiresAt });
    await onChanged();
  }

  async function revoke() {
    if (!live) return;
    if (!window.confirm("¿Revocar el enlace vigente? Quien lo abra verá que fue revocado.")) return;
    setBusy(true);
    setError("");
    const res = await revokeToken(live.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setIssued(null);
    }
    await onChanged();
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      inputRef.current?.select();
      setError("No se pudo copiar automáticamente. El enlace quedó seleccionado: cópialo con Ctrl+C.");
    }
  }

  function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${slug(chip.name)}.png`;
    a.click();
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Enlaces de activación</h2>
        <p className="text-sm text-slate-500">
          Cada enlace es de un solo uso. Al generar uno nuevo, el anterior queda revocado y el chip NFC debe regrabarse.
        </p>
      </div>

      {live && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <span className="flex items-center gap-2">
            Enlace vigente: <Badge className={STATUS_STYLE[effectiveStatus(live)]}>{STATUS_LABEL[effectiveStatus(live)]}</Badge>
          </span>
          <span className="text-slate-500">Vence: {formatDate(live.expires_at)}</span>
        </div>
      )}

      {!chip.active && (
        <p className="text-sm text-amber-700">El chip está desactivado: actívalo para poder emitir enlaces.</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="expiry">Vencimiento</label>
          <select id="expiry" className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>{o.label}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={issue} disabled={busy || !chip.active}>
          {busy ? "Procesando…" : live || tokens.length > 0 ? "Generar enlace nuevo" : "Generar enlace"}
        </button>
        {live && (
          <button type="button" className="btn btn-danger" onClick={revoke} disabled={busy}>
            Revocar enlace vigente
          </button>
        )}
      </div>

      <ErrorBox message={error} />

      {issued && (
        <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Enlace generado. Vence: {formatDate(issued.expiresAt)}</p>
          <p className="text-sm text-emerald-900">
            Este enlace se muestra solo ahora. MotoBite guarda únicamente su huella (hash); si sales de esta pantalla no podrás
            verlo otra vez y tendrás que generar uno nuevo.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input ref={inputRef} readOnly className="input font-mono text-xs" value={issued.url}
              onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de activación" />
            <button type="button" className="btn btn-secondary shrink-0" onClick={copy}>
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg bg-white p-2">
              <QRCodeCanvas ref={canvasRef} value={issued.url} size={1024} level="M" marginSize={4}
                style={{ width: 220, height: 220 }} />
            </div>
            <button type="button" className="btn btn-primary" onClick={downloadQr}>Descargar QR (PNG)</button>
          </div>

          <NfcWriter url={issued.url} />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Historial de enlaces</h3>
        {tokens.length === 0 ? (
          <p className="text-sm text-slate-500">Este chip aún no tiene enlaces.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tokens.map((t) => {
              const st = effectiveStatus(t);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Badge className={STATUS_STYLE[st]}>{STATUS_LABEL[st]}</Badge>
                  <span className="text-slate-500">
                    Creado: {formatDate(t.created_at)} · Vence: {formatDate(t.expires_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
