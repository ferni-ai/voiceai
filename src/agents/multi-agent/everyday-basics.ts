/**
 * A timer, a reminder and the weather for every persona the caller is handed to.
 *
 * shared-capabilities.md tells every teammate they can set timers, set reminders
 * and check the weather, so they call the tool instead of handing off (#1128).
 * A handed-to persona starts with the Tool Gateway's Tier 0 (memory, handoff,
 * entertainment, awareness, behavior), which has none of the three, and with
 * HANDOFF_FULL_TOOLS the essential set has setReminder but no timer or weather.
 *
 * Cost: at most three declarations on a handed-to persona's requests. All three
 * are essential tools (tool-config.ts), so capToolsToLimit keeps them.
 *
 * @module agents/multi-agent/everyday-basics
 */
import type { ToolContext, ToolDomain } from '../../tools/registry/types.js';
import { withAlwaysOnInfoTools } from './always-on-info-tools.js';
import { personaToolsetsEnabled } from '../../config/persona-toolsets-flag.js';
import { sameTurnToolsEnabled } from '../../config/same-turn-tools-config.js';
import { withChiefOfStaffTools } from './chief-of-staff-tools.js';
import { withLeanAlwaysOnTools } from './lean-always-on.js';
import { withMenuPinnedTools } from './menu-pinned-tools.js';
import { withPersonaToolset } from './persona-toolsets.js';
import { withRegistryTools } from './registry-tools.js';
import { withSpecialistTools } from './specialist-tools.js';

/** Each everyday basic and the domain it is registered in. */
export const EVERYDAY_BASICS: Readonly<Record<string, ToolDomain>> = {
  quickTimer: 'simple-utilities',
  setReminder: 'productivity',
  getWeather: 'information',
};

/** `tools` plus whichever EVERYDAY_BASICS it lacks, built for this agent. */
export async function withEverydayBasics<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  return withRegistryTools(tools, ctx, EVERYDAY_BASICS, 'Everyday basics');
}

/**
 * Every agent's always-on tools before the cap: the info tools (ALWAYS_ON_INFO_TOOLS),
 * and for a persona the caller is handed to, the everyday basics. With
 * TOOLS_SAME_TURN, the lean always-on set instead (lean-always-on.ts). Either way,
 * Alex also gets his planning tools while ALEX_CHIEF_OF_STAFF is on
 * (chief-of-staff-tools.ts). Last, with SPECIALIST_TOOLS on, a specialist's set
 * becomes its core and specialty tools (specialist-tools.ts). Then, with
 * MENU_TOOLS_PINNED on, the menu's voice tools (menu-pinned-tools.ts).
 * PERSONA_TOOLSETS replaces all of that with the persona's set (persona-toolsets.ts).
 */
export async function withAlwaysOnTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext,
  handedTo: boolean
): Promise<Record<string, T>> {
  if (personaToolsetsEnabled()) return withPersonaToolset(tools, ctx);
  if (sameTurnToolsEnabled()) {
    const lean = await withChiefOfStaffTools(await withLeanAlwaysOnTools(tools, ctx), ctx);
    return withMenuPinnedTools(await withSpecialistTools(lean, ctx), ctx);
  }
  const withInfo = await withAlwaysOnInfoTools(tools, ctx);
  const withBasics = handedTo ? await withEverydayBasics(withInfo, ctx) : withInfo;
  const specialist = await withSpecialistTools(await withChiefOfStaffTools(withBasics, ctx), ctx);
  return withMenuPinnedTools(specialist, ctx);
}
