import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ErrorBox, Spinner } from "../../components/ui";

export default function Login() {
  const { loading, session, isAdmin, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (session && isAdmin) return <Navigate to="/admin" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const msg = await signIn(email, password);
    setBusy(false);
    if (msg) setError(msg);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="card w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-900">MotoBite</h1>
          <p className="text-sm text-slate-500">Panel administrativo</p>
        </div>

        {session && !isAdmin ? (
          <div className="space-y-4">
            <ErrorBox message="Esta cuenta no tiene permisos de administrador." />
            <button type="button" className="btn btn-secondary w-full" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Correo</label>
              <input id="email" type="email" required autoComplete="username" className="input"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Contraseña</label>
              <input id="password" type="password" required autoComplete="current-password" className="input"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <ErrorBox message={error} />
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Entrando…" : "Iniciar sesión"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
