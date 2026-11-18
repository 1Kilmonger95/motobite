-- MotoBite · Etapa 2 · Funciones atómicas de activación
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 001.
-- Solo service_role puede ejecutarlas (las llamarán las Edge Functions en la Etapa 8).
-- Convención: token_hash = SHA-256 en hexadecimal minúscula del token en texto.

-- Emite un enlace nuevo; revoca el enlace vivo anterior del chip (atómico).
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

  insert into public.activation_tokens (chip_id, token_hash, expires_at, created_by)
  values (p_chip_id, p_token_hash, p_expires_at, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

-- Revoca un enlace pendiente o reservado. Devuelve false si no era revocable.
create or replace function public.revoke_activation_token(p_token_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.activation_tokens
     set status = 'revoked', reserved_until = null
   where id = p_token_id and status in ('pending','reserved');
  return found;
end;
$$;

-- Consulta de estado (solo lectura; NO reserva ni consume).
create or replace function public.get_activation_status(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.activation_tokens%rowtype;
  c public.chips%rowtype;
  v_status text;
begin
  select * into t from public.activation_tokens where token_hash = p_token_hash;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  v_status := case
    when t.status in ('pending','reserved') and t.expires_at <= now() then 'expired'
    when t.status = 'reserved' and t.reserved_until <= now() then 'pending'
    else t.status end;

  if v_status in ('pending','reserved') then
    select * into c from public.chips where id = t.chip_id;
    return jsonb_build_object('ok', true, 'status', v_status, 'name', c.name,
      'description', c.description, 'expires_at', t.expires_at, 'chip_active', c.active);
  end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

-- Reserva temporal. El mismo dispositivo puede reintentar con su reservation_id.
create or replace function public.reserve_activation(
  p_token_hash text, p_reservation_id uuid default null, p_ttl_seconds int default 900
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.activation_tokens%rowtype;
  c public.chips%rowtype;
  v_res uuid;
  v_until timestamptz;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  -- El bloqueo de fila serializa a dos dispositivos que llegan a la vez.
  select * into t from public.activation_tokens where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if t.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'revoked'); end if;
  if t.status = 'activated' then return jsonb_build_object('ok', false, 'code', 'consumed'); end if;
  if t.status = 'expired' or t.expires_at <= now() then
    if t.status <> 'expired' then
      update public.activation_tokens set status = 'expired', reserved_until = null where id = t.id;
    end if;
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  select * into c from public.chips where id = t.chip_id;
  if not c.active then return jsonb_build_object('ok', false, 'code', 'chip_inactive'); end if;

  if t.status = 'reserved' and t.reserved_until > now() then
    if p_reservation_id is not null and p_reservation_id = t.reservation_id then
      v_res := t.reservation_id;
    else
      return jsonb_build_object('ok', false, 'code', 'reserved_by_other');
    end if;
  else
    v_res := gen_random_uuid();
  end if;

  v_until := now() + make_interval(secs => p_ttl_seconds);
  update public.activation_tokens
     set status = 'reserved', reservation_id = v_res, reserved_until = v_until
   where id = t.id;

  return jsonb_build_object('ok', true, 'reservation_id', v_res, 'reserved_until', v_until,
    'name', c.name, 'description', c.description,
    'drive_url', c.drive_url, 'drive_file_id', c.drive_file_id);
end;
$$;

-- Libera la reserva (el cliente canceló o falló); el enlace vuelve a pendiente.
create or replace function public.release_reservation(p_token_hash text, p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.activation_tokens
     set status = 'pending', reservation_id = null, reserved_until = null
   where token_hash = p_token_hash and status = 'reserved' and reservation_id = p_reservation_id;
  return found;
end;
$$;

-- Confirmación final: consume el enlace solo si la reserva sigue vigente.
create or replace function public.confirm_activation(
  p_token_hash text, p_reservation_id uuid, p_installation_id text,
  p_device_label text, p_source_type text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.activation_tokens%rowtype;
begin
  if p_reservation_id is null
     or p_installation_id is null
     or char_length(p_installation_id) not between 16 and 128
     or coalesce(p_source_type, '') not in ('drive','local') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  select * into t from public.activation_tokens where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if t.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'revoked'); end if;
  if t.status = 'expired' then return jsonb_build_object('ok', false, 'code', 'expired'); end if;

  if t.status = 'activated' then
    -- Reintento tras perder la respuesta de red: es idempotente para el mismo dispositivo.
    if exists (select 1 from public.device_activations
                where activation_token_id = t.id and installation_id = p_installation_id) then
      update public.device_activations set last_seen_at = now()
       where activation_token_id = t.id;
      return jsonb_build_object('ok', true, 'code', 'already_confirmed');
    end if;
    return jsonb_build_object('ok', false, 'code', 'consumed');
  end if;

  if t.status <> 'reserved' or t.reservation_id is distinct from p_reservation_id then
    return jsonb_build_object('ok', false, 'code', 'invalid_reservation');
  end if;
  if t.reserved_until <= now() then
    return jsonb_build_object('ok', false, 'code', 'reservation_expired');
  end if;

  update public.activation_tokens
     set status = 'activated', consumed_at = now(), reserved_until = null
   where id = t.id;

  insert into public.device_activations
    (chip_id, activation_token_id, installation_id, device_label, source_type)
  values
    (t.chip_id, t.id, p_installation_id, nullif(left(coalesce(p_device_label, ''), 80), ''), p_source_type);

  return jsonb_build_object('ok', true, 'code', 'confirmed');
end;
$$;

-- Solo service_role puede ejecutar estas funciones.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('issue_activation_token','revoke_activation_token',
                         'get_activation_status','reserve_activation',
                         'release_reservation','confirm_activation')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
