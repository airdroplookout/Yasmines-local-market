// Netlify Function — Yasmine's Local Market makers manager.
// Adil (and Yasmine) manage the makers shown on the market site:
// add a maker, edit one, archive it (hidden from the site, restorable)
// or delete it for good. Deleting a maker also deletes their listings
// (the listings table references makers with ON DELETE CASCADE).
//
// GET /api/admin/makers — list ALL makers (live + archived). Owner only.
// POST /api/admin/makers — create a maker.
//   Body: { name, shop_name?, email, phone?, bio?, position? }
//   email must be a real email address, max 50 characters (owner's rule).
// PATCH /api/admin/makers?id=... — update any field; { status: "archived" }
//   archives it, { status: "live" } restores it.
// DELETE /api/admin/makers?id=... — delete a maker (and their listings)
//   for good.
// Owner only (ADMIN_API_KEY) for every method here. The public site reads
// live makers through GET /api/listings (listings.js) — never through
// this endpoint.
import { json, sbJson, requireAdmin, handlerFor, validEmail } from "./_lib.js";

function cleanMaker(b) {
  const patch = {};
  // Defence in depth for H-1: markup must never be stored in a maker.
  for (const k of ["name", "shop_name", "bio", "phone"]) {
    if (b[k] !== undefined && b[k] !== null && /[<>]/.test(String(b[k]))) return { error: `${k} must not contain < or >` };
  }
  if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 80);
  if (b.shop_name !== undefined) patch.shop_name = String(b.shop_name).trim().slice(0, 80) || null;
  if (b.email !== undefined) {
    const email = String(b.email).trim().toLowerCase();
    if (!validEmail(email)) return { error: "email must be a real email address, at most 50 characters" };
    patch.email = email;
  }
  if (b.phone !== undefined) patch.phone = String(b.phone).trim().slice(0, 30) || null;
  if (b.bio !== undefined) patch.bio = String(b.bio).trim().slice(0, 500) || null;
  if (b.position !== undefined) {
    const p = parseInt(b.position, 10);
    if (Number.isFinite(p)) patch.position = p;
  }
  if (b.status !== undefined) {
    if (b.status !== "live" && b.status !== "archived") return { error: 'status must be "live" or "archived"' };
    patch.status = b.status;
  }
  if (patch.name !== undefined && !patch.name) return { error: "name is required" };
  return { patch };
}

async function onGet(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const rows = await sbJson(context, "makers?order=position.asc,created_at.asc&limit=500");
    return json({ ok: true, makers: rows });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onPost(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const b = await context.request.json();
    if (!b.name || !b.email) return json({ ok: false, error: "name and email are required" }, 400);
    const { patch, error } = cleanMaker(b);
    if (error) return json({ ok: false, error }, 400);
    const rows = await sbJson(context, "makers", { method: "POST", body: JSON.stringify({ ...patch, status: "live" }) });
    return json({ ok: true, maker: rows[0] });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onPatch(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    const b = await context.request.json().catch(() => ({}));
    const { patch, error } = cleanMaker(b);
    if (error) return json({ ok: false, error }, 400);
    if (!Object.keys(patch).length) return json({ ok: false, error: "nothing to update" }, 400);
    const rows = await sbJson(context, `makers?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return json({ ok: true, maker: rows[0] || null });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onDelete(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    await sbJson(context, `makers?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return json({ ok: true, removed: id });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ GET: onGet, POST: onPost, PATCH: onPatch, DELETE: onDelete });
