import path from 'node:path';
import { emit } from '../cli/output.js';
import { type CommandContext, flagBoolean, flagString } from '../cli/types.js';
import { detectAgents, parseAgentList, syncAgents } from '../core/agents.js';
import { loadConfig, normalizeConfig, saveConfig, writeDefaultConfig } from '../core/config.js';
import { SpecVibeError } from '../core/errors.js';
import { ensureDir, pathExists, readText, writeText } from '../core/fs.js';
import { projectPaths } from '../core/paths.js';
import { detectProject } from '../core/project.js';
import { ensureScan, loadScanResult } from '../core/scanner.js';
import { appendHistory } from '../core/state.js';
import { renderTemplate } from '../core/templates.js';
import { isFilesystemRoot, isHomeDirectory, today } from '../core/utils.js';
import type {
  AgentId,
  AgentSyncResult,
  CommandInfo,
  ProjectInfo,
  ScanResult,
  SpecVibeConfig,
} from '../types.js';
import { VERSION } from '../version.js';

export interface InitializeOptions {
  agents?: AgentId[];
  agentsSpecified: boolean;
  name?: string;
  description?: string;
  scan: boolean;
  writeAgents: boolean;
  force: boolean;
  repair: boolean;
}

export interface InitializeResult {
  created: boolean;
  root: string;
  config: SpecVibeConfig;
  project: ProjectInfo;
  agents: AgentId[];
  detectedAgents: AgentId[];
  agentResult: AgentSyncResult | null;
  scan: ScanResult | null;
  files: {
    constitution: string;
    context: string;
    decisions: string;
    readme: string;
    summary: string;
    scan: string;
    config: string;
    state: string;
  };
}

function architectureText(project: ProjectInfo): string {
  const areas = project.topLevelDirs.length
    ? project.topLevelDirs.map((directory) => `\`${directory}/\``).join(', ')
    : '_No top-level source directories detected._';
  const entries = project.entryPoints.length
    ? project.entryPoints.map((entry) => `\`${entry}\``).join(', ')
    : '_No entry points detected._';
  return [
    `- Top-level areas: ${areas}`,
    `- Entry points: ${entries}`,
    '- Dependencies point inward toward domain logic; UI and transport layers must not own business rules.',
    '- Add concrete module boundaries here once the architecture is confirmed. Run `/sv:setup` to refine this section.',
  ].join('\n');
}

function qualityGatesText(commands: CommandInfo): string {
  const labels: Array<[keyof CommandInfo, string]> = [
    ['build', 'Build'],
    ['test', 'Test'],
    ['typecheck', 'Typecheck'],
    ['lint', 'Lint'],
    ['format', 'Format'],
  ];
  const lines = labels
    .filter(([key]) => Boolean(commands[key]))
    .map(([key, label]) => `- **${label}:** \`${commands[key]}\``);
  return lines.length
    ? lines.join('\n')
    : '_No quality commands were detected. Add the authoritative build, test, lint, and typecheck commands here before the first apply._';
}

function descriptionText(project: ProjectInfo, fallbackName: string): string {
  if (project.description) return project.description;
  return `_Describe what **${fallbackName}** does and who it serves. Refine this section with \`/sv:setup\`._`;
}

async function ensureGitignore(root: string): Promise<void> {
  const paths = projectPaths(root);
  const required = ['packs/', 'backups/', 'tmp/'];
  const current = await readText(paths.gitignore, '');
  if (!current.trim()) {
    await writeText(
      paths.gitignore,
      `# SpecVibe local-only artifacts. Everything else here is committed.\n${required.join('\n')}\n`,
    );
    return;
  }
  const missing = required.filter((entry) => !current.split(/\r?\n/).includes(entry));
  if (!missing.length) return;
  await writeText(
    paths.gitignore,
    `${current.trimEnd()}\n\n# Added by SpecVibe\n${missing.join('\n')}\n`,
  );
}

async function writeIfMissing(file: string, content: string): Promise<void> {
  if (await pathExists(file)) return;
  await writeText(file, content);
}

function projectCommands(project: ProjectInfo): Record<string, string | undefined> {
  return {
    build: project.commands.build,
    test: project.commands.test,
    lint: project.commands.lint,
    typecheck: project.commands.typecheck,
    format: project.commands.format,
  };
}

