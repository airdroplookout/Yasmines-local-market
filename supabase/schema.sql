-- Yasmine's Local Market — Supabase schema.
-- Mirror of the Velvet & Pearl schema (Nov 2026), adapted for a makers'
-- market: makers, their listings, buyer reservations, settings, visits.
-- Run in Supabase Dashboard → SQL Editor on the NEW project (Free tier,
-- East US) in the enjoyhamilton@gmail.com account — the taradil account
-- already has 2 free projects (Airdrop Lookout + AI Outlet Plus).
-- Project name: yasmines-local-market. See README.md for the full steps.
-- No payments table, no wallet, no USDT. Prices in the listings table
-- are the SHOPPER prices shown on the cards. Makers are paid directly
-- by buyers (cash, e-transfer, tap) — nothing goes through this site.
-- The makers/listings status check INCLUDES 'archived'.

create extension if not exists "pgcrypto";

-- Makers: one row per local maker. Email is how the market reaches them.
create table if not exists public.makers (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- e.g. 'Mary Stones'
  shop_name text,                    -- e.g. "Mary's Pottery"
  email text not null unique,          -- e.g. 'mary@maryspottery.com' (unique: one maker row per email, so the seed insert's ON CONFLICT (email) works)
  phone text,
  bio text,                          -- one or two lines about the maker
  status text not null default 'live'
    check (status in ('live','archived')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_makers_status on public.makers (status, position);
create index if not exists idx_makers_email on public.makers (email);

-- Listings: one row per product. A maker may have many.
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references public.makers (id) on delete cascade,
  name text not null,                -- e.g. 'Speckled Stoneware Mug'
  price text not null,               -- shopper price, e.g. '$32'
  category text not null default 'pottery'
    check (category in ('pottery','jewelry','homeware','textiles','art','cards-stationery','clothing-accessories','weddings','craft-supplies','christmas-gifts','other')),
  description text,
  photo text,                        -- e.g. 'images/mary-mug.webp'
  status text not null default 'live'
    check (status in ('live','archived')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_listings_status on public.listings (status, position);
create index if not exists idx_listings_maker on public.listings (maker_id);

-- Reservations: one row per buyer reservation. The reserve form posts
-- to FormSubmit (the owner's email notification) AND saves a copy here
-- via POST /api/reserve (switched Nov 25, 2026), so new reservations
-- show in Manage > Reservations as well as in the inbox.
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  maker_id uuid references public.makers (id) on delete set null,
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  quantity text,
  delivery_method text,              -- 'Pickup' or 'Delivery by mail'
  message text,
  status text not null default 'new'
    check (status in ('new','contacted','done')),
  created_at timestamptz not null default now()
);
create index if not exists idx_reservations_status on public.reservations (status, created_at desc);
create index if not exists idx_reservations_maker on public.reservations (maker_id);

-- Product submissions (Submit a Product form, Nov 25 2026): one row per
-- maker-submitted product. Rows stay 'pending' until the owner
-- approves them in Manage > Submissions — approving creates the real
-- maker (if new) and the live listing. Nothing here is ever read by
-- the public listings feed.
create table if not exists public.product_submissions (
  id uuid primary key default gen_random_uuid(),
  maker_name text not null,
  maker_email text not null,
  product_name text not null,
  category text not null
    check (category in ('pottery','jewelry','homeware','textiles','art','cards-stationery','clothing-accessories','weddings','craft-supplies','christmas-gifts','other')),
  category_label text,
  description text,
  price text not null,
  photo_url text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_submissions_status on public.product_submissions (status, created_at desc);
create index if not exists idx_submissions_email on public.product_submissions (maker_email);

-- Settings: key/value. No wallet, no Telegram, no payment keys.
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values
  ('notification_email', ''),
  ('sender_email', ''),
  ('site_domain', 'yasmines-local-market.netlify.app')
on conflict (key) do nothing;

-- Visits (for the Manage Visits card — same pattern as Airdrop Lookout,
-- AI Outlet Plus and Velvet & Pearl).
create table if not exists public.page_views (
  day date primary key,
  views int not null default 0
);

-- Seed the first maker + her 10 listings, so the Manage makers and
-- listings lists match the site from day one (same names and prices as
-- the live site — these prices are still examples until Mary confirms
-- them). Mary Stones is the market's first featured maker.
insert into public.makers (name, shop_name, email, bio, position) values
  ('Mary Stones', 'Mary''s Pottery', 'mary@maryspottery.com', 'Mary throws every piece by hand on her wheel — mugs, bowls, vases and more, each one a little different from the last.', 1)
on conflict (email) do nothing;

insert into public.listings (maker_id, name, price, category, description, photo, position)
select m.id, v.name, v.price, 'pottery', v.description, v.photo, v.position
from public.makers m
join (values
  ('Speckled Stoneware Mug', '$32', 'Hand-thrown mug in a soft speckled glaze — every one a little different. Holds a generous cup of tea or coffee.', 'images/mary-mug.webp', 1),
  ('Rustic Serving Bowl', '$48', 'A generous hand-thrown bowl in warm earth tones, made for salads, pasta, and family dinners.', 'images/mary-bowl.webp', 2),
  ('Hand-thrown Vase', '$65', 'A tall, graceful vase in creamy white glaze with a soft matte finish. Made for fresh flowers — or lovely standing on its own.', 'images/mary-vase.webp', 3),
  ('Speckled Dinner Plate', '$38', 'A sturdy hand-thrown dinner plate with a speckled glaze — no two exactly alike. Dishwasher-friendly.', 'images/mary-plate.webp', 4),
  ('Ribbed Stoneware Planter', '$42', 'A ribbed stoneware planter with a matching saucer, glazed in soft grey-blue with a terracotta rim.', 'images/mary-planter.webp', 5),
  ('Hand-thrown Teapot', '$85', 'A one-of-a-kind teapot in a bold red and amber glaze with hand-painted swirls. Brews about four cups.', 'images/mary-teapot.webp', 6),
  ('Lidded Butter Dish', '$36', 'A stoneware butter dish with a fitted lid in soft blue-grey glaze. Keeps butter fresh on the counter.', 'images/mary-butter.webp', 7),
  ('Ceramic Spoon Rest', '$28', 'A long speckled spoon rest that keeps drips off the counter — fits a wooden spoon or a ladle.', 'images/mary-spoon.webp', 8),
  ('Stoneware Candle Holder', '$30', 'A hand-thrown candle holder with a warm brown glaze and a little handle. Fits a standard pillar candle.', 'images/mary-candle.webp', 9),
  ('Serving Platter', '$58', 'A wide hand-thrown serving platter, perfect for roasts, bread, or a spread of cheese.', 'images/mary-platter.webp', 10)
) as v(name, price, description, photo, position) on true
where m.email = 'mary@maryspottery.com'
  and not exists (select 1 from public.listings l where l.maker_id = m.id and l.name = v.name);

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_makers_updated on public.makers;
create trigger trg_makers_updated before update on public.makers for each row execute function public.set_updated_at();
drop trigger if exists trg_listings_updated on public.listings;
create trigger trg_listings_updated before update on public.listings for each row execute function public.set_updated_at();
drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings for each row execute function public.set_updated_at();

-- Row Level Security: anon may read live makers + live listings, and
-- insert a reservation. Nothing else.
alter table public.makers enable row level security;
alter table public.listings enable row level security;
alter table public.reservations enable row level security;
alter table public.settings enable row level security;
alter table public.page_views enable row level security;

drop policy if exists "public read live makers" on public.makers;
create policy "public read live makers" on public.makers
  for select using (status = 'live');
drop policy if exists "public read live listings" on public.listings;
create policy "public read live listings" on public.listings
  for select using (status = 'live');
drop policy if exists "public insert reservation" on public.reservations;
create policy "public insert reservation" on public.reservations
  for insert with check (true);
-- No public select/insert/update/delete on settings, page_views, or
-- reservations reads. (Service role bypasses RLS, so the Functions can
-- still read/write them.)

-- Grants — run immediately after the schema (do NOT defer; the missing
-- settings grant is the exact step that broke the login lockout on
-- Airdrop Lookout before it was fixed. Without the settings grant, the
-- login lockout and the session-version revocation silently fail.
-- Without the reservations DELETE grant, Remove fails. Without the
-- makers/listings grants, the Manage managers fail.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.makers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO service_role;  -- DELETE added 2026-11-25: password-reset token consumption needs it (audit H-2).
GRANT SELECT, INSERT, UPDATE ON public.page_views TO service_role;
-- Product submissions (Submit a Product form, Nov 25 2026): rows stay
-- 'pending' until the owner approves them in Manage > Submissions.
-- No anon access — makers never read this table directly. Also run
-- supabase/product-submissions.sql once on the live project to create
-- the table there.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_submissions TO service_role;

-- Anon grants — these MUST be in the schema, not deferred. Postgres
-- requires the table privilege too before a policy can allow the anon
-- role anything; without these four lines the RLS policies above are
-- dead letters (this is the gap found on Velvet & Pearl, Nov 24 2026).
GRANT SELECT ON public.makers TO anon;
GRANT SELECT ON public.listings TO anon;
GRANT INSERT ON public.reservations TO anon;

-- The Visits counter. netlify/functions/track.js calls rpc/bump_visit.
create or replace function public.bump_visit(p_day date)
returns int
language sql
security definer
as $$
  insert into public.page_views (day, views) values (p_day, 1)
  on conflict (day) do update set views = page_views.views + 1
  returning views;
$$;

-- Category list changed Nov 25, 2026 (owner decision): the fixed list is
-- now Pottery, Jewelry, Homeware, Textiles, Art, Cards & Stationery,
-- Clothing & Accessories, Weddings, Craft Supplies, Christmas Gifts,
-- Other (no free text; makers pick one, "Other" picks are reviewed
-- later for new categories).
-- MIGRATION for databases created before Nov 25, 2026 — the old check
-- constraint rejects 'homeware', 'textiles', 'art', 'cards-stationery',
-- 'clothing-accessories', 'weddings', 'craft-supplies' and
-- 'christmas-gifts', so a Manage save with those categories fails until
-- this runs. Run once in the Supabase SQL editor (all live listings are
-- 'pottery', so nothing violates it):
--   alter table public.listings drop constraint if exists listings_category_check;
--   alter table public.listings add constraint listings_category_check
--     check (category in ('pottery','jewelry','homeware','textiles','art','cards-stationery','clothing-accessories','weddings','craft-supplies','christmas-gifts','other'));
alter table public.listings drop constraint if exists listings_category_check;
alter table public.listings add constraint listings_category_check
  check (category in ('pottery','jewelry','homeware','textiles','art','cards-stationery','clothing-accessories','weddings','craft-supplies','christmas-gifts','other'));
