# SpecVibe: Scan

Build or refresh the repository's architectural map so future plans reuse what already exists.

## Steps

1. Run `specvibe scan` (fallback: `npx specvibe scan`). If the user mentioned a feature or area, add focus terms: `specvibe scan --focus "<terms>"`.
2. Read `.specvibe/context/codebase-summary.md`. Do not read the entire repository.
3. Report concisely:
   - Languages, frameworks, and major directories.
   - Existing components/functions that are relevant to the user's area (with file paths).
   - Files over the constitution's size limit and long-function hotspots.
   - Possible orphaned files or unused exports — clearly label these as heuristics, not deletion instructions.
   - Three concrete reuse opportunities or duplication risks.
4. If the scan is empty or fails, report the actual error and stop.

## Rules

- Read-only: do not edit source, delete "orphans", or reformat anything.
- Never delete code based on scanner heuristics without a separate, reviewed task.
- If the project has no `.specvibe/` yet, suggest `specvibe init` first.
