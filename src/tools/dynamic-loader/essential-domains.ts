/**
 * Dynamic Tool Loader - the tool domains pre-loaded for every session.
 */

import type { ToolDomain } from '../registry/types.js';

/**
 * Domains that are pre-loaded at startup (no race conditions).
 * telephony is essential because "call my mom" should work immediately.
 * trauma-support is SAFETY-CRITICAL: users in crisis need immediate access.
 */
export const DEFAULT_ESSENTIAL_DOMAINS: ToolDomain[] = essentialDomainsFromEnv() ?? [
  'memory',
  'handoff',
  'awareness',
  'entertainment',
  'telephony',
  'calendar', // Schedule, appointments - users ask constantly!
  'productivity', // Tasks, notes, todos - users create these immediately!
  'games', // "Play a game", "Tic tac toe" - users request games often!
  'presence', // "Help me calm down", "I'm anxious" - grounding tools needed fast
  'trauma-support', // SAFETY-CRITICAL: Immediate access for users in crisis
  'crisis', // SAFETY-CRITICAL: crisis support, safety planning, crisis resources
  'human-transfer', // SAFETY-CRITICAL: hand a user in crisis to a human
  // Loaded when the conversation mentions them (topic keys in topic-mappings.ts),
  // not on every turn: simple-utilities (82 tools), information (58), communication
  // (35), habits (31). With all 338 tools on every request gemini-3.5-flash
  // took p50 7.7 s to its first word; at 120 tools ~1.0 s, at 200 ~2 s
  // (10 calls each, full prompt, 2026-09-28).
];

/** ESSENTIAL_TOOL_DOMAINS=memory,handoff,... overrides the list (e.g. to roll back). */
function essentialDomainsFromEnv(): ToolDomain[] | null {
  const raw = process.env.ESSENTIAL_TOOL_DOMAINS?.trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean) as ToolDomain[];
}
