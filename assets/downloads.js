// Downloads, drawn on canvas at exact sizes: poster (A4/A3, PNG/PDF), phone wallpaper, social card, knit-scarf pattern (PDF).
import { PALETTE, YARN, fmtSigned } from './climate.js';
import { placeSlug } from './data.js';
import { loadScript, toast } from './ui.js';

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const INK = '#0F1A2B', MUTED = '#5E6A7D', PAPER = '#FAFAF7', RED = '#CB181D';
const CREDIT = 'DATA: OPEN-METEO / ERA5 (COPERNICUS) · STRIPES IDEA: ED HAWKINS, #SHOWYOURSTRIPES (CC BY 4.0)';
const DISPLAY = '"Inter Tight", Inter, system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

async function fontsReady() {
  try { await Promise.all(['600 40px "Inter Tight"', '500 20px "IBM Plex Mono"', '400 20px Inter'].map((f) => document.fonts.load(f))); } catch { /* fall back to system fonts */ }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  return [c, ctx];
}

function stripes(ctx, x, y, w, h, colors) {
  const n = colors.length;
  colors.forEach((ci, i) => {
    const x0 = Math.round(x + (i / n) * w), x1 = Math.round(x + ((i + 1) / n) * w);
    ctx.fillStyle = PALETTE[ci];
    ctx.fillRect(x0, y, x1 - x0, h);
  });
}

/** Largest font size (≤ max) at which text fits in width. */
function fit(ctx, text, weight, family, max, width) {
  let size = max;
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 2; } while (ctx.measureText(text).width > width && size > 12);
  return size + 2;
}

function text(ctx, str, x, y, { size, weight = 400, family = DISPLAY, color = INK, align = 'left', spacing = 0 }) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const savePng = (c, name) => new Promise((resolve) => c.toBlob((b) => { save(b, name); resolve(); }, 'image/png'));

// ---------------------------------------------------------------- poster
function poster(d, size) {
  const [W, H] = size === 'A3' ? [1754, 2480] : [1240, 1754]; // 150 dpi
  const [c, ctx] = canvas(W, H);
  const { place, summary: s, an: a } = d;
  const m = Math.round(W * 0.075);
  const bandH = Math.round(H * 0.6);
  stripes(ctx, 0, 0, W, bandH, a.colors);
  let y = bandH + m * 1.1;
  text(ctx, `MY CITY STRIPES · ${s.from}–${s.to}`, m, y, { size: W * 0.016, weight: 500, family: MONO, color: MUTED, spacing: W * 0.003 });
  const nameSize = fit(ctx, place.name, 600, DISPLAY, W * 0.12, W - 2 * m);
  y += nameSize * 1.05;
  text(ctx, place.name, m, y, { size: nameSize, weight: 600 });
  y += W * 0.045;
  text(ctx, place.country || '', m, y, { size: W * 0.026, color: MUTED, family: 'Inter, system-ui' });
  y += W * 0.11;
  text(ctx, `${fmtSigned(a.warming)}°C`, m, y, { size: W * 0.085, weight: 600, color: a.warming >= 0 ? RED : '#2171B5' });
  ctx.font = `600 ${W * 0.085}px ${DISPLAY}`;
  const wx = m + ctx.measureText(`${fmtSigned(a.warming)}°C`).width + W * 0.03;
  text(ctx, `warmer in ${a.recentFrom}–${a.recentTo}`, wx, y - W * 0.035, { size: W * 0.022, color: MUTED, family: 'Inter, system-ui' });
  text(ctx, 'than in 1951–1980', wx, y - W * 0.005, { size: W * 0.022, color: MUTED, family: 'Inter, system-ui' });
  y += W * 0.06;
  text(ctx, `Hottest year ${a.hottest.year} · ${a.hotDays.fifties} → ${a.hotDays.recent} hot days a year (>${s.hotThreshold}°C)`, m, y, { size: W * 0.02, family: 'Inter, system-ui', color: INK });
  text(ctx, CREDIT, m, H - m * 0.7, { size: W * 0.0115, weight: 500, family: MONO, color: MUTED, spacing: W * 0.0008 });
  text(ctx, `ERA5 grid point ${s.lat.toFixed(2)}, ${s.lon.toFixed(2)} · one stripe per year · blue cooler, red warmer than 1951–1980`, m, H - m * 0.7 - W * 0.022, { size: W * 0.0115, weight: 500, family: MONO, color: MUTED });
  return c;
}

