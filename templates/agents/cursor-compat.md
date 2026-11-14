# SpecVibe

This repository uses SpecVibe for spec-driven development with AI agents.

The canonical, always-on Cursor rule is **`.cursor/rules/specvibe.mdc`**. Before planning or editing code, also read:

1. `.specvibe/constitution.md`
2. `.specvibe/context.md`
3. `.specvibe/context/codebase-summary.md`

Core rules:

- No feature code before a human approves the SpecVibe track.
- Reuse existing code; scan before planning.
- Work through an approved `tasks.md` one task at a time and stop at verification gates.
- Keep source files under **{{MAX_FILE_LINES}} lines** unless the constitution explicitly allows an exception.
- Run `specvibe unify <track>` before calling a feature complete.

Use the `/sv-*` skills or the `specvibe` CLI. If Cursor does not automatically apply `.cursor/rules/specvibe.mdc`, mention that rule in chat.
