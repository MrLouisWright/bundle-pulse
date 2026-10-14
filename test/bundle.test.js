import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, parseSize, stableName, normaliseBudgets, measure, runCli, RULES } from '../src/index.js';

const ids = (r) => [...new Set(r.findings.map((f) => f.rule))].sort();
const io = () => { const o = { s: '', e: '' }; return { o, io: { stdout: { write: (x) => { o.s += x; } }, stderr: { write: (x) => { o.e += x; } } } }; };
const tmp = () => mkdtempSync(join(tmpdir(), 'bp-'));
const rnd = (n, seed = 1) => { let s = seed; let o = ''; while (o.length < n) { s = (s * 1103515245 + 12345) % 2147483648; o += `var a${s % 99991}=${s};`; } return o; };

test('parseSize', () => { assert.equal(parseSize('50 KB'), 50000); assert.equal(parseSize('1KiB'), 1024); assert.equal(parseSize('1.5mb'), 1500000); assert.equal(parseSize(10), 10); assert.equal(parseSize('lots'), null); assert.equal(parseSize('5 parsecs'), null); });
test('stableName strips content hashes', () => {
  assert.equal(stableName('assets/index-BdT9x2Qa.js'), 'assets/index.js'); assert.equal(stableName('main.3f2a9c1b.js'), 'main.js');
  assert.equal(stableName('static/js/main.8e4f1c2a.chunk.js'), 'static/js/main.chunk.js'); assert.equal(stableName('app.js'), 'app.js'); assert.equal(stableName('chunk-vendors.a1b2c3d4e5.css'), 'chunk-vendors.css');
});
test('measure gives raw >= gzip and brotli', () => { const m = measure(Buffer.from(rnd(20000))); assert.ok(m.raw > m.gzip && m.gzip >= m.brotli * 0.9); });
test('normaliseBudgets accepts arrays, maps and CLI', () => {
  assert.deepEqual(normaliseBudgets([{ path: 'a.js', gzip: '1 KB' }]), [{ path: 'a.js', src: 'config', gzip: 1000 }]);
  assert.deepEqual(normaliseBudgets({ 'b.js': '2kb', 'c.js': { brotli: '1kb' } }).map((b) => [b.path, b.gzip, b.brotli]), [['b.js', 2000, undefined], ['c.js', undefined, 1000]]);
  assert.deepEqual(normaliseBudgets([], ['x/*.css=brotli:3KB'])[0].brotli, 3000);
  assert.throws(() => normaliseBudgets([], ['nope'])); assert.throws(() => normaliseBudgets({ a: 'big' })); assert.throws(() => normaliseBudgets([{ gzip: 1 }]));
});
test('good fixture is clean and ignores source maps', () => { const r = check('test/fixtures/good', {}, JSON.parse(readFileSync('test/fixtures/good/.bundle-pulse.json'))); assert.deepEqual(ids(r), []); assert.equal(r.info.files.length, 3); });
test('bad fixture', () => {
  const r = check('test/fixtures/bad', {}, JSON.parse(readFileSync('test/fixtures/bad/.bundle-pulse.json')));
  for (const k of ['bundle-over-budget', 'bundle-total-over-budget', 'bundle-budget-unmatched', 'bundle-unminified', 'bundle-duplicate']) assert.ok(ids(r).includes(k), k);
});
test('growth vs base snapshot across content hashes, new large files', () => {
  const d = tmp(); writeFileSync(join(d, 'main-Aa11Bb22.js'), rnd(20000)); const snap = join(d, 'base.json');
  check(d, { snapshot: snap }); const s = JSON.parse(readFileSync(snap, 'utf8')); assert.equal(s.files[0].name, 'main.js');
  const e = tmp(); writeFileSync(join(e, 'main-Zz99Yy88.js'), rnd(30000)); writeFileSync(join(e, 'new-Qq77Ww66.js'), rnd(400000, 7));
  const r = check(e, { base: snap }); assert.deepEqual(ids(r), ['bundle-growth', 'bundle-new-large']); assert.ok(r.info.deltaGzip > 0); assert.match(r.summaryLine, /vs base/);
  assert.deepEqual(ids(check(e, { base: snap, maxGrowth: 500 })), ['bundle-new-large']);
});
test('near budget and no-budget', () => {
  const d = tmp(); const buf = rnd(30000); writeFileSync(join(d, 'a.js'), buf); writeFileSync(join(d, 'big.js'), rnd(800000, 3));
  const g = measure(Buffer.from(buf)).gzip;
  const r = check(d, { budget: [`a.js=${Math.ceil(g / 0.95)}b`] }); assert.deepEqual(ids(r), ['bundle-near-budget', 'bundle-no-budget']);
});
test('raw and brotli budgets', () => { const d = tmp(); writeFileSync(join(d, 'a.js'), rnd(5000)); assert.deepEqual(ids(check(d, { budget: ['a.js=raw:1KB'] })), ['bundle-over-budget']); assert.deepEqual(ids(check(d, { budget: ['*.js=brotli:100B'] })), ['bundle-over-budget']); });
test('include/exclude and nested dirs', () => { const d = tmp(); mkdirSync(join(d, 'x')); writeFileSync(join(d, 'x', 'a.js'), 'a'); writeFileSync(join(d, 'b.css'), 'b'); assert.equal(check(d, { exclude: ['**/*.css'] }).info.files.length, 1); assert.equal(check(d, { include: ['**/*.css'] }).info.files.length, 1); });
test('missing base is a usage error unless optional', () => { const d = tmp(); assert.throws(() => check(d, { base: join(d, 'nope.json') })); assert.doesNotThrow(() => check(d, { base: join(d, 'nope.json'), baseOptional: true })); });
test('CLI exit codes and SARIF', async () => {
  const cli = { name: 'bundle-pulse', version: '1.0.0', configKey: 'bundlePulse', rules: RULES, tagline: 't', usage: 'u', help: '', options: {}, run: async ({ dir, config }) => check(dir, {}, config) };
  let t = io(); assert.equal(await runCli(cli, ['test/fixtures/good', '--fail-on', 'low'], t.io), 0);
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/bad', '-f', 'sarif'], t.io), 1); assert.equal(JSON.parse(t.o.s).version, '2.1.0');
  t = io(); assert.equal(await runCli(cli, ['test/fixtures/none'], t.io), 2);
});
