'use strict';
/* ClearCase — vanilla JS, no build step. Uploads are SIGNED via /api/sign (secret stays server-side).
   The blur gate uses Cloudinary quality_analysis (focus 0..1): below THRESHOLD -> retake. */

var CLOUD = 'ydyp2esm';
var FOLDER = 'clearcase_cases';
var THRESHOLD = 0.4; // start value; tune against real field photos (Notion doc, section 6)
var WIDGET = null;
var pending = null; // accepted photo of the case being created

function $(id){ return document.getElementById(id); }
function all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

/* ---------- view router ---------- */
var ORDER = ['consent','capture','checklist','result'];
function show(name){
  all('.view').forEach(function(v){ v.classList.toggle('on', v.id === 'view-' + name); });
  var idx = ORDER.indexOf(name);
  all('#steps-list li').forEach(function(li){
    var s = li.getAttribute('data-step');
    li.classList.toggle('on', s === name);
    li.classList.toggle('done', idx > -1 && ORDER.indexOf(s) < idx);
  });
  if(name === 'queue'){
    all('#steps-list li').forEach(function(li){ li.classList.remove('on'); });
    renderQueue();
  }
  window.scrollTo(0, 0);
}

/* ---------- consent ---------- */
function consentOk(){
  var under = $('age-under').checked;
  var ok = $('consent-check').checked && (!under || $('guardian-check').checked);
  $('start-btn').disabled = !ok;
  $('consent-hint').textContent = ok ? 'Ready — the camera opens on the next screen.' : 'Both ticks are required to continue.';
  return ok;
}
$('age-under').addEventListener('change', function(){
  $('guardian-wrap').classList.toggle('hidden', !this.checked);
  if(!this.checked) $('guardian-check').checked = false;
  consentOk();
});
$('consent-check').addEventListener('change', consentOk);
$('guardian-check').addEventListener('change', consentOk);
$('start-btn').addEventListener('click', function(){ show('capture'); });

/* ---------- upload widget ---------- */
function signUpload(cb){
  fetch('/api/sign', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
    .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(s){ cb({ signature:s.signature, timestamp:String(s.timestamp), apiKey:s.apiKey }); })
    .catch(function(e){
      setStatus('Could not reach the signing service (' + e.message + '). Deploy on Vercel or run with vercel dev.');
    });
}

function onUpload(err, info){
  if(err){ setStatus('Upload failed: ' + (err.message || err)); return; }
  if(!info || info.event !== 'success') return;
  setStatus('');
  var q = info.quality_analysis || (info.info && info.info.quality_analysis);
  var focus = (q && typeof q.focus === 'number') ? q.focus : null;
  var pub = { pid: info.public_id, url: info.secure_url, fmt: info.format || 'jpg',
              bytes: info.bytes || 0, focus: focus };

  if(focus !== null && focus < THRESHOLD){
    $('up-state').classList.add('hidden');
    $('accepted').classList.add('hidden');
    $('retake-score').textContent = focus.toFixed(2);
    $('retake').classList.remove('hidden');
    return; // do not keep a blurry case
  }
  pending = pub;
  $('retake').classList.add('hidden');
  $('up-state').classList.add('hidden');
  $('acc-thumb').src = thumbUrl(pub.pid, pub.fmt);
  $('acc-meta').textContent = (focus === null ? 'Quality score unavailable on this upload — check manually. '
    : 'Focus ' + focus.toFixed(2) + ' ≥ ' + THRESHOLD.toFixed(2) + ' · ') + kb(pub.bytes) + ' delivered-ready';
  $('accepted').classList.remove('hidden');
}

function makeWidget(){
  if(WIDGET) return;
  WIDGET = cloudinary.createUploadWidget({
    cloudName: CLOUD,
    sources: ['local', 'camera'],
    multiple: false,
    maxImageWidth: 1600,           // downscale BEFORE bytes leave the phone
    cropping: false,
    prepareUploadParams: function(params){
      params.folder = FOLDER;
      params.qualityAnalysis = true;  // focus score = the blur gate (signed upload only)
    },
    uploadSignature: signUpload
  }, onUpload);
}

