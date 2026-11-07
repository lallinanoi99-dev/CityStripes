// Drawing stripes: interactive bands (DOM, one element per year) and light mini bands (CSS gradient).
import { PALETTE, fmtSigned } from './climate.js';
import { reduced } from './ui.js';

/** A CSS hard-stop gradient for a list of palette indices — cheap mini bands for cards, marquees and the Wall. */
export function gradient(colors, dir = 'to right') {
  const n = colors.length;
  const stops = colors.map((c, i) => `${PALETTE[c]} ${((i / n) * 100).toFixed(3)}% ${(((i + 1) / n) * 100).toFixed(3)}%`);
  return `linear-gradient(${dir}, ${stops.join(',')})`;
}
export const miniBand = (colors, cls = '') => `<span class="mini-band ${cls}" style="background:${gradient(colors)}" aria-hidden="true"></span>`;

/**
 * Interactive band. opts: { years, colors, anomalies?, means?, vertical?, label?, birthYear?, tooltip? }
 * Returns { el, setBirthYear(y), reveal(counterEl, duration) }.
 */
export function band(opts) {
  const { years, colors, anomalies = [], means = [], vertical = false, label = 'Warming stripes', tooltip = true } = opts;
  const el = document.createElement('div');
  el.className = `band${vertical ? ' is-vertical' : ''}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${label}: one stripe per year, ${years[0]}–${years.at(-1)}. Blue is cooler, red is warmer than the 1951–1980 average.`);
  el.innerHTML = years.map((y, i) => `<span class="st" data-i="${i}" style="background:${PALETTE[colors[i]]}">${vertical && y % 10 === 0 ? `<b>${y}</b>` : ''}</span>`).join('');
  const tick = document.createElement('span');
  tick.className = 'birth-tick';
  tick.hidden = true;
  el.append(tick);

  if (tooltip) {
    const tip = document.createElement('span');
    tip.className = 'band-tip';
    tip.hidden = true;
    el.append(tip);
    let last = -1;
    const show = (st) => {
      const i = Number(st.dataset.i);
      if (i === last) return;
      if (last >= 0) el.children[last]?.classList.remove('is-hot');
      last = i;
      st.classList.add('is-hot');
      const parts = [years[i]];
      if (means[i] != null) parts.push(`${means[i].toFixed(1)}°C`);
      if (anomalies[i] != null) parts.push(`${fmtSigned(anomalies[i])}°C vs 1951–1980`);
      tip.textContent = parts.join(' · ');
      tip.hidden = false;
      const r = el.getBoundingClientRect(), s = st.getBoundingClientRect();
      if (vertical) { tip.style.left = '50%'; tip.style.top = `${s.top - r.top + s.height / 2}px`; }
      else { tip.style.top = ''; tip.style.left = `${Math.max(90, Math.min(r.width - 90, s.left - r.left + s.width / 2))}px`; }
    };
    const hide = () => { tip.hidden = true; if (last >= 0) el.children[last]?.classList.remove('is-hot'); last = -1; };
    el.addEventListener('pointermove', (e) => { const st = e.target.closest('.st'); if (st) show(st); });
    el.addEventListener('pointerleave', hide);
  }

  function setBirthYear(y) {
    const i = years.indexOf(y);
    tick.hidden = i < 0;
    if (i < 0) return;
    const pos = `${((i + 0.5) / years.length) * 100}%`;
    tick.style.left = vertical ? '' : pos;
    tick.style.top = vertical ? pos : '';
    tick.dataset.year = y;
  }

  /** Stripes appear one year at a time, left to right, with the year counter running. */
  function reveal(counterEl, duration = 2.2) {
    const stripes = [...el.querySelectorAll('.st')];
    if (reduced() || !window.gsap) { if (counterEl) counterEl.textContent = years.at(-1); return Promise.resolve(); }
    const prop = vertical ? { scaleX: 0, transformOrigin: 'left center' } : { scaleY: 0, transformOrigin: 'center bottom' };
    gsap.set(stripes, { ...prop, autoAlpha: 0 });
    const tl = gsap.timeline();
    tl.to(stripes, { scaleY: 1, scaleX: 1, autoAlpha: 1, duration: 0.35, ease: 'power2.out', stagger: { each: duration / stripes.length } });
    if (counterEl) {
      const o = { i: 0 };
      tl.to(o, { i: years.length - 1, duration: duration, ease: 'none', onUpdate: () => (counterEl.textContent = years[Math.round(o.i)]) }, 0);
    }
    return tl.then();
  }

  return { el, setBirthYear, reveal };
}
