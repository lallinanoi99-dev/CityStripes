// /app — search a city → stripes from real data → key numbers, your year, line view, compare, downloads, stamp, pledge.
import { featured, getSummary, resolveSlug, placeSlug, placeLabel, PLEDGES } from './data.js';
import { analyze, sinceBirth, fingerprint, fingerprintText, stripesBytes, fmtSigned, MONTHS } from './climate.js';
import { band } from './stripes.js';
import { skyline } from './art.js';
import { attachSearch } from './search.js';
import { MODE, NET, wallet, onChange, connect, cityKey, getCity, hasStamped, stampCity, makePledge, checkIn, pledgesOf, pledgesForCity, explorerTx, short, nowWeek, WEEK, getCity as fetchCity } from './chain.js';
import { $, $$, esc, toast, copyText, mobile, reduced, countUp, loadScript, fmt, plural } from './ui.js';
import { go, href, noWalletHelp } from './main.js';

const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

export async function renderApp(view) {
  const params = new URLSearchParams(location.search);
  const S = { a: null, b: null, birth: null, key: '', onChain: null, mine: false, chart: null, bands: [], alive: true };
  const off = [];

  view.innerHTML = `
  <section class="app">
    <div class="wrap">
      <div class="app-top">
        <form class="search" id="appSearch" role="search">
          <label class="sr" for="appInput">Search for a city</label>
          <input id="appInput" type="text" placeholder="Search a city — e.g. Bangkok" enterkeyhint="search">
          <button class="btn" type="submit">Show stripes</button>
        </form>
        <nav class="tabs" aria-label="App"><a href="app" data-link aria-current="page">My city</a><a href="app/wall" data-link>The Wall</a></nav>
      </div>
      <div id="cityArea"></div>
    </div>
    <div class="sticky-bar" id="stickyBar" hidden>
      <button class="btn" type="button" data-jump="stampCard">Stamp</button>
      <button class="btn btn-green" type="button" data-jump="pledgeCard">Pledge</button>
    </div>
  </section>`;

  const area = $('#cityArea', view);
  const search = attachSearch($('#appSearch', view), (p) => openPlace(p, { push: true }));
  $$('[data-jump]', view).forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' })));

  // ---------------------------------------------------------------- empty state
  async function emptyState(msg = '') {
    const f = (await featured()).cities;
    area.innerHTML = `
      <div class="empty-state">
        ${msg ? `<p class="alert" style="max-width:560px;margin:0 auto 20px">${msg}</p>` : ''}
        <h1 class="h3">${params.has('pledge') ? 'Pick your city first — pledges are linked to a city.' : 'Search any city, town or village.'}</h1>
        <p>One stripe for every year since 1940, built from ERA5 reanalysis data for the nearest ~25 km grid point.</p>
        <div class="picks">${f.map((c) => `<a class="chip" href="app?city=${c.slug}" data-link>${esc(c.name)}</a>`).join('')}</div>
      </div>`;
    $('#stickyBar', view).hidden = true;
    if (!msg) search.input.focus();
  }

  // ---------------------------------------------------------------- load a city
  async function openPlace(place, { push = false } = {}) {
    if (!S.alive) return;
    const slug = placeSlug(place);
    const isFeatured = (await featured()).cities.some((c) => c.slug === slug && c.lat === place.lat && c.lon === place.lon);
    if (push) {
      const q = new URLSearchParams({ city: slug });
      if (!isFeatured) q.set('ll', `${place.lat},${place.lon}`);
      history.pushState(null, '', href(`app?${q}`) + (params.has('net') ? `&net=${params.get('net')}` : '') + (params.has('preview') ? '&preview' : ''));
    }
    search.input.value = placeLabel(place);
    S.b = null;
    area.innerHTML = `
      <div class="city-head"><div><p class="eyebrow">Building your stripes…</p><h1 class="city-name">${esc(place.name)}</h1><p class="city-sub">${esc(place.country)}</p></div><span class="city-counter">1940</span></div>
      <div class="skeleton" aria-label="Loading temperatures"></div>`;
    let summary;
    try { summary = await getSummary(place.lat, place.lon); }
    catch (e) {
      if (!S.alive) return;
      area.innerHTML = `<div class="city-head"><div><h1 class="city-name">${esc(place.name)}</h1><p class="city-sub">${esc(place.country)}</p></div></div>
        <div class="alert" role="alert">${esc(e.message || 'Something went wrong.')} <button class="linkish" type="button" id="retry">Try again</button></div>`;
      $('#retry', area).addEventListener('click', () => openPlace(place));
      return;
    }
    if (!S.alive) return;
    S.a = { place, summary, an: analyze(summary) };
    S.key = await cityKey(Math.round(place.lat * 100), Math.round(place.lon * 100));
    renderCity();
    const vs = params.get('vs');
    if (vs && !push) { const p = await resolveSlug(vs, params.get('vsll')); if (p) addCompare(p); }
    if (params.has('pledge') && !push) setTimeout(() => document.getElementById('pledgeCard')?.scrollIntoView({ behavior: 'smooth' }), 2600);
  }

  // ---------------------------------------------------------------- the city's story
  function renderCity() {
    const { place, summary: s, an: a } = S.a;
    const elevNote = place.elevation != null && s.elevation != null && Math.abs(place.elevation - s.elevation) > 150;
    const hotLabel = s.hotThreshold >= 35 ? 'above 35°C' : `above ${s.hotThreshold}°C — this city’s hottest 5% of days in 1951–1980`;
    area.innerHTML = `
      <div class="city-head">
        <div>
          <p class="eyebrow">Your city’s story · ${s.from}–${s.to}</p>
          <h1 class="city-name">${esc(place.name)}</h1>
          <p class="city-sub">${esc([place.admin1, place.country].filter(Boolean).join(', '))} · grid point ${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}${s.elevation != null ? ` · ${Math.round(s.elevation)} m` : ''}</p>
        </div>
        <div style="text-align:right">
          <div class="city-counter" id="counter" aria-hidden="true">${s.from}</div>
          <div class="city-actions" style="margin-top:12px"><button class="btn btn-ghost btn-sm" type="button" id="shareBtn">Copy share link</button></div>
        </div>
      </div>
      <div class="city-art" id="cityArt">${skyline(a.colors, { seed: placeSlug(place), slug: placeSlug(place), width: 1400, height: 230, sunX: 0.9, label: `${place.name} skyline painted with its warming stripes` })}</div>
      <div id="bands"></div>
      <div class="axis" id="axis"></div>

      <div class="tiles">
        <div class="card stat-tile"><div class="k">Warmer than 1951–1980</div><div class="v ${a.warming >= 0 ? 'is-warm' : 'is-cool'}" id="tWarm">${fmtSigned(a.warming)}°C</div><p>Average of ${a.recentFrom}–${a.recentTo} vs 1951–1980 (${a.baseline.toFixed(1)}°C)</p></div>
        <div class="card stat-tile"><div class="k">Hottest year</div><div class="v">${a.hottest.year}</div><p>${a.hottest.mean.toFixed(1)}°C (${fmtSigned(a.hottest.anomaly)}°C). Coldest: ${a.coldest.year} (${a.coldest.mean.toFixed(1)}°C)</p></div>
        <div class="card stat-tile"><div class="k">Hot days a year</div><div class="v">${a.hotDays.fifties} → ${a.hotDays.recent}</div><p>Days ${esc(hotLabel)}: 1950s vs ${a.recentFrom}–${a.recentTo}</p></div>
        <div class="card stat-tile"><div class="k">Warmest month · ${a.warmestMonth.name}</div><div class="v ${a.warmestMonth.change >= 0 ? 'is-warm' : 'is-cool'}">${fmtSigned(a.warmestMonth.change)}°C</div><p>${a.warmestMonth.base.toFixed(1)}°C in 1951–1980 → ${a.warmestMonth.recent.toFixed(1)}°C lately. Most warmed: ${a.mostWarmedMonth.name} (${fmtSigned(a.mostWarmedMonth.change)}°C)</p></div>
      </div>

      <form class="birth" id="birthForm">
        <label for="birthYear">Your year</label>
        <input id="birthYear" type="number" inputmode="numeric" min="1900" max="${s.to}" placeholder="e.g. 1990" aria-describedby="birthOut">
        <output id="birthOut" for="birthYear"></output>
        <small>Add your birth year to mark it on the stripes. It never leaves this page.</small>
      </form>

      <div class="app-cols">
        <div>
          <div class="card">
            <div class="panel-head"><h2 class="h3">Line view</h2><span class="muted" style="font-size:13px">Yearly average · 10-year trend · 1951–1980 baseline</span></div>
            <div class="chart-box"><canvas id="lineChart" aria-label="Yearly average temperature in ${esc(place.name)} with a 10-year trend line" role="img"></canvas></div>
          </div>
          <div class="card" id="compareCard">
            <div class="panel-head"><h2 class="h3">Compare</h2><span class="muted" style="font-size:13px">Add a second city</span></div>
            <form class="search" id="cmpSearch" role="search"><label class="sr" for="cmpInput">Second city</label><input id="cmpInput" type="text" placeholder="e.g. London"><button class="btn btn-ghost" type="submit">Compare</button></form>
            <div id="cmpOut"></div>
          </div>
        </div>
        <div>
          <div class="card" id="stampCard"></div>
          <div class="card" id="pledgeCard"></div>
          <div class="card" id="dlCard">
            <div class="panel-head"><h2 class="h3">Download</h2></div>
            <div class="downloads">
              <div class="dl" role="group" aria-label="Poster"><b>Poster</b><small>Stripes, name, years, warming</small>
                <span style="display:flex;gap:6px"><select id="posterSize" aria-label="Poster size"><option>A4</option><option>A3</option></select><select id="posterFmt" aria-label="Poster format"><option>PNG</option><option>PDF</option></select></span>
                <button class="btn btn-sm btn-ghost" type="button" data-dl="poster" style="margin-top:8px">Download poster</button></div>
              <button class="dl" type="button" data-dl="wallpaper"><b>Phone wallpaper</b><small>1170 × 2532 PNG</small></button>
              <button class="dl" type="button" data-dl="scarf"><b>Knit-scarf pattern</b><small>One row per year + yarn list (PDF)</small></button>
              <button class="dl" type="button" data-dl="social"><b>Social card</b><small>1080 × 1080 PNG</small></button>
            </div>
          </div>
        </div>
      </div>

      <div class="notes">
        <p>ERA5 reanalysis for the nearest ~25 km grid point, not a single weather station. Older years can be less certain.</p>
        ${elevNote ? `<p class="alert is-info">This grid point sits at ${Math.round(s.elevation)} m while ${esc(place.name)} is at ${Math.round(place.elevation)} m — coastal and mountain cities can read differently from their local weather station.</p>` : '<p>Coastal and high-mountain cities can differ from their local weather station.</p>'}
        <p>Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> Historical Weather API (ERA5, Copernicus Climate Change Service / ECMWF). Inspired by <a href="https://showyourstripes.info/" target="_blank" rel="noopener">#ShowYourStripes</a> by Ed Hawkins (CC BY 4.0).</p>
        <p>Data fingerprint (SHA-256 of the yearly values): <span class="fp" id="fp">…</span> <button class="linkish" type="button" id="fpHow">How?</button></p>
      </div>`;

    $('#stickyBar', view).hidden = false;
    drawBands(true);
    $('#shareBtn', area).addEventListener('click', () => copyText(location.href, 'Share link copied'));
    fingerprint(s).then((h) => { S.a.hash = h; $('#fp', area).textContent = h; });
    $('#fpHow', area).addEventListener('click', () => toast(`SHA-256 of the text “${esc(fingerprintText(s).slice(0, 40))}…” — the first year, a colon, then each yearly mean with 2 decimals, comma-separated. Re-run it to compare.`, '', 9000));

    const birth = $('#birthYear', area);
    birth.addEventListener('input', () => setBirth(birth.value));
    $('#birthForm', area).addEventListener('submit', (e) => e.preventDefault());

    attachSearch($('#cmpSearch', area), addCompare);
    drawChart();
    paintStamp();
    paintPledge();
    import('./downloads.js').then((m) => $$('[data-dl]', area).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await m.download(b.dataset.dl, { ...S.a, hash: S.a.hash, size: $('#posterSize', area).value, format: $('#posterFmt', area).value }); }
      catch (e) { console.error(e); toast('Couldn’t make that file — try again.', 'bad'); }
      finally { b.disabled = false; }
    })));
  }

  // ---------------------------------------------------------------- stripes bands (+ compare)
  function drawBands(animate = false) {
    const box = $('#bands', area);
    if (!box) return;
    const vertical = mobile();
    box.innerHTML = '';
    box.classList.toggle('compare-on', !!S.b);
    S.bands = [S.a, S.b].filter(Boolean).map((c) => {
      const wrap = document.createElement('div');
      wrap.className = 'band-wrap';
      if (S.b) wrap.innerHTML = `<span class="band-label">${esc(c.place.name)} · ${fmtSigned(c.an.warming)}°C</span>`;
      const b = band({ years: c.an.years, colors: c.an.colors, anomalies: c.an.anomalies, means: c.summary.mean, vertical, label: `Warming stripes for ${c.place.name}` });
      wrap.append(b.el);
      box.append(wrap);
      return b;
    });
    const a = S.a.an;
    const step = a.years.length > 60 ? 20 : 10;
    $('#axis', area).innerHTML = vertical ? '' : a.years.filter((y, i) => i === 0 || i === a.years.length - 1 || (y % step === 0 && y - a.years[0] > 6 && a.years.at(-1) - y > 6)).map((y) => `<span>${y}</span>`).join('');
    if (S.birth) S.bands[0].setBirthYear(S.birth);
    const counter = $('#counter', area);
    if (animate) {
      if (!reduced() && window.gsap) { const r = area.querySelectorAll('#cityArt .sk-stripes rect'); gsap.from(r, { autoAlpha: 0, duration: 0.3, stagger: 2.2 / r.length }); }
      S.bands[0].reveal(counter, 2.2).then(() => { if (!reduced()) countUp($('#tWarm', area), S.a.an.warming, { decimals: 1, suffix: '°C', signed: true, duration: 1 }); });
      if (!reduced() && window.gsap) gsap.from('.stat-tile', { y: 20, autoAlpha: 0, duration: 0.6, stagger: 0.08, delay: 1.6, ease: 'power3.out' });
    } else counter.textContent = S.a.summary.to;
  }
  const mq = matchMedia('(max-width: 760px)');
  const onMq = () => S.a && drawBands(false);
  mq.addEventListener('change', onMq);
  off.push(() => mq.removeEventListener('change', onMq));

  function setBirth(v) {
    const out = $('#birthOut', area);
    const y = parseInt(v, 10);
    const s = S.a.summary;
    S.birth = null;
    S.bands[0]?.setBirthYear(-1);
    if (!v || !Number.isFinite(y) || String(y).length < 4) { out.textContent = ''; return; }
    if (y < s.from) { out.textContent = `Stripes start in ${s.from}.`; return; }
    if (y > s.to) { out.textContent = `The stripes end in ${s.to}.`; return; }
    S.birth = y;
    S.bands[0].setBirthYear(y);
    const r = sinceBirth(s, S.a.an, y);
    out.textContent = r.tooRecent
      ? `There’s your stripe! Ask again in a few years — we compare 10-year averages.`
      : `Since you were born, ${S.a.place.name} warmed by ${fmtSigned(r.change)}°C.`;
  }

  // ---------------------------------------------------------------- line view
  async function drawChart() {
    const canvas = $('#lineChart', area);
    if (!canvas) return;
    try { await loadScript(CHART_JS, () => window.Chart); } catch { canvas.parentElement.innerHTML = '<p class="muted">The chart couldn’t load — check your connection.</p>'; return; }
    if (!S.alive || !canvas.isConnected) return;
    S.chart?.destroy();
    const { an: a, summary: s } = S.a;
    S.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: a.years,
        datasets: [
          { label: 'Yearly average', data: s.mean, borderColor: '#9AA3B2', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
          { label: '10-year trend', data: a.trend, borderColor: '#E4572E', borderWidth: 3, pointRadius: 0, tension: 0.3, spanGaps: true },
          { label: '1951–1980 average', data: a.years.map(() => a.baseline), borderColor: '#2171B5', borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: reduced() ? false : { duration: 700 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 2, font: { family: 'Inter', size: 12 }, color: '#5E6A7D' } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y?.toFixed(2)}°C` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 9, font: { family: 'IBM Plex Mono', size: 11 }, color: '#5E6A7D' } },
          y: { grid: { color: '#EEF0F3' }, ticks: { callback: (v) => `${v}°`, font: { family: 'IBM Plex Mono', size: 11 }, color: '#5E6A7D' } },
        },
      },
    });
  }
  off.push(() => S.chart?.destroy());

  // ---------------------------------------------------------------- compare
  async function addCompare(place) {
    const out = $('#cmpOut', area);
    out.innerHTML = `<p class="muted" style="margin:14px 0 0">Loading ${esc(place.name)}…</p>`;
    try {
      const summary = await getSummary(place.lat, place.lon);
      if (!S.alive) return;
      S.b = { place, summary, an: analyze(summary) };
    } catch (e) { out.innerHTML = `<p class="alert" style="margin-top:14px">${esc(e.message)}</p>`; return; }
    const q = new URLSearchParams(location.search);
    q.set('vs', placeSlug(place)); q.set('vsll', `${place.lat},${place.lon}`);
    history.replaceState(null, '', `${location.pathname}?${q}`);
    drawBands(false);
    const row = (k, f) => `<div class="cmp-row"><span>${k}</span><b>${f(S.a)}</b><b>${f(S.b)}</b></div>`;
    out.innerHTML = `
      <div style="margin-top:16px">
        <div class="cmp-row" style="border-top:0"><span></span><b>${esc(S.a.place.name)}</b><b>${esc(S.b.place.name)}</b></div>
        ${row('Warming vs 1951–1980', (c) => `${fmtSigned(c.an.warming)}°C`)}
        ${row('1951–1980 average', (c) => `${c.an.baseline.toFixed(1)}°C`)}
        ${row('Hottest year', (c) => c.an.hottest.year)}
        ${row('Hot days 1950s → now', (c) => `${c.an.hotDays.fifties} → ${c.an.hotDays.recent}`)}
        ${row('Warmest month change', (c) => `${fmtSigned(c.an.warmestMonth.change)}°C`)}
        <p style="margin:12px 0 0;font-size:13px" class="muted">Hot days use each city’s own threshold (${S.a.summary.hotThreshold}°C vs ${S.b.summary.hotThreshold}°C). <button class="linkish" type="button" id="cmpClear">Remove</button></p>
      </div>`;
    $('#cmpClear', out).addEventListener('click', () => {
      S.b = null; out.innerHTML = ''; $('#cmpInput', area).value = '';
      const q2 = new URLSearchParams(location.search); q2.delete('vs'); q2.delete('vsll');
      history.replaceState(null, '', `${location.pathname}?${q2}`);
      drawBands(false);
    });
    document.getElementById('bands')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  }

  // ---------------------------------------------------------------- stamp
  const txLine = (el, html) => { el.innerHTML = html; };
  async function paintStamp() {
    const card = $('#stampCard', area);
    if (!card) return;
    const { place, summary: s, an: a } = S.a;
    const key = S.key;
    try { S.onChain = await getCity(key); S.mine = wallet.account ? await hasStamped(key, wallet.account) : false; }
    catch { S.onChain = null; S.mine = false; }
    if (!S.alive || !card.isConnected) return;
    const c = S.onChain;
    const newer = c && s.to > c.toYear;
    const status = c
      ? `<p class="alert is-ok">✓ On the Wall — stamped by ${plural(c.stamps, 'wallet')}${c.pledges ? ` · ${plural(c.pledges, 'pledge')}` : ''}. First by ${short(c.by)}.</p>`
      : `<p class="muted" style="margin:0 0 14px">Nobody has stamped ${esc(place.name)} yet — be the first.</p>`;
    const label = !c ? 'Stamp on BOT Chain' : newer ? `Update with ${s.to} data` : S.mine ? '✓ You stamped this city' : '+1 Stamp it too';
    card.innerHTML = `
      <div class="panel-head"><h2 class="h3">Stamp my city</h2><span class="mono muted" style="font-size:12px">${MODE === 'preview' ? 'PREVIEW' : NET.name.toUpperCase()}</span></div>
      ${status}
      <p style="font-size:13.5px;margin:0 0 14px" class="muted">Records ${esc(place.name)}, ${(Math.round(place.lat * 100) / 100).toFixed(2)}, ${(Math.round(place.lon * 100) / 100).toFixed(2)}, ${s.from}–${s.to}, warming ${fmtSigned(a.warming, 2)}°C, the stripes and the data fingerprint. Nothing personal.</p>
      <button class="btn btn-block" type="button" id="stampBtn" ${S.mine && !newer ? 'disabled' : ''}>${label}</button>
      <p class="tx-line" id="stampTx">${!window.ethereum && MODE === 'live' ? 'Needs <a href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a> — everything else works without it.' : wallet.account && !wallet.chainOk ? 'Your wallet is on another network — we’ll ask to switch to BOT Chain.' : ''}</p>
      ${c ? '<a class="arrow-link" href="app/wall" data-link style="font-size:14px">See it on the Wall →</a>' : ''}`;
    $('#stampBtn', card).addEventListener('click', doStamp);
  }

  async function doStamp() {
    const btn = $('#stampBtn', area), line = $('#stampTx', area);
    if (MODE === 'live' && !window.ethereum) return noWalletHelp();
    const { place, summary: s, an: a } = S.a;
    btn.disabled = true;
    try {
      if (!wallet.account) { txLine(line, 'Connect your wallet…'); await connect(); }
      const hash = S.a.hash || (await fingerprint(s));
      txLine(line, 'Confirm in MetaMask…');
      const input = {
        city: [...place.name].slice(0, 60).join(''), country: [...(place.country || '')].slice(0, 60).join(''),
        latE2: Math.round(place.lat * 100), lonE2: Math.round(place.lon * 100), fromYear: s.from, toYear: s.to,
        warmingE2: Math.max(-1000, Math.min(1000, Math.round(a.warming * 100))), dataHash: hash, stripes: stripesBytes(a),
      };
      await stampCity(input, (h) => txLine(line, `Waiting for BOT Chain… <a href="${explorerTx(h)}" target="_blank" rel="noopener">view transaction ↗</a>`));
      toast(`✓ ${esc(place.name)} is stamped on BOT Chain`);
      await paintStamp();
      paintPledge();
      if (window.gsap && !reduced()) gsap.fromTo('#stampCard', { scale: 0.98 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    } catch (e) {
      txLine($('#stampTx', area) || line, `<span style="color:#8A3216">${esc(e.message)}</span>`);
      if ($('#stampBtn', area)) $('#stampBtn', area).disabled = false;
    }
  }

  // ---------------------------------------------------------------- pledge
  let choice = 0, weeks = 4;
  async function paintPledge() {
    const card = $('#pledgeCard', area);
    if (!card) return;
    const c = S.onChain;
    const name = S.a.place.name;
    let mine = [];
    try { if (wallet.account) mine = await pledgesOf(wallet.account); } catch { /* ignore */ }
    if (!S.alive || !card.isConnected) return;
    card.innerHTML = `
      <div class="panel-head"><h2 class="h3">Make a pledge</h2>${c ? `<span class="mono muted" style="font-size:12px">${plural(c.pledges, 'pledge')} for ${esc(c.city)}</span>` : ''}</div>
      ${c ? '' : `<p class="alert is-info" style="margin:0 0 14px">Stamp ${esc(name)} first — pledges are linked to a stamped city.</p>`}
      <div class="pledge-chips" role="group" aria-label="Pick a pledge">${PLEDGES.map((p, i) => `<button type="button" class="chip" data-kind="${i}" aria-pressed="${i === choice}">${p.icon} ${p.label}</button>`).join('')}</div>
      <label class="field" id="ownField" ${choice === 5 ? '' : 'hidden'}><span>Your pledge <small class="muted" id="ownCount">0/100</small></span><input id="ownText" maxlength="100" placeholder="e.g. Fix my bike and ride it to work"></label>
      <div class="field"><span>For how long?</span><div class="weeks" role="group" aria-label="Weeks">${[4, 8, 12].map((w) => `<button type="button" class="chip" data-weeks="${w}" aria-pressed="${w === weeks}">${w} weeks</button>`).join('')}</div></div>
      <button class="btn btn-green btn-block" type="button" id="pledgeBtn" ${c ? '' : 'disabled'}>Make a pledge for ${esc(name)}</button>
      <p class="tx-line" id="pledgeTx"></p>
      <div id="myPledges">${mine.length ? `<h3 class="h3" style="font-size:17px;margin:18px 0 4px">My pledges</h3>` : ''}</div>`;
    $$('[data-kind]', card).forEach((b) => b.addEventListener('click', () => {
      choice = Number(b.dataset.kind);
      $$('[data-kind]', card).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#ownField', card).hidden = choice !== 5;
      if (choice === 5) $('#ownText', card).focus();
    }));
    $$('[data-weeks]', card).forEach((b) => b.addEventListener('click', () => {
      weeks = Number(b.dataset.weeks);
      $$('[data-weeks]', card).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const own = $('#ownText', card);
    own.addEventListener('input', () => ($('#ownCount', card).textContent = `${new TextEncoder().encode(own.value).length}/100`));
    $('#pledgeBtn', card).addEventListener('click', doPledge);
    paintMyPledges(mine);
  }

  async function paintMyPledges(list) {
    const box = $('#myPledges', area);
    if (!box || !list.length) return;
    const names = new Map();
    for (const p of list) if (!names.has(p.cityKey)) names.set(p.cityKey, p.cityKey === S.key ? S.a.place.name : (await fetchCity(p.cityKey).catch(() => null))?.city || 'a city');
    const wk = nowWeek();
    const daysLeft = Math.max(1, Math.ceil(((wk + 1) * WEEK - Date.now() / 1000) / 86400));
    box.insertAdjacentHTML('beforeend', [...list].reverse().map((p) => {
      const done = p.checkIns >= p.weeks;
      const thisWeek = p.checkIns > 0 && p.lastWeek === wk;
      const alive = p.checkIns > 0 && wk - p.lastWeek <= 1;
      const what = p.kind === 5 ? `“${esc(p.text)}”` : `${PLEDGES[p.kind].icon} ${PLEDGES[p.kind].label}`;
      const status = done ? '🎉 Complete — every week checked in' : thisWeek ? `✓ Checked in — next week opens in ${plural(daysLeft, 'day')}` : alive ? '🔥 Streak alive — check in for this week' : p.checkIns ? 'Missed a week — check in to restart your streak' : 'Week 1 — check in when you’ve done it';
      return `<div class="pledge-item">
        <div class="ring" style="--p:${Math.round((p.checkIns / p.weeks) * 100)}"><span>${p.checkIns}/${p.weeks}</span></div>
        <div class="pledge-info"><b>${what}</b><small>${esc(names.get(p.cityKey))} · ${status}</small></div>
        ${done || thisWeek ? '' : `<button class="btn btn-sm btn-green" type="button" data-checkin="${p.id}">Check in</button>`}
      </div>`;
    }).join(''));
    $$('[data-checkin]', box).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const line = $('#pledgeTx', area);
      try {
        txLine(line, 'Confirm your check-in in MetaMask…');
        await checkIn(Number(b.dataset.checkin), (h) => txLine(line, `Checking in… <a href="${explorerTx(h)}" target="_blank" rel="noopener">view transaction ↗</a>`));
        toast('✓ Checked in for this week — nice work!');
        paintPledge();
      } catch (e) { txLine(line, `<span style="color:#8A3216">${esc(e.message)}</span>`); b.disabled = false; }
    }));
  }

  async function doPledge() {
    const btn = $('#pledgeBtn', area), line = $('#pledgeTx', area);
    if (MODE === 'live' && !window.ethereum) return noWalletHelp();
    const text = choice === 5 ? $('#ownText', area).value.trim() : '';
    if (choice === 5 && (!text || new TextEncoder().encode(text).length > 100)) { txLine(line, '<span style="color:#8A3216">Write your pledge in 1–100 characters.</span>'); $('#ownText', area).focus(); return; }
    btn.disabled = true;
    try {
      if (!wallet.account) { txLine(line, 'Connect your wallet…'); await connect(); }
      txLine(line, 'Confirm your pledge in MetaMask…');
      await makePledge(S.key, choice, text, weeks, (h) => txLine(line, `Recording your pledge… <a href="${explorerTx(h)}" target="_blank" rel="noopener">view transaction ↗</a>`));
      toast(`✓ Pledge made for ${esc(S.a.place.name)} — check in every week.`);
      await paintStamp();
      await paintPledge();
    } catch (e) { txLine($('#pledgeTx', area) || line, `<span style="color:#8A3216">${esc(e.message)}</span>`); if ($('#pledgeBtn', area)) $('#pledgeBtn', area).disabled = false; }
  }

  off.push(onChange((what) => { if (what === 'wallet' && S.a) { paintStamp(); paintPledge(); } }));

  // ---------------------------------------------------------------- start
  const slug = params.get('city');
  if (slug) {
    area.innerHTML = '<div class="skeleton" aria-label="Loading"></div>';
    const p = await resolveSlug(slug, params.get('ll'));
    if (p) openPlace(p);
    else {
      search.input.value = slug.replace(/-[a-z]{2}$/, '').replace(/-/g, ' ');
      emptyState(`We couldn’t find “${esc(search.input.value)}”. Pick it from the suggestions in the search box.`);
      search.input.focus();
      search.input.dispatchEvent(new Event('input'));
    }
  } else {
    emptyState();
    if (params.has('compare')) toast('Pick your first city, then add a second one under “Compare”.');
  }

  return () => { S.alive = false; off.forEach((f) => f()); };
}
