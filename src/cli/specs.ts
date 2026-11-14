import type { CommandSpec, FlagDefinition } from './types.js';

export const GLOBAL_FLAGS: FlagDefinition[] = [
  {
    name: 'json',
    type: 'boolean',
    description: 'Emit machine-readable JSON (human output and progress are suppressed).',
  },
  {
    name: 'quiet',
    type: 'boolean',
    aliases: ['-q'],
    description: 'Suppress normal output; errors are still printed.',
  },
  {
    name: 'no-color',
    type: 'boolean',
    description: 'Disable ANSI colors (NO_COLOR is also respected).',
  },
  {
    name: 'debug',
    type: 'boolean',
    description: 'Print stack traces and extra diagnostics on failure.',
  },
  {
    name: 'cwd',
    type: 'string',
    placeholder: '<dir>',
    description: 'Run as if SpecVibe was started in this directory.',
  },
  {
    name: 'help',
    type: 'boolean',
    aliases: ['-h'],
    description: 'Show help for the command.',
  },
  {
    name: 'version',
    type: 'boolean',
    aliases: ['-v'],
    description: 'Print the SpecVibe version.',
  },
];

const FORCE_FLAG: FlagDefinition = {
  name: 'force',
  type: 'boolean',
  description: 'Override a guard after reviewing the reason (never bypasses human approval).',
};

const AGENTS_FLAG: FlagDefinition = {
  name: 'agents',
  type: 'string',
  placeholder: '<list>',
  description: 'Comma-separated agents, or "all"/"none" (default: auto-detect).',
};

const INIT_FLAGS: FlagDefinition[] = [
  AGENTS_FLAG,
  {
    name: 'name',
    type: 'string',
    placeholder: '<name>',
    description: 'Override the detected project name in generated documents.',
  },
  {
    name: 'description',
    type: 'string',
    placeholder: '<text>',
    description: 'Override the detected project description.',
  },
  {
    name: 'no-scan',
    type: 'boolean',
    description: 'Skip the initial repository scan.',
  },
  {
    name: 'no-agents',
    type: 'boolean',
    description: 'Write the .specvibe baseline but skip agent integration files.',
  },
  FORCE_FLAG,
];

