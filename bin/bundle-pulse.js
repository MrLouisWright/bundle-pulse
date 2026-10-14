#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'bundle-pulse', version: pkg.version, configKey: 'bundlePulse', rules: RULES,
  tagline: 'JS/CSS bundle size budgets with raw, gzip and brotli sizes',
  usage: 'Usage: bundle-pulse [build-dir] [options]',
  help: `Budgets
  -b, --budget <glob=size>  Budget for matching files, repeatable; gzip by default ("assets/index-*.js=60KB",
                            "**/*.css=brotli:20KB", "vendor*.js=raw:400KB")
      --total-js <size>     Budget for all JS together (gzip)
      --total-css <size>    Budget for all CSS together (gzip)
      --include <globs>     Files to measure (default **/*.{js,mjs,cjs,css}; source maps always skipped)
      --exclude <globs>     Files to skip
Base comparison
      --base <file>         Snapshot from the base branch (written with --snapshot)
      --base-optional       Do not fail if the base snapshot does not exist yet
      --max-growth <pct>    Allowed growth per file vs base, in percent (default 10)
      --snapshot <file>     Write the current sizes as a snapshot
`,
  options: { budget: { type: 'string', short: 'b', multiple: true }, 'total-js': { type: 'string' }, 'total-css': { type: 'string' }, include: { type: 'string', multiple: true }, exclude: { type: 'string', multiple: true }, base: { type: 'string' }, 'base-optional': { type: 'boolean' }, 'max-growth': { type: 'string' }, snapshot: { type: 'string' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { budget: o.budget || [], totalJs: o['total-js'], totalCss: o['total-css'], include: splitList(o.include), exclude: splitList(o.exclude), base: o.base, baseOptional: o['base-optional'], maxGrowth: o['max-growth'] != null ? Number(o['max-growth']) : undefined, snapshot: o.snapshot, toolVersion: pkg.version }, config, configFile),
});
