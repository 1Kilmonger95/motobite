import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import type { Chip, TokenRow } from "../../lib/types";
import { effectiveStatus, formatDate, STATUS_LABEL, STATUS_STYLE } from "../../lib/status";
import { activationUrl, issueToken, revokeToken } from "../../lib/tokens";
import { nfcSupported, nfcUnavailableReason } from "../../lib/nfc";
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

type Issued = { url: string; expiresAt: string; autoWrite: boolean; key: number };

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
  const [hours, setHours] = useState(720);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);
  const [printImg, setPrintImg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nfcOk = nfcSupported();
  const nfcReason = nfcUnavailableReason();

  const live = tokens.find((t) => {
    const s = effectiveStatus(t);
    return s === "pending" || s === "reserved";
  });

  // Genera un enlace nuevo (el anterior queda revocado). Con writeNow, empieza a grabar el chip enseguida.
  async function issue(writeNow: boolean) {
    if (
      live &&
      !window.confirm(
        "Ya existe un enlace vigente. Al generar uno nuevo, el anterior quedará revocado y el chip NFC y el QR anteriores dejarán de servir. ¿Continuar?"
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
    setIssued({ url: activationUrl(res.token), expiresAt: res.expiresAt, autoWrite: writeNow, key: Date.now() });
    await onChanged();
  }

  async function revoke() {
    if (!live) return;
    if (!window.confirm("¿Revocar el enlace vigente? Quien lo abra verá que fue revocado.")) return;
    setBusy(true);
    setError("");
    const res = await revokeToken(live.id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setIssued(null);
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

  function printCard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPrintImg(canvas.toDataURL("image/png"));
    setTimeout(() => window.print(), 150);
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Entregar el documento</h2>
        <p className="text-sm text-slate-500">
          Graba el chip NFC y entrega también el código QR: el cliente puede usar cualquiera de los dos. Cada enlace es de un
          solo uso; al generar uno nuevo, el anterior queda revocado.
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
      {live && !issued && (
        <p className="text-xs text-slate-500">
          El enlace vigente no se puede volver a mostrar (por seguridad solo se guarda su huella). Para grabar un chip o
          imprimir el QR, genera un enlace nuevo con los botones de abajo.
        </p>
      )}

      {!chip.active && <p className="text-sm text-amber-700">El chip está desactivado: actívalo para poder emitir enlaces.</p>}

      {!nfcOk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>No se puede grabar el chip desde este navegador.</strong> {nfcReason} Puedes generar el enlace y el QR igualmente.
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="expiry">Vencimiento del enlace</label>
          <select id="expiry" className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>{o.label}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primary min-h-[52px] w-full text-base" onClick={() => void issue(true)}
          disabled={busy || !chip.active || !nfcOk}>
          {busy ? "Procesando…" : "Grabar chip NFC"}
        </button>
        <button type="button" className="btn btn-secondary w-full" onClick={() => void issue(false)} disabled={busy || !chip.active}>
          Generar enlace y QR (sin grabar)
        </button>
        {live && (
          <button type="button" className="btn btn-danger w-full" onClick={() => void revoke()} disabled={busy}>
            Revocar enlace vigente
          </button>
        )}
      </div>

      <ErrorBox message={error} />

      {issued && (
        <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Enlace generado. Vence: {formatDate(issued.expiresAt)}</p>
          <p className="text-sm text-emerald-900">
            Este enlace se muestra solo ahora. MotoBite guarda únicamente su huella (hash): si sales de esta pantalla no podrás
            verlo otra vez y tendrás que generar uno nuevo.
          </p>

          <NfcWriter key={issued.key} url={issued.url} autoStart={issued.autoWrite} />

          <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-4">
            <h3 className="font-semibold">Código QR (para teléfonos sin NFC)</h3>
            <QRCodeCanvas ref={canvasRef} value={issued.url} size={1024} level="M" marginSize={4}
              style={{ width: 220, height: 220 }} />
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <button type="button" className="btn btn-primary flex-1" onClick={downloadQr}>Descargar QR (PNG)</button>
              <button type="button" className="btn btn-secondary flex-1" onClick={printCard}>Imprimir tarjeta con QR</button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="label" htmlFor="link">Enlace</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id="link" ref={inputRef} readOnly className="input font-mono text-xs" value={issued.url}
                onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-secondary shrink-0" onClick={copy}>
                {copied ? "¡Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
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

      {printImg && (
        <div className="print-area">
          <p style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>MotoBite</p>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 16px" }}>{chip.name}</h1>
          <img src={printImg} alt="Código QR" style={{ width: 320, height: 320, margin: "0 auto" }} />
          <p style={{ fontSize: 16, marginTop: 16 }}>
            Acerca tu teléfono al chip NFC o escanea este código QR con la cámara para guardar tu documento.
          </p>
        </div>
      )}
    </div>
  );
}
