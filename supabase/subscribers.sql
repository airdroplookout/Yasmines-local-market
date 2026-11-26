-- Newsletter subscribers — Locally Crafted CA.
-- One-time setup: run this file ONCE in the Supabase SQL Editor
-- (project yasmines-local-market, ref btkafyjtujiddoqsyivl).
-- Repo SQL does not auto-apply to the live database.
-- Until this is run, POST /api/subscribe fails (no table) and the
-- home-page signup shows an error — nothing is saved.
-- Signups are NOT emailed anywhere: this table is the list.
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  source text,
  created_at timestamptz not null default now()
);
create index if not exists idx_subscribers_email on public.subscribers (email);
create index if not exists idx_subscribers_status on public.subscribers (status);

alter table public.subscribers enable row level security;
-- No public policy and NO anon grants: only the service role (the
-- Netlify Functions, server-side) can read or write this table.
-- Subscriber emails never appear on any public page.
grant select, insert, update, delete on public.subscribers to service_role;
