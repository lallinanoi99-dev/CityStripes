// My City Stripes Worker — GET /stripes?lat=&lon=
// Fetches the Open-Meteo / ERA5 archive (1940 → last full year) for the rounded point, turns ~700 KB of daily
// values into a ~6 KB yearly summary, and caches it for 30 days. No AI, no keys, no personal data.
// Vars: ALLOWED_ORIGINS (comma list). KV binding: RATE (optional, per-IP daily limit on uncached fetches).
// To merge into the shared Week 1 Worker: copy handleStripes() + the helpers below, and ../../assets/climate.js.
import { archiveUrl, summarize, lastFullYear, roundCoord } from '../../assets/climate.js';

const CACHE_SECONDS = 30 * 24 * 3600;
const UNCACHED_PER_IP_PER_DAY = 40;

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function underLimit(env, req) {
  if (!env.RATE) return true;
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `stripes:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const n = parseInt((await env.RATE.get(key)) || '0', 10);
  if (n >= UNCACHED_PER_IP_PER_DAY) return false;
  await env.RATE.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

export async function handleStripes(req, env, ctx) {
  const cors = corsHeaders(req, env);
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'bad_coordinates' }, 400, cors);

  const to = lastFullYear();
  const rlat = roundCoord(lat).toFixed(2), rlon = roundCoord(lon).toFixed(2);
  const cacheKey = new Request(`https://stripes.cache/v1/${rlat}/${rlon}/${to}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return json(await hit.json(), 200, { ...cors, 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'HIT' });

  if (!(await underLimit(env, req))) return json({ error: 'rate_limited' }, 429, cors);
  const res = await fetch(archiveUrl(rlat, rlon, to), { cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } });
  if (res.status === 429) return json({ error: 'busy' }, 503, { ...cors, 'Retry-After': '60' });
  if (!res.ok) return json({ error: 'upstream', status: res.status }, 502, cors);

  let summary;
  try { summary = summarize(await res.json(), to); } catch (e) { return json({ error: e.message || 'no_data' }, 422, cors); }
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(summary), { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })));
  return json(summary, 200, { ...cors, 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'MISS' });
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && pathname === '/stripes') return handleStripes(req, env, ctx);
    return json({ error: 'not_found' }, 404, corsHeaders(req, env));
  },
};
