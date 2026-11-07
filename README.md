# My City Stripes

**Your city's climate story in one picture.** Type a city and see one stripe for every year since 1940 — blue for cooler years, red for warmer ones — built from real data. Then stamp it on BOT Chain and make a pledge.

*Free to use (gas only). No tokens, payments or admin. Only city summaries and pledges go on-chain — never anything personal.*

## Status

| | |
|---|---|
| Live site | _not published yet_ (GitHub Pages + custom domain) |
| Contract (BOT Chain mainnet, chain ID 677) | [`0x9Da8F988625e8785c56737A6EEF5E6b5bF6f23a3`](https://scan.botchain.ai/address/0x9Da8F988625e8785c56737A6EEF5E6b5bF6f23a3) — set in `assets/config.js`, shown in the footer |
| Contract (testnet, chain ID 968) | _not deployed yet_ |
| Worker | _not deployed yet_ — set `workerUrl` in `assets/config.js` |

With the mainnet address set, stamping, pledging and check-ins are real BOT Chain transactions. Add `?preview` to the URL to try everything in **preview mode** instead (simulated in the browser with the same rules; a yellow bar says so).

## What's inside

| Route | What it is |
|---|---|
| `/` | Website: banner · nav · 1 hero (featured city's stripes draw in, warming counts up) · 2 city strip marquee · 3 live stats (hidden until ≥ 3 cities) · 4 city stories · 5 made for · 6 how it works · 7 scroll-scrubbed timeline · 8 navy metrics band · 9 data you can trust · 10 pledge + FAQ · footer |
| `/app` | Search → stripes build year by year → key numbers · your year (magenta tick, never stored) · line view (Chart.js, 10-year trend) · compare a second city · downloads · stamp · pledge + weekly check-ins |
| `/app/wall` | Every stamped city as a mini band drawn from the on-chain stripes; sort by warming / newest / pledges; per-city pledge board |
| `?city=bangkok-th` | Share links (`&ll=lat,lon` pins non-featured places; `&vs=…` adds a comparison) |

```
index.html            shell: banner, nav, footer (stripes band, live block number, contract, links)
404.html              GitHub Pages SPA redirect
deploy.html           one-click deploy from MetaMask (testnet / mainnet)
assets/
  config.js           ← contract addresses, Worker URL, links (the one place to edit)
  climate.js          pure logic shared by browser, Worker and tools: summarize, analyze, palette, fingerprint
  featured.json       real ERA5 data for the home page cities (tools/gen-featured.mjs)
  data.js             geocoding, caching (memory → localStorage → Worker → Open-Meteo)
  chain.js            wallet + contract (live) and the preview simulation
  stripes.js · search.js · downloads.js · home.js · app.js · wall.js · main.js · ui.js · styles.css
contracts/MyCityStripes.sol
worker/               Cloudflare Worker: GET /stripes?lat=&lon= (30-day cache, optional KV rate limit)
tools/                compile, tests, featured-city generator, dev server
build/                ABI + bytecode + standard JSON input (for explorer verification)
```

## Data

- Geocoding: Open-Meteo Geocoding API. Temperatures: Open-Meteo Historical Weather API, `models=era5`, daily mean + max, 1940-01-01 → last 31 December, local timezone, coordinates rounded to 0.01°.
- Yearly mean = average of daily means (current year skipped). Anomaly = yearly mean − 1951–1980 average. Colours: 8 blues + 8 reds, centred on 0, ±2.5 SD of the city's anomalies.
- Warming = last-10-years average − 1951–1980 average. Hot days = days with max above 35 °C, or above the city's 1951–1980 95th percentile when that is lower (the threshold is always shown).
- Fingerprint = SHA-256 of the text `1940:26.81,26.95,…` (first year, colon, yearly means with 2 decimals). Re-run it to compare.
- **Rate limits:** an 86-year daily request is "heavy" for Open-Meteo's free tier — roughly 10 such requests per hour per IP. That's why the Worker caches summaries for 30 days, the browser caches every city it opens, and the featured cities ship as static data. When the limit is hit the app says "try again in a minute".

## Contract

`contracts/MyCityStripes.sol` — Solidity ^0.8.20 (compiled with 0.8.20), optimizer 200 runs, EVM `paris`. Runtime ≈ 9 KB.

- `stampCity(StampInput)` — first stamp creates the city; another wallet adds +1 to `stamps`; the same wallet again reverts `AlreadyStamped` unless the data has a later `toYear` (then the summary is replaced, counts kept). Key = `keccak256(abi.encode(latE2, lonE2))`.
- `makePledge(cityKey, kind, text, durationWeeks)` — kind 0–4 presets (text must be empty), 5 = own text 1–100 bytes; 4/8/12 weeks; city must be stamped.
- `checkIn(id)` — owner only, once per `block.timestamp / 1 weeks`, up to the pledge length.
- Views: `getCity`, `getCities(from, count)`, `cityCount`, `pledgesOf`, `pledgesForCity`, `getPledge`, `hasStamped`, `stats()` (cities, pledges, check-ins), `currentYear`, `currentWeek`, `cityKey`.
- Events: `CityStamped(key, by, warmingE2)`, `Pledged(id, by, cityKey, kind)`, `CheckedIn(id, week, count)`.
- Gas (local test): first stamp ≈ 324k (includes the stripes) · pledge ≈ 214k.

**Changes to the PRD**
- `weeks` is a reserved word in Solidity → the field/param is `durationWeeks`.
- `stampCity` takes one struct (nine separate params hit "stack too deep").
- `CityStamp` gains `uint32 stamps` (the "+1 stamped" count) and `bytes stripes` (one signed byte per year, anomaly in 0.1 °C) so the Wall, marquee and footer draw real stripes straight from the chain, with no API calls.
- `cities` is private behind `getCity` (a public getter for a 13-field struct doesn't compile).
- Wording: the warming number is "vs 1951–1980" (not "vs the 1950s"), since that's what it measures. Hot days do compare the 1950s with the last 10 years.

## Run locally

```bash
node tools/serve.mjs
```

Open http://localhost:4621. Add `?net=testnet` for the testnet contract.

## Tests

```bash
node tools/compile.mjs && node tools/test-contract.mjs && node tools/test-logic.mjs
```

10 contract checks (every rule in PRD section 5) and 7 logic checks (summary, analysis, colour scale, fingerprint, on-chain stripes, helpers, featured data). `tools/node_modules` is included locally; otherwise `npm --prefix tools install`.

Refresh the featured cities once a year (resumable, it waits out rate limits): `node tools/gen-featured.mjs`.

## Deploy

1. **Contract** — `node tools/serve.mjs`, open http://localhost:4621/deploy.html, deploy to testnet, try the app (`/app?net=testnet`), then deploy to mainnet. Paste the address into `assets/config.js` and the table above. Verify on scan.botchain.ai with `build/MyCityStripes.standard-input.json` (0.8.20, optimizer 200, EVM paris).
2. **Worker** — `cd worker && npm install && npx wrangler deploy` (or copy `handleStripes` + `assets/climate.js` into the shared Week 1 Worker). Set `ALLOWED_ORIGINS`, optionally bind a `RATE` KV namespace, then put the URL in `workerUrl`.
3. **Site** — push to GitHub, enable Pages (root), add the custom domain. Fill in `links.x` and `links.github`.

## Libraries (CDN)

ethers 6.13.5 · GSAP 3.13 (ScrollTrigger, SplitText) · Chart.js 4.4.1 · jsPDF 2.5.1 · Google Fonts (Inter Tight, Inter, IBM Plex Mono). Downloads are drawn on canvas directly, so html-to-image isn't needed.

## Credits

Data: [Open-Meteo](https://open-meteo.com/) · ERA5 reanalysis, Copernicus Climate Change Service / ECMWF. Warming stripes: Ed Hawkins, [#ShowYourStripes](https://showyourstripes.info/) (CC BY 4.0).
