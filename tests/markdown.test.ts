import { describe, expect, it } from 'vitest';
import {
  extractCommandFromText,
  findSection,
  markdownTable,
  parseChecklist,
  stripMarkdown,
  toggleChecklistItem,
} from '../src/core/markdown.js';

const DOCUMENT = `# Track

## Acceptance Criteria

- [ ] AC-1 — First observable outcome.
- [x] AC-2 — Second outcome.

## Tasks

- [ ] T1 — Implement the thing.
- [ ] T2 — Add tests.
- [x] G1 — Build passes: \`npm run build\`
`;

describe('findSection', () => {
  it('finds a section and stops at the next heading of the same level', () => {
    const section = findSection(DOCUMENT, 'Acceptance Criteria');
    expect(section).not.toBeNull();
    expect(section?.content).toContain('AC-1');
    expect(section?.content).not.toContain('T1');
  });

  it('returns null for a missing section', () => {
    expect(findSection(DOCUMENT, 'Nonexistent')).toBeNull();
  });
});

describe('parseChecklist', () => {
  it('parses IDs, kinds, checked state, and section names', () => {
    const items = parseChecklist(DOCUMENT, 'Acceptance Criteria');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'AC-1', checked: false, kind: 'acceptance' });
    expect(items[1]).toMatchObject({ id: 'AC-2', checked: true, kind: 'acceptance' });
  });

  it('infers gate kinds from IDs and sections', () => {
    const items = parseChecklist(DOCUMENT);
    const gate = items.find((item) => item.id === 'G1');
    expect(gate?.kind).toBe('gate');
    expect(gate?.section).toBe('Tasks');
  });

  it('returns an empty list when the section does not exist', () => {
    expect(parseChecklist(DOCUMENT, 'Missing')).toEqual([]);
  });
});

describe('toggleChecklistItem', () => {
  it('checks the matching item without touching others', () => {
    const result = toggleChecklistItem(DOCUMENT, 'AC-1', true, 'Acceptance Criteria');
    expect(result).not.toBeNull();
    expect(result?.content).toContain('- [x] AC-1');
    expect(result?.content).toContain('- [x] AC-2');
    expect(result?.item.checked).toBe(true);
  });

  it('does not match IDs outside the requested section', () => {
    expect(toggleChecklistItem(DOCUMENT, 'G1', false, 'Acceptance Criteria')).toBeNull();
  });
});

describe('markdownTable', () => {
  it('escapes pipes and aligns columns', () => {
    const table = markdownTable(['A', 'B'], [['x|y', 'line\nbreak']]);
    expect(table).toContain('| A');
    expect(table).toContain('x\\|y');
    expect(table).toContain('line break');
  });
});

describe('stripMarkdown and extractCommandFromText', () => {
  it('removes formatting and captures the command', () => {
    expect(stripMarkdown('## Title\n\nA **bold** `value` and [link](https://example.com).')).toBe(
      'Title A bold value and link.',
    );
    expect(extractCommandFromText('Build passes: `npm run build`')).toBe('npm run build');
    expect(extractCommandFromText('Tests pass: npm test')).toBe('npm test');
  });
});
