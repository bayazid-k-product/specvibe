import { describe, expect, it } from 'vitest';
import {
  applyAnswersToProject,
  applyInterviewAnswers,
  canInterview,
  parseListInput,
} from '../src/core/interview.js';
import type { ProjectInfo } from '../src/types.js';

const detected: ProjectInfo = {
  name: 'demo',
  description: '',
  stack: ['Unknown'],
  languages: [],
  frameworks: [],
  packageManager: null,
  manifests: [],
  entryPoints: [],
  topLevelDirs: [],
  commands: {},
  isGitRepo: false,
};

const contextDocument = [
  '# Project Context — demo',
  '',
  '_Describe what **demo** does and who it serves. Refine this section with `/sv:setup`._',
  '',
  '**Stack:** Unknown',
  '',
  '**Frameworks:** None detected',
  '',
  '**Entry points:** None detected',
  '',
  '## Conventions',
  '',
  '- Hand-written rule that must survive.',
].join('\n');

describe('parseListInput', () => {
  it('splits, trims, and drops empty entries', () => {
    expect(parseListInput('HTML, CSS ,, JavaScript')).toEqual(['HTML', 'CSS', 'JavaScript']);
  });

  it('returns an empty list for a blank answer', () => {
    expect(parseListInput('   ')).toEqual([]);
  });
});

describe('applyInterviewAnswers', () => {
  it('replaces the generated placeholders with the answers', () => {
    const patched = applyInterviewAnswers(contextDocument, {
      description: 'A small marketing site for a Nusa landing page.',
      stack: ['HTML', 'CSS', 'JavaScript'],
      frameworks: ['Tailwind CSS'],
      entryPoints: ['index.html'],
    });

    expect(patched).toContain('A small marketing site for a Nusa landing page.');
    expect(patched).toContain('**Stack:** HTML, CSS, JavaScript');
    expect(patched).toContain('**Frameworks:** Tailwind CSS');
    expect(patched).toContain('**Entry points:** index.html');
    expect(patched).not.toContain('_Describe what **demo** does');
    expect(patched).not.toContain('**Stack:** Unknown');
  });

  it('keeps everything the human wrote outside the placeholders', () => {
    const patched = applyInterviewAnswers(contextDocument, { stack: ['TypeScript'] });
    expect(patched).toContain('- Hand-written rule that must survive.');
    expect(patched).toContain('# Project Context — demo');
    expect(patched).toContain('**Frameworks:** None detected');
  });

  it('leaves a document untouched when there are no answers', () => {
    expect(applyInterviewAnswers(contextDocument, {})).toBe(contextDocument);
  });

  it('patches the constitution wording for the same facts', () => {
    const constitution = [
      '# Project Constitution — demo',
      '',
      '**Tech stack:** Unknown',
      '',
      '**Frameworks and major tools:** None detected',
      '',
      '**Entry points:** None detected',
    ].join('\n');

    const patched = applyInterviewAnswers(constitution, {
      stack: ['HTML', 'CSS'],
      frameworks: ['Bootstrap'],
      entryPoints: ['index.html'],
    });

    expect(patched).toContain('**Tech stack:** HTML, CSS');
    expect(patched).toContain('**Frameworks and major tools:** Bootstrap');
    expect(patched).toContain('**Entry points:** index.html');
    expect(patched).not.toContain('Unknown');
  });
});

describe('applyAnswersToProject', () => {
  it('prefers the answers over the detected values', () => {
    const merged = applyAnswersToProject(detected, {
      description: 'A landing page',
      stack: ['HTML'],
    });
    expect(merged.description).toBe('A landing page');
    expect(merged.stack).toEqual(['HTML']);
  });

  it('keeps detected values that were not answered', () => {
    const merged = applyAnswersToProject(
      { ...detected, frameworks: ['React'], stack: ['TypeScript'] },
      { description: 'A dashboard' },
    );
    expect(merged.frameworks).toEqual(['React']);
    expect(merged.stack).toEqual(['TypeScript']);
  });
});

describe('canInterview', () => {
  it('is off when the streams are not terminals', () => {
    expect(
      canInterview({ input: { isTTY: false } as never, output: { isTTY: true } as never }),
    ).toBe(false);
  });

  it('is on when both streams are terminals', () => {
    expect(
      canInterview({ input: { isTTY: true } as never, output: { isTTY: true } as never }),
    ).toBe(true);
  });
});
