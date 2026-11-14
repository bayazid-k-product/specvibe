import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  DirectoryStat,
  FocusFile,
  LanguageStat,
  LongFunctionInfo,
  ProjectInfo,
  ScanFile,
  ScanResult,
  SpecVibeConfig,
} from '../types.js';
import { pathExists, readJson, readText, toPosix, writeJson, writeText } from './fs.js';
import { projectPaths } from './paths.js';
import { detectProject } from './project.js';
import { appendHistory, loadState, updateState } from './state.js';
import { estimateTokens, mapLimit, nowIso } from './utils.js';

const HARD_IGNORE_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.specvibe',
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.pnpm-store',
  '.yarn',
  'dist',
  'build',
  'out',
  'coverage',
  '.coverage',
  '.nyc_output',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  '.vitest',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '__pycache__',
  'venv',
  '.venv',
  'env',
  '.tox',
  'target',
  'vendor',
  'Pods',
  'DerivedData',
  '.gradle',
  '.idea',
  '.vscode',
  '.claude',
  '.opencode',
  '.cursor',
  '.gemini',
  '.windsurf',
  '.devin',
  '.agents',
  '.github',
  '.terraform',
  '.serverless',
  'tmp',
  'temp',
  '.DS_Store',
]);

const BINARY_OR_NOISY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.tar',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.mov',
  '.wav',
  '.svg',
  '.lock',
  '.map',
  '.min.js',
  '.min.css',
  '.snap',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.pyi',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.cxx',
  '.hpp',
  '.hh',
  '.m',
  '.mm',
  '.scala',
  '.ex',
  '.exs',
  '.dart',
  '.lua',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd',
  '.sql',
  '.graphql',
  '.gql',
  '.proto',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.md',
  '.mdx',
  '.txt',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.xml',
  '.gradle',
  '.properties',
  '.env',
]);

const KNOWN_TEXT_NAMES = new Set([
  'dockerfile',
  'makefile',
  'procfile',
  'license',
  'notice',
  'readme',
  'changelog',
  'gemfile',
  'rakefile',
  'justfile',
  'taskfile',
  '.gitignore',
  '.specvibeignore',
  '.editorconfig',
  '.dockerignore',
  '.npmrc',
  '.nvmrc',
  '.prettierrc',
  '.eslintrc',
  '.babelrc',
  'jenkinsfile',
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.py': 'Python',
  '.pyi': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.c': 'C',
  '.h': 'C/C++',
  '.cc': 'C++',
  '.cpp': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',
  '.hh': 'C++',
  '.m': 'Objective-C',
  '.mm': 'Objective-C',
  '.scala': 'Scala',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.ps1': 'PowerShell',
  '.bat': 'Batch',
  '.cmd': 'Batch',
  '.sql': 'SQL',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.proto': 'Protocol Buffers',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.md': 'Markdown',
  '.mdx': 'Markdown',
  '.json': 'JSON',
  '.jsonc': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.xml': 'XML',
};

const GRAPH_LANGUAGES = new Set(['TypeScript', 'JavaScript', 'Vue', 'Svelte', 'Python']);
const JS_LANGUAGES = new Set(['TypeScript', 'JavaScript', 'Vue', 'Svelte']);
const JS_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.pyi',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.cxx',
  '.hpp',
  '.hh',
  '.scala',
  '.ex',
  '.exs',
  '.dart',
  '.lua',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
]);

const NOISY_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'cargo.lock',
  'go.sum',
  'poetry.lock',
  'uv.lock',
  'composer.lock',
  'gemfile.lock',
  'pipfile.lock',
]);

interface IgnoreRule {
  regex: RegExp;
  negated: boolean;
  raw: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(glob: string): RegExp {
  const anchored = glob.includes('/');
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if (char && /[A-Za-z0-9_/.-]/.test(char)) {
      source += escapeRegex(char);
    } else if (char) {
      source += escapeRegex(char);
    }
  }
  const prefix = anchored ? '^' : '(?:^|/)';
  return new RegExp(`${prefix}${source}(?:/.*)?$`);
}

class IgnoreMatcher {
  private readonly rules: IgnoreRule[];
  readonly hasNegations: boolean;

