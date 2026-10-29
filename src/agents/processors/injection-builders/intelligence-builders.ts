/**
 * Intelligence & Tool Injection Builders
 *
 * Handles semantic intelligence, function calling reinforcement,
 * persona-specific context, tool history, and service availability.
 *
 * Priority: 75-90 (high - critical for tool execution and intelligence)
 */

import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';

// Model provider for native FC check
import { getModelProvider } from '../../model-provider/index.js';

import type {
  InjectionBuilderContext,
  SemanticIntelligenceInjectionResult,
  PersonaSpecificContextInput,
  PersonaContextBuilder,
} from './types.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { flagOn } from '../../../config/env-flag.js';
import type { FlagName } from '../../../config/flag-manifest.js';
import { isKnownId, toCanonical, type CanonicalPersonaId } from '../../../personas/index.js';

// ============================================================================
// PERSONA BUILDERS (lazy-loaded, keyed by canonical persona id)
// ============================================================================

interface PersonaBuilderEntry {
  /** Off-by-default flag a builder waits behind until it is fixed. */
  flag?: FlagName;
  load: () => Promise<PersonaContextBuilder>;
}

/**
 * Each teammate's own briefing builder, keyed by the canonical ids in
 * personas/persona-ids.ts. Keyed by bare names before #2836, so the live ids
 * maya-santos, jordan-taylor, alex-chen and nayan-patel matched nothing and
 * those four builders never ran on a call. Each now waits behind its own flag
 * (src/config/flags/PERSONA_BRIEFING_*.ts says what is wrong with it).
 */
const PERSONA_BUILDERS: Partial<Record<CanonicalPersonaId, PersonaBuilderEntry>> = {
  ferni: {
    load: async () =>
      (
        await import('../../../intelligence/context-builders/personas/ferni-coordinator-insights.js')
      ).buildFerniCoordinatorIntelligenceContext,
  },
  'peter-john': {
    load: async () =>
      (
        await import('../../../intelligence/context-builders/personas/peter-research-insights/index.js')
      ).buildPeterResearchInsightsContext,
  },
  'maya-santos': {
    flag: 'PERSONA_BRIEFING_MAYA',
    load: async () =>
      (
        await import('../../../intelligence/context-builders/personas/maya-coaching-insights/index.js')
      ).buildMayaCoachingInsightsContext,
  },
  'jordan-taylor': {
    flag: 'PERSONA_BRIEFING_JORDAN',
    load: async () =>
      (
        await import('../../../intelligence/context-builders/personas/jordan-milestone-insights/index.js')
      ).buildJordanMilestoneInsightsContext,
  },
  'alex-chen': {
    flag: 'PERSONA_BRIEFING_ALEX',
    load: async () =>
      (
        await import('../../../intelligence/context-builders/personas/alex-communication-insights/index.js')
      ).buildAlexCommunicationInsightsContext,
  },
  'nayan-patel': {
    flag: 'PERSONA_BRIEFING_NAYAN',
    load: async () =>
      (
        await import('../../../intelligence/context-builders/personas/nayan-wisdom-insights/index.js')
      ).buildNayanWisdomInsightsContext,
  },
  'joel-dickson': {
    load: async () =>
      (
        await import('../../../intelligence/context-builders/personas/joel-dickson-insights/index.js')
      ).buildLifeMentorInsightsContext,
  },
};

const personaBuilderCache = new Map<CanonicalPersonaId, PersonaContextBuilder>();

/**
 * The briefing builder for a persona id or alias, or null when the persona has
 * none, its flag is off, or the id is unknown (a custom agent is not Ferni).
 */
async function getPersonaBuilder(personaId: string): Promise<PersonaContextBuilder | null> {
  // persona.id comes from runtime config; a missing id gets no builder rather than a throw.
  if (typeof personaId !== 'string' || !isKnownId(personaId)) return null;
  const canonical = toCanonical(personaId);
  const entry = PERSONA_BUILDERS[canonical];
  if (!entry || (entry.flag && !flagOn(entry.flag))) return null;

  const cached = personaBuilderCache.get(canonical);
  if (cached) return cached;
  try {
    const builder = await entry.load();
    personaBuilderCache.set(canonical, builder);
    return builder;
  } catch (error) {
    diag.debug(`Failed to load persona builder for ${personaId}`, { error: String(error) });
    return null;
  }
}

