import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  confirmActivation,
  reserveActivation,
  type BlockedReason,
  type ReserveOk
} from "../../lib/activation";
import { downloadFromDrive } from "../../lib/drive";
import {
  deleteDocument,
  findPendingByActivation,
  getMeta,
  markActive,
  saveAndVerify,
  StorageError,
  verifyDocument
} from "../../lib/idb";
import { getDeviceLabel, getInstallationId } from "../../lib/installation";
import { validatePdf } from "../../lib/pdf";
import { clearReservation, saveReservation } from "../../lib/reservation";
import { Badge, ErrorBox } from "../../components/ui";
import { Countdown } from "./Countdown";

type Source = "drive" | "local";
type Step = "downloading" | "validating" | "saving" | "confirming";
type State =
  | { kind: "idle" }
  | { kind: "working"; step: Step; progress: number | null }
  | { kind: "failed"; message: string; offerFallback: boolean }
  | { kind: "pending"; docId: string; message: string }
  | { kind: "done"; docId: string };

type Props = {
  token: string;
  info: ReserveOk;
  onBlocked: (reason: BlockedReason) => void;
  onCancel: () => void;
  onLapsed: () => void;
};

const STEPS: { key: Step; label: string }[] = [
  { key: "downloading", label: "Descargando" },
  { key: "validating", label: "Validando el archivo" },
  { key: "saving", label: "Guardando y verificando en tu teléfono" },
  { key: "confirming", label: "Confirmando la activación" }
];

function storageMessage(e: unknown): string {
  if (e instanceof StorageError) {
    if (e.code === "quota") return "No hay espacio suficiente en tu teléfono. Libera espacio e inténtalo de nuevo.";
    if (e.code === "unavailable") {
      return "Tu navegador no permite guardar archivos (modo privado o almacenamiento bloqueado). Abre MotoBite en una ventana normal.";
    }
    if (e.code === "verify") return "No pudimos comprobar que el archivo quedara guardado completo. Inténtalo de nuevo.";
  }
  return "No pudimos guardar el documento en tu teléfono. Inténtalo de nuevo.";
}

