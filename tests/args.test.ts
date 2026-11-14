import { describe, expect, it } from 'vitest';
import { parseFlags, splitLeadingGlobals } from '../src/cli/args.js';
import type { FlagDefinition } from '../src/cli/types.js';
import { isSpecVibeError } from '../src/core/errors.js';

const FLAGS: FlagDefinition[] = [
  { name: 'json', type: 'boolean', description: 'JSON output' },
  { name: 'force', type: 'boolean', aliases: ['-f'], description: 'Force' },
  { name: 'cwd', type: 'string', aliases: ['-C'], description: 'Working directory' },
  { name: 'max-tokens', type: 'number', description: 'Budget' },
];

describe('parseFlags', () => {
  it('parses positionals, booleans, strings, and numbers', () => {
    const result = parseFlags(
      ['add', 'widget', '--json', '--cwd', 'some dir', '--max-tokens=5000'],
      FLAGS,
    );
    expect(result.positionals).toEqual(['add', 'widget']);
    expect(result.flags).toEqual({ json: true, cwd: 'some dir', 'max-tokens': 5000 });
  });

  it('supports aliases and inline boolean values', () => {
    const result = parseFlags(['-f', '--json=false'], FLAGS);
    expect(result.flags.force).toBe(true);
    expect(result.flags.json).toBe(false);
  });

  it('treats tokens after -- as positionals', () => {
    const result = parseFlags(['--json', '--', '--not-a-flag', '-x'], FLAGS);
    expect(result.flags.json).toBe(true);
    expect(result.positionals).toEqual(['--not-a-flag', '-x']);
  });

  it('rejects unknown options with a suggestion', () => {
    try {
      parseFlags(['--forc'], FLAGS);
      throw new Error('expected parseFlags to throw');
    } catch (error) {
      expect(isSpecVibeError(error)).toBe(true);
      if (isSpecVibeError(error)) {
        expect(error.code).toBe('USAGE');
        expect(error.hint).toContain('--force');
      }
    }
  });

  it('rejects missing values and invalid numbers', () => {
    expect(() => parseFlags(['--cwd'], FLAGS)).toThrow(/requires a value/);
    expect(() => parseFlags(['--max-tokens', 'lots'], FLAGS)).toThrow(/expects an integer/);
  });
});

describe('splitLeadingGlobals', () => {
  it('keeps global flags before the command and values attached', () => {
    const result = splitLeadingGlobals(['--cwd', 'dir', '--json', 'status', '--next']);
    expect(result.leading).toEqual(['--cwd', 'dir', '--json']);
    expect(result.command).toBe('status');
    expect(result.rest).toEqual(['--next']);
  });

  it('stops at the first non-global token', () => {
    const result = splitLeadingGlobals(['status', '--json']);
    expect(result.leading).toEqual([]);
    expect(result.command).toBe('status');
    expect(result.rest).toEqual(['--json']);
  });

  it('returns no command for options that are not global', () => {
    const result = splitLeadingGlobals(['--max-tokens', '5000', 'pack']);
    expect(result.command).toBeUndefined();
    expect(result.rest).toEqual(['--max-tokens', '5000', 'pack']);
  });
});
