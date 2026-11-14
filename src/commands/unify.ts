import path from 'node:path';
import { emit, formatChecklistItem, printIssues } from '../cli/output.js';
import { type CommandContext, flagBoolean } from '../cli/types.js';
import { SpecVibeError } from '../core/errors.js';
import { writeText } from '../core/fs.js';
import { diffNamesSince, isGitRepo, resolveCommit } from '../core/git.js';
import { findSection, stripMarkdown } from '../core/markdown.js';
import { trackFiles } from '../core/paths.js';
import { appendHistory, loadState, setActiveTrack } from '../core/state.js';
import {
  appendDecision,
  archiveTrack,
  extractDecisions,
  getTrackProgress,
  readTrackDocuments,
  resolveTrack,
  updateTrackMeta,
  validateTrackDocuments,
} from '../core/track.js';

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

async function changedFiles(
  root: string,
  checkpoint?: { commit: string; ref?: string },
): Promise<string[]> {
  if (!checkpoint || checkpoint.commit === 'no-git') return [];
  if (!(await isGitRepo(root))) return [];
  const target =
    (checkpoint.ref ? await resolveCommit(root, checkpoint.ref) : null) ??
    (await resolveCommit(root, checkpoint.commit));
  if (!target) return [];
  return diffNamesSince(root, target);
}

function summaryText(proposal: string, fallback: string): string {
  const section = findSection(proposal, 'Summary');
  const text = stripMarkdown(section?.content ?? proposal);
  return text.slice(0, 600) || fallback;
}

export async function runUnify(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const force = flagBoolean(context.flags, 'force');
  const resolved = await resolveTrack(root, context.positionals[0]);
  let meta = resolved.meta;

  if (meta.status !== 'applying') {
    throw new SpecVibeError(
      'INVALID_STATE',
      `Track "${meta.slug}" is ${meta.status}, not applying.`,
      {
        hint:
          meta.status === 'proposed'
            ? `Approve the track before implementation: specvibe approve ${meta.slug} --check`
            : meta.status === 'approved'
              ? `Start the track first: specvibe apply ${meta.slug}`
              : 'Only tracks that have been applied can be unified.',
      },
    );
  }

  const docs = await readTrackDocuments(root, meta.slug);
  const progress = getTrackProgress(docs.spec, docs.tasks);
  const validation = validateTrackDocuments(meta.slug, docs);
  const incomplete = progress.allTasks.filter((item) => !item.checked);
  const uncheckedAcceptance = progress.acceptance.filter((item) => !item.checked);

  if (!force && incomplete.length) {
    throw new SpecVibeError(
      'INVALID_STATE',
      `Track "${meta.slug}" has ${incomplete.length} unchecked task, gate, or completion item(s).`,
      {
        hint: `Continue with "specvibe apply ${meta.slug} --next", or use --force only if the user explicitly accepts an incomplete unification.`,
        details: { incompleteTasks: incomplete, uncheckedAcceptance },
      },
    );
  }
  if (!force && uncheckedAcceptance.length) {
    throw new SpecVibeError(
      'INVALID_STATE',
      `Track "${meta.slug}" has ${uncheckedAcceptance.length} unverified acceptance criterion/criteria.`,
      {
        hint: `Verify them with "specvibe apply ${meta.slug} --accept AC-N", or use --force only with explicit user consent.`,
        details: { uncheckedAcceptance },
      },
    );
  }
  if (!force && !validation.valid) {
    throw new SpecVibeError(
      'VALIDATION_FAILED',
      `Track "${meta.slug}" has ${validation.errors} validation error(s).`,
      {
        hint: 'Fix the track documents, or use --force only with explicit user consent.',
        details: { issues: validation.issues },
      },
    );
  }

  if (force) {
    meta = await updateTrackMeta(root, meta.slug, { forced: true });
  }

  const decisions = await extractDecisions(docs.design);
  const filesChanged = await changedFiles(root, meta.checkpoint);
  const outcome = summaryText(docs.proposal, meta.title);
  const checkedAcceptance = progress.acceptance.filter((item) => item.checked);
  const gateItems = progress.gates;

  const forcedNote = force
    ? `\n> Unified with --force. ${incomplete.length} checklist item(s) and ${uncheckedAcceptance.length} acceptance criterion/criteria were explicitly accepted as incomplete.\n`
    : '';
  const summary = `# Track Summary — ${meta.title}

> Track: \`${meta.slug}\` · Status: unified · Created: ${meta.createdAt} · Unified: ${new Date().toISOString()}
> Checkpoint: ${meta.checkpoint ? `\`${meta.checkpoint.commit.slice(0, 12)}\`` : 'none'}
${forcedNote}
## Outcome

