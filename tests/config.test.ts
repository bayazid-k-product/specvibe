import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  getConfigValue,
  loadConfig,
  normalizeConfig,
  saveConfig,
  setConfigValue,
  writeDefaultConfig,
} from '../src/core/config.js';
import { isSpecVibeError } from '../src/core/errors.js';
import { cleanup, makeTempDir } from './helpers.js';

let root: string;

beforeEach(async () => {
  root = await makeTempDir('specvibe-config-');
});

afterEach(async () => {
  await cleanup(root);
});

describe('normalizeConfig', () => {
  it('returns defaults for missing or empty input', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('merges partial values over the defaults', () => {
    const config = normalizeConfig({
      maxFileLines: 250,
      agents: ['opencode', 'claude', 'opencode'],
      scan: { includeTests: false, ignore: ['vendor/**'] },
      pack: { maxTokens: 12_000 },
      git: { autoCheckpoint: false },
    });
    expect(config.maxFileLines).toBe(250);
    expect(config.agents).toEqual(['opencode', 'claude']);
    expect(config.scan.includeTests).toBe(false);
    expect(config.scan.ignore).toEqual(['vendor/**']);
    expect(config.scan.maxFiles).toBe(DEFAULT_CONFIG.scan.maxFiles);
    expect(config.pack.maxTokens).toBe(12_000);
    expect(config.pack.maxFileTokens).toBe(DEFAULT_CONFIG.pack.maxFileTokens);
    expect(config.git.autoCheckpoint).toBe(false);
    expect(config.git.requireCleanForApply).toBe(true);
  });

  it('preserves unknown top-level and nested fields for forward compatibility', () => {
    const config = normalizeConfig({
      future: { enabled: true },
      pack: { futureFlag: 3 },
    }) as unknown as Record<string, unknown>;
    expect(config.future).toEqual({ enabled: true });
    expect((config.pack as Record<string, unknown>).futureFlag).toBe(3);
  });

  it('rejects invalid numbers, booleans, ignores, and agents', () => {
    for (const bad of [
      { maxFileLines: 10 },
      { maxFileLines: 'many' },
      { maxFunctionLines: 1.5 },
      { pack: { maxTokens: 10 } },
      { scan: { maxFiles: 0 } },
      { scan: { includeTests: 'yes' } },
      { scan: { ignore: 'dist' } },
      { scan: { ignore: [42] } },
      { agents: ['nope'] },
      { agents: 'opencode' },
      { git: { requireCleanForApply: 1 } },
    ]) {
      try {
        normalizeConfig(bad);
        throw new Error(`expected ${JSON.stringify(bad)} to be rejected`);
      } catch (error) {
        expect(isSpecVibeError(error)).toBe(true);
        if (isSpecVibeError(error)) expect(error.code).toBe('CONFIG');
      }
    }
  });

  it('rejects a non-object document', () => {
    expect(() => normalizeConfig([])).toThrow(/JSON object/);
    expect(() => normalizeConfig('config')).toThrow(/JSON object/);
  });
});

describe('config persistence', () => {
  it('writes defaults and loads a normalized copy', async () => {
    const written = await writeDefaultConfig(root, { maxFileLines: 320 });
    expect(written.maxFileLines).toBe(320);
    const loaded = await loadConfig(root);
    expect(loaded).toEqual(written);

    await saveConfig(root, { ...loaded, pack: { ...loaded.pack, maxFiles: 8 } });
    expect((await loadConfig(root)).pack.maxFiles).toBe(8);
  });
});

describe('getConfigValue', () => {
  it('reads nested values', () => {
    expect(getConfigValue(DEFAULT_CONFIG, 'maxFileLines')).toBe(400);
    expect(getConfigValue(DEFAULT_CONFIG, 'pack.maxTokens')).toBe(60_000);
    expect(getConfigValue(DEFAULT_CONFIG, 'agents')).toEqual(['generic']);
  });

  it('throws for unknown keys', () => {
    expect(() => getConfigValue(DEFAULT_CONFIG, 'missing')).toThrow(/Unknown config key/);
    expect(() => getConfigValue(DEFAULT_CONFIG, 'pack.missing')).toThrow(/Unknown config key/);
  });
});

describe('setConfigValue', () => {
  it('updates nested numeric and boolean values', async () => {
    await writeDefaultConfig(root);
    const updated = await setConfigValue(root, 'pack.maxTokens', '30000');
    expect(updated.value).toBe(30_000);
    expect((await loadConfig(root)).pack.maxTokens).toBe(30_000);

    await setConfigValue(root, 'git.requireCleanForApply', 'false');
    expect((await loadConfig(root)).git.requireCleanForApply).toBe(false);
  });

  it('parses comma-separated agents and ignore lists', async () => {
    await writeDefaultConfig(root);
    await setConfigValue(root, 'agents', 'opencode, claude,opencode');
    expect((await loadConfig(root)).agents).toEqual(['opencode', 'claude']);

    await setConfigValue(root, 'scan.ignore', 'vendor/**, dist/**');
    expect((await loadConfig(root)).scan.ignore).toEqual(['vendor/**', 'dist/**']);

    await setConfigValue(root, 'scan.ignore', '["tmp/**"]');
    expect((await loadConfig(root)).scan.ignore).toEqual(['tmp/**']);
  });

  it('rejects keys that are not CLI-mutable', async () => {
    await writeDefaultConfig(root);
    await expect(setConfigValue(root, 'version', '2')).rejects.toThrow(/cannot be set/);
  });

  it('rejects values that fail normalization without writing them', async () => {
    await writeDefaultConfig(root);
    await expect(setConfigValue(root, 'pack.maxTokens', '10')).rejects.toThrow(/Invalid config/);
    expect((await loadConfig(root)).pack.maxTokens).toBe(DEFAULT_CONFIG.pack.maxTokens);
  });
});
