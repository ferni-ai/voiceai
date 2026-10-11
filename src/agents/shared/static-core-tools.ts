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

import { createHash } from 'node:crypto';
import type { voice } from '@livekit/agents';
import { STATIC_CORE_TOOLS, isFindableDomain, isTeammateTool } from '../../config/tool-config.js';
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
 * Build tools by name from the registry, registering their domains first.
 * Only tools of a findable domain are built (tool-config.ts FINDABLE_DOMAINS),
 * checked on both the intent manual's domain and the registry definition's:
 * the catalog also holds runBash, webhooks and settings tools no caller may
 * reach. Unknown names and tools whose service is missing are left out.
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
  const findable = names.filter((name) => isFindableDomain(manual.tools[name]?.domain));
  type Domain = Parameters<typeof loader.loadToolDomain>[0];
  const domains = new Set<Domain>();
  for (const name of findable) {
    const domain = manual.tools[name].domain as Domain;
    if (!loader.isDomainLoaded(domain)) domains.add(domain);
  }
  await Promise.all([...domains].map((domain) => loader.loadToolDomain(domain)));
  const allowed = findable.filter((name) =>
    isFindableDomain(registry.toolRegistry.get(name)?.domain)
  );
  const forbidden = names.filter((name) => !allowed.includes(name));
  if (forbidden.length > 0) log.warn({ forbidden }, 'Tools outside the findable domains not built');
  const { tools } = registry.toolRegistry.buildToolSet(
    { domains: [], optional: allowed, forbidden },
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

type DomainOf = (name: string) => string | undefined;

let manualDomainOf: Promise<DomainOf> | undefined;
/** A tool's domain in the intent manual (what findTools searches). */
async function intentManualDomainOf(): Promise<DomainOf> {
  manualDomainOf ??= import('../../tools/retrieval/dense-index.js').then(({ loadIntentManual }) => {
    const { tools } = loadIntentManual();
    return (name: string) => tools[name]?.domain;
  });
  return manualDomainOf;
}

const needHash = (need: string): string =>
  createHash('sha256').update(need).digest('hex').slice(0, 12);

/**
 * findTools under TOOL_CORE_STATIC: build the tools it found and append them
 * to the agent on the call now (`agent` is a getter: a handoff swaps it), so
 * they stay for the rest of the call. Returns the ones the agent then has.
 * Names outside the findable domains never reach `build` (which refuses them
 * too). Each pin is logged for audit: who, which call, a hash of the need,
 * which tools.
 */
export function createToolPinner(
  agent: () => unknown,
  ctx: ToolBuildContext,
  build: BuildToolsByName = buildToolsByName,
  domainOf?: DomainOf
): ToolPinner {
  return async (names, need) => {
    const domain = domainOf ?? (await intentManualDomainOf());
    const allowed = names.filter((name) => isFindableDomain(domain(name)));
    const target = agent() as voice.Agent<UserData> & ToolHolder;
    const missing = allowed.filter((name) => !(name in target.toolCtx.functionTools));
    const built = missing.length > 0 ? await build(missing, ctx) : {};
    if (Object.keys(built).length > 0) {
      await updateAgentTools(target, built, { pin: true, silentMerge: true });
    }
    const now = target.toolCtx.functionTools;
    const found: FoundTool[] = allowed
      .filter((name) => name in now)
      .map((name) => ({
        name,
        description: (now[name].description ?? '').split(/(?<=[.!?])\s/)[0].slice(0, 140),
      }));
    log.info(
      {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        needHash: needHash(need),
        asked: names,
        refused: names.filter((name) => !allowed.includes(name)),
        pinned: Object.keys(built),
      },
      'TOOL_CORE_STATIC pin'
    );
    return found;
  };
}
