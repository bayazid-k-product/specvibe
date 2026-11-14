import path from 'node:path';
import type {
  AgentId,
  AgentListEntry,
  AgentSyncFile,
  AgentSyncResult,
  SpecVibeConfig,
} from '../types.js';
import { AGENT_IDS } from '../types.js';
import { loadConfig, saveConfig } from './config.js';
import { SpecVibeError } from './errors.js';
import { backupFile, pathExists, readText, removeFile, writeText } from './fs.js';
import { detectProject } from './project.js';
import { renderTemplate } from './templates.js';
import { compactStamp } from './utils.js';

export const MANAGED_START = '<!-- specvibe:start -->';
export const MANAGED_END = '<!-- specvibe:end -->';
export const GENERATED_MARKER =
  '<!-- specvibe:generated file: run `specvibe agents sync` to refresh -->';

const MANAGED_REGEX = /<!-- specvibe:start -->[\s\S]*?<!-- specvibe:end -->/;

export const COMMAND_NAMES = [
  'setup',
  'scan',
  'propose',
  'plan',
  'apply',
  'unify',
  'pack',
  'status',
  'revert',
] as const;

export type AgentCommandName = (typeof COMMAND_NAMES)[number];

interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  detectPaths: string[];
  files: string[];
}

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    description: 'AGENTS.md rules plus native OpenCode slash commands.',
    detectPaths: ['.opencode', 'opencode.json', 'opencode.jsonc'],
    files: ['AGENTS.md', '.opencode/commands/sv/*.md'],
  },
  claude: {
    id: 'claude',
    name: 'Claude Code',
    description: 'CLAUDE.md rules plus namespaced /sv: commands.',
    detectPaths: ['.claude', 'CLAUDE.md'],
    files: ['AGENTS.md', 'CLAUDE.md', '.claude/commands/sv/*.md'],
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    description: 'Always-on Cursor rule, compatibility .cursorrules, and /sv-* skills.',
    detectPaths: ['.cursor', '.cursorrules'],
    files: [
      'AGENTS.md',
      '.cursor/rules/specvibe.mdc',
      '.cursorrules',
      '.cursor/skills/sv-*/SKILL.md',
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'GEMINI.md rules plus namespaced /sv: TOML commands.',
    detectPaths: ['.gemini', 'GEMINI.md'],
    files: ['AGENTS.md', 'GEMINI.md', '.gemini/commands/sv/*.toml'],
  },
  windsurf: {
    id: 'windsurf',
    name: 'Windsurf / Devin Desktop',
    description: 'Workspace rules and /sv-* workflows.',
    detectPaths: ['.windsurf', '.windsurfrules', '.devin'],
    files: [
      'AGENTS.md',
      '.windsurf/rules/specvibe.md',
      '.windsurf/workflows/sv-*.md',
      '.devin/rules/specvibe.md (when detected)',
      '.devin/workflows/sv-*.md (when detected)',
    ],
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'Repository instructions plus reusable /sv-* prompt files.',
    detectPaths: ['.github/copilot-instructions.md', '.github/prompts', '.github/instructions'],
    files: ['AGENTS.md', '.github/copilot-instructions.md', '.github/prompts/sv-*.prompt.md'],
  },
  generic: {
    id: 'generic',
    name: 'Generic AGENTS.md',
    description: 'Universal instructions understood by most coding agents.',
    detectPaths: ['AGENTS.md'],
    files: ['AGENTS.md'],
  },
};

interface AgentContext {
  root: string;
  config: SpecVibeConfig;
  projectName: string;
  modernWindsurf: boolean;
}

interface PlannedFile {
  path: string;
  content: string;
  kind: 'managed' | 'owned';
  agent: AgentId;
}

function wrapManaged(content: string): string {
  return `${MANAGED_START}
<!-- Managed by SpecVibe. Edit .specvibe/constitution.md and .specvibe/context.md; run \`specvibe agents sync\` after upgrades. -->
${content.trim()}
${MANAGED_END}`;
}

