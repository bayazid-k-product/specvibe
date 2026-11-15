# Changelog

All notable changes to SpecVibe are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- More agent adapters and community-contributed templates.
- Richer scan heuristics for monorepos and polyglot repositories.
- Optional pack caching and per-track context profiles.

## [0.1.0] — 2026-11-14

The first public release. SpecVibe is a zero-dependency, local-first CLI for spec-driven governance of AI coding agents.

### Added

- **Initialization and detection** — `init` and `setup` detect the project stack, package manager, commands, entry points, and installed agent integrations. Generated documents are written once and preserved on refresh; `--force` repairs missing files.
- **Repository scan** — deterministic mapping of files, languages, directories, exports, imports, inbound connections, entry points, size violations, long functions, possible orphans, and unused exports. Focus terms rank files for a feature, and a human/agent-readable codebase summary plus a machine-readable `scan.json` are written under `.specvibe/context/`.
- **Spec-driven tracks** — `propose` creates a reviewable `proposal.md`, `spec.md`, `design.md`, `tasks.md`, and `meta.json` under `.specvibe/tracks/<slug>/`. Generated documents contain explicit clarification markers and never include feature code.
- **Validation and approval** — `approve --check` validates required sections, acceptance criteria, gates, duplicate checklist IDs, unresolved template variables, and clarification markers. `approve` records a human decision; `--force` records an intentional exception.
- **Apply progression** — `apply` creates a git checkpoint, enforces a clean tree by default, requires tasks to be completed in order, requires `--confirm-gate` for verification gates, and records acceptance verification separately.
- **Unify and archive** — `unify` refuses to finish while work is unchecked, writes `summary.md`, moves the track to `.specvibe/archive/`, appends decisions to `.specvibe/decisions.md`, and clears the active track.
- **Safe revert** — dry-run by default. `--yes` snapshots the track, creates a `specvibe-backup/<slug>-<timestamp>` branch, stashes dirty/untracked work, resets to the checkpoint, and archives the track as reverted.
- **Context packs** — `pack` builds a budgeted Markdown context pack from the constitution, project context, decisions, active track, codebase map, and relevant source files. Explicitly reports truncated and omitted files. Falls back to ranked project files when no track is active.
- **Native agent integrations** — managed instruction files and native command files for OpenCode, Claude Code, Cursor, Gemini CLI, Windsurf/Devin, GitHub Copilot, and a generic `AGENTS.md` baseline. Managed user content is preserved; overridden owned files are backed up.
- **Agent management** — `agents list|detect|add|remove|sync`, with automatic detection and stable ordering.
- **Configuration** — validated `.specvibe/config.json`, `config list|get|set`, and documented ranges for scan, pack, and git behavior.
- **Diagnostics** — `doctor` checks installation, config, git, scan freshness, agent files, and project state before or after initialization.
- **Machine-readable CLI** — `--json` output for every command, stable error codes and exit codes, `--cwd`, `--quiet`, `--no-color`, and `--debug`.
- **Cross-platform support** — Windows, macOS, and Linux; atomic file writes; Windows-safe track slugs and git refs.
- **Quality infrastructure** — Vitest unit and CLI lifecycle tests, TypeScript strict mode, Biome linting/formatting, GitHub Actions CI, and npm provenance-ready packaging.

### Security

- Zero runtime dependencies.
- No telemetry, analytics, network requests, or hidden services.
- Unsafe operations (`--force`, `--allow-dirty`, `--allow-no-git`, `revert --yes`) are explicit and documented.
- Revert preserves recoverable history through backup branches and stashes.

[Unreleased]: https://github.com/bayazid-k-product/specvibe/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bayazid-k-product/specvibe/releases/tag/v0.1.0
