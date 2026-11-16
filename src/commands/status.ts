import path from 'node:path';
import { emit, formatChecklistItem, statusColor, suggestTrackAction } from '../cli/output.js';
import type { CommandContext } from '../cli/types.js';
import { detectAgents } from '../core/agents.js';
import { loadConfig } from '../core/config.js';
import { pathExists } from '../core/fs.js';
import { gitInfo } from '../core/git.js';
import { projectPaths } from '../core/paths.js';
import { loadState } from '../core/state.js';
import { getTrackProgressFromDisk, listTracks, resolveTrack } from '../core/track.js';
import { formatRelativeTime, pluralize } from '../core/utils.js';
import type { GitInfo, TrackMeta, TrackProgress } from '../types.js';

interface TrackView {
  meta: TrackMeta;
  progress: TrackProgress;
}

function shortCommit(commit: string | undefined): string {
  if (!commit) return 'none';
  if (commit === 'no-git') return 'none';
  return commit.slice(0, 7);
}

function nextActionFor(track: TrackView | null, hasTracks: boolean): string {
  if (!track) {
    return hasTracks
      ? 'Choose a track with "specvibe status <track>".'
      : 'Plan the first feature: specvibe propose "<feature>"';
  }
  const { meta, progress } = track;
  if (meta.status === 'proposed') {
    return `Fill the plan, then validate: specvibe approve ${meta.slug} --check`;
  }
  if (meta.status === 'approved') {
    return `Start implementation: specvibe apply ${meta.slug}`;
  }
  if (meta.status === 'applying') {
    if (progress.next) {
      if (progress.next.kind === 'gate') {
        return `Run the gate, then: specvibe apply ${meta.slug} --done ${progress.next.id} --confirm-gate`;
      }
      return `Continue: specvibe apply ${meta.slug} --done ${progress.next.id}`;
    }
    const unverified = progress.acceptance.filter((item) => !item.checked);
    if (unverified.length) {
      return `Verify acceptance: specvibe apply ${meta.slug} --accept ${unverified[0]?.id ?? 'AC-1'}`;
    }
    return `Finish the track: specvibe unify ${meta.slug}`;
  }
  return suggestTrackAction(meta.status, progress) ?? 'Start a new track with specvibe propose.';
}

function renderTrackDetail(context: CommandContext, view: TrackView): void {
  const { logger } = context;
  const { meta, progress } = view;
  logger.title(`Track "${meta.slug}" — ${meta.title}`);
  logger.keyValue('Status', statusColor(context, meta.status));
  logger.keyValue('Created', meta.createdAt);
  logger.keyValue('Updated', `${meta.updatedAt} (${formatRelativeTime(meta.updatedAt)})`);
  logger.keyValue('Progress', logger.progress(progress.completed, progress.total));
  logger.keyValue(
    'Tasks',
    `${progress.tasks.filter((item) => item.checked).length}/${progress.tasks.length} complete`,
  );
  logger.keyValue(
    'Gates',
    `${progress.gates.filter((item) => item.checked).length}/${progress.gates.length} confirmed`,
  );
  logger.keyValue(
    'Acceptance',
    `${progress.acceptance.filter((item) => item.checked).length}/${progress.acceptance.length} verified`,
  );
  if (meta.checkpoint) {
    logger.keyValue(
      'Checkpoint',
      `${shortCommit(meta.checkpoint.commit)}${meta.checkpoint.ref ? ` (${meta.checkpoint.ref})` : ''}`,
    );
  }
  if (meta.archivePath) logger.keyValue('Archive', meta.archivePath);
  if (meta.relevantFiles?.length)
    logger.keyValue('Relevant files', String(meta.relevantFiles.length));

  if (meta.status === 'applying') {
    logger.write('');
    logger.heading('Acceptance criteria:');
    if (progress.acceptance.length) {
      for (const item of progress.acceptance) {
        logger.write(
          `  ${item.checked ? logger.green('[x]') : '[ ]'} ${formatChecklistItem(item)}`,
        );
      }
    } else {
      logger.write('  (none recorded)');
    }
    if (progress.gates.length) {
      logger.write('');
      logger.heading('Verification gates:');
      for (const gate of progress.gates) {
        logger.write(
          `  ${gate.checked ? logger.green('[x]') : '[ ]'} ${formatChecklistItem(gate)}`,
        );
      }
    }
  }

  logger.write('');
  logger.heading('Next action:');
  logger.write(`  ${nextActionFor(view, true)}`);
  if (progress.next) {
    logger.write('');
    logger.keyValue('Next item', formatChecklistItem(progress.next));
  }
}

function formatGit(git: GitInfo): string {
  if (!git.available) return 'git is not installed or not on PATH';
  if (!git.isRepo) return 'not a git repository';
  const state = git.clean ? 'clean' : `dirty (${pluralize(git.statusLines ?? 0, 'changed file')})`;
  if (!git.head) return `no commits yet — ${state}`;
  return `${git.branch ?? 'detached HEAD'} at ${shortCommit(git.head)} — ${state}`;
}

