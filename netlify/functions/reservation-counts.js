// Netlify Function — Yasmine's Local Market public reservation counts.
// GET /api/reservation-counts — how many COMPLETED reservations each
// live listing has had, so the shop can show "Sold: N" on listing
// cards and in the reserve-form summary. Public, no auth: it returns
// ONLY aggregate counts keyed by listing id (plus a name lookup for
// the built-in fallback products, which have no database id). No buyer
// name, email, message or any other reservation detail is ever
// returned here.
// Honesty rule (Audit #3 N-L13): only reservations with
// status='done' count — a reservation is not a sale until the owner
// marks it done in Manage. Each buyer email counts at most once per
// listing, so repeat reservations by the same buyer do not inflate
// the number. Rows with no listing attached (unknown product) are not
// counted for any listing. If the tables are missing, the front-end
// shows no counter at all rather than a guessed number.
// Rate-limited (60/hour per IP) so the endpoint cannot be hammered
// to inflate or scrape counts; the response shape is unchanged.
import { json, sbJson, handlerFor, checkPublicRateLimit } from "./_lib.js";

async function onGet(context) {
  const allowed = await checkPublicRateLimit(context, "counts", 60, 60 * 60 * 1000);
  if (!allowed) {
    return json({ ok: false, error: "Too many requests — please try again later.", counts: {}, by_name: {} }, 429);
  }
  try {
    const [listings, reservations] = await Promise.all([
      sbJson(context, "listings?select=id,name&status=eq.live&limit=200"),
      sbJson(context, "reservations?select=listing_id,buyer_email&listing_id=not.is.null&status=eq.done&limit=5000"),
    ]);
    const counts = {};
    const seen = new Set();
    (reservations || []).forEach(function (r) {
      if (!r.listing_id) return;
      // One buyer counts once per listing (buyer_email is stored
      // lowercased at insert; lowercasing here is belt-and-braces).
      const buyer = String(r.buyer_email || "").trim().toLowerCase();
      const key = r.listing_id + "|" + buyer;
      if (seen.has(key)) return;
      seen.add(key);
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
