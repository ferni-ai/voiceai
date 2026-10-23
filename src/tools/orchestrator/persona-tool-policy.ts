/**
 * A persona's own tool policy: the `tools.forbidden` list in its manifest
 * (src/personas/bundles/<id>/persona.manifest.json). Before this, nothing
 * applied it: getToolsForAgent read `persona.tools.forbidden`, but every caller
 * passed only `{id, displayName}`, and its fast path never filtered at all.
 *
 * PERSONA_TOOL_POLICY=on: getToolsForAgent and the multi-agent tool set
 * (agent-setup.ts) drop the persona's forbidden tools, and so does every path
 * that adds tools mid-call (updateAgentTools, the static core, same-turn
 * topic tools), through the sync forbiddenToolsNow. Off: unchanged.
 *
 * Some tools are never removed, whatever a manifest says: handoffs and team
 * tools (a persona must always be able to pass the caller on), every tool in
 * the crisis, trauma-support, human-transfer, presence and sobriety domains,
 * the privacy controls (forget and correct a memory), softTeamIntro and
 * endCall. A manifest that forbids one gets a warning (once per persona per
 * process) and that entry is not applied.
 *
 * No manifest has an allow-list today (`domains`, `required` and `optional`
 * add tools, they don't restrict), so there is none to apply.
 *
 * @module tools/orchestrator/persona-tool-policy
 */
import { flagOn } from '../../config/env-flag.js';
import { LEAN_ALWAYS_ON_TOOLS } from '../../config/same-turn-tools-config.js';
import { isTeammateTool } from '../../config/tool-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';

const log = createLogger({ module: 'PersonaToolPolicy' });

/** The always-on set's safety domains: crisis, a human, grounding. */
const SAFETY_DOMAINS = new Set(['crisis', 'human-transfer', 'presence', 'trauma-support']);
const SAFETY_TOOLS = Object.keys(LEAN_ALWAYS_ON_TOOLS).filter((name) =>
  SAFETY_DOMAINS.has(LEAN_ALWAYS_ON_TOOLS[name] ?? '')
);
const NEVER_FORBIDDEN = new Set([
  ...SAFETY_TOOLS,
  'forgetMemory',
  'updateMemory',
  'endCall',
  'softTeamIntro',
]);
/**
 * Whole registry domains no persona may lose a tool from. A tool's domain here
 * is its primary one (ToolDefinition.domain); a tool that is only listed under
 * one of these as a secondary domain is not protected by it.
 */
const PROTECTED_DOMAINS = new Set([...SAFETY_DOMAINS, 'sobriety']);

/** Whether no persona policy may remove this tool. */
export function isProtectedTool(name: string): boolean {
  return (
    NEVER_FORBIDDEN.has(name) ||
    isTeammateTool(name) ||
    PROTECTED_DOMAINS.has(toolRegistry.get(name)?.domain ?? '')
  );
}

interface PersonaTools {
  forbidden?: string[];
}
const isAllowedToForbid = (name: string): boolean => !isProtectedTool(name);

export interface PersonaToolPolicy {
  /** Tools this persona never gets; protected tools are already left out. */
  forbidden: string[];
}

/** Each persona's manifest read, once per process (a failed read is retried). */
const manifestReads = new Map<string, Promise<string[] | undefined>>();
/** Each persona's policy once read, for the mid-call paths that can't await. */
const knownPolicies = new Map<string, readonly string[]>();
const warnedPersonas = new Set<string>();

/** A manifest read that takes longer gives up: no forbids, not cached (agent setup can't wait). */
export const MANIFEST_READ_TIMEOUT_MS = 2000;

/**
 * The bundle load, or undefined (a failed read) once MANIFEST_READ_TIMEOUT_MS
 * passes. Only the load is timed: the personas module import before it can take
 * longer than that on a cold start (CI), and a slow import isn't a hung read.
 */
