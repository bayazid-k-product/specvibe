import process from 'node:process';
import readline from 'node:readline/promises';
import type { ProjectInfo } from '../types.js';

/** Facts the human can supply when detection cannot figure them out. */
export interface InterviewAnswers {
  description?: string;
  stack?: string[];
  frameworks?: string[];
  entryPoints?: string[];
}

export interface InterviewStreams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

/** Prompts only make sense for a person sitting at a terminal. */
export function canInterview(streams: Partial<InterviewStreams> = {}): boolean {
  const input = (streams.input ?? process.stdin) as { isTTY?: boolean };
  const output = (streams.output ?? process.stdout) as { isTTY?: boolean };
  return Boolean(input.isTTY && output.isTTY);
}

/** Split a comma-separated answer, dropping empty items. */
export function parseListInput(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const SKIP_WORDS = new Set(['-', 'skip', 'none', 'no', 'n/a']);

async function ask(rl: readline.Interface, question: string, fallback?: string): Promise<string> {
  const fallbackText = fallback ? ` [${fallback}]` : '';
  let raw: string;
  try {
    raw = await rl.question(`> ${question}${fallbackText} `);
  } catch {
    return '';
  }
  const answer = raw.trim();
  if (!answer) return fallback?.trim() ?? '';
  if (SKIP_WORDS.has(answer.toLowerCase())) return '';
  return answer;
}

/**
 * Ask a short set of questions about the project. Every question keeps the
 * detected value as its default, so pressing Enter accepts it and typing
 * "skip" clears it.
 */
export async function interviewProject(
  project: ProjectInfo,
  streams: Partial<InterviewStreams> = {},
): Promise<InterviewAnswers> {
  const input = streams.input ?? process.stdin;
  const output = streams.output ?? process.stdout;
  const rl = readline.createInterface({ input, output });

  const detectedStack = project.stack.filter((entry) => entry.toLowerCase() !== 'unknown');
  const answers: InterviewAnswers = {};

  try {
    const description = await ask(
      rl,
      'What does this project do? One sentence is enough.',
      project.description || undefined,
    );
    if (description) answers.description = description;

    const stack = await ask(
      rl,
      'Which stack and languages does it use? Comma separated, e.g. HTML, CSS, JavaScript',
      detectedStack.length ? detectedStack.join(', ') : undefined,
    );
    if (stack) answers.stack = parseListInput(stack);

    const frameworks = await ask(
      rl,
      'Any frameworks or libraries worth naming? Comma separated, or skip',
      project.frameworks.length ? project.frameworks.join(', ') : undefined,
    );
    if (frameworks) answers.frameworks = parseListInput(frameworks);

    const entryPoints = await ask(
      rl,
      'Which file is the starting point? Comma separated, or skip',
      project.entryPoints.length ? project.entryPoints.join(', ') : undefined,
    );
    if (entryPoints) answers.entryPoints = parseListInput(entryPoints);
  } finally {
    rl.close();
  }

  return answers;
}

function replacePrefixedLine(content: string, prefix: string, replacement: string): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.trim().startsWith(prefix));
  if (index < 0) return content;
  lines[index] = replacement;
  return lines.join('\n');
}

/**
 * Replace the generated "describe what this project does" placeholder with a
 * real answer. Hand-written prose is left untouched.
 */
function replaceDescriptionPlaceholder(content: string, description: string): string {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => /^_Describe what \*\*.+\*\* does.*_$/.test(line.trim()));
  if (index < 0) return content;
  lines[index] = description;
  return lines.join('\n');
}

/**
 * Apply interview answers to an already generated context or constitution
 * document without touching anything else the human wrote.
 */
export function applyInterviewAnswers(content: string, answers: InterviewAnswers): string {
  let next = content;
  if (answers.description) {
    next = replaceDescriptionPlaceholder(next, answers.description);
  }
  if (answers.stack?.length) {
    next = replacePrefixedLine(next, '**Stack:**', `**Stack:** ${answers.stack.join(', ')}`);
  }
  if (answers.frameworks?.length) {
    next = replacePrefixedLine(
      next,
      '**Frameworks:**',
      `**Frameworks:** ${answers.frameworks.join(', ')}`,
    );
  }
  if (answers.entryPoints?.length) {
    next = replacePrefixedLine(
      next,
      '**Entry points:**',
      `**Entry points:** ${answers.entryPoints.join(', ')}`,
    );
  }
  return next;
}

/** Merge answers into the detected project so generated documents use them. */
export function applyAnswersToProject(
  project: ProjectInfo,
  answers: InterviewAnswers,
): ProjectInfo {
  return {
    ...project,
    description: answers.description ?? project.description,
    stack: answers.stack?.length ? answers.stack : project.stack,
    frameworks: answers.frameworks?.length ? answers.frameworks : project.frameworks,
    entryPoints: answers.entryPoints?.length ? answers.entryPoints : project.entryPoints,
  };
}
