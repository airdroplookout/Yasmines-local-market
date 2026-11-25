// Netlify Function — Yasmine's Local Market public listings feed.
// GET /api/listings — the live listings the home page shows.
// Public, no auth: it returns ONLY live listings, and only the fields a
// visitor sees on a card (product name, shopper price, category,
// description, photo) plus the maker's name and shop. No email, phone or
// owner-only figure is ever returned here. If the tables are empty
// (before the first Manage save), the front-end falls back to its
// built-in listings, so the home page never goes blank.
import { json, sbJson, handlerFor } from "./_lib.js";

async function onGet(context) {
  try {
    const [listings, makers] = await Promise.all([
      sbJson(context, "listings?status=eq.live&select=id,maker_id,name,price,category,description,photo&order=position.asc,created_at.asc&limit=200"),
      sbJson(context, "makers?status=eq.live&select=id,name,shop_name&limit=200"),
    ]);
    const byId = Object.fromEntries((makers || []).map(m => [m.id, m]));
    const rows = (listings || []).map(l => ({
      ...l,
      maker_name: byId[l.maker_id]?.name || "",
      shop_name: byId[l.maker_id]?.shop_name || "",
    }));
    return json({ ok: true, listings: rows });
  } catch (e) {
    // Tables missing / database not set up yet: tell the front-end to
    // use its built-in listings instead of failing the page.
    return json({ ok: false, error: String(e.message || e), listings: [] }, 200);
  }
}

export const handler = handlerFor({ GET: onGet });
