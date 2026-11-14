# Security Policy

## Supported versions

Security fixes are provided for the latest published minor release.

| Version           | Supported |
| ----------------- | --------- |
| `0.1.x`           | Yes       |
| Older prereleases | No        |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include a description, affected version, operating system, reproduction steps, and impact.

If private reporting is unavailable, contact the maintainers through the repository's GitHub organization profile and ask for a private channel. Do not include exploit details in a public discussion.

## What to include

- SpecVibe version (`specvibe version`)
- Node.js version and OS
- The command or API call involved
- Whether git, an agent integration, or a generated file is involved
- A minimal reproduction, logs, and any relevant file content with secrets removed
- Your assessment of impact (for example: arbitrary file write, command execution, data exposure)

## Scope

SpecVibe runs locally and has no runtime dependencies. In scope:

- Arbitrary file read/write outside the initialized repository root
- Command injection through repository content, track documents, config values, or git arguments
- Path traversal through slugs, archive names, pack output paths, or agent file paths
- Unsafe handling of symlinks or untrusted repositories
- Secrets exposure in generated files, context packs, logs, or error messages
- Bypass of approval, validation, gate, checkpoint, or revert guarantees
- Destructive git behavior that is not disclosed by the documented flags
- Supply-chain risks in the published package or release process

Out of scope:

- Vulnerabilities in git, Node.js, npm, an AI agent host, or an operating system
- A user or agent deliberately running `--force`, `--allow-dirty`, `--allow-no-git`, or `revert --yes`
- Prompt injection from repository content that only affects an AI host's behavior, unless SpecVibe's own safeguards are bypassed
- Missing hardening that requires an already-compromised local account or repository
- Denial of service from intentionally enormous repositories beyond documented limits

## Security model

- **No network access.** The CLI makes no HTTP requests and sends no telemetry.
- **No runtime dependencies.** The published package contains compiled code only; the runtime uses Node's standard library.
- **Local files only.** All state is stored under `.specvibe/` in the initialized repository, plus generated agent files at documented paths.
- **Explicit destructive actions.** `revert` is dry-run by default. `--yes` creates a backup branch and stash before resetting.
- **Approval is human-controlled.** Agents are instructed to use `approve --check`; `--force` is recorded as an exception.
- **Bounded inputs.** Scan file counts, file sizes, pack budgets, and token limits are configurable and validated.
- **No hidden code execution.** SpecVibe does not evaluate repository code. It reads text files and runs local `git` subcommands with argument arrays (not shell strings).

Generated commands instruct agents to treat the constitution and approved spec as authoritative, but SpecVibe cannot sandbox an AI host. Review agent actions and use your host's permission controls.

## Response

Maintainers will acknowledge a report as soon as practical, investigate, and coordinate a fix and disclosure. Please allow time for a release before public disclosure. Credit will be given unless you prefer to remain anonymous.

## Safe usage recommendations

- Commit `.specvibe/constitution.md`, `context.md`, `decisions.md`, tracks, and archives so changes are reviewable.
- Keep `.specvibe/packs/`, backups, and local environment files out of git.
- Review `specvibe revert <track>` output before adding `--yes`.
- Do not run SpecVibe on untrusted repositories with elevated privileges.
- Keep Node.js and git patched.
- Pin the package version in CI and review lockfile changes.
