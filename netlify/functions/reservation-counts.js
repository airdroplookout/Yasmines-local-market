// Netlify Function — Yasmine's Local Market public reservation counts.
// GET /api/reservation-counts — how many reservations each live listing
// has had, so the shop can show "Sold: N" on listing cards and in the
// reserve-form summary. Public, no auth: it returns ONLY aggregate
// counts keyed by listing id (plus a name lookup for the built-in
// fallback products, which have no database id). No buyer name, email,
// message or any other reservation detail is ever returned here.
// Counts come from the reservations table: one row per reservation, so
// the count is the number of reservation rows for that listing. Rows
// with no listing attached (unknown product) are not counted for any
// listing. If the tables are missing, the front-end shows no counter
// at all rather than a guessed number.
import { json, sbJson, handlerFor } from "./_lib.js";

async function onGet(context) {
  try {
    const [listings, reservations] = await Promise.all([
      sbJson(context, "listings?select=id,name&status=eq.live&limit=200"),
      sbJson(context, "reservations?select=listing_id&listing_id=not.is.null&limit=5000"),
    ]);
    const counts = {};
    (reservations || []).forEach(function (r) {
      if (!r.listing_id) return;
      counts[r.listing_id] = (counts[r.listing_id] || 0) + 1;
    });
    const by_name = {};
    (listings || []).forEach(function (l) {
      if (l.name && counts[l.id]) by_name[l.name] = counts[l.id];
    });
    return json({ ok: true, counts, by_name });
  } catch (e) {
    // Tables missing / database not set up yet: tell the front-end to
    // show no counters instead of failing the page.
    return json({ ok: false, error: String(e.message || e), counts: {}, by_name: {} }, 200);
  }
}

export const handler = handlerFor({ GET: onGet });
