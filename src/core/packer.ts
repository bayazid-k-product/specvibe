import path from 'node:path';
import type {
  PackFileSummary,
  PackResult,
  ScanResult,
  SpecVibeConfig,
  TrackMeta,
} from '../types.js';
import { pathExists, readJson, readText, writeText } from './fs.js';
import { projectPaths, trackFiles } from './paths.js';
import { loadState, saveState } from './state.js';
import { resolveTrack } from './track.js';
import { estimateTokens, isNoisePath, truncateByTokens } from './utils.js';

const SOURCE_EXTENSIONS =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue|svelte|py|pyi|go|rs|java|kt|kts|cs|rb|php|swift|c|h|cc|cpp|cxx|hpp|scala|ex|exs|dart|lua|sh|bash|ps1|sql|graphql|gql|proto|css|scss|sass|less|html|md|mdx)$/i;

const DOCUMENTATION_EXTENSIONS = /\.(md|mdx|markdown|txt|rst)$/i;

function languageForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.mts': 'ts',
    '.cts': 'ts',
    '.js': 'js',
    '.jsx': 'jsx',
    '.mjs': 'js',
    '.cjs': 'js',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.css': 'css',
    '.scss': 'scss',
    '.sql': 'sql',
    '.md': 'md',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };
  return map[ext] ?? 'text';
}