  constructor(patterns: string[]) {
    this.rules = patterns
      .map((raw) => raw.trim())
      .filter((raw) => raw && !raw.startsWith('#'))
      .map((raw) => {
        let pattern = raw.replace(/\\#/g, '#').replace(/\\!/g, '!');
        const negated = pattern.startsWith('!');
        if (negated) pattern = pattern.slice(1);
        pattern = pattern.replace(/^\//, '').replace(/\/$/, '');
        return {
          regex: globToRegex(pattern),
          negated,
          raw,
        };
      });
    this.hasNegations = this.rules.some((rule) => rule.negated);
  }

  isIgnored(relPath: string, isDirectory = false): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.regex.test(normalized)) ignored = !rule.negated;
    }
    if (isDirectory && HARD_IGNORE_DIRS.has(path.posix.basename(normalized))) return true;
    return ignored;
  }
}

async function loadIgnoreRules(root: string, config: SpecVibeConfig): Promise<IgnoreMatcher> {
  const patterns: string[] = [];
  for (const file of ['.gitignore', '.specvibeignore']) {
    const content = await readText(path.join(root, file), '');
    if (content) patterns.push(...content.split(/\r?\n/));
  }
  patterns.push(...config.scan.ignore);
  return new IgnoreMatcher(patterns);
}

function isNoisyFile(relPath: string): boolean {
  const base = path.posix.basename(relPath).toLowerCase();
  if (NOISY_FILES.has(base)) return true;
  if (/\.(min|bundle)\.(js|css)$/i.test(base)) return true;
  if (/\.(map|snap)$/i.test(base)) return true;
  return false;
}

function isTextFile(relPath: string): boolean {
  const base = path.posix.basename(relPath).toLowerCase();
  if (KNOWN_TEXT_NAMES.has(base)) return true;
  const ext = path.posix.extname(base);
  if (BINARY_OR_NOISY_EXTENSIONS.has(ext)) return false;
  return TEXT_EXTENSIONS.has(ext);
}

function isSourceFile(relPath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.posix.extname(relPath).toLowerCase());
}

export function isTestPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  return (
    /(^|\/)(__tests__|__snapshots__|tests?|specs?|e2e|cypress)(\/|$)/.test(normalized) ||
    /\.(test|spec|e2e)\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/.test(normalized) ||
    /(^|\/)test_[^/]+\.py$/.test(normalized) ||
    /_test\.py$/.test(normalized) ||
    /_test\.go$/.test(normalized) ||
    /tests?\.(cs|java|kt)$/.test(normalized)
  );
}

function isEntryPath(relPath: string, project: ProjectInfo): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const entries = new Set(project.entryPoints.map((entry) => toPosix(entry)));
  if (entries.has(normalized)) return true;
  return /(^|\/)(index|main|cli|app|server|mod|__init__|manage|setup)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift)$/.test(
    normalized,
  );
}

function isConfigPath(relPath: string): boolean {
  const base = path.posix.basename(relPath).toLowerCase();
  return (
    /\.(config|conf|rc)\.(ts|js|mjs|cjs|json)$/.test(base) ||
    /^(tsconfig|jsconfig|vite|vitest|jest|playwright|eslint|prettier|babel|rollup|webpack|tailwind|postcss|next|nuxt|svelte|astro|remix)\./.test(
      base,
    ) ||
    /^(dockerfile|makefile|procfile|gemfile|rakefile)$/.test(base)
  );
}

