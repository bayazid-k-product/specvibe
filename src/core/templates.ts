import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpecVibeError } from './errors.js';
import { readText } from './fs.js';

/**
 * Templates live at the repository/package root and are resolved relative to
 * this module, so the same code works from `src/` (tsx, tests) and `dist/`
 * (published package).
 */
export const TEMPLATE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'templates',
);

const cache = new Map<string, string>();

export function renderTemplateString(
  content: string,
  variables: Record<string, string | number | boolean | undefined>,
): string {
  return content.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    if (!(key in variables)) return match;
    const value = variables[key];
    return value === undefined ? match : String(value);
  });
}

export async function loadTemplate(name: string): Promise<string> {
  const normalized = name.replace(/\\/g, '/');
  if (normalized.includes('..')) {
    throw new SpecVibeError('INTERNAL', `Invalid template path: ${name}`);
  }
  const cached = cache.get(normalized);
  if (cached !== undefined) return cached;
  const file = resolve(TEMPLATE_ROOT, normalized);
  if (!file.startsWith(TEMPLATE_ROOT)) {
    throw new SpecVibeError('INTERNAL', `Template escapes template root: ${name}`);
  }
  const content = await readText(file).catch((error) => {
    throw new SpecVibeError('INTERNAL', `Missing template: ${name}`, { cause: error });
  });
  cache.set(normalized, content);
  return content;
}

export async function renderTemplate(
  name: string,
  variables: Record<string, string | number | boolean | undefined>,
): Promise<string> {
  return renderTemplateString(await loadTemplate(name), variables);
}

export function clearTemplateCache(): void {
  cache.clear();
}

export function findUnresolvedPlaceholders(content: string): string[] {
  const matches = content.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g);
  return [...new Set([...matches].map((match) => match[1] ?? ''))].filter(Boolean);
}
