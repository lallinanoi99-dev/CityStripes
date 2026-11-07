// The website: 10 sections following the Concurrence layout, with our own climate look.
import { featured, placeSlug, PLEDGES } from './data.js';
import { analyze, captions, colorsFor, stripesFromBytes, PALETTE, fmtSigned } from './climate.js';
import { band, miniBand } from './stripes.js';
import { attachSearch } from './search.js';
import { stats, allCities } from './chain.js';
import { $, $$, esc, reduced, countUp, fmt } from './ui.js';
import { skyline, ICONS } from './art.js';
import { go } from './main.js';

const appLink = (c) => `app?city=${encodeURIComponent(c.slug || placeSlug(c))}`;
const STORY_PICKS = ['bangkok-th', 'lagos-ng', 'london-gb'];
const sky = (c, o = {}) => skyline(c.a.colors, { seed: c.slug, slug: c.slug, label: `${c.name} skyline filled with its warming stripes, ${c.summary.from}–${c.summary.to}`, ...o });

export async function renderHome(view) {
  const data = await featured();
  const cities = data.cities.map((c) => ({ ...c, a: analyze(c.summary) }));
  const hero = cities[0];
  const stories = STORY_PICKS.map((s) => cities.find((c) => c.slug === s)).filter(Boolean);
  while (stories.length < 3 && cities[stories.length]) stories.push(cities.find((c) => !stories.includes(c)));
  const tl = cities.find((c) => c.slug === 'paris-fr') || hero;

  view.innerHTML = `
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <p class="eyebrow">Real data · 1940 → ${data.toYear || 'today'} · any city on Earth</p>
        <h1 class="h1" id="heroTitle">Every year of your city’s climate, on one stripe.</h1>
        <p class="lead">Real temperatures since 1940, for any city on Earth. See it, share it, and pledge to do something about it.</p>
        <form class="search" id="heroSearch" role="search">
          <label class="sr" for="heroInput">Search for a city</label>
          <input id="heroInput" type="text" placeholder="Search your city — e.g. Bangkok" enterkeyhint="search">
          <button class="btn" type="submit">Show my stripes</button>
        </form>
        <p class="hero-note">Try ${cities.slice(1, 4).map((c) => `<a class="linkish" href="${appLink(c)}" data-link>${esc(c.name)}</a>`).join(' · ')}</p>
      </div>
      ${hero ? `<div class="hero-viz">
        <div class="float-chip fc-1" aria-hidden="true"><span>🔥</span><div><small>Hottest year</small><b>${hero.a.hottest.year}</b></div></div>
        <div class="float-chip fc-2" aria-hidden="true"><span>☀️</span><div><small>Hot days a year</small><b>${hero.a.hotDays.fifties} → ${hero.a.hotDays.recent}</b></div></div>
        <div class="float-chip fc-3" aria-hidden="true"><span>⛓</span><div><small>On BOT Chain</small><b>Stamp it</b></div></div>
        <div class="card hero-card no-stripe">
          <div class="hero-art" id="heroArt">${sky(hero, { width: 760, height: 360, sunX: 0.62 })}
            <div class="hero-meta"><span class="hero-city">${esc(hero.name)}, ${esc(hero.country)}</span><span class="hero-year" id="heroYear">${hero.summary.from}</span></div>
          </div>
          <div id="heroBand"></div>
          <div class="axis"><span>${hero.summary.from}</span><span>1980</span><span>${hero.summary.to}</span></div>
          <div class="hero-warm"><b id="heroWarm">${fmtSigned(hero.a.warming)}°C</b><span>warmer in ${hero.a.recentFrom}–${hero.a.recentTo} than in 1951–1980</span></div>
        </div>
      </div>` : ''}
    </div>
  </section>

  <section class="strip" aria-labelledby="stripTitle">
    <p class="eyebrow" id="stripTitle">Cities people have stamped</p>
    <div class="marquee"><div class="marquee-track" id="marquee"></div></div>
  </section>

  <section class="section" id="statsSection" hidden>
    <div class="wrap">
      <p class="eyebrow">On the record · live from BOT Chain</p>
      <div class="stats-row">
        <div><div class="stat-num" data-stat="cities">0</div><div class="stat-label">Cities stamped</div></div>
        <div><div class="stat-num" data-stat="pledges">0</div><div class="stat-label">Pledges made</div></div>
        <div><div class="stat-num" data-stat="checkIns">0</div><div class="stat-label">Weekly check-ins</div></div>
      </div>
    </div>
  </section>

  <section class="section" id="stories">
    <div class="wrap">
      <div class="section-head reveal">
        <div><p class="eyebrow">City stories</p><h2 class="h2">Same planet. Different stories.</h2></div>
        <p>Computed from the same ERA5 data you’ll see for your own city — nothing hand-picked but the cities.</p>
      </div>
      <div class="grid-3">
        ${stories.map((c) => `
        <article class="card story reveal">
          <div class="story-art">${sky(c, { width: 640, height: 250, water: true })}</div>
          <div class="story-body">
            <div class="story-city">${esc(c.name)} <span class="muted" style="font-weight:500">· ${esc(c.country)}</span></div>
            <div class="story-facts">
              <div><b>${fmtSigned(c.a.warming)}°C</b><small>since 1951–1980</small></div>
              <div><b>${c.a.hotDays.more >= 0 ? '+' : '−'}${Math.abs(c.a.hotDays.more)}</b><small>hot days a year vs the 1950s (above ${c.summary.hotThreshold}°C)</small></div>
            </div>
            <a class="arrow-link" href="${appLink(c)}" data-link>See the stripes →</a>
          </div>
        </article>`).join('')}
      </div>
    </div>
  </section>

  <section class="section postcards" style="padding-top:0">
    <div class="wrap">
      <div class="section-head reveal">
        <div><p class="eyebrow">Postcards from a warming world</p><h2 class="h2">Every city gets its own skyline.</h2></div>
        <p>Each building is painted with that city’s real stripes — 1940 on the left, ${data.toYear} on the right. Yours will be too.</p>
      </div>
      <div class="postcard-grid">
        ${cities.filter((c) => !stories.includes(c)).slice(0, 8).map((c, i) => `
        <a class="postcard" href="${appLink(c)}" data-link style="--tilt:${[-1.4, 1, -0.6, 1.3, 0.8, -1.1, 1.2, -0.9][i % 8]}deg">
          ${sky(c, { width: 600, height: 300, sun: i % 2 === 0 })}
          <span class="postcard-cap"><b>${esc(c.name)}</b><em>${fmtSigned(c.a.warming)}°C</em></span>
        </a>`).join('')}
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="section-head reveal"><div><p class="eyebrow">Made for</p><h2 class="h2">One picture, many uses.</h2></div></div>
      <div class="grid-4">
        ${[
          [ICONS.students, 'Students', 'A school project in an afternoon: your own city, real numbers, a poster to print.'],
          [ICONS.teachers, 'Teachers', 'A 10-minute climate lesson. Search the class’s city, guess the hottest year, compare with a twin city.'],
          [ICONS.creators, 'Journalists & creators', 'Ready-made graphics for any city: poster, social card and phone wallpaper, with credits built in.'],
          [ICONS.groups, 'Climate groups', 'Run a pledge campaign: everyone stamps the same city and checks in every week.'],
        ].map(([i, t, p]) => `<div class="card aud reveal"><div class="aud-icon" aria-hidden="true">${i}</div><h3 class="h3">${t}</h3><p>${p}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="section" id="how" style="padding-top:0">
    <div class="wrap">
      <div class="section-head reveal"><div><p class="eyebrow">How it works</p><h2 class="h2">Three steps. About a minute.</h2></div></div>
      <div class="grid-3 steps">
        <div class="card step"><span class="step-num">01</span>
          <div class="step-illo"><div class="fake-input">⌕&nbsp; <b>Bang</b>|</div><div class="fake-sug">Bangkok <span class="muted">· Thailand</span></div></div>
          <h3 class="h3">Search your city</h3><p>Any city, town or village. We find the nearest ~25 km grid point of real reanalysis data.</p></div>
        <div class="card step"><span class="step-num">02</span>
          <div class="step-illo step-art">${hero ? sky(hero, { height: 200, sun: false }) : ''}</div>
          <h3 class="h3">See the stripes</h3><p>One stripe per year since 1940. Hover any year, add your birth year, compare a second city.</p></div>
        <div class="card step"><span class="step-num">03</span>
          <div class="step-illo"><div class="chips"><span class="chip is-green">🚲 Bike 2×/week</span><span class="chip">🥦 Plant-based</span><span class="chip">💡 Save energy</span></div><div class="fake-sug">✓ Stamped on BOT Chain</div></div>
          <h3 class="h3">Share & pledge</h3><p>Download a poster, stamp your city on BOT Chain and make a pledge you check in on weekly.</p></div>
      </div>
    </div>
  </section>

  <section class="timeline" id="timeline">
    <div class="wrap tl-pin" id="tlPin">
      <div class="tl-head">
        <div><p class="eyebrow">Scroll through time · ${esc(tl?.name || '')}</p><h2 class="h2" style="margin:0">${tl ? tl.summary.to - tl.summary.from + 1 : 85} years, one city.</h2></div>
        <div class="tl-year" id="tlYear">${tl?.summary.from || 1940}</div>
      </div>
      <div class="tl-band" id="tlBand"></div>
      <div class="tl-caption" id="tlCaption" aria-live="polite"></div>
    </div>
  </section>

  <section class="section metrics">
    <div class="wrap">
      <p class="tagline">Real data. Honestly shown.</p>
      <div class="metrics-grid">
        <div><b>1940→${data.toYear || 'today'}</b><span>Every complete year since ERA5 begins</span></div>
        <div><b>~25 km</b><span>Grid point nearest to your city</span></div>
        <div><b>0</b><span>Personal data on-chain</span></div>
      </div>
    </div>
    ${tl ? `<div class="metrics-art">${sky(tl, { height: 240, dark: true, sun: false, water: true, width: 1600 })}</div>` : ''}
  </section>

  <section class="section" id="data">
    <div class="wrap">
      <div class="section-head reveal"><div><p class="eyebrow">Data you can trust</p><h2 class="h2">Open sources, credited.</h2></div><p>Every number can be re-run: the stamp stores a SHA-256 fingerprint of the yearly values.</p></div>
      <div class="grid-4">
        <a class="card tile reveal" href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noopener"><span class="tile-badge">Source</span><h3 class="h3">Open-Meteo</h3><p>Free, open historical weather API — daily mean and max temperature for any point.</p></a>
        <a class="card tile reveal" href="https://cds.climate.copernicus.eu/" target="_blank" rel="noopener"><span class="tile-badge">Reanalysis</span><h3 class="h3">ERA5 · Copernicus</h3><p>ECMWF’s global reanalysis, from 1940 to last year, on a ~25 km grid.</p></a>
        <a class="card tile reveal" href="https://showyourstripes.info/" target="_blank" rel="noopener"><span class="tile-badge">Idea · CC BY 4.0</span><h3 class="h3">#ShowYourStripes</h3><p>Warming stripes were created by climate scientist Ed Hawkins. Same palette, same idea.</p></a>
        <div class="card tile reveal"><span class="tile-badge">Record</span><h3 class="h3">BOT Chain</h3><p>Stamps and pledges are public records — city summaries only, never anything personal.</p></div>
      </div>
      <div class="data-notes">
        <span class="chip">ERA5 reanalysis for the nearest ~25 km grid point, not a single weather station</span>
        <span class="chip">Older years can be less certain</span>
        <span class="chip">Baseline: 1951–1980 average</span>
      </div>
      <p style="margin-top:24px"><a class="arrow-link" href="#faq" data-link data-anchor="faq">Read about the data →</a></p>
    </div>
  </section>

  <section class="section closing" id="pledge" style="padding-top:0">
    <div class="wrap">
      <p class="eyebrow is-ember">Make a pledge</p>
      <h2 class="h2">Your city changed. What will you change?</h2>
      <div class="chips">${PLEDGES.map((p) => `<a class="chip" href="app?pledge=1" data-link>${p.icon} ${p.label}</a>`).join('')}</div>
      <p class="live-count" id="pledgeCount"></p>
      <a class="btn" href="app?pledge=1" data-link>Make a pledge</a>
      ${(() => { const c = cities.find((x) => x.slug.startsWith('sydney')) || hero; return c ? `<div class="closing-art">${sky(c, { height: 300, width: 1600, water: true })}<span class="closing-art-cap mono">${esc(c.name)} · ${c.summary.from}–${c.summary.to}</span></div>` : ''; })()}
      <div class="faq" id="faq">
        ${[
          ['Where is the data from?', 'Open-Meteo’s Historical Weather API, which serves ERA5 — the global reanalysis from the Copernicus Climate Change Service (ECMWF). We take the daily mean and maximum temperature from 1 January 1940 to the last complete year, average each calendar year and compare it with the 1951–1980 average.'],
          ['Why not a weather station?', 'Most places don’t have a station with 85 unbroken years. ERA5 blends millions of observations into a consistent grid (~25 km), so every city on Earth gets a comparable record. Coastal and mountain cities can differ from their local station, and older years are less certain — we say so on every page.'],
          ['What goes on BOT Chain?', 'When you stamp a city: its name, rounded coordinates (0.01°), the years, the warming number, one small number per year for the stripes, and a SHA-256 fingerprint of the yearly values. A pledge stores its type (or your ≤ 100-character text), length and weekly check-ins. Your birth year is never stored anywhere.'],
          ['Do I need a wallet?', 'No — searching, stripes, comparing and downloads all work without one. You only need MetaMask (on BOT Chain, chain ID 677) to stamp a city or make a pledge. The app adds BOT Chain for you.'],
          ['Can I use the poster?', 'Yes — posters, wallpapers, social cards and the scarf pattern are yours to print and share. Please keep the credit line: data from Open-Meteo / ERA5, stripes idea by Ed Hawkins (#ShowYourStripes, CC BY 4.0).'],
        ].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
      </div>
    </div>
  </section>`;

  // ---------- search
  attachSearch($('#heroSearch', view), (p) => go(`app?city=${encodeURIComponent(placeSlug(p))}&ll=${p.lat},${p.lon}`));

  const ctx = window.gsap ? gsap.context(() => {}, view) : null;
  let mm = null;
  const add = (fn) => (ctx ? ctx.add(fn) : fn());

  // ---------- 1 · hero stripes draw in, then the warming number counts up
  if (hero) {
    const b = band({ years: hero.a.years, colors: hero.a.colors, anomalies: hero.a.anomalies, means: hero.summary.mean, label: `Warming stripes for ${hero.name}` });
    $('#heroBand', view).append(b.el);
    add(() => {
      if (window.SplitText && !reduced()) {
        const split = new SplitText('#heroTitle', { type: 'words' });
        gsap.from(split.words, { yPercent: 40, autoAlpha: 0, duration: 0.7, ease: 'power3.out', stagger: 0.04 });
      }
      if (!reduced()) $('#heroWarm', view).textContent = '+0.0°C';
      const rects = [...$('#heroArt', view).querySelectorAll('.sk-stripes rect')];
      if (!reduced()) {
        gsap.from(rects, { autoAlpha: 0, duration: 0.3, stagger: 2.4 / rects.length });
        gsap.from('.float-chip', { y: 20, autoAlpha: 0, duration: 0.6, stagger: 0.25, delay: 2.2, ease: 'back.out(2)' });
        gsap.utils.toArray('.float-chip', view).forEach((el, i) => gsap.to(el, { y: i % 2 ? 8 : -8, duration: 2.4 + i * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2.8 }));
        gsap.to('#heroArt .sk-sun', { scale: 1.08, transformOrigin: '60% 26%', duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      }
      b.reveal($('#heroYear', view), 2.4).then(() => countUp($('#heroWarm', view), hero.a.warming, { decimals: 1, suffix: '°C', signed: true }));
    });
  }

  // ---------- 2 · city strip (stamped cities if there are enough, else featured cities)
  const marquee = $('#marquee', view);
  const paintMarquee = (items, title) => {
    $('#stripTitle', view).textContent = title;
    const html = items.map((c) => `<a class="marquee-item" href="${c.href}" data-link>${miniBand(c.colors)}<span><span>${esc(c.name)}</span><em>${fmtSigned(c.warming)}°</em></span></a>`).join('');
    marquee.innerHTML = html + html.replace(/<a /g, '<a aria-hidden="true" tabindex="-1" ');
    if (!reduced()) add(() => gsap.to(marquee, { xPercent: -50, duration: items.length * 4, ease: 'none', repeat: -1 }));
  };
  paintMarquee(cities.map((c) => ({ name: c.name, colors: c.a.colors, warming: c.a.warming, href: appLink(c) })), 'Start with these cities');
  allCities().then((list) => {
    if (list.length < 6) return;
    if (window.gsap) { gsap.killTweensOf(marquee); gsap.set(marquee, { xPercent: 0 }); }
    paintMarquee(list.slice(-24).reverse().map((c) => ({ name: c.city, colors: colorsFor(stripesFromBytes(c.stripes)), warming: c.warmingE2 / 100, href: `app?city=${encodeURIComponent(placeSlug({ name: c.city, cc: '' }))}&ll=${c.latE2 / 100},${c.lonE2 / 100}` })), 'Cities people have stamped');
  }).catch(() => {});

  // ---------- 3 · stats (hidden until meaningful)
  stats().then((s) => {
    if (s.cities < 3) return;
    $('#statsSection', view).hidden = false;
    $('#pledgeCount', view).textContent = s.pledges ? `${fmt(s.pledges)} pledges made · ${fmt(s.checkIns)} weekly check-ins` : '';
    $$('[data-stat]', view).forEach((el) => {
      const v = s[el.dataset.stat];
      if (window.ScrollTrigger && !reduced()) ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => countUp(el, v) });
      else el.textContent = fmt(v);
    });
    window.ScrollTrigger?.refresh();
  }).catch(() => {});

  // ---------- reveals, step cards, number flips
  if (window.gsap && window.ScrollTrigger && !reduced()) add(() => {
    gsap.utils.toArray('.reveal', view).forEach((el) => gsap.from(el, { y: 24, autoAlpha: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));
    gsap.from('.steps .card', { x: 60, autoAlpha: 0, duration: 0.8, ease: 'power3.out', stagger: 0.15, scrollTrigger: { trigger: '.steps', start: 'top 80%' } });
    gsap.from('.step-num', { rotateX: -90, transformOrigin: '50% 50% -8px', duration: 0.6, ease: 'back.out(2)', stagger: 0.15, delay: 0.3, scrollTrigger: { trigger: '.steps', start: 'top 80%' } });
    gsap.utils.toArray('.story-art, .closing-art, .metrics-art', view).forEach((el) => {
      el.querySelectorAll('.sk-stripes').forEach((g) => gsap.from(g.children, { autoAlpha: 0, duration: 0.25, stagger: 1.4 / Math.max(1, g.children.length), scrollTrigger: { trigger: el, start: 'top 85%' } }));
    });
    gsap.from('.postcard', { '--rise': '48px', opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.07, scrollTrigger: { trigger: '.postcard-grid', start: 'top 85%' } });
    gsap.from('.metrics-grid > div', { y: 30, autoAlpha: 0, duration: 0.7, stagger: 0.12, scrollTrigger: { trigger: '.metrics-grid', start: 'top 85%' } });
  });

  // ---------- 7 · scroll timeline: the band grows year by year with captions that are true for this city
  if (tl) {
    const bandEl = $('#tlBand', view);
    const yearEl = $('#tlYear', view);
    const capEl = $('#tlCaption', view);
    const caps = captions(tl.summary, tl.a);
    bandEl.innerHTML = tl.a.colors.map((c) => `<span style="background:${PALETTE[c]}"></span>`).join('');
    const stripes = [...bandEl.children];
    let shownCap = null;
    const setYear = (i) => {
      stripes.forEach((s, j) => (s.style.visibility = j <= i ? 'visible' : 'hidden'));
      const y = tl.a.years[i];
      yearEl.textContent = y;
      const cap = [...caps].reverse().find((c) => c.year <= y);
      if (cap && cap !== shownCap) {
        shownCap = cap;
        const [yy, ...rest] = cap.text.split(': ');
        capEl.innerHTML = `<small>${yy} · ${fmtSigned(tl.a.anomalies[tl.a.years.indexOf(cap.year)])}°C</small>${esc(rest.join(': ').replace(/^./, (m) => m.toUpperCase()))}`;
        if (window.gsap && !reduced()) gsap.fromTo(capEl, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35 });
      }
    };
    const staticView = () => {
      shownCap = null;
      stripes.forEach((s) => (s.style.visibility = 'visible'));
      yearEl.textContent = tl.summary.to;
      capEl.innerHTML = `<ul class="tl-list">${caps.map((c) => `<li><b>${c.year}</b>${esc(c.text.split(': ').slice(1).join(': '))}</li>`).join('')}</ul>`;
    };
    if (window.ScrollTrigger) {
      // Desktop: pinned and scrubbed. Mobile or reduced motion: the complete band with every caption.
      mm = gsap.matchMedia();
      mm.add('(min-width: 761px) and (prefers-reduced-motion: no-preference)', () => {
        capEl.innerHTML = '';
        setYear(0);
        const o = { i: 0 };
        gsap.to(o, { i: stripes.length - 1, ease: 'none', onUpdate: () => setYear(Math.round(o.i)), scrollTrigger: { trigger: '#tlPin', start: 'top top', end: '+=1600', scrub: 0.4, pin: true } });
        return staticView;
      });
      mm.add('(max-width: 760px), (prefers-reduced-motion: reduce)', staticView);
    } else staticView();
  }

  return () => { mm?.revert(); ctx?.revert(); };
}
