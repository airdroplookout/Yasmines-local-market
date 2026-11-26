/* Locally Crafted CA — shop logic.
   The reserve form saves to the database via POST /api/reserve, which
   is the source of truth (audit N-M4/N-M5, Nov 25 2026): the server
   stores the row in Manage > Reservations AND emails the owner
   server-side via Resend, and the browser awaits its answer — the
   confirmation screen shows only when the server says ok. The old
   design fired the save fire-and-forget and emailed the owner from
   the browser via FormSubmit, so an email could go out even when the
   save failed (or was rate-limited), and a reservation could exist
   in the inbox but not in Manage. That leg is gone. */

/* Vendor registry — one entry per maker.
   page: the vendor's own shop page on this site (null for makers
   who don't have one yet — their badge shows but is not a link).
   logo:  logos/<vendor-slug>.png (or .webp). If the file is missing, the
   badge falls back to the monogram (initials in a small circle) — never a
   broken image. To add a real logo: save the vendor's file as
   logos/<slug>.png and set logo: "logos/<slug>.png" here. */
var VENDORS = {
  "mary-stones": { name: "Mary Stones", shop: "Mary's Pottery", initials: "MS", page: "mary-stones.html", logo: "logos/mary-stones.png" },
  rosa:    { name: "Rosa M.", shop: "Rosa’s Pottery Corner", initials: "RM", page: null, logo: "logos/rosa.png" },
  fatima:  { name: "Fatima K.", shop: "Fatima’s Knits", initials: "FK", page: null, logo: "logos/fatima.png" },
  layla:   { name: "Layla H.", shop: "Layla Beads", initials: "LH", page: null, logo: "logos/layla.png" },
  emma:    { name: "Emma T.", shop: "Emma’s Little Light Co.", initials: "ET", page: null, logo: "logos/emma.png" },
  grace:   { name: "Grace O.", shop: "Grace Sews", initials: "GO", page: null, logo: "logos/grace.png" },
  nguyen:  { name: "The Nguyen Family", shop: "Nguyen Family Apiary", initials: "NF", page: null, logo: "logos/nguyen.png" }
};

/* Tiny vendor-logo badge for a listing card. Links to the vendor's own
   shop page when they have one; otherwise a plain (unlinked) monogram. */
/* Escape text interpolated into HTML (listing cards). Same five-character
   map as manage.js esc() — audit H-1. */
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function vendorBadge(p) {
  var v = VENDORS[p.vendor];
  if (!v) return "";
  var inner = '<span class="vendor-mono" aria-hidden="true">' + esc(v.initials) + '</span>' +
    '<img src="' + esc(v.logo) + '" alt="" loading="lazy" data-remove-on-error />';
  if (v.page) {
    return '<a class="vendor-badge" href="' + esc(v.page) + '" title="See all from ' + esc(v.name) + '" aria-label="See all from ' + esc(v.name) + '">' + inner + '</a>';
  }
  return '<span class="vendor-badge" title="' + esc(v.shop) + '">' + inner + '</span>';
}

