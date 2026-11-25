// Netlify Function — Yasmine's Local Market admin photo upload.
// POST /api/admin/upload-photo — owner only (same admin check as the
// other admin endpoints: ADMIN_API_KEY session or Manage login token).
// Accepts one image file (multipart/form-data, field "photo"), max 5 MB,
// stores it in the Supabase Storage bucket "listing-photos" (public
// read) and returns the public URL. Manage saves that URL into the
// listing's `photo` field via the existing admin-listings API.
// The upload is done by the owner in Manage — that IS the approval, so
// there is no extra approval queue, and makers have no upload access
// anywhere (no maker-facing endpoint exists for this).
import { json, requireAdmin, handlerFor } from "./_lib.js";

const BUCKET = "listing-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPE_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "photo";
}

function storageHeaders(context) {
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// Create the bucket (public) the first time it is needed. No-op when it
// already exists.
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

async function onPost(context) {
  const denied = await requireAdmin(context); if (denied) return denied;
  try {
    const form = await context.request.formData();
    const file = form.get("photo");
    if (!file || typeof file === "string" || !file.size) {
      return json({ ok: false, error: "Choose an image file to upload." }, 400);
    }
    const ext = TYPE_TO_EXT[file.type];
    if (!ext) {
      return json({ ok: false, error: "Only pictures can be uploaded (JPG, PNG, WebP, GIF or AVIF)." }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({ ok: false, error: "That picture is over 5 MB — pick a smaller one." }, 400);
    }
    const makerSlug = slugify(form.get("maker"));
    const listingSlug = slugify(form.get("listing"));
    const name = `${makerSlug}/${listingSlug ? listingSlug + "-" : ""}${Date.now()}.${ext}`;
    await ensureBucket(context);
    const buf = Buffer.from(await file.arrayBuffer());
    const base = context.env.SUPABASE_URL;
    const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: { ...storageHeaders(context), "Content-Type": file.type, "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) {
      return json({ ok: false, error: `Upload failed (HTTP ${up.status})` }, 500);
    }
    const url = `${base}/storage/v1/object/public/${BUCKET}/${name}`;
    return json({ ok: true, url, path: name });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

export const handler = handlerFor({ POST: onPost });
