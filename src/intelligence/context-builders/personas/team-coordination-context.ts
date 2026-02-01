/**
 * Team Coordination Context Builder
 *
 * Enables Ferni to coordinate handoffs to the right specialist personas.
 * Routes conversations to the right team member based on domain triggers.
 *
 * PHILOSOPHY:
 * "Six perspectives. One conversation. That's what makes this special."
 *
 * This builder detects when a conversation might benefit from another
 * team member's expertise and suggests the handoff with personality.
 *
 * @module TeamCoordinationContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadTeamCoordination, type TeamCoordination } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'TeamCoordinationContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, TeamCoordination>();
const sessionState = new Map<
  string,
  {
    lastHandoffSuggestionTurn: number;
    handoffSuggestionsCount: number;
    suggestedDomains: string[];
  }
>();

function getState(sessionId: string) {
  if (!sessionState.has(sessionId)) {
    sessionState.set(sessionId, {
      lastHandoffSuggestionTurn: 0,
      handoffSuggestionsCount: 0,
      suggestedDomains: [],
    });
  }
  return sessionState.get(sessionId)!;
}

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<TeamCoordination | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadTeamCoordination(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded team coordination content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load team coordination content');
    return null;
  }
}

// ============================================================================
// HANDOFF DETECTION
// ============================================================================

interface HandoffMatch {
  domain: string;
  confidence: number;
  suggestedPersona: string;
  phrases: string[];
  stayWithFerni: boolean;
}

function detectHandoffOpportunity(
  input: ContextBuilderInput,
  content: TeamCoordination
): HandoffMatch | null {
  if (!content.handoff_detection) return null;

  const text = input.userText.toLowerCase();
  const detections = content.handoff_detection;

  // Check each domain for trigger matches
  for (const [domainKey, domain] of Object.entries(detections)) {
    if (!domain || !domain.triggers) continue;

    let matchCount = 0;
    for (const trigger of domain.triggers) {
      if (text.includes(trigger.toLowerCase())) {
        matchCount++;
      }
    }

    // Calculate confidence based on trigger matches
    const confidence = matchCount / Math.max(domain.triggers.length, 1);

    if (confidence >= (domain.confidence_threshold || 0.7)) {
      return {
        domain: domainKey,
        confidence,
        suggestedPersona: domain.fallback_role || domain.suggested_domain,
        phrases: domain.phrases || [],
        stayWithFerni: domain.stay_with_ferni || false,
      };
    }

    // Also check for multiple triggers even if below threshold
    if (matchCount >= 2 && confidence >= 0.5) {
      return {
        domain: domainKey,
        confidence,
        suggestedPersona: domain.fallback_role || domain.suggested_domain,
        phrases: domain.phrases || [],
        stayWithFerni: domain.stay_with_ferni || false,
      };
    }
  }

  return null;
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function generateHandoffGuidance(
  content: TeamCoordination,
  match: HandoffMatch
): string | null {
  const lines: string[] = [`[TEAM COORDINATION: ${match.domain.toUpperCase().replace(/_/g, ' ')}]`, ''];

  // If should stay with Ferni (crisis), provide different guidance
  if (match.stayWithFerni) {
    lines.push('CRISIS DETECTED - STAY WITH USER');
    lines.push('');
    lines.push('This is a moment requiring steady presence, not handoff.');
    lines.push('Be solid ground. Don\'t rush. You are the right person right now.');
    if (match.phrases.length > 0) {
      const phrase = match.phrases[Math.floor(Math.random() * match.phrases.length)];
      // Strip SSML for context injection
      const cleanPhrase = phrase.replace(/<[^>]*>/g, '').trim();
      lines.push(`Example approach: "${cleanPhrase}"`);
    }
    return lines.join('\n');
  }

  // Normal handoff suggestion
  lines.push(`POTENTIAL HANDOFF OPPORTUNITY (confidence: ${Math.round(match.confidence * 100)}%)`);
  lines.push(`Suggested specialist: ${match.suggestedPersona}`);
  lines.push('');

  // Team introduction if available
  if (content.team_introductions) {
    const personaKey = match.suggestedPersona.toLowerCase().replace(' ', '-');
    for (const [key, intro] of Object.entries(content.team_introductions)) {
      if (key.includes(personaKey) || personaKey.includes(key.split('-')[0])) {
        const cleanIntro = intro.replace(/<[^>]*>/g, '').trim();
        lines.push(`Team intro: "${cleanIntro}"`);
        break;
      }
    }
  }

  // Handoff phrase examples
  if (match.phrases.length > 0) {
    lines.push('');
    lines.push('SUGGESTED HANDOFF LANGUAGE:');
    const phrase = match.phrases[Math.floor(Math.random() * match.phrases.length)];
    const cleanPhrase = phrase.replace(/<[^>]*>/g, '').trim();
    lines.push(`"${cleanPhrase}"`);
  }

  // General guidance
  lines.push('');
  lines.push('GUIDANCE:');
  lines.push('- Only suggest handoff if it genuinely serves the user');
  lines.push('- Present it as an option, not a dismissal');
  lines.push('- Make the transition feel natural and caring');

  // Team awareness phrases
  if (content.team_awareness && content.team_awareness.length > 0) {
    const awarenessPhrase = content.team_awareness[Math.floor(Math.random() * content.team_awareness.length)];
    const cleanAwareness = awarenessPhrase.replace(/<[^>]*>/g, '').trim();
    lines.push(`Alternative framing: "${cleanAwareness}"`);
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildTeamCoordinationContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, services, userData } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';
  const sessionId = services?.sessionId || 'anonymous';
  const turnCount = userData.turnCount || 0;

  // Only Ferni coordinates handoffs (he's the coordinator)
  if (personaId !== 'ferni') {
    return injections;
  }

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Get state
  const state = getState(sessionId);

  // Don't suggest handoffs too often
  if (turnCount - state.lastHandoffSuggestionTurn < 5 && turnCount > 5) {
    return injections;
  }

  // Max 2 handoff suggestions per session (don't be pushy)
  if (state.handoffSuggestionsCount >= 2) {
    return injections;
  }

  // Don't suggest in first few turns (build rapport first)
  if (turnCount < 3) {
    return injections;
  }

  // Detect handoff opportunity
  const match = detectHandoffOpportunity(input, content);

  if (!match) {
    return injections;
  }

  // Don't re-suggest same domain
  if (state.suggestedDomains.includes(match.domain)) {
    return injections;
  }

  // Generate guidance
  const guidance = generateHandoffGuidance(content, match);
  if (guidance) {
    injections.push(
      createStandardInjection('team_coordination', guidance, { category: 'persona' })
    );

    // Update state
    state.lastHandoffSuggestionTurn = turnCount;
    state.handoffSuggestionsCount++;
    state.suggestedDomains.push(match.domain);

    log.debug(
      {
        sessionId,
        turnCount,
        domain: match.domain,
        confidence: match.confidence,
        suggestedPersona: match.suggestedPersona,
      },
      'Team coordination guidance applied'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupTeamCoordinationState(sessionId: string): void {
  sessionState.delete(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'team_coordination_context',
  description: 'Coordinates handoffs to specialist personas based on conversation domain',
  priority: 45, // Team coordination - mid-priority to influence routing decisions
  build: buildTeamCoordinationContext,
});

export { buildTeamCoordinationContext };
