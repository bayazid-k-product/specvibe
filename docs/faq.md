# FAQ

Answers to the questions that come up most often when adopting SpecVibe.

## General

### Is SpecVibe a code generator?

No. It generates **governance documents** and **agent integration files**, not application code. The only code it writes is what you or your agent write inside a track after approval.

### Does it replace my agent, or work with it?

It works with it. SpecVibe provides the contract, the plan, the checkpoint, and the context. Your agent — OpenCode, Claude Code, Cursor, Gemini CLI, Windsurf, Copilot, or anything that can read `AGENTS.md` — still does the implementation.

### Does SpecVibe send my code anywhere?

No. There are no network calls, no telemetry, no accounts, and no hidden services. Everything runs locally and is stored as Markdown and JSON under `.specvibe/`.

### Does it have runtime dependencies?

No. The published package bundles compiled code and templates only; the runtime uses Node's standard library.

### Why Node.js 22.12 or newer?

SpecVibe uses modern ESM, `node:fs/promises`, and current test tooling. Node 22.12 is the first release in the 22 line with the required behavior and a support window that matches the project's tooling. Older versions are not tested.

### Does it work on Windows?

Yes. Windows, macOS, and Linux are supported. The test suite runs the full lifecycle on all three in CI. Paths, git refs, and archive names are sanitized for Windows, including reserved device names.

## Setup and storage

### What exactly gets created by `init`?

A `.specvibe/` directory containing the constitution, context, decision log, config, state, scan artifacts, tracks, and archive. It also writes a managed `AGENTS.md` block and native command files for the agents it detects.

The full layout is documented in [Getting started](getting-started.md).

### What should I commit?

Commit `.specvibe/` except `packs/`, `backups/`, and `tmp/`, plus the generated agent instruction and command files. `.specvibe/.gitignore` already excludes the local-only folders.

### Can I edit the generated files?

Edit `.specvibe/constitution.md` and `.specvibe/context.md` freely — they are yours. Track documents are meant to be edited while planning.

Do not hand-edit generated agent command files or `scan.json`; regenerate them with `specvibe agents sync` and `specvibe scan`. Managed instruction files can contain your own content outside the `<!-- specvibe:start -->` / `<!-- specvibe:end -->` markers.

### Can I use SpecVibe in a monorepo?

Yes, but run it at the level where the constitution makes sense. A single root-level `.specvibe/` keeps one contract for the whole repository. If packages genuinely need independent constitutions, initialize separate repositories or treat each package as its own project with `--cwd`.

The scanner respects common build and dependency folders and the configured file limits. Use `scan.ignore` for generated monorepo output.

### Does `init` overwrite my existing files?

No. It refuses to initialize twice unless you use `setup` or `--force`. Repair mode preserves `constitution.md`, `context.md`, and `decisions.md`. Managed agent files keep user content outside the SpecVibe markers, and owned files are only overwritten when SpecVibe generated them or `--force` is used (which keeps a backup).

## The workflow

### Do I have to use git?

Planning, scanning, packing, and status work without git. `apply` requires a git repository with at least one commit by default, and `revert` needs a real checkpoint.

If you intentionally want to work without git, `specvibe apply <track> --allow-no-git` records that choice. Revert will not be available for that track.

### Why does `apply` refuse a dirty working tree?

A checkpoint is only meaningful if it captures a known starting point. If uncommitted source changes are present, a later revert could silently discard them.

SpecVibe ignores its own bookkeeping under `.specvibe/` because propose, approve, and task updates constantly rewrite it. Real source, test, and config changes still block. Commit or stash them, or pass `--allow-dirty` after confirming the existing changes are safe to leave out of the checkpoint.

### Can an agent approve its own track?

It can run `specvibe approve <track>` technically, but the generated instructions tell agents to use `approve --check` and then ask a human. Approval is a human decision by design. If you need a hard technical boundary, restrict the agent's shell permissions in your host.

### What does `--force` actually do?

It depends on the command, and each use is recorded:

- `approve --force` approves despite validation errors and sets `forced: true` on the track.
- `apply --done <ID> --force` skips the ordering rule for one item. It never bypasses gate confirmation.
- `unify --force` finishes with unchecked items and records every skipped item as an exception.
- `agents sync --force` replaces an owned file SpecVibe did not generate, after backing it up.
- `init --force` repairs or refreshes generated files without overwriting your constitution, context, or decisions.

`--force` is an escape hatch with a paper trail, not a default.

### Why did my track fail validation?

The most common causes:

- a remaining `[NEEDS CLARIFICATION: ...]` marker
- an unresolved `{{TEMPLATE_VARIABLE}}`
- no `## Acceptance Criteria` section, or criteria without `AC-N` IDs
- no `G`-prefixed verification gate in `tasks.md`
- duplicate checklist IDs
- an empty document

