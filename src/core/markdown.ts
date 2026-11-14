import type { ChecklistItem, TaskKind } from '../types.js';

interface Heading {
  line: number; // 0-based index
  level: number;
  title: string;
}

export interface MarkdownSection {
  title: string;
  level: number;
  startLine: number; // 1-based line of heading
  endLine: number; // 1-based inclusive end
  content: string;
}

function headings(content: string): Heading[] {
  const result: Heading[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match?.[1] && match[2]) {
      result.push({
        line: index,
        level: match[1].length,
        title: match[2].replace(/\s+#+$/, '').trim(),
      });
    }
  });
  return result;
}

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Find a markdown section by heading. Substring match is allowed. */
export function findSection(content: string, title: string): MarkdownSection | null {
  const all = headings(content);
  const wanted = normalizeHeading(title);
  const index = all.findIndex((heading) => {
    const normalized = normalizeHeading(heading.title);
    return (
      normalized === wanted || normalized.startsWith(`${wanted} `) || normalized.includes(wanted)
    );
  });
  if (index < 0) return null;
  const heading = all[index];
  if (!heading) return null;
  const next = all.slice(index + 1).find((candidate) => candidate.level <= heading.level);
  const lines = content.split(/\r?\n/);
  const startLine = heading.line + 1;
  const endLine = next ? next.line : lines.length; // next.line is 0-based -> exclusive
  return {
    title: heading.title,
    level: heading.level,
    startLine,
    endLine,
    content: lines.slice(heading.line + 1, next ? next.line : lines.length).join('\n'),
  };
}

function kindFromSection(section: string): TaskKind {
  const normalized = normalizeHeading(section);
  if (normalized.includes('acceptance')) return 'acceptance';
  if (normalized.includes('verification') || normalized.includes('gate')) return 'gate';
  if (normalized.includes('completion') || normalized.includes('done')) return 'completion';
  if (normalized.includes('decision')) return 'decision';
  return 'task';
}

function kindFromId(id: string | null, section: string): TaskKind {
  if (id?.startsWith('AC-')) return 'acceptance';
  if (id?.startsWith('G')) return 'gate';
  if (id?.startsWith('C')) return 'completion';
  if (id?.startsWith('D')) return 'decision';
  if (id?.startsWith('T')) return 'task';
  return kindFromSection(section);
}

function extractId(rawText: string): { id: string | null; text: string } {
  const text = rawText.trim();
  const match = text.match(
    /^(?:\*\*|__|`|\[)?\s*((?:AC|T|G|C|D)-?\d+)\s*(?:\*\*|__|`|\])?\s*(?:[—–\-:.)]\s*|\s+)(.*)$/i,
  );
  if (!match?.[1]) return { id: null, text };
  const id = match[1].toUpperCase().replace(/^([TGCD])(\d+)$/, '$1$2');
  return { id, text: (match[2] ?? '').trim() };
}

/**
 * Parse markdown checklist items. If `sectionTitle` is supplied, only items
 * inside that section (including its subsections) are returned.
 */
export function parseChecklist(content: string, sectionTitle?: string): ChecklistItem[] {
  const lines = content.split(/\r?\n/);
  let rangeStart = 0;
  let rangeEnd = lines.length;
  let section = '';
  if (sectionTitle) {
    const found = findSection(content, sectionTitle);
    if (!found) return [];
    rangeStart = found.startLine; // skip heading, use next line (1-based -> index)
    rangeEnd = found.endLine;
    section = found.title;
  }

  const items: ChecklistItem[] = [];
  for (let index = rangeStart; index < rangeEnd; index += 1) {
    const line = lines[index] ?? '';
    const match = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (!match?.[3]) continue;
    const { id, text } = extractId(match[3]);
    items.push({
      id,
      text,
      checked: match[2]?.toLowerCase() === 'x',
      line: index + 1,
      section: section || findContainingSection(content, index + 1),
      kind: kindFromId(id, section || findContainingSection(content, index + 1)),
    });
  }
  return items;
}

function findContainingSection(content: string, lineNumber: number): string {
  const all = headings(content).filter((heading) => heading.line + 1 < lineNumber);
  return all.at(-1)?.title ?? '';
}

/** Toggle one checklist item by ID, returning null when it does not exist. */
export function toggleChecklistItem(
  content: string,
  id: string,
  checked: boolean,
  sectionTitle?: string,
): { content: string; item: ChecklistItem } | null {
  const items = parseChecklist(content, sectionTitle);
  const target = items.find((item) => item.id?.toUpperCase() === id.toUpperCase());
  if (!target) return null;
  const lines = content.split(/\r?\n/);
  const line = lines[target.line - 1];
  if (line === undefined) return null;
  const replacement = line.replace(/\[([ xX])\]/, checked ? '[x]' : '[ ]');
  lines[target.line - 1] = replacement;
  return {
    content: lines.join('\n'),
    item: { ...target, checked },
  };
}

export function markdownTable(headers: string[], rows: string[][]): string {
  const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const renderRow = (row: string[]) =>
    `| ${row.map((cell, index) => escapeCell(cell).padEnd(widths[index] ?? 0)).join(' | ')} |`;
  const separator = `| ${widths.map((width) => '-'.repeat(Math.max(3, width))).join(' | ')} |`;
  return [renderRow(headers), separator, ...rows.map(renderRow)].join('\n');
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCommandFromText(text: string): string | undefined {
  const backtick = text.match(/`([^`]+)`/);
  if (backtick?.[1]) return backtick[1].trim();
  const afterColon = text.match(/:\s*([^;]+)$/);
  return afterColon?.[1]?.trim();
}
