-- MotoBite · Etapa 8 · Límite de intentos y reemisión de activaciones
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 001, 002 y 003.

-- 1) Límite de intentos (rate limiting) para las acciones públicas.
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated; -- sin políticas: solo service_role

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end,
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                then 1 else r.hits + 1 end
  returning r.hits into v_hits;

  if random() < 0.01 then  -- limpieza ocasional de ventanas viejas
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- 2) Al emitir un enlace nuevo (cambio de teléfono, pérdida de datos), el dispositivo anterior
--    queda marcado como reemplazado en el historial. No se puede borrar el PDF del teléfono viejo.
create or replace function public.issue_activation_token(
  p_chip_id uuid, p_token_hash text, p_expires_at timestamptz, p_created_by uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
  v_id uuid;
begin
  select active into v_active from public.chips where id = p_chip_id for update;
  if not found then raise exception 'chip_not_found'; end if;
  if not v_active then raise exception 'chip_inactive'; end if;
  if p_expires_at <= now() then raise exception 'invalid_expiry'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_token_hash'; end if;

  update public.activation_tokens set status = 'revoked'
   where chip_id = p_chip_id and status in ('pending','reserved');

  update public.device_activations set status = 'revoked'
   where chip_id = p_chip_id and status = 'active';

  insert into public.activation_tokens (chip_id, token_hash, expires_at, created_by)
  values (p_chip_id, p_token_hash, p_expires_at, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;
