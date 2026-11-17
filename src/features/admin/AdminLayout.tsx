import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/auth";

const links = [
  { to: "/admin", label: "Panel", end: true },
  { to: "/admin/chips", label: "Chips", end: false },
  { to: "/admin/activations", label: "Activaciones", end: false },
  { to: "/admin/history", label: "Historial", end: false },
  { to: "/admin/settings", label: "Configuración", end: false }
];

export default function AdminLayout() {
  const { session, signOut } = useAuth();

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-brand-900 text-white md:min-h-screen md:w-56 md:shrink-0">
        <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
          <span className="text-lg font-bold">MotoBite</span>
          <button type="button" onClick={signOut} className="text-xs text-slate-300 underline md:hidden">
            Cerrar sesión
          </button>
        </div>
        <nav className="flex gap-1 px-2 pb-2 md:flex-col md:pb-0">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-white/15" : "hover:bg-white/10"}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden p-4 text-xs text-slate-300 md:block">
          <p className="mb-2 break-all">{session?.user.email}</p>
          <button type="button" onClick={signOut} className="underline">Cerrar sesión</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
