// /app/wall — every stamped city as a mini stripe band (drawn from the on-chain stripes) + each city's pledge board.
import { allCities, pledgesForCity, short, MODE } from './chain.js';
import { colorsFor, stripesFromBytes, fmtSigned } from './climate.js';
import { placeSlug, PLEDGES } from './data.js';
import { skyline } from './art.js';
import { slugify } from './climate.js';
import { $, $$, esc, reduced, plural } from './ui.js';

const SORTS = {
  warming: (a, b) => b.warmingE2 - a.warmingE2,
  newest: (a, b) => b.at - a.at,
  pledges: (a, b) => b.pledges - a.pledges || b.stamps - a.stamps,
};

export async function renderWall(view) {
  let sort = 'warming';
  let cities = [];
  view.innerHTML = `
  <section class="app">
    <div class="wrap">
      <div class="app-top">
        <div><p class="eyebrow">The Stripes Wall${MODE === 'preview' ? ' · preview' : ''}</p><h1 class="h2" style="margin:0">Every city stamped on BOT Chain.</h1></div>
        <nav class="tabs" aria-label="App"><a href="app" data-link>My city</a><a href="app/wall" data-link aria-current="page">The Wall</a></nav>
      </div>
      <div class="panel-head" style="margin-bottom:20px">
        <p class="muted" id="wallCount" style="margin:0"></p>
        <div class="tabs" role="group" aria-label="Sort">${[['warming', 'Most warming'], ['newest', 'Newest'], ['pledges', 'Most pledges']].map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${k === sort}">${l}</button>`).join('')}</div>
      </div>
      <div id="wallGrid" class="wall-grid">${'<div class="skeleton" style="height:190px"></div>'.repeat(6)}</div>
    </div>
  </section>`;

  const grid = $('#wallGrid', view);
  const paint = () => {
    if (!cities.length) {
      grid.outerHTML = `<div class="empty-state" id="wallGrid"><h2 class="h3">No cities on the Wall yet.</h2><p>Search your city, see its stripes and be the first to stamp it on BOT Chain.</p><a class="btn" href="app" data-link>See my city</a></div>`;
      return;
    }
    $('#wallCount', view).textContent = `${plural(cities.length, 'city', 'cities')} · ${plural(cities.reduce((n, c) => n + c.pledges, 0), 'pledge')}`;
    grid.innerHTML = [...cities].sort(SORTS[sort]).map((c) => {
      const link = `app?city=${encodeURIComponent(placeSlug({ name: c.city, cc: '' }))}&ll=${c.latE2 / 100},${c.lonE2 / 100}`;
      return `<article class="card wall-card">
        <div class="wall-art">${skyline(colorsFor(stripesFromBytes(c.stripes)), { seed: c.city + c.latE2, slug: slugify(c.city), width: 600, height: 230, sun: false, label: `${esc(c.city)} skyline painted with its warming stripes` })}</div>
        <div class="wall-body">
          <div class="wall-title"><b>${esc(c.city)}</b><span>${fmtSigned(c.warmingE2 / 100)}°C</span></div>
          <div class="wall-meta">${esc(c.country)} · ${c.fromYear}–${c.toYear} · ${plural(c.stamps, 'stamp')} · ${plural(c.pledges, 'pledge')}</div>
          <div class="wall-actions"><a class="arrow-link" href="${link}" data-link>See the stripes →</a>${c.pledges ? `<button class="linkish" type="button" data-board="${c.key}" aria-expanded="false">Pledge board</button>` : ''}</div>
          <div class="board" data-board-for="${c.key}" hidden></div>
        </div>
      </article>`;
    }).join('');
    if (window.gsap && !reduced()) gsap.from('.wall-card', { y: 16, autoAlpha: 0, duration: 0.45, stagger: 0.04, ease: 'power2.out' });
    $$('[data-board]', grid).forEach((b) => b.addEventListener('click', () => toggleBoard(b)));
  };

  async function toggleBoard(btn) {
    const box = $(`[data-board-for="${btn.dataset.board}"]`, grid);
    const open = box.hidden;
    box.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (!open || box.dataset.loaded) return;
    box.textContent = 'Loading pledges…';
    try {
      const list = await pledgesForCity(btn.dataset.board);
      const counts = PLEDGES.map((p, i) => ({ ...p, n: list.filter((x) => x.kind === i).length })).filter((p) => p.n && p.label !== 'Your own');
      const own = list.filter((x) => x.kind === 5).slice(-5).reverse();
      const checks = list.reduce((n, p) => n + p.checkIns, 0);
      box.innerHTML = `<b>City pledge board</b> <span class="muted">· ${plural(checks, 'check-in')}</span>
        <ul>${counts.map((p) => `<li><span>${p.icon} ${p.label}</span><b>${p.n}</b></li>`).join('')}
        ${own.map((p) => `<li><span>✍️ “${esc(p.text)}”</span><b>${short(p.by)}</b></li>`).join('')}</ul>`;
      box.dataset.loaded = '1';
    } catch { box.textContent = 'Couldn’t load the pledges — try again.'; }
  }

  $$('[data-sort]', view).forEach((b) => b.addEventListener('click', () => {
    sort = b.dataset.sort;
    $$('[data-sort]', view).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    paint();
  }));

  try { cities = await allCities(); paint(); }
  catch { grid.innerHTML = '<p class="alert">Couldn’t reach BOT Chain — try again in a minute.</p>'; }
}
