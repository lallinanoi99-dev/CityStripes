// Everything that talks to BOT Chain (or to the preview simulation).
// Live mode: reads go through the public RPC (no wallet needed); writes go through MetaMask.
// Preview mode (no contract address configured, or ?preview): the same rules run locally in localStorage.
import { CONFIG } from './config.js';
import { FIRST_YEAR } from './climate.js';

const params = new URLSearchParams(location.search);
const netKey = params.get('net') === 'testnet' ? 'testnet' : 'mainnet';
const NET = { ...CONFIG.networks[netKey], key: netKey };
const SK = CONFIG.storageKey;

// localhost only: deploy.html remembers the address it just deployed; ?rpc=…&contract=… points at a dev chain.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  try {
    if (params.get('rpc') && params.get('contract')) sessionStorage.setItem(`${SK}.dev`, JSON.stringify({ rpc: params.get('rpc'), contract: params.get('contract') }));
    const dev = JSON.parse(sessionStorage.getItem(`${SK}.dev`) || 'null');
    if (dev) { NET.rpc = dev.rpc; NET.contract = dev.contract; }
    else if (!NET.contract) NET.contract = localStorage.getItem(`${SK}.contract.${NET.chainId}`) || '';
  } catch { /* ignore */ }
}

export const MODE = NET.contract && params.get('preview') === null ? 'live' : 'preview';
export { NET };
export const explorerAddress = (a) => `${NET.explorer}/address/${a}`;
export const explorerTx = (h) => `${NET.explorer}/tx/${h}`;
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const WEEK = 7 * 24 * 3600;
export const nowWeek = () => Math.floor(Date.now() / 1000 / WEEK);

const CITY = 'tuple(address by,string city,string country,int32 latE2,int32 lonE2,uint16 fromYear,uint16 toYear,int16 warmingE2,bytes32 dataHash,uint32 pledges,uint64 at,uint32 stamps,bytes stripes)';
const PLEDGE = 'tuple(address by,bytes32 cityKey,uint8 kind,string text,uint8 durationWeeks,uint8 checkIns,uint32 lastWeek,uint64 at)';
const ABI = [
  'function stampCity(tuple(string city,string country,int32 latE2,int32 lonE2,uint16 fromYear,uint16 toYear,int16 warmingE2,bytes32 dataHash,bytes stripes)) returns (bytes32)',
  'function makePledge(bytes32,uint8,string,uint8) returns (uint256)',
  'function checkIn(uint256)',
  `function getCity(bytes32) view returns (${CITY})`,
  `function getCities(uint256,uint256) view returns (bytes32[], ${CITY}[])`,
  `function pledgesOf(address) view returns (uint256[], ${PLEDGE}[])`,
  `function pledgesForCity(bytes32) view returns (uint256[], ${PLEDGE}[])`,
  'function hasStamped(bytes32,address) view returns (bool)',
  'function cityCount() view returns (uint256)',
  'function stats() view returns (uint256,uint256,uint256)',
  'event CityStamped(bytes32 indexed key, address indexed by, int16 warmingE2)',
  'event Pledged(uint256 indexed id, address indexed by, bytes32 indexed cityKey, uint8 kind)',
  'event CheckedIn(uint256 indexed id, uint32 week, uint8 count)',
  'error BadName()', 'error BadCoordinates()', 'error BadYears()', 'error BadWarming()', 'error BadHash()', 'error BadStripes()',
  'error AlreadyStamped()', 'error UnknownCity()', 'error BadKind()', 'error BadText()', 'error BadWeeks()', 'error UnknownPledge()',
  'error NotYourPledge()', 'error AlreadyCheckedIn()', 'error PledgeComplete()',
];

// ------------------------------------------------------------------ events
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (what) => listeners.forEach((fn) => fn(what));

export const wallet = { account: '', chainOk: true, hasWallet: typeof window.ethereum !== 'undefined' };

export class ChainError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const MESSAGES = {
  BadName: 'The city name is too long to stamp.',
  BadCoordinates: 'Those coordinates are off the map.',
  BadYears: 'Only complete years from 1940 can be stamped.',
  BadWarming: 'That warming number is out of range.',
  BadHash: 'The data fingerprint is missing — reload the city and try again.',
  BadStripes: 'The stripes don’t match the years — reload the city and try again.',
  AlreadyStamped: 'You’ve already stamped this city. ✓',
  UnknownCity: 'Stamp this city first, then make your pledge.',
  BadKind: 'Pick one of the pledges.',
  BadText: 'Your own pledge needs 1–100 characters.',
  BadWeeks: 'Pick 4, 8 or 12 weeks.',
  UnknownPledge: 'That pledge doesn’t exist.',
  NotYourPledge: 'Only the person who made this pledge can check in.',
  AlreadyCheckedIn: 'Already checked in this week.',
  PledgeComplete: 'This pledge is complete — every week checked in! 🎉',
  rejected: 'Cancelled in MetaMask — nothing was sent. You can try again.',
  noWallet: 'Install MetaMask to stamp your city and make pledges. Everything else works without it.',
  wrongNetwork: 'Switch to BOT Chain to continue.',
  failed: 'The transaction failed — try again.',
};
const fail = (code, extra) => { throw new ChainError(code, MESSAGES[code] || extra || 'Something went wrong.'); };

