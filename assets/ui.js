// Small UI helpers shared by the website and the app.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const mobile = () => matchMedia('(max-width: 760px)').matches;
export const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The logo: a small square of five stripes. */
export const LOGO = `<svg class="logo-mark" viewBox="0 0 20 20" aria-hidden="true"><rect width="4" height="20" fill="#2171B5"/><rect x="4" width="4" height="20" fill="#6BAED6"/><rect x="8" width="4" height="20" fill="#FCBBA1"/><rect x="12" width="4" height="20" fill="#FB6A4A"/><rect x="16" width="4" height="20" fill="#CB181D"/></svg>`;

export function toast(msg, kind = '', ms = 4200) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  if (msg instanceof Node) t.append(msg); else t.innerHTML = msg;
  box.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms);
}

export async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`✓ ${label}`); } catch { toast('Couldn’t copy — select it and copy by hand.', 'bad'); }
}

const scripts = new Map();
/** Load a CDN script once (Chart.js, jsPDF are only loaded when needed). */
export function loadScript(src, test) {
  if (test?.()) return Promise.resolve();
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => { scripts.delete(src); reject(new Error(`Could not load ${src}`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}

/** Count a number up (GSAP), or set it at once with reduced motion. */
export function countUp(el, to, { decimals = 0, prefix = '', suffix = '', duration = 1.4, signed = false } = {}) {
  const paint = (v) => {
    const sign = signed ? (v >= 0 ? '+' : '−') : v < 0 ? '−' : '';
    el.textContent = `${prefix}${sign}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  };
  if (reduced() || !window.gsap) return paint(to);
  const o = { v: 0 };
  gsap.to(o, { v: to, duration, ease: 'power2.out', onUpdate: () => paint(o.v) });
}

export function plural(n, one, many = one + 's') { return `${fmt(n)} ${n === 1 ? one : many}`; }
