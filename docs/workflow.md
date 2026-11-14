# The SpecVibe workflow

SpecVibe is built around one idea: **the agent should not decide when work is ready to start or finished.**

A track is a small, reviewable plan that moves through explicit states. Every transition is a command, every guard has an escape hatch with a recorded reason, and every completed track leaves a history.

## The loop

```text
Constitution + context
        │
        ▼
      scan ──────────────┐
        │                │
        ▼                │
    propose ──► review ──┘
        │         │
        │         ▼
        │      approve
        │         │
        ▼         ▼
      apply ──► checkpoint
        │
        ▼
 tasks T1..Tn (in order)
        │
        ▼
 gates G1..Gn (evidence + --confirm-gate)
        │
        ▼
 acceptance AC-1..AC-n (verified)
        │
        ▼
      unify ──► archive + decisions
        │
        └── (any time) revert ──► backup branch + stash + checkpoint
```

## 1. Scan before planning

```bash
specvibe scan
specvibe scan --focus "billing invoices"
```

The scanner is deterministic and heuristic. It reports:

- files, languages, directories, and total lines
- exports and imports per source file
- inbound connection counts
- likely entry points
- files over the configured size limit
- long functions
- possible orphans and unused exports (heuristics, not deletion instructions)

The result is written to `.specvibe/context/codebase-summary.md` for humans and agents, and `.specvibe/context/scan.json` for `pack` and tooling.

The codebase summary is part of the constitution's context order. Agents should read it before proposing a design, so they reuse what already exists.

## 2. Propose a track

```bash
specvibe propose "Add CSV export to the reports page"
```

The title becomes a slug (`add-csv-export-to-the-reports-page`) and a folder:

```text
.specvibe/tracks/<slug>/
├── proposal.md
├── spec.md
├── design.md
├── tasks.md
├── meta.json
└── summary.md      # added at unify time
```

### Proposal

The proposal explains why the work exists:

- problem
- goals and non-goals
- user stories
- success metrics
- risks and assumptions
- open questions

It is not a task list. It is the argument for doing the work at all.

### Specification

The spec defines observable behavior and ends with **Acceptance Criteria**:

```markdown
## Acceptance Criteria

- [ ] AC-1 — Exporting a report produces a valid CSV with a header row.
- [ ] AC-2 — Values containing commas or quotes are escaped correctly.
- [ ] AC-3 — An empty report produces a header-only CSV, not an error.
```

Every criterion must be independently verifiable. Each needs an ID. Avoid vague criteria such as "works well" or "is fast" unless you also state the measurement.

### Design

The design explains how the change fits the existing code:

- context and approach
- alternatives considered and why they were rejected
- file plan: existing vs new
- test strategy
- risks and mitigations
- decisions that future agents must not silently reverse
- rollout and rollback

Cite real files and symbols from the scan. A design that invents modules is a warning sign.

### Tasks

Tasks are ordered and small enough to review:

```markdown
## Implementation

- [ ] T1 — Add the CSV serializer in `src/reports/csv.ts`.
- [ ] T2 — Wire the export action into `src/reports/export.ts`.
- [ ] T3 — Add unit tests for quoting and empty input.

## Verification Gates

- [ ] G1 — Build passes: `npm run build`
- [ ] G2 — Tests pass: `npm test`

## Completion

- [ ] C1 — All acceptance criteria in `spec.md` are checked and verified.
- [ ] C2 — Constitution limits are respected.
- [ ] C3 — Existing code was reused or extended where possible.
```

The generated tasks are placeholders with `[NEEDS CLARIFICATION]` markers. Replace them with the real plan.

## 3. Validate and approve

```bash
specvibe approve <track> --check
```

Validation errors block approval:

| Code | Meaning |
| --- | --- |
| `missing_content` | One of the four documents is empty. |
| `unresolved_placeholder` | A `{{TEMPLATE_VARIABLE}}` remains. |
| `needs_clarification` | A `[NEEDS CLARIFICATION]` marker remains. |
| `missing_acceptance` | `spec.md` has no Acceptance Criteria section. |
| `no_acceptance` | The section exists but contains no checklist items. |
| `acceptance_without_id` | A criterion has no `AC-N` ID. |
| `no_tasks` | `tasks.md` has no checklist items. |
| `no_gates` | `tasks.md` has no `G`-prefixed verification gate. |
| `duplicate_id` | The same checklist ID appears twice. |
| `thin_document` | Warning: a document is very short. |
| `no_implementation_tasks` | Warning: no `T`-prefixed tasks were found. |

Agents should run `--check` and then ask the human. A human runs the real approval:

```bash
specvibe approve <track>
```

`--force` records `forced: true` on the track meta and in history. It is an explicit exception, not a shortcut.

## 4. Apply with a checkpoint

```bash
specvibe apply <track>
```

The first apply:

