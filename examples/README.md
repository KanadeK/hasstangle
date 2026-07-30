# Example data

`safe-home` is a clean acceptance fixture. It contains two mutually exclusive
motion triggers and a notification automation:

```bash
hasstangle scan examples/safe-home/automations.yaml \
  --entities examples/safe-home/entities.json
```

`tangled-home` deliberately contains feedback loops, contradictory conditions,
conflicting writers, an unknown entity, unsafe concurrency, and a tight repeat:

```bash
hasstangle scan examples/tangled-home/automations.yaml \
  --entities examples/tangled-home/entities.json \
  --format html --output artifacts/tangled-report.html \
  --graph artifacts/tangled-graph.mmd --fail-on none
```

Its event trace proves the `loop_a` ↔ `loop_b` cycle reaches the configured
step limit:

```bash
hasstangle replay examples/tangled-home/automations.yaml \
  --entities examples/tangled-home/entities.json \
  --events examples/tangled-home/events.json --max-steps 40
```

These fixtures use invented entity names and contain no credentials or personal
home data.
