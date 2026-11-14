import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { CommandContext } from '../src/cli/types.js';
import { initializeProject } from '../src/commands/init.js';
import { createLogger } from '../src/core/logger.js';
import type { AgentId } from '../src/types.js';

const execFileAsync = promisify(execFile);

export const SAMPLE_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'fixture-app',
      version: '1.0.0',
      description: 'A fixture application for SpecVibe tests.',
      type: 'module',
      scripts: {
        build: 'tsc -p tsconfig.json',
        test: 'vitest run',
        typecheck: 'tsc --noEmit',
        lint: 'biome check .',
      },
      devDependencies: {
        typescript: '^5.9.0',
      },
    },
    null,
    2,
  ),
  'tsconfig.json': JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        outDir: 'dist',
      },
      include: ['src'],
    },
    null,
    2,
  ),
  'README.md': '# Fixture App\n\nA small fixture used by the SpecVibe test suite.\n',
  'src/index.ts':
    "import { add, formatTotal } from './math.js';\n\nconsole.log(formatTotal(add(1, 2)));\n",
  'src/math.ts':
    'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function formatTotal(value: number): string {\n  return value.toFixed(2);\n}\n',
};

export async function makeTempDir(prefix = 'specvibe-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeFixture(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  }
}

export async function readFixture(root: string, relative: string): Promise<string> {
  return fs.readFile(path.join(root, relative), 'utf8');
}

export async function pathExists(root: string, relative: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

export async function makeProject(extra: Record<string, string> = {}): Promise<string> {
  const root = await makeTempDir();
  await writeFixture(root, { ...SAMPLE_FILES, ...extra });
  return root;
}

export async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}

export function testContext(root: string, overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    command: 'test',
    cwd: root,
    root,
    flags: {},
    positionals: [],
    json: true,
    quiet: true,
    debug: false,
    logger: createLogger({ quiet: true }),
    ...overrides,
  };
}

export async function initializeFixture(
  root: string,
  agents: AgentId[] = ['generic'],
): Promise<void> {
  await initializeProject(testContext(root), {
    agents,
    agentsSpecified: true,
    scan: true,
    writeAgents: true,
    force: false,
    repair: false,
  });
}

export async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return stdout.trim();
}

export async function initGitRepo(root: string): Promise<void> {
  await git(root, ['init']);
  await git(root, ['config', 'user.name', 'SpecVibe Test']);
  await git(root, ['config', 'user.email', 'test@specvibe.local']);
  await git(root, ['add', '-A']);
  await git(root, ['commit', '-m', 'test: initial fixture']);
}

export interface TrackPlanOptions {
  title?: string;
  tasks?: Array<{ id: string; text: string }>;
  acceptance?: Array<{ id: string; text: string }>;
  decisions?: string[];
}

/**
 * Write a complete, valid set of track documents. Used by tests that need a
 * track without going through the interactive fill-in step.
 */
