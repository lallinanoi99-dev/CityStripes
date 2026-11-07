// Pure climate logic, shared by the browser, the Worker and tools/gen-featured.mjs.
// No DOM, no fetch — just numbers in, numbers out.

export const FIRST_YEAR = 1940;
export const BASE_FROM = 1951;
export const BASE_TO = 1980;
export const RECENT_YEARS = 10;
export const HOT_C = 35;

// 8 blues + 8 reds (ColorBrewer RdBu, as in the original warming stripes), cold → warm.
export const PALETTE = [
  '#08306B', '#08519C', '#2171B5', '#4292C6', '#6BAED6', '#9ECAE1', '#C6DBEF', '#DEEBF7',
  '#FEE0D2', '#FCBBA1', '#FC9272', '#FB6A4A', '#EF3B2C', '#CB181D', '#A50F15', '#67000D',
];
// Yarn names for the knit-scarf pattern (same order as PALETTE).
export const YARN = [
  'Midnight navy', 'Deep sea', 'Cobalt', 'Lake blue', 'Sky blue', 'Powder blue', 'Ice blue', 'Frost white',
  'Blush', 'Peach', 'Salmon', 'Coral', 'Tomato red', 'Crimson', 'Brick red', 'Oxblood',
];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const lastFullYear = (now = new Date()) => now.getUTCFullYear() - 1;
export const round2 = (x) => Math.round(x * 100) / 100;
const round1 = (x) => Math.round(x * 10) / 10;
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

/** Coordinates are rounded to 0.01° everywhere (Worker cache, on-chain key, fingerprint) so anyone can re-run them. */
export const roundCoord = (x) => Math.round(Number(x) * 100) / 100;

export function archiveUrl(lat, lon, toYear = lastFullYear()) {
  const q = new URLSearchParams({
    latitude: roundCoord(lat).toFixed(2),
    longitude: roundCoord(lon).toFixed(2),
    start_date: `${FIRST_YEAR}-01-01`,
    end_date: `${toYear}-12-31`,
    daily: 'temperature_2m_mean,temperature_2m_max',
    timezone: 'auto',
    models: 'era5',
  });
  return `https://archive-api.open-meteo.com/v1/archive?${q}`;
}

function percentile(values, p) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}

/**
 * Open-Meteo archive response → compact yearly summary (what the Worker returns, ~6 KB).
 * mean: yearly mean of daily means · hot: days above the hot threshold · mon: 12 monthly means per year.
 * The current (incomplete) year is skipped; so is any year with less than 90% of its days.
 */
export function summarize(res, toYear = lastFullYear()) {
  const d = res?.daily;
  if (!d?.time?.length) throw new Error('no_data');
  const byYear = new Map();
  const baseMax = [];
  for (let i = 0; i < d.time.length; i++) {
    const t = d.time[i];
    const y = +t.slice(0, 4);
    const m = +t.slice(5, 7) - 1;
    if (y < FIRST_YEAR || y > toYear) continue;
    const mean = d.temperature_2m_mean[i];
    const max = d.temperature_2m_max[i];
    if (!byYear.has(y)) byYear.set(y, { sum: 0, n: 0, maxes: [], ms: Array(12).fill(0), mn: Array(12).fill(0) });
    const Y = byYear.get(y);
    if (mean != null) { Y.sum += mean; Y.n++; Y.ms[m] += mean; Y.mn[m]++; }
    if (max != null) { Y.maxes.push(max); if (y >= BASE_FROM && y <= BASE_TO) baseMax.push(max); }
  }
  const p95 = percentile(baseMax, 0.95);
  const hotThreshold = round1(Number.isFinite(p95) ? Math.min(HOT_C, p95) : HOT_C);
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const from = years[0];
  const out = { v: 1, lat: roundCoord(res.latitude), lon: roundCoord(res.longitude), elevation: res.elevation ?? null, from, to: from - 1, hotThreshold, mean: [], hot: [], mon: [] };
  for (let y = from; y <= toYear; y++) {
    const Y = byYear.get(y);
    if (!Y || Y.n < 329) break; // keep the series continuous; stop at a gap
    out.to = y;
    out.mean.push(round2(Y.sum / Y.n));
    out.hot.push(Y.maxes.filter((x) => x > hotThreshold).length);
    out.mon.push(Y.ms.map((s, i) => (Y.mn[i] ? round1(s / Y.mn[i]) : null)));
  }
  if (out.mean.length < BASE_TO - FIRST_YEAR + RECENT_YEARS) throw new Error('short_series');
  return out;
}

/** The exact string that is hashed for the on-chain data fingerprint. */
export const fingerprintText = (s) => `${s.from}:${s.mean.map((v) => v.toFixed(2)).join(',')}`;

export async function fingerprint(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprintText(s)));
  return '0x' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Everything the app shows, computed from a summary. */
