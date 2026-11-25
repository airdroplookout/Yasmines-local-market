// Confirm a maker's email — Locally Crafted CA.
// Reads ?token= from the URL, calls the public verify-submission
// function, and shows success or failure text. No inline script is
// used here: the site's Content-Security-Policy is script-src 'self',
// so this page needs its own external file like every other page.
// All text is set with textContent, never innerHTML.
(function () {
  var el = document.getElementById('verify-message');
  if (!el) return;
  var token = '';
  try { token = new URLSearchParams(window.location.search).get('token') || ''; } catch (e) { token = ''; }
  if (!token) {
    el.textContent = 'This confirmation link is missing its code. Please use the full link from the email we sent you.';
    return;
  }
  fetch('/.netlify/functions/verify-submission?token=' + encodeURIComponent(token))
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, message: j.message || j.error || '' }; }); })
    .then(function (res) {
      el.textContent = res.ok
        ? (res.message || 'Email confirmed — thank you. The market owner will now review your product.')
        : (res.message || 'This confirmation link is not valid or has expired.');
    })
    .catch(function () {
      el.textContent = 'We could not check that link just now — please try again in a moment.';
    });
})();
