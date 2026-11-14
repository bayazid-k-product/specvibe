import fs from 'node:fs/promises';
import path from 'node:path';
import type { CommandInfo, ProjectInfo } from '../types.js';
import { pathExists, readText } from './fs.js';
import { gitInfo } from './git.js';

type PackageJson = {
  name?: string;
  description?: string;
  main?: string;
  module?: string;
  types?: string;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const FRAMEWORK_MARKERS: Array<[string, string]> = [
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['@angular/core', 'Angular'],
  ['svelte', 'Svelte'],
  ['@sveltejs/kit', 'SvelteKit'],
  ['vue', 'Vue'],
  ['react', 'React'],
  ['react-native', 'React Native'],
  ['expo', 'Expo'],
  ['astro', 'Astro'],
  ['@remix-run/node', 'Remix'],
  ['solid-js', 'SolidStart'],
  ['@nestjs/core', 'NestJS'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
  ['hono', 'Hono'],
  ['koa', 'Koa'],
  ['electron', 'Electron'],
  ['tailwindcss', 'Tailwind CSS'],
  ['prisma', 'Prisma'],
  ['drizzle-orm', 'Drizzle ORM'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['playwright', 'Playwright'],
  ['cypress', 'Cypress'],
];

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readText(file)) as T;
  } catch {
    return null;
  }
}

