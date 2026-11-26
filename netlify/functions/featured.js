// Netlify Function — Yasmine's Local Market featured maker feed.
// GET /api/featured — the home page "Featured maker" box, as saved in
// Manage. Public, no auth: it returns ONLY the featured_maker settings
// row (heading, maker line, description, button text/link, photo) —
// never emails, passwords or other settings. When nothing has been
// saved yet (or the row is unreadable) it returns featured: null and
// the home page keeps its hardcoded Mary Stones content.
import { json, sbJson, handlerFor } from "./_lib.js";

async function onGet(context) {
  try {
    const rows = await sbJson(context, "settings?select=value&key=eq.featured_maker&limit=1");
    const raw = rows && rows[0] && rows[0].value;
    if (!raw) return json({ ok: true, featured: null });
    let featured = null;
    try { featured = JSON.parse(raw); } catch (e) { featured = null; }
    if (!featured || typeof featured !== "object" || Array.isArray(featured)) return json({ ok: true, featured: null });
    return json({ ok: true, featured });
  } catch (e) {
    return json({ ok: true, featured: null });
  }
}

export const handler = handlerFor({ GET: onGet });
