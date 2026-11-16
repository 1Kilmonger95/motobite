import type { ReactNode } from "react";

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      {message}
    </div>
  );
}

export function Badge({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}
