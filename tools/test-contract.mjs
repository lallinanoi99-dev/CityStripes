// Runs the compiled MyCityStripes contract on an in-memory chain and checks every rule in PRD section 5.
// Usage (from the project root): node tools/compile.mjs && node tools/test-contract.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import * as ethers from 'ethers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { abi, bytecode } = JSON.parse(readFileSync(join(root, 'build/MyCityStripes.json'), 'utf8'));
const chain = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'merge', chainId: 677 }, wallet: { totalAccounts: 4 } });
const provider = new ethers.BrowserProvider(chain);
const [alice, bob, carol] = await Promise.all([0, 1, 2].map((i) => provider.getSigner(i)));
const c = await (await new ethers.ContractFactory(abi, bytecode, alice).deploy()).waitForDeployment();
const as = (s) => c.connect(s);
const reverts = (call, name) => assert.rejects(call, (e) => e.revert?.name === name || (e.message || '').includes(name), `expected ${name}`);
let checks = 0;
const ok = (label) => { checks++; console.log(`  ✓ ${label}`); };
const gas = async (txp) => Number((await (await txp).wait()).gasUsed);
const warp = async (seconds) => { await chain.request({ method: 'evm_increaseTime', params: [seconds] }); await chain.request({ method: 'evm_mine', params: [] }); };

const lastYear = new Date().getUTCFullYear() - 1;
const years = lastYear - 1940 + 1;
const stripes = (seed = 0) => '0x' + Array.from({ length: years }, (_, i) => ((i - 40 + seed) & 0xff).toString(16).padStart(2, '0')).join('');
const hash = ethers.sha256(ethers.toUtf8Bytes('1940:26.10,26.20'));
const stamp = (over = {}) => ({ city: 'Bangkok', country: 'Thailand', latE2: 1375, lonE2: 10050, fromYear: 1940, toYear: lastYear, warmingE2: 112, dataHash: hash, stripes: stripes(), ...over });
const KEY = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['int32', 'int32'], [1375, 10050]));

console.log('MyCityStripes contract');
assert.deepEqual([...(await c.stats())], [0n, 0n, 0n]);
assert.equal(await c.cityKey(1375, 10050), KEY);
assert.equal(Number(await c.currentYear()), new Date().getUTCFullYear());
ok('deploys with empty stats; cityKey = keccak256(abi.encode(latE2, lonE2)); currentYear() is right');

// --- stampCity validation
await reverts(as(alice).stampCity.staticCall(stamp({ city: '' })), 'BadName');
await reverts(as(alice).stampCity.staticCall(stamp({ city: 'x'.repeat(65) })), 'BadName');
await reverts(as(alice).stampCity.staticCall(stamp({ latE2: 9001 })), 'BadCoordinates');
await reverts(as(alice).stampCity.staticCall(stamp({ lonE2: -18001 })), 'BadCoordinates');
await reverts(as(alice).stampCity.staticCall(stamp({ fromYear: 1939, stripes: '0x00' + stripes().slice(2) })), 'BadYears');
await reverts(as(alice).stampCity.staticCall(stamp({ toYear: lastYear + 1, stripes: stripes() + '00' })), 'BadYears');
await reverts(as(alice).stampCity.staticCall(stamp({ warmingE2: 1001 })), 'BadWarming');
await reverts(as(alice).stampCity.staticCall(stamp({ dataHash: ethers.ZeroHash })), 'BadHash');
await reverts(as(alice).stampCity.staticCall(stamp({ stripes: stripes() + '00' })), 'BadStripes');
ok('stampCity rejects bad names, coordinates, years (before 1940 / current year), warming, empty hash, wrong stripe count');

// --- first stamp
const firstGas = await gas(as(alice).stampCity(stamp()));
let city = await c.getCity(KEY);
assert.equal(city.city, 'Bangkok'); assert.equal(city.by, alice.address); assert.equal(city.warmingE2, 112n);
assert.equal(city.stamps, 1n); assert.equal(city.pledges, 0n); assert.equal(city.stripes, stripes()); assert.ok(city[10] > 0n);
assert.equal(await c.cityList(0), KEY);
ok(`first stamp creates the city with its stripes (${firstGas.toLocaleString()} gas)`);

