import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getStatus,
  releaseActivation,
  reserveActivation,
  type BlockedReason,
  type ReserveOk
} from "../../lib/activation";
import { clearReservation, readReservation, saveReservation } from "../../lib/reservation";
import { formatDate, STATUS_STYLE } from "../../lib/status";
import { Badge, ErrorBox, Spinner } from "../../components/ui";
import { ClientShell } from "./ClientShell";
import { Countdown } from "./Countdown";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; reason: BlockedReason }
  | { kind: "ready"; name: string; description: string; expiresAt: string }
  | { kind: "reserving" }
  | { kind: "reserved"; info: ReserveOk }
  | { kind: "lapsed" };

const BLOCKED: Record<BlockedReason, { title: string; body: string }> = {
  not_found: {
    title: "Enlace no válido",
    body: "Este enlace no existe o está incompleto. Escanea de nuevo el código QR o acerca tu teléfono al chip."
  },
  expired: {
    title: "Enlace vencido",
    body: "Este enlace de activación ya venció. Pide a quien te lo entregó que genere uno nuevo."
  },
  revoked: {
    title: "Enlace revocado",
    body: "Este enlace fue cancelado. Si crees que es un error, pide uno nuevo a quien te lo entregó."
  },
  consumed: {
    title: "Enlace ya utilizado",
    body: "Este documento ya fue activado. Si cambiaste de teléfono o perdiste tus datos, pide una nueva activación."
  },
  chip_inactive: {
    title: "Documento no disponible",
    body: "Este documento está desactivado temporalmente. Contacta a quien te lo entregó."
  },
  reserved_by_other: {
    title: "Activación en curso",
    body: "Otro dispositivo está activando este enlace en este momento. Espera unos minutos y vuelve a intentarlo."
  }
};

export default function ActivationPage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<View>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!TOKEN_RE.test(token)) {
      setView({ kind: "blocked", reason: "not_found" });
      return;
    }
    setView({ kind: "loading" });

    // Si el cliente ya tenía una reserva vigente (recargó o cerró la página), la retoma.
    const stored = readReservation(token);
    if (stored) {
      const r = await reserveActivation(token, stored);
      if (r.ok) {
        setView({ kind: "reserved", info: r });
        return;
      }
      if (r.code === "error") {
        setView({ kind: "error", message: r.message ?? "Ocurrió un error inesperado." });
        return;
      }
      clearReservation(token);
    }

    const s = await getStatus(token);
    if (s.kind === "error") setView({ kind: "error", message: s.message });
    else if (s.kind === "blocked") setView({ kind: "blocked", reason: s.reason });
    else if (!s.chipActive) setView({ kind: "blocked", reason: "chip_inactive" });
    else setView({ kind: "ready", name: s.name, description: s.description, expiresAt: s.expiresAt });
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setView({ kind: "reserving" });
    const r = await reserveActivation(token, readReservation(token));
    if (r.ok) {
      saveReservation(token, r.reservationId);
      setView({ kind: "reserved", info: r });
    } else if (r.code === "error") {
      setView({ kind: "error", message: r.message ?? "Ocurrió un error inesperado." });
    } else {
      setView({ kind: "blocked", reason: r.code });
    }
  }

  async function cancel(info: ReserveOk) {
    await releaseActivation(token, info.reservationId);
    clearReservation(token);
    await load();
  }

  const onLapsed = useCallback(() => {
    clearReservation(token);
    setView({ kind: "lapsed" });
  }, [token]);

  return (
    <ClientShell>
      {view.kind === "loading" && <Spinner />}

      {view.kind === "reserving" && <Spinner label="Preparando tu activación…" />}

      {view.kind === "error" && (
        <div className="card space-y-4">
          <ErrorBox message={view.message} />
          <button type="button" className="btn btn-primary w-full" onClick={() => void load()}>Reintentar</button>
        </div>
      )}

      {view.kind === "blocked" && (
        <div className="card space-y-3 text-center">
          <h1 className="text-xl font-bold">{BLOCKED[view.reason].title}</h1>
          <p className="text-slate-600">{BLOCKED[view.reason].body}</p>
          {view.reason === "consumed" && (
            <Link to="/library" className="btn btn-primary w-full">Ver mis documentos</Link>
          )}
          {view.reason === "reserved_by_other" && (
            <button type="button" className="btn btn-primary w-full" onClick={() => void load()}>Reintentar</button>
          )}
        </div>
      )}

      {view.kind === "lapsed" && (
        <div className="card space-y-3 text-center">
          <h1 className="text-xl font-bold">La reserva venció</h1>
          <p className="text-slate-600">
            Pasó demasiado tiempo sin terminar. Tu enlace no se consumió: puedes empezar de nuevo.
          </p>
          <button type="button" className="btn btn-primary w-full" onClick={() => void load()}>Empezar de nuevo</button>
        </div>
      )}

      {view.kind === "ready" && (
        <>
          <div className="card space-y-2">
            <Badge className={STATUS_STYLE.pending}>Pendiente de activación</Badge>
            <h1 className="text-2xl font-bold">{view.name}</h1>
            {view.description && <p className="text-slate-600">{view.description}</p>}
            <p className="text-xs text-slate-500">Este enlace vence: {formatDate(view.expiresAt)}</p>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold">¿Cómo guardar tu documento?</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Elige una opción.</li>
              <li>MotoBite guardará el PDF dentro de tu teléfono.</li>
              <li>Podrás abrirlo siempre, incluso sin Internet.</li>
            </ol>
            <button type="button" className="btn btn-primary min-h-[64px] w-full text-base" onClick={() => void start()}>
              Descargar desde Google Drive
            </button>
            <button type="button" className="btn btn-secondary min-h-[64px] w-full text-base" onClick={() => void start()}>
              Elegir un PDF de mi teléfono
            </button>
            <p className="text-xs text-slate-500">
              Tu enlace no se consume hasta que el documento quede guardado y verificado en tu teléfono.
            </p>
          </div>
        </>
      )}

      {view.kind === "reserved" && (
        <div className="card space-y-4">
          <Badge className="bg-blue-100 text-blue-800">Reserva activa</Badge>
          <h1 className="text-2xl font-bold">{view.info.name}</h1>
          <p className="text-sm text-slate-600">
            Tu activación está reservada para este teléfono durante{" "}
            <Countdown until={view.info.reservedUntil} onEnd={onLapsed} />. Tu enlace sigue sin consumirse.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Aviso de desarrollo: el guardado del PDF (descarga desde Drive o selección de archivo) se habilita en la Etapa 6.
          </div>
          <button type="button" className="btn btn-secondary w-full" onClick={() => void cancel(view.info)}>
            Cancelar y liberar la reserva
          </button>
        </div>
      )}
    </ClientShell>
  );
}
