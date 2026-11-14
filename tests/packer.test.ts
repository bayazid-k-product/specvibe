import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/commands/init.js';
import { normalizeConfig } from '../src/core/config.js';
import { pathExists, readText, writeText } from '../src/core/fs.js';
import { packContext } from '../src/core/packer.js';
import { projectPaths } from '../src/core/paths.js';
import { scanRepository, writeScanArtifacts } from '../src/core/scanner.js';
import { loadState } from '../src/core/state.js';
import { approveTrack, createTrack } from '../src/core/track.js';
import type { ScanResult } from '../src/types.js';
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
  const config = normalizeConfig({});
  scan = await scanRepository({ root, config });
  await writeScanArtifacts(root, scan);
});

afterEach(async () => {
  await cleanup(root);
});

async function createApprovedTrack(slug = 'fixture-feature'): Promise<void> {
  await createTrack({
    root,
    title: 'Add a fixture feature',
    slug,
    config: normalizeConfig({}),
    scan,
    projectName: 'fixture-app',
    stack: ['TypeScript'],
    commands: { build: 'npm run build', test: 'npm test' },
  });
  await writeValidTrack(root, slug);
  await approveTrack(root, slug);
}

describe('packContext with an active track', () => {
  it('packs governance docs, track docs, and referenced source files', async () => {
    await createApprovedTrack();
    const result = await packContext({
      root,
      config: normalizeConfig({}),
      track: 'fixture-feature',
      write: false,
    });

    expect(result.track).toBe('fixture-feature');
    expect(result.markdown).toContain('# SpecVibe Context Pack');
    expect(result.markdown).toContain('Track: **Add a fixture feature**');
    expect(result.markdown).toContain('## Constitution');
    expect(result.markdown).toContain('## Project Context');
    expect(result.markdown).toContain('## Track Specification');
    expect(result.markdown).toContain('## Codebase Map');
    expect(result.included.map((file) => file.path)).toContain('src/math.ts');
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.budgetTokens);
    expect(result.path.endsWith('fixture-feature.md')).toBe(true);
  });

  it('writes the pack and records it in state by default', async () => {
    await createApprovedTrack();
    const result = await packContext({
      root,
      config: normalizeConfig({}),
      track: 'fixture-feature',
    });
    expect(await pathExists(result.path)).toBe(true);
    const markdown = await readText(result.path);
    expect(markdown).toContain('# SpecVibe Context Pack');
    const state = await loadState(root);
    expect(state.lastPack?.track).toBe('fixture-feature');
    expect(state.lastPack?.estimatedTokens).toBe(result.estimatedTokens);
  });

  it('honors a custom output path and reports omissions under a tight budget', async () => {
    await createApprovedTrack();
    await writeText(
      `${root}/src/huge.ts`,
      Array.from(
        { length: 400 },
        (_, index) => `export const huge${index} = '${'x'.repeat(40)}';`,
      ).join('\n'),
    );
    const result = await packContext({
      root,
      config: normalizeConfig({ pack: { maxFiles: 2, maxFileTokens: 1000 } }),
      track: 'fixture-feature',
      maxTokens: 4000,
      out: 'custom/context.md',
      write: true,
    });
    expect(result.path).toBe(path.join(root, 'custom', 'context.md'));
    expect(await pathExists(result.path)).toBe(true);
    expect(result.budgetTokens).toBe(4000);
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('throws for an explicit track that does not exist', async () => {
    await expect(
      packContext({ root, config: normalizeConfig({}), track: 'missing-track', write: false }),
    ).rejects.toThrow(/does not exist/);
  });
});

describe('packContext without a track', () => {
  it('falls back to ranked project source files from the latest scan', async () => {
    const result = await packContext({
      root,
      config: normalizeConfig({ pack: { maxFiles: 3 } }),
      write: false,
    });
    expect(result.track).toBeNull();
    expect(result.markdown).toContain('Project context only (no active track)');
    expect(result.included.length).toBeGreaterThan(0);
    expect(result.included.map((file) => file.path)).toContain('src/math.ts');
    expect(result.included.length).toBeLessThanOrEqual(3);
  });

  it('still emits a valid pack when no scan exists yet', async () => {
    const bareRoot = await makeProject();
    const result = await packContext({
      root: bareRoot,
      config: normalizeConfig({}),
      write: false,
    });
    expect(result.track).toBeNull();
    expect(result.included).toEqual([]);
    expect(result.markdown).toContain('# SpecVibe Context Pack');
    await cleanup(bareRoot);
  });

  it('records a null track in state when the pack is written', async () => {
    const result = await packContext({ root, config: normalizeConfig({}) });
    expect(result.path.endsWith('project-context.md')).toBe(true);
    const state = await loadState(root);
    expect(state.lastPack?.track).toBeNull();
  });
});

describe('packer budgets', () => {
  it('never drops below the documented 4,000 token floor', async () => {
    await createApprovedTrack();
    const result = await packContext({
      root,
      config: normalizeConfig({}),
      maxTokens: 100,
      write: false,
    });
    expect(result.budgetTokens).toBe(4000);
    expect(result.estimatedTokens).toBeLessThanOrEqual(4000);
  });

  it('truncates oversized governance documents instead of failing', async () => {
    const paths = projectPaths(root);
    await writeText(paths.constitution, `# Constitution\n\n${'Long rule. '.repeat(4000)}`);
    const result = await packContext({
      root,
      config: normalizeConfig({ pack: { maxTokens: 8000 } }),
      maxTokens: 8000,
      write: false,
    });
    expect(result.truncated).toBe(true);
    expect(result.markdown).toContain('Truncated to fit the budget');
    expect(result.estimatedTokens).toBeLessThanOrEqual(8000);
  });
});
