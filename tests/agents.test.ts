import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/commands/init.js';
import {
  AGENT_DEFINITIONS,
  detectAgents,
  listAgents,
  MANAGED_END,
  MANAGED_START,
  parseAgentList,
  removeAgents,
  syncAgents,
} from '../src/core/agents.js';
import { loadConfig } from '../src/core/config.js';
import { pathExists, readText, writeText } from '../src/core/fs.js';
import { AGENT_IDS } from '../src/types.js';
import { cleanup, makeProject, testContext } from './helpers.js';

let root: string;

beforeEach(async () => {
  root = await makeProject();
  await initializeProject(testContext(root), {
    agents: ['generic'],
    agentsSpecified: true,
    scan: false,
    writeAgents: false,
    force: false,
    repair: false,
  });
});

afterEach(async () => {
  await cleanup(root);
});

describe('syncAgents', () => {
  it('writes AGENTS.md with a managed block for the generic agent', async () => {
    const result = await syncAgents(root, ['generic']);
    expect(result.agents).toEqual(['generic']);
    const content = await readText(`${root}/AGENTS.md`);
    expect(content.startsWith(MANAGED_START)).toBe(true);
    expect(content.trimEnd().endsWith(MANAGED_END)).toBe(true);
    expect(content).toContain('SpecVibe');
    expect((await loadConfig(root)).agents).toEqual(['generic']);
  });

  it('writes native command files for every supported integration', async () => {
    const result = await syncAgents(root, [
      'opencode',
      'claude',
      'cursor',
      'gemini',
      'windsurf',
      'copilot',
    ]);
    expect(result.warnings).toEqual([]);

    const expectations: Array<[string, string]> = [
      ['AGENTS.md', MANAGED_START],
      ['CLAUDE.md', MANAGED_START],
      ['GEMINI.md', MANAGED_START],
      ['.github/copilot-instructions.md', MANAGED_START],
      ['.cursor/rules/specvibe.mdc', 'alwaysApply: true'],
      ['.cursorrules', MANAGED_START],
      ['.opencode/commands/sv/propose.md', 'description:'],
      ['.claude/commands/sv/apply.md', 'description:'],
      ['.gemini/commands/sv/unify.toml', 'prompt ='],
      ['.cursor/skills/sv-status/SKILL.md', 'name: sv-status'],
      ['.windsurf/workflows/sv-pack.md', 'specvibe:generated'],
      ['.github/prompts/sv-revert.prompt.md', "agent: 'agent'"],
    ];
    for (const [relative, marker] of expectations) {
      expect(await pathExists(`${root}/${relative}`), relative).toBe(true);
      expect(await readText(`${root}/${relative}`)).toContain(marker);
    }

    const propose = await readText(`${root}/.opencode/commands/sv/propose.md`);
    expect(propose).toContain('$ARGUMENTS');
    expect(propose).not.toContain('{{SV_ARGS}}');

    const gemini = await readText(`${root}/.gemini/commands/sv/propose.toml`);
    expect(gemini).toContain('description = ');
    expect(gemini).toContain('prompt = ');
    expect(gemini).toContain('{{args}}');

    const nodir = await pathExists(`${root}/.opencode/commands/sv/nonexistent.md`);
    expect(nodir).toBe(false);
  });

  it('creates all nine commands for markdown-based agents', async () => {
    await syncAgents(root, ['opencode', 'claude', 'cursor', 'windsurf', 'copilot']);
    for (const relative of [
      '.opencode/commands/sv/setup.md',
      '.opencode/commands/sv/scan.md',
      '.opencode/commands/sv/propose.md',
      '.opencode/commands/sv/plan.md',
      '.opencode/commands/sv/apply.md',
      '.opencode/commands/sv/unify.md',
      '.opencode/commands/sv/pack.md',
      '.opencode/commands/sv/status.md',
      '.opencode/commands/sv/revert.md',
    ]) {
      expect(await pathExists(`${root}/${relative}`), relative).toBe(true);
    }
    const cursorFiles = (
      await import('node:fs/promises').then((fs) => fs.readdir(`${root}/.cursor/skills`))
    ).sort();
    expect(cursorFiles).toHaveLength(9);
  });

  it('preserves user content outside the managed block and updates the block', async () => {
    await syncAgents(root, ['generic']);
    const original = await readText(`${root}/AGENTS.md`);
    const withUserContent = `# Team notes\n\nKeep this line.\n\n${original}\n\nTrailing note.\n`;
    await writeText(`${root}/AGENTS.md`, withUserContent);

    const result = await syncAgents(root, ['generic']);
    const updated = await readText(`${root}/AGENTS.md`);
    expect(updated).toContain('Keep this line.');
    expect(updated).toContain('Trailing note.');
    expect(updated.indexOf('Keep this line.')).toBeLessThan(updated.indexOf(MANAGED_START));
    expect(updated).toContain(MANAGED_END);
    expect(result.files.find((file) => file.path === 'AGENTS.md')?.action).toBe('unchanged');

    const changed = await syncAgents(root, ['generic'], { force: true });
    expect(changed.files.find((file) => file.path === 'AGENTS.md')?.action).not.toBe('created');
  });

  it('appends a managed block to an existing unmanaged AGENTS.md', async () => {
    await writeText(`${root}/AGENTS.md`, '# Existing instructions\n\nUse tabs.\n');
    await syncAgents(root, ['generic']);
    const content = await readText(`${root}/AGENTS.md`);
    expect(content).toContain('# Existing instructions');
    expect(content).toContain('Use tabs.');
    expect(content).toContain(MANAGED_START);
    expect(content.indexOf('Use tabs.')).toBeLessThan(content.indexOf(MANAGED_START));
  });

  it('skips an owned command file that was not generated by SpecVibe', async () => {
    await writeText(`${root}/.opencode/commands/sv/propose.md`, '# My custom proposal flow\n');
    const result = await syncAgents(root, ['opencode']);
    const file = result.files.find((entry) => entry.path === '.opencode/commands/sv/propose.md');
    expect(file?.action).toBe('skipped');
    expect(result.warnings.some((warning) => warning.includes('not generated'))).toBe(true);
    expect(await readText(`${root}/.opencode/commands/sv/propose.md`)).toBe(
      '# My custom proposal flow\n',
    );
  });

  it('replaces an overridden owned file with --force and keeps a backup', async () => {
    await writeText(`${root}/.opencode/commands/sv/propose.md`, '# My custom proposal flow\n');
    const result = await syncAgents(root, ['opencode'], { force: true });
    const file = result.files.find((entry) => entry.path === '.opencode/commands/sv/propose.md');
    expect(file?.action).toBe('updated');
    const content = await readText(`${root}/.opencode/commands/sv/propose.md`);
    expect(content).toContain('specvibe:generated');
    const backups = await import('node:fs/promises').then((fs) =>
      fs.readdir(`${root}/.specvibe/backups`),
    );
    expect(backups.length).toBeGreaterThan(0);
  });

  it('deduplicates agents and stores them in a stable order', async () => {
    const result = await syncAgents(root, ['cursor', 'opencode', 'cursor']);
    expect(result.agents).toEqual(['opencode', 'cursor']);
    expect((await loadConfig(root)).agents).toEqual(['opencode', 'cursor']);
  });
});

