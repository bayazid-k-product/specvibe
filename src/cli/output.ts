import process from 'node:process';
import type { ChecklistItem, TrackProgress, ValidationIssue } from '../types.js';
import type { CommandContext } from './types.js';

export function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

/**
 * Print JSON payload in --json mode, otherwise render the human view.
 */
export function emit(
  context: CommandContext,
  command: string,
  payload: Record<string, unknown>,
  human: () => void,
): void {
  if (context.json) {
    printJson({ ok: true, command, ...payload });
    return;
  }
  human();
}

export function formatChecklistItem(item: ChecklistItem): string {
  return item.id ? `${item.id} — ${item.text}` : item.text;
}

export function formatProgress(progress: TrackProgress): {
  completed: number;
  total: number;
  percent: number;
  summary: string;
} {
  return {
    completed: progress.completed,
    total: progress.total,
    percent: progress.percent,
    summary: `${progress.completed}/${progress.total} items (${progress.percent}%)`,
  };
}

export function formatIssues(issues: ValidationIssue[]): string[] {
  return issues.map((issue) => {
    const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : '';
    return `${issue.severity}: ${issue.message}${location}`;
  });
}

export function printIssues(context: CommandContext, issues: ValidationIssue[]): void {
  for (const line of formatIssues(issues)) {
    context.logger.write(`  - ${line}`);
  }
}

export function statusColor(context: CommandContext, status: string): string {
  if (status === 'unified') return context.logger.green(status);
  if (status === 'reverted') return context.logger.red(status);
  if (status === 'applying') return context.logger.accent(status);
  if (status === 'approved') return context.logger.green(status);
  return context.logger.yellow(status);
}

export function suggestTrackAction(status: string, progress: TrackProgress | null): string | null {
  if (status === 'proposed')
    return 'Review and fill the track documents, then run "specvibe approve <track> --check".';
  if (status === 'approved') return 'Start implementation with "specvibe apply <track>".';
  if (status === 'applying' && progress) {
    if (progress.allTasks.some((item) => !item.checked)) {
      return 'Continue with "specvibe apply <track> --next".';
    }
    if (progress.acceptance.some((item) => !item.checked)) {
      return 'Verify acceptance criteria with "specvibe apply <track> --accept AC-N".';
    }
    return 'Finish with "specvibe unify <track>".';
  }
  if (status === 'unified') return 'Archived. Start a new track with "specvibe propose".';
  if (status === 'reverted') return 'Reverted. Start a new track when ready.';
  return null;
}
