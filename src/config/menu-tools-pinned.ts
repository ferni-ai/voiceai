/**
 * MENU_TOOLS_PINNED: what the app menu says Ferni can do by voice, he can do on
 * the same turn.
 *
 * The 2026-10-25 tool-cap audit (voiceai-evidence/menu-green-2026-10-25/toolcap)
 * found the voice side of most menu items never reached the model: the first
 * agent is capped to 64 tools, a mid-call update to 64 + 24, and the domains
 * these tools live in either load past the cap or have no topic word at all.
 * Asked to "add that to my day", Ferni called addTask, a store the Your Day
 * panel never reads.
 *
 * With the flag on, every agent (first and handed-to) gets these tools before
 * the cap (agents/multi-agent/menu-pinned-tools.ts), the cap never drops them,
 * and they count outside its limits (tool-config.ts, tool-updater.ts), so no
 * other tool is pushed out to make room. Per-caller filters still apply after
 * them: the phone-only allowlist, the reach-other-people filter and the
 * locked-handoff filter (personas/turn-request.ts), and persona tool policy.
 *
 * A tool is listed only when a voice call through it shows up in the menu panel
 * it belongs to, or, for a read, returns what that panel shows. Off, the tool
 * sets are exactly as before.
 *
 * @module config/menu-tools-pinned
 */
import { flagOn, type Env } from './env-flag.js';

/**
 * The pinned tools, by registry id, grouped by the menu item they serve. Each
 * was traced to the store its panel reads. The audit's other menu tools write a
 * store their panel doesn't read (or can't work yet), so they stay unpinned.
 */
export const MENU_PINNED_TOOLS = [
  // Your Day with Ferni: bogle_users/{uid}/commitments, what GET /api/commitments reads
  'recordCommitment',
  'getCommitments',
  'completeCommitment',
  // When I'll Check In: messagingPrefs, what the panel's /api/user/preferences reads and writes
  'setQuietHours',
  // People You've Told Me About: user_contacts, which GET /api/contacts merges in
  'manageContact',
  // What I Do For You: users/{uid}/life_automation/workflows, what the panel lists
  'createRoutine',
  'listRoutines',
  // How I reach you: profile contactInfo, what GET /api/user/contact reads (see NEEDS)
  'saveContactInfo',
  // Look & Feel: the theme the app applies and the panel shows (see NEEDS)
  'setTheme',
  // Let's Play: the picker's game engine; a game needs its turn tools, not just the start
  'startGame',
  'submitGameAnswer',
  'getGameHint',
  'skipGameRound',
  'endGame',
  'getGameStatus',
] as const;
export type MenuPinnedTool = (typeof MENU_PINNED_TOOLS)[number];

/**
 * Pinned only while what they write reaches the panel: the agent's profile
 * writes are in-memory unless PERSIST_AGENT_PROFILES=true (memory/profile-store.ts),
 * and the theme reaches the app only with UI_EVENTS_OVER_CALL=on
 * (services/user-events/call-delivery.ts). Same readings as those files.
 */
const NEEDS: Partial<Record<MenuPinnedTool, (env: Env) => boolean>> = {
  saveContactInfo: (env) => env.PERSIST_AGENT_PROFILES === 'true',
  setTheme: (env) => env.UI_EVENTS_OVER_CALL === 'on',
};

const pinnedName = (name: string, env: Env): boolean =>
  (MENU_PINNED_TOOLS as readonly string[]).includes(name) &&
  (NEEDS[name as MenuPinnedTool]?.(env) ?? true);

/** The pinned tools this process pins now: none while the flag is off. */
export function activeMenuPinnedTools(env: Env = process.env): MenuPinnedTool[] {
  if (!menuToolsPinnedEnabled(env)) return [];
  return MENU_PINNED_TOOLS.filter((name) => pinnedName(name, env));
}

export function menuToolsPinnedEnabled(env: Env = process.env): boolean {
  return flagOn('MENU_TOOLS_PINNED', env);
}

/** A pinned tool: the cap keeps it and it takes no slot, while the flag is on. */
export function isMenuPinnedTool(name: string, env: Env = process.env): boolean {
  return menuToolsPinnedEnabled(env) && pinnedName(name, env);
}

/** How many of `names` are pinned: they sit outside the cap's limits. */
export function countMenuPinned(names: Iterable<string>, env: Env = process.env): number {
  if (!menuToolsPinnedEnabled(env)) return 0;
  let n = 0;
  for (const name of names) if (pinnedName(name, env)) n++;
  return n;
}
