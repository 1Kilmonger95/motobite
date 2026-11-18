import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

// Avisa cuando la app ya funciona sin conexión y cuando hay una versión nueva.
// La actualización solo se aplica cuando la persona lo decide, para no interrumpir una activación en curso.
export default function PwaStatus() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateRef.current = registerSW({
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => setOfflineReady(true)
    });
  }, []);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-brand-900 p-3 text-sm text-white shadow-lg" role="status">
        {needRefresh ? (
          <>
            <span>Hay una versión nueva de MotoBite.</span>
            <span className="flex gap-2">
              <button type="button" className="rounded-lg bg-white/15 px-3 py-2 font-semibold" onClick={() => setNeedRefresh(false)}>Después</button>
              <button type="button" className="rounded-lg bg-brand-500 px-3 py-2 font-semibold" onClick={() => void updateRef.current?.(true)}>Actualizar</button>
            </span>
          </>
        ) : (
          <>
            <span>MotoBite ya puede abrirse sin conexión.</span>
            <button type="button" className="rounded-lg bg-white/15 px-3 py-2 font-semibold" onClick={() => setOfflineReady(false)}>Entendido</button>
          </>
        )}
      </div>
    </div>
  );
}
