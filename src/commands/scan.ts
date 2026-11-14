import path from 'node:path';
import { emit } from '../cli/output.js';
import { type CommandContext, flagString } from '../cli/types.js';
import { loadConfig } from '../core/config.js';
import { projectPaths } from '../core/paths.js';
import { detectProject } from '../core/project.js';
import { ensureScan } from '../core/scanner.js';

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export async function runScan(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const config = await loadConfig(root);
  const project = await detectProject(root);
  const focus = flagString(context.flags, 'focus')?.trim() || undefined;
  const result = await ensureScan(root, config, focus, project);

  emit(
    context,
    'scan',
    {
      scan: result,
      files: {
        summary: relative(root, projectPaths(root).summary),
        index: relative(root, projectPaths(root).scanJson),
      },
    },
    () => {
      logger.title('SpecVibe scan');
      logger.keyValue('Project', result.project.name);
      logger.keyValue('Stack', result.project.stack.join(', ') || 'Unknown');
      logger.keyValue(
        'Files',
        `${result.stats.files} scanned, ${result.stats.sourceFiles} source, ${result.stats.totalLines} lines`,
      );
      if (focus) logger.keyValue('Focus', focus);
      logger.keyValue(
        'Languages',
        result.stats.languages
          .slice(0, 6)
          .map((language) => `${language.language} (${language.files})`)
          .join(', ') || 'none',
      );
      logger.keyValue('Size violations', String(result.bloatedFiles.length));
      logger.keyValue('Long functions', String(result.longFunctions.length));
      logger.keyValue('Possible orphans', String(result.orphans.length));
      logger.write('');

      if (result.bloatedFiles.length) {
        logger.heading('Largest files over the limit:');
        for (const file of result.bloatedFiles.slice(0, 5)) {
          logger.write(`  ${logger.yellow(file.path)} — ${file.lines} lines`);
        }
        logger.write('');
      }
      if (result.focus?.length) {
        logger.heading('Focused matches:');
        for (const file of result.focus.slice(0, 8)) {
          logger.write(`  ${file.path} — score ${file.score}`);
        }
        logger.write('');
      }
      for (const warning of result.warnings) logger.warn(warning);

      logger.heading('Artifacts:');
      logger.write(`  ${logger.accent(relative(root, projectPaths(root).summary))}`);
      logger.write(`  ${logger.accent(relative(root, projectPaths(root).scanJson))}`);
      logger.write('');
      logger.dim('Orphans and unused exports are heuristics. Confirm before deleting anything.');
      logger.write('Next: specvibe propose "<feature>"');
    },
  );

  return {};
}
