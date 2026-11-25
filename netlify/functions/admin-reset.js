// Yasmine's Local Market — Netlify Function — Manage password reset.
// POST /api/admin/reset — body { token, password }.
// Verifies the one-time token (hash + 30-minute expiry), sets the new
// Manage password as a database hash, clears the login lockout, revokes
// every existing Manage session (the owner logs in again with the new
// password on every device), and consumes the token LAST. If any step
// before consume fails, the token stays live so the owner can retry
// (audit H-2); a failure to clear the lockout or revoke sessions aborts
// with 500 instead of being swallowed (audit L-5).
// Never touches the lockout budget for bad tokens, and never reveals
// whether a token is valid: every bad, expired or already-used token
// gets the same message. A too-short password is rejected without
// consuming the token, so the owner can retry within the 30 minutes.
import { json, handlerFor, verifyAdminResetToken, consumeAdminResetToken, setAdminPasswordHash, clearLoginLockout, bumpAdminSessionVersion, checkPublicRateLimit, ADMIN_PASSWORD_MIN_LENGTH } from "./_lib.js";

const BAD_TOKEN = "This reset link is invalid or has expired. Ask for a new one from the Manage sign-in page.";

async function onPost(context) {
  const body = await context.request.json().catch(() => ({}));
  // Rate limit: 10 reset attempts per hour per IP (audit M-1).
  const allowed = await checkPublicRateLimit(context, "reset", 10, 60 * 60 * 1000);
  if (!allowed) return json({ ok: false, error: "Too many attempts — please try again later." }, 429);
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) return json({ ok: false, error: BAD_TOKEN }, 400);
  let valid = false;
  try { valid = await verifyAdminResetToken(context, token); } catch { valid = false; }
  if (!valid) return json({ ok: false, error: BAD_TOKEN }, 400);
  if (!password || password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return json({ ok: false, error: `Choose a password of at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.` }, 400);
  }
  // Token is valid and the password is acceptable. Order matters
  // (audit H-2): set the password hash FIRST, then clear the lockout
  // and revoke every session, and consume (delete) the token LAST.
  // If any step before consume fails, the request 500s and the token
  // stays live, so the owner can retry within the 30 minutes instead
  // of spending another forgot request. A failure in clearLoginLockout
  // or bumpAdminSessionVersion is NOT swallowed (audit L-5): it aborts
  // the reset, because a password change that left the old lockout or
  // old sessions in place must not report success. (If consume itself
  // fails after the password changed, the token stays live; retrying
  // the same link then simply re-sets the same password — safe.)
  try {
    await setAdminPasswordHash(context, password);
    await clearLoginLockout(context);
    await bumpAdminSessionVersion(context);
    await consumeAdminResetToken(context);
  } catch (e) {
    console.error("admin-reset: password reset failed, token left live for retry:", String(e.message || e));
    return json({ ok: false, error: "Could not change the password — please try again in a few minutes." }, 500);
  }
  return json({ ok: true });
}

export const handler = handlerFor({ POST: onPost });
