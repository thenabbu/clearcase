'use strict';
/* ClearCase — vanilla JS, no build step.

   Flow: demo sign-in -> role workspace.
   Worker: consent + patient + IMCI danger signs -> Cloudinary Upload Widget.
           Uploads are SIGNED (/api/sign; the secret never reaches the browser) and
           carry all case metadata as Cloudinary context, so the board is listed
           server-side with no database of our own.
           quality_analysis.focus (0..1) is the blur gate: below THRESHOLD the upload
           is destroyed at once and the worker retakes while the patient is present.
   Doctor: the same Cloudinary listing, red-first, with accept/escalate written back
           into the asset's context. */

var CLOUD = 'ydyp2esm';
var FOLDER = 'clearcase_cases';
var THRESHOLD = 0.4;
var signReq = null;  // the whole /api/sign payload, fetched before the widget opens
var USER = null;
var CASES = [];
var FILTER = 'all';

var RED_SIGNS = [
  'Unable to drink or breastfeed',
  'Vomits everything',
  'Has had convulsions (now or recently)',
  'Lethargic or unconscious',
  'Fever with stiff neck',
  'Noisy breathing (stridor) when calm',
  'Severe dehydration — 2 or more of: lethargic/unconscious, sunken eyes, cannot drink, skin pinch > 2 s'
];
var YELLOW_SIGNS = [
  'Chest indrawing when breathing',
  'Fast breathing (≥50/min at 2–12 mo, ≥40/min at 1–5 y)',
  'Some dehydration (restless, sunken eyes, drinks eagerly, slow skin pinch)',
  'Diarrhoea 14 days or more',
  'Blood in stool'
];
var GUIDANCE = {
  red: 'Refer urgently — take the patient to the nearest health centre or hospital now. Do not wait for a remote reply.',
  yellow: 'Monitor at home. Fluids/ORS as advised, re-check in 24–48 h. Worsening or any red sign — go immediately.',
  green: 'Routine follow-up — schedule a clinic appointment, continue current care.'
};
var RANK = { red: 0, yellow: 1, green: 2 };

function $(id){ return document.getElementById(id); }
function all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function kb(b){ return b ? (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB') : ''; }

/* Delivery URLs — every image the UI shows is a Cloudinary transform, never the original:
   - t_queue_thumb : 320 fill on g_face, so the subject stays in frame at 9 KB
   - t_case_view   : 1200 limit, so a doctor never pulls a multi-MB original on a phone
   - t_privacy_thumb: t_queue_thumb + e_blur_faces — the anonymised preview used wherever
                     the photo is shown outside the reviewing clinician's own card */
function thumbUrl(pid){ return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/t_queue_thumb/f_auto,q_auto/' + pid; }
function fullUrl(pid){ return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/t_case_view/f_auto,q_auto/' + pid; }
function privacyUrl(pid){ return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/t_privacy_thumb/f_auto,q_auto/' + pid; }

/* ================================================================= sign in */
function showGate(msg){
  $('gate').classList.remove('hidden');
  $('app').classList.add('hidden');
  document.body.classList.add('gated');
  var err = $('gate-err');
  if(msg){ err.textContent = msg; err.classList.remove('hidden'); }
  else { err.textContent = ''; err.classList.add('hidden'); }
}

function enterApp(user){
  USER = user;
  $('gate').classList.add('hidden');
  $('app').classList.remove('hidden');
  document.body.classList.remove('gated');
  $('who-initials').textContent = user.initials || '';
  $('who-name').textContent = user.name || '';
  $('who-sub').textContent = user.sub || '';
  $('hd-sub').textContent = user.role === 'doctor' ? 'clinical review' : 'field capture';

  $('view-worker').classList.toggle('hidden', user.role !== 'worker');
  $('view-doctor').classList.toggle('hidden', user.role !== 'doctor');

  if(user.role === 'worker'){ recalcLevel(); consentOk(); loadBoard(); }
  else { loadDoctor(); }
}

all('[data-role]').forEach(function(btn){
  btn.addEventListener('click', function(){
    var role = btn.getAttribute('data-role');
    btn.disabled = true;
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role })
    })
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){ enterApp(d.user); })
      .catch(function(e){ showGate('Could not sign in (' + e.message + '). Try again.'); })
      .then(function(){ btn.disabled = false; });
  });
});

