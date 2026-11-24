# Yasmine's Local Market

A community boutique website for local Brantford makers of handmade crafts
and jewelry, run by Yasmine Tarfas (supervised by her dad, Adil).

**How it works:** a visitor browses the makers' pieces, clicks
"Reserve this item", fills in a short form (name, email, optional phone,
quantity, message), and the form is emailed to the maker. The maker replies
directly to arrange availability, the meeting/exchange, and payment.
There is **no checkout and no payment on the site** — buyers pay the maker
directly when they meet: cash, e-transfer, or tap.

## Files

- `index.html` — the whole site (shop front, reserve form, confirmation)
- `styles.css` — warm boutique styling, light & dark, mobile responsive
- `app.js` — product data, page flow, and the FormSubmit wiring
- `images/` — product photos (`.webp`)

Plain static site: HTML/CSS/JS only. No backend, no functions, no secrets,
no affiliate links, no tracking.

## Example listings — important

All makers, shops, prices and photos currently on the site are **examples
only**, labelled on the site with an "Example listing" tag and a notice
banner. They are placeholders to show how the market works. As real local
makers join, replace each example in `app.js` (the `PRODUCTS` object) with
the real maker's name, shop, price, description and photo, and remove the
example notice once every listing is real.

## Reserve form — FormSubmit (temporary)

The form currently posts to FormSubmit's AJAX endpoint
(`https://formsubmit.co/ajax/taradil@gmail.com`) and the emails land in
**taradil@gmail.com** — Adil's inbox — because no real maker emails exist
yet. This is temporary.

**Activation required:** the first time the form is submitted, FormSubmit
sends an activation email to taradil@gmail.com. The owner must click the
link in that email before any reservation email is delivered. Until then,
submissions are held. (Same flow as the AI Outlet Plus contact form.)

**When a real maker joins:** change the form destination to that maker's
email. Each maker's listings should send to their own address — either by
pointing the form at the maker's address when their product is selected, or
by giving each maker their own form endpoint. Do not leave reservations
going to taradil@gmail.com once makers are live.

## Deploying (Netlify)

1. Create the GitHub repo `airdroplookout/yasmines-local-market` and push
   these files to `main`.
2. In Netlify, add a new site from Git: pick the repo, no build command,
   publish directory = the repo root (`.`).
3. The site is then live at the Netlify address; a custom domain can be
   pointed at it later (no domain has been bought yet).

Each production deploy costs about 15 Netlify credits from the shared team
pool.

## Owner notes (not shown on the site)

- Makers pay a listing fee of **$1 per product per month** (e.g. 10 products
  = $10/month, 15 products = $15/month). This is the owner's business
  detail — it is not advertised anywhere on the site.
- Promotion: Yasmine's grandmother knows many local makers and has
  Instagram; paper notices at the library, shops, mall and stores; talking
  to vendors at local community markets.
- The scarf photo was replaced during the build: the mockup reused the mug
  photo for the scarf card by mistake. The live site uses a real moss-green
  knitted scarf photo.
