// Netlify Function — Yasmine's Local Market listings manager.
// Adil (and Yasmine) manage the products shown on the market site:
// add a listing, edit one, archive it (hidden from the site, restorable)
// or delete it for good.
//
// GET /api/admin/listings — list ALL listings (live + archived). Owner only.
// POST /api/admin/listings — create a listing.
//   Body: { maker_id, name, price, category?, description?, photo?, position? }
//   category must be one of: pottery, jewelry, homeware, textiles,
//   art, other. price is the SHOPPER price shown on the card
//   (e.g. "$32") — never a commission, payout or owner-only figure.
// PATCH /api/admin/listings?id=... — update any field; { status: "archived" }
//   archives it, { status: "live" } restores it.
// DELETE /api/admin/listings?id=... — delete a listing for good.
// Owner only (ADMIN_API_KEY) for every method here. The public site reads
// live listings through GET /api/listings (listings.js) — never through
// this endpoint.
import { json, sbJson, requireAdmin, handlerFor, LISTING_CATEGORIES } from "./_lib.js";

function cleanListing(b) {
  const patch = {};
  if (b.maker_id !== undefined) patch.maker_id = String(b.maker_id).trim();
  if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 120);
  if (b.price !== undefined) patch.price = String(b.price).trim().slice(0, 20);
  if (b.description !== undefined) patch.description = String(b.description).trim().slice(0, 500) || null;
  if (b.photo !== undefined) patch.photo = String(b.photo).trim().slice(0, 500) || null;
  if (b.position !== undefined) {
    const p = parseInt(b.position, 10);
    if (Number.isFinite(p)) patch.position = p;
  }
  if (b.category !== undefined) {
    if (!LISTING_CATEGORIES.includes(b.category)) return { error: `category must be one of: ${LISTING_CATEGORIES.join(", ")}` };
    patch.category = b.category;
  }
  if (b.status !== undefined) {
    if (b.status !== "live" && b.status !== "archived") return { error: 'status must be "live" or "archived"' };
    patch.status = b.status;
  }
  return { patch };
}

async function onGet(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const rows = await sbJson(context, "listings?order=position.asc,created_at.asc&limit=500");
    return json({ ok: true, listings: rows });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onPost(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const b = await context.request.json();
    if (!b.maker_id || !b.name || !b.price) return json({ ok: false, error: "maker_id, name and price are required" }, 400);
    const { patch, error } = cleanListing(b);
    if (error) return json({ ok: false, error }, 400);
    const rows = await sbJson(context, "listings", { method: "POST", body: JSON.stringify({ ...patch, status: "live" }) });
    return json({ ok: true, listing: rows[0] });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onPatch(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    const b = await context.request.json().catch(() => ({}));
    const { patch, error } = cleanListing(b);
    if (error) return json({ ok: false, error }, 400);
    if (!Object.keys(patch).length) return json({ ok: false, error: "nothing to update" }, 400);
    const rows = await sbJson(context, `listings?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return json({ ok: true, listing: rows[0] || null });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onDelete(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    await sbJson(context, `listings?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return json({ ok: true, removed: id });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ GET: onGet, POST: onPost, PATCH: onPatch, DELETE: onDelete });
