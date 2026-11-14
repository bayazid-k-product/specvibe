import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/commands/init.js';
import { normalizeConfig } from '../src/core/config.js';
import { isSpecVibeError } from '../src/core/errors.js';
import { pathExists } from '../src/core/fs.js';
import { projectPaths, trackDir } from '../src/core/paths.js';
import { scanRepository } from '../src/core/scanner.js';
import { loadState } from '../src/core/state.js';
import {
  appendDecision,
  approveTrack,
  archiveTrack,
  createTrack,
  extractDecisions,
  getTrackProgress,
  getTrackProgressFromDisk,
  listTracks,
  readTrackDocuments,
  readTrackMeta,
  resolveTrack,
  toggleAcceptance,
  toggleTask,
  validateTrack,
  validateTrackDocuments,
  writeTrackMeta,
} from '../src/core/track.js';
import type { ScanResult, TrackMeta } from '../src/types.js';
import { cleanup, makeProject, testContext, writeValidTrack } from './helpers.js';

let root: string;
let scan: ScanResult;

beforeEach(async () => {
  root = await makeProject();
  await initializeProject(testContext(root), {
    agents: ['generic'],
    agentsSpecified: true,
    scan: false,
    writeAgents: false,
    force: false,
    repair: false,
  });
  scan = await scanRepository({ root, config: normalizeConfig({}) });
});

afterEach(async () => {
  await cleanup(root);
});

async function makeTrack(slug = 'fixture-feature'): Promise<TrackMeta> {
  return createTrack({
    root,
    title: 'Add a fixture feature',
    slug,
    config: normalizeConfig({}),
    scan,
    projectName: 'fixture-app',
    stack: ['TypeScript', 'Node.js'],
    commands: { build: 'npm run build', test: 'npm test' },
  });
}

function expectSpecVibeError(error: unknown, code: string): void {
  expect(isSpecVibeError(error)).toBe(true);
  if (isSpecVibeError(error)) expect(error.code).toBe(code);
}

describe('createTrack', () => {
  it('writes the four plan documents and a proposed meta file', async () => {
    const meta = await makeTrack();
    expect(meta.status).toBe('proposed');
    expect(meta.title).toBe('Add a fixture feature');
    expect(meta.relevantFiles).toBeDefined();

    const docs = await readTrackDocuments(root, 'fixture-feature');
    expect(docs.proposal).toContain('# Proposal');
    expect(docs.spec).toContain('## Acceptance Criteria');
    expect(docs.design).toContain('## Decisions');
    expect(docs.tasks).toContain('## Verification Gates');
    expect(docs.tasks).toContain('[NEEDS CLARIFICATION');
    expect(docs.tasks).toContain('npm run build');
    expect(await pathExists(trackDir(root, 'fixture-feature'))).toBe(true);
  });

  it('rejects a duplicate slug without touching the existing track', async () => {
    await makeTrack();
    const before = await readTrackDocuments(root, 'fixture-feature');
    await expect(makeTrack()).rejects.toThrow(/already exists/);
    expect(await readTrackDocuments(root, 'fixture-feature')).toEqual(before);
  });

  it('records the track in state history and resolves it as active', async () => {
    await makeTrack();
    await writeValidTrack(root, 'fixture-feature');
    await approveTrack(root, 'fixture-feature');
    const state = await loadState(root);
    expect(state.activeTrack).toBe('fixture-feature');
    expect(state.history.some((event) => event.event === 'proposed')).toBe(true);
    expect((await resolveTrack(root)).slug).toBe('fixture-feature');
  });
});

