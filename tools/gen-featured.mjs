// Fetches real Open-Meteo / ERA5 data for the home page's featured cities and writes assets/featured.json.
// Usage (from the project root): node tools/gen-featured.mjs
// Run once a year (after New Year) so the stripes include the last full year.
// Resumable: saves after each city and skips cities already fetched for the same year (Open-Meteo limits heavy requests per hour).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveUrl, summarize, analyze, lastFullYear, roundCoord, slugify } from '../assets/climate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CITIES = [
  ['Bangkok', 'TH'], ['London', 'GB'], ['New York', 'US'], ['Tokyo', 'JP'], ['Paris', 'FR'], ['Mumbai', 'IN'],
  ['São Paulo', 'BR'], ['Lagos', 'NG'], ['Sydney', 'AU'], ['Mexico City', 'MX'], ['Cairo', 'EG'], ['Berlin', 'DE'],
  ['Toronto', 'CA'], ['Jakarta', 'ID'], ['Madrid', 'ES'], ['Nairobi', 'KE'],
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429) { console.log('  rate limited — waiting 65 s'); await wait(65_000); continue; }
    throw new Error(`${res.status} ${await res.text()}`);
  }
  throw new Error('gave up');
}

const file = join(root, 'assets/featured.json');
let out = { generated: new Date().toISOString().slice(0, 10), toYear: lastFullYear(), cities: [] };
if (existsSync(file)) { const old = JSON.parse(readFileSync(file, 'utf8')); if (old.toYear === out.toYear) out.cities = old.cities; }
const save = () => {
  out.cities.sort((x, y) => CITIES.findIndex((c) => c[1] === x.cc) - CITIES.findIndex((c) => c[1] === y.cc));
  writeFileSync(file, JSON.stringify(out) + '\n');
};
for (const [name, cc] of CITIES) {
  if (out.cities.some((c) => c.cc === cc)) continue;
  const geo = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en`);
  const g = (geo.results || []).find((r) => r.country_code === cc);
  if (!g) { console.log(`✗ ${name}: not found`); continue; }
  const lat = roundCoord(g.latitude), lon = roundCoord(g.longitude);
  const s = summarize(await getJSON(archiveUrl(lat, lon)));
  const a = analyze(s);
  out.cities.push({ slug: slugify(g.name, cc), name: g.name, country: g.country, cc, lat, lon, summary: s });
  save();
  console.log(`✓ ${g.name}, ${g.country}: ${s.from}–${s.to}, warming ${a.warming >= 0 ? '+' : ''}${a.warming}°C, hot days ${a.hotDays.fifties} → ${a.hotDays.recent} (>${s.hotThreshold}°C)`);
  await wait(1500);
}
save();
console.log(`\nWrote assets/featured.json (${out.cities.length} cities)`);
