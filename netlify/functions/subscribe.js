// Netlify Function — Locally Crafted CA newsletter signup.
// POST /api/subscribe — { email, _honey }.
// Server-side only (audit N-M4: no FormSubmit, no owner address in
// public source). Order mirrors the other public endpoints:
// honeypot first (fake success, nothing saved), then the 5/hour/IP
// rate limit, then validation, then the insert.
// Email rule (owner, Nov 23 2026): real email format, max 50 chars.
// A duplicate address answers { ok: true } without changing anything
// and without revealing whether it was already on the list.
// Rate limiting uses the shared checkPublicRateLimit helper: on a DB
// error it logs and fails open (same as reserve/contact/submit) — the
// failure is logged, never silent.
import { json, handlerFor, validEmail, checkPublicRateLimit, sbJson } from "./_lib.js";

async function onPost(context) {
  let b = {};
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "invalid body" }, 400);

  // Honeypot (audit N-M1): bots fill the hidden _honey field. Smile and
  // pretend it worked — fake success, nothing saved.
  if (String(b._honey || "").trim()) return json({ ok: true });

  // Rate limit: 5 signups per hour per IP.
  const allowed = await checkPublicRateLimit(context, "subscribe", 5, 60 * 60 * 1000);
  if (!allowed) return json({ ok: false, error: "Too many signups — please try again later." }, 429);

  const email = String(b.email ?? "").trim().toLowerCase();
  if (!validEmail(email)) return json({ ok: false, error: "Please enter a real email address (at most 50 characters)." }, 400);

  try {
    const existing = await sbJson(context, `subscribers?email=eq.${encodeURIComponent(email)}&limit=1`);
    if (existing[0]) return json({ ok: true });
    try {
      await sbJson(context, "subscribers", {
        method: "POST",
        body: JSON.stringify({ email, status: "active", source: "website" }),
      });
    } catch (insertErr) {
      // Unique-violation race (two signups for the same address at once):
      // if the row is there now, the signup still counts as done.
      const again = await sbJson(context, `subscribers?email=eq.${encodeURIComponent(email)}&limit=1`).catch(() => []);
      if (again[0]) return json({ ok: true });
      throw insertErr;
    }
    return json({ ok: true });
  } catch (e) {
    // Missing table (subscribers.sql not run yet) lands here too: the
    // browser shows an error instead of a false success.
    console.error("SUBSCRIBE_FAIL:", String(e.message || e));
    return json({ ok: false, error: "Sorry — that did not send. Please try again." }, 500);
  }
}

export const handler = handlerFor({ POST: onPost });