async function walkRepository(
  root: string,
  matcher: IgnoreMatcher,
  config: SpecVibeConfig,
): Promise<{ files: string[]; warnings: string[] }> {
  const files: string[] = [];
  const warnings: string[] = [];
  let truncated = false;

  async function visit(relativeDirectory: string): Promise<void> {
    if (files.length >= config.scan.maxFiles) return;
    const absoluteDirectory = relativeDirectory ? path.join(root, relativeDirectory) : root;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= config.scan.maxFiles) {
        truncated = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const relative = relativeDirectory
        ? path.posix.join(relativeDirectory.replace(/\\/g, '/'), entry.name)
        : entry.name;
      if (entry.isDirectory()) {
        if (HARD_IGNORE_DIRS.has(entry.name)) continue;
        if (matcher.isIgnored(relative, true) && !matcher.hasNegations) continue;
        await visit(relative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (matcher.isIgnored(relative)) continue;
      if (isNoisyFile(relative)) continue;
      if (!isTextFile(relative)) continue;
      if (!config.scan.includeTests && isTestPath(relative)) continue;
      files.push(relative);
    }
  }

  await visit('');
  if (truncated) {
    warnings.push(
      `Scan stopped after ${config.scan.maxFiles} files (scan.maxFiles). Increase it in .specvibe/config.json for larger repositories.`,
    );
  }
  return { files, warnings };
}

function extractSymbols(language: string, content: string): string[] {
  const symbols = new Set<string>();
  const addMatches = (regex: RegExp, groups: number[] = [1]) => {
    for (const match of content.matchAll(regex)) {
      for (const group of groups) {
        const value = match[group];
        if (value) symbols.add(value.trim());
      }
    }
  };

  if (JS_LANGUAGES.has(language)) {
    addMatches(/\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g);
    addMatches(/\bexport\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g);
    addMatches(/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);
    addMatches(/\bexport\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g);
    for (const match of content.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
      for (const part of (match[1] ?? '').split(',')) {
        const alias = part
          .trim()
          .split(/\s+as\s+/)
          .at(-1);
        if (alias && /^[A-Za-z_$][\w$]*$/.test(alias)) symbols.add(alias);
      }
    }
  } else if (language === 'Python') {
    addMatches(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm);
    addMatches(/^class\s+([A-Za-z_]\w*)\s*[:(]/gm);
  } else if (language === 'Go') {
    addMatches(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/gm);
    addMatches(/^type\s+([A-Za-z_]\w*)\s+/gm);
  } else if (language === 'Rust') {
    addMatches(/\bpub\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)/g);
    addMatches(/\bpub\s+(?:struct|enum|trait|type|const|static)\s+([A-Za-z_]\w*)/g);
  } else if (['Java', 'Kotlin', 'C#', 'Scala', 'Swift'].includes(language)) {
    addMatches(
      /\b(?:public|protected|internal|open)\s+(?:static\s+)?(?:abstract\s+)?(?:final\s+)?(?:class|interface|enum|record|struct|protocol)\s+([A-Za-z_]\w*)/g,
    );
    addMatches(
      /\b(?:public|protected)\s+(?:static\s+)?(?:async\s+)?[\w<>[\],.?]+\s+([A-Za-z_]\w*)\s*\(/g,
    );
  } else if (language === 'Ruby') {
    addMatches(/^\s*(?:class|module)\s+([A-Z]\w*)/gm);
    addMatches(/^\s*def\s+(?:self\.)?([A-Za-z_]\w*[!?=]?)/gm);
  } else if (language === 'PHP') {
    addMatches(/\b(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/g);
    addMatches(/\bfunction\s+([A-Za-z_]\w*)/g);
  } else if (language === 'C++' || language === 'C') {
    addMatches(/\b(?:class|struct|enum)\s+([A-Za-z_]\w*)/g);
  }

  return [...symbols].slice(0, 100);
}

function extractImports(language: string, content: string): string[] {
  const imports = new Set<string>();
  if (JS_LANGUAGES.has(language)) {
    for (const match of content.matchAll(
      /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    )) {
      if (match[1]) imports.add(match[1]);
    }
    for (const match of content.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1]) imports.add(match[1]);
    }
    for (const match of content.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1]) imports.add(match[1]);
    }
  } else if (language === 'Python') {
    for (const match of content.matchAll(/^\s*from\s+(\.*[\w.]*)\s+import\s+/gm)) {
      if (match[1]) imports.add(match[1]);
    }
    for (const match of content.matchAll(/^\s*import\s+([\w.]+)/gm)) {
      if (match[1]) imports.add(match[1]);
    }
  }
  return [...imports].slice(0, 200);
}

function countCodeLines(content: string): number {
  return content.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !/^(\/\/|#|\/\*|\*|--|<!--)/.test(trimmed);
  }).length;
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < content.length; cursor += 1) {
    if (content[cursor] === '\n') line += 1;
  }
  return line;
}

/**
 * Find the matching closing brace while ignoring braces in strings and
 * comments. This is intentionally a lightweight lexer, not a full parser.
 */