// --- same wallet again → AlreadyStamped; another wallet → +1, no overwrite
await reverts(as(alice).stampCity.staticCall(stamp()), 'AlreadyStamped');
const ev = (await (await as(bob).stampCity(stamp({ city: 'Krung Thep', warmingE2: 50 }))).wait()).logs.map((l) => c.interface.parseLog(l)).find((l) => l?.name === 'CityStamped');
assert.deepEqual([...ev.args], [KEY, bob.address, 112n]);
city = await c.getCity(KEY);
assert.equal(city.city, 'Bangkok'); assert.equal(city.stamps, 2n); assert.equal(city.by, alice.address);
assert.equal(await c.cityCount(), 1n);
ok('same wallet can’t stamp twice; another wallet adds “+1 stamped” without overwriting');

// --- newer data overwrites (simulate: existing record has an older toYear)
const K2 = await c.cityKey(5151, -13);
await as(alice).stampCity(stamp({ city: 'London', country: 'United Kingdom', latE2: 5151, lonE2: -13, toYear: lastYear - 1, stripes: stripes().slice(0, -2), warmingE2: 90 }));
await as(alice).stampCity(stamp({ city: 'London', country: 'United Kingdom', latE2: 5151, lonE2: -13, warmingE2: 120 }));
city = await c.getCity(K2);
assert.equal(city.toYear, BigInt(lastYear)); assert.equal(city.warmingE2, 120n); assert.equal(city.stamps, 1n);
ok('a later toYear replaces the summary (even by the same wallet) and keeps the stamp count');

await reverts(c.getCity(ethers.ZeroHash), 'UnknownCity');
const [keys, list] = await c.getCities(0, 10);
assert.deepEqual([...keys], [KEY, K2]); assert.equal(list[1].city, 'London');
assert.equal((await c.getCities(1, 10))[0].length, 1); assert.equal((await c.getCities(5, 10))[0].length, 0);
ok('getCity / getCities paginate; unknown city reverts');

// --- pledges
await reverts(as(carol).makePledge.staticCall(ethers.ZeroHash, 0, '', 4), 'UnknownCity');
await reverts(as(carol).makePledge.staticCall(KEY, 6, '', 4), 'BadKind');
await reverts(as(carol).makePledge.staticCall(KEY, 0, 'text', 4), 'BadText');
await reverts(as(carol).makePledge.staticCall(KEY, 5, '', 4), 'BadText');
await reverts(as(carol).makePledge.staticCall(KEY, 5, 'x'.repeat(101), 4), 'BadText');
for (const w of [0, 3, 5, 13]) await reverts(as(carol).makePledge.staticCall(KEY, 0, '', w), 'BadWeeks');
ok('makePledge rejects unknown city, kind > 5, text on presets, empty or > 100 bytes own text, weeks ∉ {4, 8, 12}');

const pledgeGas = await gas(as(carol).makePledge(KEY, 0, '', 4));
await as(carol).makePledge(KEY, 5, 'Fix my bike and ride it to work', 8);
await as(bob).makePledge(K2, 2, '', 12);
assert.equal((await c.getCity(KEY)).pledges, 2n);
const [mine, mineList] = await c.pledgesOf(carol.address);
assert.deepEqual([...mine], [1n, 2n]); assert.equal(mineList[1].text, 'Fix my bike and ride it to work'); assert.equal(mineList[1].durationWeeks, 8n);
assert.deepEqual([...(await c.pledgesForCity(K2))[0]], [3n]);
ok(`pledges count on the city and list per owner / per city (${pledgeGas.toLocaleString()} gas)`);

// --- check-ins
await reverts(as(bob).checkIn.staticCall(1), 'NotYourPledge');
await reverts(as(carol).checkIn.staticCall(99), 'UnknownPledge');
await as(carol).checkIn(1);
await reverts(as(carol).checkIn.staticCall(1), 'AlreadyCheckedIn');
let p = await c.getPledge(1);
assert.equal(p.checkIns, 1n); assert.equal(p.lastWeek, await c.currentWeek());
for (let i = 0; i < 3; i++) { await warp(7 * 86400); await as(carol).checkIn(1); }
assert.equal((await c.getPledge(1)).checkIns, 4n);
await warp(7 * 86400);
await reverts(as(carol).checkIn.staticCall(1), 'PledgeComplete');
ok('checkIn: owner only, once per week, stops at the pledge length');

assert.deepEqual([...(await c.stats())], [2n, 3n, 4n]);
ok('stats() = cities, pledges, check-ins');

console.log(`\n${checks} checks passed`);
process.exit(0);
