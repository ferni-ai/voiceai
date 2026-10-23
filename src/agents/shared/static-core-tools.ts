/**
 * TOOL_CORE_STATIC: the call's one tool set (tool-config.ts), core tools the
 * essential domains lack built by name; and the findTools pinner.
 *
 * @module agents/shared/static-core-tools
 */

import { createHash } from 'node:crypto';
import type { voice } from '@livekit/agents';
import { STATIC_CORE_TOOLS, isTeammateTool } from '../../config/tool-config.js';
import {
  forbiddenToolsFor,
  withoutForbiddenTools,
} from '../../tools/orchestrator/persona-tool-policy.js';
import { isFindableTool } from '../../tools/dynamic-loader/findable-domains.js';
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
 * Only findable domains (findable-domains.ts), checked on both the intent
 * manual's and the registry definition's domain; the rest go in `forbidden`.
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
  const findable = names.filter((name) => isFindableTool(name, manual.tools[name]?.domain));
  type Domain = Parameters<typeof loader.loadToolDomain>[0];
  const domains = new Set<Domain>();
  for (const name of findable) {
    const domain = manual.tools[name].domain as Domain;
    if (!loader.isDomainLoaded(domain)) domains.add(domain);
  }
  await Promise.all([...domains].map((domain) => loader.loadToolDomain(domain)));
  const allowed = findable.filter((name) =>
    isFindableTool(name, registry.toolRegistry.get(name)?.domain)
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
  const unavailable = STATIC_CORE_TOOLS.filter((name) => !(name in core));
  log.info({ core: Object.keys(core).length, unavailable }, 'TOOL_CORE_STATIC set');
  return withoutForbiddenTools(core, await forbiddenToolsFor(ctx.agentId)); // PERSONA_TOOL_POLICY
}

/**
 * The static core for a call's session, with findTools added: without it the
 * agent has no way to reach a tool outside the core. The tool-choice eval uses
 * it to mirror the multi-agent path (agent-setup.ts), where findTools can pin a
 * tool. The single-agent fallback (session-creator.ts) has no tool pinner, so it
 * keeps the gateway set and does not use this.
 */
export async function staticCoreCallTools(
  tools: Record<string, unknown>,
  userId: string | null | undefined,
  sessionId: string | null | undefined,
  persona: { id: string; name?: string },
  build: BuildToolsByName = buildToolsByName
): Promise<Record<string, unknown>> {
  const { createFindToolsTool, FIND_TOOLS } =
    await import('../../tools/retrieval/find-tools-tool.js');
  const ctx = {
    userId: userId || 'anonymous',
    sessionId: sessionId ?? undefined,
    agentId: persona.id,
    agentDisplayName: persona.name || persona.id,
  };
  return staticCoreTools({ ...tools, [FIND_TOOLS]: createFindToolsTool() }, ctx, build);
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
 * findTools under TOOL_CORE_STATIC: build what it found (findable domains only)
 * and append it to the agent on the call now, for the rest of the call. Each
 * pin writes an audit line: user, call, a hash of the need, the tools.
 */
export function createToolPinner(
  agent: () => unknown,
  ctx: ToolBuildContext,
  build: BuildToolsByName = buildToolsByName,
  domainOf?: DomainOf
): ToolPinner {
  return async (names, need) => {
    const domain = domainOf ?? (await intentManualDomainOf());
    const allowed = names.filter((name) => isFindableTool(name, domain(name)));
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
