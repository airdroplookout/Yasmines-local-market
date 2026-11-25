-- Locally Crafted CA — maker email verification at submit time (audit #3 N-M6)
-- + approve guards (N-L3): shop-name uniqueness.
-- RUN ONCE in Supabase Dashboard -> SQL Editor on the market
-- project. SQL files in the repo do NOT auto-apply to the live database:
-- nothing here takes effect until this file is run by hand.
--
-- What it does:
--  1. Adds email verification columns to product_submissions. A new
--     submission starts email_verified = false; the submit function
--     stores only the SHA-256 hash of a 256-bit token plus a 48-hour
--     expiry, and emails the maker a one-time confirmation link.
--     The raw token is never stored.
--  2. Adds a unique index on lower(shop_name) on makers, so two makers
--     cannot list under the same shop name (case-insensitive).
--     The index is created ONLY if the live table has no duplicate
--     shop names today; if it does, the DO block skips it and the
--     owner must rename one of the duplicates first, then re-run
--     just the CREATE UNIQUE INDEX statement at the bottom.
--  3. Adds an index on verify_token_hash so the confirmation lookup
--     is a single indexed row fetch.
--
-- MIGRATION CONSEQUENCE (read before running): every submission made
-- BEFORE this deploy has email_verified = false, and approve will
-- refuse those rows with 409 "Maker email not verified yet" (N-M6).
-- Those makers never got a confirmation email, so there is no link
-- to click. For each pre-existing pending submission the owner must
-- either contact the maker and ask them to re-submit (the new form
-- sends the confirmation email), or — only after confirming the
-- maker by another channel — set email_verified = true by hand, e.g.:
--   update public.product_submissions set email_verified = true
--   where id = '<submission uuid>';
-- Do NOT bulk-update all rows to true: that would defeat the check.

alter table public.product_submissions
  add column if not exists email_verified boolean not null default false;
alter table public.product_submissions
  add column if not exists verify_token_hash text;
alter table public.product_submissions
  add column if not exists verify_expires_at timestamptz;

create index if not exists idx_submissions_verify_token
  on public.product_submissions (verify_token_hash);

-- Unique shop name (case-insensitive). Conditional-safe: skipped when
-- duplicate shop names already exist, so this file never fails
-- halfway through on a live database with duplicates.
do $$
begin
  if not exists (
    select 1 from (
      select lower(shop_name) as s from public.makers where shop_name is not null
      group by lower(shop_name) having count(*) > 1
    ) dup
  ) then
    create unique index if not exists idx_makers_shop_name_unique
      on public.makers (lower(shop_name));
  end if;
end $$;

-- If the DO block above skipped the index (duplicates exist), fix the
-- duplicates first, then run ONLY this line:
--   create unique index if not exists idx_makers_shop_name_unique
--     on public.makers (lower(shop_name));