export async function runStatus(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const [config, state, git] = await Promise.all([
    loadConfig(root),
    loadState(root),
    gitInfo(root),
  ]);
  const paths = projectPaths(root);
  const summaryExists = await pathExists(paths.summary);
  const detectedAgents = await detectAgents(root);

  if (context.positionals[0]) {
    const resolved = await resolveTrack(root, context.positionals[0]);
    const progress = await getTrackProgressFromDisk(root, resolved.slug);
    const view: TrackView = { meta: resolved.meta, progress };
    const nextAction = nextActionFor(view, true);

    emit(
      context,
      'status',
      {
        track: { ...resolved.meta, progress },
        progress,
        nextAction,
        git,
        agents: { configured: config.agents, detected: detectedAgents },
        scan: { exists: summaryExists, last: state.lastScan ?? null },
      },
      () => {
        renderTrackDetail(context, view);
        logger.write('');
        logger.dim(`Git: ${formatGit(git)}`);
      },
    );
    return {};
  }

  const metas = await listTracks(root);
  const views: TrackView[] = [];
  for (const meta of metas) {
    views.push({ meta, progress: await getTrackProgressFromDisk(root, meta.slug) });
  }
  const active = views.find((view) => view.meta.slug === state.activeTrack) ?? null;
  const focused = active ?? views[0] ?? null;
  const nextAction = nextActionFor(focused, views.length > 0);

  const progressSummary = (view: TrackView) => ({
    completed: view.progress.completed,
    total: view.progress.total,
    percent: view.progress.percent,
    tasks: `${view.progress.tasks.filter((item) => item.checked).length}/${view.progress.tasks.length}`,
    gates: `${view.progress.gates.filter((item) => item.checked).length}/${view.progress.gates.length}`,
    acceptance: `${view.progress.acceptance.filter((item) => item.checked).length}/${view.progress.acceptance.length}`,
    next: view.progress.next,
  });

  emit(
    context,
    'status',
    {
      activeTrack: state.activeTrack,
      tracks: views.map((view) => ({
        slug: view.meta.slug,
        title: view.meta.title,
        status: view.meta.status,
        createdAt: view.meta.createdAt,
        updatedAt: view.meta.updatedAt,
        checkpoint: view.meta.checkpoint ?? null,
        progress: progressSummary(view),
      })),
      selectedTrack: focused?.meta.slug ?? null,
      nextAction,
      git,
      agents: {
        configured: config.agents,
        detected: detectedAgents,
        detectedNotConfigured: detectedAgents.filter((agent) => !config.agents.includes(agent)),
      },
      scan: {
        exists: summaryExists,
        last: state.lastScan ?? null,
      },
      config: {
        maxFileLines: config.maxFileLines,
        maxFunctionLines: config.maxFunctionLines,
        pack: config.pack,
      },
      lastPack: state.lastPack ?? null,
      history: state.history.slice(-5),
    },
    () => {
      logger.title('SpecVibe status');
      logger.keyValue(
        'Active track',
        active ? `${statusColor(context, active.meta.status)} — ${active.meta.title}` : 'none',
      );
      if (focused) {
        logger.keyValue(
          'Progress',
          logger.progress(focused.progress.completed, focused.progress.total),
        );
        if (focused.progress.next) {
          logger.keyValue('Next item', formatChecklistItem(focused.progress.next));
        }
        logger.keyValue(
          'Acceptance',
          `${focused.progress.acceptance.filter((item) => item.checked).length}/${focused.progress.acceptance.length} verified`,
        );
        if (focused.meta.checkpoint) {
          logger.keyValue(
            'Checkpoint',
            `${shortCommit(focused.meta.checkpoint.commit)}${focused.meta.checkpoint.ref ? ` (${focused.meta.checkpoint.ref})` : ''}`,
          );
        }
      }

      logger.write('');
      if (!views.length) {
        logger.write('No tracks yet.');
      } else {
        logger.heading('Tracks:');
        const header = ['', 'Track', 'Status', 'Progress', 'Updated'];
        const rows = views.map((view) => [
          view.meta.slug === state.activeTrack ? '*' : ' ',
          view.meta.slug,
          view.meta.status,
          `${view.progress.percent}%`,
          formatRelativeTime(view.meta.updatedAt),
        ]);
        const widths = header.map((cell, index) =>
          Math.max(cell.length, ...rows.map((row) => row[index]?.length ?? 0)),
        );
        const line = (row: string[]) =>
          `  ${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ')}`;
        logger.write(line(header));
        for (const row of rows) logger.write(line(row));
        logger.dim('  * active track');
      }

      logger.write('');
      logger.heading('Project:');
      logger.keyValue('Git', formatGit(git));
      logger.keyValue(
        'Scan',
        state.lastScan
          ? `${formatRelativeTime(state.lastScan.at)} — ${pluralize(state.lastScan.files, 'file')}`
          : summaryExists
            ? 'summary present, no recorded scan'
            : 'not scanned yet — run specvibe scan',
      );
      logger.keyValue(
        'Agents',
        config.agents.length ? config.agents.join(', ') : 'none configured',
      );
      const notConfigured = detectedAgents.filter((agent) => !config.agents.includes(agent));
      if (notConfigured.length) {
        logger.dim(
          `  Detected but not configured: ${notConfigured.join(', ')} — run specvibe agents add <list>`,
        );
      }
      logger.keyValue('Pack budget', `~${config.pack.maxTokens.toLocaleString()} tokens`);
      logger.keyValue('State file', path.relative(root, paths.state).split(path.sep).join('/'));

      logger.write('');
      logger.heading('Next action:');
      logger.write(`  ${nextAction}`);
    },
  );

  return {};
}

export type { TrackView };
