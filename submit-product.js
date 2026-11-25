/* Submit-a-product form handler — external script so the site can run
   under an enforced Content-Security-Policy (audit M-3, Nov 25 2026).
   Flow: the form posts (multipart) to /api/submit-product, which
   validates everything, stores the one photo and saves the submission
   as 'pending'. Then the browser emails the owner the details + photo
   link via FormSubmit ajax — the same proven path the contact form
   uses. Nothing the maker submits ever appears on the public site
   until the owner approves it in Manage > Submissions. */
(function(){
  var form = document.getElementById('submit-form');
  var err = document.getElementById('form-error');
  var btn = document.getElementById('submit-btn');
  var photoInput = document.getElementById('s-photo');
  var categorySelect = document.getElementById('s-category');
  var otherWrap = document.getElementById('s-other-wrap');
  var otherInput = document.getElementById('s-other-category');
  var preview = document.getElementById('photo-preview');
  var previewImg = document.getElementById('photo-img');
  var previewName = document.getElementById('photo-name');
  var MAX_BYTES = 5 * 1024 * 1024;
  var OK_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  var PRICE_RE = /^\$?\d{1,6}(\.\d{1,2})?$/;
  var CATEGORIES = ['christmas-gifts', 'pottery', 'jewelry', 'homeware', 'textiles', 'art', 'cards-stationery', 'clothing-accessories', 'weddings', 'craft-supplies', 'other'];

  function showError(msg){
    err.textContent = msg;
    err.classList.add('show');
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function setBusy(busy, label){
    btn.disabled = busy;
    btn.textContent = label;
  }

  // "Other" category: show the Specify field only when Other is picked.
  // It is required only then — otherwise it stays hidden and empty.
  function syncOther(){
    var isOther = categorySelect.value === 'other';
    otherWrap.style.display = isOther ? 'block' : 'none';
    otherInput.required = isOther;
    if(!isOther) otherInput.value = '';
  }
  categorySelect.addEventListener('change', syncOther);
  syncOther();

  // One-photo preview. The input has no `multiple`, so the browser only
  // ever lets one file be picked; the server counts again anyway.
  photoInput.addEventListener('change', function(){
    var f = photoInput.files && photoInput.files[0];
    if(!f){ preview.style.display = 'none'; previewImg.src = ''; return; }
    if(OK_TYPES.indexOf(f.type) === -1){
      showError('That file is not a JPG, PNG or WebP picture — please pick a photo of your product.');
      photoInput.value = '';
      preview.style.display = 'none';
      return;
    }
    if(f.size > MAX_BYTES){
      showError('That picture is over 5 MB — please pick a smaller one.');
      photoInput.value = '';
      preview.style.display = 'none';
      return;
    }
    err.classList.remove('show');
    previewImg.src = URL.createObjectURL(f);
    previewName.textContent = f.name + ' — one picture per product.';
    preview.style.display = 'block';
  });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var makerName = document.getElementById('s-maker-name').value.trim();
    var businessName = document.getElementById('s-business-name').value.trim();
    var makerEmail = document.getElementById('s-maker-email').value.trim();
    var productName = document.getElementById('s-product-name').value.trim();
    var category = document.getElementById('s-category').value;
    var otherCategory = document.getElementById('s-other-category').value.trim();
    var price = document.getElementById('s-price').value.trim();
    var desc = document.getElementById('s-desc').value.trim();
    var file = photoInput.files && photoInput.files[0];

    if(!makerName || !businessName || !makerEmail || !productName || !category || !price || !desc || !file){
      showError('Please fill in your name, your business name, your email, the product name, its type, its price and a short description — and add one photo. All of them are needed.');
      return;
    }
    if(category === 'other' && !otherCategory){
      showError('You picked “Other” — please tell us what kind of product this is in the Specify box.');
      return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(makerEmail) || makerEmail.length > 50){
      showError('That email address doesn\u2019t look quite right — please check it, since we will reply there.');
      return;
    }
    if(CATEGORIES.indexOf(category) === -1){
      showError('Please choose the type of product from the list.');
      return;
    }
    if(!PRICE_RE.test(price)){
      showError('The price should be a number in dollars, like 28 or $28.');
      return;
    }
    if(OK_TYPES.indexOf(file.type) === -1){
      showError('That file is not a JPG, PNG or WebP picture — please pick a photo of your product.');
      return;
    }
    if(file.size > MAX_BYTES){
      showError('That picture is over 5 MB — please pick a smaller one.');
      return;
    }

    err.classList.remove('show');
    /* Honeypot (audit N-M1): bots fill the hidden _honey field. Show the
       normal thank-you screen and send nothing — no save, no email. */
    var honey = document.querySelector('#submit-form input[name="_honey"]');
    if (honey && honey.value.trim()) {
      document.getElementById('t-product').textContent = productName;
      document.getElementById('t-email').textContent = makerEmail;
      form.style.display = 'none';
      document.getElementById('submit-thanks').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true, 'Sending…');

    var fd = new FormData(form);
    fetch('/api/submit-product', { method: 'POST', body: fd })
      .then(function(res){ return res.json().then(function(j){ return { status: res.status, body: j }; }); })
      .then(function(r){
        if(!r.body || !r.body.ok){
          setBusy(false, 'Send my product for review →');
          showError('Sorry — that did not send. ' + (r.body && r.body.error ? r.body.error : 'Please try again.'));
          return null;
        }
        if (r.body.honeypot) {
          // Server caught a filled honeypot: pretend it worked (the
          // normal thank-you screen) and send NO email — nothing was
          // stored, so there is nothing to notify the owner about.
          setBusy(false, 'Send my product for review →');
          document.getElementById('t-product').textContent = productName;
          document.getElementById('t-email').textContent = makerEmail;
          form.style.display = 'none';
          document.getElementById('submit-thanks').style.display = 'block';
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return null;
        }
        return r.body;
      })
      .then(function(saved){
        if(!saved) return;
        // Email the owner the submission + photo link (FormSubmit ajax,
        // the same path the contact form uses). If the row was saved in
        // Manage, the email is only the notification — a failed email
        // must not make the maker think the submission was lost.
        var emailBody = {
          name: makerName, business_name: businessName, email: makerEmail,
          product_name: productName, category: saved.category_label || category,
          other_category: category === 'other' ? otherCategory : '',
          price: price.startsWith('$') ? price : '$' + price,
          description: desc,
          photo_url: saved.url || '(photo upload failed — please ask the maker to re-send it)',
          saved_in_manage: saved.stored ? 'Yes (pending review)' : 'No — table not set up yet, this email is the record',
          _subject: 'New product submission — ' + productName + ' (' + price + ')',
          _template: 'table', _replyto: makerEmail
        };
        return fetch('https://formsubmit.co/ajax/taradil@gmail.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(emailBody)
        })
        .then(function(res){ return res.json().catch(function(){ return {}; }); })
        .then(function(emailJson){
          var emailOk = emailJson && (emailJson.success === 'true' || emailJson.success === true);
          if(saved.stored || emailOk){
            document.getElementById('t-product').textContent = productName;
            document.getElementById('t-email').textContent = makerEmail;
            form.style.display = 'none';
            document.getElementById('submit-thanks').style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            setBusy(false, 'Send my product for review →');
            showError('Sorry — that did not send. Please try again, or write to us from the contact page.');
          }
        })
        .catch(function(){
          if(saved.stored){
            document.getElementById('t-product').textContent = productName;
            document.getElementById('t-email').textContent = makerEmail;
            form.style.display = 'none';
            document.getElementById('submit-thanks').style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            setBusy(false, 'Send my product for review →');
            showError('Sorry — that did not send. Please try again, or write to us from the contact page.');
          }
        });
      })
      .catch(function(){
        setBusy(false, 'Send my product for review →');
        showError('Sorry — that did not send. Please check your connection and try again.');
      });
  });
})();
