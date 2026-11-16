import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Spinner } from "../components/ui";

type AuthCtx = {
  loading: boolean;
  session: Session | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [roleReady, setRoleReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  // La consulta de rol va en un efecto aparte (no dentro del callback de auth) para evitar bloqueos.
  useEffect(() => {
    if (!sessionReady) return;
    if (!userId) {
      setIsAdmin(false);
      setRoleReady(true);
      return;
    }
    let cancelled = false;
    setRoleReady(false);
    supabase
      .from("admin_users")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setIsAdmin(!!data);
        setRoleReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, sessionReady]);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (/fetch|network/i.test(error.message)) return "Sin conexión con el servidor. Revisa tu Internet.";
        return "Correo o contraseña incorrectos.";
      }
      return null;
    } catch {
      return "Sin conexión con el servidor. Revisa tu Internet.";
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ loading: !sessionReady || !roleReady, session, isAdmin, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, session, isAdmin } = useAuth();
  if (loading) return <Spinner />;
  if (!session || !isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}
