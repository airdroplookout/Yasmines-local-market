// Netlify Function — Locally Crafted CA newsletter unsubscribe.
// GET /unsubscribe?token=... — one click, no login.
// The token is the signed link from the newsletter email (see
// createUnsubscribeToken in _lib.js): it proves the clicker owns that
// address, because the link was sent to it. A bare email is NOT accepted
// here — anyone could otherwise unsubscribe any address.
// Clicking a valid link sets that subscriber to "archived" (they get no
// more emails and do not count as active, but the row is kept so the
// owner can restore them in Manage if they change their mind).
// Shows a simple confirmation page. Already-archived addresses get the
// same page (idempotent). Invalid links get a plain error page.
// No new database column: the email is inside the signed token.
// Lightly rate-limited (30/hour per IP) so the endpoint cannot be
// hammered; the limit fails open, like the other public limits.
import { sbJson, handlerFor, verifyUnsubscribeToken, checkPublicRateLimit, siteBaseUrl, escHtml } from "./_lib.js";

function page(siteUrl, title, text) {
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>" + escHtml(title) + " — Locally Crafted CA</title></head>" +
    "<body style=\"margin:0;padding:0;background:#FAF7F2;font-family:Georgia,serif;color:#292B28\">" +
    "<div style=\"max-width:560px;margin:0 auto;padding:48px 24px;text-align:center\">" +
    "<p style=\"margin:0 0 8px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#B76E50\">Locally Crafted CA</p>" +
    "<h1 style=\"font-size:26px;line-height:1.3;margin:0 0 14px;color:#243032\">" + escHtml(title) + "</h1>" +
    "<p style=\"font-size:16px;line-height:1.6\">" + escHtml(text) + "</p>" +
    "<p style=\"margin-top:28px\"><a href=\"" + escHtml(siteUrl) + "\" style=\"color:#B76E50;font-weight:bold\">Back to the market</a></p>" +
    "</div></body></html>";
}

function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin" } });
}

async function onGet(context) {
  const siteUrl = siteBaseUrl(context.env);
  const allowed = await checkPublicRateLimit(context, "unsubscribe", 30, 60 * 60 * 1000);
  if (!allowed) {
    return htmlResponse(page(siteUrl, "Too many tries", "Please wait a little while and try the link again."), 429);
  }
  try {
    const url = new URL(context.request.url);
    const token = url.searchParams.get("token") || "";
    const email = verifyUnsubscribeToken(context.env, token);
    if (!email) {
      return htmlResponse(page(siteUrl, "That link is not valid", "This unsubscribe link could not be verified. Please use the unsubscribe link in the latest newsletter email — or reply to that email and we will remove you."), 400);
    }
    const rows = await sbJson(context, `subscribers?email=eq.${encodeURIComponent(email)}&select=id,status&limit=1`);
    const sub = rows[0];
    if (!sub) {
      return htmlResponse(page(siteUrl, "Not on the list", "That email address is not on the Locally Crafted CA newsletter list, so there is nothing to remove."), 200);
    }
    if (sub.status !== "archived") {
      await sbJson(context, `subscribers?id=eq.${encodeURIComponent(sub.id)}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
    }
    return htmlResponse(page(siteUrl, "You have been unsubscribed", "You will no longer receive the Locally Crafted CA newsletter. If this was a mistake, you can sign up again on our home page."), 200);
  } catch (e) {
    return htmlResponse(page(siteUrl, "Something went wrong", "We could not process that link right now. Please try again later — or reply to the newsletter email and we will remove you."), 500);
  }
}

export const handler = handlerFor({ GET: onGet });
