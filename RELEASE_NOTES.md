# HassTangle v0.1.1

This patch retains the complete offline analyzer and bounded replay engine from
v0.1.0 while making report paths and package bytes reproducible across Windows
and Linux.

CI now compares the signed asset hashes from all six Windows/Linux and
Node.js 20/22/24 builds before a change is considered green.

Highlights:

- 14 evidence-backed rules for feedback cycles, conflicting writers,
  concurrency mode hazards, impossible conditions, stale entities, and more;
- modern and legacy Home Assistant YAML support;
- console, JSON, SARIF, self-contained HTML, Mermaid, and replay artifacts;
- meaningful exit codes for CI;
- synthetic safe/unsafe fixtures and a fresh-install acceptance playbook;
- Node.js 20/22/24 CI, CodeQL, secret scanning, checksums, and a packaged CLI.
- CycloneDX 1.6 SBOM for the release package and its single runtime dependency.

Download `hasstangle-0.1.1.tgz`, verify it with `SHA256SUMS.txt`, and install:

```bash
npm install --global ./hasstangle-0.1.1.tgz
hasstangle --version
```
