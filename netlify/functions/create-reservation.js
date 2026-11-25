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
import { json, sbJson, handlerFor, validEmail } from "./_lib.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY = ["Pickup", "Delivery by mail"];
const MAX = { name: 100, phone: 30, message: 1000, product: 120 };

function clean(v, max) {
  const s = String(v ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

async function resolveListing(context, listingId, productName) {
  // Returns { listing_id, maker_id } — both null when the product is
  // not a database listing. A lookup failure also falls back to null
  // rather than losing the reservation.
  try {
    if (listingId && UUID_RE.test(String(listingId))) {
      const rows = await sbJson(context, `listings?select=id,maker_id&id=eq.${listingId}&limit=1`);
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

  const buyer_name = clean(b.buyer_name, MAX.name);
  const buyer_email = String(b.buyer_email || "").trim().toLowerCase();
  const buyer_phone = clean(b.buyer_phone, MAX.phone);
  const message = clean(b.message, MAX.message);
  const product_name = clean(b.product_name, MAX.product);
  const delivery_method = String(b.delivery_method || "Pickup");
  let qty = parseInt(b.quantity, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  if (qty > 99) qty = 99;

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