function findMatchingBrace(content: string, openIndex: number): number | null {
  let depth = 0;
  let state: 'normal' | 'single' | 'double' | 'template' | 'line-comment' | 'block-comment' =
    'normal';
  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (state === 'line-comment') {
      if (char === '\n') state = 'normal';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'normal';
        index += 1;
      }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (
        (state === 'single' && char === "'") ||
        (state === 'double' && char === '"') ||
        (state === 'template' && char === '`')
      ) {
        state = 'normal';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
      continue;
    }
    if (char === "'") {
      state = 'single';
      continue;
    }
    if (char === '"') {
      state = 'double';
      continue;
    }
    if (char === '`') {
      state = 'template';
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function collectBracedFunctions(
  content: string,
  regex: RegExp,
  skipNames = new Set<string>(),
  nameGroup = 1,
): Array<{ name: string; startLine: number; lineCount: number }> {
  const functions: Array<{ name: string; startLine: number; lineCount: number }> = [];
  const seen = new Set<number>();
  for (const match of content.matchAll(regex)) {
    const name = match[nameGroup];
    if (!name || skipNames.has(name) || match.index === undefined) continue;
    const openIndex = content.lastIndexOf('{', match.index + match[0].length - 1);
    if (openIndex < 0) continue;
    if (seen.has(openIndex)) continue;
    seen.add(openIndex);
    const closeIndex = findMatchingBrace(content, openIndex);
    if (closeIndex === null) continue;
    const startLine = lineAt(content, match.index);
    const endLine = lineAt(content, closeIndex);
    functions.push({ name, startLine, lineCount: endLine - startLine + 1 });
  }
  return functions;
}

function pythonFunctions(
  content: string,
): Array<{ name: string; startLine: number; lineCount: number }> {
  const lines = content.split(/\r?\n/);
  const functions: Array<{ name: string; startLine: number; lineCount: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!match?.[1] || !match[2]) continue;
    const indent = match[1].length;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? '';
      if (!candidate.trim()) continue;
      const candidateIndent = candidate.length - candidate.trimStart().length;
      if (candidateIndent <= indent && !candidate.trim().startsWith('#')) {
        end = cursor;
        break;
      }
    }
    functions.push({ name: match[2], startLine: index + 1, lineCount: end - index });
  }
  return functions;
}

