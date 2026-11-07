// Original illustrations: a city skyline whose buildings are filled with that city's warming stripes.
// The picture is the data — 1940 on the left, the last full year on the right. Procedural (seeded by the
// city name) so every city on Earth gets its own skyline; famous cities get a landmark.
import { PALETTE } from './climate.js';

let uid = 0;

function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Landmarks drawn around x = 0 with the base at y = 0 (up is negative), about 300 units tall.
const LANDMARKS = {
  spire: 'M-34 0V-60H-25V-110H-16V-160H-7L0-240L7-160H16V-110H25V-60H34V0Z M-70 0V-70L-55-100L-40-70V0Z M40 0V-70L55-100L70-70V0Z',
  clock: 'M-16 0V-175H-21V-195L0-250L21-195V-175H16V0Z M60 0V-6H64A72 72 0 1 1 156 -6H160V0Z M110-8A58 58 0 1 0 110-124A58 58 0 1 0 110-8Z',
  eiffel: 'M-48 0Q-22-70-11-160L-4-270L0-300L4-270L11-160Q22-70 48 0H28Q12-44 0-48Q-12-44-28 0Z',
  stepped: 'M-32 0V-150H-23V-195H-14V-235H-6V-265H-2V-310H2V-265H6V-235H14V-195H23V-150H32V0Z',
  tokyo: 'M-40 0L-12-150H-16V-160H16V-150H12L40 0H24L0-40L-24 0Z M-12-160L-5-230H-8V-238H8V-230H5L12-160Z M-1-238V-290H1V-238Z',
  sails: 'M-90 0Q-78-80-30-100Q-52-46-44 0Z M-44 0Q-26-96 22-118Q-2-50 6 0Z M6 0Q30-72 70-82Q50-36 56 0Z M56 0Q72-40 98-46Q86-20 90 0Z',
  pyramids: 'M-110 0L-30-95L50 0Z M20 0L80-70L140 0Z M-150 0L-110-45L-70 0Z',
  dome: 'M-48 0V-60Q-46-128 0-142Q46-128 48-60V0Z M-2-140L0-172L2-140Z M-76 0V-135L-72-142L-68-135V0Z M68 0V-135L72-142L76-135V0Z',
  cathedral: 'M-40 0V-120H-30V-170L-24-190L-18-170V-120H18V-170L24-190L30-170V-120H40V0Z M-6-120V-150L0-162L6-150V-120Z',
  arch: 'M-60 0V-150H60V0H30V-70Q30-110 0-110Q-30-110-30-70V0Z M-66-150V-166H66V-150Z',
};
const LANDMARK_FOR = {
  bangkok: 'spire', london: 'clock', paris: 'eiffel', 'new-york': 'stepped', tokyo: 'tokyo', sydney: 'sails',
  cairo: 'pyramids', mumbai: 'dome', 'mexico-city': 'cathedral', 'sao-paulo': 'cathedral', berlin: 'arch', madrid: 'arch',
};
export const landmarkFor = (slug = '') => Object.entries(LANDMARK_FOR).find(([k]) => slug === k || slug.startsWith(k + '-'))?.[1] || null;

/**
 * skyline(colors, { seed, slug, width, height, water, sun, dark }) → SVG string.
 * colors: palette indices, one per year.
 */
