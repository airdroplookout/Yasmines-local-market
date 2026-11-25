// Netlify Function — Yasmine's Local Market reservations list.
// GET /api/admin/reservations — list all reservations, newest first.
//   Owner only.
// PATCH /api/admin/reservations?id=... — update status only:
//   { status: "new" | "contacted" | "done" }.
//   "new" = just arrived, "contacted" = the maker replied, "done" = the
//   exchange happened.
// DELETE /api/admin/reservations?id=... — delete a reservation for good.
// Owner only (ADMIN_API_KEY) for every method here.
//
// NOTE: reservations are saved here via POST /api/reserve, which also
// emails the owner server-side via Resend — new reservations appear in
// this list as well as in the inbox.
import { json, sbJson, requireAdmin, handlerFor } from "./_lib.js";

const STATUSES = ["new", "contacted", "done"];

async function onGet(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const rows = await sbJson(context, "reservations?order=created_at.desc&limit=500");
    return json({ ok: true, reservations: rows });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onPatch(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    const b = await context.request.json().catch(() => ({}));
    const status = String(b.status || "");
    if (!STATUSES.includes(status)) return json({ ok: false, error: 'status must be one of: new, contacted, done' }, 400);
    const rows = await sbJson(context, `reservations?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
    return json({ ok: true, reservation: rows[0] || null });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onDelete(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    await sbJson(context, `reservations?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return json({ ok: true, removed: id });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ GET: onGet, PATCH: onPatch, DELETE: onDelete });
