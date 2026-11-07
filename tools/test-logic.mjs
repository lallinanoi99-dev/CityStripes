// Checks the pure climate logic in assets/climate.js with synthetic data and the real featured cities.
// Usage (from the project root): node tools/test-logic.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { summarize, analyze, fingerprint, fingerprintText, stripesBytes, stripesFromBytes, colorIndex, fmtSigned, sinceBirth, captions, slugify } from '../assets/climate.js';

let checks = 0;
const ok = (label) => { checks++; console.log(`  ✓ ${label}`); };
console.log('Climate logic');

// Synthetic city: 20°C until 1980, then +0.05°C a year; max = mean + 8; leap years included.
const time = [], mean = [], max = [];
for (let d = new Date(Date.UTC(1940, 0, 1)); d.getUTCFullYear() <= 2025; d.setUTCDate(d.getUTCDate() + 1)) {
  const y = d.getUTCFullYear();
  const t = 20 + (y > 1980 ? (y - 1980) * 0.05 : 0);
  time.push(d.toISOString().slice(0, 10)); mean.push(t); max.push(t + 8);
}
const s = summarize({ latitude: 13.754, longitude: 100.5014, elevation: 4, daily: { time, temperature_2m_mean: mean, temperature_2m_max: max } }, 2025);
assert.equal(s.from, 1940); assert.equal(s.to, 2025); assert.equal(s.mean.length, 86);
assert.equal(s.lat, 13.75); assert.equal(s.lon, 100.5);
assert.equal(s.hotThreshold, 28); // p95 of 1951–1980 maxes (28) is below 35
ok('summarize: yearly means, 0.01° rounding, hot threshold = min(35 °C, 1951–1980 p95)');

const a = analyze(s);
assert.equal(a.baseline, 20);
assert.equal(a.warming, Math.round((avgYears(2016, 2025) - 20) * 100) / 100);
assert.equal(a.hottest.year, 2025); assert.equal(a.recentFrom, 2016);
assert.equal(a.hotDays.fifties, 0); assert.ok(a.hotDays.recent > 300);
assert.ok(a.colors.every((c) => c >= 0 && c <= 15)); assert.equal(a.colors.at(-1), 15);
ok(`analyze: baseline, warming (+${a.warming}°C), hottest year, hot days, colours in 0–15`);
function avgYears(f, t) { let n = 0, x = 0; for (let y = f; y <= t; y++) { x += 20 + (y - 1980) * 0.05; n++; } return x / n; }

assert.equal(colorIndex(0, 1), 8); assert.equal(colorIndex(-0.01, 1), 7); assert.equal(colorIndex(9, 1), 15); assert.equal(colorIndex(-9, 1), 0);
ok('colour scale is centred on 0 and clamps at ±2.5 SD');

const h = await fingerprint(s);
assert.equal(h, '0x' + createHash('sha256').update(fingerprintText(s)).digest('hex'));
assert.ok(fingerprintText(s).startsWith('1940:20.00,20.00'));
ok('fingerprint = SHA-256 of "1940:20.00,20.00,…" (reproducible anywhere)');

const bytes = stripesBytes(a);
assert.equal((bytes.length - 2) / 2, 86);
assert.deepEqual(stripesFromBytes(bytes), a.anomalies.map((x) => Math.max(-12.7, Math.min(12.7, Math.round(x * 10) / 10))));
assert.deepEqual(stripesFromBytes('0xff80'), [-0.1, -12.8]);
ok('on-chain stripes: one signed byte per year, round-trips');

assert.equal(fmtSigned(-0.04), '+0.0'); assert.equal(fmtSigned(1.25), '+1.3'); assert.equal(fmtSigned(-1.2), '−1.2');
assert.equal(slugify('São Paulo', 'BR'), 'sao-paulo-br');
assert.ok(sinceBirth(s, a, 1930).tooEarly);
assert.ok(sinceBirth(s, a, 1990).change > 0);
assert.ok(captions(s, a).every((c, i, l) => i === 0 || c.year > l[i - 1].year));
ok('formatting, slugs, birth-year and caption helpers');

const featured = JSON.parse(readFileSync(new URL('../assets/featured.json', import.meta.url), 'utf8'));
for (const c of featured.cities) {
  const x = analyze(c.summary);
  assert.equal(c.summary.mean.length, c.summary.to - c.summary.from + 1, c.name);
  assert.ok(x.warming > -1 && x.warming < 4, c.name);
}
ok(`featured.json: ${featured.cities.length} real cities, complete series, plausible warming`);

console.log(`\n${checks} checks passed`);