export function skyline(colors, { seed = 'city', slug = '', width = 1200, height = 420, water = false, sun = true, sunX = 0.82, dark = false, label = '' } = {}) {
  const id = `sk${++uid}`;
  const r = rng(seed);
  const W = width, ground = height - 6, H = water ? Math.round(height * 1.32) : height;
  const scale = height / 420;
  const lm = landmarkFor(slug);
  const lmX = W * (0.3 + r() * 0.4);
  const lmW = (lm === 'clock' ? 200 : lm === 'pyramids' ? 270 : lm === 'sails' ? 200 : 110) * scale;

  // Buildings
  const parts = [];
  let x = -10 * scale;
  while (x < W) {
    const w = (26 + r() * 64) * scale;
    const near = Math.abs(x + w / 2 - lmX) < lmW * 0.75 + w / 2;
    const center = 1 - Math.abs((x + w / 2) / W - 0.5) * 0.9;
    let h = (90 + r() * 215 * center) * scale;
    if (near && lm) h *= 0.45;
    if (r() < 0.09 && !near) { x += w * 0.4; continue; } // a gap, like a park
    const top = ground - h;
    const roof = r();
    if (roof < 0.16) parts.push(`M${x} ${ground}V${top}L${x + w / 2} ${top - w * 0.35}L${x + w} ${top}V${ground}Z`);
    else if (roof < 0.32) parts.push(`M${x} ${ground}V${top}H${x + w * 0.25}V${top - 18 * scale}H${x + w * 0.75}V${top}H${x + w}V${ground}Z`);
    else if (roof < 0.44) parts.push(`M${x} ${ground}V${top + 14 * scale}L${x + w} ${top}V${ground}Z`);
    else {
      parts.push(`M${x} ${ground}V${top}H${x + w}V${ground}Z`);
      if (roof > 0.82) parts.push(`M${x + w / 2 - 1.5 * scale} ${top}V${top - 34 * scale}H${x + w / 2 + 1.5 * scale}V${top}Z`);
    }
    x += w + (r() < 0.25 ? 3 * scale : 0);
  }
  const shapes = parts.join(' ');
  const lmPath = lm ? `<path transform="translate(${lmX} ${ground}) scale(${scale * 1.12})" d="${LANDMARKS[lm]}" fill-rule="evenodd"/>` : '';

  // Stripes: one per year, full width, clipped to the buildings
  const n = colors.length;
  const stripes = colors.map((c, i) => `<rect x="${((i / n) * W).toFixed(2)}" y="0" width="${(W / n + 0.6).toFixed(2)}" height="${ground}" fill="${PALETTE[c]}"/>`).join('');
  const skyTop = dark ? '#0F1A2B' : '#FFF4EA', skyBot = dark ? '#1B2A44' : '#FAFAF7';

  const city = `<g clip-path="url(#${id}c)"><g class="sk-stripes">${stripes}</g><rect width="${W}" height="${ground}" fill="url(#${id}w)"/></g>`;
  return `<svg class="skyline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" role="img" aria-label="${label || 'City skyline filled with warming stripes'}">
  <defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBot}"/></linearGradient>
    <clipPath id="${id}c"><path d="${shapes}"/>${lmPath}</clipPath>
    <pattern id="${id}w" width="${14 * scale}" height="${18 * scale}" patternUnits="userSpaceOnUse"><rect x="${4 * scale}" y="${5 * scale}" width="${4 * scale}" height="${6 * scale}" fill="#fff" opacity=".22"/></pattern>
    ${water ? `<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyBot}" stop-opacity=".35"/><stop offset="1" stop-color="${skyBot}"/></linearGradient>` : ''}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}s)"/>
  ${sun ? `<g class="sk-sun"><circle cx="${W * sunX}" cy="${height * 0.26}" r="${70 * scale}" fill="#E4572E" opacity=".12"/><circle cx="${W * sunX}" cy="${height * 0.26}" r="${38 * scale}" fill="#E4572E" opacity=".28"/></g>` : ''}
  <g class="sk-city">${city}</g>
  <rect y="${ground}" width="${W}" height="2" fill="${dark ? '#F6F1E9' : '#0F1A2B'}" opacity=".25"/>
  ${water ? `<g transform="translate(0 ${ground * 2 + 2}) scale(1 -1)" opacity=".55">${city}</g><rect y="${ground + 2}" width="${W}" height="${H - ground}" fill="url(#${id}f)"/>` : ''}
</svg>`;
}

/** Small illustrated icons for the audience cards (stripes accents). */
const S = ['#2171B5', '#6BAED6', '#FCBBA1', '#FB6A4A', '#CB181D'];
const band = (x, y, w, h) => S.map((c, i) => `<rect x="${x + (i * w) / 5}" y="${y}" width="${w / 5 + 0.3}" height="${h}" fill="${c}"/>`).join('');
export const ICONS = {
  students: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="16" width="36" height="40" rx="8" fill="#0F1A2B"/><path d="M24 16v-4a8 8 0 0 1 16 0v4" fill="none" stroke="#0F1A2B" stroke-width="4"/>${band(20, 26, 24, 12)}<rect x="22" y="44" width="20" height="6" rx="2" fill="#F6F1E9"/></svg>`,
  teachers: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="10" width="52" height="34" rx="4" fill="#0F1A2B"/>${band(12, 16, 40, 16)}<path d="M14 38h22" stroke="#F6F1E9" stroke-width="3" stroke-linecap="round"/><path d="M24 44l-6 12M40 44l6 12" stroke="#0F1A2B" stroke-width="4" stroke-linecap="round"/></svg>`,
  creators: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="18" width="52" height="36" rx="6" fill="#0F1A2B"/><rect x="22" y="12" width="20" height="10" rx="3" fill="#0F1A2B"/><circle cx="32" cy="36" r="13" fill="#F6F1E9"/><clipPath id="icC"><circle cx="32" cy="36" r="10"/></clipPath><g clip-path="url(#icC)">${band(22, 26, 20, 20)}</g><circle cx="49" cy="25" r="2.5" fill="#E4572E"/></svg>`,
  groups: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="20" cy="22" r="7" fill="#0F1A2B"/><circle cx="44" cy="22" r="7" fill="#0F1A2B"/><circle cx="32" cy="18" r="8" fill="#2E9E6A"/><path d="M8 48a12 12 0 0 1 24 0zM32 48a12 12 0 0 1 24 0z" fill="#0F1A2B"/><path d="M18 50a14 14 0 0 1 28 0z" fill="#2E9E6A"/>${band(10, 52, 44, 6)}</svg>`,
};