function findLongFunctions(
  file: ScanFile,
  content: string,
  maxFunctionLines: number,
): LongFunctionInfo[] {
  const results: Array<{ name: string; startLine: number; lineCount: number }> = [];
  const skip = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'constructor', 'try']);

  if (file.language === 'Python') {
    results.push(...pythonFunctions(content));
  } else if (JS_LANGUAGES.has(file.language)) {
    results.push(
      ...collectBracedFunctions(
        content,
        /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)[^{]*\{/g,
        skip,
      ),
      ...collectBracedFunctions(
        content,
        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>\s*\{/g,
        skip,
      ),
      ...collectBracedFunctions(
        content,
        /^\s{2,}(?:(?:public|private|protected|static|async|get|set|readonly|override)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/gm,
        skip,
      ),
    );
  } else if (file.language === 'Go') {
    results.push(
      ...collectBracedFunctions(
        content,
        /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\([^)]*\)[^{]*\{/gm,
        skip,
      ),
    );
  } else if (file.language === 'Rust') {
    results.push(
      ...collectBracedFunctions(
        content,
        /\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*[<(][^{;]*\{/g,
        skip,
      ),
    );
  } else if (['Java', 'Kotlin', 'C#', 'Swift', 'Scala'].includes(file.language)) {
    results.push(
      ...collectBracedFunctions(
        content,
        /^\s*(?:(?:public|private|protected|internal)\s+)?(?:(?:static|final|async|override|open|suspend|abstract)\s+)*[\w<>[\],.?]+\s+([A-Za-z_]\w*)\s*\([^)]*\)[^{;]*\{/gm,
        skip,
      ),
    );
  }

  const unique = new Map<string, { name: string; startLine: number; lineCount: number }>();
  for (const result of results) {
    unique.set(`${result.name}:${result.startLine}`, result);
  }
  return [...unique.values()]
    .filter((result) => result.lineCount > maxFunctionLines)
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 30)
    .map((result) => ({
      path: file.path,
      name: result.name,
      startLine: result.startLine,
      lineCount: result.lineCount,
    }));
}

function resolveJsImport(fromFile: string, specifier: string, fileSet: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  if (base.startsWith('..')) return null;
  const strippedExt = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  const candidates = new Set<string>([base]);
  if (strippedExt !== base) {
    for (const extension of ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']) {
      candidates.add(`${strippedExt}${extension}`);
    }
  }
  for (const extension of JS_EXTENSIONS) {
    candidates.add(`${base}${extension}`);
    candidates.add(`${base}/index${extension}`);
  }
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function resolvePythonImport(
  fromFile: string,
  specifier: string,
  fileSet: Set<string>,
): string | null {
  if (specifier.startsWith('.')) {
    const dots = specifier.match(/^\.+/)?.[0].length ?? 0;
    const remainder = specifier.slice(dots).replace(/^\./, '');
    let directory = path.posix.dirname(fromFile);
    for (let index = 1; index < dots; index += 1) {
      directory = path.posix.dirname(directory);
    }
    if (directory.startsWith('..')) return null;
    const modulePath = remainder
      ? path.posix.join(directory, remainder.replace(/\./g, '/'))
      : directory;
    const candidates = [`${modulePath}.py`, `${modulePath}/__init__.py`];
    for (const candidate of candidates) {
      if (fileSet.has(candidate)) return candidate;
    }
    return null;
  }
  const modulePath = specifier.replace(/\./g, '/');
  const candidates = [`${modulePath}.py`, `${modulePath}/__init__.py`];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function languageForFile(relPath: string): string {
  const ext = path.posix.extname(relPath).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? 'Text';
}

function tokenizeFocus(focus: string): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'for',
    'with',
    'add',
    'create',
    'build',
    'implement',
    'support',
    'feature',
    'make',
    'new',
    'to',
    'of',
    'in',
    'on',
    'using',
    'use',
  ]);
  return [
    ...new Set(
      focus
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3 && !stopwords.has(word)),
    ),
  ].slice(0, 12);
}

function scoreFocusFiles(
  files: ScanFile[],
  contentByPath: Map<string, string>,
  focus: string,
  graph: Map<string, Set<string>>,
): FocusFile[] {
  const terms = tokenizeFocus(focus);
  if (terms.length === 0) return [];
  const scores = new Map<string, { score: number; reasons: Set<string> }>();
  const ensure = (file: string) => {
    if (!scores.has(file)) scores.set(file, { score: 0, reasons: new Set() });
    return scores.get(file) as { score: number; reasons: Set<string> };
  };

  for (const file of files) {
    if (!isSourceFile(file.path) && !file.path.endsWith('.md')) continue;
    const pathLower = file.path.toLowerCase();
    const exportsLower = file.exports.join(' ').toLowerCase();
    const contentLower = contentByPath.get(file.path)?.toLowerCase() ?? '';
    for (const term of terms) {
      let matched = false;
      if (pathLower.includes(term)) {
        ensure(file.path).score += pathLower.split('/').some((segment) => segment.includes(term))
          ? 10
          : 6;
        ensure(file.path).reasons.add(`path matches "${term}"`);
        matched = true;
      }
      if (exportsLower.includes(term)) {
        ensure(file.path).score += 7;
        ensure(file.path).reasons.add(`exports mention "${term}"`);
        matched = true;
      }
      if (term.length >= 3 && contentLower.includes(term)) {
        const occurrences = contentLower.split(term).length - 1;
        ensure(file.path).score += Math.min(6, occurrences);
        ensure(file.path).reasons.add(`content mentions "${term}"`);
        matched = true;
      }
      if (matched && file.isTest) ensure(file.path).score -= 2;
      if (matched && file.inbound > 0) ensure(file.path).score += Math.min(3, file.inbound * 0.3);
    }
  }

  const strong = [...scores.entries()]
    .filter(([, value]) => value.score >= 5)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 8);
  for (const [file] of strong) {
    for (const neighbor of graph.get(file) ?? []) {
      const entry = ensure(neighbor);
      entry.score += 2;
      entry.reasons.add(`related to ${file}`);
    }
  }

  return [...scores.entries()]
    .filter(([, value]) => value.score > 0)
    .map(([file, value]) => ({
      path: file,
      score: Math.round(value.score * 10) / 10,
      reasons: [...value.reasons].slice(0, 3),
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 15);
}

export interface ScanOptions {
  root: string;
  config: SpecVibeConfig;
  project?: ProjectInfo;
  focus?: string;
}

/**
 * Scan the repository. Pure with respect to the repo: reads files and returns
 * structured data. `writeScanArtifacts` persists the summary.
 */
export async function scanRepository(options: ScanOptions): Promise<ScanResult> {
  const { root, config } = options;
  const project = options.project ?? (await detectProject(root));
  const matcher = await loadIgnoreRules(root, config);
  const walked = await walkRepository(root, matcher, config);
  const warnings = [...walked.warnings];
  const fileSet = new Set(walked.files);
  const contentByPath = new Map<string, string>();
  let skippedLarge = 0;
  let unreadable = 0;

  await mapLimit(walked.files, 32, async (relative) => {
    const absolute = path.join(root, relative);
    try {
      const stat = await fs.stat(absolute);
      if (stat.size > config.scan.maxFileBytes) {
        skippedLarge += 1;
        return;
      }
      const content = await fs.readFile(absolute, 'utf8');
      if (content.includes('\u0000')) return;
      contentByPath.set(relative, content);
    } catch {
      unreadable += 1;
    }
  });

  if (skippedLarge > 0) {
    warnings.push(
      `Skipped ${skippedLarge} file(s) larger than scan.maxFileBytes (${config.scan.maxFileBytes} bytes).`,
    );
  }
  if (unreadable > 0) warnings.push(`Could not read ${unreadable} file(s).`);

  const files: ScanFile[] = [];
  const languageMap = new Map<string, LanguageStat>();
  const directoryMap = new Map<string, DirectoryStat>();
  const longFunctions: LongFunctionInfo[] = [];
  const identifierCounts = new Map<string, number>();
  let totalLines = 0;

  for (const relative of walked.files) {
    const content = contentByPath.get(relative);
    if (content === undefined) continue;
    const language = languageForFile(relative);
    const lineCount = content ? content.split(/\r?\n/).length : 0;
    const source = isSourceFile(relative);
    const scanFile: ScanFile = {
      path: relative,
      language,
      lines: lineCount,
      codeLines: source ? countCodeLines(content) : 0,
      bytes: Buffer.byteLength(content, 'utf8'),
      exports: source ? extractSymbols(language, content) : [],
      imports: source ? extractImports(language, content) : [],
      inbound: 0,
      isTest: isTestPath(relative),
      isEntry: isEntryPath(relative, project),
    };
    files.push(scanFile);
    totalLines += lineCount;

    const stat = languageMap.get(language) ?? { language, files: 0, lines: 0 };
    stat.files += 1;
    stat.lines += lineCount;
    languageMap.set(language, stat);

    const directory = path.posix.dirname(relative);
    const dirKey = directory === '.' ? '(root)' : directory;
    const dirStat = directoryMap.get(dirKey) ?? { path: dirKey, files: 0, lines: 0 };
    dirStat.files += 1;
    dirStat.lines += lineCount;
    directoryMap.set(dirKey, dirStat);

    if (source) {
      longFunctions.push(...findLongFunctions(scanFile, content, config.maxFunctionLines));
      for (const match of content.matchAll(/[A-Za-z_$][\w$]*/g)) {
        const identifier = match[0];
        identifierCounts.set(identifier, (identifierCounts.get(identifier) ?? 0) + 1);
      }
    }
  }

  const scanByPath = new Map(files.map((file) => [file.path, file]));
  const graph = new Map<string, Set<string>>();
  for (const file of files) {
    const targets = new Set<string>();
    if (file.language && GRAPH_LANGUAGES.has(file.language)) {
      for (const specifier of file.imports) {
        const resolved =
          file.language === 'Python'
            ? resolvePythonImport(file.path, specifier, fileSet)
            : resolveJsImport(file.path, specifier, fileSet);
        if (resolved && resolved !== file.path && scanByPath.has(resolved)) {
          targets.add(resolved);
          const target = scanByPath.get(resolved);
          if (target) target.inbound += 1;
        }
      }
    }
    if (targets.size) graph.set(file.path, targets);
  }

  // Undirected graph for focus expansion.
  const undirected = new Map<string, Set<string>>();
  for (const [from, targets] of graph) {
    for (const target of targets) {
      if (!undirected.has(from)) undirected.set(from, new Set());
      if (!undirected.has(target)) undirected.set(target, new Set());
      undirected.get(from)?.add(target);
      undirected.get(target)?.add(from);
    }
  }

  const bloatedFiles = files
    .filter((file) => file.lines > config.maxFileLines)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 40)
    .map((file) => ({ path: file.path, lines: file.lines }));

  const orphans = files
    .filter(
      (file) =>
        GRAPH_LANGUAGES.has(file.language) &&
        file.inbound === 0 &&
        !file.isTest &&
        !file.isEntry &&
        !isConfigPath(file.path) &&
        !file.path.endsWith('.d.ts') &&
        !file.path.endsWith('__init__.py') &&
        file.exports.length > 0,
    )
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 30)
    .map((file) => file.path);

  const unusedExports: Array<{ path: string; symbol: string }> = [];
  for (const file of files) {
    if (!isSourceFile(file.path) || file.isTest || file.isEntry) continue;
    if (
      ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Ruby', 'PHP'].includes(
        file.language,
      ) === false
    ) {
      continue;
    }
    const content = contentByPath.get(file.path) ?? '';
    for (const symbol of file.exports) {
      if (symbol === 'default' || symbol.length < 3) continue;
      const localCount = (content.match(new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'g')) ?? [])
        .length;
      const totalCount = identifierCounts.get(symbol) ?? 0;
      if (localCount > 0 && totalCount <= localCount) {
        unusedExports.push({ path: file.path, symbol });
      }
      if (unusedExports.length >= 40) break;
    }
    if (unusedExports.length >= 40) break;
  }

  const focus = options.focus
    ? scoreFocusFiles(files, contentByPath, options.focus, undirected)
    : undefined;
  if (options.focus && focus?.length === 0) {
    warnings.push(
      `No files matched focus "${options.focus}". This feature may be introducing a new area.`,
    );
  }

  if (files.length === 0) warnings.push('No text or source files were found to scan.');

  const languages = [...languageMap.values()].sort((a, b) => b.lines - a.lines);
  const longFunctionList = longFunctions.sort((a, b) => b.lineCount - a.lineCount).slice(0, 40);

  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    limits: {
      maxFileLines: config.maxFileLines,
      maxFunctionLines: config.maxFunctionLines,
    },
    project: {
      name: project.name,
      description: project.description,
      stack: project.stack,
      frameworks: project.frameworks,
      commands: project.commands,
      entryPoints: project.entryPoints,
    },
    commit: project.gitCommit,
    stats: {
      files: files.length,
      sourceFiles: files.filter((file) => isSourceFile(file.path)).length,
      totalLines,
      languages,
    },
    files,
    directories: [...directoryMap.values()].sort((a, b) => b.lines - a.lines),
    bloatedFiles,
    longFunctions: longFunctionList,
    orphans,
    unusedExports,
    focus,
    warnings,
  };
}

