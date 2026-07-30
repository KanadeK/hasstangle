# HassTangle v0.1.0

The first public release adds an offline static analyzer and bounded replay
engine for Home Assistant automations.

Highlights:

- 14 evidence-backed rules for feedback cycles, conflicting writers,
  concurrency mode hazards, impossible conditions, stale entities, and more;
- modern and legacy Home Assistant YAML support;
- console, JSON, SARIF, self-contained HTML, Mermaid, and replay artifacts;
- meaningful exit codes for CI;
- synthetic safe/unsafe fixtures and a fresh-install acceptance playbook;
- Node.js 20/22/24 CI, CodeQL, secret scanning, checksums, and a packaged CLI.
- CycloneDX 1.6 SBOM for the release package and its single runtime dependency.

Download `hasstangle-0.1.0.tgz`, verify it with `SHA256SUMS.txt`, and install:

```bash
npm install --global ./hasstangle-0.1.0.tgz
hasstangle --version
```
