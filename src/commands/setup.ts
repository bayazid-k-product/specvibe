import { emit } from '../cli/output.js';
import { type CommandContext, flagBoolean, flagString } from '../cli/types.js';
import { parseAgentList } from '../core/agents.js';
import { canInterview } from '../core/interview.js';
import { initializeProject, renderInitialization } from './init.js';

export async function runSetup(context: CommandContext): Promise<{ exitCode?: number }> {
  const agentsRaw = flagString(context.flags, 'agents');
  const agentsSpecified = agentsRaw !== undefined;
  const result = await initializeProject(context, {
    agents: agentsSpecified ? parseAgentList(agentsRaw) : undefined,
    agentsSpecified,
    name: flagString(context.flags, 'name'),
    description: flagString(context.flags, 'description'),
    scan: !flagBoolean(context.flags, 'no-scan'),
    writeAgents: !flagBoolean(context.flags, 'no-agents'),
    force: flagBoolean(context.flags, 'force'),
    repair: true,
    interview:
      !flagBoolean(context.flags, 'no-input') && !context.json && !context.quiet && canInterview(),
  });

  emit(
    context,
    'setup',
    {
      root: result.root,
      created: result.created,
      project: {
        name: result.project.name,
        stack: result.project.stack,
        frameworks: result.project.frameworks,
        commands: result.project.commands,
      },
      config: result.config,
      agents: {
        configured: result.agents,
        detected: result.detectedAgents,
        files: result.agentResult?.files ?? [],
        warnings: result.agentResult?.warnings ?? [],
      },
      scan: result.scan
        ? {
            files: result.scan.stats.files,
            sourceFiles: result.scan.stats.sourceFiles,
            totalLines: result.scan.stats.totalLines,
            languages: result.scan.stats.languages,
          }
        : null,
      interview: result.interview,
      files: result.files,
      nextSteps: [
        'Interview the user and refine .specvibe/constitution.md and .specvibe/context.md',
        'Run specvibe propose "<feature>" when the context is accurate',
      ],
    },
    () => {
      renderInitialization(context, result, 'SpecVibe setup refreshed');
      context.logger.write('');
      context.logger.heading('Agent-led refinement:');
      context.logger.write(
        '  Run /sv:setup in your coding agent to interview you and update the constitution and context.',
      );
    },
  );

  return {};
}
