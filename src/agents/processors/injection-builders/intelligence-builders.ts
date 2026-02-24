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

// ============================================================================
// PERSONA BUILDER CACHE (lazy-loaded)
// ============================================================================

const personaBuilderCache = new Map<string, PersonaContextBuilder>();

async function getPersonaBuilder(personaId: string): Promise<PersonaContextBuilder | null> {
  const cached = personaBuilderCache.get(personaId);
  if (cached) return cached;

  try {
    let builder: PersonaContextBuilder | null = null;

    switch (personaId.toLowerCase()) {
      case 'peter':
      case 'peter-john':
      case 'the-quant': {
        const mod =
          await import('../../../intelligence/context-builders/personas/peter-research-insights/index.js');
        builder = mod.buildPeterResearchInsightsContext;
        break;
      }
      case 'maya': {
        const mod =
          await import('../../../intelligence/context-builders/personas/maya-coaching-insights/index.js');
        builder = mod.buildMayaCoachingInsightsContext;
        break;
      }
      case 'jordan': {
        const mod =
          await import('../../../intelligence/context-builders/personas/jordan-milestone-insights/index.js');
        builder = mod.buildJordanMilestoneInsightsContext;
        break;
      }
      case 'alex': {
        const mod =
          await import('../../../intelligence/context-builders/personas/alex-communication-insights/index.js');
        builder = mod.buildAlexCommunicationInsightsContext;
        break;
      }
      case 'nayan': {
        const mod =
          await import('../../../intelligence/context-builders/personas/nayan-wisdom-insights.js');
        builder = mod.buildNayanWisdomInsightsContext;
        break;
      }
      case 'ferni': {
        const mod =
          await import('../../../intelligence/context-builders/personas/ferni-coordinator-insights.js');
        builder = mod.buildFerniCoordinatorIntelligenceContext;
        break;
      }
      case 'joel':
      case 'joel-dickson': {
        const mod =
          await import('../../../intelligence/context-builders/personas/joel-dickson-insights/index.js');
        builder = mod.buildJoelDicksonInsightsContext;
        break;
      }
      default:
        return null;
    }

    if (builder) {
      personaBuilderCache.set(personaId.toLowerCase(), builder);
    }
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
 * Patterns that indicate a tool request
 */
const TOOL_REQUEST_PATTERNS = [
  /\b(play|put on|listen to)\s+(some\s+)?(music|song|jazz|rock|spotify)/i,
  /\b(play|put on)\s+\w+/i,
  /\bcould you play\b/i,
  /\bcan you play\b/i,
  /\b(weather|temperature|forecast|rain|cold|hot outside)\b/i,
  /\bwhat('s| is)\s+(the\s+)?(weather|temp)/i,
  /\bwhat\s+time\b/i,
  /\bthe\s+time\b/i,
  /\b(calendar|schedule|appointment|meeting)\b/i,
  /\bwhat('s| do I have)?\s+(on\s+)?(today|tomorrow|my calendar)\b/i,
  /\b(call|text|message|reach out to|contact)\s+\w+/i,
  /\b(news|headlines|what('s| is) happening)\b/i,
  /\b(talk to|speak with|transfer|switch to)\s+(maya|peter|alex|jordan|nayan|ferni)\b/i,
  /\bcan you\s+\w+/i,
  /\bcould you\s+\w+/i,
  /\bwould you\s+\w+/i,
];

function detectToolRequest(userText: string): boolean {
  const text = userText.toLowerCase().trim();
  return TOOL_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Build function-calling reinforcement injection
 *
 * CRITICAL: This fixes the issue where Gemini outputs text like
 * "I'm playing music now!" instead of the JSON tool call.
 */
export function buildFunctionCallingReinforcement(
  userText: string,
  turnCount: number
): ContextInjection | null {
  const provider = getModelProvider();
  if (provider.hasNativeFunctionCalling()) {
    return null;
  }

  if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    return null;
  }

  if (!detectToolRequest(userText)) {
    return null;
  }

  const isLongSession = turnCount > 20;

  const content = `
🚨 TOOL REQUEST DETECTED - OUTPUT JSON ONLY 🚨

The user is asking for an ACTION. You MUST output JSON, not text.

${isLongSession ? '⚠️ REMINDER: Saying "I\'m doing X" does NOT do X. Only JSON executes.' : ''}

CORRECT:
- Music request → {"fn":"playMusic","args":{"query":"..."}}
- Weather request → {"fn":"getWeather","args":{}}
- Call/text request → {"fn":"reachOut","args":{"contact":"...","purpose":"..."}}
- Handoff request → {"fn":"handoffToMaya","args":{"reason":"..."}}

WRONG:
- "I'm playing music now!" ← DOES NOTHING
- "Let me check the weather!" ← DOES NOTHING
- "I'll call them!" ← DOES NOTHING

OUTPUT ONLY THE JSON. NO WORDS. NO PREAMBLE. JUST THE JSON OBJECT.
`.trim();

  diag.debug('🔧 Function calling reinforcement injected', {
    turnCount,
    isLongSession,
    userTextPreview: userText.slice(0, 50),
  });

  return {
    category: 'function_calling_reinforcement',
    content,
    priority: 90,
  };
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
  if (userId === 'anonymous') {
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

// ============================================================================
// SERVICE AVAILABILITY INJECTION
// Priority: 80
// ============================================================================

interface ServiceAvailability {
  serviceId: string;
  serviceName: string;
  isConnected: boolean;
  unavailableCapabilities?: string[];
}

/**
 * Build service availability injection
 *
 * CRITICAL: Prevents LLM from promising features that aren't available
 */
export async function buildServiceAvailabilityInjection(
  ctx: InjectionBuilderContext
): Promise<ContextInjection | null> {
  const { services } = ctx;

  if (!services.userId) {
    return null;
  }

  try {
    const { getIntegrationHub } = await import('../../../services/integrations/index.js');
    const hub = getIntegrationHub();

    const servicesToCheck: Array<{
      id: string;
      name: string;
      unavailableCapabilities: string[];
    }> = [
      {
        id: 'spotify',
        name: 'Spotify',
        unavailableCapabilities: ['play music on Spotify', 'create playlists', 'control playback'],
      },
      {
        id: 'google_calendar',
        name: 'Google Calendar',
        unavailableCapabilities: ['schedule events', 'check your calendar', 'set reminders'],
      },
      {
        id: 'gmail',
        name: 'Gmail',
        unavailableCapabilities: ['send emails', 'read your inbox', 'draft messages'],
      },
      {
        id: 'plaid',
        name: 'Banking (Plaid)',
        unavailableCapabilities: [
          'check account balances',
          'review transactions',
          'track spending',
        ],
      },
    ];

    const availabilityResults: ServiceAvailability[] = await Promise.all(
      servicesToCheck.map(async (service) => ({
        serviceId: service.id,
        serviceName: service.name,
        isConnected: await hub.isConnectedAsync(services.userId!, service.id),
        unavailableCapabilities: service.unavailableCapabilities,
      }))
    );

    const connectedServices = availabilityResults.filter((s) => s.isConnected);
    const disconnectedServices = availabilityResults.filter((s) => !s.isConnected);

    if (disconnectedServices.length === 0) {
      return null;
    }

    const unavailableLines = disconnectedServices.map((service) => {
      const caps = service.unavailableCapabilities?.join(', ') || 'use this service';
      return `- ${service.serviceName}: NOT CONNECTED - Do NOT offer to ${caps}`;
    });

    const connectedLine =
      connectedServices.length > 0
        ? `\n\nConnected services: ${connectedServices.map((s) => s.serviceName).join(', ')}`
        : '';

    return {
      category: 'service_availability',
      content: `[🔌 SERVICE AVAILABILITY - What you CAN and CANNOT do]

The following services are NOT connected for this user:
${unavailableLines.join('\n')}

CRITICAL: Do NOT promise or offer features from disconnected services.
Instead, say "I'd need you to connect [Service] to do that" if the user asks.${connectedLine}`,
      priority: 80,
    };
  } catch (error) {
    diag.debug('Service availability injection failed (graceful skip)', {
      userId: services.userId,
      error: String(error),
    });
    return null;
  }
}
