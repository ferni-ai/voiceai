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
// CRITICAL: First line of executable code - log before ANY imports
// This helps debug child process import hangs
// Use process.stderr.write for immediate, unbuffered output
// ============================================================================
const _startInfo = JSON.stringify({
  msg: 'MODULE START',
  pid: process.pid,
  isChild: !!process.send,
  ppid: process.ppid,
  time: new Date().toISOString(),
});
process.stderr.write(`[voice-agent] ${_startInfo}\n`);

// ============================================================================
// EARLY STARTUP LOGGING
// ============================================================================
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
import { TextEncoder } from 'node:util';
import { tagTextWithSsmlPersonaAware } from '../ssml/index.js';
import { DEBUG_STARTUP, earlyLog } from './shared/early-logger.js';

process.stderr.write(`[voice-agent] early-logger ready (pid=${process.pid})\n`);

earlyLog.info('=== VOICE-AGENT MODULE LOADING ===', {
  nodeVersion: process.version,
  personaId: process.env['PERSONA_ID'] || '(default)',
});

if (DEBUG_STARTUP) {
  process.stderr.write(`[voice-agent] core imports complete (pid=${process.pid})\n`);
}
// Voice authentication - speaker change detection (available for future integration)
import { getSpeakerChangeDetector } from '../services/voice-speaker-change.js';

// Shared Agent Utilities (used by ALL agents)
import { PROCESSING_TIMEOUTS } from './shared/constants.js';
import { hasSsmlTags, startHealthCheckServer, type UserData } from './shared/index.js';

// Persona System
import { getPersonaAsync, initializeFromBundles, type PersonaConfig } from '../personas/index.js';

// Response naturalness - acknowledgments, thinking fillers, catchphrases
import { getThinkingFiller, resetCatchphraseTracking } from '../speech/response-naturalness.js';

// Graceful error handling for dead air prevention
import { getGracefulErrorResponse } from '../intelligence/conversation-quality.js';

// Meaningful Silence System - SilenceContext imported for session state handlers
// (full meaningful-silence imports are in session-state-handler.ts)

// Services Bootstrap
import { createSessionServices, initializeServices } from '../services/index.js';

// First Taste Trial - "Better than Human" free trial experience
import {
  checkTrialStatus,
  isEligibleForTrial,
  recordTrialTime,
  startTrial,
  type TrialCheckResult,
} from '../services/first-taste-trial.js';

// Adaptive SSML
import { applyPhasePersonality, tagGreeting } from '../speech/adaptive-ssml.js';

// Conversation Manager
import { getConversationManager } from '../services/conversation-manager.js';

// Trust Systems - "Better than human" trust profile loading and recording
import {
  onSessionStart as loadTrustProfiles,
  onSessionEnd as saveTrustProfiles,
  // Phase 24: Voice Prosody Learning - BETTER-THAN-HUMAN baseline building
  recordVoiceSample,
} from '../services/trust-systems/index.js';

// Simple Utilities - "Better than human" everyday helpers (timers, tips, timezone, etc.)
import { initializeUtilitiesIntegration } from './shared/utilities-integration.js';

// Cognitive Intelligence - Session lifecycle hooks for persistent learning
import {
  onCognitiveSessionEnd,
  onCognitiveSessionStart,
} from '../services/cognitive-session-hooks.js';

// 🎧 DJ Integration - Radio show experience (intros, outros, music moments)
import { getDJIntegration } from './dj-integration.js';

// 🎧 DJ Booth - Audio-level orchestration (ducking, fading, timing)
// This handles the "sound engineering" while DJ Integration handles "what to say"
import { getDJBooth, resetDJBooth } from '../audio/index.js';

// Conversation State - Shared context for human-level tool orchestration
import {
  endConversation as endConversationState,
  getConversationState,
} from '../services/conversation-state.js';

// Tools - Registry-based system
import {
  buildAgentTools,
  buildEssentialTools,
  getLoadedDomains,
  initializeTools,
  isToolRegistryInitialized,
  loadToolDomainsLazy,
  type Tool,
} from '../tools/index.js';

// Performance instrumentation
import { perfInstrumentation } from '../services/performance-instrumentation.js';

// Advanced Tool Systems - Dynamic loading, deprecation, analytics, optimization
import { abTestingService } from '../tools/ab-testing.js';
import { autoOptimizer } from '../tools/auto-optimizer.js';
import { dynamicToolLoader } from '../tools/dynamic-loader.js';
import { feedbackCollector } from '../tools/feedback-collector.js';
import { patternAnalyzer } from '../tools/pattern-analyzer.js';

// Voice Manager
import { createPersonaAwareTTS, getSessionVoiceManager } from '../speech/voice-manager.js';

// Diagnostic logger
import { diag } from '../services/diagnostic-logger.js';

// Audio prosody analysis
import { getSessionAudioProsodyAnalyzer } from '../speech/audio-prosody.js';

// Emotion matching - connect prosody to voice response
import {
  applyHumanListeningAdjustments,
  getEmotionModulation,
  wrapWithEmotionProsody,
} from '../speech/emotion-matching.js';

// Conversation dynamics - emotional arc, response length, story timing
import {
  getConversationHumanizer,
  getEmotionalArcTracker,
  getResponseDynamicsEngine,
  resetAllConversationState,
} from '../conversation/index.js';

// Advanced Humanization Integration - voice print learning, breathing sync, cross-session memory
import {
  cleanupProsodyBridge,
  onSessionEnd as endHumanizationSession,
  initializeFromPersistence as initHumanizationPersistence,
  initProsodyBridge,
  processProsodyForHumanization,
  persistOnSessionEnd as saveHumanizationState,
  onSessionStart as startHumanizationSession,
} from '../conversation/humanization/index.js';

// 🧠 Superhuman Intelligence Persistence - cross-session learning & memory
import {
  createFirestoreSuperhumanStore,
  loadSuperhumanData,
  saveSuperhumanData,
} from '../services/superhuman-persistence.js';

// Voice Humanization - prosody-aware turn prediction, micro-interruptions, emotional arc TTS
import { getVoiceHumanizationService } from '../speech/voice-humanization.js';
import {
  quickSetupVoiceHumanization,
  type IntegrationResult as VoiceHumanizationIntegration,
} from './integrations/voice-humanization-integration.js';

// Ambient Sound Awareness - detect noisy environments
import { getAmbientAwarenessService } from '../speech/ambient-awareness.js';

// Emotional Contagion - prosody continuity across utterances
import { getEmotionalContagionService } from '../speech/emotional-contagion.js';

// Human Listening Pipeline - "better than human" listening capabilities

// Speech Metrics & Dynamic Speed Integration (new unified systems)
import {
  applyDynamicSpeed,
  calculatePersonaAdjustedSpeed,
  cleanupDynamicSpeed,
  getPersonaSpeedProfile,
} from './integrations/dynamic-speed-integration.js';
import {
  finalizeSpeechMetrics,
  initializeSpeechMetrics,
  logMetricsSummary,
  trackEmotionDetection,
} from './integrations/speech-metrics-integration.js';

// ============================================================================
// ADVANCED VOICE HUMANIZATION (Phase 7+)
// ============================================================================

// FFT-based spectral analysis for better ambient/laughter detection
import { getFFTAnalyzer, resetFFTAnalyzer } from '../speech/fft-analyzer.js';

// Enhanced turn prediction with phrase boundary detection
import {
  getEnhancedTurnPredictor,
  resetEnhancedTurnPredictor,
} from '../speech/enhanced-turn-prediction.js';

// Multi-signal laughter detection (~85% accuracy)
import {
  getMultiSignalLaughterDetector,
  resetMultiSignalLaughterDetector,
} from '../speech/multi-signal-laughter.js';

// Word-timing rhythm mirroring
import {
  getWordTimingRhythmService,
  resetWordTimingRhythmService,
} from '../speech/word-timing-rhythm.js';

// Response anticipation / pattern caching (preemptive workaround)
import {
  getResponseAnticipationService,
  resetResponseAnticipationService,
} from '../speech/response-anticipation.js';

// Feature flags for gradual rollout
import { getSessionFlags, initializeFlags } from '../config/voice-humanization-flags.js';

// Metrics collection
import {
  recordFeatureUsage,
  recordLaughterDetection,
  recordSessionEnd,
  recordSessionStart,
} from '../services/voice-humanization-metrics.js';

// User Analytics (DAU/WAU/MAU, concurrent users, session tracking)
import {
  recordSessionEnd as recordUserSessionEnd,
  recordSessionStart as recordUserSessionStart,
} from '../services/user-analytics.js';

// Mid-session accent change support
import { registerSessionTTS, unregisterSessionTTS } from '../api/session-accent-routes.js';

// Conversation humanizing context builder (speech naturalization, active listening, memory callbacks)

// Engagement System - Real-time engagement data and conversation triggers
import { buildEngagementContextPrompt } from '../services/engagement-conversation-triggers.js';
import { getEngagementDataSender } from '../services/engagement-data-sender.js';
import { getRitualOnboardingService } from '../services/ritual-onboarding.js';

// Handoff system (for multi-persona support)
import {
  handoffEvents,
  initializeHandoffContext,
  resetHandoffState,
  resetMetPersonas,
} from '../tools/handoff/index.js';
import { createHandoffHandler, type VoiceAgentRef } from './shared/handoff-handler.js';

// Cameo system (for team member pop-ins)
import { registerCameoHandlers } from './shared/cameo-handler.js';

// Voice Agent modules (extracted for maintainability)
import {
  createTranscriptHandler,
  generateAndSpeakGreeting,
  handleSlashCommand,
  identifyUser,
  recordTrustSystemsData,
  sendCelebrationEvents,
  setupDataChannelHandler,
  setupMusicHandler,
  setupSessionStateHandlers,
  setupToolTrackingHandler,
} from './voice-agent/index.js';

// Bundle Runtime Engine - rich persona content at runtime
import { createBundleRuntime, type BundleRuntimeEngine } from '../personas/bundles/index.js';
import { loadBundleById } from '../personas/bundles/loader.js';

// Humanizing Context - the deep soul of the AI

// Humanizing Debug - enable with DEBUG_HUMANIZING=true

// Types
import { ConnectionState, type AudioFrame } from '@livekit/rtc-node';

// ============================================================================
// PERSONA AND AGENT NAME
// ============================================================================
// NOTE: Do NOT call getDefaultPersona() at module load time!
// Bundles may not be loaded yet, causing fallback to wrong persona.
// Actual persona loading happens in entry() using getPersonaAsync().
const DEFAULT_PERSONA_ID = process.env.PERSONA_ID || 'ferni';

// Use a static agent name since this agent handles ALL personas via dispatch metadata
const AGENT_NAME = process.env['AGENT_NAME'] || 'voice-agent';

