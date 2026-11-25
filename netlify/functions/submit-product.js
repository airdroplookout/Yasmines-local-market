// Netlify Function — Locally Crafted CA public product submission.
// POST /api/submit-product — a maker submits ONE product for review.
// Public, no auth. Nothing submitted here ever goes live on its own:
// the photo is stored, the submission is saved as status 'pending' in
// the product_submissions table, and the owner is emailed server-side
// via Resend (audit N-M4, Nov 25 2026 — the browser used to email via
// FormSubmit, which exposed the owner address in public source and
// could be POSTed to directly). The product
// only appears on the public site when the owner approves it in
// Manage > Submissions, which creates the real listing.
//
// Validation mirrors the reservation endpoint (audit M-2): lengths
// capped with 400 (never silently truncated), markup rejected,
// email max 50 chars (owner's rule). Photo: exactly ONE file, JPG /
// PNG / WebP only, max 5 MB, checked by magic bytes as well as MIME
// type (audit L-3). Rate limit: 5 submissions per hour per IP.
import { randomBytes, createHash } from "node:crypto";
import { json, sbJson, handlerFor, validEmail, checkPublicRateLimit, LISTING_CATEGORIES, LISTING_CATEGORY_LABELS, sendOwnerEmail, sendViaResend, escHtml } from "./_lib.js";

const BUCKET = "listing-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX = { maker_name: 100, business_name: 100, product_name: 120, description: 1000, price: 20, other_category: 100 };
// Magic bytes: JPEG FF D8 FF, PNG 89 50 4E 47, WebP "RIFF" + "WEBP" at offset 8.
const TYPE_TO_EXT = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
const PRICE_RE = /^\$?\d{1,6}(\.\d{1,2})?$/;

