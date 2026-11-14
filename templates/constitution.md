# Project Constitution — {{PROJECT_NAME}}

> Ratified: {{DATE}} · Maintained by humans, enforced by SpecVibe.
> This document is the highest authority for architecture and implementation decisions in this repository. If a spec conflicts with this constitution, stop and ask for an amendment.

## 1. Mission

Build **{{PROJECT_NAME}}** as a coherent product, not a pile of generated features. Every change must leave the codebase easier to understand, test, and extend than it was before.

{{DESCRIPTION}}

## 2. Non-negotiable rules

1. **Spec before code.** No implementation starts until a SpecVibe track has been approved with `specvibe approve <track>`.
2. **Scan before plan.** Reuse existing modules and patterns. New code must have a stated reason to exist.
3. **One track at a time.** Do not work on unrelated features in the same track. Keep changes inside the approved file plan.
4. **Acceptance criteria are contracts.** A track is not done until every criterion in `spec.md` is checked with evidence.
5. **Respect the size limits.** Source files above **{{MAX_FILE_LINES}} lines** and functions above **{{MAX_FUNCTION_LINES}} lines** require extraction or an explicit constitutional exception.
6. **No silent scope expansion.** If the plan is wrong, stop, update the track, and ask for approval again.
7. **Never bypass verification gates.** Build, tests, type checks, and manual acceptance checks must pass before `specvibe unify`.
8. **Keep context clean.** Agents load the constitution, context, active track, and the smallest relevant file set — not the entire repository.

## 3. Product and technology

**Tech stack:** {{STACK}}

**Frameworks and major tools:** {{FRAMEWORKS}}

**Package manager:** {{PACKAGE_MANAGER}}

**Manifests:** {{MANIFESTS}}

**Entry points:** {{ENTRY_POINTS}}

### Architecture boundaries

{{ARCHITECTURE}}

Rules:

- Dependencies point inward toward domain logic; UI and transport layers must not own business rules.
- Shared utilities live in one canonical location. Do not create a second helper for an existing responsibility.
- Modules expose a small public surface. Internal files should not be imported across feature boundaries without an explicit design decision.
- Generated, vendored, and build output must never be edited by hand.

## 4. Size and complexity limits

| Limit | Value | Response |
| --- | --- | --- |
| Max source file length | {{MAX_FILE_LINES}} lines | Extract cohesive modules; do not split arbitrarily. |
| Max function length | {{MAX_FUNCTION_LINES}} lines | Extract intent-revealing helpers. |
| New dependencies | 0 by default | Add only with a recorded decision in `design.md`. |
| Public API changes | Explicit | Update specs, docs, and tests in the same track. |

Files that exceed the limit are visible in `.specvibe/context/codebase-summary.md`. Do not make them larger; reduce them when the track touches them.

## 5. Forbidden patterns

- God files, giant components, and catch-all `utils` modules.
- Duplicating an existing function, component, type, or validation rule.
- Broad refactors hidden inside a feature track.
- Unchecked `any`, ignored errors, empty catch blocks, or silent fallbacks that hide failure.
- Editing lockfiles, generated files, vendored code, or migration history by hand.
- Committing secrets, tokens, private keys, or local environment files.
- Adding a dependency for something the standard library or an existing package already does.
- Writing code against an unapproved or stale spec.
- Marking a task, gate, or acceptance criterion complete without running the corresponding check.
- Running destructive git commands without explicit human approval.

## 6. Quality gates

{{QUALITY_GATES}}

If a command is not defined here, discover it from the repository manifests and update this constitution with the correct command.

## 7. Dependency policy

- Prefer the platform, the standard library, and code already in the repository.
- Every new dependency needs: a problem statement, an alternative considered, a maintenance assessment, and a rollback plan in `design.md`.
- Pin or constrain versions consistently with the package manager's lockfile.
- Remove the dependency and its usages in the same track if it is abandoned.

## 8. AI agent protocol

Every coding agent working in this repository must follow this loop:

1. **Read context:** `.specvibe/constitution.md`, `.specvibe/context.md`, and `.specvibe/context/codebase-summary.md`.
2. **Plan:** create or update a track under `.specvibe/tracks/<slug>/`. No implementation before approval.
3. **Apply:** work through `tasks.md` in order, one task at a time. Report failures instead of skipping them.
4. **Verify:** stop at every gate and report concrete evidence.
5. **Unify:** mark acceptance criteria only after verification, then run `specvibe unify` so the track is archived and decisions are logged.

Agents must ask rather than guess when a requirement is ambiguous. An incomplete plan is cheaper than broken code.

## 9. Amendments

Change this constitution only through a deliberate, reviewed edit. Record the reason in `.specvibe/decisions.md` when the change affects architecture, quality gates, or the agent workflow. Bumping a limit requires a concrete rationale, not convenience.

---

_Generated by SpecVibe from project detection on {{DATE}}. Refine it with the `/sv:setup` command; keep it short enough that every agent can load it on every task._
