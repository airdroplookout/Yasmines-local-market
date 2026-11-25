-- Login-attempt counting (audit H-3, Nov 25 2026) — atomic, split budgets.
-- RUN ONCE in Supabase Dashboard -> SQL Editor on the
-- yasmines-local-market project, then the atomic lockout takes over
-- automatically (no redeploy needed). Until this runs, the login code
-- falls back to the old settings-table lockout, so login keeps working.
--
-- Why: the old recordFailedLogin() read the lockout row, bumped the
-- counters in memory and wrote the whole row back — parallel wrong
-- passwords could each read the same count and undercount, so the
-- lockout might never engage. And the old global budget (5 fails / 15
-- min across ALL IPs) meant any stranger could lock the owner out with
-- 5 empty POSTs. This fixes both:
--   * record_login_attempt() bumps the counter inside one transaction
--     (insert-if-absent, then SELECT ... FOR UPDATE), so parallel
--     attempts are counted exactly.
--   * Budgets are split: per-IP 5 fails / 15 min is the hard brake, and
--     the global budget is 30 fails / 15 min, so one stranger can no
--     longer lock the owner out on their own.
-- The table holds only hashed client ids (never raw IPs), like the old
-- settings-table state did.
create table if not exists public.login_attempts (
  client_id text primary key,
  fails integer not null default 0,
  first_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table public.login_attempts enable row level security;
-- No public policies: only the service role (Netlify Functions) touches
-- this table. Service role bypasses RLS.
grant select, insert, update, delete on public.login_attempts to service_role;

create or replace function public.record_login_attempt(p_client_id text, p_max_fails integer, p_window_ms bigint, p_lockout_ms bigint)
returns table (fails integer, locked_until timestamptz)
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_fails integer;
  v_first timestamptz;
  v_locked timestamptz;
begin
  -- Drop stale rows so the table stays tiny (a row is stale once its
  -- window has passed and it is not locked). Never the row being counted.
  delete from public.login_attempts
    where first_at < v_now - p_window_ms * interval '1 millisecond'
      and (locked_until is null or locked_until < v_now)
      and client_id <> p_client_id;
  -- Insert-if-absent, then lock this client's row: concurrent calls for
  -- the same client serialize here, so the increment cannot undercount.
  insert into public.login_attempts (client_id, fails, first_at, locked_until)
    values (p_client_id, 0, v_now, null)
    on conflict (client_id) do nothing;
  select la.fails, la.first_at, la.locked_until
    into v_fails, v_first, v_locked
    from public.login_attempts la where la.client_id = p_client_id for update;
  if v_now - v_first > p_window_ms * interval '1 millisecond' then
    v_fails := 1;
    v_first := v_now;
    v_locked := null;
  else
    v_fails := v_fails + 1;
    if v_fails >= p_max_fails then
      v_locked := v_now + p_lockout_ms * interval '1 millisecond';
    end if;
  end if;
  update public.login_attempts
    set fails = v_fails, first_at = v_first, locked_until = v_locked
    where client_id = p_client_id;
  return query select v_fails, v_locked;
end;
$$;
grant execute on function public.record_login_attempt(text, integer, bigint, bigint) to service_role;
