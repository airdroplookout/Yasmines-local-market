/* Yasmine's Local Market — shop logic.
   Example listings only (see README.md). The reserve form posts to
   FormSubmit (https://formsubmit.co/ajax/taradil@gmail.com) — temporary
   destination until each real maker has their own email. */

/* Vendor registry — one entry per maker.
   page: the vendor's own shop page on this site (null for example makers
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
function vendorBadge(p) {
  var v = VENDORS[p.vendor];
  if (!v) return "";
  var inner = '<span class="vendor-mono" aria-hidden="true">' + v.initials + '</span>' +
    '<img src="' + v.logo + '" alt="" loading="lazy" onerror="this.remove()" />';
  if (v.page) {
    return '<a class="vendor-badge" href="' + v.page + '" title="See all from ' + v.name + '" aria-label="See all from ' + v.name + '">' + inner + '</a>';
  }
  return '<span class="vendor-badge" title="' + v.shop + '">' + inner + '</span>';
}

var PRODUCTS = {
  mug:      { vendor: "rosa", name: "Sea-Glass Stoneware Mug", maker: "Rosa M.", shop: "Rosa’s Pottery Corner", price: "$28", img: "images/mug-grid.webp", alt: "Hand-thrown stoneware mug in a soft sea-glass blue glaze", desc: "Hand-thrown and glazed in small batches — every mug a little different. Dishwasher-friendly and made for a generous cup of tea." },
  scarf:    { vendor: "fatima", name: "Chunky Knit Scarf — Moss Green", maker: "Fatima K.", shop: "Fatima’s Knits", price: "$35", img: "images/scarf.webp", alt: "Thick hand-knitted scarf in moss green draped around a display bust", desc: "Knitted by hand in a soft, chunky yarn. Long enough to wrap twice — made for Brantford winters." },
  necklace: { vendor: "layla", name: "Rainbow Beaded Choker", maker: "Layla H.", shop: "Layla Beads", price: "$22", img: "images/necklace.webp", alt: "Colourful hand-beaded choker necklace on a black display bust", desc: "Hundreds of tiny seed beads woven by hand into a bright, cheerful choker. Adjustable clasp." },
  candle:   { vendor: "emma", name: "Vanilla & Cedar Soy Candle", maker: "Emma T.", shop: "Emma’s Little Light Co.", price: "$18", img: "images/candle.webp", alt: "Lit soy candle in a clear glass jar", desc: "Hand-poured soy wax with a warm vanilla and cedar scent. About 35 hours of burn time." },
  tote:     { vendor: "grace", name: "Canvas Market Tote", maker: "Grace O.", shop: "Grace Sews", price: "$20", img: "images/tote.webp", alt: "Row of sturdy handmade canvas tote bags in many colours held up outdoors", desc: "Heavy-duty canvas, sewn to carry a full market shop. Pick your colour when you reserve — red, blue, teal, green, natural and more." },
  honey:    { vendor: "nguyen", name: "Wildflower Honey — Small Jar", maker: "The Nguyen Family", shop: "Nguyen Family Apiary", price: "$9", img: "images/honey.webp", alt: "Small hexagonal glass jar of golden honey with a gold lid on wood", desc: "Raw wildflower honey from hives just outside town. This little jar is perfect for gifts and first tastes." },
  /* Mary Stones — Mary's Pottery (first real maker; prices are examples until she confirms them) */
  "mary-mug":     { vendor: "mary-stones", name: "Speckled Stoneware Mug", maker: "Mary Stones", shop: "Mary's Pottery", price: "$32", img: "images/mary-mug.webp", alt: "Hand-thrown stoneware mug in a soft sage-green speckled glaze", desc: "Hand-thrown mug in a soft speckled glaze — every one a little different. Holds a generous cup of tea or coffee." },
  "mary-bowl":    { vendor: "mary-stones", name: "Rustic Serving Bowl", maker: "Mary Stones", shop: "Mary's Pottery", price: "$48", img: "images/mary-bowl.webp", alt: "Handmade stoneware serving bowl in muted olive-green and grey glaze", desc: "A generous hand-thrown bowl in warm earth tones, made for salads, pasta, and family dinners." },
  "mary-vase":    { vendor: "mary-stones", name: "Hand-thrown Vase", maker: "Mary Stones", shop: "Mary's Pottery", price: "$65", img: "images/mary-vase.webp", alt: "Tall handmade ceramic vase in creamy white glaze on a wooden table", desc: "A tall, graceful vase in creamy white glaze with a soft matte finish. Made for fresh flowers — or lovely standing on its own." },
  "mary-plate":   { vendor: "mary-stones", name: "Speckled Dinner Plate", maker: "Mary Stones", shop: "Mary's Pottery", price: "$38", img: "images/mary-plate.webp", alt: "Stack of handmade speckled ceramic dinner plates in blue and white", desc: "A sturdy hand-thrown dinner plate with a speckled glaze — no two exactly alike. Dishwasher-friendly." },
  "mary-planter": { vendor: "mary-stones", name: "Ribbed Stoneware Planter", maker: "Mary Stones", shop: "Mary's Pottery", price: "$42", img: "images/mary-planter.webp", alt: "Handmade ribbed stoneware planter with matching saucer in grey-blue and terracotta", desc: "A ribbed stoneware planter with a matching saucer, glazed in soft grey-blue with a terracotta rim." },
  "mary-teapot":  { vendor: "mary-stones", name: "Hand-thrown Teapot", maker: "Mary Stones", shop: "Mary's Pottery", price: "$85", img: "images/mary-teapot.webp", alt: "Handmade ceramic teapot in a bold red and amber swirl glaze", desc: "A one-of-a-kind teapot in a bold red and amber glaze with hand-painted swirls. Brews about four cups." },
  "mary-butter":  { vendor: "mary-stones", name: "Lidded Butter Dish", maker: "Mary Stones", shop: "Mary's Pottery", price: "$36", img: "images/mary-butter.webp", alt: "Handmade stoneware butter dish with a blue-grey domed lid", desc: "A stoneware butter dish with a fitted lid in soft blue-grey glaze. Keeps butter fresh on the counter." },
  "mary-spoon":   { vendor: "mary-stones", name: "Ceramic Spoon Rest", maker: "Mary Stones", shop: "Mary's Pottery", price: "$28", img: "images/mary-spoon.webp", alt: "Long speckled ceramic spoon rest holding a wooden spoon on a kitchen counter", desc: "A long speckled spoon rest that keeps drips off the counter — fits a wooden spoon or a ladle." },
  "mary-candle":  { vendor: "mary-stones", name: "Stoneware Candle Holder", maker: "Mary Stones", shop: "Mary's Pottery", price: "$30", img: "images/mary-candle.webp", alt: "Handmade stoneware candle holder with a pillar candle", desc: "A hand-thrown candle holder with a warm brown glaze and a little handle. Fits a standard pillar candle." },
  "mary-platter": { vendor: "mary-stones", name: "Serving Platter", maker: "Mary Stones", shop: "Mary's Pottery", price: "$58", img: "images/mary-platter.webp", alt: "Wide handmade ceramic serving platter in soft earth tones", desc: "A wide hand-thrown serving platter, perfect for roasts, bread, or a spread of cheese." }
};
var current = window.PAGE_PRODUCTS ? window.PAGE_PRODUCTS[0] : "mug";