$('sign-out').addEventListener('click', function(){
  fetch('/api/auth', { method: 'DELETE' })
    .then(function(){ signReq = null; CASES = []; FILTER = 'all'; showGate(''); })
    .catch(function(){ showGate('Sign out failed — check the connection.'); });
});

function boot(){
  showGate('');
  /* local screenshot harness only: ?demo=worker|doctor auto-signs in. Harmless in prod
     because /api/auth still gates everything, but it makes visual QA one command. */
  var m = /[?&]demo=(worker|doctor)/.exec(location.search);
  if(m){
    fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ role: m[1] }) })
      .then(function(r){ return r.json(); })
      .then(function(d){ enterApp(d.user); });
    return;
  }
  fetch('/api/auth').then(function(r){ return r.json(); })
    .then(function(d){ if(d && d.user) enterApp(d.user); })
    .catch(function(){ /* no session — stay on the gate */ });
}

/* ================================================================= worker: consent */
function consentOk(){
  var under = $('age-under').checked;
  var guardianOk = !under || $('guardian-check').checked;
  var ok = $('consent-check').checked && guardianOk;
  $('shoot-btn').disabled = !ok;
  var reason = $('shoot-reason');
  if(ok){ reason.classList.add('hidden'); }
  else {
    reason.classList.remove('hidden');
    reason.textContent = !$('consent-check').checked
      ? 'Tick consent to enable the camera.'
      : 'Guardian consent required for a patient under 18.';
  }
  return ok;
}
$('age-under').addEventListener('change', function(){
  $('guardian-wrap').hidden = !this.checked;
  if(!this.checked) $('guardian-check').checked = false;
  consentOk();
});
$('consent-check').addEventListener('change', consentOk);
$('guardian-check').addEventListener('change', consentOk);

/* ================================================================= worker: priority */
function level(){
  var ticks = all('.sig').filter(function(c){ return c.checked; });
  if(ticks.some(function(c){ return c.getAttribute('data-g') === 'r'; })) return 'red';
  if(ticks.some(function(c){ return c.getAttribute('data-g') === 'y'; })) return 'yellow';
  return 'green';
}
function signsList(){
  return all('.sig').filter(function(c){ return c.checked; })
    .map(function(c){ return c.getAttribute('data-g') + c.getAttribute('data-i'); });
}
function recalcLevel(){
  var lvl = level();
  var el = $('lvl-now');
  el.textContent = lvl === 'red' ? 'RED — refer urgently'
    : lvl === 'yellow' ? 'YELLOW — review 24–48 h'
    : 'GREEN — routine';
  el.className = 'mono ' + (lvl === 'red' ? 'lvl-red-text2' : lvl === 'yellow' ? 'lvl-amber-text2' : 'lvl-green-text2');
  el.parentElement.className = 'level-line lvl-bg-' + lvl;
}
all('.sig').forEach(function(c){ c.addEventListener('change', recalcLevel); });

/* ================================================================= worker: upload */
function setStatus(t){ $('up-status').textContent = t || ''; }

/* The server builds the context string (single schema in api/sign.js) and signs
   exactly what we will send. */
function casePayload(){
  return {
    level: level(),
    signs: signsList().join(',') || 'none',
    guardian: $('age-under').checked && $('guardian-check').checked,
    patient: $('p-name').value,
    age: $('p-age').value,
    village: $('p-village').value,
    complaint: $('p-complaint').value,
    notes: $('p-notes').value
  };
}

/* Fetch the context BEFORE the widget opens. The widget reads prepareUploadParams
   first and only then asks for a signature, so signCtx must already be populated —
   a null context makes it reject the batch without ever calling us. */
function primeSignature(){
  return fetch('/api/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(casePayload())
  })
    .then(function(r){
      if(!r.ok) return r.json().then(function(e){ throw new Error(e.error || ('HTTP ' + r.status)); });
      return r.json();
    })
    .then(function(s){ signReq = s; return s; });
}

