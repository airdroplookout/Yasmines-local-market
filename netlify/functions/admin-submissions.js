// Netlify Function — Locally Crafted CA product submissions manager.
// GET /api/admin/submissions — list all product submissions, newest first.
//   Owner only.
// POST /api/admin/submissions?id=... — { action: "approve" | "reject" }.
//   Approve: only for a submission whose maker email was verified
//   (409 otherwise); attaching to an existing maker needs explicit
//   confirm_attach=true showing that shop's name; new shop names must
//   be unique; the maker must be live (not archived); the final mark
//   as approved is conditional on the submission still being pending.
//   Then creates the listing as LIVE (this is the ONLY way a submitted
//   product reaches the public site), then marks the submission
//   approved. Reject: mark it rejected — it never appears on the site.
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

    // Approve — guards, in order (audit #3 N-M6 / N-L3):
    // (e) Re-validate markup before anything submitted is copied into
    //     a live listing — intake-time rejection alone is not trusted.
    if (/[<>]/.test(String(sub.product_name || "")) || /[<>]/.test(String(sub.description || ""))
      || /[<>]/.test(String(sub.business_name || ""))) {
      return json({ ok: false, error: "Text fields must not contain < or >" }, 400);
    }
    // (a) Maker email must be verified at submit time. Rows created
    //     before the verification columns existed have
    //     email_verified false/undefined, so they are refused too —
    //     see the migration note in supabase/submission-verification.sql.
    if (sub.email_verified !== true) {
      return json({ ok: false, error: "Maker email not verified yet" }, 409);
    }

    // Approve: find-or-create the maker by email (email is unique in
    // makers), then create the listing as live. The maker's business
    // name becomes their shop name on the site (older submissions
    // without one fall back to the maker's own name).
    const email = String(sub.maker_email || "").trim().toLowerCase();
    const shopName = String(sub.business_name || sub.maker_name || "").trim();
    if (!shopName) return json({ ok: false, error: "shop name is missing on this submission" }, 400);
    let maker = null;
    let createdMaker = null;
    const existing = await sbJson(context, `makers?email=eq.${encodeURIComponent(email)}&limit=1`);
    if (existing[0]) {
      maker = existing[0];
      // (f) Archived-maker guard: makers.status is 'live' or
      //     'archived' (supabase/schema.sql). Never attach a product
      //     to an archived maker — the listing would be created but
      //     hidden from the feed while the owner is told it is live.
      if (maker.status !== "live") {
        return json({ ok: false, error: "This maker is archived — restore the maker before approving" }, 409);
      }
      // (b) Never silently attach to an existing shop. The owner must
      //     explicitly confirm, seeing the existing shop name first.
      //     Manage shows a confirm dialog and re-sends with
      //     confirm_attach=true only when the owner agrees.
      if (b.confirm_attach !== true) {
        const existingShop = String(maker.shop_name || maker.name || "");
        return json({
          ok: false,
          error: `This email belongs to the existing shop "${existingShop}". Attach this product to that shop?`,
          existing_shop_name: existingShop,
        }, 409);
      }
    } else {
      // (c) Shop-name uniqueness for a NEW maker (case-insensitive).
      //     Compared in code so names containing PostgREST wildcards
      //     (% _) cannot slip through; the unique index on
      //     lower(shop_name) is the backstop against a parallel race.
      const shopNames = await sbJson(context, "makers?select=shop_name&limit=1000");
      if (Array.isArray(shopNames) && shopNames.some((m) => String(m.shop_name || "").trim().toLowerCase() === shopName.toLowerCase())) {
        return json({ ok: false, error: `A shop called "${shopName}" already exists — pick a different shop name` }, 409);
      }
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
      createdMaker = maker;
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
    // (d) Atomicity: the final PATCH is conditional on the submission
    //     still being 'pending', and a row must actually be affected.
    //     Two parallel Approves both pass the early pending check, so
    //     the second one's PATCH matches 0 rows here — its listing
    //     (and maker, if it just created one) is deleted again as
    //     compensation, so exactly one live listing survives. True
    //     atomicity would need a single Postgres transaction/function;
    //     this is the closest PostgREST allows.
    const done = await sbJson(context, `product_submissions?id=eq.${encodeURIComponent(id)}&status=eq.pending`, {
      method: "PATCH", body: JSON.stringify({ status: "approved" }),
    });
    if (!Array.isArray(done) || done.length === 0) {
      try {
        await sbJson(context, `listings?id=eq.${encodeURIComponent(listing.id)}`, { method: "DELETE" });
        if (createdMaker) {
          const stillUsed = await sbJson(context, `listings?select=id&maker_id=eq.${encodeURIComponent(createdMaker.id)}&limit=1`);
          if (!Array.isArray(stillUsed) || stillUsed.length === 0) {
            await sbJson(context, `makers?id=eq.${encodeURIComponent(createdMaker.id)}`, { method: "DELETE" });
          }
        }
      } catch (cleanupErr) {
        console.error("approve race cleanup failed:", String(cleanupErr.message || cleanupErr));
      }
      return json({ ok: false, error: "already handled — this submission was already decided" }, 409);
    }
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