describe('validation and approval', () => {
  it('rejects generated placeholder documents until they are completed', async () => {
    await makeTrack();
    const validation = await validateTrack(root, 'fixture-feature');
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'needs_clarification')).toBe(true);
    await expect(approveTrack(root, 'fixture-feature')).rejects.toThrow(/validation error/);
  });

  it('accepts a complete track and only approves proposed tracks', async () => {
    await makeTrack();
    await writeValidTrack(root, 'fixture-feature');
    const validation = await validateTrack(root, 'fixture-feature');
    expect(validation.valid).toBe(true);
    expect(validation.errors).toBe(0);

    const { meta } = await approveTrack(root, 'fixture-feature');
    expect(meta.status).toBe('approved');
    await expect(approveTrack(root, 'fixture-feature')).rejects.toThrow(/not proposed/);
  });

  it('supports a force approval that is recorded on the meta', async () => {
    await makeTrack();
    const approval = await approveTrack(root, 'fixture-feature', { force: true });
    expect(approval.meta.status).toBe('approved');
    expect(approval.meta.forced).toBe(true);
  });

  it('reports missing sections, duplicate IDs, and ID-less acceptance criteria', () => {
    const result = validateTrackDocuments('bad-track', {
      proposal:
        '# Proposal\n\nA sufficiently long proposal that explains the intent of this work and why it exists in enough detail to pass the thin-document warning threshold for the proposal file.',
      spec: `# Spec\n\n${'A'.repeat(200)}\n\n## Acceptance Criteria\n\n- [ ] A criterion without an id\n- [ ] AC-1 — First.\n- [ ] AC-1 — Duplicate.\n`,
      design: `# Design\n\n${'B'.repeat(200)}\n`,
      tasks: `# Tasks\n\n${'C'.repeat(200)}\n\n- [ ] T1 — Do the work.\n- [ ] T1 — Duplicate task.\n`,
    });
    expect(result.valid).toBe(false);
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('acceptance_without_id');
    expect(codes).toContain('duplicate_id');
    expect(codes).toContain('no_gates');
  });

  it('flags empty documents and unresolved template variables', () => {
    const result = validateTrackDocuments('broken', {
      proposal: '',
      spec: '{{UNRESOLVED}}',
      design: 'short',
      tasks: '- [ ] T1 — x\n',
    });
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('missing_content');
    expect(codes).toContain('unresolved_placeholder');
    expect(codes).toContain('no_acceptance');
    expect(codes).toContain('no_gates');
  });
});

describe('task and acceptance progression', () => {
  beforeEach(async () => {
    await makeTrack();
    await writeValidTrack(root, 'fixture-feature');
    await approveTrack(root, 'fixture-feature');
  });

  it('requires tasks to be completed in order', async () => {
    await expect(toggleTask(root, 'fixture-feature', 'T2')).rejects.toThrow(/not the next/);
    const first = await toggleTask(root, 'fixture-feature', 'T1');
    expect(first.item.checked).toBe(true);
    expect(first.next?.id).toBe('T2');
    const second = await toggleTask(root, 'fixture-feature', 'T2');
    expect(second.next?.id).toBe('G1');
  });

  it('lets --force skip ahead and rejects unknown IDs', async () => {
    const result = await toggleTask(root, 'fixture-feature', 'T2', { force: true });
    expect(result.item.id).toBe('T2');
    await expect(toggleTask(root, 'fixture-feature', 'T99')).rejects.toThrow(/was not found/);
  });

  it('requires explicit gate confirmation', async () => {
    for (const id of ['T1', 'T2']) await toggleTask(root, 'fixture-feature', id);
    await expect(toggleTask(root, 'fixture-feature', 'G1')).rejects.toThrow(
      /explicit user confirmation/,
    );
    const gate = await toggleTask(root, 'fixture-feature', 'G1', { confirmGate: true });
    expect(gate.item.kind).toBe('gate');
  });

  it('verifies acceptance criteria independently of task order', async () => {
    const result = await toggleAcceptance(root, 'fixture-feature', 'AC-2');
    expect(result.item.checked).toBe(true);
    expect(result.progress.acceptance.find((item) => item.id === 'AC-1')?.checked).toBe(false);
    await expect(toggleAcceptance(root, 'fixture-feature', 'AC-99')).rejects.toThrow(
      /was not found/,
    );
  });

  it('is idempotent for an already completed item', async () => {
    const first = await toggleTask(root, 'fixture-feature', 'T1');
    const again = await toggleTask(root, 'fixture-feature', 'T1');
    expect(again.next).toEqual(first.next);
    expect(again.progress.completed).toBe(first.progress.completed);
  });

  it('computes progress from disk', async () => {
    await toggleTask(root, 'fixture-feature', 'T1');
    await toggleAcceptance(root, 'fixture-feature', 'AC-1');
    const progress = await getTrackProgressFromDisk(root, 'fixture-feature');
    expect(progress.completed).toBe(1);
    expect(progress.acceptance.find((item) => item.id === 'AC-1')?.checked).toBe(true);
    expect(progress.percent).toBeGreaterThan(0);
  });
});

