/**
 * Voice Agent Turn Handler
 *
 * Handles the completion of each user turn with:
 * - Slash command detection
 * - Turn processing via TurnProcessor
 * - "Better Than Human" personality injection
 * - Context injection for LLM
 * - Celebration events
 * - Trust systems recording
 * - Dead air prevention (thinking fillers, error recovery)
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/turn-handler
 */

import { log, type llm } from '@livekit/agents';
import { getGracefulErrorResponse } from '../../intelligence/conversation-quality.js';
import {
  analyzeUserEngagement,
  recordResponseForLearning,
  type ConversationSignalContext,
} from '../../intelligence/index.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/index.js';
import {
  ferniPersonality,
  type PersonalityTurnResult,
} from '../../personas/bundles/ferni/personality-integration.js';
import {
  sharedPersonality,
  type PersonaTurnResult,
} from '../../personas/shared/persona-turn-personality.js';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { getThinkingFiller } from '../../speech/persona-phrases.js';
import { dispatchEmotionEvents } from '../realtime/emotion-event-dispatcher.js';
import { dispatchBehaviorEvents, type BehaviorDetectionContext } from '../realtime/behavior-event-dispatcher.js';
import type { SessionStateManager } from '../session/session-state.js';
import { PROCESSING_TIMEOUTS } from '../shared/constants.js';
import { handleSlashCommand, recordTrustSystemsData, sendCelebrationEvents } from './index.js';
import type { ThemeCategory } from '../../services/session-variety-tracker.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TurnHandlerContext {
  /** LLM chat context */
  turnCtx: llm.ChatContext;
  /** User message text */
  userText: string;
  /** Current persona config */
  persona: PersonaConfig;
  /** Bundle runtime (optional) */
  bundleRuntime?: BundleRuntimeEngine;
  /** Session services */
  services: SessionServices;
  /** User data (proxy to SessionStateManager) */
  userData: {
    turnCount?: number;
    extensibilitySessionPrompt?: string | null;
    preSessionBriefing?: string;
    // Voice/prosody signals for personality system (optional)
    speechRateWPM?: number;
    pauseBeforeMs?: number;
    totalConversations?: number;
    sharedVulnerabilities?: number;
  };
  /** Voice emotion result (optional, from voice agent) */
  voiceEmotion?: {
    primary: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
  /** Session state manager (single source of truth) */
  sessionStateManager?: SessionStateManager;
  /** Current session for speaking */
  currentSession?: {
    say: (text: string, opts?: { allowInterruptions?: boolean }) => void;
  };
  /** Room for data messages (optional) */
  room?: {
    localParticipant?: {
      publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
    };
  };
  /** Send data message callback */
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
  /** Previous turn history for personality system */
  previousTurns?: Array<{
    userTranscript: string;
    speechRate?: number;
    pauseBefore?: number;
    voiceEmotion?: string;
    topics?: string[];
  }>;
}

// ============================================================================
// PERSONALITY STATE TRACKING (Cross-turn)
// ============================================================================

/** Track previous personality expressions for resonance learning */
const previousExpressions = new Map<string, { theme: ThemeCategory; content: string }>();

/** Track previous turns for pattern detection (per session) */
interface TurnHistory {
  userTranscript: string;
  speechRate?: number;
  pauseBefore?: number;
  voiceEmotion?: string;
  topics?: string[];
  timestamp: number;
}
const turnHistories = new Map<string, TurnHistory[]>();
const MAX_TURN_HISTORY = 10;

/** Get previous expression for a session */
function getPreviousExpression(sessionId: string): { theme: ThemeCategory; content: string } | undefined {
  return previousExpressions.get(sessionId);
}

/** Store expression for next turn's resonance learning */
function storePreviousExpression(
  sessionId: string,
  expression: { theme: ThemeCategory; content: string } | null
): void {
  if (expression) {
    previousExpressions.set(sessionId, expression);
  }
}

/** Record a turn for pattern detection */
function recordTurnHistory(
  sessionId: string,
  turn: Omit<TurnHistory, 'timestamp'>
): void {
  let history = turnHistories.get(sessionId) || [];
  history.push({ ...turn, timestamp: Date.now() });
  
  // Keep only last N turns
  if (history.length > MAX_TURN_HISTORY) {
    history = history.slice(-MAX_TURN_HISTORY);
  }
  
  turnHistories.set(sessionId, history);
}

