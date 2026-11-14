import path from 'node:path';
import { emit } from '../cli/output.js';
import { type CommandContext, flagBoolean } from '../cli/types.js';
import { SpecVibeError } from '../core/errors.js';
import { ensureDir, pathExists, readText, writeText } from '../core/fs.js';
import {
  commitsSince,
  createBackupBranch,
  diffNamesSince,
  getStatusLines,
  isGitRepo,
  resetHard,
  resolveCommit,
  stashAll,
} from '../core/git.js';
import { trackDir, trackFiles } from '../core/paths.js';
import { appendHistory, loadState, setActiveTrack } from '../core/state.js';
import { appendDecision, archiveTrack, resolveTrack } from '../core/track.js';
import { compactStamp } from '../core/utils.js';

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function shortCommit(commit: string): string {
  return commit === 'no-git' ? 'none' : commit.slice(0, 7);
}

async function snapshotTrack(root: string, slug: string): Promise<Map<string, string>> {
  const files = trackFiles(root, slug);
  const snapshot = new Map<string, string>();
  for (const file of [
    files.proposal,
    files.spec,
    files.design,
    files.tasks,
    files.meta,
    files.summary,
  ]) {
    if (await pathExists(file)) snapshot.set(file, await readText(file));
  }
  return snapshot;
}

async function restoreTrack(snapshot: Map<string, string>, dir: string): Promise<void> {
  await ensureDir(dir);
  for (const [file, content] of snapshot) {
    await writeText(file, content);
  }
}

