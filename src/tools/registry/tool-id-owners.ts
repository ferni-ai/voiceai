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