// ============================================================================
// SESSION DYNAMICS RE-EXPORT
// Priority: 55-60
// ============================================================================

export { buildSessionDynamicsInjection } from '../../integrations/session-dynamics-integration.js';

// ============================================================================
// SEMANTIC INTELLIGENCE INJECTION BUILDER
// Priority: 75-80
// ============================================================================

/**
 * Build semantic intelligence injection for LLM context.
 *
 * Provides tool hints, learned user patterns, intent classification,
 * and proactive suggestions.
 */
export async function buildSemanticIntelligenceInjection(params: {
  userId: string;
  sessionId: string;
  personaId: string;
  userText: string;
  recentTools?: string[];
  recentTopics?: string[];
}): Promise<SemanticIntelligenceInjectionResult> {
  try {
    const { getSemanticIntelligence } =
      await import('../../../intelligence/semantic-intelligence/index.js');

    const result = await getSemanticIntelligence({
      userId: params.userId,
      sessionId: params.sessionId,
      personaId: params.personaId,
      inputText: params.userText,
      recentTools: params.recentTools,
      recentTopics: params.recentTopics,
    });

    const topHint = result.toolHints.hints[0];
    const prediction = topHint
      ? {
          toolId: topHint.toolId,
          confidence: topHint.confidence,
          isToolRequest: result.toolHints.isToolRequest,
        }
      : undefined;

    if (!result.combinedInjection || result.combinedInjection.trim().length === 0) {
      return { injection: null, prediction };
    }

    diag.debug('🧠 Semantic intelligence injected', {
      userId: params.userId,
      topHint: topHint?.toolId,
      intentType: result.intentClassification.type,
      isToolRequest: result.toolHints.isToolRequest,
      processingTimeMs: result.totalProcessingTimeMs,
    });

    return {
      injection: {
        category: 'semantic_intelligence',
        content: result.combinedInjection,
        priority: 78,
      },
      prediction,
    };
  } catch (error) {
    diag.debug('Semantic intelligence injection skipped', { error: String(error) });
    return { injection: null };
  }
}

// ============================================================================
// FUNCTION CALLING REINFORCEMENT
// Priority: 90 (very high - critical for tool execution)
// ============================================================================

/**
 * Build function-calling reinforcement injection.
 * JSON {fn,args} reinforcement is gone — native FC / FTIS handle tools.
 */
export function buildFunctionCallingReinforcement(
  _userText: string,
  _turnCount: number
): ContextInjection | null {
  // JSON {fn,args} reinforcement is gone — native FC / FTIS handle tools.
  return null;
}

// ============================================================================
// PERSONA-SPECIFIC CONTEXT INJECTION BUILDER
// ============================================================================

/**
 * Build persona-specific context injections.
 *
 * Runs on first turn, handoff, or every 10 turns for refresh.
 */
