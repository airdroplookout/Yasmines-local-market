// Shared helpers for Netlify Functions — Yasmine's Local Market.
// Adapted from velvet-pearl-repo (Nov 2026), same security patterns:
// password login with 5-wrong 15-min lockout + 429, 30-day HMAC session,
// session-version revocation/logout-all, forgot-password + reset.
// What changed vs Velvet & Pearl:
//  - No newsletter, no ads table: makers + listings + reservations.
//  - siteBaseUrl() default is https://yasmines-local-market.netlify.app
//    (no custom domain yet).
//  - loginClientId() HMAC fallback secret changed to
//    "yasmines-local-market".
//  - sendViaResend() is used by the forgot-password flow and by the
//    server-side owner emails (reserve, contact, product submissions),
//    which replaced the old browser FormSubmit posts (audit N-M4, Nov 25 2026).
// Server-side only. Secrets come from process.env (Netlify Site settings
// -> Environment variables), never from the browser.
//
// Netlify classic handler shape: each endpoint file exports
//   export const handler = handlerFor({ GET: ..., POST: ..., ... })
// handlerFor builds a Cloudflare-style `context` ({ request, env, params })
// from the Netlify `event`, calls the method handler, and converts the
// returned Response into Netlify's { statusCode, headers, body } shape.
import { createHmac, timingSafeEqual, scryptSync, randomBytes, createHash } from "node:crypto";
// Escape text interpolated into HTML (email body, and anywhere else
// server-rendered HTML is built).
export function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
// --- Lightweight per-IP rate limiting for public endpoints (audit M-1) ---
// State lives in the settings table (same pattern as the login lockout),
// keyed by a hashed client id so no raw IP is ever stored. Fail-OPEN on
// DB errors: a broken counter must never block a genuine reservation.
const RATE_PREFIX = "rate_";
export function publicClientId(context) {
  const h = context.request.headers;
  const ip = h.get("x-nf-client-connection-ip")
    || (h.get("x-forwarded-for") || "").split(",")[0].trim()
    || "unknown";
  return createHmac("sha256", context.env.ADMIN_API_KEY || "yasmines-local-market").update(ip).digest("hex").slice(0, 16);
}
export async function checkPublicRateLimit(context, scope, max, windowMs) {
  const key = `${RATE_PREFIX}${scope}_${publicClientId(context)}`;
  const now = Date.now();
  try {
    let rec = { window_start: now, count: 0 };
    const rows = await sbJson(context, `settings?select=value&key=eq.${key}&limit=1`);
    if (rows[0]?.value) { const parsed = JSON.parse(rows[0].value); if (parsed && typeof parsed === "object") rec = parsed; }
    if (now - (rec.window_start || 0) > windowMs) rec = { window_start: now, count: 0 };
    if ((rec.count || 0) >= max) return false;
    rec.count = (rec.count || 0) + 1;
    await setSettingValue(context, key, JSON.stringify(rec));
    return true;
  } catch (e) { console.error("rate-limit check failed (fail-open):", String(e.message || e)); return true; }
}
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin" } });
}

function buildContext(event, getParams) {
  const query = event.queryStringParameters || {};
  const qs = new URLSearchParams(query).toString();
  const path = event.path || "/";
  const url = `https://${(event.headers && (event.headers.host || event.headers.Host)) || "localhost"}${path}${qs ? `?${qs}` : ""}`;
  const headers = new Headers(event.headers || {});
  const method = event.httpMethod || "GET";
  let body;
  if (event.body && method !== "GET" && method !== "HEAD") {
    body = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;
  }
  const request = new Request(url, { method, headers, body });
  return { request, env: process.env, params: getParams ? getParams(event, query) : {} };
}

export function handlerFor(methods, getParams) {
  return async (event) => {
    const fn = methods[event.httpMethod];
    if (!fn) {
      return { statusCode: 405, headers: { "content-type": "application/json", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
    }
    try {
      const res = await fn(buildContext(event, getParams));
      const text = await res.text();
      const headers = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      return { statusCode: res.status, headers, body: text };
    } catch (e) {
      console.error("function error:", e);
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "Server error" }) };
    }
  };
}

