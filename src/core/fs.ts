import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SpecVibeError } from './errors.js';

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readText(file: string, fallback?: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (fallback !== undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw new SpecVibeError('IO', `Could not read ${file}.`, { cause: error });
  }
}

export async function readJson<T>(file: string, fallback?: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (fallback !== undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw new SpecVibeError('IO', `Could not read ${file}.`, { cause: error });
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new SpecVibeError('CONFIG', `Invalid JSON in ${file}.`, {
      hint: 'Fix the JSON syntax or delete the file and run `specvibe init` again.',
      cause: error,
    });
  }
}

/**
 * Write a file atomically (write to a sibling temp file, then rename).
 * This avoids partially written state if the process is interrupted.
 */
export async function writeText(file: string, content: string): Promise<void> {
  await ensureDir(path.dirname(file));
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
  );
  try {
    await fs.writeFile(temp, content, 'utf8');
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw new SpecVibeError('IO', `Could not write ${file}.`, { cause: error });
  }
}

export async function writeJson(file: string, value: unknown, pretty = true): Promise<void> {
  await writeText(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

export async function appendText(file: string, content: string): Promise<void> {
  await ensureDir(path.dirname(file));
  try {
    await fs.appendFile(file, content, 'utf8');
  } catch (error) {
    throw new SpecVibeError('IO', `Could not append to ${file}.`, { cause: error });
  }
}

export async function listDirectory(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new SpecVibeError('IO', `Could not list ${dir}.`, { cause: error });
  }
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
  await fs.cp(source, destination, { recursive: true, errorOnExist: false });
}

/** Move a directory, falling back to copy+remove across filesystems. */
export async function moveDirectory(source: string, destination: string): Promise<void> {
  await ensureDir(path.dirname(destination));
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyDirectory(source, destination);
      await fs.rm(source, { recursive: true, force: true });
      return;
    }
    throw new SpecVibeError('IO', `Could not move ${source} to ${destination}.`, {
      cause: error,
    });
  }
}

export async function removeFile(file: string): Promise<void> {
  await fs.rm(file, { force: true });
}

/** Make a timestamped backup before overwriting user-authored content. */
export async function backupFile(
  root: string,
  file: string,
  stamp: string,
): Promise<string | null> {
  if (!(await pathExists(file))) return null;
  const relative = path.relative(root, file);
  if (relative.startsWith('..')) return null;
  const backupPath = path.join(root, '.specvibe', 'backups', stamp, relative);
  await ensureDir(path.dirname(backupPath));
  await fs.copyFile(file, backupPath);
  return backupPath;
}

export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export function fromPosix(filePath: string): string {
  return filePath.split('/').join(path.sep);
}

export function findLineNumber(content: string, needle: string): number | undefined {
  const index = content.indexOf(needle);
  if (index < 0) return undefined;
  return content.slice(0, index).split('\n').length;
}

export function shortHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

export async function fileSize(file: string): Promise<number> {
  const stat = await fs.stat(file);
  return stat.size;
}
