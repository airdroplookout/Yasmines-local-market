-- Locally Crafted CA — allow "archived" reservation status (Nov 26, 2026).
-- Run ONCE in the Supabase SQL Editor, project yasmines-local-market.
-- Until this runs, the Archive button in Manage → Reservations fails
-- with an error (the old CHECK constraint only allowed
-- new / contacted / done) — nothing is lost, the click just does not
-- take effect. After this runs, Archive works and Restore puts the
-- reservation back to "new".
-- No new column, no data change: only the allowed status values grow.
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('new', 'contacted', 'done', 'archived'));
