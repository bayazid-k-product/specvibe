import process from 'node:process';

const ansi = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  gray: '\u001b[90m',
};

export type LoggerOptions = {
  quiet?: boolean;
  color?: boolean;
};

function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout.isTTY);
}

/**
 * Small dependency-free logger with NO_COLOR support.
 */
export class Logger {
  private readonly quiet: boolean;
  private readonly color: boolean;

  constructor(options: LoggerOptions = {}) {
    this.quiet = options.quiet ?? false;
    this.color = options.color ?? supportsColor();
  }

  get isQuiet(): boolean {
    return this.quiet;
  }

  private paint(text: string, ...codes: string[]): string {
    if (!this.color) return text;
    return `${codes.join('')}${text}${ansi.reset}`;
  }

  write(text = ''): void {
    process.stdout.write(`${text}\n`);
  }

  info(message: string): void {
    if (!this.quiet) this.write(message);
  }

  dim(message: string): void {
    if (!this.quiet) this.write(this.paint(message, ansi.gray));
  }

  success(message: string): void {
    if (!this.quiet) this.write(`${this.paint('ok', ansi.green, ansi.bold)} ${message}`);
  }

  warn(message: string): void {
    if (!this.quiet) this.write(`${this.paint('warn', ansi.yellow, ansi.bold)} ${message}`);
  }

  error(message: string): void {
    process.stderr.write(`${this.paint('error', ansi.red, ansi.bold)} ${message}\n`);
  }

  title(message: string): void {
    if (!this.quiet) this.write(`\n${this.paint(message, ansi.bold, ansi.cyan)}`);
  }

  heading(message: string): void {
    if (!this.quiet) this.write(this.paint(message, ansi.bold));
  }

  accent(message: string): string {
    return this.paint(message, ansi.cyan);
  }

  green(message: string): string {
    return this.paint(message, ansi.green);
  }

  yellow(message: string): string {
    return this.paint(message, ansi.yellow);
  }

  red(message: string): string {
    return this.paint(message, ansi.red);
  }

  bold(message: string): string {
    return this.paint(message, ansi.bold);
  }

  muted(message: string): string {
    return this.paint(message, ansi.gray);
  }

  /** Print a two-column list with a fixed label width. */
  keyValue(label: string, value: string, width = 16): void {
    if (this.quiet) return;
    this.write(`${label.padEnd(width)} ${value}`);
  }

  /** Render a dependency-free progress bar. */
  progress(completed: number, total: number, width = 20): string {
    if (total <= 0) return `[${'-'.repeat(width)}] 0%`;
    const ratio = Math.min(1, completed / total);
    const filled = Math.round(ratio * width);
    const bar = `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
    return `[${bar}] ${Math.round(ratio * 100)}%`;
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

/** A logger that discards normal output, used by library consumers and tests. */
export const silentLogger = new Logger({ quiet: true, color: false });
