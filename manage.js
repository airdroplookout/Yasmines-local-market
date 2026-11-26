// Manage — Locally Crafted CA. Wired to the real backend (Nov 2026).
// Sign-in is enforced: password login (30-day session), 5 wrong passwords
// in 15 minutes locks the login out for 15 minutes. "Forgot password?"
// emails a one-time reset link to the owner only.
// Tabs: Visits / Makers / Listings / Reservations / Settings.
// Makers: add / edit / archive / delete. Listings: add / edit / archive /
// delete, saved in the database. Reservations: mark contacted or done.
// Prices shown here are the SHOPPER prices on the cards.
var SESSION_KEY = 'ylm_admin_session';
var token = null;
try { token = localStorage.getItem(SESSION_KEY) || null; } catch (e) {}

function showToast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(function(){ t.classList.remove('show'); }, 3200);
}
function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function fmtDate(s){ if(!s) return '—'; try { return new Date(s).toLocaleDateString('en-CA', {year:'numeric', month:'short', day:'numeric'}); } catch(e){ return s; } }

function api(path, method, body){
  var headers = {'Content-Type': 'application/json'};
  if(token) headers['x-admin-session'] = token;
  return fetch(path, {method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined})
    .then(function(r){ return r.json().then(function(j){
      if(!r.ok){
        // Carry the server's structured fields on the error so the
        // approve handler can read existing_shop_name / status (409s).
        var err = new Error(j.error || ('HTTP ' + r.status));
        err.status = r.status;
        if (j.existing_shop_name) err.existing_shop_name = j.existing_shop_name;
        throw err;
      }
      return j;
    }); });
}

function showLogin(){
  document.getElementById('loginCard').style.display = 'block';
  document.getElementById('dash').style.display = 'none';
  document.getElementById('resetCard').style.display = 'none';
}
function showDash(){
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('dash').style.display = 'block';
  document.getElementById('resetCard').style.display = 'none';
  loadOverview();
}

// --- Login / forgot / reset ---
document.getElementById('loginForm').addEventListener('submit', function(e){
  e.preventDefault();
  var pw = document.getElementById('mgmtPass').value;
  var err = document.getElementById('loginError');
  err.style.display = 'none';
  api('/api/admin/login', 'POST', {password: pw}).then(function(j){
    if(j.ok && j.token){
      token = j.token;
      try { localStorage.setItem(SESSION_KEY, token); } catch (e) {}
      document.getElementById('mgmtPass').value = '';
      showDash();
      showToast('Signed in — welcome back.');
    } else {
      err.textContent = j.error || 'Sign-in failed.';
      err.style.display = 'block';
    }
  }).catch(function(ex){
    err.textContent = ex.message || 'Sign-in failed.';
    err.style.display = 'block';
  });
});
document.getElementById('forgotLink').addEventListener('click', function(){
  var sent = document.getElementById('forgotSent');
  api('/api/admin/forgot', 'POST', {}).then(function(j){
    if(sent) sent.style.display = 'block';
  }).catch(function(){
    if(sent) sent.style.display = 'block';
  });
});

// Reset card: opened by the link in the reset email (?reset=<token>).
(function(){
  var m = /[?&]reset=([^&]+)/.exec(location.search);
  if(!m) return;
  var resetToken = decodeURIComponent(m[1]);
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('dash').style.display = 'none';
  document.getElementById('resetCard').style.display = 'block';
  document.getElementById('resetForm').addEventListener('submit', function(e){
    e.preventDefault();
    var pw = document.getElementById('resetPass').value;
    var err = document.getElementById('resetError');
    err.style.display = 'none';
    api('/api/admin/reset', 'POST', {token: resetToken, password: pw}).then(function(j){
      if(j.ok){
        showToast('Password changed. Sign in with the new password.');
        history.replaceState(null, '', '/manage');
        showLogin();
      } else {
        err.textContent = j.error || 'Reset failed.';
        err.style.display = 'block';
      }
    }).catch(function(ex){
      err.textContent = ex.message || 'Reset failed.';
      err.style.display = 'block';
    });
  });
})();

function logout(){
  token = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  showLogin();
  showToast('Signed out.');
}
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('logoutAllBtn').addEventListener('click', function(){
  if(!window.confirm('Sign out of Manage on every device? You will need to sign in again everywhere.')) return;
  api('/api/admin/logout-all', 'POST', {}).then(function(){ logout(); showToast('Signed out everywhere.'); })
    .catch(function(ex){ showToast(ex.message || 'Could not sign out everywhere.'); });
});

// --- Section tabs ---
function activateSection(id){
  document.querySelectorAll('.mnav .chip').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-sec') === id); });
  ['secVisits', 'secMakers', 'secListings', 'secSubmissions', 'secRes', 'secSubscribers', 'secFeatured', 'secSettings'].forEach(function(sid){
    document.getElementById(sid).style.display = (sid === id) ? 'block' : 'none';
  });
}
document.querySelectorAll('.mnav .chip').forEach(function(c){
  c.addEventListener('click', function(){ activateSection(c.getAttribute('data-sec')); });
});

// --- Overview ---
var overview = null;
function loadOverview(){
  api('/api/admin/overview').then(function(j){
    if(!j.ok) throw new Error(j.error || 'Could not load Manage.');
    overview = j;
    var v = j.visits || {};
    document.getElementById('vToday').textContent = v.today != null ? v.today : '—';
    document.getElementById('vWeek').textContent = v.week != null ? v.week : '—';
    document.getElementById('vMonth').textContent = v.month != null ? v.month : '—';
    document.getElementById('vYear').textContent = v.year != null ? v.year : '—';
    document.getElementById('dashSummary').textContent =
      (j.live_makers != null ? j.live_makers : 0) + ' live makers · ' +
      (j.live_listings != null ? j.live_listings : 0) + ' live listings · ' +
      (j.new_reservations != null ? j.new_reservations : 0) + ' new reservations' +
      ((j.pending_submissions || 0) > 0 ? ' · ' + j.pending_submissions + ' product submission' + (j.pending_submissions === 1 ? '' : 's') + ' to review' : '');
    fillMakerSelect(j.makers || []);
    fillMakerFilter(j.makers || []);
    renderMakers(j.makers || []);
    renderListings(j.listings || [], j.makers || []);
    renderSubmissions(j.submissions || []);
    renderRes(j.reservations || [], j.listings || [], j.makers || []);
    renderSubscribers(j.subscribers || []);
    var s = j.settings || {};
    document.getElementById('setNotif').value = s.notification_email || '';
    document.getElementById('setSender').value = s.sender_email || '';
    fillFeaturedForm(j.makers || [], j.listings || [], s.featured_maker || '');
  }).catch(function(ex){
    if(/unauthorized/i.test(ex.message || '')){ logout(); return; }
    showToast(ex.message || 'Could not load Manage.');
  });
}

