-- MotoBite · Etapa 2 · Pruebas de la lógica de activación
-- Ejecutar en SQL Editor DESPUÉS de 001 y 002.
-- Todo se hace dentro de una transacción que se revierte al final:
--   * Si ves el error "PRUEBAS OK ..." todo pasó (es intencional, para no dejar datos de prueba).
--   * Si ves "Assertion failed: ..." esa prueba falló.

do $$
declare
  v_chip uuid;
  h1 text := encode(sha256('token-prueba-1'::bytea), 'hex');
  h2 text := encode(sha256('token-prueba-2'::bytea), 'hex');
  h3 text := encode(sha256('token-prueba-3'::bytea), 'hex');
  h4 text := encode(sha256('token-prueba-4'::bytea), 'hex');
  r jsonb;
  res1 uuid;
  v_id uuid;
  v_id2 uuid;
  v_denied boolean;
begin
  insert into public.chips (name, description, drive_url)
  values ('Chip de prueba', 'x', 'https://drive.google.com/file/d/ABC123/view')
  returning id into v_chip;

  v_id := public.issue_activation_token(v_chip, h1, now() + interval '1 day', null);

  -- Reserva inicial
  r := public.reserve_activation(h1, null, 900);
  assert (r->>'ok')::boolean, 'T1: la reserva inicial debía funcionar';
  res1 := (r->>'reservation_id')::uuid;

  -- Un segundo dispositivo no puede reservar
  r := public.reserve_activation(h1, null, 900);
  assert r->>'code' = 'reserved_by_other', 'T2: otro dispositivo no debía reservar';

  -- El mismo dispositivo puede reintentar con su reservation_id
  r := public.reserve_activation(h1, res1, 900);
  assert (r->>'ok')::boolean and (r->>'reservation_id')::uuid = res1, 'T3: el reintento debía conservar la reserva';

  -- La consulta de estado no consume nada
  r := public.get_activation_status(h1);
  assert r->>'status' = 'reserved', 'T4: el estado debía seguir reservado';

  -- Confirmación con reserva falsa
  r := public.confirm_activation(h1, gen_random_uuid(), 'instalacion-prueba-0001', 'x', 'local');
  assert r->>'code' = 'invalid_reservation', 'T5: una reserva falsa no debía confirmar';
  assert (select status from public.activation_tokens where id = v_id) = 'reserved', 'T5b: el token no debía consumirse';

  -- Confirmación válida
  r := public.confirm_activation(h1, res1, 'instalacion-prueba-0001', 'Android de prueba', 'local');
  assert (r->>'ok')::boolean and r->>'code' = 'confirmed', 'T6: la confirmación válida debía funcionar';
  assert (select status from public.activation_tokens where id = v_id) = 'activated', 'T6b: el token debía quedar activado';

  -- Reutilización
  r := public.reserve_activation(h1, null, 900);
  assert r->>'code' = 'consumed', 'T7: un token consumido no debía reservarse';

  -- Reintento idempotente del mismo dispositivo
  r := public.confirm_activation(h1, res1, 'instalacion-prueba-0001', 'Android de prueba', 'local');
  assert r->>'code' = 'already_confirmed', 'T8: el reintento del mismo dispositivo debía ser idempotente';

  -- Otro dispositivo intentando confirmar un token ya consumido
  r := public.confirm_activation(h1, res1, 'instalacion-prueba-9999', 'Otro', 'local');
  assert r->>'code' = 'consumed', 'T9: otro dispositivo no debía confirmar';

  -- Token vencido
  insert into public.activation_tokens (chip_id, token_hash, expires_at)
  values (v_chip, h2, now() - interval '1 minute');
  r := public.reserve_activation(h2, null, 900);
  assert r->>'code' = 'expired', 'T10: un token vencido no debía reservarse';

  -- Un enlace vencido queda marcado como vencido
  assert (select status from public.activation_tokens where token_hash = h2) = 'expired', 'T11: el enlace vencido debía quedar marcado como vencido';

  -- Emitir un enlace nuevo revoca el vivo anterior; el revocado no reserva
  v_id := public.issue_activation_token(v_chip, h3, now() + interval '1 day', null);
  v_id2 := public.issue_activation_token(v_chip, h4, now() + interval '1 day', null);
  assert (select status from public.activation_tokens where token_hash = h3) = 'revoked', 'T12: el enlace anterior debía quedar revocado';
  r := public.reserve_activation(h3, null, 900);
  assert r->>'code' = 'revoked', 'T13: un token revocado no debía reservarse';

  -- Liberar la reserva devuelve el enlace a pendiente
  r := public.reserve_activation(h4, null, 900);
  assert public.release_reservation(h4, (r->>'reservation_id')::uuid), 'T14: debía liberarse';
  assert (select status from public.activation_tokens where id = v_id2) = 'pending', 'T14b: debía volver a pendiente';

  -- Revocación manual
  assert public.revoke_activation_token(v_id2), 'T14c: debía poder revocarse';
  assert not public.revoke_activation_token(v_id2), 'T14d: no debía revocarse dos veces';

  -- RLS: el rol anónimo no puede leer nada
  v_denied := false;
  begin
    execute 'set local role anon';
    perform 1 from public.chips limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  execute 'reset role';
  assert v_denied, 'T15: el rol anónimo no debía leer chips';

  -- Las funciones sensibles no son ejecutables por usuarios autenticados
  v_denied := false;
  begin
    execute 'set local role authenticated';
    perform public.reserve_activation(h1, null, 900);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  execute 'reset role';
  assert v_denied, 'T16: un usuario autenticado no debía ejecutar reserve_activation';

  raise exception 'PRUEBAS OK: todas las verificaciones pasaron (se revirtió todo, no quedó nada guardado)';
end $$;
