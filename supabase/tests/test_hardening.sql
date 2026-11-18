-- MotoBite · Etapa 8 · Pruebas (ejecutar después de 004). Termina con el error "PRUEBAS OK ..." a propósito.
do $$
declare
  v_chip uuid;
  h1 text := encode(sha256('hard-1'::bytea), 'hex');
  h2 text := encode(sha256('hard-2'::bytea), 'hex');
  r jsonb;
  res uuid;
  v_denied boolean;
begin
  -- límite de intentos
  assert public.check_rate_limit('t:a', 3, 60), 'R1';
  assert public.check_rate_limit('t:a', 3, 60), 'R2';
  assert public.check_rate_limit('t:a', 3, 60), 'R3';
  assert not public.check_rate_limit('t:a', 3, 60), 'R4: el 4.º intento debía bloquearse';
  assert public.check_rate_limit('t:b', 3, 60), 'R5: otra clave no debía verse afectada';
  update public.rate_limits set window_start = now() - interval '2 minutes' where key = 't:a';
  assert public.check_rate_limit('t:a', 3, 60), 'R6: tras la ventana debía volver a permitirse';
  assert (select hits from public.rate_limits where key = 't:a') = 1, 'R7: la ventana debía reiniciarse';

  -- reemisión: el dispositivo anterior queda como reemplazado
  insert into public.chips (name, description, drive_url) values ('Chip 8', 'x', 'https://drive.google.com/file/d/ABC123/view') returning id into v_chip;
  perform public.issue_activation_token(v_chip, h1, now() + interval '1 day', null);
  r := public.reserve_activation(h1, null, 900); res := (r->>'reservation_id')::uuid;
  r := public.confirm_activation(h1, res, 'instalacion-hard-0001', 'Android', 'local');
  assert (r->>'ok')::boolean, 'D1';
  assert (select status from public.device_activations where chip_id = v_chip) = 'active', 'D2';
  perform public.issue_activation_token(v_chip, h2, now() + interval '1 day', null);
  assert (select status from public.device_activations where chip_id = v_chip) = 'revoked', 'D3: el dispositivo anterior debía quedar reemplazado';
  r := public.reserve_activation(h2, null, 900);
  assert (r->>'ok')::boolean, 'D4: el enlace nuevo debía poder reservarse';

  -- permisos
  v_denied := false;
  begin execute 'set local role authenticated'; perform public.check_rate_limit('x', 1, 60);
  exception when insufficient_privilege then v_denied := true; end;
  execute 'reset role';
  assert v_denied, 'P1: authenticated no debía ejecutar check_rate_limit';
  v_denied := false;
  begin execute 'set local role anon'; perform 1 from public.rate_limits limit 1;
  exception when insufficient_privilege then v_denied := true; end;
  execute 'reset role';
  assert v_denied, 'P2: anon no debía leer rate_limits';

  raise exception 'PRUEBAS OK: todas las verificaciones de la Etapa 8 pasaron (se revirtió todo)';
end $$;
