import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runAgents } from '../commands/agents.js';
import { runApply } from '../commands/apply.js';
import { runApprove } from '../commands/approve.js';
import { runConfig } from '../commands/config.js';
import { runDoctor } from '../commands/doctor.js';
import { runInit } from '../commands/init.js';
import { runPack } from '../commands/pack.js';
import { runPropose } from '../commands/propose.js';
import { runRevert } from '../commands/revert.js';
import { runScan } from '../commands/scan.js';
import { runSetup } from '../commands/setup.js';
import { runStatus } from '../commands/status.js';
import { runUnify } from '../commands/unify.js';
import { isSpecVibeError, SpecVibeError, usageError } from '../core/errors.js';
import { createLogger, type Logger } from '../core/logger.js';
import { requireProjectRoot } from '../core/paths.js';
import { closestMatch } from '../core/utils.js';
import type { ChecklistItem, ValidationIssue } from '../types.js';
import { VERSION } from '../version.js';
import { parseFlags, splitLeadingGlobals } from './args.js';
import { printCommandHelp, printGeneralHelp } from './help.js';
import { formatChecklistItem, formatIssues } from './output.js';
import { COMMAND_NAMES, COMMAND_SPECS, findCommandSpec, GLOBAL_FLAGS } from './specs.js';
import {
  type CommandContext,
  type CommandResult,
  type CommandRunner,
  flagBoolean,
  flagString,
} from './types.js';

const RUNNERS: Record<string, CommandRunner> = {
  init: runInit,
  setup: runSetup,
  scan: runScan,
  propose: runPropose,
  approve: runApprove,
  apply: runApply,
  unify: runUnify,
  pack: runPack,
  status: runStatus,
  revert: runRevert,
  agents: runAgents,
  doctor: runDoctor,
  config: runConfig,
};

const NO_PROJECT_ROOT = new Set(['init', 'setup', 'doctor']);

async function resolveCwd(raw?: string): Promise<string> {
  const target = path.resolve(process.cwd(), raw ?? '.');
  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) {
      throw usageError(`--cwd is not a directory: ${target}`);
    }
  } catch (error) {
    if (isSpecVibeError(error)) throw error;
    throw usageError(`Directory does not exist: ${target}`);
  }
  return target;
}