export async function isAdmin(context) {
  const req = context.request;
  const key = req.headers.get("x-admin-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = context.env.ADMIN_API_KEY;
  // The long admin key (weekly script, stored connector) is checked first
  // and needs no database round-trip. Sessions are checked second.
  if (expected && key && timingSafeCompare(key, expected)) return true;
  // Or a Manage session token (from POST /api/admin/login with the
  // ADMIN_PASSWORD). See createAdminSession / verifyAdminSession below.
  const session = req.headers.get("x-admin-session") || "";
  return Boolean(session && (await verifyAdminSession(context, session)));
}
export async function requireAdmin(context) {
  if (!(await isAdmin(context))) return json({ ok: false, error: "unauthorized — valid admin login required" }, 401);
  return null;
}
// --- Manage password sessions (no database, no stored token) ---
// Token format: base64url("admin:<version>").<expiry-ms>.<hmac-hex>
// The HMAC is over "<payload>.<expiry>" keyed by ADMIN_API_KEY, so a token
// is only valid if it was minted by this server, and only until expiry.
// Sessions last 30 days; logging in again mints a fresh one.
// The <version> is the admin_session_version row in the settings table
// (default 1). POST /api/admin/logout-all bumps it, which instantly
// invalidates every session on every device — the revocation the
// 30-day token on its own did not have. Tokens minted before versioning
// carry payload "admin" and count as version 1.
export const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_PAYLOAD = "admin";
const SESSION_VERSION_KEY = "admin_session_version";
function b64url(s) { return Buffer.from(s, "utf8").toString("base64url"); }
function signSession(secret, payloadB64, expiry) {
  return createHmac("sha256", secret).update(`${payloadB64}.${expiry}`).digest("hex");
}
export async function getSessionVersion(context) {
  const rows = await sbJson(context, `settings?select=value&key=eq.${SESSION_VERSION_KEY}&limit=1`);
  const v = parseInt(rows[0]?.value || "1", 10);
  return Number.isFinite(v) && v >= 1 ? v : 1;
}
export function createAdminSession(env, version) {
  const expiry = Date.now() + ADMIN_SESSION_TTL_MS;
  const payloadB64 = b64url(`${SESSION_PAYLOAD}:${version}`);
  return { token: `${payloadB64}.${expiry}.${signSession(env.ADMIN_API_KEY, payloadB64, expiry)}`, expires_at: new Date(expiry).toISOString() };
}
export async function verifyAdminSession(context, token) {
  try {
    const secret = context.env.ADMIN_API_KEY;
    if (!secret || typeof token !== "string") return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [payloadB64, expiryStr, sig] = parts;
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const [kind, verStr] = payload.split(":");
    if (kind !== SESSION_PAYLOAD) return false;
    const version = verStr === undefined ? 1 : parseInt(verStr, 10);
    if (!Number.isFinite(version)) return false;
    const expiry = Number(expiryStr);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
    const expected = signSession(secret, payloadB64, expiry);
    if (!timingSafeCompare(sig, expected)) return false;
    // Revocation check: the token's version must match the current one.
    // If the settings table cannot be read, fail closed — a session is
    // not honoured on a guess.
    const current = await getSessionVersion(context);
    return version === current;
  } catch { return false; }
}
// --- Unsubscribe tokens (newsletter, Nov 26 2026) ---
// One signed link per subscriber, put in every newsletter email. The
// token proves the clicker owns that email address (it was sent to it),
// so GET /unsubscribe accepts a token — never a bare email, which
// anyone could submit for anyone else. No expiry: links in old issues
// must keep working. The HMAC is keyed by ADMIN_API_KEY, server-side
// only (same secret the admin sessions use). No database column is
// needed: the email is inside the signed payload. Mirrors the
// createUnsubscribeToken / verifyUnsubscribeToken pair on AI Outlet
// Plus. If ADMIN_API_KEY is ever rotated, links sent before the
// rotation stop working and the next issue's links replace them.
const UNSUB_PREFIX = "unsub";
export function createUnsubscribeToken(env, email) {
  const clean = String(email || "").trim().toLowerCase();
  const payloadB64 = b64url(`${UNSUB_PREFIX}:${clean}`);
  const sig = createHmac("sha256", env.ADMIN_API_KEY).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}
export function verifyUnsubscribeToken(env, token) {
  try {
    if (!env.ADMIN_API_KEY || typeof token !== "string") return null;
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;
    const expected = createHmac("sha256", env.ADMIN_API_KEY).update(payloadB64).digest("hex");
    if (!timingSafeCompare(sig, expected)) return null;
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const [kind, email] = payload.split(":");
    if (kind !== UNSUB_PREFIX || !validEmail(email)) return null;
    return email;
  } catch { return null; }
}
// --- Manage login rate limiting ---
// Two budgets (audit H-3, Nov 25 2026):
//  - PER-IP: 5 wrong passwords inside 15 minutes locks that IP out for
//    15 minutes — the hard brake against guessing.
//  - GLOBAL: 30 wrong passwords inside 15 minutes across ALL IPs —
//    much looser than the old 5, so a single stranger can no longer lock
//    the owner out with 5 empty POSTs.
// Counting is ATOMIC: recordLoginAttemptsRpc() bumps BOTH budgets in
// one Postgres transaction (record_login_attempt_both() in
// supabase/login-attempts-single-rpc.sql), so parallel wrong passwords
// can no longer undercount the way the old settings-table
// read-modify-write did, and a failed attempt can never be
// half-counted (audit N-M3: the old code made two sequential RPC calls
// and fell back to a legacy store nothing read when only one failed).
// Rollout rule — the legacy settings-table state (key
// admin_login_lockout) applies ONLY while the login_attempts table
// does not exist yet (owner has not run supabase/login-attempts.sql).
// Once the table exists, the atomic path is the only path: if the RPC
// then fails (function dropped, grant revoked), recordFailedLogin
// throws and login is refused (500) instead of falling back to legacy
// state nothing reads. Deploy order matters: run
// supabase/login-attempts-single-rpc.sql BEFORE deploying this code,
// or wrong-password logins 500 until it is run (correct-password
// logins are unaffected — only recordFailedLogin needs the RPC).
// State lives in the settings table in the legacy path so it survives
// across lambda invocations. Only the IP is stored, hashed — never the
// raw address. The lockout is checked before the password is compared, so it cannot be bypassed by switching
// endpoints: /api/admin/login is the only place a password is ever
// accepted.
// FAIL CLOSED: if the lockout state cannot be read or written, login is
// refused instead of silently letting attempts continue unchecked.
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_GLOBAL_MAX_FAILS = 30;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_KEY = "admin_login_lockout";
const GLOBAL_LOCKOUT_ID = "__global__";
function loginClientId(context) {
  const h = context.request.headers;
  const ip = h.get("x-nf-client-connection-ip")
    || (h.get("x-forwarded-for") || "").split(",")[0].trim()
    || "unknown";
  return createHmac("sha256", context.env.ADMIN_API_KEY || "yasmines-local-market").update(ip).digest("hex").slice(0, 16);
}
// One atomic increment of BOTH budgets via the
// record_login_attempt_both() Postgres function: a single RPC call
// bumps the per-IP row and the global row inside one transaction, so
// an attempt is never half-counted (audit N-M3). Returns
// { fails, global_fails, locked_until } or null when the call fails —
// the caller must then FAIL CLOSED (throw), never fall back to legacy
// state, when the login_attempts table exists.
// The global row id "__global__" must match GLOBAL_LOCKOUT_ID below
// and the v_global_id constant inside record_login_attempt_both().
async function recordLoginAttemptsRpc(context, clientId) {
  try {
    const rows = await sbJson(context, "rpc/record_login_attempt_both", {
      method: "POST",
      body: JSON.stringify({ p_client_id: clientId, p_ip_max_fails: LOGIN_MAX_FAILS, p_global_max_fails: LOGIN_GLOBAL_MAX_FAILS, p_window_ms: LOGIN_WINDOW_MS, p_lockout_ms: LOGIN_LOCKOUT_MS }),
    });
    if (!Array.isArray(rows)) return null;
    const ip = rows.find((r) => r.client_id === clientId);
    const global = rows.find((r) => r.client_id === GLOBAL_LOCKOUT_ID);
    if (!ip || !global || typeof ip.fails !== "number" || typeof global.fails !== "number") return null;
    const locked_until = Math.max(ip.locked_until ? Date.parse(ip.locked_until) : 0, global.locked_until ? Date.parse(global.locked_until) : 0) || undefined;
    return { fails: ip.fails, global_fails: global.fails, locked_until };
  } catch { return null; }
}
// True when the login_attempts table exists, false when it does not
// exist yet (fresh rollout — the legacy fallback is allowed), and
// throws on any other error (wrong key, Supabase down, ...). A missing
// table is a 404 from PostgREST; anything else must fail closed rather
// than silently disabling the lockout.
async function loginAttemptsTableExists(context) {
  const r = await sb(context, "login_attempts?select=client_id&limit=1");
  await r.text();
  if (r.ok) return true;
  if (r.status === 404) return false;
  throw new Error(`Supabase ${r.status} reading login_attempts`);
}
// Read both lockout rows from the login_attempts table. Callers check
// loginAttemptsTableExists() first, so this runs only when the table
// exists — and a read failure here THROWS (fail closed) instead of
// returning null and silently falling back to legacy state nothing
// reads (audit N-M3). Only hashed client ids are stored, never raw IPs.
async function readLoginAttempts(context) {
  const ids = `${loginClientId(context)},${GLOBAL_LOCKOUT_ID}`;
  const rows = await sbJson(context, `login_attempts?select=client_id,fails,locked_until&client_id=in.(${ids})`);
  if (!Array.isArray(rows)) throw new Error("login_attempts read returned no rows");
  const out = {};
  for (const r of rows) {
    out[r.client_id] = { fails: r.fails, locked_until: r.locked_until ? Date.parse(r.locked_until) : undefined };
  }
  return out;
}
async function readLockoutState(context) {
  // Throws on read failure instead of returning an empty state: a
  // failed read must fail closed (refuse login), never silently reset
  // the failure budget to zero.
  const rows = await sbJson(context, `settings?select=value&key=eq.${LOGIN_LOCKOUT_KEY}&limit=1`);
  const state = JSON.parse(rows[0]?.value || "{}");
  return (state && typeof state === "object") ? state : {};
}
async function writeLockoutState(context, state) {
  await sbJson(context, "settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key: LOGIN_LOCKOUT_KEY, value: JSON.stringify(state) }),
  });
}
export async function checkLoginAllowed(context) {
  const now = Date.now();
  // Legacy fallback ONLY when the table does not exist yet (fresh
  // rollout). When it exists, readLoginAttempts() throws on failure
  // and login is refused — never legacy state (audit N-M3).
  if (!(await loginAttemptsTableExists(context))) {
    const state = await readLockoutState(context);
    const global = state[GLOBAL_LOCKOUT_ID];
    if (global && global.locked_until && now < global.locked_until) {
      return { allowed: false, retry_after_ms: global.locked_until - now };
    }
    const entry = state[loginClientId(context)];
    if (entry && entry.locked_until && now < entry.locked_until) {
      return { allowed: false, retry_after_ms: entry.locked_until - now };
    }
    return { allowed: true };
  }
  const attempts = await readLoginAttempts(context);
  for (const id of [GLOBAL_LOCKOUT_ID, loginClientId(context)]) {
    const entry = attempts[id];
    if (entry && entry.locked_until && now < entry.locked_until) {
      return { allowed: false, retry_after_ms: entry.locked_until - now };
    }
  }
  return { allowed: true };
}
function bumpLockoutEntry(entry, now, maxFails = LOGIN_MAX_FAILS) {
  const e = entry || { fails: 0, first_at: now };
  if (now - (e.first_at || now) > LOGIN_WINDOW_MS) { e.fails = 0; e.first_at = now; delete e.locked_until; }
  e.fails += 1;
  if (e.fails >= maxFails) e.locked_until = now + LOGIN_LOCKOUT_MS;
  return e;
}
export async function recordFailedLogin(context) {
  const id = loginClientId(context);
  // Atomic path: ONE RPC call bumps BOTH budgets in a single
  // transaction (audit N-M3). If the table exists but the RPC fails,
  // FAIL CLOSED — throw, so the caller refuses the login (500).
  // Falling back to the legacy settings state would write to a store
  // nothing reads while the table exists, silently disabling the
  // lockout. The legacy path below runs ONLY when the table does not
  // exist yet (fresh rollout, login-attempts.sql not run).
  if (await loginAttemptsTableExists(context)) {
    const result = await recordLoginAttemptsRpc(context, id);
    if (!result) throw new Error("record_login_attempt_both failed while login_attempts exists");
    return result;
  }
  const state = await readLockoutState(context);
  const now = Date.now();
  // Prune per-IP entries older than a day so the row does not grow
  // forever. The global entry is pruned by its own 15-minute window
  // inside bumpLockoutEntry instead, so it is skipped here.
  for (const [k, v] of Object.entries(state)) {
    if (k === GLOBAL_LOCKOUT_ID) continue;
    if (!v || now - (v.first_at || 0) > 24 * 60 * 60 * 1000) delete state[k];
  }
  state[id] = bumpLockoutEntry(state[id], now, LOGIN_MAX_FAILS);
  const legacyGlobal = bumpLockoutEntry(state[GLOBAL_LOCKOUT_ID], now, LOGIN_GLOBAL_MAX_FAILS);
  state[GLOBAL_LOCKOUT_ID] = legacyGlobal;
  await writeLockoutState(context, state);
  // Per-IP fails and global fails are reported separately, so the
  // "attempts left" message is min(5 - fails, 30 - global_fails).
  const locked_until = Math.max(state[id].locked_until || 0, legacyGlobal.locked_until || 0) || undefined;
  return { fails: state[id].fails, global_fails: legacyGlobal.fails, locked_until };
}
export async function clearLoginLockout(context) {
  // Same rollout rule as the rest of the lockout (audit N-M3): the
  // login_attempts table is the live store once it exists, so a delete
  // failure there THROWS instead of silently leaving a lockout in
  // place. The legacy settings state is still cleared too, so a later
  // rollback to the legacy path cannot resurrect a stale lockout.
  // Throws propagate to the caller: admin-reset aborts with 500 and
  // leaves the reset token live (audit L-5); admin-login only calls
  // this after a successful password check.
  if (await loginAttemptsTableExists(context)) {
    const ids = `${loginClientId(context)},${GLOBAL_LOCKOUT_ID}`;
    await sbJson(context, `login_attempts?client_id=in.(${ids})`, { method: "DELETE" });
  }
  const state = await readLockoutState(context);
  delete state[loginClientId(context)];
  delete state[GLOBAL_LOCKOUT_ID];
  await writeLockoutState(context, state);
}
// --- Manage "Forgot password?" flow ---
// The owner is the only admin, and the reset email goes ONLY to his
// address (taradil@gmail.com) — the requester never supplies a
// recipient, so the endpoint cannot be used to send mail to anyone
// else. One-time token, 30-minute expiry, stored only as a SHA-256
// hash in the settings table (key admin_reset_token), deleted on first
// use. Reset requests are rate-limited to 3 per hour per site (key
// admin_reset_requests) so the inbox cannot be spammed. A reset
// request never touches the login lockout: it must work even while the
// owner is locked out of /api/admin/login, and it must never burn
// lockout attempts. The forgot/reset endpoints always answer with the
// same generic message, so they never reveal whether a token or an
// email address is valid.
// The admin password itself can live in the database as a scrypt hash
// (key admin_password_hash). The ADMIN_PASSWORD env var stays as a
// FALLBACK while no database password exists, so the current password
// keeps working and this change can never lock the owner out. Once a
// database password is set, it is the only password that works.
export const OWNER_EMAIL = "taradil@gmail.com";
const ADMIN_PASSWORD_HASH_KEY = "admin_password_hash";
const ADMIN_RESET_TOKEN_KEY = "admin_reset_token";
const ADMIN_RESET_REQUESTS_KEY = "admin_reset_requests";
export const ADMIN_RESET_TTL_MS = 30 * 60 * 1000;
export const ADMIN_RESET_MAX_PER_HOUR = 3;
const RESET_WINDOW_MS = 60 * 60 * 1000;
export const ADMIN_PASSWORD_MIN_LENGTH = 8;

