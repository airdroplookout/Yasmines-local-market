// Netlify Function — Locally Crafted CA newsletter send.
// POST /api/admin/send-newsletter — { subject, body, attachment? }.
// Sends the newsletter to every ACTIVE subscriber, one individual
// email each via Resend (from contact@locallycrafted.ca). No To/CC
// batching, no BCC — each recipient gets their own email, so nobody
// ever sees anyone else's address.
// Owner only (requireAdmin) for every call. Safety:
// - subject and body are both required (subject max 200 chars,
//   body max 20,000 chars);
// - refuses when there are 0 active subscribers;
// - refuses when there are more than 500 active subscribers
//   (raise the cap deliberately, never silently truncate);
// - at most 10 sends per hour per IP (admin endpoint, same helper
//   as the public rate limits);
// - every per-recipient failure is reported (sent / failed counts
//   plus the first 10 failures) — never a false success.
// - no send log table: the result is shown in Manage right after
//   sending. If logging is wanted later, add a table + SQL then.
// Attachment (Nov 26 2026): Manage sends
//   attachment: { kind: "hosted", path: "issues/issue-1.pdf",
//                 name: "locally-crafted-newsletter-issue-1.pdf" }
//   or { kind: "storage", path: "newsletter/....pdf", name: "..." },
//   or null for no attachment. The file is fetched ONCE here and
//   attached to every recipient's email, the same way AI Outlet Plus
//   attaches its hosted issue PDF. If an attachment is requested but
//   cannot be fetched, the send is refused BEFORE anyone is emailed —
//   never a send that silently drops the attachment. The default in
//   Manage is the hosted Newsletter Issue 1 PDF.
// Unsubscribe (Nov 26 2026): every email carries a one-click link
//   built from a per-subscriber HMAC token (createUnsubscribeToken in
//   _lib.js, keyed by ADMIN_API_KEY) — nobody can unsubscribe someone
//   else by guessing a URL. Clicking it archives that subscriber.
import { json, handlerFor, requireAdmin, sbJson, sendViaResend, validEmail, escHtml, checkPublicRateLimit, createUnsubscribeToken, siteBaseUrl } from "./_lib.js";

const MAX_RECIPIENTS = 500;
const MAX_ATTACHMENT_B64 = 40 * 1024 * 1024;

function newsletterHtml(subject, bodyText, unsubscribeUrl) {
  const safeBody = escHtml(bodyText).replace(/\r\n|\r|\n/g, "<br>");
  return (
    "<!doctype html><html><body style=\"margin:0;padding:0;background:#FAF7F2;font-family:Georgia,serif;color:#292B28\">" +
    "<div style=\"max-width:600px;margin:0 auto;padding:24px\">" +
    "<p style=\"margin:0 0 8px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#B76E50\">Locally Crafted CA</p>" +
    "<h1 style=\"font-size:24px;line-height:1.3;margin:0 0 16px;color:#243032\">" + escHtml(subject) + "</h1>" +
    "<div style=\"font-size:16px;line-height:1.6\">" + safeBody + "</div>" +
    "<hr style=\"border:none;border-top:1px solid #E5D8C5;margin:28px 0 12px\">" +
    "<p style=\"font-size:13px;line-height:1.5;color:#6b6f6a\">You are receiving this because you signed up for the " +
    "Locally Crafted CA newsletter. <a href=\"" + escHtml(unsubscribeUrl) + "\" style=\"color:#B76E50\">Unsubscribe</a> — or reply to this email and we will remove you.</p>" +
    "<p style=\"font-size:13px;color:#6b6f6a\"><a href=\"https://locallycrafted.ca\" style=\"color:#B76E50\">locallycrafted.ca</a></p>" +
    "</div></body></html>"
  );
}

