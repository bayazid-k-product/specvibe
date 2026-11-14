import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_ROOT } from '../src/core/templates.js';
import { PACKAGE_NAME, VERSION } from '../src/version.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface PackageManifest {
  name: string;
  version: string;
  type: string;
  license: string;
  engines?: { node?: string };
  bin?: Record<string, string>;
  main?: string;
  types?: string;
  exports?: Record<string, unknown>;
  files?: string[];
  scripts?: Record<string, string>;
  publishConfig?: { access?: string; provenance?: boolean };
}

let cachedManifest: PackageManifest | undefined;

async function readManifest(): Promise<PackageManifest> {
  if (cachedManifest) return cachedManifest;
  const raw = await readFile(path.join(repositoryRoot, 'package.json'), 'utf8');
  cachedManifest = JSON.parse(raw) as PackageManifest;
  return cachedManifest;
}

const REQUIRED_TEMPLATES = [
  'constitution.md',
  'context.md',
  'decisions.md',
  'specvibe-readme.md',
  'agents/rules.md',
  'agents/cursor-compat.md',
  'commands/setup.md',
  'commands/scan.md',
  'commands/propose.md',
  'commands/apply.md',
  'commands/unify.md',
  'commands/pack.md',
  'commands/status.md',
  'commands/revert.md',
  'tracks/proposal.md',
  'tracks/spec.md',
  'tracks/design.md',
  'tracks/tasks.md',
];

describe('package metadata', () => {
  it('keeps the exported version and package name in sync with package.json', async () => {
    const manifest = await readManifest();
    expect(VERSION).toBe(manifest.version);
    expect(PACKAGE_NAME).toBe(manifest.name);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it('publishes an ESM package with declarations and both CLI names', async () => {
    const manifest = await readManifest();
    expect(manifest.type).toBe('module');
    expect(manifest.license).toBe('MIT');
    expect(manifest.main).toBe('./dist/index.js');
    expect(manifest.types).toBe('./dist/index.d.ts');
    expect(manifest.exports?.['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
    });

    expect(manifest.bin?.specvibe).toBe('./dist/cli.js');
    expect(manifest.bin?.sv).toBe('./dist/cli.js');
    expect(manifest.publishConfig?.access).toBe('public');
  });

  it('declares a supported Node.js floor and a test script that runs the suite', async () => {
    const manifest = await readManifest();
    expect(manifest.engines?.node).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(manifest.scripts?.test).toContain('vitest');
    expect(manifest.scripts?.check).toContain('npm run typecheck');
    expect(manifest.scripts?.build).toContain('tsc');
  });

  it('ships only runtime output and documentation from the package root', async () => {
    const manifest = await readManifest();
    const files = manifest.files ?? [];
    for (const required of ['dist', 'templates', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
      expect(files, required).toContain(required);
    }
    for (const excluded of ['src', 'tests', '.github', 'node_modules']) {
      expect(files, excluded).not.toContain(excluded);
    }
  });
});

describe('shipped templates', () => {
  it('resolves the template root from the package root, not the source tree', () => {
    expect(path.basename(TEMPLATE_ROOT)).toBe('templates');
  });

  it('includes every template used by init, tracks, and agent sync', async () => {
    for (const relative of REQUIRED_TEMPLATES) {
      const file = path.join(TEMPLATE_ROOT, relative);
      const info = await stat(file);
      expect(info.isFile(), relative).toBe(true);
    }
  });

  it('keeps templates non-empty and free of unresolved BOM or null bytes', async () => {
    for (const relative of REQUIRED_TEMPLATES) {
      const content = await readFile(path.join(TEMPLATE_ROOT, relative), 'utf8');
      expect(content.trim().length, relative).toBeGreaterThan(0);
      expect(content.includes('\u0000'), relative).toBe(false);
    }
  });

  it('never embeds implementation code markers in planning templates', async () => {
    for (const relative of REQUIRED_TEMPLATES.filter((name) => name.startsWith('tracks/'))) {
      const content = await readFile(path.join(TEMPLATE_ROOT, relative), 'utf8');
      expect(content, relative).not.toContain('```ts');
      expect(content, relative).not.toContain('```js');
    }
  });
});