describe('decisions', () => {
  it('extracts only bullet decisions and strips IDs', async () => {
    const decisions = await extractDecisions(`# Design

## Decisions

Record only decisions that future agents must not silently reverse.

- **D-1: Keep the feature inside the existing module.**
- [NEEDS CLARIFICATION: unresolved]
- D-2: Prefer the standard library.
- ...
`);
    expect(decisions).toEqual([
      'Keep the feature inside the existing module.',
      'Prefer the standard library.',
    ]);
  });

  it('returns an empty list when the section is missing', async () => {
    expect(await extractDecisions('# Design\n\nNothing here.')).toEqual([]);
  });

  it('appends a dated block to the decisions log', async () => {
    const paths = projectPaths(root);
    await appendDecision(root, {
      title: 'Fixture feature',
      slug: 'fixture-feature',
      status: 'unified',
      summary: 'Shipped the fixture.',
      decisions: ['Keep it small.', 'Use the standard library.'],
      archivePath: paths.archive,
    });
    const log = await import('../src/core/fs.js').then((fs) => fs.readText(paths.decisions));
    expect(log).toContain('# Architectural Decision Log');
    expect(log).toContain('Fixture feature');
    expect(log).toContain('- Keep it small.');
    expect(log).toContain('- Use the standard library.');
    expect(log).toContain('**Status:** unified');
  });
});

describe('archive and resolution', () => {
  it('moves a track into the archive with status and path metadata', async () => {
    await makeTrack();
    const result = await archiveTrack(root, 'fixture-feature', 'unified');
    expect(result.archivePath).toContain('archive');
    expect(await pathExists(trackDir(root, 'fixture-feature'))).toBe(false);
    expect(await pathExists(result.archivePath)).toBe(true);
    expect(result.meta.status).toBe('unified');
    expect(result.meta.archivePath).toContain('.specvibe/archive/');
    expect(await listTracks(root)).toEqual([]);
  });

  it('does not overwrite an existing archive from the same day', async () => {
    await makeTrack();
    const first = await archiveTrack(root, 'fixture-feature', 'unified');
    await makeTrack();
    const second = await archiveTrack(root, 'fixture-feature', 'reverted');
    expect(second.archivePath).not.toBe(first.archivePath);
    expect(second.archivePath).toMatch(/-2$/);
    expect(await pathExists(first.archivePath)).toBe(true);
  });

  it('resolves tracks by exact name, prefix, and ambiguous substring', async () => {
    await makeTrack('alpha-one');
    await makeTrack('alpha-two');
    await makeTrack('beta');

    await expect(resolveTrack(root, 'beta')).resolves.toMatchObject({ slug: 'beta' });
    await expect(resolveTrack(root, 'bet')).resolves.toMatchObject({ slug: 'beta' });
    await expect(resolveTrack(root, 'missing')).rejects.toThrow(/does not exist/);

    try {
      await resolveTrack(root, 'alpha');
      throw new Error('expected ambiguity');
    } catch (error) {
      expectSpecVibeError(error, 'TRACK_NOT_FOUND');
      if (isSpecVibeError(error)) expect(error.message).toMatch(/ambiguous/);
    }
  });

  it('lists tracks newest first', async () => {
    const first = await makeTrack('first');
    const second = await makeTrack('second');
    await writeTrackMeta(root, {
      ...first,
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    await writeTrackMeta(root, {
      ...second,
      updatedAt: '2030-01-01T00:00:00.000Z',
    });
    const tracks = await listTracks(root);
    expect(tracks[0]?.slug).toBe('second');
    expect(tracks[1]?.slug).toBe('first');
    expect(await readTrackMeta(root, 'first')).toMatchObject({ slug: 'first' });
  });
});

describe('getTrackProgress', () => {
  it('separates tasks, gates, completion, and acceptance', () => {
    const progress = getTrackProgress(
      '# Spec\n\n## Acceptance Criteria\n\n- [x] AC-1 — Done.\n',
      `# Tasks\n\n## Implementation\n\n- [x] T1 — One.\n- [ ] T2 — Two.\n\n## Verification Gates\n\n- [ ] G1 — Build.\n\n## Completion\n\n- [ ] C1 — Done.\n`,
    );
    expect(progress.tasks).toHaveLength(2);
    expect(progress.gates).toHaveLength(1);
    expect(progress.completion).toHaveLength(1);
    expect(progress.acceptance).toHaveLength(1);
    expect(progress.next?.id).toBe('T2');
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(4);
    expect(progress.percent).toBe(25);
  });
});
