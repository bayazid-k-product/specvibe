import { emit, formatChecklistItem, suggestTrackAction } from '../cli/output.js';
import { type CommandContext, flagBoolean, flagString } from '../cli/types.js';
import { loadConfig } from '../core/config.js';
import { SpecVibeError, usageError } from '../core/errors.js';
import { createCheckpointRef, getHead, isGitRepo, isWorkingTreeClean } from '../core/git.js';
import { appendHistory, setActiveTrack } from '../core/state.js';
import {
  checkpointTrack,
  getTrackProgressFromDisk,
  resolveTrack,
  toggleAcceptance,
  toggleTask,
} from '../core/track.js';
import { nowIso } from '../core/utils.js';
import type { TrackCheckpoint, TrackMeta, TrackProgress } from '../types.js';

function shortCommit(commit: string): string {
  return commit === 'no-git' ? 'none' : commit.slice(0, 7);
}

/**
 * A track started with --allow-no-git has no checkpoint, so it must not claim
 * one was created.
 */
function renderStart(context: CommandContext, meta: TrackMeta): void {
  if (meta.checkpoint?.commit === 'no-git') {
    context.logger.success(
      'Track is now applying without a git checkpoint; revert will be unavailable.',
    );
    return;
  }
  context.logger.success('Checkpoint created; track is now applying.');
}

async function ensureApplying(
  context: CommandContext,
  meta: TrackMeta,
): Promise<{ meta: TrackMeta; started: boolean }> {
  const { root } = context;
  if (meta.status === 'applying') return { meta, started: false };
  if (meta.status !== 'approved') {
    throw new SpecVibeError(
      'INVALID_STATE',
      `Track "${meta.slug}" is ${meta.status}; it cannot be applied.`,
      {
        hint:
          meta.status === 'proposed'
            ? `Finish the plan and ask a human to approve it: specvibe approve ${meta.slug}`
            : 'Only approved tracks can be applied.',
      },
    );
  }

  const config = await loadConfig(root);
  const allowDirty = flagBoolean(context.flags, 'allow-dirty');
  const allowNoGit = flagBoolean(context.flags, 'allow-no-git');
  let checkpoint: TrackCheckpoint;

  const repo = await isGitRepo(root);
  if (!repo) {
    if (!allowNoGit) {
      throw new SpecVibeError(
        'GIT_REQUIRED',
        'Applying a track requires a git repository so changes can be checkpointed.',
        {
          hint: 'Initialize git and commit the project, or pass --allow-no-git to accept that revert will be unavailable.',
        },
      );
    }
    checkpoint = { commit: 'no-git', createdAt: nowIso(), dirtyAtCheckpoint: true };
  } else {
    const clean = await isWorkingTreeClean(root);
    if (config.git.requireCleanForApply && !clean && !allowDirty) {
      throw new SpecVibeError(
        'GIT_DIRTY',
        'The working tree has uncommitted implementation changes; SpecVibe will not start a track from a dirty state.',
        {
          hint: 'Commit or stash your changes first (SpecVibe bookkeeping under .specvibe/ is exempt). If you accept the risk, re-run with --allow-dirty.',
        },
      );
    }

    let head: string | undefined;
    try {
      head = await getHead(root);
    } catch (error) {
      if (!allowNoGit) {
        throw new SpecVibeError(
          'GIT_ERROR',
          'The git repository has no commits yet, so no checkpoint can be created.',
          {
            hint: 'Make an initial commit, or pass --allow-no-git to apply without a checkpoint.',
            cause: error,
          },
        );
      }
    }

    if (!head) {
      checkpoint = { commit: 'no-git', createdAt: nowIso(), dirtyAtCheckpoint: true };
    } else {
      const ref = config.git.autoCheckpoint
        ? await createCheckpointRef(root, meta.slug, head)
        : undefined;
      checkpoint = {
        commit: head,
        ref,
        createdAt: nowIso(),
        dirtyAtCheckpoint: !clean,
      };
    }
  }

  const next = await checkpointTrack(root, meta.slug, checkpoint);
  await appendHistory(root, {
    event: 'checkpoint',
    track: meta.slug,
    detail: checkpoint.commit === 'no-git' ? 'no-git' : shortCommit(checkpoint.commit),
  });
  return { meta: next, started: true };
}

