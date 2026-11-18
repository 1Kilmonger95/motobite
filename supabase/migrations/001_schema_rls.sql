-- MotoBite · Etapa 2 · Esquema, índices, restricciones y RLS
-- Ejecutar completo en Supabase > SQL Editor (una sola vez).

-- ============================ TABLAS ============================

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table public.chips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  drive_url text not null check (drive_url ~ '^https://(drive|docs)\.google\.com/'),
  drive_file_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activation_tokens (
  id uuid primary key default gen_random_uuid(),
  chip_id uuid not null references public.chips(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending','reserved','activated','expired','revoked')),
  expires_at timestamptz not null,
  reserved_until timestamptz,
  reservation_id uuid,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint reserved_requires_fields
    check (status <> 'reserved' or (reservation_id is not null and reserved_until is not null)),
  constraint activated_requires_consumed_at
    check (status <> 'activated' or consumed_at is not null)
);

create table public.device_activations (
  id uuid primary key default gen_random_uuid(),
  chip_id uuid not null references public.chips(id) on delete restrict,
  activation_token_id uuid not null unique references public.activation_tokens(id) on delete restrict,
  installation_id text not null check (char_length(installation_id) between 16 and 128),
  device_label text check (char_length(device_label) <= 80),
  source_type text not null check (source_type in ('drive','local')),
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','revoked'))
);

-- ============================ ÍNDICES ============================

create index chips_active_idx on public.chips (active);
create index activation_tokens_chip_idx on public.activation_tokens (chip_id, created_at desc);
create index activation_tokens_status_idx on public.activation_tokens (status, expires_at);
-- Máximo un enlace "vivo" (pendiente o reservado) por chip:
create unique index activation_tokens_one_live_per_chip
  on public.activation_tokens (chip_id) where status in ('pending','reserved');
create index device_activations_chip_idx on public.device_activations (chip_id, activated_at desc);
create index device_activations_installation_idx on public.device_activations (installation_id);

-- ======================== updated_at AUTOMÁTICO ========================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger chips_set_updated_at
  before update on public.chips
  for each row execute function public.set_updated_at();

-- ============================ ADMIN ============================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ============================ RLS ============================

alter table public.admin_users enable row level security;
alter table public.chips enable row level security;
alter table public.activation_tokens enable row level security;
alter table public.device_activations enable row level security;

-- Privilegios de tabla: el rol anónimo no toca nada.
revoke all on public.admin_users, public.chips, public.activation_tokens, public.device_activations
  from anon, authenticated;
grant select on public.admin_users, public.activation_tokens, public.device_activations to authenticated;
grant select, insert, update, delete on public.chips to authenticated;

create policy admin_users_self_read on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

create policy chips_admin_all on public.chips
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Los tokens y activaciones son de solo lectura para el admin.
-- Toda escritura pasa por las funciones de 002 (solo service_role, vía Edge Functions).
create policy tokens_admin_read on public.activation_tokens
  for select to authenticated using (public.is_admin());

create policy devices_admin_read on public.device_activations
  for select to authenticated using (public.is_admin());
