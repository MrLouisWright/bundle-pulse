// bundle-pulse: JS/CSS bundle size budgets (raw/gzip/brotli) per entry, with diff against a base snapshot.
// Zero dependencies. Louis Wright, MIT.
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep, resolve } from 'node:path';
import { gzipSync, brotliCompressSync, constants as Z } from 'node:zlib';
import { createHash } from 'node:crypto';
import { buildReport, UsageError } from './core.js';

export * from './core.js';

export const RULES = {
  'bundle-over-budget': { severity: 'high', title: 'File is larger than its budget' },
  'bundle-total-over-budget': { severity: 'high', title: 'Total JS or CSS is larger than its budget' },
  'bundle-growth': { severity: 'medium', title: 'File grew more than the allowed percentage since the base snapshot' },
  'bundle-budget-unmatched': { severity: 'medium', title: 'Budget glob matches no file (renamed entry or stale budget)' },
  'bundle-unminified': { severity: 'medium', title: 'Large file looks unminified' },
  'bundle-near-budget': { severity: 'low', title: 'File is within the warning margin of its budget' },
  'bundle-new-large': { severity: 'low', title: 'New file since the base snapshot is large' },
  'bundle-duplicate': { severity: 'low', title: 'Identical file shipped under more than one name' },
  'bundle-no-budget': { severity: 'info', title: 'Large file has no budget' },
};