earlyLog.info('Agent module loaded (persona will be loaded async in entry)', {
  defaultPersonaId: DEFAULT_PERSONA_ID,
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

// hasSsmlTags imported from ./shared/helpers.js

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
    // TOOL LOADING - Using new registry-based system with LAZY LOADING
    // =========================================================================
    //
    // The new system builds tools from agent manifests:
    // - Each agent's manifest defines which tool domains they need
    // - Tools are registered by capability, not by agent
    // - Forbidden tools are automatically filtered
    // - LAZY LOADING: Only essential domains load at startup, others on-demand
    //
    // Benefits:
    // - Single source of truth for agent capabilities (manifest)
    // - No hard-coded agent names in tool code
    // - Easier to add new agents or modify existing ones
    // - Reduced memory footprint through lazy loading
    // =========================================================================

    perfInstrumentation.startPhase('tool-loading');

    // Initialize the tool registry if not already done
    // Now uses lazy loading by default - only essential domains at startup
    if (!isToolRegistryInitialized()) {
      perfInstrumentation.startPhase('tool-registry-init');
      const initResult = await initializeTools({
        parallel: true,
        // lazyLoading: true is now the default
      });
      perfInstrumentation.endPhase('tool-registry-init', {
        domainsLoaded: Object.keys(initResult.byDomain).length,
        totalTools: initResult.loaded,
        lazyLoading: initResult.lazyLoadingEnabled,
      });
      logger.info(
        {
          domainsLoaded: Object.keys(initResult.byDomain).length,
          remainingDomains: initResult.remainingDomains.length,
          lazyLoading: initResult.lazyLoadingEnabled,
        },
        '🚀 Tool registry initialized with lazy loading'
      );
    }

    // Build tools using registry-based system
    // Each agent's manifest defines exactly which domains/tools they need
    // This keeps tool count manageable (40-60 per agent) for optimal Gemini performance
    logger.info({ personaId: persona.id }, 'Building tools from agent manifest');

    // Get persona's required domains and lazy-load any that aren't yet loaded
    const personaManifest = persona as { tools?: { domains?: string[] } };
    const requiredDomains = personaManifest?.tools?.domains || [];
    if (requiredDomains.length > 0) {
      const loadedDomains = getLoadedDomains();
      const missingDomains = requiredDomains.filter((d) => !loadedDomains.includes(d as never));
      if (missingDomains.length > 0) {
        perfInstrumentation.startPhase('lazy-load-domains');
        const lazyLoaded = await loadToolDomainsLazy(missingDomains as never[]);
        perfInstrumentation.endPhase('lazy-load-domains', {
          domains: missingDomains,
          toolsLoaded: lazyLoaded,
        });
        logger.info(
          { domains: missingDomains, toolsLoaded: lazyLoaded },
          '🔄 Lazy-loaded additional domains for persona'
        );
      }
    }

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

    perfInstrumentation.endPhase('tool-loading');
    perfInstrumentation.snapshotMemory('after-tool-loading');

    // Log final tool count - should be 40-60 per agent for optimal Gemini performance
    const toolNames = Object.keys(toolsForAgent);
    const perfSummary = perfInstrumentation.getSummary();
    logger.info(
      {
        personaId: persona.id,
        essentialCount: Object.keys(essentialTools).length,
        personaCount: Object.keys(personaTools).length,
        finalToolCount: toolNames.length,
        forbiddenCount: forbiddenTools.length,
        sampleTools: toolNames.slice(0, 10),
        // Performance metrics
        domainsLoaded: perfSummary.domainsLoaded,
        lazyLoadedDomains: perfSummary.lazyLoadedDomains,
        heapUsedMB: perfSummary.heapUsedMB,
      },
      '📊 Tools loaded for agent (with performance metrics)'
    );

    // Start automatic memory monitoring with alerts
    // This will log warnings at 1GB and critical alerts at 1.5GB
    perfInstrumentation.startAutoMonitoring();

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
            // 🧠 Also includes superhuman intelligence: concern detection,
            // proactive memory, predictive anticipation
            // ============================================================
            try {
              const humanizer = getConversationHumanizer(agent.persona.id);
              const lastUserMessage = userData?.lastUserMessage || '';
              const turnNumber = userData?.turnCount || 0;

              // 🧠 Set session context for superhuman intelligence
              const agentSessionId =
                (userData?.sessionData as { sessionId?: string } | undefined)?.sessionId ||
                `session-${agent.persona.id}`;
              const agentUserId = (userData?.sessionData as { userId?: string } | undefined)
                ?.userId;
              humanizer.setSessionContext(agentSessionId, agentUserId);

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
                  userData.lastAgentResponseTime = Date.now(); // For engagement scoring

                  // ============================================================
                  // ADVANCED HUMANIZATION: Record response for repair detection
                  // This helps detect miscommunication in the next turn
                  // ============================================================
                  const ahSessionId = userData.services?.sessionId;
                  if (ahSessionId) {
                    import('./processors/injection-builders.js')
                      .then(({ recordAdviceGivenToSession }) => {
                        // Also check if this was advice and record it
                        const lowerResponse = accumulatedText.toLowerCase();
                        const adviceIndicators = [
                          'you should',
                          'try to',
                          'i suggest',
                          'consider',
                          'why not',
                          'have you tried',
                          "it's important to",
                          'make sure to',
                        ];
                        const wasAdvice = adviceIndicators.some((i) => lowerResponse.includes(i));
                        if (wasAdvice) {
                          recordAdviceGivenToSession(ahSessionId).catch(() => {});
                        }
                      })
                      .catch(() => {});

                    // Record the full response for repair detection
                    import('../conversation/advanced-humanization-integration.js')
                      .then(({ recordAgentResponse }) => {
                        recordAgentResponse(ahSessionId, accumulatedText);
                      })
                      .catch(() => {});
                  }

                  // ============================================================
                  // EVALOPS: Evaluate agent response for quality assurance
                  // Non-blocking - runs in background, errors are caught
                  // ============================================================
                  try {
                    const sessionId = userData.services?.sessionId;
                    const lastUserMsg = userData.lastUserMessage || '';

                    if (sessionId && lastUserMsg) {
                      // Import dynamically to avoid startup cost
                      import('../services/evalops/voice-agent-integration.js')
                        .then(({ evaluateAgentResponse }) => {
                          evaluateAgentResponse(
                            sessionId,
                            agent.persona.id,
                            lastUserMsg,
                            accumulatedText,
                            {
                              userId: userData.services?.userId,
                              turnNumber: userData.turnCount || 1,
                              emotionalIntensity: userData.lastEmotionAnalysis?.intensity,
                              isNewUser: userData.turnCount === 1,
                            }
                          ).catch(() => {
                            // Non-blocking - silently ignore errors
                          });
                        })
                        .catch(() => {
                          // Non-blocking - module import failed, skip evaluation
                        });
                    }
                  } catch {
                    // Non-blocking - EvalOps hook should never crash the agent
                  }

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

            // ============================================================
            // HUMAN LISTENING: Apply SSML adjustments based on cognitive/emotional state
            // This layers on top of emotion mirroring to respond to:
            // - Cognitive overload → slower speech
            // - Distress signals → softer delivery
            // - Self-soothing → gentle pace
            // ============================================================
            try {
              const sessionIdForListening = userData?.services?.sessionId;
              if (sessionIdForListening) {
                const { getHumanListeningResult } =
                  await import('../intelligence/context-builders/human-listening.js');
                const listeningResult = getHumanListeningResult(sessionIdForListening);

                if (listeningResult?.ssmlSuggestions) {
                  taggedText = applyHumanListeningAdjustments(
                    taggedText,
                    listeningResult.ssmlSuggestions
                  );
                }
              }
            } catch (listeningAdjustErr) {
              // Non-critical - don't block audio
              diag.debug('Human listening SSML adjustment skipped', {
                error: String(listeningAdjustErr),
              });
            }

            // Apply emotional arc adjustments for smooth transitions
            const emotionalArc = getEmotionalArcTracker();
            const arcAdjustments = emotionalArc.getSsmlAdjustments();
            if (arcAdjustments.addBreaks && !taggedText.includes('<break')) {
              // Add gentle opening break for emotional moments
              taggedText = `<break time="200ms"/>${taggedText}`;
            }

            // ============================================================
            // DYNAMIC SPEED: Adjust speech rate based on context
            // Uses full persona profile system for nuanced adjustments
            // ============================================================
            const dynamicSpeedSessionId = userData?.services?.sessionId;
            if (dynamicSpeedSessionId) {
              try {
                const { getHumanListeningResult } =
                  await import('../intelligence/context-builders/human-listening.js');
                const listeningResult = getHumanListeningResult(dynamicSpeedSessionId);

                // Get full persona profile for this persona
                const personaProfile = getPersonaSpeedProfile(agent.persona.id);

                // Derive emotional intensity from arc and listening result
                const arcData = emotionalArc.getArc();
                // Convert tremor intensity string to number
                const tremorIntensity = listeningResult?.audio?.tremor?.intensity;
                const tremorScore =
                  tremorIntensity === 'pronounced'
                    ? 0.9
                    : tremorIntensity === 'noticeable'
                      ? 0.6
                      : tremorIntensity === 'subtle'
                        ? 0.3
                        : 0;
                const emotionalIntensity = Math.max(
                  Math.abs(arcData.currentValence || 0),
                  arcData.currentArousal || 0,
                  tremorScore
                );

                // Derive content complexity from listening result
                const contentComplexity =
                  listeningResult?.text?.cognitiveLoad?.level === 'high'
                    ? 0.8
                    : listeningResult?.text?.cognitiveLoad?.level === 'medium'
                      ? 0.5
                      : 0.3;

                // Determine topic weight from emotional context
                const topicWeight: 'light' | 'medium' | 'heavy' =
                  (arcData.currentValence ?? 0) < -0.3 || emotionalIntensity > 0.7
                    ? 'heavy'
                    : (arcData.currentValence ?? 0) > 0.3
                      ? 'light'
                      : 'medium';

                // Calculate persona-adjusted base speed
                const personaSpeed = calculatePersonaAdjustedSpeed(agent.persona.id, {
                  emotionalIntensity,
                  contentComplexity,
                  topicWeight,
                  isQuestion: taggedText.includes('?'),
                });

                const speedResult = applyDynamicSpeed(taggedText, {
                  sessionId: dynamicSpeedSessionId,
                  personaId: agent.persona.id,
                  emotionalArc: arcData,
                  listeningResult: listeningResult || undefined,
                  topicWeight,
                  turnNumber: userData?.turnCount || 0,
                  baseSpeed: personaSpeed.speed, // Use persona-adjusted speed
                });

                if (speedResult.wasAdjusted) {
                  taggedText = speedResult.ssmlText;
                  diag.debug('⏱️ Dynamic speed applied', {
                    speed: speedResult.speedResult.speedMultiplier,
                    personaBase: personaProfile.baseSpeed,
                    personaAdjusted: personaSpeed.speed.toFixed(2),
                    personaReason: personaSpeed.reason,
                    reason: speedResult.speedResult.reason,
                  });
                }
              } catch {
                // Non-critical - continue without dynamic speed
              }
            }

            // ============================================================
            // VOICE HUMANIZATION: Laughter Response, Contagion, Rhythm
            // ============================================================
            const sessionId = userData?.services?.sessionId;
            if (sessionId) {
              try {
                const voiceHumanService = getVoiceHumanizationService(sessionId);

                // 1. Laughter response - if user was laughing, acknowledge warmly
                const laughterDetected = userData?.detectedLaughter;
                if (laughterDetected?.isLaughing && laughterDetected.confidence > 0.7) {
                  // Add warmth at start for shared moment
                  if (!taggedText.includes('<laugh>') && !taggedText.startsWith('<break')) {
                    taggedText = `<break time="100ms"/>${taggedText}`;
                  }
                  // Clear the laughter flag so we don't keep responding
                  if (userData) {
                    userData.detectedLaughter = undefined;
                  }
                  agent.logger.debug('😄 Adjusted response for laughter moment');
                }

                // 2. Emotional contagion - maintain prosody continuity
                const contagionService = getEmotionalContagionService(sessionId);
                const voiceEmotion = userData?.voiceEmotion;
                if (voiceEmotion) {
                  // Get continuity hints for next utterance based on emotional momentum
                  const emotionalArcCurrent = getEmotionalArcTracker();
                  const hints = contagionService.getContinuityHints(
                    emotionalArcCurrent.getArc(),
                    voiceEmotion.primary
                  );

                  // Apply momentum-based prosody adjustments
                  if (hints.prosody.speedAdjust !== 0 || hints.prosody.volumeAdjust !== 1.0) {
                    const rate = Math.round((1 + hints.prosody.speedAdjust) * 100);
                    const volume =
                      hints.prosody.volumeAdjust > 1.05
                        ? 'loud'
                        : hints.prosody.volumeAdjust < 0.95
                          ? 'soft'
                          : 'medium';

                    if (!taggedText.includes('<prosody')) {
                      taggedText = `<prosody rate="${rate}%" volume="${volume}">${taggedText}</prosody>`;
                    }
                  }

                  // Add warmth at closing if appropriate
                  if (hints.closingWarmth && taggedText.match(/[.!?]$/)) {
                    // Soften ending with pause
                    taggedText = taggedText.replace(/([.!?])$/, '<break time="100ms"/>$1');
                  }

                  // Record this utterance for momentum tracking
                  contagionService.recordUtterance({
                    emotion: voiceEmotion.primary || 'neutral',
                    valence: voiceEmotion.valence || 0,
                    arousal: voiceEmotion.arousal || 0.5,
                    warmth:
                      voiceEmotion.arousal > 0.6
                        ? 'high'
                        : voiceEmotion.arousal > 0.4
                          ? 'medium'
                          : 'low',
                    wasSupporting: voiceEmotion.stressLevel > 0.5,
                  });
                }

                // 3. Rhythm mirroring - adjust pacing to match user's speech style
                const rhythmAdjustments = voiceHumanService.getRhythmMirroringAdjustments();
                // pauseMultiplier > 1 means user has longer pauses (staccato)
                if (rhythmAdjustments.pauseMultiplier > 1.1 && !taggedText.includes('<break')) {
                  // Add micro-pauses for staccato speakers
                  taggedText = taggedText.replace(/([,])\s+/g, '$1<break time="100ms"/> ');
                }
                // phraseBreakMs affects pause at phrase boundaries
                if (rhythmAdjustments.phraseBreakMs !== 200) {
                  // Non-default phrase break - mirror the rhythm
                  const breakMs = Math.min(500, Math.max(100, rhythmAdjustments.phraseBreakMs));
                  taggedText = taggedText.replace(/([.!?])\s+/g, `$1<break time="${breakMs}ms"/> `);
                }

                // 4. Advanced word-timing rhythm (Phase 7+)
                const advRhythmFlags = getSessionFlags(sessionId);
                if (advRhythmFlags.enableWordTimingRhythm) {
                  try {
                    const wordTimingService = getWordTimingRhythmService(sessionId);
                    const ssmlAdjustments = wordTimingService.getCurrentAdjustments();

                    // Apply rate adjustment if learned rhythm differs significantly
                    if (ssmlAdjustments.rate !== 1.0 && !taggedText.includes('<prosody')) {
                      const ratePercent = Math.round(ssmlAdjustments.rate * 100);
                      if (ratePercent !== 100) {
                        taggedText = `<prosody rate="${ratePercent}%">${taggedText}</prosody>`;
                      }
                    }

                    // Apply micro-pause pattern if user has staccato style
                    if (ssmlAdjustments.addMicroPauses && ssmlAdjustments.microPauseDuration > 0) {
                      const microMs = ssmlAdjustments.microPauseDuration;
                      taggedText = taggedText.replace(
                        /([,;])\s+/g,
                        `$1<break time="${microMs}ms"/> `
                      );
                    }
                  } catch (_wtErr) {
                    // Word timing is non-critical
                  }
                }

                // ============================================================
                // 5. BREATHING SYNC - Align pauses with user's breathing rhythm
                // This creates subconscious rapport through synchronized breathing
                // ============================================================
                try {
                  const { getBreathingSyncEngine } =
                    await import('../conversation/humanization/breathing-sync.js');
                  const { humanizationAnalytics } =
                    await import('../conversation/humanization/analytics.js');

                  const breathingSync = getBreathingSyncEngine(sessionId);
                  const breathState = breathingSync.getState();

                  // Only apply if sync is enabled and we have a pattern
                  if (breathState.enabled && breathState.userPattern) {
                    // Determine emotional context for breathing adjustments
                    const voiceEmotionNow = userData?.voiceEmotion;
                    const emotionalContext = {
                      isEmotional: voiceEmotionNow
                        ? voiceEmotionNow.stressLevel > 0.4 ||
                          Math.abs(voiceEmotionNow.valence) > 0.3
                        : false,
                      isHeavy: voiceEmotionNow ? voiceEmotionNow.stressLevel > 0.6 : false,
                      isExcited: voiceEmotionNow
                        ? voiceEmotionNow.arousal > 0.6 && voiceEmotionNow.valence > 0.2
                        : false,
                    };

                    // Calculate breathing-aware adjustments
                    const breathAdjustments = breathingSync.calculateAdjustments(
                      taggedText,
                      emotionalContext
                    );

                    // Apply if we have meaningful adjustments
                    if (
                      breathAdjustments.adjustedBreaks.length > 0 ||
                      breathAdjustments.breathMarkers.length > 0 ||
                      Math.abs(breathAdjustments.overallPacing - 1.0) > 0.05
                    ) {
                      taggedText = breathingSync.applyToSsml(taggedText, breathAdjustments);

                      // Track analytics
                      humanizationAnalytics.recordApplied(
                        sessionId,
                        'breathing_sync',
                        {
                          breaks: breathAdjustments.adjustedBreaks.length,
                          pacing: breathAdjustments.overallPacing,
                          syncQuality: breathAdjustments.syncQuality,
                        },
                        {
                          turnCount: userData?.turnCount,
                          emotionalContext: emotionalContext.isHeavy
                            ? 'heavy'
                            : emotionalContext.isExcited
                              ? 'excited'
                              : emotionalContext.isEmotional
                                ? 'emotional'
                                : 'neutral',
                        }
                      );

                      agent.logger.debug(
                        {
                          breaks: breathAdjustments.adjustedBreaks.length,
                          pacing: breathAdjustments.overallPacing.toFixed(2),
                          syncQuality: breathAdjustments.syncQuality.toFixed(2),
                        },
                        '🫁 Applied breathing sync to TTS'
                      );
                    } else {
                      // Track skipped
                      humanizationAnalytics.recordSkipped(
                        sessionId,
                        'breathing_sync',
                        'No meaningful adjustments'
                      );
                    }
                  }
                } catch (_breathErr) {
                  // Breathing sync is non-critical
                }
              } catch (humanErr) {
                // Voice humanization is non-blocking
                agent.logger.debug(
                  { error: String(humanErr) },
                  'Voice humanization TTS adjustment failed'
                );
              }
            }

            controller.enqueue(taggedText);
          }
        } catch (streamError) {
          // FIX: Properly propagate stream errors instead of silent failure
          // This prevents the agent from "cutting out" silently when TTS pipeline fails
          agent.logger.error(
            { error: String(streamError) },
            '🚨 TranscriptionNode stream error - this may cause agent to cut out'
          );
          diag.error('TranscriptionNode stream failed', {
            error: String(streamError),
            accumulatedLength: accumulatedText.length,
          });
          // Propagate error to stream consumer
          controller.error(streamError);
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

    const [audioForSTT, audioForProsody] = audio.tee();

    // Process audio for prosody analysis in background
    void (async () => {
      const reader = audioForProsody.getReader();
      // Session-scoped prosody analyzer - initialized lazily when sessionId is available
      let prosodyAnalyzer: ReturnType<typeof getSessionAudioProsodyAnalyzer> | null = null;
      let prosodySessionId: string | null = null;

      try {
        while (true) {
          const { value: frame, done } = await reader.read();
          if (done) break;

          if (frame && frame.data && frame.data.length > 0) {
            // Lazy init prosody analyzer when sessionId becomes available
            if (!prosodyAnalyzer) {
              const userData = agent.getUserDataFromContext();
              prosodySessionId = userData?.services?.sessionId ?? null;
              if (prosodySessionId) {
                prosodyAnalyzer = getSessionAudioProsodyAnalyzer(prosodySessionId);
              }
            }
            // Process frame if analyzer is ready
            prosodyAnalyzer?.processAudioFrame(frame);

            // Feed audio to speaker change detector for voice identity verification
            const userData = agent.getUserDataFromContext();
            const sessionId = userData?.services?.sessionId;
            if (sessionId) {
              try {
                const detector = getSpeakerChangeDetector(sessionId);
                // Convert Int16Array to Float32Array for the detector
                const audioData = new Float32Array(frame.data.length);
                for (let i = 0; i < frame.data.length; i++) {
                  audioData[i] = frame.data[i] / 32768.0;
                }
                detector.feedAudio(audioData);
              } catch {
                // Detector not initialized yet - ignore
              }
            }
          }
        }

        const voiceEmotion = prosodyAnalyzer?.analyze() ?? null;
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

          // ===============================================
          // VOICE HUMANIZATION: Wire prosody to turn prediction
          // This enables intonation-aware end-of-turn detection
          // (falling pitch = statement complete, rising = question/continue)
          // ===============================================
          const sessionId = userData?.services?.sessionId;
          if (sessionId && voiceEmotion.prosody) {
            try {
              const voiceHumanService = getVoiceHumanizationService(sessionId);

              // 1. Detect laughter from prosody features
              const laughterResult = voiceHumanService.detectLaughter(
                voiceEmotion.prosody,
                voiceEmotion.prosody.utteranceDuration || 0
              );

              if (laughterResult.isLaughing) {
                log().debug(
                  {
                    laughType: laughterResult.laughType,
                    confidence: laughterResult.confidence,
                  },
                  '😄 Laughter detected from prosody'
                );

                // Store for response enhancement
                if (userData) {
                  userData.detectedLaughter = laughterResult;
                }
              }

              // 2. Update speech rhythm profile for mirroring
              // This helps agent match user's staccato vs flowing patterns
              if (userData?.lastUserMessage) {
                voiceHumanService.updateRhythmProfile(
                  userData.lastUserMessage,
                  voiceEmotion.prosody.utteranceDuration || 2000
                );
              }

              // 3. Ambient awareness - process audio for environment detection
              try {
                const ambientService = getAmbientAwarenessService(sessionId);
                // Process prosody as ambient indicator (simplified)
                // Full implementation would process raw frames
                const _isSpeech = voiceEmotion.prosody.speakingRatio > 0.5; // Reserved for ambient filtering
                // Note: We'd need raw Int16Array for full analysis
                // For now, track noise level from prosody
                if (userData) {
                  const ambient = ambientService.getAnalysis();
                  userData.ambientEnvironment = ambient.environment;
                  userData.ambientNoiseLevel = ambient.noiseLevel;

                  // Log if environment changed significantly
                  if (ambient.recommendations.offerToPause) {
                    log().debug(
                      {
                        environment: ambient.environment,
                        noiseLevel: ambient.noiseLevel,
                      },
                      '🔊 Noisy environment detected'
                    );
                  }
                }
              } catch (_ambientErr) {
                // Ambient awareness is non-critical
              }

              // ============================================================
              // ADVANCED VOICE HUMANIZATION (Phase 7+)
              // ============================================================
              const advFlags = getSessionFlags(sessionId);

              // 1. Multi-signal laughter detection (~85% accuracy)
              if (advFlags.enableMultiSignalLaughter) {
                try {
                  const laughterDetector = getMultiSignalLaughterDetector(sessionId);
                  laughterDetector.updateContext({
                    recentAgentText: userData?.lastAgentResponse || undefined,
                    emotionalArc: voiceEmotion.primary,
                  });

                  const laughterResult = laughterDetector.detect(
                    voiceEmotion.prosody,
                    undefined, // FFT spectral features (if available)
                    voiceEmotion.prosody.utteranceDuration || 0
                  );

                  if (laughterResult.isLaughter && laughterResult.confidence > 0.6) {
                    log().debug(
                      {
                        laughType: laughterResult.laughType,
                        socialFunction: laughterResult.socialFunction,
                        confidence: laughterResult.confidence.toFixed(2),
                      },
                      '😂 Multi-signal laughter detected'
                    );

                    // Record metrics
                    if (advFlags.enableMetrics) {
                      recordLaughterDetection(
                        sessionId,
                        true,
                        true, // Assume confirmed for now
                        laughterResult.confidence,
                        laughterResult.laughType
                      );
                    }

                    // Store for response adjustment
                    // Map multi-signal laugh types to basic laugh types
                    const basicLaughType =
                      laughterResult.laughType === 'nervous' ||
                      laughterResult.laughType === 'polite'
                        ? ('unknown' as const)
                        : laughterResult.laughType;

                    if (userData) {
                      userData.detectedLaughter = {
                        isLaughing: true,
                        confidence: laughterResult.confidence,
                        laughType: basicLaughType,
                        suggestedResponse:
                          laughterResult.suggestedResponse.type === 'join'
                            ? 'join_in'
                            : laughterResult.suggestedResponse.type === 'acknowledge'
                              ? 'acknowledge'
                              : 'smile',
                      };
                    }
                  }
                } catch (_laughErr) {
                  // Non-critical
                }
              }

              // 2. Word-timing rhythm analysis
              if (advFlags.enableWordTimingRhythm && userData?.lastUserMessage) {
                try {
                  const rhythmService = getWordTimingRhythmService(sessionId);
                  rhythmService.processUtterance(userData.lastUserMessage, voiceEmotion.prosody);
                  // Rhythm adjustments will be applied in transcriptionNode
                } catch (_rhythmErr) {
                  // Non-critical
                }
              }
            } catch (e) {
              log().debug(
                { error: String(e) },
                'Voice humanization prosody hook failed (non-blocking)'
              );
            }
          }

          // Get emotion-based voice modulation for response
          const modulation = getEmotionModulation(voiceEmotion);
          if (userData) {
            userData.emotionModulation = modulation;
          }

          // ===============================================
          // BETTER-THAN-HUMAN: Voice Prosody Baseline Building
          // Record voice samples to build personal baselines.
          // This enables detecting "this sounds different from normal" signals.
          // ===============================================
          const services = userData?.services;
          const userId = services?.userId;
          if (userId && voiceEmotion.prosody && voiceEmotion.confidence > 0.3) {
            try {
              // Convert prosody data to voice characteristics format
              // Using actual properties from ProsodyFeatures interface
              const characteristics = {
                pitchMean: voiceEmotion.prosody.pitchMean || 150,
                pitchRange: voiceEmotion.prosody.pitchRange || 30,
                pitchVariability: voiceEmotion.prosody.pitchVariance
                  ? voiceEmotion.prosody.pitchVariance / 100
                  : 0.3,
                energyMean: voiceEmotion.prosody.energyMean || 0.5,
                energyRange: voiceEmotion.prosody.energyVariance || 0.2,
                energyVariability: voiceEmotion.prosody.energyVariance
                  ? voiceEmotion.prosody.energyVariance / 100
                  : 0.3,
                speakingRate: voiceEmotion.prosody.speechRate || 150,
                pauseFrequency: voiceEmotion.prosody.pauseFrequency || 3,
                pauseDuration: voiceEmotion.prosody.pauseDuration || 300,
                breathiness: voiceEmotion.prosody.breathiness || 0.3,
                tension: voiceEmotion.stressLevel || 0.3,
                clarity: voiceEmotion.confidence || 0.7,
              };

              recordVoiceSample(userId, characteristics, {
                detectedEmotion: voiceEmotion.primary,
                conversationContext: userData?.lastTopic || undefined,
              });

              log().debug(
                { userId, emotion: voiceEmotion.primary, confidence: voiceEmotion.confidence },
                '🎤 BETTER-THAN-HUMAN: Recorded voice sample for baseline building'
              );

              // ===============================================
              // ADVANCED HUMANIZATION: Feed prosody to humanization system
              // This enables:
              // - Voice print learning (unique vocal characteristics)
              // - Breathing sync (align agent pauses with user breathing)
              // - Cross-session voice memory (detect changes across sessions)
              // ===============================================
              try {
                const humanizationSessionId = services?.sessionId || sessionId;
                if (humanizationSessionId) {
                  processProsodyForHumanization(humanizationSessionId, userId, voiceEmotion);

                  // Check for voice state insights ("you sound tired today")
                  // Only check occasionally to avoid overwhelming
                  if (
                    (userData?.turnCount || 0) >= 2 &&
                    Math.random() < 0.3 &&
                    voiceEmotion.prosody
                  ) {
                    const { detectVoiceState } =
                      await import('../conversation/humanization/voice-agent-integration.js');
                    const { humanizationAnalytics, prosodyToVoiceSnapshot } =
                      await import('../conversation/humanization/index.js');

                    // Convert current prosody to voice snapshot
                    const currentSnapshot = prosodyToVoiceSnapshot(
                      voiceEmotion.prosody,
                      voiceEmotion
                    );

                    const voiceState = detectVoiceState(humanizationSessionId, currentSnapshot);
                    if (
                      voiceState &&
                      voiceState.currentState.deviationFromBaseline > 0.15 &&
                      voiceState.suggestedAcknowledgments.length > 0 &&
                      !userData?.pendingVoiceInsight
                    ) {
                      // Store for delivery at appropriate moment
                      if (userData) {
                        const ack = voiceState.suggestedAcknowledgments[0];
                        userData.pendingVoiceInsight = {
                          text: ack,
                          ssml: ack,
                          emotion: voiceState.currentState.emotion,
                          confidence: voiceState.currentState.confidence,
                        };
                      }

                      log().debug(
                        {
                          emotion: voiceState.currentState.emotion,
                          confidence: voiceState.currentState.confidence,
                          deviation: voiceState.currentState.deviationFromBaseline,
                        },
                        '🎤 Voice state insight detected, pending delivery'
                      );

                      // Track in analytics
                      humanizationAnalytics.recordTriggered(
                        humanizationSessionId,
                        'voice_print_detection',
                        { emotion: voiceState.currentState.emotion }
                      );
                    }
                  }
                }
              } catch (humanizationErr) {
                // Non-critical - humanization bridge not initialized
                log().debug(
                  { error: String(humanizationErr) },
                  'Humanization prosody bridge not ready (non-blocking)'
                );
              }
            } catch (e) {
              log().debug(
                { error: String(e) },
                'Voice prosody baseline recording failed (non-blocking)'
              );
            }
          }

          // Feed to learning engine if session services available
          // This helps the agent learn emotional patterns over time
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

              // 🚀 FERNI EQ: Track current mood globally for "Our Songs" feature
              // This enables recording songs played during emotional moments
              (globalThis as unknown as { __ferniCurrentMood?: string }).__ferniCurrentMood =
                voiceEmotion.primary;
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

            // Track emotion detection in unified speech metrics
            if (sessionId) {
              trackEmotionDetection(sessionId, voiceEmotion.confidence);
            }

            // 🚀 FERNI EQ: Send voice prosody data for concern detection & breath sync
            // This enables "Better than Human" emotional intelligence
            agent
              .sendDataMessage('voice_prosody', {
                stressLevel: voiceEmotion.stressLevel,
                anxietyMarkers: voiceEmotion.anxietyMarkers,
                valence: voiceEmotion.valence,
                arousal: voiceEmotion.arousal,
                dominance: voiceEmotion.dominance,
                // Prosody features for breath sync
                pitchVariance: voiceEmotion.prosody?.pitchVariance,
                pauseDuration: voiceEmotion.prosody?.pauseDuration,
                speechRate: voiceEmotion.prosody?.speechRate,
                // Voice quality indicators for concern detection
                voiceQuality: voiceEmotion.prosody?.voiceQuality,
                breathiness: voiceEmotion.prosody?.breathiness,
              })
              .catch((e) =>
                log().debug({ error: String(e) }, 'Voice prosody publish (non-critical)')
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

            // 🎧 DJ ENHANCEMENTS: Track emotion for session flow (Phase 5 & 7)
            // This enables emotion-reactive music offers
            const booth = getDJBooth();
            if (booth) {
              booth.trackEmotion(voiceEmotion.primary);

              // Occasionally offer music for strong emotions (10% chance)
              // Strong emotions: sad, anxious, frustrated, excited
              const strongEmotions = ['sad', 'anxious', 'frustrated', 'excited', 'stressed'];
              if (
                strongEmotions.includes(voiceEmotion.primary) &&
                voiceEmotion.confidence > 0.6 &&
                Math.random() < 0.1 &&
                !booth.isPlayingMusic()
              ) {
                const musicOffer = booth.getEmotionMusicOffer(voiceEmotion.primary);
                if (musicOffer) {
                  // Don't speak immediately - let the conversation flow
                  // Schedule for after current turn if appropriate
                  setTimeout(() => {
                    const currentBooth = getDJBooth();
                    // FIX: Prevent double-speaking - check both music AND agent speaking state
                    if (
                      currentBooth &&
                      !currentBooth.isPlayingMusic() &&
                      !getConversationManager().isAgentSpeaking()
                    ) {
                      currentBooth.speakOverMusic(musicOffer.offer);
                    }
                  }, 3000);
                }
              }
            }
          }
        }

        prosodyAnalyzer?.clearBuffers();
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
    // FIX: Remove race-condition-prone global fallback
    // Services should always be available from the session's userData
    const services = userData?.services;

    if (!services) {
      this.logger.error(
        'No services available for turn processing - session may not be properly initialized'
      );
      return;
    }

    // ================================================================
    // EXTENSIBILITY: Slash command detection
    // Check if user is invoking a slash command like "/daily-check-in"
    // Note: We don't return early - the LLM still needs to respond based on injected context
    // ================================================================
    const trimmedText = userText.trim();
    let _isSlashCommand = false;
    if (trimmedText.startsWith('/')) {
      const slashResult = await handleSlashCommand({
        text: trimmedText,
        turnCtx,
        personaId: this.persona.id,
        services: { userId: services.userId, sessionId: services.sessionId },
      });
      _isSlashCommand = slashResult.handled;
      // If it's a valid command, context was injected. Continue to let LLM respond.
      // If not valid, continue normal processing.
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

      // ================================================================
      // DEAD AIR FIX: Timeout wrapper for turn processing
      // If processing takes too long, speak a thinking filler to fill silence
      // ================================================================
      let spokeFiller = false;
      let fillerTimeout: ReturnType<typeof setTimeout> | null = null;

      // Schedule filler if processing takes too long
      const fillerPromise = new Promise<void>((resolve) => {
        fillerTimeout = setTimeout(() => {
          if (!spokeFiller && this._currentSession) {
            spokeFiller = true;
            const filler = getThinkingFiller(this.persona.id);
            this._currentSession.say(filler, { allowInterruptions: true });
            diag.state('🎤 Spoke thinking filler (processing slow)', {
              personaId: this.persona.id,
              timeoutMs: PROCESSING_TIMEOUTS.TURN_PROCESSING_SOFT_TIMEOUT,
            });
          }
          resolve();
        }, PROCESSING_TIMEOUTS.TURN_PROCESSING_SOFT_TIMEOUT);
      });

      // Process the turn (all analysis, context building, emotional tracking)
      // Race with hard timeout to prevent infinite hangs
      const result = await Promise.race([
        processTurn(turnContext),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Turn processing hard timeout')),
            PROCESSING_TIMEOUTS.TURN_PROCESSING_HARD_TIMEOUT
          );
        }),
      ]).finally(() => {
        // Clean up filler timeout
        if (fillerTimeout) {
          clearTimeout(fillerTimeout);
        }
      });

      // Cancel the filler promise (it may have already fired)
      void fillerPromise;

      // Inject context into LLM
      injectTurnContext(turnCtx, result);

      // ================================================================
      // EXTENSIBILITY: before_response hook
      // Allow marketplace agents to inject custom context before response
      // ================================================================
      try {
        const { onBeforeResponse } =
          await import('../personas/bundles/extensibility-integration.js');
        const beforeResponsePrompt = await onBeforeResponse({
          personaId: this.persona.id,
          userId: services.userId,
          sessionId: services.sessionId,
        });

        if (beforeResponsePrompt) {
          turnCtx.addMessage({
            role: 'system',
            content: `[AGENT EXTENSIBILITY - RESPONSE GUIDANCE]\n${beforeResponsePrompt}`,
          });
          this.logger.info(
            { personaId: this.persona.id },
            'Extensibility before_response hook injected'
          );
        }

        // Also check for session_start prompt that wasn't used yet
        const extSessionPrompt = (userData as Record<string, unknown>)
          .extensibilitySessionPrompt as string | null;
        if (extSessionPrompt && (userData.turnCount ?? 0) <= 1) {
          turnCtx.addMessage({
            role: 'system',
            content: `[AGENT EXTENSIBILITY - SESSION CONTEXT]\n${extSessionPrompt}`,
          });
          this.logger.info(
            { personaId: this.persona.id },
            'Extensibility session_start context injected'
          );
        }
      } catch (extHookErr) {
        this.logger.warn({ error: String(extHookErr) }, 'Extensibility hook failed (non-fatal)');
      }

      // ================================================================
      // HUMAN-FIRST 2FA: Check for phone ask opportunity
      // If a magic moment was detected, inject the phone ask guidance
      // ================================================================
      try {
        const { getResponseModification } =
          await import('../services/trust-and-identity/voice-agent-integration.js');
        const phoneAskMod = getResponseModification(services.sessionId);

        if (phoneAskMod.injectPhoneAsk && phoneAskMod.script) {
          // Add phone ask guidance to the LLM context
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

          diag.session('📱 Phone ask injected', {
            momentType: phoneAskMod.momentType,
            tone: phoneAskMod.tone,
          });
        }
      } catch (phoneAskErr) {
        // Non-fatal - don't block on phone ask injection
        this.logger.debug({ error: String(phoneAskErr) }, 'Phone ask injection skipped');
      }

      // Send celebration events to frontend
      const celebrations = getCelebrationEvents(result);
      if (celebrations.length > 0) {
        await sendCelebrationEvents({ injections: celebrations, room: this._room });
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
      const { userId } = services;
      if (userId) {
        await recordTrustSystemsData({ userId, userText, result });
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

      // ================================================================
      // DEAD AIR FIX: Graceful error recovery
      // Don't throw - instead speak a human-like error response
      // This prevents silent failures that leave users in dead air
      // ================================================================
      const isTimeout = String(error).includes('timeout');
      const errorType = isTimeout ? 'api_timeout' : 'general';
      const gracefulError = getGracefulErrorResponse(errorType, String(error));

      if (this._currentSession) {
        try {
          this._currentSession.say(gracefulError.userMessage, { allowInterruptions: true });
          diag.state('🎤 Spoke graceful error recovery', {
            errorType,
            recoverable: gracefulError.recoverable,
          });
        } catch (sayError) {
          this.logger.error({ error: String(sayError) }, 'Failed to speak error recovery');
        }
      }

      // Don't throw - we've handled it gracefully
      // The LLM will still generate a response (without our context injections)
    }
  }

}

// ============================================================================
// AGENT DEFINITION
// ============================================================================
// NOTE: Session services are stored in userData.services per-session
// to avoid race conditions with concurrent sessions.

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // =========================================================================
    // ULTRA-LIGHTWEIGHT PREWARM
    // =========================================================================
    // CRITICAL: This function is NOT awaited by the LiveKit SDK!
    // The SDK calls prewarm(proc) and immediately sends initializeResponse.
    // Therefore, this function must return INSTANTLY and do work in background.
    //
    // Previous implementation did heavy work here (startup(), Firestore, etc.)
    // which could block if external services were slow, causing crash loops.
    // Now we just set minimal state and let entry() handle initialization.
    // =========================================================================

    // Immediate logging to stderr (unbuffered) - this is the ONLY sync work we do
    const startTime = Date.now();
    process.stderr.write(
      `[voice-agent] PREWARM pid=${process.pid} time=${new Date().toISOString()}\n`
    );

    // Set minimal process state - this is synchronous and fast
    proc.userData.vadLoaded = false;
    proc.userData.prewarmStarted = true;
    proc.userData.prewarmComplete = false;

    // Fire off background initialization (non-blocking)
    // This runs AFTER we return, so SDK gets its initializeResponse immediately
    const backgroundInit = async () => {
      try {
        // Wrap in hard timeout to prevent runaway initialization
        const BACKGROUND_TIMEOUT = 30_000; // 30 seconds max for background init

        await Promise.race([
          (async () => {
            // Defer diagnostic logging to not block
            process.nextTick(() => {
              try {
                diag.section('PREWARM BACKGROUND');
                diag.prewarm('Starting background init', { pid: process.pid });
              } catch {
                // Ignore diagnostic errors
              }
            });

            // Import startup module dynamically
            const { startup, registerShutdownHandlers } = await import('../startup.js');
            registerShutdownHandlers();

            // Run startup with its own internal timeout
            await startup();

            // Preload commonly used modules
            try {
              const { preloadCommonModules } = await import('./shared/cached-imports.js');
              await preloadCommonModules();
            } catch {
              // Non-fatal
            }

            // Warm caches in background (non-blocking)
            try {
              const { warmCachesOnStartup } = await import('../services/cache-warming.js');
              const { startCacheMaintenance } = await import('../services/cache-monitoring.js');
              // Fire-and-forget cache warming
              warmCachesOnStartup().catch(() => {
                // Ignore warming errors - caches will fill on demand
              });
              // Start periodic cache maintenance (every 15 min)
              startCacheMaintenance();
            } catch {
              // Non-fatal - caches will fill on demand
            }

            proc.userData.prewarmComplete = true;
            process.stderr.write(
              `[voice-agent] PREWARM COMPLETE pid=${process.pid} elapsed=${Date.now() - startTime}ms\n`
            );
          })(),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Background init timeout')), BACKGROUND_TIMEOUT);
          }),
        ]);
      } catch (error) {
        // Background init failed - entry() will retry initialization
        process.stderr.write(
          `[voice-agent] PREWARM BACKGROUND FAILED pid=${process.pid} error=${error}\n`
        );
        proc.userData.prewarmComplete = false;
      }
    };

    // Schedule background init to run after this function returns
    // Using setTimeout(0) ensures we return control to the SDK first
    setTimeout(() => {
      backgroundInit().catch((e) => {
        process.stderr.write(`[voice-agent] Background init error: ${e}\n`);
      });
    }, 0);

    // Return immediately - SDK needs initializeResponse ASAP
    process.stderr.write(
      `[voice-agent] PREWARM RETURNING pid=${process.pid} elapsed=${Date.now() - startTime}ms\n`
    );
  },

  entry: async (ctx: JobContext) => {
    const _entryStartTime = Date.now(); // Reserved for entry timing metrics
    const logger = log();

    diag.section('ENTRY FUNCTION CALLED');
    diag.entry('Job received', {
      jobId: ctx.job.id,
      defaultPersonaId: DEFAULT_PERSONA_ID,
    });

    const sessionId = ctx.room?.name || `session-${Date.now()}`;

    // ===============================================
    // ENSURE INITIALIZATION COMPLETED
    // ===============================================
    // Prewarm runs initialization in background. If it hasn't completed,
    // we need to ensure services are initialized before handling the job.
    const prewarmComplete = (ctx.proc?.userData as { prewarmComplete?: boolean })?.prewarmComplete;
    if (!prewarmComplete) {
      diag.entry('Prewarm incomplete, running fallback initialization');
      process.stderr.write(
        `[voice-agent] ENTRY: Prewarm incomplete, initializing now pid=${process.pid}\n`
      );
      try {
        // Initialize services first
        await initializeServices(true);

        // CRITICAL: Also load persona bundles!
        // initializeServices() does NOT load bundles, so we must do it here
        // otherwise getPersonaAsync() will block mid-job to load them
        const bundleStart = Date.now();
        const bundleResult = await initializeFromBundles();
        const bundleTime = Date.now() - bundleStart;
        diag.entry('Fallback initialization complete', {
          bundlesLoaded: bundleResult.loaded,
          bundlesFailed: bundleResult.failed,
          bundleTimeMs: bundleTime,
        });
        process.stderr.write(
          `[voice-agent] ENTRY: Bundles loaded=${bundleResult.loaded} failed=${bundleResult.failed} time=${bundleTime}ms\n`
        );
      } catch (initError) {
        diag.warn('Fallback initialization failed, continuing anyway', {
          error: String(initError),
        });
      }
    } else {
      diag.entry('Prewarm complete, proceeding with job');
    }

    try {
      // ===============================================
      // STEP 0: LOAD PERSONA FROM DISPATCH METADATA
      // ===============================================
      // UI can select persona; agent loads it dynamically per-session
      // FIX: Use getPersonaAsync to ensure bundles are loaded before getting persona
      // This fixes the race condition where PERSONA was set at module load time
      // before bundles were initialized, causing fallback to generic-advisor
      const defaultPersonaId = process.env.PERSONA_ID || 'ferni';
      let requestedPersonaId = defaultPersonaId;

      try {
        if (ctx.job.metadata) {
          const metadata = JSON.parse(ctx.job.metadata);
          if (metadata.persona_id) {
            requestedPersonaId = metadata.persona_id;
          }
        }
      } catch (e) {
        diag.warn('Failed to parse persona from metadata', { error: String(e) });
      }

      // Use async version to ensure bundles are loaded and aliases are registered
      // This properly waits for initializeFromBundles() to complete
      const sessionPersona = await getPersonaAsync(requestedPersonaId);
      if (!sessionPersona) {
        throw new Error(
          `Persona '${requestedPersonaId}' not found. Bundles may have failed to load. ` +
            `Check that persona bundle exists at src/personas/bundles/${requestedPersonaId}/`
        );
      }
      diag.session('Persona loaded for session', {
        personaId: sessionPersona.id,
        personaName: sessionPersona.name,
        requestedId: requestedPersonaId,
      });

      // ===============================================
      // STEP 1: IDENTIFY USER
      // ===============================================
      // Extracted to voice-agent/user-identification-handler.ts for maintainability
      // Handles: user identification from metadata, identity session (trust levels),
      // world awareness, personal journey, speaker change detection, accent detection
      const {
        userId,
        userName,
        identificationSource: _identificationSource,
        userAccent,
      } = await identifyUser({
        jobMetadata: ctx.job.metadata,
        room: ctx.room,
        sessionId,
      });

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

      // Load trust profiles for "better than human" trust awareness
      if (userId) {
        try {
          await loadTrustProfiles(userId);
          diag.session('Trust profiles loaded for user', { userId });
        } catch (trustErr) {
          diag.warn('Failed to load trust profiles (non-fatal)', { error: String(trustErr) });
        }

        // 🧠 Load superhuman intelligence data (memories, patterns, learning)
        try {
          const { getFirestoreStore } = await import('../memory/firestore-store.js');
          const superhumanStore = createFirestoreSuperhumanStore(async () => {
            const store = getFirestoreStore();
            if (!store) throw new Error('Firestore not initialized');
            return store as unknown as {
              collection: (name: string) => {
                doc: (id: string) => {
                  get: () => Promise<{ exists: boolean; data: () => unknown }>;
                  set: (data: unknown, opts?: { merge?: boolean }) => Promise<void>;
                  delete: () => Promise<void>;
                };
              };
            };
          });
          await loadSuperhumanData(userId, sessionId, superhumanStore);
          diag.session('🧠 Superhuman intelligence loaded', { userId });
        } catch (superhumanErr) {
          diag.warn('Superhuman data load failed (non-fatal)', { error: String(superhumanErr) });
        }
      }

      const isReturningUser =
        services.userProfile !== null && (services.userProfile.totalConversations || 0) > 0;

      // ===============================================
      // FIRST TASTE TRIAL: Check trial eligibility for new users
      // "Better than Human" - let them experience the magic first
      // ===============================================
      let isTrialUser = false;
      let isFirstConversation = false;
      let trialStatus: TrialCheckResult | null = null;

      if (userId && !isReturningUser) {
        try {
          const eligible = await isEligibleForTrial(userId);
          if (eligible) {
            // Start trial for new user
            await startTrial(userId);
            isTrialUser = true;
            isFirstConversation = true;
            trialStatus = await checkTrialStatus(userId, 0);
            diag.session('Started first taste trial for new user', { userId });
          }
        } catch (trialErr) {
          diag.warn('Trial check failed (non-fatal)', { error: String(trialErr) });
        }
      } else if (userId) {
        // Check if existing user is still in trial
        try {
          trialStatus = await checkTrialStatus(userId, 0);
          if (trialStatus.inTrial) {
            isTrialUser = true;
            diag.session('User is in active trial', {
              userId,
              timeRemainingMs: trialStatus.timeRemainingMs,
            });
          }
        } catch (trialErr) {
          diag.warn('Trial status check failed (non-fatal)', { error: String(trialErr) });
        }
      }

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
        // 🌍 International accent preference
        preferredAccent: userAccent,
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
        // First Taste Trial state
        isTrialUser,
        isFirstConversation,
        trialStatus: trialStatus
          ? {
              inTrial: trialStatus.inTrial,
              timeRemainingMs: trialStatus.timeRemainingMs,
              approachingEnd: trialStatus.approachingEnd,
              trialEnded: trialStatus.trialEnded,
            }
          : undefined,
        hasSpokenTrialEndPrompt: false,
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

      // Initialize voice manager (session-scoped)
      const voiceManager = getSessionVoiceManager(sessionId);
      voiceManager.initialize();

      // Create TTS using PersonaAwareTTS - uses the persona's specific voice
      // 🌍 INTERNATIONAL ACCENT SUPPORT
      // For non-American accents, we need a LOCALIZED voice from Cartesia's API
      // The language parameter alone doesn't change the accent!
      let effectiveVoiceId = sessionPersona.voice.voiceId;
      let isLocalizedVoice = false;

      if (userAccent !== 'american') {
        try {
          const { getLocalizedVoiceId } =
            await import('../services/cartesia-voice-localization.js');
          const localizationResult = await getLocalizedVoiceId(sessionPersona.id, userAccent);
          effectiveVoiceId = localizationResult.voiceId;
          isLocalizedVoice = localizationResult.isLocalized;

          diag.tts('🌍 Voice localized for accent', {
            persona: sessionPersona.id,
            accent: userAccent,
            originalVoiceId: sessionPersona.voice.voiceId,
            localizedVoiceId: effectiveVoiceId,
            cached: localizationResult.cached,
          });
        } catch (locErr) {
          diag.warn('Voice localization failed, using original voice', {
            error: String(locErr),
            persona: sessionPersona.id,
            accent: userAccent,
          });
          // Fall back to original voice
        }
      }

      diag.tts('Creating PersonaAwareTTS', {
        persona: sessionPersona.id,
        personaName: sessionPersona.name,
        voiceId: effectiveVoiceId,
        accent: userAccent,
        isLocalizedVoice,
      });

      const tts = createPersonaAwareTTS(sessionPersona.name, {
        ...sessionPersona.voice,
        voiceId: effectiveVoiceId,
        accent: userAccent,
        isLocalizedVoice,
      });

      // 🌍 Register TTS for mid-session accent changes
      registerSessionTTS(sessionId, tts, sessionPersona.id, userAccent);

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
      // STEP 4b: AGENT EXTENSIBILITY - SESSION START HOOK
      // Execute session_start hook if the persona has one defined
      // This allows marketplace agents to inject custom behavior
      // ===============================================
      let extensibilitySessionPrompt: string | null = null;
      try {
        const { onSessionStart } = await import('../personas/bundles/extensibility-integration.js');
        extensibilitySessionPrompt = await onSessionStart({
          personaId: sessionPersona.id,
          userId,
          sessionId,
        });
        if (extensibilitySessionPrompt) {
          diag.session('Extensibility session_start hook executed', {
            personaId: sessionPersona.id,
            hasPrompt: true,
          });
        }
      } catch (extErr) {
        diag.warn('Extensibility session_start hook failed (non-fatal)', {
          error: String(extErr),
        });
      }

      // Store in userData for use in context injection
      (userData as Record<string, unknown>).extensibilitySessionPrompt = extensibilitySessionPrompt;

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

      // ===============================================
      // VOICE HUMANIZATION INTEGRATION
      // Makes agent feel more human through:
      // - Prosody-aware turn prediction (uses voice intonation)
      // - Micro-interruption detection ("wait", "hold on" stops agent)
      // - Emotional arc → TTS adjustments (pauses, warmth based on arc)
      // - Laughter detection (respond naturally to user laughter)
      // ===============================================
      const emotionalArcTracker = getEmotionalArcTracker();
      let voiceHumanization: VoiceHumanizationIntegration | null = null;

      try {
        voiceHumanization = quickSetupVoiceHumanization(
          sessionId,
          sessionPersona.id,
          emotionalArcTracker,
          {
            onInterrupt: () => {
              // When micro-interruption detected, interrupt the agent
              diag.state('🛑 Micro-interruption detected - stopping agent speech');
              try {
                // Try to interrupt via session - this will stop TTS
                session.interrupt();
              } catch (e) {
                diag.warn('Failed to interrupt session', { error: String(e) });
              }
            },
            onLaughter: (laughType) => {
              diag.state('😄 User laughter detected', { type: laughType });
              // Laughter response is handled by TTS enhancement
            },
          }
        );
        diag.entry('🎤 Voice humanization initialized', {
          sessionId,
          personaId: sessionPersona.id,
        });
      } catch (e) {
        diag.warn('Voice humanization initialization failed (non-fatal)', { error: String(e) });
      }

      // ============================================================
      // TOOL EXECUTION TRACKING - Orchestration Integration
      // ============================================================
      // Extracted to voice-agent/tool-tracking-handler.ts for maintainability
      // Tracks: tool usage analytics, deprecation analysis, pattern analysis, auto-optimizer
      setupToolTrackingHandler({
        session,
        userData,
        services,
        sessionPersona,
        sessionId,
        debugEnabled: DEBUG_STARTUP,
      });

      // ===============================================
      // SESSION STATE HANDLERS (AgentStateChanged, UserStateChanged)
      // ===============================================
      // Extracted to voice-agent/session-state-handler.ts for maintainability
      // Handles: Agent speaking state (DJ booth, response latency, accent changes),
      // User speaking state (backchannels, meaningful silence, early acknowledgments)
      const { silenceContext } = setupSessionStateHandlers({
        session,
        sessionPersona,
        conversationManager,
        userData,
        sessionId,
      });

      // ===============================================
      // USER INPUT TRANSCRIBED HANDLER
      // ===============================================
      // Extracted to voice-agent/transcript-handler.ts for maintainability
      // Handles: micro-interruption detection, partial transcripts, response anticipation,
      // trial status, human listening pipeline, memorable moments, game detection,
      // dynamic tool loading, voice identity, DJ session flow, and feedback collection
      const transcriptHandler = createTranscriptHandler({
        room: ctx.room,
        session,
        services,
        sessionPersona,
        conversationManager,
        voiceHumanization,
        userData,
        userId,
        sessionId,
        silenceContext,
        dynamicToolLoader,
        autoOptimizer,
      });
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
        transcriptHandler.handler(event);
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

      const wrappedHandoffHandler = (data: Parameters<typeof handoffHandler>[0]) => {
        void handoffHandler(data).catch((err) => {
          diag.error('Handoff handler error', { error: String(err) });
        });
      };
      handoffEvents.on('voiceSwitch', wrappedHandoffHandler);

      // NOTE: The inline handler has been extracted to src/agents/shared/handoff-handler.ts
      // This reduces voice-agent.ts by ~350 lines while maintaining identical functionality
      // The extracted handler handles:
      // - Legacy and new handoff data formats
      // - Frontend notifications (handoff_started, handoff_complete, handoff_failed)
      // - Voice switching with VoiceManager
      // - Persona and bundle runtime updates
      // - State sync and validation

      // ============================================================
      // CAMEO EVENT HANDLERS - Team member "pop-in" support
      // ============================================================
      // Register cameo handlers for temporary voice switches where team members
      // can briefly speak and then hand back to the host persona (Ferni)
      // FIX BUG: Now passes getVoiceAgentRef and hostPersona to enable LLM instruction updates
      let cleanupCameoHandlers: (() => void) | null = null;
      try {
        cleanupCameoHandlers = await registerCameoHandlers({
          ctx,
          session,
          tts: session.tts as { switchVoice?: (name: string, id: string) => void },
          hostPersonaId: sessionPersona.id,
          hostVoiceId: sessionPersona.voice.voiceId,
          // FIX BUG: Add voice agent ref for LLM instruction updates during cameos
          // The ref is assigned later (line ~3899) but handlers run async so it will be available
          getVoiceAgentRef: () =>
            voiceAgentRef as import('./shared/cameo-handler.js').CameoVoiceAgentRef | null,
          hostPersona: sessionPersona,
        });
        diag.entry('🎬 Cameo handlers registered (with LLM instruction support)');
      } catch (cameoErr) {
        // Non-critical - cameos are optional enhancement
        diag.warn(`Failed to register cameo handlers: ${String(cameoErr)}`);
      }

      // ===============================================
      // STEP 6: CREATE VOICE AGENT
      // ===============================================
      diag.entry('Step 6: Creating VoiceAgent');
      const voiceAgent = await VoiceAgent.create(sessionPersona);
      voiceAgent.setSession(session);
      voiceAgent.setRoom(ctx.room); // For sending celebration events to frontend

      // Assign to reference for use in async event handlers (handoffs)
      voiceAgentRef = voiceAgent;

      // ===============================================
      // STEP 7: PARALLEL INITIALIZATION (PERF OPTIMIZATION)
      // ===============================================
      // Bundle runtime init and room connection are independent - run in parallel
      // This saves ~200-500ms during session startup
      diag.entry('Step 7: Parallel init (bundle + connect)');
      const parallelStartTime = Date.now();

      await Promise.all([
        // Task 1: Initialize bundle runtime for rich persona content
        voiceAgent.initializeBundleRuntime(),
        // Task 2: Connect to LiveKit room
        ctx.connect(),
      ]);

      const parallelDuration = Date.now() - parallelStartTime;
      diag.entry(`Parallel init complete in ${parallelDuration}ms`);

      // Now that bundle is initialized, get the runtime and sync state
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
      const musicResult = await setupMusicHandler({
        room: ctx.room,
        session,
        services,
        sessionPersona,
        conversationManager,
      });

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
      // STEP 7a2: INITIALIZE ADVANCED HUMANIZATION
      // Voice print learning, cross-session memory, breathing sync
      // ===============================================
      try {
        const userId = services.userId || 'anonymous';

        // Initialize prosody bridge for this session
        initProsodyBridge(sessionId, userId);

        // Start humanization session (voice agent integration)
        startHumanizationSession(sessionId, userId, sessionPersona.id, {
          relationshipStage: services.userProfile?.relationshipStage as
            | 'stranger'
            | 'acquaintance'
            | 'friend'
            | 'trusted_advisor'
            | undefined,
        });

        // Start analytics tracking for this session
        const { humanizationAnalytics } = await import('../conversation/humanization/analytics.js');
        humanizationAnalytics.startSession(sessionId, userId);

        // Initialize ADVANCED HUMANIZATION (10 deep capabilities)
        // This coordinates: Subtext Detection, Emotional Aftercare, Conversational Repair,
        // Hope Injection, Curiosity Engine, Energy Regulation, Micro-Affirmations,
        // Temporal Context, Relationship Events, and Paradoxical Intervention
        const { initAdvancedHumanizationSession } =
          await import('./processors/injection-builders.js');
        const advancedHumanizationStart = await initAdvancedHumanizationSession(sessionId, userId, {
          relationshipDepth:
            (services.userProfile?.relationshipStage as
              | 'new'
              | 'developing'
              | 'established'
              | 'deep'
              | undefined) || 'new',
        });
        if (advancedHumanizationStart) {
          diag.state('🌟 Advanced humanization initialized', {
            hasGreeting: !!advancedHumanizationStart.greeting,
            hasMilestone: !!advancedHumanizationStart.milestoneAcknowledgment,
          });
        }

        // Load persisted humanization data (voice print, cross-session memory)
        const restored = await initHumanizationPersistence(userId, sessionId);
        if (restored.loaded) {
          diag.state('🎭 Humanization state restored', {
            voicePrint: restored.voicePrintRestored,
            crossSession: restored.crossSessionRestored,
            comfort: restored.comfortRestored,
          });
        }
      } catch (humanizationInitErr) {
        // Non-critical - humanization will work without persistence
        diag.debug('Humanization init (non-critical)', { error: String(humanizationInitErr) });
      }

      // ===============================================
      // STEP 7b: INITIALIZE FRONTEND PUBLISHER
      // ===============================================
      // Centralized real-time communication with the frontend
      const { initializeFrontendPublisher, getFrontendPublisher } =
        await import('./realtime/index.js');
      const _frontendPublisher = initializeFrontendPublisher(ctx.room); // Initialized for side effects
      diag.state('Frontend publisher initialized');

      // Initialize frontend signal service for lower layers
      const { initFrontendSignal } = await import('../services/frontend-signal.js');
      initFrontendSignal(async (type, data) => {
        const publisher = getFrontendPublisher();
        if (publisher.isConnected()) {
          await publisher.sendData(type, data ?? {});
        }
      });

      // ===============================================
      // 🌉 HUMANIZATION SIGNAL EMITTER
      // Bridges backend humanization to frontend EQ
      // Enables avatar to respond BEFORE words arrive
      // ===============================================
      const { initHumanizationSignalEmitter } =
        await import('../services/humanization/humanization-signal-emitter.js');
      initHumanizationSignalEmitter(async (type, payload) => {
        const publisher = getFrontendPublisher();
        if (publisher.isConnected()) {
          await publisher.sendData(type, payload);
        }
      });
      diag.state('Humanization signal emitter initialized');

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
      // Extracted to voice-agent/greeting-handler.ts for maintainability
      await generateAndSpeakGreeting({
        sessionPersona,
        services,
        userData,
        sessionId,
        userId,
        userName,
        isReturningUser,
        bundleRuntime,
        utilitiesProactiveOpener: utilitiesProactiveOpener ?? undefined,
        session,
        tagGreeting,
      });

      diag.section('SESSION INITIALIZED');
      diag.session('Session ready', {
        sessionId,
        persona: sessionPersona.id,
        personaName: sessionPersona.name,
        userName: userData.name,
        isReturningUser,
      });

      // ===============================================
      // STEP 8a: INITIALIZE ADVANCED VOICE HUMANIZATION
      // ===============================================
      initializeFlags(); // Initialize feature flags
      const voiceFlags = getSessionFlags(sessionId);

      if (voiceFlags.enableMetrics) {
        recordSessionStart(sessionId);
        diag.session('📊 Voice humanization metrics enabled');
      }

      // Initialize unified speech pipeline metrics
      initializeSpeechMetrics(sessionId, sessionPersona.id);
      diag.session('📊 Speech pipeline metrics initialized');

      // User Analytics: Track session for DAU/WAU/MAU metrics
      const visitorId = services.userId || 'anonymous';
      const isSubscriber = (services.userProfile?.subscription?.tier ?? 'free') !== 'free';
      void recordUserSessionStart(sessionId, visitorId, sessionPersona.id, isSubscriber).catch(
        (err) => diag.warn('📊 User analytics session start failed', { error: String(err) })
      );

      // Initialize response anticipation for monitoring
      if (voiceFlags.enableResponseAnticipation) {
        const anticipator = getResponseAnticipationService(sessionId);
        anticipator.setPersona(sessionPersona.id);
        recordFeatureUsage(sessionId, 'responseAnticipation', true);
        diag.session('⚡ Response anticipation initialized (monitoring mode)', {
          useCachedResponses: voiceFlags.useCachedResponses,
        });
      }

      // Initialize enhanced turn prediction
      if (voiceFlags.enableEnhancedTurnPrediction) {
        getEnhancedTurnPredictor(sessionId); // Pre-initialize
        recordFeatureUsage(sessionId, 'enhancedTurnPrediction', true);
        diag.session('🎯 Enhanced turn prediction initialized');
      }

      // Initialize multi-signal laughter detection
      if (voiceFlags.enableMultiSignalLaughter) {
        const laughterDetector = getMultiSignalLaughterDetector(sessionId);
        laughterDetector.updateContext({ conversationPhase: 'greeting' });
        recordFeatureUsage(sessionId, 'multiSignalLaughter', true);
        diag.session('😂 Multi-signal laughter detection initialized');
      }

      // Initialize word-timing rhythm service
      if (voiceFlags.enableWordTimingRhythm) {
        getWordTimingRhythmService(sessionId); // Pre-initialize
        recordFeatureUsage(sessionId, 'wordTimingRhythm', true);
        diag.session('🎵 Word-timing rhythm service initialized');
      }

      // Initialize FFT analyzer
      if (voiceFlags.enableFftAnalysis) {
        getFFTAnalyzer(sessionId); // Pre-initialize
        recordFeatureUsage(sessionId, 'fftAnalysis', true);
        diag.session('📊 FFT spectral analyzer initialized');
      }

      diag.session('🎤 Advanced voice humanization ready', {
        flags: {
          fft: voiceFlags.enableFftAnalysis,
          turnPrediction: voiceFlags.enableEnhancedTurnPrediction,
          laughter: voiceFlags.enableMultiSignalLaughter,
          rhythm: voiceFlags.enableWordTimingRhythm,
          anticipation: voiceFlags.enableResponseAnticipation,
        },
      });

      // ===============================================
      // STEP 8b: LISTEN FOR FRONTEND HANDOFF REQUESTS
      // ===============================================
      // Extracted to voice-agent/data-channel-handler.ts for maintainability
      const dataChannelResult = setupDataChannelHandler({
        room: ctx.room,
        session,
        services,
        sessionPersona,
        userId,
        sessionId,
        voiceAgentRef,
      });

      // ===============================================
      // STEP 9: CONNECTION MONITORING & CLEANUP
      // ===============================================
      // FIX: Monitor connection state to detect and log connection issues
      // This helps diagnose "agent cutting out" issues
      ctx.room.on('connectionStateChanged', (state: ConnectionState) => {
        const stateName = ConnectionState[state] || String(state);
        diag.session('🔌 Room connection state changed', { state: stateName, sessionId });

        if (state === ConnectionState.CONN_RECONNECTING) {
          diag.warn('🔌 Room reconnecting - agent may be temporarily unresponsive', { sessionId });
        } else if (state === ConnectionState.CONN_DISCONNECTED) {
          diag.warn('🔌 Room disconnected unexpectedly', { sessionId });
        } else if (state === ConnectionState.CONN_CONNECTED) {
          diag.session('🔌 Room connected/reconnected', { sessionId });
        }
      });

      // FIX: Listen for room errors that could cause silent failures
      ctx.room.on('reconnecting', () => {
        diag.warn('🔌 Room is reconnecting...', { sessionId });
      });

      ctx.room.on('reconnected', () => {
        diag.session('🔌 Room reconnected successfully', { sessionId });
      });

      ctx.room.on('disconnected', () => {
        void (async () => {
          // FIX BUG #15: Remove dataReceived handler to prevent memory leaks
          dataChannelResult.cleanup();

          // FIX BUG #42: Remove handoffEvents listener to prevent memory leaks
          handoffEvents.off('voiceSwitch', wrappedHandoffHandler);

          // Clean up cameo handlers to prevent memory leaks
          if (cleanupCameoHandlers) {
            cleanupCameoHandlers();
          }

          // FIX GAP 7: Clean up handoff session state (queue, timeout timer)
          try {
            const { clearHandoffSessionState } = await import('./shared/handoff-handler.js');
            clearHandoffSessionState(sessionId);
            diag.session('Handoff session state cleaned up');
          } catch (handoffCleanupErr) {
            diag.warn('Handoff session state cleanup failed (non-fatal)', {
              error: String(handoffCleanupErr),
            });
          }

          // FIX GAP 7: Clean up cameo session state (timer, history)
          try {
            const { resetSessionState } = await import('../services/cameo/index.js');
            resetSessionState(sessionId);
            diag.session('Cameo session state cleaned up');
          } catch (cameoCleanupErr) {
            diag.warn('Cameo session state cleanup failed (non-fatal)', {
              error: String(cameoCleanupErr),
            });
          }

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

            // ================================================================
            // FIRST TASTE TRIAL: Record session time for trial users
            // ================================================================
            if (userData.isTrialUser && userId) {
              try {
                const sessionDurationMs = Date.now() - services.sessionStartTime;
                await recordTrialTime(userId, sessionDurationMs);
                diag.session('Trial time recorded', {
                  userId,
                  sessionDurationMs,
                  wasFirstConversation: userData.isFirstConversation,
                });
              } catch (trialErr) {
                diag.warn('Trial time recording failed (non-fatal)', { error: String(trialErr) });
              }
            }

            // 🎧 DJ Integration: Save session summary for cross-session callbacks
            try {
              const dj = getDJIntegration();
              const djSummary = dj.getSessionSummary();
              if (djSummary.musicArtists.length > 0 && services.userProfile) {
                // Update music memory for next session's "Remember when we listened to..."
                const existingMemory = services.userProfile.musicMemory;
                services.userProfile.musicMemory = {
                  favoriteGenres: existingMemory?.favoriteGenres || [],
                  dislikedArtists: existingMemory?.dislikedArtists || [],
                  lastPlayedTrack: existingMemory?.lastPlayedTrack,
                  preferredMusicTimes: existingMemory?.preferredMusicTimes,
                  musicMoods: existingMemory?.musicMoods,
                  updatedAt: new Date(),
                  favoriteArtists: [
                    ...new Set([
                      ...(existingMemory?.favoriteArtists || []),
                      ...djSummary.musicArtists,
                    ]),
                  ].slice(-10), // Keep last 10 artists
                  lastPlayedArtist: djSummary.musicArtists[djSummary.musicArtists.length - 1],
                  totalTracksPlayed:
                    (existingMemory?.totalTracksPlayed || 0) + djSummary.musicArtists.length,
                };
                diag.session('🎧 DJ session summary saved', {
                  topics: djSummary.topics.length,
                  artists: djSummary.musicArtists.length,
                });
              }
            } catch (djErr) {
              diag.warn('🎧 DJ summary save failed (non-fatal)', { error: String(djErr) });
            }

            // 🎧 Music handler: Clean up timers
            try {
              musicResult.clearTimers();
              diag.session('🎧 Music handler timers cleaned up');
            } catch (timerErr) {
              diag.warn('🎧 Music timer cleanup failed (non-fatal)', { error: String(timerErr) });
            }

            // 🎧 DJ Booth: Clean up audio orchestration
            try {
              resetDJBooth();
              diag.session('🎧 DJ Booth cleaned up');
            } catch (boothErr) {
              diag.warn('🎧 DJ Booth cleanup failed (non-fatal)', { error: String(boothErr) });
            }

            // 🎤 Voice Humanization: Clean up session-specific state
            if (voiceHumanization) {
              try {
                voiceHumanization.cleanup();
                diag.session('🎤 Voice humanization cleaned up');
              } catch (vhErr) {
                diag.warn('🎤 Voice humanization cleanup failed (non-fatal)', {
                  error: String(vhErr),
                });
              }
            }

            // 🎤 Advanced Voice Humanization: Clean up all services
            try {
              // Record session end in metrics
              recordSessionEnd(sessionId);

              // User Analytics: Record session end for DAU/WAU/MAU metrics
              void recordUserSessionEnd(sessionId, userData.turnCount || 0, []).catch((err) =>
                diag.warn('📊 User analytics session end failed', { error: String(err) })
              );

              // 🌍 Unregister TTS for accent changes
              unregisterSessionTTS(sessionId);

              // Reset all advanced services
              resetFFTAnalyzer(sessionId);
              resetEnhancedTurnPredictor(sessionId);
              resetMultiSignalLaughterDetector(sessionId);
              resetWordTimingRhythmService(sessionId);
              resetResponseAnticipationService(sessionId);

              // Finalize unified speech metrics and cleanup dynamic speed
              logMetricsSummary(sessionId);
              finalizeSpeechMetrics(sessionId, true);
              cleanupDynamicSpeed(sessionId);

              diag.session('🎤 Advanced voice humanization services cleaned up');
            } catch (advVhErr) {
              diag.warn('🎤 Advanced voice humanization cleanup failed (non-fatal)', {
                error: String(advVhErr),
              });
            }

            // Save trust profiles (boundaries, growth, callbacks, etc.)
            if (userId) {
              try {
                await saveTrustProfiles(userId);
                diag.session('Trust profiles saved', { userId });
              } catch (trustErr) {
                diag.warn('Trust profile save failed (non-fatal)', { error: String(trustErr) });
              }

              // 🧠 Save superhuman intelligence data (memories, patterns, learning)
              try {
                const { getFirestoreStore } = await import('../memory/firestore-store.js');
                const superhumanStore = createFirestoreSuperhumanStore(async () => {
                  const store = getFirestoreStore();
                  if (!store) throw new Error('Firestore not initialized');
                  return store as unknown as {
                    collection: (name: string) => {
                      doc: (id: string) => {
                        get: () => Promise<{ exists: boolean; data: () => unknown }>;
                        set: (data: unknown, opts?: { merge?: boolean }) => Promise<void>;
                        delete: () => Promise<void>;
                      };
                    };
                  };
                });
                await saveSuperhumanData(userId, sessionId, superhumanStore);
                diag.session('🧠 Superhuman intelligence saved', { userId });
              } catch (superhumanErr) {
                diag.warn('Superhuman data save failed (non-fatal)', {
                  error: String(superhumanErr),
                });
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

            // ================================================================
            // HUMAN-FIRST 2FA: End identity session
            // Cleanup identity tracking and save any pending state
            // ================================================================
            try {
              const { onSessionEnd } =
                await import('../services/trust-and-identity/voice-agent-integration.js');
              await onSessionEnd(sessionId);
              diag.session('🔐 Identity session ended');
            } catch (identityEndErr) {
              diag.warn('Identity session end failed (non-fatal)', {
                error: String(identityEndErr),
              });
            }

            // ================================================================
            // 🌍 WORLD AWARENESS: Clean up cached world data
            // ================================================================
            try {
              const { cleanupWorldAwareness } =
                await import('../services/world-awareness/session-integration.js');
              const userId = services?.userId || 'anonymous';
              cleanupWorldAwareness(userId);
              diag.session('🌍 World awareness cleaned up');
            } catch (worldCleanupErr) {
              diag.debug('World awareness cleanup failed (non-fatal)', {
                error: String(worldCleanupErr),
              });
            }

            // ================================================================
            // 🌟 PERSONAL JOURNEY: Clean up cached journey data
            // ================================================================
            try {
              const { cleanupPersonalJourney } =
                await import('../services/personal-journey/session-integration.js');
              const userId = services?.userId || 'anonymous';
              cleanupPersonalJourney(userId);
              diag.session('🌟 Personal journey cleaned up');
            } catch (journeyCleanupErr) {
              diag.debug('Personal journey cleanup failed (non-fatal)', {
                error: String(journeyCleanupErr),
              });
            }

            // ================================================================
            // ADVANCED HUMANIZATION: Persist state for next session
            // Saves voice print, cross-session memory, comfort progression
            // ================================================================
            try {
              const userId = services?.userId || 'anonymous';

              // End humanization session
              endHumanizationSession(sessionId);

              // End analytics session and get stats
              const { humanizationAnalytics } =
                await import('../conversation/humanization/analytics.js');
              const analyticsStats = humanizationAnalytics.endSession(sessionId);
              if (analyticsStats) {
                diag.session('📊 Humanization analytics', {
                  totalHumanizations: analyticsStats.totalHumanizations,
                  uniqueFeatures: analyticsStats.uniqueFeaturesUsed,
                  avgBreathingSync: analyticsStats.avgBreathingSyncQuality.toFixed(2),
                });
              }

              // Persist humanization data to Firestore
              const saveResult = await saveHumanizationState(userId, sessionId);
              if (saveResult.saved) {
                diag.session('🎭 Humanization state persisted', { items: saveResult.items });
              }

              // Cleanup prosody bridge
              cleanupProsodyBridge(sessionId);
            } catch (humanizationEndErr) {
              diag.warn('Humanization persistence failed (non-fatal)', {
                error: String(humanizationEndErr),
              });
            }

            // ================================================================
            // HUMAN LISTENING PIPELINE: Cleanup
            // Clear stored listening results for this session
            // ================================================================
            try {
              const { clearHumanListeningResult } =
                await import('../intelligence/context-builders/human-listening.js');
              clearHumanListeningResult(sessionId);

              // Also reset the pipeline itself
              const { resetHumanListeningPipeline } =
                await import('../speech/human-listening-pipeline.js');
              resetHumanListeningPipeline(sessionId);
              diag.session('🎧 Human listening session cleaned up');
            } catch (listeningCleanupErr) {
              diag.warn('Human listening cleanup failed (non-fatal)', {
                error: String(listeningCleanupErr),
              });
            }

            // ================================================================
            // DEEP HUMANIZATION: Cleanup
            // Clear session state for arc awareness, monologue, story tracking
            // ================================================================
            try {
              const { cleanupDeepHumanization } =
                await import('../intelligence/context-builders/deep-humanization.js');
              cleanupDeepHumanization(sessionId);
              diag.session('🎭 Deep humanization session cleaned up');
            } catch (deepHumanCleanupErr) {
              diag.warn('Deep humanization cleanup failed (non-fatal)', {
                error: String(deepHumanCleanupErr),
              });
            }

            // ================================================================
            // ADVANCED HUMANIZATION: Cleanup
            // Clear all 10 deep humanization capabilities
            // ================================================================
            try {
              const { cleanupAdvancedHumanizationSession } =
                await import('./processors/injection-builders.js');
              await cleanupAdvancedHumanizationSession(sessionId);
              diag.session('🌟 Advanced humanization session cleaned up');
            } catch (advHumanCleanupErr) {
              diag.warn('Advanced humanization cleanup failed (non-fatal)', {
                error: String(advHumanCleanupErr),
              });
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

// Only do background initialization in main process
// Child processes use prewarm() for initialization
if (!process.send) {
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
}

// ============================================================================
// WORKER STARTUP
// ============================================================================

// Static agent name - persona is selected per-session via dispatch metadata
const agentName = process.env.AGENT_NAME || 'voice-agent';

diag.section('STARTING WORKER');
diag.info('Worker configuration', { defaultPersonaId: DEFAULT_PERSONA_ID, agentName });

// ============================================================================
// GRACEFUL SHUTDOWN HANDLER
// ============================================================================
import { registerShutdownSignalHandlers } from './shared/shutdown-handler.js';
registerShutdownSignalHandlers();

// Only run cli.runApp in the main process, not in child processes
// Child processes are spawned by LiveKit and import this module to get prewarm/entry
// process.send is only defined in child processes (IPC channel to parent)
if (!process.send) {
  cli.runApp(
    new WorkerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName,
      // Enable production mode for proper settings (port, load thresholds)
      production: true,
      // DISABLED: numIdleProcesses: 1 was causing Ferni to go silent (performance issue)
      // Process prewarming may cause memory pressure or state issues in Cloud Run
      // Re-enable with caution after investigating - see bug hunt 2025-12-11
      numIdleProcesses: 0,
      // Increase timeout for heavy initialization (bundles + startup + services)
      // The prewarm function calls startup() which does 10+ async operations:
      // - memory system (Firestore), services, bundles, schedulers,
      // - team handlers, community insights, agent evolution, analytics, persistence
      // Cold start can take 180-240s on busy clusters; set to 300s for safety margin
      initializeProcessTimeout: 300 * 1000, // 300 seconds (5 minutes)
    })
  );

  diag.info('CLI.runApp called - worker running');
} else {
  diag.info('Child process detected - skipping cli.runApp');
}