export function analyze(s) {
  const years = s.mean.map((_, i) => s.from + i);
  const idx = (y) => y - s.from;
  const span = (a, b) => years.filter((y) => y >= a && y <= b);
  const baseYears = span(BASE_FROM, BASE_TO);
  const baseline = avg(baseYears.map((y) => s.mean[idx(y)]));
  const anomalies = s.mean.map((v) => round2(v - baseline));
  const sd = Math.sqrt(avg(anomalies.map((a) => (a - avg(anomalies)) ** 2))) || 0.5;
  const scale = 2.5 * sd;

  const recentYears = years.slice(-RECENT_YEARS);
  const recentMean = avg(recentYears.map((y) => s.mean[idx(y)]));
  const warming = round2(recentMean - baseline);

  let hottest = 0, coldest = 0;
  s.mean.forEach((v, i) => { if (v > s.mean[hottest]) hottest = i; if (v < s.mean[coldest]) coldest = i; });

  const fifties = span(1950, 1959);
  const hot50s = Math.round(avg(fifties.map((y) => s.hot[idx(y)])));
  const hotRecent = Math.round(avg(recentYears.map((y) => s.hot[idx(y)])));

  const monthAvg = (ys, m) => avg(ys.map((y) => s.mon[idx(y)][m]).filter((x) => x != null));
  const baseMonths = MONTHS.map((_, m) => monthAvg(baseYears, m));
  const recentMonths = MONTHS.map((_, m) => monthAvg(recentYears, m));
  const wm = baseMonths.indexOf(Math.max(...baseMonths));
  const changes = MONTHS.map((_, m) => recentMonths[m] - baseMonths[m]);
  const most = changes.indexOf(Math.max(...changes));

  return {
    years, baseline: round2(baseline), anomalies, sd: round2(sd), scale,
    colors: anomalies.map((a) => colorIndex(a, scale)),
    warming, recentFrom: recentYears[0], recentTo: recentYears.at(-1),
    hottest: { year: years[hottest], mean: s.mean[hottest], anomaly: anomalies[hottest] },
    coldest: { year: years[coldest], mean: s.mean[coldest], anomaly: anomalies[coldest] },
    hotDays: { threshold: s.hotThreshold, fifties: hot50s, recent: hotRecent, more: hotRecent - hot50s },
    warmestMonth: { month: wm, name: MONTHS[wm], base: round1(baseMonths[wm]), recent: round1(recentMonths[wm]), change: round1(changes[wm]) },
    mostWarmedMonth: { month: most, name: MONTHS[most], change: round1(changes[most]) },
    trend: movingAverage(s.mean, 10),
  };
}

/** 0–15 palette index; centred on 0, ±2.5 SD spans the full scale. */
export function colorIndex(anomaly, scale) {
  const t = Math.max(-1, Math.min(1, anomaly / (scale || 1)));
  return Math.max(0, Math.min(15, Math.floor(((t + 1) / 2) * 16)));
}

export function movingAverage(values, n) {
  return values.map((_, i) => (i < n - 1 ? null : round2(avg(values.slice(i - n + 1, i + 1)))));
}

/** "Since you were born" — mean of the last 10 years minus the 10 years starting at the birth year (or as close as the data allows). */
export function sinceBirth(s, a, year) {
  if (year < s.from) return { tooEarly: true };
  const end = Math.min(year + RECENT_YEARS - 1, s.to);
  const start = Math.max(s.from, end - RECENT_YEARS + 1);
  const then = avg(s.mean.slice(start - s.from, end - s.from + 1));
  const now = avg(s.mean.slice(-RECENT_YEARS));
  return { year, change: round2(now - then), tooRecent: s.to - year < RECENT_YEARS };
}

/** Captions for the scroll timeline — only facts that are true for this city's data. */
export function captions(s, a) {
  const out = [{ year: s.from, text: `${s.from}: the record begins` }];
  out.push({ year: a.coldest.year, text: `${a.coldest.year}: the coldest year on record here` });
  const firstOne = a.anomalies.findIndex((x) => x >= 1);
  if (firstOne >= 0) out.push({ year: a.years[firstOne], text: `${a.years[firstOne]}: the first year a full 1°C above the 1951–1980 average` });
  else {
    const firstHalf = a.anomalies.findIndex((x) => x >= 0.5);
    if (firstHalf >= 0) out.push({ year: a.years[firstHalf], text: `${a.years[firstHalf]}: the first year 0.5°C above the 1951–1980 average` });
  }
  out.push({ year: a.hottest.year, text: `${a.hottest.year}: the hottest year on record here` });
  out.push({ year: s.to, text: `${s.to}: ${fmtSigned(a.anomalies.at(-1))}°C vs 1951–1980` });
  const seen = new Set();
  return out.filter((c) => !seen.has(c.year) && seen.add(c.year)).sort((x, y) => x.year - y.year);
}

/** One signed byte per year (anomaly in 0.1 °C, clamped ±12.7) — stored on-chain so the Wall can draw stripes without the API. */
export function stripesBytes(a) {
  return '0x' + a.anomalies.map((x) => (Math.max(-127, Math.min(127, Math.round(x * 10))) & 0xff).toString(16).padStart(2, '0')).join('');
}
export function stripesFromBytes(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  const out = [];
  for (let i = 0; i < h.length; i += 2) { const b = parseInt(h.slice(i, i + 2), 16); out.push((b > 127 ? b - 256 : b) / 10); }
  return out;
}
/** Colour indices for a plain list of anomalies (used for on-chain stripes). */
export function colorsFor(anomalies) {
  const m = avg(anomalies);
  const sd = Math.sqrt(avg(anomalies.map((x) => (x - m) ** 2))) || 0.5;
  return anomalies.map((x) => colorIndex(x, 2.5 * sd));
}

export const fmtSigned = (x, d = 1) => {
  const r = Math.round(x * 10 ** d) / 10 ** d; // −0.04 → +0.0, not −0.0
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}`;
};
export const slugify = (name, cc) =>
  `${String(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}${cc ? '-' + cc.toLowerCase() : ''}`;
