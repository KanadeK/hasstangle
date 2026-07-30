# Architecture

```text
YAML / JSON
    |
    v
parse.js ---------- entity registry / event snapshot
    |
    v
model.js (normalized automations, triggers, reads, writes, waits)
    |                         |
    v                         v
analyze.js                replay.js
graph + rule engine       bounded state queue
    |                         |
    +------------+------------+
                 v
reports.js (console / JSON / SARIF / HTML) + graph.js (Mermaid)
                 |
                 v
cli.js (files, options, outputs, exit codes)
```

## Modules

- `parse.js` discovers YAML files, parses YAML/JSON without executing tags,
  accepts registry snapshots, and validates replay events.
- `model.js` converts modern/legacy Home Assistant shapes into a stable
  intermediate model. Nested action blocks are flattened with `conditional`
  and `afterWait` evidence.
- `analyze.js` applies local rules and graph-wide rules. Tarjan strongly
  connected components identify cross-automation and control cycles.
- `replay.js` evaluates a deliberately small, deterministic state subset.
  Unsupported effects become `unknown`; they are never guessed.
- `reports.js` renders the same report model into human and machine formats.
- `cli.js` owns filesystem writes and maps results to exit codes.

## Invariants

1. Parsing and analysis never write to the Home Assistant configuration.
2. Findings sort deterministically by severity, rule, location, and message.
3. Unknown dynamic behavior lowers confidence; it does not become a false
   precise state.
4. The replay queue always has a hard step cap.
5. A rule explains both evidence and repair.
6. Directory scanning skips YAML with no inline automation and does not
   auto-discover helper JSON.

## Extending the model

Add new syntax support in `model.js`, keeping the analyzer independent from raw
YAML spelling. Add a rule to `RULES`, implement it in the smallest appropriate
detector, and add unsafe and safe tests. Renderers should require no rule-
specific branch.

## Deliberate non-goals

- Running Jinja templates or blueprints.
- Calling Home Assistant or changing live automations.
- Proving wall-clock ordering across integrations.
- Replacing Home Assistant's configuration validation.
- Claiming a warning is a guaranteed live incident.
