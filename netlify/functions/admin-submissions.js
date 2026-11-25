// Netlify Function — Locally Crafted CA product submissions manager.
// GET /api/admin/submissions — list all product submissions, newest first.
//   Owner only.
// POST /api/admin/submissions?id=... — { action: "approve" | "reject" }.
//   Approve: find-or-create the maker by the maker's email, create the
//   listing as LIVE (this is the ONLY way a submitted product reaches
//   the public site), then mark the submission approved. Reject: mark
//   it rejected — it never appears on the site.
// DELETE /api/admin/submissions?id=... — delete a submission for good.
// Owner only (ADMIN_API_KEY) for every method here.
//
// The public submit form (/api/submit-product) only ever saves rows as
// status 'pending' — nothing a maker submits is visible in the public
// listings feed until the owner approves it here.
import { json, sbJson, requireAdmin, handlerFor } from "./_lib.js";

async function onGet(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const rows = await sbJson(context, "product_submissions?order=created_at.desc&limit=500");
    return json({ ok: true, submissions: rows });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onPost(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    const b = await context.request.json().catch(() => ({}));
    const action = String(b.action || "");
    if (action !== "approve" && action !== "reject") {
      return json({ ok: false, error: 'action must be "approve" or "reject"' }, 400);
    }
    const rows = await sbJson(context, `product_submissions?id=eq.${encodeURIComponent(id)}&limit=1`);
    const sub = rows[0];
    if (!sub) return json({ ok: false, error: "submission not found" }, 404);
    if (sub.status !== "pending") return json({ ok: false, error: "that submission was already decided" }, 400);

    if (action === "reject") {
      const done = await sbJson(context, `product_submissions?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ status: "rejected" }),
      });
      return json({ ok: true, submission: done[0] || sub });
    }

    // Approve: find-or-create the maker by email (email is unique in
    // makers), then create the listing as live. The maker's business
    // name becomes their shop name on the site (older submissions
    // without one fall back to the maker's own name).
    const email = String(sub.maker_email || "").trim().toLowerCase();
    const shopName = String(sub.business_name || sub.maker_name || "").trim();
    let maker = null;
    const existing = await sbJson(context, `makers?email=eq.${encodeURIComponent(email)}&limit=1`);
    if (existing[0]) {
      maker = existing[0];
    } else {
      const allMakers = await sbJson(context, "makers?select=position&order=position.desc&limit=1");
      const nextPos = (allMakers[0] && Number.isFinite(allMakers[0].position)) ? allMakers[0].position + 1 : 0;
      const created = await sbJson(context, "makers", {
        method: "POST",
        body: JSON.stringify({
          name: sub.maker_name, shop_name: shopName, email,
          bio: null, phone: null, status: "live", position: nextPos,
        }),
      });
      maker = created[0];
      if (!maker) return json({ ok: false, error: "could not create the maker" }, 500);
    }
    const allListings = await sbJson(context, "listings?select=position&order=position.desc&limit=1");
    const nextListPos = (allListings[0] && Number.isFinite(allListings[0].position)) ? allListings[0].position + 1 : 0;
    const listings = await sbJson(context, "listings", {
      method: "POST",
      body: JSON.stringify({
        maker_id: maker.id, name: sub.product_name, price: sub.price,
        category: sub.category, description: sub.description,
        photo: sub.photo_url || null, status: "live", position: nextListPos,
      }),
    });
    const listing = listings[0];
    if (!listing) return json({ ok: false, error: "could not create the listing" }, 500);
    const done = await sbJson(context, `product_submissions?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({ status: "approved" }),
    });
    return json({ ok: true, submission: done[0] || sub, maker, listing });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

async function onDelete(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "id is required" }, 400);
    await sbJson(context, `product_submissions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return json({ ok: true, removed: id });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ GET: onGet, POST: onPost, DELETE: onDelete });