var PRODUCTS = {
  mug: { category: "pottery", vendor: "rosa", name: "Sea-Glass Stoneware Mug", maker: "Rosa M.", shop: "Rosa’s Pottery Corner", price: "$28", img: "images/mug-grid.webp", alt: "Hand-thrown stoneware mug in a soft sea-glass blue glaze", desc: "Hand-thrown and glazed in small batches — every mug a little different. Dishwasher-friendly and made for a generous cup of tea." },
  scarf: { category: "textiles", vendor: "fatima", name: "Chunky Knit Scarf — Moss Green", maker: "Fatima K.", shop: "Fatima’s Knits", price: "$35", img: "images/scarf.webp", alt: "Thick hand-knitted scarf in moss green draped around a display bust", desc: "Knitted by hand in a soft, chunky yarn. Long enough to wrap twice — made for cold winters." },
  necklace: { category: "jewelry", vendor: "layla", name: "Rainbow Beaded Choker", maker: "Layla H.", shop: "Layla Beads", price: "$22", img: "images/necklace.webp", alt: "Colourful hand-beaded choker necklace on a black display bust", desc: "Hundreds of tiny seed beads woven by hand into a bright, cheerful choker. Adjustable clasp." },
  candle: { category: "other", vendor: "emma", name: "Vanilla & Cedar Soy Candle", maker: "Emma T.", shop: "Emma’s Little Light Co.", price: "$18", img: "images/candle.webp", alt: "Lit soy candle in a clear glass jar", desc: "Hand-poured soy wax with a warm vanilla and cedar scent. About 35 hours of burn time." },
  tote: { category: "textiles", vendor: "grace", name: "Canvas Market Tote", maker: "Grace O.", shop: "Grace Sews", price: "$20", img: "images/tote.webp", alt: "Row of sturdy handmade canvas tote bags in many colours held up outdoors", desc: "Heavy-duty canvas, sewn to carry a full market shop. Pick your colour when you reserve — red, blue, teal, green, natural and more." },
  honey: { category: "other", vendor: "nguyen", name: "Wildflower Honey — Small Jar", maker: "The Nguyen Family", shop: "Nguyen Family Apiary", price: "$9", img: "images/honey.webp", alt: "Small hexagonal glass jar of golden honey with a gold lid on wood", desc: "Raw wildflower honey from hives just outside town. This little jar is perfect for gifts and first tastes." },
  /* Mary Stones — Mary's Pottery (first real maker) */
  "mary-mug": { category: "pottery", vendor: "mary-stones", name: "Speckled Stoneware Mug", maker: "Mary Stones", shop: "Mary's Pottery", price: "$32", img: "images/mary-mug.webp", alt: "Hand-thrown stoneware mug in a soft sage-green speckled glaze", desc: "Hand-thrown mug in a soft speckled glaze — every one a little different. Holds a generous cup of tea or coffee." },
  "mary-bowl": { category: "pottery", vendor: "mary-stones", name: "Rustic Serving Bowl", maker: "Mary Stones", shop: "Mary's Pottery", price: "$48", img: "images/mary-bowl.webp", alt: "Handmade stoneware serving bowl in muted olive-green and grey glaze", desc: "A generous hand-thrown bowl in warm earth tones, made for salads, pasta, and family dinners." },
  "mary-vase": { category: "pottery", vendor: "mary-stones", name: "Hand-thrown Vase", maker: "Mary Stones", shop: "Mary's Pottery", price: "$65", img: "images/mary-vase.webp", alt: "Tall handmade ceramic vase in creamy white glaze on a wooden table", desc: "A tall, graceful vase in creamy white glaze with a soft matte finish. Made for fresh flowers — or lovely standing on its own." },
  "mary-plate": { category: "pottery", vendor: "mary-stones", name: "Speckled Dinner Plate", maker: "Mary Stones", shop: "Mary's Pottery", price: "$38", img: "images/mary-plate.webp", alt: "Stack of handmade speckled ceramic dinner plates in blue and white", desc: "A sturdy hand-thrown dinner plate with a speckled glaze — no two exactly alike. Dishwasher-friendly." },
  "mary-planter": { category: "pottery", vendor: "mary-stones", name: "Ribbed Stoneware Planter", maker: "Mary Stones", shop: "Mary's Pottery", price: "$42", img: "images/mary-planter.webp", alt: "Handmade ribbed stoneware planter with matching saucer in grey-blue and terracotta", desc: "A ribbed stoneware planter with a matching saucer, glazed in soft grey-blue with a terracotta rim." },
  "mary-teapot": { category: "pottery", vendor: "mary-stones", name: "Hand-thrown Teapot", maker: "Mary Stones", shop: "Mary's Pottery", price: "$85", img: "images/mary-teapot.webp", alt: "Handmade ceramic teapot in a bold red and amber swirl glaze", desc: "A one-of-a-kind teapot in a bold red and amber glaze with hand-painted swirls. Brews about four cups." },
  "mary-butter": { category: "pottery", vendor: "mary-stones", name: "Lidded Butter Dish", maker: "Mary Stones", shop: "Mary's Pottery", price: "$36", img: "images/mary-butter.webp", alt: "Handmade stoneware butter dish with a blue-grey domed lid", desc: "A stoneware butter dish with a fitted lid in soft blue-grey glaze. Keeps butter fresh on the counter." },
  "mary-spoon": { category: "pottery", vendor: "mary-stones", name: "Ceramic Spoon Rest", maker: "Mary Stones", shop: "Mary's Pottery", price: "$28", img: "images/mary-spoon.webp", alt: "Long speckled ceramic spoon rest holding a wooden spoon on a kitchen counter", desc: "A long speckled spoon rest that keeps drips off the counter — fits a wooden spoon or a ladle." },
  "mary-candle": { category: "pottery", vendor: "mary-stones", name: "Stoneware Candle Holder", maker: "Mary Stones", shop: "Mary's Pottery", price: "$30", img: "images/mary-candle.webp", alt: "Handmade stoneware candle holder with a pillar candle", desc: "A hand-thrown candle holder with a warm brown glaze and a little handle. Fits a standard pillar candle." },
  "mary-platter": { category: "pottery", vendor: "mary-stones", name: "Serving Platter", maker: "Mary Stones", shop: "Mary's Pottery", price: "$58", img: "images/mary-platter.webp", alt: "Wide handmade ceramic serving platter in soft earth tones", desc: "A wide hand-thrown serving platter, perfect for roasts, bread, or a spread of cheese." }
};
var current = window.PAGE_PRODUCTS ? window.PAGE_PRODUCTS[0] : "mug";

/* Live listings from the database (/api/listings). On the front page the
   grid is built from these real listings; the built-in PRODUCTS above
   stay as a fallback so the shop never shows empty, and maker pages
   (window.PAGE_PRODUCTS) keep using them. */
var LIVE_PRODUCTS = null; /* id -> product-shaped entry, once loaded */

