import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { decodeQr } from "../../lib/qr";
import { parseActivationInput } from "../../lib/platform";
import { ErrorBox } from "../../components/ui";
import { ClientShell } from "../activation/ClientShell";

function cameraMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "No se permitió el uso de la cámara. Actívalo en los ajustes del navegador o elige una foto del código.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No se encontró una cámara en este dispositivo. Elige una foto del código.";
  if (name === "NotReadableError") return "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.";
  return "No se pudo abrir la cámara. Elige una foto del código.";
}

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no permite usar la cámara aquí. Elige una foto del código.");
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        setError(cameraMessage(e));
        setStarting(false);
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStarting(false);

      const tick = () => {
        if (stopped) return;
        if (video.videoWidth && ctx) {
          const scale = Math.min(1, 640 / video.videoWidth);
          const w = Math.round(video.videoWidth * scale);
          const h = Math.round(video.videoHeight * scale);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const text = decodeQr(ctx.getImageData(0, 0, w, h).data, w, h);
          if (text) {
            const token = parseActivationInput(text);
            if (token) {
              stopped = true;
              navigate(`/a/${token}`);
              return;
            }
            setHint("Ese código QR no es de MotoBite. Prueba con el de tu tarjeta.");
          }
        }
        timer = window.setTimeout(tick, 150);
      };
      tick();
    }
    void start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [navigate]);

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("sin canvas");
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const text = decodeQr(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, "attemptBoth");
      const token = text ? parseActivationInput(text) : null;
      if (token) navigate(`/a/${token}`);
      else setHint("No encontramos un código QR de MotoBite en esa imagen.");
    } catch {
      setHint("No pudimos leer esa imagen. Prueba con otra foto.");
    }
  }

  return (
    <ClientShell>
      <div className="card space-y-4">
        <h1 className="text-xl font-bold">Escanear código QR</h1>
        <p className="text-sm text-slate-600">Apunta la cámara al código QR de tu tarjeta. Se activará solo al reconocerlo.</p>

        {!error && (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted autoPlay />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-4 border-white/70" />
            {starting && <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Abriendo cámara…</p>}
          </div>
        )}
        <ErrorBox message={error} />
        {hint && <p className="text-sm text-amber-700">{hint}</p>}

        <label className="btn btn-secondary w-full cursor-pointer">
          Elegir una foto del código
          <input type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e)} />
        </label>
        <Link to="/library" className="block text-center text-sm text-slate-500 underline">Volver a Mis documentos</Link>
      </div>
    </ClientShell>
  );
}
