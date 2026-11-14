import { SpecVibeError } from './errors.js';

const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

/**
 * Convert a human feature title into a filesystem-safe, git-friendly slug.
 * ASCII only, lowercase, hyphen-separated, max 48 characters.
 */
export function slugify(input: string, maxLength = 48): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  const slug = normalized || 'track';
  if (WINDOWS_RESERVED.has(slug)) return `${slug}-track`;
  return slug;
}

export function validateSlug(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) {
    throw new SpecVibeError('USAGE', `Invalid track name "${slug}".`, {
      hint: 'Use lowercase letters, numbers, and hyphens (max 48 characters).',
    });
  }
  if (WINDOWS_RESERVED.has(slug)) {
    throw new SpecVibeError('USAGE', `"${slug}" is a reserved filename on Windows.`);
  }
  return slug;
}

export function normalizeTrackTitle(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}