export async function initializeProject(
  context: CommandContext,
  options: InitializeOptions,
): Promise<InitializeResult> {
  const root = context.root;
  const paths = projectPaths(root);
  const existing = await pathExists(paths.dir);

  if ((isHomeDirectory(root) || isFilesystemRoot(root)) && !options.force) {
    throw new SpecVibeError(
      'USAGE',
      'Refusing to initialize SpecVibe in your home directory or a filesystem root.',
      {
        hint: 'Run the command from inside a project, pass --cwd <project>, or use --force if this is intentional.',
      },
    );
  }

  if (existing && !options.repair && !options.force) {
    throw new SpecVibeError('ALREADY_INITIALIZED', 'SpecVibe is already initialized here.', {
      hint: 'Run "specvibe setup" to refresh scans/agents, "specvibe scan" to update the code map, or use --force to repair generated files.',
    });
  }

  const detectedProject = await detectProject(root);
  const project: ProjectInfo = {
    ...detectedProject,
    name: options.name?.trim() || detectedProject.name,
    description: options.description?.trim() || detectedProject.description,
  };

  let config: SpecVibeConfig;
  if (existing && (await pathExists(paths.config))) {
    config = await loadConfig(root);
  } else {
    config = normalizeConfig({});
  }

  const detectedAgents = await detectAgents(root);
  let agents: AgentId[];
  if (options.agentsSpecified) {
    agents = options.agents ?? [];
  } else if (existing && config.agents.length) {
    agents = config.agents;
  } else if (detectedAgents.length) {
    agents = detectedAgents;
  } else {
    agents = ['generic'];
  }
  config = { ...config, agents };

  await Promise.all([
    ensureDir(paths.dir),
    ensureDir(paths.tracks),
    ensureDir(paths.archive),
    ensureDir(paths.contextDir),
    ensureDir(paths.packs),
    ensureDir(paths.backups),
  ]);

  if (existing) {
    await saveConfig(root, config);
  } else {
    await writeDefaultConfig(root, { agents });
    config = await loadConfig(root);
  }
  await ensureGitignore(root);

  const variables = {
    PROJECT_NAME: project.name,
    DATE: today(),
    DESCRIPTION: descriptionText(project, project.name),
    STACK: project.stack.join(', ') || 'Unknown',
    FRAMEWORKS: project.frameworks.join(', ') || 'None detected',
    PACKAGE_MANAGER: project.packageManager ?? 'Not detected',
    MANIFESTS: project.manifests.map((entry) => `\`${entry}\``).join(', ') || 'None detected',
    ENTRY_POINTS: project.entryPoints.map((entry) => `\`${entry}\``).join(', ') || 'None detected',
    ARCHITECTURE: architectureText(project),
    QUALITY_GATES: qualityGatesText(project.commands),
    MAX_FILE_LINES: config.maxFileLines,
    MAX_FUNCTION_LINES: config.maxFunctionLines,
    TOP_LEVEL_DIRS:
      project.topLevelDirs.map((directory) => `\`${directory}/\``).join(', ') || 'none',
    AGENTS: agents.length ? agents.join(', ') : 'none',
  };

  await writeIfMissing(paths.constitution, await renderTemplate('constitution.md', variables));
  await writeIfMissing(paths.context, await renderTemplate('context.md', variables));
  await writeIfMissing(paths.decisions, await renderTemplate('decisions.md', {}));
  await writeIfMissing(paths.readme, await renderTemplate('specvibe-readme.md', {}));

  let scan: ScanResult | null = null;
  if (options.scan) {
    scan = await ensureScan(root, config, undefined, project);
  } else {
    scan = await loadScanResult(root);
  }

  let agentResult: AgentSyncResult | null = null;
  if (options.writeAgents) {
    agentResult = await syncAgents(root, agents);
  } else {
    await saveConfig(root, config);
  }

  await appendHistory(root, {
    event: existing ? 'setup' : 'init',
    detail: `${project.name}${agents.length ? ` · agents: ${agents.join(', ')}` : ''}`,
  });

  return {
    created: !existing,
    root,
    config,
    project,
    agents,
    detectedAgents,
    agentResult,
    scan,
    files: {
      constitution: paths.constitution,
      context: paths.context,
      decisions: paths.decisions,
      readme: paths.readme,
      summary: paths.summary,
      scan: paths.scanJson,
      config: paths.config,
      state: paths.state,
    },
  };
}

function toRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export function renderInitialization(
  context: CommandContext,
  result: InitializeResult,
  title: string,
): void {
  const { logger, root } = context;
  logger.title(title);
  logger.keyValue('Project', result.project.name);
  logger.keyValue('Stack', result.project.stack.join(', ') || 'Unknown');
  logger.keyValue('Mode', result.created ? 'new setup' : 'refreshed existing setup');
  logger.keyValue('Version', VERSION);
  if (result.scan) {
    logger.keyValue(
      'Scan',
      `${result.scan.stats.files} files, ${result.scan.stats.sourceFiles} source, ${result.scan.stats.totalLines} lines`,
    );
    if (result.scan.bloatedFiles.length) {
      logger.keyValue('Bloat', `${result.scan.bloatedFiles.length} file(s) over the size limit`);
    }
  } else {
    logger.keyValue('Scan', 'skipped');
  }
  logger.keyValue(
    'Agents',
    result.agents.length ? result.agents.join(', ') : 'none (baseline only)',
  );
  if (result.agentResult) {
    const created = result.agentResult.files.filter((file) => file.action === 'created').length;
    const updated = result.agentResult.files.filter((file) => file.action === 'updated').length;
    const skipped = result.agentResult.files.filter((file) => file.action === 'skipped').length;
    logger.keyValue('Agent files', `${created} created, ${updated} updated, ${skipped} skipped`);
    for (const warning of result.agentResult.warnings) logger.warn(warning);
  }

  logger.write('');
  logger.heading('Generated:');
  for (const file of Object.values(result.files)) {
    logger.write(`  ${logger.accent(toRelative(root, file))}`);
  }
  if (!result.scan) {
    logger.dim('  (no scan artifacts yet — run "specvibe scan")');
  }

  logger.write('');
  logger.heading('Next steps:');
  logger.write('  1. Review .specvibe/constitution.md and .specvibe/context.md.');
  logger.write('  2. Open your agent and run /sv:setup to refine them (optional but recommended).');
  logger.write('  3. Plan the first feature: specvibe propose "<feature>"');
  logger.write('     Agents receive the same workflow through their native /sv commands.');
}

export async function runInit(context: CommandContext): Promise<{ exitCode?: number }> {
  const agentsRaw = flagString(context.flags, 'agents');
  const agentsSpecified = agentsRaw !== undefined;
  const result = await initializeProject(context, {
    agents: agentsSpecified ? parseAgentList(agentsRaw) : undefined,
    agentsSpecified,
    name: flagString(context.flags, 'name'),
    description: flagString(context.flags, 'description'),
    scan: !flagBoolean(context.flags, 'no-scan'),
    writeAgents: !flagBoolean(context.flags, 'no-agents'),
    force: flagBoolean(context.flags, 'force'),
    repair: false,
  });

  emit(
    context,
    'init',
    {
      root: result.root,
      created: result.created,
      version: VERSION,
      project: {
        name: result.project.name,
        description: result.project.description,
        stack: result.project.stack,
        frameworks: result.project.frameworks,
        commands: result.project.commands,
        entryPoints: result.project.entryPoints,
      },
      config: result.config,
      agents: {
        configured: result.agents,
        detected: result.detectedAgents,
        files: result.agentResult?.files ?? [],
        warnings: result.agentResult?.warnings ?? [],
      },
      scan: result.scan
        ? {
            files: result.scan.stats.files,
            sourceFiles: result.scan.stats.sourceFiles,
            totalLines: result.scan.stats.totalLines,
            languages: result.scan.stats.languages,
            bloatedFiles: result.scan.bloatedFiles.length,
            longFunctions: result.scan.longFunctions.length,
            orphans: result.scan.orphans.length,
          }
        : null,
      files: result.files,
      nextSteps: [
        'Review .specvibe/constitution.md and .specvibe/context.md',
        'Run /sv:setup in your agent to refine context',
        'Run specvibe propose "<feature>" to plan the first track',
      ],
    },
    () => renderInitialization(context, result, 'SpecVibe initialized'),
  );

  return {};
}

export { projectCommands };
