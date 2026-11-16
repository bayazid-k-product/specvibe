# PowerShell quickstart (Windows)

One first run, from installing SpecVibe to closing the terminal. For the full reference see [Getting started](getting-started.md) and the [CLI reference](cli-reference.md).

> **Use `specvibe`, never `sv`.** Windows PowerShell already defines `sv` as an alias for `Set-Variable`, so `sv init` prints nothing and does nothing. `sv.cmd init` works if you want the short name.

## 1. Install

```powershell
npm i -g specvibe@latest
specvibe --version   # expect 0.2.1
```

If Windows says `specvibe is not recognized`, close the terminal and open a new one.

## 2. Open your project

```powershell
cd "C:\Users\you\Desktop\my project"
```

Quote the path when it contains spaces.

## 3. Give git a name (once per project)

`apply` creates a checkpoint and `revert` restores it, so both need git. A commit also needs an identity:

```powershell
git init
git config user.name "Your Name"
git config user.email "you@example.com"
git add -A
git commit -m "before SpecVibe"
```

Already a git repository? Skip `git init`, and keep `git config` only if commits fail with `Author identity unknown`.

Git's `LF will be replaced by CRLF` warnings are normal on Windows and safe to ignore.

## 4. Initialize

```powershell
specvibe init
```

Four questions follow. Press **Enter** to accept the detected value shown in `[...]`, type an answer, or type `skip` to leave it empty. The answers are written into `.specvibe/constitution.md` and `.specvibe/context.md`; answering the stack question is what stops it saying `Unknown`.

`init` refuses to run twice. To answer the questions again later, use `specvibe setup` — it keeps what you already wrote.

## 5. See where you are

```powershell
specvibe status
```

Read the last line: it is the next safe action.

## 6. Plan the first feature

```powershell
specvibe propose "prayer reminders"
```

This creates `.specvibe/tracks/prayer-reminders/` with `proposal.md`, `spec.md`, `design.md`, and `tasks.md`. **No implementation code is written.** Use the slug printed in `Created track "..."` for every later command; `specvibe status` lists the tracks that exist.

## 7. Review and approve

```powershell
specvibe approve prayer-reminders --check
```

The errors are unfinished `[NEEDS CLARIFICATION]` markers. Fill them in the four documents — or let your coding agent fill them — then re-run the check until it reports `Errors 0`, and approve:

```powershell
specvibe approve prayer-reminders
```

Only to see how the tool behaves, you can approve an unfinished plan with `--force`. Approving is a human action; `--check` is what an agent should run.

## 8. Apply

```powershell
specvibe apply prayer-reminders
```

A checkpoint is created and the track starts `applying`. Work through the items in order:

```powershell
specvibe apply prayer-reminders --next                        # what is next, no changes
specvibe apply prayer-reminders --done T1                     # task
specvibe apply prayer-reminders --done G1 --confirm-gate      # verification gate
specvibe apply prayer-reminders --accept AC-1                 # acceptance criterion
specvibe apply prayer-reminders --done C1                     # completion checklist
```

Prefixes: `T` tasks, `G` gates, `AC` acceptance criteria, `C` completion items. Order is enforced. Use `--allow-dirty` only when you accept starting from uncommitted work, and `--allow-no-git` only when you accept having no checkpoint to return to.

## 9. Unify

```powershell
specvibe unify prayer-reminders
```

When every item is checked, the track is summarized, its decisions are appended to `.specvibe/decisions.md`, and it moves to `.specvibe/archive/`. A track approved with `--force` still carries validation errors, so it needs `unify ... --force`.

## 10. If it goes wrong

```powershell
specvibe revert prayer-reminders          # preview only
specvibe revert prayer-reminders --yes    # backup branch + stash + reset + archive
```

`revert` only works on a track that has a checkpoint. Run `--yes` only after reading the preview.

## 11. Close the terminal

Nothing keeps running in the background: every command finishes and returns, and all state lives in files under `.specvibe/` and your git repository. Type `exit`, or close the window. Next time, `cd` back into the project and continue with `specvibe status`.

## Troubleshooting

| Message | Meaning and fix |
| --- | --- |
| `sv --version` prints nothing | PowerShell's own `sv` alias. Use `specvibe` or `sv.cmd`. |
| `The '<' operator is reserved` | PowerShell reads `<` as redirection. Write `specvibe help init`, without angle brackets. |
| `A positional parameter cannot be found` | The path has a space. Quote it: `cd "my project"`. |
| `Author identity unknown` | Set `git config user.name` and `git config user.email`, then commit. |
| `The working tree has uncommitted implementation changes` | Commit or stash first, or pass `--allow-dirty`. |
| `SpecVibe is already initialized here` | Use `specvibe setup` instead of `init`. |
| `Track "..." does not exist` | The slug is wrong. `specvibe status` lists available tracks. |
| `is approved, not applying` | Run `specvibe apply <track>` before `unify` or `revert`. |
| `Unresolved clarification marker` | Not a bug: the plan still has empty answers. |