function handleUploaded(pid, focus, bytes){
  setStatus('');
  $('shoot-btn').disabled = false;

  if(focus !== null && focus < THRESHOLD){
    /* the unusable photo must not sit in storage or reach the doctor */
    fetch('/api/cases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id: pid })
    }).catch(function(){});
    $('saved').classList.add('hidden');
    $('retake-score').textContent = focus.toFixed(2);
    $('retake').classList.remove('hidden');
    if($('retake').scrollIntoView) $('retake').scrollIntoView({ block: 'center' });
    return;
  }

  /* the Admin listing does not return quality_analysis, so the measured score is written
     into the asset context — that is what puts it on the doctor's card */
  if(focus !== null){
    fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id: pid, focus: focus, bytes: bytes })
    }).catch(function(){});
  }

  $('retake').classList.add('hidden');
  $('saved-id').textContent = pid.split('/').pop();
  $('saved').classList.remove('hidden');
  resetCase();
  loadBoard();
}

/* Native <input type=file> + a signed fetch to Cloudinary.
   Why not the Upload Widget: its cross-origin iframe injects source=uw into the string
   to sign, and its success event does not surface quality_analysis, so the blur gate had
   nothing to read. A direct signed POST returns the full upload response — quality_analysis
   included — and every parameter is one we signed ourselves. */
function pickFile(){
  return new Promise(function(resolve){
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/jpeg,image/png,image/webp';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function(){
      var f = inp.files && inp.files[0];
      document.body.removeChild(inp);
      resolve(f || null);
    });
    inp.click();
  });
}

