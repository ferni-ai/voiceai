/**
 * Generic Voice Agent
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * A persona-driven voice agent that can embody any PersonaConfig.
 * This is the base implementation used by all persona-specific agents.
 *
 * This is where our mission comes to life. Every conversation that flows
 * through this agent is an opportunity to be genuinely helpful, warm,
 * and human. Not a chatbot. A companion.
 *
 * Usage:
 *   PERSONA_ID=ferni node dist/agents/voice-agent.js
 *   PERSONA_ID=generic-advisor node dist/agents/voice-agent.js
 */

// ============================================================================
// EARLY STARTUP LOGGING
// Uses console.log intentionally as LiveKit logger isn't initialized yet
// ============================================================================
const DEBUG_STARTUP =
  process.env['DEBUG_AGENT'] === 'true' || process.env['NODE_ENV'] !== 'production';

// Safe early logger for before LiveKit initializes
const earlyLog = {
  info: (msg: string, data?: Record<string, unknown>) => {
    if (DEBUG_STARTUP) {
      console.log(`[voice-agent] ${msg}`, data ? JSON.stringify(data) : '');
    }
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[voice-agent] ${msg}`, data ? JSON.stringify(data) : '');
  },
};

earlyLog.info('=== VOICE-AGENT MODULE LOADING ===', {
  nodeVersion: process.version,
  personaId: process.env['PERSONA_ID'] || '(default)',
});

import { Modality } from '@google/genai';
import {
  WorkerOptions,
  cli,
  defineAgent,
  log,
  voice,
  type JobContext,
  type JobProcess,
  type llm,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as silero from '@livekit/agents-plugin-silero';
import { TelephonyBackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import 'dotenv/config';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';
import { tagTextWithSsmlPersonaAware } from '../ssml/index.js';

// Shared Agent Utilities (used by ALL agents)
import { SILENCE_THRESHOLDS } from './shared/constants.js';
import { startHealthCheckServer, type UserData } from './shared/index.js';

// Persona System
import { generateGreeting, type PersonaMemoryForGreeting } from '../personas/greetings.js';
import {
  getDefaultPersona,
  getPersonaAsync,
  initializeFromBundles,
  type PersonaConfig,
} from '../personas/index.js';
import { convertFromUserProfileEvents } from '../personas/shared/life-events.js';

// Persona Memory System - for memory-enhanced greetings
import {
  getPersonaMemories,
  normalizePersonaId,
} from '../intelligence/context-builders/persona-memory.js';

// Greeting repetition prevention
import {
  applyHumanizingStateToProfile,
  getHumanizingState,
  recordGreetingUsage,
} from '../services/humanizing-state.js';

// Response naturalness - acknowledgments, thinking fillers, catchphrases
import { resetCatchphraseTracking } from '../speech/response-naturalness.js';

// Meaningful Silence System - transforms quiet moments into connection
import {
  extractMemorableMoments,
  getMeaningfulSilenceResponse,
  mergeMemorableMoments,
  playAmbientMusicDuringSilence,
  stopAmbientMusic,
  type SilenceContext,
} from '../personas/meaningful-silence.js';

// Services Bootstrap
import {
  createSessionServices,
  initializeServices,
  type SessionServices,
} from '../services/index.js';

// Adaptive SSML
import { applyPhasePersonality, tagGreeting } from '../speech/adaptive-ssml.js';

// Conversation Manager
import { getConversationManager } from '../services/conversation-manager.js';

// Trust Systems - "Better than human" trust profile loading and recording
import {
  // Phase 14: Life Events
  detectLifeEvents,
  onSessionStart as loadTrustProfiles,
  recordEmotionData,
  // Phase 17: Sentiment Timeline
  recordEmotionalSnapshot,
  // Phase 27: Learning Style
  recordLearningSignals,
  recordTopicData,
  saveEvent,
  onSessionEnd as saveTrustProfiles,
} from '../services/trust-systems/index.js';

// Simple Utilities - "Better than human" everyday helpers (timers, tips, timezone, etc.)
import {
  initializeUtilitiesIntegration,
  weaveProactiveIntoGreeting,
} from './shared/utilities-integration.js';

// Cognitive Intelligence - Session lifecycle hooks for persistent learning
import {
  onCognitiveSessionEnd,
  onCognitiveSessionStart,
} from '../services/cognitive-session-hooks.js';

// Conversation State - Shared context for human-level tool orchestration
import {
  endConversation as endConversationState,
  getConversationState,
} from '../services/conversation-state.js';

// Tools - Registry-based system
import {
  buildAgentTools,
  buildEssentialTools,
  initializeTools,
  isToolRegistryInitialized,
  type Tool,
} from '../tools/index.js';

// Advanced Tool Systems - Dynamic loading, deprecation, analytics, optimization
import { abTestingService } from '../tools/ab-testing.js';
import { autoOptimizer } from '../tools/auto-optimizer.js';
import { deprecationService } from '../tools/deprecation.js';
import { dynamicToolLoader } from '../tools/dynamic-loader.js';
import {
  feedbackCollector,
  type ConversationContext as FeedbackContext,
} from '../tools/feedback-collector.js';
import { patternAnalyzer } from '../tools/pattern-analyzer.js';

// Voice Manager
import { createPersonaAwareTTS, getVoiceManager } from '../speech/voice-manager.js';

// Diagnostic logger
import { diag } from '../services/diagnostic-logger.js';

// Audio prosody analysis
import { getAudioProsodyAnalyzer } from '../speech/audio-prosody.js';

// Emotion matching - connect prosody to voice response
import { getEmotionModulation, wrapWithEmotionProsody } from '../speech/emotion-matching.js';

// Conversation dynamics - emotional arc, response length, story timing
import {
  getActiveListeningEngine,
  getConversationHumanizer,
  getEmotionalArcTracker,
  getResponseDynamicsEngine,
  resetAllConversationState,
} from '../conversation/index.js';

// Conversation humanizing context builder (speech naturalization, active listening, memory callbacks)

// Engagement System - Real-time engagement data and conversation triggers
import { buildEngagementContextPrompt } from '../services/engagement-conversation-triggers.js';
import { getEngagementDataSender } from '../services/engagement-data-sender.js';
import { getRitualOnboardingService } from '../services/ritual-onboarding.js';

// Handoff system (for multi-persona support)
import {
  createHandoffTools,
  executeHandoff,
  getCurrentAgent,
  handoffEvents,
  initializeHandoffContext,
  resetHandoffState,
  resetMetPersonas,
} from '../tools/handoff/index.js';
import { createHandoffHandler, type VoiceAgentRef } from './shared/handoff-handler.js';

// Bundle Runtime Engine - rich persona content at runtime
import { createBundleRuntime, type BundleRuntimeEngine } from '../personas/bundles/index.js';
import { loadBundleById } from '../personas/bundles/loader.js';

// Humanizing Context - the deep soul of the AI

// Humanizing Debug - enable with DEBUG_HUMANIZING=true

// Types
import type { AudioFrame } from '@livekit/rtc-node';

// ============================================================================
// LOAD PERSONA
// ============================================================================

const PERSONA = getDefaultPersona();
// Use a static agent name since this agent handles ALL personas via dispatch metadata
const AGENT_NAME = process.env['AGENT_NAME'] || 'voice-agent';

earlyLog.info('Persona and agent configured', {
  defaultPersona: PERSONA.id,
  personaName: PERSONA.name,
  agentName: AGENT_NAME,
});

// ============================================================================
// START HEALTH CHECK SERVER
// ============================================================================
// Required for Cloud Run deployments - starts immediately so health checks pass

startHealthCheckServer(AGENT_NAME);

// ============================================================================
// USER DATA TYPE (imported from shared/types.ts)
// ============================================================================
// UserData is imported from ./shared/index.js - see shared/types.ts for full definition

/**
 * Check if text already has SSML tags
 */
function hasSsmlTags(text: string): boolean {
  return /<\/?[a-z]+[^>]*>/i.test(text);
}

// ============================================================================
// GENERIC VOICE AGENT
// ============================================================================

class VoiceAgent extends voice.Agent<UserData> {
  private logger = log();
  private _currentSession?: voice.AgentSession<UserData>;
  private persona: PersonaConfig;
  private _room?: {
    localParticipant?: {
      publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
    };
  };
  private bundleRuntime?: BundleRuntimeEngine;

  constructor(persona: PersonaConfig, options: voice.AgentOptions<UserData>) {
    super(options);
    this.persona = persona;
  }

  /**
   * Initialize bundle runtime for rich persona content
   */
  async initializeBundleRuntime(): Promise<void> {
    try {
      const bundle = await loadBundleById(this.persona.id);
      if (bundle) {
        this.bundleRuntime = await createBundleRuntime(bundle);
        this.logger.info({ personaId: this.persona.id }, 'Bundle runtime initialized');
      } else {
        this.logger.debug({ personaId: this.persona.id }, 'No bundle found, using static persona');
      }
    } catch (error) {
      this.logger.warn(
        { personaId: this.persona.id, error: String(error) },
        'Failed to initialize bundle runtime'
      );
    }
  }

  /**
   * Get bundle runtime for this agent
   */
  getBundleRuntime(): BundleRuntimeEngine | undefined {
    return this.bundleRuntime;
  }

  /**
   * Set/update bundle runtime (called during handoffs to switch persona content)
   */
  setBundleRuntime(runtime: BundleRuntimeEngine): void {
    this.bundleRuntime = runtime;
    this.logger.info('Bundle runtime updated for handoff');
  }

  /**
   * Set room reference for data publishing (called from agent definition)
   */
  setRoom(room: typeof this._room): void {
    this._room = room;
  }

  /**
   * Send a data message to the frontend via LiveKit data channel
   * Uses the centralized FrontendPublisher for consistent error handling
   */
  async sendDataMessage(type: string, payload: Record<string, unknown>): Promise<void> {
    // Use FrontendPublisher singleton if available
    try {
      const { getFrontendPublisher } = await import('./realtime/index.js');
      const publisher = getFrontendPublisher();

      // If publisher has room set, use it (preferred)
      if (publisher.isConnected()) {
        await publisher.sendData(type, payload);
        return;
      }
    } catch (e) {
      // Fall through to legacy approach - publisher not ready or not initialized
      this.logger.debug({ error: String(e) }, 'FrontendPublisher not available, using legacy');
    }

    // Legacy fallback using _room reference
    if (!this._room?.localParticipant) {
      this.logger.debug(`Cannot send ${type}: no room connection`);
      return;
    }

    try {
      const message = JSON.stringify({
        type,
        ...payload,
        timestamp: Date.now(),
      });

      await this._room.localParticipant.publishData(new TextEncoder().encode(message), {
        reliable: true,
      });

      this.logger.debug(`Sent ${type} message to frontend`);
    } catch (error) {
      this.logger.warn(`Failed to send ${type}: ${error}`);
    }
  }

  static async create(persona: PersonaConfig): Promise<VoiceAgent> {
    const logger = log();

    // =========================================================================
    // TOOL LOADING - Using new registry-based system
    // =========================================================================
    //
    // The new system builds tools from agent manifests:
    // - Each agent's manifest defines which tool domains they need
    // - Tools are registered by capability, not by agent
    // - Forbidden tools are automatically filtered
    //
    // Benefits:
    // - Single source of truth for agent capabilities (manifest)
    // - No hard-coded agent names in tool code
    // - Easier to add new agents or modify existing ones
    // =========================================================================

    // Initialize the tool registry if not already done
    if (!isToolRegistryInitialized()) {
      await initializeTools({ parallel: true });
    }

    // Build tools using registry-based system
    // Each agent's manifest defines exactly which domains/tools they need
    // This keeps tool count manageable (40-60 per agent) for optimal Gemini performance
    logger.info({ personaId: persona.id }, 'Building tools from agent manifest');

    // Build tools for the current persona based on their manifest
    // The manifest specifies domains, required, optional, and forbidden tools
    const personaTools = await buildAgentTools(persona.id);

    // Merge with essential tools (memory, handoff) to ensure core functionality
    // Essential tools are a minimal subset that all agents need
    const essentialTools = await buildEssentialTools();

    // Combine: persona-specific tools take precedence over essentials
    let toolsForAgent: Record<string, Tool> = {
      ...essentialTools,
      ...personaTools,
    };

    // Filter out forbidden tools from the persona's manifest
    // This is important for standalone personas like Joel who shouldn't have handoff tools
    const forbiddenTools =
      (persona as { tools?: { forbidden?: string[] } })?.tools?.forbidden || [];
    if (forbiddenTools.length > 0) {
      const beforeCount = Object.keys(toolsForAgent).length;
      toolsForAgent = Object.fromEntries(
        Object.entries(toolsForAgent).filter(([name]) => !forbiddenTools.includes(name))
      );
      logger.info(
        {
          forbidden: forbiddenTools,
          removedCount: beforeCount - Object.keys(toolsForAgent).length,
        },
        'Filtered out forbidden tools for persona'
      );
    }

    // Log final tool count - should be 40-60 per agent for optimal Gemini performance
    const toolNames = Object.keys(toolsForAgent);
    logger.info(
      {
        personaId: persona.id,
        essentialCount: Object.keys(essentialTools).length,
        personaCount: Object.keys(personaTools).length,
        finalToolCount: toolNames.length,
        forbiddenCount: forbiddenTools.length,
        sampleTools: toolNames.slice(0, 10),
      },
      'Tools loaded for agent (optimized for Gemini)'
    );

    return new VoiceAgent(persona, {
      instructions: persona.systemPrompt,
      tools: toolsForAgent,
    });
  }

  /**
   * Intercept LLM output stream to add ADAPTIVE SSML tags and humanization before TTS
   *
   * This is the post-LLM humanization hook where we:
   * 1. Apply speech naturalization (disfluencies, hedging)
   * 2. Mirror user vocabulary
   * 3. Apply emotional SSML
   * 4. Add memory callbacks
   */
  async transcriptionNode(
    text: ReadableStream<string>,
    modelSettings: Parameters<voice.Agent['transcriptionNode']>[1]
  ): Promise<ReadableStream<string> | null> {
    const reader = text.getReader();
    // Store reference for use in ReadableStream callbacks (this is intentional)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const agent = this;

    const processedStream = new ReadableStream<string>({
      start: async (controller) => {
        let accumulatedText = '';
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            accumulatedText += value ?? '';
          }

          if (accumulatedText.length > 0) {
            let taggedText = accumulatedText;
            const userData = agent.getUserDataFromContext();

            // ============================================================
            // POST-LLM HUMANIZATION
            // Apply speech naturalization, vocabulary mirroring, etc.
            // This makes the LLM output feel more human before TTS
            // Now includes deep humanization: mood drift, spontaneous thoughts,
            // physical presence, excitement interruptions, etc.
            // ============================================================
            try {
              const humanizer = getConversationHumanizer(agent.persona.id);
              const lastUserMessage = userData?.lastUserMessage || '';
              const turnNumber = userData?.turnCount || 0;

              // Build humanization context (now includes deep humanization fields)
              const humanizationContext = {
                personaId: agent.persona.id,
                turnNumber,
                userMessage: lastUserMessage,
                userEmotion: userData?.lastEmotionAnalysis?.primary,
                topic: userData?.lastTopic,
                isSeriousContext: (userData?.lastEmotionAnalysis?.distressLevel ?? 0) > 0.3,
                wasPersonalSharing: (userData?.lastEmotionAnalysis?.intensity ?? 0) > 0.7,
                relationshipStage: userData?.relationshipStage ?? 'acquaintance',
                sessionData: userData?.sessionData,
              };

              // Apply humanization (async) - includes deep humanization features
              // like mood drift, spontaneous thoughts, excitement interruptions
              const humanized = await humanizer.humanizeResponseAsync(
                accumulatedText,
                humanizationContext
              );

              // Use the humanized text
              taggedText = humanized.text;

              // Log what was applied
              if (humanized.appliedFeatures.length > 0) {
                agent.logger.debug(
                  { features: humanized.appliedFeatures, pacing: humanized.pacing },
                  'Post-LLM humanization applied'
                );
              }

              // If we have a memory callback to prepend, add it
              if (humanized.memoryCallback && Math.random() < 0.3) {
                taggedText = `${humanized.memoryCallback.text} ${taggedText}`;
              }

              // If we have a follow-up question to append, add it
              if (humanized.followUpQuestion && !taggedText.includes('?')) {
                taggedText = `${taggedText} ${humanized.followUpQuestion.text}`;
              }

              // Use the SSML version if it has enhancements
              if (humanized.ssml && humanized.ssml !== humanized.text) {
                taggedText = humanized.ssml;
              }
            } catch (humanizeError) {
              agent.logger.warn(
                { error: String(humanizeError) },
                'Post-LLM humanization failed (non-fatal)'
              );
              // Fall through to original SSML processing
            }

            // ============================================================
            // SSML TAGGING (if not already done by humanizer)
            // ============================================================
            if (!hasSsmlTags(taggedText)) {
              const services = userData?.services;

              if (services) {
                taggedText = services.tagWithSsml(taggedText);

                try {
                  const currentPhase = services.getPromptContext()
                    .phase as import('../intelligence/conversation-state.js').ConversationPhase;
                  const speechContext = services.getSpeechContext();

                  if (currentPhase && speechContext) {
                    taggedText = applyPhasePersonality(taggedText, currentPhase, speechContext);
                  }
                } catch (e) {
                  // Don't block audio if phase personality fails
                  log().debug(
                    { error: String(e) },
                    'Phase personality application failed (non-blocking)'
                  );
                }

                services.addTurn('assistant', accumulatedText);

                // Store for response quality tracking when user responds
                if (userData) {
                  userData.lastAgentResponse = accumulatedText;

                  // Track if this response contained humor or story for calibration
                  const lowerText = accumulatedText.toLowerCase();
                  const humorIndicators =
                    /\b(haha|joke|kidding|😄|😂|funny|amusing|ironic)\b|!.*!/.test(lowerText);
                  const storyIndicators =
                    /\b(remember when|back when|once upon|let me tell you|there was|i knew a|story|reminds me)\b/.test(
                      lowerText
                    );

                  if (humorIndicators) {
                    userData.lastResponseHadHumor = true;
                    // Record the humor attempt for calibration
                    const topic = userData.lastTopic || 'general';
                    services.humorCalibration.recordHumorAttempt(
                      accumulatedText.slice(0, 200),
                      topic
                    );
                  }

                  if (storyIndicators) {
                    userData.lastResponseHadStory = true;
                    // Record the story for preference learning
                    const topic = userData.lastTopic || 'general';
                    services.storyPreference.recordStory(accumulatedText, topic);
                  }
                }

                // Track agent message for response dynamics
                const responseDynamics = getResponseDynamicsEngine();
                responseDynamics.recordMessage('agent', accumulatedText);
              } else {
                // Fallback: use persona-aware SSML tagging
                taggedText = tagTextWithSsmlPersonaAware(accumulatedText, {
                  personaId: agent.persona.id,
                  humanize: true,
                });
              }
            }

            // Apply voice emotion mirroring - adjust prosody based on user's emotional state
            // This makes the agent respond appropriately (slower/softer for distress,
            // energetic for excitement)
            const emotionModulation = userData?.emotionModulation;
            if (emotionModulation && emotionModulation.confidence > 0.4) {
              taggedText = wrapWithEmotionProsody(taggedText, emotionModulation);
            }

            // Apply emotional arc adjustments for smooth transitions
            const emotionalArc = getEmotionalArcTracker();
            const arcAdjustments = emotionalArc.getSsmlAdjustments();
            if (arcAdjustments.addBreaks && !taggedText.includes('<break')) {
              // Add gentle opening break for emotional moments
              taggedText = `<break time="200ms"/>${taggedText}`;
            }

            controller.enqueue(taggedText);
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
      cancel() {
        reader.releaseLock();
      },
    });

    return super.transcriptionNode(processedStream, modelSettings);
  }

  /**
   * Override sttNode to tap into user audio frames for prosody analysis
   */
  async sttNode(
    audio: ReadableStream<AudioFrame>,
    modelSettings: Parameters<voice.Agent['sttNode']>[1]
  ): ReturnType<voice.Agent['sttNode']> {
    // Store reference for use in async callback (this is intentional)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const agent = this;
    const prosodyAnalyzer = getAudioProsodyAnalyzer();

    const [audioForSTT, audioForProsody] = audio.tee();

    // Process audio for prosody analysis in background
    void (async () => {
      const reader = audioForProsody.getReader();
      try {
        while (true) {
          const { value: frame, done } = await reader.read();
          if (done) break;

          if (frame && frame.data && frame.data.length > 0) {
            prosodyAnalyzer.processAudioFrame(frame);
          }
        }

        const voiceEmotion = prosodyAnalyzer.analyze();
        if (voiceEmotion) {
          const userData = agent.getUserDataFromContext();
          if (userData) {
            userData.voiceEmotion = voiceEmotion;
          }

          // Feed voice emotion into emotional arc tracker
          // This enables cross-turn emotional trajectory analysis
          const emotionalArc = getEmotionalArcTracker();
          // Note: textEmotion from getSpeechContext is a string, not EmotionResult
          // For now, we only track voice emotion in the arc tracker
          emotionalArc.recordEmotion(null, voiceEmotion);

          // Get emotion-based voice modulation for response
          const modulation = getEmotionModulation(voiceEmotion);
          if (userData) {
            userData.emotionModulation = modulation;
          }

          // Feed to learning engine if session services available
          // This helps the agent learn emotional patterns over time
          const services = userData?.services;
          if (services && voiceEmotion.confidence > 0.4) {
            try {
              // Map voice emotion to standard emotion type
              const emotionMap: Record<string, string> = {
                happy: 'joy',
                sad: 'sadness',
                angry: 'anger',
                fearful: 'fear',
                anxious: 'anxiety',
                neutral: 'neutral',
                excited: 'anticipation',
                stressed: 'anxiety',
              };

              const mappedEmotion = emotionMap[voiceEmotion.primary] || 'neutral';

              // Capture voice-based emotional pattern
              services.captureInsight(
                'emotional_pattern',
                'voice_detected_emotion',
                {
                  emotion: mappedEmotion,
                  voiceEmotion: voiceEmotion.primary,
                  stressLevel: voiceEmotion.stressLevel,
                  confidence: voiceEmotion.confidence,
                },
                voiceEmotion.confidence
              );

              // Record for validation against future text emotion
              services.learningEngine.recordVoiceEmotion(
                voiceEmotion.primary,
                voiceEmotion.confidence
              );
            } catch (e) {
              log().debug({ error: String(e) }, 'Voice emotion recording failed (non-blocking)');
            }
          }

          // Send emotion update to frontend (only if confidence is meaningful)
          if (voiceEmotion.confidence > 0.5) {
            agent
              .sendDataMessage('emotion', {
                emotion: voiceEmotion.primary, // 'primary' is the emotion field in VoiceEmotionResult
                confidence: voiceEmotion.confidence,
                intensity: voiceEmotion.arousal, // Use arousal as intensity proxy
              })
              .catch((e) =>
                log().debug({ error: String(e) }, 'Voice emotion publish (non-critical)')
              ); // Fire and forget

            // 🎭 Update music player with current mood for mood-aware offers
            // The music player can use this to offer contextually appropriate music
            import('../audio/index.js')
              .then(({ getMusicPlayer }) => {
                const player = getMusicPlayer();
                if (player.isInitialized()) {
                  player.setCurrentUserMood(voiceEmotion.primary);
                }
              })
              .catch(() => {
                // Music player not available - that's fine
              });
          }
        }

        prosodyAnalyzer.clearBuffers();
      } catch (error) {
        agent.logger.warn(`Prosody analysis error: ${error}`);
      } finally {
        reader.releaseLock();
      }
    })();

    return super.sttNode(audioForSTT, modelSettings);
  }

  setSession(session: voice.AgentSession<UserData>): void {
    this._currentSession = session;
  }

  private getUserDataFromContext(): UserData | undefined {
    return this._currentSession?.userData as UserData | undefined;
  }

  getPersona(): PersonaConfig {
    return this.persona;
  }

  /**
   * Update persona reference AND LLM instructions (called during handoffs)
   * This is CRITICAL for identity switching to work properly!
   *
   * The LLM's base instructions are set at session start and determine
   * who the AI thinks it is. Without updating _instructions, the LLM
   * continues thinking it's the original persona (usually Ferni).
   */
  setPersona(newPersona: PersonaConfig, userId?: string): void {
    const oldPersona = this.persona;
    this.persona = newPersona;

    // CRITICAL: Update the base LLM instructions!
    // This is what actually makes the LLM behave as the new persona.
    // The _instructions property is from voice.Agent base class.
    if (newPersona.systemPrompt) {
      this._instructions = newPersona.systemPrompt;

      // Inject engagement context if user is known
      if (userId) {
        void this.injectEngagementContext(userId, newPersona.id);
      }

      this.logger.info(
        {
          oldPersona: oldPersona.id,
          newPersona: newPersona.id,
          instructionsLength: newPersona.systemPrompt.length,
        },
        '🎭 Persona AND LLM instructions updated'
      );
    } else {
      this.logger.warn({ personaId: newPersona.id }, '⚠️ New persona has no systemPrompt!');
    }
  }

  /**
   * Inject engagement context into LLM instructions
   * Adds persona-specific engagement opportunities naturally
   */
  private async injectEngagementContext(
    userId: string,
    personaId: string,
    userProfile?: { totalConversations?: number } | null
  ): Promise<void> {
    try {
      // Inject engagement triggers (streaks, predictions, etc.)
      const engagementContext = await buildEngagementContextPrompt(userId, personaId);
      if (engagementContext) {
        this._instructions = `${this._instructions}\n${engagementContext}`;
        this.logger.debug('Engagement context injected into instructions');
      }

      // Inject ritual onboarding for newer users
      const onboardingService = getRitualOnboardingService();
      const onboardingContext = onboardingService.buildOnboardingContext(
        userId,
        personaId,
        userProfile as Parameters<typeof onboardingService.buildOnboardingContext>[2]
      );
      if (onboardingContext) {
        this._instructions = `${this._instructions}\n${onboardingContext}`;
        this.logger.debug('Ritual onboarding context injected into instructions');
      }
    } catch (error) {
      this.logger.warn({ error: String(error) }, 'Failed to inject engagement context');
    }
  }

  /**
   * Send celebration events to frontend based on context injections
   * Uses fireworks for major achievements (professional, not gamified)
   * Uses sparkles for lighter moments (aha moments, good news)
   *
   * Now uses centralized FrontendPublisher for consistent handling
   */
  private async sendCelebrationEvents(
    injections: Array<{ category: string; content: string }>
  ): Promise<void> {
    // Use FrontendPublisher for celebration events
    try {
      const { getFrontendPublisher } = await import('./realtime/index.js');
      const publisher = getFrontendPublisher();

      if (publisher.isConnected()) {
        await publisher.sendCelebrationEvents(injections);
        return;
      }
    } catch (e) {
      // Fall through to legacy approach - publisher not ready
      this.logger.debug({ error: String(e) }, 'FrontendPublisher not available for celebrations');
    }

    // Legacy fallback
    if (!this._room?.localParticipant) return;

    // Map context injection categories to celebration configs
    const celebrationConfigs: Record<
      string,
      { celebrationType: string; effect: 'fireworks' | 'sparkles'; message?: string }
    > = {
      milestone: {
        celebrationType: 'milestone',
        effect: 'fireworks',
        message: '🎆 Milestone achieved!',
      },
      achievement: {
        celebrationType: 'achievement',
        effect: 'fireworks',
        message: '🎆 Great achievement!',
      },
      aha_moment: { celebrationType: 'aha_moment', effect: 'sparkles' },
      good_news: { celebrationType: 'good_news', effect: 'sparkles' },
    };

    for (const injection of injections) {
      const config = celebrationConfigs[injection.category];
      if (config) {
        try {
          const celebrationMessage = JSON.stringify({
            type: 'celebration',
            celebrationType: config.celebrationType,
            effect: config.effect,
            message: config.message,
            timestamp: Date.now(),
          });

          await this._room.localParticipant.publishData(
            new TextEncoder().encode(celebrationMessage),
            { reliable: true }
          );

          this.logger.info(
            { celebrationType: config.celebrationType, effect: config.effect },
            'Sent celebration event to frontend'
          );
        } catch (err) {
          this.logger.warn({ error: String(err) }, 'Failed to send celebration event');
        }
      }
    }
  }

  /**
   * Enhanced user turn completion hook
   * Uses modular context builders to inject intelligent guidance
   *
   * NOTE: A refactored version using the extracted TurnProcessor is available.
   * Enable with USE_TURN_PROCESSOR=true environment variable.
   */
  async onUserTurnCompleted(turnCtx: llm.ChatContext, newMessage: llm.ChatMessage): Promise<void> {
    const userText = newMessage.textContent;

    // Log immediately
    diag.user('User turn completed', {
      preview: userText?.slice(0, 100) || '(empty)',
    });

    if (!userText || userText.trim().length === 0) {
      diag.warn('Empty user text, returning early');
      return;
    }

    // Use modular TurnProcessor for turn handling
    await this.onUserTurnCompletedV2(turnCtx, newMessage);
  }

  // Legacy turn processing code removed - now using TurnProcessor V2 exclusively
  // See processors/turn-processor.ts for the modular implementation

  /**
   * Process user turn using the extracted TurnProcessor module.
   *
   * Benefits:
   * - Modular, testable code (~800 lines extracted to turn-processor.ts)
   * - Clear data flow with typed interfaces
   * - Easier to maintain and extend
   */
  private async onUserTurnCompletedV2(
    turnCtx: llm.ChatContext,
    newMessage: llm.ChatMessage
  ): Promise<void> {
    const userText = newMessage.textContent;
    if (!userText || userText.trim().length === 0) {
      return;
    }

    const userData = this.getUserDataFromContext();
    const services = userData?.services || globalSessionServices;

    if (!services) {
      this.logger.warn('No services available for turn processing');
      return;
    }

    try {
      // Import the turn processor (cached after first load)
      const { processTurn, injectTurnContext, getCelebrationEvents } =
        await import('./processors/index.js');

      // Build turn context
      const turnContext = {
        turnCtx,
        userText,
        persona: this.persona,
        bundleRuntime: this.bundleRuntime,
        services,
        userData: userData as UserData,
        logger: this.logger,
      };

      // Process the turn (all analysis, context building, emotional tracking)
      const result = await processTurn(turnContext);

      // Inject context into LLM
      injectTurnContext(turnCtx, result);

      // Send celebration events to frontend
      const celebrations = getCelebrationEvents(result);
      if (celebrations.length > 0) {
        await this.sendCelebrationEvents(celebrations);
      }

      // Send mood update to frontend
      if (result.context.humanizingResult) {
        const hr = result.context.humanizingResult;
        await this.sendDataMessage('mood', {
          state: hr.mood.state,
          energyLevel: hr.mood.energyLevel,
          relationshipStage: hr.relationship.stage,
          hasTransition: !!hr.relationshipTransition,
        });
      }

      // ================================================================
      // TRUST SYSTEMS DATA RECORDING
      // Record data to new trust systems for "better than human" features
      // ================================================================
      const userId = services.userId;
      if (userId) {
        await this.recordTrustSystemsData(userId, userText, result);
      }

      this.logger.info(
        {
          elapsedMs: result.context.elapsedMs,
          contextCount: result.context.injections.length,
          emotion: result.emotional.primary,
        },
        '🎯 Turn processed with TurnProcessor V2'
      );
    } catch (error) {
      this.logger.error({ error: String(error) }, 'TurnProcessor V2 failed');
      // Note: No fallback to V1 here - if USE_TURN_PROCESSOR is true,
      // the user wants the new path, so we should surface errors
      throw error;
    }
  }

  // ============================================================================
  // TRUST SYSTEMS DATA RECORDING
  // ============================================================================

  /**
   * Record data to trust systems for "better than human" features
   * Called after each user turn is processed
   */
  private async recordTrustSystemsData(
    userId: string,
    userText: string,
    result: {
      emotional: { primary?: string; intensity?: number };
      context: { humanizingResult?: { mood?: { state?: string } } };
    }
  ): Promise<void> {
    try {
      // Phase 17: Record emotional snapshot to sentiment timeline
      if (result.emotional?.primary) {
        recordEmotionalSnapshot(userId, {
          primaryEmotion: result.emotional.primary as
            | 'joy'
            | 'sadness'
            | 'anxiety'
            | 'anger'
            | 'fear'
            | 'surprise'
            | 'disgust'
            | 'trust'
            | 'anticipation'
            | 'neutral',
          secondaryEmotions: [],
          intensity: result.emotional.intensity || 0.5,
          source: 'detected',
        });
      }

      // Phase 14: Detect life events mentioned in conversation
      const lifeEvents = detectLifeEvents(userId, userText);
      for (const detection of lifeEvents) {
        if (detection.detected && detection.event && detection.confidence > 0.6) {
          saveEvent({
            ...detection.event,
            userId,
            id: detection.event.id || `event-${Date.now()}`,
            date: detection.event.date || new Date(),
            type: detection.event.type || 'event',
            importance: detection.event.importance || 'medium',
            followUp: detection.event.followUp || { beforeReminder: true, afterCheckIn: true },
            tags: detection.event.tags || [],
            context: detection.event.context || {
              mentionedAt: new Date(),
              originalText: userText,
            },
          } as Parameters<typeof saveEvent>[0]);
          this.logger.debug({ event: detection.event }, '📅 Life event detected and saved');
        }
      }

      // Phase 27: Record learning style signals
      recordLearningSignals(userId, userText);

      // Phase 28: Record topic data for insights
      const topic = result.context?.humanizingResult?.mood?.state;
      if (topic) {
        const sentiment =
          result.emotional?.primary === 'joy' || result.emotional?.primary === 'trust'
            ? 'positive'
            : result.emotional?.primary === 'sadness' ||
                result.emotional?.primary === 'anger' ||
                result.emotional?.primary === 'fear'
              ? 'negative'
              : 'neutral';
        recordTopicData(userId, topic, sentiment);
      }

      // Phase 28: Record emotion data for insights
      if (result.emotional?.primary) {
        recordEmotionData(userId, {
          date: new Date(),
          emotion: result.emotional.primary,
          intensity: result.emotional.intensity || 0.5,
        });
      }

      this.logger.debug({ userId }, '🤝 Trust systems data recorded');
    } catch (error) {
      // Non-fatal - don't break conversation for trust recording errors
      this.logger.warn({ error: String(error) }, 'Trust systems recording failed (non-fatal)');
    }
  }
}

// ============================================================================
// GLOBAL SESSION SERVICES
// ============================================================================

let globalSessionServices: SessionServices | undefined;

// ============================================================================
// AGENT DEFINITION
// ============================================================================

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    const startTime = Date.now();
    diag.section('PREWARM CALLED');
    diag.prewarm('Starting prewarm', {
      pid: process.pid,
      persona: PERSONA.id,
    });

    try {
      // Use unified startup system (handles config, storage, cache, services)
      const { startup, registerShutdownHandlers } = await import('../startup.js');
      registerShutdownHandlers();
      await startup();
    } catch (error) {
      diag.error('Startup failed', { error: String(error) });
      // Fall back to basic initialization
      try {
        diag.prewarm('Falling back to basic initialization...');
        await initializeServices();
      } catch (fallbackError) {
        diag.error('Fallback initialization also failed', { error: String(fallbackError) });
      }
    }

    // Preload commonly used modules for faster first turn response
    try {
      const { preloadCommonModules } = await import('./shared/cached-imports.js');
      await preloadCommonModules();
      diag.prewarm('Common modules preloaded');
    } catch (preloadError) {
      diag.warn('Module preload failed (non-fatal)', { error: String(preloadError) });
    }

    proc.userData.vadLoaded = false;

    diag.prewarm('Prewarm complete', { elapsed: Date.now() - startTime });
  },

  entry: async (ctx: JobContext) => {
    const entryStartTime = Date.now();
    const logger = log();

    diag.section('ENTRY FUNCTION CALLED');
    diag.entry('Job received', {
      jobId: ctx.job.id,
      persona: PERSONA.id,
      personaName: PERSONA.name,
    });

    const sessionId = ctx.room?.name || `session-${Date.now()}`;

    try {
      // ===============================================
      // STEP 0: LOAD PERSONA FROM DISPATCH METADATA
      // ===============================================
      // UI can select persona; agent loads it dynamically per-session
      let sessionPersona = PERSONA; // Default from env var

      try {
        if (ctx.job.metadata) {
          const metadata = JSON.parse(ctx.job.metadata);
          if (metadata.persona_id) {
            // Use async version to ensure bundles are loaded and aliases are registered
            const requestedPersona = await getPersonaAsync(metadata.persona_id);
            if (requestedPersona) {
              sessionPersona = requestedPersona;
              diag.session('Persona loaded from dispatch', {
                personaId: sessionPersona.id,
                personaName: sessionPersona.name,
              });
            } else {
              diag.warn('Unknown persona requested, using default', {
                requested: metadata.persona_id,
                fallback: PERSONA.id,
              });
            }
          }
        }
      } catch (e) {
        diag.warn('Failed to parse persona from metadata', { error: String(e) });
      }

      // ===============================================
      // STEP 1: IDENTIFY USER
      // ===============================================
      diag.user('Step 1: Identifying user');
      let userId: string | undefined;
      let userName: string | undefined;
      let identificationSource = 'anonymous';

      // Helper to filter out placeholder/generated usernames - we should NEVER guess a name!
      const isRealName = (name: string | undefined): boolean => {
        if (!name) return false;
        // Filter out generated placeholders like "user_1234567890", "User 1", or just "User"
        if (/^user[_-]?\d*$/i.test(name)) return false;
        // Filter out UUIDs
        if (/^[a-f0-9-]{36}$/i.test(name)) return false;
        // Filter out "anonymous", "guest", etc.
        if (/^(anonymous|guest|visitor|unknown)$/i.test(name)) return false;
        return true;
      };

      try {
        if (ctx.job.metadata) {
          const metadata = JSON.parse(ctx.job.metadata);

          const { identifyFromMetadata } = await import('../services/user-identification.js');
          const identification = await identifyFromMetadata(metadata);

          userId = identification.userId;
          identificationSource = identification.source.type;

          // CRITICAL: Only use REAL names, never placeholders!
          // Priority: 1. Profile name (persistent), 2. Metadata name (if real)
          const metadataName = metadata.user_name || metadata.userName;
          const profileName = identification.profile?.name;

          if (isRealName(profileName)) {
            userName = profileName;
          } else if (isRealName(metadataName)) {
            userName = metadataName;
          }
          // If neither is a real name, userName stays undefined - agent should NOT guess!

          diag.user('User identified', {
            userId,
            userName: userName || '(unknown - will ask)',
            source: identificationSource,
            metadataNameFiltered: metadataName && !isRealName(metadataName),
          });
        }
      } catch (e) {
        diag.warn('User identification failed', { error: String(e) });
      }

      // Configure music playback mode
      if (identificationSource === 'phone') {
        const { setStreamIntoCall } = await import('../tools/spotify.js');
        setStreamIntoCall(true);
      }

      // ===============================================
      // STEP 2: CREATE SESSION SERVICES
      // ===============================================
      diag.session('Step 2: Creating session services');

      // Reset handoff state to ensure clean slate for new session
      resetHandoffState();
      resetMetPersonas(); // Reset "first meeting" tracking for natural greetings

      // FIX BUG #33: Notify frontend of state reset so UI can sync
      try {
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(
            JSON.stringify({
              type: 'state_reset',
              activePersona: 'ferni',
              timestamp: Date.now(),
            })
          ),
          { reliable: true }
        );
        logger.debug('Notified frontend of state reset');
      } catch (notifyErr) {
        logger.warn({ error: String(notifyErr) }, 'Failed to notify frontend of state reset');
      }

      // Reset catchphrase tracking for new session (prevents overuse)
      resetCatchphraseTracking();

      // Reset all conversation dynamics for fresh session
      // (emotional arc, response dynamics, story timing)
      resetAllConversationState();

      // Create session services with PERSONA-SPECIFIC speech characteristics
      // This ensures each agent (Jack Bogle, Peter John, Ferni) sounds distinctly different
      const services = await createSessionServices(
        sessionId,
        userId,
        undefined, // isReturningUser will be determined from profile
        sessionPersona.speechCharacteristics, // Per-persona pacing, pauses, energy
        sessionPersona.personality.energy, // Fallback: derive from energy level
        sessionPersona.id // Persona ID for persona-aware SSML
      );
      globalSessionServices = services;

      // Load trust profiles for "better than human" trust awareness
      if (userId) {
        try {
          await loadTrustProfiles(userId);
          diag.session('Trust profiles loaded for user', { userId });
        } catch (trustErr) {
          diag.warn('Failed to load trust profiles (non-fatal)', { error: String(trustErr) });
        }
      }

      const isReturningUser =
        services.userProfile !== null && (services.userProfile.totalConversations || 0) > 0;

      // ===============================================
      // STEP 3: INITIALIZE USER DATA
      // ===============================================

      // Initialize conversation state for tool orchestration
      // This provides shared context across all tools for human-level conversation
      const conversationState = getConversationState(
        sessionId,
        userId || 'default',
        sessionPersona.id
      );

      // Set user name if known
      if (userName || services.userProfile?.name) {
        conversationState.setUserName(userName || services.userProfile?.name || '');
      }

      const userData: UserData = {
        name: userName || services.userProfile?.name,
        userId,
        isReturningUser,
        services,
        turnCount: 0,
        // Initialize bundle runtime state
        bundleRuntimeState: {
          relationshipTurns: services.userProfile?.totalConversations
            ? Math.min(services.userProfile.totalConversations * 5, 300) // Estimate turns from sessions
            : 0,
          currentMode: 'listening', // Start in listening mode
          storiesToldThisSession: [],
        },
        // Conversation state for tool orchestration
        conversationState,
      };

      diag.session('Conversation state initialized', {
        sessionId,
        userId: userId || 'default',
        agentId: sessionPersona.id,
      });

      // ===============================================
      // A/B TESTING: Assign user to active experiments
      // ===============================================
      // This enables testing different tool configurations to optimize performance
      const activeExperiments = abTestingService.getActiveExperiments();
      for (const experiment of activeExperiments) {
        const assignment = abTestingService.assignUser(userId || sessionId, experiment.id);
        if (assignment) {
          diag.entry('User assigned to experiment', {
            experimentId: experiment.id,
            variantId: assignment.variantId,
            userId: userId || sessionId,
          });
        }
      }

      // ===============================================
      // AUTO-OPTIMIZATION: Start session tracking
      // ===============================================
      // Track this session for pattern analysis and feedback collection
      patternAnalyzer.startSession(sessionId, userId || 'anonymous', sessionPersona.id);
      autoOptimizer.startSession(sessionId, userId || 'anonymous', sessionPersona.id);
      diag.entry('Optimization session started', { sessionId, personaId: sessionPersona.id });

      // ===============================================
      // STEP 3b: INITIALIZE HANDOFF CONTEXT (for alive entrances)
      // FIX BUG #34: Load per-persona meeting counts from both humanizingState and customData
      // (customData is where session-manager persists them on session end)
      // ===============================================
      const customData = services.userProfile?.customData as Record<string, unknown> | undefined;
      initializeHandoffContext({
        meetingCounts:
          services.userProfile?.humanizingState?.perPersonaMeetingCounts ||
          (customData?.meetingCounts as Record<string, number> | undefined),
        lastTopics:
          services.userProfile?.humanizingState?.perPersonaLastTopic ||
          (customData?.lastTopicsPerPersona as Record<string, string> | undefined),
        persistMeetingCounts: (counts) => {
          // Persist to user profile asynchronously
          if (services.userProfile) {
            const existingState = services.userProfile.humanizingState || {
              usedShareTags: [],
              totalSpontaneousShares: 0,
              updatedAt: new Date(),
            };
            services.userProfile.humanizingState = {
              ...existingState,
              perPersonaMeetingCounts: counts,
              updatedAt: new Date(),
            };
            // Mark profile for save (will be persisted on session end)
          }
        },
        persistLastTopics: (topics) => {
          if (services.userProfile) {
            const existingState = services.userProfile.humanizingState || {
              usedShareTags: [],
              totalSpontaneousShares: 0,
              updatedAt: new Date(),
            };
            services.userProfile.humanizingState = {
              ...existingState,
              perPersonaLastTopic: topics,
              updatedAt: new Date(),
            };
          }
        },
      });

      // ===============================================
      // STEP 4: LOAD VAD AND CREATE SESSION
      // ===============================================
      let { vad } = ctx.proc.userData;

      if (!vad) {
        vad = await silero.VAD.load();
        ctx.proc.userData.vad = vad;
      }

      // Initialize voice manager
      const voiceManager = getVoiceManager();
      voiceManager.initialize();

      // Create TTS using PersonaAwareTTS - uses the persona's specific voice
      diag.tts('Creating PersonaAwareTTS', {
        persona: sessionPersona.id,
        personaName: sessionPersona.name,
        voiceId: sessionPersona.voice.voiceId,
      });

      const tts = createPersonaAwareTTS(sessionPersona.name, sessionPersona.voice);

      const session = new voice.AgentSession({
        vad: vad as silero.VAD,
        llm: new google.beta.realtime.RealtimeModel({
          model: 'gemini-2.0-flash-exp',
          modalities: [Modality.TEXT],
          temperature: 0.8,
          language: 'en-US',
          instructions: sessionPersona.systemPrompt,
        }),
        tts,
        userData,
        // LATENCY OPTIMIZATION: Tune voice options for snappy, human-like responses
        voiceOptions: {
          // Allow user to interrupt the agent naturally
          allowInterruptions: true,
          // Minimum silence before considering user done speaking (ms)
          // Lower = snappier responses, but may cut off pauses
          minEndpointingDelay: 400,
          // Maximum wait time (ms) - prevents long awkward pauses
          maxEndpointingDelay: 1200,
          // How many words user must say before they can interrupt
          minInterruptionWords: 1,
          // How long user must speak to interrupt (ms)
          minInterruptionDuration: 300,
          // Start generating response while user is still finishing
          preemptiveGeneration: true,
        },
      });

      // ===============================================
      // STEP 5: EVENT LISTENERS
      // ===============================================
      const conversationManager = getConversationManager();

      // Set persona ID for persona-specific behaviors (backchanneling, etc.)
      conversationManager.setPersonaId(sessionPersona.id);

      // Wire conversation manager to capture insights for learning (NEW)
      conversationManager.setInsightCallback((type, key, value, confidence) => {
        services.captureInsight(type, key, value, confidence);
      });

      // ============================================================
      // TOOL EXECUTION TRACKING - Orchestration Integration
      // ============================================================
      // Track tool calls in conversation state for orchestration
      // Also record analytics for tool usage optimization
      session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
        void (async () => {
          const toolStartTime = Date.now();

          // Debug logging (can be disabled in production)
          if (DEBUG_STARTUP) {
            console.log('🔧 [TOOLS] FunctionToolsExecuted event');
          }
          logger.info({ event }, '🔧 FUNCTION TOOLS EXECUTED');

          // Update conversation state with tool execution
          if (userData?.conversationState && event) {
            const convState = userData.conversationState;

            // Get tool information from event
            // The event structure varies, but typically contains tool name/id
            const toolInfo = event as {
              name?: string;
              toolName?: string;
              result?: unknown;
              error?: unknown;
              tools?: Array<{
                name?: string;
                result?: unknown;
                error?: unknown;
                startTime?: number;
              }>;
            };

            // Handle single tool or multiple tools
            const toolCalls = toolInfo.tools || [toolInfo];

            for (const tool of toolCalls) {
              const toolName = tool.name || toolInfo.name || toolInfo.toolName || 'unknown';
              const resultSummary =
                typeof tool.result === 'string'
                  ? tool.result.slice(0, 200)
                  : JSON.stringify(tool.result).slice(0, 200);

              // Record in conversation state
              convState.recordToolCall(toolName, resultSummary);

              // Record analytics for tool usage optimization
              try {
                const { recordToolUsage } = await import('../services/tool-usage-analytics.js');
                const toolWithStartTime = tool as { startTime?: number };
                const latencyMs = toolWithStartTime.startTime
                  ? Date.now() - toolWithStartTime.startTime
                  : Date.now() - toolStartTime;
                const hasError = !!tool.error || !!toolInfo.error;
                recordToolUsage(
                  toolName,
                  'unknown', // Domain can be inferred later from registry
                  {
                    agentId: sessionPersona?.id || 'unknown',
                    userId: services.userId,
                    sessionId: services.sessionId,
                  },
                  latencyMs,
                  !hasError,
                  hasError ? String(tool.error || toolInfo.error) : undefined
                );

                // Record for deprecation analysis (identifies unused/error-prone tools)
                deprecationService.recordUsage(toolName, !hasError, latencyMs);

                // Record for pattern analysis (co-occurrence, sequences, journeys)
                patternAnalyzer.recordToolCall(
                  services.sessionId || sessionId,
                  toolName,
                  !hasError,
                  latencyMs
                );

                // Record for auto-optimizer (feeds recommendation engine)
                autoOptimizer.recordToolExecution(
                  services.sessionId || sessionId,
                  toolName,
                  !hasError,
                  latencyMs
                );
              } catch (e) {
                // Analytics recording is non-critical, don't fail the tool execution
                log().debug({ error: String(e) }, 'Tool analytics recording failed (non-critical)');
              }

              diag.tool('Tool execution tracked', {
                tool: toolName,
                hasResult: !!tool.result,
              });
            }
          }
        })();
      });

      session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
        if (event.newState === 'speaking') {
          conversationManager.handleAgentStartedSpeaking('');

          // Duck background music when agent speaks (only if music is enabled)
          import('../config/environment.js')
            .then(async ({ isMusicEnabled }) => {
              if (!isMusicEnabled()) return;
              return import('../audio/index.js');
            })
            .then((audioModule) => {
              if (!audioModule) return;
              const player = audioModule.getMusicPlayer();
              if (player.isPlaying()) {
                player.duck();
                diag.state('Ducked background music for agent speech');
              }
            })
            .catch((e) => log().debug({ error: String(e) }, 'Music ducking (non-critical)'));
        }
        if (event.oldState === 'speaking' && event.newState !== 'speaking') {
          conversationManager.handleAgentFinishedSpeaking(0);

          // Unduck background music when agent stops speaking (only if music is enabled)
          import('../config/environment.js')
            .then(async ({ isMusicEnabled }) => {
              if (!isMusicEnabled()) return;
              return import('../audio/index.js');
            })
            .then((audioModule) => {
              if (!audioModule) return;
              const player = audioModule.getMusicPlayer();
              if (player.getState().isDucked) {
                player.unduck();
                diag.state('Unducked background music after agent speech');
              }
            })
            .catch((e) => log().debug({ error: String(e) }, 'Music unducking (non-critical)'));
        }
      });

      let userLastSpokeAt = Date.now();
      let silenceResponseCount = 0;
      let lastSilenceResponseAt = 0;

      // Track conversation context for meaningful silence responses
      const silenceContext: SilenceContext = {
        silenceDurationSeconds: 0,
        turnCount: 0,
        topicsDiscussed: [],
        recentEmotionalTone: 'neutral',
        userName: userData.name,
        memorableMoments: [],
        isGameActive: false,
        activeGameType: undefined,
        isMusicPlaying: false,
      };

      // ===============================================
      // BACKCHANNEL SYSTEM - Real-time listening cues
      // ===============================================
      // Fire "mm-hmm", "right", etc. while user is speaking long turns
      // This makes the AI feel like it's actively listening
      const activeListening = getActiveListeningEngine();
      let backchannelTimer: ReturnType<typeof setTimeout> | null = null;
      let lastBackchannelAt = 0;
      const BACKCHANNEL_MIN_INTERVAL_MS = 5000; // Don't backchannel more than once per 5s
      const BACKCHANNEL_TRIGGER_MS = 3500; // Backchannel after user speaks for 3.5s

      const attemptBackchannel = async () => {
        // Don't backchannel if agent is speaking
        if (conversationManager.isAgentSpeaking()) return;

        // Don't backchannel too frequently
        if (Date.now() - lastBackchannelAt < BACKCHANNEL_MIN_INTERVAL_MS) return;

        // Get a backchannel from active listening engine
        const backchannel = activeListening.getBackchannel(sessionPersona.id, {
          userEmotion: silenceContext.recentEmotionalTone === 'heavy' ? 'worried' : undefined,
          topicSeriousness: silenceContext.recentEmotionalTone === 'heavy' ? 'serious' : 'casual',
          userJustSharedSomethingPersonal: silenceContext.recentEmotionalTone === 'heavy',
        });

        if (backchannel) {
          try {
            // Say the backchannel with SSML - allow interruption
            session.say(backchannel.ssml, { allowInterruptions: true });
            lastBackchannelAt = Date.now();

            // Track that we gave a backchannel (for reaction analysis)
            pendingBackchannelReaction = true;

            diag.state('Backchannel fired', {
              text: backchannel.verbal,
              type: backchannel.type,
              persona: sessionPersona.id,
            });
          } catch (e) {
            logger.warn({ error: e }, 'Failed to fire backchannel');
          }
        }
      };

      // Track backchannel reactions for frequency tuning
      let pendingBackchannelReaction = false;

      session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
        if (event.newState === 'speaking') {
          userLastSpokeAt = Date.now();
          userData.userSpeakingStartTime = userLastSpokeAt;

          // Check if user responded to our backchannel (within 10 seconds)
          if (pendingBackchannelReaction && Date.now() - lastBackchannelAt < 10000) {
            // User continued speaking after backchannel - positive reaction!
            activeListening.recordBackchannelReaction(true);
            pendingBackchannelReaction = false;
          }
          // Reset silence tracking when user speaks
          silenceResponseCount = 0;
          lastSilenceResponseAt = 0;
          // Stop ambient music when user starts speaking
          stopAmbientMusic();
          conversationManager.handleUserStartedSpeaking();

          // 🎮 GAME DUCKING: Lower music volume when user speaks during a game
          // They're making a guess - let them be heard clearly!
          void (async () => {
            try {
              const { isGameCurrentlyActive, duckForUserGuess, updateGameActivity } =
                await import('../services/games/index.js');
              if (isGameCurrentlyActive()) {
                duckForUserGuess();
                updateGameActivity(); // Track activity for auto-cleanup
              }
            } catch {
              // Games module not loaded - that's fine
            }
          })();

          // Schedule potential backchannel after user has been speaking a while
          // Only for turn 3+ to establish rapport first
          if ((userData.turnCount || 0) >= 3) {
            backchannelTimer = setTimeout(() => {
              void attemptBackchannel();
            }, BACKCHANNEL_TRIGGER_MS);
          }
        } else if (event.newState === 'listening') {
          // User stopped speaking - cancel pending backchannel
          if (backchannelTimer) {
            clearTimeout(backchannelTimer);
            backchannelTimer = null;
          }

          if (userData.userSpeakingStartTime) {
            conversationManager.handleUserFinishedSpeaking(
              Date.now() - userData.userSpeakingStartTime
            );
          }

          // 🎮 GAME UNDUCK: Restore music volume after user finishes speaking
          void (async () => {
            try {
              const { isGameCurrentlyActive, unduckAfterGuess } =
                await import('../services/games/index.js');
              if (isGameCurrentlyActive()) {
                unduckAfterGuess();
              }
            } catch {
              // Games module not loaded - that's fine
            }
          })();
        }

        // MEANINGFUL SILENCE HANDLING
        // Progressive responses that create genuine connection instead of "still there?"
        if (event.newState === 'away') {
          const silenceDurationMs = Date.now() - userLastSpokeAt;
          const silenceDurationSec = silenceDurationMs / 1000;

          // Track negative backchannel reaction if user went silent after our backchannel
          if (pendingBackchannelReaction && Date.now() - lastBackchannelAt > 5000) {
            // User went silent 5+ seconds after backchannel - might be negative
            activeListening.recordBackchannelReaction(false);
            pendingBackchannelReaction = false;
          }

          // ----------------------------------------------------------------
          // MEDIUM SILENCE BACKCHANNELS (3-8 seconds)
          // Gentle acknowledgment before the full meaningful silence system kicks in
          // These create connection without being intrusive
          // ----------------------------------------------------------------
          const MEDIUM_SILENCE_THRESHOLD_SEC = 4; // 4 seconds of silence
          const MEDIUM_SILENCE_COOLDOWN_MS = 12000; // Only one per 12 seconds

          if (
            silenceDurationSec >= MEDIUM_SILENCE_THRESHOLD_SEC &&
            silenceDurationSec < 10 && // Before meaningful silence kicks in
            silenceResponseCount === 0 && // No response given yet
            Date.now() - lastBackchannelAt > MEDIUM_SILENCE_COOLDOWN_MS &&
            !conversationManager.isAgentSpeaking() &&
            (userData.turnCount || 0) >= 2 // Not in first couple turns
          ) {
            // Check if this was a vulnerable/emotional moment - give more space
            const isEmotionalMoment = silenceContext.recentEmotionalTone === 'heavy';

            // For emotional moments, wait longer (6 seconds) before gentle acknowledgment
            if (!isEmotionalMoment || silenceDurationSec >= 6) {
              const silenceBackchannel = activeListening.getSilenceBackchannel(sessionPersona.id, {
                silenceDurationMs,
                userJustSharedPersonal: isEmotionalMoment,
                userIsProcessingEmotions: isEmotionalMoment,
                lastUserEmotion: userData.lastEmotionAnalysis?.primary,
                turnCount: userData.turnCount || 0,
              });

              if (silenceBackchannel) {
                try {
                  session.say(silenceBackchannel.ssml, { allowInterruptions: true });
                  lastBackchannelAt = Date.now();
                  diag.state('Silence-aware backchannel', {
                    phrase: silenceBackchannel.verbal,
                    silenceSec: Math.round(silenceDurationSec),
                    type: silenceBackchannel.type,
                  });
                } catch (e) {
                  logger.debug({ error: e }, 'Failed to say silence backchannel');
                }
              }
            }
          }

          // ----------------------------------------------------------------
          // LONG SILENCE (10s+) - Meaningful silence responses
          // ----------------------------------------------------------------
          // Determine which interval we're in and if we should respond
          // First response at 10s, second at 22s, third at 38s
          const intervals = [10, 22, 38];
          const targetInterval = intervals[silenceResponseCount];

          if (
            targetInterval &&
            silenceDurationSec >= targetInterval &&
            Date.now() - lastSilenceResponseAt > SILENCE_THRESHOLDS.MIN_RESPONSE_INTERVAL
          ) {
            userData.userWentSilent = true;

            // Update silence context from conversation state
            silenceContext.silenceDurationSeconds = silenceDurationSec;
            silenceContext.turnCount = userData.turnCount || 0;
            silenceContext.userName = userData.name;

            // Get topics from services if available
            try {
              const promptContext = services.getPromptContext();
              if (promptContext.topicsToCircleBack) {
                silenceContext.topicsDiscussed = promptContext.topicsToCircleBack;
                // Set wasDiscussingTopic to the most recent topic
                if (promptContext.topicsToCircleBack.length > 0) {
                  silenceContext.wasDiscussingTopic = promptContext.topicsToCircleBack[0];
                }
              }
              // Detect emotional tone from recent phase
              if (promptContext.phase === 'supporting') {
                silenceContext.recentEmotionalTone = 'heavy';
              } else if (
                promptContext.phase === 'greeting' ||
                promptContext.phase === 'warming_up'
              ) {
                silenceContext.recentEmotionalTone = 'light';
              }
              // Also set time awareness
              silenceContext.currentHour = new Date().getHours();
              silenceContext.isWeekend = [0, 6].includes(new Date().getDay());
            } catch (e) {
              // Services might not be ready
              log().debug(
                { error: String(e) },
                'Silence context initialization failed (services not ready)'
              );
            }

            // Get meaningful silence response instead of generic filler
            const silenceResponse = getMeaningfulSilenceResponse(sessionPersona, silenceContext);

            diag.state('Meaningful silence response', {
              type: silenceResponse.type,
              silenceDuration: Math.round(silenceDurationSec),
              responseCount: silenceResponseCount + 1,
            });

            try {
              session.say(silenceResponse.text, { allowInterruptions: true });
              silenceResponseCount++;

              // If we offered music, actually play it after a short delay
              if (silenceResponse.type === 'music_offering') {
                setTimeout(() => {
                  void (async () => {
                    const musicStarted = await playAmbientMusicDuringSilence();
                    if (musicStarted) {
                      diag.state('Started ambient music during silence');
                    }
                  })();
                }, 3000); // Wait 3 seconds for them to respond before starting music
              }
              lastSilenceResponseAt = Date.now();
            } catch (e) {
              logger.warn({ error: e }, 'Failed to say silence response');
            }
          }
        }
      });

      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
        if (event.isFinal && event.transcript) {
          userData.turnCount = (userData.turnCount || 0) + 1;

          // Extract memorable moments from what the user shared
          // This powers the meaningful silence system - so we can reference
          // things like "your daughter" or "the move" later
          const newMoments = extractMemorableMoments(event.transcript);
          if (newMoments.length > 0) {
            silenceContext.memorableMoments = mergeMemorableMoments(
              silenceContext.memorableMoments || [],
              newMoments
            );
            diag.state('Captured memorable moments', {
              newMoments,
              total: silenceContext.memorableMoments.length,
            });
          }

          // Update context with last user message
          silenceContext.lastUserMessage = event.transcript;

          // ===============================================
          // 🎮 GAME TOPIC CHANGE DETECTION
          // ===============================================
          // If a game is active and user seems to have moved on, end it gracefully
          void (async () => {
            try {
              const { isGameCurrentlyActive, getCurrentGameType, detectTopicChange } =
                await import('../services/games/index.js');

              if (isGameCurrentlyActive()) {
                const gameType = getCurrentGameType() as
                  | import('../services/games/types.js').GameType
                  | null;
                const hasChangedTopic = detectTopicChange(event.transcript, gameType);

                if (hasChangedTopic) {
                  // User seems to have moved on from the game
                  const { getGameEngine, resetGameActivity } =
                    await import('../services/games/index.js');
                  const engine = getGameEngine();
                  const session = engine.endGame();
                  resetGameActivity();

                  diag.state('🎮 Game auto-ended due to topic change', {
                    gameType,
                    score: session.score,
                    rounds: session.roundsPlayed,
                  });
                }

                // Update silence context to reflect game state
                silenceContext.isGameActive = isGameCurrentlyActive();
                silenceContext.activeGameType = getCurrentGameType() || undefined;
              }
            } catch {
              // Games module not loaded - that's fine
            }
          })();

          // ===============================================
          // DYNAMIC TOOL LOADING based on conversation topic
          // ===============================================
          // Analyze the user's message and auto-load relevant tool domains
          // This keeps tool count manageable while ensuring relevant tools are available
          dynamicToolLoader
            .processMessage(event.transcript)
            .then((loadedDomains) => {
              if (loadedDomains.length > 0) {
                diag.tool('Dynamic domains loaded based on user message', {
                  transcript: event.transcript.slice(0, 50),
                  loadedDomains,
                  totalLoadedDomains: dynamicToolLoader.getLoadedDomains().length,
                });
              }
            })
            .catch((error) => {
              logger.warn({ error }, 'Failed to process message for dynamic tool loading');
            });

          // ===============================================
          // FEEDBACK COLLECTION for tool optimization
          // ===============================================
          // Collect implicit and explicit feedback from user messages
          // This powers the automated recommendation system
          try {
            // Get tool execution data from conversation state
            const toolExecData = userData.conversationState?.getToolExecutionData?.();
            const recentTools = toolExecData?.recentlyUsedTools || [];
            const lastToolResult = toolExecData?.lastToolResult;
            const lastToolId = toolExecData?.lastToolCalled;

            const feedbackContext: FeedbackContext = {
              userId: userData.userId || 'anonymous',
              sessionId,
              agentId: sessionPersona.id,
              turnNumber: userData.turnCount || 0,
              recentTools,
              lastToolResult,
            };

            // Process feedback asynchronously
            autoOptimizer.processUserMessage(event.transcript, feedbackContext, lastToolId);
          } catch (feedbackError) {
            // Feedback collection is non-critical
            diag.warn('Feedback collection error', { error: String(feedbackError) });
          }
        }
      });

      // ===============================================
      // STEP 5b: HANDOFF EVENT LISTENERS (All Personas)
      // ===============================================
      // Listen for agent handoff events and notify the frontend
      // Supports full team: Ferni (life coach), Jack Bogle, Peter John, Alex, Maya, Jordan
      // NOTE: Internal tracking uses short IDs (alex, maya, jordan) but events emit persona IDs (comm-specialist, spend-save, event-planner)

      // Mutable reference to voiceAgent for use in async event handlers
      // Will be assigned after voiceAgent is created (below)
      let voiceAgentRef: VoiceAgent | null = null;

      // ============================================================
      // HANDOFF EVENT HANDLER - Uses extracted handler for clean modularity
      // ============================================================
      // Create handoff handler with config (uses PersonaRegistry internally)
      const handoffHandler = createHandoffHandler({
        ctx,
        session,
        tts: session.tts as { switchVoice?: (name: string, id: string) => void },
        services,
        userData,
        getVoiceAgentRef: () => voiceAgentRef as VoiceAgentRef | null,
      });

      handoffEvents.on('voiceSwitch', handoffHandler);

      // NOTE: The inline handler has been extracted to src/agents/shared/handoff-handler.ts
      // This reduces voice-agent.ts by ~350 lines while maintaining identical functionality
      // The extracted handler handles:
      // - Legacy and new handoff data formats
      // - Frontend notifications (handoff_started, handoff_complete, handoff_failed)
      // - Voice switching with VoiceManager
      // - Persona and bundle runtime updates
      // - State sync and validation

      // ===============================================
      // STEP 6: CREATE VOICE AGENT
      // ===============================================
      diag.entry('Step 6: Creating VoiceAgent');
      const voiceAgent = await VoiceAgent.create(sessionPersona);
      voiceAgent.setSession(session);
      voiceAgent.setRoom(ctx.room); // For sending celebration events to frontend

      // Assign to reference for use in async event handlers (handoffs)
      voiceAgentRef = voiceAgent;

      // Initialize bundle runtime for rich persona content
      await voiceAgent.initializeBundleRuntime();
      const bundleRuntime = voiceAgent.getBundleRuntime();

      // If bundle runtime is available, sync relationship state from user profile
      if (bundleRuntime && userData.bundleRuntimeState) {
        bundleRuntime.updateState({
          relationshipTurns: userData.bundleRuntimeState.relationshipTurns,
          sessionCount: services.userProfile?.totalConversations || 0,
          userName: userData.name,
        });
        diag.entry('Bundle runtime synced', {
          personaId: sessionPersona.id,
          relationshipTurns: userData.bundleRuntimeState.relationshipTurns,
          relationshipStage: bundleRuntime.getRelationshipStageName(),
        });
      }

      // DEBUG: Log tool context to verify tools are registered
      const toolNames = Object.keys(voiceAgent.toolCtx || {});
      diag.tool('Tools registered with agent', {
        toolCount: toolNames.length,
        hasPlayMusic: toolNames.includes('playMusic'),
        hasPauseMusic: toolNames.includes('pauseMusic'),
        sampleTools: toolNames.slice(0, 10).join(', '),
      });

      diag.entry(`${sessionPersona.name} agent ready`);

      // ===============================================
      // STEP 7: CONNECT AND START
      // ===============================================
      await ctx.connect();
      const participant = await ctx.waitForParticipant();
      // NOTE: Removed artificial 500ms delay - was causing unnecessary latency!

      // Check if this is a phone call or web connection
      // Web connections have source: 'web' in metadata, phone calls have source: 'phone' or 'sip'
      const jobMetadata = ctx.job?.metadata || '';
      const isWebConnection = jobMetadata.includes('"source":"web"');
      const isPhoneCall =
        !isWebConnection &&
        (participant.identity?.includes('phone') ||
          participant.identity?.includes('sip') ||
          jobMetadata.includes('"source":"phone"'));

      // ===============================================
      // STEP 7a: INITIALIZE MUSIC PLAYER (BEFORE session.start!)
      // ===============================================
      // CRITICAL: Initialize music player BEFORE session.start() to prevent race conditions.
      // If we wait until after session.start(), the agent could try to play music
      // before the music player is ready, causing silent "simulation mode" playback.
      const { isMusicEnabled } = await import('../config/environment.js');
      if (ctx.room && isMusicEnabled()) {
        try {
          const { initializeMusicPlayer, getMusicPlayer, getAmbientMusicEndedPhrase } =
            await import('../audio/index.js');
          // Pass the agent session for proper audio mixing with voice
          await initializeMusicPlayer(ctx.room, session);

          // Set up callback for when ambient music ends - agent comes back in
          const player = getMusicPlayer();
          player.setOnTrackEndedCallback((track, wasAmbient) => {
            if (wasAmbient) {
              // Ambient music ended - agent acknowledges and comes back
              const comeBackPhrase = getAmbientMusicEndedPhrase(sessionPersona.id);
              diag.state('Ambient music ended, agent coming back', { track: track.name });

              try {
                session.say(comeBackPhrase, { allowInterruptions: true });
              } catch (e) {
                diag.warn('Failed to say music-ended phrase', { error: String(e) });
              }
            }
          });

          // 🎤 Set up callback for "Wait for it..." mid-song moments
          // These make the DJ feel alive - like they're enjoying the music with you!
          player.setOnMidSongMomentCallback((track, momentType) => {
            void (async () => {
              try {
                const { getMidSongMomentPhrase } = await import('../audio/ambient-music.js');
                const phrase = getMidSongMomentPhrase(momentType, track.name, sessionPersona.id);

                diag.state('🎤 Mid-song moment!', {
                  track: track.name,
                  momentType,
                  phrase: phrase.slice(0, 50),
                });

                // Speak the interjection - brief and natural!
                session.say(phrase, { allowInterruptions: true });
              } catch (e) {
                diag.warn('Failed to speak mid-song moment', { error: String(e) });
              }
            })();
          });

          // ✨ Set up callback for music state changes - notify frontend AND do DJ-style interactions!
          // Track previous state to detect unexpected stops
          let lastMusicState = 'idle';
          let lastTrackName: string | undefined;
          
          // 🎧 DJ ENGAGEMENT TRACKING - for "more than human" music experience
          let musicPlaybackStartTime: number | null = null;
          let lastAppreciationTime: number | null = null;
          let lastReadTheRoomTime: number | null = null;
          let appreciationTimer: NodeJS.Timeout | null = null;
          let readTheRoomTimer: NodeJS.Timeout | null = null;
          
          // Cleanup function for timers
          const clearMusicTimers = () => {
            if (appreciationTimer) clearInterval(appreciationTimer);
            if (readTheRoomTimer) clearInterval(readTheRoomTimer);
            appreciationTimer = null;
            readTheRoomTimer = null;
          };

          player.setOnMusicStateChangeCallback((state, track, isAmbient) => {
            void (async () => {
              diag.state('Music state changed', {
                state,
                previousState: lastMusicState,
                track: track?.name,
                isAmbient,
              });

              // 🎧 DJ-STYLE CROSSFADE: When music is CHANGING, speak a transition phrase!
              // This is the magic moment where Ferni acts like a real DJ switching tracks
              if (state === 'changing' && !isAmbient) {
                try {
                  const { getDJTrackChangePhrase } = await import('../audio/ambient-music.js');
                  const currentTrack = track
                    ? { name: track.name, artist: track.artist }
                    : undefined;
                  const transitionPhrase = getDJTrackChangePhrase(
                    currentTrack,
                    undefined, // New track name not known yet
                    sessionPersona.id
                  );

                  diag.state('🎧 DJ crossfade - speaking transition phrase', {
                    currentTrack: track?.name,
                    phrase: transitionPhrase.slice(0, 50),
                  });

                  // Speak the transition - this happens DURING the crossfade!
                  // The music player waits 1.5s during crossfade for this phrase
                  session.say(transitionPhrase, { allowInterruptions: false });
                } catch (e) {
                  diag.warn('Failed to speak DJ crossfade phrase', { error: String(e) });
                }
              }

              // 🎧 DJ-STYLE OUTRO: When music is FADING (not ended), speak over it like a real DJ!
              // This creates that professional radio/DJ feel where the host talks as the track winds down
              if (state === 'fading' && !isAmbient && track) {
                try {
                  // Dynamic import to avoid circular dependency
                  const { getDJOutroPhrase } = await import('../audio/ambient-music.js');
                  const djOutro = getDJOutroPhrase(track.name, track.artist, sessionPersona.id);

                  diag.state('🎧 DJ outro - speaking over fading music', {
                    track: track.name,
                    phrase: djOutro.slice(0, 50),
                  });

                  // Speak the outro - the music is still playing but fading!
                  // This is the magic moment where we feel like a real DJ
                  session.say(djOutro, { allowInterruptions: true });
                } catch (e) {
                  diag.warn('Failed to speak DJ outro', { error: String(e) });
                }
              }

              // 🎧 UNEXPECTED STOP: Music stopped/paused without fading first
              // This means it crashed, network dropped, or user stopped it manually
              // The agent should acknowledge this naturally
              // NOTE: Don't speak if we're in a crossfade (changing state) - that's intentional!
              const isUnexpectedStop =
                (state === 'stopped' || state === 'paused') &&
                !isAmbient &&
                lastMusicState === 'playing'; // Only if it was actively playing (not fading, changing, etc.)

              if (isUnexpectedStop) {
                // Only speak if music was actually playing (not if we just connected)
                // And don't speak if we already did a DJ outro (lastMusicState would be 'fading')
                // And don't speak if we're changing tracks (lastMusicState would be 'changing')
                try {
                  const { getMusicStoppedPhrase } = await import('../audio/ambient-music.js');
                  const stoppedPhrase = getMusicStoppedPhrase(
                    sessionPersona.id,
                    state === 'paused'
                  );

                  diag.state('🎧 Music unexpectedly stopped', {
                    track: lastTrackName,
                    newState: state,
                    wasPaused: state === 'paused',
                  });

                  session.say(stoppedPhrase, { allowInterruptions: true });
                } catch (e) {
                  diag.warn('Failed to speak music-stopped phrase', { error: String(e) });
                }
              }

              // Update tracking state
              lastMusicState = state;
              lastTrackName = track?.name;

              // =====================================================
              // 🎧 DJ ENGAGEMENT FEATURES - Make Ferni feel human!
              // =====================================================
              
              // When music STARTS playing, set up appreciation & engagement timers
              if (state === 'playing' && !isAmbient && track) {
                musicPlaybackStartTime = Date.now();
                lastAppreciationTime = null;
                lastReadTheRoomTime = null;
                
                // Clear any existing timers
                clearMusicTimers();
                
                // 🎵 MUSIC APPRECIATION: Random comments during playback
                // Like a real DJ who's vibing with the music
                appreciationTimer = setInterval(async () => {
                  try {
                    const { getMusicAppreciationComment, getMusicElementAppreciation } = 
                      await import('../services/dj-service.js');
                    
                    // 30% chance of appreciation comment every 15-25 seconds
                    const now = Date.now();
                    const timeSinceStart = (now - (musicPlaybackStartTime || now)) / 1000;
                    const timeSinceLastAppreciation = lastAppreciationTime 
                      ? (now - lastAppreciationTime) / 1000 
                      : timeSinceStart;
                    
                    // Only appreciate if enough time has passed and we're still playing
                    if (timeSinceLastAppreciation > 15 && Math.random() < 0.3) {
                      // Randomly choose between general appreciation or element-specific
                      const comment = Math.random() < 0.7 
                        ? getMusicAppreciationComment(sessionPersona.id, track)
                        : getMusicElementAppreciation(sessionPersona.id);
                      
                      if (comment) {
                        diag.state('🎧 DJ appreciation comment', { 
                          comment: comment.slice(0, 50),
                          timeSinceStart: Math.round(timeSinceStart),
                        });
                        session.say(comment, { allowInterruptions: true });
                        lastAppreciationTime = now;
                      }
                    }
                  } catch (e) {
                    diag.warn('Failed to generate appreciation', { error: String(e) });
                  }
                }, 10000); // Check every 10 seconds
                
                // 🎯 READ THE ROOM: Check if user is engaged with the music
                readTheRoomTimer = setInterval(async () => {
                  try {
                    const { getReadTheRoomAction } = await import('../services/dj-service.js');
                    
                    const now = Date.now();
                    const timeSinceStart = (now - (musicPlaybackStartTime || now)) / 1000;
                    const timeSinceLastCheck = lastReadTheRoomTime 
                      ? (now - lastReadTheRoomTime) / 1000 
                      : timeSinceStart;
                    
                    // Only check every 60+ seconds
                    if (timeSinceLastCheck > 60) {
                      const action = getReadTheRoomAction({
                        musicHasBeenPlayingFor: timeSinceStart,
                        userIsSilentDuringMusic: true, // We don't have VAD data here, assume silent
                      }, sessionPersona.id);
                      
                      if (action?.phrase && action.action !== 'continue') {
                        diag.state('🎧 Read the room check', { 
                          action: action.action,
                          timePlaying: Math.round(timeSinceStart),
                        });
                        session.say(action.phrase, { allowInterruptions: true });
                        lastReadTheRoomTime = now;
                      }
                    }
                  } catch (e) {
                    diag.warn('Failed read-the-room check', { error: String(e) });
                  }
                }, 30000); // Check every 30 seconds
              }
              
              // Clear timers when music stops
              if (state === 'stopped' || state === 'paused' || state === 'idle') {
                clearMusicTimers();
                musicPlaybackStartTime = null;
              }

              // Notify frontend for avatar dancing
              // All states are now supported: playing, ducking, fading, changing, paused, stopped, idle
              try {
                const { getFrontendPublisher } = await import('./realtime/index.js');
                const publisher = getFrontendPublisher();
                if (publisher && ctx.room) {
                  // Convert null track to undefined for sendMusicState
                  const trackInfo = track ? { name: track.name, artist: track.artist } : undefined;
                  await publisher.sendMusicState(state, trackInfo, isAmbient);
                }
              } catch (pubError) {
                diag.warn('Failed to publish music state', { error: String(pubError) });
              }
            })();
          });

          diag.state('Music player initialized (before session.start)');
        } catch (musicError) {
          diag.warn('Music player init failed (non-fatal)', { error: String(musicError) });
        }
      } else if (!isMusicEnabled()) {
        diag.session('Music player skipped (MUSIC_ENABLED not set)');
      }

      diag.state('Starting session', {
        isPhoneCall,
        isWebConnection,
        participantId: participant.identity,
      });

      await session.start({
        agent: voiceAgent,
        room: ctx.room,
        // Only use telephony noise cancellation for phone calls
        // Web browsers handle their own echo cancellation via audioCaptureDefaults
        inputOptions: isPhoneCall
          ? {
              noiseCancellation: TelephonyBackgroundVoiceCancellation(),
            }
          : undefined,
      });

      diag.state('Session started', { isPhoneCall, hasNoiseCancellation: isPhoneCall });

      // ===============================================
      // STEP 7b: INITIALIZE FRONTEND PUBLISHER
      // ===============================================
      // Centralized real-time communication with the frontend
      const { initializeFrontendPublisher, getFrontendPublisher } =
        await import('./realtime/index.js');
      const frontendPublisher = initializeFrontendPublisher(ctx.room);
      diag.state('Frontend publisher initialized');

      // ===============================================
      // STEP 6b: INITIALIZE ENGAGEMENT DATA SENDER
      // ===============================================
      // Wire up real-time engagement data to frontend
      try {
        const engagementDataSender = getEngagementDataSender();
        engagementDataSender.setRoom(
          ctx.room as Parameters<typeof engagementDataSender.setRoom>[0]
        );

        // Send initial engagement data to frontend
        if (userId) {
          await engagementDataSender.sendEngagementData(userId);
          diag.state('Engagement data sent to frontend');
        }
      } catch (engageError) {
        diag.warn('Engagement data init failed (non-fatal)', { error: String(engageError) });
      }

      // ===============================================
      // STEP 6c: INITIALIZE COGNITIVE INTELLIGENCE
      // ===============================================
      try {
        await onCognitiveSessionStart({
          userId: userId || 'anonymous',
          personaId: sessionPersona.id,
          userProfile: services.userProfile,
          sessionId,
        });
        diag.state('Cognitive session initialized');
      } catch (cogError) {
        diag.warn('Cognitive session init failed (non-fatal)', { error: String(cogError) });
      }

      // ===============================================
      // STEP 6d: INITIALIZE GAME ENGINE
      // ===============================================
      // Load persisted game memory for "more than human" features
      try {
        const { getGameEngine } = await import('../services/games/index.js');
        const engine = getGameEngine(sessionPersona.id);
        if (userId) {
          await engine.initializeForUser(userId);
          diag.state('Game engine initialized', {
            totalGames: engine.getGameMemory()?.totalGamesPlayed || 0,
            bestStreak: engine.getGameMemory()?.bestStreak || 0,
          });
        }
      } catch (gameError) {
        diag.warn('Game engine init failed (non-fatal)', { error: String(gameError) });
      }

      // ===============================================
      // STEP 6e: INITIALIZE SIMPLE UTILITIES
      // ===============================================
      // "Better than human" everyday helpers (timers, tips, timezone, etc.)
      // Includes: voice callbacks, cross-session memory, proactive suggestions
      let utilitiesCleanup: (() => Promise<void>) | undefined;
      let utilitiesProactiveOpener: string | null = null;
      if (userId) {
        try {
          const utilitiesResult = await initializeUtilitiesIntegration({
            session,
            userId,
            enableProactive: isReturningUser, // Only proactive for returning users
            enableVoiceCallbacks: true,
          });
          utilitiesCleanup = utilitiesResult.cleanup;
          utilitiesProactiveOpener = utilitiesResult.proactiveOpener;
          diag.state('Simple utilities initialized', {
            hasProactiveOpener: !!utilitiesProactiveOpener,
          });
        } catch (utilError) {
          diag.warn('Utilities init failed (non-fatal)', { error: String(utilError) });
        }
      }

      // ===============================================
      // STEP 8: GENERATE AND SAY GREETING
      // ===============================================
      diag.session('Step 8: Generating greeting');

      let greeting: string;

      // Load persona-specific memories for memory-enhanced greetings
      let personaMemories: PersonaMemoryForGreeting[] = [];
      if (isReturningUser && services.userProfile?.id && sessionPersona?.id) {
        try {
          const normalizedId = normalizePersonaId(sessionPersona.id);
          if (normalizedId) {
            const memoryResult = await getPersonaMemories(
              services.userProfile.id,
              normalizedId,
              userData.name || services.userProfile.name
            );
            if (memoryResult && memoryResult.memories.length > 0) {
              personaMemories = memoryResult.memories.map((m) => ({
                type: m.type,
                name: m.name,
                details: m.details,
                sentiment: m.sentiment,
                // Add persona-specific fields if present
                ...('ticker' in m && { ticker: (m as { ticker?: string }).ticker }),
                ...('date' in m && { date: (m as { date?: string }).date }),
                ...('targetAmount' in m && {
                  targetAmount: (m as { targetAmount?: number }).targetAmount,
                }),
                ...('currentAmount' in m && {
                  currentAmount: (m as { currentAmount?: number }).currentAmount,
                }),
                ...('reason' in m && { reason: (m as { reason?: string }).reason }),
              }));
              diag.session('Loaded persona memories for greeting', {
                personaId: normalizedId,
                memoryCount: personaMemories.length,
              });
            }
          }
        } catch (e) {
          diag.warn('Failed to load persona memories for greeting', { error: String(e) });
        }
      }

      // Try bundle runtime for enhanced greeting first
      if (bundleRuntime) {
        // Get time-of-day aware greeting from bundle
        const timeGreeting = bundleRuntime.getTimeOfDayGreeting();
        const relationshipStage = bundleRuntime.getCurrentRelationshipStage();
        const stagePhrases = relationshipStage?.phrases?.greetings;

        if (stagePhrases && stagePhrases.length > 0) {
          // Use relationship-stage appropriate greeting
          let bundleGreeting = stagePhrases[Math.floor(Math.random() * stagePhrases.length)];

          // Substitute {name} placeholder if we have a name
          if (userData.name) {
            bundleGreeting = bundleGreeting.replace(/\{name\}/g, userData.name);
          } else {
            // Remove name placeholders if no name
            bundleGreeting = bundleGreeting.replace(/\{name\}[,!]?\s*/g, '');
          }

          greeting = bundleGreeting;
          diag.session('Using bundle relationship-stage greeting', {
            stage: bundleRuntime.getRelationshipStageName(),
            hasTimeGreeting: !!timeGreeting,
          });
        } else if (timeGreeting) {
          greeting = timeGreeting;
          diag.session('Using bundle time-of-day greeting');
        } else {
          // Fall back to standard greeting generator with persona memories + bundleRuntime
          // Include proactive opener context for intelligent greetings

          // Get open thread conversation starter for proactive greeting
          let threadStarter: string | undefined;
          const openThreads = services.getOpenThreads();
          if (openThreads.length > 0 && isReturningUser) {
            threadStarter = services.getThreadConversationStarter() || undefined;
            if (threadStarter) {
              diag.session('Found cross-session thread to surface', {
                threadCount: openThreads.length,
                starter: threadStarter.slice(0, 50),
              });
            }
          }

          // Get open questions from threads
          const openQuestions = openThreads.flatMap((t) => t.questionsToAnswer || []).slice(0, 3);

          greeting = await generateGreeting(sessionPersona, {
            isReturningUser,
            userName: userData.name,
            lastConversationSummary: services.userProfile?.lastConversationSummary,
            personaMemories, // Pass persona-specific memories for memory-enhanced greetings
            bundleRuntime, // Pass runtime for alive greetings
            relationshipStage: services.userProfile?.relationshipStage as
              | 'stranger'
              | 'acquaintance'
              | 'friend'
              | 'trusted_advisor'
              | undefined,
            usedGreetings: services.userProfile?.humanizingState?.usedGreetings,
            // Proactive opener context for returning users
            lastConversationDate: services.userProfile?.lastContact
              ? new Date(services.userProfile.lastContact)
              : undefined,
            goals: services.userProfile?.goals,
            primaryConcerns: services.userProfile?.primaryConcerns,
            openQuestions, // Questions from cross-session threads
            // Convert UserProfile.lifeEvents to shared/life-events format for greeting integration
            lifeEvents: services.userProfile?.lifeEvents
              ? convertFromUserProfileEvents(services.userProfile.lifeEvents)
              : undefined,
            conversationCount: services.userProfile?.totalConversations,
          });

          // Track if greeting referenced last conversation (for repetition prevention)
          if (greeting.toLowerCase().includes('last time')) {
            userData.hasReferencedLastConversation = true;
          }

          // If we have a thread starter and didn't use it in greeting, append it
          if (threadStarter && !userData.hasReferencedLastConversation) {
            greeting = `${greeting} <break time="400ms"/> ${threadStarter}`;
            userData.hasReferencedLastConversation = true;
          }
        }

        // Apply time-of-day modifiers to greeting delivery
        const timeModifiers = bundleRuntime.getTimeOfDayModifiers();
        if (timeModifiers.volume === 'soft') {
          greeting = `<volume level="soft"/>${greeting}`;
        }
      } else {
        // Standard greeting without bundle - include persona memories and proactive context

        // Get open thread conversation starter for proactive greeting
        let threadStarter: string | undefined;
        const openThreads = services.getOpenThreads();
        if (openThreads.length > 0 && isReturningUser) {
          threadStarter = services.getThreadConversationStarter() || undefined;
        }

        // Get open questions from threads
        const openQuestions = openThreads.flatMap((t) => t.questionsToAnswer || []).slice(0, 3);

        // Get high-priority proactive insights for check-ins
        let proactiveInsight: string | undefined;
        let proactiveInsightId: string | undefined;
        if (isReturningUser) {
          try {
            const insightResult = await services.getProactiveInsights();
            if (insightResult.highPriorityCount > 0 && insightResult.suggestedConversationStarter) {
              // Only use proactive insight if no thread starter (avoid double-starter)
              if (!threadStarter) {
                proactiveInsight = insightResult.suggestedConversationStarter;
                proactiveInsightId = insightResult.suggestedInsightId;
              }
            }
          } catch (e) {
            log().debug({ error: String(e) }, 'Proactive insights fetch failed (non-blocking)');
          }
        }

        // Get emotional memory check-in suggestions for returning users
        let emotionalCheckIn: string | undefined;
        if (isReturningUser && !threadStarter && !proactiveInsight) {
          try {
            const checkIns = services.emotionalMemory.getCheckInSuggestions();
            if (checkIns.length > 0) {
              const topCheckIn = checkIns[0];
              // Mark as followed up so we don't repeat
              services.emotionalMemory.markFollowedUp(topCheckIn.moment.id);
              emotionalCheckIn = topCheckIn.suggestedOpener;
              diag.session('Using emotional memory check-in', {
                type: topCheckIn.type,
                reference: topCheckIn.reference,
              });
            }
          } catch (e) {
            log().debug({ error: String(e) }, 'Emotional check-in fetch failed (non-blocking)');
          }
        }

        greeting = await generateGreeting(sessionPersona, {
          isReturningUser,
          userName: userData.name,
          lastConversationSummary: services.userProfile?.lastConversationSummary,
          personaMemories, // Pass persona-specific memories for memory-enhanced greetings
          relationshipStage: services.userProfile?.relationshipStage as
            | 'stranger'
            | 'acquaintance'
            | 'friend'
            | 'trusted_advisor'
            | undefined,
          usedGreetings: services.userProfile?.humanizingState?.usedGreetings,
          // Proactive opener context for returning users
          lastConversationDate: services.userProfile?.lastContact
            ? new Date(services.userProfile.lastContact)
            : undefined,
          goals: services.userProfile?.goals,
          primaryConcerns: services.userProfile?.primaryConcerns,
          openQuestions, // Questions from cross-session threads
          // Convert UserProfile.lifeEvents to shared/life-events format for greeting integration
          lifeEvents: services.userProfile?.lifeEvents
            ? convertFromUserProfileEvents(services.userProfile.lifeEvents)
            : undefined,
          conversationCount: services.userProfile?.totalConversations,
        });

        // Track if greeting referenced last conversation (for repetition prevention)
        if (greeting.toLowerCase().includes('last time')) {
          userData.hasReferencedLastConversation = true;
        }

        // If we have a thread starter and didn't use it in greeting, append it
        if (threadStarter && !userData.hasReferencedLastConversation) {
          greeting = `${greeting} <break time="400ms"/> ${threadStarter}`;
          userData.hasReferencedLastConversation = true;
        }

        // If we have an emotional memory check-in, append it
        if (emotionalCheckIn && !userData.hasReferencedLastConversation) {
          greeting = `${greeting} <break time="400ms"/> ${emotionalCheckIn}`;
          userData.hasReferencedLastConversation = true;
        }

        // Or append proactive insight if we have one
        if (proactiveInsight && !threadStarter && !greeting.toLowerCase().includes('checking in')) {
          greeting = `${greeting} <break time="400ms"/> ${proactiveInsight}`;

          // Mark insight as delivered for tracking
          if (proactiveInsightId) {
            services.markInsightDelivered(proactiveInsightId);
            diag.session('Proactive insight delivered', { insightId: proactiveInsightId });
          }
        }
      }

      // ===============================================
      // STEP 8b: WEAVE IN UTILITIES PROACTIVE OPENER
      // ===============================================
      // Add "better than human" utility suggestions (e.g., "Want your usual tea timer?")
      if (utilitiesProactiveOpener) {
        greeting = weaveProactiveIntoGreeting(greeting, utilitiesProactiveOpener, 0.3);
        diag.session('Wove in utilities proactive opener', {
          opener: utilitiesProactiveOpener.slice(0, 50),
        });
      }

      // ===============================================
      // STEP 8c: CROSS-SESSION MUSIC MEMORY CALLBACK
      // ===============================================
      // Reference their favorite music from past sessions (DJ memory!)
      if (isReturningUser && services.userProfile?.musicMemory && isMusicEnabled()) {
        try {
          const { getCrossSessionMusicCallback } = await import('../services/dj-service.js');
          const musicCallback = getCrossSessionMusicCallback(
            sessionPersona.id,
            services.userProfile.musicMemory
          );
          
          // 20% chance to mention music preferences in greeting (not too pushy)
          if (musicCallback && Math.random() < 0.2) {
            greeting = `${greeting} <break time="500ms"/> ${musicCallback}`;
            diag.session('Added cross-session music callback', {
              callback: musicCallback.slice(0, 50),
            });
          }
        } catch (e) {
          diag.warn('Cross-session music callback failed', { error: String(e) });
        }
      }

      diag.tts('Generated greeting', {
        greeting: greeting.substring(0, 100) + (greeting.length > 100 ? '...' : ''),
        length: greeting.length,
      });

      const speechContext = services.getSpeechContext(greeting);
      const enhancedGreeting = tagGreeting(greeting, speechContext);

      diag.tts('Enhanced greeting', {
        enhanced: enhancedGreeting.substring(0, 100) + (enhancedGreeting.length > 100 ? '...' : ''),
      });

      try {
        session.say(enhancedGreeting);
        diag.tts('Greeting spoken');

        // Track greeting usage to prevent repetition across sessions
        if (services.userProfile) {
          try {
            const currentState = getHumanizingState(services.userProfile);
            const updatedState = recordGreetingUsage(currentState, greeting);
            const updatedProfile = applyHumanizingStateToProfile(
              services.userProfile,
              updatedState
            );
            services.userProfile = updatedProfile;
            diag.session('Greeting recorded for repetition prevention', {
              greetingsTracked: updatedState.usedGreetings.length,
            });
          } catch (greetingTrackErr) {
            diag.warn('Failed to track greeting usage', { error: String(greetingTrackErr) });
          }
        }
      } catch (e) {
        diag.error('Greeting failed', { error: String(e) });
      }

      services.addTurn('assistant', greeting);

      diag.section('SESSION INITIALIZED');
      diag.session('Session ready', {
        sessionId,
        persona: sessionPersona.id,
        personaName: sessionPersona.name,
        userName: userData.name,
        isReturningUser,
      });

      // ===============================================
      // STEP 8b: LISTEN FOR FRONTEND HANDOFF REQUESTS
      // ===============================================
      // When user clicks a persona in the UI, handle it seamlessly
      // FIX BUG #15: Store handler reference for cleanup on disconnect
      const dataReceivedHandler = async (data: Uint8Array, participant?: { identity: string }) => {
        const ourIdentity = ctx.room.localParticipant?.identity;
        const theirIdentity = participant?.identity;

        // Enhanced debugging for handoff requests
        logger.info(
          { ourIdentity, theirIdentity, dataLength: data?.length },
          '📩 Data received from participant'
        );

        // Only process messages from our user (not from ourselves)
        if (!participant) {
          logger.warn('🚫 Ignoring message: no participant info attached');
          return;
        }
        if (theirIdentity === ourIdentity) {
          logger.debug('Ignoring message: from ourselves (agent)');
          return;
        }

        try {
          const rawText = new TextDecoder().decode(data);
          logger.info({ rawText: rawText.slice(0, 200) }, '📝 Raw data message received');

          const message = JSON.parse(rawText);
          logger.info(
            { messageType: message.type, target: message.target, timestamp: message.timestamp },
            '📬 Parsed data message'
          );

          if (message.type === 'handoff_request') {
            const targetPersona = message.target;
            logger.info({ targetPersona }, '🎯 User requested handoff via UI');
            diag.entry(`🎯 User requested handoff via UI to: ${targetPersona}`);

            // =====================================================
            // FIX BUG #53: Validate target persona ID (security)
            // =====================================================
            // Get handoff tools using the new factory
            const handoffToolSet = await createHandoffTools();

            // Map persona IDs to canonical IDs for lookup
            const personaToCanonical: Record<string, string> = {
              // Canonical IDs
              ferni: 'ferni',
              'peter-john': 'peter-john',
              'alex-chen': 'alex-chen',
              'maya-santos': 'maya-santos',
              'jordan-taylor': 'jordan-taylor',
              'nayan-patel': 'nayan-patel',
              // Legacy aliases (for backward compatibility)
              'jack-b': 'ferni',
              'comm-specialist': 'alex-chen',
              'spend-save': 'maya-santos',
              'event-planner': 'jordan-taylor',
              // Short names
              alex: 'alex-chen',
              maya: 'maya-santos',
              jordan: 'jordan-taylor',
              peter: 'peter-john',
              nayan: 'nayan-patel',
            };

            const canonicalId = personaToCanonical[targetPersona] || targetPersona;
            // FIX BUG: Tool names use first name only (e.g., handoffToNayan not handoffToNayanPatel)
            // The factory generates tools from agent.name.split(' ')[0], not from agent.id
            const displayName = canonicalId.split('-')[0];
            const toolName = `handoffTo${displayName.charAt(0).toUpperCase()}${displayName.slice(1)}`;
            const toolNameLower = toolName.toLowerCase();
            logger.info(
              {
                targetPersona,
                canonicalId,
                toolName,
                availableTools: Array.from(handoffToolSet.toolsByName.keys()),
              },
              '🔧 Looking up handoff tool'
            );

            // =====================================================
            // FIX BUG #17: Send acknowledgment to frontend
            // =====================================================
            const sendAck = async (success: boolean, error?: string) => {
              try {
                const ackMessage = JSON.stringify({
                  type: 'handoff_acknowledged',
                  target: targetPersona,
                  success,
                  error,
                  timestamp: Date.now(),
                });
                await ctx.room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
                  reliable: true,
                });
              } catch (ackErr) {
                logger.warn({ error: String(ackErr) }, 'Failed to send handoff ack');
              }
            };

            // =====================================================
            // FIX BUG #13: Send handoff_failed on errors
            // =====================================================
            const sendFailure = async (errorMsg: string) => {
              try {
                const failureMessage = JSON.stringify({
                  type: 'handoff_failed',
                  newAgent: targetPersona,
                  previousAgent: getCurrentAgent(),
                  error: errorMsg,
                  timestamp: Date.now(),
                });
                await ctx.room.localParticipant?.publishData(
                  new TextEncoder().encode(failureMessage),
                  { reliable: true }
                );
              } catch (failErr) {
                logger.warn({ error: String(failErr) }, 'Failed to send handoff_failed');
              }
            };

            // Check if we have a valid handoff target
            // FIX BUG: toolsByName uses lowercase keys, so lookup with toolNameLower
            const toolDefinition =
              handoffToolSet.toolsByAgentId.get(canonicalId) ||
              handoffToolSet.toolsByName.get(toolNameLower);

            if (toolDefinition) {
              logger.info(
                { targetPersona, toolName, currentAgent: getCurrentAgent() },
                '🔄 Executing user-requested handoff'
              );

              try {
                // Use the new executeHandoff function
                const result = await executeHandoff(canonicalId, 'User requested via UI tap');

                logger.info({ result: JSON.stringify(result).slice(0, 500) }, '📦 Handoff result');

                if (!result.success) {
                  logger.warn(
                    { error: result.error, rateLimited: result.rateLimited },
                    '⚠️ Handoff blocked'
                  );
                  // FIX BUG #13 & #17: Send failure/ack for blocked handoffs
                  await sendAck(false, result.error || 'Handoff failed');
                  if (!result.rateLimited) {
                    await sendFailure(result.error || 'Handoff failed');
                  }
                } else {
                  logger.info({ newAgent: result.targetAgent }, '✅ Handoff executed');
                  // FIX BUG #17: Send success ack
                  await sendAck(true);

                  // CRITICAL: Inject identity into LLM context
                  // The tool returned instructions but the LLM never saw them
                  // We need to inject a system message to enforce the identity switch
                  if (result.targetAgent) {
                    try {
                      // Get the new persona's full system prompt
                      const { getPersonaAsync } = await import('../personas/index.js');
                      const newPersona = await getPersonaAsync(result.targetAgent);

                      if (newPersona) {
                        // Update the voiceAgent's persona reference AND instructions
                        // setPersona() internally updates _instructions with the new systemPrompt
                        if (voiceAgentRef) {
                          voiceAgentRef.setPersona(newPersona);
                          diag.entry(
                            `🎭 VoiceAgent persona AND instructions updated to ${newPersona.name}`
                          );
                        }

                        diag.entry(`🎭 Identity switch complete for ${newPersona.name}`);
                      }
                    } catch (identityErr) {
                      logger.warn(
                        { error: String(identityErr) },
                        'Identity injection failed (non-fatal)'
                      );
                    }
                  }
                }
              } catch (handoffErr) {
                logger.error({ error: String(handoffErr) }, '❌ Handoff execution failed');
                // FIX BUG #13: Send handoff_failed when execution throws
                await sendFailure(String(handoffErr));
              }
            } else {
              logger.warn(
                { targetPersona, toolName },
                '⚠️ Unknown handoff target or tool not found'
              );
              // FIX BUG #53: Send failure for invalid persona IDs
              await sendAck(false, `Unknown persona: ${targetPersona}`);
              await sendFailure(`Invalid handoff target: ${targetPersona}`);
            }
          }

          // =====================================================
          // 🎮 GAME START REQUEST (from UI game picker)
          // =====================================================
          if (message.type === 'game_start_request') {
            const gameType = message.gameType;
            logger.info({ gameType }, '🎮 User requested game start via UI');

            try {
              const { getGameEngine } = await import('../services/games/index.js');
              const engine = getGameEngine(sessionPersona.id);

              // Start the game - returns welcome message
              const welcomeMessage = await engine.startGame(gameType);
              logger.info({ gameType, welcomeMessage }, '🎮 Game engine returned welcome message');

              // 🔊 CRITICAL: Make the agent actually SPEAK the welcome message!
              // This is what starts the game from the user's perspective
              if (welcomeMessage && session) {
                logger.info({ welcomeMessage }, '🎮 Agent speaking game welcome...');

                // Use generateReply to make the agent speak
                await session.generateReply({
                  instructions: `You are starting a music game called "${gameType}". 
                  Say the following welcome message naturally, with enthusiasm:
                  
                  "${welcomeMessage}"
                  
                  After speaking, wait for the user's response.`,
                });

                logger.info('🎮 Agent spoke welcome message');
              }

              // Send ack to frontend
              const ackMessage = JSON.stringify({
                type: 'game_start_ack',
                gameType,
                success: true,
                message: welcomeMessage,
                timestamp: Date.now(),
              });
              await ctx.room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
                reliable: true,
              });

              logger.info({ gameType }, '🎮 Game started successfully');
            } catch (gameErr) {
              logger.error({ error: String(gameErr), gameType }, '❌ Game start failed');

              // Make agent acknowledge the error gracefully
              if (session) {
                await session.generateReply({
                  instructions: `Apologize briefly - there was a technical issue starting the game. 
                  Suggest the user try saying "let's play ${gameType}" instead.`,
                });
              }

              const errorMsg = JSON.stringify({
                type: 'game_start_ack',
                gameType,
                success: false,
                error: String(gameErr),
                timestamp: Date.now(),
              });
              await ctx.room.localParticipant?.publishData(new TextEncoder().encode(errorMsg), {
                reliable: true,
              });
            }
          }
        } catch {
          // Not JSON or not a valid request - this is expected for non-data-channel uses
          // Silently ignore as data channel is used for multiple message types
        }
      };

      // Register the handler (wrap async handler to avoid misused-promises)
      const dataReceivedHandlerWrapper = (data: Uint8Array, participant?: { identity: string }) => {
        void dataReceivedHandler(data, participant);
      };
      ctx.room.on('dataReceived', dataReceivedHandlerWrapper);

      // ===============================================
      // STEP 9: CLEANUP ON DISCONNECT
      // ===============================================
      ctx.room.on('disconnected', () => {
        void (async () => {
          // FIX BUG #15: Remove dataReceived handler to prevent memory leaks
          ctx.room.off('dataReceived', dataReceivedHandlerWrapper);

          // FIX BUG #42: Remove handoffEvents listener to prevent memory leaks
          handoffEvents.off('voiceSwitch', handoffHandler);

          try {
            // End conversation state and get final state for logging
            const finalConvState = endConversationState(sessionId);
            if (finalConvState) {
              diag.session('Conversation state ended', {
                turnCount: finalConvState.flow.turnCount,
                durationMinutes: finalConvState.flow.durationMinutes,
                topicsDiscussed: finalConvState.topic.history.length,
                keyMoments: finalConvState.user.keyMoments.length,
                finalSentiment: finalConvState.emotional.sentiment,
              });
            }

            // End cognitive intelligence session and save learnings
            try {
              const cognitiveResult = await onCognitiveSessionEnd({
                userId: userId || 'anonymous',
                personaId: sessionPersona.id,
                sessionId,
                sessionDurationMs: Date.now() - services.sessionStartTime,
              });
              if (cognitiveResult) {
                diag.session('Cognitive session ended', {
                  approachesUsed: cognitiveResult.approachesUsed,
                  topicsExplained: cognitiveResult.topicsExplained,
                  userStyle: cognitiveResult.userStyle,
                });
              }
            } catch (cogError) {
              diag.warn('Cognitive session end failed (non-fatal)', { error: String(cogError) });
            }

            // Save trust profiles (boundaries, growth, callbacks, etc.)
            if (userId) {
              try {
                await saveTrustProfiles(userId);
                diag.session('Trust profiles saved', { userId });
              } catch (trustErr) {
                diag.warn('Trust profile save failed (non-fatal)', { error: String(trustErr) });
              }
            }

            // Save utility preferences and patterns (timers, tips, timezones, etc.)
            if (utilitiesCleanup) {
              try {
                await utilitiesCleanup();
                diag.session('Utility patterns saved');
              } catch (utilErr) {
                diag.warn('Utility cleanup failed (non-fatal)', { error: String(utilErr) });
              }
            }

            await services.endSession();
            globalSessionServices = undefined;

            // Reset handoff state for next session (via SessionServices now)
            // Note: resetHandoffState/resetMetPersonas are still called for any
            // remaining global state, but primary state is now per-session
            resetHandoffState();
            resetMetPersonas();

            // Shutdown Spotify and music player (only if music was enabled)
            try {
              const { isMusicEnabled } = await import('../config/environment.js');
              if (isMusicEnabled()) {
                const { shutdownSpotify } = await import('../tools/spotify.js');
                shutdownSpotify();
                const { resetMusicPlayer } = await import('../audio/index.js');
                resetMusicPlayer();
                diag.session('Spotify and music player reset');
              }
            } catch (e) {
              log().debug({ error: String(e) }, 'Music cleanup failed (non-fatal)');
            }

            // Flush game memory to storage
            try {
              const { getGameEngine, resetGameEngine } = await import('../services/games/index.js');
              const engine = getGameEngine();
              await engine.flushToStorage();
              resetGameEngine();
              diag.session('Game engine flushed and reset');
            } catch (e) {
              log().debug({ error: String(e) }, 'Game cleanup failed (non-fatal)');
            }

            // Flush optimization data (patterns, feedback)
            try {
              patternAnalyzer.endSession(sessionId);
              autoOptimizer.endSession(sessionId);
              await feedbackCollector.flush();
              diag.session('Optimization data flushed');
            } catch (e) {
              log().debug({ error: String(e) }, 'Optimization flush failed (non-fatal)');
            }

            diag.session('Session cleanup complete');
          } catch (error) {
            diag.error('Session cleanup error', { error: String(error) });
          }
        })();
      });
    } catch (entryError) {
      diag.error('Entry function failed', {
        errorMessage: (entryError as Error).message,
      });
      throw entryError;
    }
  },
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize voice registry and bundles in background
// This starts loading from bundles, with fallbacks available immediately
import { initializeVoiceRegistry } from '../personas/voice-registry.js';

