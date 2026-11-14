import { emit, formatIssues, printIssues, printJson, suggestTrackAction } from '../cli/output.js';
import { type CommandContext, flagBoolean } from '../cli/types.js';
import { approveTrack, resolveTrack, validateTrack } from '../core/track.js';

export async function runApprove(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const query = context.positionals[0];
  const resolved = await resolveTrack(root, query);
  const checkOnly = flagBoolean(context.flags, 'check');

  if (checkOnly) {
    const validation = await validateTrack(root, resolved.slug);
    const nextSteps = validation.valid
      ? [
          resolved.meta.status === 'proposed'
            ? `Ask the user to approve, then run: specvibe approve ${resolved.slug}`
            : `Continue with: specvibe apply ${resolved.slug}`,
        ]
      : ['Fix the errors above, then run this check again.'];
    if (context.json) {
      printJson({
        ok: validation.valid,
        command: 'approve',
        check: true,
        track: resolved.meta,
        validation,
        nextSteps,
      });
    } else {
      logger.title(`Validation — ${resolved.meta.title}`);
      logger.keyValue('Track', resolved.slug);
      logger.keyValue('Status', resolved.meta.status);
      logger.keyValue('Errors', String(validation.errors));
      logger.keyValue('Warnings', String(validation.warnings));
      logger.write('');
      if (validation.issues.length) {
        printIssues(context, validation.issues);
        logger.write('');
      } else {
        logger.success('All track documents are valid and ready for approval.');
        logger.write('');
      }
      for (const step of nextSteps) logger.write(`Next: ${step}`);
    }
    return { exitCode: validation.valid ? 0 : 3 };
  }

  const { meta, validation } = await approveTrack(root, resolved.slug, {
    force: flagBoolean(context.flags, 'force'),
  });
  const nextSteps = [
    `Start implementation: specvibe apply ${meta.slug}`,
    'The first apply creates a git checkpoint. Uncommitted source files block it; SpecVibe bookkeeping is exempt.',
  ];

  emit(
    context,
    'approve',
    {
      track: meta,
      validation,
      nextSteps,
    },
    () => {
      logger.title(`Approved "${meta.slug}"`);
      logger.keyValue('Title', meta.title);
      logger.keyValue('Status', meta.status);
      logger.keyValue('Errors', String(validation.errors));
      logger.keyValue('Warnings', String(validation.warnings));
      if (meta.forced) {
        logger.warn(
          'Approved with --force. Validation errors are recorded as an intentional exception.',
        );
      }
      if (validation.issues.length) {
        logger.write('');
        for (const line of formatIssues(validation.issues)) logger.dim(`  - ${line}`);
      }
      logger.write('');
      logger.heading('Next:');
      logger.write(`  specvibe apply ${meta.slug}`);
      logger.dim('  Apply creates a checkpoint before any task can be completed.');
    },
  );

  const action = suggestTrackAction(meta.status, null);
  if (action) context.logger.dim(action);

  return {};
}
