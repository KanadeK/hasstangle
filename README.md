# HassTangle

[![CI](https://github.com/KanadeK/hasstangle/actions/workflows/ci.yml/badge.svg)](https://github.com/KanadeK/hasstangle/actions/workflows/ci.yml)
[![CodeQL](https://github.com/KanadeK/hasstangle/actions/workflows/codeql.yml/badge.svg)](https://github.com/KanadeK/hasstangle/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-1167b1.svg)](LICENSE)

Find Home Assistant automations that fight, loop, drop triggers, or reference
entities that no longer exist—before they surprise you at home.

HassTangle is an offline, deterministic command-line analyzer. It reads real
Home Assistant YAML, builds an automation/entity graph, reports concrete
evidence and repairs, and can replay a bounded event trace to prove a feedback
loop. It does not need a Home Assistant token and never changes your instance.

```text
HassTangle 0.1.0
11 automations · 15 entities · risk 0/100
6 errors · 6 warnings · 0 notes

[ERROR] HT002 Cross-automation feedback cycle
  examples/tangled-home/automations.yaml:1
  Feedback cycle: Mirror A to B → Mirror B to A → …
  Fix: Break the cycle with a guard helper, explicit trigger states, or a
  single owner automation.
```

## What it catches

- self-triggering and cross-automation feedback cycles;
- opposite writers that can fight over one entity;
- automations that enable/disable each other in a cycle;
- dropped triggers in `mode: single`;
- cancelled cleanup after a delay in `mode: restart`;
- overlapping parallel writes and toggle races;
- impossible conditions and trigger/condition contradictions;
- stale or disabled entity IDs from a registry/state snapshot;
- duplicate automation IDs, dead triggers, and tight unbounded repeats.

Each finding includes a stable rule ID, severity, source location, evidence,
and a repair suggestion. See [the complete rule catalog](docs/RULES.md).

## Install

Requires Node.js 20 or newer.

From a GitHub Release:

```bash
npm install --global \
  https://github.com/KanadeK/hasstangle/releases/download/v0.1.0/hasstangle-0.1.0.tgz \
  --registry=https://registry.npmjs.org/
hasstangle --version
```

From source:

```bash
git clone https://github.com/KanadeK/hasstangle.git
cd hasstangle
npm ci
npm link
hasstangle --help
```

No install is needed for a one-off source checkout:

```bash
node bin/hasstangle.js scan automations.yaml
```

## Quick start

Scan one automation file:

```bash
hasstangle scan automations.yaml
```

Scan a directory recursively. Non-automation YAML and helper JSON are ignored:

```bash
hasstangle scan config/
```

Add an entity snapshot so stale and disabled references can be checked:

```bash
hasstangle scan automations.yaml \
  --entities entities.json \
  --format html \
  --output hasstangle-report.html \
  --graph automation-graph.mmd
```

Generate SARIF for code scanning:

```bash
hasstangle scan automations.yaml \
  --format sarif \
  --output hasstangle.sarif \
  --fail-on none
```

Prove a suspected loop with a bounded state-event trace:

```bash
hasstangle replay automations.yaml \
  --entities entities.json \
  --events events.json \
  --max-steps 100 \
  --output replay.json
```

Run the included real fixtures:

```bash
npm run demo
```

This writes console, JSON, SARIF, HTML, Mermaid, and replay artifacts under
`artifacts/demo/`. The unsafe fixture must produce errors and warnings; the safe
fixture must produce none.

## Inputs

HassTangle supports current plural Home Assistant keys
(`triggers`, `conditions`, `actions`) and legacy singular keys
(`trigger`, `condition`, `action`). It understands list-style automation files,
`automation:` containers, package mappings, nested `choose`, `if`, `repeat`,
`parallel`, and `sequence` actions, plus common template entity references.

If `configuration.yaml` uses `!include`, pass the included automation file or
directory. HassTangle intentionally does not resolve arbitrary Home Assistant
custom tags or execute templates.

An entity snapshot may be any of:

```json
{
  "light.office": { "state": "off" },
  "switch.fan": { "state": "on", "disabled_by": null }
}
```

It also accepts an array of records or Home Assistant's
`data.entities` registry shape. Keep private registry data out of Git; only
`entity_id`, `state`, and `disabled_by` are read.

Replay events use this shape:

```json
[
  {
    "entity_id": "input_boolean.loop_a",
    "from": "off",
    "to": "on",
    "at": "2026-07-30T12:00:00Z"
  }
]
```

## Outputs and exit codes

`scan` supports `console`, `json`, `sarif`, and self-contained `html` reports,
plus an optional Mermaid graph. Use `--fail-on error|warning|note|none` to tune
CI behavior.

| Code | Meaning |
| ---: | --- |
| `0` | Scan is below the failure threshold; replay found no loop |
| `1` | Scan met the failure threshold; replay found/truncated a loop |
| `2` | Bad arguments, unreadable input, or invalid YAML/JSON |

The analyzer is conservative. A warning is a review target, not proof that a
live incident will occur. Dynamic templates, blueprints, device triggers, and
runtime timing can require manual confirmation.

## CI example

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: 20
- run: npm install --global ./hasstangle-0.1.0.tgz
- run: hasstangle scan automations.yaml --fail-on error
```

## Verify from source

The full local gate is:

```bash
npm ci
npm run verify
npm run benchmark
SOURCE_DATE_EPOCH=1785398400 npm run release:build
```

On Windows PowerShell, set the epoch first:

```powershell
$env:SOURCE_DATE_EPOCH = "1785398400"
npm run release:build
```

Then follow [the fresh-install acceptance and repair playbook](docs/ACCEPTANCE.md).

## Design and scope

The implementation separates parsing, normalization, graph/rule analysis,
bounded replay, and renderers. Details and extension seams are in
[ARCHITECTURE.md](docs/ARCHITECTURE.md).

The idea was selected after inventorying the author's existing tools and
checking adjacent GitHub categories. The dated, reproducible search record is
in [RESEARCH.md](docs/RESEARCH.md). It records queries and limitations instead
of claiming that no similar code can exist anywhere.

## Privacy and security

- Analysis is local and read-only.
- No telemetry, network request, Home Assistant URL, or access token is used.
- HTML output escapes automation text.
- Replay has a hard step limit.
- YAML aliases have a bounded expansion count.

Please report vulnerabilities through
[GitHub private vulnerability reporting](SECURITY.md).

## Contributing

Bug reports and focused rules are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
before changing detection behavior. False positives need a minimal fixture and
a regression test.

MIT © 2026 KanadeK
