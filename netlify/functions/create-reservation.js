// Netlify Function — Locally Crafted CA public reservation save.
// POST /api/reserve — save one buyer reservation to the database so it
// shows in Manage > Reservations, and email the owner the details
// server-side via Resend. This endpoint is the SOURCE OF TRUTH (audit
// N-M4/N-M5, Nov 25 2026): the browser awaits its answer and only
// shows the confirmation screen when it says ok. The old design posted
// the email from the browser via FormSubmit, fire-and-forget alongside
// this save — anyone could POST to FormSubmit directly, bypassing the
// honeypot, markup check and rate limit, and a reservation could exist
// in the inbox but not in Manage (or vice versa). That leg is gone:
// no owner email address remains in public source for this form.
// Validation is strict: buyer name/email/message required,
// lengths capped, delivery method from the fixed list, quantity 1-99.
// listing_id / maker_id are resolved, never trusted blindly: a
// supplied UUID is checked against the listings table first, otherwise
// the listing is looked up by exact product name (that is how
// reservations from a maker page, which uses built-in product keys,
// still attach to the real database listing). Unknown products save
// with null ids — the buyer and message are still recorded, and Manage
// shows the buyer even when it cannot resolve the product.
// Dedup (audit N-L14): an identical reservation in the last 24 hours
// returns the existing row instead of inserting a second one.
// Email is best-effort AFTER the save: if Resend fails, the row is
// still saved and the response says emailed:false — never lose the
// reservation because the email failed.
import { json, sbJson, handlerFor, validEmail, checkPublicRateLimit, sendOwnerEmail, escHtml } from "./_lib.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY = ["Pickup", "Delivery by mail"];
const MAX = { name: 100, phone: 30, message: 1000, product: 120 };

function clean(v) { return String(v ?? "").trim(); }
function hasMarkup(s) { return /[<>]/.test(s); }

async function makerIsLive(context, makerId) {
  if (!makerId) return false;
  const m = await sbJson(context, `makers?select=status&id=eq.${encodeURIComponent(makerId)}&limit=1`);
  return m[0]?.status === "live";
}

async function resolveListing(context, listingId, productName) {
  // Returns { listing_id, maker_id } — both null when the product is
  // not a database listing. A lookup failure also falls back to null
  // rather than losing the reservation.
  // Audit #3 N-L8: the MAKER must be live too — a live listing of an
  // archived maker must not resolve (it is hidden from the feed but
  // was still reservable by direct UUID or exact name).
  try {
    if (listingId && UUID_RE.test(String(listingId))) {
      const rows = await sbJson(context, `listings?select=id,maker_id&id=eq.${listingId}&status=eq.live&limit=1`);
      if (rows[0] && (await makerIsLive(context, rows[0].maker_id))) return { listing_id: rows[0].id, maker_id: rows[0].maker_id || null };
    }
    if (productName) {
      // Deterministic fallback (audit N-L14): order by created_at so two
      // live listings sharing a name do not attach arbitrarily.
      const rows = await sbJson(context, `listings?select=id,maker_id&name=eq.${encodeURIComponent(productName)}&status=eq.live&order=created_at.asc&limit=1`);
      if (rows[0] && (await makerIsLive(context, rows[0].maker_id))) return { listing_id: rows[0].id, maker_id: rows[0].maker_id || null };
    }
  } catch { /* fall through with null ids */ }
  return { listing_id: null, maker_id: null };
}

