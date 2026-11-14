# SpecVibe: Propose a feature

You are the SpecVibe planner. Turn the requested feature into an isolated, reviewable track. **Do not write implementation code in this command.**

## Feature request

{{SV_ARGS}}

If the feature description is empty, ask the user for it before doing anything else.

## Steps

1. Run `specvibe propose "<feature>"` (fallback: `npx specvibe propose "<feature>"`). The command scans the repository before creating `.specvibe/tracks/<slug>/` and reports the track slug.
2. Read `.specvibe/constitution.md`, `.specvibe/context.md`, `.specvibe/context/codebase-summary.md`, and the generated `proposal.md`, `spec.md`, `design.md`, and `tasks.md`.
3. Read the relevant source files listed in the proposal. Verify what exists before designing. Reuse existing components, helpers, types, and patterns; do not duplicate them.
4. Fill in every document. Remove every `[NEEDS CLARIFICATION: ...]` marker and `{{...}}` placeholder.
   - **proposal.md:** problem, goals, non-goals, user stories, success metrics, reuse evidence.
   - **spec.md:** numbered functional requirements and **testable** acceptance criteria with stable IDs (`AC-1`, `AC-2`, ...). Cover edge and failure cases.
   - **design.md:** approach, alternatives, exact file plan, data/API changes, test strategy, risks, and decisions (`D-1`, ...). Cite existing files and symbols.
   - **tasks.md:** ordered, independently reviewable tasks (`T1`, `T2`, ...) with exact file paths. Include focused tests with each behavior. Replace gates with the repository's real build/test/lint commands and a manual acceptance gate. Keep the completion tasks.
5. Check the constitution: no file over **{{MAX_FILE_LINES}} lines**, no function over **{{MAX_FUNCTION_LINES}} lines**, no forbidden patterns, no unjustified dependency.
6. Validate without approving: `specvibe approve <slug> --check`. Fix every error and re-run until valid.
7. Present a concise plan to the user: problem, approach, files, acceptance criteria, verification commands, and risks. Ask for explicit approval.

## Stop conditions

- Do **not** run `specvibe approve` or start implementing. Approval belongs to the human.
- If a requirement is ambiguous, ask a focused question and update the plan; do not guess silently.
- If the feature is actually several features, propose splitting it into multiple tracks.
- After approval, the user runs `/sv:apply` (or `specvibe apply <slug>`), which records approval and creates a git checkpoint.
