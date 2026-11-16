# CLI reference

```text
specvibe <command> [options]
sv <command> [options]
```

> **Windows PowerShell:** use `specvibe` (or `sv.cmd`). PowerShell already defines `sv` as an alias for `Set-Variable`, so the `sv` binary is shadowed and produces no output.

Run `specvibe help` for the command list or `specvibe help <command>` for details. Every command also accepts `--help`.

## Global options

| Option | Alias | Description |
| --- | --- | --- |
| `--json` | | Emit machine-readable JSON. Human progress output is suppressed. |
| `--quiet` | `-q` | Suppress normal output; errors are still printed. |
| `--no-color` | | Disable ANSI colors. `NO_COLOR` is also respected. |
| `--debug` | | Print stack traces and extra diagnostics on unexpected errors. |
| `--cwd <dir>` | | Run as if SpecVibe was started in this directory. |
| `--help` | `-h` | Show help. |
| `--version` | `-v` | Print the version. |

Global options can appear before or after the command:

```bash
specvibe --cwd ./repo status --json
specvibe status --cwd ./repo --json
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | I/O or unexpected internal error |
| `2` | Usage error: unknown command/option, missing value, invalid flag combination |
| `3` | Configuration, initialization, track lookup, or validation error |
| `4` | Invalid state or unsafe git state: not approved, unapproved task order, dirty tree, git required |
| `5` | Git operation failed |

`approve --check` is a special case: an invalid track is a normal result, so it prints JSON to **stdout** with `ok: false` and exits `3`. Thrown errors print JSON to **stderr**.

JSON success payloads have the shape:

```json
{ "ok": true, "command": "status", "...": "command-specific fields" }
```

JSON errors:

```json
{
  "ok": false,
  "command": "apply",
  "error": {
    "code": "GIT_DIRTY",
    "message": "The working tree has uncommitted implementation changes...",
    "hint": "Commit or stash your changes first...",
    "details": {}
  }
}
```

## `init`

```text
specvibe init [options]
```

Initialize SpecVibe in a repository. Creates `.specvibe/`, detects the stack, scans the repository, and writes agent files.

| Option | Description |
| --- | --- |
| `--agents <list>` | Comma-separated agent ids, or `all`/`none`. Default: auto-detect, then `generic`. |
| `--name <name>` | Override the detected project name in generated documents. |
| `--description <text>` | Override the detected project description. |
| `--no-scan` | Skip the initial scan. |
| `--no-agents` | Write only the `.specvibe/` baseline. |
| `--no-input` | Skip the guided questions and use the detected values (scripts, CI). |
| `--force` | Repair missing generated files and refresh the setup. Preserves constitution, context, and decisions. |

Examples:

```bash
specvibe init
specvibe init --agents opencode,claude,cursor
specvibe init --agents none --no-scan
specvibe init --force
```

Behavior:

- Refuses to initialize your home directory or a filesystem root unless `--force` is used.
- Refuses to initialize twice unless `--force` or `setup` is used.
- Writes `.specvibe/.gitignore` for local-only artifacts.
- Appends required entries to an existing `.specvibe/.gitignore` without duplicating them.

## `setup`

```text
specvibe setup [options]
```

Alias: `reinit`.

Behaves like `init` on a new repository. On an existing repository it preserves `constitution.md`, `context.md`, and `decisions.md`, refreshes the scan and config, and syncs agent files. Accepts the same options as `init`.

## `scan`

```text
specvibe scan [options]
```

Map the codebase and write:

- `.specvibe/context/codebase-summary.md`
- `.specvibe/context/scan.json`

| Option | Description |
| --- | --- |
| `--focus <terms>` | Rank files relevant to a feature or area. |

Example:

```bash
specvibe scan --focus "billing invoices" --json
```

The scan respects `.gitignore`, `.specvibeignore`, `scan.ignore`, hard-ignored directories (`node_modules`, `dist`, build outputs, caches, `.specvibe`, agent folders), and the configured file count and size limits.

Output includes stats, languages, directories, files, exports/imports, size violations, long functions, possible orphans, unused exports, focus matches, and warnings.

## `propose`

```text
specvibe propose "<feature>" [options]
```

Alias: `plan`.

Create a reviewable track. Writes no implementation code.

| Option | Description |
| --- | --- |
| `--slug <slug>` | Override the generated slug. Must be lowercase ASCII, digits, and hyphens. |
| `--focus <terms>` | Override scanner focus terms. Default: the feature title. |
| `--no-scan` | Reuse the existing scan instead of rescanning. Fails if no scan exists. |

Examples:

```bash
specvibe propose "Add CSV export to the reports page"
specvibe propose "Rate-limit the public API" --slug api-rate-limit
specvibe plan "Improve onboarding" --no-scan
```

The track becomes active in `.specvibe/state.json`. Titles are limited to 300 characters. Slugs are limited to 48 characters and avoid Windows reserved names.

## `approve`

```text
specvibe approve [track] [options]
```

Validate or approve a proposed track. If `[track]` is omitted, SpecVibe uses the active track, or the only track.

| Option | Description |
| --- | --- |
| `--check` | Validate only. Does not change status. |
| `--force` | Approve despite validation errors and record the exception. |

Examples:

```bash
specvibe approve my-feature --check
specvibe approve my-feature
specvibe approve my-feature --force
```

Agents should run `--check` and then ask the human. Approval is a human action.

## `apply`

```text
specvibe apply [track] [options]
```

Start an approved track or update progress. The first apply creates a git checkpoint.

| Option | Description |
| --- | --- |
| `--next` | Show the next unchecked item without changing state. |
| `--done <ID>` | Mark one task (`T1`), gate (`G1`), or completion item (`C1`) done. |
| `--accept <AC-ID>` | Mark one verified acceptance criterion done. |
| `--confirm-gate` | Confirm that a gate was run and its evidence reviewed. Requires `--done`. |
| `--force` | Skip task order for one item. Does not bypass gate confirmation. |
| `--allow-dirty` | Start from a dirty working tree. Pre-existing changes are not part of the checkpoint. |
| `--allow-no-git` | Start without git. Revert will be unavailable. |

Only one of `--next`, `--done`, or `--accept` may be used per invocation.

Examples:

```bash
specvibe apply my-feature
specvibe apply my-feature --next
specvibe apply my-feature --done T1
specvibe apply my-feature --done G1 --confirm-gate
specvibe apply my-feature --accept AC-1
specvibe apply my-feature --allow-dirty
```

Rules:

- `proposed` tracks cannot be applied.
- Tasks, gates, and completion items must be completed in order unless `--force`.
- Gates always require `--confirm-gate`.
- Already-completed items are idempotent.
- Unknown IDs fail without changing state.

## `unify`

```text
specvibe unify [track] [options]
```

Verify completion, archive the track, and append decisions.

| Option | Description |
| --- | --- |
| `--force` | Unify with unchecked items or validation errors. Records every exception. Requires explicit user consent. |

Example:

```bash
specvibe unify my-feature
```

Refuses if any task, gate, completion item, or acceptance criterion is unchecked. Writes `summary.md`, moves the track to `.specvibe/archive/<date>-<slug>/`, appends to `.specvibe/decisions.md`, and clears the active track.

## `pack`

```text
specvibe pack [track] [options]
```

Build a token-budgeted context pack.

| Option | Description |
| --- | --- |
| `--max-tokens <n>` | Override the configured budget. Minimum: 1000. Effective floor: 4000. |
| `--out <file>` | Write to a custom path, relative to the repository root or absolute. |
| `--stdout` | Print the Markdown pack instead of only the manifest. |

Examples:

```bash
specvibe pack
specvibe pack my-feature --max-tokens 30000
specvibe pack my-feature --out context/session.md
specvibe pack my-feature --stdout > context.md
```

Default output: `.specvibe/packs/<track>.md` (or `project-context.md` when no track is active). Packs include the constitution, context, decisions, active track, codebase map, and relevant source files. Omitted and truncated files are listed explicitly.

## `status`

```text
specvibe status [track] [options]
```

Read-only. With no track, shows all tracks, the active track, progress, git state, scan freshness, agents, the last pack, and the next safe action. With a track, shows detailed progress, gates, acceptance criteria, checkpoint, archive path, and the next action.

Examples:

```bash
specvibe status
specvibe status my-feature
specvibe status --json
```

## `revert`

```text
specvibe revert [track] [options]
```

Safely roll a track back to its checkpoint. Dry-run by default.

| Option | Description |
| --- | --- |
| `--yes` | Perform the revert. Without it, only the plan is printed. |

Examples:

```bash
specvibe revert my-feature
specvibe revert my-feature --yes
```

Only `applying` tracks with a real git checkpoint can be reverted. `--yes` creates a backup branch at the current HEAD, stashes dirty/untracked work, resets to the checkpoint, restores and archives the track as `reverted`, and logs recovery details.

Never run `--yes` without explicit user confirmation.

## `agents`

```text
specvibe agents [list|detect|sync|add|remove] [agents] [options]
```

| Action | Description |
| --- | --- |
| `list` | Show every supported agent, whether it is configured, detected, and which files it uses. |
| `detect` | Detect agents from repository markers. |
| `sync` | Regenerate files for the configured agents. |
| `add <list>` | Add agents, then sync. Accepts `all`. |
| `remove <list>` | Remove agents and clean up their generated files. Accepts `all`. |

| Option | Description |
| --- | --- |
| `--force` | Replace owned files that were not generated by SpecVibe. A backup is kept. |

Examples:

```bash
specvibe agents
specvibe agents detect
specvibe agents add cursor,copilot
specvibe agents remove windsurf
specvibe agents sync
specvibe agents sync --force
```

Managed files preserve user content outside SpecVibe markers. Generated command files are not overwritten unless SpecVibe created them, unless `--force` is used.

## `doctor`

```text
specvibe doctor [options]
```

Diagnose installation, config, git, scan, agent files, and project state. Works before `init`, so it can explain what is missing.

```bash
specvibe doctor
specvibe doctor --json
```

The JSON payload contains `checks` and a `summary` with counts of ok, warning, and error checks.

## `config`

```text
specvibe config [list|get|set] [key] [value]
```

| Action | Description |
| --- | --- |
| `list` | Print the normalized configuration. |
| `get <key>` | Print one value, including nested keys such as `pack.maxTokens`. |
| `set <key> <value>` | Validate and persist one value. |

Examples:

```bash
specvibe config list
specvibe config get maxFileLines
specvibe config get pack.maxTokens
specvibe config set pack.maxTokens 30000
specvibe config set agents opencode,claude
specvibe config set scan.ignore "vendor/**,generated/**"
```

Mutable keys: `maxFileLines`, `maxFunctionLines`, `agents`, `scan.ignore`, `scan.maxFiles`, `scan.maxFileBytes`, `scan.includeTests`, `pack.maxTokens`, `pack.maxFileTokens`, `pack.maxFiles`, `git.requireCleanForApply`, `git.autoCheckpoint`.

Values are parsed as booleans, integers, JSON, or strings. Invalid values are rejected before the file is written. Setting `agents` does not regenerate agent files; run `specvibe agents sync`.

## `help` and `version`

```bash
specvibe help
specvibe help apply
specvibe version
specvibe --version
```

## Track resolution

Commands that accept `[track]` resolve in this order:

1. Exact slug match (case-insensitive).
2. Unique prefix match.
3. Unique substring match.
4. If no argument: the active track, or the only track.

Ambiguous queries list the matches. Missing tracks suggest creating one.
