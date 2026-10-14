# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Measures raw, gzip (level 9) and brotli (quality 11) sizes of JS and CSS in a build directory; source maps skipped.
- Per-glob budgets on any of raw/gzip/brotli, total JS and CSS budgets, near-budget warnings.
- Base snapshots (`--snapshot`, `--base`) with content-hash-insensitive names; growth and new-large-file checks.
- Unminified and duplicate file detection; stale budgets that match nothing.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
