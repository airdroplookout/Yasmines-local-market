// Netlify Function — Yasmine's Local Market Manage overview.
// Adapted from velvet-pearl-repo/admin-overview.js (Nov 2026): makers,
// listings and reservations instead of subscribers, issues and ads.
// GET /api/admin/overview — everything Manage needs in one call. Owner only.
import { json, sbJson, requireAdmin, handlerFor, torontoToday, addDaysIso } from "./_lib.js";
async function onGet(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const [makers, listings, reservations, submissions, settingsRows, pageViews] = await Promise.all([
      sbJson(context, "makers?order=position.asc,created_at.asc&limit=200"),
      sbJson(context, "listings?order=position.asc,created_at.asc&limit=500"),
      sbJson(context, "reservations?order=created_at.desc&limit=500"),
      // Product submissions (Submit a Product form): missing table
      // (before its one-time SQL is run) must not break Manage.
      sbJson(context, "product_submissions?order=created_at.desc&limit=500").catch(() => []),
      // Only the keys Manage displays — never the password hash, reset-token
      // hash, lockout state or session version (audit M-5).
      sbJson(context, "settings?select=key,value&key=in.(notification_email,sender_email,site_domain)"),
      // Visits card: one row per day. Missing table (before it is created)
      // must not break Manage — fall back to an empty list.
      sbJson(context, "page_views?select=day,views&order=day.asc&limit=800").catch(() => []),
    ]);
    const liveMakers = makers.filter(m => m.status === "live").length;
    const liveListings = listings.filter(l => l.status === "live").length;
    const newReservations = reservations.filter(r => r.status === "new").length;
    const pendingSubmissions = (submissions || []).filter(s => s.status === "pending").length;
    // Visits: today / this week (Monday–Sunday) / this month / this year,
    // all by Toronto dates. Counts start the day the card was added.
    const today = torontoToday();
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    const monday = addDaysIso(today, -((dow + 6) % 7));
    const sunday = addDaysIso(monday, 6);
    const sum = (pred) => (pageViews || []).filter(pred).reduce((a, r) => a + (r.views || 0), 0);
    const visits = {
      today: sum(r => r.day === today),
      week: sum(r => r.day >= monday && r.day <= sunday),
      month: sum(r => r.day.startsWith(today.slice(0, 7))),
      year: sum(r => r.day.startsWith(today.slice(0, 4))),
    };
    return json({ ok: true, makers, listings, reservations, submissions: submissions || [], visits,
      settings: Object.fromEntries(settingsRows.map(r => [r.key, r.value])),
      live_makers: liveMakers,
      live_listings: liveListings,
      new_reservations: newReservations,
      pending_submissions: pendingSubmissions });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ GET: onGet });
