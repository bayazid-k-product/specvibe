import { usageError } from '../core/errors.js';
import { closestMatch } from '../core/utils.js';
import { GLOBAL_FLAGS } from './specs.js';
import type { FlagDefinition, ParsedFlags } from './types.js';

const GLOBAL_BY_TOKEN = new Map<string, FlagDefinition>();
for (const definition of GLOBAL_FLAGS) {
  GLOBAL_BY_TOKEN.set(`--${definition.name}`, definition);
  for (const alias of definition.aliases ?? []) GLOBAL_BY_TOKEN.set(alias, definition);
}

function splitInline(token: string): { name: string; inline?: string } {
  const index = token.indexOf('=');
  if (index < 0) return { name: token };
  return { name: token.slice(0, index), inline: token.slice(index + 1) };
}

function parseBoolean(raw: string, token: string): boolean {
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw usageError(`Option ${token} expects true or false.`);
}

/**
 * Collect global options that appear before the command so options can be
 * written either before or after the command name.
 */
export function splitLeadingGlobals(argv: string[]): {
  leading: string[];
  command?: string;
  rest: string[];
} {
  const leading: string[] = [];
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) break;
    if (token === '--') {
      return { leading, command: undefined, rest: argv.slice(index) };
    }
    if (!token.startsWith('-')) {
      return { leading, command: token, rest: argv.slice(index + 1) };
    }
    const { name } = splitInline(token);
    const definition = GLOBAL_BY_TOKEN.get(name);
    if (!definition) {
      return { leading, command: undefined, rest: argv.slice(index) };
    }
    leading.push(token);
    if (definition.type !== 'boolean' && !token.includes('=')) {
      const value = argv[index + 1];
      if (value !== undefined) {
        leading.push(value);
        index += 1;
      }
    }
    index += 1;
  }
  return { leading, rest: [] };
}

export function parseFlags(
  args: string[],
  definitions: FlagDefinition[],
  commandName = 'specvibe',
): { positionals: string[]; flags: ParsedFlags } {
  const byToken = new Map<string, FlagDefinition>();
  const allTokens: string[] = [];
  for (const definition of definitions) {
    const tokens = [`--${definition.name}`, ...(definition.aliases ?? [])];
    for (const token of tokens) {
      byToken.set(token, definition);
      allTokens.push(token);
    }
  }

  const flags: ParsedFlags = {};
  const positionals: string[] = [];
  let index = 0;

  while (index < args.length) {
    const token = args[index];
    if (token === undefined) break;
    if (token === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (token === '-' || !token.startsWith('-')) {
      positionals.push(token);
      index += 1;
      continue;
    }

    const { name, inline } = splitInline(token);
    const definition = byToken.get(name);
    if (!definition) {
      const suggestion = closestMatch(name, allTokens);
      throw usageError(
        `Unknown option "${name}".`,
        suggestion
          ? `Did you mean ${suggestion}? Run "specvibe help ${commandName}" for usage.`
          : `Run "specvibe help ${commandName}" for available options.`,
      );
    }

    if (definition.type === 'boolean') {
      flags[definition.name] = inline === undefined ? true : parseBoolean(inline, name);
      index += 1;
      continue;
    }

    let raw = inline;
    if (raw === undefined) {
      raw = args[index + 1];
      if (raw === undefined) {
        throw usageError(`Option ${name} requires a value.`);
      }
      index += 1;
    }
    if (definition.type === 'number') {
      if (!/^-?\d+$/.test(raw)) {
        throw usageError(`Option ${name} expects an integer, received "${raw}".`);
      }
      flags[definition.name] = Number(raw);
    } else {
      flags[definition.name] = raw;
    }
    index += 1;
  }

  return { positionals, flags };
}
