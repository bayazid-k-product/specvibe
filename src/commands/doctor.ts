import path from 'node:path';
import process from 'node:process';
import { emit } from '../cli/output.js';
import type { CommandContext } from '../cli/types.js';
import { detectAgents } from '../core/agents.js';
import { loadConfig } from '../core/config.js';
import { pathExists } from '../core/fs.js';
import { gitInfo } from '../core/git.js';
import { projectPaths } from '../core/paths.js';
import { detectProject } from '../core/project.js';
import { loadState } from '../core/state.js';
import { loadTemplate } from '../core/templates.js';
import { listTracks } from '../core/track.js';
import { formatRelativeTime } from '../core/utils.js';
import type { SpecVibeState } from '../types.js';
import { VERSION } from '../version.js';

type Level = 'ok' | 'warn' | 'error' | 'info';

interface Check {
  id: string;
  title: string;
  level: Level;
  detail?: string;
}

function atLeast(version: string, major: number, minor: number): boolean {
  const [actualMajor = 0, actualMinor = 0] = version.split('.').map((part) => Number(part));
  return actualMajor > major || (actualMajor === major && actualMinor >= minor);
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export async function runDoctor(context: CommandContext): Promise<{ exitCode?: number }> {
  const { root, logger } = context;
  const checks: Check[] = [];
  const add = (check: Check) => checks.push(check);
  const paths = projectPaths(root);
  const initialized = await pathExists(paths.config);

  const nodeVersion = process.versions.node;
  add({
    id: 'node',
    title: 'Node.js version',
    level: atLeast(nodeVersion, 18, 17) ? 'ok' : 'error',
    detail: `${nodeVersion}${atLeast(nodeVersion, 18, 17) ? '' : ' — SpecVibe requires >=18.17.0'}`,
  });

  add({
    id: 'specvibe',
    title: 'SpecVibe package',
    level: 'ok',
    detail: `v${VERSION} on ${process.platform}/${process.arch}`,
  });

  const git = await gitInfo(root);
  add({
    id: 'git',
    title: 'Git',
    level: !git.available ? 'error' : !git.isRepo ? 'warn' : 'ok',
    detail: !git.available
      ? 'not installed or not on PATH'
      : !git.isRepo
        ? 'git is available but this directory is not a repository'
        : `${git.head ? `${git.branch ?? 'detached HEAD'} at ${git.head.slice(0, 7)}` : 'no commits yet'}${git.clean ? ' (clean)' : ` (${git.statusLines} changed)`}`,
  });

  add({
    id: 'initialized',
    title: 'SpecVibe initialization',
    level: initialized ? 'ok' : 'error',
    detail: initialized
      ? relative(root, paths.dir)
      : 'missing .specvibe/config.json — run specvibe init',
  });

  let config: Awaited<ReturnType<typeof loadConfig>> | null = null;
  if (initialized) {
    try {
      config = await loadConfig(root);
      add({
        id: 'config',
        title: 'Configuration',
        level: 'ok',
        detail: `max ${config.maxFileLines} lines/file, ${config.maxFunctionLines} lines/function, pack ${config.pack.maxTokens} tokens`,
      });
    } catch (error) {
      add({
        id: 'config',
        title: 'Configuration',
        level: 'error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const [id, file] of [
    ['constitution', paths.constitution],
    ['context', paths.context],
    ['decisions', paths.decisions],
  ] as const) {
    if (!initialized) continue;
    const exists = await pathExists(file);
    add({
      id,
      title: `${id}.md`,
      level: exists ? 'ok' : 'warn',
      detail: exists ? relative(root, file) : 'missing — run specvibe setup --force',
    });
  }

  if (initialized) {
    const [summaryExists, scanExists] = await Promise.all([
      pathExists(paths.summary),
      pathExists(paths.scanJson),
    ]);
    let state: SpecVibeState | null = null;
    try {
      state = await loadState(root);
    } catch {
      // Reported by the state check below.
    }
    const lastScan = state?.lastScan;
    add({
      id: 'scan',
      title: 'Codebase scan',
      level: summaryExists && scanExists ? 'ok' : 'warn',
      detail:
        summaryExists && scanExists
          ? lastScan
            ? `${formatRelativeTime(lastScan.at)} — ${lastScan.files} files`
            : 'artifacts present, no recorded scan'
          : 'missing scan artifacts — run specvibe scan',
    });
    if (lastScan) {
      const ageDays = (Date.now() - new Date(lastScan.at).getTime()) / 86_400_000;
      if (ageDays > 30) {
        add({
          id: 'scan-age',
          title: 'Scan freshness',
          level: 'warn',
          detail: `last scan was ${Math.round(ageDays)} days ago; run specvibe scan after structural changes`,
        });
      }
    }

    try {
      const templates = await Promise.all(
        [
          'constitution.md',
          'context.md',
          'tracks/proposal.md',
          'commands/propose.md',
          'agents/rules.md',
        ].map((name) => loadTemplate(name)),
      );
      add({
        id: 'templates',
        title: 'Packaged templates',
        level: templates.every((content) => content.length > 0) ? 'ok' : 'error',
        detail: 'all required templates are readable',
      });
    } catch (error) {
      add({
        id: 'templates',
        title: 'Packaged templates',
        level: 'error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    if (config) {
      const detected = await detectAgents(root);
      add({
        id: 'agents',
        title: 'Agent integrations',
        level: config.agents.length ? 'ok' : 'warn',
        detail: config.agents.length
          ? `${config.agents.join(', ')}${detected.length ? ` · detected: ${detected.join(', ')}` : ''}`
          : 'none configured — run specvibe agents add <list>',
      });
      if (config.agents.length && !(await pathExists(path.join(root, 'AGENTS.md')))) {
        add({
          id: 'agents-file',
          title: 'AGENTS.md baseline',
          level: 'warn',
          detail: 'missing — run specvibe agents sync',
        });
      }
      const notConfigured = detected.filter((agent) => !config.agents.includes(agent));
      if (notConfigured.length) {
        add({
          id: 'agents-detected',
          title: 'Unconfigured agents detected',
          level: 'info',
          detail: `${notConfigured.join(', ')} — run specvibe agents add ${notConfigured.join(',')}`,
        });
      }
    }

    try {
      const tracks = await listTracks(root);
      const applying = tracks.filter((track) => track.status === 'applying');
      add({
        id: 'tracks',
        title: 'Tracks',
        level: applying.length > 1 ? 'warn' : 'ok',
        detail: tracks.length
          ? `${tracks.length} active track folder(s)${applying.length ? `, ${applying.length} applying` : ''}`
          : 'no active tracks',
      });
      const stale = tracks.filter(
        (track) =>
          track.status === 'proposed' &&
          Date.now() - new Date(track.updatedAt).getTime() > 14 * 86_400_000,
      );
      if (stale.length) {
        add({
          id: 'stale-tracks',
          title: 'Stale proposals',
          level: 'warn',
          detail: `${stale.map((track) => track.slug).join(', ')} — proposed more than 14 days ago`,
        });
      }
      const state = await loadState(root).catch(() => null);
      if (state?.activeTrack && !tracks.some((track) => track.slug === state.activeTrack)) {
        add({
          id: 'active-track',
          title: 'Active track',
          level: 'warn',
          detail: `state points at "${state.activeTrack}", which no longer exists; run specvibe setup --force or clear state`,
        });
      }
    } catch (error) {
      add({
        id: 'tracks',
        title: 'Tracks',
        level: 'error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const project = await detectProject(root);
      add({
        id: 'project',
        title: 'Project detection',
        level: 'ok',
        detail: `${project.name} · ${project.stack.join(', ') || 'unknown stack'}`,
      });
      if (!Object.values(project.commands).some(Boolean)) {
        add({
          id: 'commands',
          title: 'Quality commands',
          level: 'warn',
          detail: 'no build/test/lint commands detected; add them to the constitution',
        });
      }
    } catch (error) {
      add({
        id: 'project',
        title: 'Project detection',
        level: 'warn',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const errors = checks.filter((check) => check.level === 'error').length;
  const warnings = checks.filter((check) => check.level === 'warn').length;
  const ok = checks.filter((check) => check.level === 'ok').length;
  const exitCode = errors > 0 ? 1 : 0;

  emit(context, 'doctor', { root, checks, summary: { ok, warnings, errors } }, () => {
    logger.title('SpecVibe doctor');
    for (const check of checks) {
      const label =
        check.level === 'ok'
          ? logger.green('ok')
          : check.level === 'warn'
            ? logger.yellow('warn')
            : check.level === 'error'
              ? logger.red('error')
              : logger.muted('info');
      logger.write(
        `  ${label.padEnd(8)} ${check.title}${check.detail ? ` — ${check.detail}` : ''}`,
      );
    }
    logger.write('');
    if (errors) {
      logger.warn(`${errors} error(s), ${warnings} warning(s), ${ok} check(s) passed.`);
    } else if (warnings) {
      logger.write(`${warnings} warning(s), ${ok} check(s) passed.`);
    } else {
      logger.success(`${ok} check(s) passed. SpecVibe looks healthy.`);
    }
  });

  return { exitCode };
}
