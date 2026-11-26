// Netlify Function — Yasmine's Local Market owner settings.
// Adapted from airdroplookout/airdrop-lookout (Nov 2026).
// POST /api/admin/settings — save owner settings. Owner only.
// Allowlist only: { notification_email, sender_email, site_domain,
// featured_maker } — the last is the home page "Featured maker" box,
// saved from Manage as one JSON object and read back by the public
// GET /api/featured. Anything else in the body is ignored — no payment
// keys exist here.
import { json, sbJson, requireAdmin, handlerFor } from "./_lib.js";
const ALLOWED = ["notification_email", "sender_email", "site_domain", "featured_maker"];

// Validate the featured-maker object before it is stored: text fields
// must not contain markup (audit H-1), lengths are capped, and URLs
// must be plain relative paths or https links — never javascript:/data:.
function cleanFeatured(raw) {
  let f;
  try { f = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return { error: "featured_maker must be valid JSON" }; }
  if (!f || typeof f !== "object" || Array.isArray(f)) return { error: "featured_maker must be an object" };
  const text = (k, max) => {
    const v = f[k] === undefined || f[k] === null ? "" : String(f[k]).trim();
    if (/[<>]/.test(v)) return { error: `${k} must not contain < or >` };
    return v.slice(0, max);
  };
  const url = (k) => {
    const v = f[k] === undefined || f[k] === null ? "" : String(f[k]).trim();
    if (!v) return "";
    if (/^(javascript|data|vbscript):/i.test(v)) return { error: `${k} must be a plain link, not a script` };
    if (v.startsWith("/") || v.startsWith("./") || v.startsWith("#") || /^https?:\/\//i.test(v) || /^[a-z0-9._\-\/]+$/i.test(v)) return v.slice(0, 500);
    return { error: `${k} must be a plain link` };
  };
  const heading = text("heading", 120);
  if (heading && typeof heading === "object") return heading;
  const makerLine = text("maker_line", 120);
  if (makerLine && typeof makerLine === "object") return makerLine;
  const description = text("description", 500);
  if (description && typeof description === "object") return description;
  const buttonText = text("button_text", 60);
  if (buttonText && typeof buttonText === "object") return buttonText;
  const makerName = text("maker_name", 80);
  if (makerName && typeof makerName === "object") return makerName;
  const shopName = text("shop_name", 80);
  if (shopName && typeof shopName === "object") return shopName;
  const initials = text("badge_initials", 4);
  if (initials && typeof initials === "object") return initials;
  const buttonUrl = url("button_url");
  if (buttonUrl && typeof buttonUrl === "object") return buttonUrl;
  const photo = url("photo");
  if (photo && typeof photo === "object") return photo;
  const badgeLogo = url("badge_logo");
  if (badgeLogo && typeof badgeLogo === "object") return badgeLogo;
  if (!heading) return { error: "featured_maker needs a heading" };
  return { value: JSON.stringify({
    maker_id: String(f.maker_id || "").slice(0, 80),
    maker_name: makerName, shop_name: shopName, heading,
    maker_line: makerLine, description, button_text: buttonText,
    button_url: buttonUrl, photo, badge_initials: initials, badge_logo: badgeLogo,
  }) };
}
async function onPost(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const b = await context.request.json();
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      if (!ALLOWED.includes(k)) continue;
      if (k === "featured_maker") {
        const cleaned = cleanFeatured(v);
        if (cleaned.error) return json({ ok: false, error: cleaned.error }, 400);
        await sbJson(context, "settings?on_conflict=key", {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ key: k, value: cleaned.value }),
        });
        continue;
      }
      await sbJson(context, "settings?on_conflict=key", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key: k, value: String(v) }),
      });
    }
    return json({ ok: true });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
}

export const handler = handlerFor({ POST: onPost });