// Fire and forget - initialization happens in background
// Fallbacks are used until bundles are loaded
// NOTE: initializeVoiceRegistry already calls discoverAndLoadBundles internally,
// so we run them sequentially to avoid redundant loading
void (async () => {
  try {
    // Voice registry loads bundles and caches the result
    await initializeVoiceRegistry();
    // This will use the cached result from voice registry
    const bundleResult = await initializeFromBundles();
    if (bundleResult) {
      diag.info('Personas initialized from bundles', {
        loaded: bundleResult.loaded,
        failed: bundleResult.failed,
      });
    }
  } catch (e) {
    diag.warn('Bundle init warning', { error: String(e) });
  }
})();

// ============================================================================
// WORKER STARTUP
// ============================================================================

// Static agent name - persona is selected per-session via dispatch metadata
const agentName = process.env.AGENT_NAME || 'voice-agent';

diag.section('STARTING WORKER');
diag.info('Worker configuration', { defaultPersona: PERSONA.id, agentName });

// ============================================================================
// GRACEFUL SHUTDOWN HANDLER
// ============================================================================

// Handle graceful shutdown - flush all pending data before exit
async function gracefulShutdown(signal: string) {
  diag.info(`Received ${signal}, initiating graceful shutdown...`);

  try {
    // Import and call shutdown services to flush all productivity data
    const { shutdownServices } = await import('../services/index.js');
    await shutdownServices();
    diag.info('Services shutdown complete');
  } catch (error) {
    diag.error('Error during graceful shutdown', { error: String(error) });
  }

  // Give time for final logs
  setTimeout(() => process.exit(0), 500);
}

// Register shutdown handlers
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName,
  })
);

diag.info('CLI.runApp called - worker running');
