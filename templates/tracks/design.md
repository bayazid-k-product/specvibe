# Design — {{TITLE}}

> Track: `{{SLUG}}` · Project: {{PROJECT_NAME}}

## Context

[NEEDS CLARIFICATION: summarize the current architecture and why the existing approach cannot satisfy the spec unchanged]

### Reuse candidates

{{RELEVANT_FILES}}

### Scan findings

{{SCAN_FINDINGS}}

## Approach

[NEEDS CLARIFICATION: the chosen implementation approach, in enough detail that another agent can execute it without guessing]

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| [NEEDS CLARIFICATION: alternative 1] | [reason] |
| [NEEDS CLARIFICATION: alternative 2] | [reason] |

## Architecture changes

- Modules/files added:
- Modules/files changed:
- Modules/files removed (must be explicitly justified):

## File plan

List exact paths so the apply phase can stay scoped. Prefer extending existing files/modules before adding new ones.

| Path | Existing/new | Purpose |
| --- | --- | --- |
| `[path]` | existing | [why it changes] |
| `[path]` | new | [why it cannot live in an existing module] |

## Data model and interfaces

[NEEDS CLARIFICATION: types, schemas, API contracts, events, or state transitions. Include validation and error shapes.]

## Test strategy

- Unit: [what behavior, where]
- Integration: [what boundary, where]
- Manual acceptance: [how each AC will be demonstrated]

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| [NEEDS CLARIFICATION: risk] | [impact] | [mitigation] |

## Decisions

Record only decisions that future agents must not silently reverse. Start each line with an ID.

- **D-1:** [NEEDS CLARIFICATION: decision and rationale]
- **D-2:** [NEEDS CLARIFICATION: decision and rationale]

## Rollout and rollback

- Rollout: [steps, feature flag, migration order]
- Rollback: [how to revert safely; note the SpecVibe checkpoint]

## Size and dependency check

- Largest expected file after this change: [NEEDS CLARIFICATION: path and estimated lines]
- New dependencies: [none, or name + rationale + alternative considered]

Constitution limits: {{MAX_FILE_LINES}} lines per file, {{MAX_FUNCTION_LINES}} lines per function.
