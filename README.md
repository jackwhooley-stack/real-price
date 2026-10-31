# Real Price (prototype)

Mobile PWA: point the camera at a price tag or menu → each detected price is overlaid with what you'll *really* pay
(after sales tax; plus tip in Restaurant mode). Long-press a price to add it to a running total.
Plain HTML/CSS/JS, **no build step**, no paid services, no network calls after first load (OCR is self-hosted).

## Run locally
```
node serve.js 8080        # then open http://localhost:8080  (camera works on localhost; on a phone it needs HTTPS)
node test/unit.js         # pure-logic tests (tax lookup, price parsing, totals)
npm i && node test/e2e.js # headless-Chrome end-to-end test (needs `npm i` for playwright-core; uses /usr/bin/google-chrome)
```

## Files
- `index.html`, `style.css` – UI (camera stage, overlay layer, settings sheet, total sheet)
- `js/logic.js` – tax table + ZIP→state, price-token parsing/detection, money math (works in browser and Node)
- `js/app.js` – camera, OCR (Tesseract.js), overlays + long-press, settings/total UI, localStorage
- `vendor/tesseract/` – self-hosted Tesseract.js 5.1.1 (worker, wasm core, English LSTM data `eng.traineddata.gz`), ~11 MB
- `manifest.json`, `sw.js`, `icons/` – installable PWA + offline cache
- `serve.js` – tiny static server;  `test/` – unit + e2e tests, generated test images, screenshots

## Tax data
State rates + population-weighted average local rates from Tax Foundation "State and Local Sales Tax Rates, Midyear 2026".
ZIP → state uses first-3-digit ZIP ranges (approximate at borders). **Local rates vary** by city/county/district, and some
places tax restaurant meals/groceries differently – use the manual override for your exact rate.