/* Build the product grid — a page may define window.PAGE_PRODUCTS to show only its own items */
(function buildGrid() {
  var grid = document.getElementById("product-grid");
  var order = window.PAGE_PRODUCTS || ["scarf", "necklace", "candle", "tote", "honey", "mug",
    "mary-mug", "mary-bowl", "mary-vase", "mary-plate", "mary-planter",
    "mary-teapot", "mary-butter", "mary-spoon", "mary-candle", "mary-platter"];
  order.forEach(function (id) {
    var p = PRODUCTS[id];
    var card = document.createElement("article");
    card.className = "card";
    card.innerHTML =
      vendorBadge(p) +
      '<img src="' + p.img + '" alt="' + p.alt + '" loading="lazy" />' +
      '<div class="card-body">' +
        '<h3>' + p.name + ' <span class="example-tag">Example</span></h3>' +
        '<p class="maker">by ' + p.maker + ' — ' + p.shop + '</p>' +
        (VENDORS[p.vendor] && VENDORS[p.vendor].page ? '<p class="vendor-link"><a href="' + VENDORS[p.vendor].page + '">See all from ' + VENDORS[p.vendor].name + ' →</a></p>' : '') +
        '<p class="desc">' + p.desc + '</p>' +
        '<div class="card-row"><p class="price-sm">' + p.price + '</p>' +
        '<button class="btn btn-primary" data-reserve="' + id + '">Reserve this item</button></div>' +
      '</div>';
    grid.appendChild(card);
  });
  grid.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-reserve]");
    if (btn) selectProduct(btn.getAttribute("data-reserve"));
  });
})();