const UNITS = { b: 1, kb: 1000, k: 1000, kib: 1024, mb: 1e6, m: 1e6, mib: 1048576 };
/** "50 KB" | "50kb" | "1.2MB" | 51200 -> bytes. */
export function parseSize(v) {
  if (typeof v === 'number') return v;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(String(v ?? ''));
  if (!m) return null; const u = (m[2] || 'b').toLowerCase(); if (!(u in UNITS)) return null;
  return Math.round(+m[1] * UNITS[u]);
}
export const fmtSize = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)} kB` : `${n} B`);

function globToRe(g) {
  let s = ''; g = String(g).replace(/^\.?\//, '');
  for (let k = 0; k < g.length; k++) { const c = g[k]; if (c === '*') { if (g[k + 1] === '*') { s += '.*'; k++; if (g[k + 1] === '/') k++; } else s += '[^/]*'; } else if (c === '?') s += '[^/]'; else if (c === '{') { const e = g.indexOf('}', k); s += `(?:${g.slice(k + 1, e).split(',').map((x) => x.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`; k = e; } else s += c.replace(/[.+^${}()|[\]\\]/g, '\\$&'); }
  return new RegExp(`^${s}$`);
}
const matchAny = (globs, f) => globs.some((g) => globToRe(g).test(f) || (!String(g).includes('/') && globToRe(g).test(f.split('/').pop())));
function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.git') continue; const p = join(dir, e.name); if (e.isDirectory()) walk(p, base, out); else if (e.isFile()) out.push(relative(base, p).split(sep).join('/')); }
  return out;
}
/** Strip content hashes so main.3f2a9c1b.js / main-BdT9x2Qa.js compare to main.js across builds. */
export function stableName(f) {
  return f.replace(/([.-])(?=[A-Za-z0-9_]*\d)(?=[A-Za-z0-9_]*[a-zA-Z])[A-Za-z0-9_]{8,}(?=\.(?:m?js|cjs|css)$)/, '').replace(/([.-])[a-f0-9]{6,}(?=\.)/i, '').replace(/[.-](?=\.)/, '');
}
export function measure(buf, { brotli = true } = {}) {
  return { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length, brotli: brotli ? brotliCompressSync(buf, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length : undefined };
}
function looksUnminified(text) {
  if (text.length < 20000) return false;
  const lines = text.split('\n'); const avg = text.length / lines.length; const indented = lines.filter((l) => /^\s{2,}\S/.test(l)).length / lines.length;
  const comments = (text.match(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm) || []).reduce((a, c) => a + c.length, 0) / text.length;
  return (avg < 60 && indented > 0.3) || comments > 0.15;
}

export function scan(dir, { include = ['**/*.{js,mjs,cjs,css}'], exclude = [] } = {}) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`No such directory: ${dir}`);
  return walk(dir).filter((f) => matchAny(include, f) && !/\.map$/.test(f) && !matchAny(exclude, f)).sort().map((file) => {
    const buf = readFileSync(join(dir, file)); const kind = /\.css$/.test(file) ? 'css' : 'js';
    return { file, name: stableName(file), kind, ...measure(buf), sha: createHash('sha256').update(buf).digest('hex').slice(0, 16), unminified: looksUnminified(buf.toString('utf8')) };
  });
}
/** Budgets: [{ path, raw?, gzip?, brotli? }] | { "glob": "50 KB" (gzip) | { gzip, brotli, raw } }; CLI "glob=50KB" or "glob=brotli:40KB". */
export function normaliseBudgets(b = [], cli = []) {
  const out = [];
  const push = (path, spec, src) => { const s = typeof spec === 'object' && spec ? spec : { gzip: spec }; const e = { path, src }; for (const k of ['raw', 'gzip', 'brotli']) if (s[k] != null) { const v = parseSize(s[k]); if (v == null) throw new UsageError(`Invalid ${k} size "${s[k]}" for budget ${path}`); e[k] = v; } if (!e.raw && !e.gzip && !e.brotli) throw new UsageError(`Budget ${path} has no size`); out.push(e); };
  if (Array.isArray(b)) b.forEach((x, i) => { if (!x?.path) throw new UsageError(`budgets[${i}] needs "path"`); push(x.path, x, 'config'); }); else for (const [k, v] of Object.entries(b || {})) push(k, v, 'config');
  for (const c of cli) { const m = /^(.+?)=(?:(raw|gzip|brotli):)?(.+)$/.exec(c); if (!m) throw new UsageError(`--budget must be glob=size, got "${c}"`); push(m[1], { [m[2] || 'gzip']: m[3] }, 'cli'); }
  return out;
}

export function analyze(files, opts = {}) {
  const raw = []; const add = (rule, subject, message, fix, file) => raw.push({ rule, severity: RULES[rule].severity, subject, message, fix, file });
  const warn = (opts.warnAt ?? 90) / 100; const maxGrowth = opts.maxGrowth ?? 10; const minDelta = parseSize(opts.minDelta ?? '1 KB'); const large = parseSize(opts.largeFile ?? '100 KB');
  const budgets = opts.budgets || [];
  const budgeted = new Set();
  for (const b of budgets) {
    const hits = files.filter((f) => matchAny([b.path], f.file));
    if (!hits.length) { add('bundle-budget-unmatched', b.path, `Budget "${b.path}" matches no file`, 'Update the glob to the current output name, or remove the budget.'); continue; }
    for (const f of hits) {
      budgeted.add(f.file);
      for (const k of ['brotli', 'gzip', 'raw']) { if (b[k] == null || f[k] == null) continue;
        if (f[k] > b[k]) add('bundle-over-budget', f.file, `${f.file} is ${fmtSize(f[k])} ${k}, over its ${fmtSize(b[k])} budget by ${fmtSize(f[k] - b[k])} (${Math.round((f[k] / b[k] - 1) * 100)}%)`, 'Split the entry (dynamic import), drop heavy dependencies, or raise the budget deliberately.', f.file);
        else if (f[k] > b[k] * warn) add('bundle-near-budget', f.file, `${f.file} is ${fmtSize(f[k])} ${k}, ${Math.round((f[k] / b[k]) * 100)}% of its ${fmtSize(b[k])} budget`, 'Keep an eye on this entry.', f.file); }
    }
  }
  for (const [kind, key] of [['js', 'totalJs'], ['css', 'totalCss']]) { const lim = opts[key]; if (!lim) continue; const t = files.filter((f) => f.kind === kind).reduce((a, f) => a + f.gzip, 0); if (t > lim) add('bundle-total-over-budget', `total-${kind}`, `Total ${kind.toUpperCase()} is ${fmtSize(t)} gzip, over the ${fmtSize(lim)} budget`, 'Remove unused code or split by route.'); }
  if (opts.base) {
    const base = new Map((opts.base.files || []).map((f) => [f.name || stableName(f.file), f]));
    for (const f of files) { const b = base.get(f.name);
      if (!b) { if (f.gzip >= parseSize(opts.newLarge ?? '50 KB')) add('bundle-new-large', f.file, `New file ${f.file} is ${fmtSize(f.gzip)} gzip`, 'Check this new chunk is intended.', f.file); continue; }
      const d = f.gzip - b.gzip; const pct = b.gzip ? (d / b.gzip) * 100 : 0;
      if (d >= minDelta && pct > maxGrowth) add('bundle-growth', f.file, `${f.file} grew ${fmtSize(d)} gzip (+${pct.toFixed(1)}%, ${fmtSize(b.gzip)} → ${fmtSize(f.gzip)})`, 'Find the new dependency or code (e.g. source-map-explorer) or accept the growth by updating the base snapshot.', f.file); }
  }
  for (const f of files) {
    if (f.unminified) add('bundle-unminified', f.file, `${f.file} (${fmtSize(f.raw)}) looks unminified`, 'Enable minification for production builds.', f.file);
    if (!budgeted.has(f.file) && f.gzip >= large && budgets.length) add('bundle-no-budget', f.file, `${f.file} is ${fmtSize(f.gzip)} gzip with no budget`, 'Add a budget for it.', f.file);
  }
  const bySha = new Map(); for (const f of files) (bySha.get(f.sha) || bySha.set(f.sha, []).get(f.sha)).push(f);
  for (const g of bySha.values()) if (g.length > 1 && g[0].raw > 1000) add('bundle-duplicate', g[0].sha, `Same content shipped as ${g.map((f) => f.file).join(', ')} (${fmtSize(g[0].gzip)} gzip each)`, 'Deduplicate the asset or the build entry.', g[1].file);
  return raw;
}

export function snapshot(files, meta = {}) { return { schema: 'bundle-pulse/1', generatedAt: new Date().toISOString(), ...meta, files: files.map(({ unminified, ...f }) => f) }; }

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'bundle-pulse', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '📦', defaultFile: '.' };
  const files = scan(dir, { include: opts.include?.length ? opts.include : config.include || undefined, exclude: [...(config.exclude || []), ...(opts.exclude || [])] });
  let base = null;
  const bf = opts.base ?? config.base;
  if (bf) { const p = resolve(bf); if (!existsSync(p)) { if (!opts.baseOptional) throw new UsageError(`Base snapshot not found: ${bf}`); } else { try { base = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new UsageError(`Invalid base snapshot ${bf}: ${e.message}`); } } }
  const o = { budgets: normaliseBudgets(config.budgets, opts.budget), totalJs: parseSize(opts.totalJs ?? config.totalJs ?? 0) || 0, totalCss: parseSize(opts.totalCss ?? config.totalCss ?? 0) || 0, maxGrowth: opts.maxGrowth ?? config.maxGrowth, warnAt: config.warnAt, minDelta: config.minDelta, largeFile: config.largeFile, newLarge: config.newLarge, base };
  const raw = analyze(files, o);
  if (opts.snapshot) writeFileSync(opts.snapshot, JSON.stringify(snapshot(files), null, 2) + '\n');
  const sum = (k, kind) => files.filter((f) => !kind || f.kind === kind).reduce((a, f) => a + (f[k] || 0), 0);
  const rel = relative(process.cwd(), dir) || '.';
  const delta = base ? sum('gzip') - (base.files || []).reduce((a, f) => a + f.gzip, 0) : null;
  return buildReport(tool, rel, raw.map((f) => ({ ...f, file: f.file ? join(rel, f.file).split(sep).join('/') : undefined })), config, { now: opts.now, configFile,
    summaryLine: `${files.length} file(s): JS ${fmtSize(sum('gzip', 'js'))} gzip, CSS ${fmtSize(sum('gzip', 'css'))} gzip${delta != null ? `; ${delta >= 0 ? '+' : ''}${fmtSize(delta)} vs base` : ''}`,
    info: { files: files.map(({ file, kind, raw: r, gzip, brotli }) => ({ file, kind, raw: r, gzip, brotli })), totals: { raw: sum('raw'), gzip: sum('gzip'), brotli: sum('brotli') }, deltaGzip: delta } });
}
