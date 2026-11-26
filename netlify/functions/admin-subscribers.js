// Netlify Function — newsletter subscriber management for Manage.
// Adapted from ai-outlet-plus/admin-subscribers.js (Nov 2026), with the
// market's status values: "active" (on the list) and "archived" (set
// aside, gets no emails, does not count as active).
// GET /api/admin/subscribers — list all subscribers, newest first.
// PATCH /api/admin/subscribers?id=...&action=archive — set a subscriber
//   aside. Archived subscribers get no emails and do not count as active.
// PATCH /api/admin/subscribers?id=...&action=restore — pull an archived
//   subscriber back to active.
// DELETE /api/admin/subscribers?id=... — remove a subscriber for good
//   (row deleted). The Manage UI asks first.
// Owner only (requireAdmin) for every method here.
import { json, sbJson, requireAdmin, handlerFor } from "./_lib.js";

async function onGet(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const rows = await sbJson(context, "subscribers?order=created_at.desc&limit=500");
    return json({ ok: true, subscribers: rows });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onPatch(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action");
    if (!id || (action !== "archive" && action !== "restore")) {
      return json({ ok: false, error: "id and action=archive|restore are required" }, 400);
    }
    const rows = await sbJson(context, `subscribers?id=eq.${encodeURIComponent(id)}&limit=1`);
    const sub = rows[0];
    if (!sub) return json({ ok: false, error: "subscriber not found" }, 404);
    const status = action === "archive" ? "archived" : "active";
    if (sub.status === status) return json({ ok: true, subscriber: sub });
    const updated = await sbJson(context, `subscribers?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
    return json({ ok: true, subscriber: updated[0] || null });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onDelete(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    await sbJson(context, `subscribers?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return json({ ok: true, removed: id });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ GET: onGet, PATCH: onPatch, DELETE: onDelete });
