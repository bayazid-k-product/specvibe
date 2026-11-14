# SpecVibe: Pack context

Build a clean, token-efficient context payload for a track so a new agent session does not need to read the whole repository.

## Steps

1. Determine the track from the user's message, or use the active track.
2. Run `specvibe pack <track>` (add `--max-tokens N` if the user specified a budget).
3. Read the generated pack path printed by the CLI. The pack includes the constitution, context, track specs, scan summary, and relevant source excerpts.
4. If the user plans to start a new session, tell them to attach or paste the pack file, then continue with `/sv:apply`.
5. Report the estimated tokens, included files, and any omitted/truncated files. If critical files were omitted, suggest increasing `--max-tokens` or narrowing the task.

## Rules

- Do not dump the entire pack into chat unless the user asks; share the path and a short manifest.
- Do not paste secrets, `.env` files, or generated build artifacts.
- Packing is read-only. Do not edit source or the track.