function productById(id) {
  return (LIVE_PRODUCTS && LIVE_PRODUCTS[id]) || PRODUCTS[id];
}

function initialsFor(name) {
  var parts = (name || "?").trim().split(/\s+/);
  var first = parts[0] ? parts[0].charAt(0) : "?";
  var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

function vendorSlugForName(name) {
  var key;
  for (key in VENDORS) {
    if (VENDORS[key].name.toLowerCase() === (name || "").toLowerCase()) return key;
  }
  return null;
}

/* Badge for a live listing: link to the maker's own page when we know it,
   otherwise a plain monogram with the maker's initials. */
function liveBadge(p) {
  var v = p.vendor ? VENDORS[p.vendor] : null;
  var initials = v ? v.initials : initialsFor(p.maker);
  var inner = '<span class="vendor-mono" aria-hidden="true">' + esc(initials) + '</span>';
  if (v && v.page) {
    return '<a class="vendor-badge" href="' + esc(v.page) + '" title="See all from ' + esc(v.name) + '" aria-label="See all from ' + esc(v.name) + '">' + inner + '</a>';
  }
  return '<span class="vendor-badge" title="' + esc(p.shop) + '">' + inner + '</span>';
}

/* Small inline placeholder picture (data URI) for listings with no photo,
   used in the reserve-form product summary. */
function photoPlaceholder(initials) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#FFF7EE"/><text x="200" y="175" font-family="Georgia,serif" font-size="110" font-weight="bold" fill="#4F7A4A" text-anchor="middle">' + initials + '</text></svg>';
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function mapListing(l) {
  return {
    live: true,
    listing_id: l.id,
    maker_id: l.maker_id || null,
    vendor: vendorSlugForName(l.maker_name),
    name: l.name,
    maker: l.maker_name,
    shop: l.shop_name,
    price: l.price,
    img: l.photo || null,
    alt: l.name,
    desc: l.description || "",
    category: l.category || ""
  };
}

/* "Sold: N" reservation counters — how many reservations each listing
   has had, from the database via GET /api/reservation-counts (counts
   keyed by database listing id, plus a name lookup for the built-in
   fallback products, which have no database id). The counts arrive
   after the grid renders, so cards carry a hidden placeholder that is
   filled in when the counts load. A listing with no count, or zero
   reservations, shows nothing — never a guessed number, never
   "Sold: 0". */
var SOLD_COUNTS = null; /* { counts: {...}, by_name: {...} } once loaded */

function soldKeyFor(p) {
  if (!p) return null;
  if (p.listing_id) return "id:" + p.listing_id;
  if (p.name) return "name:" + p.name;
  return null;
}

function soldCountByKey(key) {
  if (!SOLD_COUNTS || !key) return null;
  var i = key.indexOf(":");
  var kind = key.slice(0, i);
  var val = key.slice(i + 1);
  if (kind === "id") return SOLD_COUNTS.counts[val] || 0;
  if (kind === "name") return SOLD_COUNTS.by_name[val] || 0;
  return null;
}

function soldCountFor(p) {
  return soldCountByKey(soldKeyFor(p));
}

/* Counter HTML for a listing card: the real "Sold: N" when the counts
   are loaded and N is at least 1; a hidden placeholder (filled in by
   applySoldCounts) while the counts are still loading; nothing at all
   when the counts are loaded and this listing has none. */
function soldHtml(p) {
  var key = soldKeyFor(p);
  if (!key) return "";
  var n = soldCountByKey(key);
  if (n === null) return '<p class="sold-count" data-sold-key="' + esc(key) + '" hidden></p>';
  if (n >= 1) return '<p class="sold-count">Sold: ' + n + '</p>';
  return "";
}

/* Fill in every counter placeholder once the counts have loaded. */
function applySoldCounts() {
  document.querySelectorAll("[data-sold-key]").forEach(function (el) {
    var n = soldCountByKey(el.getAttribute("data-sold-key"));
    if (n === null) return;
    if (n >= 1) {
      el.textContent = "Sold: " + n;
      el.hidden = false;
    } else {
      el.remove();
    }
  });
  /* The reserve-form summary shows the currently selected product. */
  var summary = document.getElementById("ps-sold");
  if (summary) {
    var p = productById(current);
    var n = soldCountFor(p);
    if (n !== null && n >= 1) {
      summary.textContent = "Sold: " + n;
      summary.hidden = false;
    } else {
      summary.hidden = true;
    }
  }
}

/* Load the counts once per page view — best-effort, like the visits
   counter: a failure just means no counters are shown. */
(function loadSoldCounts() {
  fetch("/api/reservation-counts")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data || !data.ok) return;
      SOLD_COUNTS = { counts: data.counts || {}, by_name: data.by_name || {} };
      applySoldCounts();
    })
    .catch(function () { /* no counters — never break the shop */ });
})();