function renderProgress(context: CommandContext, meta: TrackMeta, progress: TrackProgress): void {
  const { logger } = context;
  logger.keyValue('Status', meta.status);
  logger.keyValue('Progress', logger.progress(progress.completed, progress.total));
  logger.keyValue(
    'Items',
    `${progress.completed}/${progress.total} done · ${progress.tasks.length} tasks · ${progress.gates.length} gates · ${progress.acceptance.filter((item) => item.checked).length}/${progress.acceptance.length} AC`,
  );
  if (meta.checkpoint) {
    logger.keyValue(
      'Checkpoint',
      `${shortCommit(meta.checkpoint.commit)}${meta.checkpoint.ref ? ` (${meta.checkpoint.ref})` : ''}`,
    );
  }
}

function renderNext(context: CommandContext, meta: TrackMeta, progress: TrackProgress): void {
  const { logger } = context;
  if (progress.next) {
    const item = progress.next;
    logger.write('');
    logger.heading('Next:');
    logger.write(`  ${formatChecklistItem(item)}`);
    if (item.kind === 'gate') {
      logger.write('');
      logger.warn(
        `Gate ${item.id} requires evidence. After running the check, mark it with --done ${item.id} --confirm-gate.`,
      );
    } else {
      logger.write(
        `  Complete it, then run: specvibe apply ${meta.slug} --done ${item.id ?? '<ID>'}`,
      );
    }
    return;
  }

  const uncheckedAcceptance = progress.acceptance.filter((item) => !item.checked);
  if (uncheckedAcceptance.length) {
    logger.write('');
    logger.heading('Implementation items complete. Acceptance criteria remaining:');
    for (const item of uncheckedAcceptance) {
      logger.write(`  ${item.id ?? '•'} — ${item.text}`);
    }
    logger.write('');
    logger.write(
      `  Verify each one, then run: specvibe apply ${meta.slug} --accept ${uncheckedAcceptance[0]?.id ?? 'AC-1'}`,
    );
    return;
  }

  logger.write('');
  logger.success('All tasks and acceptance criteria are complete.');
  logger.write(`Next: specvibe unify ${meta.slug}`);
}

