/**
 * Agent Setup Module
 *
 * Provides reusable setup functions for creating fully-featured persona agents.
 * Each agent gets its own Gemini session, TTS, handlers, and tools.
 *
 * This is the core of the multi-agent architecture - it ensures each persona
 * agent has all the capabilities needed for a full conversation.
 *
 * HANDLERS INCLUDED:
 * - Transcript handler (turn processing, emotion detection)
 * - Session state handlers (silence detection, engagement)
 * - Tool tracking handler (monitoring)
 * - Music handler (playback control)
 *
 * @module agents/multi-agent/agent-setup
 */

import * as genai from '@google/genai';
import { voice, type JobContext } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as openai from '@livekit/agents-plugin-openai';
import type { Room } from '@livekit/rtc-node';
import type { PersonaConfig } from '../../personas/types.js';
import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { modelConfig } from '../../services/model-config.js';
import type { SessionServices } from '../../services/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { UserData } from '../shared/types.js';

// Model provider abstraction - centralizes all model-specific behavior
import { getModelProvider, isUsingOpenAI } from '../model-provider/index.js';

// Get the model provider (singleton)
const modelProvider = getModelProvider();
// FIX: Import speech cleanup to prevent memory leaks on agent cleanup
import { cleanupSpeechSession } from '../../speech/session-cleanup.js';
// FIX: Import retry counter cleanup for WeakMap session GC
import { clearRetryCounter } from '../shared/sanitizer/index.js';
// Speech coordination for centralized speech management
import { coordinatedSay, cleanupSpeechCoordination } from '../../speech/coordination/index.js';
// BETTER THAN HUMAN: Health monitoring for OpenAI connection
import {
  startHealthMonitoring,
  stopHealthMonitoring,
  registerPingCallback,
} from '../shared/openai-health-monitor.js';

// ============================================================================
// CRITICAL PATH IMPORTS - Hoisted to module level for faster startup
// These were previously dynamic imports causing 500ms+ delays
// ============================================================================
import { loadSystemPrompt, loadModelBaseInstructions } from '../personas/prompt-loader.js';
import { FerniAgent } from '../personas/ferni-agent.js';
import { VAD_CONFIG } from '../shared/constants.js';
import * as voiceManagerModule from '../../speech/voice-manager.js';
import { resolveVoiceId } from '../../tools/handoff/voice-id-resolver.js';
// Tool loading - hoisted for faster initial agent startup
import {
  getToolsForAgent,
  initializeToolOrchestrator,
  isOrchestratorInitialized,
} from '../../tools/orchestrator/voice-agent-integration.js';
import { buildHandoffTools } from '../../tools/handoff/handoff-factory.js';
import { loadEssentialDomains } from '../../tools/dynamic-loader/index.js';
import { warmupHandoffToolsForSession } from '../../tools/handoff/session-cache.js';
// Handler imports - hoisted for faster handler wiring
import { createTranscriptHandler } from '../voice-agent/transcript-handler.js';
import { setupSessionStateHandlers } from '../voice-agent/session-state-handler.js';
import { setupToolTrackingHandler } from '../voice-agent/tool-tracking-handler.js';
import { setupMusicHandler } from '../voice-agent/music-handler.js';
import { dynamicToolLoader } from '../../tools/dynamic-loader.js';
import { autoOptimizer } from '../../tools/optimization/auto-optimizer.js';
import { initializeFrontendPublisher } from '../realtime/index.js';
// Gateway for health ping callback
import { generateReply } from '../shared/generate-reply-gateway.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for setting up a persona agent.
 */
export interface AgentSetupConfig {
  /** Persona configuration */
  persona: PersonaConfig;
  /** LiveKit job context */
  ctx: JobContext;
  /** LiveKit room */
  room: Room;
  /** Session services (DI container) */
  services: SessionServices;
  /** User data */
  userData: UserData;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string;
  /** Is this a handoff (not initial connection)? */
  isHandoff?: boolean;
  /** Previous persona (for handoff context) */
  previousPersonaId?: string;
  /** Conversation summary from previous agent */
  conversationSummary?: string;
  /** Recent messages for context */
  recentMessages?: string[];
  /** Conversation manager for tracking state */
  conversationManager?: ConversationManager;
  /** Enable full handlers (music, transcript, etc.) */
  enableFullHandlers?: boolean;
  /** Preferred language for STT (e.g., 'es-ES', 'ja-JP'). If not set, auto-detects. */
  preferredLanguage?: string;
  /**
   * ⚡ FAST-AGENT-JOIN: Defer handler wiring until after greeting.
   * When true, handlers are NOT wired during setup. Call `wireHandlers()` after greeting.
   * This reduces critical path time by ~500ms (handlers can be wired in background).
   */
  deferHandlers?: boolean;
}

/**
 * Result of setting up a persona agent.
 */
export interface AgentSetupResult {
  /** The voice session */
  session: voice.AgentSession<UserData>;
  /** The agent wrapper */
  agent: voice.Agent<UserData>;
  /** TTS engine */
  tts: Awaited<ReturnType<typeof createPersonaTTS>>;
  /** Cleanup function (cleans up all handlers) */
  cleanup: () => Promise<void>;
  /** Function to make agent speak */
  say: (text: string, options?: { allowInterruptions?: boolean }) => void;
  /** Handlers status */
  handlers: {
    transcript: boolean;
    sessionState: boolean;
    toolTracking: boolean;
    music: boolean;
  };
  /**
   * ⚡ FAST-AGENT-JOIN: Wire handlers after greeting.
   * Only present when deferHandlers=true. Call this AFTER greeting is spoken.
   * Wires transcript, session state, tool tracking, and music handlers.
   */
  wireHandlers?: () => Promise<void>;
}

// ============================================================================
// MAIN SETUP FUNCTION
// ============================================================================

/**
 * Set up a fully-featured persona agent.
 *
 * This creates:
 * - Gemini session with persona's system prompt
 * - Cartesia TTS with persona's voice
 * - All necessary handlers (when enableFullHandlers=true):
 *   - Transcript handler (turn processing, emotion detection)
 *   - Session state handlers (silence detection, engagement)
 *   - Tool tracking handler
 *   - Music handler
 *
 * @param config - Setup configuration
 * @returns The configured agent components
 */