/* Build the product grid — a page may define window.PAGE_PRODUCTS to show only its own items.
   Front-page category pills (#cat-pills) filter whatever is loaded (live
   listings or the built-in fallback) by the listing's category slug. */
(function buildGrid() {
  var grid = document.getElementById("product-grid");
  if (!grid) return;
  var defaultOrder = ["scarf", "necklace", "candle", "tote", "honey", "mug",
    "mary-mug", "mary-bowl", "mary-vase", "mary-plate", "mary-planter",
    "mary-teapot", "mary-butter", "mary-spoon", "mary-candle", "mary-platter"];
  var activeCategory = "all";
  var currentPage = 1;
  var PAGE_SIZE = 15; /* 5 per row x 3 rows per page */
  var currentItems = []; /* [{id, product}] currently loaded (live or fallback) */

  function categoryLabel(cat) {
    var labels = {pottery: "Pottery", jewelry: "Jewelry", homeware: "Homeware", textiles: "Textiles", art: "Art", "cards-stationery": "Cards & Stationery", "clothing-accessories": "Clothing & Accessories", weddings: "Weddings", "craft-supplies": "Craft Supplies", "christmas-gifts": "Christmas Gifts", other: "Other"};
    return labels[cat] || cat;
  }

  function renderCard(id, p) {
    var card = document.createElement("article");
    card.className = "card";
    var badge = p.live ? liveBadge(p) : vendorBadge(p);
    var photo = p.img
      ? '<img src="' + esc(p.img) + '" alt="' + esc(p.alt) + '" loading="lazy" />'
      : '<div class="card-photo-ph" aria-hidden="true"><span>' + esc(initialsFor(p.maker)) + '</span></div>';
    var title = esc(p.name);
    var vendorPage = p.vendor && VENDORS[p.vendor] && VENDORS[p.vendor].page;
    card.innerHTML =
      badge + photo +
      '<div class="card-body">' +
        '<h3>' + title + '</h3>' +
        '<p class="maker">by ' + esc(p.maker) + ' — ' + esc(p.shop) + '</p>' +
        soldHtml(p) +
        '<p class="desc">' + esc(p.desc) + '</p>' +
        '<div class="card-row"><p class="price-sm">' + esc(p.price) + '</p>' +
        '<button class="btn btn-primary" data-reserve="' + esc(id) + '">Reserve this item</button></div>' +
        (vendorPage ? '<p class="vendor-link"><a class="see-all-chip" href="' + esc(VENDORS[p.vendor].page) + '"><span class="see-all-mono" aria-hidden="true">' + esc(VENDORS[p.vendor].initials || initialsFor(p.maker)) + '</span>See all from ' + esc(VENDORS[p.vendor].name) + ' →</a></p>' : '') +
      '</div>';
    /* Broken vendor-logo images remove themselves (was inline onerror). */
    card.querySelectorAll("img[data-remove-on-error]").forEach(function (img) {
      img.addEventListener("error", function () { img.remove(); });
    });
    grid.appendChild(card);
  }

  /* Pagination — 15 listings per page (5 per row x 3 rows). The bar is
     only shown when there is more than one page; with 15 or fewer
     listings the grid looks exactly as it did before. */
  var pager = document.getElementById("pagination");

  function renderPagination(totalPages) {
    if (!pager) return;
    pager.innerHTML = "";
    if (totalPages <= 1) { pager.hidden = true; return; }
    pager.hidden = false;
    function pageBtn(label, page, opts) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "page-btn" + (opts && opts.current ? " current" : "");
      b.textContent = label;
      if (opts && opts.label) b.setAttribute("aria-label", opts.label);
      if (opts && opts.current) b.setAttribute("aria-current", "page");
      b.disabled = !!(opts && opts.disabled);
      b.addEventListener("click", function () { goToPage(page); });
      pager.appendChild(b);
    }
    pageBtn("← Previous", currentPage - 1, { disabled: currentPage <= 1, label: "Previous page" });
    var p;
    for (p = 1; p <= totalPages; p++) {
      pageBtn(String(p), p, { current: p === currentPage, label: "Page " + p });
    }
    pageBtn("Next →", currentPage + 1, { disabled: currentPage >= totalPages, label: "Next page" });
  }

  function goToPage(page) {
    var items = activeCategory === "all"
      ? currentItems
      : currentItems.filter(function (it) { return (it.product.category || "") === activeCategory; });
    var totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    if (page === currentPage) return;
    currentPage = page;
    renderItems(items);
    var head = document.getElementById("collection");
    if (head && head.scrollIntoView) head.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderItems(items) {
    grid.innerHTML = "";
    if (!items.length) {
      var msg = document.createElement("div");
      msg.className = "grid-empty";
      msg.textContent = activeCategory === "all"
        ? "No listings yet — check back soon."
        : "No " + categoryLabel(activeCategory).toLowerCase() + " listings yet — check back soon.";
      grid.appendChild(msg);
      renderPagination(1);
      return;
    }
    var totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    items.slice(start, start + PAGE_SIZE).forEach(function (it) { renderCard(it.id, it.product); });
    renderPagination(totalPages);
  }

  function applyCategoryFilter() {
    var items = activeCategory === "all"
      ? currentItems
      : currentItems.filter(function (it) { return (it.product.category || "") === activeCategory; });
    renderItems(items);
  }

  function renderBuiltIn(order) {
    currentItems = order.map(function (id) { return {id: id, product: PRODUCTS[id]}; })
      .filter(function (it) { return !!it.product; });
    applyCategoryFilter();
  }

  grid.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-reserve]");
    if (btn) selectProduct(btn.getAttribute("data-reserve"));
  });

  /* Category pills (front page only — maker pages have no pill row). */
  var pills = document.querySelectorAll("#cat-pills [data-cat]");
  pills.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeCategory = btn.getAttribute("data-cat");
      currentPage = 1;
      pills.forEach(function (b) { b.classList.toggle("active", b === btn); });
      applyCategoryFilter();
    });
  });

  /* Maker pages keep their built-in list. */
  if (window.PAGE_PRODUCTS) {
    renderBuiltIn(window.PAGE_PRODUCTS);
    return;
  }

  /* Front page: live listings from the database, built-in list as fallback. */
  fetch("/api/listings")
    .then(function (res) { return res.json(); })
    .then(function (json) {
      var listings = (json && json.listings) || [];
      if (!json || !json.ok || !listings.length) {
        renderBuiltIn(defaultOrder);
        return;
      }
      LIVE_PRODUCTS = {};
      currentItems = [];
      listings.forEach(function (l) {
        var p = mapListing(l);
        LIVE_PRODUCTS[l.id] = p;
        currentItems.push({id: l.id, product: p});
      });
      current = listings[0].id;
      applyCategoryFilter();
    })
    .catch(function () {
      renderBuiltIn(defaultOrder);
    });
})();