/** Get turn history for a session */
function getTurnHistory(sessionId: string): TurnHistory[] {
  return turnHistories.get(sessionId) || [];
}

/** Clean up session personality state */
export function cleanupPersonalityState(sessionId: string): void {
  previousExpressions.delete(sessionId);
  turnHistories.delete(sessionId);
  ferniPersonality.cleanup(sessionId);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Process a completed user turn.
 *
 * This is the main turn processing pipeline that:
 * 1. Detects and handles slash commands
 * 2. Processes the turn through TurnProcessor
 * 3. Injects context into LLM
 * 4. Handles extensibility hooks
 * 5. Sends celebration events
 * 6. Records trust systems data
 * 7. Prevents dead air with fillers and error recovery
 */
export async function handleUserTurn(ctx: TurnHandlerContext): Promise<void> {
  const {
    turnCtx,
    userText,
    persona,
    bundleRuntime,
    services,
    userData,
    sessionStateManager,
    currentSession,
    room,
    sendDataMessage,
  } = ctx;
  const logger = log();

  if (!userText || userText.trim().length === 0) {
    return;
  }

  // ================================================================
  // EXTENSIBILITY: Slash command detection
  // ================================================================
  const trimmedText = userText.trim();
  let _isSlashCommand = false;
  if (trimmedText.startsWith('/')) {
    const slashResult = await handleSlashCommand({
      text: trimmedText,
      turnCtx,
      personaId: persona.id,
      services: { userId: services.userId, sessionId: services.sessionId },
    });
    _isSlashCommand = slashResult.handled;
  }

  try {
    // Import the turn processor (cached after first load)
    const { processTurn, injectTurnContext, getCelebrationEvents } =
      await import('../processors/index.js');

    // Build turn context
    const turnContext = {
      turnCtx,
      userText,
      persona,
      bundleRuntime,
      services,
      userData,
      logger,
    };

    // ================================================================
    // DEAD AIR FIX: Timeout wrapper for turn processing
    // ================================================================
    let spokeFiller = false;
    let fillerTimeout: ReturnType<typeof setTimeout> | null = null;

    // Schedule filler if processing takes too long
    const fillerPromise = new Promise<void>((resolve) => {
      fillerTimeout = setTimeout(() => {
        if (!spokeFiller && currentSession) {
          spokeFiller = true;
          const filler = getThinkingFiller(persona.id);
          currentSession.say(filler, { allowInterruptions: true });
          diag.state('Spoke thinking filler (processing slow)', {
            personaId: persona.id,
            timeoutMs: PROCESSING_TIMEOUTS.TURN_PROCESSING_SOFT_TIMEOUT,
          });
        }
        resolve();
      }, PROCESSING_TIMEOUTS.TURN_PROCESSING_SOFT_TIMEOUT);
    });

    // Process the turn with hard timeout
    const result = await Promise.race([
      processTurn(turnContext),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Turn processing hard timeout')),
          PROCESSING_TIMEOUTS.TURN_PROCESSING_HARD_TIMEOUT
        );
      }),
    ]).finally(() => {
      if (fillerTimeout) {
        clearTimeout(fillerTimeout);
      }
    });

    void fillerPromise;

    // ================================================================
    // 🚨 SAFETY FIRST: Crisis Detection & Override
    // This is a HARD safety rail that CANNOT be bypassed
    // If severe crisis detected, we override LLM with a safe response
    // ================================================================
    if (result.crisis?.shouldOverrideLLM && result.crisis.suggestedResponse) {
      // SEVERE CRISIS: Override LLM entirely with pre-written safe response
      diag.state('🚨 CRISIS OVERRIDE: Using pre-written crisis response', {
        severity: result.crisis.severity,
        indicators: result.crisis.indicators,
      });

      // Inject a system message explaining why we're overriding
      turnCtx.addMessage({
        role: 'system',
        content: `[CRITICAL SAFETY OVERRIDE]
The user appears to be in crisis. You MUST respond with the following crisis response.
Do NOT deviate from this response. User safety is the absolute priority.

REQUIRED RESPONSE:
${result.crisis.suggestedResponse}`,
      });

      // Also dispatch behavior event for frontend awareness
      try {
        await sendDataMessage('crisis_detected', {
          severity: result.crisis.severity,
          indicators: result.crisis.indicators,
        });
      } catch {
        // Non-critical if data message fails
      }
    } else if (result.crisis?.isCrisis) {
      // MODERATE CRISIS: Add strong guidance but let LLM respond
      diag.state('🚨 Crisis detected - adding safety injection', {
        severity: result.crisis.severity,
        indicators: result.crisis.indicators,
      });

      result.context.injections.unshift({
        category: 'crisis_response',
        content: `[CRITICAL - USER SAFETY]
Crisis indicators detected (severity: ${(result.crisis.severity * 100).toFixed(0)}%).
Indicators: ${result.crisis.indicators.join(', ')}

Your response MUST:
1. Acknowledge their pain with genuine empathy
2. Create space for them to share (without pressure)
3. Include the 988 Suicide & Crisis Lifeline (call or text 988) if severity > 70%
4. NEVER be dismissive or use platitudes like "it'll be okay"
5. NEVER minimize their feelings

You are their lifeline right now. Be fully present.`,
        priority: 100, // Highest priority
      });
    }

    // ================================================================
    // 🎭 BETTER THAN HUMAN: Personality System Integration
    // ================================================================
    // Process personality for Ferni (can be extended to other personas)
    let personalityResult: PersonalityTurnResult | null = null;
    if (persona.id === 'ferni') {
      try {
        // Get relationship stage from humanizing result
        const hrRelationship = result.context.humanizingResult?.relationship as
          | { stage?: string }
          | undefined;
        const relationshipStage = (hrRelationship?.stage || 'acquaintance') as
          | 'stranger'
          | 'acquaintance'
          | 'friend'
          | 'trusted_advisor';

        // Get momentum from humanizing result
        const hrMood = result.context.humanizingResult?.mood as
          | { state?: string; energyLevel?: number }
          | undefined;
        const momentum = mapMoodToMomentum(hrMood?.state, result.emotional.intensity);

        // Detect if heavy topic
        const isHeavyTopic =
          result.emotional.distressLevel > 0.5 ||
          result.context.injections.some((i) =>
            i.content.toLowerCase().includes('grief') ||
            i.content.toLowerCase().includes('crisis') ||
            i.content.toLowerCase().includes('loss')
          );

        // Detect user intent from analysis
        const userIntent = mapIntentToSharing(result.analysis?.analysis?.intent?.primary);

        // Get topics from analysis
        const topics = result.analysis?.analysis?.topics?.detected || [];

        personalityResult = await ferniPersonality.processTurn({
          sessionId: services.sessionId,
          userId: services.userId,
          turnCount: userData.turnCount || 1,
          userTranscript: userText,

          // Voice signals
          pauseBeforeMs: userData.pauseBeforeMs || 0,
          speechRateWPM: userData.speechRateWPM,
          voiceEmotion: ctx.voiceEmotion,

          // Analysis results
          textEmotion: {
            primary: result.emotional.primary,
            intensity: result.emotional.intensity,
            distressLevel: result.emotional.distressLevel,
            valence: result.emotional.intensity > 0.5 ? 'negative' : 'neutral',
            trajectory: result.emotional.trajectory as 'rising' | 'falling' | 'stable' | undefined,
          },

          // Conversation state
          momentum,
          topics,
          lastTopic: sessionStateManager?.getState().conversation.recentTopics[0],

          // Relationship
          relationshipStage,
          totalConversations: userData.totalConversations || 1,
          sharedVulnerabilities: userData.sharedVulnerabilities || 0,

          // Previous turns (from this session)
          previousTurns: getTurnHistory(services.sessionId),

          // Flags
          isHeavyTopic,
          wasPersonalSharing: result.context.injections.some((i) =>
            i.category === 'memory' || i.content.includes('shared')
          ),
          userIntent,

          // Previous expression for resonance learning
          previousExpression: getPreviousExpression(services.sessionId),
        });

        // Inject personality if applicable
        if (personalityResult.shouldInject) {
          const injectionContent = buildPersonalityInjection(personalityResult);
          if (injectionContent) {
            result.context.injections.push({
              category: 'personality',
              content: injectionContent,
              priority: 75, // After identity but before general context
            });

            diag.info('🎭 Better Than Human personality injection', {
              hasNoticing: !!personalityResult.noticing,
              hasExpression: !!personalityResult.expression,
              noticingType: personalityResult.noticing?.type,
              expressionTheme: personalityResult.expression?.theme,
            });
          }
        }

        // Store expression for next turn's resonance learning
        if (personalityResult.expression) {
          storePreviousExpression(services.sessionId, {
            theme: personalityResult.expression.theme,
            content: personalityResult.expression.content,
          });
        }

        // Record this turn for pattern detection
        recordTurnHistory(services.sessionId, {
          userTranscript: userText,
          speechRate: userData.speechRateWPM,
          pauseBefore: userData.pauseBeforeMs,
          voiceEmotion: ctx.voiceEmotion?.primary,
          topics,
        });

        // ================================================================
        // INTEGRATION: Personality → Behavior Event
        // When personality system notices something, dispatch to behavior system
        // This connects the two "Better Than Human" systems
        // ================================================================
        if (personalityResult.behaviorEvent) {
          const behaviorEventContent = `[SYSTEM_EVENT]\n${JSON.stringify({
            event: personalityResult.behaviorEvent.event,
            data: personalityResult.behaviorEvent.data,
            suggestedResponse: personalityResult.behaviorEvent.suggestedResponse,
            source: 'personality_noticing',
          })}`;

          turnCtx.addMessage({
            role: 'system',
            content: `[BEHAVIOR SYSTEM - Personality Noticing]\n\n${behaviorEventContent}\n\n` +
              `The personality system noticed something. You may call behavior functions in response.`,
          });

          diag.info('🔄 Personality noticing → Behavior event', {
            noticingType: personalityResult.noticing?.type,
            behaviorEvent: personalityResult.behaviorEvent.event,
          });
        }
      } catch (personalityError) {
        logger.debug({ error: String(personalityError) }, 'Personality system (non-critical)');
      }
    } else if (sharedPersonality.hasSupport(persona.id)) {
      // ================================================================
      // 🎭 SHARED PERSONALITY: For Maya, Jordan, Peter, Alex, Nayan
      // Uses the persona-agnostic personality system
      // ================================================================
      try {
        const hrRelationship = result.context.humanizingResult?.relationship as
          | { stage?: string }
          | undefined;
        const relationshipStage = hrRelationship?.stage || 'acquaintance';

        const hrMood = result.context.humanizingResult?.mood as
          | { state?: string; energyLevel?: number }
          | undefined;
        const momentum = mapMoodToMomentum(hrMood?.state, result.emotional.intensity);

        const isHeavyTopic =
          result.emotional.distressLevel > 0.5 ||
          result.context.injections.some((i) =>
            i.content.toLowerCase().includes('grief') ||
            i.content.toLowerCase().includes('crisis') ||
            i.content.toLowerCase().includes('loss')
          );

        const topics = result.analysis?.analysis?.topics?.detected || [];

        const sharedResult = await sharedPersonality.processTurn({
          personaId: persona.id,
          sessionId: services.sessionId,
          userId: services.userId,
          turnCount: userData.turnCount || 1,
          userTranscript: userText,

          // Voice signals
          pauseBeforeMs: userData.pauseBeforeMs || 0,
          speechRateWPM: userData.speechRateWPM,
          voiceEmotion: ctx.voiceEmotion,

          // Analysis results
          textEmotion: {
            primary: result.emotional.primary,
            intensity: result.emotional.intensity,
            distressLevel: result.emotional.distressLevel,
            valence: result.emotional.intensity > 0.5 ? 'negative' : 'neutral',
          },

          // Conversation state
          momentum,
          topics,

          // Relationship
          relationshipStage,
          totalConversations: userData.totalConversations || 1,

          // Flags
          isHeavyTopic,
          wasPersonalSharing: result.context.injections.some(
            (i) => i.category === 'memory' || i.content.includes('shared')
          ),
        });

        // Inject personality if applicable
        if (sharedResult.shouldInject) {
          const content =
            sharedResult.humanization?.ssml || sharedResult.expression?.ssml || '';
          if (content) {
            result.context.injections.push({
              category: 'personality',
              content: `[PERSONALITY] ${content}`,
              priority: 75,
            });

            diag.info('🎭 Shared persona personality injection', {
              personaId: persona.id,
              hasHumanization: !!sharedResult.humanization,
              humanizationType: sharedResult.humanization?.type,
              hasExpression: !!sharedResult.expression,
            });
          }
        }
      } catch (personalityError) {
        logger.debug({ error: String(personalityError) }, 'Shared personality system (non-critical)');
      }
    }

    // Inject context into LLM
    injectTurnContext(turnCtx, result);

    // ================================================================
    // UPDATE SESSION STATE MANAGER (Single Source of Truth)
    // All state updates go through SessionStateManager
    // ================================================================
    if (sessionStateManager) {
      // Increment turn count
      sessionStateManager.incrementTurn();

      // Update last user message
      sessionStateManager.setLastUserMessage(userText);

      // Update emotional state from analysis
      if (result.emotional) {
        sessionStateManager.setEmotionAnalysis({
          primary: result.emotional.primary,
          intensity: result.emotional.intensity,
          distressLevel: result.emotional.distressLevel,
        });
      }

      // Update topic from analysis
      if (result.analysis?.currentTopic) {
        sessionStateManager.setTopic(result.analysis.currentTopic);
      }

      // Update relationship stage from humanizing result
      // Cast to access typed properties (mood/relationship are unknown to break circular deps)
      const hrRelationship = result.context.humanizingResult?.relationship as
        | { stage?: string }
        | undefined;
      if (hrRelationship?.stage) {
        sessionStateManager.setRelationshipStage(
          hrRelationship.stage as 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'
        );
      }

      // Update mood from humanizing result
      const hrMood = result.context.humanizingResult?.mood as { state?: string } | undefined;
      if (hrMood?.state) {
        // Import MoodState type inline to avoid circular dependency
        type MoodState =
          | 'energized'
          | 'reflective'
          | 'playful'
          | 'grounded'
          | 'tired_but_present'
          | 'philosophical'
          | 'nostalgic';
        sessionStateManager.setMood(hrMood.state as MoodState);
      }

      // Record personal themes mentioned in response
      const themeMentions = result.context.injections
        ?.filter((i) => i.category === 'memory' || i.category === 'continuity')
        .map((i) => i.content)
        .join(' ');
      if (themeMentions) {
        sessionStateManager.recordThemesMentioned(themeMentions);
      }

      diag.state('SessionStateManager updated after turn', {
        turnCount: sessionStateManager.getTurnCount(),
        topic: result.analysis?.currentTopic,
        emotionalPrimary: result.emotional?.primary,
      });
    }

    // ================================================================
    // EXTENSIBILITY: before_response hook
    // ================================================================
    try {
      const { onBeforeResponse } =
        await import('../../personas/bundles/extensibility-integration.js');
      const beforeResponsePrompt = await onBeforeResponse({
        personaId: persona.id,
        userId: services.userId,
        sessionId: services.sessionId,
      });

      if (beforeResponsePrompt) {
        turnCtx.addMessage({
          role: 'system',
          content: `[AGENT EXTENSIBILITY - RESPONSE GUIDANCE]\n${beforeResponsePrompt}`,
        });
        logger.info({ personaId: persona.id }, 'Extensibility before_response hook injected');
      }

      // Session start context for first turns
      const extSessionPrompt = userData.extensibilitySessionPrompt;
      if (extSessionPrompt && (userData.turnCount ?? 0) <= 1) {
        turnCtx.addMessage({
          role: 'system',
          content: `[AGENT EXTENSIBILITY - SESSION CONTEXT]\n${extSessionPrompt}`,
        });
        logger.info({ personaId: persona.id }, 'Extensibility session_start context injected');
      }

      // Pre-session briefing (world/time awareness) for first turns
      const preSessionBriefing = userData.preSessionBriefing;
      if (preSessionBriefing && (userData.turnCount ?? 0) === 0) {
        turnCtx.addMessage({
          role: 'system',
          content: preSessionBriefing,
        });
        logger.info('Pre-session briefing injected (turn 0)');
      }
    } catch (extHookErr) {
      logger.warn({ error: String(extHookErr) }, 'Extensibility hook failed (non-fatal)');
    }

    // ================================================================
    // HUMAN-FIRST 2FA: Phone ask opportunity
    // ================================================================
    try {
      const { getResponseModification } =
        await import('../../services/trust-and-identity/voice-agent-integration.js');
      const phoneAskMod = getResponseModification(services.sessionId);

      if (phoneAskMod.injectPhoneAsk && phoneAskMod.script) {
        turnCtx.addMessage({
          role: 'system',
          content: `[MAGIC MOMENT - PHONE COLLECTION]
This is a perfect emotional moment to naturally ask for their phone number.
Moment type: ${phoneAskMod.momentType}
Emotional tone: ${phoneAskMod.tone}

SUGGESTED ASK (incorporate naturally): "${phoneAskMod.script}"

IMPORTANT:
- Frame this as wanting to follow up/check in, NOT data collection
- Make it feel like YOU want to stay connected, not that you NEED their info
- If they decline, accept gracefully and move on
- Don't repeat if already asked this session`,
        });

        diag.session('Phone ask injected', {
          momentType: phoneAskMod.momentType,
          tone: phoneAskMod.tone,
        });
      }
    } catch (phoneAskErr) {
      logger.debug({ error: String(phoneAskErr) }, 'Phone ask injection skipped');
    }

    // Send celebration events to frontend
    const celebrations = getCelebrationEvents(result);
    if (celebrations.length > 0) {
      await sendCelebrationEvents({ injections: celebrations, room });
    }

    // Send mood update to frontend
    if (result.context.humanizingResult) {
      const hr = result.context.humanizingResult;
      // Cast to access typed properties (mood/relationship are unknown to break circular deps)
      const mood = hr.mood as { state?: string; energyLevel?: number } | undefined;
      const relationship = hr.relationship as { stage?: string } | undefined;
      await sendDataMessage('mood', {
        state: mood?.state,
        energyLevel: mood?.energyLevel,
        relationshipStage: relationship?.stage,
        hasTransition: !!hr.relationshipTransition,
      });
    }

    // ================================================================
    // 🚀 FERNI EQ: Dispatch emotion events for "Better Than Human" UI
    // ================================================================
    // This sends humanization signals to the frontend EQ system:
    // - Concern detection (distress awareness)
    // - Voice-text mismatch (protective instinct)
    // - Emotional trajectory (improving/declining arc)
    // The frontend better-than-human.ui.ts responds with avatar expressions
    if (services.userId) {
      try {
        await dispatchEmotionEvents(
          {
            emotionalState: result.emotional,
            userId: services.userId,
            personaId: persona.id,
            sessionId: services.sessionId,
          },
          sendDataMessage
        );
      } catch (eqError) {
        logger.debug({ error: String(eqError) }, 'Emotion event dispatch (non-critical)');
      }
    }

    // ================================================================
    // 🔄 BIDIRECTIONAL BEHAVIOR SYSTEM: Dispatch behavior events
    // ================================================================
    // This detects behavioral signals and injects [SYSTEM_EVENT] messages
    // into the LLM context, enabling the dynamic loop:
    // - System detects → dispatches event → LLM responds → calls behavior → loop
    try {
      const behaviorContext: BehaviorDetectionContext = {
        emotionalState: {
          primary: result.emotional.primary,
          intensity: result.emotional.intensity,
          distressLevel: result.emotional.distressLevel,
          trajectory: result.emotional.trajectory,
        },
        // Previous emotional state from session state manager
        previousEmotionalState: sessionStateManager?.getState().emotional.lastEmotionAnalysis
          ? {
              primary: sessionStateManager.getState().emotional.lastEmotionAnalysis?.primary || 'neutral',
              intensity: sessionStateManager.getState().emotional.lastEmotionAnalysis?.intensity || 0,
            }
          : undefined,
        // Time of day
        hourOfDay: new Date().getHours(),
        // Topic weight detection
        topicWeight:
          result.emotional.distressLevel > 0.6 ||
          result.context.injections.some(
            (i) =>
              i.content.toLowerCase().includes('grief') ||
              i.content.toLowerCase().includes('loss') ||
              i.content.toLowerCase().includes('death')
          )
            ? 'heavy'
            : result.emotional.intensity > 0.5
              ? 'medium'
              : 'light',
        // Relationship stage
        relationshipStage:
          (result.context.humanizingResult?.relationship as { stage?: string } | undefined)
            ?.stage || 'developing',
        // Turn count
        turnCount: userData.turnCount ?? 0,
      };

      // Inject behavior events into LLM context
      const behaviorEvents = dispatchBehaviorEvents(behaviorContext, (role, content) => {
        turnCtx.addMessage({ role, content });
      });

      if (behaviorEvents.length > 0) {
        diag.info('🔄 Behavior events dispatched', {
          events: behaviorEvents.map((e) => e.event).join(', '),
          count: behaviorEvents.length,
        });

        // 🔄 ALSO emit to frontend for immediate visual feedback
        // This closes the loop: System detects → Frontend avatar reacts
        for (const event of behaviorEvents) {
          if (event.suggestedResponse) {
            try {
              // Emit mode shift signal if suggested
              if (event.suggestedResponse.mode) {
                await sendDataMessage('behavior_signal', {
                  type: 'mode_shift',
                  mode: event.suggestedResponse.mode,
                  reason: event.event,
                  timestamp: Date.now(),
                });
              }
              // Emit pacing change signal if suggested
              if (event.suggestedResponse.pacing) {
                await sendDataMessage('behavior_signal', {
                  type: 'pacing_change',
                  pacing: event.suggestedResponse.pacing,
                  reason: event.event,
                  timestamp: Date.now(),
                });
              }
            } catch (emitError) {
              logger.debug({ error: String(emitError) }, 'Failed to emit behavior signal (non-critical)');
            }
          }
        }
      }
    } catch (behaviorError) {
      logger.debug({ error: String(behaviorError) }, 'Behavior event dispatch (non-critical)');
    }

    // ================================================================
    // TRUST SYSTEMS DATA RECORDING
    // ================================================================
    const { userId } = services;
    if (userId) {
      await recordTrustSystemsData({ userId, userText, result });
    }

    // ================================================================
    // COLLECTIVE LEARNING: Record signal for community insights
    // ================================================================
    if (userId && services.sessionId) {
      try {
        // Extract topic from injections if available
        const topicInjection = result.context.injections.find(
          (i) => i.category === 'topics' || i.content.includes('topic')
        );
        const topic = topicInjection?.content.split(' ')[0] || 'general';

        // Build context for collective learning
        // Cast relationship to access stage (typed as unknown to break circular deps)
        const learningRelationship = result.context.humanizingResult?.relationship as
          | { stage?: string }
          | undefined;
        const learningContext: ConversationSignalContext = {
          sessionId: services.sessionId,
          userId,
          personaId: persona.id,
          turnNumber: userData.turnCount ?? 0,
          emotion: result.emotional.primary || 'neutral',
          topic,
          relationshipStage: learningRelationship?.stage || 'unknown',
        };

        // Create a simplified emotion result for engagement analysis
        const valence = result.emotional.intensity > 0.5 ? 'positive' : 'neutral';
        const emotionForEngagement = {
          primary: result.emotional.primary as 'neutral',
          intensity: result.emotional.intensity,
          valence: valence as 'positive' | 'neutral' | 'negative',
          distressLevel: result.emotional.distressLevel || 0,
          confidence: 0.8,
          markers: [] as string[],
          suggestedTone: 'warm' as 'warm',
        };

        // Analyze user engagement based on their message
        const engagement = analyzeUserEngagement(
          userText,
          null, // Previous emotion (not tracked here)
          emotionForEngagement
        );

        // Record the response signal (async, non-blocking)
        void recordResponseForLearning(
          learningContext,
          result.context.injections
            .map((i) => i.content)
            .join(' ')
            .slice(0, 500), // Summarize context injections
          engagement,
          {
            hadPersonalShare: result.context.injections.some(
              (i) => i.content.includes('personal') || i.content.includes('story')
            ),
            hadQuirk: result.context.injections.some(
              (i) => i.content.includes('quirk') || i.content.includes('playful')
            ),
            hadTeamReference: result.context.injections.some(
              (i) => i.content.includes('team') || i.content.includes('handoff')
            ),
          }
        );

        logger.debug(
          { emotion: result.emotional.primary, topic: learningContext.topic },
          'Collective learning signal recorded'
        );
      } catch (learningError) {
        logger.debug(
          { error: String(learningError) },
          'Collective learning recording (non-critical)'
        );
      }
    }

    logger.info(
      {
        elapsedMs: result.context.elapsedMs,
        contextCount: result.context.injections.length,
        emotion: result.emotional.primary,
      },
      'Turn processed with TurnProcessor V2'
    );
  } catch (error) {
    logger.error({ error: String(error) }, 'TurnProcessor V2 failed');

    // ================================================================
    // DEAD AIR FIX: Graceful error recovery
    // ================================================================
    const isTimeout = String(error).includes('timeout');
    const errorType = isTimeout ? 'api_timeout' : 'general';
    const gracefulError = getGracefulErrorResponse(errorType, String(error));

    if (currentSession) {
      try {
        currentSession.say(gracefulError.userMessage, { allowInterruptions: true });
        diag.state('Spoke graceful error recovery', {
          errorType,
          recoverable: gracefulError.recoverable,
        });
      } catch (sayError) {
        logger.error({ error: String(sayError) }, 'Failed to speak error recovery');
      }
    }
  }
}