// ---------------------------------------------------------------- phone wallpaper (1170 × 2532)
function wallpaper(d) {
  const W = 1170, H = 2532;
  const [c, ctx] = canvas(W, H);
  const { place, summary: s, an: a } = d;
  stripes(ctx, 0, 0, W, H, a.colors);
  const g = ctx.createLinearGradient(0, H * 0.7, 0, H);
  g.addColorStop(0, 'rgba(15,26,43,0)'); g.addColorStop(1, 'rgba(15,26,43,.75)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.7, W, H * 0.3);
  const size = fit(ctx, place.name, 600, DISPLAY, 96, W - 160);
  text(ctx, place.name, W / 2, H - 330, { size, weight: 600, color: '#fff', align: 'center' });
  text(ctx, `${s.from}–${s.to} · ${fmtSigned(a.warming)}°C vs 1951–1980`, W / 2, H - 260, { size: 34, weight: 500, family: MONO, color: 'rgba(255,255,255,.9)', align: 'center' });
  text(ctx, 'MY CITY STRIPES · DATA: OPEN-METEO / ERA5 · ED HAWKINS CC BY 4.0', W / 2, H - 200, { size: 20, weight: 500, family: MONO, color: 'rgba(255,255,255,.7)', align: 'center' });
  return c;
}

// ---------------------------------------------------------------- social card (1080 × 1080)
function social(d) {
  const W = 1080, H = 1080;
  const [c, ctx] = canvas(W, H);
  const { place, summary: s, an: a } = d;
  stripes(ctx, 0, 0, W, 660, a.colors);
  const m = 64;
  text(ctx, `${s.from} → ${s.to}`, m, 730, { size: 24, weight: 500, family: MONO, color: MUTED, spacing: 3 });
  const size = fit(ctx, place.name, 600, DISPLAY, 92, W - 2 * m - 300);
  text(ctx, place.name, m, 730 + size * 1.05, { size, weight: 600 });
  text(ctx, `${fmtSigned(a.warming)}°C`, W - m, 730 + size * 1.05, { size: 92, weight: 600, color: a.warming >= 0 ? RED : '#2171B5', align: 'right' });
  text(ctx, `warmer in ${a.recentFrom}–${a.recentTo} than in 1951–1980 · hottest year ${a.hottest.year}`, m, 900, { size: 28, family: 'Inter, system-ui', color: MUTED });
  ctx.fillStyle = '#E6E8EC'; ctx.fillRect(m, 950, W - 2 * m, 2);
  text(ctx, 'MY CITY STRIPES', m, 1010, { size: 22, weight: 600, family: MONO, spacing: 3 });
  text(ctx, 'DATA: OPEN-METEO / ERA5 · ED HAWKINS CC BY 4.0', W - m, 1010, { size: 18, weight: 500, family: MONO, color: MUTED, align: 'right' });
  return c;
}

// ---------------------------------------------------------------- knit-scarf pattern (PDF)
// jsPDF's built-in Helvetica has no U+2212 minus sign, so PDFs use a plain hyphen.
const pdfSigned = (x) => fmtSigned(x).replace('\u2212', '-');
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function scarf(d) {
  await loadScript(JSPDF, () => window.jspdf);
  const { jsPDF } = window.jspdf;
  const { place, summary: s, an: a } = d;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, ROWS = 2;
  const used = [...new Set(a.colors)].sort((x, y) => x - y);
  const swatch = (x, y, w, h, ci) => { doc.setFillColor(...hexRgb(PALETTE[ci])); doc.rect(x, y, w, h, 'F'); };

  // header band + title
  a.colors.forEach((ci, i) => swatch(M + (i / a.colors.length) * (W - 2 * M), M, (W - 2 * M) / a.colors.length + 0.05, 14, ci));
  doc.setTextColor(15, 26, 43);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(`Knit-scarf pattern · ${place.name}`, M, M + 26);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(94, 106, 125);
  doc.text(`${s.from}–${s.to} · one stripe per year · ${pdfSigned(a.warming)}°C warmer in ${a.recentFrom}–${a.recentTo} than in 1951–1980`, M, M + 33);
  doc.setTextColor(15, 26, 43); doc.setFontSize(10.5);
  const how = [
    `Cast on 40 stitches with DK yarn on 4 mm needles. Knit ${ROWS} rows (stockinette or garter) for every year,`,
    `starting with ${s.from} at the bottom — ${a.colors.length * ROWS} rows in all. Change colour only when the colour changes;`,
    'carry unused yarn up the side for short gaps. Add a fringe in the first and last colours if you like.',
  ];
  how.forEach((l, i) => doc.text(l, M, M + 43 + i * 5.5));

  // yarn list
  let y = M + 66;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Yarn colours', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  y += 6;
  used.forEach((ci, k) => {
    const col = k % 2, row = Math.floor(k / 2);
    const x = M + col * 90, yy = y + row * 8;
    swatch(x, yy - 4, 10, 6, ci);
    const n = a.colors.filter((c) => c === ci).length;
    doc.text(`${YARN[ci]}  ${PALETTE[ci]}  · ${n} ${n === 1 ? 'year' : 'years'} (${n * ROWS} rows)`, x + 13, yy + 0.5);
  });
  y += Math.ceil(used.length / 2) * 8 + 8;

  // row table
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Row by row', M, y);
  y += 7;
  doc.setFontSize(9.5);
  const colW = (W - 2 * M) / 2;
  const line = 6.2;
  let col = 0, top = y;
  a.years.forEach((yr, i) => {
    if (y > 285) {
      if (col === 0) { col = 1; y = top; } else { doc.addPage(); col = 0; top = y = M + 4; }
    }
    const x = M + col * colW;
    const r0 = i * ROWS + 1;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(94, 106, 125);
    doc.text(`Rows ${r0}–${r0 + ROWS - 1}`, x, y);
    doc.setTextColor(15, 26, 43); doc.setFont('helvetica', 'bold');
    doc.text(String(yr), x + 24, y);
    swatch(x + 36, y - 3.6, 8, 4.6, a.colors[i]);
    doc.setFont('helvetica', 'normal');
    doc.text(`${YARN[a.colors[i]]}  (${pdfSigned(a.anomalies[i])}°C)`, x + 47, y);
    y += line;
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(94, 106, 125);
    doc.text('My City Stripes · Data: Open-Meteo / ERA5 (Copernicus) · Stripes idea: Ed Hawkins, #ShowYourStripes (CC BY 4.0)', M, 292);
  }
  return doc;
}

// ---------------------------------------------------------------- entry
export async function download(kind, d) {
  await fontsReady();
  const slug = placeSlug(d.place);
  if (kind === 'poster') {
    const c = poster(d, d.size);
    if (d.format === 'PDF') {
      await loadScript(JSPDF, () => window.jspdf);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: d.size.toLowerCase() });
      const [w, h] = d.size === 'A3' ? [297, 420] : [210, 297];
      doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, w, h);
      doc.save(`my-city-stripes-${slug}-poster-${d.size.toLowerCase()}.pdf`);
    } else await savePng(c, `my-city-stripes-${slug}-poster-${d.size.toLowerCase()}.png`);
  } else if (kind === 'wallpaper') await savePng(wallpaper(d), `my-city-stripes-${slug}-wallpaper.png`);
  else if (kind === 'social') await savePng(social(d), `my-city-stripes-${slug}-social.png`);
  else if (kind === 'scarf') (await scarf(d)).save(`my-city-stripes-${slug}-scarf-pattern.pdf`);
  toast('✓ Downloaded');
}

/** For previews/tests: the canvases without saving. */
export const render = { poster, wallpaper, social, scarf };