export const COMMAND_SPECS: CommandSpec[] = [
  {
    name: 'init',
    summary: 'Initialize SpecVibe in a repository',
    usage: 'specvibe init [options]',
    flags: INIT_FLAGS,
    examples: [
      'specvibe init',
      'npx specvibe init --agents opencode,claude,cursor',
      'specvibe init --agents none --no-scan',
    ],
    notes: [
      'Creates .specvibe/, detects your stack, scans the codebase, and generates native agent files.',
      'Re-running with --force repairs missing files, rescans, and refreshes generated agent files without overwriting your constitution or context.',
    ],
  },
  {
    name: 'setup',
    aliases: ['reinit'],
    summary: 'Initialize or refresh an existing SpecVibe setup',
    usage: 'specvibe setup [options]',
    flags: INIT_FLAGS,
    examples: ['specvibe setup', 'specvibe setup --agents all'],
    notes: [
      'On a new repository this behaves like "init".',
      'On an existing repository it preserves constitution/context/decisions, rescans, and refreshes agent files.',
    ],
  },
  {
    name: 'scan',
    summary: 'Map the codebase, size violations, and reuse candidates',
    usage: 'specvibe scan [options]',
    flags: [
      {
        name: 'focus',
        type: 'string',
        placeholder: '<terms>',
        description: 'Rank files relevant to a feature or area.',
      },
    ],
    examples: ['specvibe scan', 'specvibe scan --focus "billing invoices"', 'specvibe scan --json'],
    notes: [
      'Writes .specvibe/context/codebase-summary.md and scan.json, and records the scan in state.',
      'Orphans and unused exports are heuristics, not deletion instructions.',
    ],
  },
  {
    name: 'propose',
    aliases: ['plan'],
    summary: 'Create a reviewable track from a feature description (no code)',
    usage: 'specvibe propose "<feature>" [options]',
    flags: [
      {
        name: 'slug',
        type: 'string',
        placeholder: '<slug>',
        description: 'Override the generated track slug.',
      },
      {
        name: 'focus',
        type: 'string',
        placeholder: '<terms>',
        description: 'Override the scanner focus terms (default: the feature title).',
      },
      {
        name: 'no-scan',
        type: 'boolean',
        description: 'Reuse the existing scan instead of rescanning.',
      },
    ],
    examples: [
      'specvibe propose "Add CSV export to the reports page"',
      'specvibe plan "Rate-limit the public API" --slug api-rate-limit',
    ],
    notes: [
      'Creates .specvibe/tracks/<slug>/ with proposal.md, spec.md, design.md, and tasks.md.',
      'The generated documents contain clarification markers. Fill them in, then run "specvibe approve <slug> --check".',
      'No implementation code may be written until a human approves the track.',
    ],
  },
  {
    name: 'approve',
    summary: 'Validate or approve a proposed track',
    usage: 'specvibe approve [track] [options]',
    flags: [
      {
        name: 'check',
        type: 'boolean',
        description: 'Validate only; do not change the track status.',
      },
      FORCE_FLAG,
    ],
    examples: [
      'specvibe approve my-feature --check',
      'specvibe approve my-feature',
      'specvibe approve --check --json',
    ],
    notes: [
      'Approval is a human action. Agents should use --check and then ask the user.',
      '--force records an explicit exception for validation errors.',
    ],
  },
  {
    name: 'apply',
    summary: 'Start an approved track or update task/acceptance progress',
    usage: 'specvibe apply [track] [options]',
    flags: [
      {
        name: 'next',
        type: 'boolean',
        description: 'Show the next unchecked item without changing state.',
      },
      {
        name: 'done',
        type: 'string',
        placeholder: '<ID>',
        description: 'Mark one task, gate, or completion item done (for example T1 or G1).',
      },
      {
        name: 'accept',
        type: 'string',
        placeholder: '<AC-ID>',
        description: 'Mark one verified acceptance criterion complete (for example AC-1).',
      },
      {
        name: 'confirm-gate',
        type: 'boolean',
        description: 'Confirm that a verification gate was run and its evidence reviewed.',
      },
      FORCE_FLAG,
      {
        name: 'allow-dirty',
        type: 'boolean',
        description: 'Start a track even when the working tree has uncommitted changes.',
      },
      {
        name: 'allow-no-git',
        type: 'boolean',
        description: 'Start without git (no checkpoint; revert will not be available).',
      },
    ],
    examples: [
      'specvibe apply my-feature',
      'specvibe apply my-feature --next',
      'specvibe apply my-feature --done T1',
      'specvibe apply my-feature --done G1 --confirm-gate',
      'specvibe apply my-feature --accept AC-1',
    ],
    notes: [
      'The first apply creates a git checkpoint and requires a clean tree by default.',
      'Tasks run in order; --force skips order for one item. Gates always require --confirm-gate.',
    ],
  },
  {
    name: 'unify',
    summary: 'Verify completion, archive the track, and record decisions',
    usage: 'specvibe unify [track] [options]',
    flags: [FORCE_FLAG],
    examples: ['specvibe unify', 'specvibe unify my-feature', 'specvibe unify my-feature --force'],
    notes: [
      'Refuses to unify while tasks, gates, or acceptance criteria are unchecked.',
      'Writes summary.md, appends to decisions.md, and moves the track to .specvibe/archive/.',
      'A unified track is immutable; follow-up work needs a new track.',
    ],
  },
  {
    name: 'pack',
    summary: 'Build a token-budgeted context pack for an agent session',
    usage: 'specvibe pack [track] [options]',
    flags: [
      {
        name: 'max-tokens',
        type: 'number',
        placeholder: '<n>',
        description: 'Override the configured token budget (minimum 1000).',
      },
      {
        name: 'out',
        type: 'string',
        placeholder: '<file>',
        description: 'Write the pack to a custom path (relative to the repository root).',
      },
      {
        name: 'stdout',
        type: 'boolean',
        description: 'Print the pack markdown instead of only its path and manifest.',
      },
    ],
    examples: [
      'specvibe pack',
      'specvibe pack my-feature',
      'specvibe pack my-feature --max-tokens 30000',
      'specvibe pack my-feature --stdout > context.md',
    ],
    notes: [
      'Packs include the constitution, context, decisions, active track, codebase map, and relevant source excerpts.',
      'Default output: .specvibe/packs/<track>.md (gitignored).',
    ],
  },
  {
    name: 'status',
    summary: 'Show tracks, progress, git state, and the next safe action',
    usage: 'specvibe status [track] [options]',
    flags: [],
    examples: ['specvibe status', 'specvibe status my-feature', 'specvibe status --json'],
    notes: ['Read-only. Use --json for structured output in scripts and agent prompts.'],
  },
  {
    name: 'revert',
    summary: 'Safely roll a track back to its checkpoint (dry-run by default)',
    usage: 'specvibe revert [track] [options]',
    flags: [
      {
        name: 'yes',
        type: 'boolean',
        description: 'Perform the revert. Without it, only a plan is printed.',
      },
    ],
    examples: ['specvibe revert my-feature', 'specvibe revert my-feature --yes'],
    notes: [
      'Preview first. --yes creates a backup branch, stashes dirty/untracked work, resets to the checkpoint, and archives the track as reverted.',
      'Never run --yes without explicit user confirmation.',
    ],
  },
  {
    name: 'agents',
    summary: 'List, detect, add, remove, or sync agent integrations',
    usage: 'specvibe agents [list|detect|sync|add|remove] [agents] [options]',
    flags: [FORCE_FLAG],
    examples: [
      'specvibe agents',
      'specvibe agents detect',
      'specvibe agents add cursor,copilot',
      'specvibe agents remove windsurf',
      'specvibe agents sync --force',
    ],
    notes: [
      'Managed files (AGENTS.md, CLAUDE.md, and similar) keep user content outside SpecVibe markers.',
      'Owned command files are only overwritten when generated by SpecVibe, unless --force is used (a backup is kept).',
    ],
  },
  {
    name: 'doctor',
    summary: 'Diagnose installation, config, git, scan, and agent issues',
    usage: 'specvibe doctor [options]',
    flags: [],
    examples: ['specvibe doctor', 'specvibe doctor --json'],
    notes: ['Works before init, so it can explain what is missing.'],
  },
  {
    name: 'config',
    summary: 'Read or update .specvibe/config.json',
    usage: 'specvibe config [list|get|set] [key] [value]',
    flags: [],
    examples: [
      'specvibe config',
      'specvibe config get maxFileLines',
      'specvibe config set pack.maxTokens 30000',
      'specvibe config set agents opencode,claude',
      'specvibe config set scan.ignore "dist/**,vendor/**"',
    ],
    notes: ['Setting agents does not write agent files; run "specvibe agents sync" afterwards.'],
  },
  {
    name: 'help',
    summary: 'Show help for SpecVibe or one command',
    usage: 'specvibe help [command]',
    flags: [],
    examples: ['specvibe help', 'specvibe help apply'],
  },
  {
    name: 'version',
    summary: 'Print the SpecVibe version',
    usage: 'specvibe version',
    flags: [],
    examples: ['specvibe version'],
  },
];

export function findCommandSpec(name: string): CommandSpec | undefined {
  const normalized = name.toLowerCase();
  return COMMAND_SPECS.find(
    (spec) =>
      spec.name === normalized || (spec.aliases ?? []).some((alias) => alias === normalized),
  );
}

export const COMMAND_NAMES: string[] = COMMAND_SPECS.map((spec) => spec.name);