Run `specvibe approve <track> --check` to see exact file, line, and code. [The workflow guide](workflow.md#3-validate-and-approve) lists every validation code.

### What is the difference between a task, a gate, and an acceptance criterion?

- **Task (`T1`)** — implementation work, completed in order.
- **Gate (`G1`)** — a command or check that produces evidence. Requires `--confirm-gate` after it actually runs.
- **Completion (`C1`)** — a final checklist item such as "constitution limits respected."
- **Acceptance (`AC-1`)** — observable behavior defined in `spec.md`, verified independently of task order.

A track is not done until all four are satisfied.

### Can two tracks be active at once?

No. `propose` sets the new track as active. Finish or archive the current one first, or resolve an explicit track by name for read-only commands. One track at a time keeps the context and the checkpoint meaningful.

### What if the scope changes during implementation?

Stop and update the track documents. If the change is material, revert or unify what is already done, then propose a new track. Do not silently expand an approved plan; that defeats the approval boundary.

### What happens to a unified track?

It is moved to `.specvibe/archive/<date>-<slug>/`, its decisions are appended to `.specvibe/decisions.md`, and it becomes immutable. Follow-up work gets a new track.

### Can I undo a `unify`?

Not automatically. The archive is preserved so you can inspect it, but the track is no longer active. If the implementation must be rolled back after unify, use normal git history or create a new revert track. SpecVibe's `revert` command applies to `applying` tracks with a checkpoint.

## Context and tokens

### How does `pack` decide what to include?

In priority order: constitution, project context, decisions, the active track, the codebase map, then source files referenced by the track. Files are ranked by relevance and connection count. Per-file and total budgets are enforced, and truncated or omitted files are listed explicitly.

See [Configuration](configuration.md#pack) for the knobs.

### Are token counts exact?

No. They are dependency-free estimates: roughly four ASCII characters per token and one token per CJK character. Use them for budgeting, not for billing.

### Why is my pack smaller than the budget?

The pack stops when the relevant material is exhausted. A budget is a ceiling, not a target. It also enforces per-file caps and a maximum file count.

## Agents

### Which files does each agent get?

See the table in [Agent integrations](agents.md#supported-agents). In short: one managed instruction file per host plus native command files that call the CLI.

### Why do generated commands not contain the full constitution?

Duplicating it would create two sources of truth that drift immediately. Generated files point to `.specvibe/` and the CLI, and include only the short non-negotiable workflow rules.

### `agents sync` skipped my command file. Why?

The file exists but does not contain the `specvibe:generated` marker, so it looks hand-written. SpecVibe will not overwrite it silently. Move or delete it, or run `specvibe agents sync --force` to back it up and replace it.

### What happens when I remove an agent?

Generated owned files are deleted. A managed block is removed from shared instruction files, and the file itself is deleted only if nothing else remains. Files SpecVibe did not generate are left alone with a warning.

### Can I use SpecVibe without any agent integration?

Yes. `specvibe init --agents none` writes only the `.specvibe/` baseline. The CLI workflow is fully usable by hand.

## Safety and recovery

### How does revert work?

`specvibe revert <track>` is a dry run: it shows the checkpoint, commits since, changed files, and dirty entries. `--yes` creates a `specvibe-backup/<slug>-<timestamp>` branch at the current HEAD, stashes dirty and untracked work, resets to the checkpoint, and archives the track as `reverted`.

Nothing is deleted from git history. See [Revert safety](../README.md#revert-safety).

### I ran revert and lost sight of my changes. Where are they?

They are recoverable in two places:

- the backup branch: `git branch --list "specvibe-backup/*"`
- the stash: `git stash list`

The revert output and the decision log record the exact branch and stash message.

### Does SpecVibe delete files outside the repository?

No. It writes under the initialized root and at documented agent file paths. Template and pack paths are checked against traversal. Git commands run with argument arrays, not shell strings.

### How do I report a security issue?

Follow [SECURITY.md](../SECURITY.md). Do not open a public issue with exploit details.

## Troubleshooting

### `specvibe` is not found

Use `npx specvibe <command>` or install globally with `npm install -g specvibe`. Check `npm bin -g` is on your `PATH`. The `sv` alias is installed by the same package.

### `doctor` says the project is not initialized

`doctor` is intentionally usable before `init`, so it reports missing state rather than failing. Run `specvibe init` in the repository root, or pass `--cwd`.

### The scan seems to miss files

Check, in order: `.gitignore`, `.specvibeignore`, `scan.ignore`, the hard-ignored folders (build output, dependencies, caches, agent folders), `scan.maxFiles`, and `scan.maxFileBytes`. Very large or binary files are skipped by design.

### The scan includes tests I do not want

Set `scan.includeTests` to `false`:

```bash
specvibe config set scan.includeTests false
specvibe scan
```

### My changes are not reflected in agent files

Run `specvibe agents sync`. Editing `config.json` directly does not regenerate files.

### Where can I get more help?

Read the [CLI reference](cli-reference.md), [workflow guide](workflow.md), and [architecture notes](architecture.md). For bugs, use the GitHub issue templates and include the output of `specvibe doctor --json` with secrets removed.