function showView(n) {
  [1, 2, 3].forEach(function (i) {
    document.getElementById("view-" + i).classList.toggle("active", i === n);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectProduct(id) {
  current = id;
  var p = PRODUCTS[id];
  document.getElementById("ps-img").src = id === "mug" ? "images/mug.webp" : p.img;
  document.getElementById("ps-img").alt = p.alt;
  document.getElementById("ps-name").textContent = p.name;
  document.getElementById("ps-maker").textContent = "by " + p.maker + " — " + p.shop;
  document.getElementById("ps-price").textContent = p.price;
  document.getElementById("ep-maker").textContent = p.maker.split(" ")[0];
  document.getElementById("h-product").value = p.name;
  document.getElementById("h-maker").value = p.maker + " — " + p.shop;
  document.getElementById("h-price").value = p.price;
  document.getElementById("h-subject").value = "New reservation — " + p.name + " (" + p.price + ")";
  showView(2);
}

function showError(msg) {
  var err = document.getElementById("form-error");
  err.textContent = msg;
  err.classList.add("show");
  err.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* Show the delivery-charges note only when delivery by mail is chosen */
function syncDeliveryNote() {
  var sel = document.getElementById("f-delivery");
  document.getElementById("delivery-note").classList.toggle("show", sel.value === "Delivery by mail");
}
document.getElementById("f-delivery").addEventListener("change", syncDeliveryNote);

document.getElementById("reserve-form").addEventListener("submit", function (e) {
  e.preventDefault();
  var name = document.getElementById("f-name").value.trim();
  var email = document.getElementById("f-email").value.trim();
  var phone = document.getElementById("f-phone").value.trim();
  var qty = document.getElementById("f-qty").value;
  var delivery = document.getElementById("f-delivery").value;
  var msg = document.getElementById("f-msg").value.trim();
  var err = document.getElementById("form-error");
  var btn = document.getElementById("submit-btn");

  if (!name || !email || !msg) {
    showError("Please fill in your name, your email, and a short message to the maker — those three are needed so they can reply to you.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError("That email address doesn’t look quite right — please check it, since the maker will reply there.");
    return;
  }
  err.classList.remove("show");

  var p = PRODUCTS[current];
  document.getElementById("h-replyto").value = email;

  btn.disabled = true;
  btn.textContent = "Sending…";

  var data = {
    name: name,
    email: email,
    phone: phone || "Not provided",
    quantity: qty,
    delivery_method: delivery,
    message: msg,
    product: p.name,
    maker: p.maker + " — " + p.shop,
    price: p.price,
    _subject: "New reservation — " + p.name + " (" + p.price + ")",
    _template: "table",
    _replyto: email
  };

  fetch("https://formsubmit.co/ajax/taradil@gmail.com", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(data)
  })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      btn.disabled = false;
      btn.textContent = "Send my reservation to the maker →";
      if (json && (json.success === "true" || json.success === true)) {
        showConfirmation(name, email, phone, qty, delivery, msg, p);
      } else {
        showError("Sorry — that did not send. Please try again, or check that the market’s email has been activated. (" + (json && json.message ? json.message : "unknown error") + ")");
      }
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = "Send my reservation to the maker →";
      showError("Sorry — that did not send. Please check your connection and try again.");
    });
});

function showConfirmation(name, email, phone, qty, delivery, msg, p) {
  document.getElementById("c-maker").textContent = p.maker;
  document.getElementById("c-email").textContent = email;
  document.getElementById("s-product").textContent = p.name + " — " + p.price;
  document.getElementById("s-maker").textContent = p.maker + " — " + p.shop;
  document.getElementById("s-name").textContent = name;
  document.getElementById("s-email").textContent = email;
  document.getElementById("s-phone").textContent = phone || "Not provided";
  document.getElementById("s-qty").textContent = qty;
  document.getElementById("s-delivery").textContent = delivery;
  document.getElementById("s-msg").textContent = msg;
  document.getElementById("reserve-form").reset();
  syncDeliveryNote();
  selectProductDefaults();
  showView(3);
}

/* Restore the form's default hidden product values after reset */
function selectProductDefaults() {
  var p = PRODUCTS[current];
  document.getElementById("h-product").value = p.name;
  document.getElementById("h-maker").value = p.maker + " — " + p.shop;
  document.getElementById("h-price").value = p.price;
  document.getElementById("h-subject").value = "New reservation — " + p.name + " (" + p.price + ")";
}

/* December launch promo pop-up — shows once per visitor (localStorage).
   Only runs on pages that include the #promo-overlay markup (index.html). */
(function promoPopup() {
  var overlay = document.getElementById("promo-overlay");
  if (!overlay) return;
  var KEY = "ylm-dec-promo-seen";
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
