/**
 * The menu's voice tools on every agent from its first turn (MENU_TOOLS_PINNED=on).
 *
 * Added before the cap, like the call journal tools (call-journal-tools.ts):
 * the ones the agent's own build already has (its essential domains) are kept
 * as built; the rest are built from the registry for this agent. While the flag
 * is on the cap keeps all of them and counts none (config/menu-tools-pinned.ts).
 *
 * @module agents/multi-agent/menu-pinned-tools
 */
import { activeMenuPinnedTools, type MenuPinnedTool } from '../../config/menu-tools-pinned.js';
import { toolRegistry } from '../../tools/registry/index.js';
import type { ToolContext, ToolDomain } from '../../tools/registry/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import { withRegistryTools } from './registry-tools.js';

/** Each pinned tool and the domain whose definition it must be. */
export const MENU_PINNED_DOMAINS: Readonly<Record<MenuPinnedTool, ToolDomain>> = {
  recordCommitment: 'productivity',
  getCommitments: 'productivity',
  completeCommitment: 'productivity',
  setQuietHours: 'ambient-mode',
  manageContact: 'calendar',
  createRoutine: 'routines',
  listRoutines: 'routines',
  saveContactInfo: 'scheduling',
  setTheme: 'settings',
  startGame: 'games',
  submitGameAnswer: 'games',
  getGameHint: 'games',
  skipGameRound: 'games',
  endGame: 'games',
  getGameStatus: 'games',
};

/** `tools` plus whichever pinned tools it lacks, when the flag is on; else `tools` unchanged. */
export async function withMenuPinnedTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  const active = activeMenuPinnedTools();
  if (active.length === 0) return tools;
  const byName = Object.fromEntries(active.map((name) => [name, MENU_PINNED_DOMAINS[name]]));
  const out = await withRegistryTools(tools, ctx, byName, 'Menu tools');
  // A duplicate id serves whichever domain registered it last (registry/index.ts):
  // saveContactInfo from `proactive` writes a field the panel never reads, so it stays out.
  for (const name of active) {
    const domain = toolRegistry.get(name)?.domain;
    if (!(name in tools) && name in out && domain !== byName[name]) {
      getLogger().warn({ name, domain }, 'Menu tool from another domain left out');
      delete out[name];
    }
  }
  return out;
}
