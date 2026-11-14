import os from 'node:os';
import path from 'node:path';

export function nowIso(): string {
  return new Date().toISOString();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function compactStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

/** Estimate tokens without a tokenizer. ~4 ASCII chars/token, CJK ~1 char/token. */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x2e80) wide += 1;
    else ascii += 1;
  }
  return Math.max(1, Math.ceil(ascii / 4 + wide));
}

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = '\n\n... [truncated by SpecVibe] ...\n\n';
  const budget = Math.max(0, maxChars - marker.length);
  const head = Math.floor(budget * 0.7);
  const tail = budget - head;
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}

export function truncateByTokens(
  text: string,
  maxTokens: number,
): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= maxTokens) return { text, truncated: false };
  const marker = '\n\n... [truncated by SpecVibe: token budget] ...\n\n';
  const maxChars = Math.max(200, maxTokens * 4 - marker.length);
  const head = Math.floor(maxChars * 0.72);
  const tail = Math.max(0, maxChars - head);
  return {
    text: `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`,
    truncated: true,
  };
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function sanitizeRefPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function isHomeDirectory(dir: string): boolean {
  return path.resolve(dir) === path.resolve(os.homedir());
}

export function isFilesystemRoot(dir: string): boolean {
  return path.dirname(path.resolve(dir)) === path.resolve(dir);
}

export function relativePath(root: string, file: string): string {
  const relative = path.relative(root, file);
  return relative.split(path.sep).join('/');
}

export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);
  for (let row = 1; row < rows; row += 1) {
    const current = [row];
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      current[col] = Math.min(
        (current[col - 1] ?? 0) + 1,
        (previous[col] ?? 0) + 1,
        (previous[col - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[cols - 1] ?? 0;
}

export function closestMatch(input: string, candidates: string[]): string | undefined {
  let best: { value: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (!best || distance < best.distance) best = { value: candidate, distance };
  }
  return best && best.distance <= 3 ? best.value : undefined;
}

/** Run async tasks with bounded concurrency while preserving result order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await mapper(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const delta = Date.now() - then;
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

const NOISE_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.specvibe',
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.pnpm-store',
  '.yarn',
  'dist',
  'build',
  'out',
  'coverage',
  '.coverage',
  '.nyc_output',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  '.vitest',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '__pycache__',
  'venv',
  '.venv',
  'env',
  '.tox',
  'target',
  'vendor',
  'Pods',
  'DerivedData',
  '.gradle',
  '.idea',
  '.vscode',
  '.terraform',
  '.serverless',
  'tmp',
  'temp',
]);

/** True for generated, vendored, or SpecVibe-managed paths that pollute change lists. */
export function isNoisePath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return normalized.split('/').some((part) => NOISE_DIRECTORIES.has(part));
}
