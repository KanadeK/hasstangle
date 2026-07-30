# Idea research record

Research date: 2026-07-30

## Selection constraints

The project had to:

- avoid the author's existing repository inventory and previously discussed
  tools;
- solve a repeated operational problem with real inputs and outputs;
- work offline without requiring a hosted backend or private token;
- have a narrow, searchable promise that can earn organic GitHub discovery;
- produce useful behavior in v0.1.0, not a dashboard or speculative shell.

Existing projects were inventoried by repository name, description, and local
README. That ruled out another generic repository inspector, README checker,
CSV/PDF workbench, release helper, game tool, hardware planner, or maintenance
tracker.

## Candidate checks

| Candidate | Evidence | Decision |
| --- | --- | --- |
| OBS scene portability checker | Direct adjacent projects include [`exeldro/obs-scene-collection-manager`](https://github.com/exeldro/obs-scene-collection-manager) and [`SeismicAudio/obs_FVAM`](https://github.com/SeismicAudio/obs_FVAM). | Rejected as a direct-overlap category. |
| iCalendar interoperability validator | Exact search returned [`faph/icalendar-validator`](https://github.com/faph/icalendar-validator) and [`judell/icalvalid`](https://github.com/judell/icalvalid). | Rejected as already implemented. |
| G-code job preflight | Exact phrase search was sparse, but multiple visualizers and firmware analyzers serve the core validation path. | Rejected because differentiation would be weak. |
| Photo-backup completeness proof | Backup/deduplication tools already occupy the obvious checksum/diff workflow. | Rejected as crowded and hard to distinguish in one release. |
| Home Assistant automation conflict analyzer | Repeated user reports describe races, restarts, and loops; official automation modes explicitly have dropped/restarted/parallel semantics. GitHub exact searches below returned no repositories. | Selected. |

## Reproducible GitHub queries

Run on 2026-07-30 with GitHub CLI:

```bash
gh search repos "home assistant automation static analysis" --limit 10
gh search repos "home assistant automation analyzer" --limit 10
gh search repos "home assistant linter" --limit 10
gh search repos "home assistant automation health" --limit 10
gh search repos "hass automation analyzer" --limit 10
```

All five exact searches returned zero repositories. Broader
`home-assistant automation` searches returned editors, blueprints, AI
suggesters, and runtime projects, but no deterministic offline tool combining
writer/trigger graph analysis, concurrency hazards, entity-registry checking,
SARIF, and bounded replay.

This is evidence of a discoverable gap, not proof that no similar code exists
anywhere. Search indexes, names, and repositories change over time.

## Why this can attract attention

The star/view hypothesis is based on:

1. Home Assistant automations are text assets commonly stored in Git.
2. Failure modes affect physical homes and are expensive to reproduce.
3. The promise is demonstrable in one command and one shareable HTML report.
4. SARIF and exit codes make the tool useful in existing CI.
5. Offline operation removes token and privacy friction.
6. Rule IDs and synthetic fixtures give contributors small, reviewable work.

Stars cannot be guaranteed. The project optimizes for a clear problem,
searchable README language, reproducible evidence, easy installation, and
contribution seams rather than making a popularity promise.

## Primary domain references

- [Home Assistant automation modes](https://www.home-assistant.io/docs/automation/modes/)
- [Home Assistant automation triggers](https://www.home-assistant.io/docs/automation/trigger/)
- [Home Assistant automation conditions](https://www.home-assistant.io/docs/automation/condition/)
- [Home Assistant script syntax](https://www.home-assistant.io/docs/scripts/)