const num = Number;
// Read by position — ethers results have a built-in .at() method that shadows a field named `at`.
const decodeCity = (key, c) => ({
  key, by: c[0], city: c[1], country: c[2], latE2: num(c[3]), lonE2: num(c[4]), fromYear: num(c[5]), toYear: num(c[6]),
  warmingE2: num(c[7]), dataHash: c[8], pledges: num(c[9]), at: num(c[10]), stamps: num(c[11]), stripes: c[12],
});
const decodePledge = (id, p) => ({
  id: num(id), by: p[0], cityKey: p[1], kind: num(p[2]), text: p[3], weeks: num(p[4]), checkIns: num(p[5]), lastWeek: num(p[6]), at: num(p[7]),
});

// ================================================================== LIVE
let ethersReady;
export function loadEthers() {
  if (window.ethers) return Promise.resolve(window.ethers);
  ethersReady ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.5/ethers.umd.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.ethers);
    s.onerror = () => { ethersReady = null; reject(new Error('Could not load ethers.js')); };
    document.head.append(s);
  });
  return ethersReady;
}

/** Same as the contract's cityKey(): keccak256(abi.encode(int32 latE2, int32 lonE2)). */
export async function cityKey(latE2, lonE2) {
  const { keccak256, AbiCoder } = await loadEthers();
  return keccak256(AbiCoder.defaultAbiCoder().encode(['int32', 'int32'], [latE2, lonE2]));
}

let reader, rpcProvider;
async function provider() {
  if (rpcProvider) return rpcProvider;
  const { JsonRpcProvider } = await loadEthers();
  rpcProvider = new JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
  return rpcProvider;
}
async function readContract() {
  if (reader) return reader;
  const { Contract } = await loadEthers();
  reader = new Contract(NET.contract, ABI, await provider());
  return reader;
}

/** Latest block number from the public RPC (works in both modes — the footer's live status). */
export async function blockNumber() {
  return (await provider()).getBlockNumber();
}

const live = {
  async stats() { const [c, p, k] = await (await readContract()).stats(); return { cities: num(c), pledges: num(p), checkIns: num(k) }; },
  async allCities() {
    const c = await readContract();
    const n = num(await c.cityCount());
    const out = [];
    for (let from = 0; from < n; from += 50) {
      const [keys, list] = await c.getCities(from, 50);
      keys.forEach((k, i) => out.push(decodeCity(k, list[i])));
    }
    return out;
  },
  async getCity(key) {
    try { return decodeCity(key, await (await readContract()).getCity(key)); } catch (e) { if (/UnknownCity|CALL_EXCEPTION/.test(e?.revert?.name || e?.code || e?.message || '')) return null; throw e; }
  },
  async hasStamped(key, who) { return (await readContract()).hasStamped(key, who); },
  async pledgesOf(who) { const [ids, list] = await (await readContract()).pledgesOf(who); return ids.map((id, i) => decodePledge(id, list[i])); },
  async pledgesForCity(key) { const [ids, list] = await (await readContract()).pledgesForCity(key); return ids.map((id, i) => decodePledge(id, list[i])); },
  async send(method, args, onSent) {
    const signer = await signerFor();
    const c = new (window.ethers.Contract)(NET.contract, ABI, signer);
    try {
      await c[method].staticCall(...args); // surfaces custom errors before MetaMask opens
      const tx = await c[method](...args);
      onSent?.(tx.hash);
      const receipt = await tx.wait();
      if (receipt.status !== 1) fail('failed');
      const logs = receipt.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).filter(Boolean);
      return { hash: tx.hash, logs };
    } catch (e) { throw liveError(e, c.interface); }
  },
};

function liveError(e, iface) {
  if (e instanceof ChainError) return e;
  if (e.code === 'ACTION_REJECTED' || e.code === 4001 || e.info?.error?.code === 4001) return new ChainError('rejected', MESSAGES.rejected);
  const name = e.revert?.name || (() => { try { return iface.parseError(e.data)?.name; } catch { return null; } })();
  if (name && MESSAGES[name]) return new ChainError(name, MESSAGES[name]);
  return new ChainError('failed', e.shortMessage || e.message || MESSAGES.failed);
}