function errorPayload(command: string | undefined, error: unknown): Record<string, unknown> {
  if (isSpecVibeError(error)) {
    return {
      ok: false,
      command,
      error: {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      },
    };
  }
  return {
    ok: false,
    command,
    error: {
      code: 'INTERNAL',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function printHumanError(error: unknown, logger: Logger, debug: boolean): void {
  if (isSpecVibeError(error)) {
    logger.error(error.message);
    if (error.hint) process.stderr.write(`  hint: ${error.hint}\n`);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Unexpected error: ${message}`);
  if (debug && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    process.stderr.write(
      '  hint: Re-run with --debug for a stack trace, and report the issue at https://github.com/specvibe/specvibe/issues\n',
    );
  }
}

function printErrorDetails(error: SpecVibeError, logger: Logger): void {
  const details = error.details;
  if (!details) return;
  const issues = Array.isArray(details.issues) ? (details.issues as ValidationIssue[]) : [];
  if (issues.length) {
    for (const line of formatIssues(issues)) {
      logger.write(`  - ${line}`);
    }
    return;
  }
  const incomplete = Array.isArray(details.incompleteTasks)
    ? (details.incompleteTasks as ChecklistItem[])
    : [];
  const acceptance = Array.isArray(details.uncheckedAcceptance)
    ? (details.uncheckedAcceptance as ChecklistItem[])
    : [];
  if (incomplete.length) {
    logger.write('  Incomplete checklist items:');
    for (const item of incomplete) {
      logger.write(`  - [ ] ${formatChecklistItem(item)}`);
    }
  }
  if (acceptance.length) {
    logger.write('  Unverified acceptance criteria:');
    for (const item of acceptance) {
      logger.write(`  - [ ] ${formatChecklistItem(item)}`);
    }
  }
}

export async function runCli(argv: string[]): Promise<number> {
  let jsonMode = argv.some((token) => token === '--json' || token === '--json=true');
  let debug = argv.some((token) => token === '--debug' || token === '--debug=true');
  let currentCommand: string | undefined;
  let logger = createLogger({ quiet: jsonMode });

  try {
    const split = splitLeadingGlobals(argv);
    const globalParsed = parseFlags(split.leading, GLOBAL_FLAGS);
    const leadingFlags = globalParsed.flags;
    const globalJson = flagBoolean(leadingFlags, 'json');
    const globalQuiet = flagBoolean(leadingFlags, 'quiet');
    const globalNoColor = flagBoolean(leadingFlags, 'no-color');
    logger = createLogger({
      quiet: globalJson || globalQuiet,
      color: globalNoColor ? false : undefined,
    });

    if (flagBoolean(leadingFlags, 'version')) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }

    if (!split.command) {
      if (split.rest.length) {
        parseFlags(split.rest, GLOBAL_FLAGS);
      }
      printGeneralHelp(logger);
      return 0;
    }

    currentCommand = split.command;
    const spec = findCommandSpec(split.command);
    if (!spec) {
      const suggestion = closestMatch(split.command, COMMAND_NAMES);
      throw usageError(
        `Unknown command "${split.command}".`,
        suggestion
          ? `Did you mean "specvibe ${suggestion}"? Run "specvibe help" for all commands.`
          : 'Run "specvibe help" for all commands.',
      );
    }
    currentCommand = spec.name;

    const parsed = parseFlags(split.rest, [...spec.flags, ...GLOBAL_FLAGS], spec.name);
    const flags = { ...leadingFlags, ...parsed.flags };
    jsonMode = flagBoolean(flags, 'json');
    debug = flagBoolean(flags, 'debug');
    const quiet = flagBoolean(flags, 'quiet');
    logger = createLogger({
      quiet: jsonMode || quiet,
      color: flagBoolean(flags, 'no-color') ? false : undefined,
    });

    if (flagBoolean(flags, 'help')) {
      printCommandHelp(logger, spec);
      return 0;
    }
    if (flagBoolean(flags, 'version')) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (spec.name === 'help') {
      const target = parsed.positionals[0];
      if (!target) {
        printGeneralHelp(logger);
        return 0;
      }
      const targetSpec = findCommandSpec(target);
      if (!targetSpec) {
        const suggestion = closestMatch(target, COMMAND_NAMES);
        throw usageError(
          `Unknown command "${target}".`,
          suggestion ? `Did you mean "specvibe help ${suggestion}"?` : 'Run "specvibe help".',
        );
      }
      printCommandHelp(logger, targetSpec);
      return 0;
    }
    if (spec.name === 'version') {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }

    const cwd = await resolveCwd(flagString(flags, 'cwd'));
    const root = NO_PROJECT_ROOT.has(spec.name) ? cwd : await requireProjectRoot(cwd);
    const runner = RUNNERS[spec.name];
    if (!runner) {
      throw new SpecVibeError('INTERNAL', `No runner is registered for "${spec.name}".`);
    }

    const context: CommandContext = {
      command: spec.name,
      cwd,
      root,
      flags,
      positionals: parsed.positionals,
      json: jsonMode,
      quiet,
      debug,
      logger,
    };
    const result: CommandResult | undefined = await runner(context);
    return result?.exitCode ?? 0;
  } catch (error) {
    if (jsonMode) {
      process.stderr.write(`${JSON.stringify(errorPayload(currentCommand, error), null, 2)}\n`);
    } else {
      printHumanError(error, logger, debug);
      if (isSpecVibeError(error)) printErrorDetails(error, logger);
    }
    if (isSpecVibeError(error)) return error.exitCode;
    return 1;
  }
}

export { COMMAND_SPECS, GLOBAL_FLAGS };
