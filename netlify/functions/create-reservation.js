// Netlify Function — Yasmine's Local Market public reservation save.
// POST /api/reserve — save one buyer reservation to the database so it
// shows in Manage > Reservations. Public, no auth: the reserve form
// calls it alongside the FormSubmit email to the owner — the email is
// the notification, this row is the record. The front-end treats a
// failure here as best-effort (the email + buyer confirmation still
// happen), so this endpoint must never be the reason a reservation is
// lost. Validation is strict: buyer name/email/message required,
// lengths capped, delivery method from the fixed list, quantity 1-99.
// listing_id / maker_id are resolved, never trusted blindly: a
// supplied UUID is checked against the listings table first, otherwise
// the listing is looked up by exact product name (that is how
// reservations from a maker page, which uses built-in product keys,
// still attach to the real database listing). Unknown products save
// with null ids — the buyer and message are still recorded, and Manage
// shows the buyer even when it cannot resolve the product.
import { json, sbJson, handlerFor, validEmail, checkPublicRateLimit } from "./_lib.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY = ["Pickup", "Delivery by mail"];
const MAX = { name: 100, phone: 30, message: 1000, product: 120 };

function clean(v) { return String(v ?? "").trim(); }
function hasMarkup(s) { return /[<>]/.test(s); }

async function resolveListing(context, listingId, productName) {
  // Returns { listing_id, maker_id } — both null when the product is
  // not a database listing. A lookup failure also falls back to null
  // rather than losing the reservation.
  try {
    if (listingId && UUID_RE.test(String(listingId))) {
      const rows = await sbJson(context, `listings?select=id,maker_id&id=eq.${listingId}&status=eq.live&limit=1`);
      if (rows[0]) return { listing_id: rows[0].id, maker_id: rows[0].maker_id || null };
    }
    if (productName) {
      const rows = await sbJson(context, `listings?select=id,maker_id&name=eq.${encodeURIComponent(productName)}&status=eq.live&limit=1`);
      if (rows[0]) return { listing_id: rows[0].id, maker_id: rows[0].maker_id || null };
    }
  } catch { /* fall through with null ids */ }
  return { listing_id: null, maker_id: null };
}

async function onPost(context) {
  let b = {};
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "invalid body" }, 400);

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
    return json({ ok: true, id: rows[0]?.id || null });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

export const handler = handlerFor({ POST: onPost });
