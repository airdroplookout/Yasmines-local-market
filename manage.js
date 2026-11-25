// Manage — Yasmine's Local Market. Wired to the real backend (Nov 2026).
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
function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtDate(s){ if(!s) return '—'; try { return new Date(s).toLocaleDateString('en-CA', {year:'numeric', month:'short', day:'numeric'}); } catch(e){ return s; } }

function api(path, method, body){
  var headers = {'Content-Type': 'application/json'};
  if(token) headers['x-admin-session'] = token;
  return fetch(path, {method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined})
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
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
  api('/api/admin/forgot', 'POST', {}).then(function(j){
    showToast(j.message || 'If a reset email could be sent, check your inbox.');
  }).catch(function(){
    showToast('If a reset email could be sent, check your inbox.');
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
document.querySelectorAll('.mnav .chip').forEach(function(c){
  c.addEventListener('click', function(){
    document.querySelectorAll('.mnav .chip').forEach(function(x){ x.classList.toggle('active', x === c); });
    ['secVisits', 'secMakers', 'secListings', 'secRes', 'secSettings'].forEach(function(id){
      document.getElementById(id).style.display = (id === c.getAttribute('data-sec')) ? 'block' : 'none';
    });
  });
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
      (j.new_reservations != null ? j.new_reservations : 0) + ' new reservations';
    fillMakerSelect(j.makers || []);
    renderMakers(j.makers || []);
    renderListings(j.listings || [], j.makers || []);
    renderRes(j.reservations || [], j.listings || [], j.makers || []);
    var s = j.settings || {};
    document.getElementById('setNotif').value = s.notification_email || '';
    document.getElementById('setSender').value = s.sender_email || '';
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
function fillMakerSelect(makers){
  var sel = document.getElementById('liMaker');
  var live = (makers || []).filter(function(m){ return m.status === 'live'; });
  sel.innerHTML = live.length
    ? live.map(function(m){ return '<option value="' + m.id + '">' + esc(m.shop_name || m.name) + '</option>'; }).join('')
    : '<option value="">No live makers yet — add one first</option>';
}
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
  var del = e.target.closest('[data-delete-mk]');
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
function renderListings(list, makers){
  var body = document.getElementById('listingsBody');
  if(!list.length){
    body.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">No listings yet.</td></tr>';
    return;
  }
  var labels = {pottery: 'Pottery', knitting: 'Knitting', jewelry: 'Jewelry', candles: 'Candles', food: 'Food & Honey', sewing: 'Sewing', other: 'Other crafts'};
  body.innerHTML = list.map(function(l){
    var pill = l.status === 'live' ? '<span class="pill">Live</span>' : '<span class="pill arch">Archived</span>';
    var archBtn = l.status === 'live'
      ? '<button class="mini" data-archive-li="' + l.id + '">Archive</button>'
      : '<button class="mini" data-restore-li="' + l.id + '">Restore</button>';
    return '<tr><td><strong>' + esc(l.name) + '</strong></td><td>' + esc(makerName(makers, l.maker_id)) + '</td><td>' + esc(l.price) + '</td><td>' + esc(labels[l.category] || l.category) + '</td><td>' + pill + '</td><td>' +
      '<button class="mini" data-edit-li="' + l.id + '">Edit</button>' + archBtn +
      '<button class="mini danger" data-delete-li="' + l.id + '" data-label="' + esc(l.name) + '">Delete</button></td></tr>';
  }).join('');
}
var editingListingId = null;
function resetListingForm(){
  editingListingId = null;
  document.getElementById('liId').value = '';
  document.getElementById('listingForm').reset();
  document.getElementById('liSubmit').textContent = 'Add listing';
  document.getElementById('liCancel').style.display = 'none';
}
document.getElementById('listingForm').addEventListener('submit', function(e){
  e.preventDefault();
  var data = {
    maker_id: document.getElementById('liMaker').value,
    name: document.getElementById('liName').value.trim(),
    price: document.getElementById('liPrice').value.trim(),
    category: document.getElementById('liCat').value,
    description: document.getElementById('liDesc').value.trim(),
    photo: document.getElementById('liPhoto').value.trim()
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
    document.getElementById('liMaker').value = l.maker_id || '';
    document.getElementById('liName').value = l.name || '';
    document.getElementById('liPrice').value = l.price || '';
    document.getElementById('liCat').value = l.category || 'pottery';
    document.getElementById('liDesc').value = l.description || '';
    document.getElementById('liPhoto').value = l.photo || '';
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
function renderRes(list, listings, makers){
  var body = document.getElementById('resBody');
  if(!list.length){
    body.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">No reservations saved yet. The reserve form still sends them by email — this list fills in once the form is switched to save here.</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(r){
    var pill = r.status === 'new' ? '<span class="pill">New</span>'
      : r.status === 'contacted' ? '<span class="pill">Contacted</span>'
      : '<span class="pill arch">Done</span>';
    var nextBtn = r.status === 'new'
      ? '<button class="mini" data-res-contacted="' + r.id + '">Mark contacted</button>'
      : r.status === 'contacted'
      ? '<button class="mini" data-res-done="' + r.id + '">Mark done</button>'
      : '';
    return '<tr><td><strong>' + esc(r.buyer_name) + '</strong><br><span style="color:var(--muted)">' + esc(r.buyer_email) + '</span></td>' +
      '<td>' + esc(listingName(listings, r.listing_id)) + '<br><span style="color:var(--muted)">' + esc(makerName(makers, r.maker_id)) + '</span></td>' +
      '<td>' + esc(r.quantity || '1') + '</td><td>' + esc(r.delivery_method || 'Pickup') + '</td>' +
      '<td>' + fmtDate(r.created_at) + '</td><td>' + pill + '</td><td>' + nextBtn +
      '<button class="mini danger" data-res-del="' + r.id + '">Delete</button></td></tr>';
  }).join('');
}
document.getElementById('resBody').addEventListener('click', function(e){
  var con = e.target.closest('[data-res-contacted]');
  var done = e.target.closest('[data-res-done]');
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
  if(del){
    if(!window.confirm('Delete this reservation for good?')) return;
    api('/api/admin/reservations?id=' + encodeURIComponent(del.getAttribute('data-res-del')), 'DELETE')
      .then(function(){ showToast('Reservation deleted.'); loadOverview(); })
      .catch(function(ex){ showToast(ex.message); });
  }
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