async function onPost(context) {
  let b = {};
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "invalid body" }, 400);

  // Honeypot (audit N-M1): bots fill the hidden _honey field. Smile and
  // pretend it worked — fake success, no row stored, nothing emailed.
  // (The browser checks this before calling, so a filled honeypot
  // reaching here means a direct API call, not the real form.)
  if (String(b._honey || "").trim()) return json({ ok: true, id: null });

  // Rate limit: 10 reservations per hour per IP (audit M-1).
  const allowed = await checkPublicRateLimit(context, "reserve", 10, 60 * 60 * 1000);
  if (!allowed) return json({ ok: false, error: "Too many reservations — please try again later." }, 429);

  // Reject over-long fields with 400 (never silently truncate) and reject
  // markup in every free-text field (audit M-2). Email length is capped
  // at 50 by validEmail() (owner's standing rule).
  const rawName = String(b.buyer_name ?? "");
  const rawPhone = String(b.buyer_phone ?? "");
  const rawMessage = String(b.message ?? "");
  const rawProduct = String(b.product_name ?? "");
  if (rawName.trim().length > MAX.name) return json({ ok: false, error: "buyer_name must be at most 100 characters" }, 400);
  if (rawPhone.trim().length > MAX.phone) return json({ ok: false, error: "buyer_phone must be at most 30 characters" }, 400);
  if (rawMessage.trim().length > MAX.message) return json({ ok: false, error: "message must be at most 1000 characters" }, 400);
  if (rawProduct.trim().length > MAX.product) return json({ ok: false, error: "product_name must be at most 120 characters" }, 400);
  if (hasMarkup(rawName) || hasMarkup(rawPhone) || hasMarkup(rawMessage) || hasMarkup(rawProduct)) {
    return json({ ok: false, error: "Text fields must not contain < or >" }, 400);
  }
  const buyer_name = rawName.trim();
  const buyer_email = String(b.buyer_email || "").trim().toLowerCase();
  const buyer_phone = rawPhone.trim();
  const message = rawMessage.trim();
  const product_name = rawProduct.trim();
  const delivery_method = String(b.delivery_method || "Pickup");
  const qty = parseInt(b.quantity, 10);
  if (!Number.isFinite(qty) || qty < 1 || qty > 99) return json({ ok: false, error: "quantity must be a whole number from 1 to 99" }, 400);

  if (!buyer_name) return json({ ok: false, error: "buyer_name is required" }, 400);
  if (!validEmail(buyer_email)) return json({ ok: false, error: "buyer_email must be a valid email address" }, 400);
  if (!message) return json({ ok: false, error: "message is required" }, 400);
  if (!DELIVERY.includes(delivery_method)) return json({ ok: false, error: "delivery_method must be Pickup or Delivery by mail" }, 400);

  const ids = await resolveListing(context, b.listing_id, product_name);

  // Dedup (audit N-L14): an identical reservation in the last 24 hours
  // returns the existing row — no second row, no second email. Same
  // buyer_email + same listing_id when the product resolved; when it
  // did not resolve, the reservations table stores no product_name, so
  // the closest stored proxy is buyer_email + the identical message.
  // A failed dedup lookup never blocks a real reservation: it logs
  // and the insert below still runs.
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let q = `reservations?select=id&buyer_email=eq.${encodeURIComponent(buyer_email)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`;
    if (ids.listing_id) q += `&listing_id=eq.${ids.listing_id}`;
    else q += `&message=eq.${encodeURIComponent(message)}`;
    const dupes = await sbJson(context, q);
    if (dupes[0]?.id) return json({ ok: true, id: dupes[0].id, duplicate: true, emailed: false });
  } catch (e) {
    console.error("RESERVE_DEDUP_CHECK_FAIL:", String(e.message || e));
  }

  let id = null;
  try {
    const rows = await sbJson(context, "reservations", {
      method: "POST",
      body: JSON.stringify({
        listing_id: ids.listing_id,
        maker_id: ids.maker_id,
        buyer_name,
        buyer_email,
        buyer_phone: buyer_phone || null,
        quantity: String(qty),
        delivery_method,
        message,
      }),
    });
    id = rows[0]?.id || null;
  } catch (e) {
    // DB failure: log server-side (error text only — no buyer PII) and
    // return 500. The browser retries once, then shows a distinct
    // "could not save" error; the buyer does NOT see a confirmation
    // for a reservation that was never saved.
    console.error("RESERVE_DB_FAIL:", String(e.message || e));
    return json({ ok: false, error: "Could not save your reservation. Please try again." }, 500);
  }

  // Owner notification, server-side via Resend, AFTER the save. If the
  // send fails the row is still saved — emailed:false tells the browser
  // to show the confirmation with a note that the owner will see the
  // reservation in Manage.
  let emailed = false;
  try {
    const makerLabel = await makerLabelFor(context, ids.maker_id);
    const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px">
<p>New reservation on Locally Crafted CA — saved in Manage &gt; Reservations${id ? ` (ID ${escHtml(id)})` : ""}.</p>
<table style="border-collapse:collapse">
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Product</td><td>${escHtml(product_name || "—")}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Maker</td><td>${escHtml(makerLabel || "—")}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Buyer</td><td>${escHtml(buyer_name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Buyer email</td><td>${escHtml(buyer_email)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Phone</td><td>${escHtml(buyer_phone || "Not provided")}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Quantity</td><td>${escHtml(String(qty))}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Delivery</td><td>${escHtml(delivery_method)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Message</td><td>${escHtml(message)}</td></tr>
</table></body></html>`;
    await sendOwnerEmail(context, `New reservation — ${product_name}`, html);
    emailed = true;
  } catch (e) {
    console.error("RESERVE_EMAIL_FAIL: owner notification not sent for reservation", id, String(e.message || e));
  }
  return json({ ok: true, id, emailed });
}

// Best-effort maker label for the owner email ("Name — Shop"); null
// when the maker cannot be looked up — never blocks the reservation.
async function makerLabelFor(context, makerId) {
  if (!makerId) return null;
  try {
    const rows = await sbJson(context, `makers?select=name,shop_name&id=eq.${makerId}&limit=1`);
    if (!rows[0]) return null;
    const name = rows[0].name || "";
    const shop = rows[0].shop_name || "";
    if (name && shop) return `${name} — ${shop}`;
    return name || shop || null;
  } catch { return null; }
}

export const handler = handlerFor({ POST: onPost });
