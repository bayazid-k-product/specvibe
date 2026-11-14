import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeConfig } from '../src/core/config.js';
import { readJson, readText, writeText } from '../src/core/fs.js';
import { projectPaths } from '../src/core/paths.js';
import {
  buildScanSummary,
  isTestPath,
  loadScanResult,
  scanRepository,
  writeScanArtifacts,
} from '../src/core/scanner.js';
import type { ScanResult } from '../src/types.js';
import { cleanup, makeProject, writeFixture } from './helpers.js';

let root: string;

beforeEach(async () => {
  root = await makeProject({
    'src/math.test.ts':
      "import { describe, expect, it } from 'vitest';\nimport { add } from './math.js';\n\ndescribe('add', () => {\n  it('adds', () => expect(add(1, 2)).toBe(3));\n});\n",
    'src/big.ts': `${Array.from(
      { length: 60 },
      (_, index) => `export const value${index} = ${index};`,
    ).join('\n')}\n`,
    'node_modules/ignored-package/index.js': 'module.exports = 1;\n',
    'dist/bundle.js': 'console.log("built");\n',
    '.specvibe/context/old.md': '# old\n',
  });
});

afterEach(async () => {
  await cleanup(root);
});

describe('scanRepository', () => {
  it('maps source files, languages, directories, and project metadata', async () => {
    const config = normalizeConfig({});
    const result = await scanRepository({ root, config });

    expect(result.schemaVersion).toBe(1);
    expect(result.project.name).toBe('fixture-app');
    expect(result.stats.files).toBeGreaterThanOrEqual(6);
    expect(result.stats.totalLines).toBeGreaterThan(0);
    expect(result.stats.languages.map((entry) => entry.language)).toContain('TypeScript');

    const paths = result.files.map((file) => file.path);
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/math.ts');
    expect(paths).toContain('README.md');
    expect(paths).not.toContain('node_modules/ignored-package/index.js');
    expect(paths).not.toContain('dist/bundle.js');
    expect(paths.some((file) => file.startsWith('.specvibe/'))).toBe(false);

    expect(result.directories.some((entry) => entry.path === 'src')).toBe(true);
    expect(result.files.find((file) => file.path === 'src/math.ts')?.exports).toEqual(
      expect.arrayContaining(['add', 'formatTotal']),
    );
    expect(result.files.find((file) => file.path === 'src/math.ts')?.isTest).toBe(false);
    expect(result.files.find((file) => file.path === 'src/math.test.ts')?.isTest).toBe(true);
  });

  it('detects oversized files and long functions against the configured limits', async () => {
    const longBody = Array.from({ length: 20 }, (_, index) => `  const step${index} = ${index};`);
    const config = normalizeConfig({ maxFileLines: 50, maxFunctionLines: 10 });
    await writeFixture(root, {
      'src/long.ts': `export function doWork(): number {\n${longBody.join('\n')}\n  return 0;\n}\n`,
    });

    const result = await scanRepository({ root, config });
    expect(result.bloatedFiles.map((file) => file.path)).toContain('src/big.ts');
    expect(
      result.longFunctions.some((fn) => fn.name === 'doWork' && fn.path === 'src/long.ts'),
    ).toBe(true);
  });

  it('honors config.scan.includeTests and config.scan.ignore', async () => {
    await writeFixture(root, {
      'vendor/generated.ts': 'export const generated = true;\n',
      'docs/guide.ts': 'export const guide = true;\n',
    });
    const config = normalizeConfig({
      scan: { includeTests: false, ignore: ['vendor/**'] },
    });
    const result = await scanRepository({ root, config });
    const paths = result.files.map((file) => file.path);
    expect(paths).not.toContain('src/math.test.ts');
    expect(paths).not.toContain('vendor/generated.ts');
    expect(paths).toContain('docs/guide.ts');
  });

  it('ranks focused files and explains why they matched', async () => {
    const config = normalizeConfig({});
    const result = await scanRepository({ root, config, focus: 'math totals' });
    expect(result.focus).toBeDefined();
    expect(result.focus?.map((file) => file.path)).toContain('src/math.ts');
    expect(result.focus?.[0]?.score).toBeGreaterThan(0);
    expect(result.focus?.[0]?.reasons.length).toBeGreaterThan(0);
  });

  it('warns instead of failing when no text files are found', async () => {
    const emptyRoot = await makeProject({});
    for (const relative of ['src/index.ts', 'src/math.ts', 'README.md']) {
      await writeText(`${emptyRoot}/${relative}`, '');
    }
    const result = await scanRepository({ root: emptyRoot, config: normalizeConfig({}) });
    expect(Array.isArray(result.warnings)).toBe(true);
    await cleanup(emptyRoot);
  });
});

describe('isTestPath', () => {
  it('recognizes common test layouts', () => {
    for (const value of [
      'src/math.test.ts',
      'src/math.spec.ts',
      'tests/integration.ts',
      'test/unit.py',
      '__tests__/component.tsx',
      'src/__snapshots__/x.snap',
    ]) {
      expect(isTestPath(value)).toBe(true);
    }
    expect(isTestPath('src/mathematics.ts')).toBe(false);
  });
});

describe('scan artifacts', () => {
  it('writes JSON, the markdown summary, and state metadata', async () => {
    const result = await scanRepository({ root, config: normalizeConfig({}) });
    await writeScanArtifacts(root, result);

    const paths = projectPaths(root);
    const reloaded = await loadScanResult(root);
    expect(reloaded?.stats.files).toBe(result.stats.files);
    expect((await readText(paths.summary)).length).toBeGreaterThan(100);
    expect(await readText(paths.summary)).toContain('Codebase');

    const state = await readJson<{ lastScan?: { files: number } }>(paths.state);
    expect(state.lastScan?.files).toBe(result.stats.files);
    expect(buildScanSummary(result)).toContain('src/math.ts');
  });

  it('returns null when no scan has been written yet', async () => {
    expect(await loadScanResult(root)).toBeNull();
  });
});

describe('buildScanSummary', () => {
  it('summarizes files, limits, focus, and recommendations', async () => {
    const result: ScanResult = await scanRepository({
      root,
      config: normalizeConfig({ maxFileLines: 50 }),
      focus: 'math',
    });
    const summary = buildScanSummary(result);
    expect(summary).toContain('# Codebase Map');
    expect(summary).toMatch(/files/);
    expect(summary).toContain('src/math.ts');
    expect(summary.length).toBeGreaterThan(200);
  });
});
