// Netlify Function — Locally Crafted CA maker email confirmation.
// GET /.netlify/functions/verify-submission?token=<raw token>
//   (also reachable as /api/verify-submission once the coordinator adds
//   that redirect to netlify.toml; the direct function URL works now.)
// Public, no admin auth — the token in the maker's own email link IS
// the credential. It finds a PENDING, unverified submission whose
// stored SHA-256 token hash matches and whose 48-hour expiry has not
// passed, marks email_verified=true, and clears the token fields so
// the link is single-use. Every failure answers with the same generic
// message (400), so the endpoint never reveals whether a submission,
// an email address, or a token exists.
// Light rate limit: 10 attempts per hour per IP (same helper as the
// other public endpoints; it fails open on DB error, audit N-L9).
import { createHash } from "node:crypto";
import { json, sbJson, handlerFor, checkPublicRateLimit } from "./_lib.js";

const TOKEN_RE = /^[0-9a-f]{64}$/i;
const GENERIC_FAILURE = "This confirmation link is not valid or has expired.";

async function onGet(context) {
  const allowed = await checkPublicRateLimit(context, "verify-submission", 10, 60 * 60 * 1000);
  if (!allowed) return json({ ok: false, error: "Too many attempts — please try again later." }, 429);
  try {
    const url = new URL(context.request.url);
    const token = String(url.searchParams.get("token") || "").trim();
    if (!TOKEN_RE.test(token)) return json({ ok: false, error: GENERIC_FAILURE }, 400);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const rows = await sbJson(context,
      `product_submissions?select=id,verify_expires_at&verify_token_hash=eq.${encodeURIComponent(tokenHash)}&status=eq.pending&email_verified=eq.false&limit=1`);
    const sub = rows[0];
    if (!sub) return json({ ok: false, error: GENERIC_FAILURE }, 400);
    if (!sub.verify_expires_at || Date.parse(sub.verify_expires_at) <= Date.now()) {
      return json({ ok: false, error: GENERIC_FAILURE }, 400);
    }
    // Conditional PATCH: only a still-pending, still-unverified row is
    // marked. 0 rows affected means a parallel confirmation already
    // consumed this token — answer the same generic failure.
    const done = await sbJson(context,
      `product_submissions?id=eq.${encodeURIComponent(sub.id)}&status=eq.pending&email_verified=eq.false`, {
        method: "PATCH",
        body: JSON.stringify({ email_verified: true, verify_token_hash: null, verify_expires_at: null }),
      });
    if (!Array.isArray(done) || done.length === 0) {
      return json({ ok: false, error: GENERIC_FAILURE }, 400);
    }
    return json({ ok: true, message: "Email confirmed — thank you. The market owner will now review your product." });
  } catch (e) {
    // Same generic answer on DB errors: no oracle about which
    // submissions exist. The real error is only in the server log.
    console.error("verify-submission failed:", String(e.message || e));
    return json({ ok: false, error: GENERIC_FAILURE }, 400);
  }
}

export const handler = handlerFor({ GET: onGet });