export async function buildPersonaSpecificContextInjections(
  ctx: PersonaSpecificContextInput
): Promise<ContextInjection[]> {
  const { services, userData, persona, userText, analysis, turnCount, isHandoff } = ctx;

  const shouldInject = turnCount === 0 || isHandoff || (turnCount > 0 && turnCount % 10 === 0);

  if (!shouldInject) {
    return [];
  }

  const userId = services.userId || 'anonymous';
  if (!isMemberIdentity(userId)) {
    return [];
  }

  const builder = await getPersonaBuilder(persona.id);
  if (!builder) {
    diag.debug('No persona-specific builder found', { personaId: persona.id });
    return [];
  }

  try {
    const keyMoments = userData.keyMoments?.map((moment) =>
      typeof moment === 'string' ? { summary: moment, timestamp: new Date() } : moment
    );

    const builderInput = {
      userText,
      analysis,
      services: {
        ...services,
        personaId: persona.id,
      } as import('../../../services/types.js').SessionServices & { personaId: string },
      userData: {
        ...userData,
        turnCount,
        keyMoments,
      },
      userProfile: services.userProfile,
      persona,
    };

    const startTime = performance.now();
    const rawInjections = await builder(builderInput);
    const duration = performance.now() - startTime;

    const priorityMap: Record<string, number> = {
      critical: 100,
      high: 75,
      standard: 50,
      hint: 25,
    };

    const injections: ContextInjection[] = rawInjections
      .filter((inj) => inj.content)
      .map((inj) => ({
        category: inj.category || `persona_${persona.id}`,
        content: inj.content,
        priority: priorityMap[inj.priority] ?? 50,
      }));

    if (injections.length > 0) {
      diag.info('🎯 Persona-specific context injected', {
        personaId: persona.id,
        injectionsCount: injections.length,
        durationMs: Math.round(duration),
        turnCount,
        isHandoff: !!isHandoff,
      });
    }

    return injections;
  } catch (error) {
    diag.warn('Persona-specific context builder failed', {
      personaId: persona.id,
      error: String(error),
    });
    return [];
  }
}

// ============================================================================
// TOOL HISTORY INJECTION BUILDER
// Priority: 85
// ============================================================================

/**
 * Build tool history context injection so LLM knows what tools it executed.
 */
export async function buildToolHistoryInjection(
  ctx: InjectionBuilderContext
): Promise<ContextInjection | null> {
  const { services } = ctx;

  if (!services.userId) {
    return null;
  }

  try {
    const { getConversationState } = await import('../../../services/conversation-state.js');
    const convState = getConversationState(services.userId);

    // Check for in-flight tools
    const inFlight = convState.getToolInFlight();
    let inFlightWarning = '';
    if (inFlight && inFlight.elapsedMs > 2000) {
      const elapsedSec = Math.round(inFlight.elapsedMs / 1000);
      inFlightWarning = `⏳ TOOL IN PROGRESS: "${inFlight.toolId}" has been running for ${elapsedSec}s
   - DO NOT ask the user to wait or acknowledge delay - the system handles this
   - When the tool completes, you'll see the result in your next context
   - Focus on the user's needs, not the tool execution

`;
    }

    const history = convState.getToolHistory(3);

    if ((!history || history.length === 0) && !inFlightWarning) {
      return null;
    }

    const historyLines = history.map((entry, idx) => {
      const timeAgo = Math.round((Date.now() - entry.timestamp) / 1000);
      const timeStr = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.round(timeAgo / 60)}m ago`;
      const statusEmoji = entry.success ? '✅' : '❌';

      if (idx === 0) {
        return `${statusEmoji} JUST NOW (${timeStr}): ${entry.toolId}
   Result: ${entry.result.slice(0, 200)}${entry.result.length > 200 ? '...' : ''}
   ${entry.userRequest ? `In response to: "${entry.userRequest.slice(0, 100)}"` : ''}`;
      }

      return `${statusEmoji} ${timeStr}: ${entry.toolId} → ${entry.result.slice(0, 80)}${entry.result.length > 80 ? '...' : ''}`;
    });

    const historyContent =
      history && history.length > 0
        ? `[🔧 RECENT TOOL EXECUTIONS - You DID these things]

${historyLines.join('\n\n')}

GUIDANCE:
- If user asks "what did you just do?" - reference this history
- If user seems confused - you can naturally mention what you just did
- This is your memory of actions taken - BE ACCURATE about what you did
- Never hallucinate or make up tool results - only reference what's here`
        : '';

    const content = inFlightWarning + historyContent;

    diag.debug('🔧 Tool history injection built', {
      historyCount: history.length,
      mostRecent: history[0]?.toolId,
    });

    return {
      category: 'tool_history',
      content,
      priority: 85,
    };
  } catch (error) {
    diag.debug('Tool history injection skipped', {
      error: String(error),
    });
    return null;
  }
}
