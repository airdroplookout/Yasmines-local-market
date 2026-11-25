// Yasmine's Local Market — Netlify Function — Manage "Forgot password?" request.
// POST /api/admin/forgot — no auth, no body needed.
// The reset email goes ONLY to the owner's address (taradil@gmail.com) —
// the requester never supplies a recipient, so this endpoint cannot be
// used to send mail to anyone else. It always answers with the same
// generic message, whether or not a token was created or an email was
// sent, so it never reveals whether a reset is possible.
// One-time token, 30-minute expiry, stored only as a SHA-256 hash in
// the settings table (see createAdminResetToken in _lib.js). Rate-limited
// to 3 requests per hour per site and 1 per hour per IP (audit L-4),
// so the inbox cannot be spammed and one stranger cannot burn the
// owner's recovery budget. A live token is never overwritten: while
// one is unexpired, further requests change nothing (audit H-2 /
// N-L26). If the reset email fails to send, the just-created token is
// deleted so it cannot strand the owner with a link he never got.
// A reset request never touches the login lockout: it must work even
// while the owner is locked out of /api/admin/login, and it must never
// burn lockout attempts.
// If RESEND_API_KEY is not set (no market domain has been bought or
// verified in Resend yet), the email cannot be sent; the failure is
// logged server-side and the generic answer is still returned.
import { json, handlerFor, sendViaResend, siteBaseUrl, createAdminResetToken, getAdminResetTokenRecord, consumeAdminResetToken, checkResetRequestAllowed, OWNER_EMAIL, ADMIN_RESET_TTL_MS } from "./_lib.js";

const SITE_NAME = "Yasmine's Local Market";
const GENERIC = "If a reset email could be sent, check your inbox — the link works once and expires in 30 minutes.";

async function onPost(context) {
  try {
    // Do NOT overwrite a live (unexpired) token (audit H-2 / N-L26):
    // an attacker burning forgot requests must not invalidate the
    // reset link already in the owner's inbox. The raw token is
    // stored only as a hash, so the same link cannot be re-sent from
    // here — but the owner already received it when it was minted,
    // and it stays valid until expiry. A request while a token is
    // live is therefore a no-op: no new token, no new email, and no
    // rate-limit budget burned.
    const existing = await getAdminResetTokenRecord(context);
    if (existing && existing.expires_at && Date.now() < existing.expires_at) {
      return json({ ok: true, message: GENERIC });
    }
    const allowed = await checkResetRequestAllowed(context);
    if (!allowed) return json({ ok: true, message: GENERIC });
    const token = await createAdminResetToken(context);
    const resetUrl = `${siteBaseUrl(context.env)}/manage?reset=${encodeURIComponent(token)}`;
    const minutes = Math.round(ADMIN_RESET_TTL_MS / 60000);
    const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px">
<p>Hi Adil,</p>
<p>Someone asked to reset the Manage password for <strong>${SITE_NAME}</strong>. If that was you, choose a new password here:</p>
<p><a href="${resetUrl}" style="display:inline-block;background:#BC4A24;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new Manage password</a></p>
<p>This link works once and expires in ${minutes} minutes. After you set the new password, every Manage session is logged out and you sign in again with it.</p>
<p>If you did not ask for this, ignore this email — your password has not changed.</p>
</body></html>`;
    try {
      await sendViaResend(context, { to: OWNER_EMAIL, subject: `Reset your Manage password — ${SITE_NAME}`, html });
    } catch (e) {
      // The send failed but a live token now exists that the owner
      // never received. Delete the just-created token so the next
      // request mints a fresh one instead of leaving a dead link
      // behind (audit N-L26). Logged with a marker so the failure is
      // visible in Netlify logs; the caller still gets the generic
      // answer.
      console.error("admin-forgot: RESET EMAIL FAILED — just-created token deleted, owner must request a new link:", String(e.message || e));
      try {
        await consumeAdminResetToken(context);
      } catch (delErr) {
        console.error("admin-forgot: RESET EMAIL FAILED — could not delete unsent token:", String(delErr.message || delErr));
      }
    }
  } catch (e) {
    console.error("admin-forgot:", String(e.message || e));
  }
  return json({ ok: true, message: GENERIC });
}

export const handler = handlerFor({ POST: onPost });
