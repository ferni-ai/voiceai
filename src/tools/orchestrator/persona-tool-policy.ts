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
/** Whole registry domains no persona may lose a tool from. */
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

/** Each persona's manifest read, once per process. */
const manifestReads = new Map<string, Promise<string[]>>();
/** Each persona's policy once read, for the mid-call paths that can't await. */
const knownPolicies = new Map<string, readonly string[]>();
const warnedPersonas = new Set<string>();

/** The manifest's forbidden list, as written, or [] when there is no manifest. */
async function manifestForbidden(personaId: string): Promise<string[]> {
  const cached = manifestReads.get(personaId);
  if (cached) return cached;
  const read = readManifestForbidden(personaId);
  manifestReads.set(personaId, read);
  return read;
}

async function readManifestForbidden(personaId: string): Promise<string[]> {
  try {
    const personas = await import('../../personas/index.js');
    const known = personas.isKnownPersona(personaId);
    const bundleId = known ? personas.getCanonicalPersonaId(personaId) : personaId;
    return (await personas.loadBundleById(bundleId))?.manifest.tools?.forbidden ?? [];
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'No persona manifest: no tool policy applied');
    return [];
  }
}

/** This persona's tool policy, or undefined while PERSONA_TOOL_POLICY is off. */
export async function personaToolPolicy(personaId: string): Promise<PersonaToolPolicy | undefined> {
  if (!flagOn('PERSONA_TOOL_POLICY')) return undefined;
  const listed = await manifestForbidden(personaId);
  const refused = listed.filter(isProtectedTool);
  if (refused.length > 0 && !warnedPersonas.has(personaId)) {
    warnedPersonas.add(personaId);
    log.warn({ personaId, refused }, 'Persona manifest forbids protected tools: not applied');
  }
  const forbidden = listed.filter(isAllowedToForbid);
  knownPolicies.set(personaId, forbidden);
  return { forbidden };
}

/**
 * The persona's forbidden tools for a path that can't await (mid-call tool
 * updates). Call setup reads the policy first (applyPersonaToolPolicy), so it
 * is known by then; if not, this starts the read and returns none for now.
 */
export function forbiddenToolsNow(personaId: string | undefined): readonly string[] {
  if (!personaId || !flagOn('PERSONA_TOOL_POLICY')) return [];
  const known = knownPolicies.get(personaId);
  if (!known) {
    personaToolPolicy(personaId).catch((error: unknown) =>
      log.warn({ personaId, error: String(error) }, 'Could not read the persona tool policy')
    );
  }
  return known ?? [];
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
