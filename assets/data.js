// Getting places and temperatures: Open-Meteo Geocoding + the Worker (or Open-Meteo directly), with caching.
import { CONFIG } from './config.js';
import { archiveUrl, summarize, lastFullYear, roundCoord, slugify } from './climate.js';

const SK = CONFIG.storageKey;
const memory = new Map();
let featuredP;

/** Real data for the home page's featured cities (tools/gen-featured.mjs). */
export function featured() {
  featuredP ||= fetch('assets/featured.json').then((r) => (r.ok ? r.json() : { cities: [] })).catch(() => ({ cities: [] }));
  return featuredP;
}

export class DataError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const placeFrom = (r) => ({
  name: r.name, country: r.country || '', cc: (r.country_code || '').toUpperCase(), admin1: r.admin1 || '',
  lat: roundCoord(r.latitude), lon: roundCoord(r.longitude), elevation: r.elevation ?? null, population: r.population || 0,
});

export async function searchCities(q, count = 8) {
  q = q.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new DataError('geo', 'City search is busy — try again in a minute.');
  const j = await res.json();
  return (j.results || []).filter((r) => r.latitude != null).map(placeFrom);
}

export const placeSlug = (p) => slugify(p.name, p.cc);
export const placeLabel = (p) => [p.name, p.country].filter(Boolean).join(', ');

/** ?city=bangkok-th → a place (featured first, then the geocoder). ll="13.75,100.50" pins the exact point. */
export async function resolveSlug(slug, ll) {
  const m = String(slug || '').toLowerCase().match(/^(.+?)(?:-([a-z]{2}))?$/);
  if (!m) return null;
  const f = (await featured()).cities.find((c) => c.slug === slug);
  if (f && !ll) return { name: f.name, country: f.country, cc: f.cc, lat: f.lat, lon: f.lon, elevation: null };
  const name = m[1].replace(/-/g, ' ');
  let results = [];
  try { results = await searchCities(name, 20); } catch { /* fall through */ }
  const cc = m[2]?.toUpperCase();
  let hit = results.find((r) => placeSlug(r) === slug) || (cc && results.find((r) => r.cc === cc)) || (!cc && results[0]);
  if (ll) {
    const [lat, lon] = ll.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) hit = { ...(hit || { name: name.replace(/\b\w/g, (c) => c.toUpperCase()), country: '', cc: cc || '' }), lat: roundCoord(lat), lon: roundCoord(lon) };
  }
  return hit || null;
}

const keyOf = (lat, lon) => `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`;

/** Yearly summary for a point. Order: featured → memory → this browser → Worker → Open-Meteo directly. */
export async function getSummary(lat, lon) {
  const toYear = lastFullYear();
  const k = keyOf(lat, lon);
  if (memory.has(k)) return memory.get(k);
  const f = (await featured()).cities.find((c) => keyOf(c.lat, c.lon) === k && c.summary.to === toYear);
  if (f) { memory.set(k, f.summary); return f.summary; }
  const lk = `${SK}.s.v1.${k}.${toYear}`;
  try { const c = JSON.parse(localStorage.getItem(lk) || 'null'); if (c?.mean?.length) { memory.set(k, c); return c; } } catch { /* ignore */ }

  let summary;
  if (CONFIG.workerUrl) {
    const res = await fetch(`${CONFIG.workerUrl.replace(/\/$/, '')}/stripes?lat=${roundCoord(lat)}&lon=${roundCoord(lon)}`).catch(() => null);
    if (res?.ok) summary = await res.json();
    else if (res && (res.status === 429 || res.status === 503)) throw new DataError('busy', 'The climate data service is busy — try again in a minute.');
  }
  if (!summary) {
    const res = await fetch(archiveUrl(lat, lon, toYear)).catch(() => null);
    if (!res) throw new DataError('offline', 'Couldn’t reach the climate data service — check your connection and try again.');
    if (res.status === 429) throw new DataError('busy', 'The free climate data service is busy — try again in a minute. (Cities you’ve opened before load instantly.)');
    if (!res.ok) throw new DataError('upstream', 'The climate data service had a problem — try again in a minute.');
    try { summary = summarize(await res.json(), toYear); } catch { throw new DataError('nodata', 'There isn’t enough data for this spot.'); }
  }
  memory.set(k, summary);
  try { localStorage.setItem(lk, JSON.stringify(summary)); } catch { /* storage full: fine */ }
  return summary;
}

/** Pledge kinds (index = on-chain `kind`). 5 = your own words. */
export const PLEDGES = [
  { icon: '🚲', label: 'Bike or walk 2× a week' },
  { icon: '🥦', label: 'Eat plant-based 3 days a week' },
  { icon: '🚌', label: 'Take public transport' },
  { icon: '✈️', label: 'Cut one flight this year' },
  { icon: '💡', label: 'Save energy at home' },
  { icon: '✍️', label: 'Your own' },
];
