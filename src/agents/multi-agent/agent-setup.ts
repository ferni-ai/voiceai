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

/**
 * OpenAI Realtime mode: Use OpenAI's Realtime API instead of Gemini Live.
 * OpenAI Realtime has NATIVE function calling - no JSON workarounds needed!
 */
const USE_OPENAI_REALTIME = process.env.USE_OPENAI_REALTIME === 'true';
import type { PersonaConfig } from '../../personas/types.js';
import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import { diag } from '../../services/diagnostic-logger.js';
import { modelConfig } from '../../services/model-config.js';
import type { SessionServices } from '../../services/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { UserData } from '../shared/types.js';
// FIX: Import speech cleanup to prevent memory leaks on agent cleanup
import { cleanupSpeechSession } from '../../speech/session-cleanup.js';
// FIX: Import retry counter cleanup for WeakMap session GC
import { clearRetryCounter } from '../shared/tool-call-sanitizer.js';
// Speech coordination for centralized speech management
import {
  coordinatedSay,
  initializeSpeechCoordination,
  cleanupSpeechCoordination,
} from '../../speech/coordination/index.js';

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
  } = config;

  log.info(
    { personaId: persona.id, sessionId, isHandoff, enableFullHandlers },
    '🎭 Setting up persona agent'
  );

  const setupStart = Date.now();
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
    const { loadSystemPrompt, loadModelBaseInstructions } = await import(
      '../personas/prompt-loader.js'
    );

    // Load both levels of instructions in parallel
    const [baseInstructions, loadedSystemPrompt] = await Promise.all([
      loadModelBaseInstructions(),
      loadSystemPrompt(persona.id),
    ]);

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
    const userProfile = services.userProfile;
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
          userAwareness.push(`You've talked ${convCount} times - still getting to know each other.`);
        } else if (convCount < 20) {
          userAwareness.push(`You've had ${convCount} conversations - a growing friendship.`);
        } else {
          userAwareness.push(`You've had ${convCount} conversations together - you know each other well.`);
        }

        // Last conversation time
        if (userProfile.lastContact) {
          const lastContactDate = new Date(userProfile.lastContact);
          const daysSince = Math.floor(
            (sessionStartTime.getTime() - lastContactDate.getTime()) / (24 * 60 * 60 * 1000)
          );
          if (daysSince === 0) {
            userAwareness.push("You talked earlier today.");
          } else if (daysSince === 1) {
            userAwareness.push("You talked yesterday.");
          } else if (daysSince < 7) {
            userAwareness.push(`Last talked ${daysSince} days ago.`);
          } else if (daysSince < 30) {
            userAwareness.push(`It's been about ${Math.round(daysSince / 7)} weeks since you last talked.`);
          } else {
            userAwareness.push(`It's been a while - about ${Math.round(daysSince / 30)} month${daysSince > 45 ? 's' : ''} since you last talked.`);
          }
        }
      } else if (!isReturningUser) {
        userAwareness.push("This is your first conversation with them - be welcoming but not overwhelming.");
      }

      // Key relationship facts (if available)
      const relationshipStage = userProfile.relationshipStage;
      if (relationshipStage && relationshipStage !== 'new_acquaintance') {
        const stageDescriptions: Record<string, string> = {
          'getting_to_know': 'You\'re still getting to know each other.',
          'trusted_advisor': 'They trust you and share openly.',
          'old_friend': 'You\'re old friends - deep relationship.',
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
        const lastMood = userProfile.humanizingState.lastMood;
        // Map moods to emotional context
        const moodContext: Record<string, string> = {
          'tired_but_present': 'Last time they seemed a bit tired - be gentle.',
          'reflective': 'Last time they were in a reflective mood.',
          'philosophical': 'Last time they were in a thoughtful, philosophical space.',
          'energized': 'Last time they were full of energy!',
          'grounded': 'Last time they seemed calm and grounded.',
          'playful': 'Last time they were in a playful mood.',
          'nostalgic': 'Last time they were feeling nostalgic.',
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
          .filter(event => {
            // Focus on active or upcoming events
            return event.status === 'in_progress' || event.status === 'upcoming' || event.status === 'planning';
          })
          .slice(0, 2); // Max 2 events

        for (const event of relevantEvents) {
          const eventTypes: Record<string, string> = {
            'wedding': 'preparing for a wedding',
            'baby': 'expecting or has a new baby',
            'graduation': 'graduation coming up',
            'career_change': 'going through a career change',
            'relocation': 'moving/relocating',
            'loss': 'dealing with a loss',
            'celebration': 'has something to celebrate',
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
            const { getAmbientCalendarContext } = await import('../../services/calendar/ambient-calendar-awareness.js');
            const calendarContext = await getAmbientCalendarContext(userId);
            
            if (calendarContext.isCalendarConnected) {
              const calendarAwareness: string[] = [];
              
              // Next meeting awareness
              if (calendarContext.nextMeeting.event && calendarContext.nextMeeting.minutesUntil !== null) {
                const minutes = calendarContext.nextMeeting.minutesUntil;
                const meetingTitle = calendarContext.nextMeeting.event.title;
                
                if (minutes <= 15) {
                  calendarAwareness.push(`⏰ They have "${meetingTitle}" in ${minutes} minutes - be mindful of time.`);
                } else if (minutes <= 60) {
                  calendarAwareness.push(`📅 They have "${meetingTitle}" in about ${Math.round(minutes / 15) * 15} minutes.`);
                }
              }
              
              // Just ended meeting (great for follow-up)
              if (calendarContext.justEndedMeeting.event && calendarContext.justEndedMeeting.minutesSince !== null) {
                const minutes = calendarContext.justEndedMeeting.minutesSince;
                const meetingTitle = calendarContext.justEndedMeeting.event.title;
                
                if (minutes <= 15) {
                  calendarAwareness.push(`💬 They just finished "${meetingTitle}" - could be a natural topic.`);
                }
              }
              
              // Busy day awareness
              if (calendarContext.remainingMeetingsToday >= 4) {
                calendarAwareness.push(`📊 They have ${calendarContext.remainingMeetingsToday} more meetings today - busy day.`);
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
    const handoffContext = buildHandoffContext(config);
    if (handoffContext) {
      systemPrompt = `${systemPrompt}\n\n${handoffContext}`;
    }
  }

  // Create TTS with persona's voice (async)
  const tts = await createPersonaTTS(persona.id);

  // =========================================================================
  // GET TOOLS FROM ORCHESTRATOR (Critical for music, memory, etc.)
  // =========================================================================
  let orchestratorTools: Record<string, unknown> = {};
  try {
    const { getToolsForAgent, initializeToolOrchestrator, isOrchestratorInitialized } =
      await import('../../tools/orchestrator/voice-agent-integration.js');

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

    orchestratorTools = tools;
    log.info(
      { personaId: persona.id, toolCount: meta.toolCount, mode: meta.mode },
      '🎭 Tools loaded for multi-agent persona'
    );
  } catch (toolErr) {
    log.warn(
      { error: String(toolErr), personaId: persona.id },
      '⚠️ Failed to load tools for multi-agent persona (will have no tools)'
    );
  }

  // =========================================================================
  // LLM SELECTION: OpenAI Realtime vs Gemini Live
  // =========================================================================
  const geminiConfig = modelConfig.getDefault();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let llmModel: any;

  if (USE_OPENAI_REALTIME) {
    // =====================================================================
    // OpenAI Realtime API - Native function calling, no JSON workarounds!
    // Using text-only mode so Cartesia TTS handles the persona voice.
    // =====================================================================
    log.info(
      { personaId: persona.id },
      '🔮 Creating OpenAI Realtime model for multi-agent (text-only → Cartesia TTS)'
    );

    // OpenAI Realtime with text-only mode → Cartesia TTS for persona voice
    // Docs: https://docs.livekit.io/agents/models/realtime/plugins/openai/#separate-tts
    // Upgraded SDK to 1.0.30 which has modalities fix

    // Import VAD config for tunable noise sensitivity
    const { VAD_CONFIG } = await import('../shared/constants.js');

    llmModel = new openai.realtime.RealtimeModel({
      modalities: ['text'], // Text-only mode - Cartesia TTS handles persona voice
      temperature: Math.max(0.6, geminiConfig.temperature), // OpenAI min is 0.6
      turnDetection: {
        type: 'server_vad', // Using server_vad per docs (more stable)
        // VAD sensitivity is configurable via environment variables:
        // - VAD_THRESHOLD (default: 0.65) - Higher = less sensitive to background noise
        // - VAD_PREFIX_PADDING_MS (default: 300) - Audio buffer before speech
        // - VAD_SILENCE_DURATION_MS (default: 600) - Silence before turn ends
        threshold: VAD_CONFIG.threshold,
        prefix_padding_ms: VAD_CONFIG.prefixPaddingMs,
        silence_duration_ms: VAD_CONFIG.silenceDurationMs,
        create_response: VAD_CONFIG.createResponse,
        interrupt_response: VAD_CONFIG.interruptResponse,
      },
    });

    log.info(
      { personaId: persona.id, vadThreshold: VAD_CONFIG.threshold, silenceDuration: VAD_CONFIG.silenceDurationMs },
      '🎤 VAD config applied'
    );

    log.info(
      { personaId: persona.id, modalities: ['text'], tts: 'cartesia' },
      '🔮 OpenAI Realtime model created (text → Cartesia TTS)'
    );
  } else {
    // =====================================================================
    // Gemini Live API (default)
    // =====================================================================
    // CRITICAL: modalities: TEXT ensures Gemini outputs text (not audio directly)
    // This text then goes through our Cartesia TTS with the persona's voice.
    // Without this, Gemini outputs audio with its default male voice!

    // Debug: Log what we're passing to RealtimeModel
    log.info(
      {
        personaId: persona.id,
        modalitiesValue: genai.Modality.TEXT,
        modalitiesArray: [genai.Modality.TEXT],
      },
      '🎭 Creating RealtimeModel with modalities'
    );

    // TWO-LEVEL INSTRUCTION ARCHITECTURE:
    // Model-level: Foundational rules (tool format, honesty, platform context)
    //   - These are active from the VERY FIRST MOMENT of connection
    //   - Concise, critical rules that must never be forgotten
    // Agent-level: Full persona prompt (via FerniAgent constructor below)
    //   - Sent via LiveKit's updateInstructions() after session starts
    //   - Contains full persona identity and detailed tool catalog
    const realtimeModelOptions = {
      model: geminiConfig.model,
      modalities: [genai.Modality.TEXT], // Output text → Cartesia TTS (persona voice)
      temperature: geminiConfig.temperature,
      instructions: modelBaseInstructions, // Model-level: foundational rules (active immediately)
      language: geminiConfig.language,
      // ENABLE USER TRANSCRIPTION - Gemini STT exposes what user says
      inputAudioTranscription: {
        // REMOVED languageCode: 'en-US' - Let Gemini auto-detect language
        // This enables multilingual support (Japanese, Spanish, etc.)
        // The transcript validator respects expectedLanguage from user profile
      },
      toolChoice: 'auto',
      geminiTools: { googleSearch: {} },
    };

    // Debug: Log the full RealtimeModel options
    log.info(
      {
        personaId: persona.id,
        options: {
          model: realtimeModelOptions.model,
          modalities: realtimeModelOptions.modalities,
          modelBaseLength: modelBaseInstructions.length,
          agentPromptLength: systemPrompt.length,
        },
      },
      '🎭 RealtimeModel options BEFORE creation (instructions at model + agent level)'
    );

    llmModel = new google.beta.realtime.RealtimeModel(realtimeModelOptions as any);

    // Try to access internal _options to verify
    const internalOptions = (llmModel as unknown as { _options?: Record<string, unknown> })
      ._options;
    if (internalOptions) {
      log.info(
        {
          personaId: persona.id,
          responseModalities: internalOptions.responseModalities,
          audioOutput: (llmModel as unknown as { capabilities?: { audioOutput?: boolean } })
            .capabilities?.audioOutput,
        },
        '🎭 RealtimeModel internal options AFTER creation'
      );
    }
  }

  // Create voice session
  // Turn detection: OpenAI uses its model config, Gemini uses 'realtime_llm'
  // TTS: OpenAI text-only mode uses Cartesia TTS for persona voice
  const session = new voice.AgentSession<UserData>({
    turnDetection: USE_OPENAI_REALTIME ? undefined : 'realtime_llm',
    llm: llmModel,
    tts, // Cartesia TTS for both (OpenAI text-only mode outputs text)
    userData,
    voiceOptions: {
      allowInterruptions: true,
      minEndpointingDelay: 400,
      maxEndpointingDelay: 1200,
      minInterruptionWords: 1,
      minInterruptionDuration: 300,
      preemptiveGeneration: true,
    },
  });

  // Create agent wrapper WITH TOOLS using FerniAgent (has ttsNode override for JSON sanitizer)
  // FIX: Previously used voice.Agent which BYPASSED the JSON function call sanitizer!
  // FerniAgent's ttsNode override filters {"fn":"startGame","args":{}} before TTS speaks it.
  const { FerniAgent } = await import('../personas/ferni-agent.js');

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
  // WIRE UP HANDLERS (when enabled)
  // =========================================================================
  if (enableFullHandlers) {
    try {
      // Import handlers dynamically to avoid circular deps
      const [
        { createTranscriptHandler },
        { setupSessionStateHandlers },
        { setupToolTrackingHandler },
        { setupMusicHandler },
      ] = await Promise.all([
        import('../voice-agent/transcript-handler.js'),
        import('../voice-agent/session-state-handler.js'),
        import('../voice-agent/tool-tracking-handler.js'),
        import('../voice-agent/music-handler.js'),
      ]);

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

        // Import dynamic tool loader
        const { dynamicToolLoader } = await import('../../tools/dynamic-loader.js');
        const { autoOptimizer } = await import('../../tools/optimization/auto-optimizer.js');

        // Initialize dynamic loader with essential domains (telephony, communication, etc.)
        // This MUST happen before first user message to prevent race conditions
        await dynamicToolLoader.initialize({
          userId: userId || 'anonymous',
          agentId: persona.id,
          agentDisplayName: persona.displayName || persona.id,
          sessionId,
          services: services as unknown as import('../../tools/registry/types.js').ServiceRegistry,
        });

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
      // Without this, the frontend won't know when music is playing
      try {
        const { initializeFrontendPublisher } = await import('../realtime/index.js');
        initializeFrontendPublisher(room);
        diag.entry(`🎭 [${persona.id}] Frontend publisher initialized`);
      } catch (pubErr) {
        log.warn({ error: String(pubErr) }, '⚠️ Failed to initialize frontend publisher');
      }

      // MUSIC HANDLER
      if (conversationManager) {
        const musicResult = await setupMusicHandler({
          room,
          session,
          services,
          sessionPersona: persona,
          conversationManager,
          sessionId,
          userData,
        });
        if (musicResult.clearTimers) {
          cleanupFunctions.push(musicResult.clearTimers);
        }
        handlersStatus.music = musicResult.initialized;
        diag.entry(`🎭 [${persona.id}] Music handler wired: ${musicResult.initialized}`);
      }
    } catch (err) {
      log.warn({ error: String(err), personaId: persona.id }, '⚠️ Some handlers failed to wire');
    }
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

  return {
    session,
    agent,
    tts,
    handlers: handlersStatus,
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
        log.debug(
          { sessionId, personaId: persona.id },
          '🧹 [CLEANUP] Speech session cleaned up'
        );
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
 */
function buildHandoffContext(config: AgentSetupConfig): string | null {
  const { isHandoff, previousPersonaId, conversationSummary, recentMessages } = config;

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

  return parts.join('\n');
}

/**
 * Create TTS engine with persona's voice.
 * Uses the same PersonaAwareTTS pattern as voice-agent-entry.ts
 */
async function createPersonaTTS(personaId: string) {
  const voiceManagerModule = await import('../../speech/voice-manager.js');

  const voiceId = getVoiceId(personaId);
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
