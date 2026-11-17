import { useEffect, useState } from "react";

export function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      const ms = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) {
        clearInterval(id);
        onEnd();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, onEnd]);

  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <span className="font-mono font-semibold">{m}:{String(s).padStart(2, "0")}</span>;
}
