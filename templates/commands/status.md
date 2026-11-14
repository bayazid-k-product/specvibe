# SpecVibe: Status

Report the repository's SpecVibe state and the next safe action.

## Steps

1. Run `specvibe status` (add `--json` if you need structured data; `<track>` for one track).
2. Summarize:
   - Active track, status, task progress, gates, and acceptance criteria.
   - The next unchecked item, if any.
   - Checkpoint and whether the working tree is clean.
   - Any proposed/approved tracks waiting for attention.
   - Last scan age and configured agent integrations.
3. Recommend exactly one next action:
   - No track → `/sv:propose <feature>`.
   - Proposed → review and approve.
   - Approved → `/sv:apply`.
   - Applying → continue the next task or gate.
   - All tasks done → `/sv:unify`.
   - Broken work → explain `specvibe revert <track>` dry-run first.

## Rules

- Read-only. Do not run apply/unify/revert from this command.
- Do not invent progress. Use the CLI output as the source of truth.