function renderFocusFiles(files: FocusFile[] | undefined): string {
  if (!files?.length) return '_No focused matches. This track may introduce new modules._';
  return files
    .map((file) => {
      const reasons = file.reasons.length ? ` (${file.reasons.join('; ')})` : '';
      return `- \`${file.path}\` - score ${file.score}${reasons}`;
    })
    .join('\n');
}

export function buildScanSummary(result: ScanResult): string {
  const languages = result.stats.languages
    .slice(0, 12)
    .map((stat) => `| ${stat.language} | ${stat.files} | ${stat.lines} |`)
    .join('\n');
  const directories = result.directories
    .slice(0, 20)
    .map((dir) => `| \`${dir.path}\` | ${dir.files} | ${dir.lines} |`)
    .join('\n');
  const largest = result.files
    .filter((file) => isSourceFile(file.path))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 15)
    .map((file) => `- \`${file.path}\` - ${file.lines} lines, ${file.inbound} inbound import(s)`)
    .join('\n');
  const reuse = [...result.files]
    .filter((file) => isSourceFile(file.path) && file.exports.length > 0)
    .sort((a, b) => b.inbound - a.inbound || b.lines - a.lines)
    .slice(0, 60)
    .map((file) => {
      const exports = file.exports.slice(0, 18).join(', ');
      return `- \`${file.path}\` (${file.lines} lines, ${file.inbound} inbound): ${exports}${file.exports.length > 18 ? ', ...' : ''}`;
    })
    .join('\n');
  const bloated = result.bloatedFiles.length
    ? result.bloatedFiles
        .slice(0, 20)
        .map((file) => `- \`${file.path}\` - ${file.lines} lines`)
        .join('\n')
    : '_None._';
  const longFunctions = result.longFunctions.length
    ? result.longFunctions
        .slice(0, 20)
        .map((fn) => `- \`${fn.path}:${fn.startLine}\` - \`${fn.name}\` is ${fn.lineCount} lines`)
        .join('\n')
    : '_None above the configured limit._';
  const orphans = result.orphans.length
    ? result.orphans.map((file) => `- \`${file}\``).join('\n')
    : '_None detected._';
  const unused = result.unusedExports.length
    ? result.unusedExports
        .slice(0, 25)
        .map((entry) => `- \`${entry.symbol}\` in \`${entry.path}\``)
        .join('\n')
    : '_None detected._';
  const commands = Object.entries(result.project.commands)
    .filter(([, command]) => Boolean(command))
    .map(([name, command]) => `- **${name}**: \`${command}\``)
    .join('\n');
  const warnings = result.warnings.length
    ? result.warnings.map((warning) => `- ${warning}`).join('\n')
    : '_None._';

  return `# Codebase Map

> Generated by SpecVibe on ${result.generatedAt}${result.commit ? ` at commit \`${result.commit}\`` : ''}.
> This is a compressed architectural map for AI agents. Re-run \`specvibe scan\` after structural changes.
> The machine-readable index lives at \`.specvibe/context/scan.json\`.

## Project

- **Name:** ${result.project.name}
- **Stack:** ${result.project.stack.join(', ') || 'Unknown'}
- **Frameworks:** ${result.project.frameworks.join(', ') || 'None detected'}
- **Entry points:** ${result.project.entryPoints.map((entry) => `\`${entry}\``).join(', ') || 'None detected'}
- **Files scanned:** ${result.stats.files} (${result.stats.sourceFiles} source files, ${result.stats.totalLines} total lines)

