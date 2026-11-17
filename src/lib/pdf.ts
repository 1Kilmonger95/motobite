export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export type PdfCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_large" | "not_pdf" | "truncated"; message: string };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function readText(blob: Blob, start: number, end: number): Promise<string> {
  return new TextDecoder("latin1").decode(await blob.slice(start, end).arrayBuffer());
}

// Validación estructural: no vacío, tamaño razonable, cabecera %PDF- y marca %%EOF al final.
export async function validatePdf(blob: Blob, maxBytes: number = MAX_PDF_BYTES): Promise<PdfCheck> {
  if (blob.size === 0) {
    return { ok: false, reason: "empty", message: "El archivo está vacío. Elige otro PDF." };
  }
  if (blob.size > maxBytes) {
    return {
      ok: false,
      reason: "too_large",
      message: `El archivo pesa ${formatBytes(blob.size)} y el máximo permitido es ${formatBytes(maxBytes)}.`
    };
  }
  if (!(await readText(blob, 0, 1024)).includes("%PDF-")) {
    return { ok: false, reason: "not_pdf", message: "El archivo no parece ser un PDF válido." };
  }
  if (!(await readText(blob, Math.max(0, blob.size - 2048), blob.size)).includes("%%EOF")) {
    return {
      ok: false,
      reason: "truncated",
      message: "El PDF está incompleto o dañado (puede que la descarga se haya cortado). Descárgalo de nuevo."
    };
  }
  return { ok: true };
}