function wrapOwnedRules(frontmatter: string, content: string): string {
  return `${frontmatter.trim()}
${GENERATED_MARKER}

${content.trim()}
`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function commandDescription(name: AgentCommandName): string {
  switch (name) {
    case 'setup':
      return 'Set up or refine the SpecVibe constitution and project context';
    case 'scan':
      return 'Scan this repository and report existing code, bloat, and reuse opportunities';
    case 'propose':
      return 'Plan a feature with SpecVibe: scan, specify, and stop for approval';
    case 'plan':
      return 'Alias for the SpecVibe propose command';
    case 'apply':
      return 'Execute an approved SpecVibe track one task at a time';
    case 'unify':
      return 'Verify acceptance criteria, archive the track, and record decisions';
    case 'pack':
      return 'Build a token-efficient context pack for a SpecVibe track';
    case 'status':
      return 'Show SpecVibe track progress, gates, and next action';
    case 'revert':
      return 'Safely roll back a SpecVibe track using its git checkpoint';
  }
}

async function commandBody(name: AgentCommandName, ctx: AgentContext): Promise<string> {
  const template = name === 'plan' ? 'commands/propose.md' : `commands/${name}.md`;
  const rendered = await renderTemplate(template, {
    PROJECT_NAME: ctx.projectName,
    MAX_FILE_LINES: ctx.config.maxFileLines,
    MAX_FUNCTION_LINES: ctx.config.maxFunctionLines,
    DEFAULT_PACK_TOKENS: ctx.config.pack.maxTokens,
  });
  return rendered.trim();
}

function argReplacement(agent: AgentId): string {
  if (agent === 'opencode' || agent === 'claude') return '$ARGUMENTS';
  if (agent === 'gemini') return '{{args}}';
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Copilot input placeholder, not interpolation.
  if (agent === 'copilot') return '${input:feature:Describe the feature you want to plan}';
  return "the feature description in the user's message (if it was omitted, ask for it before continuing)";
}

function wrapMarkdownCommand(
  agent: AgentId,
  name: AgentCommandName,
  body: string,
  args: string,
): string {
  const bodyWithArgs = body.replace(/\{\{SV_ARGS\}\}/g, args);
  if (agent === 'claude') {
    const hint =
      name === 'propose' || name === 'plan' ? '\nargument-hint: "<feature description>"' : '';
    return `---
description: ${yamlString(commandDescription(name))}${hint}
---
${GENERATED_MARKER}

${bodyWithArgs}
`;
  }
  if (agent === 'opencode') {
    return `---
description: ${yamlString(commandDescription(name))}
---
${GENERATED_MARKER}

${bodyWithArgs}
`;
  }
  if (agent === 'copilot') {
    return `---
agent: 'agent'
description: ${yamlString(commandDescription(name))}
---
${GENERATED_MARKER}

${bodyWithArgs}
`;
  }
  if (agent === 'cursor') {
    return `---
name: sv-${name}
description: ${yamlString(commandDescription(name))}
---
${GENERATED_MARKER}

${bodyWithArgs}
`;
  }
  if (agent === 'windsurf') {
    return `${GENERATED_MARKER}

${bodyWithArgs}
`;
  }
  return bodyWithArgs;
}

function wrapGeminiCommand(name: AgentCommandName, body: string, args: string): string {
  const withArgs = body.replace(/\{\{SV_ARGS\}\}/g, args);
  const safeBody = withArgs.replace(/'''/g, "'' ‘");
  return `description = ${JSON.stringify(commandDescription(name))}
prompt = '''
${safeBody.trim()}
'''
`;
}

async function agentCommandPlans(agent: AgentId, ctx: AgentContext): Promise<PlannedFile[]> {
  if (agent === 'generic') return [];
  const files: PlannedFile[] = [];
  const windsurfBase = ctx.modernWindsurf ? '.devin' : '.windsurf';
  for (const name of COMMAND_NAMES) {
    const body = await commandBody(name, ctx);
    if (agent === 'gemini') {
      files.push({
        path: `.gemini/commands/sv/${name}.toml`,
        content: wrapGeminiCommand(name, body, '{{args}}'),
        kind: 'owned',
        agent,
      });
      continue;
    }
    const content = wrapMarkdownCommand(agent, name, body, argReplacement(agent));
    const target =
      agent === 'opencode'
        ? `.opencode/commands/sv/${name}.md`
        : agent === 'claude'
          ? `.claude/commands/sv/${name}.md`
          : agent === 'cursor'
            ? `.cursor/skills/sv-${name}/SKILL.md`
            : agent === 'copilot'
              ? `.github/prompts/sv-${name}.prompt.md`
              : `${windsurfBase}/workflows/sv-${name}.md`;
    files.push({ path: target, content, kind: 'owned', agent });
  }
  return files;
}

async function buildPlans(ctx: AgentContext, agents: AgentId[]): Promise<PlannedFile[]> {
  const rules = await renderTemplate('agents/rules.md', {
    PROJECT_NAME: ctx.projectName,
    MAX_FILE_LINES: ctx.config.maxFileLines,
    MAX_FUNCTION_LINES: ctx.config.maxFunctionLines,
  });
  const plans: PlannedFile[] = [];

  // AGENTS.md is a universal baseline for every configured agent.
  if (agents.length > 0) {
    plans.push({
      path: 'AGENTS.md',
      content: wrapManaged(rules),
      kind: 'managed',
      agent: 'generic',
    });
  }

  for (const agent of agents) {
    if (agent === 'claude') {
      plans.push({ path: 'CLAUDE.md', content: wrapManaged(rules), kind: 'managed', agent });
    }
    if (agent === 'gemini') {
      plans.push({ path: 'GEMINI.md', content: wrapManaged(rules), kind: 'managed', agent });
    }
    if (agent === 'copilot') {
      plans.push({
        path: '.github/copilot-instructions.md',
        content: wrapManaged(rules),
        kind: 'managed',
        agent,
      });
    }
    if (agent === 'cursor') {
      plans.push({
        path: '.cursor/rules/specvibe.mdc',
        content: wrapOwnedRules(
          `---
description: ${yamlString('SpecVibe: spec-driven plan, apply, unify workflow')}
alwaysApply: true
---`,
          rules,
        ),
        kind: 'owned',
        agent,
      });
      const compat = await renderTemplate('agents/cursor-compat.md', {
        MAX_FILE_LINES: ctx.config.maxFileLines,
      });
      plans.push({
        path: '.cursorrules',
        content: wrapManaged(compat),
        kind: 'managed',
        agent,
      });
    }
    if (agent === 'windsurf') {
      const base = ctx.modernWindsurf ? '.devin' : '.windsurf';
      plans.push({
        path: `${base}/rules/specvibe.md`,
        content: wrapOwnedRules(
          `---
trigger: always_on
description: ${yamlString('SpecVibe: spec-driven plan, apply, unify workflow')}
---`,
          rules,
        ),
        kind: 'owned',
        agent,
      });
    }
    plans.push(...(await agentCommandPlans(agent, ctx)));
  }

  const byPath = new Map<string, PlannedFile>();
  for (const plan of plans) {
    const existing = byPath.get(plan.path);
    if (existing) {
      // Managed shared files win over a duplicate owned plan.
      if (existing.kind === 'owned' && plan.kind === 'managed') {
        byPath.set(plan.path, plan);
      }
      continue;
    }
    byPath.set(plan.path, plan);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function buildContext(root: string, config: SpecVibeConfig): Promise<AgentContext> {
  const project = await detectProject(root);
  const modernWindsurf = await pathExists(path.join(root, '.devin'));
  return {
    root,
    config,
    projectName: project.name,
    modernWindsurf,
  };
}

async function writeManagedFile(
  root: string,
  plan: PlannedFile,
  force: boolean,
): Promise<AgentSyncFile> {
  const absolute = path.join(root, plan.path);
  if (!(await pathExists(absolute))) {
    await writeText(absolute, `${plan.content}\n`);
    return { path: plan.path, action: 'created', kind: plan.kind, agent: plan.agent };
  }
  const current = await readText(absolute);
  if (MANAGED_REGEX.test(current)) {
    const next = current.replace(MANAGED_REGEX, plan.content);
    if (next === current) {
      return { path: plan.path, action: 'unchanged', kind: plan.kind, agent: plan.agent };
    }
    await writeText(absolute, next);
    return { path: plan.path, action: 'updated', kind: plan.kind, agent: plan.agent };
  }
  if (current.includes(MANAGED_START) || current.includes(MANAGED_END)) {
    return {
      path: plan.path,
      action: 'skipped',
      kind: plan.kind,
      agent: plan.agent,
      note: 'Found an incomplete SpecVibe managed block; fix or remove the markers.',
    };
  }
  if (force) {
    await backupFile(root, absolute, compactStamp());
  }
  const next = `${current.trimEnd()}\n\n${plan.content}\n`;
  await writeText(absolute, next);
  return {
    path: plan.path,
    action: 'updated',
    kind: plan.kind,
    agent: plan.agent,
    note: force ? 'Existing content preserved; managed block appended.' : 'Managed block appended.',
  };
}

async function writeOwnedFile(
  root: string,
  plan: PlannedFile,
  force: boolean,
): Promise<AgentSyncFile> {
  const absolute = path.join(root, plan.path);
  if (!(await pathExists(absolute))) {
    await writeText(absolute, plan.content);
    return { path: plan.path, action: 'created', kind: plan.kind, agent: plan.agent };
  }
  const current = await readText(absolute);
  if (!current.includes('specvibe:generated') && !force) {
    return {
      path: plan.path,
      action: 'skipped',
      kind: plan.kind,
      agent: plan.agent,
      note: 'Existing file was not generated by SpecVibe. Re-run with --force to replace it (a backup is kept).',
    };
  }
  if (current === plan.content) {
    return { path: plan.path, action: 'unchanged', kind: plan.kind, agent: plan.agent };
  }
  if (!current.includes('specvibe:generated')) {
    await backupFile(root, absolute, compactStamp());
  }
  await writeText(absolute, plan.content);
  return { path: plan.path, action: 'updated', kind: plan.kind, agent: plan.agent };
}

export function sortAgents(agents: AgentId[]): AgentId[] {
  return [...new Set(agents)].sort((a, b) => AGENT_IDS.indexOf(a) - AGENT_IDS.indexOf(b));
}

export async function detectAgents(root: string): Promise<AgentId[]> {
  const detected: AgentId[] = [];
  for (const id of AGENT_IDS) {
    const definition = AGENT_DEFINITIONS[id];
    if (definition.detectPaths.length === 0) continue;
    for (const marker of definition.detectPaths) {
      if (await pathExists(path.join(root, marker))) {
        detected.push(id);
        break;
      }
    }
  }
  return sortAgents(detected);
}

export async function syncAgents(
  root: string,
  agents: AgentId[],
  options: { force?: boolean } = {},
): Promise<AgentSyncResult> {
  const config = await loadConfig(root);
  const normalized = sortAgents(agents);
  const ctx = await buildContext(root, config);
  const plans = await buildPlans(ctx, normalized);
  const files: AgentSyncFile[] = [];
  const warnings: string[] = [];
  for (const plan of plans) {
    const result =
      plan.kind === 'managed'
        ? await writeManagedFile(root, plan, Boolean(options.force))
        : await writeOwnedFile(root, plan, Boolean(options.force));
    files.push(result);
    if (result.action === 'skipped' && result.note) warnings.push(`${result.path}: ${result.note}`);
  }
  config.agents = normalized;
  await saveConfig(root, config);
  return {
    agents: normalized,
    detected: await detectAgents(root),
    files,
    warnings,
  };
}

export async function removeAgents(
  root: string,
  remove: AgentId[],
  options: { force?: boolean } = {},
): Promise<AgentSyncResult> {
  const config = await loadConfig(root);
  const before = config.agents;
  const after = before.filter((agent) => !remove.includes(agent));
  const ctx = await buildContext(root, config);
  const oldPlans = await buildPlans(ctx, before);
  const newPlans = await buildPlans(ctx, after);
  const keep = new Set(newPlans.map((plan) => plan.path));
  const files: AgentSyncFile[] = [];
  const warnings: string[] = [];

  for (const plan of oldPlans) {
    if (keep.has(plan.path)) continue;
    const absolute = path.join(root, plan.path);
    if (!(await pathExists(absolute))) continue;
    if (plan.kind === 'owned') {
      const current = await readText(absolute);
      if (current.includes('specvibe:generated') || options.force) {
        await removeFile(absolute);
        files.push({ path: plan.path, action: 'removed', kind: 'owned', agent: plan.agent });
      } else {
        warnings.push(`${plan.path} was not generated by SpecVibe and was left untouched.`);
      }
      continue;
    }
    const current = await readText(absolute);
    if (!MANAGED_REGEX.test(current)) continue;
    const next = current
      .replace(MANAGED_REGEX, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();
    if (!next.trim()) {
      await removeFile(absolute);
      files.push({ path: plan.path, action: 'removed', kind: 'managed', agent: plan.agent });
    } else {
      await writeText(absolute, `${next}\n`);
      files.push({ path: plan.path, action: 'updated', kind: 'managed', agent: plan.agent });
    }
  }

  config.agents = after;
  await saveConfig(root, config);
  return { agents: after, detected: await detectAgents(root), files, warnings };
}

export function parseAgentList(raw: string | string[] | undefined): AgentId[] {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const tokens = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.includes('all')) return [...AGENT_IDS];
  if (tokens.includes('none') || tokens.includes('off')) return [];
  const invalid = tokens.filter((token) => !AGENT_IDS.includes(token as AgentId));
  if (invalid.length) {
    throw new SpecVibeError('USAGE', `Unknown agent(s): ${invalid.join(', ')}.`, {
      hint: `Supported agents: ${AGENT_IDS.join(', ')} (or "all", "none").`,
    });
  }
  return sortAgents(tokens as AgentId[]);
}

export async function listAgents(root: string): Promise<AgentListEntry[]> {
  const config = await loadConfig(root).catch(() => null);
  const detected = await detectAgents(root);
  return AGENT_IDS.map((id) => {
    const definition = AGENT_DEFINITIONS[id];
    return {
      id,
      name: definition.name,
      description: definition.description,
      detected: detected.includes(id),
      configured: Boolean(config?.agents.includes(id)),
      files: definition.files,
    };
  });
}
