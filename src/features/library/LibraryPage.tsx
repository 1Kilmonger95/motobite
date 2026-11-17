import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteDocument, listDocuments, verifyDocument, type DocMeta } from "../../lib/idb";
import { formatBytes } from "../../lib/pdf";
import { formatDate } from "../../lib/status";
import { Badge, ErrorBox, Spinner } from "../../components/ui";
import { ClientShell } from "../activation/ClientShell";
import { isIos, isIosBrowserTab, isStandalone, parseActivationInput } from "../../lib/platform";

type Check = "checking" | "ok" | "bad";

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function PasteActivation() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function go() {
    const token = parseActivationInput(text);
    if (!token) {
      setError("No reconocemos ese enlace. Pega el enlace completo que recibiste.");
      return;
    }
    navigate(`/a/${token}`);
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Activar con un enlace</h2>
      <p className="text-sm text-slate-600">Si copiaste un enlace de activación, pégalo aquí para continuar dentro de esta app.</p>
      <input className="input" inputMode="url" placeholder="Pega aquí el enlace de activación" value={text}
        onChange={(e) => { setText(e.target.value); setError(""); }} aria-label="Enlace de activación" />
      <ErrorBox message={error} />

      {isIosBrowserTab() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Estás usando MotoBite en Safari: el iPhone puede borrar tus documentos si pasan varios días sin abrir el sitio.
          Para protegerlos, instala MotoBite (Compartir → Añadir a pantalla de inicio). Los documentos guardados en Safari
          no se pasan a la app instalada: tendrías que pedir una nueva activación.
        </div>
      )}
      {isIos() && isStandalone() && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          Esta app instalada guarda sus documentos aparte de Safari. Para activar uno nuevo, pega el enlace en «Activar con un enlace».
        </div>
      )}
      <button type="button" className="btn btn-secondary w-full" onClick={go}>Continuar</button>
    </div>
  );
}

export default function LibraryPage() {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const online = useOnline();

  const refresh = useCallback(async () => {
    try {
      setDocs(await listDocuments());
      setError("");
    } catch {
      setError("No pudimos leer tus documentos guardados. Es posible que el navegador tenga bloqueado el almacenamiento.");
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, [refresh]);

  async function verify(id: string) {
    setChecks((c) => ({ ...c, [id]: "checking" }));
    const ok = await verifyDocument(id).catch(() => false);
    setChecks((c) => ({ ...c, [id]: ok ? "ok" : "bad" }));
  }

  async function remove(doc: DocMeta) {
    if (!window.confirm(`¿Eliminar «${doc.name}» de este teléfono? Para recuperarlo necesitarás una nueva activación.`)) return;
    try {
      await deleteDocument(doc.id);
      await refresh();
    } catch {
      setError("No se pudo eliminar el documento. Inténtalo de nuevo.");
    }
  }

  return (
    <ClientShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis documentos</h1>
        <Badge className={online ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}>
          {online ? "En línea" : "Sin conexión"}
        </Badge>
      </div>

      <ErrorBox message={error} />
      {!docs && <Spinner />}

      {docs && docs.length === 0 && !error && (
        <div className="card text-center text-slate-600">
          Aún no tienes documentos. Acerca tu teléfono al chip o escanea el código QR para activar el primero.
        </div>
      )}

      <ul className="space-y-3">
        {docs?.map((d) => (
          <li key={d.id} className="card space-y-3">
            <div>
              <p className="font-semibold">{d.name}</p>
              {d.description && <p className="text-sm text-slate-600">{d.description}</p>}
              <p className="mt-1 text-xs text-slate-500">
                {formatBytes(d.size)} · Guardado: {formatDate(d.savedAt)} · {d.source === "drive" ? "Desde Drive" : "Archivo del teléfono"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800">Guardado en este teléfono</Badge>
                {checks[d.id] === "checking" && <span className="text-xs text-slate-500">Verificando…</span>}
                {checks[d.id] === "ok" && <span className="text-xs text-emerald-700">Verificado: el archivo está íntegro</span>}
                {checks[d.id] === "bad" && <span className="text-xs text-red-700">El archivo guardado está dañado o falta. Pide una nueva activación.</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/library/${d.id}`} className="btn btn-primary flex-1">Abrir</Link>
              <button type="button" className="btn btn-secondary" onClick={() => void verify(d.id)}>Verificar</button>
              <button type="button" className="btn btn-danger" onClick={() => void remove(d)}>Eliminar</button>
            </div>
          </li>
        ))}
      </ul>

      <PasteActivation />

      <p className="px-1 text-xs text-slate-500">
        Tus documentos viven solo en este teléfono. Si borras los datos del navegador, cambias de teléfono o el sistema
        libera espacio, tendrás que pedir una nueva activación.
        {persisted === true && " Este navegador marcó el almacenamiento de MotoBite como protegido."}
        {persisted === false && " El navegador aún no marcó el almacenamiento como protegido, así que podría liberarlo si falta espacio."}
      </p>
    </ClientShell>
  );
}
