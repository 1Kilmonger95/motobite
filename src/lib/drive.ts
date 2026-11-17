import { MAX_PDF_BYTES, validatePdf } from "./pdf";

const DRIVE_URL = /^https:\/\/(drive|docs)\.google\.com\//;

export function isDriveUrl(url: string): boolean {
  return DRIVE_URL.test(url.trim());
}

// Intenta obtener el ID del archivo; si el formato no se reconoce devuelve null.
export function extractDriveFileId(url: string): string | null {
  const u = url.trim();
  const byPath = u.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (byPath) return byPath[1];
  const byQuery = u.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return byQuery ? byQuery[1] : null;
}

export type DriveResult =
  | { ok: true; blob: Blob }
  | {
      ok: false;
      reason: "offline" | "blocked" | "not_public" | "not_found" | "not_pdf" | "too_large" | "interrupted" | "aborted";
      message: string;
    };

const fail = (reason: Extract<DriveResult, { ok: false }>["reason"], message: string): DriveResult => ({
  ok: false,
  reason,
  message
});

// Descarga directa desde Google Drive, sin credenciales privadas. Los navegadores suelen bloquear esta
// descarga por CORS: cuando falla se informa con claridad y el cliente usa el respaldo (abrir Drive y elegir el PDF).
export async function downloadFromDrive(
  fileId: string,
  opts: {
    apiKey?: string; // clave pública de navegador (opcional), restringida por dominio
    signal?: AbortSignal;
    onProgress?: (received: number, total: number | null) => void;
    maxBytes?: number;
  } = {}
): Promise<DriveResult> {
  const max = opts.maxBytes ?? MAX_PDF_BYTES;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return fail("offline", "No hay conexión a Internet. Conéctate e inténtalo de nuevo.");
  }

  const id = encodeURIComponent(fileId);
  const urls: string[] = [];
  if (opts.apiKey) {
    urls.push(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(opts.apiKey)}`
    );
  }
  urls.push(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);

  let lastHttp: number | null = null;
  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url, { signal: opts.signal, credentials: "omit", redirect: "follow" });
    } catch {
      if (opts.signal?.aborted) return fail("aborted", "Descarga cancelada.");
      continue; // bloqueo CORS o error de red: se prueba la siguiente vía
    }
    if (!res.ok) {
      lastHttp = res.status;
      continue;
    }
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      return fail(
        "not_pdf",
        "Google Drive devolvió una página en lugar del archivo (puede ser un archivo grande o no estar compartido públicamente)."
      );
    }
    const total = Number(res.headers.get("content-length")) || null;
    if (total && total > max) return fail("too_large", "El archivo es demasiado grande para guardarlo en tu teléfono.");

    try {
      const chunks: Uint8Array[] = [];
      let received = 0;
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (received > max) {
            await reader.cancel();
            return fail("too_large", "El archivo es demasiado grande para guardarlo en tu teléfono.");
          }
          opts.onProgress?.(received, total);
        }
      } else {
        const buf = new Uint8Array(await res.arrayBuffer());
        chunks.push(buf);
        received = buf.length;
      }
      const blob = new Blob(chunks as BlobPart[], { type: "application/pdf" });
      const check = await validatePdf(blob, max);
      if (!check.ok) return fail(check.reason === "too_large" ? "too_large" : "not_pdf", check.message);
      return { ok: true, blob };
    } catch {
      if (opts.signal?.aborted) return fail("aborted", "Descarga cancelada.");
      return fail("interrupted", "Se perdió la conexión durante la descarga. Inténtalo de nuevo.");
    }
  }

  if (lastHttp === 404) return fail("not_found", "No se encontró el archivo en Google Drive.");
  if (lastHttp === 403 || lastHttp === 401) {
    return fail("not_public", "Google Drive no permite descargar este archivo directamente desde la aplicación.");
  }
  return fail("blocked", "Google Drive no permite la descarga directa desde la aplicación en este navegador.");
}
