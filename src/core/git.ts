import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitInfo } from '../types.js';
import { SpecVibeError } from './errors.js';
import { compactStamp, isNoisePath, sanitizeRefPart } from './utils.js';

const execFileAsync = promisify(execFile);

interface GitExecOptions {
  allowFailure?: boolean;
  maxBuffer?: number;
}

interface GitExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function execGit(
  root: string,
  args: string[],
  options: GitExecOptions = {},
): Promise<GitExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
      },
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    if (options.allowFailure) {
      return {
        stdout: (err.stdout ?? '').trim(),
        stderr: (err.stderr ?? '').trim(),
        code: typeof err.code === 'number' ? err.code : 1,
      };
    }
    if (err.code === 'ENOENT') {
      throw new SpecVibeError('GIT_REQUIRED', 'Git is not installed or not on PATH.', {
        hint: 'Install Git from https://git-scm.com/downloads and try again.',
        cause: error,
      });
    }
    const details = (err.stderr || err.stdout || err.message || '').trim();
    throw new SpecVibeError('GIT_ERROR', `git ${args[0] ?? ''} failed.`, {
      hint: details || undefined,
      cause: error,
    });
  }
}

export async function gitInfo(root: string): Promise<GitInfo> {
  try {
    const version = await execGit(root, ['--version'], { allowFailure: true });
    if (version.code !== 0) return { available: false, isRepo: false };
    const inside = await execGit(root, ['rev-parse', '--is-inside-work-tree'], {
      allowFailure: true,
    });
    if (inside.code !== 0 || inside.stdout !== 'true') {
      return {
        available: true,
        version: version.stdout.replace(/^git version\s+/, ''),
        isRepo: false,
      };
    }
    const [head, branch, status] = await Promise.all([
      execGit(root, ['rev-parse', 'HEAD'], { allowFailure: true }),
      execGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }),
      execGit(root, ['status', '--porcelain'], { allowFailure: true }),
    ]);
    const statusLines = status.stdout ? status.stdout.split('\n').filter(Boolean).length : 0;
    return {
      available: true,
      version: version.stdout.replace(/^git version\s+/, ''),
      isRepo: true,
      head: head.code === 0 ? head.stdout : undefined,
      branch: branch.code === 0 ? branch.stdout : undefined,
      clean: statusLines === 0,
      statusLines,
    };
  } catch {
    return { available: false, isRepo: false };
  }
}

export async function isGitRepo(root: string): Promise<boolean> {
  const result = await execGit(root, ['rev-parse', '--is-inside-work-tree'], {
    allowFailure: true,
  });
  return result.code === 0 && result.stdout === 'true';
}

export async function getHead(root: string): Promise<string> {
  const result = await execGit(root, ['rev-parse', 'HEAD']);
  if (!result.stdout) {
    throw new SpecVibeError('GIT_ERROR', 'Could not resolve the current git commit.');
  }
  return result.stdout;
}

export async function getBranch(root: string): Promise<string | undefined> {
  const result = await execGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true });
  return result.code === 0 ? result.stdout : undefined;
}

export async function getStatusLines(root: string, exclude: string[] = []): Promise<string[]> {
  const args = ['status', '--porcelain'];
  if (exclude.length) {
    args.push('--', '.', ...exclude.map((entry) => `:(exclude)${entry}`));
  }
  const result = await execGit(root, args, { allowFailure: true });
  return result.stdout ? result.stdout.split('\n').filter(Boolean) : [];
}

/**
 * Check whether files that belong to the implementation are clean.
 * SpecVibe bookkeeping (`.specvibe/`) is excluded by default because
 * approve/propose constantly rewrite track metadata between checkpoints.
 */
export async function isWorkingTreeClean(
  root: string,
  exclude: string[] = ['.specvibe'],
): Promise<boolean> {
  return (await getStatusLines(root, exclude)).length === 0;
}

export async function commitExists(root: string, commit: string): Promise<boolean> {
  const result = await execGit(root, ['cat-file', '-e', `${commit}^{commit}`], {
    allowFailure: true,
  });
  return result.code === 0;
}

export async function resolveCommit(root: string, ref: string): Promise<string | null> {
  const result = await execGit(root, ['rev-parse', '--verify', `${ref}^{commit}`], {
    allowFailure: true,
  });
  return result.code === 0 && result.stdout ? result.stdout : null;
}

export function checkpointRefName(slug: string, date = new Date()): string {
  return `refs/specvibe/checkpoints/${sanitizeRefPart(slug)}/${compactStamp(date)}`;
}

export async function createCheckpointRef(
  root: string,
  slug: string,
  commit: string,
  date = new Date(),
): Promise<string> {
  const ref = checkpointRefName(slug, date);
  await execGit(root, ['update-ref', ref, commit]);
  return ref;
}

export async function createBackupBranch(root: string, slug: string): Promise<string | null> {
  const branch = `specvibe-backup/${sanitizeRefPart(slug)}-${compactStamp()}`;
  const head = await getHead(root).catch(() => null);
  if (!head) return null;
  const result = await execGit(root, ['branch', branch, head], { allowFailure: true });
  return result.code === 0 ? branch : null;
}

export async function stashAll(root: string, message: string): Promise<string | null> {
  const before = await execGit(root, ['rev-parse', '--verify', 'refs/stash'], {
    allowFailure: true,
  });
  const result = await execGit(root, ['stash', 'push', '--include-untracked', '-m', message], {
    allowFailure: true,
  });
  if (result.code !== 0 || /No local changes/i.test(result.stdout)) return null;
  const after = await execGit(root, ['rev-parse', '--verify', 'refs/stash'], {
    allowFailure: true,
  });
  if (after.code !== 0) return null;
  return after.stdout === before.stdout ? null : after.stdout;
}

export async function resetHard(root: string, commit: string): Promise<void> {
  await execGit(root, ['reset', '--hard', commit]);
}

export async function commitsSince(root: string, commit: string): Promise<number> {
  const result = await execGit(root, ['rev-list', '--count', `${commit}..HEAD`], {
    allowFailure: true,
  });
  return result.code === 0 ? Number(result.stdout) || 0 : 0;
}

export async function diffNamesSince(root: string, commit: string): Promise<string[]> {
  const changed = await execGit(root, ['diff', '--name-status', commit, '--'], {
    allowFailure: true,
  });
  const untracked = await execGit(root, ['ls-files', '--others', '--exclude-standard'], {
    allowFailure: true,
  });
  const names = new Set<string>();
  for (const line of changed.stdout.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    for (const part of parts.slice(1)) {
      if (part && !isNoisePath(part)) names.add(part);
    }
  }
  for (const line of untracked.stdout.split('\n')) {
    const file = line.trim();
    if (file && !isNoisePath(file)) names.add(file);
  }
  return [...names].sort().slice(0, 500);
}

export async function remoteUrl(root: string, name = 'origin'): Promise<string | null> {
  const result = await execGit(root, ['remote', 'get-url', name], { allowFailure: true });
  return result.code === 0 ? result.stdout : null;
}
