# SpecVibe: Apply a track

Execute an approved track with the Plan → Apply → Unify safety loop. Stay inside the approved plan.

## Preconditions

1. Determine the track from the user's message, or use the active track: `specvibe status --json` / `specvibe status`.
2. Run `specvibe apply <track>` (fallback: `npx specvibe apply <track>`).
3. If it reports that approval is required, check whether the user explicitly approved this plan in the conversation. If yes, run `specvibe approve <track>` and then `specvibe apply <track>`. If not, ask for approval and stop.
4. If git is dirty, ask the user to commit or stash before applying. If git is unavailable, ask before using `--allow-no-git`. Do not bypass safety flags on your own.

## Task loop

1. Run `specvibe apply <track> --next`. Work on **only** the item it returns.
2. Read the task, its acceptance criteria, and the relevant files. Follow the constitution and the approved design.
3. Implement the smallest complete change for that task, including focused tests.
4. Run the relevant checks. If they fail, fix them within the task or stop and report the blocker. Never mark a failing task complete.
5. Mark the task done: `specvibe apply <track> --done <ID>`.
6. Repeat. Do not skip ahead. Do not add unrelated refactors, formatting churn, or dependencies.

## Verification gates

When the next item is a gate (`G*`):

1. Run the gate command exactly as written and capture the result.
2. Report concrete evidence to the user and ask: "Gate Gx passed — continue?"
3. Only after explicit confirmation, run `specvibe apply <track> --done Gx --confirm-gate`.

Never use `--force` to skip order or bypass a gate without explicit user consent.

## Acceptance criteria

Do not mark acceptance criteria complete until you have verified them. Use:

```bash
specvibe apply <track> --accept AC-1
```

Marking an AC is a claim of evidence, not a checkbox exercise.

## Finish

When no unchecked items remain:

1. Do not claim the feature is done yet.
2. Run the unify workflow (`/sv:unify` or `specvibe unify <track>`), which verifies all criteria and archives the track.
3. If blocked, summarize the blocker, files changed, and what the user must decide. Leave the track in `applying` state.