describe('removeAgents', () => {
  it('removes generated files and managed blocks for the removed agent', async () => {
    await syncAgents(root, ['opencode', 'claude']);
    expect(await pathExists(`${root}/CLAUDE.md`)).toBe(true);
    expect(await pathExists(`${root}/.claude/commands/sv/propose.md`)).toBe(true);

    const result = await removeAgents(root, ['claude']);
    expect(result.agents).toEqual(['opencode']);
    expect(await pathExists(`${root}/CLAUDE.md`)).toBe(false);
    expect(await pathExists(`${root}/.claude/commands/sv/propose.md`)).toBe(false);
    expect(await pathExists(`${root}/AGENTS.md`)).toBe(true);
    expect(await pathExists(`${root}/.opencode/commands/sv/propose.md`)).toBe(true);
    expect((await loadConfig(root)).agents).toEqual(['opencode']);
  });

  it('keeps user content in a managed file when removing an agent', async () => {
    await syncAgents(root, ['claude']);
    const claude = await readText(`${root}/CLAUDE.md`);
    await writeText(`${root}/CLAUDE.md`, `# My notes\n\n${claude}\n`);
    await removeAgents(root, ['claude']);
    const remaining = await readText(`${root}/CLAUDE.md`);
    expect(remaining).toContain('# My notes');
    expect(remaining).not.toContain(MANAGED_START);
  });

  it('leaves a non-generated owned file untouched and warns', async () => {
    await writeText(`${root}/.opencode/commands/sv/propose.md`, '# Hand-written\n');
    await syncAgents(root, ['generic', 'opencode']);
    const result = await removeAgents(root, ['opencode']);
    expect(result.warnings.some((warning) => warning.includes('not generated'))).toBe(true);
    expect(await readText(`${root}/.opencode/commands/sv/propose.md`)).toBe('# Hand-written\n');
  });
});

describe('detection and metadata', () => {
  it('detects agents from their native markers', async () => {
    expect(await detectAgents(root)).toEqual([]);
    await writeText(`${root}/.opencode/config.json`, '{}');
    await writeText(`${root}/CLAUDE.md`, '# Claude\n');
    expect(await detectAgents(root)).toEqual(['opencode', 'claude']);
  });

  it('lists configured and detected status for every agent', async () => {
    await syncAgents(root, ['cursor']);
    await writeText(`${root}/GEMINI.md`, '# Gemini\n');
    const agents = await listAgents(root);
    expect(agents.map((agent) => agent.id)).toEqual([...AGENT_IDS]);
    expect(agents.find((agent) => agent.id === 'cursor')).toMatchObject({
      configured: true,
      detected: true,
    });
    expect(agents.find((agent) => agent.id === 'gemini')).toMatchObject({
      configured: false,
      detected: true,
    });
    for (const agent of agents) {
      expect(agent.files.length).toBeGreaterThan(0);
      expect(agent.name).toBe(AGENT_DEFINITIONS[agent.id].name);
    }
  });
});

describe('parseAgentList', () => {
  it('parses, lowercases, trims, and deduplicates agent lists', () => {
    expect(parseAgentList(' OpenCode, claude ,opencode')).toEqual(['opencode', 'claude']);
    expect(parseAgentList(['cursor', 'cursor'])).toEqual(['cursor']);
  });

  it('supports all and none', () => {
    expect(parseAgentList('all')).toEqual([...AGENT_IDS]);
    expect(parseAgentList('none')).toEqual([]);
    expect(parseAgentList('off')).toEqual([]);
    expect(parseAgentList(undefined)).toEqual([]);
  });

  it('rejects unknown agents with a helpful hint', () => {
    try {
      parseAgentList('opencode,not-an-agent');
      throw new Error('expected parseAgentList to throw');
    } catch (error) {
      expect((error as { hint?: string }).hint).toContain('Supported agents');
    }
  });
});