function setStatus(t){ $('up-status').textContent = t || ''; }
function openWidget(){
  if(typeof cloudinary === 'undefined' || !cloudinary.createUploadWidget){
    setStatus('Upload widget failed to load (offline?). Check the connection and reload.');
    return;
  }
  makeWidget();
  $('retake').classList.add('hidden');
  $('accepted').classList.add('hidden');
  $('up-state').classList.remove('hidden');
  setStatus('Opening…');
  WIDGET.open();
}
$('shoot-btn').addEventListener('click', openWidget);
$('retake-btn').addEventListener('click', openWidget);
$('to-checklist').addEventListener('click', function(){ show('checklist'); });
$('back-capture').addEventListener('click', function(){ show('capture'); });

/* ---------- checklist -> priority ---------- */
var GUIDANCE = {
  red: 'REFER URGENTLY — take the patient to the nearest health centre/hospital now. Do not wait for a remote reply.',
  yellow: 'Monitor at home. Give fluids/ORS as advised, re-check in 24–48 h. Worsening or any red sign → go immediately.',
  green: 'Routine follow-up — schedule a clinic appointment. Continue current care.'
};
var LABEL = { red:'SEEK IMMEDIATE CARE', yellow:'MONITOR — 24–48 H', green:'ROUTINE FOLLOW-UP' };

$('submit-checks').addEventListener('click', function(){
  var ticks = all('.sig').filter(function(c){ return c.checked; });
  var lvl = 'green';
  if(ticks.some(function(c){ return c.getAttribute('data-lvl') === 'red'; })) lvl = 'red';
  else if(ticks.some(function(c){ return c.getAttribute('data-lvl') === 'yellow'; })) lvl = 'yellow';

  var chip = $('res-chip');
  chip.textContent = 'SUGGESTED: ' + LABEL[lvl];
  chip.className = 'chip ' + lvl;
  $('res-guidance').textContent = GUIDANCE[lvl];
  $('res-why').textContent = ticks.length
    ? 'From ticked signs: ' + ticks.map(function(c){ return c.parentElement.querySelector('span').textContent; }).join(' · ')
    : 'No danger sign ticked — routine by default (WHO IMCI).';
  $('res-photo').textContent = pending
    ? 'Photo: focus ' + (pending.focus === null ? 'n/a' : pending.focus.toFixed(2)) + ' · ' + kb(pending.bytes)
    : 'Photo: none attached (checklist-only case).';
  current = { lvl: lvl, ticks: ticks.map(function(c){ return c.parentElement.querySelector('span').textContent; }) };
  show('result');
});

$('save-case').addEventListener('click', function(){
  if(!pending && !current) return;
  var cases = loadCases();
  cases.push({
    id: 'C' + Date.now().toString(36).toUpperCase(),
    ts: Date.now(),
    lvl: current.lvl,
    ticks: current.ticks,
    pid: pending ? pending.pid : null,
    fmt: pending ? pending.fmt : 'jpg',
    url: pending ? pending.url : null,
    bytes: pending ? pending.bytes : 0,
    focus: pending ? pending.focus : null,
    sample: false
  });
  saveCases(cases);
  resetCase();
  show('queue');
});
$('new-case').addEventListener('click', function(){ resetCase(); show('consent'); });

function resetCase(){
  pending = null; current = null;
  all('.sig').forEach(function(c){ c.checked = false; });
  $('accepted').classList.add('hidden');
  $('retake').classList.add('hidden');
  $('up-state').classList.remove('hidden');
  setStatus('');
}