export async function runApply(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const query = context.positionals[0];
  const doneId = flagString(context.flags, 'done');
  const acceptId = flagString(context.flags, 'accept');
  const nextOnly = flagBoolean(context.flags, 'next');
  const confirmGate = flagBoolean(context.flags, 'confirm-gate');
  const force = flagBoolean(context.flags, 'force');

  const actionCount = [Boolean(doneId), Boolean(acceptId), nextOnly].filter(Boolean).length;
  if (actionCount > 1) {
    throw usageError('Use only one action at a time: --next, --done <ID>, or --accept <AC-ID>.');
  }
  if (confirmGate && !doneId) {
    throw usageError('--confirm-gate can only be used together with --done <gate-id>.');
  }

  const resolved = await resolveTrack(root, query);
  let meta = resolved.meta;
  await setActiveTrack(root, meta.slug);

  if (meta.status === 'proposed') {
    throw new SpecVibeError('INVALID_STATE', `Track "${meta.slug}" is still proposed.`, {
      hint: `Fill the plan, validate with "specvibe approve ${meta.slug} --check", then approve it.`,
    });
  }

  if (nextOnly) {
    const progress = await getTrackProgressFromDisk(root, meta.slug);
    emit(
      context,
      'apply',
      {
        track: meta,
        action: 'next',
        started: false,
        progress,
        next: progress.next,
        nextSteps: meta.status === 'approved' ? [`specvibe apply ${meta.slug}`] : [],
      },
      () => {
        logger.title(`Track "${meta.slug}"`);
        renderProgress(context, meta, progress);
        if (meta.status === 'approved') {
          logger.write('');
          logger.dim(
            'This track has not started yet. Run without --next to create a checkpoint and begin.',
          );
        }
        renderNext(context, meta, progress);
      },
    );
    return {};
  }

  let started = false;
  if (meta.status === 'approved') {
    const startedResult = await ensureApplying(context, meta);
    meta = startedResult.meta;
    started = true;
  }

  if (doneId) {
    const result = await toggleTask(root, meta.slug, doneId, {
      force,
      confirmGate,
    });
    const progress = result.progress;
    const nextSteps: string[] = [];
    if (result.next?.kind === 'gate') {
      nextSteps.push(
        `Run the gate command, then: specvibe apply ${meta.slug} --done ${result.next.id} --confirm-gate`,
      );
    } else if (result.next) {
      nextSteps.push(`Continue: specvibe apply ${meta.slug} --done ${result.next.id}`);
    } else if (progress.acceptance.some((item) => !item.checked)) {
      nextSteps.push(`Verify acceptance criteria: specvibe apply ${meta.slug} --accept AC-N`);
    } else {
      nextSteps.push(`Finish: specvibe unify ${meta.slug}`);
    }

    emit(
      context,
      'apply',
      {
        track: meta,
        action: 'done',
        started,
        item: result.item,
        progress,
        next: result.next,
        nextSteps,
      },
      () => {
        logger.title(`Track "${meta.slug}"`);
        if (started) renderStart(context, meta);
        logger.success(`Completed ${result.item.id ?? 'item'}: ${result.item.text}`);
        logger.write('');
        renderProgress(context, meta, progress);
        renderNext(context, meta, progress);
      },
    );
    return {};
  }

  if (acceptId) {
    const result = await toggleAcceptance(root, meta.slug, acceptId);
    const progress = result.progress;
    const unchecked = progress.acceptance.filter((item) => !item.checked);
    const nextSteps = unchecked.length
      ? [
          `Verify another criterion: specvibe apply ${meta.slug} --accept ${unchecked[0]?.id ?? 'AC-N'}`,
        ]
      : [`Finish: specvibe unify ${meta.slug}`];

    emit(
      context,
      'apply',
      {
        track: meta,
        action: 'accept',
        started,
        item: result.item,
        progress,
        next: progress.next,
        nextSteps,
      },
      () => {
        logger.title(`Track "${meta.slug}"`);
        if (started) renderStart(context, meta);
        logger.success(`Verified ${result.item.id ?? 'acceptance criterion'}: ${result.item.text}`);
        logger.write('');
        renderProgress(context, meta, progress);
        if (unchecked.length) {
          logger.write('');
          logger.heading('Unchecked acceptance criteria:');
          for (const item of unchecked) logger.write(`  ${item.id ?? '•'} — ${item.text}`);
          logger.write('');
          logger.write(`Next: specvibe unify ${meta.slug} after all criteria are verified.`);
        } else {
          logger.write('');
          logger.success('Every acceptance criterion is verified.');
          logger.write(`Next: specvibe unify ${meta.slug}`);
        }
      },
    );
    return {};
  }

  const progress = await getTrackProgressFromDisk(root, meta.slug);
  const action = suggestTrackAction(meta.status, progress);
  emit(
    context,
    'apply',
    {
      track: meta,
      action: 'start',
      started,
      progress,
      next: progress.next,
      nextSteps: action ? [action] : [],
    },
    () => {
      logger.title(`Track "${meta.slug}"`);
      if (started) {
        renderStart(context, meta);
        if (meta.checkpoint?.commit !== 'no-git' && meta.checkpoint?.dirtyAtCheckpoint) {
          logger.warn(
            'The working tree was dirty when this track started. Revert will not restore those pre-existing uncommitted changes.',
          );
        }
      }
      renderProgress(context, meta, progress);
      renderNext(context, meta, progress);
    },
  );

  return {};
}
