# Contributing to SpecVibe

Thanks for helping make AI-assisted development more deliberate. SpecVibe is a small, zero-runtime-dependency TypeScript CLI. Contributions are welcome in code, tests, documentation, templates, and agent integrations.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Good first contributions

- Add or improve an agent integration (see below).
- Improve scan heuristics for a language, framework, or monorepo layout.
- Add tests for edge cases in track validation, packing, or revert safety.
- Improve error messages, hints, and documentation.
- Report a reproducible bug with the issue template.

For substantial changes, open an issue first so the design can be agreed on before implementation.

## Development setup

Requirements:

- Node.js **>= 22.12.0**
- npm **>= 10**
- Git (needed for the apply/revert lifecycle tests)

```bash
git clone https://github.com/bayazid-k-product/specvibe.git
cd specvibe
npm ci
npm run check
```

Useful scripts:

| Script                  | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev -- <args>` | Run the CLI from TypeScript source via `tsx`.              |
| `npm test`              | Run the Vitest suite once.                                 |
| `npm run test:watch`    | Run Vitest in watch mode.                                  |
| `npm run typecheck`     | TypeScript strict check, including tests.                  |
| `npm run lint`          | Biome lint and format check.                               |
| `npm run format`        | Apply Biome fixes.                                         |
| `npm run build`         | Emit `dist/` with declarations.                            |
| `npm run check`         | Typecheck, lint, and tests — run this before opening a PR. |

## Repository map

```text
src/
├── cli.ts, cli/          # entry point, argument parsing, command specs, help
├── commands/             # one runner per CLI command
├── core/                 # config, state, scanner, packer, tracks, git, agents
├── types.ts              # shared domain types
├── index.ts              # public library surface
└── version.ts
templates/                # Markdown/TOML templates copied into user repositories
tests/                    # Vitest unit and CLI lifecycle tests
docs/                     # user and contributor documentation
```

Design constraints:

- **Zero runtime dependencies.** Use Node's standard library. Dev dependencies are fine.
- **ESM with NodeNext resolution.** Relative imports use the `.js` suffix even in TypeScript.
- **Plain storage.** Persist Markdown or JSON; do not introduce a database or binary format.
- **Local-first.** No telemetry, analytics, or network calls at runtime.
- **Actionable errors.** Throw `SpecVibeError` with a stable code and a hint when the user can fix the problem.
- **Cross-platform paths.** Use `node:path` and convert to POSIX only when writing display paths or git paths.
- **No destructive operation without an explicit flag.** Revert and force modes must remain opt-in.

## Tests

The suite uses Vitest and runs against real temporary directories, not mocked filesystems.

- Put unit tests in `tests/<module>.test.ts`.
- Use helpers from `tests/helpers.ts` (`makeProject`, `initializeFixture`, `writeValidTrack`, `git`, `initGitRepo`).
- CLI tests call `runCli()` with captured `process.stdout`/`process.stderr`; do not spawn the published binary unless the test is specifically about packaging.
- Git tests must configure `user.name` and `user.email` locally and must not touch the user's global git config.
- Always clean up temporary directories (the helpers provide `cleanup`).
- Avoid timing-dependent assertions and network access.

Run the full gate before pushing:

```bash
npm run check
npm run build
```

## Adding an agent integration

1. Add the id to `AGENT_IDS` in `src/types.ts`.
2. Add a definition to `AGENT_DEFINITIONS` in `src/core/agents.ts`:
   - `detectPaths`: files or directories that indicate the agent is installed/used.
   - `files`: the paths users should commit.
   - a clear name and description.
3. Extend `buildPlans()` for instruction files and `agentCommandPlans()` for native command files.
4. Choose the correct argument placeholder (`$ARGUMENTS`, `{{args}}`, `${input:...}`, or natural language).
5. Update `templates/commands/*.md` only if the host needs a different command body; otherwise reuse them.
6. Add tests in `tests/agents.test.ts` for generated paths, markers, argument substitution, user-content preservation, and removal.
7. Update `README.md`, `docs/agents.md`, and `CHANGELOG.md`.

Never copy the full constitution into generated command files. Generated files should point to `.specvibe/` and the CLI so there is one source of truth.

## Adding or changing a command

1. Add or update the spec in `src/cli/specs.ts` (name, summary, flags, examples, notes).
2. Implement the runner in `src/commands/<name>.ts` using `CommandContext`.
3. Register it in `RUNNERS` in `src/cli/run.ts` and export reusable core functions from `src/index.ts` when appropriate.
4. Support `--json` with a stable payload shape and document exit codes.
5. Add CLI tests, including failure paths and `--json` errors.
6. Update `README.md`, `docs/cli-reference.md`, and `CHANGELOG.md`.

## Templates and generated text

- Templates live in `templates/` and are rendered by `src/core/templates.ts`.
- Use `{{UPPER_SNAKE_CASE}}` variables and keep every variable in the render map. Unresolved variables are a validation failure by design.
- Keep generated documents concise. Context is a budget, not a dumping ground.
- Clarification markers use `[NEEDS CLARIFICATION: specific question]` and must block approval until resolved.
- Do not put feature code in planning templates.

## Commit and pull request style

- Keep commits focused and descriptive. Conventional prefixes are appreciated: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- Explain the **why** in the pull request, not just the change list.
- Include tests for behavior changes.
- Update documentation and the changelog for user-visible changes.
- Do not include secrets, private repository content, or generated `dist/` output.
- PRs must pass CI on Windows, macOS, and Linux.

Pull request checklist:

- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
- [ ] New behavior is covered by a test.
- [ ] User-facing docs/changelog are updated.
- [ ] No runtime dependencies were added.
- [ ] Unsafe operations remain opt-in and documented.
- [ ] Generated files and archives are not edited by hand.

## Reporting bugs and requesting features

Use the GitHub issue templates. Include:

- SpecVibe version (`specvibe version`)
- Node.js version and operating system
- Agent integration involved, if any
- Exact command and output (redact secrets and private paths)
- A minimal reproduction repository or fixture when possible

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
