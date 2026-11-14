# Configuration

SpecVibe stores configuration in `.specvibe/config.json`. The file is committed so every contributor and agent sees the same rules.

Values are merged over built-in defaults and validated before use. Unknown fields are preserved for forward compatibility, but unknown values for known fields are rejected.

## Full example

```json
{
  "version": 1,
  "maxFileLines": 400,
  "maxFunctionLines": 80,
  "agents": ["opencode", "claude"],
  "scan": {
    "ignore": ["vendor/**", "generated/**"],
    "maxFiles": 5000,
    "maxFileBytes": 524288,
    "includeTests": true
  },
  "pack": {
    "maxTokens": 60000,
    "maxFileTokens": 12000,
    "maxFiles": 24
  },
  "git": {
    "requireCleanForApply": true,
    "autoCheckpoint": true
  }
}
```

## Keys

### Limits

| Key | Default | Range | Effect |
| --- | --- | --- | --- |
| `maxFileLines` | `400` | 50–100000 | Files above this are reported as size violations. Generated constitution and agent rules use this number. |
| `maxFunctionLines` | `80` | 10–10000 | Functions above this are reported as long-function candidates. |

Raising a limit does not rewrite an existing constitution. Edit `.specvibe/constitution.md` deliberately and record the reason in the decision log. `specvibe agents sync` refreshes generated agent rules from the current config.

### Agents

| Key | Default | Values |
| --- | --- | --- |
| `agents` | `["generic"]` | `opencode`, `claude`, `cursor`, `gemini`, `windsurf`, `copilot`, `generic` |

Order is normalized to the canonical order. Duplicates are removed. `generic` produces only `AGENTS.md`.

Changing this key does not write files. Run:

```bash
specvibe agents sync
```

### Scan

| Key | Default | Range | Effect |
| --- | --- | --- | --- |
| `scan.ignore` | `[]` | String array | Additional ignore patterns, merged with `.gitignore` and `.specvibeignore`. |
| `scan.maxFiles` | `5000` | 1–100000 | Stop walking after this many files and emit a warning. |
| `scan.maxFileBytes` | `524288` (512 KB) | 1 KB–50 MB | Skip files larger than this and emit a warning. |
| `scan.includeTests` | `true` | boolean | Include test files in the scan and focus ranking. |

Ignore patterns support gitignore-style negation and globs:

```json
{
  "scan": {
    "ignore": ["vendor/**", "generated/**", "*.min.js", "!vendor/keep.ts"]
  }
}
```

The scanner also always ignores common noise:

- version control: `.git`, `.hg`, `.svn`
- dependencies and build output: `node_modules`, `dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.svelte-kit`, `target`, `vendor`
- caches: `.cache`, `.turbo`, `.vite`, `.vitest`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`
- SpecVibe and agent folders: `.specvibe`, `.opencode`, `.claude`, `.cursor`, `.gemini`, `.windsurf`, `.devin`, `.github`
- lockfiles, minified bundles, source maps, snapshots, binary and media files

Use `--focus` to rank files for a feature without changing the scan scope:

```bash
specvibe scan --focus "billing invoices"
```

### Pack

| Key | Default | Range | Effect |
| --- | --- | --- | --- |
| `pack.maxTokens` | `60000` | 1000–2000000 | Default total budget for a context pack. |
| `pack.maxFileTokens` | `12000` | 1000–1000000 | Per-file cap before truncation. |
| `pack.maxFiles` | `24` | 1–500 | Maximum source files included in one pack. |

`specvibe pack --max-tokens <n>` overrides the total budget for one run. The effective minimum is 4000 tokens, regardless of the configured or requested value.

Token counts are estimates: roughly 4 ASCII characters per token and one token per CJK character. The pack reports its estimate and lists truncated/omitted files.

### Git

| Key | Default | Effect |
| --- | --- | --- |
| `git.requireCleanForApply` | `true` | Refuse the first `apply` unless the working tree is clean. |
| `git.autoCheckpoint` | `true` | Create a `refs/specvibe/checkpoints/...` ref at apply time. |

SpecVibe's own bookkeeping under `.specvibe/` is exempt from the cleanliness check. Real source, test, and config changes are not.

`--allow-dirty` bypasses the clean check for one invocation and records `dirtyAtCheckpoint: true`. If `requireCleanForApply` is `false`, dirty starts are allowed by default, but the checkpoint still records the state.

If `autoCheckpoint` is `false`, apply records the commit SHA but does not create a named ref. Revert can still resolve the commit while it exists in history.

## Updating configuration

Use the CLI so values are validated:

```bash
specvibe config list
specvibe config get pack.maxTokens
specvibe config set pack.maxTokens 30000
specvibe config set maxFileLines 300
specvibe config set agents opencode,claude
specvibe config set scan.ignore "vendor/**,generated/**"
specvibe config set git.requireCleanForApply false
```

Value parsing:

- `true` / `false` become booleans.
- Integer strings become numbers.
- Strings starting with `[` or `{` are parsed as JSON.
- `agents` and `scan.ignore` also accept comma-separated lists.
- Everything else stays a string.

Only these keys are mutable through the CLI:

`maxFileLines`, `maxFunctionLines`, `agents`, `scan.ignore`, `scan.maxFiles`, `scan.maxFileBytes`, `scan.includeTests`, `pack.maxTokens`, `pack.maxFileTokens`, `pack.maxFiles`, `git.requireCleanForApply`, `git.autoCheckpoint`.

Other keys are rejected with a usage error, so typos cannot silently create config.

## Precedence

1. Built-in defaults
2. `.specvibe/config.json`
3. Command-line flags for that invocation

There is no environment-variable configuration. `NO_COLOR` disables ANSI colors but is not a SpecVibe setting.

## Validation errors

Invalid configuration fails fast with exit code `3`:

```json
{
  "ok": false,
  "command": "config",
  "error": {
    "code": "CONFIG",
    "message": "Invalid config value for pack.maxTokens: expected an integer between 1000 and 2000000.",
    "hint": "Run `specvibe config set` or edit .specvibe/config.json."
  }
}
```

Fix the value or restore the previous file from git. `specvibe doctor` can also point out missing or unreadable configuration.
