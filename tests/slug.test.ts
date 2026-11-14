import { describe, expect, it } from 'vitest';
import { isSpecVibeError } from '../src/core/errors.js';
import { normalizeTrackTitle, slugify, validateSlug } from '../src/core/slug.js';

describe('slugify', () => {
  it('creates lowercase hyphenated slugs', () => {
    expect(slugify('Add CSV Export for the Math Totals')).toBe(
      'add-csv-export-for-the-math-totals',
    );
  });

  it('strips accents, punctuation, and extra separators', () => {
    expect(slugify("  Café: l'été — déjà vu!  ")).toBe('cafe-lete-deja-vu');
  });

  it('truncates without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(60), 12);
    expect(slug).toBe('a'.repeat(12));
    expect(slugify('word '.repeat(20), 10)).toBe('word-word');
  });

  it('avoids Windows reserved names', () => {
    expect(slugify('CON')).toBe('con-track');
    expect(slugify('lpt1')).toBe('lpt1-track');
  });

  it('falls back to track for empty input', () => {
    expect(slugify('!!!')).toBe('track');
  });
});

describe('validateSlug', () => {
  it('accepts valid slugs', () => {
    expect(validateSlug('add-csv-export')).toBe('add-csv-export');
  });

  it('rejects uppercase, spaces, and reserved names', () => {
    for (const bad of ['Add-Feature', 'add feature', '-leading', 'con']) {
      try {
        validateSlug(bad);
        throw new Error(`expected ${bad} to be rejected`);
      } catch (error) {
        expect(isSpecVibeError(error)).toBe(true);
      }
    }
  });
});

describe('normalizeTrackTitle', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeTrackTitle('  Add   a\n feature  ')).toBe('Add a feature');
  });
});
