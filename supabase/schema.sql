-- ============================================================================
-- Leads Panel — schema completo do banco (Supabase / PostgreSQL)
-- Rode este arquivo no SQL Editor do Supabase (uma vez, num projeto novo).
-- ============================================================================

create extension if not exists pgcrypto;

-- ── LEADS ───────────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  email         text not null default '',
  phone         text not null default '',
  status        text not null default 'novo',   -- novo | em_contato | convertido | perdido
  form_name     text not null default '',
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  custom_questions jsonb,
  created_at    timestamptz not null default now(),
  meta_lead_id  text unique,                     -- dedupe webhook + backfill
  source        text not null default 'meta',    -- meta | planilha | site
  platform      text,
  campaign      text,
  adset         text,
  ad_name       text,
  responsible   text
);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_source_idx on public.leads (source);

-- ── PROFILES (usuários do painel) ────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  name        text not null default '',
  role        text not null default 'usuario',   -- adm | usuario
  permissions text[] not null default array['leads','site','planilhas','eventos'],
  created_at  timestamptz not null default now()
);

-- ── VIEW SETTINGS (colunas por usuário + padrão global) ──────────────────────
create table if not exists public.view_settings (
  user_id    uuid not null,     -- 00000000-0000-0000-0000-000000000000 = padrão global
  source     text not null,
  columns    jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, source)
);

-- ── RESPONSÁVEIS ─────────────────────────────────────────────────────────────
create table if not exists public.responsibles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ── LOG DE ATIVIDADES ────────────────────────────────────────────────────────
create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  actor_name text,
  action     text not null,
  link       text,
  created_at timestamptz not null default now()
);

-- ── EVENTOS ──────────────────────────────────────────────────────────────────
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  date       date,
  location   text,
  type       text,
  theme      text,
  created_at timestamptz not null default now()
);
create table if not exists public.event_registrations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null default '',
  phone      text not null default '',
  email      text not null default '',
  specialty  text,
  notes      text,
  status     text not null default 'novo',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- RLS — o webhook/backfill/admin usam a service_role (que ignora RLS).
-- ============================================================================
alter table public.leads               enable row level security;
alter table public.profiles            enable row level security;
alter table public.view_settings       enable row level security;
alter table public.responsibles        enable row level security;
alter table public.activity_log        enable row level security;
alter table public.events              enable row level security;
alter table public.event_registrations enable row level security;

-- helper: o usuário logado é admin?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'adm')
$$;

-- leads / view_settings / responsibles: acesso total a autenticados
create policy leads_auth_all on public.leads
  for all to authenticated using (true) with check (true);
create policy view_settings_auth_all on public.view_settings
  for all to authenticated using (true) with check (true);
create policy responsibles_auth_all on public.responsibles
  for all to authenticated using (true) with check (true);

-- profiles: autenticado lê; escrita só via service_role (admin API)
create policy profiles_auth_read on public.profiles
  for select to authenticated using (true);

-- activity_log: autenticado insere o próprio; só admin lê
create policy activity_insert on public.activity_log
  for insert to authenticated with check (true);
create policy activity_admin_read on public.activity_log
  for select to authenticated using (public.is_admin());

-- events: autenticado lê; só admin escreve
create policy events_auth_read on public.events
  for select to authenticated using (true);
create policy events_admin_write on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- event_registrations: formulário público (anon) insere; autenticado gerencia
create policy evreg_public_insert on public.event_registrations
  for insert to anon, authenticated with check (true);
create policy evreg_auth_manage on public.event_registrations
  for select to authenticated using (true);
create policy evreg_auth_update on public.event_registrations
  for update to authenticated using (true) with check (true);
