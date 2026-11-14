# Project Context — {{PROJECT_NAME}}

> Human-maintained product context for AI agents. Keep this focused on intent, users, and conventions; put hard architectural rules in `constitution.md`.
> Last refreshed: {{DATE}}

## Product

{{DESCRIPTION}}

**Stack:** {{STACK}}

**Frameworks:** {{FRAMEWORKS}}

**Entry points:** {{ENTRY_POINTS}}

## Goals

<!-- Refine with /sv:setup. Make these outcomes, not feature lists. -->

- Deliver the core user outcome reliably and understandably.
- Keep the codebase small enough for agents and humans to hold in context.
- Ship changes through approved, verifiable tracks rather than ad-hoc edits.

## Non-goals

- Features that do not serve the product goals above.
- Broad rewrites without a measured problem and explicit approval.
- Premature abstractions with only one consumer.

## Users and use cases

- **Primary user:** describe the main persona and the job they are trying to do.
- **Key workflow:** describe the shortest end-to-end path that must work.
- **Constraints:** accessibility, performance, compliance, offline support, platform limits — record only real constraints.

## Domain glossary

| Term | Meaning |
| --- | --- |
| Track | An isolated SpecVibe feature folder containing proposal, spec, design, and tasks. |
| Unify | The mandatory final step that verifies acceptance criteria, archives the track, and records decisions. |
| Constitution | Repository-wide architectural rules and limits. |

## Conventions

- Source files stay under **{{MAX_FILE_LINES}} lines**; extract cohesive modules when they grow.
- Public functions and components have explicit types at their boundaries.
- Tests describe behavior and live near the code they verify unless the repository uses a dedicated test tree.
- Errors are actionable and never silently swallowed.
- Naming follows the existing codebase; consistency beats personal preference.

## Architecture snapshot

- Top-level areas: {{TOP_LEVEL_DIRS}}
- The compressed, generated code map lives at `.specvibe/context/codebase-summary.md`.
- The full machine-readable scan lives at `.specvibe/context/scan.json`.

## Current focus

- No active product focus has been recorded yet. Use `/sv:propose <feature>` to create the next track.
- Agent integrations: {{AGENTS}}

<!--
SpecVibe: /sv:setup interviews you and refines this file. Keep it under ~1 page.
Don't duplicate the constitution; link to it instead.
-->
