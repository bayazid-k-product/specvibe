# Getting started

SpecVibe installs into a repository and gives every AI coding agent the same contract: read the constitution, plan a track, wait for approval, implement in order, prove completion, and keep a checkpoint for rollback.

This guide takes you from an empty terminal to a unified first track.

## Requirements

- Node.js **>= 22.12.0**
- Git, recommended. Required for `apply` checkpoints and `revert`.
- Windows, macOS, or Linux.

SpecVibe makes no network calls and has no runtime dependencies.

## Install

Run it without installing:

```bash
npx specvibe init
```

Or install it globally:

```bash
npm install -g specvibe
specvibe init
```

The package exposes two binaries, `specvibe` and `sv`, with identical behavior.

> **Windows PowerShell:** use `specvibe`, not `sv`. PowerShell already defines `sv` as an alias for `Set-Variable`, so `sv init` looks like it worked but runs nothing. `sv.cmd init` also works. See the [PowerShell quickstart](powershell-quickstart.md) for a complete first run.

## Initialize a repository

From the repository root:

```bash
specvibe init
```

You can be explicit about agents:

```bash
specvibe init --agents opencode,claude,cursor
specvibe init --agents all
specvibe init --agents none
```

On a terminal, `init` also asks four short questions — what the project does, the stack, the frameworks, and the entry points. Detection can read manifests but not intent, so a project without one would otherwise start at `Stack: Unknown`. Every question shows the detected value as its default: press Enter to accept it, or type `skip` to clear it. The answers are written into `constitution.md` and `context.md`. Use `--no-input` to skip the questions in scripts and CI.

Already initialized? Run `specvibe setup` to answer the questions again and refresh the scan and agent files; it preserves what you already wrote.

What this creates:

```text
.specvibe/
├── constitution.md
├── context.md
├── decisions.md
├── config.json
├── state.json
├── context/codebase-summary.md
├── context/scan.json
├── tracks/
├── archive/
├── packs/          (gitignored)
├── backups/        (gitignored)
└── tmp/            (gitignored)
```

It also writes a managed `AGENTS.md` block and native command files for the configured agents.

Review these two files before planning real work:

1. `.specvibe/constitution.md` — the non-negotiable rules, size limits, forbidden patterns, and quality gates. Edit it to match how your team actually works.
2. `.specvibe/context.md` — product intent, users, architecture, conventions, and current focus. Keep it short enough that an agent can load it every session.

Commit the entire `.specvibe/` directory except the ignored local folders, plus the generated agent instruction files.

## Your first track

### 1. Propose

Describe a feature in plain language:

```bash
specvibe propose "Add CSV export to the reports page"
```

This creates a track folder, for example `.specvibe/tracks/add-csv-export-to-the-reports-page/`, containing:

- `proposal.md` — problem, goals, non-goals, user stories, risks, open questions
- `spec.md` — functional requirements, edge cases, and acceptance criteria
- `design.md` — approach, alternatives, file plan, test strategy, decisions
- `tasks.md` — ordered implementation tasks, verification gates, completion checks
- `meta.json` — status and checkpoint metadata

No implementation code is written. This is enforced by the command, not just by convention.

If the generated slug is too long, choose one explicitly:

```bash
specvibe propose "Add CSV export to the reports page" --slug csv-export
```

### 2. Fill in the plan

Open the four documents and replace every `[NEEDS CLARIFICATION: ...]` marker. Remove `{{TEMPLATE}}` variables if any remain, add real acceptance criteria, and cite existing files in the design.

Then validate:

```bash
specvibe approve add-csv-export-to-the-reports-page --check
```

Validation errors are blocking. Warnings are advisory. Typical errors:

- an empty document
- an unresolved `{{VARIABLE}}` or `[NEEDS CLARIFICATION]` marker
- no `## Acceptance Criteria` section
- acceptance criteria without IDs
- no `G`-prefixed verification gates
- duplicate checklist IDs

Fix the documents and run the check again.

### 3. Approve

Approval is a human action:

```bash
specvibe approve add-csv-export-to-the-reports-page
```