1. Verifies the track is `approved`.
2. Requires git unless `--allow-no-git`.
3. Requires a clean working tree unless `--allow-dirty` or `git.requireCleanForApply` is false.
4. Creates a checkpoint ref under `refs/specvibe/checkpoints/<slug>/<timestamp>`.
5. Records the commit, timestamp, and dirty state in `meta.json`.
6. Sets the track status to `applying`.

SpecVibe's own bookkeeping under `.specvibe/` is exempt from the cleanliness check. Real source changes are not.

```text
meta.checkpoint = {
  commit: "<full sha>",
  ref: "refs/specvibe/checkpoints/<slug>/<stamp>",
  createdAt: "<iso timestamp>",
  dirtyAtCheckpoint: false
}
```

## 5. Execute tasks in order

```bash
specvibe apply <track> --next
```

`--next` is read-only. It prints the next unchecked item and suggested action.

Mark one item complete:

```bash
specvibe apply <track> --done T1
```

Rules:

- The item must be the next unchecked item unless `--force` is used.
- Already-checked items are idempotent.
- Gates require `--confirm-gate`.
- Unknown IDs fail without changing state.

### Gates are evidence checkpoints, not checkboxes

A gate says "run this command and report the result." The agent runs it, shares the output, and asks the user. Only then:

```bash
specvibe apply <track> --done G1 --confirm-gate
```

If the command fails, the gate stays open. Do not mark it complete because "the failure is unrelated" unless that judgment is explicitly accepted.

### Acceptance is verified separately

```bash
specvibe apply <track> --accept AC-1
```

Acceptance criteria are checked in `spec.md` and can be verified in any order. They are the contract, so they are deliberately not tied to individual tasks.

## 6. Unify and archive

Before unifying, `specvibe status` should show all tasks, gates, completion checks, and acceptance criteria complete.

```bash
specvibe unify <track>
```

Unify refuses while anything is unchecked. It writes a summary containing:

- outcome
- completion counts
- acceptance criteria with check state
- verification gates
- decisions extracted from `design.md`
- files changed since the checkpoint
- forced exceptions, if any

Then it:

1. Moves the track to `.specvibe/archive/<date>-<slug>/`.
2. Appends a dated block to `.specvibe/decisions.md`.
3. Clears the active track if it matches.
4. Records the event in `.specvibe/state.json`.

`--force` allows an incomplete unification. It records every skipped item as an explicit exception. This exists for real-world exceptions, not for avoiding the checklist.

### Decisions

Only bullet lines in the `## Decisions` section of `design.md` are recorded. Prefix each with an ID:

```markdown
## Decisions

- **D-1: Use the platform CSV encoder instead of a new dependency.**
- **D-2: Keep export logic in the reports module; do not create a shared export service yet.**
```

At unify time the IDs and bold markers are stripped, and the text is appended to the decision log. This gives future agents a compact history of choices that should not be silently reversed.

## 7. Revert safely

Preview:

```bash
specvibe revert <track>
```

The dry run shows:

- the checkpoint and resolved commit
- commits since the checkpoint
- changed files
- dirty and untracked entries
- the exact recovery plan

Execute after explicit confirmation:

```bash
specvibe revert <track> --yes
```

Recovery:

1. Snapshot track documents (so the archive preserves the plan even after reset).
2. Create `specvibe-backup/<slug>-<timestamp>` at the current HEAD.
3. Stash dirty and untracked work.
4. Reset the working tree and current branch to the checkpoint.
5. Restore and archive the track as `reverted`.
6. Append recovery details to the decision log.

Nothing is removed from git history. If the working tree cannot be reset, the track is not archived and the error names the backup branch and stash.

## Writing tracks that agents can execute

Good tracks share a few properties:

- **One outcome.** Do not combine a feature, a refactor, and a dependency upgrade.
- **Small tasks.** Each task should be independently reviewable.
- **Real file paths.** Reference paths that exist or that you explicitly plan to create.
- **Executable gates.** Use the project's actual commands, not "run the tests somehow."
- **Testable acceptance.** State observable behavior and edge cases.
- **Recorded decisions.** If a future agent might reverse it, write it down.
- **No hidden scope.** If the plan changes, update the track and ask for approval again.

## Status and history

`specvibe status` is the read-only source of truth. It shows:

- active and recent tracks with progress
- the next safe action
- git branch, commit, and cleanliness
- scan freshness
- configured and detected agents
- the last context pack
- recent history events

`state.json` records events such as `proposed`, `approved`, `checkpoint`, `task_completed`, `acceptance_verified`, `unified`, and `reverted`. It is plain JSON and safe to inspect.

## When to start a new track

Start a new track when:

- the accepted work was unified
- the scope changes materially
- the plan no longer matches reality
- you need to revert and try a different approach

Do not edit an archived track. Do not reopen a unified track. History is append-only by design.
