/* Real Price - UI, camera, OCR. Pure logic lives in logic.js (window.RP). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY_S = 'realprice.settings.v1', KEY_T = 'realprice.total.v1';
  var DEFAULT_SETTINGS = { zip: '', rateSource: 'combined', manualRate: '', mode: 'store', tip: 18, thorough: false };

  /* Page directory, so /real-price and /real-price/index.html both resolve assets inside the app. */
  function appBase() {
    var url = new URL(location.href);
    var path = url.pathname;
    if (!path.endsWith('/')) {
      var leaf = path.slice(path.lastIndexOf('/') + 1);
      if (leaf.indexOf('.') !== -1) path = path.slice(0, path.lastIndexOf('/') + 1);
      else path += '/';
    }
    return url.origin + path;
  }
  function asset(rel) { return new URL(rel, appBase()).href; }
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

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
    mark('modeSwitch', 'data-mode', settings.mode);
    var label = $('locLabel'), btn = $('chipTax');
    if (t.source === 'none') {
      label.textContent = 'Set ZIP';
      btn.classList.add('unset');
    } else {
      btn.classList.remove('unset');
      var zip = String(settings.zip || '').replace(/\s+/g, '');
      var pct = trimPct(t.percent) + '% tax';
      label.textContent = zip ? ('ZIP ' + zip + ' · ' + pct) : ('Manual · ' + pct);
    }
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
    if (t.source === 'manual') el.innerHTML = 'Using your rate: <b>' + trimPct(t.percent) + '%</b>' + (t.state ? ' · ' + t.stateName : '');
    else if (t.source === 'zip') el.innerHTML = t.stateName + ' · state <b>' + trimPct(t.stateRate) + '%</b>, combined <b>' + trimPct(t.combinedRate) + '%</b>. Using <b>' + trimPct(t.percent) + '%</b>.';
    else el.innerHTML = settings.zip ? 'That ZIP is not a US state or DC. Enter your rate instead.' : 'Add a US ZIP, or type the rate you actually pay. Until then tax is 0%.';
  }
  function mark(id, attr, val) {
    Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) {
      var on = b.getAttribute(attr) === val;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function refreshAll() { renderChips(); renderSettings(); renderOverlays(); renderTotals(); }

  function openSheet(id) { $(id).hidden = false; }
  function closeSheets() { $('settings').hidden = true; $('totalPanel').hidden = true; }
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', closeSheets); });
  ['settings', 'totalPanel'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === $(id)) closeSheets(); }); });
  $('btnSettings').onclick = $('chipTax').onclick = function () { renderSettings(); openSheet('settings'); };
  function setMode(m) { if (!m) return; settings.mode = m; saveSettings(); refreshAll(); }
  $('modeSwitch').addEventListener('click', function (e) { var b = e.target.closest('button'); setMode(b && b.getAttribute('data-mode')); });
  $('modeSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); setMode(b && b.getAttribute('data-mode')); });
  $('tipSeg').addEventListener('click', function (e) { var m = e.target.getAttribute('data-tip'); if (m) { settings.tip = Number(m); saveSettings(); refreshAll(); } });
  $('srcSeg').addEventListener('click', function (e) { var m = e.target.getAttribute('data-src'); if (m) { settings.rateSource = m; saveSettings(); refreshAll(); } });
  $('zip').addEventListener('input', function () { settings.zip = this.value.trim(); saveSettings(); renderChips(); renderSettingsInfoOnly(); renderOverlays(); renderTotals(); });
  $('manualRate').addEventListener('input', function () { settings.manualRate = this.value.trim().replace(',', '.').replace('%', ''); saveSettings(); renderChips(); renderSettingsInfoOnly(); renderOverlays(); renderTotals(); });
  function renderSettingsInfoOnly() {
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
        '<div class="qtybox"><button type="button" data-act="dec" aria-label="Less">−</button><span>×' + it.qty + '</span><button type="button" data-act="inc" aria-label="More">+</button></div>' +
        '<button class="del" type="button" data-act="del" aria-label="Remove item"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>' +
        '<div class="real">Item ' + (idx + 1) + ' · <b>' + RP.fmt(rp.total) + '</b> with tax' + (settings.mode === 'restaurant' ? ' and tip' : '') + '</div>';
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
  var detections = [];
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
      var h = Math.max(bh * 1.15, 44), fs = Math.max(14, Math.min(28, bh * 0.7));
      var w = Math.max(bw * 1.15, 64);
      var cx = cr.x + ((d.bbox.x0 + d.bbox.x1) / 2) * cr.scale, cy = cr.y + ((d.bbox.y0 + d.bbox.y1) / 2) * cr.scale;
      var el = document.createElement('div');
      el.className = 'pill ' + (d.certainty === 'low' ? 'low ' : '') + settings.mode;
      el.style.cssText = 'left:' + (cx - w / 2) + 'px;top:' + (cy - h / 2) + 'px;min-width:' + w + 'px;height:' + h + 'px;font-size:' + fs + 'px';
      el.dataset.cents = d.cents;
      el.innerHTML = '<span class="val">' + RP.fmt(r.total) + '</span>' +
        '<div class="detail">On the tag ' + RP.fmt(r.base) + '<br>Tax ' + RP.fmt(r.tax) + (settings.mode === 'restaurant' ? '<br>Tip ' + RP.fmt(r.tip) + ' (' + settings.tip + '%)' : '') + '<br><b>' + RP.fmt(r.total) + '</b><br>Hold to add</div>';
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
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      timer = setTimeout(function () {
        fired = true; addItem(d.cents);
        el.classList.remove('pressing'); el.classList.add('added');
        if (navigator.vibrate) try { navigator.vibrate(40); } catch (err) {}
        toast('Added ' + RP.fmt(d.cents));
      }, LONG_MS);
    });
    function end() { clearTimeout(timer); el.classList.remove('pressing'); pressing = false; }
    el.addEventListener('pointerup', function () {
      var wasLong = fired; end();
      if (!wasLong) { var open = el.classList.contains('open'); closeDetails(); if (!open) el.classList.add('open'); }
    });
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - sx) > 14 || Math.abs(e.clientY - sy) > 14) end(); });
  }
  function closeDetails() { Array.prototype.forEach.call(document.querySelectorAll('.pill.open'), function (p) { p.classList.remove('open'); }); }
  window.addEventListener('resize', renderOverlays);
  window.addEventListener('orientationchange', function () { setTimeout(renderOverlays, 250); });

  /* ---------- camera ---------- */
  var stream = null, cameraOK = false, viewingPhoto = false, live = false, scanning = false, liveGen = 0;
  var video = $('video'), frame = $('frame'), ocrCanvas = $('ocr');
  function setMsg(m) { var el = $('stageMsg'); el.textContent = m || ''; el.hidden = !m; }
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg('This browser has no camera.\nChoose a photo instead.'); return false;
    }
    var attempts = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];
    var err = null;
    stopCamera();
    for (var i = 0; i < attempts.length; i++) {
      try { stream = await navigator.mediaDevices.getUserMedia(attempts[i]); err = null; break; }
      catch (e) { err = e; stream = null; }
    }
    if (!stream) {
      cameraOK = false;
      var why = err && err.name === 'NotAllowedError' ? 'Camera permission was denied.' : err && err.name === 'NotFoundError' ? 'No camera found.' : 'Camera could not start.';
      setMsg(why + '\nChoose a photo instead.'); return false;
    }
    video.playsInline = true; video.muted = true;
    video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    var track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints && video.videoWidth && video.videoWidth < 1280) {
      try { await track.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 } }); } catch (e) {}
    }
    cameraOK = true; setMsg(''); video.hidden = false; return true;
  }
  function stopCamera() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }

  function nextVideoFrame() {
    return new Promise(function (resolve) {
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(function () { resolve(); });
      else requestAnimationFrame(function () { resolve(); });
    });
  }

  /* ---------- OCR ---------- */
  var workerP = null;
  var ocrState = 'loading';
  function setOcrStatus(state, text) {
    ocrState = state;
    var el = $('ocrStatus');
    el.dataset.state = state;
    el.textContent = text || '';
    el.hidden = state === 'ready';
  }
  function loadErrorText(e) {
    var m = (e && (e.message || e.toString())) || 'unknown error';
    m = String(m).replace(/\s+/g, ' ').slice(0, 110);
    return 'Text reader didn’t load — ' + m + '. Tap to retry.';
  }
  function onLogger(m) {
    if (!m || !m.status) return;
    var friendly = {
      'loading tesseract core': 'Loading reader…',
      'initializing tesseract': 'Starting reader…',
      'loading language traineddata': 'Loading language…',
      'initializing api': 'Preparing reader…'
    };
    if (friendly[m.status]) setOcrStatus('loading', friendly[m.status]);
    else if (m.status === 'recognizing text' && !live) setOcrStatus('loading', 'Reading… ' + Math.round((m.progress || 0) * 100) + '%');
  }
  function coreList() {
    var lstm = asset('vendor/tesseract/core/tesseract-core-lstm.wasm.js');
    var auto = asset('vendor/tesseract/core/');
    /* iOS often reports SIMD, then fails to compile the SIMD core. Start with the plain LSTM build. */
    return isIOS() ? [lstm, auto] : [auto, lstm];
  }
  function createWith(corePath) {
    console.info('OCR core', corePath);
    return Tesseract.createWorker('eng', 1, {
      workerPath: asset('vendor/tesseract/worker.min.js'),
      corePath: corePath,
      langPath: asset('vendor/tesseract/lang/'),
      gzip: true,
      workerBlobURL: false,
      cacheMethod: 'none',
      logger: onLogger
    }).then(async function (w) {
      await w.setParameters({ preserve_interword_spaces: '1' });
      return w;
    });
  }
  function getWorker() {
    if (workerP) return workerP;
    if (typeof Tesseract === 'undefined') return Promise.reject(new Error('Tesseract script failed to load'));
    setOcrStatus('loading', 'Loading text reader…');
    var cores = coreList();
    workerP = createWith(cores[0]).catch(function (e1) {
      console.warn('OCR core failed, trying fallback', e1);
      setOcrStatus('loading', 'Retrying reader…');
      return createWith(cores[1]);
    }).catch(function (e2) { workerP = null; throw e2; });
    return workerP;
  }
  $('ocrStatus').onclick = function () {
    if (ocrState !== 'error') return;
    workerP = null;
    getWorker().then(function () {
      setOcrStatus('ready', '');
      if (cameraOK && !viewingPhoto) { live = true; liveLoop(); }
    }).catch(function (e) { setOcrStatus('error', loadErrorText(e)); });
  };

  /* Draw the camera (or a photo) at the stream's own resolution, capped so iOS
     can still allocate the bitmap next to the wasm heap, then stretch contrast. */
  var LIVE_LONG = 1920; // native getUserMedia frame on iPhone; larger bitmaps hurt digit boxes
  var PHOTO_LONG = 1920;
  function fitSize(sw, sh, cap) {
    var long = Math.max(sw, sh);
    var scale = long > cap ? cap / long : (long < 1280 ? Math.min(2, 1600 / long) : 1);
    return { w: Math.max(2, Math.round(sw * scale)), h: Math.max(2, Math.round(sh * scale)), scale: scale };
  }
  function drawSource(src, sw, sh, cap) {
    var size = fitSize(sw, sh, cap);
    var ctx = frame.getContext('2d', { willReadFrequently: true, alpha: false });
    frame.width = size.w; frame.height = size.h;
    ctx.imageSmoothingEnabled = size.scale < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, size.w, size.h);
    return size;
  }
  function enhance(ctx) {
    var w = ctx.canvas.width, h = ctx.canvas.height;
    var img;
    try { img = ctx.getImageData(0, 0, w, h); }
    catch (e) { return false; }
    var d = img.data;
    if (!d || d.length < 16) return false;
    var hist = new Uint32Array(256);
    var step = 4 * Math.max(1, Math.floor((w * h) / 20000));
    var sum = 0, n = 0;
    for (var i = 0; i < d.length; i += step) {
      var y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      hist[y]++; sum += y; n++;
    }
    if (!n || sum / n < 10) return false;
    var total = 0; for (var b = 0; b < 256; b++) total += hist[b];
    var acc = 0, lo = 0, hi = 255;
    for (var b = 0; b < 256; b++) { acc += hist[b]; if (acc >= total * 0.02) { lo = b; break; } }
    acc = 0;
    for (var b = 255; b >= 0; b--) { acc += hist[b]; if (acc >= total * 0.02) { hi = b; break; } }
    if (hi < lo + 12) hi = Math.min(255, lo + 12);
    var span = hi - lo;
    for (var p = 0; p < d.length; p += 4) {
      var y = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
      var v = ((y - lo) * 255) / span;
      if (v < 0) v = 0; else if (v > 255) v = 255;
      d[p] = d[p + 1] = d[p + 2] = v;
    }
    var octx = ocrCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
    ocrCanvas.width = w; ocrCanvas.height = h;
    octx.putImageData(img, 0, 0);
    ocrDims = { w: w, h: h };
    return true;
  }
  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function finish(blob) {
        if (settled) return;
        settled = true;
        if (blob && blob.size > 80) resolve(blob);
        else reject(new Error('Could not read the camera picture'));
      }
      try {
        canvas.toBlob(function (blob) { finish(blob); }, 'image/jpeg', 0.92);
      } catch (e) { settled = true; reject(e); return; }
      setTimeout(function () {
        if (settled) return;
        try {
          var url = canvas.toDataURL('image/jpeg', 0.92);
          var bin = atob(url.split(',')[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          finish(new Blob([arr], { type: 'image/jpeg' }));
        } catch (e) { settled = true; reject(e); }
      }, 1200);
    });
  }

  async function ocrPass(w, psm, whitelist) {
    await w.setParameters({
      tessedit_pageseg_mode: String(psm),
      tessedit_char_whitelist: whitelist,
      preserve_interword_spaces: '1'
    });
    var blob = await canvasToBlob(ocrCanvas);
    var res = await w.recognize(blob, {}, { blocks: true, text: true });
    return { words: RP.wordsFromOcr(res.data), text: res.data.text };
  }
  function mergeDetections(a, b) {
    b.forEach(function (d) {
      var cx = (d.bbox.x0 + d.bbox.x1) / 2, cy = (d.bbox.y0 + d.bbox.y1) / 2;
      var dup = a.some(function (e) { return cx >= e.bbox.x0 - 4 && cx <= e.bbox.x1 + 4 && cy >= e.bbox.y0 - 4 && cy <= e.bbox.y1 + 4; });
      if (!dup) a.push(d);
    });
    return a;
  }
  async function recognizeCanvas(quick) {
    var w = await getWorker();
    if (!quick) setOcrStatus('loading', 'Reading…');
    var psm = window.RP_PSM || 11;
    var whitelist = '0123456789.$€£';
    var first = await ocrPass(w, psm, whitelist);
    var allWords = first.words;
    var text = first.text;
    var found = RP.detectPrices(allWords);
    if (!window.RP_PSM && (!quick || settings.thorough || !found.length)) {
      setOcrStatus('loading', 'Reading again…');
      var second = await ocrPass(w, 3, '');
      found = mergeDetections(found, RP.detectPrices(second.words));
      allWords = allWords.concat(second.words); text += '\n--- pass 2 ---\n' + second.text;
    }
    found.forEach(function (d, i) { d.id = i; });
    detections = found;
    api.lastWords = allWords; api.lastText = text;
    renderOverlays();
    if (ocrState !== 'error') setOcrStatus('ready', '');
    return found;
  }

  async function scanOnce(quick) {
    if (scanning) return; scanning = true;
    try {
      if (quick) await nextVideoFrame();
      if (!video.videoWidth) { if (!quick) setOcrStatus('error', 'Camera has no picture yet. Tap to retry.'); return; }
      drawSource(video, video.videoWidth, video.videoHeight, LIVE_LONG);
      var ctx = frame.getContext('2d', { willReadFrequently: true });
      if (!enhance(ctx)) { if (!quick) setOcrStatus('error', 'That frame was blank. Hold steady and tap to retry.'); return; }
      await recognizeCanvas(!!quick);
    } catch (e) {
      console.error(e);
      if (!workerP) { live = false; setOcrStatus('error', loadErrorText(e)); }
      else setOcrStatus('error', 'Could not read prices — ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 80));
    } finally { scanning = false; }
  }

  async function liveLoop() {
    var gen = ++liveGen;
    while (live && gen === liveGen) {
      if (!document.hidden && !pressing && !viewingPhoto && video.videoWidth) await scanOnce(true);
      await new Promise(function (r) { setTimeout(r, pressing ? 60 : 280); });
    }
  }

  async function loadFile(file) {
    if (!file) return;
    live = false; viewingPhoto = true;
    setPhotoLabel(true);
    try {
      setOcrStatus('loading', 'Opening photo…');
      var bmp = await decodeImage(file);
      drawSource(bmp.src, bmp.w, bmp.h, PHOTO_LONG);
      if (bmp.src.close) try { bmp.src.close(); } catch (e) {}
      frame.classList.add('show'); video.hidden = true; setMsg('');
      var ctx = frame.getContext('2d', { willReadFrequently: true });
      if (!enhance(ctx)) { setOcrStatus('error', 'Could not read that photo. Tap to retry.'); return; }
      detections = []; renderOverlays();
      var found = await recognizeCanvas(false);
      toast(found.length ? found.length + ' price' + (found.length > 1 ? 's' : '') : 'No prices in that photo');
    } catch (e) {
      console.error(e);
      if (!workerP) setOcrStatus('error', loadErrorText(e));
      else { setOcrStatus('ready', ''); toast('Could not read that photo'); }
    }
  }
  function decodeImage(file) {
    return new Promise(function (resolve, reject) {
      function viaImage() {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unsupported image')); };
        img.src = url;
      }
      if (window.createImageBitmap) {
        var opts = {};
        try { opts = { imageOrientation: 'from-image' }; } catch (e) {}
        createImageBitmap(file, opts).then(function (b) { resolve({ src: b, w: b.width, h: b.height }); }, viaImage);
      } else viaImage();
    });
  }
  function setPhotoLabel(viewing) {
    $('photoLabel').textContent = viewing ? 'Camera' : 'Take photo';
    $('photoIconCam').hidden = viewing;
    $('photoIconLive').hidden = !viewing;
  }
  $('fileInput').addEventListener('change', function () { var f = this.files && this.files[0]; this.value = ''; if (f) loadFile(f); });
  $('btnPhoto').onclick = function () { if (viewingPhoto) resumeCamera(); else $('fileInput').click(); };
  async function resumeCamera() {
    viewingPhoto = false; frame.classList.remove('show'); setPhotoLabel(false);
    detections = []; renderOverlays(); video.hidden = false;
    var ok = cameraOK && stream;
    if (!ok) ok = await startCamera();
    else { try { await video.play(); } catch (e) {} }
    if (ok) { setMsg(''); live = true; liveLoop(); }
  }
  $('stage').addEventListener('pointerdown', function (e) { if (!e.target.closest('.pill')) closeDetails(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) live = false;
    else if (cameraOK && !viewingPhoto) { live = true; liveLoop(); }
  });

  /* ---------- service worker ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController) location.reload(); });
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW failed', e); }); });
  }

  /* ---------- test/debug hook ---------- */
  var api = window.RealPriceApp = {
    get settings() { return settings; }, get items() { return items; }, get detections() { return detections; },
    loadFile: loadFile, scanOnce: scanOnce, refreshAll: refreshAll, appBase: appBase, asset: asset, lastWords: null, lastText: ''
  };

  /* ---------- boot ---------- */
  refreshAll();
  if (!settings.zip && settings.manualRate === '') setTimeout(function () { toast('Add your ZIP for a real tax rate'); }, 900);
  getWorker().then(function () { setOcrStatus('ready', ''); }).catch(function (e) { setOcrStatus('error', loadErrorText(e)); });
  startCamera().then(function (ok) { if (ok && !viewingPhoto) { live = true; liveLoop(); } });
  window.addEventListener('pagehide', stopCamera);
})();
