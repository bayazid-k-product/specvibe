import path from 'node:path';
import process from 'node:process';
import { emit } from '../cli/output.js';
import { type CommandContext, flagBoolean, flagNumber, flagString } from '../cli/types.js';
import { loadConfig } from '../core/config.js';
import { usageError } from '../core/errors.js';
import { packContext } from '../core/packer.js';
import { loadState } from '../core/state.js';
import { listTracks } from '../core/track.js';

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export async function runPack(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const config = await loadConfig(root);
  const explicitTrack = context.positionals[0];
  let track = explicitTrack;

  if (!track) {
    const state = await loadState(root);
    if (state.activeTrack) {
      const tracks = await listTracks(root);
      if (tracks.some((entry) => entry.slug === state.activeTrack)) {
        track = state.activeTrack;
      }
    }
  }

  const maxTokens = flagNumber(context.flags, 'max-tokens');
  if (maxTokens !== undefined && maxTokens < 1000) {
    throw usageError('--max-tokens must be at least 1000.');
  }

  const result = await packContext({
    root,
    config,
    track,
    maxTokens,
    out: flagString(context.flags, 'out'),
  });
  const stdout = flagBoolean(context.flags, 'stdout');
  const packPath = relative(root, result.path);
  const payload = {
    track: result.track,
    path: packPath,
    estimatedTokens: result.estimatedTokens,
    budgetTokens: result.budgetTokens,
    included: result.included,
    omitted: result.omitted,
    truncated: result.truncated,
    ...(stdout ? { markdown: result.markdown } : {}),
  };
  const nextSteps = [
    'Attach the pack to a new agent session, or paste it when the agent cannot read files.',
    'Continue with the track workflow; do not let the pack replace the approved spec.',
  ];

  if (stdout && !context.json) {
    process.stdout.write(result.markdown.endsWith('\n') ? result.markdown : `${result.markdown}\n`);
    return {};
  }

  emit(context, 'pack', { ...payload, nextSteps }, () => {
    logger.title('Context pack');
    logger.keyValue('Track', result.track ?? 'project context (no active track)');
    logger.keyValue('Output', packPath);
    logger.keyValue(
      'Budget',
      `${result.estimatedTokens.toLocaleString()} / ${result.budgetTokens.toLocaleString()} estimated tokens`,
    );
    logger.keyValue('Included files', String(result.included.length));
    logger.keyValue('Omitted files', String(result.omitted.length));
    logger.keyValue('Truncated', result.truncated ? 'yes' : 'no');

    if (result.included.length) {
      logger.write('');
      logger.heading('Included:');
      for (const file of result.included) {
        const suffix = file.truncated ? ' (truncated)' : '';
        logger.write(
          `  ${file.path} — ${file.lines} lines, ~${file.estimatedTokens} tokens${suffix}`,
        );
      }
    }
    if (result.omitted.length) {
      logger.write('');
      logger.warn('Omitted due to budget limits:');
      for (const file of result.omitted) logger.write(`  ${file}`);
      logger.dim('Increase --max-tokens or narrow the task if these files are essential.');
    }
    logger.write('');
    logger.write(`Pack written to ${logger.accent(packPath)}.`);
    logger.dim(
      'Attach it to a new session or paste it when the agent cannot read the repository directly.',
    );
  });

  return {};
}
