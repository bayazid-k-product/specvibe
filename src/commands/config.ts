import { emit } from '../cli/output.js';
import type { CommandContext } from '../cli/types.js';
import { getConfigValue, loadConfig, setConfigValue } from '../core/config.js';
import { usageError } from '../core/errors.js';
import { projectPaths } from '../core/paths.js';

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function runConfig(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const action = (context.positionals[0] ?? 'list').toLowerCase();

  if (action === 'list') {
    const config = await loadConfig(root);
    emit(context, 'config', { action: 'list', config }, () => {
      logger.title('SpecVibe configuration');
      logger.write(JSON.stringify(config, null, 2));
      logger.write('');
      logger.dim(`File: ${projectPaths(root).config}`);
      logger.dim('Update with: specvibe config set <key> <value>');
    });
    return {};
  }

  if (action === 'get') {
    const key = context.positionals[1];
    if (!key) {
      throw usageError('A config key is required.', 'Example: specvibe config get maxFileLines');
    }
    const config = await loadConfig(root);
    const value = getConfigValue(config, key);
    emit(context, 'config', { action: 'get', key, value }, () => {
      logger.write(`${key} = ${displayValue(value)}`);
    });
    return {};
  }

  if (action === 'set') {
    const key = context.positionals[1];
    const rawValue = context.positionals.slice(2).join(' ').trim();
    if (!key) {
      throw usageError(
        'A config key is required.',
        'Example: specvibe config set pack.maxTokens 30000',
      );
    }
    if (!rawValue) {
      throw usageError(`A value is required for "${key}".`);
    }
    const result = await setConfigValue(root, key, rawValue);
    emit(
      context,
      'config',
      { action: 'set', key, value: result.value, config: result.config },
      () => {
        logger.success(`${key} = ${displayValue(result.value)}`);
        if (key === 'agents') {
          logger.warn(
            'Agent config changed. Run "specvibe agents sync" to update generated files.',
          );
        }
        logger.dim(`Saved ${projectPaths(root).config}`);
      },
    );
    return {};
  }

  throw usageError(
    `Unknown config action "${action}".`,
    'Use list, get <key>, or set <key> <value>.',
  );
}