function hasMarkup(s) { return /[<>]/.test(s); }
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";
}
function storageHeaders(context) {
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}
async function ensureBucket(context) {
  const base = context.env.SUPABASE_URL;
  const headers = storageHeaders(context);
  const list = await fetch(`${base}/storage/v1/bucket`, { headers });
  if (!list.ok) throw new Error(`Storage list failed (HTTP ${list.status})`);
  const buckets = await list.json();
  if (Array.isArray(buckets) && buckets.some((b) => b.id === BUCKET || b.name === BUCKET)) return;
  const created = await fetch(`${base}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!created.ok) throw new Error(`Storage bucket create failed (HTTP ${created.status})`);
}
function magicOk(buf, type) {
  if (type === "image/jpeg" || type === "image/jpg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === "image/png") return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (type === "image/webp") return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  return false;
}

async function onPost(context) {
  // Honeypot (same as the other public forms): bots fill it, we smile
  // and pretend it worked. No row, no photo, no email. The response
  // carries honeypot:true (audit N-M1) so the browser can tell it apart
  // from a real save and skip emailing the owner.
  let form;
  try { form = await context.request.formData(); } catch { return json({ ok: false, error: "Could not read the form." }, 400); }
  if (String(form.get("_honey") || "").trim()) return json({ ok: true, honeypot: true, stored: false, url: null });

  const allowed = await checkPublicRateLimit(context, "submit", 5, 60 * 60 * 1000);
  if (!allowed) return json({ ok: false, error: "Too many submissions — please try again later." }, 429);

  const maker_name = String(form.get("maker_name") || "").trim();
  const business_name = String(form.get("business_name") || "").trim();
  const maker_email = String(form.get("maker_email") || "").trim().toLowerCase();
  const product_name = String(form.get("product_name") || "").trim();
  const category = String(form.get("category") || "").trim();
  const other_category = String(form.get("other_category") || "").trim();
  const description = String(form.get("description") || "").trim();
  const priceRaw = String(form.get("price") || "").trim();

  if (maker_name.length > MAX.maker_name) return json({ ok: false, error: "maker_name must be at most 100 characters" }, 400);
  if (business_name.length > MAX.business_name) return json({ ok: false, error: "business_name must be at most 100 characters" }, 400);
  if (product_name.length > MAX.product_name) return json({ ok: false, error: "product_name must be at most 120 characters" }, 400);
  if (description.length > MAX.description) return json({ ok: false, error: "description must be at most 1000 characters" }, 400);
  if (priceRaw.length > MAX.price) return json({ ok: false, error: "price must be at most 20 characters" }, 400);
  if (other_category.length > MAX.other_category) return json({ ok: false, error: "other_category must be at most 100 characters" }, 400);
  if (hasMarkup(maker_name) || hasMarkup(business_name) || hasMarkup(product_name) || hasMarkup(description) || hasMarkup(priceRaw) || hasMarkup(other_category)) {
    return json({ ok: false, error: "Text fields must not contain < or >" }, 400);
  }
  if (!maker_name) return json({ ok: false, error: "maker_name is required" }, 400);
  if (!business_name) return json({ ok: false, error: "business_name is required" }, 400);
  if (!validEmail(maker_email)) return json({ ok: false, error: "maker_email must be a valid email address" }, 400);
  if (!product_name) return json({ ok: false, error: "product_name is required" }, 400);
  if (!LISTING_CATEGORIES.includes(category)) return json({ ok: false, error: "category must be one of the listed craft types" }, 400);
  if (category === "other" && !other_category) return json({ ok: false, error: "other_category is required when the product type is Other — please tell us what kind of product this is" }, 400);
  if (!description) return json({ ok: false, error: "description is required" }, 400);
  if (!PRICE_RE.test(priceRaw)) return json({ ok: false, error: "price must be a number, like 28 or $28" }, 400);
  // Audit #3 N-L4: price floor $1 / cap $10,000. $0 (and $0.00) is not
  // a price — it would render as a "free" listing after approve.
  const priceNum = parseFloat(priceRaw.replace(/^\$/, ""));
  if (!Number.isFinite(priceNum) || priceNum < 1 || priceNum > 10000) return json({ ok: false, error: "price must be between $1 and $10,000" }, 400);
  const price = priceRaw.startsWith("$") ? priceRaw : "$" + priceRaw;

  // Exactly ONE photo: the form sends a single file input (no multiple),
  // and the server counts what actually arrived.
  const photos = form.getAll("photo").filter((f) => f && typeof f !== "string" && f.size > 0);
  if (photos.length === 0) return json({ ok: false, error: "Add one photo of your product." }, 400);
  if (photos.length > 1) return json({ ok: false, error: "One picture per product, please — pick your best one." }, 400);
  const file = photos[0];
  const ext = TYPE_TO_EXT[file.type];
  if (!ext) return json({ ok: false, error: "Only JPG, PNG or WebP pictures can be uploaded." }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: "That picture is over 5 MB — pick a smaller one." }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!magicOk(buf, file.type)) return json({ ok: false, error: "That file does not look like a real picture — please pick a JPG, PNG or WebP photo." }, 400);

  // Store the photo (public bucket, submissions/ prefix so it can never
  // be confused with a live listing photo).
  let url = null;
  try {
    await ensureBucket(context);
    const name = `submissions/${randomBytes(16).toString("hex")}-${slugify(maker_name)}-${slugify(product_name)}-${Date.now()}.${ext}`;
    const base = context.env.SUPABASE_URL;
    const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: { ...storageHeaders(context), "Content-Type": file.type, "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) throw new Error(`Upload failed (HTTP ${up.status})`);
    url = `${base}/storage/v1/object/public/${BUCKET}/${name}`;
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }

  // Save the submission as 'pending'. If the product_submissions table
  // does not exist yet (the owner runs its one-time SQL once — see
  // supabase/product-submissions.sql), do NOT fail the submission: the
  // owner email below is the record, and the row appears in Manage
  // once the table exists.
  let stored = false;
  let submissionId = null;
  try {
    const rows = await sbJson(context, "product_submissions", {
      method: "POST",
      body: JSON.stringify({
        maker_name, business_name, maker_email, product_name,
        category, category_label: LISTING_CATEGORY_LABELS[category] || category,
        other_category: category === "other" ? other_category : null,
        description, price, photo_url: url, status: "pending",
      }),
    });
    stored = true;
    submissionId = rows[0]?.id || null;
  } catch (e) {
    console.error("product_submissions insert failed (table may not exist yet):", String(e.message || e));
  }

  // Maker email verification (audit #3 N-M6): prove the submitter owns
  // maker_email before the owner can approve the product. A 256-bit
  // token is generated; only its SHA-256 hash + a 48-hour expiry are
  // stored, and the raw token goes out in a one-time confirmation link.
  // The submission itself is NOT failed if this step fails (the owner
  // still gets it by email, as before) — but approve refuses any
  // submission whose email_verified is false, so a failed send just
  // means that submission can never be approved until re-submitted.
  // Base URL: SITE_URL when set, else the custom domain. Do NOT use
  // siteBaseUrl() here — its fallback is the netlify.app address
  // (audit N-L11), and the confirmation link must go to the live site.
  let verificationEmailSent = false;
  if (stored && submissionId) {
    try {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await sbJson(context, `product_submissions?id=eq.${encodeURIComponent(submissionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ verify_token_hash: tokenHash, verify_expires_at: expiresAt, email_verified: false }),
      });
      const base = String(context.env.SITE_URL || "https://locallycrafted.ca").trim().replace(/\/+$/, "") || "https://locallycrafted.ca";
      const verifyUrl = `${base}/verify-submission.html?token=${token}`;
      const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px">`
        + `<p>Hi ${escHtml(maker_name)},</p>`
        + `<p>Thanks for submitting <strong>${escHtml(product_name)}</strong> to Locally Crafted CA. Please confirm this email address so we can review your product:</p>`
        + `<p><a href="${verifyUrl}" style="display:inline-block;background:#BC4A24;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirm my email</a></p>`
        + `<p>This link works once and expires in 48 hours. If you did not submit a product, ignore this email — nothing will be listed.</p>`
        + `</body></html>`;
      await sendViaResend(context, {
        to: maker_email,
        subject: "Confirm your email — Locally Crafted CA",
        html,
      });
      verificationEmailSent = true;
    } catch (e) {
      // Token store or Resend failed (e.g. verification columns not
      // run yet, or RESEND_API_KEY not set). Logged server-side; the
      // submission itself still stands, but approve will refuse it
      // until the maker re-submits after the fix.
      console.error("submission verification email NOT sent:", String(e.message || e));
    }
  }

  // Owner notification, server-side via Resend (audit N-M4). Sent
  // whether or not the row was stored: when the table does not exist
  // yet this email is the only record, as the browser email used to
  // be. A failed send never fails the submission — the row (when
  // stored) is the record, and emailed:false tells the browser the
  // notification did not go through.
  let emailed = false;
  try {
    const categoryLabel = LISTING_CATEGORY_LABELS[category] || category;
    const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px">
<p>New product submission on Locally Crafted CA${submissionId ? ` (ID ${escHtml(submissionId)})` : ""}.</p>
<table style="border-collapse:collapse">
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Maker</td><td>${escHtml(maker_name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Business</td><td>${escHtml(business_name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Maker email</td><td>${escHtml(maker_email)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Product</td><td>${escHtml(product_name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Type</td><td>${escHtml(categoryLabel)}${category === "other" ? ` (${escHtml(other_category)})` : ""}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Price</td><td>${escHtml(price)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Description</td><td>${escHtml(description)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Photo</td><td><a href="${escHtml(url || "")}">${escHtml(url || "(photo upload failed)")}</a></td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:600">Saved in Manage</td><td>${stored ? "Yes (pending review)" : "No — table not set up yet, this email is the record"}</td></tr>
</table></body></html>`;
    await sendOwnerEmail(context, `New product submission — ${product_name} (${price})`, html);
    emailed = true;
  } catch (e) {
    console.error("SUBMIT_EMAIL_FAIL:", String(e.message || e));
  }
  return json({ ok: true, stored, id: submissionId, url, emailed, category_label: LISTING_CATEGORY_LABELS[category] || category, verification_email_sent: verificationEmailSent });
}

export const handler = handlerFor({ POST: onPost });
