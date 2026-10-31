/* Real Price - pure logic (tax lookup, price detection, totals). Works in browser (window.RP) and Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Tax data ----------
   * Source: Tax Foundation, "State and Local Sales Tax Rates, Midyear 2026" (rates as of July 1, 2026;
   * average local = population-weighted average as of Jan 1, 2026). https://taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/
   * [name, state rate %, average combined state+local %]
   * Real rates vary by city/county/district (and food/restaurant rules differ) - use the manual override for exact rates.
   */
  var STATES = {
    AL: ['Alabama', 4.0, 9.46], AK: ['Alaska', 0, 1.82], AZ: ['Arizona', 5.6, 8.54], AR: ['Arkansas', 6.5, 9.48],
    CA: ['California', 7.25, 9.03], CO: ['Colorado', 2.9, 7.89], CT: ['Connecticut', 6.35, 6.35], DE: ['Delaware', 0, 0],
    DC: ['District of Columbia', 6.0, 6.0], FL: ['Florida', 6.0, 6.98], GA: ['Georgia', 4.0, 7.56], HI: ['Hawaii', 4.0, 4.5],
    ID: ['Idaho', 6.0, 6.03], IL: ['Illinois', 6.25, 8.98], IN: ['Indiana', 7.0, 7.0], IA: ['Iowa', 6.0, 6.94],
    KS: ['Kansas', 6.5, 8.71], KY: ['Kentucky', 6.0, 6.0], LA: ['Louisiana', 5.0, 10.13], ME: ['Maine', 5.5, 5.5],
    MD: ['Maryland', 6.0, 6.0], MA: ['Massachusetts', 6.25, 6.25], MI: ['Michigan', 6.0, 6.0], MN: ['Minnesota', 6.875, 8.14],
    MS: ['Mississippi', 7.0, 7.06], MO: ['Missouri', 4.225, 8.44], MT: ['Montana', 0, 0], NE: ['Nebraska', 5.5, 6.98],
    NV: ['Nevada', 6.85, 8.24], NH: ['New Hampshire', 0, 0], NJ: ['New Jersey', 6.625, 6.6], NM: ['New Mexico', 4.875, 7.68],
    NY: ['New York', 4.0, 8.54], NC: ['North Carolina', 4.75, 7.1], ND: ['North Dakota', 5.0, 7.09], OH: ['Ohio', 5.75, 7.29],
    OK: ['Oklahoma', 4.5, 9.06], OR: ['Oregon', 0, 0], PA: ['Pennsylvania', 6.0, 6.34], RI: ['Rhode Island', 7.0, 7.0],
    SC: ['South Carolina', 6.0, 7.49], SD: ['South Dakota', 4.2, 6.11], TN: ['Tennessee', 7.0, 9.61], TX: ['Texas', 6.25, 8.2],
    UT: ['Utah', 6.1, 7.42], VT: ['Vermont', 6.0, 6.43], VA: ['Virginia', 5.3, 5.77], WA: ['Washington', 6.5, 9.57],
    WV: ['West Virginia', 6.0, 6.6], WI: ['Wisconsin', 5.0, 5.72], WY: ['Wyoming', 4.0, 5.39]
  };

  /* ZIP first-3-digits -> state. First match wins, so exceptions come first. Approximate at the edges. */
  var ZIP3 = [
    [201, 201, 'VA'], [733, 733, 'TX'], [885, 885, 'TX'], [569, 569, 'DC'],
    [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'],
    [5, 5, 'NY'], [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'], [200, 205, 'DC'], [206, 219, 'MD'],
    [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'], [320, 339, 'FL'],
    [341, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'],
    [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'],
    [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'], [660, 679, 'KS'],
    [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'], [750, 799, 'TX'], [800, 816, 'CO'],
    [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'], [889, 898, 'NV'],
    [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK']
  ];

  function stateForZip(zip) {
    var z = String(zip || '').trim();
    if (!/^\d{5}(-\d{4})?$/.test(z)) return null;
    var p = parseInt(z.slice(0, 3), 10);
    for (var i = 0; i < ZIP3.length; i++) if (p >= ZIP3[i][0] && p <= ZIP3[i][1]) return ZIP3[i][2];
    return null; // PR/VI/military etc.
  }

  /* settings: {zip, rateSource:'combined'|'state', manualRate:''|number-as-percent}
   * returns {rate (fraction), percent, source:'manual'|'zip'|'none', state, stateName, stateRate, combinedRate} */
  function resolveTax(settings) {
    settings = settings || {};
    var st = stateForZip(settings.zip);
    var info = st ? STATES[st] : null;
    var out = { rate: 0, percent: 0, source: 'none', state: st, stateName: info ? info[0] : null,
      stateRate: info ? info[1] : null, combinedRate: info ? info[2] : null };
    var m = settings.manualRate;
    if (m !== '' && m != null && isFinite(Number(m)) && Number(m) >= 0 && Number(m) <= 30) {
      out.percent = Number(m); out.source = 'manual';
    } else if (info) {
      out.percent = settings.rateSource === 'state' ? info[1] : info[2];
      out.source = 'zip';
    }
    out.rate = out.percent / 100;
    return out;
  }

  /* ---------- Money ---------- */
  function toCents(x) { return Math.round(Number(x) * 100 + 1e-9); }
  function fmt(cents) {
    var neg = cents < 0, c = Math.abs(Math.round(cents));
    var s = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + ('0' + (c % 100)).slice(-2);
    return (neg ? '-$' : '$') + s;
  }

  /* Real price for a single shelf/menu price (cents). mode: 'store'|'restaurant'. tipPct only used in restaurant mode.
   * Tip is computed on the pre-tax amount. */
  function realPrice(cents, rate, mode, tipPct) {
    var tax = Math.round(cents * rate);
    var tip = mode === 'restaurant' ? Math.round(cents * (tipPct || 0) / 100) : 0;
    return { base: cents, tax: tax, tip: tip, total: cents + tax + tip };
  }

  /* items: [{price: cents, qty}] */
  function totals(items, rate, mode, tipPct) {
    var sub = 0, n = 0;
    (items || []).forEach(function (it) { var q = it.qty || 1; sub += it.price * q; n += q; });
    var r = realPrice(sub, rate, mode, tipPct);
    return { count: n, subtotal: sub, tax: r.tax, tip: r.tip, grand: r.total };
  }

  /* ---------- Price detection ---------- */
  // optional currency mark ($, or S/§ that OCR often reads for $), digits with optional thousands commas, optional 2-digit cents
  var PRICE_RE = /^([$€£¥S§]?)(\d{1,3}(?:,\d{3})+|\d+)(?:([.,])(\d{2}))?$/;
  var TRAIL_RE = /^(\d{1,3}(?:,\d{3})+|\d+)(?:([.,])(\d{2}))?([$€£¥])$/;

  function cleanToken(t) {
    return String(t || '').replace(/^[\s.,;:'"`*_\-~|()\[\]{}<>=·•\u2026]+/, '').replace(/[\s.,;:'"`*_\-~|()\[\]{}<>=·•\u2026]+$/, '');
  }

  /* Parse a single OCR token. Returns {cents, hasSymbol, hasDecimals} or null. */
  function parsePriceToken(raw) {
    var t = cleanToken(raw);
    if (!t) return null;
    var m = PRICE_RE.exec(t);
    var trailing = false;
    if (!m && (m = TRAIL_RE.exec(t))) { trailing = true; }
    if (!m) return null;
    var sym = trailing ? m[4] : m[1], whole = trailing ? m[1] : m[2], sep = trailing ? m[2] : m[3], dec = trailing ? m[3] : m[4];
    // 'S' only counts as a $ when followed by digits and not a plain word (regex already ensures digits follow)
    var hasSymbol = sym === '$' || sym === '€' || sym === '£' || sym === '¥' || ((sym === 'S' || sym === '§') && (!!dec || whole.length <= 3));
    if (sym === 'S' && !hasSymbol) return null;
    if (sep === ',' && !dec) return null;
    // "1,299" style: whole has commas -> fine; "12,99" has sep ',' with dec -> European style cents
    var wholeNum = parseInt(whole.replace(/,/g, ''), 10);
    if (!isFinite(wholeNum)) return null;
    var cents = wholeNum * 100 + (dec ? parseInt(dec, 10) : 0);
    if (cents <= 0) return null;
    var hasDecimals = !!dec;
    if (!hasSymbol && !hasDecimals && wholeNum >= 1000) return null; // years, phone fragments, SKUs
    if (wholeNum > 99999) return null;
    if (!hasSymbol && !hasDecimals && whole.length > 1 && whole[0] === '0') return null;
    return { cents: cents, hasSymbol: hasSymbol, hasDecimals: hasDecimals };
  }

  var UNIT_AFTER = /^(oz|ounces?|lb|lbs|g|kg|ml|l|pc|pcs|pieces?|ct|count|%|percent|am|pm|a\.m\.|p\.m\.|cal|calories|x|inch|in|"|mg|st|nd|rd|th|off|each\/?|for|per|\/)$/i;

  /* words: [{text, confidence, bbox:{x0,y0,x1,y1}, lineIndex?, isLast?}] (as built by wordsFromOcr)
   * returns [{id, cents, text, bbox, confidence, certainty:'high'|'low'}] */
  function detectPrices(words, opts) {
    opts = opts || {};
    var minConf = opts.minConf != null ? opts.minConf : 45;
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w || !w.text || !w.bbox) continue;
      /* Tesseract reports 0 when a whitelist pass didn't score the word. A real price shape still counts. */
      var conf = w.confidence > 0 ? w.confidence : (w.confidence === 0 ? 55 : 100);
      var p = null;
      var bbox = w.bbox;
      // OCR sometimes splits "$9.49" into "$9." + "49"
      if (/^[$€£¥S§]?\d{1,3}[.,]$/.test(String(w.text).trim()) && words[i + 1] && sameLine(w, words[i + 1]) && /^\d{2}$/.test(String(words[i + 1].text).trim())) {
        p = parsePriceToken(String(w.text).trim() + String(words[i + 1].text).trim());
        if (p) { bbox = union(w.bbox, words[i + 1].bbox); conf = Math.min(conf, words[i + 1].confidence != null ? words[i + 1].confidence : 100); i++; }
      }
      if (!p) p = parsePriceToken(w.text);
      // "$" and number split into two tokens: "$" "12.99"
      if (!p && /^[$€£¥S§]$/.test(cleanToken(w.text) || '') && words[i + 1] && sameLine(w, words[i + 1])) {
        var q = parsePriceToken(words[i + 1].text);
        if (q) { p = { cents: q.cents, hasSymbol: true, hasDecimals: q.hasDecimals }; bbox = union(w.bbox, words[i + 1].bbox); conf = Math.min(conf, words[i + 1].confidence != null ? words[i + 1].confidence : 100); i++; }
      }
      if (!p) continue;
      var next = words[i + 1];
      var nextSameLine = next && sameLine(w, next);
      if (!p.hasSymbol && nextSameLine && UNIT_AFTER.test(cleanToken(next.text) || next.text)) continue;
      // Bare integers ("8") are only treated as prices when they end their line (typical menu layout "Burger ... 8").
      var bareInt = !p.hasSymbol && !p.hasDecimals;
      if (bareInt) {
        if (nextSameLine || /^\(/.test(w.text)) continue;
        if (conf < Math.max(minConf, 70)) continue;
        if (p.cents > 9900) continue; // bare integers above $99 are codes, not prices
      } else if (conf < (p.hasSymbol || p.hasDecimals ? Math.min(minConf, 20) : minConf)) continue;
      out.push({ id: out.length, cents: p.cents, text: w.text, bbox: bbox, confidence: conf,
        certainty: (p.hasSymbol || p.hasDecimals) ? 'high' : 'low' });
    }
    return out;
  }

  function union(a, b) { return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; }
  function sameLine(a, b) {
    var ay = (a.bbox.y0 + a.bbox.y1) / 2, by = (b.bbox.y0 + b.bbox.y1) / 2;
    var h = Math.max(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0);
    if (a.lineIndex != null && b.lineIndex != null) return a.lineIndex === b.lineIndex;
    return Math.abs(ay - by) < h * 0.6 && b.bbox.x0 >= a.bbox.x0 - 2;
  }

  /* Flatten a Tesseract.js recognize() result into the word list detectPrices expects. */
  function wordsFromOcr(data) {
    var words = [];
    if (data.lines && data.lines.length) {
      data.lines.forEach(function (ln, li) {
        (ln.words || []).forEach(function (w) { words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox, lineIndex: li }); });
      });
    } else (data.words || []).forEach(function (w) { words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox }); });
    return words;
  }

  /* Map an image-space bbox into stage pixels for an image shown with object-fit: contain. */
  function containRect(imgW, imgH, boxW, boxH) {
    var s = Math.min(boxW / imgW, boxH / imgH);
    return { scale: s, x: (boxW - imgW * s) / 2, y: (boxH - imgH * s) / 2, w: imgW * s, h: imgH * s };
  }


  return { STATES: STATES, ZIP3: ZIP3, stateForZip: stateForZip, resolveTax: resolveTax, toCents: toCents, fmt: fmt,
    realPrice: realPrice, totals: totals, parsePriceToken: parsePriceToken, detectPrices: detectPrices,
    wordsFromOcr: wordsFromOcr, containRect: containRect };
});