/* Featured maker — data-driven from Manage (Nov 2026). The homepage
   ships with Mary Stones hardcoded above as the fallback; when the
   owner saves a Featured maker in Manage, GET /api/featured returns it
   and this swaps the section in place — no redeploy needed. A missing
   or failed feed leaves the hardcoded Mary content exactly as it is.
   Text goes in via textContent and links via setAttribute, never
   innerHTML, so saved markup can never run here (audit H-1). */
(function applyFeatured() {
  var box = document.getElementById("featured-maker");
  if (!box) return;
  function safeUrl(u) {
    var s = String(u || "").trim();
    if (!s) return null;
    if (/^(javascript|data|vbscript):/i.test(s)) return null;
    if (s.indexOf("/") === 0 || s.indexOf("./") === 0 || s.indexOf("#") === 0) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z0-9._\-\/]+$/i.test(s) && s.indexOf("..") === -1) return s; /* bare relative path, e.g. mary-stones.html */
    return null;
  }
  function setTextEl(id, val) { var el = document.getElementById(id); if (el && val) el.textContent = val; }
  fetch("/api/featured")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var f = data && data.featured;
      if (!f || typeof f !== "object") return;
      setTextEl("fm-heading", f.heading);
      setTextEl("fm-maker-line", f.maker_line);
      setTextEl("fm-desc", f.description);
      var btn = document.getElementById("fm-button");
      if (btn) {
        if (f.button_text) {
          /* Rebuild the button keeping its monogram chip (same chip as
             the listing cards): text via textContent, never innerHTML. */
          while (btn.firstChild) btn.removeChild(btn.firstChild);
          if (f.badge_initials) {
            var mono = document.createElement("span");
            mono.className = "see-all-mono";
            mono.setAttribute("aria-hidden", "true");
            mono.textContent = f.badge_initials;
            btn.appendChild(mono);
          }
          btn.appendChild(document.createTextNode(f.button_text));
        }
        var url = safeUrl(f.button_url);
        if (url) btn.setAttribute("href", url);
      }
      var photo = document.getElementById("fm-photo");
      if (photo) {
        var img = safeUrl(f.photo);
        if (img) {
          photo.setAttribute("src", img);
          photo.setAttribute("alt", (f.heading || "Featured maker") + " — featured piece");
        }
      }
      var badge = document.getElementById("fm-badge");
      var badgeImg = document.getElementById("fm-badge-img");
      var badgeMono = document.getElementById("fm-badge-mono");
      if (badge) {
        var burl = safeUrl(f.button_url);
        if (burl) {
          badge.setAttribute("href", burl);
          badge.setAttribute("title", "See all from " + (f.maker_name || "this maker"));
          badge.setAttribute("aria-label", "See all from " + (f.maker_name || "this maker"));
        }
      }
      if (badgeImg) {
        var logo = safeUrl(f.badge_logo);
        if (logo) { badgeImg.setAttribute("src", logo); badgeImg.style.display = ""; }
        else badgeImg.remove();
      }
      if (badgeMono && f.badge_initials) badgeMono.textContent = f.badge_initials;
    })
    .catch(function () { /* keep the hardcoded fallback — never break the shop */ });
})();

