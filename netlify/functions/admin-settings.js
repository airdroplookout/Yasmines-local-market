// Netlify Function — Yasmine's Local Market owner settings.
// Adapted from airdroplookout/airdrop-lookout (Nov 2026).
// POST /api/admin/settings — save owner settings. Owner only.
// Allowlist only: { notification_email, sender_email, site_domain }.
// Anything else in the body is ignored — no payment keys exist here.
import { json, sbJson, requireAdmin, handlerFor } from "./_lib.js";
const ALLOWED = ["notification_email", "sender_email", "site_domain"];
async function onPost(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const b = await context.request.json();
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      if (!ALLOWED.includes(k)) continue;
      await sbJson(context, "settings?on_conflict=key", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key: k, value: String(v) }),
      });
    }
    return json({ ok: true });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ POST: onPost });
