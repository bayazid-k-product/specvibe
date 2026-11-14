/**
 * Public library surface for SpecVibe.
 *
 * The CLI is a thin layer over these modules. Everything persisted under
 * `.specvibe/` is plain JSON or Markdown, so consumers can inspect and edit
 * it with standard tools.
 */

export { runCli } from './cli/run.js';
export {
  type InitializeOptions,
  type InitializeResult,
  initializeProject,
} from './commands/init.js';

export * from './core/agents.js';
export * from './core/config.js';
export * from './core/errors.js';
export * from './core/fs.js';
export * from './core/git.js';
export * from './core/logger.js';
export * from './core/markdown.js';
export * from './core/packer.js';
export * from './core/paths.js';
export * from './core/project.js';
export * from './core/scanner.js';
export * from './core/slug.js';
export * from './core/state.js';
export * from './core/templates.js';
export * from './core/track.js';
export * from './core/utils.js';
export * from './types.js';
export * from './version.js';
