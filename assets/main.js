// Router, navbar, wallet button, preview bar and the live footer.
import { CONFIG } from './config.js';
import { MODE, NET, wallet, onChange, connect, initWallet, switchNetwork, switchPreviewWallet, short, stats, explorerAddress, PREVIEW_WALLETS, sameAddr, blockNumber, allCities, disconnect } from './chain.js';
import { $, $$, toast, copyText, fmt, reduced, LOGO } from './ui.js';
import { featured } from './data.js';
import { analyze, PALETTE, colorsFor, stripesFromBytes } from './climate.js';

const BASE = window.MCS_BASE || '/';
const view = document.getElementById('view');
let cleanup = null;
let renderId = 0;

const ROUTES = [
  [/^$/, 'home', () => import('./home.js').then((m) => m.renderHome)],
  [/^app\/?$/, 'app', () => import('./app.js').then((m) => m.renderApp)],
  [/^app\/wall\/?$/, 'wall', () => import('./wall.js').then((m) => m.renderWall)],
];

export const routePath = () => decodeURIComponent(location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, ''));
export const href = (path) => BASE + path.replace(/^\//, '');

export function go(path, { replace = false } = {}) {
  const url = new URL(path, location.origin + BASE);
  const keep = new URLSearchParams(location.search);
  for (const k of ['net', 'preview']) if (keep.has(k) && !url.searchParams.has(k)) url.searchParams.set(k, keep.get(k));
  history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
  return render();
}

async function render() {
  const id = ++renderId;
  const path = routePath();
  const hit = ROUTES.find(([re]) => re.test(path));
  try { cleanup?.(); } catch { /* ignore */ }
  cleanup = null;
  window.ScrollTrigger?.getAll().forEach((t) => t.kill());
  closeMenu();
  document.body.dataset.page = hit ? hit[1] : '404';
  if (!hit) {
    view.innerHTML = `<section class="lost"><div class="wrap"><p class="eyebrow">404 · Not found</p><h1 class="h1">No stripes here.</h1><p class="muted">We couldn’t find <code>/${path.replace(/[<>&"]/g, '')}</code>.</p><a class="btn" href="./" data-link>Back home</a></div></section>`;
    return;
  }
  await waitFor(() => window.gsap);
  if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger, ...(window.SplitText ? [SplitText] : []));
  const fn = await hit[2]();
  if (id !== renderId) return;
  const anchor = location.hash.slice(1);
  const isAnchor = hit[1] === 'home' && anchor && /^[a-z-]+$/.test(anchor);
  if (!isAnchor) window.scrollTo(0, 0);
  cleanup = (await fn(view)) || null;
  if (id !== renderId) return;
  if (isAnchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }));
  window.ScrollTrigger?.refresh();
}

function waitFor(test, tries = 80) {
  if (test()) return Promise.resolve();
  return new Promise((resolve) => { let n = 0; const t = setInterval(() => { if (test() || ++n > tries) { clearInterval(t); resolve(); } }, 50); });
}

// ------------------------------------------------------------------ links
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target === '_blank') return;
  e.preventDefault();
  const anchor = a.dataset.anchor;
  if (anchor && routePath() === '') {
    history.replaceState(null, '', href('') + location.search + '#' + anchor);
    document.getElementById(anchor)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
    closeMenu();
    return;
  }
  go(a.getAttribute('href'));
});
addEventListener('popstate', () => render());

// ------------------------------------------------------------------ nav
$('#navLogo').innerHTML = LOGO;
$('#footLogo').innerHTML = LOGO;
const nav = $('#nav');
const menuBtn = $('#navMenu');
function closeMenu() { nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
});
addEventListener('scroll', () => nav.classList.toggle('is-scrolled', scrollY > 20), { passive: true });

