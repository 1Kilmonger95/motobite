import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { getBlob, getMeta, type DocMeta } from "../../lib/idb";
import { Spinner } from "../../components/ui";

function fileName(name: string): string {
  const s = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${s || "documento"}.pdf`;
}

export default function ViewerPage() {
  const { id = "" } = useParams();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const m = await getMeta(id);
        const blob = await getBlob(id);
        if (!m || m.status !== "active" || !blob) {
          if (!cancelled) setError("No encontramos este documento en tu teléfono.");
          return;
        }
        blobRef.current = blob;
        if (!cancelled) setMeta(m);
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        loaded = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setPdf(loaded);
      } catch {
        if (!cancelled) setError("No pudimos abrir el PDF dentro de MotoBite. Puedes descargar una copia y abrirla con otra aplicación.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [id]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const p = await pdf.getPage(page);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const base = p.getViewport({ scale: 1 });
      const fit = (wrapRef.current?.clientWidth ?? 360) / base.width;
      const vp = p.getViewport({ scale: fit * zoom * dpr });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      task = p.render({ canvasContext: ctx, viewport: vp });
      await task.promise;
    })().catch((e: { name?: string }) => {
      if (!cancelled && e?.name !== "RenderingCancelledException") setError("No se pudo mostrar esta página.");
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]);

  function download() {
    const blob = blobRef.current;
    if (!blob || !meta) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(meta.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const total = pdf?.numPages ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-200">
      <header className="sticky top-0 z-10 space-y-2 bg-brand-900 p-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <Link to="/library" className="text-sm underline">← Mis documentos</Link>
          <span className="truncate text-sm font-semibold">{meta?.name}</span>
          <button type="button" className="text-sm underline" onClick={download} disabled={!meta}>Descargar copia</button>
        </div>
        {pdf && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-secondary min-h-[40px] px-3" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Página anterior">◀</button>
              <span className="text-sm">{page} / {total}</span>
              <button type="button" className="btn btn-secondary min-h-[40px] px-3" onClick={() => setPage((p) => Math.min(total, p + 1))} disabled={page >= total} aria-label="Página siguiente">▶</button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-secondary min-h-[40px] px-3" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Alejar">−</button>
              <span className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn btn-secondary min-h-[40px] px-3" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Acercar">+</button>
            </div>
          </div>
        )}
      </header>

      <div ref={wrapRef} className="flex-1 overflow-auto p-2">
        {loading && <Spinner label="Abriendo documento…" />}
        {error && <div className="card m-2 text-sm text-red-800">{error}</div>}
        {pdf && !error && <canvas ref={canvasRef} className="mx-auto bg-white shadow" />}
      </div>
    </div>
  );
}
