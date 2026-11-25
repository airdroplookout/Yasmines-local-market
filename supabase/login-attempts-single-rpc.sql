-- Single-RPC login-attempt counting (audit N-M3, Nov 25 2026).
-- RUN ONCE in Supabase Dashboard -> SQL Editor on the
-- locally-crafted project, AFTER supabase/login-attempts.sql (the
-- login_attempts table must exist first; the table DDL below is
-- repeated with IF NOT EXISTS so this file also works standalone).
-- Deploy the matching function code BEFORE deploying the Netlify
-- Functions that call this RPC — until it exists, wrong-password
-- logins fail closed (500) rather than counting attempts.
--
-- Why: the old recordFailedLogin() made TWO sequential RPC calls
-- (one per budget). If one succeeded and the other failed, the
-- successful increment was already committed and the code then fell
-- back to legacy settings-table state that nothing reads while the
-- table exists — so a broken RPC meant the lockout never engaged.
-- record_login_attempt_both() bumps BOTH budgets inside one
-- transaction: either both counters move or neither does.
--   * Per-IP 5 fails / 15 min is the hard brake; global 30 fails /
--     15 min across all IPs. Attempts left =
--     min(5 - fails, 30 - global_fails).
--   * The global row id '__global__' must match GLOBAL_LOCKOUT_ID in
--     netlify/functions/_lib.js.
--   * Only hashed client ids are stored, never raw IPs.
--   * search_path is pinned (public) — the function is SECURITY
--     DEFINER, so it must not resolve objects from a caller-set path.
-- The old record_login_attempt() function is left in place (it is no
-- longer called by the new code) so a rollback deploy keeps working;
-- it can be dropped once the new path is verified live.
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

create or replace function public.record_login_attempt_both(p_client_id text, p_ip_max_fails integer, p_global_max_fails integer, p_window_ms bigint, p_lockout_ms bigint)
returns table (client_id text, fails integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_global_id text := '__global__';
  v_ip_fails integer;
  v_ip_first timestamptz;
  v_ip_locked timestamptz;
  v_g_fails integer;
  v_g_first timestamptz;
  v_g_locked timestamptz;
begin
  -- Drop stale rows so the table stays tiny (a row is stale once its
  -- window has passed and it is not locked). Never a row being counted.
  delete from public.login_attempts
    where login_attempts.first_at < v_now - p_window_ms * interval '1 millisecond'
      and (login_attempts.locked_until is null or login_attempts.locked_until < v_now)
      and login_attempts.client_id not in (p_client_id, v_global_id);
  -- Per-IP budget: insert-if-absent, then lock this row — concurrent
  -- calls for the same client serialize here, so the increment cannot
  -- undercount.
  insert into public.login_attempts (client_id, fails, first_at, locked_until)
    values (p_client_id, 0, v_now, null)
    on conflict (client_id) do nothing;
  select la.fails, la.first_at, la.locked_until
    into v_ip_fails, v_ip_first, v_ip_locked
    from public.login_attempts la where la.client_id = p_client_id for update;
  if v_now - v_ip_first > p_window_ms * interval '1 millisecond' then
    v_ip_fails := 1;
    v_ip_first := v_now;
    v_ip_locked := null;
  else
    v_ip_fails := v_ip_fails + 1;
    if v_ip_fails >= p_ip_max_fails then
      v_ip_locked := v_now + p_lockout_ms * interval '1 millisecond';
    end if;
  end if;
  update public.login_attempts
    set fails = v_ip_fails, first_at = v_ip_first, locked_until = v_ip_locked
    where login_attempts.client_id = p_client_id;
  -- Global budget: same logic, looser cap, same transaction — either
  -- both counters move or neither does.
  insert into public.login_attempts (client_id, fails, first_at, locked_until)
    values (v_global_id, 0, v_now, null)
    on conflict (client_id) do nothing;
  select la.fails, la.first_at, la.locked_until
    into v_g_fails, v_g_first, v_g_locked
    from public.login_attempts la where la.client_id = v_global_id for update;
  if v_now - v_g_first > p_window_ms * interval '1 millisecond' then
    v_g_fails := 1;
    v_g_first := v_now;
    v_g_locked := null;
  else
    v_g_fails := v_g_fails + 1;
    if v_g_fails >= p_global_max_fails then
      v_g_locked := v_now + p_lockout_ms * interval '1 millisecond';
    end if;
  end if;
  update public.login_attempts
    set fails = v_g_fails, first_at = v_g_first, locked_until = v_g_locked
    where login_attempts.client_id = v_global_id;
  return query select p_client_id, v_ip_fails, v_ip_locked
    union all select v_global_id, v_g_fails, v_g_locked;
end;
$$;
grant execute on function public.record_login_attempt_both(text, integer, integer, bigint, bigint) to service_role;