export default function SavePanel({ token, info, onBlocked, onCancel, onLapsed }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const resId = useRef(info.reservationId);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activationKey = token.slice(0, 16);

  useEffect(() => {
    resId.current = info.reservationId;
  }, [info.reservationId]);

  // Un documento guardado antes que quedó sin confirmar (por ejemplo, se cerró la app a mitad del proceso).
  useEffect(() => {
    let cancelled = false;
    findPendingByActivation(activationKey)
      .then((doc) => {
        if (!cancelled && doc) {
          setState({
            kind: "pending",
            docId: doc.id,
            message: "Encontramos tu documento guardado en este teléfono, pero falta confirmar la activación."
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [activationKey]);

  const finalize = useCallback(
    async (docId: string, source: Source) => {
      setState({ kind: "working", step: "confirming", progress: null });
      const send = () => confirmActivation(token, resId.current, getInstallationId(), getDeviceLabel(), source);
      let r = await send();

      // Si la reserva venció mientras se guardaba, se intenta renovarla (solo si nadie más tomó el enlace).
      if (!r.ok && (r.code === "reservation_expired" || r.code === "invalid_reservation")) {
        const again = await reserveActivation(token, resId.current);
        if (again.ok) {
          resId.current = again.reservationId;
          saveReservation(token, again.reservationId);
          r = await send();
        } else if (again.code !== "error") {
          await deleteDocument(docId);
          onBlocked(again.code);
          return;
        }
      }

      if (r.ok) {
        await markActive(docId);
        clearReservation(token);
        setState({ kind: "done", docId });
        return;
      }
      if (r.code === "consumed" || r.code === "revoked" || r.code === "expired" || r.code === "not_found") {
        await deleteDocument(docId);
        onBlocked(r.code);
        return;
      }
      setState({
        kind: "pending",
        docId,
        message:
          r.code === "error"
            ? "El documento quedó guardado, pero no pudimos confirmar la activación (sin conexión o error del servidor). Reintenta cuando tengas Internet."
            : "No pudimos confirmar la activación. Inténtalo de nuevo."
      });
    },
    [token, onBlocked]
  );

  async function processBlob(blob: Blob, source: Source) {
    setState({ kind: "working", step: "validating", progress: null });
    const check = await validatePdf(blob);
    if (!check.ok) {
      setState({ kind: "failed", message: check.message, offerFallback: source === "drive" });
      return;
    }
    setState({ kind: "working", step: "saving", progress: null });
    try {
      const doc = await saveAndVerify(blob, {
        name: info.name,
        description: info.description,
        source,
        activationKey
      });
      await finalize(doc.id, source);
    } catch (e) {
      setState({ kind: "failed", message: storageMessage(e), offerFallback: false });
    }
  }

  async function startDrive() {
    if (!info.driveFileId) {
      setState({
        kind: "failed",
        message: "No pudimos identificar el archivo de Google Drive. Ábrelo desde Drive y elige el PDF descargado.",
        offerFallback: true
      });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ kind: "working", step: "downloading", progress: 0 });
    const res = await downloadFromDrive(info.driveFileId, {
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
      signal: ctrl.signal,
      onProgress: (received, total) =>
        setState({ kind: "working", step: "downloading", progress: total ? received / total : null })
    });
    abortRef.current = null;
    if (!res.ok) {
      setState(res.reason === "aborted" ? { kind: "idle" } : { kind: "failed", message: res.message, offerFallback: true });
      return;
    }
    await processBlob(res.blob, "drive");
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setState({ kind: "failed", message: "El archivo elegido no es un PDF.", offerFallback: false });
      return;
    }
    await processBlob(file, "local");
  }

  async function retryPending(docId: string) {
    const meta = await getMeta(docId).catch(() => undefined);
    const intact = meta ? await verifyDocument(docId).catch(() => false) : false;
    if (!meta || !intact) {
      await deleteDocument(docId).catch(() => undefined);
      setState({
        kind: "failed",
        message: "El documento guardado ya no está completo. Vuelve a elegir o descargar el PDF.",
        offerFallback: false
      });
      return;
    }
    await finalize(docId, meta.source);
  }

  const openPicker = () => fileInput.current?.click();

  return (
    <div className="space-y-4">
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />

      {state.kind === "done" ? (
        <Badge className="bg-emerald-100 text-emerald-800">Activación completada</Badge>
      ) : (
        <Badge className="bg-blue-100 text-blue-800">Reserva activa</Badge>
      )}
      <h1 className="text-2xl font-bold">{info.name}</h1>

      {state.kind === "idle" && (
        <>
          <p className="text-sm text-slate-600">
            Reservado para este teléfono durante <Countdown until={info.reservedUntil} onEnd={onLapsed} />. Tu enlace
            no se consume hasta que el PDF quede guardado y verificado.
          </p>
          <button type="button" className="btn btn-primary min-h-[64px] w-full text-base" onClick={() => void startDrive()}>
            Descargar desde Google Drive
          </button>
          <button type="button" className="btn btn-secondary min-h-[64px] w-full text-base" onClick={openPicker}>
            Elegir un PDF de mi teléfono
          </button>
          <button type="button" className="w-full text-sm text-slate-500 underline" onClick={onCancel}>
            Cancelar y liberar la reserva
          </button>
        </>
      )}

      {state.kind === "working" && (
        <div className="space-y-3">
          <ol className="space-y-2 text-sm">
            {STEPS.filter((s) => s.key !== "downloading" || state.step === "downloading").map((s) => {
              const order = STEPS.findIndex((x) => x.key === s.key);
              const current = STEPS.findIndex((x) => x.key === state.step);
              const status = order < current ? "done" : order === current ? "now" : "todo";
              return (
                <li key={s.key} className={status === "now" ? "font-semibold" : status === "done" ? "text-emerald-700" : "text-slate-400"}>
                  {status === "done" ? "✓ " : status === "now" ? "› " : "· "}
                  {s.label}
                </li>
              );
            })}
          </ol>
          {state.step === "downloading" && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full bg-brand-500 transition-all ${state.progress === null ? "w-1/3 animate-pulse" : ""}`}
                style={state.progress === null ? undefined : { width: `${Math.round(state.progress * 100)}%` }}
              />
            </div>
          )}
          {state.step === "downloading" && (
            <button type="button" className="btn btn-secondary w-full" onClick={() => abortRef.current?.abort()}>
              Cancelar descarga
            </button>
          )}
          <p className="text-xs text-slate-500">No cierres esta pantalla hasta terminar.</p>
        </div>
      )}

      {state.kind === "failed" && (
        <div className="space-y-3">
          <ErrorBox message={state.message} />
          {state.offerFallback && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p>Puedes descargarlo manualmente: abre Google Drive, descarga el PDF y luego elígelo aquí.</p>
              <a href={info.driveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-full">
                Abrir Google Drive
              </a>
              <button type="button" className="btn btn-primary w-full" onClick={openPicker}>
                Elegir el PDF descargado
              </button>
            </div>
          )}
          <button type="button" className="btn btn-secondary w-full" onClick={() => setState({ kind: "idle" })}>
            Volver a intentar
          </button>
        </div>
      )}

      {state.kind === "pending" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{state.message}</p>
          <button type="button" className="btn btn-primary w-full" onClick={() => void retryPending(state.docId)}>
            Confirmar activación
          </button>
        </div>
      )}

      {state.kind === "done" && (
        <div className="space-y-3">
          <p className="text-slate-700">
            Tu documento quedó guardado en este teléfono y verificado. Ya puedes abrirlo, incluso sin Internet.
          </p>
          <Link to={`/library/${state.docId}`} className="btn btn-primary w-full">Abrir documento</Link>
          <Link to="/library" className="btn btn-secondary w-full">Ir a Mis documentos</Link>
          <p className="text-xs text-slate-500">
            El navegador puede borrar datos locales. Si cambias de teléfono o borras los datos del navegador, pide una
            nueva activación.
          </p>
        </div>
      )}
    </div>
  );
}
