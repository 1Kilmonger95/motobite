import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { ErrorBox } from "../../components/ui";

export default function Settings() {
  const { session, signOut } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk(false);
    if (pw.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (pw !== pw2) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) setError("No se pudo cambiar la contraseña. Cierra sesión, vuelve a entrar e inténtalo de nuevo.");
      else {
        setOk(true);
        setPw("");
        setPw2("");
      }
    } catch {
      setError("No hay conexión con el servidor. Revisa tu Internet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Cuenta</h2>
        <p className="text-sm text-slate-600">Sesión iniciada como <strong>{session?.user.email}</strong></p>
        <button type="button" className="btn btn-secondary" onClick={signOut}>Cerrar sesión</button>
      </div>

      <form onSubmit={changePassword} className="card space-y-3">
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
        <div>
          <label className="label" htmlFor="pw">Nueva contraseña</label>
          <input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw2">Repite la contraseña</label>
          <input id="pw2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <ErrorBox message={error} />
        {ok && <p className="text-sm text-emerald-700">Contraseña actualizada.</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
      </form>
    </div>
  );
}
