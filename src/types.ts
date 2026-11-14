/**
 * Shared types for SpecVibe.
 *
 * Everything persisted in `.specvibe/` is plain JSON or Markdown so it can be
 * reviewed, diffed, and versioned like the rest of the repository.
 */

export const AGENT_IDS = [
  'opencode',
  'claude',
  'cursor',
  'gemini',
  'windsurf',
  'copilot',
  'generic',
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const TRACK_STATUSES = ['proposed', 'approved', 'applying', 'unified', 'reverted'] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];

export interface SpecVibeConfig {
  version: 1;
  maxFileLines: number;
  maxFunctionLines: number;
  agents: AgentId[];
  scan: {
    /** Extra gitignore-style patterns to exclude from scans. */
    ignore: string[];
    maxFiles: number;
    maxFileBytes: number;
    includeTests: boolean;
  };
  pack: {
    maxTokens: number;
    maxFileTokens: number;
    maxFiles: number;
  };
  git: {
    requireCleanForApply: boolean;
    autoCheckpoint: boolean;
  };
}

export interface StateEvent {
  at: string;
  event: string;
  track?: string;
  detail?: string;
}

export interface SpecVibeState {
  version: 1;
  activeTrack: string | null;
  lastScan?: {
    at: string;
    files: number;
    sourceFiles: number;
    languages: string[];
    commit?: string;
  };
  lastPack?: {
    at: string;
    track: string | null;
    path: string;
    estimatedTokens: number;
  };
  history: StateEvent[];
}

export interface CommandInfo {
  build?: string;
  test?: string;
  lint?: string;
  typecheck?: string;
  format?: string;
}

export interface ProjectInfo {
  name: string;
  description: string;
  stack: string[];
  languages: string[];
  frameworks: string[];
  packageManager: string | null;
  manifests: string[];
  entryPoints: string[];
  topLevelDirs: string[];
  commands: CommandInfo;
  isGitRepo: boolean;
  gitBranch?: string;
  gitCommit?: string;
}

export interface TrackCheckpoint {
  commit: string;
  ref?: string;
  createdAt: string;
  dirtyAtCheckpoint: boolean;
}

export interface TrackRelevantFile {
  path: string;
  score: number;
  reasons: string[];
}

export interface TrackMeta {
  version: 1;
  slug: string;
  title: string;
  status: TrackStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  appliedAt?: string;
  unifiedAt?: string;
  revertedAt?: string;
  baseCommit?: string;
  checkpoint?: TrackCheckpoint;
  relevantFiles?: TrackRelevantFile[];
  archivePath?: string;
  forced?: boolean;
}

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
}

export interface LongFunctionInfo {
  path: string;
  name: string;
  startLine: number;
  lineCount: number;
}

export interface ScanFile {
  path: string;
  language: string;
  lines: number;
  codeLines: number;
  bytes: number;
  exports: string[];
  imports: string[];
  inbound: number;
  isTest: boolean;
  isEntry: boolean;
}

export interface DirectoryStat {
  path: string;
  files: number;
  lines: number;
}

export interface FocusFile {
  path: string;
  score: number;
  reasons: string[];
}

export interface ScanResult {
  schemaVersion: 1;
  generatedAt: string;
  project: {
    name: string;
    description: string;
    stack: string[];
    frameworks: string[];
    commands: CommandInfo;
    entryPoints: string[];
  };
  commit?: string;
  limits: {
    maxFileLines: number;
    maxFunctionLines: number;
  };
  stats: {
    files: number;
    sourceFiles: number;
    totalLines: number;
    languages: LanguageStat[];
  };
  files: ScanFile[];
  directories: DirectoryStat[];
  bloatedFiles: Array<{ path: string; lines: number }>;
  longFunctions: LongFunctionInfo[];
  orphans: string[];
  unusedExports: Array<{ path: string; symbol: string }>;
  focus?: FocusFile[];
  warnings: string[];
}

export type TaskKind = 'task' | 'gate' | 'completion' | 'acceptance' | 'decision' | 'generic';

export interface ChecklistItem {
  id: string | null;
  text: string;
  checked: boolean;
  line: number;
  section: string;
  kind: TaskKind;
}

export interface TrackProgress {
  tasks: ChecklistItem[];
  gates: ChecklistItem[];
  completion: ChecklistItem[];
  acceptance: ChecklistItem[];
  allTasks: ChecklistItem[];
  next: ChecklistItem | null;
  total: number;
  completed: number;
  percent: number;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  file?: string;
  line?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
}

export interface AgentSyncFile {
  path: string;
  action: 'created' | 'updated' | 'unchanged' | 'skipped' | 'removed';
  kind: 'managed' | 'owned';
  agent: AgentId;
  note?: string;
}

export interface AgentSyncResult {
  agents: AgentId[];
  detected: AgentId[];
  files: AgentSyncFile[];
  warnings: string[];
}

export interface AgentListEntry {
  id: AgentId;
  name: string;
  description: string;
  detected: boolean;
  configured: boolean;
  files: string[];
}

export interface PackFileSummary {
  path: string;
  lines: number;
  estimatedTokens: number;
  truncated: boolean;
}

export interface PackResult {
  track: string | null;
  path: string;
  markdown: string;
  estimatedTokens: number;
  budgetTokens: number;
  included: PackFileSummary[];
  omitted: string[];
  truncated: boolean;
}

export interface GitInfo {
  available: boolean;
  version?: string;
  isRepo: boolean;
  head?: string;
  branch?: string;
  clean?: boolean;
  statusLines?: number;
}
