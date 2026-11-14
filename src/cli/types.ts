import type { Logger } from '../core/logger.js';

export type FlagValue = string | number | boolean;

export type ParsedFlags = Record<string, FlagValue | undefined>;

export interface FlagDefinition {
  /** Long name without the leading dashes, for example `max-tokens`. */
  name: string;
  type: 'boolean' | 'string' | 'number';
  /** Exact alias tokens, for example `-q`. */
  aliases?: string[];
  placeholder?: string;
  description: string;
}

export interface CommandSpec {
  name: string;
  aliases?: string[];
  summary: string;
  usage: string;
  flags: FlagDefinition[];
  examples?: string[];
  notes?: string[];
}

export interface CommandContext {
  command: string;
  cwd: string;
  root: string;
  flags: ParsedFlags;
  positionals: string[];
  json: boolean;
  quiet: boolean;
  debug: boolean;
  logger: Logger;
}

export interface CommandResult {
  exitCode?: number;
}

export type CommandRunner = (context: CommandContext) => Promise<CommandResult | undefined>;

export function flagBoolean(flags: ParsedFlags, name: string): boolean {
  return flags[name] === true;
}

export function flagString(flags: ParsedFlags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

export function flagNumber(flags: ParsedFlags, name: string): number | undefined {
  const value = flags[name];
  return typeof value === 'number' ? value : undefined;
}
