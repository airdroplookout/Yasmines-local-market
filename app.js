/* Yasmine's Local Market — shop logic.
   Example listings only (see README.md). The reserve form posts to
   FormSubmit (https://formsubmit.co/ajax/taradil@gmail.com) — temporary
   destination until each real maker has their own email. */

var PRODUCTS = {
  mug:      { name: "Sea-Glass Stoneware Mug", maker: "Rosa M.", shop: "Rosa’s Pottery Corner", price: "$28", img: "images/mug-grid.webp", alt: "Hand-thrown stoneware mug in a soft sea-glass blue glaze", desc: "Hand-thrown and glazed in small batches — every mug a little different. Dishwasher-friendly and made for a generous cup of tea." },
  scarf:    { name: "Chunky Knit Scarf — Moss Green", maker: "Fatima K.", shop: "Fatima’s Knits", price: "$35", img: "images/scarf.webp", alt: "Thick hand-knitted scarf in moss green draped around a display bust", desc: "Knitted by hand in a soft, chunky yarn. Long enough to wrap twice — made for Brantford winters." },
  necklace: { name: "Rainbow Beaded Choker", maker: "Layla H.", shop: "Layla Beads", price: "$22", img: "images/necklace.webp", alt: "Colourful hand-beaded choker necklace on a black display bust", desc: "Hundreds of tiny seed beads woven by hand into a bright, cheerful choker. Adjustable clasp." },
  candle:   { name: "Vanilla & Cedar Soy Candle", maker: "Emma T.", shop: "Emma’s Little Light Co.", price: "$18", img: "images/candle.webp", alt: "Lit soy candle in a clear glass jar", desc: "Hand-poured soy wax with a warm vanilla and cedar scent. About 35 hours of burn time." },
  tote:     { name: "Canvas Market Tote", maker: "Grace O.", shop: "Grace Sews", price: "$20", img: "images/tote.webp", alt: "Row of sturdy handmade canvas tote bags in many colours held up outdoors", desc: "Heavy-duty canvas, sewn to carry a full market shop. Pick your colour when you reserve — red, blue, teal, green, natural and more." },
  honey:    { name: "Wildflower Honey — Small Jar", maker: "The Nguyen Family", shop: "Nguyen Family Apiary", price: "$9", img: "images/honey.webp", alt: "Small hexagonal glass jar of golden honey with a gold lid on wood", desc: "Raw wildflower honey from hives just outside town. This little jar is perfect for gifts and first tastes." }
};
var current = "mug";

/* Build the product grid */
(function buildGrid() {
  var grid = document.getElementById("product-grid");
  var order = ["scarf", "necklace", "candle", "tote", "honey", "mug"];
  order.forEach(function (id) {
    var p = PRODUCTS[id];
    var card = document.createElement("article");
    card.className = "card";
    card.innerHTML =
      '<img src="' + p.img + '" alt="' + p.alt + '" loading="lazy" />' +
      '<div class="card-body">' +
        '<h3>' + p.name + ' <span class="example-tag">Example</span></h3>' +
        '<p class="maker">by ' + p.maker + ' — ' + p.shop + '</p>' +
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