async function switchChain() {
  const chainId = '0x' + NET.chainId.toString(16);
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (e) {
    const unknown = e.code === 4902 || e?.data?.originalError?.code === 4902 || /unrecognized chain/i.test(e.message || '');
    if (!unknown) throw e;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId, chainName: NET.name, nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: [NET.rpc], blockExplorerUrls: [NET.explorer] }],
    });
  }
}
export async function switchNetwork() {
  if (MODE === 'preview') return;
  try { await switchChain(); } catch (e) { if (e.code === 4001) fail('rejected'); fail('wrongNetwork'); }
  await refreshChain();
  emit('wallet');
}
async function refreshChain() {
  if (!window.ethereum) return;
  const id = await ethereum.request({ method: 'eth_chainId' });
  wallet.chainOk = parseInt(id, 16) === NET.chainId;
}
async function signerFor() {
  if (!window.ethereum) fail('noWallet');
  const { BrowserProvider } = await loadEthers();
  if (!wallet.account) await connect();
  if (!wallet.chainOk) { await switchNetwork(); if (!wallet.chainOk) fail('wrongNetwork'); }
  return new BrowserProvider(window.ethereum).getSigner();
}

// ================================================================== PREVIEW
// A faithful local copy of the contract rules, so the whole app can be tried before deploying.
const PKEY = `${SK}.preview.v1`;
export const PREVIEW_WALLETS = ['0x' + 'a11ce'.padEnd(39, '0') + '1', '0x' + 'b0b'.padEnd(39, '0') + '2'];
const empty = () => ({ cities: {}, list: [], stamped: {}, pledges: [], checkIns: 0 });
const pload = () => { try { return { ...empty(), ...(JSON.parse(localStorage.getItem(PKEY) || 'null') || {}) }; } catch { return empty(); } };
const psave = (s) => { try { localStorage.setItem(PKEY, JSON.stringify(s)); } catch { /* ignore */ } };
const fakeHash = () => '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const bytes = (s) => new TextEncoder().encode(s).length;
const nowSec = () => Math.floor(Date.now() / 1000);

const preview = {
  async stats() { const s = pload(); return { cities: s.list.length, pledges: s.pledges.length, checkIns: s.checkIns }; },
  async allCities() { const s = pload(); return s.list.map((k) => ({ key: k, ...s.cities[k] })); },
  async getCity(key) { const c = pload().cities[key]; return c ? { key, ...c } : null; },
  async hasStamped(key, who) { return (pload().stamped[key] || []).some((a) => sameAddr(a, who)); },
  async pledgesOf(who) { return pload().pledges.map((p, i) => ({ id: i + 1, ...p })).filter((p) => sameAddr(p.by, who)); },
  async pledgesForCity(key) { return pload().pledges.map((p, i) => ({ id: i + 1, ...p })).filter((p) => p.cityKey === key); },
  async send(method, args, onSent) {
    if (!wallet.account) await connect();
    const s = pload();
    const me = wallet.account;
    const logs = [];
    if (method === 'stampCity') {
      const [x] = args;
      const year = new Date().getUTCFullYear();
      const len = bytes(x.city);
      if (!len || len > 64 || bytes(x.country) > 64) fail('BadName');
      if (Math.abs(x.latE2) > 9000 || Math.abs(x.lonE2) > 18000) fail('BadCoordinates');
      if (x.fromYear < FIRST_YEAR || x.toYear <= x.fromYear || x.toYear >= year) fail('BadYears');
      if (Math.abs(x.warmingE2) > 1000) fail('BadWarming');
      if (!x.dataHash || /^0x0+$/.test(x.dataHash)) fail('BadHash');
      if ((x.stripes.length - 2) / 2 !== x.toYear - x.fromYear + 1) fail('BadStripes');
      const key = await cityKey(x.latE2, x.lonE2);
      const c = s.cities[key];
      const newer = c && x.toYear > c.toYear;
      const firstByYou = !(s.stamped[key] || []).some((a) => sameAddr(a, me));
      if (c && !newer && !firstByYou) fail('AlreadyStamped');
      const data = { city: x.city, country: x.country, fromYear: x.fromYear, toYear: x.toYear, warmingE2: x.warmingE2, dataHash: x.dataHash, stripes: x.stripes };
      if (!c) { s.cities[key] = { by: me, latE2: x.latE2, lonE2: x.lonE2, pledges: 0, at: nowSec(), stamps: 0, ...data }; s.list.push(key); }
      else if (newer) Object.assign(c, data);
      if (firstByYou) { (s.stamped[key] ||= []).push(me); s.cities[key].stamps += 1; }
      logs.push({ name: 'CityStamped', args: [key, me, x.warmingE2] });
    } else if (method === 'makePledge') {
      const [key, kind, text, weeks] = args;
      const c = s.cities[key];
      if (!c) fail('UnknownCity');
      if (kind > 5) fail('BadKind');
      const len = bytes(text);
      if (kind === 5 ? !len || len > 100 : len) fail('BadText');
      if (![4, 8, 12].includes(weeks)) fail('BadWeeks');
      s.pledges.push({ by: me, cityKey: key, kind, text, weeks, checkIns: 0, lastWeek: 0, at: nowSec() });
      c.pledges += 1;
      logs.push({ name: 'Pledged', args: [s.pledges.length, me, key, kind] });
    } else if (method === 'checkIn') {
      const [id] = args;
      const p = s.pledges[id - 1];
      if (!p) fail('UnknownPledge');
      if (!sameAddr(p.by, me)) fail('NotYourPledge');
      if (p.checkIns >= p.weeks) fail('PledgeComplete');
      const week = nowWeek();
      if (p.checkIns > 0 && p.lastWeek === week) fail('AlreadyCheckedIn');
      p.lastWeek = week; p.checkIns += 1; s.checkIns += 1;
      logs.push({ name: 'CheckedIn', args: [id, week, p.checkIns] });
    }
    const hash = fakeHash();
    onSent?.(hash);
    await pause(900);
    psave(s);
    return { hash, logs };
  },
};