/* ---------- queue ---------- */
var RANK = { red:0, yellow:1, green:2 };
function loadCases(){ try{ return JSON.parse(localStorage.getItem('clearcase_cases') || '[]'); }catch(e){ return []; } }
function saveCases(c){ localStorage.setItem('clearcase_cases', JSON.stringify(c)); updateCount(); }
function updateCount(){ $('queue-count').textContent = String(loadCases().length); }
function kb(b){ return b ? (b >= 1048576 ? (b/1048576).toFixed(1) + ' MB' : Math.round(b/1024) + ' KB') : '—'; }
function thumbUrl(pid, fmt){ return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/t_queue_thumb/f_auto,q_auto/' + pid + '.' + (fmt || 'jpg'); }
function fullUrl(c){ return 'https://res.cloudinary.com/' + CLOUD + '/image/upload/f_auto,q_auto/' + c.pid + '.' + c.fmt; }

function renderQueue(){
  var list = $('queue-list');
  var cases = loadCases().sort(function(a,b){
    var d = RANK[a.lvl] - RANK[b.lvl]; return d !== 0 ? d : b.ts - a.ts;
  });
  list.innerHTML = '';
  $('queue-empty').classList.toggle('hidden', cases.length > 0);
  updateCount();

  cases.forEach(function(c){
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'qrow';
    row.setAttribute('aria-expanded', 'false');
    var when = new Date(c.ts).toLocaleString();
    row.innerHTML =
      '<img src="' + thumbUrl(c.pid, c.fmt) + '" alt="" loading="lazy">' +
      '<div class="qmeta"><strong>' + c.id + (c.sample ? '<span class="sample">SAMPLE</span>' : '') + '</strong>' +
      '<p>' + when + ' · focus ' + (c.focus === null ? 'n/a' : Number(c.focus).toFixed(2)) + ' · ' + kb(c.bytes) + '</p></div>' +
      '<span class="chip ' + c.lvl + '">' + LABEL[c.lvl] + '</span>' +
      '<div class="qdetail">' +
        (c.url ? '<img src="' + fullUrl(c) + '" alt="Case photo, full resolution" loading="lazy">' : '<p class="hint">No photo attached.</p>') +
        '<p class="guide">' + GUIDANCE[c.lvl] + '</p>' +
        '<p class="hint">Checklist: ' + (c.ticks.length ? c.ticks.join(' · ') : 'no danger signs ticked') + '</p>' +
      '</div>';
    row.addEventListener('click', function(){
      row.setAttribute('aria-expanded', row.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
    list.appendChild(row);
  });
}
$('queue-link').addEventListener('click', function(){ show('queue'); });
$('queue-new').addEventListener('click', function(){ show('consent'); });
$('queue-clear').addEventListener('click', function(){
  if(loadCases().length && confirm('Remove all cases from this device queue?')) {
    saveCases([]); renderQueue();
  }
});
$('seed-btn').addEventListener('click', function(){
  var existing = loadCases();
  if(existing.length) return;
  var now = Date.now();
  saveCases([
    { id:'S1', ts: now - 3600000, lvl:'red', ticks:['Unable to drink or breastfeed'],
      pid:'clearcase_cases/xleci5s3angbufkwc2mt', fmt:'jpg',
      url:'https://res.cloudinary.com/' + CLOUD + '/image/upload/clearcase_cases/xleci5s3angbufkwc2mt.jpg',
      bytes:56633, focus:0.0963, sample:true },
    { id:'S2', ts: now - 7200000, lvl:'green', ticks:[],
      pid:'cc_test_sharp', fmt:'jpg',
      url:'https://res.cloudinary.com/' + CLOUD + '/image/upload/cc_test_sharp.jpg',
      bytes:379132, focus:0.5666, sample:true }
  ]);
  renderQueue();
});

/* ---------- network hint (demo of the field reality) ---------- */
(function(){
  var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var t = c && c.effectiveType;
  if(t && /2g|3g/.test(t)){
    $('up-status').textContent = 'Slow network detected (' + t + ') — the photo is downscaled to 1600px before upload.';
  }
})();

$('to-checklist').addEventListener('click', function(){ show('checklist'); });
updateCount();
show('consent');