function uploadCase(file){
  setStatus('Uploading ' + Math.round(file.size / 1024) + ' KB…');
  return primeSignature()
    .then(function(s){
      signReq = s;
      var fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', s.apiKey);
      fd.append('signature', s.signature);
      fd.append('timestamp', s.timestamp);
      fd.append('folder', s.folder);
      fd.append('source', 'uw');
      fd.append('tags', s.tags);
      fd.append('context', s.context);
      fd.append('quality_analysis', 'true');
      return fetch('https://api.cloudinary.com/v1_1/' + CLOUD + '/image/upload', { method: 'POST', body: fd });
    })
    .then(function(r){
      return r.json().then(function(j){
        if(!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
        return j;
      });
    });
}

function openWidget(){
  if(!consentOk()) return;
  $('retake').classList.add('hidden');
  $('saved').classList.add('hidden');
  $('shoot-btn').disabled = true;
  setStatus('');

  pickFile().then(function(file){
    if(!file){ setStatus(''); $('shoot-btn').disabled = false; return; }
    return uploadCase(file)
      .then(function(j){
        var focus = j.quality_analysis && typeof j.quality_analysis.focus === 'number' ? j.quality_analysis.focus : null;
        handleUploaded(j.public_id, focus, j.bytes);
      })
      .catch(function(e){
        setStatus('Upload failed: ' + e.message);
        $('shoot-btn').disabled = false;
      });
  });
}
$('shoot-btn').addEventListener('click', openWidget);

function resetCase(){
  all('.sig').forEach(function(c){ c.checked = false; });
  $('age-under').checked = false;
  $('guardian-wrap').hidden = true;
  $('guardian-check').checked = false;
  $('consent-check').checked = false;
  ['p-name', 'p-age', 'p-village', 'p-complaint', 'p-notes'].forEach(function(id){ $(id).value = ''; });
  recalcLevel();
  consentOk();
}

/* ================================================================= shared data */
function parseTime(iso){
  try{
    return new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }catch(e){ return iso; }
}
function signLabels(code){
  if(!code || code === 'none') return [];
  return code.split(',').map(function(t){
    var g = t.charAt(0), i = parseInt(t.slice(1), 10);
    if(g === 'r' && RED_SIGNS[i]) return RED_SIGNS[i];
    if(g === 'y' && YELLOW_SIGNS[i]) return YELLOW_SIGNS[i];
    return t;
  });
}
function sortCases(list){
  return list.slice().sort(function(a, b){
    var da = RANK[a.level] == null ? 3 : RANK[a.level];
    var db = RANK[b.level] == null ? 3 : RANK[b.level];
    return da !== db ? da - db : (a.created_at < b.created_at ? 1 : -1);
  });
}
function fetchCases(){
  return fetch('/api/cases').then(function(r){
    if(r.status === 401){ showGate('Session expired — sign in again.'); throw new Error('401'); }
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(list){ CASES = list || []; return CASES; });
}

/* ================================================================= worker board */
function showState(name){
  $('board-loading').classList.toggle('hidden', name !== 'loading');
  $('board-empty').classList.toggle('hidden', name !== 'empty');
  $('board-error').classList.toggle('hidden', name !== 'error');
}

function loadBoard(){
  showState('loading');
  $('board-list').innerHTML = '';
  fetchCases()
    .then(function(cases){
      var list = sortCases(cases);
      if(!list.length){ showState('empty'); updateCounts([]); return; }
      showState('none');
      renderBoard(list);
      updateCounts(list);
    })
    .catch(function(){ showState('error'); });
}

function updateCounts(list){
  var n = { red: 0, yellow: 0, green: 0 };
  list.forEach(function(c){ if(n[c.level] != null) n[c.level]++; });
  $('n-red').textContent = String(n.red);
  $('n-amber').textContent = String(n.yellow);
  $('n-green').textContent = String(n.green);
  if($('hd-count')) $('hd-count').textContent = String(list.length);
}

function factsList(c){
  var dl = document.createElement('dl');
  dl.className = 'facts';
  [
    ['Patient', (c.patient || '—') + (c.age ? ' · ' + c.age : '')],
    ['Village', c.village || '—'],
    ['Complaint', c.complaint || '—'],
    ['Focus score', c.focus != null ? c.focus.toFixed(2) + (c.focus < THRESHOLD ? ' — below gate' : ' — cleared gate') : 'not recorded'],
    ['File', (c.width ? c.width + '×' + c.height + ' · ' : '') + kb(c.bytes)]
  ].forEach(function(row){
    var dt = document.createElement('dt'); dt.textContent = row[0];
    var dd = document.createElement('dd'); dd.textContent = row[1];
    dl.appendChild(dt); dl.appendChild(dd);
  });
  return dl;
}

function renderBoard(list){
  var wrap = $('board-list');
  wrap.innerHTML = '';
  list.forEach(function(c, idx){
    var lvl = RANK[c.level] != null ? c.level : 'green';
    var signs = signLabels(c.signs);

    var caseEl = document.createElement('div');
    caseEl.className = 'qcase';

    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'qhead';
    head.setAttribute('aria-expanded', 'false');
    head.setAttribute('aria-controls', 'qb-' + idx);

    var rail = document.createElement('span');
    rail.className = 'rail r-' + lvl;
    rail.setAttribute('aria-hidden', 'true');

    var img = document.createElement('img');
    img.className = 'qthumb';
    /* the worker's shared board shows the anonymised preview: e_blur_faces on the same
       named transform, so other patients' faces are never identifiable outside review */
    img.src = privacyUrl(c.public_id);
    img.width = 52; img.height = 52;
    img.loading = 'lazy';
    img.alt = '';

    var meta = document.createElement('span');
    meta.className = 'qmeta';
    var lv = document.createElement('span');
    lv.className = 'qlvl t-' + lvl;
    lv.textContent = lvl === 'red' ? 'Red — refer now' : lvl === 'yellow' ? 'Yellow — 24–48 h' : 'Green — routine';
    var who = document.createElement('span');
    who.className = 'qwho';
    who.textContent = (c.patient || 'Unnamed') + (c.age ? ' · ' + c.age : '') + (c.village ? ' — ' + c.village : '');
    var line = document.createElement('span');
    line.className = 'qline';
    line.textContent = parseTime(c.created_at) + ' · ' +
      (signs.length ? signs.length + (signs.length === 1 ? ' sign' : ' signs') : 'no signs') +
      (c.focus != null ? ' · focus ' + c.focus.toFixed(2) : '');
    meta.appendChild(lv);
    if(c.fixture){
      var fx = document.createElement('span');
      fx.className = 'dstatus s-fixture q-fx';
      fx.textContent = 'sample';
      fx.title = 'Seeded sample case for demonstration — not a real patient';
      meta.appendChild(fx);
    }
    meta.appendChild(who); meta.appendChild(line);

    var chev = document.createElement('span');
    chev.className = 'qchev';
    chev.setAttribute('aria-hidden', 'true');
    chev.textContent = '›';

    head.appendChild(rail); head.appendChild(img); head.appendChild(meta); head.appendChild(chev);

    var detail = document.createElement('div');
    detail.className = 'qdetail';
    detail.id = 'qb-' + idx;
    detail.hidden = true;

    var full = document.createElement('img');
    full.className = 'full';
    full.src = privacyUrl(c.public_id);   // worker view stays anonymised
    if(c.width && c.height){ full.width = c.width; full.height = c.height; }
    full.loading = 'lazy';
    full.alt = 'Case photo — face anonymised';

    var guide = document.createElement('p');
    guide.className = 'qguide';
    guide.textContent = GUIDANCE[lvl];

    var ul = document.createElement('ul');
    ul.className = 'qlist';
    if(signs.length){
      signs.forEach(function(s){ var li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
    } else {
      var li0 = document.createElement('li'); li0.textContent = 'No danger sign ticked.'; ul.appendChild(li0);
    }

    var actions = document.createElement('div');
    actions.className = 'qactions';
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-ghost btn-danger';
    del.textContent = 'Delete photo…';
    del.addEventListener('click', function(){
      if(!confirm('Delete case ' + c.id + ' and its photo from cloud storage?')) return;
      fetch('/api/cases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: c.public_id })
      }).then(function(){ loadBoard(); })
        .catch(function(){ alert('Delete failed — check the connection.'); });
    });
    actions.appendChild(del);

    detail.appendChild(full);
    detail.appendChild(factsList(c));
    detail.appendChild(guide);
    detail.appendChild(ul);
    detail.appendChild(actions);

    head.addEventListener('click', function(){
      var open = head.getAttribute('aria-expanded') === 'true';
      head.setAttribute('aria-expanded', open ? 'false' : 'true');
      detail.hidden = open;
    });

    caseEl.appendChild(head);
    caseEl.appendChild(detail);
    wrap.appendChild(caseEl);
  });
}
$('retry-btn').addEventListener('click', loadBoard);

/* ================================================================= doctor queue */
function showDocState(name){
  $('doc-loading').classList.toggle('hidden', name !== 'loading');
  $('doc-empty').classList.toggle('hidden', name !== 'empty');
  $('doc-error').classList.toggle('hidden', name !== 'error');
}

function loadDoctor(){
  showDocState('loading');
  $('doc-list').innerHTML = '';
  fetchCases()
    .then(function(cases){
      renderDoctor(cases);
      $('doc-stats').classList.remove('hidden');
    })
    .catch(function(){ showDocState('error'); $('doc-stats').classList.add('hidden'); });
}

function renderDoctor(cases){
  var list = sortCases(cases);
  var n = { red: 0, yellow: 0, green: 0, pending: 0 };
  list.forEach(function(c){
    if(n[c.level] != null) n[c.level]++;
    if((c.review || 'pending') === 'pending') n.pending++;
  });
  $('ds-red').textContent = String(n.red);
  $('ds-amber').textContent = String(n.yellow);
  $('ds-green').textContent = String(n.green);
  $('ds-pending').textContent = String(n.pending);
  if($('hd-count')) $('hd-count').textContent = String(list.length);

  var shown = FILTER === 'all' ? list : list.filter(function(c){ return (c.review || 'pending') === FILTER; });
  var wrap = $('doc-list');
  wrap.innerHTML = '';
  if(!shown.length){ showDocState('empty'); return; }
  showDocState('none');

  shown.forEach(function(c){
    var lvl = RANK[c.level] != null ? c.level : 'green';
    var review = c.review || 'pending';
    var signs = signLabels(c.signs);

    var card = document.createElement('article');
    card.className = 'dcase d-' + lvl;

    var rail = document.createElement('span');
    rail.className = 'drail';
    rail.setAttribute('aria-hidden', 'true');

    var body = document.createElement('div');
    body.className = 'dbody';

    var top = document.createElement('div');
    top.className = 'dtop';
    var badge = document.createElement('span');
    badge.className = 'dbadge t-' + lvl;
    badge.textContent = lvl === 'red' ? 'REFER NOW' : lvl === 'yellow' ? '24–48 H' : 'ROUTINE';
    var status = document.createElement('span');
    status.className = 'dstatus s-' + review;
    status.textContent = review;
    var when = document.createElement('span');
    when.className = 'qline';
    when.textContent = parseTime(c.created_at);
    top.appendChild(badge);
    if(c.fixture){
      var fx = document.createElement('span');
      fx.className = 'dstatus s-fixture';
      fx.textContent = 'sample';
      fx.title = 'Seeded sample case for demonstration — not a real patient';
      top.appendChild(fx);
    }
    top.appendChild(status); top.appendChild(when);

    var headline = document.createElement('h3');
    headline.className = 'dname';
    headline.textContent = (c.patient || 'Unnamed patient') + (c.age ? ', ' + c.age : '');

    var sub = document.createElement('p');
    sub.className = 'dsub';
    sub.textContent = [c.village, c.complaint].filter(Boolean).join(' · ') || '—';

    var media = document.createElement('div');
    media.className = 'dmedia';
    var img = document.createElement('img');
    img.className = 'dimg';
    img.src = fullUrl(c.public_id);
    img.alt = 'Case photo for ' + (c.patient || 'unnamed patient');
    img.loading = 'lazy';
    if(c.width && c.height){ img.width = c.width; img.height = c.height; }
    media.appendChild(img);

    var facts = document.createElement('dl');
    facts.className = 'facts';
    [
      ['Focus score', c.focus != null ? c.focus.toFixed(2) : 'not recorded'],
      ['Worker notes', c.notes || '—'],
      ['Signs', signs.length ? signs.join('; ') : 'none ticked'],
      ['Storage', (c.width ? c.width + '×' + c.height + ' · ' : '') + kb(c.bytes) + ' · ' + c.id]
    ].forEach(function(row){
      var dt = document.createElement('dt'); dt.textContent = row[0];
      var dd = document.createElement('dd'); dd.textContent = row[1];
      facts.appendChild(dt); facts.appendChild(dd);
    });

    var guide = document.createElement('p');
    guide.className = 'qguide';
    guide.textContent = GUIDANCE[lvl];

    var actions = document.createElement('div');
    actions.className = 'dactions';

    function act(label, target, cls){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls;
      b.textContent = label;
      if(review === target) b.disabled = true;
      b.addEventListener('click', function(){
        all('button', actions).forEach(function(x){ x.disabled = true; });
        fetch('/api/cases', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_id: c.public_id, review: target })
        })
          .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function(){ loadDoctor(); })
          .catch(function(e){ alert('Could not update the case (' + e.message + ').'); loadDoctor(); });
      });
      return b;
    }

    actions.appendChild(act('Accept', 'accepted', 'btn-primary'));
    actions.appendChild(act('Escalate', 'escalated', 'btn-ghost btn-danger'));

    body.appendChild(top);
    body.appendChild(headline);
    body.appendChild(sub);
    body.appendChild(media);
    body.appendChild(facts);
    body.appendChild(guide);
    body.appendChild(actions);

    card.appendChild(rail);
    card.appendChild(body);
    wrap.appendChild(card);
  });
}

all('.seg-btn').forEach(function(b){
  b.addEventListener('click', function(){
    all('.seg-btn').forEach(function(x){ x.classList.remove('is-on'); });
    b.classList.add('is-on');
    FILTER = b.getAttribute('data-filter');
    renderDoctor(CASES);
  });
});
$('doc-retry').addEventListener('click', loadDoctor);

/* ================================================================= field reality */
(function(){
  var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var t = c && c.effectiveType;
  if(t && /2g|3g/.test(t)){
    var el = $('up-status');
    if(el) el.textContent = 'Slow network (' + t + ') — the photo is downscaled to 1600 px before upload.';
  }
})();

boot();
