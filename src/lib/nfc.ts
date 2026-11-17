// Grabación y verificación de chips NFC con Web NFC (Chrome para Android, HTTPS).

export type NfcResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "aborted" | "timeout" | "error"; message: string };

const TIMEOUT_MS = 30_000;

export function nfcSupported(): boolean {
  const g = globalThis as { isSecureContext?: boolean };
  return "NDEFReader" in globalThis && g.isSecureContext !== false;
}

function explain(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
      return "No se concedió el permiso de NFC. Activa el NFC del teléfono y acepta el permiso cuando Chrome lo pida.";
    case "NotSupportedError":
      return "Este teléfono no tiene NFC o está desactivado. Actívalo en los ajustes del teléfono.";
    case "NotReadableError":
      return "No se pudo leer el chip. Acércalo de nuevo y mantenlo quieto.";
    case "NetworkError":
      return "No se pudo escribir en el chip. Mantenlo pegado a la parte trasera del teléfono; si sigue fallando, el chip puede estar bloqueado o no tener capacidad suficiente.";
    case "SyntaxError":
      return "El enlace no tiene un formato válido para grabarlo.";
    case "InvalidStateError":
      return "Chrome no pudo iniciar el NFC en este momento. Mantén esta pantalla abierta y vuelve a intentarlo.";
    default:
      return "Ocurrió un error con el NFC. Inténtalo de nuevo.";
  }
}

function guard(signal: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  return {
    signal: ctrl.signal,
    abort: () => ctrl.abort(),
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

function failure(e: unknown, timedOut: boolean): { ok: false; reason: "aborted" | "timeout" | "error"; message: string } {
  if (timedOut) {
    return { ok: false, reason: "timeout", message: "Se agotó el tiempo: no se detectó ningún chip. Inténtalo de nuevo." };
  }
  if ((e as { name?: string } | null)?.name === "AbortError") {
    return { ok: false, reason: "aborted", message: "Operación cancelada." };
  }
  return { ok: false, reason: "error", message: explain(e) };
}

// Escribe la URL en el chip (reemplaza su contenido). Debe llamarse desde un gesto del usuario (un clic).
export async function writeUrl(
  url: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<NfcResult<undefined>> {
  const g = guard(opts.signal, opts.timeoutMs ?? TIMEOUT_MS);
  try {
    await new NDEFReader().write({ records: [{ recordType: "url", data: url }] }, { overwrite: true, signal: g.signal });
    return { ok: true, value: undefined };
  } catch (e) {
    return failure(e, g.timedOut());
  } finally {
    g.done();
  }
}

// Lee el chip y comprueba que contiene exactamente la URL esperada.
export async function verifyUrl(
  expected: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<NfcResult<{ match: boolean; found: string[] }>> {
  const g = guard(opts.signal, opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const reader = new NDEFReader();
    const reading = new Promise<{ match: boolean; found: string[] }>((resolve, reject) => {
      reader.onreading = (ev) => {
        const found: string[] = [];
        for (const rec of ev.message.records) {
          if ((rec.recordType === "url" || rec.recordType === "text") && rec.data) {
            found.push(new TextDecoder(rec.encoding || "utf-8").decode(rec.data));
          }
        }
        resolve({ match: found.includes(expected), found });
      };
      reader.onreadingerror = () => reject(Object.assign(new Error("lectura"), { name: "NotReadableError" }));
      g.signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })));
    });
    await reader.scan({ signal: g.signal });
    const value = await reading;
    g.abort(); // termina el escaneo
    return { ok: true, value };
  } catch (e) {
    return failure(e, g.timedOut());
  } finally {
    g.done();
  }
}
