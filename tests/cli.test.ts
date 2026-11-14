import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli/run.js';
import { pathExists, readText } from '../src/core/fs.js';
import { projectPaths } from '../src/core/paths.js';
import type { TrackMeta } from '../src/types.js';
import { cleanup, git, initGitRepo, makeProject, writeValidTrack } from './helpers.js';

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

let root: string;

beforeEach(async () => {
  root = await makeProject();
});

afterEach(async () => {
  await cleanup(root);
});

async function cli(args: string[]): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write);
  try {
    const code = await runCli(args);
    return { code, stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

function parseJson<T>(result: CliResult): T {
  return JSON.parse(result.stdout) as T;
}

async function initProject(): Promise<void> {
  const result = await cli(['init', '--cwd', root, '--agents', 'generic', '--json']);
  expect(result.code, result.stderr).toBe(0);
}

describe('CLI basics', () => {
  it('prints the version for --version and version', async () => {
    const short = await cli(['--version']);
    expect(short.code).toBe(0);
    expect(short.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    const command = await cli(['version']);
    expect(command.code).toBe(0);
    expect(command.stdout.trim()).toBe(short.stdout.trim());
  });

  it('prints help with no command and for a specific command', async () => {
    const general = await cli([]);
    expect(general.code).toBe(0);
    expect(general.stdout).toContain('specvibe');
    const command = await cli(['help', 'apply']);
    expect(command.code).toBe(0);
    expect(command.stdout).toContain('apply');
  });

  it('rejects unknown commands and options with exit code 2', async () => {
    const unknown = await cli(['nope']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('Unknown command');

    await initProject();
    const badFlag = await cli(['status', '--cwd', root, '--nope']);
    expect(badFlag.code).toBe(2);
    expect(badFlag.stderr).toContain('Unknown option');
  });

  it('reports JSON errors on stderr with a stable shape', async () => {
    const result = await cli(['status', '--cwd', root, '--json']);
    expect(result.code).not.toBe(0);
    const payload = JSON.parse(result.stderr) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe('NOT_INITIALIZED');
  });
});

describe('CLI initialization', () => {
  it('initializes, scans, writes agent files, and emits JSON', async () => {
    const result = await cli(['init', '--cwd', root, '--agents', 'generic', '--json']);
    expect(result.code, result.stderr).toBe(0);
    const payload = parseJson<{
      ok: boolean;
      created: boolean;
      agents: { configured: string[] };
      scan: { files: number } | null;
    }>(result);
    expect(payload.ok).toBe(true);
    expect(payload.created).toBe(true);
    expect(payload.agents.configured).toEqual(['generic']);
    expect(payload.scan?.files).toBeGreaterThan(0);
    expect(await pathExists(`${root}/.specvibe/constitution.md`)).toBe(true);
    expect(await pathExists(`${root}/.specvibe/context/codebase-summary.md`)).toBe(true);
    expect(await pathExists(`${root}/AGENTS.md`)).toBe(true);
  });

  it('refuses to overwrite an existing setup without --force', async () => {
    await initProject();
    const again = await cli(['init', '--cwd', root, '--agents', 'generic', '--json']);
    expect(again.code).toBe(3);
    const payload = JSON.parse(again.stderr) as { error: { code: string } };
    expect(payload.error.code).toBe('ALREADY_INITIALIZED');
  });

  it('repairs with --force without overwriting the constitution', async () => {
    await initProject();
    const constitution = `${root}/.specvibe/constitution.md`;
    await fs.rm(constitution);
    const result = await cli(['init', '--cwd', root, '--agents', 'generic', '--force', '--json']);
    expect(result.code, result.stderr).toBe(0);
    expect(await readText(constitution)).toContain('Constitution');
  });
});

describe('CLI configuration and agents', () => {
  beforeEach(async () => {
    await initProject();
  });

  it('gets and sets configuration values', async () => {
    const before = await cli(['config', 'get', 'pack.maxTokens', '--cwd', root, '--json']);
    expect(before.code).toBe(0);
    expect(parseJson<{ value: number }>(before).value).toBe(60_000);

    const set = await cli(['config', 'set', 'pack.maxTokens', '30000', '--cwd', root, '--json']);
    expect(set.code).toBe(0);
    expect(parseJson<{ value: number }>(set).value).toBe(30_000);

    const after = await cli(['config', 'get', 'pack.maxTokens', '--cwd', root, '--json']);
    expect(parseJson<{ value: number }>(after).value).toBe(30_000);
  });

  it('lists agents and syncs a new integration', async () => {
    const list = await cli(['agents', 'list', '--cwd', root, '--json']);
    expect(list.code).toBe(0);
    expect(parseJson<{ agents: unknown[] }>(list).agents.length).toBeGreaterThan(0);

    const add = await cli(['agents', 'add', 'opencode', '--cwd', root, '--json']);
    expect(add.code, add.stderr).toBe(0);
    expect(await pathExists(`${root}/.opencode/commands/sv/propose.md`)).toBe(true);
  });

  it('runs doctor without failing on a healthy setup', async () => {
    const result = await cli(['doctor', '--cwd', root, '--json']);
    expect(result.code).toBe(0);
    const payload = parseJson<{
      summary: { ok: number; warnings: number; errors: number };
      checks: unknown[];
    }>(result);
    expect(payload.summary.errors).toBe(0);
    expect(payload.checks.length).toBeGreaterThan(0);
  });
});

describe('CLI track lifecycle', () => {
  beforeEach(async () => {
    await initGitRepo(root);
    await initProject();
    await git(root, ['add', '-A']);
    await git(root, ['commit', '-m', 'chore: initialize specvibe']);
  });

  it('plans, approves, applies, verifies, and unifies a track', async () => {
    const propose = await cli(['propose', 'Add a fixture feature', '--cwd', root, '--json']);
    expect(propose.code, propose.stderr).toBe(0);
    const proposal = parseJson<{ track: TrackMeta; approvalRequired: boolean }>(propose);
    expect(proposal.track.slug).toBe('add-a-fixture-feature');
    expect(proposal.approvalRequired).toBe(true);

    const checkBefore = await cli([
      'approve',
      'add-a-fixture-feature',
      '--check',
      '--cwd',
      root,
      '--json',
    ]);
    expect(checkBefore.code).toBe(3);
    const invalid = parseJson<{ validation: { valid: boolean; issues: unknown[] } }>(checkBefore);
    expect(invalid.validation.valid).toBe(false);
    expect(invalid.validation.issues.length).toBeGreaterThan(0);

    await writeValidTrack(root, 'add-a-fixture-feature');
    const checkAfter = await cli([
      'approve',
      'add-a-fixture-feature',
      '--check',
      '--cwd',
      root,
      '--json',
    ]);
    expect(checkAfter.code, checkAfter.stderr).toBe(0);
    expect(parseJson<{ validation: { valid: boolean } }>(checkAfter).validation.valid).toBe(true);

    const approve = await cli(['approve', 'add-a-fixture-feature', '--cwd', root, '--json']);
    expect(approve.code, approve.stderr).toBe(0);
    expect(parseJson<{ track: TrackMeta }>(approve).track.status).toBe('approved');

    const apply = await cli(['apply', 'add-a-fixture-feature', '--cwd', root, '--json']);
    expect(apply.code, apply.stderr).toBe(0);
    const applied = parseJson<{ track: TrackMeta }>(apply);
    expect(applied.track.status).toBe('applying');
    expect(applied.track.checkpoint?.commit).toMatch(/^[a-f0-9]{40}$/);

    for (const id of ['T1', 'T2']) {
      const done = await cli([
        'apply',
        'add-a-fixture-feature',
        '--done',
        id,
        '--cwd',
        root,
        '--json',
      ]);
      expect(done.code, done.stderr).toBe(0);
    }
    for (const id of ['G1', 'G2']) {
      const gate = await cli([
        'apply',
        'add-a-fixture-feature',
        '--done',
        id,
        '--confirm-gate',
        '--cwd',
        root,
        '--json',
      ]);
      expect(gate.code, gate.stderr).toBe(0);
    }
    const completion = await cli([
      'apply',
      'add-a-fixture-feature',
      '--done',
      'C1',
      '--cwd',
      root,
      '--json',
    ]);
    expect(completion.code, completion.stderr).toBe(0);
    for (const id of ['AC-1', 'AC-2']) {
      const accept = await cli([
        'apply',
        'add-a-fixture-feature',
        '--accept',
        id,
        '--cwd',
        root,
        '--json',
      ]);
      expect(accept.code, accept.stderr).toBe(0);
    }

    const unify = await cli(['unify', 'add-a-fixture-feature', '--cwd', root, '--json']);
    expect(unify.code, unify.stderr).toBe(0);
    const unified = parseJson<{ track: TrackMeta }>(unify);
    expect(unified.track.status).toBe('unified');
    expect(await pathExists(`${root}/.specvibe/tracks/add-a-fixture-feature`)).toBe(false);
    expect(await fs.readdir(`${root}/.specvibe/archive`)).toHaveLength(1);
    expect(await readText(projectPaths(root).decisions)).toContain('add-a-fixture-feature');
  });

  it('blocks apply from a dirty tree unless --allow-dirty is passed', async () => {
    const propose = await cli(['propose', 'Dirty tree check', '--cwd', root, '--json']);
    expect(propose.code, propose.stderr).toBe(0);
    const slug = parseJson<{ track: TrackMeta }>(propose).track.slug;
    await writeValidTrack(root, slug);
    const approve = await cli(['approve', slug, '--cwd', root, '--json']);
    expect(approve.code, approve.stderr).toBe(0);

    await fs.writeFile(`${root}/src/dirty.ts`, 'export const dirty = true;\n');
    const blocked = await cli(['apply', slug, '--cwd', root, '--json']);
    expect(blocked.code).toBe(4);
    expect(JSON.parse(blocked.stderr).error.code).toBe('GIT_DIRTY');

    const allowed = await cli(['apply', slug, '--allow-dirty', '--cwd', root, '--json']);
    expect(allowed.code, allowed.stderr).toBe(0);
    expect(parseJson<{ track: TrackMeta }>(allowed).track.checkpoint?.dirtyAtCheckpoint).toBe(true);
  });

  it('does not allow apply before human approval', async () => {
    const propose = await cli(['propose', 'Unapproved work', '--cwd', root, '--json']);
    expect(propose.code, propose.stderr).toBe(0);
    const slug = parseJson<{ track: TrackMeta }>(propose).track.slug;
    const apply = await cli(['apply', slug, '--cwd', root, '--json']);
    expect(apply.code).toBe(4);
    expect(JSON.parse(apply.stderr).error.code).toBe('INVALID_STATE');
  });

  it('packs context for the active track and prints the manifest', async () => {
    const propose = await cli(['propose', 'Pack me', '--cwd', root, '--json']);
    expect(propose.code, propose.stderr).toBe(0);
    const slug = parseJson<{ track: TrackMeta }>(propose).track.slug;
    const pack = await cli(['pack', slug, '--max-tokens', '5000', '--cwd', root, '--json']);
    expect(pack.code, pack.stderr).toBe(0);
    const payload = parseJson<{
      track: string;
      path: string;
      estimatedTokens: number;
      budgetTokens: number;
    }>(pack);
    expect(payload.track).toBe(slug);
    expect(payload.budgetTokens).toBe(5000);
    expect(payload.estimatedTokens).toBeLessThanOrEqual(5000);
    expect(await pathExists(`${root}/${payload.path}`)).toBe(true);
  });

  it('shows status and the next safe action', async () => {
    const propose = await cli(['propose', 'Status check', '--cwd', root, '--json']);
    expect(propose.code, propose.stderr).toBe(0);
    const status = await cli(['status', '--cwd', root, '--json']);
    expect(status.code, status.stderr).toBe(0);
    const payload = parseJson<{
      tracks: Array<{ slug: string; status: string }>;
      nextAction: string | null;
    }>(status);
    expect(payload.tracks.some((track) => track.slug === 'status-check')).toBe(true);
    expect(payload.nextAction).toContain('approve');
  });
});