async function getSettingValue(context, key) {
  const rows = await sbJson(context, `settings?select=value&key=eq.${key}&limit=1`);
  return rows[0]?.value ?? null;
}
async function setSettingValue(context, key, value) {
  await sbJson(context, "settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key, value }),
  });
}
async function deleteSettingValue(context, key) {
  await sbJson(context, `settings?key=eq.${key}`, { method: "DELETE" });
}
export function hashAdminPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
export function verifyAdminPasswordHash(password, stored) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const derived = scryptSync(password, parts[1], 64);
    const expected = Buffer.from(parts[2], "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch { return false; }
}
// True when a Manage password is configured at all (database hash or
// ADMIN_PASSWORD env var). Throws when the settings table cannot be
// read, so the caller fails closed instead of guessing.
export async function adminPasswordConfigured(context) {
  const stored = await getSettingValue(context, ADMIN_PASSWORD_HASH_KEY);
  if (stored) return true;
  return Boolean(context.env.ADMIN_PASSWORD);
}
// "ok" | "wrong" | "not-set". The database hash wins when one exists;
// otherwise the ADMIN_PASSWORD env var is the fallback. Throws when
// the settings table cannot be read, so login fails closed.
export async function checkAdminPassword(context, given) {
  const stored = await getSettingValue(context, ADMIN_PASSWORD_HASH_KEY);
  if (stored) return verifyAdminPasswordHash(given, stored) ? "ok" : "wrong";
  const envPassword = context.env.ADMIN_PASSWORD;
  if (!envPassword) return "not-set";
  return timingSafeCompare(given, envPassword) ? "ok" : "wrong";
}
export async function setAdminPasswordHash(context, password) {
  await setSettingValue(context, ADMIN_PASSWORD_HASH_KEY, hashAdminPassword(password));
}
// Create a one-time reset token and store only its SHA-256 hash plus
// expiry. The raw token is returned to the caller (it goes into the
// email link); it is never stored.
export async function createAdminResetToken(context) {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const record = { hash, expires_at: Date.now() + ADMIN_RESET_TTL_MS, created_at: Date.now() };
  await setSettingValue(context, ADMIN_RESET_TOKEN_KEY, JSON.stringify(record));
  return token;
}
// The stored reset record (hash + expiry), or null when none exists
// or the stored row is corrupt. Exported so admin-forgot can tell a
// live token from an expired one. The raw token is never stored —
// only its SHA-256 hash — so a live token cannot be re-sent from
// here; see admin-forgot.js for why that matters.
export async function getAdminResetTokenRecord(context) {
  const raw = await getSettingValue(context, ADMIN_RESET_TOKEN_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    return (record && typeof record === "object") ? record : null;
  } catch { return null; }
}
export async function verifyAdminResetToken(context, token) {
  try {
    if (typeof token !== "string" || !token) return false;
    const raw = await getSettingValue(context, ADMIN_RESET_TOKEN_KEY);
    if (!raw) return false;
    const record = JSON.parse(raw);
    if (!record || typeof record !== "object") return false;
    if (!record.hash || !record.expires_at || Date.now() > record.expires_at) return false;
    const givenHash = createHash("sha256").update(token).digest("hex");
    return timingSafeCompare(givenHash, record.hash);
  } catch { return false; }
}
export async function consumeAdminResetToken(context) {
  await deleteSettingValue(context, ADMIN_RESET_TOKEN_KEY);
}
// Rolling 1-hour window, max 3 reset requests site-wide AND max 1 per
// IP (audit L-4: one stranger must not burn the owner's only recovery
// path). Returns true when this request may proceed (and records it
// on both budgets); false when rate-limited. The caller answers with
// the same generic message either way.
// Residual race (same class as audit N-L22): both budgets are
// read-modify-write in the settings table, so two parallel requests
// from one IP can both read count 0 and both pass. The window is
// small and the damage is capped at one extra email per race.
const ADMIN_RESET_REQUESTS_IP_PREFIX = "admin_reset_requests_ip_";
export const ADMIN_RESET_MAX_PER_HOUR_PER_IP = 1;
async function readHourlyCounter(context, key, now) {
  let rec = { window_start: now, count: 0 };
  try {
    const raw = await getSettingValue(context, key);
    if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") rec = parsed; }
  } catch { /* corrupt row: start a fresh window */ }
  if (now - (rec.window_start || 0) > RESET_WINDOW_MS) rec = { window_start: now, count: 0 };
  return rec;
}
export async function checkResetRequestAllowed(context) {
  const now = Date.now();
  // Read both budgets before bumping either, so a request blocked by
  // one budget does not burn a slot on the other.
  const siteRec = await readHourlyCounter(context, ADMIN_RESET_REQUESTS_KEY, now);
  const ipKey = `${ADMIN_RESET_REQUESTS_IP_PREFIX}${loginClientId(context)}`;
  const ipRec = await readHourlyCounter(context, ipKey, now);
  if ((siteRec.count || 0) >= ADMIN_RESET_MAX_PER_HOUR) return false;
  if ((ipRec.count || 0) >= ADMIN_RESET_MAX_PER_HOUR_PER_IP) return false;
  siteRec.count = (siteRec.count || 0) + 1;
  ipRec.count = (ipRec.count || 0) + 1;
  await setSettingValue(context, ADMIN_RESET_REQUESTS_KEY, JSON.stringify(siteRec));
  await setSettingValue(context, ipKey, JSON.stringify(ipRec));
  return true;
}
// Revoke every Manage session (bumps admin_session_version, as
// POST /api/admin/logout-all does) — used after a password reset so a
// stolen old session cannot keep working under the new password.
export async function bumpAdminSessionVersion(context) {
  const current = await getSessionVersion(context);
  const next = current + 1;
  await setSettingValue(context, "admin_session_version", String(next));
  return next;
}
// Constant-time string comparison (for passwords and tokens). Never use
// === for secrets: it leaks how many leading characters matched.
export function timingSafeCompare(a, b) {
  // Hash both sides first so differing lengths do not short-circuit and
  // leak the expected value's length via timing (audit I-4).
  const da = createHash("sha256").update(String(a ?? ""), "utf8").digest();
  const db = createHash("sha256").update(String(b ?? ""), "utf8").digest();
  return timingSafeEqual(da, db);
}
export function sb(context, path, opts = {}) {
  // Supabase REST via the service-role key (bypasses RLS, server-side only).
  const url = `${context.env.SUPABASE_URL}/rest/v1/${path}`;
  return fetch(url, {
    ...opts,
    headers: {
      apikey: context.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${context.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
}
export async function sbJson(context, path, opts = {}) {
  const r = await sb(context, path, opts);
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    console.error("Supabase error:", r.status, typeof data === "string" ? data : JSON.stringify(data));
    throw new Error("Server error");
  }
  return data;
}
// Listing categories — the owner's words for the market.
// Fixed list (Nov 25, 2026): makers pick one of these, no free text.
export const LISTING_CATEGORIES = ["pottery", "jewelry", "homeware", "textiles", "art", "cards-stationery", "clothing-accessories", "weddings", "craft-supplies", "christmas-gifts", "other"];
export const LISTING_CATEGORY_LABELS = {
  pottery: "Pottery",
  jewelry: "Jewelry",
  homeware: "Homeware",
  textiles: "Textiles",
  art: "Art",
  "cards-stationery": "Cards & Stationery",
  "clothing-accessories": "Clothing & Accessories",
  weddings: "Weddings",
  "craft-supplies": "Craft Supplies",
  "christmas-gifts": "Christmas Gifts",
  other: "Other",
};
// Send one email via the Resend Send Email API. Used by the
// forgot-password flow and by the server-side owner emails (reserve,
// contact, product submissions). Server-side only: RESEND_API_KEY comes
// from env (Netlify Site settings -> Environment variables). From address
// defaults to RESEND_SENDER_EMAIL; until a market domain is bought and
// verified in Resend, the fallback is Resend's test sender
// (onboarding@resend.dev), which only delivers to the Resend account
// owner's own address — good for a reset email to the owner, not for
// sending to anyone else.
export async function sendViaResend(context, { to, subject, html, attachments }) {
  const apiKey = context.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set — add it in Netlify Site settings -> Environment variables, then redeploy.");
  const from = context.env.RESEND_SENDER_EMAIL || "onboarding@resend.dev";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `Locally Crafted CA <${from}>`,
      to: [to],
      subject,
      html,
      ...(attachments && attachments.length ? { attachments } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}
// Owner notification email: same Resend send, always to the owner's
// address (OWNER_EMAIL) — the caller never supplies a recipient, so a
// public endpoint cannot be used to send mail to anyone else.
export async function sendOwnerEmail(context, subject, html) {
  return sendViaResend(context, { to: OWNER_EMAIL, subject, html });
}
// Real email format only, max 50 characters (owner's rule, Nov 23 2026):
// letters/digits and . _ % + - before the @, a domain with at least one dot.
// Rejects script tags, spaces, and oversized input before anything is stored.
export function validEmail(e) {
  const s = String(e || "").trim().toLowerCase();
  if (s.length < 5 || s.length > 50) return false;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s);
}
// Today's date (YYYY-MM-DD) in the owner's timezone — the Visits card
// counts by Toronto days, not UTC days, so "Today" matches what Adil sees.
export function torontoToday(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const o = {}; for (const x of p) o[x.type] = x.value;
  return `${o.year}-${o.month}-${o.day}`;
}
export function addDaysIso(iso, n) {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
// Canonical public base URL for links readers see (reset link).
// Custom domain is live: locallycrafted.ca. Set SITE_URL in Netlify
// to https://locallycrafted.ca and this value is used as-is.
export function siteBaseUrl(env) {
  const raw = String((env && env.SITE_URL) || "https://locallycrafted.ca").trim().replace(/\/+$/, "");
  return raw || "https://locallycrafted.ca";
}