/* Safe element setters — a missing element must never kill Reserve.
   ROOT CAUSE, Nov 25 2026: Audit #3 removed the old FormSubmit
   _subject hidden input (id="h-subject") from index.html and
   mary-stones.html, but app.js still wrote to it in selectProduct()
   and selectProductDefaults(). Every Reserve click then died with
   "Cannot set properties of null (setting 'value')" at the h-subject
   line, before showView(2) — so the form never opened and the click
   did nothing, silently. These helpers make any future missing
   element a no-op instead of a crash. */
function setText(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
function setVal(id, val) { var el = document.getElementById(id); if (el) el.value = val; }
function setSrc(id, val) { var el = document.getElementById(id); if (el) el.src = val; }
function setAlt(id, val) { var el = document.getElementById(id); if (el) el.alt = val; }

function showView(n) {
  [1, 2, 3].forEach(function (i) {
    var v = document.getElementById("view-" + i);
    if (v) v.classList.toggle("active", i === n);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectProduct(id) {
  current = id;
  var p = productById(id);
  if (!p) return;
  setSrc("ps-img", id === "mug" ? "images/mug.webp" : (p.img || photoPlaceholder(initialsFor(p.maker))));
  setAlt("ps-img", p.alt);
  setText("ps-name", p.name);
  setText("ps-maker", "by " + p.maker + " — " + p.shop);
  setText("ps-price", p.price);
  var soldEl = document.getElementById("ps-sold");
  if (soldEl) {
    var soldN = soldCountFor(p);
    if (soldN !== null && soldN >= 1) {
      soldEl.textContent = "Sold: " + soldN;
      soldEl.hidden = false;
    } else {
      soldEl.hidden = true;
    }
  }
  setVal("h-product", p.name);
  setVal("h-maker", p.maker + " — " + p.shop);
  setVal("h-price", p.price);
  /* NOTE: do NOT write to h-subject here — the old FormSubmit _subject
     hidden input was removed from the pages in Audit #3, and the
     server-side /api/reserve takes no subject, so nothing is lost. */
  showView(2);
}

/* Buttons/links with data-showview="n" switch views (replaces inline
   onclick="showView(n)" so an enforced CSP can run — audit M-3). */
document.addEventListener("click", function (e) {
  var t = e.target && e.target.closest ? e.target.closest("[data-showview]") : null;
  if (!t) return;
  e.preventDefault();
  showView(parseInt(t.getAttribute("data-showview"), 10) || 1);
});

/* Remove broken vendor-logo images in static HTML (was inline onerror). */
document.querySelectorAll("img[data-remove-on-error]").forEach(function (img) {
  img.addEventListener("error", function () { img.remove(); });
});

/* Visits counter (audit M-4): once per browser session, skipped when this
   device opted out with "Don't count my visits" in Manage. */
(function trackVisit() {
  try {
    if (window.localStorage.getItem("ylm_exclude_visits") === "1") return;
    if (window.sessionStorage.getItem("ylm_visit_tracked")) return;
    window.sessionStorage.setItem("ylm_visit_tracked", "1");
    fetch("/api/track", { method: "POST" }).catch(function () {});
  } catch (e) { /* tracking must never break the shop */ }
})();

function showError(msg) {
  var err = document.getElementById("form-error");
  if (!err) return;
  err.textContent = msg;
  err.classList.add("show");
  err.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* Mandatory reservation fields (name, email, short message). When one is
   left empty we highlight exactly that field and show one short message —
   never a list of field names — so the buyer sees at a glance what to fix. */
var REQUIRED_FIELDS = ["f-name", "f-email", "f-msg"];

function missingRequired(name, email, msg) {
  var missing = [];
  if (!name) missing.push("f-name");
  if (!email) missing.push("f-email");
  if (!msg) missing.push("f-msg");
  return missing;
}

function markMissing(ids) {
  REQUIRED_FIELDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("field-missing", ids.indexOf(id) !== -1);
  });
}

/* Clear a field's highlight as soon as the buyer starts typing in it. */
REQUIRED_FIELDS.forEach(function (id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener("input", function () {
    this.classList.remove("field-missing");
  });
});

/* Show the delivery-charges note only when delivery by mail is chosen */
function syncDeliveryNote() {
  var sel = document.getElementById("f-delivery");
  var note = document.getElementById("delivery-note");
  if (!sel || !note) return;
  note.classList.toggle("show", sel.value === "Delivery by mail");
}
var fDelivery = document.getElementById("f-delivery");
if (fDelivery) fDelivery.addEventListener("change", syncDeliveryNote);

var reserveForm = document.getElementById("reserve-form");
if (reserveForm) reserveForm.addEventListener("submit", function (e) {
  e.preventDefault();
  var name = document.getElementById("f-name").value.trim();
  var email = document.getElementById("f-email").value.trim();
  var phone = document.getElementById("f-phone").value.trim();
  var qty = document.getElementById("f-qty").value;
  var delivery = document.getElementById("f-delivery").value;
  var msg = document.getElementById("f-msg").value.trim();
  var err = document.getElementById("form-error");
  var btn = document.getElementById("submit-btn");

  /* Honeypot (audit N-M1): bots fill the hidden _honey field. Smile and
     show the normal thank-you screen — no database row, no email. */
  var honey = document.querySelector('#reserve-form input[name="_honey"]');
  if (honey && honey.value.trim()) {
    var hp = productById(current);
    if (hp) showConfirmation(name, email, phone, qty, delivery, msg, hp);
    else showView(3);
    return;
  }
  /* Markup check (audit N-M2): the same < > rejection the server uses,
     checked here BEFORE anything is sent — a marked-up message must
     never reach the server. */
  if (/[<>]/.test(name) || /[<>]/.test(phone) || /[<>]/.test(msg)) {
    showError("Text fields must not contain < or >");
    return;
  }

  var missing = missingRequired(name, email, msg);
  if (missing.length) {
    markMissing(missing);
    showError(missing.length === 1
      ? "Please fill in the highlighted field."
      : "Please fill in the highlighted fields.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById("f-email").classList.add("field-missing");
    showError("That email address doesn’t look quite right — please check it, since the maker will reply there.");
    return;
  }
  markMissing([]);
  err.classList.remove("show");

  var p = productById(current);
  if (!p) {
    showError("Sorry — that item could not be found. Please pick it again from the shop.");
    return;
  }
  /* Save via POST /api/reserve and AWAIT the answer (audit N-M4/N-M5):
     the server stores the row and emails the owner, and only a server
     ok shows the confirmation screen. One automatic retry on a network
     error or a 5xx (a lost response after a successful insert is safe —
     the server dedups identical reservations from the last 24 hours);
     a 400 or 429 answer is final and is not retried. Distinct errors:
     the server could not save → "We could not save your reservation.
     Please try again."; saved but the owner email failed
     (emailed:false) → confirmation still shows, with a note that the
     reservation is saved and the owner will see it in Manage. */
  btn.disabled = true;
  btn.textContent = "Sending…";

  function postReserve() {
    return fetch("/api/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: name,
        buyer_email: email,
        buyer_phone: phone || "",
        quantity: qty,
        delivery_method: delivery,
        message: msg,
        product_name: p.name,
        maker_name: p.maker,
        listing_id: p.listing_id || null,
        maker_id: p.maker_id || null
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        return { status: res.status, body: j };
      });
    });
  }
  function resetBtn() {
    btn.disabled = false;
    btn.textContent = "Send my reservation to the maker →";
  }
  postReserve().then(function (r) {
    // One retry after a server error (5xx); validation and rate-limit
    // answers (400/429) are final.
    if ((!r.body || !r.body.ok) && r.status >= 500) return postReserve();
    return r;
  }, function () {
    // One retry after a network error.
    return postReserve();
  }).then(function (r) {
    resetBtn();
    if (r && r.body && r.body.ok) {
      showConfirmation(name, email, phone, qty, delivery, msg, p, r.body.emailed === false);
    } else if (r && r.status === 429) {
      showError("Too many reservations — please try again later.");
    } else if (r && r.status === 400 && r.body && r.body.error) {
      showError(r.body.error);
    } else {
      showError("We could not save your reservation. Please try again.");
    }
  }).catch(function () {
    resetBtn();
    showError("We could not save your reservation. Please try again.");
  });
});

function showConfirmation(name, email, phone, qty, delivery, msg, p, emailFailed) {
  var reservedId = current;
  setText("c-maker", p.maker);
  setText("c-email", email);
  /* Saved but the owner email failed (emailed:false): say so plainly —
     the reservation is in Manage, only the notification missed, so the
     buyer allows extra time for a reply instead of re-submitting. */
  if (emailFailed) {
    var cMaker = document.getElementById("c-maker");
    if (cMaker && cMaker.parentNode) cMaker.parentNode.textContent = "Your reservation is saved — the market owner will see it in Manage and " + p.maker + " will be in touch at " + email + ". The email notification did not go through, so please allow a little extra time for a reply.";
  }
  setText("s-product", p.name + " — " + p.price);
  setText("s-maker", p.maker + " — " + p.shop);
  setText("s-name", name);
  setText("s-email", email);
  setText("s-phone", phone || "Not provided");
  setText("s-qty", qty);
  setText("s-delivery", delivery);
  setText("s-msg", msg);
  if (reserveForm) reserveForm.reset();
  syncDeliveryNote();
  selectProductDefaults();
  renderMoreFrom(reservedId, p);
  showView(3);
}

/* Category label for the "more in this category" fallback heading. */
function categoryLabel(cat) {
  var labels = {pottery: "Pottery", jewelry: "Jewelry", homeware: "Homeware", textiles: "Textiles", art: "Art", "cards-stationery": "Cards & Stationery", "clothing-accessories": "Clothing & Accessories", weddings: "Weddings", "craft-supplies": "Craft Supplies", "christmas-gifts": "Christmas Gifts", other: "Other"};
  return labels[cat] || (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "the market");
}

/* Two products are from the same maker when their database maker id
   matches, or their maker names match, or their vendor slugs match. */
function sameMaker(a, b) {
  if (!a || !b) return false;
  if (a.maker_id && b.maker_id) return a.maker_id === b.maker_id;
  var an = (a.maker || "").trim().toLowerCase();
  var bn = (b.maker || "").trim().toLowerCase();
  if (an && an === bn) return true;
  if (a.vendor && b.vendor && a.vendor === b.vendor) return true;
  return false;
}

/* "More from this maker" on the confirmation screen (critic rec. 7):
   after a reservation, show the same maker's other live products —
   photo, name and price, each with a Reserve button that opens the
   reserve form for that item — so the buyer can keep browsing instead
   of hitting a dead end. The pool is whatever the shop is actually
   showing: live database listings when loaded, the built-in list
   otherwise. If the maker has nothing else, fall back to a few items
   from the same category; if there is nothing at all, the section
   stays hidden and the existing Back to the shop button stands. */
function renderMoreFrom(reservedId, p) {
  var box = document.getElementById("more-from");
  var grid = document.getElementById("more-from-grid");
  var title = document.getElementById("more-from-title");
  if (!box || !grid || !title || !p) return;
  var pool = {};
  var id;
  if (LIVE_PRODUCTS) {
    for (id in LIVE_PRODUCTS) pool[id] = LIVE_PRODUCTS[id];
  } else {
    for (id in PRODUCTS) pool[id] = PRODUCTS[id];
  }
  var others = [];
  var sameCat = [];
  for (id in pool) {
    if (id === reservedId) continue;
    var q = pool[id];
    if (sameMaker(p, q)) others.push({id: id, product: q});
    else if (q.category && p.category && q.category === p.category) sameCat.push({id: id, product: q});
  }
  var items, heading;
  if (others.length) {
    items = others;
    heading = "More from " + p.maker;
  } else if (sameCat.length) {
    items = sameCat;
    heading = "More in " + categoryLabel(p.category);
  } else {
    grid.innerHTML = "";
    box.hidden = true;
    return;
  }
  items = items.slice(0, 3);
  title.textContent = heading;
  grid.innerHTML = "";
  items.forEach(function (it) {
    var q = it.product;
    var card = document.createElement("article");
    card.className = "card more-card";
    var photo = q.img
      ? '<img src="' + esc(q.img) + '" alt="' + esc(q.alt || q.name) + '" loading="lazy" />'
      : '<div class="card-photo-ph" aria-hidden="true"><span>' + esc(initialsFor(q.maker)) + '</span></div>';
    card.innerHTML = photo +
      '<div class="card-body">' +
        '<h3>' + esc(q.name) + '</h3>' +
        '<p class="maker">by ' + esc(q.maker) + '</p>' +
        soldHtml(q) +
        '<div class="card-row"><p class="price-sm">' + esc(q.price) + '</p>' +
        '<button class="btn btn-primary" type="button" data-more-reserve="' + esc(it.id) + '">Reserve this item</button></div>' +
      '</div>';
    grid.appendChild(card);
  });
  applySoldCounts();
  box.hidden = false;
}

/* A "More from this maker" Reserve button opens the reserve form for
   that item, exactly like the Reserve button on a shop card. */
(function bindMoreFrom() {
  var grid = document.getElementById("more-from-grid");
  if (!grid) return;
  grid.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-more-reserve]") : null;
    if (btn) selectProduct(btn.getAttribute("data-more-reserve"));
  });
})();

