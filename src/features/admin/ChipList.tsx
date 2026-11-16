import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { effectiveStatus, STATUS_LABEL, STATUS_STYLE } from "../../lib/status";
import { friendlyError } from "../../lib/errors";
import type { Chip, TokenRow, TokenStatus } from "../../lib/types";
import { Badge, ErrorBox, Spinner } from "../../components/ui";

type TokenLite = Pick<TokenRow, "chip_id" | "status" | "expires_at" | "reserved_until">;

export default function ChipList() {
  const [chips, setChips] = useState<Chip[] | null>(null);
  const [latest, setLatest] = useState<Record<string, TokenStatus>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, t] = await Promise.all([
        supabase.from("chips").select("*").order("created_at", { ascending: false }),
        supabase
          .from("activation_tokens")
          .select("chip_id, status, expires_at, reserved_until, created_at")
          .order("created_at", { ascending: false })
      ]);
      if (cancelled) return;
      const err = c.error ?? t.error;
      if (err) {
        setError(friendlyError(err));
        return;
      }
      const map: Record<string, TokenStatus> = {};
      for (const row of (t.data ?? []) as TokenLite[]) {
        if (!(row.chip_id in map)) map[row.chip_id] = effectiveStatus(row);
      }
      setLatest(map);
      setChips((c.data ?? []) as Chip[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!chips) return [];
    return q ? chips.filter((c) => (c.name + " " + c.description).toLowerCase().includes(q)) : chips;
  }, [chips, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Chips</h1>
        <Link to="/admin/chips/new" className="btn btn-primary">Registrar chip</Link>
      </div>

      <input className="input" placeholder="Buscar por nombre o descripción…" value={search}
        onChange={(e) => setSearch(e.target.value)} aria-label="Buscar chips" />

      <ErrorBox message={error} />
      {!chips && !error && <Spinner />}

      {chips && chips.length === 0 && (
        <div className="card text-center text-slate-500">
          Aún no hay chips. Registra el primero con el botón «Registrar chip».
        </div>
      )}
      {chips && chips.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-slate-500">Ningún chip coincide con la búsqueda.</p>
      )}

      <ul className="space-y-3">
        {filtered.map((chip) => {
          const st = latest[chip.id];
          return (
            <li key={chip.id}>
              <Link to={`/admin/chips/${chip.id}`} className="card block hover:border-brand-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{chip.name}</span>
                  {!chip.active && <Badge className="bg-slate-200 text-slate-700">Desactivado</Badge>}
                  {st ? <Badge className={STATUS_STYLE[st]}>{STATUS_LABEL[st]}</Badge>
                      : <Badge className="bg-slate-100 text-slate-600">Sin enlace</Badge>}
                </div>
                {chip.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{chip.description}</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
