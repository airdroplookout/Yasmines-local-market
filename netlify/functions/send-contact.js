// Netlify Function — Locally Crafted CA public contact form.
// POST /api/send-contact — validate a vendor enquiry and email it to
// the owner server-side via Resend. This replaces the old browser
// FormSubmit post (audit N-M4, Nov 25 2026): FormSubmit's endpoint was
// keyed only by the owner address in public source, so anyone could
// POST to it directly and skip the honeypot, the markup check and any
// rate limit — and the contact form had no server and no limit at all.
// Order mirrors the other public endpoints: honeypot first (fake
// success, nothing sent), then the 5/hour/IP rate limit, then
// validation. The email is the whole delivery here (no database row
// for contact messages), so a failed send returns 500 and the browser
// shows an error instead of a thank-you screen.
import { json, handlerFor, validEmail, checkPublicRateLimit, sendOwnerEmail, escHtml } from "./_lib.js";

const MAX = { name: 100, makes: 120, message: 1000 };

function hasMarkup(s) { return /[<>]/.test(s); }

async function onPost(context) {
  let b = {};
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "invalid body" }, 400);

  // Honeypot (audit N-M1): bots fill the hidden _honey field. Smile and
  // pretend it worked — fake success, no email sent. (The browser
  // checks this before calling, so a filled honeypot reaching here
  // means a direct API call, not the real form.)
  if (String(b._honey || "").trim()) return json({ ok: true });

  // Rate limit: 5 messages per hour per IP.
  const allowed = await checkPublicRateLimit(context, "contact", 5, 60 * 60 * 1000);
  if (!allowed) return json({ ok: false, error: "Too many messages — please try again later." }, 429);

  // Length caps (server-side; the browser caps only the email at 50)
  // and markup rejection, matching the reserve endpoint's rules.
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const makes = String(b.what_you_make ?? b.makes ?? "").trim();
  const message = String(b.message ?? "").trim();
  if (name.length > MAX.name) return json({ ok: false, error: "name must be at most 100 characters" }, 400);
  if (makes.length > MAX.makes) return json({ ok: false, error: "what_you_make must be at most 120 characters" }, 400);
  if (message.length > MAX.message) return json({ ok: false, error: "message must be at most 1000 characters" }, 400);
  if (hasMarkup(name) || hasMarkup(makes) || hasMarkup(message)) {
    return json({ ok: false, error: "Text fields must not contain < or >" }, 400);
  }
  if (!name) return json({ ok: false, error: "name is required" }, 400);
  if (!makes) return json({ ok: false, error: "what_you_make is required" }, 400);
  if (!message) return json({ ok: false, error: "message is required" }, 400);
  if (!validEmail(email)) return json({ ok: false, error: "That email address doesn't look quite right — please check it, since we will reply there." }, 400);

  try {
    const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px">
<p>New vendor enquiry on Locally Crafted CA.</p>
<table style="border-collapse:collapse">
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Name</td><td>${escHtml(name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Email</td><td>${escHtml(email)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">What they make</td><td>${escHtml(makes)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Message</td><td>${escHtml(message)}</td></tr>
</table></body></html>`;
    await sendOwnerEmail(context, "New vendor enquiry — Locally Crafted CA", html);
  } catch (e) {
    // No database row exists for contact messages, so a failed send
    // means the message is lost — log it and return 500 so the browser
    // shows an error instead of a thank-you screen.
    console.error("CONTACT_EMAIL_FAIL:", String(e.message || e));
    return json({ ok: false, error: "Sorry — that did not send. Please try again." }, 500);
  }
  return json({ ok: true, emailed: true });
}

export const handler = handlerFor({ POST: onPost });