const walletBtn = $('#walletBtn');
function paintWallet() {
  walletBtn.classList.remove('is-on', 'is-wrong');
  if (!wallet.account) { walletBtn.textContent = 'Connect wallet'; walletBtn.title = ''; return; }
  if (!wallet.chainOk) { walletBtn.textContent = 'Switch to BOT Chain'; walletBtn.classList.add('is-wrong'); return; }
  walletBtn.innerHTML = `<span class="dot" aria-hidden="true"></span>${short(wallet.account)}`;
  walletBtn.title = 'Connected — click to disconnect';
  walletBtn.classList.add('is-on');
}
walletBtn.addEventListener('click', async () => {
  try {
    if (!wallet.account) {
      if (!window.ethereum && MODE === 'live') return noWalletHelp();
      await connect();
      toast(`✓ Connected ${short(wallet.account)}${wallet.chainOk ? '' : ' — switch to BOT Chain to stamp'}`);
    } else if (!wallet.chainOk) {
      await switchNetwork();
    } else {
      disconnect();
      toast('Disconnected.');
    }
  } catch (e) { toast(e.message, 'bad'); }
});
onChange((what) => { if (what === 'wallet') { paintWallet(); paintPreviewBar(); } if (what === 'stats') refreshFooter(); });

export function noWalletHelp() {
  toast('Install <a href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a> to stamp cities and make pledges. Searching, stripes and downloads work without it.', '', 7000);
}

// ------------------------------------------------------------------ preview bar
const bar = $('#previewBar');
function paintPreviewBar() {
  if (MODE !== 'preview') return;
  bar.hidden = false;
  const i = PREVIEW_WALLETS.findIndex((w) => sameAddr(w, wallet.account));
  bar.innerHTML = `<span><b>Preview mode</b><span class="pb-long"> — stamps and pledges are simulated in this browser until the contract is deployed.</span></span>
    <span class="pw">Try as <button type="button" data-pw="0" class="${i === 0 ? 'on' : ''}">wallet A</button><button type="button" data-pw="1" class="${i === 1 ? 'on' : ''}">wallet B</button></span>`;
  $$('[data-pw]', bar).forEach((b) => b.addEventListener('click', () => { switchPreviewWallet(Number(b.dataset.pw)); toast(`Now using preview wallet ${b.dataset.pw === '0' ? 'A' : 'B'} · ${short(wallet.account)}`); }));
}

// ------------------------------------------------------------------ footer
const addr = NET.contract;
$('#footChain').textContent = NET.chainId;
$('#footAddr').textContent = addr ? short(addr) : 'contract not deployed yet';
$('#footCopy').title = addr || '';
$('#footCopy').disabled = !addr;
$('#footCopy').addEventListener('click', () => addr && copyText(addr, 'Contract address copied'));
$('#footExplorer').href = addr ? explorerAddress(addr) : NET.explorer;
$('#footNow').href = addr ? explorerAddress(addr) : NET.explorer;
$('#footX').href = CONFIG.links.x;
$('#footGit').href = CONFIG.links.github;

async function refreshFooter() {
  try {
    const s = await stats();
    $('#footLive').textContent = `CITIES ${fmt(s.cities)} · PLEDGES ${fmt(s.pledges)}${MODE === 'preview' ? ' · PREVIEW' : ''}`;
  } catch { $('#footLive').textContent = ''; }
}
async function refreshBlock() {
  try {
    const n = await blockNumber();
    $('#footDot').className = 'dot';
    $('#footStatus').textContent = `BOT Chain live · block #${fmt(n)}`;
  } catch {
    $('#footDot').className = 'dot is-off';
    $('#footStatus').textContent = 'BOT Chain status unavailable';
  }
}

/** Footer stripes: the most-stamped city on the Wall, else the first featured city. The last stripe is "now", on BOT Chain. */
async function paintFooterBand() {
  let colors = null, label = '';
  try {
    const cities = await allCities();
    const top = cities.sort((a, b) => b.stamps - a.stamps || a.at - b.at)[0];
    if (top) { colors = colorsFor(stripesFromBytes(top.stripes)); label = `${top.city} · ${top.fromYear}–${top.toYear}`; }
  } catch { /* fall back */ }
  if (!colors) {
    const f = (await featured()).cities[0];
    if (f) { const a = analyze(f.summary); colors = a.colors; label = `${f.name} · ${f.summary.from}–${f.summary.to}`; }
  }
  if (!colors) return;
  const box = $('#footStripes');
  box.innerHTML = colors.map((c) => `<span style="background:${PALETTE[c]}"></span>`).join('');
  $('#footBand').setAttribute('aria-label', `Stripes for ${label}; the last stripe is this year, recorded on BOT Chain`);
}

refreshFooter();
refreshBlock();
setInterval(refreshBlock, 15000);
paintFooterBand();

// ------------------------------------------------------------------ boot
initWallet().then(paintWallet);
paintPreviewBar();
render();
