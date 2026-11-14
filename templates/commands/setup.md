# SpecVibe: Setup

Set up or refine this repository's SpecVibe context. This is an interview and documentation task — **do not write feature code**.

## Steps

1. Check for `.specvibe/`. If it is missing, run `specvibe init` (fallback: `npx specvibe init`). If initialization is already complete, do not overwrite existing context blindly.
2. Read `.specvibe/constitution.md`, `.specvibe/context.md`, `.specvibe/context/codebase-summary.md` if present, the root README, and the main project manifests.
3. Interview the user with **at most five concise questions** covering anything the repository cannot answer:
   - What is the product's primary goal and who is it for?
   - What are the most important non-goals or hard constraints?
   - Which commands are authoritative for build, test, lint, and typecheck?
   - Are there forbidden patterns, legacy areas, or dependencies to avoid?
   - What file-size or complexity limits should agents enforce?
4. Update `.specvibe/constitution.md` and `.specvibe/context.md` directly. Preserve their structure, keep them concise, and replace vague guesses with confirmed answers. Do not invent constraints.
5. If the architecture changed, run `specvibe scan` and review `.specvibe/context/codebase-summary.md` for accuracy.
6. Show a short summary of what changed and tell the user the next step is `/sv:propose <feature>` (or `specvibe propose "<feature>"`).

## Rules

- Never modify application source code during setup.
- Do not add dependencies.
- Keep the constitution actionable and under roughly two pages.
- If the user does not know an answer, mark it as an open question rather than guessing.
