/* Pottery Guru's shop page — loaded BEFORE app.js so window.PAGE_PRODUCTS is set
   when the grid builds. Same pattern as mary.js (CSP-safe, no inline script). */
/* Only Jared's 2 vases on this page */
window.PAGE_PRODUCTS = ["jared-vase", "jared-tall-vase"];

function copyShopLink() {
  var input = document.getElementById("shop-link");
  var hint = document.getElementById("copy-hint");
  var btn = document.getElementById("copy-link-btn");
  function done() {
    hint.textContent = "✓ Link copied — paste it anywhere to share Jared’s shop.";
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