// Fetch the attachment file once. Returns { filename, content, contentType }
// or null when no attachment was requested. Throws (refusing the whole
// send) when an attachment was requested but cannot be fetched.
async function resolveAttachment(context, attachment) {
  if (!attachment) return null;
  const kind = String(attachment.kind || "");
  const path = String(attachment.path || "");
  const name = String(attachment.name || "newsletter.pdf").slice(0, 120) || "newsletter.pdf";
  let url = "";
  if (kind === "hosted") {
    if (!/^issues\/[A-Za-z0-9._-]+\.pdf$/.test(path)) throw new Error("That hosted attachment path is not allowed.");
    url = `${siteBaseUrl(context.env)}/${path}`;
  } else if (kind === "storage") {
    if (!/^newsletter\/[A-Za-z0-9._-]+\.pdf$/.test(path)) throw new Error("That stored attachment path is not allowed.");
    if (!context.env.SUPABASE_URL) throw new Error("SUPABASE_URL is not set — the stored attachment cannot be fetched.");
    url = `${context.env.SUPABASE_URL}/storage/v1/object/public/listing-photos/${path}`;
  } else {
    throw new Error("Unknown attachment kind.");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Attachment not available at ${url} (HTTP ${res.status}) — nothing was sent.`);
  const content = Buffer.from(await res.arrayBuffer()).toString("base64");
  if (content.length > MAX_ATTACHMENT_B64) throw new Error("That PDF is over Resend's 40 MB attachment limit — nothing was sent.");
  return [{ filename: name, content, contentType: "application/pdf" }];
}

async function onPost(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  let b = {};
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "invalid body" }, 400);

  const subject = String(b.subject ?? "").trim();
  const body = String(b.body ?? "").trim();
  if (!subject) return json({ ok: false, error: "Subject is required." }, 400);
  if (subject.length > 200) return json({ ok: false, error: "Subject is too long (max 200 characters)." }, 400);
  if (!body) return json({ ok: false, error: "Message is required — write the newsletter first." }, 400);
  if (body.length > 20000) return json({ ok: false, error: "Message is too long (max 20,000 characters)." }, 400);

  // Rate limit: at most 10 newsletter sends per hour per IP.
  const allowed = await checkPublicRateLimit(context, "send-newsletter", 10, 60 * 60 * 1000);
  if (!allowed) return json({ ok: false, error: "Too many sends — please try again later." }, 429);

  if (!context.env.RESEND_API_KEY) {
    return json({ ok: false, error: "RESEND_API_KEY is not set — add it in Netlify Site settings -> Environment variables, then redeploy." }, 500);
  }

  // Resolve the attachment FIRST: a missing file refuses the send
  // before any email goes out.
  let attachments = null;
  let attachedName = null;
  try {
    attachments = await resolveAttachment(context, b.attachment || null);
    if (attachments) attachedName = String((b.attachment && b.attachment.name) || "newsletter.pdf");
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }

  let recipients;
  try {
    recipients = await sbJson(context, "subscribers?status=eq.active&select=email&order=created_at.asc&limit=1000");
  } catch (e) {
    return json({ ok: false, error: "Could not read the subscriber list: " + String(e.message || e) }, 500);
  }
  const emails = (Array.isArray(recipients) ? recipients : [])
    .map((r) => String(r.email || "").trim().toLowerCase())
    .filter((e) => validEmail(e));
  if (!emails.length) return json({ ok: false, error: "No active subscribers — nobody to send to yet." }, 400);
  if (emails.length > MAX_RECIPIENTS) {
    return json({ ok: false, error: `Too many recipients (${emails.length} active subscribers, max ${MAX_RECIPIENTS} per send). Split the list or raise the cap deliberately.` }, 400);
  }

  const siteUrl = siteBaseUrl(context.env);
  let sent = 0, failed = 0;
  const failures = [];
  for (const email of emails) {
    const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(context.env, email))}`;
    const html = newsletterHtml(subject, body, unsubscribeUrl);
    try {
      await sendViaResend(context, { to: email, subject: `Locally Crafted CA — ${subject}`, html, attachments });
      sent++;
    } catch (e) {
      failed++;
      failures.push(`${email}: ${String(e.message || e).slice(0, 200)}`);
    }
  }
  return json({ ok: true, sent, failed, recipients: emails.length, failures: failures.slice(0, 10), attached: attachedName });
}

export const handler = handlerFor({ POST: onPost });