${result.project.description ? `**Description:** ${result.project.description}\n` : ''}
## Quality Commands

${commands || '_No project commands detected. Add them to the project constitution._'}

## Languages

| Language | Files | Lines |
| --- | ---: | ---: |
${languages || '| Unknown | 0 | 0 |'}

## Layout

| Directory | Files | Lines |
| --- | ---: | ---: |
${directories || '| (root) | 0 | 0 |'}

## Existing Reuse Map

Use these symbols before creating anything new. \`inbound\` counts internal imports.

${reuse || '_No exported symbols detected._'}

## Largest Source Files

${largest || '_No source files detected._'}

## Size Limit Violations

Configured limit: **${result.limits.maxFileLines} lines per file**, **${result.limits.maxFunctionLines} lines per function**. Oversized files are candidates for extraction, not automatic rewrites.

${bloated}

## Long Functions

${longFunctions}

## Possible Orphaned Files

Heuristic only: these have no inbound internal imports, are not tests, and are not entry points. Confirm before deleting.

${orphans}

## Possible Unused Exports

Heuristic only: these exported symbols were not found outside their defining file. Public library APIs can legitimately appear here.

${unused}

## Focused Matches

${renderFocusFiles(result.focus)}

## Scanner Notes

${warnings}
`;
}

export async function writeScanArtifacts(root: string, result: ScanResult): Promise<void> {
  const paths = projectPaths(root);
  await writeJson(paths.scanJson, result, false);
  const summary = buildScanSummary(result);
  await writeText(paths.summary, summary);
  await updateState(root, (state) => {
    state.lastScan = {
      at: result.generatedAt,
      files: result.stats.files,
      sourceFiles: result.stats.sourceFiles,
      languages: result.stats.languages.slice(0, 8).map((language) => language.language),
      commit: result.commit,
    };
    return state;
  });
}

