'use strict';
/* ClearCase — vanilla JS, no build step.
   Uploads are SIGNED via /api/sign (secret stays server-side) and carry the case
   metadata as Cloudinary context, so the board is server-backed on every device.
   The blur gate uses quality_analysis.focus (0..1): below THRESHOLD -> upload
   discarded client-triggered and the worker retakes while the patient is present. */

var CLOUD = 'ydyp2esm';
var FOLDER = 'clearcase_cases';
var THRESHOLD = 0.4;
var WIDGET = null;
var signCtx = null; // context frozen when the widget opens (must match the signature)

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
function all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
function kb(b){ return b ? (b >= 1048576 ? (b/1048576).toFixed(1) + ' MB' : Math.round(b/1024) + ' KB') : ''; }
function thumbUrl(pid){ return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/t_queue_thumb/f_auto,q_auto/' + pid; }
function fullUrl(pid){ return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/f_auto,q_auto/' + pid; }

/* ---------- consent ---------- */
function consentOk(){
  var under = $('age-under').checked;
  var guardianNeeded = under;
  var guardianOk = !guardianNeeded || $('guardian-check').checked;
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

/* ---------- priority (rule-derived, shown live) ---------- */
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
}
all('.sig').forEach(function(c){ c.addEventListener('change', recalcLevel); });

function buildContext(){
  // pipe-separated k=v pairs — the Cloudinary upload API's context format
  var s = signsList().join(',');
  return 'level=' + level() + '|signs=' + (s || 'none') +
    '|guardian=' + (($('age-under').checked && $('guardian-check').checked) ? '1' : '0');
}

/* ---------- signed upload ---------- */
function signUpload(cb){
  fetch('/api/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: signCtx })
  })
    .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(s){ cb({ signature: s.signature, timestamp: String(s.timestamp), apiKey: s.apiKey }); })
    .catch(function(e){
      setStatus('Could not reach the signing service (' + e.message + '). The photo was not uploaded.');
      $('shoot-btn').disabled = false;
    });
}

function setStatus(t){ $('up-status').textContent = t || ''; }

function onUpload(err, info){
  if(err){ setStatus('Upload failed: ' + (err.message || err)); $('shoot-btn').disabled = false; return; }
  if(!info || info.event !== 'success') return;
  setStatus('');
  $('shoot-btn').disabled = false;
  var q = info.quality_analysis || (info.info && info.info.quality_analysis);
  var focus = (q && typeof q.focus === 'number') ? q.focus : null;
  var pid = info.public_id;

  if(focus !== null && focus < THRESHOLD){
    // the unusable photo must not sit in storage or on the board
    fetch('/api/cases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id: pid })
    }).catch(function(){});
    $('saved').classList.add('hidden');
    $('retake-score').textContent = focus.toFixed(2);
    $('retake').classList.remove('hidden');
    $('retake').focus && $('retake').focus();
    return;
  }
  $('retake').classList.add('hidden');
  $('saved-id').textContent = pid.split('/').pop();
  $('saved').classList.remove('hidden');
  resetCase();
  loadBoard();
}

function makeWidget(){
  if(WIDGET) return;
  WIDGET = cloudinary.createUploadWidget({
    cloudName: CLOUD,
    sources: ['local', 'camera'],
    multiple: false,
    maxImageWidth: 1600,           // downscale before bytes leave the phone
    cropping: false,
    prepareUploadParams: function(p){
      p.folder = FOLDER;
      p.qualityAnalysis = true;    // focus score = the blur gate (signed uploads only)
      p.context = signCtx;         // level/signs/guardian ride with the photo
    },
    uploadSignature: signUpload
  }, onUpload);
}

