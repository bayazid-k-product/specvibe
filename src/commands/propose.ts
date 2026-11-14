import path from 'node:path';
import { emit } from '../cli/output.js';
import { type CommandContext, flagBoolean, flagString } from '../cli/types.js';
import { loadConfig } from '../core/config.js';
import { usageError } from '../core/errors.js';
import { projectPaths, trackFiles } from '../core/paths.js';
import { detectProject } from '../core/project.js';
import { ensureScan, loadScanResult } from '../core/scanner.js';
import { normalizeTrackTitle, slugify, validateSlug } from '../core/slug.js';
import { setActiveTrack } from '../core/state.js';
import { createTrack } from '../core/track.js';
import type { ScanResult } from '../types.js';
import { projectCommands } from './init.js';

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export async function runPropose(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const title = normalizeTrackTitle(context.positionals.join(' '));
  if (!title) {
    throw usageError(
      'A feature description is required.',
      'Example: specvibe propose "Add CSV export to the reports page"',
    );
  }
  if (title.length > 300) {
    throw usageError(
      'The feature description is too long.',
      'Keep it under 300 characters and put details in proposal.md.',
    );
  }

  const slugRaw = flagString(context.flags, 'slug')?.trim();
  const slug = slugRaw ? validateSlug(slugRaw) : slugify(title);
  const focus = flagString(context.flags, 'focus')?.trim() || title;
  const config = await loadConfig(root);
  const project = await detectProject(root);

  let scan: ScanResult | null = null;
  if (flagBoolean(context.flags, 'no-scan')) {
    scan = await loadScanResult(root);
    if (!scan) {
      throw usageError(
        'No existing scan is available for --no-scan.',
        'Run "specvibe scan" first, or omit --no-scan.',
      );
    }
  } else {
    scan = await ensureScan(root, config, focus, project);
  }

  const meta = await createTrack({
    root,
    title,
    slug,
    config,
    scan,
    projectName: project.name,
    stack: project.stack,
    commands: projectCommands(project),
  });
  await setActiveTrack(root, meta.slug);

  const files = trackFiles(root, meta.slug);
  const documents = [
    relative(root, files.proposal),
    relative(root, files.spec),
    relative(root, files.design),
    relative(root, files.tasks),
  ];
  const nextSteps = [
    `Fill every [NEEDS CLARIFICATION] marker in ${documents.join(', ')}`,
    `Validate the plan: specvibe approve ${meta.slug} --check`,
    `Ask the user to approve, then run: specvibe approve ${meta.slug}`,
    `Start implementation: specvibe apply ${meta.slug}`,
  ];

  emit(
    context,
    'propose',
    {
      track: meta,
      path: relative(root, files.dir),
      documents,
      relevantFiles: meta.relevantFiles ?? [],
      nextSteps,
      approvalRequired: true,
    },
    () => {
      logger.title(`Created track "${meta.slug}"`);
      logger.keyValue('Title', meta.title);
      logger.keyValue('Status', 'proposed — no implementation yet');
      logger.keyValue('Folder', relative(root, files.dir));
      logger.keyValue('Relevant files', String(meta.relevantFiles?.length ?? 0));
      logger.write('');
      logger.heading('Documents:');
      for (const document of documents) logger.write(`  ${logger.accent(document)}`);
      logger.write('');
      logger.heading('Next steps:');
      logger.write(
        '  1. Fill in every [NEEDS CLARIFICATION] marker. Cite existing code in design.md.',
      );
      logger.write(`  2. Validate: specvibe approve ${meta.slug} --check`);
      logger.write(`  3. Human approves: specvibe approve ${meta.slug}`);
      logger.write(`  4. Implement: specvibe apply ${meta.slug}`);
      logger.write('');
      logger.warn('Do not write implementation code until the track is approved.');
      logger.dim(
        `Active track is now "${meta.slug}". Context root: ${relative(root, projectPaths(root).dir)}`,
      );
    },
  );

  return {};
}