// ============================================================================
// PERSONALITY HELPER FUNCTIONS
// ============================================================================

/**
 * Map mood state to conversation momentum
 */
function mapMoodToMomentum(
  moodState: string | undefined,
  emotionalIntensity: number
): 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled' {
  if (!moodState) return 'cruising';

  if (emotionalIntensity > 0.8) return 'peaking';
  if (emotionalIntensity > 0.6) return 'intimate';

  switch (moodState) {
    case 'energized':
    case 'playful':
      return 'cruising';
    case 'reflective':
    case 'philosophical':
    case 'nostalgic':
      return 'intimate';
    case 'grounded':
      return 'cruising';
    case 'tired_but_present':
      return 'closing';
    default:
      return 'cruising';
  }
}

/**
 * Map intent to user sharing type
 */
function mapIntentToSharing(
  intent: string | undefined
): 'sharing' | 'asking' | 'venting' | 'exploring' | 'celebrating' | 'requesting' | undefined {
  if (!intent) return undefined;

  const intentMap: Record<string, 'sharing' | 'asking' | 'venting' | 'exploring' | 'celebrating' | 'requesting'> = {
    confiding: 'sharing',
    venting: 'venting',
    seeking_advice: 'asking',
    exploring: 'exploring',
    celebrating: 'celebrating',
    requesting: 'requesting',
    sharing: 'sharing',
    greeting: 'sharing',
    questioning: 'asking',
  };

  return intentMap[intent.toLowerCase()];
}

