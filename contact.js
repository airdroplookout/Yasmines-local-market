/* Contact form handler — moved out of an inline <script> so the site can
   run under an enforced Content-Security-Policy (audit M-3, Nov 25 2026). */
(function(){
  var form = document.getElementById('contact-form');
  var err = document.getElementById('form-error');
  var btn = document.getElementById('submit-btn');
  function showError(msg){
    err.textContent = msg;
    err.classList.add('show');
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var name = document.getElementById('c-name').value.trim();
    var email = document.getElementById('c-email').value.trim();
    var makes = document.getElementById('c-makes').value.trim();
    var msg = document.getElementById('c-msg').value.trim();
    /* Honeypot (audit N-M1): bots fill the hidden _honey field. Show the
       normal thank-you screen and send nothing. */
    var honey = document.querySelector('#contact-form input[name="_honey"]');
    if (honey && honey.value.trim()) {
      document.getElementById('t-email').textContent = email || 'your email';
      form.style.display = 'none';
      document.getElementById('contact-thanks').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    /* Markup check (audit N-M2): the same < > rejection the server uses,
       checked here BEFORE anything is sent. */
    if (/[<>]/.test(name) || /[<>]/.test(makes) || /[<>]/.test(msg)) {
      showError('Text fields must not contain < or >');
      return;
    }
    if(!name || !email || !makes || !msg){
      showError('Please fill in your name, your email, what you make, and a short message — those four are needed so we can reply to you.');
      return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 50){
      showError('That email address doesn\u2019t look quite right — please check it, since we will reply there.');
      return;
    }
    err.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    /* Server-side send (audit N-M4): POST /api/send-contact validates
       (honeypot, markup, 5/hour/IP) and emails the owner via Resend.
       The old browser FormSubmit post is gone — it could be called
       directly by anyone, skipping every check. */
    fetch('/api/send-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        name: name, email: email, what_you_make: makes, message: msg
      })
    })
    .then(function(res){ return res.json().catch(function(){ return {}; }).then(function(json){ return { status: res.status, body: json }; }); })
    .then(function(r){
      btn.disabled = false;
      btn.textContent = 'Send my message →';
      if (r.body && r.body.ok) {
        document.getElementById('t-email').textContent = email;
        form.style.display = 'none';
        document.getElementById('contact-thanks').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (r.status === 429) {
        showError('Too many messages — please try again later.');
      } else {
        showError('Sorry — that did not send. Please try again.' + (r.body && r.body.error ? ' (' + r.body.error + ')' : ''));
      }
    })
    .catch(function(){
      btn.disabled = false;
      btn.textContent = 'Send my message →';
      showError('Sorry — that did not send. Please check your connection and try again.');
    });
  });
})();
