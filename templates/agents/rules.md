## SpecVibe workflow (mandatory)

This repository uses SpecVibe for spec-driven AI development. Read the repository constitution and context before planning or editing.

**Context order:** `.specvibe/constitution.md` → `.specvibe/context.md` → `.specvibe/context/codebase-summary.md` → active track in `.specvibe/tracks/`.

### The loop

1. **Scan:** understand existing code before planning. Use `specvibe scan` or the generated codebase map.
2. **Propose:** create `.specvibe/tracks/<slug>/` with proposal, spec, design, and tasks. No implementation code yet.
3. **Approve:** a human explicitly approves, then run `specvibe approve <track>`.
4. **Apply:** `specvibe apply <track>` creates a safety checkpoint. Complete tasks in order, update each with `specvibe apply <track> --done <ID>`, and pause at verification gates.
5. **Unify:** mark verified acceptance criteria with `specvibe apply <track> --accept <AC-ID>`, then run `specvibe unify <track>`. Never claim a track is done before unify succeeds.

Use the host agent's native SpecVibe commands when available (`/sv:propose`, `/sv:apply`, `/sv:unify`, and the agent-specific equivalents). The CLI is always a valid fallback:

```bash
specvibe propose "<feature>"
specvibe approve <track>
specvibe apply <track> --next
specvibe apply <track> --done T1
specvibe apply <track> --done G1 --confirm-gate
specvibe apply <track> --accept AC-1
specvibe unify <track>
specvibe pack <track>
specvibe status
specvibe revert <track>
```

### Windows and PowerShell

Call the CLI as `specvibe`. In Windows PowerShell, `sv` is a built-in alias for `Set-Variable`, so `sv <command>` silently does nothing; use `specvibe <command>` or `sv.cmd <command>`. Quote paths that contain spaces.

### Non-negotiables

- **No feature code before approval.** Planning and documentation only until the user approves the track.
- **Reuse before create.** Search for existing components, helpers, types, and patterns. Cite them in `design.md`.
- **Respect size limits:** max **{{MAX_FILE_LINES}} lines per source file**, **{{MAX_FUNCTION_LINES}} lines per function**. Extract instead of extending oversized files.
- **One task at a time.** Do not skip ahead, batch unrelated changes, or rewrite the plan silently.
- **Gates require evidence.** Run the command, report the result, and wait for the user at every gate. `--confirm-gate` means the user confirmed.
- **No bypass flags without consent.** Do not use `--force`, `--allow-dirty`, `--allow-no-git`, or `specvibe revert --yes` unless the user explicitly agrees after seeing the risk.
- **Do not edit** `.specvibe/archive/`, `.specvibe/context/scan.json`, or generated agent command/rule files. Regenerate them with the CLI.
- **Stop and ask** when requirements are ambiguous, a test fails, or the approved plan no longer fits reality. An updated plan is cheaper than broken code.
- **Do not commit** unless the user asks. At the end, suggest a focused commit message instead.

### Context discipline

Load only the files relevant to the current task. For a new session or a large repository, run `specvibe pack <track>` and use the generated pack instead of reading the whole codebase. Do not paste secrets, `.env` files, or large generated artifacts into context.