/**
 * Build personality injection content from result
 */
function buildPersonalityInjection(result: PersonalityTurnResult): string | null {
  const parts: string[] = [];

  // Add noticing guidance
  if (result.noticing && result.noticing.shouldAcknowledge) {
    parts.push(`[🔔 BETTER THAN HUMAN - NOTICED]
Type: ${result.noticing.type}
Observation: ${result.noticing.observation}

START YOUR RESPONSE WITH (naturally incorporate):
"${result.noticing.acknowledgment}"

Timing: ${result.noticing.timing} | Subtlety: ${result.noticing.subtlety}`);
  }

  // Add expression guidance
  if (result.expression) {
    const expr = result.expression;
    parts.push(`[🎭 PERSONALITY EXPRESSION]
Theme: ${expr.theme}
Intimacy: ${Math.round(expr.intimacyLevel * 100)}%

${expr.shouldBeSubtle ? 'Weave in subtly' : 'Share naturally'} ${
      result.injectionPoint === 'mid_response'
        ? 'in the middle of your response'
        : result.injectionPoint === 'after_response'
          ? 'at the end of your response'
          : 'at the beginning'
    }:

"${expr.content}"

(This is from ${expr.compositionReason})`);
  }

  if (parts.length === 0) return null;

  return parts.join('\n\n');
}

export default handleUserTurn;
