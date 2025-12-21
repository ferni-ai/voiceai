/**
 * Identity Context Builder
 *
 * Builds identity context for post-handoff reinforcement.
 * Ensures the LLM knows who it currently is after agent switches.
 */

import { getAgentContext, getLastHandoff } from '../../tools/handoff/index.js';
import type { IdentityContext, TurnContext } from './types.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize persona IDs to handle aliases
 */
function normalize(id: string): string {
  const mapping: Record<string, string> = {
    'jack-b': 'ferni',
    'comm-specialist': 'alex-chen',
    'spend-save': 'maya-santos',
    'event-planner': 'jordan-taylor',
    alex: 'alex-chen',
    maya: 'maya-santos',
    jordan: 'jordan-taylor',
    peter: 'peter-john',
  };
  return mapping[id.toLowerCase()] || id.toLowerCase();
}

/**
 * Check if two persona IDs refer to the same persona
 */
function isSamePersona(id1: string, id2: string): boolean {
  return normalize(id1) === normalize(id2);
}

/**
 * Check if a persona is the coach/coordinator
 */
function isCoach(id: string): boolean {
  return isSamePersona(id, 'ferni') || isSamePersona(id, 'jack-b');
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build identity context for post-handoff reinforcement
 *
 * FIX BUG: Previously compared activeAgentId vs sessionPersonaId, but after a handoff
 * BOTH are updated to the new persona, so the comparison always returned equal.
 * Now we check if a handoff occurred recently (within 60s) and ALWAYS inject
 * identity context to override the LLM's original instructions from session start.
 */
export function buildIdentityContext(ctx: TurnContext): IdentityContext {
  const { persona, services } = ctx;

  // FIX BUG #1-4: Use session-scoped state instead of global getCurrentAgent()
  // The global state causes cross-session contamination in concurrent sessions
  const activeAgentId = services.handoffState.currentAgent;
  const sessionPersonaId = persona.id;

  let needsReinforcement = false;
  let injection: string | undefined;

  // FIX BUG: Check if a handoff occurred recently (within 60 seconds)
  // The LLM's base instructions were set at session start and cannot be updated mid-session.
  // We MUST inject identity context after ANY handoff to override the original instructions.
  const lastHandoff = getLastHandoff();
  const handoffOccurredRecently = lastHandoff && Date.now() - lastHandoff.timestamp < 60000;

  // If we're not the coordinator AND a handoff occurred recently, reinforce identity
  if (!isCoach(activeAgentId) && handoffOccurredRecently) {
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are ${persona.name}. This is WHO YOU ARE.
- You are NOT Ferni. You are NOT the coordinator.
- Your name is ${persona.name}. Say "${persona.name}" if asked who you are.
- Your current identity determines your personality, tools, and expertise.
=== END IDENTITY ===`;
    }
  } else if (isCoach(activeAgentId) && handoffOccurredRecently) {
    // Returned to Ferni - still need reinforcement if handoff was recent
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are FERNI, the life coach and team coordinator.
- You are NOT the previous specialist. You've returned to your coach role.
=== END IDENTITY ===`;
    }
  } else if (!isSamePersona(activeAgentId, sessionPersonaId) && !isCoach(activeAgentId)) {
    // Fallback: ID mismatch detected (shouldn't happen after the fix above, but keep for safety)
    const identityContext = getAgentContext();
    if (identityContext) {
      needsReinforcement = true;
      injection = `=== CURRENT IDENTITY (NON-NEGOTIABLE) ===
${identityContext}

CRITICAL REMINDERS:
- You are ${persona.name}. This is WHO YOU ARE.
- If asked "who are you?" respond with your CURRENT identity.
=== END IDENTITY ===`;
    }
  }

  return {
    needsReinforcement,
    injection,
    activeAgentId,
    sessionPersonaId,
  };
}
