import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/commands/init.js';
import { loadConfig } from '../src/core/config.js';
import { pathExists, readText, writeText } from '../src/core/fs.js';
import { projectPaths } from '../src/core/paths.js';
import { loadState } from '../src/core/state.js';
import { cleanup, makeProject, testContext } from './helpers.js';

let root: string;

beforeEach(async () => {
  root = await makeProject();
});

afterEach(async () => {
  await cleanup(root);
});

function initOptions(
  overrides: Partial<Parameters<typeof initializeProject>[1]> = {},
): Parameters<typeof initializeProject>[1] {
  return {
    agents: ['generic'],
    agentsSpecified: true,
    scan: true,
    writeAgents: true,
    force: false,
    repair: false,
    ...overrides,
  };
}

describe('initializeProject', () => {
  it('creates the full .specvibe baseline, scan artifacts, and agent files', async () => {
    const result = await initializeProject(testContext(root), initOptions());
    const paths = projectPaths(root);

    expect(result.created).toBe(true);
    expect(result.project.name).toBe('fixture-app');
    expect(result.scan?.stats.files).toBeGreaterThan(0);
    expect(result.agents).toEqual(['generic']);

    for (const file of [
      paths.config,
      paths.state,
      paths.constitution,
      paths.context,
      paths.decisions,
      paths.readme,
      paths.gitignore,
      paths.scanJson,
      paths.summary,
      `${root}/AGENTS.md`,
    ]) {
      expect(await pathExists(file), file).toBe(true);
    }

    expect(await readText(paths.constitution)).toContain('Constitution');
    expect(await readText(paths.context)).toContain('fixture-app');
    expect(await readText(paths.gitignore)).toContain('packs/');

    const config = await loadConfig(root);
    expect(config.agents).toEqual(['generic']);
    const state = await loadState(root);
    expect(state.lastScan?.files).toBe(result.scan?.stats.files);
    expect(state.history.some((event) => event.event === 'init')).toBe(true);
  });

  it('detects agent integrations when no explicit list is given', async () => {
    await writeText(`${root}/.opencode/config.json`, '{}');
    const result = await initializeProject(
      testContext(root),
      initOptions({ agents: undefined, agentsSpecified: false }),
    );
    expect(result.detectedAgents).toEqual(['opencode']);
    expect(result.agents).toEqual(['opencode']);
    expect(await pathExists(`${root}/.opencode/commands/sv/propose.md`)).toBe(true);
    expect(await pathExists(`${root}/AGENTS.md`)).toBe(true);
  });

  it('supports an explicit empty agent list', async () => {
    const result = await initializeProject(
      testContext(root),
      initOptions({ agents: [], agentsSpecified: true, scan: false, writeAgents: true }),
    );
    expect(result.agents).toEqual([]);
    expect((await loadConfig(root)).agents).toEqual([]);
    expect(await pathExists(`${root}/AGENTS.md`)).toBe(false);
  });

  it('skips the scan and agent files when requested', async () => {
    const result = await initializeProject(
      testContext(root),
      initOptions({ scan: false, writeAgents: false }),
    );
    expect(result.scan).toBeNull();
    expect(result.agentResult).toBeNull();
    expect(await pathExists(projectPaths(root).summary)).toBe(false);
    expect(await pathExists(`${root}/AGENTS.md`)).toBe(false);
    expect((await loadState(root)).lastScan).toBeUndefined();
  });

  it('refuses to initialize twice without repair or force', async () => {
    await initializeProject(testContext(root), initOptions());
    await expect(initializeProject(testContext(root), initOptions())).rejects.toThrow(
      /already initialized/,
    );
  });

  it('repairs missing files while preserving user-authored documents', async () => {
    await initializeProject(testContext(root), initOptions({ scan: false }));
    const paths = projectPaths(root);
    const custom = '# Our constitution\n\nThis is a custom rule set.\n';
    await writeText(paths.constitution, custom);
    await import('node:fs/promises').then((fs) => fs.rm(paths.context));

    const result = await initializeProject(
      testContext(root),
      initOptions({ force: true, scan: true }),
    );
    expect(result.created).toBe(false);
    expect(await readText(paths.constitution)).toBe(custom);
    expect(await readText(paths.context)).toContain('fixture-app');
    expect(await pathExists(paths.summary)).toBe(true);
    expect((await loadState(root)).history.some((event) => event.event === 'setup')).toBe(true);
  });

  it('honors name and description overrides', async () => {
    const result = await initializeProject(
      testContext(root),
      initOptions({ name: 'Custom Name', description: 'Custom description.', scan: false }),
    );
    expect(result.project.name).toBe('Custom Name');
    expect(result.project.description).toBe('Custom description.');
    expect(await readText(projectPaths(root).context)).toContain('Custom Name');
    expect(await readText(projectPaths(root).context)).toContain('Custom description.');
  });

  it('appends required ignores to an existing .specvibe/.gitignore', async () => {
    await initializeProject(testContext(root), initOptions({ scan: false }));
    const gitignorePath = projectPaths(root).gitignore;
    await writeText(gitignorePath, 'node_modules/\ndist/\n');
    await initializeProject(testContext(root), initOptions({ scan: false, force: true }));
    const gitignore = await readText(gitignorePath);
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('# Added by SpecVibe');
    expect(gitignore).toContain('packs/');
    expect(gitignore).toContain('backups/');
    expect(gitignore).toContain('tmp/');
  });

  it('does not duplicate SpecVibe gitignore entries', async () => {
    await initializeProject(testContext(root), initOptions({ scan: false }));
    const before = await readText(projectPaths(root).gitignore);
    await initializeProject(testContext(root), initOptions({ force: true, scan: false }));
    const after = await readText(projectPaths(root).gitignore);
    expect(after).toBe(before);
  });
});