const impl = () => (MODE === 'live' ? live : preview);

// ================================================================== API
export async function connect() {
  if (MODE === 'preview') {
    let i = 0;
    try { i = Number(localStorage.getItem(`${SK}.previewWallet`) || 0); } catch { /* ignore */ }
    wallet.account = PREVIEW_WALLETS[i] || PREVIEW_WALLETS[0];
    wallet.chainOk = true;
    try { localStorage.setItem(`${SK}.connected`, '1'); } catch { /* ignore */ }
    emit('wallet');
    return wallet.account;
  }
  if (!window.ethereum) fail('noWallet');
  let accounts;
  try { accounts = await ethereum.request({ method: 'eth_requestAccounts' }); } catch (e) { if (e.code === 4001) fail('rejected'); throw e; }
  wallet.account = accounts[0] || '';
  await refreshChain();
  if (!wallet.chainOk) { try { await switchChain(); await refreshChain(); } catch { /* user can switch later */ } }
  try { localStorage.setItem(`${SK}.connected`, '1'); } catch { /* ignore */ }
  emit('wallet');
  return wallet.account;
}

export function disconnect() {
  wallet.account = '';
  try { localStorage.removeItem(`${SK}.connected`); } catch { /* ignore */ }
  emit('wallet');
}

export function switchPreviewWallet(i) {
  try { localStorage.setItem(`${SK}.previewWallet`, String(i)); } catch { /* ignore */ }
  wallet.account = PREVIEW_WALLETS[i];
  emit('wallet');
}

export async function initWallet() {
  let remembered = false;
  try { remembered = localStorage.getItem(`${SK}.connected`) === '1'; } catch { /* ignore */ }
  if (MODE === 'preview') { if (remembered) await connect(); return; }
  if (!window.ethereum) return;
  try {
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    if (accounts[0] && remembered) { wallet.account = accounts[0]; await refreshChain(); emit('wallet'); }
  } catch { /* ignore */ }
  ethereum.on?.('accountsChanged', (a) => { wallet.account = a[0] || ''; emit('wallet'); });
  ethereum.on?.('chainChanged', async () => { await refreshChain(); emit('wallet'); });
}

export const stats = () => impl().stats();
export const allCities = () => impl().allCities();
export const getCity = (key) => impl().getCity(key);
export const hasStamped = (key, who) => impl().hasStamped(key, who);
export const pledgesOf = (who) => impl().pledgesOf(who);
export const pledgesForCity = (key) => impl().pledgesForCity(key);

async function send(method, args, onSent) {
  const r = await impl().send(method, args, onSent);
  emit('stats');
  return r;
}
export const stampCity = (input, onSent) => send('stampCity', [input], onSent);
export const makePledge = (key, kind, text, weeks, onSent) => send('makePledge', [key, kind, text, weeks], onSent);
export const checkIn = (id, onSent) => send('checkIn', [id], onSent);
