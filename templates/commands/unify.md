# SpecVibe: Unify a track

Unify is the mandatory final step. It verifies the work against the spec, archives the track, and records architectural decisions. Do not skip it or fake completion.

## Steps

1. Identify the track from the user's message or the active track. Read `spec.md`, `design.md`, `tasks.md`, and the current `specvibe status`.
2. Run the project's full verification suite from the constitution: build, tests, typecheck, lint, and any manual checks. Report the actual commands and outcomes.
3. Walk through every acceptance criterion in `spec.md`. For each verified criterion, run:
   ```bash
   specvibe apply <track> --accept AC-N
   ```
   If support cannot be demonstrated, leave it unchecked.
4. Confirm every implementation task, verification gate, and completion task is checked with evidence. Do not use `--force` unless the user explicitly accepts an incomplete unification.
5. Run `specvibe unify <track>`. If it refuses, list the incomplete items and fix them or ask the user to decide. Do not invent evidence.
6. After success, report:
   - The archive path and files changed.
   - Acceptance results and any caveats.
   - Decisions recorded from `design.md`.
   - A suggested focused commit message.
7. Do not commit unless the user asks. Do not start a new feature in the same turn.

## Rules

- Unify only verifies and records; it must not introduce new implementation work.
- If a task reveals new scope, stop and update the plan instead of silently expanding.
- A unified track is immutable. Follow-up work needs a new track.
