import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getStatus,
  releaseActivation,
  reserveActivation,
  type BlockedReason,
  type ReserveOk
} from "../../lib/activation";
import { deletePendingByActivation } from "../../lib/idb";
import { clearReservation, readReservation, saveReservation } from "../../lib/reservation";
import { formatDate, STATUS_STYLE } from "../../lib/status";
import { Badge, ErrorBox, Spinner } from "../../components/ui";
import { ClientShell } from "./ClientShell";
import SavePanel from "./SavePanel";
import IosGuide from "./IosGuide";
import { isIosBrowserTab } from "../../lib/platform";

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
  const activationKey = token.slice(0, 16);
  const [view, setView] = useState<View>({ kind: "loading" });
  const needsIosGuide = isIosBrowserTab();
  const [ackSafari, setAckSafari] = useState(false);

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
    if (s.kind === "error") {
      setView({ kind: "error", message: s.message });
    } else if (s.kind === "blocked") {
      if (s.reason !== "reserved_by_other") void deletePendingByActivation(activationKey).catch(() => undefined);
      setView({ kind: "blocked", reason: s.reason });
    } else if (!s.chipActive) {
      setView({ kind: "blocked", reason: "chip_inactive" });
    } else {
      setView({ kind: "ready", name: s.name, description: s.description, expiresAt: s.expiresAt });
    }
  }, [token, activationKey]);

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

  const cancel = useCallback(
    async (info: ReserveOk) => {
      await releaseActivation(token, info.reservationId);
      clearReservation(token);
      await deletePendingByActivation(activationKey).catch(() => undefined);
      await load();
    },
    [token, activationKey, load]
  );

  const onBlocked = useCallback(
    (reason: BlockedReason) => {
      clearReservation(token);
      void deletePendingByActivation(activationKey).catch(() => undefined);
      setView({ kind: "blocked", reason });
    },
    [token, activationKey]
  );

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
          {view.reason === "consumed" && <Link to="/library" className="btn btn-primary w-full">Ver mis documentos</Link>}
          {view.reason === "reserved_by_other" && (
            <button type="button" className="btn btn-primary w-full" onClick={() => void load()}>Reintentar</button>
          )}
        </div>
      )}

      {view.kind === "lapsed" && (
        <div className="card space-y-3 text-center">
          <h1 className="text-xl font-bold">La reserva venció</h1>
          <p className="text-slate-600">Pasó demasiado tiempo sin terminar. Tu enlace no se consumió: puedes empezar de nuevo.</p>
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
          {needsIosGuide && !ackSafari ? (
            <IosGuide onContinue={() => setAckSafari(true)} />
          ) : (
          <div className="card space-y-3">
            <h2 className="font-semibold">Guarda tu documento en este teléfono</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Pulsa «Comenzar» y elige cómo guardarlo.</li>
              <li>MotoBite guarda el PDF dentro de tu teléfono y comprueba que quedó completo.</li>
              <li>Después podrás abrirlo siempre, incluso sin Internet.</li>
            </ol>
            <button type="button" className="btn btn-primary min-h-[56px] w-full text-base" onClick={() => void start()}>
              Comenzar
            </button>
          </div>
          )}
        </>
      )}

      {view.kind === "reserved" && (
        <div className="card">
          <SavePanel
            token={token}
            info={view.info}
            onBlocked={onBlocked}
            onCancel={() => void cancel(view.info)}
            onLapsed={onLapsed}
          />
        </div>
      )}
    </ClientShell>
  );
}
