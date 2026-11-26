// Netlify Function — Locally Crafted CA newsletter PDF upload.
// POST /api/admin/upload-newsletter-pdf — owner only (same admin check
// as the other admin endpoints: ADMIN_API_KEY session or Manage login
// token). Accepts one PDF file (multipart/form-data, field "pdf"),
// max 10 MB, stores it in the Supabase Storage bucket "listing-photos"
// (public read — the same bucket and setup as the listing photos,
// under the "newsletter/" folder) and returns the storage path.
// Manage keeps that path as the newsletter's attachment; the send
// function fetches the file from Storage and attaches it to every
// subscriber's email via Resend.
// PDF check: the file's first bytes must be "%PDF" — the MIME type
// alone can be spoofed. No other file type is accepted, and files are
// never stored in the database as blobs.
import { json, requireAdmin, handlerFor } from "./_lib.js";

const BUCKET = "listing-photos";
const MAX_BYTES = 10 * 1024 * 1024;

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "newsletter";
}

function storageHeaders(context) {
  const key = context.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// Create the bucket (public) the first time it is needed. No-op when it
// already exists (same helper as admin-upload-photo.js).
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
    const file = form.get("pdf");
    if (!file || typeof file === "string" || !file.size) {
      return json({ ok: false, error: "Choose a PDF file to attach." }, 400);
    }
    if (file.type && file.type !== "application/pdf") {
      return json({ ok: false, error: "Only PDF files can be attached." }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({ ok: false, error: "That PDF is over 10 MB — pick a smaller one." }, 400);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
      return json({ ok: false, error: "That file does not look like a real PDF — please pick a PDF file." }, 400);
    }
    const baseName = slugify(String(file.name || "newsletter").replace(/\.pdf$/i, ""));
    const name = `newsletter/${baseName}-${Date.now()}.pdf`;
    await ensureBucket(context);
    const base = context.env.SUPABASE_URL;
    const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST",
      headers: { ...storageHeaders(context), "Content-Type": "application/pdf", "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) {
      return json({ ok: false, error: `Upload failed (HTTP ${up.status})` }, 500);
    }
    const url = `${base}/storage/v1/object/public/${BUCKET}/${name}`;
    return json({ ok: true, url, path: name, name: file.name });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

export const handler = handlerFor({ POST: onPost });
