import { useState } from "react";

export default function IosGuide({ onContinue }: { onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const link = window.location.href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">Para iPhone: instala MotoBite primero</h2>
      <p className="text-sm text-slate-600">
        Si guardas el documento desde Safari, el iPhone puede borrarlo si pasan varios días sin abrir MotoBite. La app
        instalada en tu pantalla de inicio no tiene ese problema. Además, guarda sus datos aparte de Safari, por eso la
        activación debe hacerse dentro de la app instalada.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Pulsa «Copiar enlace de activación».</li>
        <li>Toca el botón Compartir de Safari y elige <strong>Añadir a pantalla de inicio</strong>.</li>
        <li>Abre MotoBite desde tu pantalla de inicio, entra a <strong>Mis documentos</strong> y pega el enlace en «Activar con un enlace».</li>
      </ol>
      <button type="button" className="btn btn-primary w-full" onClick={() => void copy()}>
        {copied ? "¡Enlace copiado!" : "Copiar enlace de activación"}
      </button>
      {failed && (
        <div className="space-y-1">
          <p className="text-xs text-amber-700">No se pudo copiar automáticamente. Mantén pulsado el enlace, selecciónalo y cópialo:</p>
          <input readOnly className="input text-xs" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de activación" />
        </div>
      )}
      <button type="button" className="w-full text-sm text-slate-500 underline" onClick={onContinue}>
        Continuar en Safari de todos modos (no recomendado)
      </button>
    </div>
  );
}