/* Restore the form's default hidden product values after reset */
function selectProductDefaults() {
  var p = productById(current);
  if (!p) return;
  setVal("h-product", p.name);
  setVal("h-maker", p.maker + " — " + p.shop);
  setVal("h-price", p.price);
  /* NOTE: no h-subject write here either — that input was removed in
     Audit #3 and /api/reserve takes no subject. */
}

/* December launch promo pop-up — shows once per visitor (localStorage).
   Only runs on pages that include the #promo-overlay markup (index.html). */
(function promoPopup() {
  var overlay = document.getElementById("promo-overlay");
  if (!overlay) return;
  var KEY = "ylm-dec-promo-seen-v2";
  var seen = false;
  try { seen = !!window.localStorage.getItem(KEY); } catch (e) { seen = false; }
  function dismiss() {
    overlay.hidden = true;
    try { window.localStorage.setItem(KEY, "1"); } catch (e) {}
  }
  function open() { overlay.hidden = false; }
  document.getElementById("promo-close").addEventListener("click", dismiss);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) dismiss(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !overlay.hidden) dismiss(); });
  document.getElementById("promo-cta").addEventListener("click", function () {
    try { window.localStorage.setItem(KEY, "1"); } catch (e) {}
  });
  if (!seen) setTimeout(open, 600);
})();
