import path from 'node:path';
import { pathExists } from './fs.js';

export const SPECVIBE_DIR = '.specvibe';

export interface ProjectPaths {
  root: string;
  dir: string;
  config: string;
  state: string;
  constitution: string;
  context: string;
  decisions: string;
  readme: string;
  tracks: string;
  archive: string;
  contextDir: string;
  summary: string;
  scanJson: string;
  packs: string;
  backups: string;
  gitignore: string;
}

export function projectPaths(root: string): ProjectPaths {
  const resolveRoot = path.resolve(root);
  const dir = path.join(resolveRoot, SPECVIBE_DIR);
  return {
    root: resolveRoot,
    dir,
    config: path.join(dir, 'config.json'),
    state: path.join(dir, 'state.json'),
    constitution: path.join(dir, 'constitution.md'),
    context: path.join(dir, 'context.md'),
    decisions: path.join(dir, 'decisions.md'),
    readme: path.join(dir, 'README.md'),
    tracks: path.join(dir, 'tracks'),
    archive: path.join(dir, 'archive'),
    contextDir: path.join(dir, 'context'),
    summary: path.join(dir, 'context', 'codebase-summary.md'),
    scanJson: path.join(dir, 'context', 'scan.json'),
    packs: path.join(dir, 'packs'),
    backups: path.join(dir, 'backups'),
    gitignore: path.join(dir, '.gitignore'),
  };
}

/**
 * Find the nearest ancestor with an initialized `.specvibe/` directory.
 * Returns null when the tool has not been initialized.
 */
export async function findProjectRoot(start: string): Promise<string | null> {
  let current = path.resolve(start);
  while (true) {
    if (await pathExists(path.join(current, SPECVIBE_DIR))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function requireProjectRoot(start: string): Promise<string> {
  const root = await findProjectRoot(start);
  if (!root) {
    const { SpecVibeError } = await import('./errors.js');
    throw new SpecVibeError('NOT_INITIALIZED', 'SpecVibe is not initialized in this directory.', {
      hint: 'Run `specvibe init` from the repository root (or use --cwd).',
    });
  }
  return root;
}

export function trackDir(root: string, slug: string): string {
  return path.join(root, SPECVIBE_DIR, 'tracks', slug);
}

export function archiveDir(root: string, name: string): string {
  return path.join(root, SPECVIBE_DIR, 'archive', name);
}

export interface ProjectTrackPaths {
  dir: string;
  proposal: string;
  spec: string;
  design: string;
  tasks: string;
  meta: string;
  summary: string;
}

export function trackFiles(root: string, slug: string): ProjectTrackPaths {
  const dir = trackDir(root, slug);
  return {
    dir,
    proposal: path.join(dir, 'proposal.md'),
    spec: path.join(dir, 'spec.md'),
    design: path.join(dir, 'design.md'),
    tasks: path.join(dir, 'tasks.md'),
    meta: path.join(dir, 'meta.json'),
    summary: path.join(dir, 'summary.md'),
  };
}