export async function setupPersonaAgent(config: AgentSetupConfig): Promise<AgentSetupResult> {
  const {
    persona,
    userData,
    sessionId,
    isHandoff,
    previousPersonaId,
    room,
    services,
    userId,
    conversationManager,
    enableFullHandlers = true, // Default to enabling all handlers
    deferHandlers = false, // ⚡ FAST-AGENT-JOIN: defer handler wiring for faster startup
  } = config;

  // 📊 TIMING INSTRUMENTATION - Track every step
  const timings: Record<string, number> = {};
  const mark = (name: string) => {
    timings[name] = Date.now();
    const elapsed = setupStart ? Date.now() - setupStart : 0;
    log.info({ personaId: persona.id, step: name, elapsedMs: elapsed }, `⏱️ [TIMING] ${name}`);
    process.stderr.write(`⏱️ [${elapsed}ms] ${name}\n`);
  };

  const setupStart = Date.now();
  mark('setup_start');

  log.info(
    { personaId: persona.id, sessionId, isHandoff, enableFullHandlers, deferHandlers },
    '🎭 Setting up persona agent'
  );

  // CRITICAL FIX: Set personaId on userData so TTS wrapper knows which persona is active
  // This enables persona-specific SSML/speech traits (e.g., Peter's excited discovery mode)
  // Without this, all personas use Ferni's TTS configuration
  userData.personaId = persona.id;

  const cleanupFunctions: Array<() => void | Promise<void>> = [];

  // =========================================================================
  // BUILD SYSTEM PROMPTS - Two levels for optimal instruction following
  // FIX: Previously used buildAgentSystemPrompt which missed function-calling instructions
  // =========================================================================
  // TWO-LEVEL INSTRUCTION ARCHITECTURE:
  // Model-level: Foundational rules (tool format, honesty, platform context)
  //   - These are active from the VERY FIRST MOMENT of connection
  //   - Concise, critical rules that must never be forgotten
  // Agent-level: Full persona prompt (identity, detailed tools, personality)
  //   - Sent via LiveKit's updateInstructions() after session starts
  //   - Contains full persona identity and detailed tool catalog

  let systemPrompt: string;
  let modelBaseInstructions: string;
  try {
    mark('load_prompts_start');
    // Load both levels of instructions in parallel (imports now hoisted to module level)
    const [baseInstructions, loadedSystemPrompt] = await Promise.all([
      loadModelBaseInstructions(),
      loadSystemPrompt(persona.id),
    ]);
    mark('load_prompts_done');

    systemPrompt = loadedSystemPrompt;

    // =========================================================================
    // DATE/TIME AWARENESS - Critical for grounding agent in reality
    // This is injected into model-level instructions so the agent knows
    // the date/time from the VERY FIRST MOMENT (including greeting)
    // =========================================================================
    const now = new Date();
    const dateTimeContext = `
---

## Current Date & Time

Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
The current time is ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.

Use this awareness naturally - don't announce it unless asked, just BE present in the moment.
If someone asks what day it is, what time it is, or what the date is, you know the answer.
`;

    // Append date/time to model base instructions (session-specific, not cached)
    modelBaseInstructions = baseInstructions + dateTimeContext;

    // =========================================================================
    // USER AWARENESS - Enhance model instructions with user context
    // This makes the agent aware of WHO they're talking to from the first moment
    // =========================================================================
    const { userProfile } = services;
    if (userProfile) {
      const userAwareness: string[] = [];
      const sessionStartTime = now;
      const displayName = userProfile.preferredName || userProfile.name || userData?.userName;

      // User's name
      if (displayName) {
        userAwareness.push(`You're talking to ${displayName}.`);
      }

      // Relationship context
      const isReturningUser = (userProfile.totalConversations ?? 0) > 0;
      if (isReturningUser && userProfile.totalConversations) {
        const convCount = userProfile.totalConversations;
        if (convCount === 1) {
          userAwareness.push("You've talked once before.");
        } else if (convCount < 5) {
          userAwareness.push(
            `You've talked ${convCount} times - still getting to know each other.`
          );
        } else if (convCount < 20) {
          userAwareness.push(`You've had ${convCount} conversations - a growing friendship.`);
        } else {
          userAwareness.push(
            `You've had ${convCount} conversations together - you know each other well.`
          );
        }

        // Last conversation time
        if (userProfile.lastContact) {
          const lastContactDate = new Date(userProfile.lastContact);
          const daysSince = Math.floor(
            (sessionStartTime.getTime() - lastContactDate.getTime()) / (24 * 60 * 60 * 1000)
          );
          if (daysSince === 0) {
            userAwareness.push('You talked earlier today.');
          } else if (daysSince === 1) {
            userAwareness.push('You talked yesterday.');
          } else if (daysSince < 7) {
            userAwareness.push(`Last talked ${daysSince} days ago.`);
          } else if (daysSince < 30) {
            userAwareness.push(
              `It's been about ${Math.round(daysSince / 7)} weeks since you last talked.`
            );
          } else {
            userAwareness.push(
              `It's been a while - about ${Math.round(daysSince / 30)} month${daysSince > 45 ? 's' : ''} since you last talked.`
            );
          }
        }
      } else if (!isReturningUser) {
        userAwareness.push(
          'This is your first conversation with them - be welcoming but not overwhelming.'
        );
      }

      // Key relationship facts (if available)
      const { relationshipStage } = userProfile;
      if (relationshipStage && relationshipStage !== 'new_acquaintance') {
        const stageDescriptions: Record<string, string> = {
          getting_to_know: "You're still getting to know each other.",
          trusted_advisor: 'They trust you and share openly.',
          old_friend: "You're old friends - deep relationship.",
        };
        if (stageDescriptions[relationshipStage]) {
          userAwareness.push(stageDescriptions[relationshipStage]);
        }
      }

      // =========================================================================
      // BETTER THAN HUMAN #1: Last Conversation Context
      // A human friend might vaguely remember "oh we talked recently"
      // Ferni remembers EXACTLY what you talked about
      // =========================================================================
      if (isReturningUser && userProfile.lastConversationSummary) {
        userAwareness.push(`Last time you talked about: ${userProfile.lastConversationSummary}`);
      }

      // =========================================================================
      // BETTER THAN HUMAN #2: Emotional Memory (via mood tracking)
      // A human friend might not notice you were struggling last time
      // Ferni remembers and checks in
      // =========================================================================
      if (userProfile.humanizingState?.lastMood) {
        const { lastMood } = userProfile.humanizingState;
        // Map moods to emotional context
        const moodContext: Record<string, string> = {
          tired_but_present: 'Last time they seemed a bit tired - be gentle.',
          reflective: 'Last time they were in a reflective mood.',
          philosophical: 'Last time they were in a thoughtful, philosophical space.',
          energized: 'Last time they were full of energy!',
          grounded: 'Last time they seemed calm and grounded.',
          playful: 'Last time they were in a playful mood.',
          nostalgic: 'Last time they were feeling nostalgic.',
        };
        if (moodContext[lastMood]) {
          userAwareness.push(moodContext[lastMood]);
        }
      }

      // =========================================================================
      // BETTER THAN HUMAN #3: Key Life Events Awareness
      // A human friend might forget important dates and events
      // Ferni remembers milestones, challenges, and celebrations
      // =========================================================================
      if (userProfile.lifeEvents && userProfile.lifeEvents.length > 0) {
        // Find recent events (within last 30 days that are in progress or upcoming)
        const relevantEvents = userProfile.lifeEvents
          .filter((event) => {
            // Focus on active or upcoming events
            return (
              event.status === 'in_progress' ||
              event.status === 'upcoming' ||
              event.status === 'planning'
            );
          })
          .slice(0, 2); // Max 2 events

        for (const event of relevantEvents) {
          const eventTypes: Record<string, string> = {
            wedding: 'preparing for a wedding',
            baby: 'expecting or has a new baby',
            graduation: 'graduation coming up',
            career_change: 'going through a career change',
            relocation: 'moving/relocating',
            loss: 'dealing with a loss',
            celebration: 'has something to celebrate',
          };
          const eventContext = eventTypes[event.type];
          if (eventContext) {
            userAwareness.push(`Life context: ${event.title || eventContext}`);
          }
        }
      }

      // =========================================================================
      // BETTER THAN HUMAN #4: Goals & Concerns Awareness
      // Know what matters to them right now
      // =========================================================================
      if (userProfile.goals && userProfile.goals.length > 0) {
        const topGoal = userProfile.goals[0];
        userAwareness.push(`Current goal: ${topGoal}`);
      }
      if (userProfile.primaryConcerns && userProfile.primaryConcerns.length > 0) {
        const topConcern = userProfile.primaryConcerns[0];
        userAwareness.push(`On their mind: ${topConcern}`);
      }

      if (userAwareness.length > 0) {
        modelBaseInstructions += `
---

## Who You're Talking To

${userAwareness.join('\n')}

Use this awareness naturally. Don't announce what you know - just BE a friend who remembers.
Reference past context when relevant, but don't force it. Let the conversation flow.
`;
        // DETAILED LOGGING: Show exactly what "Better Than Human" context is being injected
        log.info(
          { personaId: persona.id, userAwarenessCount: userAwareness.length },
          `👤 BETTER THAN HUMAN - User awareness injected (${userAwareness.length} facts)`
        );
        userAwareness.forEach((fact, i) => {
          log.debug({ fact }, `  ${i + 1}. ${fact}`);
        });
      } else {
        log.debug(
          { personaId: persona.id },
          '👤 No user awareness facts available (new user or empty profile)'
        );
      }

      // =========================================================================
      // BETTER THAN HUMAN #5: Calendar Awareness (Non-blocking)
      // A human friend doesn't know your schedule. Ferni does.
      // =========================================================================
      if (userId) {
        // Fire-and-forget calendar fetch (don't block agent setup)
        void (async () => {
          try {
            const { getAmbientCalendarContext } =
              await import('../../services/calendar/ambient-calendar-awareness.js');
            const calendarContext = await getAmbientCalendarContext(userId);

            if (calendarContext.isCalendarConnected) {
              const calendarAwareness: string[] = [];

              // Next meeting awareness
              if (
                calendarContext.nextMeeting.event &&
                calendarContext.nextMeeting.minutesUntil !== null
              ) {
                const minutes = calendarContext.nextMeeting.minutesUntil;
                const meetingTitle = calendarContext.nextMeeting.event.title;

                if (minutes <= 15) {
                  calendarAwareness.push(
                    `⏰ They have "${meetingTitle}" in ${minutes} minutes - be mindful of time.`
                  );
                } else if (minutes <= 60) {
                  calendarAwareness.push(
                    `📅 They have "${meetingTitle}" in about ${Math.round(minutes / 15) * 15} minutes.`
                  );
                }
              }

              // Just ended meeting (great for follow-up)
              if (
                calendarContext.justEndedMeeting.event &&
                calendarContext.justEndedMeeting.minutesSince !== null
              ) {
                const minutes = calendarContext.justEndedMeeting.minutesSince;
                const meetingTitle = calendarContext.justEndedMeeting.event.title;

                if (minutes <= 15) {
                  calendarAwareness.push(
                    `💬 They just finished "${meetingTitle}" - could be a natural topic.`
                  );
                }
              }

              // Busy day awareness
              if (calendarContext.remainingMeetingsToday >= 4) {
                calendarAwareness.push(
                  `📊 They have ${calendarContext.remainingMeetingsToday} more meetings today - busy day.`
                );
              }

              if (calendarAwareness.length > 0) {
                // Store in userData for use in turn-handler injection (turn 0-1)
                userData.calendarAwareness = calendarAwareness.join(' ');
                // DETAILED LOGGING: Show calendar awareness being stored
                log.info(
                  { personaId: persona.id, calendarInsightsCount: calendarAwareness.length },
                  `📅 BETTER THAN HUMAN - Calendar awareness loaded (${calendarAwareness.length} insights)`
                );
                calendarAwareness.forEach((insight, i) => {
                  log.debug({ insight }, `  ${i + 1}. ${insight}`);
                });
              } else {
                log.debug(
                  { personaId: persona.id },
                  '📅 Calendar connected but no relevant insights (no upcoming/recent meetings)'
                );
              }
            } else {
              log.debug({ personaId: persona.id, userId }, '📅 Calendar not connected for user');
            }
          } catch (calErr) {
            // Calendar not connected or fetch failed - log but don't block
            log.debug({ error: String(calErr) }, '📅 Calendar fetch failed (non-critical)');
          }
        })();
      }
    }

    log.info(
      {
        personaId: persona.id,
        modelBase: modelBaseInstructions.length,
        fullPrompt: systemPrompt.length,
      },
      '🎭 Loaded two-level prompts (model base + full persona, with date/time + user awareness)'
    );
  } catch (promptErr) {
    log.warn(
      { error: String(promptErr), personaId: persona.id },
      '⚠️ Failed to load prompts, using fallback'
    );
    systemPrompt = buildAgentSystemPrompt(config);
    modelBaseInstructions = systemPrompt; // Fallback: use same for both
  }

  // Add handoff context if this is a handoff
  if (isHandoff && previousPersonaId) {
    const handoffContext = await buildHandoffContext(config);
    if (handoffContext) {
      systemPrompt = `${systemPrompt}\n\n${handoffContext}`;
    }
  }

  // =========================================================================
  // ⚡ FAST-AGENT-JOIN: Parallelize TTS, tools, and LLM creation
  // =========================================================================
  // These operations are independent and can run concurrently.
  // This reduces agent startup time by ~30-50% (1-2 seconds saved).

  mark('parallel_start');
  const parallelStart = Date.now();

  // 1. TTS creation promise
  mark('tts_start');
  const ttsPromise = createPersonaTTS(persona.id).then((tts) => {
    mark('tts_done');
    return tts;
  });

  // 2. Tool loading promise
  // HANDOFF FIX: Tool loading was taking 22.9s and causing Gemini session timeout
  // During handoffs, we use a shorter timeout to ensure greeting speaks promptly
  // CRITICAL: Handoff tools MUST always be available, even if full tool loading times out
  mark('tools_start');

  // =========================================================================
  // FAST PATH FOR HANDOFFS: Skip expensive orchestrator, use cached tools!
  // =========================================================================
  // The full tool orchestrator does semantic matching + intelligence enhancement
  // which takes 5-20 seconds. For handoffs, we DON'T need all that - we just need
  // the basic tools to continue the conversation.
  //
  // Strategy:
  // 1. HANDOFFS: Use session-cached handoff tools + essential tools (instant!)
  // 2. INITIAL: Full orchestrator (but cache handoff tools for future handoffs)
  // =========================================================================
  // FIX: Increased handoff timeout from 5s to 8s
  // During handoffs, tool loading can be delayed by:
  // 1. Concurrent voice/TTS activity
  // 2. Cache warmup if not pre-loaded
  // 3. Network latency
  // Since the old agent is already responding, we have more slack time.
  const HANDOFF_TOOL_TIMEOUT_MS = 8000; // 8s timeout for handoffs (increased from 5s)
  const NORMAL_TOOL_TIMEOUT_MS = 15000; // 15s for initial agent startup
  const toolTimeoutMs = isHandoff ? HANDOFF_TOOL_TIMEOUT_MS : NORMAL_TOOL_TIMEOUT_MS;

  // =========================================================================
  // ⚡ FAST PATH: Use centralized implementation (skips semantic router)
  // This is 10-40x faster than full orchestrator: 200-500ms vs 5-20s
  // =========================================================================
  const loadHandoffToolsFast = async (): Promise<Record<string, unknown>> => {
    const fastStart = Date.now();
    try {
      // getToolsForAgent now hoisted to module level
      const subscriptionTier =
        (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

      const { tools, meta } = await getToolsForAgent({
        persona: { id: persona.id, displayName: persona.name },
        userId: userId || 'anonymous',
        userProfile: services.userProfile,
        subscriptionTier,
        services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
        // ⚡ FAST PATH FLAG: Skip semantic router entirely!
        fastPath: true,
        sessionId,
      });

      log.info(
        {
          personaId: persona.id,
          toolCount: meta.toolCount,
          elapsedMs: Date.now() - fastStart,
          sources: meta.sources,
        },
        '⚡ FAST PATH: Tools loaded for handoff (semantic router skipped)'
      );

      return tools;
    } catch (err) {
      // FIX: Don't return empty - fall back to essential tools!
      log.error({ personaId: persona.id, error: String(err) }, '❌ Fast path failed - trying essential fallback');
      return await loadEssentialToolsFallback();
    }
  };

  // FALLBACK PATH: Load essential tools when full orchestrator times out
  // BUG FIX: Previously only loaded handoff tools, missing music/weather/etc!
  // FIX: NEVER return empty - always provide minimum viable toolset
  const loadEssentialToolsFallback = async (): Promise<Record<string, unknown>> => {
    // This is the fallback when full tool loading times out
    // Load ESSENTIAL tools (handoff + entertainment + information) so agent can still function
    // buildHandoffTools now hoisted to module level
    try {
      const subscriptionTier =
        (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

      // 1. Build handoff tools (critical for team switching)
      const { tools: handoffTools, toolCount: handoffCount } = await buildHandoffTools({
        currentAgentId: persona.id,
        userProfile: services.userProfile,
        subscriptionTier,
        services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
      });

      // 2. Load essential domain tools (music, weather, etc.)
      // These are pre-loaded at worker startup, so this is fast
      // loadEssentialDomains now hoisted to module level
      let essentialTools: Record<string, unknown> = {};
      try {
        essentialTools = await loadEssentialDomains(userId || 'anonymous', services);
        log.info(
          { personaId: persona.id, essentialToolCount: Object.keys(essentialTools).length },
          '🎵 Essential domain tools loaded (music, weather, memory, etc.)'
        );
      } catch (essentialErr) {
        log.warn(
          { error: String(essentialErr) },
          '⚠️ Failed to load essential tools - only handoffs available'
        );
      }

      const allTools = { ...handoffTools, ...essentialTools };
      log.info(
        {
          personaId: persona.id,
          handoffCount,
          essentialCount: Object.keys(essentialTools).length,
          totalCount: Object.keys(allTools).length
        },
        '🔄 Essential tools loaded as timeout fallback (handoff + essential domains)'
      );
      return allTools;
    } catch (err) {
      // 🚨 CRITICAL: Even if all else fails, return emergency handoff tools
      // These are hardcoded tool definitions that ALWAYS work
      log.error(
        { personaId: persona.id, error: String(err) },
        '🚨 CRITICAL: Essential tool loading failed - using EMERGENCY hardcoded tools'
      );
      process.stderr.write(`\n🚨 CRITICAL TOOL FAILURE: ${err}\n`);
      process.stderr.write('🚨 Using emergency hardcoded tools - agent capabilities severely limited!\n\n');

      // Return emergency toolset - better than nothing!
      return getEmergencyToolset(persona.id);
    }
  };

  // 🚨 EMERGENCY TOOLSET: Absolute last resort when all tool loading fails
  // These are minimal handoff tools defined inline to guarantee availability
  const getEmergencyToolset = (currentPersonaId: string): Record<string, unknown> => {
    const personas = ['ferni', 'maya', 'peter-john', 'jordan', 'alex', 'nayan'];
    const tools: Record<string, unknown> = {};

    for (const targetId of personas) {
      if (targetId === currentPersonaId) continue;

      const toolName = `handoffTo${targetId.charAt(0).toUpperCase() + targetId.slice(1).replace('-', '')}`;
      tools[toolName] = {
        name: toolName,
        description: `Transfer the conversation to ${targetId}`,
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Why transferring' },
          },
        },
      };
    }

    // Add endCall tool
    tools.endCall = {
      name: 'endCall',
      description: 'End the conversation when the user wants to go',
      parameters: { type: 'object', properties: {} },
    };

    log.warn(
      { personaId: currentPersonaId, emergencyToolCount: Object.keys(tools).length },
      '🚨 EMERGENCY TOOLS ACTIVE - Only handoffs + endCall available!'
    );

    return tools;
  };

  const loadToolsInner = async (): Promise<Record<string, unknown>> => {
    // Tool orchestrator imports now hoisted to module level
    mark('tools_orchestrator_check');

    // Initialize orchestrator if needed
    if (!isOrchestratorInitialized()) {
      await initializeToolOrchestrator();
    }

    // Get tools for this persona
    const subscriptionTier =
      (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
    const { tools, meta } = await getToolsForAgent({
      persona: { id: persona.id, displayName: persona.name },
      userId: userId || 'anonymous',
      userProfile: services.userProfile,
      subscriptionTier,
      initialTranscript: '',
      services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
    });

    log.info(
      { personaId: persona.id, toolCount: meta.toolCount, mode: meta.mode },
      '🎭 Tools loaded for multi-agent persona'
    );
    return tools;
  };

  const toolsPromise = (async (): Promise<Record<string, unknown>> => {
    try {
      // =========================================================================
      // HANDOFF FAST PATH: Skip expensive orchestrator!
      // =========================================================================
      // For handoffs, use the fast path which loads from session cache + essential tools.
      // This typically completes in <500ms vs 5-20 seconds for full orchestrator.
      // =========================================================================
      if (isHandoff) {
        log.info({ personaId: persona.id }, '⚡ Using FAST PATH for handoff tool loading');
        const fastResult = await Promise.race([
          loadHandoffToolsFast(),
          new Promise<null>((resolve) =>
            setTimeout(() => {
              // NOTE: This CAN happen if:
              // 1. Session cache wasn't fully warmed before handoff
              // 2. Network delays during tool loading
              // 3. High CPU load during persona switch
              // It's NOT critical - we have a fallback. Downgrade from warn to debug.
              log.debug(
                { personaId: persona.id, timeoutMs: toolTimeoutMs },
                '⏰ Fast path timeout - using fallback (cache may not be warm)'
              );
              resolve(null);
            }, toolTimeoutMs)
          ),
        ]);
        
        if (fastResult === null || Object.keys(fastResult).length === 0) {
          log.info({ personaId: persona.id }, '🔄 Fast path incomplete - loading essential tools fallback');
          return await loadEssentialToolsFallback();
        }
        
        return fastResult;
      }

      // =========================================================================
      // INITIAL AGENT: Full orchestrator path (slower but comprehensive)
      // =========================================================================
      const result = await Promise.race([
        loadToolsInner(),
        new Promise<null>((resolve) =>
          setTimeout(() => {
            log.warn(
              { personaId: persona.id, timeoutMs: toolTimeoutMs, isHandoff },
              '⏰ Tool loading timeout - will check result and load essential tools if needed'
            );
            resolve(null);
          }, toolTimeoutMs)
        ),
      ]);

      // If timeout won OR result is empty/incomplete, load essential tools fallback!
      // BUG FIX #1: Previously only loaded handoff tools, missing music/weather/etc
      // BUG FIX #2: Race condition - loadToolsInner() might return empty {} just before timeout
      //             In that case result !== null but tools are still missing!
      const toolCount = result ? Object.keys(result).length : 0;
      const hasEssentials = result && (
        Object.keys(result).some(t => t.toLowerCase().includes('music') || t.toLowerCase().includes('play')) ||
        Object.keys(result).some(t => t.toLowerCase().includes('handoff'))
      );
      
      if (result === null || toolCount === 0 || !hasEssentials) {
        log.warn(
          { 
            personaId: persona.id, 
            wasNull: result === null,
            toolCount,
            hasEssentials,
          },
          '🔄 Full tool loading timed out or incomplete - loading essential tools fallback'
        );
        return await loadEssentialToolsFallback();
      }

      // ✅ SUCCESS: Full tools loaded. SYNCHRONOUSLY warmup session cache!
      // This ensures handoff tools are ready BEFORE any handoff request
      // warmupHandoffToolsForSession now hoisted to module level
      try {
        const cacheStart = Date.now();
        const tier =
          (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';
        await warmupHandoffToolsForSession(
          sessionId,
          services.userProfile,
          tier,
          services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } }
        );
        log.info(
          { sessionId, elapsedMs: Date.now() - cacheStart },
          '✅ Handoff tools cache warmed (ready for instant handoffs)'
        );
      } catch (warmupErr) {
        log.warn(
          { sessionId, error: String(warmupErr) },
          '⚠️ Failed to warmup handoff tools cache (handoffs may be slower)'
        );
      }

      return result;
    } catch (toolErr) {
      log.warn(
        { error: String(toolErr), personaId: persona.id },
        '⚠️ Failed to load tools - falling back to essential tools'
      );
      // Even on error, try to load essential tools
      return await loadEssentialToolsFallback();
    }
  })();

  // Wait for TTS and tools (LLM is created below in parallel section)
  const [tts, orchestratorTools] = await Promise.all([ttsPromise, toolsPromise]);

  // =========================================================================
  // 🔍 CRITICAL VISIBILITY: Log exactly what tools are available to LLM
  // This helps debug "tools not working" issues
  // =========================================================================
  const toolCount = Object.keys(orchestratorTools).length;
  const toolNames = Object.keys(orchestratorTools);
  const sampleTools = toolNames.slice(0, 10).join(', ');
  const hasHandoffs = toolNames.some(t => t.toLowerCase().includes('handoff'));
  const hasMusic = toolNames.some(t => t.toLowerCase().includes('music') || t.toLowerCase().includes('play'));
  const hasMemory = toolNames.some(t => t.toLowerCase().includes('memory') || t.toLowerCase().includes('recall'));

  // Log to both structured log AND stderr for visibility
  log.info(
    {
      personaId: persona.id,
      toolCount,
      hasHandoffs,
      hasMusic,
      hasMemory,
      sampleTools,
      parallelPhase1Ms: Date.now() - parallelStart,
    },
    `🔧 TOOLS LOADED: ${toolCount} tools available to LLM`
  );
  process.stderr.write(`\n${'='.repeat(60)}\n`);
  process.stderr.write(`🔧 TOOLS AVAILABLE TO LLM: ${toolCount}\n`);
  process.stderr.write(`   Handoffs: ${hasHandoffs ? '✅' : '❌'} | Music: ${hasMusic ? '✅' : '❌'} | Memory: ${hasMemory ? '✅' : '❌'}\n`);
  process.stderr.write(`   Sample: ${sampleTools}\n`);
  process.stderr.write(`${'='.repeat(60)}\n\n`);

  // 🚨 CRITICAL WARNING: If tool count is suspiciously low, something is wrong!
  if (toolCount < 10) {
    log.error(
      { personaId: persona.id, toolCount, toolNames },
      '🚨 CRITICAL: Tool count is suspiciously low! Many features will not work.'
    );
    process.stderr.write(`\n🚨🚨🚨 CRITICAL WARNING 🚨🚨🚨\n`);
    process.stderr.write(`Tool count is only ${toolCount}! Expected 40-80 tools.\n`);
    process.stderr.write(`Available tools: ${toolNames.join(', ')}\n`);
    process.stderr.write(`This will cause many features to fail!\n`);
    process.stderr.write(`🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n\n`);
  }

  // =========================================================================
  // LLM SELECTION: Use ModelProvider abstraction
  // =========================================================================
  // The ModelProvider handles all model-specific configuration, eliminating
  // scattered environment variable checks. See src/agents/model-provider/
  mark('llm_selection_start');
  const geminiConfig = modelConfig.getDefault();

  log.info(
    { personaId: persona.id, providerId: modelProvider.id },
    `${modelProvider.getLogPrefix()} Creating LLM model via ${modelProvider.displayName}`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const llmModel: any = await modelProvider.createLLMModel({
    model: geminiConfig.model,
    instructions: modelBaseInstructions,
    temperature: geminiConfig.temperature,
  });

  log.info(
    {
      personaId: persona.id,
      providerId: modelProvider.id,
      modelBaseLength: modelBaseInstructions.length,
      agentPromptLength: systemPrompt.length,
    },
    `${modelProvider.getLogPrefix()} LLM model created (text → Cartesia TTS)`
  );
  mark('llm_model_done');

  // =========================================================================
  // VAD FALLBACK: Load Silero VAD if USE_LOCAL_VAD=true for redundancy
  // =========================================================================
  const USE_LOCAL_VAD = process.env.USE_LOCAL_VAD === 'true';
  let vad: Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>> | undefined;

  if (USE_LOCAL_VAD) {
    try {
      const vadLoadStart = Date.now();
      const { VAD } = await import('@livekit/agents-plugin-silero');
      vad = await VAD.load();
      log.info(
        { personaId: persona.id, loadTimeMs: Date.now() - vadLoadStart },
        '🎙️ Silero VAD loaded as fallback'
      );
    } catch (vadErr) {
      log.warn(
        { error: String(vadErr), personaId: persona.id },
        '⚠️ VAD fallback load failed (non-fatal)'
      );
      // Continue without VAD - LLM turn detection will still work
    }
  }

  // Create voice session
  // Turn detection: Provider-specific (OpenAI uses its model config, Gemini uses 'realtime_llm')
  // TTS: Both use Cartesia TTS for persona voice
  // VAD: Optional Silero fallback when USE_LOCAL_VAD=true
  mark('session_create_start');
  const session = new voice.AgentSession<UserData>({
    turnDetection: modelProvider.getSessionTurnDetection(),
    vad, // Silero VAD fallback (undefined by default, loaded when USE_LOCAL_VAD=true)
    llm: llmModel,
    tts, // Cartesia TTS for both (OpenAI text-only mode outputs text)
    userData,
    voiceOptions: {
      allowInterruptions: true,
      // UPDATED Jan 2026: Ultra-tight delays for natural conversation
      // Human turn-taking gaps are 200-400ms - we should match that
      minEndpointingDelay: 150, // Was 250ms - be snappier
      maxEndpointingDelay: 450, // Was 800ms - don't wait too long
      minInterruptionWords: 1,
      minInterruptionDuration: 150, // Was 200ms - faster interrupt detection
      preemptiveGeneration: true,
    },
  });

  mark('session_created');

  // =========================================================================
  // BETTER THAN HUMAN: Start health monitoring for OpenAI connections
  // This proactively tracks connection health and can trigger reconnection
  // =========================================================================
  if (isUsingOpenAI()) {
    startHealthMonitoring(sessionId);

    // Register a ping callback to keep the connection alive during idle periods
    // This prevents the "stale connection" issue where the LLM doesn't respond for 5+ seconds
    // The ping sends a minimal request that tests connection health without interrupting users
    registerPingCallback(sessionId, async () => {
      try {
        // Use a minimal instruction that won't produce audible output
        // The LLM processes this silently to verify connection health
        const result = await generateReply(session, sessionId, {
          instructions: '[Connection health check - acknowledge silently]',
          waitForPlayout: false, // Don't wait for audio - just verify connection works
          timeoutMs: 3000, // Short timeout for health check
          priority: 'low', // Low priority so it doesn't interrupt real requests
        });

        if (result.success) {
          log.debug({ sessionId }, '🏥 [HEALTH] Ping successful - connection alive');
          return true;
        }

        log.warn({ sessionId, error: result.error }, '🏥 [HEALTH] Ping failed');
        return false;
      } catch (err) {
        log.warn({ sessionId, error: String(err) }, '🏥 [HEALTH] Ping threw error');
        return false;
      }
    });

    log.info({ sessionId, personaId: persona.id }, '🏥 [HEALTH] OpenAI health monitoring started with ping callback');
  }

  // =========================================================================
  // 🔍 ENHANCED ERROR LOGGING: Capture underlying Gemini connection errors
  // =========================================================================
  // The "generateReply timed out waiting for generation_created event" error
  // often masks an underlying issue (429, auth error, connection failure).
  // These handlers log the REAL error before it becomes a timeout.
  // =========================================================================

  // Listen for errors on the LLM model itself
  if (llmModel && typeof (llmModel as { on?: unknown }).on === 'function') {
    const llmWithEvents = llmModel as {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };

    llmWithEvents.on('error', (error: unknown) => {
      log.error(
        { personaId: persona.id, error: String(error), errorObj: error },
        '🚨 [LLM MODEL ERROR] Gemini RealtimeModel emitted error'
      );
      process.stderr.write(
        `\n🚨 [LLM ERROR] Gemini model error: ${JSON.stringify(error, null, 2)}\n`
      );
    });

    llmWithEvents.on('close', (code: unknown, reason: unknown) => {
      log.warn({ personaId: persona.id, code, reason }, '🔌 [LLM CLOSE] Gemini connection closed');
      process.stderr.write(
        `\n🔌 [LLM CLOSE] Gemini connection closed: code=${code}, reason=${reason}\n`
      );
    });

    llmWithEvents.on('connection_error', (error: unknown) => {
      log.error(
        { personaId: persona.id, error: String(error) },
        '🚨 [LLM CONNECTION ERROR] Gemini WebSocket connection failed'
      );
      process.stderr.write(`\n🚨 [LLM CONNECTION ERROR] ${JSON.stringify(error, null, 2)}\n`);
    });
  }

  // Listen for errors on the session
  const sessionWithEvents = session as unknown as {
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  if (sessionWithEvents.on) {
    sessionWithEvents.on('error', (error: unknown) => {
      log.error(
        { personaId: persona.id, sessionId, error: String(error) },
        '🚨 [SESSION ERROR] AgentSession emitted error'
      );
      process.stderr.write(`\n🚨 [SESSION ERROR] ${JSON.stringify(error, null, 2)}\n`);
    });
  }

  log.info({ personaId: persona.id }, '🔍 Enhanced error logging attached to LLM and session');

  // Create agent wrapper WITH TOOLS using FerniAgent (has ttsNode override for JSON sanitizer)
  // FIX: Previously used voice.Agent which BYPASSED the JSON function call sanitizer!
  // FerniAgent's ttsNode override filters {"fn":"startGame","args":{}} before TTS speaks it.
  // FerniAgent now hoisted to module level for faster startup
  const agent = new FerniAgent(systemPrompt, {
    tools: orchestratorTools as any, // Type mismatch: ToolSet vs Record<string, unknown>
    // CRITICAL: Skip FerniAgent's built-in greeting which uses generateReply() without
    // function-calling instructions. This can confuse the model and break tool calls.
    // The model will greet naturally based on its system prompt.
    skipGreeting: true,
  }) as unknown as voice.Agent<UserData>; // Type cast needed - FerniAgent uses compatible session data

  // Track handler status
  const handlersStatus = {
    transcript: false,
    sessionState: false,
    toolTracking: false,
    music: false,
  };

  // =========================================================================
  // ⚡ FAST-AGENT-JOIN: Handler wiring can be deferred for faster startup
  // When deferHandlers=true, this function is returned for caller to invoke
  // after the greeting is spoken (reduces critical path by ~500ms).
  // =========================================================================
  const wireHandlersImpl = async (): Promise<void> => {
    if (!enableFullHandlers) {
      log.debug({ personaId: persona.id }, '🎭 Handlers disabled, skipping wiring');
      return;
    }
    const handlerWireStart = Date.now();
    try {
      // Handler imports now hoisted to module level for faster startup
      // Create sendDataMessage helper for frontend signaling
      const sendDataMessage = async (
        type: string,
        payload: Record<string, unknown>
      ): Promise<void> => {
        try {
          const message = JSON.stringify({ type, ...payload });
          const data = new TextEncoder().encode(message);
          await room.localParticipant?.publishData(data, { reliable: true });
        } catch {
          // Non-critical - silently ignore errors
        }
      };

      // TRANSCRIPT HANDLER
      if (conversationManager) {
        // Create silence context with required fields
        const silenceContext = {
          silenceDurationSeconds: 0,
          turnCount: 0,
          topicsDiscussed: [] as string[],
          memorableMoments: [] as string[],
          lastUserMessage: undefined as string | undefined,
        };

        // dynamicToolLoader and autoOptimizer now hoisted to module level
        // Initialize dynamic loader with essential domains (telephony, communication, etc.)
        // This MUST happen before first user message to prevent race conditions
        // NOTE: Pass undefined for services to use EnvironmentServiceRegistry (checks env vars)
        // SessionServices is NOT a ServiceRegistry and doesn't have .has() method
        await dynamicToolLoader.initialize({
          userId: userId || 'anonymous',
          agentId: persona.id,
          agentDisplayName: persona.displayName || persona.id,
          sessionId,
          services: undefined, // Uses EnvironmentServiceRegistry which checks env vars
        });

        // 🔧 CRITICAL: Update agent with essential tools loaded by dynamic loader
        // The dynamic loader loads entertainment (music), information (weather), etc.
        // These need to be registered with the agent/OpenAI immediately!
        try {
          const { updateAgentTools, supportsToolUpdates } = await import('../shared/tool-updater.js');
          if (supportsToolUpdates()) {
            const essentialTools = dynamicToolLoader.getCurrentTools();
            const essentialDomains = dynamicToolLoader.getLoadedDomains();
            if (Object.keys(essentialTools).length > 0) {
              const updated = await updateAgentTools(agent, essentialTools, {
                domains: essentialDomains,
              });
              if (updated) {
                diag.entry(`🔧 [${persona.id}] Essential tools registered with agent (${Object.keys(essentialTools).length} tools from ${essentialDomains.join(', ')})`);
              }
            }
          }
        } catch (toolUpdateError) {
          log.warn({ error: String(toolUpdateError) }, 'Failed to update agent with essential tools');
        }

        const transcriptHandler = createTranscriptHandler({
          room,
          session,
          services,
          sessionPersona: persona,
          conversationManager,
          voiceHumanization: null,
          userData,
          userId,
          sessionId,
          silenceContext,
          dynamicToolLoader,
          autoOptimizer,
          agent,
        });

        // Wire transcript events
        const transcriptEventHandler = (event: unknown) => {
          transcriptHandler.handler(
            event as import('../voice-agent/transcript-handler.js').TranscriptEvent
          );
        };
        session.on(voice.AgentSessionEventTypes.UserInputTranscribed, transcriptEventHandler);
        cleanupFunctions.push(() => {
          session.off?.(voice.AgentSessionEventTypes.UserInputTranscribed, transcriptEventHandler);
        });
        handlersStatus.transcript = true;
        diag.entry(`🎭 [${persona.id}] Transcript handler wired`);

        // SESSION STATE HANDLERS
        const stateResult = setupSessionStateHandlers({
          session,
          sessionPersona: persona,
          conversationManager,
          userData,
          sessionId,
        });
        // Note: silenceContext is created by setupSessionStateHandlers
        handlersStatus.sessionState = true;
        diag.entry(`🎭 [${persona.id}] Session state handlers wired`);

        // Update silenceContext from state result if available
        if (stateResult?.silenceContext) {
          Object.assign(silenceContext, stateResult.silenceContext);
        }
      }

      // TOOL TRACKING HANDLER
      setupToolTrackingHandler({
        session,
        userData,
        services,
        sessionPersona: persona,
        sessionId,
        debugEnabled: process.env.DEBUG_VOICE_AGENT === 'true',
        sendDataMessage,
      });
      handlersStatus.toolTracking = true;
      diag.entry(`🎭 [${persona.id}] Tool tracking handler wired`);

      // FRONTEND PUBLISHER - Required for music state messages to frontend
      // Without this, the frontend won't know when music is playing (hoisted to module level)
      try {
        initializeFrontendPublisher(room);
        diag.entry(`🎭 [${persona.id}] Frontend publisher initialized`);
      } catch (pubErr) {
        log.warn({ error: String(pubErr) }, '⚠️ Failed to initialize frontend publisher');
      }

      // MUSIC HANDLER
      if (conversationManager) {
        const musicResult = await setupMusicHandler({
          room,
          services,
          sessionPersona: persona,
          conversationManager,
          sessionId,
          userId: userData.userId,
        });
        if (musicResult.cleanup) {
          cleanupFunctions.push(musicResult.cleanup);
        }
        handlersStatus.music = true;
        diag.entry(`🎭 [${persona.id}] Music handler wired: true`);
      } else {
        // 🐛 FIX: Log when music handler is skipped - this helps debug music failures
        log.warn(
          { personaId: persona.id, sessionId },
          '⚠️ Music handler SKIPPED - conversationManager is null! Music tools will NOT work.'
        );
        handlersStatus.music = false;
      }
    } catch (err) {
      log.warn({ error: String(err), personaId: persona.id }, '⚠️ Some handlers failed to wire');
    }
    log.info(
      { personaId: persona.id, handlerWireMs: Date.now() - handlerWireStart },
      '⚡ Handler wiring complete'
    );
  };

  // ⚡ FAST-AGENT-JOIN: Wire handlers now or defer for later
  if (!deferHandlers) {
    await wireHandlersImpl();
  } else {
    log.info(
      { personaId: persona.id },
      '⚡ Handler wiring DEFERRED - call wireHandlers() after greeting'
    );
  }

  // Track cleanup state
  let isCleanedUp = false;

  const setupMs = Date.now() - setupStart;
  diag.entry(
    `🎭 Agent setup complete: ${persona.id} (${setupMs}ms, handlers: ${JSON.stringify(handlersStatus)})`
  );

  if (isHandoff && previousPersonaId) {
    diag.entry(`🎭 Handoff context: ${previousPersonaId} → ${persona.id}`);
  }

  // Final timing summary
  mark('setup_complete');
  const totalSetupMs = Date.now() - setupStart;
  log.info(
    { personaId: persona.id, totalSetupMs, timings },
    `🏁 [TIMING] Agent setup complete in ${totalSetupMs}ms`
  );
  process.stderr.write(`\n🏁 TOTAL SETUP: ${totalSetupMs}ms\n`);
  process.stderr.write(`📊 Timings: ${JSON.stringify(timings, null, 2)}\n`);

  return {
    session,
    agent,
    tts,
    handlers: handlersStatus,
    // ⚡ FAST-AGENT-JOIN: wireHandlers function for deferred wiring
    wireHandlers: deferHandlers ? wireHandlersImpl : undefined,
    cleanup: async () => {
      const cleanupStart = Date.now();
      log.info(
        { personaId: persona.id, sessionId, alreadyCleaned: isCleanedUp },
        '🧹 [CLEANUP] cleanup() ENTRY'
      );

      if (isCleanedUp) {
        log.debug({ personaId: persona.id }, '🧹 [CLEANUP] Already cleaned up, skipping');
        return;
      }
      isCleanedUp = true;

      // NOTE: Do NOT mark session as closing here in multi-agent mode!
      // All agents share the same sessionId, so marking it as closing would
      // prevent the new agent (e.g., Maya) from working during handoff.
      // The session-closing-tracker is only used in cleanup-handler.ts when
      // the entire conversation is ending.

      // Run all cleanup functions
      log.info(
        { personaId: persona.id, cleanupCount: cleanupFunctions.length },
        '🧹 [CLEANUP] Running handler cleanup functions...'
      );
      const handlerCleanupStart = Date.now();
      for (let i = 0; i < cleanupFunctions.length; i++) {
        const cleanup = cleanupFunctions[i];
        try {
          await cleanup();
          log.debug({ personaId: persona.id, index: i }, '🧹 [CLEANUP] Handler cleanup completed');
        } catch (err) {
          log.warn({ error: String(err), index: i }, '🧹 [CLEANUP] Error in handler cleanup');
        }
      }
      log.info(
        { personaId: persona.id, durationMs: Date.now() - handlerCleanupStart },
        '🧹 [CLEANUP] Handler cleanups done'
      );

      // FIX: Clean up speech session services (29+ services) to prevent memory leaks
      // This matches what the main voice-agent cleanup does
      log.debug({ sessionId }, '🧹 [CLEANUP] Cleaning up speech session...');
      try {
        cleanupSpeechSession(sessionId, { verbose: false, reason: 'normal' });
        log.debug({ sessionId, personaId: persona.id }, '🧹 [CLEANUP] Speech session cleaned up');
      } catch (err) {
        log.warn({ error: String(err) }, '🧹 [CLEANUP] Error cleaning up speech session');
      }

      // FIX: Clear retry counter WeakMap entry explicitly
      // While WeakMap will GC when session is collected, explicit cleanup is better practice
      // and ensures memory is freed immediately
      log.debug({ sessionId }, '🧹 [CLEANUP] Clearing retry counter...');
      try {
        clearRetryCounter(session);
        log.debug({ sessionId }, '🧹 [CLEANUP] Retry counter cleared');
      } catch (err) {
        log.warn({ error: String(err) }, '🧹 [CLEANUP] Error clearing retry counter');
      }

      // FIX: Clean up speech coordination to prevent memory leaks and stale state
      // This was missing in multi-agent mode, causing potential issues during handoffs
      log.debug({ sessionId }, '🧹 [CLEANUP] Cleaning up speech coordination...');
      try {
        cleanupSpeechCoordination(sessionId);
        log.debug({ sessionId, personaId: persona.id }, '🧹 [CLEANUP] Speech coordination cleaned up');
      } catch (err) {
        log.warn({ error: String(err) }, '🧹 [CLEANUP] Error cleaning up speech coordination');
      }

      // BETTER THAN HUMAN: Stop health monitoring for OpenAI connections
      if (isUsingOpenAI()) {
        log.debug({ sessionId }, '🧹 [CLEANUP] Stopping OpenAI health monitoring...');
        try {
          stopHealthMonitoring(sessionId);
          log.debug({ sessionId, personaId: persona.id }, '🧹 [CLEANUP] OpenAI health monitoring stopped');
        } catch (err) {
          log.warn({ error: String(err) }, '🧹 [CLEANUP] Error stopping health monitoring');
        }
      }

      // FIX: Add timeout to session.close() to prevent indefinite hangs during handoff
      // session.close() can block if the session is in a draining state
      log.info({ sessionId, personaId: persona.id }, '🧹 [CLEANUP] Calling session.close()...');
      const closeStart = Date.now();
      try {
        const closeTimeout = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('session.close() timeout')), 3000);
        });
        await Promise.race([session.close(), closeTimeout]);
        log.info(
          { sessionId, personaId: persona.id, closeDurationMs: Date.now() - closeStart },
          '🧹 [CLEANUP] ✅ session.close() completed'
        );
      } catch (err) {
        log.warn(
          { error: String(err), sessionId, closeDurationMs: Date.now() - closeStart },
          '🧹 [CLEANUP] ⚠️ session.close() error or timeout'
        );
      }

      log.info(
        { personaId: persona.id, sessionId, totalCleanupDurationMs: Date.now() - cleanupStart },
        '🧹 [CLEANUP] cleanup() EXIT'
      );
    },
    say: (text: string, options?: { allowInterruptions?: boolean }) => {
      log.info(
        {
          personaId: persona.id,
          sessionId,
          textPreview: text.slice(0, 60),
          allowInterruptions: options?.allowInterruptions ?? true,
        },
        '🎭 [SAY] Agent speaking via coordinatedSay...'
      );
      // Use coordinated speech for centralized speech management
      coordinatedSay(sessionId, text, { allowInterruptions: options?.allowInterruptions ?? true });
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build the system prompt for an agent (FALLBACK ONLY).
 * Prefer using loadSystemPrompt() from prompt-loader.js for full function-calling support.
 */
function buildAgentSystemPrompt(config: AgentSetupConfig): string {
  const { persona, userData } = config;

  const parts: string[] = [];

  // Base system prompt from persona
  if (persona.systemPrompt) {
    parts.push(persona.systemPrompt);
  }

  // User context
  if (userData.userName) {
    parts.push(`\n\n[USER CONTEXT]\nThe user's name is ${userData.userName}.`);
  }

  return parts.join('\n');
}

/**
 * Build handoff-specific context to append to system prompt.
 * Includes both conversation context AND trust context (boundaries, sensitive topics, etc.)
 */
async function buildHandoffContext(config: AgentSetupConfig): Promise<string | null> {
  const { isHandoff, previousPersonaId, conversationSummary, recentMessages, userData } = config;

  if (!isHandoff || !previousPersonaId) {
    return null;
  }

  const parts: string[] = [];
  parts.push('[HANDOFF CONTEXT]');
  parts.push(`You just received this conversation from ${previousPersonaId}.`);
  parts.push('Continue naturally - acknowledge the handoff briefly but focus on helping.');

  if (conversationSummary) {
    parts.push(`\nConversation summary: ${conversationSummary}`);
  }

  if (recentMessages && recentMessages.length > 0) {
    parts.push('\nRecent conversation:');
    parts.push(recentMessages.slice(-5).join('\n'));
  }

  // === E2E Integration: Inject trust-systems handoff context ===
  // This adds boundaries, sensitive topics, rapport builders, and pending follow-ups
  const userId = userData?.userId;
  const targetPersonaId = config.persona?.id;

  if (userId && targetPersonaId) {
    try {
      // Dynamic import to avoid circular dependencies (ESM compatible)
      const trustSystems = await import('../../services/trust-systems/handoff-context.js');
      const trustContext = trustSystems.buildHandoffContext(
        userId,
        previousPersonaId,
        targetPersonaId
      );

      if (trustContext?.contextSummary) {
        parts.push('\n' + trustContext.contextSummary);
      }
    } catch (error) {
      // Non-fatal - continue with basic handoff context
      log.debug({ error: String(error) }, 'Trust context unavailable for handoff (non-fatal)');
    }
  }

  return parts.join('\n');
}

/**
 * Create TTS engine with persona's voice.
 * Uses the same PersonaAwareTTS pattern as voice-agent-entry.ts
 *
 * VOICE ID FIX: Use resolveVoiceId for single source of truth
 */
async function createPersonaTTS(personaId: string) {
  // voiceManagerModule and resolveVoiceId now hoisted to module level
  // VOICE ID FIX: Use resolver as single source of truth
  const voiceIdResult = resolveVoiceId({ personaId }, { logLevel: 'info' });
  let voiceId: string;

  if (voiceIdResult.success) {
    voiceId = voiceIdResult.voiceId;
    log.info(
      { personaId, voiceId, source: voiceIdResult.source },
      '🎭 Voice ID resolved via single source of truth'
    );
  } else {
    // Fallback when voice ID resolution fails
    log.warn(
      { personaId },
      '⚠️ Voice ID resolution failed - using fallback getVoiceId'
    );
    voiceId = getVoiceId(personaId); // Emergency fallback
  }

  const voiceName = getPersonaDisplayName(personaId);

  // Log the voice ID we're using - this is critical for debugging
  log.info({ personaId, voiceId, voiceName }, '🎭 Creating TTS with Cartesia voice');

  // Use PersonaAwareTTS (supports voice switching)
  const tts = voiceManagerModule.createPersonaAwareTTS(voiceName, {
    voiceId,
    accent: 'american',
    isLocalizedVoice: false,
  });

  log.info({ personaId, ttsVoiceId: tts.getVoiceId?.() || 'N/A' }, '🎭 TTS created');

  return tts;
}

/**
 * Create a conversation summary for handoff.
 */
export function buildConversationSummary(services: SessionServices, maxLength = 500): string {
  const parts: string[] = [];

  // Get emotional context
  const emotion = services.sessionPriming?.emotionalContext?.lastEmotion;
  if (emotion && emotion !== 'neutral') {
    parts.push(`User's emotional state: ${emotion}`);
  }

  // Get session duration from sessionStartTime
  if (services.sessionStartTime) {
    const durationMs = Date.now() - services.sessionStartTime;
    const minutes = Math.round(durationMs / 60000);
    if (minutes > 0) {
      parts.push(`Session duration: ${minutes} minutes`);
    }
  }

  // Try to get topics from priming if available
  const priming = services.sessionPriming as {
    openThreads?: Array<{ topic: string }>;
  };
  if (priming?.openThreads && priming.openThreads.length > 0) {
    const topics = priming.openThreads.slice(0, 3).map((t) => t.topic);
    parts.push(`Topics discussed: ${topics.join(', ')}`);
  }

  const summary = parts.join('. ');
  return summary.slice(0, maxLength);
}

/**
 * Get recent messages for handoff context.
 */
export function getRecentMessagesForHandoff(services: SessionServices, count = 5): string[] {
  try {
    const historyTracker = services.historyTracker as {
      getSessionHistory?: () => { entries?: Array<{ role: string; content: string }> };
    };

    if (historyTracker?.getSessionHistory) {
      const history = historyTracker.getSessionHistory();
      const entries = history?.entries?.slice(-count) || [];
      return entries.map((e) => `${e.role}: ${e.content}`);
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Could not get recent messages');
  }

  return [];
}
