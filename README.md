# bundle-pulse

[![npm version](https://img.shields.io/npm/v/bundle-pulse.svg)](https://www.npmjs.com/package/bundle-pulse) [![CI](https://github.com/MrLouisWright/bundle-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/bundle-pulse/actions/workflows/ci.yml) [![Node](https://img.shields.io/node/v/bundle-pulse.svg)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> A CI gate for JavaScript and CSS bundle size: budgets on raw, gzip and brotli sizes, and a diff against your base branch.

Bundles grow one innocent import at a time. `bundle-pulse` measures every JS and CSS file in your build output the way browsers receive it (gzip and brotli as well as raw), checks each file against the budget for its glob, checks total JS and CSS, and compares against a snapshot from the base branch so a pull request that adds 40 kB to the main chunk fails with a clear message. Content hashes in file names (`index-BdT9x2Qa.js`, `main.3f2a9c1b.chunk.js`) are stripped when comparing, so the diff follows the entry, not the file name.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**, runs offline. By Louis Wright.

## Features

- **Three sizes:** raw, gzip (level 9) and brotli (quality 11) for every `.js`, `.mjs`, `.cjs` and `.css` file; source maps are skipped.
- **Budgets:** per-glob budgets on any of the three sizes, total JS and total CSS budgets, and a warning when a file passes 90% of its budget.
- **Base diff:** `--snapshot` writes sizes to JSON; `--base` compares against it and reports files that grew more than `--max-growth` percent (default 10%, ignoring changes under 1 kB) and new large chunks.
- **Hygiene:** unminified files, identical files shipped under two names, budgets that match nothing (renamed entries), and large files with no budget.
- **Works with any bundler:** Vite, webpack, Rollup, esbuild, Parcel, Next.js static output, or plain files.

### Scope

bundle-pulse measures what is on disk after the build. It does not analyse which modules are inside a chunk (use a bundle analyser for that) or measure runtime performance (see vitals-pulse).

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `bundle-over-budget` | high | File is larger than its budget |
| `bundle-total-over-budget` | high | Total JS or CSS is larger than its budget |
| `bundle-growth` | medium | File grew more than the allowed percentage since the base snapshot |
| `bundle-budget-unmatched` | medium | Budget glob matches no file (renamed entry or stale budget) |
| `bundle-unminified` | medium | Large file looks unminified |
| `bundle-near-budget` | low | File is within the warning margin of its budget |
| `bundle-new-large` | low | New file since the base snapshot is large |
| `bundle-duplicate` | low | Identical file shipped under more than one name |
| `bundle-no-budget` | info | Large file has no budget |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx bundle-pulse dist
npx bundle-pulse dist -b 'assets/index-*.js=60KB' -b 'assets/*.css=brotli:15KB' --total-js 200KB
npx bundle-pulse dist --snapshot bundle-base.json   # on main
npx bundle-pulse dist --base bundle-base.json --max-growth 5 --format markdown
```

### Sample output

```text
bundle-pulse — test/fixtures/bad
5 file(s): JS 32.6 kB gzip, CSS 10.9 kB gzip

HIGH     Total JS is 32.6 kB gzip, over the 30.0 kB budget [bundle-total-over-budget]
HIGH     test/fixtures/bad/assets/app-K2m9xQ7r.css assets/app-K2m9xQ7r.css is 10.9 kB gzip, over its 6.0 kB budget by 4.9 kB (82%) [bundle-over-budget]
HIGH     test/fixtures/bad/assets/index-Xa91bQ2k.js assets/index-Xa91bQ2k.js is 9.1 kB gzip, over its 8.0 kB budget by 1.1 kB (14%) [bundle-over-budget]
MEDIUM   Budget "assets/admin-*.js" matches no file [bundle-budget-unmatched]
MEDIUM   test/fixtures/bad/assets/legacy.js assets/legacy.js (40.0 kB) looks unminified [bundle-unminified]
```

## Options

```text
bundle-pulse 1.0.0 — JS/CSS bundle size budgets with raw, gzip and brotli sizes

Usage: bundle-pulse [build-dir] [options]

Budgets
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

Common
  -c, --config <file>     JSON config (default: .bundle-pulse.json or "bundlePulse" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.bundle-pulse.json` (or a `"bundlePulse"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "bundle-over-budget": "low"
  },
  "allowlist": [
    {
      "rule": "bundle-unminified",
      "subject": "assets/legacy.js",
      "reason": "Vendored legacy widget, replaced in Q1",
      "expires": "2027-03-31"
    }
  ],
  "budgets": [
    {
      "path": "assets/index-*.js",
      "gzip": "60 KB",
      "brotli": "50 KB"
    },
    {
      "path": "assets/*.css",
      "gzip": "15 KB"
    }
  ],
  "totalJs": "200 KB",
  "maxGrowth": 5,
  "base": "bundle-base.json"
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

The config file is looked up in the target directory first, then in the current directory, so `.bundle-pulse.json` can live at your repository root. Other keys: `budgets` (array of `{ path, raw, gzip, brotli }` or a map of glob to gzip size), `totalJs`, `totalCss`, `maxGrowth`, `warnAt` (percent, default 90), `minDelta`, `largeFile`, `newLarge`, `base`, `include` and `exclude`. The config file is read from the build directory or from `--config`.

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  bundle-pulse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - uses: MrLouisWright/bundle-pulse@v1
        with:
          path: dist
          fail-on: high
          sarif: bundle-pulse.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: bundle-pulse.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Build output directory | `.` |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { scan, analyze, normaliseBudgets } from "bundle-pulse";
const files = scan("dist");
const findings = analyze(files, { budgets: normaliseBudgets({ "assets/index-*.js": "60 KB" }) });
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Credit (optional)

Free to use under MIT, no attribution required. If bundle-pulse helps you, a link back is appreciated:

```html
<a href="https://louiswright.co.uk">Built with bundle-pulse by Louis Wright</a>
```

```markdown
[![Built with bundle-pulse by Louis Wright](https://img.shields.io/badge/built%20with-bundle--pulse-blue)](https://louiswright.co.uk)
```

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
