import { AGENT_IDS, type AgentId, type SpecVibeConfig } from '../types.js';
import { SpecVibeError } from './errors.js';
import { readJson, writeJson } from './fs.js';
import { projectPaths } from './paths.js';

export const DEFAULT_CONFIG: SpecVibeConfig = {
  version: 1,
  maxFileLines: 400,
  maxFunctionLines: 80,
  agents: ['generic'],
  scan: {
    ignore: [],
    maxFiles: 5000,
    maxFileBytes: 512 * 1024,
    includeTests: true,
  },
  pack: {
    maxTokens: 60_000,
    maxFileTokens: 12_000,
    maxFiles: 24,
  },
  git: {
    requireCleanForApply: true,
    autoCheckpoint: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(
  value: unknown,
  fallback: number,
  label: string,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new SpecVibeError(
      'CONFIG',
      `Invalid config value for ${label}: expected an integer between ${min} and ${max}.`,
      { hint: 'Run `specvibe config set` or edit .specvibe/config.json.' },
    );
  }
  return value;
}

function booleanValue(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new SpecVibeError('CONFIG', `Invalid config value for ${label}: expected true or false.`);
  }
  return value;
}

function agentsValue(value: unknown, fallback: AgentId[]): AgentId[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    throw new SpecVibeError('CONFIG', 'Invalid config value for agents: expected an array.');
  }
  const agents: AgentId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !AGENT_IDS.includes(item as AgentId)) {
      throw new SpecVibeError('CONFIG', `Unknown agent "${String(item)}" in config.`, {
        hint: `Supported agents: ${AGENT_IDS.join(', ')}.`,
      });
    }
    if (!agents.includes(item as AgentId)) agents.push(item as AgentId);
  }
  return agents;
}

/**
 * Merge persisted values over defaults and validate them. Unknown fields are
 * preserved for forward compatibility.
 */
export function normalizeConfig(raw: unknown): SpecVibeConfig {
  if (!isRecord(raw)) {
    if (raw === undefined) return structuredClone(DEFAULT_CONFIG);
    throw new SpecVibeError('CONFIG', 'Config must be a JSON object.');
  }
  const scanRaw = isRecord(raw.scan) ? raw.scan : {};
  const packRaw = isRecord(raw.pack) ? raw.pack : {};
  const gitRaw = isRecord(raw.git) ? raw.git : {};
  const ignore = scanRaw.ignore ?? DEFAULT_CONFIG.scan.ignore;
  if (!Array.isArray(ignore) || ignore.some((entry) => typeof entry !== 'string')) {
    throw new SpecVibeError(
      'CONFIG',
      'Invalid config value for scan.ignore: expected a string array.',
    );
  }
  const config: SpecVibeConfig = {
    ...(raw as object),
    version: 1,
    maxFileLines: numberValue(
      raw.maxFileLines,
      DEFAULT_CONFIG.maxFileLines,
      'maxFileLines',
      50,
      100_000,
    ),
    maxFunctionLines: numberValue(
      raw.maxFunctionLines,
      DEFAULT_CONFIG.maxFunctionLines,
      'maxFunctionLines',
      10,
      10_000,
    ),
    agents: agentsValue(raw.agents, DEFAULT_CONFIG.agents),
    scan: {
      ...(scanRaw as object),
      ignore: [...ignore],
      maxFiles: numberValue(
        scanRaw.maxFiles,
        DEFAULT_CONFIG.scan.maxFiles,
        'scan.maxFiles',
        1,
        100_000,
      ),
      maxFileBytes: numberValue(
        scanRaw.maxFileBytes,
        DEFAULT_CONFIG.scan.maxFileBytes,
        'scan.maxFileBytes',
        1024,
        50 * 1024 * 1024,
      ),
      includeTests: booleanValue(
        scanRaw.includeTests,
        DEFAULT_CONFIG.scan.includeTests,
        'scan.includeTests',
      ),
    },
    pack: {
      ...(packRaw as object),
      maxTokens: numberValue(
        packRaw.maxTokens,
        DEFAULT_CONFIG.pack.maxTokens,
        'pack.maxTokens',
        1000,
        2_000_000,
      ),
      maxFileTokens: numberValue(
        packRaw.maxFileTokens,
        DEFAULT_CONFIG.pack.maxFileTokens,
        'pack.maxFileTokens',
        1000,
        1_000_000,
      ),
      maxFiles: numberValue(
        packRaw.maxFiles,
        DEFAULT_CONFIG.pack.maxFiles,
        'pack.maxFiles',
        1,
        500,
      ),
    },
    git: {
      ...(gitRaw as object),
      requireCleanForApply: booleanValue(
        gitRaw.requireCleanForApply,
        DEFAULT_CONFIG.git.requireCleanForApply,
        'git.requireCleanForApply',
      ),
      autoCheckpoint: booleanValue(
        gitRaw.autoCheckpoint,
        DEFAULT_CONFIG.git.autoCheckpoint,
        'git.autoCheckpoint',
      ),
    },
  };
  return config;
}

export async function loadConfig(root: string): Promise<SpecVibeConfig> {
  const config = await readJson<unknown>(projectPaths(root).config);
  return normalizeConfig(config);
}

export async function saveConfig(root: string, config: SpecVibeConfig): Promise<void> {
  await writeJson(projectPaths(root).config, normalizeConfig(config));
}

export async function writeDefaultConfig(
  root: string,
  overrides: Partial<SpecVibeConfig> = {},
): Promise<SpecVibeConfig> {
  const config = normalizeConfig({ ...structuredClone(DEFAULT_CONFIG), ...overrides });
  await saveConfig(root, config);
  return config;
}

const MUTABLE_KEYS = new Set([
  'maxFileLines',
  'maxFunctionLines',
  'agents',
  'scan.ignore',
  'scan.maxFiles',
  'scan.maxFileBytes',
  'scan.includeTests',
  'pack.maxTokens',
  'pack.maxFileTokens',
  'pack.maxFiles',
  'git.requireCleanForApply',
  'git.autoCheckpoint',
]);

export function getConfigValue(config: SpecVibeConfig, key: string): unknown {
  let value: unknown = config;
  for (const part of key.split('.')) {
    if (!isRecord(value) || !(part in value)) {
      throw new SpecVibeError('USAGE', `Unknown config key "${key}".`);
    }
    value = value[part];
  }
  return value;
}

function parseConfigValue(key: string, raw: string): unknown {
  if (key === 'agents') {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (key === 'scan.ignore') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to comma-separated parsing.
    }
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new SpecVibeError('USAGE', `Value for ${key} is not valid JSON.`);
    }
  }
  return raw;
}

function setNested(target: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!isRecord(next)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1] as string] = value;
}

export async function setConfigValue(
  root: string,
  key: string,
  rawValue: string,
): Promise<{ config: SpecVibeConfig; key: string; value: unknown }> {
  if (!MUTABLE_KEYS.has(key)) {
    throw new SpecVibeError('USAGE', `Config key "${key}" cannot be set via the CLI.`, {
      hint: `Editable keys: ${[...MUTABLE_KEYS].join(', ')}.`,
    });
  }
  const config = await loadConfig(root);
  const value = parseConfigValue(key, rawValue);
  const raw: Record<string, unknown> = JSON.parse(JSON.stringify(config)) as Record<
    string,
    unknown
  >;
  setNested(raw, key, value);
  const next = normalizeConfig(raw);
  await saveConfig(root, next);
  return { config: next, key, value: getConfigValue(next, key) };
}
