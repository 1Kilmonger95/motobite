import type { ReactNode } from "react";

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-brand-900 py-4 text-center text-white">
        <span className="text-xl font-bold tracking-tight">
          Moto<span className="text-blue-400">Bite</span>
        </span>
      </header>
      <main className="mx-auto max-w-md space-y-4 p-4">{children}</main>
    </div>
  );
}
