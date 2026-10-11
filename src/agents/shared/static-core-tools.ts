/**
 * TOOL_CORE_STATIC: the one tool set a call keeps from its first request to
 * its last (tool-config.ts STATIC_CORE_TOOLS, then the user's teammate tools).
 *
 * The agent is built from the essential domains, which lack some core tools
 * (quickTimer and tellJoke live in simple-utilities, getWeatherForecast and
 * searchWeb in information). Those are built here by name, so the whole core
 * is on the first request and the set never has to change mid-call.
 *
 * @module agents/shared/static-core-tools
 */

import type { voice } from '@livekit/agents';
import { STATIC_CORE_TOOLS, isTeammateTool } from '../../config/tool-config.js';
import type { FoundTool, ToolPinner } from '../../tools/retrieval/find-tools-tool.js';
import { createLogger } from '../../utils/safe-logger.js';
import { updateAgentTools } from './tool-updater.js';
import type { UserData } from './types.js';

const log = createLogger({ module: 'StaticCoreTools' });

export interface ToolBuildContext {
  userId: string;
  sessionId?: string;
  agentId: string;
  agentDisplayName: string;
}

export type BuildToolsByName = (
  names: readonly string[],
  ctx: ToolBuildContext
) => Promise<Record<string, unknown>>;

/**
 * Build tools by name from the registry, registering their domains first
 * (the domain of each tool comes from the intent manual). Unknown names and
 * tools whose service is missing are left out.
 */
export const buildToolsByName: BuildToolsByName = async (names, ctx) => {
  if (names.length === 0) return {};
  const [{ loadIntentManual }, loader, registry, { EnvironmentServiceRegistry }, dynamic] =
    await Promise.all([
      import('../../tools/retrieval/dense-index.js'),
      import('../../tools/registry/loader.js'),
      import('../../tools/registry/index.js'),
      import('../../tools/registry/types.js'),
      import('../../tools/dynamic-loader/index.js'),
    ]);
  await dynamic.ensureEssentialDomainsLoaded(); // registers every domain's loader (once per job)
  const manual = loadIntentManual();
  type Domain = Parameters<typeof loader.loadToolDomain>[0];
  const domains = new Set<Domain>();
  for (const name of names) {
    const domain = manual.tools[name]?.domain as Domain | undefined;
    if (domain && !loader.isDomainLoaded(domain)) domains.add(domain);
  }
  await Promise.all([...domains].map((domain) => loader.loadToolDomain(domain)));
  const { tools } = registry.toolRegistry.buildToolSet(
    { domains: [], optional: [...names] },
    { ...ctx, services: new EnvironmentServiceRegistry() }
  );
  return tools as Record<string, unknown>;
};

/**
 * The call's static tool set from the tools the agent was given: the core in
 * STATIC_CORE_TOOLS order, built by name where `have` lacks one, then the
 * teammate tools in `have`. Everything else in `have` is dropped. A failed
 * build leaves out only the tools it would have added.
 */
export async function staticCoreTools(
  have: Record<string, unknown>,
  ctx: ToolBuildContext,
  build: BuildToolsByName = buildToolsByName
): Promise<Record<string, unknown>> {
  const missing = STATIC_CORE_TOOLS.filter((name) => !(name in have));
  let built: Record<string, unknown> = {};
  try {
    built = await build(missing, ctx);
  } catch (error) {
    log.warn({ error: String(error), missing }, 'Could not build the missing core tools');
  }
  const core: Record<string, unknown> = {};
  for (const name of STATIC_CORE_TOOLS) {
    const tool = have[name] ?? built[name];
    if (tool) core[name] = tool;
  }
  for (const [name, tool] of Object.entries(have)) {
    if (isTeammateTool(name)) core[name] = tool;
  }
  log.info(
    {
      offered: Object.keys(have).length,
      core: Object.keys(core).length,
      built: Object.keys(built).filter((name) => name in core),
      unavailable: STATIC_CORE_TOOLS.filter((name) => !(name in core)),
    },
    'TOOL_CORE_STATIC set'
  );
  return core;
}

interface ToolHolder {
  readonly toolCtx: { readonly functionTools: Record<string, { description?: string }> };
}

/**
 * findTools under TOOL_CORE_STATIC: build the tools it found and append them
 * to the agent on the call now (`agent` is a getter: a handoff swaps it), so
 * they stay for the rest of the call. Returns the ones the agent then has.
 */
export function createToolPinner(
  agent: () => unknown,
  ctx: ToolBuildContext,
  build: BuildToolsByName = buildToolsByName
): ToolPinner {
  return async (names) => {
    const target = agent() as voice.Agent<UserData> & ToolHolder;
    const missing = names.filter((name) => !(name in target.toolCtx.functionTools));
    const built = missing.length > 0 ? await build(missing, ctx) : {};
    if (Object.keys(built).length > 0) {
      await updateAgentTools(target, built, { pin: true, silentMerge: true });
    }
    const now = target.toolCtx.functionTools;
    const found: FoundTool[] = names
      .filter((name) => name in now)
      .map((name) => ({
        name,
        description: (now[name].description ?? '').split(/(?<=[.!?])\s/)[0].slice(0, 140),
      }));
    log.info({ asked: names, pinned: Object.keys(built) }, 'TOOL_CORE_STATIC pin');
    return found;
  };
}