${outcome}

## Completion

- Implementation tasks: ${progress.tasks.filter((item) => item.checked).length}/${progress.tasks.length}
- Verification gates: ${gateItems.filter((item) => item.checked).length}/${gateItems.length}
- Completion checks: ${progress.completion.filter((item) => item.checked).length}/${progress.completion.length}
- Acceptance criteria: ${checkedAcceptance.length}/${progress.acceptance.length}

## Acceptance Criteria

${progress.acceptance.length ? progress.acceptance.map((item) => `- [${item.checked ? 'x' : ' '}] ${formatChecklistItem(item)}`).join('\n') : '_No acceptance criteria recorded._'}

## Verification Gates

${gateItems.length ? gateItems.map((item) => `- [${item.checked ? 'x' : ' '}] ${formatChecklistItem(item)}`).join('\n') : '_No gates recorded._'}

## Decisions

${decisions.length ? decisions.map((decision) => `- ${decision}`).join('\n') : '_No new architectural decisions were recorded._'}

## Files Changed

${
  filesChanged.length
    ? filesChanged
        .slice(0, 150)
        .map((file) => `- \`${file}\``)
        .join('\n')
    : '_No file changes detected against the checkpoint._'
}

## Forced Exceptions

${
  force
    ? [
        ...incomplete.map((item) => `- Incomplete checklist item: ${formatChecklistItem(item)}`),
        ...uncheckedAcceptance.map(
          (item) => `- Unverified acceptance: ${formatChecklistItem(item)}`,
        ),
      ].join('\n') || '_None._'
    : '_None._'
}
`;

  const files = trackFiles(root, meta.slug);
  await writeText(files.summary, summary);

  const archived = await archiveTrack(root, meta.slug, 'unified');
  const archivedSummary = path.join(archived.archivePath, 'summary.md');
  await appendDecision(root, {
    title: meta.title,
    slug: meta.slug,
    status: 'unified',
    summary: outcome,
    decisions,
    archivePath: archived.archivePath,
    forced: force,
  });

  const state = await loadState(root);
  if (!state.activeTrack || state.activeTrack === meta.slug) {
    await setActiveTrack(root, null);
  }
  await appendHistory(root, {
    event: 'unified',
    track: meta.slug,
    detail: relative(root, archived.archivePath),
  });

  const nextSteps = [
    'Review the archived summary and the decision log.',
    'Start the next track with specvibe propose "<feature>".',
  ];

  emit(
    context,
    'unify',
    {
      track: archived.meta,
      archivePath: relative(root, archived.archivePath),
      summaryPath: relative(root, archivedSummary),
      validation,
      progress,
      decisions,
      filesChanged,
      forced: force,
      nextSteps,
    },
    () => {
      logger.title(`Unified "${meta.slug}"`);
      logger.keyValue('Archive', relative(root, archived.archivePath));
      logger.keyValue('Summary', relative(root, archivedSummary));
      logger.keyValue(
        'Acceptance',
        `${checkedAcceptance.length}/${progress.acceptance.length} verified`,
      );
      logger.keyValue(
        'Gates',
        `${gateItems.filter((item) => item.checked).length}/${gateItems.length} confirmed`,
      );
      logger.keyValue('Decisions', String(decisions.length));
      logger.keyValue('Files changed', String(filesChanged.length));
      if (force) {
        logger.warn('Unified with --force. Incomplete items are listed in summary.md.');
      }
      if (!validation.valid) {
        logger.write('');
        logger.warn(`${validation.errors} validation error(s) were accepted via --force:`);
        printIssues(context, validation.issues);
      }
      logger.write('');
      logger.heading('Recorded decisions:');
      if (decisions.length) {
        for (const decision of decisions) logger.write(`  - ${decision}`);
      } else {
        logger.write('  (none)');
      }
      logger.write('');
      logger.write('Next: specvibe propose "<next feature>"');
      logger.dim('A unified track is immutable. Create a new track for follow-up work.');
    },
  );

  return {};
}
