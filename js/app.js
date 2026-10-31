/* Real Price - UI, camera, OCR. Pure logic lives in logic.js (window.RP). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY_S = 'realprice.settings.v1', KEY_T = 'realprice.total.v1';
  var DEFAULT_SETTINGS = { zip: '', rateSource: 'combined', manualRate: '', mode: 'store', tip: 18, thorough: false };

  /* ---------- persistence ---------- */
  function load(key, def) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode / quota */ } }
  var settings = Object.assign({}, DEFAULT_SETTINGS, load(KEY_S, {}));
  var items = sanitizeItems(load(KEY_T, []));
  var nextId = items.reduce(function (m, it) { return Math.max(m, it.id); }, 0) + 1;
  function sanitizeItems(a) {
    if (!Array.isArray(a)) return [];
    return a.filter(function (it) { return it && isFinite(it.price) && it.price > 0 && it.id != null; })
      .map(function (it) { return { id: it.id, price: Math.round(it.price), qty: Math.max(1, Math.round(it.qty || 1)) }; });
  }
  function saveSettings() { save(KEY_S, settings); }
  function saveItems() { save(KEY_T, items); }
  function tax() { return RP.resolveTax(settings); }

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 1800); }

  /* ---------- header chips / settings ---------- */
  function renderChips() {
    var t = tax();
    $('chipMode').textContent = settings.mode === 'restaurant' ? '🍽 Menu +' + settings.tip + '%' : '🛒 Store';
    $('chipTax').textContent = t.source === 'none' ? 'Set ZIP ⚠︎' : 'Tax ' + trimPct(t.percent) + '%' + (t.source === 'manual' ? ' (manual)' : '');
    $('chipTax').style.borderColor = t.source === 'none' ? '#f59e0b' : '';
  }
  function trimPct(p) { return String(Math.round(p * 1000) / 1000); }

  function renderSettings() {
    $('zip').value = settings.zip;
    $('manualRate').value = settings.manualRate;
    mark('modeSeg', 'data-mode', settings.mode);
    mark('tipSeg', 'data-tip', String(settings.tip));
    mark('srcSeg', 'data-src', settings.rateSource);
    $('tipBlock').hidden = settings.mode !== 'restaurant';
    $('thorough').checked = !!settings.thorough;
    var t = tax(), el = $('taxInfo');
    if (t.source === 'manual') el.innerHTML = 'Using your manual rate: <b>' + trimPct(t.percent) + '%</b>' + (t.state ? ' (ZIP is in ' + t.stateName + ')' : '');
    else if (t.source === 'zip') el.innerHTML = t.stateName + ' — state <b>' + trimPct(t.stateRate) + '%</b>, avg. combined <b>' + trimPct(t.combinedRate) + '%</b>.<br>Using <b>' + trimPct(t.percent) + '%</b>.';
    else el.innerHTML = settings.zip ? 'ZIP not recognised (US states + DC only). Enter a manual rate instead.' : 'Enter a US ZIP code or a manual rate. Until then tax is treated as 0%.';
  }
  function mark(id, attr, val) {
    Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute(attr) === val); });
  }
  function refreshAll() { renderChips(); renderSettings(); renderOverlays(); renderTotals(); }

  function openSheet(id) { $(id).hidden = false; }
  function closeSheets() { $('settings').hidden = true; $('totalPanel').hidden = true; }
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', closeSheets); });
  ['settings', 'totalPanel'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === $(id)) closeSheets(); }); });
  $('btnSettings').onclick = $('chipTax').onclick = function () { renderSettings(); openSheet('settings'); };
  $('chipMode').onclick = function () { settings.mode = settings.mode === 'store' ? 'restaurant' : 'store'; saveSettings(); refreshAll(); };
  $('modeSeg').addEventListener('click', function (e) { var m = e.target.getAttribute('data-mode'); if (m) { settings.mode = m; saveSettings(); refreshAll(); } });
  $('tipSeg').addEventListener('click', function (e) { var m = e.target.getAttribute('data-tip'); if (m) { settings.tip = Number(m); saveSettings(); refreshAll(); } });
  $('srcSeg').addEventListener('click', function (e) { var m = e.target.getAttribute('data-src'); if (m) { settings.rateSource = m; saveSettings(); refreshAll(); } });
  $('zip').addEventListener('input', function () { settings.zip = this.value.trim(); saveSettings(); renderChips(); renderSettingsInfoOnly(); renderOverlays(); renderTotals(); });
  $('manualRate').addEventListener('input', function () { settings.manualRate = this.value.trim().replace(',', '.').replace('%', ''); saveSettings(); renderChips(); renderSettingsInfoOnly(); renderOverlays(); renderTotals(); });
  function renderSettingsInfoOnly() { // don't clobber the input being typed in
    var z = $('zip').value, m = $('manualRate').value; renderSettings(); $('zip').value = z; $('manualRate').value = m;
  }
  $('thorough').addEventListener('change', function () { settings.thorough = this.checked; saveSettings(); });
  $('btnClearAll').onclick = function () {
    if (!confirm('Reset settings and clear the running total?')) return;
    settings = Object.assign({}, DEFAULT_SETTINGS); items = []; saveSettings(); saveItems(); refreshAll(); toast('Reset');
  };

  /* ---------- totals ---------- */
  function addItem(cents) {
    items.push({ id: nextId++, price: cents, qty: 1 }); saveItems(); renderTotals();
  }
  function renderTotals() {
    var t = tax(), tt = RP.totals(items, t.rate, settings.mode, settings.tip);
    $('totalBadge').textContent = RP.fmt(tt.grand); $('totalCount').textContent = tt.count;
    $('sumSub').textContent = RP.fmt(tt.subtotal);
    $('sumTaxLabel').textContent = 'Tax (' + trimPct(t.percent) + '%)';
    $('sumTax').textContent = RP.fmt(tt.tax);
    $('sumTipRow').hidden = settings.mode !== 'restaurant';
    $('sumTipLabel').textContent = 'Tip (' + settings.tip + '%)';
    $('sumTip').textContent = RP.fmt(tt.tip);
    $('sumGrand').textContent = RP.fmt(tt.grand);
    $('emptyMsg').hidden = items.length > 0;
    if ($('totalPanel').hidden) return;
    var ul = $('itemList'); ul.innerHTML = '';
    items.forEach(function (it, idx) {
      var li = document.createElement('li'); li.dataset.id = it.id;
      var rp = RP.realPrice(it.price * it.qty, t.rate, settings.mode, settings.tip);
      li.innerHTML = '<div class="price"><span>$</span><input class="p" inputmode="decimal" aria-label="Price" value="' + (it.price / 100).toFixed(2) + '"></div>' +
        '<div class="qtybox"><button data-act="dec" aria-label="Less">−</button><span>×' + it.qty + '</span><button data-act="inc" aria-label="More">+</button></div>' +
        '<button class="del" data-act="del" aria-label="Remove item">✕</button>' +
        '<div class="real">Item ' + (idx + 1) + ' → ' + RP.fmt(rp.total) + ' real (' + RP.fmt(rp.tax) + ' tax' + (settings.mode === 'restaurant' ? ', ' + RP.fmt(rp.tip) + ' tip' : '') + ')</div>';
      ul.appendChild(li);
    });
  }
  $('itemList').addEventListener('click', function (e) {
    var act = e.target.getAttribute('data-act'); if (!act) return;
    var li = e.target.closest('li'), id = Number(li.dataset.id), it = items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    if (act === 'del') items = items.filter(function (x) { return x.id !== id; });
    if (act === 'inc') it.qty++;
    if (act === 'dec') { if (it.qty > 1) it.qty--; else items = items.filter(function (x) { return x.id !== id; }); }
    saveItems(); renderTotals();
  });
  $('itemList').addEventListener('change', function (e) {
    if (!e.target.classList.contains('p')) return;
    var id = Number(e.target.closest('li').dataset.id), it = items.filter(function (x) { return x.id === id; })[0];
    var v = parseMoney(e.target.value);
    if (it && v) it.price = v; else toast('Enter a price above $0');
    saveItems(); renderTotals();
  });
  function parseMoney(s) { var m = String(s).replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(m)) return 0; return RP.toCents(m); }
  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault(); var v = parseMoney($('addPrice').value);
    if (!v) return toast('Enter a price like 7.50');
    addItem(v); $('addPrice').value = '';
  });
  $('btnClear').onclick = function () { if (!items.length || confirm('Clear all items from the total?')) { items = []; saveItems(); renderTotals(); } };
  $('btnTotal').onclick = function () { openSheet('totalPanel'); renderTotals(); };

  /* ---------- overlays ---------- */
  var detections = [];       // [{cents,bbox,certainty,...}] in OCR-canvas coords
  var ocrDims = { w: 0, h: 0 };
  var pressing = false;
  function renderOverlays() {
    if (pressing) return;
    var host = $('overlays'); host.innerHTML = '';
    if (!detections.length || !ocrDims.w) return;
    var st = $('stage'), cr = RP.containRect(ocrDims.w, ocrDims.h, st.clientWidth, st.clientHeight);
    var t = tax();
    detections.forEach(function (d) {
      var r = RP.realPrice(d.cents, t.rate, settings.mode, settings.tip);
      var bh = (d.bbox.y1 - d.bbox.y0) * cr.scale, bw = (d.bbox.x1 - d.bbox.x0) * cr.scale;
      var h = Math.max(bh * 1.25, 30), fs = Math.max(13, Math.min(34, bh * 0.75));
      var w = Math.max(bw * 1.3, 58);
      var cx = cr.x + ((d.bbox.x0 + d.bbox.x1) / 2) * cr.scale, cy = cr.y + ((d.bbox.y0 + d.bbox.y1) / 2) * cr.scale;
      var el = document.createElement('div');
      el.className = 'pill ' + (d.certainty === 'low' ? 'low ' : '') + settings.mode;
      el.style.cssText = 'left:' + (cx - w / 2) + 'px;top:' + (cy - h / 2) + 'px;min-width:' + w + 'px;height:' + h + 'px;font-size:' + fs + 'px';
      el.dataset.cents = d.cents;
      el.innerHTML = '<span class="val">' + RP.fmt(r.total) + '</span>' +
        '<div class="detail">Shown: ' + RP.fmt(r.base) + '<br>+ tax ' + RP.fmt(r.tax) + (settings.mode === 'restaurant' ? '<br>+ tip ' + RP.fmt(r.tip) + ' (' + settings.tip + '%)' : '') + '<br><b>= ' + RP.fmt(r.total) + '</b><br><i>Long-press to add</i></div>';
      attachPress(el, d);
      host.appendChild(el);
    });
  }
  var LONG_MS = 550;
  function attachPress(el, d) {
    var timer = null, fired = false, sx = 0, sy = 0;
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('pointerdown', function (e) {
      fired = false; sx = e.clientX; sy = e.clientY; pressing = true; el.classList.add('pressing');
      timer = setTimeout(function () {
        fired = true; addItem(d.cents);
        el.classList.remove('pressing'); el.classList.add('added');
        if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {}
        toast('Added ' + RP.fmt(d.cents) + ' to total');
      }, LONG_MS);
    });
    function end() { clearTimeout(timer); el.classList.remove('pressing'); pressing = false; }
    el.addEventListener('pointerup', function () {
      var wasLong = fired; end();
      if (!wasLong) { var open = el.classList.contains('open'); closeDetails(); if (!open) el.classList.add('open'); }
    });
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - sx) > 12 || Math.abs(e.clientY - sy) > 12) end(); });
  }
  function closeDetails() { Array.prototype.forEach.call(document.querySelectorAll('.pill.open'), function (p) { p.classList.remove('open'); }); }
  window.addEventListener('resize', renderOverlays);
  window.addEventListener('orientationchange', function () { setTimeout(renderOverlays, 250); });

  /* ---------- camera ---------- */
  var stream = null, cameraOK = false, frozen = false, live = false, scanning = false;
  var video = $('video'), frame = $('frame');
  function setMsg(m) { var el = $('stageMsg'); el.textContent = m || ''; el.hidden = !m; }
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg('Camera is not available in this browser or context (needs HTTPS or localhost).\nTap “📷 Photo” to use a picture instead.'); return false;
    }
    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = stream; await video.play().catch(function () {});
      cameraOK = true; setMsg(''); video.hidden = false; return true;
    } catch (err) {
      cameraOK = false;
      var why = err && err.name === 'NotAllowedError' ? 'Camera permission was denied.' : err && err.name === 'NotFoundError' ? 'No camera found.' : 'Camera could not start (' + (err && err.name || 'error') + ').';
      setMsg(why + '\nTap “📷 Photo” to pick or take a picture instead.'); return false;
    }
  }
  function stopCamera() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }

  function showFrozen() { frozen = true; frame.hidden = false; video.hidden = true; $('btnScan').textContent = '↺ Resume'; setLive(false); }
  async function resume() {
    frozen = false; frame.hidden = true; detections = []; renderOverlays(); $('btnScan').textContent = 'Scan';
    if (cameraOK && stream) { video.hidden = false; try { await video.play(); } catch (e) {} } else { video.hidden = false; await startCamera(); }
  }

  /* ---------- OCR ---------- */
  var workerP = null;
  function abs(p) { return new URL(p, location.href).href; }
  function getWorker() {
    if (workerP) return workerP;
    if (typeof Tesseract === 'undefined') return Promise.reject(new Error('Tesseract failed to load'));
    busy(true, 'Loading text reader (first time ~10 MB)…');
    workerP = Tesseract.createWorker('eng', 1, {
      workerPath: abs('vendor/tesseract/worker.min.js'),
      corePath: abs('vendor/tesseract/core/'),
      langPath: abs('vendor/tesseract/lang/'),
      gzip: true,
      logger: function (m) { if (m && m.status === 'recognizing text') $('busyText').textContent = 'Reading… ' + Math.round((m.progress || 0) * 100) + '%'; }
    }).then(async function (w) {
      await w.setParameters({ preserve_interword_spaces: '1' });
      return w;
    }).catch(function (e) { workerP = null; throw e; });
    return workerP;
  }
  function busy(on, text) { $('busy').hidden = !on; if (text) $('busyText').textContent = text; }

  // draw any image source onto the OCR canvas at a good working size
  function drawToCanvas(src, sw, sh) {
    // Tesseract misses tiny glyphs (esp. lone digits like "8"), so small images are upscaled to ~1600px on the long edge (huge ones capped at 2000).
    var long = Math.max(sw, sh), scale = long > 2000 ? 2000 / long : (long < 1600 ? Math.min(2.5, 1600 / long) : 1);
    if (window.RP_LONG) scale = window.RP_LONG / long;
    frame.width = Math.round(sw * scale); frame.height = Math.round(sh * scale);
    var ctx = frame.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, frame.width, frame.height);
  }

  // Tesseract's layout analysis is image-dependent: "auto" (PSM 3) works best on tags/shelves, "sparse" (PSM 11) on menus.
  // Default = auto pass, plus a sparse pass when the first finds nothing (or always, if "Thorough scan" is on).
  async function ocrPass(w, psm) {
    await w.setParameters({ tessedit_pageseg_mode: String(psm) });
    var res = await w.recognize(frame, {}, { blocks: true, text: true });
    return { words: RP.wordsFromOcr(res.data), text: res.data.text };
  }
  function mergeDetections(a, b) { // add b's detections that don't overlap one already in a
    b.forEach(function (d) {
      var cx = (d.bbox.x0 + d.bbox.x1) / 2, cy = (d.bbox.y0 + d.bbox.y1) / 2;
      var dup = a.some(function (e) { return cx >= e.bbox.x0 - 4 && cx <= e.bbox.x1 + 4 && cy >= e.bbox.y0 - 4 && cy <= e.bbox.y1 + 4; });
      if (!dup) a.push(d);
    });
    return a;
  }
  async function recognizeCanvas(quick) {
    var w = await getWorker();
    busy(true, 'Reading…');
    var first = await ocrPass(w, window.RP_PSM || 3);
    var found = RP.detectPrices(first.words), allWords = first.words, text = first.text;
    if (!window.RP_PSM && (settings.thorough || !found.length) && !quick) {
      busy(true, 'Reading (second pass)…');
      var second = await ocrPass(w, 11);
      found = mergeDetections(found, RP.detectPrices(second.words));
      allWords = allWords.concat(second.words); text += '\n--- pass 2 ---\n' + second.text;
    }
    found.forEach(function (d, i) { d.id = i; });
    ocrDims = { w: frame.width, h: frame.height };
    detections = found;
    api.lastWords = allWords; api.lastText = text;
    renderOverlays();
    return found;
  }

  async function scanOnce() {
    if (scanning) return; scanning = true;
    try {
      if (!video.videoWidth) { toast('Camera not ready'); return; }
      drawToCanvas(video, video.videoWidth, video.videoHeight);
      if (!live) showFrozen();
      var found = await recognizeCanvas(live);
      if (!live) toast(found.length ? found.length + ' price' + (found.length > 1 ? 's' : '') + ' found' : 'No prices found — try more light or move closer');
    } catch (e) { console.error(e); toast('Scan failed: ' + (e && e.message || e)); }
    finally { busy(false); scanning = false; }
  }

  async function loadFile(file) {
    if (!file) return;
    try {
      busy(true, 'Opening photo…');
      var bmp = await decodeImage(file);
      drawToCanvas(bmp.src, bmp.w, bmp.h);
      showFrozen(); setMsg(''); detections = []; renderOverlays();
      var found = await recognizeCanvas();
      toast(found.length ? found.length + ' price' + (found.length > 1 ? 's' : '') + ' found' : 'No prices found in that photo');
    } catch (e) { console.error(e); toast('Could not read photo: ' + (e && e.message || e)); }
    finally { busy(false); }
  }
  function decodeImage(file) {
    return new Promise(function (resolve, reject) {
      if (window.createImageBitmap) {
        createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (b) { resolve({ src: b, w: b.width, h: b.height }); }, fallback);
      } else fallback();
      function fallback() {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
        img.onerror = function () { reject(new Error('unsupported image')); };
        img.src = url;
      }
    });
  }
  $('fileInput').addEventListener('change', function () { var f = this.files[0]; this.value = ''; loadFile(f); });

  $('btnScan').onclick = function () { frozen ? resume() : scanOnce(); };
  function setLive(on) { live = on; $('btnLive').textContent = 'Live: ' + (on ? 'on' : 'off'); $('btnLive').setAttribute('aria-pressed', String(on)); if (on) liveLoop(); }
  $('btnLive').onclick = async function () { if (frozen) await resume(); if (!cameraOK) return toast('Camera not available'); setLive(!live); };
  async function liveLoop() {
    while (live) { if (!document.hidden && !pressing) await scanOnce(); await new Promise(function (r) { setTimeout(r, 400); }); }
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (live) setLive(false); } });
  $('stage').addEventListener('pointerdown', function (e) { if (!e.target.closest('.pill')) closeDetails(); });

  /* ---------- service worker ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW failed', e); }); });
  }

  /* ---------- test/debug hook ---------- */
  var api = window.RealPriceApp = {
    get settings() { return settings; }, get items() { return items; }, get detections() { return detections; },
    loadFile: loadFile, scanOnce: scanOnce, refreshAll: refreshAll, lastWords: null, lastText: ''
  };

  /* ---------- boot ---------- */
  refreshAll();
  if (!settings.zip && settings.manualRate === '') { /* first run: nudge to settings */ setTimeout(function () { toast('Set your ZIP code in ⚙︎ for accurate tax'); }, 800); }
  startCamera();
  window.addEventListener('pagehide', stopCamera);
})();
