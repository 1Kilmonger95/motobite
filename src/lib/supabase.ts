import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Revisa tu archivo .env.local."
  );
}

// La anon key es pública por diseño; la seguridad real la dan RLS y las Edge Functions.
// La service_role NUNCA debe aparecer en el frontend.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});
