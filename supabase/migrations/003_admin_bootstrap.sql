-- MotoBite · Etapa 2 · Registrar tu usuario como administrador
-- 1) Cambia el correo por el del usuario que creaste en Authentication > Users.
-- 2) Ejecuta en SQL Editor, después de 001 y 002.

insert into public.admin_users (user_id, role)
select id, 'admin' from auth.users
 where email = 'CAMBIA_ESTE_CORREO@ejemplo.com'
on conflict (user_id) do nothing;

-- Verificación: debe devolver 1 fila con tu correo.
select a.user_id, u.email, a.role
  from public.admin_users a join auth.users u on u.id = a.user_id;
