# Contributing

## Setup

```bash
git clone https://github.com/KanadeK/hasstangle.git
cd hasstangle
npm ci
npm run verify
```

Node.js 20, 22, and 24 are tested in CI. The lockfile is authoritative.

## Detection changes

A new or changed rule must include:

1. a stable `HTxxx` ID and repair text;
2. one smallest-possible unsafe fixture/assertion;
3. one safe counterexample when false positives are plausible;
4. deterministic ordering and machine-readable evidence;
5. a rule catalog update.

Do not execute templates or call a Home Assistant instance to make a static
rule pass. If runtime information is essential, expose it as explicit input.

## Pull request gate

```bash
npm run format:check
npm run lint
npm test
npm run coverage
npm run demo
npm run secret:scan
npm run repo:check
npm run package:check
npm run benchmark
```

Report false positives with synthetic entity names. Never attach your real
`.storage` directory or credentials.
