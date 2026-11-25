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
//  - sendViaResend() is kept for the forgot-password email only; the
//    reserve form still posts to FormSubmit (see README.md), and no
//    subscriber sends exist on this site.
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
      return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
    }
    try {
      const res = await fn(buildContext(event, getParams));
      const text = await res.text();
      const headers = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      return { statusCode: res.status, headers, body: text };
    } catch (e) {
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: String(e.message || e) }) };
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
// --- Manage login rate limiting ---
// 5 wrong passwords inside 15 minutes locks the admin login out of
// /api/admin/login for 15 minutes — GLOBAL, not per IP: one shared
// budget for the single admin account, so rotating IPs cannot buy
// fresh 5-try budgets. The per-IP limit stays as a second layer.
// State lives in the settings table (key admin_login_lockout) so it
// survives across lambda invocations. Only the IP is stored, hashed —
// never the raw address. The lockout is checked before the password is
// compared, so it cannot be bypassed by switching endpoints:
// /api/admin/login is the only place a password is ever accepted.
// FAIL CLOSED: if the lockout state cannot be read or written, login is
// refused instead of silently letting attempts continue unchecked.
export const LOGIN_MAX_FAILS = 5;
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
  const state = await readLockoutState(context);
  const now = Date.now();
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
function bumpLockoutEntry(entry, now) {
  const e = entry || { fails: 0, first_at: now };
  if (now - (e.first_at || now) > LOGIN_WINDOW_MS) { e.fails = 0; e.first_at = now; delete e.locked_until; }
  e.fails += 1;
  if (e.fails >= LOGIN_MAX_FAILS) e.locked_until = now + LOGIN_LOCKOUT_MS;
  return e;
}
export async function recordFailedLogin(context) {
  const state = await readLockoutState(context);
  const id = loginClientId(context);
  const now = Date.now();
  // Prune per-IP entries older than a day so the row does not grow
  // forever. The global entry is pruned by its own 15-minute window
  // inside bumpLockoutEntry instead, so it is skipped here.
  for (const [k, v] of Object.entries(state)) {
    if (k === GLOBAL_LOCKOUT_ID) continue;
    if (!v || now - (v.first_at || 0) > 24 * 60 * 60 * 1000) delete state[k];
  }
  state[id] = bumpLockoutEntry(state[id], now);
  const global = bumpLockoutEntry(state[GLOBAL_LOCKOUT_ID], now);
  state[GLOBAL_LOCKOUT_ID] = global;
  await writeLockoutState(context, state);
  // Report the stricter of the two budgets, so the "attempts left"
  // message always reflects the global budget an attacker actually faces.
  const fails = Math.max(state[id].fails, global.fails);
  const locked_until = Math.max(state[id].locked_until || 0, global.locked_until || 0) || undefined;
  return { fails, locked_until };
}
export async function clearLoginLockout(context) {
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
// Rolling 1-hour window, max 3 reset requests. Returns true when this
// request may proceed (and records it); false when rate-limited. The
// caller answers with the same generic message either way.
export async function checkResetRequestAllowed(context) {
  const now = Date.now();
  let rec = { window_start: now, count: 0 };
  try {
    const raw = await getSettingValue(context, ADMIN_RESET_REQUESTS_KEY);
    if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") rec = parsed; }
  } catch { /* corrupt row: start a fresh window */ }
  if (now - (rec.window_start || 0) > RESET_WINDOW_MS) rec = { window_start: now, count: 0 };
  if ((rec.count || 0) >= ADMIN_RESET_MAX_PER_HOUR) return false;
  rec.count = (rec.count || 0) + 1;
  await setSettingValue(context, ADMIN_RESET_REQUESTS_KEY, JSON.stringify(rec));
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
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
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
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}
// Listing categories — the owner's words for the market.
export const LISTING_CATEGORIES = ["pottery", "knitting", "jewelry", "candles", "food", "sewing", "other"];
export const LISTING_CATEGORY_LABELS = {
  pottery: "Pottery",
  knitting: "Knitting",
  jewelry: "Jewelry",
  candles: "Candles",
  food: "Food & Honey",
  sewing: "Sewing",
  other: "Other crafts",
};
// Send one email via the Resend Send Email API. Used only by the
// forgot-password flow on this site (the reserve form still posts to
// FormSubmit). Server-side only: RESEND_API_KEY comes from env (Netlify
// Site settings -> Environment variables). From address defaults to
// RESEND_SENDER_EMAIL; until a market domain is bought and verified in
// Resend, the fallback is Resend's test sender (onboarding@resend.dev),
// which only delivers to the Resend account owner's own address
// (taradil@gmail.com) — good for a reset email to the owner, not for
// sending to anyone else.
export async function sendViaResend(context, { to, subject, html }) {
  const apiKey = context.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set — add it in Netlify Site settings -> Environment variables, then redeploy.");
  const from = context.env.RESEND_SENDER_EMAIL || "onboarding@resend.dev";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `Yasmine's Local Market <${from}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
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
// No custom domain yet: the live site is yasmines-local-market.netlify.app.
// Once a domain is bought, set SITE_URL in Netlify to https://<that domain>
// and this value is used as-is.
export function siteBaseUrl(env) {
  const raw = String((env && env.SITE_URL) || "https://yasmines-local-market.netlify.app").trim().replace(/\/+$/, "");
  return raw || "https://yasmines-local-market.netlify.app";
}