async function withReadTimeout<T>(load: Promise<T>, personaId: string): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      log.warn({ personaId }, 'Persona manifest read timed out: no forbids, retried next call');
      resolve(undefined);
    }, MANIFEST_READ_TIMEOUT_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([load, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The manifest's forbidden list, as written: [] when the persona has no
 * manifest, undefined when the read failed or timed out (not cached, so the
 * next call retries).
 */
async function manifestForbidden(personaId: string): Promise<string[] | undefined> {
  const cached = manifestReads.get(personaId);
  if (cached) return cached;
  const read = readManifestForbidden(personaId);
  manifestReads.set(personaId, read);
  const listed = await read;
  if (listed === undefined) manifestReads.delete(personaId);
  return listed;
}

async function readManifestForbidden(personaId: string): Promise<string[] | undefined> {
  try {
    const personas = await import('../../personas/index.js');
    const known = personas.isKnownPersona(personaId);
    const bundleId = known ? personas.getCanonicalPersonaId(personaId) : personaId;
    const bundle = await withReadTimeout(personas.loadBundleById(bundleId), personaId);
    if (bundle === undefined) return undefined; // timed out: not cached, read again next call
    return bundle?.manifest.tools?.forbidden ?? [];
  } catch (error) {
    log.warn(
      { personaId, error: String(error) },
      'Persona manifest read failed: retried next call'
    );
    return undefined;
  }
}

/** This persona's tool policy, or undefined while PERSONA_TOOL_POLICY is off. */
export async function personaToolPolicy(personaId: string): Promise<PersonaToolPolicy | undefined> {
  if (!flagOn('PERSONA_TOOL_POLICY')) return undefined;
  const listed = await manifestForbidden(personaId);
  if (listed === undefined) return { forbidden: [] }; // nothing known yet; not remembered
  const refused = listed.filter(isProtectedTool);
  if (refused.length > 0 && !warnedPersonas.has(personaId)) {
    warnedPersonas.add(personaId);
    log.warn({ personaId, refused }, 'Persona manifest forbids protected tools: not applied');
  }
  const forbidden = listed.filter(isAllowedToForbid);
  knownPolicies.set(personaId, forbidden);
  return { forbidden };
}

/** Each SDK agent's own persona, set where agent setup builds it. */
const agentPersonas = new WeakMap<object, string>();

/**
 * Agent setup: this agent speaks as `personaId`. Its policy follows the agent,
 * not `userData.personaId`, which a handoff only updates after the swap while
 * the SDK already runs the new agent. Reads the policy now, so the first
 * mid-call update has it.
 */
export function rememberAgentPersona(agent: object, personaId: string): void {
  agentPersonas.set(agent, personaId);
  if (flagOn('PERSONA_TOOL_POLICY')) void forbiddenToolsFor(personaId);
}

interface UserDataHolder {
  userData?: { personaId?: unknown };
}

/** The persona on the call, from a session's userData or an SDK agent's session's. */
export function personaIdOnCall(agentOrSession: object): string | undefined {
  try {
    const holder = agentOrSession as UserDataHolder & { session?: UserDataHolder };
    const id = (holder.userData ?? holder.session?.userData)?.personaId;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined; // the SDK throws until the agent runs, or when userData is unset
  }
}

/** A persona id as given, or an agent's own persona, else its session's userData. */
function personaOf(of: string | object | undefined): string | undefined {
  if (of === undefined || typeof of === 'string') return of;
  return agentPersonas.get(of) ?? personaIdOnCall(of);
}

/** The forbidden tools of a persona, or of an agent's persona (none while the flag is off). */
export async function forbiddenToolsFor(
  of: string | object | undefined
): Promise<readonly string[]> {
  if (!flagOn('PERSONA_TOOL_POLICY')) return [];
  const personaId = personaOf(of);
  return personaId ? ((await personaToolPolicy(personaId))?.forbidden ?? []) : [];
}

/**
 * The same, for a path that can't await (same-turn topic tools). Agent setup
 * reads the policy first (rememberAgentPersona, applyPersonaToolPolicy), so it
 * is known by then; if not, this starts the read and returns none for now.
 */
export function forbiddenToolsNow(of: string | object | undefined): readonly string[] {
  if (!flagOn('PERSONA_TOOL_POLICY')) return [];
  const personaId = personaOf(of);
  if (!personaId) return [];
  const known = knownPolicies.get(personaId);
  if (!known) void forbiddenToolsFor(personaId);
  return known ?? [];
}

/**
 * The persona with its tool policy, for getToolsForAgent: the caller's own if it
 * passed one, else its manifest's (PERSONA_TOOL_POLICY=on). Never forbids a
 * protected tool either way.
 */
export async function withPersonaToolPolicy<P extends { id: string; tools?: PersonaTools }>(
  persona: P
): Promise<P> {
  const tools = persona.tools ?? (await personaToolPolicy(persona.id));
  if (!tools) return persona;
  return { ...persona, tools: { ...tools, forbidden: tools.forbidden?.filter(isAllowedToForbid) } };
}

/** The tools without the forbidden ones. A new record when any go; protected tools never do. */
export function withoutForbiddenTools<T>(
  tools: Record<string, T>,
  forbidden: readonly string[] | undefined
): Record<string, T> {
  const drop = (forbidden ?? []).filter((name) => name in tools && isAllowedToForbid(name));
  if (drop.length === 0) return tools;
  const kept = { ...tools };
  for (const name of drop) delete kept[name];
  return kept;
}

/** The persona's tools with its policy applied (PERSONA_TOOL_POLICY=on), else as given. */
export async function applyPersonaToolPolicy<T>(
  tools: Record<string, T>,
  personaId: string
): Promise<Record<string, T>> {
  const policy = await personaToolPolicy(personaId);
  return policy ? withoutForbiddenTools(tools, policy.forbidden) : tools;
}
