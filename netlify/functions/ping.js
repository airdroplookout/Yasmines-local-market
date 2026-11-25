// Netlify Function — Yasmine's Local Market keep-alive ping (NEW).
// GET /api/ping — one cheap Supabase read, so the daily keep-alive cron
// actually counts as database activity (a plain GET to the static site
// would not touch Supabase at all, and the Free project would still pause
// after 7 days of low activity). Returns { ok: true } — no data exposed.
// The plan (§2.5) pointed the keep-alive at /api/board or /api/settings;
// neither exists in this repo (board and public payment settings were
// dropped in §2.4), so this tiny endpoint replaces them.
import { json, sbJson, handlerFor } from "./_lib.js";
async function onGet(context) {
  try {
    await sbJson(context, "settings?select=key&limit=1");
    return json({ ok: true });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ GET: onGet });
