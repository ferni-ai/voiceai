/**
 * One owner per tool id (#4291).
 *
 * The registry keeps one definition per id, and domains load in parallel and on demand, so
 * when two domains define different tools under one id the model gets whichever domain
 * loaded last. With TOOL_ID_OWNERS on, the owner keeps the id and the other domain's tool
 * is registered under its own id here, so both stay offered and neither stands in for the
 * other. Owners were chosen from each tool's purpose and its callers (router delegateTo,
 * domain-bridge mappings, topic loading, the menu): the table is in #4291.
 *
 * Not here: ids two domains define as the same tool (the lifx-lights alias of smart-home,
 * and productivity's travel tools, built by travel/travel.ts), where either winner is the
 * same tool.
 *
 * @module tools/registry/tool-id-owners
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { ToolDefinition, ToolDomain } from './types.js';

/** Read at registration: the registry holds one set of ids for the whole process. */
function toolIdOwnersOn(env: Env = process.env): boolean {
  return flagOn('TOOL_ID_OWNERS', env);
}

/** domain -> the id its tool shares with another domain's owner -> the id it takes. */
const RENAMES: Partial<Record<ToolDomain, Readonly<Record<string, string>>>> = {
  proactive: { checkValuesAlignment: 'flagValuesConflict', saveContactInfo: 'saveOutreachContact' },
  'coaching-support': { communicationStrategy: 'coachCommunication' },
  transportation: { getCommuteTime: 'getDriveTime' },
  information: { getMorningBriefing: 'getDailyRundown' },
  'social-events': { getUpcomingBirthdays: 'getBirthdayEvents' },
  'quiet-growth': { goodEnough: 'celebrateGoodEnough' },
  'simple-utilities': { listDevices: 'listMyDevices' },
  research: { remindThesis: 'remindStockThesis' },
  'meal-planning': { searchRecipes: 'searchMyRecipes' },
};

/** The id `domain`'s tool `id` is registered under: its own one when another domain owns `id`. */
function toolIdIn(domain: ToolDomain, id: string, env: Env = process.env): string {
  return (toolIdOwnersOn(env) && RENAMES[domain]?.[id]) || id;
}

/** `definition` under the id its domain registers it as; logs when it replaces another. */
export function ownedDefinition(
  definition: ToolDefinition,
  registered: ReadonlyMap<string, ToolDefinition>
): ToolDefinition {
  const id = toolIdIn(definition.domain, definition.id);
  if (registered.has(id)) getLogger().debug({ toolId: id }, 'Tool re-registered (parallel init)');
  return id === definition.id ? definition : { ...definition, id };
}

/** A taken id -> the id it shared on main. */
const SHARED_ID: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(RENAMES).flatMap((ids) => Object.entries(ids ?? {}).map(([id, to]) => [to, id]))
);

interface NamedToolLists {
  required?: readonly string[];
  optional?: readonly string[];
  forbidden?: readonly string[];
}

/**
 * A persona manifest's tool lists name the tool they mean by the id it has with the flag on
 * (Peter's stock-thesis tool is remindStockThesis). Flag off, such a name reads as the id it
 * shared on main, so the lists build what main built.
 */
export function namedToolLists(
  lists: NamedToolLists = {},
  env: Env = process.env
): { required: string[]; optional: string[]; forbidden: string[] } {
  const ids = (names: readonly string[] = []): string[] =>
    names.map((name) => (toolIdOwnersOn(env) ? name : (SHARED_ID[name] ?? name)));
  return {
    required: ids(lists.required),
    optional: ids(lists.optional),
    forbidden: ids(lists.forbidden),
  };
}

/**
 * The intent manual (what findTools searches) keys each entry by id and says which domain's
 * tool it describes. Flag on, an entry for a tool that took a new id moves to that id, so a
 * search for the stock thesis finds research's tool and not life-thesis's under its old id.
 */
export function ownedManualEntries<T extends { domain: string }>(
  tools: Record<string, T>,
  env: Env = process.env
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(tools).map(([id, entry]) => [
      toolIdIn(entry.domain as ToolDomain, id, env),
      entry,
    ])
  );
}
