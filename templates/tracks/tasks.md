# Tasks — {{TITLE}}

> Track: `{{SLUG}}` · Execute top to bottom. One task at a time.
> Update state with `specvibe apply {{SLUG}} --done <ID>`. Gate IDs require explicit confirmation: `--done G1 --confirm-gate`.
> If a task fails, stop and report. Never mark it complete just to move on.

## Implementation

{{IMPLEMENTATION_TASKS}}

## Verification Gates

Run the real command and paste or summarize the evidence before marking a gate complete.

{{VERIFICATION_GATES}}

## Completion

{{COMPLETION_TASKS}}

---

### Task writing rules

- Each task is independently reviewable and small enough to verify.
- Name exact files and symbols to touch; avoid "update the app".
- Include focused tests in the same task as the behavior they prove.
- Do not add tasks for unrelated cleanup. Create a separate track instead.
- Tasks must preserve the file limits in the constitution.
