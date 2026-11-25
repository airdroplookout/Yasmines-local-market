-- Locally Crafted CA — bump_visit hardening (Audit #3 N-L17 / I-6).
--
-- RUN THIS ONCE in Supabase Dashboard → SQL Editor on the live project
-- ("yasmines-local-market"). Repo SQL does NOT auto-apply — nothing
-- changes on the live database until Adil runs it there.
-- The same statements are appended to supabase/schema.sql so a fresh
-- database build gets them too.
--
-- Problem: bump_visit(p_day date) is SECURITY DEFINER with no
-- search_path pin and, by default, EXECUTE granted to PUBLIC — so any
-- direct RPC caller holding the anon key could inflate the Visits
-- counter for any date. (The live path, netlify/functions/track.js,
-- passes a server-generated date and is safe; this closes the direct
-- RPC path.)
--
-- Fix: revoke PUBLIC execute, grant execute to service_role only
-- (the Netlify Functions), and pin search_path = public in the
-- function definition so a hostile search_path cannot redirect the
-- unqualified table reference.

revoke execute on function public.bump_visit(date) from public;
grant execute on function public.bump_visit(date) to service_role;

create or replace function public.bump_visit(p_day date)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.page_views (day, views) values (p_day, 1)
  on conflict (day) do update set views = page_views.views + 1
  returning views;
$$;
