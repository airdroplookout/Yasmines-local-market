/* Mary's shop page — loaded BEFORE app.js so window.PAGE_PRODUCTS is set
   when the grid builds. Moved out of an inline <script> so the site can
   run under an enforced Content-Security-Policy (audit M-3, Nov 25 2026). */
/* Only Mary's 10 products on this page */
window.PAGE_PRODUCTS = ["mary-mug", "mary-bowl", "mary-vase", "mary-plate", "mary-planter",
  "mary-teapot", "mary-butter", "mary-spoon", "mary-candle", "mary-platter"];

function copyShopLink() {
  var input = document.getElementById("shop-link");
  var hint = document.getElementById("copy-hint");
  var btn = document.getElementById("copy-link-btn");
  function done() {
    hint.textContent = "✓ Link copied — paste it anywhere to share Mary’s shop.";
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = "Copy link"; }, 2500);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(input.value).then(done, function () { input.select(); document.execCommand("copy"); done(); });
  } else {
    input.select();
    document.execCommand("copy");
    done();
  }
}

document.getElementById("copy-link-btn").addEventListener("click", copyShopLink);
