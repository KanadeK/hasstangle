# Rule catalog

| ID | Default | Detects |
| --- | --- | --- |
| HT000 | note | Non-fatal parser warning, including unresolved custom tags |
| HT001 | error | Automation writes an entity that can trigger itself |
| HT002 | error | Writer/trigger cycle across multiple automations |
| HT003 | warning | Different automations drive one entity to opposite states |
| HT004 | error | Automations enable, disable, or toggle each other cyclically |
| HT005 | warning | `mode: single` waits while later triggers are dropped |
| HT006 | warning | `mode: restart` can cancel writes after a wait |
| HT007 | warning | Parallel runs can race on a target entity |
| HT008 | error | Conjunctive state or numeric conditions are impossible |
| HT009 | warning | Referenced entity is missing or disabled in a snapshot |
| HT010 | error | Duplicate stable automation ID |
| HT011 | warning | Automation has no enabled trigger |
| HT012 | error | `while`/`until` repeat has no delay or wait |
| HT013 | error | Trigger destination contradicts a required state condition |

Run `hasstangle rules` for full descriptions and repair text, or
`hasstangle rules --format json` for the machine-readable catalog.

## Confidence

Rules based on direct state triggers, service effects, and top-level
conjunctive conditions are precise for the represented model. Conditional
branches and unknown service effects are downgraded where appropriate.

Template expressions are only inspected for literal entity references.
Blueprint inputs, device IDs, dynamic `target` templates, and integration
timing require manual review.