function openWidget(){
  if(typeof cloudinary === 'undefined' || !cloudinary.createUploadWidget){
    setStatus('Upload widget failed to load (offline?). Check the connection and reload.');
    return;
  }
  if(!consentOk()) return;
  signCtx = buildContext();        // frozen: must equal what the signature covers
  makeWidget();
  $('retake').classList.add('hidden');
  $('saved').classList.add('hidden');
  setStatus('Opening…');
  $('shoot-btn').disabled = true;
  WIDGET.open();
}
$('shoot-btn').addEventListener('click', openWidget);

function resetCase(){
  all('.sig').forEach(function(c){ c.checked = false; });
  $('age-under').checked = false;
  $('guardian-wrap').hidden = true;
  $('guardian-check').checked = false;
  $('consent-check').checked = false;
  recalcLevel();
  consentOk();
}

/* ---------- board (server-backed via Cloudinary) ---------- */
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

function showState(name){
  $('board-loading').classList.toggle('hidden', name !== 'loading');
  $('board-empty').classList.toggle('hidden', name !== 'empty');
  $('board-error').classList.toggle('hidden', name !== 'error');
}

function loadBoard(){
  showState('loading');
  $('board-list').innerHTML = '';
  fetch('/api/cases')
    .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(cases){
      var list = (cases || []).slice().sort(function(a, b){
        var d = RANK[a.level] - RANK[b.level];
        return d !== 0 ? d : (a.created_at < b.created_at ? 1 : -1);
      });
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
  $('hd-count').textContent = String(list.length);
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
    head.setAttribute('aria-controls', 'qd-' + idx);

    var rail = document.createElement('span');
    rail.className = 'rail r-' + lvl;
    rail.setAttribute('aria-hidden', 'true');

    var img = document.createElement('img');
    img.className = 'qthumb';
    img.src = thumbUrl(c.public_id);
    img.width = 52; img.height = 52;
    img.loading = 'lazy';
    img.alt = '';

    var meta = document.createElement('span');
    meta.className = 'qmeta';
    var lv = document.createElement('span');
    lv.className = 'qlvl t-' + lvl;
    lv.textContent = lvl === 'red' ? 'Red — refer now' : lvl === 'yellow' ? 'Yellow — 24–48 h' : 'Green — routine';
    var line = document.createElement('span');
    line.className = 'qline';
    line.textContent = parseTime(c.created_at) + ' · ' + (signs.length ? signs.length + (signs.length === 1 ? ' sign' : ' signs') : 'no signs') +
      (c.bytes ? ' · ' + kb(c.bytes) : '') + ' · ' + c.id;
    meta.appendChild(lv);
    meta.appendChild(line);

    var chev = document.createElement('span');
    chev.className = 'qchev';
    chev.setAttribute('aria-hidden', 'true');
    chev.textContent = '›';

    head.appendChild(rail);
    head.appendChild(img);
    head.appendChild(meta);
    head.appendChild(chev);

    var detail = document.createElement('div');
    detail.className = 'qdetail';
    detail.id = 'qd-' + idx;
    detail.hidden = true;

    var full = document.createElement('img');
    full.className = 'full';
    full.src = fullUrl(c.public_id);
    if(c.width && c.height){ full.width = c.width; full.height = c.height; }
    full.loading = 'lazy';
    full.alt = 'Case photo';

    var guide = document.createElement('p');
    guide.className = 'qguide';
    guide.textContent = GUIDANCE[lvl];

    var ul = document.createElement('ul');
    ul.className = 'qlist';
    if(signs.length){
      signs.forEach(function(s){
        var li = document.createElement('li');
        li.textContent = s;
        ul.appendChild(li);
      });
    } else {
      var li0 = document.createElement('li');
      li0.textContent = 'No danger sign ticked.';
      ul.appendChild(li0);
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

/* ---------- field reality: slow networks ---------- */
(function(){
  var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var t = c && c.effectiveType;
  if(t && /2g|3g/.test(t)){
    setStatus('Slow network (' + t + ') — the photo is downscaled to 1600 px before upload.');
  }
})();

recalcLevel();
consentOk();
loadBoard();
