import { useEffect, useRef, useState } from "react";
import { nfcSupported, verifyUrl, writeUrl } from "../../lib/nfc";
import { ErrorBox } from "../../components/ui";

type State =
  | { kind: "idle" }
  | { kind: "busy"; action: "write" | "verify" }
  | { kind: "written" }
  | { kind: "verified" }
  | { kind: "mismatch"; found: string[] }
  | { kind: "error"; message: string };

// Oculta el token al mostrar lo que contiene un chip distinto.
const hideToken = (u: string) => u.replace(/(#\/a\/).+$/, "$1…");

// autoStart: empieza a grabar en cuanto aparece (se usa justo después de generar el enlace).
export default function NfcWriter({ url, autoStart = false }: { url: string; autoStart?: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (autoStart && !started.current && nfcSupported()) {
      started.current = true;
      void write();
    }
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!nfcSupported()) return null;

  async function write() {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ kind: "busy", action: "write" });
    const r = await writeUrl(url, { signal: ctrl.signal });
    abortRef.current = null;
    if (r.ok) setState({ kind: "written" });
    else setState(r.reason === "aborted" ? { kind: "idle" } : { kind: "error", message: r.message });
  }

  async function verify() {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ kind: "busy", action: "verify" });
    const r = await verifyUrl(url, { signal: ctrl.signal });
    abortRef.current = null;
    if (!r.ok) setState(r.reason === "aborted" ? { kind: "written" } : { kind: "error", message: r.message });
    else setState(r.value.match ? { kind: "verified" } : { kind: "mismatch", found: r.value.found });
  }

  return (
    <div className="space-y-3 rounded-lg bg-white p-4">
      <h3 className="font-semibold">Chip NFC</h3>

      {state.kind === "idle" && (
        <>
          <p className="text-sm text-slate-600">
            Se reemplaza lo que tenga el chip. Acerca la parte trasera del teléfono al chip y mantenlo quieto hasta que diga que terminó.
          </p>
          {url.length > 120 && (
            <p className="text-sm text-amber-700">El enlace es largo ({url.length} caracteres): un chip NTAG213 podría no tener capacidad suficiente.</p>
          )}
          <button type="button" className="btn btn-primary w-full" onClick={() => void write()}>Grabar en chip NFC</button>
        </>
      )}

      {state.kind === "busy" && (
        <>
          <p className="text-sm font-semibold text-brand-600">
            {state.action === "write"
              ? "Acerca el chip a la parte trasera del teléfono y no lo muevas…"
              : "Vuelve a acercar el chip para leerlo…"}
          </p>
          <button type="button" className="btn btn-secondary w-full" onClick={() => abortRef.current?.abort()}>Cancelar</button>
        </>
      )}

      {state.kind === "written" && (
        <>
          <p className="text-sm font-semibold text-emerald-700">Chip grabado. Aparta el teléfono del chip.</p>
          <p className="text-sm text-slate-600">Para estar seguro, verifica que el chip quedó con el enlace correcto.</p>
          <button type="button" className="btn btn-primary w-full" onClick={() => void verify()}>Verificar chip</button>
          <button type="button" className="btn btn-secondary w-full" onClick={() => setState({ kind: "idle" })}>Grabar otro chip con este enlace</button>
        </>
      )}

      {state.kind === "verified" && (
        <>
          <p className="text-sm font-semibold text-emerald-700">Verificado: el chip contiene el enlace correcto.</p>
          <p className="text-xs text-slate-500">No lo bloquees como solo lectura: si generas un enlace nuevo, tendrás que regrabarlo.</p>
          <button type="button" className="btn btn-secondary w-full" onClick={() => setState({ kind: "idle" })}>Grabar otro chip con este enlace</button>
        </>
      )}

      {state.kind === "mismatch" && (
        <>
          <ErrorBox
            message={
              state.found.length === 0
                ? "El chip no contiene ningún enlace. Vuelve a grabarlo."
                : `El chip contiene otro contenido (${state.found.map(hideToken).join(", ")}). Vuelve a grabarlo.`
            }
          />
          <button type="button" className="btn btn-primary w-full" onClick={() => setState({ kind: "idle" })}>Volver a grabar</button>
        </>
      )}

      {state.kind === "error" && (
        <>
          <ErrorBox message={state.message} />
          <button type="button" className="btn btn-primary w-full" onClick={() => void write()}>Reintentar grabación</button>
        </>
      )}
    </div>
  );
}