`--force` approves despite validation errors and records the exception on the track. Use it only after reviewing the risk.

### 4. Apply

Start implementation with a checkpoint:

```bash
specvibe apply add-csv-export-to-the-reports-page
```

By default this requires:

- a git repository
- at least one commit
- a clean working tree, excluding SpecVibe bookkeeping under `.specvibe/`

If you intentionally need to bypass a guard:

```bash
specvibe apply <track> --allow-dirty
specvibe apply <track> --allow-no-git
```

Both are recorded on the checkpoint. `--allow-dirty` means pre-existing changes are not part of the checkpoint. `--allow-no-git` means `revert` will not be available.

### 5. Work through tasks

Ask the agent to show the next item:

```bash
specvibe apply <track> --next
```

Complete items in order:

```bash
specvibe apply <track> --done T1
specvibe apply <track> --done G1 --confirm-gate
specvibe apply <track> --accept AC-1
```

- `T` items are implementation tasks.
- `G` items are verification gates. They require `--confirm-gate` after the command was actually run and its evidence reviewed.
- `C` items are completion checks.
- `AC` items live in `spec.md` and are verified independently of task order.

`--force` skips the ordering rule for a single item. It does not bypass gate confirmation.

### 6. Unify

When every item is checked:

```bash
specvibe unify <track>
```

This writes `summary.md`, moves the track to `.specvibe/archive/`, appends decisions to `.specvibe/decisions.md`, and clears the active track. Unified tracks are immutable.

### 7. Revert if needed

Preview a rollback first:

```bash
specvibe revert <track>
```

Review the checkpoint, commits since, changed files, and dirty entries. Then, only after explicit confirmation:

```bash
specvibe revert <track> --yes
```

This creates a backup branch, stashes dirty/untracked work, resets to the checkpoint, and archives the track as `reverted`.

## Working with your agent

If you initialized an integration, use its native command:

| Agent | Command |
| --- | --- |
| OpenCode | `/sv/propose` |
| Claude Code | `/sv:propose` |
| Gemini CLI | `/sv:propose` |
| Cursor | `sv-propose` skill |
| Windsurf | `/sv-propose` |
| Copilot | `/sv-propose` prompt |

Agents are instructed to validate with `approve --check` and then ask you to approve. They should never write feature code before that approval.

For a long session, give the agent a context pack instead of the whole repository:

```bash
specvibe pack <track> --stdout > .specvibe/packs/session.md
```

Or simply run:

```bash
specvibe pack <track>
```

## Everyday commands

```bash
specvibe status                     # tracks, progress, git state, next action
specvibe status <track> --json      # structured view for scripts
specvibe scan --focus "billing"     # refresh the code map with a focus
specvibe agents sync                # refresh generated agent files
specvibe doctor                     # diagnose setup problems
specvibe config list                # inspect configuration
```

## Upgrading

```bash
npm install -g specvibe@latest
specvibe setup
specvibe agents sync
```

`setup` refreshes the scan and generated files while preserving your constitution, context, and decisions. `agents sync` updates command files that SpecVibe generated; it backs up anything it must overwrite.

## Removing SpecVibe

There is no `deinit` command yet. To remove it from a repository:

1. Delete `.specvibe/`.
2. Remove SpecVibe managed blocks from `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` (or delete the files if they contain nothing else).
3. Delete generated command folders such as `.opencode/commands/sv/`, `.claude/commands/sv/`, `.gemini/commands/sv/`, `.cursor/skills/sv-*`, `.windsurf/workflows/sv-*`, `.devin/workflows/sv-*`, and `.github/prompts/sv-*`.
4. Uninstall the package if you installed it globally: `npm uninstall -g specvibe`.

Generated files contain a `specvibe:generated` marker, so they are easy to identify.

## Next steps

- [The SpecVibe workflow](workflow.md) — how to write tracks that agents can execute.
- [Agent integrations](agents.md) — generated files and native commands.
- [CLI reference](cli-reference.md) — every flag and exit code.
- [Configuration](configuration.md) — scan, pack, and git behavior.
