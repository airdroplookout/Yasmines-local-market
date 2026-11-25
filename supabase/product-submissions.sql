-- Locally Crafted CA — product_submissions table (one-time setup).
-- Run this ONCE in Supabase Dashboard → SQL Editor on the
-- yasmines-local-market project, then the Submit a Product form saves
-- every submission as 'pending' and it appears in Manage > Submissions.
-- Until this is run, submissions still reach the owner by email
-- (FormSubmit) with the photo link — nothing is lost — but they will
-- not show in Manage, and Approve in Manage will fail until the table
-- exists.
-- Nothing a maker submits goes live on its own: rows stay 'pending'
-- until the owner approves them in Manage, which creates the listing.
create table if not exists public.product_submissions (
  id uuid primary key default gen_random_uuid(),
  maker_name text not null,
  business_name text not null,
  maker_email text not null,
  product_name text not null,
  category text not null
    check (category in ('pottery','jewelry','homeware','textiles','art','cards-stationery','clothing-accessories','weddings','craft-supplies','christmas-gifts','other')),
  category_label text,
  other_category text,
  description text,
  price text not null,
  photo_url text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Safety net: if this file was already run before business_name /
-- other_category were added, these two lines add them (does nothing
-- when the columns are already there).
alter table public.product_submissions add column if not exists business_name text;
alter table public.product_submissions add column if not exists other_category text;
create index if not exists idx_submissions_status on public.product_submissions (status, created_at desc);
create index if not exists idx_submissions_email on public.product_submissions (maker_email);

-- The functions use the service-role key (server-side only), so this
-- grant is what lets them read/write the table. No anon access at all:
-- makers never read this table directly.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_submissions TO service_role;
