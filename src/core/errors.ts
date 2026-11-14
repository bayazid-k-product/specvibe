export type ErrorCode =
  | 'USAGE'
  | 'IO'
  | 'CONFIG'
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'TRACK_NOT_FOUND'
  | 'TRACK_EXISTS'
  | 'INVALID_STATE'
  | 'VALIDATION_FAILED'
  | 'GIT_REQUIRED'
  | 'GIT_DIRTY'
  | 'GIT_ERROR'
  | 'INTERNAL';

const EXIT_CODES: Record<ErrorCode, number> = {
  USAGE: 2,
  IO: 1,
  CONFIG: 3,
  NOT_INITIALIZED: 3,
  ALREADY_INITIALIZED: 3,
  TRACK_NOT_FOUND: 3,
  TRACK_EXISTS: 3,
  INVALID_STATE: 4,
  VALIDATION_FAILED: 3,
  GIT_REQUIRED: 4,
  GIT_DIRTY: 4,
  GIT_ERROR: 5,
  INTERNAL: 1,
};

/**
 * An expected, user-actionable failure. The CLI prints `message` and `hint`
 * without a stack trace unless --debug is set.
 */
export class SpecVibeError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options: { hint?: string; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'SpecVibeError';
    this.code = code;
    this.hint = options.hint;
    this.exitCode = EXIT_CODES[code];
    this.details = options.details;
  }
}

export function isSpecVibeError(error: unknown): error is SpecVibeError {
  return error instanceof SpecVibeError;
}

export function usageError(message: string, hint?: string): SpecVibeError {
  return new SpecVibeError('USAGE', message, { hint });
}