function docSection(title: string, file: string, content: string): string {
  const fenced = content.trim().replace(/```/g, '`` `');
  return `## ${title}\n\n> \`${file}\`\n\n\`\`\`\`markdown\n${fenced}\n\`\`\`\`\n`;
}

function extractMentionedPaths(docs: string[]): string[] {
  const found = new Set<string>();
  for (const doc of docs) {
    for (const match of doc.matchAll(/`([^`\n]+?)`/g)) {
      const candidate = match[1]?.trim();
      if (!candidate || candidate.startsWith('.specvibe') || candidate.includes('{{')) continue;
      if (SOURCE_EXTENSIONS.test(candidate)) found.add(candidate.replace(/\\/g, '/'));
    }
    // Also catch bare path-like tokens in task descriptions.
    for (const match of doc.matchAll(
      /\b((?:src|app|lib|packages|server|client|api|tests?)\/[\w./-]+\.\w+)\b/g,
    )) {
      if (match[1] && SOURCE_EXTENSIONS.test(match[1])) found.add(match[1]);
    }
  }
  return [...found];
}

async function readScan(root: string): Promise<ScanResult | null> {
  return readJson<ScanResult | null>(projectPaths(root).scanJson, null);
}

function loadTrackMetaOrNull(root: string, track: string | undefined): Promise<TrackMeta | null> {
  if (!track) return Promise.resolve(null);
  return resolveTrack(root, track).then((resolved) => resolved.meta);
}

export interface PackOptions {
  root: string;
  config: SpecVibeConfig;
  track?: string;
  maxTokens?: number;
  out?: string;
  write?: boolean;
}

export async function packContext(options: PackOptions): Promise<PackResult> {
  const { root, config } = options;
  const paths = projectPaths(root);
  const budget = Math.max(4000, options.maxTokens ?? config.pack.maxTokens);
  const docBudget = Math.floor(budget * 0.5);

  const meta = await loadTrackMetaOrNull(root, options.track);
  const slug = meta?.slug ?? null;
  let trackDocs: { proposal: string; spec: string; design: string; tasks: string } | null = null;
  if (slug) {
    const files = trackFiles(root, slug);
    trackDocs = {
      proposal: await readText(files.proposal, ''),
      spec: await readText(files.spec, ''),
      design: await readText(files.design, ''),
      tasks: await readText(files.tasks, ''),
    };
  }

  const [constitution, context, decisions, scan] = await Promise.all([
    readText(paths.constitution, ''),
    readText(paths.context, ''),
    readText(paths.decisions, ''),
    readScan(root),
  ]);
  const summary = await readText(paths.summary, '');
  const scanData = scan;

  const caps = {
    constitution: Math.floor(docBudget * 0.24),
    context: Math.floor(docBudget * 0.14),
    decisions: Math.floor(docBudget * 0.08),
    summary: Math.floor(docBudget * 0.24),
    track: Math.floor(docBudget * 0.075),
  };

  const truncatedDocs: string[] = [];
  const docs: Array<{ title: string; file: string; content: string }> = [];
  const addDoc = (title: string, file: string, content: string, cap: number) => {
    if (!content.trim()) return;
    const result = truncateByTokens(content, Math.max(120, cap));
    if (result.truncated) truncatedDocs.push(file);
    docs.push({ title, file, content: result.text });
  };

  addDoc('Constitution', '.specvibe/constitution.md', constitution, caps.constitution);
  addDoc('Project Context', '.specvibe/context.md', context, caps.context);
  addDoc('Architectural Decisions', '.specvibe/decisions.md', decisions, caps.decisions);
  if (slug && trackDocs) {
    addDoc(
      'Track Proposal',
      `.specvibe/tracks/${slug}/proposal.md`,
      trackDocs.proposal,
      caps.track,
    );
    addDoc('Track Specification', `.specvibe/tracks/${slug}/spec.md`, trackDocs.spec, caps.track);
    addDoc('Track Design', `.specvibe/tracks/${slug}/design.md`, trackDocs.design, caps.track);
    addDoc('Track Tasks', `.specvibe/tracks/${slug}/tasks.md`, trackDocs.tasks, caps.track);
  }
  addDoc('Codebase Map', '.specvibe/context/codebase-summary.md', summary, caps.summary);

  const candidates = new Set<string>();
  if (meta?.relevantFiles) {
    for (const file of meta.relevantFiles) candidates.add(file.path);
  }
  if (trackDocs) {
    for (const file of extractMentionedPaths(Object.values(trackDocs))) candidates.add(file);
  }
  if (scanData?.focus) {
    for (const file of scanData.focus) candidates.add(file.path);
  }
  if (!meta && candidates.size === 0 && scanData) {
    // No active track and no focus hint: pack the most connected project files.
    const ranked = [...scanData.files]
      .filter((file) => !isNoisePath(file.path) && !DOCUMENTATION_EXTENSIONS.test(file.path))
      .sort(
        (a, b) =>
          Number(b.isEntry) - Number(a.isEntry) ||
          Number(a.isTest) - Number(b.isTest) ||
          b.inbound - a.inbound ||
          b.codeLines - a.codeLines,
      )
      .slice(0, config.pack.maxFiles);
    for (const file of ranked) candidates.add(file.path);
  }
  if (options.track && !meta) {
    // resolveTrack already throws for a missing explicit track; this guards future changes.
    throw new Error(`Track not found: ${options.track}`);
  }

  const sourceFiles: PackFileSummary[] = [];
  const sourceSections: string[] = [];
  const omitted: string[] = [];
  let sourceCandidates = 0;
  let current = docs.map((doc) => docSection(doc.title, doc.file, doc.content)).join('\n');
  const headerBudget = Math.min(1200, Math.floor(budget * 0.06));
  const reservedHeader = estimateTokens('x'.repeat(headerBudget * 4));

  for (const candidate of candidates) {
    if (sourceCandidates >= config.pack.maxFiles) {
      omitted.push(candidate);
      continue;
    }
    if (!SOURCE_EXTENSIONS.test(candidate)) continue;
    const absolute = path.join(root, candidate);
    if (!(await pathExists(absolute))) continue;
    const info = scanData?.files.find((file) => file.path === candidate);
    sourceCandidates += 1;
    const content = await readText(absolute, '');
    const truncated = truncateByTokens(content, config.pack.maxFileTokens);
    const section = `### \`${candidate}\`${info ? ` (${info.lines} lines)` : ''}\n\n\`\`\`${languageForPath(candidate)}\n${truncated.text.trim()}\n\`\`\`\n`;
    const estimated = estimateTokens(section);
    if (estimateTokens(current) + reservedHeader + estimated > budget) {
      omitted.push(candidate);
      continue;
    }
    current += section;
    sourceFiles.push({
      path: candidate,
      lines: info?.lines ?? content.split(/\r?\n/).length,
      estimatedTokens: estimated,
      truncated: truncated.truncated,
    });
    if (truncated.truncated) truncatedDocs.push(candidate);
    sourceSections.push(section);
  }

  const included = sourceFiles.length;
  const omittedNote = omitted.length
    ? `\n## Omitted or truncated\n\nBudget limit reached. Omitted: ${omitted
        .map((file) => `\`${file}\``)
        .join(', ')}. Increase \`--max-tokens\` or narrow the task if these files are essential.\n`
    : '';
  const truncatedNote = truncatedDocs.length
    ? `\n> Truncated to fit the budget: ${truncatedDocs.map((file) => `\`${file}\``).join(', ')}.\n`
    : '';

  const trackLine = meta
    ? `Track: **${meta.title}** (\`${meta.slug}\`, ${meta.status})`
    : 'Project context only (no active track)';
  const header = `# SpecVibe Context Pack

> ${trackLine}
> Generated: ${new Date().toISOString()} · Budget: ~${budget.toLocaleString()} tokens · Source files included: ${included}${omitted.length ? ` · Omitted: ${omitted.length}` : ''}

## How to use this pack

This is the compressed context for a SpecVibe task. It contains the repository constitution, product context, active track, architectural map, and relevant source excerpts. Treat the constitution and approved spec as authoritative. Do not invent files or symbols that are not present here; read additional files only when the task requires them.

If you are an AI agent: follow the Plan → Apply → Unify loop. Do not write implementation code until the track is approved. Update tasks with the SpecVibe CLI and stop at verification gates.

${truncatedNote}
---

`;

  let markdown = header + current + omittedNote;
  // Final safety check: trim the whole payload if markdown overhead pushed us over.
  if (estimateTokens(markdown) > budget) {
    markdown = truncateByTokens(markdown, budget).text;
    truncatedDocs.push('(pack payload)');
  }
  const estimatedTokens = estimateTokens(markdown);

  const outRelative = options.out
    ? path.isAbsolute(options.out)
      ? options.out
      : path.join(root, options.out)
    : path.join(paths.packs, `${slug ?? 'project-context'}.md`);
  if (options.write !== false) {
    await writeText(outRelative, markdown);
    const state = await loadState(root);
    state.lastPack = {
      at: new Date().toISOString(),
      track: slug,
      path: path.relative(root, outRelative).split(path.sep).join('/'),
      estimatedTokens,
    };
    await saveState(root, state);
  }

  return {
    track: slug,
    path: outRelative,
    markdown,
    estimatedTokens,
    budgetTokens: budget,
    included: sourceFiles,
    omitted,
    truncated: truncatedDocs.length > 0,
  };
}