export async function loadScanResult(root: string): Promise<ScanResult | null> {
  return readJson<ScanResult | null>(projectPaths(root).scanJson, null);
}

export async function ensureScan(
  root: string,
  config: SpecVibeConfig,
  focus?: string,
  project?: ProjectInfo,
): Promise<ScanResult> {
  const result = await scanRepository({ root, config, focus, project });
  await writeScanArtifacts(root, result);
  if (await pathExists(projectPaths(root).summary)) {
    await appendHistory(root, {
      event: 'scan',
      detail: `${result.stats.files} files${focus ? `, focus: ${focus}` : ''}`,
    });
  }
  return result;
}

export function summarizeScanForCli(result: ScanResult): string[] {
  const lines = [
    `${result.stats.files} files, ${result.stats.sourceFiles} source files, ${result.stats.totalLines} lines`,
    `Languages: ${result.stats.languages
      .slice(0, 5)
      .map((language) => `${language.language} (${language.files})`)
      .join(', ')}`,
  ];
  if (result.bloatedFiles.length) {
    lines.push(
      `Bloated files: ${result.bloatedFiles
        .slice(0, 3)
        .map((file) => `${file.path} (${file.lines})`)
        .join(', ')}${result.bloatedFiles.length > 3 ? ', ...' : ''}`,
    );
  }
  if (result.longFunctions.length) lines.push(`Long functions: ${result.longFunctions.length}`);
  if (result.orphans.length) lines.push(`Possible orphans: ${result.orphans.length}`);
  if (result.focus?.length) lines.push(`Relevant files: ${result.focus.length}`);
  return lines;
}

export async function scanSummaryTokenCount(root: string): Promise<number> {
  const summary = await readText(projectPaths(root).summary, '');
  return estimateTokens(summary);
}

export async function loadStateForScan(root: string) {
  return loadState(root);
}