// Exclude-my-visits switch (per device, like the other sites).
var excludeBox = document.getElementById('excludeVisits');
try { excludeBox.checked = localStorage.getItem('ylm_exclude_visits') === '1'; } catch (e) {}
excludeBox.addEventListener('change', function(){
  try {
    if(excludeBox.checked) localStorage.setItem('ylm_exclude_visits', '1');
    else localStorage.removeItem('ylm_exclude_visits');
  } catch (e) {}
  showToast(excludeBox.checked ? 'Your visits on this device will not be counted.' : 'Your visits on this device will be counted again.');
});

function makerName(makers, id){
  var m = (makers || []).find(function(x){ return x.id === id; });
  return m ? (m.shop_name || m.name) : '—';
}
function listingName(listings, id){
  var l = (listings || []).find(function(x){ return x.id === id; });
  return l ? l.name : '—';
}

// --- Makers ---
// Searchable maker pickers: type letters and both maker dropdowns narrow
// to matching makers (name or shop name, case-insensitive, anywhere in
// the name — "ma" finds "Mary Stones"). The currently picked maker is
// always kept in the list so an active choice is never lost.
var makerSelectSearch = '';
function makerMatches(m, q){
  if(!q) return true;
  q = q.trim().toLowerCase();
  return ((m.shop_name || '') + ' ' + (m.name || '')).toLowerCase().indexOf(q) !== -1;
}
function fillMakerSelect(makers){
  var sel = document.getElementById('liMaker');
  var keep = sel.value;
  var live = (makers || []).filter(function(m){ return m.status === 'live'; });
  var shown = live.filter(function(m){
    return String(m.id) === String(keep) || makerMatches(m, makerSelectSearch);
  });
  sel.innerHTML = !live.length
    ? '<option value="">No live makers yet — add one first</option>'
    : shown.length
      ? shown.map(function(m){ return '<option value="' + m.id + '">' + esc(m.shop_name || m.name) + '</option>'; }).join('')
      : '<option value="">No makers match that search</option>';
  if(shown.some(function(m){ return String(m.id) === String(keep); })) sel.value = keep;
}
document.getElementById('liMakerSearch').addEventListener('input', function(){
  makerSelectSearch = this.value;
  fillMakerSelect(overview ? overview.makers : []);
});
function renderMakers(list){
  var body = document.getElementById('makersBody');
  if(!list.length){
    body.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">No makers yet. Add the first one below.</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(m){
    var pill = m.status === 'live' ? '<span class="pill">Live</span>' : '<span class="pill arch">Archived</span>';
    var archBtn = m.status === 'live'
      ? '<button class="mini" data-archive-mk="' + m.id + '">Archive</button>'
      : '<button class="mini" data-restore-mk="' + m.id + '">Restore</button>';
    return '<tr><td><strong>' + esc(m.name) + '</strong></td><td>' + esc(m.shop_name || '') + '</td><td>' + esc(m.email) + '</td><td>' + pill + '</td><td>' +
      '<button class="mini" data-edit-mk="' + m.id + '">Edit</button>' + archBtn +
      '<button class="mini" data-view-li-mk="' + m.id + '">View listings</button>' +
      '<button class="mini danger" data-delete-mk="' + m.id + '" data-label="' + esc(m.name) + '">Delete</button></td></tr>';
  }).join('');
}
var editingMakerId = null;
function resetMakerForm(){
  editingMakerId = null;
  document.getElementById('makerId').value = '';
  document.getElementById('makerForm').reset();
  document.getElementById('mkSubmit').textContent = 'Add maker';
  document.getElementById('mkCancel').style.display = 'none';
}
document.getElementById('makerForm').addEventListener('submit', function(e){
  e.preventDefault();
  var data = {
    name: document.getElementById('mkName').value.trim(),
    shop_name: document.getElementById('mkShop').value.trim(),
    email: document.getElementById('mkEmail').value.trim(),
    phone: document.getElementById('mkPhone').value.trim(),
    bio: document.getElementById('mkBio').value.trim()
  };
  if(!data.name || !data.email){ showToast('Please fill in the maker name and email.'); return; }
  if(data.email.length > 50 || data.email.indexOf('@') === -1){ showToast('That email does not look right — it must be a real address, at most 50 characters.'); return; }
  var call = editingMakerId
    ? api('/api/admin/makers?id=' + encodeURIComponent(editingMakerId), 'PATCH', data)
    : api('/api/admin/makers', 'POST', data);
  call.then(function(){
    showToast(editingMakerId ? 'Maker updated.' : 'Maker added.');
    resetMakerForm();
    loadOverview();
  }).catch(function(ex){ showToast(ex.message); });
});
document.getElementById('mkCancel').addEventListener('click', resetMakerForm);
document.getElementById('makersBody').addEventListener('click', function(e){
  var edit = e.target.closest('[data-edit-mk]');
  var arch = e.target.closest('[data-archive-mk]');
  var rest = e.target.closest('[data-restore-mk]');
  var viewLi = e.target.closest('[data-view-li-mk]');
  var del = e.target.closest('[data-delete-mk]');
  if(viewLi){
    var mkId = viewLi.getAttribute('data-view-li-mk');
    listingFilter.maker = mkId;
    var fsearch = document.getElementById('liFilterMakerSearch');
    if(fsearch){ fsearch.value = ''; makerFilterSearch = ''; }
    fillMakerFilter(overview ? overview.makers : []);
    var fsel = document.getElementById('liFilterMaker');
    if(fsel) fsel.value = mkId;
    activateSection('secListings');
    renderListings(overview ? overview.listings : [], overview ? overview.makers : []);
    document.getElementById('secListings').scrollIntoView({behavior: 'smooth'});
    return;
  }
  if(edit){
    var m = (overview && overview.makers || []).find(function(x){ return x.id === edit.getAttribute('data-edit-mk'); });
    if(!m) return;
    editingMakerId = m.id;
    document.getElementById('makerId').value = m.id;
    document.getElementById('mkName').value = m.name || '';
    document.getElementById('mkShop').value = m.shop_name || '';
    document.getElementById('mkEmail').value = m.email || '';
    document.getElementById('mkPhone').value = m.phone || '';
    document.getElementById('mkBio').value = m.bio || '';
    document.getElementById('mkSubmit').textContent = 'Save changes';
    document.getElementById('mkCancel').style.display = 'inline-block';
    document.getElementById('makerForm').scrollIntoView({behavior: 'smooth'});
    return;
  }
  if(arch){
    api('/api/admin/makers?id=' + encodeURIComponent(arch.getAttribute('data-archive-mk')), 'PATCH', {status: 'archived'})
      .then(function(){ showToast('Maker archived — hidden from the site.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(rest){
    api('/api/admin/makers?id=' + encodeURIComponent(rest.getAttribute('data-restore-mk')), 'PATCH', {status: 'live'})
      .then(function(){ showToast('Maker restored — live on the site again.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(del){
    var label = del.getAttribute('data-label');
    if(!window.confirm('Delete "' + label + '" for good? All of their listings will be deleted too.')) return;
    api('/api/admin/makers?id=' + encodeURIComponent(del.getAttribute('data-delete-mk')), 'DELETE')
      .then(function(){ showToast('Maker deleted.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
  }
});

// --- Listings ---
// Search / filter / sort. Default sort ("oldest") keeps the order the
// API returns (position, then creation date) — exactly as before.
var listingFilter = { q: '', maker: '', cat: '', sort: 'oldest' };
var makerFilterSearch = '';
function fillMakerFilter(makers){
  var sel = document.getElementById('liFilterMaker');
  var keep = listingFilter.maker;
  sel.innerHTML = '<option value="">All makers</option>' + (makers || []).filter(function(m){
    return String(m.id) === String(keep) || makerMatches(m, makerFilterSearch);
  }).map(function(m){
    return '<option value="' + m.id + '">' + esc(m.shop_name || m.name) + '</option>';
  }).join('');
  sel.value = (makers || []).some(function(m){ return String(m.id) === String(keep); }) ? keep : '';
  listingFilter.maker = sel.value;
}
document.getElementById('liFilterMakerSearch').addEventListener('input', function(){
  makerFilterSearch = this.value;
  fillMakerFilter(overview ? overview.makers : []);
});
function applyListingFilter(list){
  var q = listingFilter.q.trim().toLowerCase();
  var out = (list || []).filter(function(l){
    if(listingFilter.maker && String(l.maker_id) !== String(listingFilter.maker)) return false;
    if(listingFilter.cat && String(l.category || '') !== listingFilter.cat) return false;
    if(q && String(l.name || '').toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  if(listingFilter.sort === 'newest'){
    out = out.slice().sort(function(a, b){ return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
  } else if(listingFilter.sort === 'name'){
    out = out.slice().sort(function(a, b){ return String(a.name || '').localeCompare(String(b.name || '')); });
  }
  return out;
}
function rerenderListings(){
  renderListings(overview ? overview.listings : [], overview ? overview.makers : []);
}
document.getElementById('liSearch').addEventListener('input', function(){
  listingFilter.q = this.value;
  rerenderListings();
});
document.getElementById('liFilterMaker').addEventListener('change', function(){
  listingFilter.maker = this.value;
  rerenderListings();
});
document.getElementById('liFilterCat').addEventListener('change', function(){
  listingFilter.cat = this.value;
  rerenderListings();
});
document.getElementById('liSort').addEventListener('change', function(){
  listingFilter.sort = this.value;
  rerenderListings();
});

function renderListings(list, makers){
  var body = document.getElementById('listingsBody');
  var rows = applyListingFilter(list);
  if(!rows.length){
    var filtering = listingFilter.q || listingFilter.maker || listingFilter.cat;
    body.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">' + (filtering ? 'No listings match that search.' : 'No listings yet.') + '</td></tr>';
    return;
  }
  var labels = {pottery: 'Pottery', jewelry: 'Jewelry', homeware: 'Homeware', textiles: 'Textiles', art: 'Art', 'cards-stationery': 'Cards & Stationery', 'clothing-accessories': 'Clothing & Accessories', weddings: 'Weddings', 'craft-supplies': 'Craft Supplies', 'christmas-gifts': 'Christmas Gifts', other: 'Other'};
  body.innerHTML = rows.map(function(l){
    var pill = l.status === 'live' ? '<span class="pill">Live</span>' : '<span class="pill arch">Archived</span>';
    var archBtn = l.status === 'live'
      ? '<button class="mini" data-archive-li="' + l.id + '">Archive</button>'
      : '<button class="mini" data-restore-li="' + l.id + '">Restore</button>';
    return '<tr><td><strong>' + esc(l.name) + '</strong></td><td>' + esc(makerName(makers, l.maker_id)) + '</td><td>' + esc(l.price) + '</td><td>' + esc(labels[l.category] || l.category) + '</td><td>' + pill + '</td><td>' +
      '<button class="mini" data-edit-li="' + l.id + '">Edit</button>' + archBtn +
      '<button class="mini danger" data-delete-li="' + l.id + '" data-label="' + esc(l.name) + '">Delete</button></td></tr>';
  }).join('');
}
// --- Listing photo: file upload (replaces the old text path) ---
// The hidden #liPhoto carries the photo value that gets saved. The
// preview shows it as-is: old relative paths (images/...) and new full
// storage URLs both work as an <img> src.
function showPhotoPreview(photo){
  var wrap = document.getElementById('liPhotoPreview');
  var img = document.getElementById('liPhotoImg');
  var pathEl = document.getElementById('liPhotoPath');
  var noneEl = document.getElementById('liPhotoNone');
  if(photo){
    img.src = photo;
    pathEl.textContent = photo;
    wrap.style.display = 'block';
    noneEl.style.display = 'none';
  } else {
    img.removeAttribute('src');
    pathEl.textContent = '';
    wrap.style.display = 'none';
    noneEl.style.display = 'block';
  }
}
// Picking a file previews it right away; the upload itself happens when
// the listing is saved.
document.getElementById('liPhotoFile').addEventListener('change', function(){
  var f = this.files && this.files[0];
  if(!f){ showPhotoPreview(document.getElementById('liPhoto').value.trim()); return; }
  document.getElementById('liPhotoImg').src = URL.createObjectURL(f);
  document.getElementById('liPhotoPath').textContent = 'New picture: ' + f.name + ' — uploads when you save the listing.';
  document.getElementById('liPhotoPreview').style.display = 'block';
  document.getElementById('liPhotoNone').style.display = 'none';
});

var editingListingId = null;
function resetListingForm(){
  editingListingId = null;
  document.getElementById('liId').value = '';
  document.getElementById('listingForm').reset();
  makerSelectSearch = '';
  fillMakerSelect(overview ? overview.makers : []);
  document.getElementById('liPhoto').value = '';
  showPhotoPreview('');
  document.getElementById('liSubmit').textContent = 'Add listing';
  document.getElementById('liCancel').style.display = 'none';
}
document.getElementById('listingForm').addEventListener('submit', function(e){
  e.preventDefault();
  var fileInput = document.getElementById('liPhotoFile');
  var file = fileInput.files && fileInput.files[0];
  var photo = document.getElementById('liPhoto').value.trim();
  // Save the listing with the photo value we have. When a new picture
  // was picked, it is uploaded first and the returned URL is saved
  // instead. With no new file, the existing photo is left untouched.
  function saveListing(){
    var data = {
      maker_id: document.getElementById('liMaker').value,
      name: document.getElementById('liName').value.trim(),
      price: document.getElementById('liPrice').value.trim(),
      category: document.getElementById('liCat').value,
      description: document.getElementById('liDesc').value.trim(),
      photo: photo
    };
    if(!data.maker_id || !data.name || !data.price){ showToast('Pick a maker, then fill in the product name and price.'); return; }
    var call = editingListingId
      ? api('/api/admin/listings?id=' + encodeURIComponent(editingListingId), 'PATCH', data)
      : api('/api/admin/listings', 'POST', data);
    call.then(function(){
      showToast(editingListingId ? 'Listing updated.' : 'Listing added — it is live on the site now.');
      resetListingForm();
      loadOverview();
    }).catch(function(ex){ showToast(ex.message); });
  }
  if(!file){ saveListing(); return; }
  if(file.size > 5 * 1024 * 1024){ showToast('That picture is over 5 MB — pick a smaller one.'); return; }
  if(file.type.indexOf('image/') !== 0){ showToast('Only pictures can be uploaded.'); return; }
  var fd = new FormData();
  fd.append('photo', file);
  var makerSel = document.getElementById('liMaker');
  fd.append('maker', makerSel.options[makerSel.selectedIndex] ? makerSel.options[makerSel.selectedIndex].text : 'maker');
  fd.append('listing', document.getElementById('liName').value.trim());
  showToast('Uploading picture…');
  var headers = {};
  if(token) headers['x-admin-session'] = token;
  fetch('/api/admin/upload-photo', {method: 'POST', headers: headers, body: fd})
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
    .then(function(j){ photo = j.url; saveListing(); })
    .catch(function(ex){ showToast(ex.message || 'Picture upload failed.'); });
});
document.getElementById('liCancel').addEventListener('click', resetListingForm);
document.getElementById('listingsBody').addEventListener('click', function(e){
  var edit = e.target.closest('[data-edit-li]');
  var arch = e.target.closest('[data-archive-li]');
  var rest = e.target.closest('[data-restore-li]');
  var del = e.target.closest('[data-delete-li]');
  if(edit){
    var l = (overview && overview.listings || []).find(function(x){ return x.id === edit.getAttribute('data-edit-li'); });
    if(!l) return;
    editingListingId = l.id;
    document.getElementById('liId').value = l.id;
    var ms = document.getElementById('liMakerSearch');
    if(ms){ ms.value = ''; makerSelectSearch = ''; fillMakerSelect(overview ? overview.makers : []); }
    document.getElementById('liMaker').value = l.maker_id || '';
    document.getElementById('liName').value = l.name || '';
    document.getElementById('liPrice').value = l.price || '';
    /* Old category names (knitting/candles/food/sewing/woodwork) map onto the new
       fixed list so an older listing still opens with a valid choice. */
    var catMap = {knitting: 'textiles', candles: 'other', food: 'other', sewing: 'textiles', woodwork: 'other'};
    document.getElementById('liCat').value = catMap[l.category] || l.category || 'pottery';
    document.getElementById('liDesc').value = l.description || '';
    document.getElementById('liPhoto').value = l.photo || '';
    showPhotoPreview(l.photo || '');
    document.getElementById('liSubmit').textContent = 'Save changes';
    document.getElementById('liCancel').style.display = 'inline-block';
    document.getElementById('listingForm').scrollIntoView({behavior: 'smooth'});
    return;
  }
  if(arch){
    api('/api/admin/listings?id=' + encodeURIComponent(arch.getAttribute('data-archive-li')), 'PATCH', {status: 'archived'})
      .then(function(){ showToast('Listing archived — hidden from the site.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(rest){
    api('/api/admin/listings?id=' + encodeURIComponent(rest.getAttribute('data-restore-li')), 'PATCH', {status: 'live'})
      .then(function(){ showToast('Listing restored — live on the site again.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(del){
    var label = del.getAttribute('data-label');
    if(!window.confirm('Delete the "' + label + '" listing for good?')) return;
    api('/api/admin/listings?id=' + encodeURIComponent(del.getAttribute('data-delete-li')), 'DELETE')
      .then(function(){ showToast('Listing deleted.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
  }
});

// --- Reservations ---
// Archive sets a reservation aside: it leaves the main list, appears
// under "Archived reservations" below, never counts toward "Sold"
// (only status='done' counts, server-side), and Restore brings it back
// as New. Delete still removes it for good, with a confirm.
// Buyer names are shown truncated with an ellipsis (CSS .buyer-name)
// so a very long name already in the database can never stretch the
// table — new names are capped at 20 characters at the reserve form
// and server-side. The full name is on hover (title).
function resRow(r, listings, makers, archived){
  var pill = r.status === 'new' ? '<span class="pill">New</span>'
    : r.status === 'contacted' ? '<span class="pill">Contacted</span>'
    : r.status === 'archived' ? '<span class="pill arch">Archived</span>'
    : '<span class="pill arch">Done</span>';
  var nextBtn = !archived && r.status === 'new'
    ? '<button class="mini" data-res-contacted="' + r.id + '">Mark contacted</button>'
    : !archived && r.status === 'contacted'
    ? '<button class="mini" data-res-done="' + r.id + '">Mark done</button>'
    : '';
  var archBtn = archived
    ? '<button class="mini" data-res-restore="' + r.id + '">Restore</button>'
    : '<button class="mini" data-res-archive="' + r.id + '">Archive</button>';
  return '<tr><td><strong class="buyer-name" title="' + esc(r.buyer_name) + '">' + esc(r.buyer_name) + '</strong><br><span style="color:var(--muted)">' + esc(r.buyer_email) + '</span></td>' +
    '<td>' + esc(listingName(listings, r.listing_id)) + '<br><span style="color:var(--muted)">' + esc(makerName(makers, r.maker_id)) + '</span></td>' +
    '<td>' + esc(r.quantity || '1') + '</td><td>' + esc(r.delivery_method || 'Pickup') + '</td>' +
    '<td>' + fmtDate(r.created_at) + '</td><td>' + pill + '</td><td>' + nextBtn + archBtn +
    '<button class="mini danger" data-res-del="' + r.id + '">Delete</button></td></tr>';
}
function renderRes(list, listings, makers){
  var body = document.getElementById('resBody');
  var archBody = document.getElementById('resArchBody');
  var archWrap = document.getElementById('resArchived');
  var active = (list || []).filter(function(r){ return r.status !== 'archived'; });
  var archived = (list || []).filter(function(r){ return r.status === 'archived'; });
  if(!active.length){
    body.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">No reservations saved yet. The reserve form still sends them by email — this list fills in once the form is switched to save here.</td></tr>';
  } else {
    body.innerHTML = active.map(function(r){ return resRow(r, listings, makers, false); }).join('');
  }
  if(archBody){
    if(!archived.length){
      archBody.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">No archived reservations.</td></tr>';
    } else {
      archBody.innerHTML = archived.map(function(r){ return resRow(r, listings, makers, true); }).join('');
    }
  }
  if(archWrap) archWrap.style.display = archived.length ? 'block' : 'none';
}
document.getElementById('resBody').addEventListener('click', function(e){
  var con = e.target.closest('[data-res-contacted]');
  var done = e.target.closest('[data-res-done]');
  var arc = e.target.closest('[data-res-archive]');
  var del = e.target.closest('[data-res-del]');
  if(con){
    api('/api/admin/reservations?id=' + encodeURIComponent(con.getAttribute('data-res-contacted')), 'PATCH', {status: 'contacted'})
      .then(function(){ showToast('Marked contacted.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(done){
    api('/api/admin/reservations?id=' + encodeURIComponent(done.getAttribute('data-res-done')), 'PATCH', {status: 'done'})
      .then(function(){ showToast('Marked done.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(arc){
    api('/api/admin/reservations?id=' + encodeURIComponent(arc.getAttribute('data-res-archive')), 'PATCH', {status: 'archived'})
      .then(function(){ showToast('Reservation archived.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(del){
    if(!window.confirm('Delete this reservation for good?')) return;
    api('/api/admin/reservations?id=' + encodeURIComponent(del.getAttribute('data-res-del')), 'DELETE')
      .then(function(){ showToast('Reservation deleted.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
  }
});
var archBodyEl = document.getElementById('resArchBody');
if(archBodyEl){
  archBodyEl.addEventListener('click', function(e){
    var res = e.target.closest('[data-res-restore]');
    var del = e.target.closest('[data-res-del]');
    if(res){
      api('/api/admin/reservations?id=' + encodeURIComponent(res.getAttribute('data-res-restore')), 'PATCH', {status: 'new'})
        .then(function(){ showToast('Reservation restored.'); loadOverview(); })
        .catch(function(ex){ showToast(ex.message); });
      return;
    }
    if(del){
      if(!window.confirm('Delete this reservation for good?')) return;
      api('/api/admin/reservations?id=' + encodeURIComponent(del.getAttribute('data-res-del')), 'DELETE')
        .then(function(){ showToast('Reservation deleted.'); loadOverview(); })
        .catch(function(ex){ showToast(ex.message); });
    }
  });
}

// --- Newsletter subscribers ---
// Signed up from the home-page form. Archive sets a subscriber aside
// (no emails, does not count as active); Restore brings them back;
// Remove deletes the row for good. Emails are shown here only —
// never on any public page.
function renderSubscribers(list){
  var body = document.getElementById('subBody');
  var count = document.getElementById('subCount');
  var active = (list || []).filter(function(s){ return s.status === 'active'; }).length;
  if(count) count.textContent = list.length ? (list.length + ' total · ' + active + ' active') : '';
  var sendCount = document.getElementById('nlSendCount');
  if(sendCount) sendCount.textContent = 'This will send to ' + active + ' active subscriber' + (active === 1 ? '' : 's') + '.';
  var sendBtn = document.getElementById('nlSendBtn');
  if(sendBtn) sendBtn.disabled = active === 0;
  if(!list.length){
    body.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No newsletter subscribers yet. People sign up from the home page.</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(s){
    var pill = s.status === 'active' ? '<span class="pill">Active</span>' : '<span class="pill arch">Archived</span>';
    var archBtn = s.status === 'active'
      ? '<button class="mini" data-sub-archive="' + s.id + '">Archive</button>' +
        '<button class="mini" data-sub-unsubscribe="' + s.id + '" data-label="' + esc(s.email) + '">Unsubscribe</button>'
      : '<button class="mini" data-sub-restore="' + s.id + '">Restore</button>';
    return '<tr><td><strong>' + esc(s.email) + '</strong></td><td>' + fmtDate(s.created_at) + '</td><td>' + pill + '</td><td>' + archBtn +
      '<button class="mini danger" data-sub-del="' + s.id + '" data-label="' + esc(s.email) + '">Remove</button></td></tr>';
  }).join('');
}
document.getElementById('subBody').addEventListener('click', function(e){
  var arch = e.target.closest('[data-sub-archive]');
  var unsub = e.target.closest('[data-sub-unsubscribe]');
  var res = e.target.closest('[data-sub-restore]');
  var del = e.target.closest('[data-sub-del]');
  if(arch){
    api('/api/admin/subscribers?id=' + encodeURIComponent(arch.getAttribute('data-sub-archive')) + '&action=archive', 'PATCH', {})
      .then(function(){ showToast('Subscriber archived.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(unsub){
    // Unsubscribe = archive, with a confirm and plain wording: the row
    // is kept (archived) so they stay off future sends and can be
    // restored if they change their mind. Same endpoint as Archive.
    if(!window.confirm('Unsubscribe ' + unsub.getAttribute('data-label') + ' from the newsletter? They will get no more emails, and you can restore them later.')) return;
    api('/api/admin/subscribers?id=' + encodeURIComponent(unsub.getAttribute('data-sub-unsubscribe')) + '&action=archive', 'PATCH', {})
      .then(function(){ showToast('Subscriber unsubscribed.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(res){
    api('/api/admin/subscribers?id=' + encodeURIComponent(res.getAttribute('data-sub-restore')) + '&action=restore', 'PATCH', {})
      .then(function(){ showToast('Subscriber restored.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(del){
    if(!window.confirm('Remove ' + del.getAttribute('data-label') + ' from the newsletter for good?')) return;
    api('/api/admin/subscribers?id=' + encodeURIComponent(del.getAttribute('data-sub-del')), 'DELETE')
      .then(function(){ showToast('Subscriber removed.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
  }
});

// --- Newsletter PDF attachment ---
// Default attachment: the hosted Newsletter Issue 1 PDF (approved by
// the owner). Picking a PDF uploads it to Supabase Storage (same bucket
// as the listing photos, under "newsletter/") and replaces the
// attachment; Remove sends with no attachment at all.
var DEFAULT_NL_ATTACHMENT = { kind: 'hosted', path: 'issues/issue-1.pdf', name: 'locally-crafted-newsletter-issue-1.pdf' };
var nlAttachment = DEFAULT_NL_ATTACHMENT;
function updateNlPdfUI(){
  var cur = document.getElementById('nlPdfCurrent');
  var none = document.getElementById('nlPdfNone');
  var nameEl = document.getElementById('nlPdfName');
  if(!cur || !none) return;
  if(nlAttachment){
    if(nameEl) nameEl.textContent = nlAttachment.name;
    cur.style.display = 'block';
    none.style.display = 'none';
  } else {
    cur.style.display = 'none';
    none.style.display = 'block';
  }
}
document.getElementById('nlPdfRemove').addEventListener('click', function(){
  nlAttachment = null;
  document.getElementById('nlPdf').value = '';
  updateNlPdfUI();
  showToast('PDF removed — the newsletter will send without an attachment.');
});
document.getElementById('nlPdf').addEventListener('change', function(){
  var f = this.files && this.files[0];
  if(!f) return;
  if(f.type && f.type !== 'application/pdf' && f.name.slice(-4).toLowerCase() !== '.pdf'){
    showToast('Only PDF files can be attached.');
    this.value = '';
    return;
  }
  if(f.size > 10 * 1024 * 1024){ showToast('That PDF is over 10 MB — pick a smaller one.'); this.value = ''; return; }
  var fd = new FormData();
  fd.append('pdf', f);
  var headers = {};
  if(token) headers['x-admin-session'] = token;
  showToast('Uploading PDF…');
  fetch('/api/admin/upload-newsletter-pdf', {method: 'POST', headers: headers, body: fd})
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
    .then(function(j){
      nlAttachment = { kind: 'storage', path: j.path, name: j.name || f.name };
      updateNlPdfUI();
      showToast('PDF attached: ' + nlAttachment.name);
    })
    .catch(function(ex){ showToast(ex.message || 'PDF upload failed.'); });
});
updateNlPdfUI();

// --- Send the newsletter ---
// Sends to every ACTIVE subscriber, one email each. Asks first, with
// the live count, and shows sent / failed afterwards. Nothing is sent
// until the owner clicks Send here — building this does not send mail.
document.getElementById('nlSendForm').addEventListener('submit', function(e){
  e.preventDefault();
  var subject = document.getElementById('nlSubject').value.trim();
  var body = document.getElementById('nlBody').value.trim();
  var result = document.getElementById('nlSendResult');
  var btn = document.getElementById('nlSendBtn');
  if(!subject){ showToast('Add a subject first.'); return; }
  if(!body){ showToast('Write the newsletter message first.'); return; }
  var countText = (document.getElementById('nlSendCount') || {}).textContent || '';
  var m = countText.match(/(\d+) active/);
  var n = m ? parseInt(m[1], 10) : 0;
  if(!n){ showToast('No active subscribers to send to yet.'); return; }
  var attachNote = nlAttachment ? '\n\nAttachment: ' + nlAttachment.name : '\n\nNo PDF attached.';
  if(!window.confirm('Send this newsletter to ' + n + ' active subscriber' + (n === 1 ? '' : 's') + '?\n\nSubject: ' + subject + attachNote)) return;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  result.style.display = 'none';
  api('/api/admin/send-newsletter', 'POST', {subject: subject, body: body, attachment: nlAttachment})
    .then(function(j){
      var msg = 'Sent to ' + j.sent + ' of ' + j.recipients + ' subscriber' + (j.recipients === 1 ? '' : 's') + '.';
      if(j.attached) msg += ' Attached: ' + j.attached + '.';
      if(j.failed) msg += ' Failed: ' + j.failed + '.' + (j.failures && j.failures.length ? ' ' + j.failures.slice(0, 3).join(' ') : '');
      result.textContent = msg;
      result.style.display = 'block';
      showToast(j.failed ? 'Newsletter sent with ' + j.failed + ' failure(s).' : 'Newsletter sent to ' + j.sent + ' subscriber' + (j.sent === 1 ? '' : 's') + '.');
    })
    .catch(function(ex){ showToast(ex.message); })
    .finally(function(){ btn.disabled = false; btn.textContent = 'Send newsletter'; });
});

// --- Product submissions (Submit a Product form) ---
// Pending = sent in by a maker, not on the public site yet. Approve
// creates the live listing (and the maker, if new). Reject keeps it
// off the site. Everything is escaped on display, like the rest.
function renderSubmissions(list){
  var body = document.getElementById('subBody');
  if(!list.length){
    body.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">No product submissions yet. Makers send them in from the “Submit a product” button on the front page.</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(s){
    var pill = s.status === 'pending' ? '<span class="pill">Pending</span>'
      : s.status === 'approved' ? '<span class="pill arch">Approved</span>'
      : '<span class="pill arch">Rejected</span>';
    var photo = s.photo_url
      ? '<a href="' + esc(s.photo_url) + '" target="_blank" rel="noopener"><img src="' + esc(s.photo_url) + '" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"></a>'
      : '—';
    var desc = s.description ? '<br><span style="color:var(--muted)">' + esc(String(s.description).slice(0, 120)) + (String(s.description).length > 120 ? '…' : '') + '</span>' : '';
    var catLabel = s.category_label || s.category || '';
    if (s.category === 'other' && s.other_category) catLabel += ' — ' + s.other_category;
    var biz = s.business_name ? '<br>' + esc(s.business_name) : '';
    var actions = s.status === 'pending'
      ? '<button class="mini" data-sub-approve="' + s.id + '">Approve — put it live</button>' +
        '<button class="mini" data-sub-reject="' + s.id + '">Reject</button>'
      : '';
    return '<tr><td><strong>' + esc(s.product_name) + '</strong><br><span style="color:var(--muted)">' + esc(catLabel) + ' · ' + esc(s.price || '') + '</span>' + desc + '</td>' +
      '<td><strong>' + esc(s.maker_name) + '</strong>' + biz + '<br><span style="color:var(--muted)">' + esc(s.maker_email) + '</span></td>' +
      '<td>' + photo + '</td>' +
      '<td>' + fmtDate(s.created_at) + '</td><td>' + pill + '</td><td>' + actions +
      '<button class="mini danger" data-sub-del="' + s.id + '">Delete</button></td></tr>';
  }).join('');
}
document.getElementById('subBody').addEventListener('click', function(e){
  var app = e.target.closest('[data-sub-approve]');
  var rej = e.target.closest('[data-sub-reject]');
  var del = e.target.closest('[data-sub-del]');
  if(app){
    // Double-click guard (audit N-L3): disable while the request is in
    // flight, re-enable on error. The confirm dialog alone did not
    // stop two parallel Approves from two tabs/clicks.
    if(app.disabled) return;
    if(!window.confirm('Approve this product? It will go live on the public site right away.')) return;
    app.disabled = true;
    var approveId = app.getAttribute('data-sub-approve');
    var sendApprove = function (confirmAttach) {
      var body = {action: 'approve'};
      if (confirmAttach) body.confirm_attach = true;
      return api('/api/admin/submissions?id=' + encodeURIComponent(approveId), 'POST', body);
    };
    sendApprove(false)
      .then(function(){ showToast('Approved — the product is live on the site.'); loadOverview(); })
      .catch(function(ex){
        // Attach-to-existing-shop 409: the server names the shop. Ask
        // the owner explicitly, and only re-send with confirm_attach
        // when they agree. Every other 409 (email not verified /
        // already handled / archived maker) is shown in plain words.
        if(ex.status === 409 && ex.existing_shop_name){
          if(window.confirm('This email belongs to the existing shop "' + ex.existing_shop_name + '". Attach this product to that shop?')){
            sendApprove(true)
              .then(function(){ showToast('Approved — the product is live on the site.'); loadOverview(); })
              .catch(function(ex2){ app.disabled = false; showToast(ex2.message); });
            return;
          }
          app.disabled = false;
          showToast('Not approved — left pending.');
          return;
        }
        app.disabled = false;
        showToast(ex.message);
      });
    return;
  }
  if(rej){
    if(!window.confirm('Reject this product? It will stay off the site.')) return;
    api('/api/admin/submissions?id=' + encodeURIComponent(rej.getAttribute('data-sub-reject')), 'POST', {action: 'reject'})
      .then(function(){ showToast('Rejected.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
    return;
  }
  if(del){
    if(!window.confirm('Delete this submission for good?')) return;
    api('/api/admin/submissions?id=' + encodeURIComponent(del.getAttribute('data-sub-del')), 'DELETE')
      .then(function(){ showToast('Submission deleted.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
  }
});

// --- Featured maker ---
// The home page "Featured maker" box. Saved as one JSON value in the
// settings table (key "featured_maker") via POST /api/admin/settings —
// the same save the Settings tab uses — and the home page reads it back
// from GET /api/featured, so saving here updates the site with no
// redeploy. Until anything is saved, the home page keeps its hardcoded
// Mary Stones content. Picking a maker fills in their words and their
// first listing photo; everything stays editable afterwards.
var featuredMakers = [];
var featuredListings = [];
function fmFirstName(name){
  var parts = (name || '').trim().split(/\s+/);
  return parts[0] || 'this maker';
}
function fmInitials(name){
  var parts = (name || '?').trim().split(/\s+/);
  var first = parts[0] ? parts[0].charAt(0) : '?';
  var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}
function showFmPhotoPreview(photo){
  var wrap = document.getElementById('fmPhotoPreview');
  var img = document.getElementById('fmPhotoImg');
  var pathEl = document.getElementById('fmPhotoPath');
  var noneEl = document.getElementById('fmPhotoNone');
  if(photo){
    img.src = photo;
    pathEl.textContent = photo;
    wrap.style.display = 'block';
    noneEl.style.display = 'none';
  } else {
    img.removeAttribute('src');
    pathEl.textContent = '';
    wrap.style.display = 'none';
    noneEl.style.display = 'block';
  }
}
function fillFeaturedForm(makers, listings, savedRaw){
  featuredMakers = (makers || []).filter(function(m){ return m.status === 'live'; });
  featuredListings = listings || [];
  var sel = document.getElementById('fmMaker');
  var keep = sel.value;
  sel.innerHTML = featuredMakers.map(function(m){
    return '<option value="' + esc(m.id) + '">' + esc(m.name) + (m.shop_name ? ' — ' + esc(m.shop_name) : '') + '</option>';
  }).join('');
  var saved = null;
  try { saved = savedRaw ? JSON.parse(savedRaw) : null; } catch (e) { saved = null; }
  if(saved && saved.maker_id && featuredMakers.some(function(m){ return m.id === saved.maker_id; })) {
    sel.value = saved.maker_id;
  } else if(keep && featuredMakers.some(function(m){ return m.id === keep; })) {
    sel.value = keep;
  }
  document.getElementById('fmHeading').value = (saved && saved.heading) || '';
  document.getElementById('fmMakerLine').value = (saved && saved.maker_line) || '';
  document.getElementById('fmDesc').value = (saved && saved.description) || '';
  document.getElementById('fmButtonText').value = (saved && saved.button_text) || '';
  document.getElementById('fmButtonUrl').value = (saved && saved.button_url) || '';
  document.getElementById('fmPhoto').value = (saved && saved.photo) || '';
  showFmPhotoPreview((saved && saved.photo) || '');
}
document.getElementById('fmMaker').addEventListener('change', function(){
  var m = featuredMakers.find(function(x){ return x.id === document.getElementById('fmMaker').value; });
  if(!m) return;
  var shop = m.shop_name || '';
  document.getElementById('fmHeading').value = shop ? (m.name + ' — ' + shop) : m.name;
  document.getElementById('fmMakerLine').value = shop ? (m.name + ' — ' + shop) : m.name;
  document.getElementById('fmButtonText').value = 'See all from ' + fmFirstName(m.name) + ' →';
  if(m.name === 'Mary Stones') document.getElementById('fmButtonUrl').value = 'mary-stones.html';
  var firstPhoto = (featuredListings || []).find(function(l){ return l.maker_id === m.id && l.status === 'live' && l.photo; });
  if(firstPhoto){
    document.getElementById('fmPhoto').value = firstPhoto.photo;
    showFmPhotoPreview(firstPhoto.photo);
  }
  if(m.bio) document.getElementById('fmDesc').value = m.bio;
});
document.getElementById('fmPhotoFile').addEventListener('change', function(){
  var f = this.files && this.files[0];
  if(!f){ showFmPhotoPreview(document.getElementById('fmPhoto').value.trim()); return; }
  document.getElementById('fmPhotoImg').src = URL.createObjectURL(f);
  document.getElementById('fmPhotoPath').textContent = 'New picture: ' + f.name + ' — uploads when you save.';
  document.getElementById('fmPhotoPreview').style.display = 'block';
  document.getElementById('fmPhotoNone').style.display = 'none';
});
document.getElementById('featuredForm').addEventListener('submit', function(e){
  e.preventDefault();
  var makerId = document.getElementById('fmMaker').value;
  var m = featuredMakers.find(function(x){ return x.id === makerId; });
  if(!m){ showToast('Pick a maker first.'); return; }
  var heading = document.getElementById('fmHeading').value.trim();
  if(!heading){ showToast('Add a heading for the featured maker.'); return; }
  var fileInput = document.getElementById('fmPhotoFile');
  var file = fileInput.files && fileInput.files[0];
  var photo = document.getElementById('fmPhoto').value.trim();
  function saveFeatured(){
    var data = {
      maker_id: m.id,
      maker_name: m.name,
      shop_name: m.shop_name || '',
      heading: heading,
      maker_line: document.getElementById('fmMakerLine').value.trim(),
      description: document.getElementById('fmDesc').value.trim(),
      button_text: document.getElementById('fmButtonText').value.trim(),
      button_url: document.getElementById('fmButtonUrl').value.trim(),
      photo: photo,
      badge_initials: fmInitials(m.name),
      badge_logo: ''
    };
    api('/api/admin/settings', 'POST', { featured_maker: JSON.stringify(data) })
      .then(function(){ showToast('Featured maker saved — the home page shows it now.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
  }
  if(!file){ saveFeatured(); return; }
  if(file.size > 5 * 1024 * 1024){ showToast('That picture is over 5 MB — pick a smaller one.'); return; }
  if(file.type.indexOf('image/') !== 0){ showToast('Only pictures can be uploaded.'); return; }
  var fd = new FormData();
  fd.append('photo', file);
  fd.append('maker', m.name);
  fd.append('listing', 'featured');
  showToast('Uploading picture…');
  var headers = {};
  if(token) headers['x-admin-session'] = token;
  fetch('/api/admin/upload-photo', {method: 'POST', headers: headers, body: fd})
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); })
    .then(function(j){ photo = j.url; saveFeatured(); })
    .catch(function(ex){ showToast(ex.message || 'Picture upload failed.'); });
});

// --- Settings ---
document.getElementById('settingsForm').addEventListener('submit', function(e){
  e.preventDefault();
  api('/api/admin/settings', 'POST', {
    notification_email: document.getElementById('setNotif').value.trim(),
    sender_email: document.getElementById('setSender').value.trim()
  }).then(function(){ showToast('Settings saved.'); })
    .catch(function(ex){ showToast(ex.message); });
});

// --- Start: if a session exists, go straight to the dashboard.
if(token) showDash();
else showLogin();
