# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/).
This project uses [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-07-30

### Fixed

- Normalized report and registry paths to `/` on every operating system.
- Normalized package tar permissions, ownership, checksum fields, and gzip
  headers so Windows and Linux builds produce the same archive bytes.
- Removed the build machine's Node.js patch version from release metadata.
- Added a CI gate that compares every signed asset hash across six
  Windows/Linux and Node.js 20/22/24 builds.

## [0.1.0] - 2026-07-30

### Added

- Deterministic parsing and normalization of modern and legacy Home Assistant
  automation YAML/JSON.
- Fourteen static-analysis rules covering feedback, concurrency, conditions,
  entity integrity, duplicate IDs, and unsafe repeats.
- Console, JSON, SARIF 2.1.0, HTML, and Mermaid output.
- Bounded event replay with loop detection and trace output.
- Safe and intentionally tangled fixtures, tests, demo generation, benchmark,
  secret scan, package validation, reproducible release bundle, CI, and CodeQL.

[0.1.1]: https://github.com/KanadeK/hasstangle/releases/tag/v0.1.1
[0.1.0]: https://github.com/KanadeK/hasstangle/releases/tag/v0.1.0