export async function runRevert(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const confirmed = flagBoolean(context.flags, 'yes');
  const resolved = await resolveTrack(root, context.positionals[0]);
  const meta = resolved.meta;

  if (meta.status !== 'applying') {
    throw new SpecVibeError(
      'INVALID_STATE',
      `Track "${meta.slug}" is ${meta.status}, not applying.`,
      {
        hint: 'Only an applied track with a checkpoint can be reverted.',
      },
    );
  }
  if (!meta.checkpoint || meta.checkpoint.commit === 'no-git') {
    throw new SpecVibeError(
      'INVALID_STATE',
      `Track "${meta.slug}" has no git checkpoint to revert to.`,
      {
        hint: 'This track was started with --allow-no-git or before a checkpoint existed. Revert manually with your own version control.',
      },
    );
  }
  if (!(await isGitRepo(root))) {
    throw new SpecVibeError('GIT_REQUIRED', 'Revert requires a git repository.', {
      hint: 'Restore the repository or use your own backup to undo the changes.',
    });
  }

  const checkpoint = meta.checkpoint;
  const target =
    (checkpoint.ref ? await resolveCommit(root, checkpoint.ref) : null) ??
    (await resolveCommit(root, checkpoint.commit));
  if (!target) {
    throw new SpecVibeError(
      'GIT_ERROR',
      'The checkpoint commit no longer exists in this repository.',
      {
        hint: 'The reflog or a backup branch may still reference it. Inspect with "git reflog".',
      },
    );
  }

  const [commits, statusLines, changedFiles] = await Promise.all([
    commitsSince(root, target),
    getStatusLines(root),
    diffNamesSince(root, target),
  ]);
  const dirty = statusLines.length > 0;

  if (!confirmed) {
    const payload = {
      dryRun: true,
      track: meta,
      checkpoint: {
        commit: checkpoint.commit,
        ref: checkpoint.ref ?? null,
        resolved: target,
      },
      commitsSince: commits,
      dirty,
      changedFiles,
      plan: {
        backupBranch: `specvibe-backup/${meta.slug}-<timestamp> (created at current HEAD)`,
        stash: dirty ? 'dirty and untracked changes will be stashed' : 'nothing to stash',
        resetTo: target,
        archiveAs: 'reverted',
      },
      nextSteps: [`Review this plan, then run: specvibe revert ${meta.slug} --yes`],
    };
    emit(context, 'revert', payload, () => {
      logger.title(`Revert plan — "${meta.slug}"`);
      logger.keyValue(
        'Checkpoint',
        `${shortCommit(target)}${checkpoint.ref ? ` (${checkpoint.ref})` : ''}`,
      );
      logger.keyValue('Commits since', String(commits));
      logger.keyValue('Working tree', dirty ? `dirty (${statusLines.length} entries)` : 'clean');
      logger.keyValue('Files since checkpoint', String(changedFiles.length));
      if (dirty) {
        logger.write('');
        logger.heading('Dirty/untracked entries that will be stashed:');
        for (const line of statusLines.slice(0, 20)) logger.write(`  ${line}`);
      }
      if (changedFiles.length) {
        logger.write('');
        logger.heading('Files changed since the checkpoint:');
        for (const file of changedFiles.slice(0, 30)) logger.write(`  ${file}`);
        if (changedFiles.length > 30) logger.dim(`  ... and ${changedFiles.length - 30} more`);
      }
      if (checkpoint.dirtyAtCheckpoint) {
        logger.write('');
        logger.warn(
          'This track started from a dirty tree. Pre-existing uncommitted changes were not part of the checkpoint and cannot be restored by this revert.',
        );
      }
      logger.write('');
      logger.heading('This will:');
      logger.write('  1. Create a backup branch at the current HEAD.');
      logger.write('  2. Stash dirty and untracked changes (recoverable).');
      logger.write(`  3. Reset the working tree and current branch to ${shortCommit(target)}.`);
      logger.write('  4. Archive the track as reverted and log the recovery details.');
      logger.write('');
      logger.warn('Dry run only. Re-run with --yes after explicit user confirmation.');
    });
    return {};
  }

  const snapshot = await snapshotTrack(root, meta.slug);
  const stamp = compactStamp();
  const backupBranch = await createBackupBranch(root, meta.slug);
  const stash = await stashAll(root, `specvibe: revert ${meta.slug} (${stamp})`);

  try {
    await resetHard(root, target);
  } catch (error) {
    throw new SpecVibeError('GIT_ERROR', 'Git reset failed; the track was not archived.', {
      hint: `${backupBranch ? `Backup branch: ${backupBranch}. ` : ''}${stash ? `Stash: ${stash}. ` : ''}Your changes remain recoverable.`,
      cause: error,
    });
  }

  await restoreTrack(snapshot, trackDir(root, meta.slug));
  const archived = await archiveTrack(root, meta.slug, 'reverted');
  const decisions = [
    `Reverted to checkpoint \`${target}\` (${shortCommit(target)}).`,
    `${commits} commit(s) since the checkpoint were preserved on the current history and a backup branch.`,
    backupBranch ? `Recovery branch: \`${backupBranch}\`.` : 'No backup branch could be created.',
    stash ? `Stashed working changes: \`${stash}\`.` : 'No dirty changes were stashed.',
    `${changedFiles.length} file(s) differed from the checkpoint before the revert.`,
  ];

  await appendDecision(root, {
    title: meta.title,
    slug: meta.slug,
    status: 'reverted',
    summary: `Reverted "${meta.title}" to ${shortCommit(target)}. ${backupBranch ? `Recovery branch: ${backupBranch}.` : ''}`,
    decisions,
    archivePath: archived.archivePath,
  });

  const state = await loadState(root);
  if (!state.activeTrack || state.activeTrack === meta.slug) {
    await setActiveTrack(root, null);
  }
  await appendHistory(root, {
    event: 'reverted',
    track: meta.slug,
    detail: `${shortCommit(target)}${backupBranch ? ` · ${backupBranch}` : ''}`,
  });

  const nextSteps = [
    backupBranch ? `Recover commits: git checkout -b recover-${meta.slug} ${backupBranch}` : null,
    stash ? `Recover uncommitted work: git stash apply ${stash}` : null,
    'Review the archived track and decision log before planning a replacement.',
  ].filter((step): step is string => Boolean(step));

  emit(
    context,
    'revert',
    {
      dryRun: false,
      track: archived.meta,
      archivePath: relative(root, archived.archivePath),
      checkpoint: { commit: checkpoint.commit, ref: checkpoint.ref ?? null, resolved: target },
      commitsSince: commits,
      backupBranch,
      stash,
      changedFiles,
      decisions,
      nextSteps,
    },
    () => {
      logger.title(`Reverted "${meta.slug}"`);
      logger.keyValue('Checkpoint', shortCommit(target));
      logger.keyValue('Archive', relative(root, archived.archivePath));
      logger.keyValue('Backup branch', backupBranch ?? 'none');
      logger.keyValue('Stash', stash ?? 'none (tree was clean)');
      logger.keyValue('Commits preserved', String(commits));
      logger.write('');
      logger.heading('Recovery:');
      if (backupBranch) {
        logger.write(`  git checkout -b recover-${meta.slug} ${backupBranch}`);
      }
      if (stash) {
        logger.write(`  git stash apply ${stash}`);
      }
      if (!backupBranch && !stash)
        logger.write('  Nothing needed; the tree was already at the checkpoint.');
      logger.write('');
      logger.warn(
        'The track is archived as reverted. Its plan remains available for a post-mortem.',
      );
    },
  );

  return {};
}
