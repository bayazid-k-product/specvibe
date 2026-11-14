import { emit } from '../cli/output.js';
import { type CommandContext, flagBoolean } from '../cli/types.js';
import {
  detectAgents,
  listAgents,
  parseAgentList,
  removeAgents,
  sortAgents,
  syncAgents,
} from '../core/agents.js';
import { loadConfig } from '../core/config.js';
import { usageError } from '../core/errors.js';
import type { AgentListEntry, AgentSyncResult } from '../types.js';

function renderAgentTable(context: CommandContext, entries: AgentListEntry[]): void {
  const header = ['Agent', 'Configured', 'Detected', 'Description'];
  const rows = entries.map((entry) => [
    entry.id,
    entry.configured ? 'yes' : '-',
    entry.detected ? 'yes' : '-',
    entry.description,
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const line = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ');
  context.logger.write(line(header));
  for (const row of rows) context.logger.write(line(row));
}

function renderSyncResult(context: CommandContext, result: AgentSyncResult): void {
  const { logger } = context;
  logger.keyValue('Configured', result.agents.length ? result.agents.join(', ') : 'none');
  logger.keyValue('Detected', result.detected.length ? result.detected.join(', ') : 'none');
  if (result.files.length) {
    logger.write('');
    logger.heading('Files:');
    for (const file of result.files) {
      const label = file.action.padEnd(8);
      const marker =
        file.action === 'created'
          ? logger.green(label)
          : file.action === 'updated'
            ? logger.accent(label)
            : file.action === 'removed'
              ? logger.red(label)
              : logger.yellow(label);
      logger.write(`  ${marker} ${file.path}${file.note ? ` — ${file.note}` : ''}`);
    }
  }
  for (const warning of result.warnings) logger.warn(warning);
}

export async function runAgents(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const action = (context.positionals[0] ?? 'list').toLowerCase();
  const force = flagBoolean(context.flags, 'force');

  if (action === 'list') {
    const entries = await listAgents(root);
    emit(context, 'agents', { action: 'list', agents: entries }, () => {
      logger.title('Agent integrations');
      renderAgentTable(context, entries);
      logger.write('');
      logger.dim('Add with: specvibe agents add <comma-list>');
      logger.dim(
        'Supported: opencode, claude, cursor, gemini, windsurf, copilot, generic (or all/none).',
      );
    });
    return {};
  }

  if (action === 'detect') {
    const detected = await detectAgents(root);
    const entries = (await listAgents(root)).filter((entry) => detected.includes(entry.id));
    emit(context, 'agents', { action: 'detect', detected, agents: entries }, () => {
      logger.title('Detected agent integrations');
      if (!entries.length) {
        logger.write('No agent markers were detected in this repository.');
        logger.dim(
          'Markers include .opencode/, .claude/, .cursor/, GEMINI.md, .windsurf/, and .github/prompts/.',
        );
      } else {
        renderAgentTable(context, entries);
      }
    });
    return {};
  }

  if (action === 'sync') {
    const config = await loadConfig(root);
    if (!config.agents.length) {
      throw usageError(
        'No agents are configured.',
        'Run "specvibe agents add <list>" first (or use "all").',
      );
    }
    const result = await syncAgents(root, config.agents, { force });
    emit(context, 'agents', { action: 'sync', result }, () => {
      logger.title('Agent files synced');
      renderSyncResult(context, result);
    });
    return {};
  }

  if (action === 'add') {
    const raw = context.positionals.slice(1);
    if (!raw.length) {
      throw usageError(
        'Specify one or more agents to add.',
        'Example: specvibe agents add cursor,copilot (or "all").',
      );
    }
    const parsed = parseAgentList(raw);
    if (!parsed.length) {
      throw usageError(
        'No agents were selected.',
        'Pass one or more agent names, "all", or "none".',
      );
    }
    const config = await loadConfig(root);
    const next = sortAgents([...config.agents, ...parsed]);
    const result = await syncAgents(root, next, { force });
    emit(context, 'agents', { action: 'add', added: parsed, result }, () => {
      logger.title('Agent integrations updated');
      logger.keyValue('Added', parsed.join(', '));
      renderSyncResult(context, result);
      logger.write('');
      logger.dim('Restart your agent session so it picks up new instruction and command files.');
    });
    return {};
  }

  if (action === 'remove') {
    const raw = context.positionals.slice(1);
    if (!raw.length) {
      throw usageError(
        'Specify one or more agents to remove.',
        'Example: specvibe agents remove windsurf (or "all").',
      );
    }
    const parsed = parseAgentList(raw);
    if (!parsed.length) {
      throw usageError(
        'No agents were selected.',
        'Pass one or more configured agent names, or "all".',
      );
    }
    const result = await removeAgents(root, parsed, { force });
    emit(context, 'agents', { action: 'remove', removed: parsed, result }, () => {
      logger.title('Agent integrations updated');
      logger.keyValue('Removed', parsed.join(', '));
      renderSyncResult(context, result);
      logger.dim(
        'User-authored files outside managed blocks and files not generated by SpecVibe are left untouched.',
      );
    });
    return {};
  }

  throw usageError(`Unknown agents action "${action}".`, 'Use list, detect, sync, add, or remove.');
}
