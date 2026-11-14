# SpecVibe: Revert a track

Rolling back is destructive. **Never reset the user's work without explicit confirmation.**

## Steps

1. Identify the track from the user's message, or use the active track.
2. Run `specvibe revert <track>` **without `--yes`**. This is a dry run: it shows the checkpoint, commits made since, uncommitted changes, and the planned backup.
3. Explain the consequences clearly:
   - The working tree and branch will be reset to the checkpoint commit.
   - Current commits are preserved on a `specvibe-backup/...` branch.
   - Dirty/untracked files are stashed, not deleted; the stash reference is printed.
4. Ask the user to confirm. If they hesitate or ask to keep current changes, stop and suggest committing them first.
5. Only after explicit confirmation, run `specvibe revert <track> --yes`.
6. Report the backup branch, stash, and how to recover. The track is marked reverted; its documents remain for a post-mortem.

## Rules

- Never run `--yes` based on assumed intent.
- Never run `git reset --hard`, `git clean`, or stash-pop as a substitute; use the SpecVibe command so state stays consistent.
- If there is no checkpoint, explain why a revert is not possible and suggest a manual approach.