export async function writeValidTrack(
  root: string,
  slug: string,
  options: TrackPlanOptions = {},
): Promise<{ proposal: string; spec: string; design: string; tasks: string }> {
  const title = options.title ?? 'Add a fixture feature';
  const tasks = options.tasks ?? [
    { id: 'T1', text: 'Implement the smallest vertical slice.' },
    { id: 'T2', text: 'Add focused tests for the behavior.' },
  ];
  const acceptance = options.acceptance ?? [
    { id: 'AC-1', text: 'The new behavior is observable from the public interface.' },
    { id: 'AC-2', text: 'The failure path is handled and covered by a test.' },
  ];
  const decisions = options.decisions ?? ['D-1: Keep the feature inside the existing module.'];
  const proposal = `# Proposal — ${title}

> Track: \`${slug}\` · Status: proposed · Created: 2026-01-01

## Summary

This track adds a small, testable capability to the fixture application. It exists to
exercise the SpecVibe planning, approval, apply, and unify lifecycle with realistic
documents that do not contain unresolved clarification markers.

## Problem

The fixture application cannot demonstrate the requested behavior today, so automated
tests cannot prove that the workflow preserves intent from plan to shipped code.

## Goals

- Deliver the behavior described in the specification.
- Prove it with focused automated checks and a real verification gate.

## Non-goals

- No unrelated refactoring and no new runtime dependencies.

## User stories

- As a **maintainer**, I want **a predictable fixture feature**, so that **the lifecycle can be tested end to end**.

## Success metrics

- The acceptance criteria in \`spec.md\` pass, and the verification gate command succeeds.

## Risks and assumptions

- Assumption: the fixture stays small enough to respect the constitution limits.

## Open questions

- None; the behavior is intentionally narrow.

## Approval gate

No implementation code may be written until this plan is reviewed and approved.

\`\`\`bash
specvibe approve ${slug}
\`\`\`
`;

  const spec = `# Specification — ${title}

> Track: \`${slug}\` · Project: fixture-app

## Overview

Describe the observable behavior this fixture delivers, including the public entry point
and the error path that must remain safe.

## Functional requirements

- **FR-1:** The requested behavior is available through the documented interface.
- **FR-2:** Invalid input is rejected with an actionable error.
- **FR-3:** Existing behavior remains unchanged.

## Non-functional requirements

- Performance: no measurable regression for the fixture workload.
- Accessibility: not applicable to this fixture.
- Security/privacy: no new data surface and no secrets in output.
- Compatibility: Node.js on Windows, macOS, and Linux.

## Acceptance Criteria

Every criterion must be independently verifiable.

${acceptance.map((item) => `- [ ] ${item.id} — ${item.text}`).join('\n')}

## Edge cases

- Empty input is handled without throwing an unexpected error.
- Repeated invocations remain deterministic.

## Out of scope

- Integrations that are not part of the fixture application.

## Dependencies

- Internal: the existing fixture modules.
- External: the existing test runner only.
`;

  const design = `# Design — ${title}

> Track: \`${slug}\` · Project: fixture-app

## Context

The fixture already has a small entry point and a math module. The smallest change extends
the existing module rather than introducing a new dependency or a parallel abstraction.

## Approach

Reuse the existing helper, add the narrow behavior, and cover both the success and failure
paths with focused tests. Keep the diff small enough to review in one pass.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Add a new dependency | The fixture can satisfy the requirement with the standard library. |
| Build a parallel module | Duplication would violate the reuse rule in the constitution. |

## File plan

| Path | Existing/new | Purpose |
| --- | --- | --- |
| \`src/math.ts\` | existing | Extend the existing helper. |
| \`src/math.test.ts\` | new | Prove the behavior and the failure path. |

## Test strategy

- Unit: assert the public helper behavior and the rejected input.
- Integration: the entry point still runs with the original inputs.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scope creep | Larger review | Keep the track to the acceptance criteria. |

## Decisions

Record only decisions that future agents must not silently reverse. Start each line with an ID.

${decisions.map((decision) => `- **${decision}**`).join('\n')}

## Rollout and rollback

- Rollout: one focused commit.
- Rollback: use the SpecVibe checkpoint created at apply time.
`;

  const tasksDoc = `# Tasks — ${title}

> Track: \`${slug}\` · Execute top to bottom.

## Implementation

${tasks.map((task) => `- [ ] ${task.id} — ${task.text}`).join('\n')}

## Verification Gates

- [ ] G1 — Build passes: \`npm run build\`
- [ ] G2 — Tests pass: \`npm test\`

## Completion

- [ ] C1 — All acceptance criteria in \`spec.md\` are checked and verified.

---

### Task writing rules

- Each task is independently reviewable and small enough to verify.
`;

  const directory = path.join(root, '.specvibe', 'tracks', slug);
  await fs.mkdir(directory, { recursive: true });
  await writeFixture(root, {
    [`.specvibe/tracks/${slug}/proposal.md`]: proposal,
    [`.specvibe/tracks/${slug}/spec.md`]: spec,
    [`.specvibe/tracks/${slug}/design.md`]: design,
    [`.specvibe/tracks/${slug}/tasks.md`]: tasksDoc,
  });
  return { proposal, spec, design, tasks: tasksDoc };
}