function cleanReadme(readme: string): { title?: string; description?: string } {
  const withoutComments = readme.replace(/<!--[\s\S]*?-->/g, '');
  const titleMatch = withoutComments.match(/^#\s+(.+)$/m);
  const lines = withoutComments.split(/\r?\n/);
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('---')) {
      if (current.length) paragraphs.push(current.join(' '));
      current = [];
      continue;
    }
    if (!trimmed) {
      if (current.length) paragraphs.push(current.join(' '));
      current = [];
      continue;
    }
    if (
      /^\[!\[/.test(trimmed) ||
      /^!\[/.test(trimmed) ||
      /^<[^>]+>/.test(trimmed) ||
      /^\[!\[.*\]\(.*\)\]/.test(trimmed)
    ) {
      continue;
    }
    current.push(trimmed.replace(/<[^>]+>/g, ''));
  }
  if (current.length) paragraphs.push(current.join(' '));
  const description = paragraphs
    .map((paragraph) => paragraph.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '').trim())
    .find((paragraph) => paragraph.length >= 20 && !paragraph.startsWith('http'));
  return {
    title: titleMatch?.[1]?.trim(),
    description: description?.replace(/\s+/g, ' ').slice(0, 400),
  };
}

function inferNodeCommands(pkg: PackageJson | null, packageManager: string): CommandInfo {
  const scripts = pkg?.scripts ?? {};
  const runner = (name: string): string => {
    if (packageManager === 'pnpm') return `pnpm ${name}`;
    if (packageManager === 'yarn') return `yarn ${name}`;
    if (packageManager === 'bun') return `bun run ${name}`;
    return `npm run ${name}`;
  };
  const commands: CommandInfo = {};
  if (scripts.build) commands.build = runner('build');
  if (scripts.test) commands.test = runner('test');
  if (scripts.lint) commands.lint = runner('lint');
  if (scripts.typecheck) commands.typecheck = runner('typecheck');
  else if (scripts['check-types']) commands.typecheck = runner('check-types');
  else if (scripts['type-check']) commands.typecheck = runner('type-check');
  if (scripts.format) commands.format = runner('format');
  return commands;
}

async function detectPackageManager(root: string): Promise<string> {
  if (await pathExists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await pathExists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (await pathExists(path.join(root, 'bun.lockb'))) return 'bun';
  if (await pathExists(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function inferPython(
  content: string,
  _root: string,
  hasUvLock: boolean,
  hasPoetryLock: boolean,
  hasPipfileLock: boolean,
): { frameworks: string[]; commands: CommandInfo; stack: string[] } {
  const lower = content.toLowerCase();
  const prefix = hasUvLock
    ? 'uv run '
    : hasPoetryLock
      ? 'poetry run '
      : hasPipfileLock
        ? 'pipenv run '
        : '';
  const frameworks: string[] = [];
  for (const [marker, name] of [
    ['django', 'Django'],
    ['fastapi', 'FastAPI'],
    ['flask', 'Flask'],
    ['pytest', 'pytest'],
    ['ruff', 'Ruff'],
    ['mypy', 'mypy'],
    ['sqlalchemy', 'SQLAlchemy'],
    ['pydantic', 'Pydantic'],
  ] as const) {
    if (lower.includes(marker)) frameworks.push(name);
  }
  const commands: CommandInfo = {};
  if (lower.includes('pytest')) commands.test = `${prefix}pytest`;
  if (lower.includes('ruff')) commands.lint = `${prefix}ruff check .`;
  if (lower.includes('mypy')) commands.typecheck = `${prefix}mypy .`;
  if (lower.includes('black')) commands.format = `${prefix}black .`;
  if (lower.includes('[build-system]')) commands.build = 'python -m build';
  return { frameworks, commands, stack: ['Python'] };
}

async function findEntryPoints(root: string, pkg: PackageJson | null): Promise<string[]> {
  const candidates = new Set<string>();
  const bin = pkg?.bin;
  if (typeof bin === 'string') candidates.add(bin);
  if (bin && typeof bin === 'object') {
    for (const value of Object.values(bin)) candidates.add(value);
  }
  for (const field of [pkg?.main, pkg?.module]) {
    if (field) candidates.add(field);
  }
  for (const candidate of [
    'src/index.ts',
    'src/index.tsx',
    'src/index.js',
    'src/main.ts',
    'src/main.tsx',
    'src/main.js',
    'src/cli.ts',
    'src/cli.js',
    'index.ts',
    'index.js',
    'main.py',
    'app.py',
    'manage.py',
    'src/main.rs',
    'src/lib.rs',
    'main.go',
    'cmd/main.go',
  ]) {
    candidates.add(candidate);
  }
  const existing: string[] = [];
  for (const candidate of candidates) {
    if (await pathExists(path.join(root, candidate))) existing.push(candidate);
  }
  return uniq(existing);
}

/**
 * Infer the project's stack, frameworks, quality commands, and entry points
 * from manifests and conventional files. No network calls, no package installs.
 */
export async function detectProject(root: string): Promise<ProjectInfo> {
  const pkg = await readJsonIfExists<PackageJson>(path.join(root, 'package.json'));
  const packageManager = await detectPackageManager(root);
  const manifests: string[] = [];
  const stack: string[] = [];
  const frameworks: string[] = [];
  let commands: CommandInfo = {};

  const [
    hasTsconfig,
    hasPyproject,
    hasRequirements,
    hasSetupPy,
    hasPipfile,
    hasCargo,
    hasGoMod,
    hasPom,
    hasGradle,
    hasGemfile,
    hasComposer,
    hasCsproj,
    hasUvLock,
    hasPoetryLock,
    hasPipfileLock,
  ] = await Promise.all([
    pathExists(path.join(root, 'tsconfig.json')),
    pathExists(path.join(root, 'pyproject.toml')),
    pathExists(path.join(root, 'requirements.txt')),
    pathExists(path.join(root, 'setup.py')),
    pathExists(path.join(root, 'Pipfile')),
    pathExists(path.join(root, 'Cargo.toml')),
    pathExists(path.join(root, 'go.mod')),
    pathExists(path.join(root, 'pom.xml')),
    pathExists(path.join(root, 'build.gradle')) || pathExists(path.join(root, 'build.gradle.kts')),
    pathExists(path.join(root, 'Gemfile')),
    pathExists(path.join(root, 'composer.json')),
    pathExists(path.join(root, 'global.json')),
    pathExists(path.join(root, 'uv.lock')),
    pathExists(path.join(root, 'poetry.lock')),
    pathExists(path.join(root, 'Pipfile.lock')),
  ]);

  if (pkg) {
    manifests.push('package.json');
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    stack.push(hasTsconfig ? 'TypeScript' : 'JavaScript');
    if (hasTsconfig && !deps.typescript) stack.push('TypeScript');
    for (const [marker, name] of FRAMEWORK_MARKERS) {
      if (marker in deps && !frameworks.includes(name)) frameworks.push(name);
    }
    commands = inferNodeCommands(pkg, packageManager);
    if (hasTsconfig && !commands.typecheck) commands.typecheck = 'tsc --noEmit';
  }

  if (hasPyproject || hasRequirements || hasSetupPy || hasPipfile) {
    const sources = await Promise.all([
      hasPyproject ? readText(path.join(root, 'pyproject.toml')) : Promise.resolve(''),
      hasRequirements ? readText(path.join(root, 'requirements.txt')) : Promise.resolve(''),
      hasPipfile ? readText(path.join(root, 'Pipfile')) : Promise.resolve(''),
    ]);
    if (hasPyproject) manifests.push('pyproject.toml');
    else if (hasRequirements) manifests.push('requirements.txt');
    const python = inferPython(sources.join('\n'), root, hasUvLock, hasPoetryLock, hasPipfileLock);
    stack.push(...python.stack);
    frameworks.push(...python.frameworks);
    commands = { ...python.commands, ...commands };
    if (hasUvLock || hasPoetryLock) manifests.push(hasUvLock ? 'uv.lock' : 'poetry.lock');
  }

  if (hasCargo) {
    manifests.push('Cargo.toml');
    stack.push('Rust');
    commands = {
      build: commands.build ?? 'cargo build',
      test: commands.test ?? 'cargo test',
      lint: commands.lint ?? 'cargo clippy -- -D warnings',
      format: commands.format ?? 'cargo fmt',
    };
  }
  if (hasGoMod) {
    manifests.push('go.mod');
    stack.push('Go');
    commands = {
      build: commands.build ?? 'go build ./...',
      test: commands.test ?? 'go test ./...',
      lint: commands.lint ?? 'go vet ./...',
      format: commands.format ?? 'gofmt -w .',
    };
  }
  if (hasPom) {
    manifests.push('pom.xml');
    stack.push('Java');
    commands = { build: commands.build ?? 'mvn package', test: commands.test ?? 'mvn test' };
  } else if (hasGradle) {
    manifests.push('build.gradle');
    stack.push('Java');
    commands = { build: commands.build ?? 'gradle build', test: commands.test ?? 'gradle test' };
  }
  if (hasGemfile) {
    manifests.push('Gemfile');
    stack.push('Ruby');
  }
  if (hasComposer) {
    manifests.push('composer.json');
    stack.push('PHP');
  }
  if (hasCsproj) {
    manifests.push('*.csproj');
    stack.push('.NET');
    commands = {
      build: commands.build ?? 'dotnet build',
      test: commands.test ?? 'dotnet test',
    };
  }

  const readme = await readText(path.join(root, 'README.md'), '');
  const cleaned = cleanReadme(readme);
  const name = pkg?.name || cleaned.title || path.basename(root);
  const description = pkg?.description || cleaned.description || '';

  const topLevelEntries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const topLevelDirs = topLevelEntries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        ![
          'node_modules',
          '.git',
          '.specvibe',
          'dist',
          'build',
          'coverage',
          '.next',
          'target',
        ].includes(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
    .slice(0, 30);

  const entryPoints = await findEntryPoints(root, pkg);
  const git = await gitInfo(root);

  return {
    name,
    description,
    stack: uniq(stack.length ? stack : ['Unknown']),
    languages: uniq(stack),
    frameworks: uniq(frameworks).slice(0, 10),
    packageManager: pkg ? packageManager : null,
    manifests: uniq(manifests),
    entryPoints,
    topLevelDirs,
    commands,
    isGitRepo: git.isRepo,
    gitBranch: git.branch,
    gitCommit: git.head?.slice(0, 7),
  };
}
