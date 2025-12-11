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
console.log('[voice-agent] MODULE START', {
  pid: process.pid,
  isChild: !!process.send,
  time: new Date().toISOString(),
});

// ============================================================================
// EARLY STARTUP LOGGING
// Uses console.log intentionally as LiveKit logger isn't initialized yet
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
import { TextDecoder, TextEncoder } from 'node:util';
import { tagTextWithSsmlPersonaAware } from '../ssml/index.js';
import { DEBUG_STARTUP, earlyLog } from './shared/early-logger.js';

console.log('[voice-agent] After early-logger import', { pid: process.pid });

earlyLog.info('=== VOICE-AGENT MODULE LOADING ===', {
  nodeVersion: process.version,
  personaId: process.env['PERSONA_ID'] || '(default)',
});

console.log('[voice-agent] Importing @google/genai...', { pid: process.pid });
console.log('[voice-agent] Importing @livekit/agents...', { pid: process.pid });
console.log('[voice-agent] Importing google plugin...', { pid: process.pid });
console.log('[voice-agent] Importing silero plugin...', { pid: process.pid });
console.log('[voice-agent] Importing noise-cancellation...', { pid: process.pid });
console.log('[voice-agent] Importing dotenv...', { pid: process.pid });
console.log('[voice-agent] Core imports complete', { pid: process.pid });
// Voice authentication - speaker change detection (available for future integration)
import {
  getSpeakerChangeDetector,
  type SpeakerChangeEvent,
} from '../services/voice-speaker-change.js';

// Shared Agent Utilities (used by ALL agents)
import { PROCESSING_TIMEOUTS, SILENCE_THRESHOLDS } from './shared/constants.js';
import { hasSsmlTags, startHealthCheckServer, type UserData } from './shared/index.js';

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
import { getThinkingFiller, resetCatchphraseTracking } from '../speech/response-naturalness.js';

// Graceful error handling for dead air prevention
import { getGracefulErrorResponse } from '../intelligence/conversation-quality.js';

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
import { createSessionServices, initializeServices } from '../services/index.js';

// First Taste Trial - "Better than Human" free trial experience
import {
  checkTrialStatus,
  getTrialWelcomePrompt,
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
  // Phase 14: Life Events
  detectLifeEvents,
  onSessionStart as loadTrustProfiles,
  recordEmotionData,
  // Phase 17: Sentiment Timeline
  recordEmotionalSnapshot,
  // Phase 27: Learning Style
  recordLearningSignals,
  recordTopicData,
  // Phase 24: Voice Prosody Learning - BETTER-THAN-HUMAN baseline building
  recordVoiceSample,
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

// 🎧 DJ Integration - Radio show experience (intros, outros, music moments)
import { getDJIntegration } from './dj-integration.js';

// 🎧 DJ Booth - Audio-level orchestration (ducking, fading, timing)
// This handles the "sound engineering" while DJ Integration handles "what to say"
import { getDJBooth, initializeDJBooth, resetDJBooth, type DJBooth } from '../audio/index.js';

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
import { deprecationService } from '../tools/deprecation.js';
import { dynamicToolLoader } from '../tools/dynamic-loader.js';
import {
  feedbackCollector,
  type ConversationContext as FeedbackContext,
} from '../tools/feedback-collector.js';
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
  getActiveListeningEngine,
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
import { setHumanListeningResult } from '../intelligence/context-builders/human-listening.js';
import { getHumanListeningPipeline } from '../speech/human-listening-pipeline.js';

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
  recordCacheAttempt,
  recordFeatureUsage,
  recordLatency,
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
import {
  checkForAccentChange,
  registerSessionTTS,
  unregisterSessionTTS,
} from '../api/session-accent-routes.js';

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

// Cameo system (for team member pop-ins)
import { registerCameoHandlers } from './shared/cameo-handler.js';

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

    // ================================================================
    // EXTENSIBILITY: Slash command detection
    // Check if user is invoking a slash command like "/daily-check-in"
    // Note: We don't return early - the LLM still needs to respond based on injected context
    // ================================================================
    const trimmedText = userText.trim();
    let isSlashCommand = false;
    if (trimmedText.startsWith('/')) {
      isSlashCommand = await this.handleSlashCommand(trimmedText, turnCtx);
      // If it's a valid command, context was injected. Continue to let LLM respond.
      // If not valid, continue normal processing.
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
      const { userId } = services;
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

  // ============================================================================
  // EXTENSIBILITY: SLASH COMMAND HANDLING
  // ============================================================================

  /**
   * Handle slash commands like "/daily-check-in" or "/weekly-review"
   * Returns true if the command was handled, false if not a valid command
   */
  private async handleSlashCommand(text: string, turnCtx: llm.ChatContext): Promise<boolean> {
    try {
      // Parse command: "/command-name arg1 arg2" -> commandName, args
      const match = text.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
      if (!match) {
        return false; // Not a valid command format
      }

      const commandId = match[1];
      const argsString = match[2] || '';

      // Get user context
      const userData = this.getUserDataFromContext();
      const services = userData?.services;

      if (!services) {
        this.logger.warn('No services available for command execution');
        return false;
      }

      // Execute the command via extensibility integration
      const { executeCommand, getCommands } =
        await import('../personas/bundles/extensibility-integration.js');

      // Check if this persona has this command
      const commands = await getCommands(this.persona.id);
      const command = commands.find(
        (c) => c.id === commandId || c.name.toLowerCase() === commandId.toLowerCase()
      );

      if (!command) {
        // Not a valid command for this persona - let normal processing handle it
        return false;
      }

      // Parse arguments (simple key=value format for now)
      const args: Record<string, string> = {};
      const argMatches = argsString.matchAll(/(\w+)=["']?([^"'\s]+)["']?/g);
      for (const argMatch of argMatches) {
        args[argMatch[1]] = argMatch[2];
      }

      this.logger.info({ commandId, args, personaId: this.persona.id }, 'Executing slash command');

      const result = await executeCommand(this.persona.id, commandId, args, {
        userId: services.userId,
        sessionId: services.sessionId,
      });

      if (!result.success) {
        this.logger.error({ error: result.error, commandId }, 'Command execution failed');
        // Inject error message as context for LLM to handle gracefully
        turnCtx.addMessage({
          role: 'system',
          content: `[COMMAND ERROR] The user invoked /${commandId} but it failed: ${result.error}. Please acknowledge the issue gracefully and offer to help another way.`,
        });
        return true; // Still handled - LLM will respond about the error
      }

      // Inject the command's rendered prompt as context
      if (result.prompt) {
        turnCtx.addMessage({
          role: 'system',
          content: `[SLASH COMMAND: /${commandId}]\n${result.prompt}`,
        });
      }

      this.logger.info({ commandId }, 'Slash command executed successfully');
      return true; // Command was handled, LLM will respond based on injected context
    } catch (error) {
      this.logger.error({ error: String(error), text }, 'Error handling slash command');
      return false; // Let normal processing handle it
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
      persona: PERSONA.id,
      personaName: PERSONA.name,
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
        // Minimal initialization - just services, not full startup
        // This ensures we can handle the job even if prewarm failed
        await initializeServices(true);
        diag.entry('Fallback initialization complete');
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

          // 🚀 FERNI EQ: Track userId globally for trust systems (Our Songs, etc.)
          (globalThis as unknown as { __ferniCurrentUserId?: string }).__ferniCurrentUserId =
            userId;

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

          // ===============================================
          // HUMAN-FIRST 2FA: Start identity session
          // This enables magic moment detection, trust levels,
          // and natural phone collection throughout the session
          // ===============================================
          try {
            const { onSessionStart } =
              await import('../services/trust-and-identity/voice-agent-integration.js');
            const identityResult = await onSessionStart(sessionId, metadata, null);

            diag.session('🔐 Identity session started', {
              trustLevel: identityResult.identityContext.trustLevel,
              hasPhone: identityResult.identityContext.hasPhone,
              voiceConfidence: identityResult.identityContext.voiceConfidence,
              relationshipStage: identityResult.identityContext.relationshipStage,
            });

            // Store identity context in metadata for later use
            (metadata as Record<string, unknown>).__identityContext =
              identityResult.identityContext;

            // ===============================================
            // 🌍 WORLD AWARENESS: Pre-warm world context cache
            // "Better Than Human" - Ferni already knows what's happening
            // Weather, news, sports, holidays - all pre-fetched
            // Note: User profile loaded later; interests tracked dynamically
            // ===============================================
            try {
              const { initWorldAwareness } =
                await import('../services/world-awareness/session-integration.js');
              // Fire and forget - don't block on this
              // identification.profile may have basic user data at this point
              void initWorldAwareness(
                identityResult.identityContext.userId,
                identification.profile || null
              );
              diag.session('🌍 World awareness initialized');
            } catch (worldErr) {
              diag.debug('World awareness init failed (non-fatal)', { error: String(worldErr) });
            }

            // ===============================================
            // 🌟 PERSONAL JOURNEY: Initialize rhythm, milestones, chapters
            // "Better Than Human" - Ferni remembers YOUR journey
            // Milestones, streaks, seasonal memories, life chapters
            // ===============================================
            try {
              const { initPersonalJourney } =
                await import('../services/personal-journey/session-integration.js');
              // Fire and forget - don't block on this
              void initPersonalJourney(
                identityResult.identityContext.userId,
                identification.profile || null
              );
              diag.session('🌟 Personal journey awareness initialized');
            } catch (journeyErr) {
              diag.debug('Personal journey init failed (non-fatal)', { error: String(journeyErr) });
            }
          } catch (identityErr) {
            diag.warn('Identity session start failed (non-fatal)', { error: String(identityErr) });
          }

          // ===============================================
          // VOICE AUTHENTICATION: Initialize speaker change detection
          // This enables automatic detection when a different person starts speaking
          // ===============================================
          try {
            const speakerChangeDetector = getSpeakerChangeDetector(sessionId);
            speakerChangeDetector.on('speaker_changed', (event: SpeakerChangeEvent) => {
              diag.session('👥 Speaker change detected', {
                previousSpeaker: event.previousSpeakerId,
                newSpeaker: event.currentSpeakerId,
                confidence: event.confidence,
                isNewSpeaker: event.isNewSpeaker,
              });

              // Notify frontend of speaker change (for UI indicator)
              ctx.room.localParticipant
                ?.publishData(
                  new TextEncoder().encode(
                    JSON.stringify({
                      type: 'speaker_changed',
                      previousSpeakerId: event.previousSpeakerId,
                      currentSpeakerId: event.currentSpeakerId,
                      confidence: event.confidence,
                      isNewSpeaker: event.isNewSpeaker,
                      timestamp: Date.now(),
                    })
                  ),
                  { reliable: true }
                )
                .catch(() => {
                  /* ignore */
                });

              // 🔐 Trigger identity re-evaluation on speaker change
              void (async () => {
                try {
                  const { onUserMessage } =
                    await import('../services/trust-and-identity/voice-agent-integration.js');
                  // Process as a "speaker change" event - the message indicates a verification need
                  const identityUpdate = await onUserMessage(
                    sessionId,
                    `[SPEAKER_CHANGE: ${event.previousSpeakerId} -> ${event.currentSpeakerId}]`,
                    0 // No emotional intensity for system messages
                  );

                  if (identityUpdate.requiresVerification ?? false) {
                    diag.session('🔐 Speaker change requires verification', {
                      newSpeaker: event.currentSpeakerId,
                      confidence: event.confidence,
                    });
                    // Frontend will handle the verification prompt via speaker_changed data message
                  }
                } catch (identityErr) {
                  diag.warn('Speaker change identity update failed', {
                    error: String(identityErr),
                  });
                }
              })();
            });
            speakerChangeDetector.start(userId);
            diag.session('🎤 Speaker change detection initialized');
          } catch (speakerChangeErr) {
            diag.warn('Speaker change detection init failed (non-fatal)', {
              error: String(speakerChangeErr),
            });
          }
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
      // 🌍 INTERNATIONAL ACCENT SUPPORT
      // Detect and set user's preferred English accent for TTS
      // ===============================================
      let userAccent: 'american' | 'british' | 'australian' | 'indian' = 'american';
      try {
        if (ctx.job.metadata) {
          const metadata = JSON.parse(ctx.job.metadata);
          const { detectAccentFromLocale, detectAccentFromLocales, isValidAccent } =
            await import('../config/voice-accents.js');

          // Priority 1: Explicit accent preference from user settings
          if (metadata.preferredAccent && isValidAccent(metadata.preferredAccent)) {
            userAccent = metadata.preferredAccent;
            diag.session('🌍 Using user-selected accent', { accent: userAccent });
          }
          // Priority 2: Detect from user's locale
          else if (metadata.locale) {
            const detection = detectAccentFromLocale(metadata.locale);
            userAccent = detection.accent;
            diag.session('🌍 Accent detected from locale', {
              locale: metadata.locale,
              accent: userAccent,
              confidence: detection.confidence,
            });
          }
          // Priority 3: Detect from browser locales array
          else if (metadata.locales && Array.isArray(metadata.locales)) {
            const detection = detectAccentFromLocales(metadata.locales);
            userAccent = detection.accent;
            diag.session('🌍 Accent detected from locales', {
              locales: metadata.locales,
              accent: userAccent,
              confidence: detection.confidence,
            });
          }
        }
      } catch (accentErr) {
        diag.debug('Accent detection failed (using default American)', {
          error: String(accentErr),
        });
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
      // Track tool calls in conversation state for orchestration
      // Also record analytics for tool usage optimization
      session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
        void (async () => {
          const toolStartTime = Date.now();

          // Debug logging (can be disabled in production)
          if (DEBUG_STARTUP) {
            logger.debug(
              { event: 'FunctionToolsExecuted' },
              '🔧 [TOOLS] FunctionToolsExecuted event'
            );
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

          // 🌍 Check for mid-session accent changes
          // This applies any pending accent change before the agent speaks
          void checkForAccentChange(sessionId).catch((accentErr) => {
            diag.warn('Mid-session accent check failed', { error: String(accentErr) });
          });

          // 🎧 DJ BOOTH: Notify agent speaking - smooth ducking with timing
          // The DJ Booth handles volume fading (not abrupt duck/unduck)
          const booth = getDJBooth();
          if (booth) {
            // 🎵 THINKING MUSIC: Stop thinking music when agent starts speaking
            // The agent is no longer "thinking" - they have a response!
            booth.onProcessingEnd();
            // DJ Booth will smoothly fade music to talk-over volume
            // and manage timing for when to restore
            diag.state('🎧 Agent speaking - DJ Booth managing music');
          } else {
            // Fallback to basic ducking if DJ Booth not initialized
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
                  diag.state('Ducked background music for agent speech (basic)');
                }
              })
              .catch((e) => log().debug({ error: String(e) }, 'Music ducking (non-critical)'));
          }
        }
        if (event.oldState === 'speaking' && event.newState !== 'speaking') {
          conversationManager.handleAgentFinishedSpeaking(0);

          // 🎧 DJ BOOTH: Notify agent stopped speaking
          const booth = getDJBooth();
          if (booth) {
            booth.onAgentFinishedSpeaking();
            diag.state('🎧 Agent stopped - DJ Booth restoring music');
          } else {
            // Fallback to basic unducking
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
                  diag.state('Unducked background music after agent speech (basic)');
                }
              })
              .catch((e) => log().debug({ error: String(e) }, 'Music unducking (non-critical)'));
          }
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
      //
      // Research basis (see docs/VOICE-HUMANIZATION-RESEARCH.md):
      // - Backchanneling signals active listening and reduces awkward pauses
      // - Triggers after 3s (reduced from 3.5s for faster response)
      // - Min interval 4s (reduced from 5s) for more natural conversation
      const activeListening = getActiveListeningEngine();
      let backchannelTimer: ReturnType<typeof setTimeout> | null = null;
      let lastBackchannelAt = 0;
      const BACKCHANNEL_MIN_INTERVAL_MS = 4000; // Research: 4s feels more natural than 5s
      const BACKCHANNEL_TRIGGER_MS = 3000; // Research: 3s better than 3.5s for responsiveness

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

          // 🎧 DJ BOOTH: User started speaking - duck music to hear them clearly
          const booth = getDJBooth();
          if (booth) {
            booth.onUserStartSpeaking();
            diag.state('🎧 User speaking - DJ Booth ducking music');
          }

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

          // 🎧 DJ BOOTH: User stopped speaking - restore music (unless agent is responding)
          const userStopBooth = getDJBooth();
          if (userStopBooth) {
            userStopBooth.onUserStopSpeaking();
            diag.state('🎧 User stopped - DJ Booth managing volume restore');

            // 🎵 THINKING MUSIC: User stopped speaking, agent is "thinking"
            // Start the thinking music timer - it will play after a delay if agent
            // doesn't respond quickly. This fills awkward silences during LLM processing.
            userStopBooth.onProcessingStart();
            diag.state('🎵 User stopped speaking - thinking music scheduled');
          }

          // ================================================================
          // DEAD AIR FIX: Early silence detection
          // If agent hasn't started responding after EARLY_ACKNOWLEDGMENT_SECONDS,
          // speak a quick acknowledgment to fill the silence
          // ================================================================
          const userStoppedAt = Date.now();
          let earlyAckTimer: ReturnType<typeof setTimeout> | null = null;

          earlyAckTimer = setTimeout(() => {
            // Check if agent is still not speaking
            if (!conversationManager.isAgentSpeaking()) {
              // Only fire if we haven't spoken anything else
              const timeSinceStop = Date.now() - userStoppedAt;
              if (timeSinceStop >= SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000 - 100) {
                const filler = getThinkingFiller(sessionPersona.id);
                try {
                  session.say(filler, { allowInterruptions: true });
                  diag.state('🎤 Early acknowledgment (agent processing)', {
                    waitedMs: timeSinceStop,
                    personaId: sessionPersona.id,
                  });
                } catch (e) {
                  logger.debug({ error: e }, 'Failed to say early acknowledgment');
                }
              }
            }
            earlyAckTimer = null;
          }, SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000);

          // Clean up timer if agent starts speaking (via state change listener)
          const cleanupEarlyAck = () => {
            if (earlyAckTimer) {
              clearTimeout(earlyAckTimer);
              earlyAckTimer = null;
            }
          };

          // Listen for agent starting to speak to cancel the early ack
          const agentStateHandler = (agentEvent: { newState: string }) => {
            if (agentEvent.newState === 'speaking') {
              cleanupEarlyAck();
              session.off(voice.AgentSessionEventTypes.AgentStateChanged, agentStateHandler);
            }
          };
          session.on(voice.AgentSessionEventTypes.AgentStateChanged, agentStateHandler);

          // Also clean up after 10 seconds regardless (prevents memory leaks)
          setTimeout(() => {
            cleanupEarlyAck();
            session.off(voice.AgentSessionEventTypes.AgentStateChanged, agentStateHandler);
          }, 10000);

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

              // ============================================================
              // VOICE INSIGHT DELIVERY: "You sound tired today"
              // After silence backchannel, this is a good moment to deliver
              // voice-based observations in a natural way
              // ============================================================
              if (
                userData?.pendingVoiceInsight &&
                !userData.deliveredVoiceInsight &&
                silenceDurationSec >= 4 // Wait for meaningful pause
              ) {
                try {
                  const insight = userData.pendingVoiceInsight;

                  // Only deliver if confidence is high enough
                  if (insight.confidence > 0.6) {
                    session.say(`<break time="300ms"/>${insight.ssml}`, {
                      allowInterruptions: true,
                    });

                    userData.deliveredVoiceInsight = true;
                    userData.pendingVoiceInsight = undefined;

                    diag.state('🎤 Delivered voice state insight', {
                      emotion: insight.emotion,
                      confidence: insight.confidence,
                    });

                    // Track in analytics (async wrapper to avoid await in sync context)
                    void (async () => {
                      const { humanizationAnalytics } =
                        await import('../conversation/humanization/analytics.js');
                      humanizationAnalytics.recordApplied(sessionId, 'voice_print_detection', {
                        emotion: insight.emotion,
                        confidence: insight.confidence,
                      });
                    })();
                  }
                } catch (insightErr) {
                  logger.debug({ error: insightErr }, 'Failed to deliver voice insight');
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
        // ===============================================
        // MICRO-INTERRUPTION DETECTION (Phase 1)
        // Check EVERY transcript (partial or final) for stop words
        // "wait", "hold on", "actually" should stop agent immediately
        // ===============================================
        if (event.transcript && voiceHumanization) {
          const isAgentSpeaking = conversationManager.isAgentSpeaking();
          const microInterrupt = voiceHumanization.processStreamingWord(
            event.transcript,
            isAgentSpeaking
          );

          if (microInterrupt.shouldStopAgent) {
            diag.state('🛑 Micro-interrupt triggered', {
              trigger: microInterrupt.trigger,
              transcript: event.transcript.slice(0, 30),
            });
            // The onInterrupt callback handles the actual interruption
          }
        }

        // ===============================================
        // 🚀 FERNI EQ: ANTICIPATION - Send partial transcripts to frontend
        // Enables "reading the future" - responding before user finishes
        // ===============================================
        if (event.transcript && !event.isFinal && event.transcript.length > 10) {
          // Send partial transcript every ~500ms to avoid spam
          const now = Date.now();
          const lastPartialKey = Symbol.for('ferniLastPartialTime');
          const lastPartialTime = (globalThis as Record<symbol, number>)[lastPartialKey] || 0;
          if (now - lastPartialTime > 500) {
            (globalThis as Record<symbol, number>)[lastPartialKey] = now;
            ctx.room.localParticipant
              ?.publishData(
                new TextEncoder().encode(
                  JSON.stringify({
                    type: 'partial_transcript',
                    text: event.transcript,
                    isFinal: false,
                    timestamp: now,
                  })
                ),
                { reliable: false } // Use unreliable for partial transcripts (low latency)
              )
              .catch(() => {
                // Non-blocking
              });
          }
        }

        // ===============================================
        // RESPONSE ANTICIPATION (Phase 7+ - Monitoring Mode)
        // Analyze partial transcripts for pattern caching
        // ===============================================
        const antFlags = getSessionFlags(sessionId);
        if (antFlags.enableResponseAnticipation && event.transcript) {
          try {
            const anticipator = getResponseAnticipationService(sessionId);
            const startTime = Date.now();

            const anticipation = anticipator.anticipate(event.transcript);

            const latencyMs = Date.now() - startTime;

            if (anticipation && anticipation.confidence > 0.5) {
              // Record metrics
              if (antFlags.enableMetrics) {
                recordCacheAttempt(
                  sessionId,
                  anticipation.isComplete,
                  anticipation.intent,
                  latencyMs
                );
                recordLatency(sessionId, 'anticipation', latencyMs);
              }

              // Log the anticipation (monitoring mode)
              diag.state('⚡ Response anticipation', {
                intent: anticipation.intent,
                confidence: anticipation.confidence.toFixed(2),
                isComplete: anticipation.isComplete,
                isFinal: event.isFinal,
                latencyMs,
              });

              // If using cached responses (not just monitoring) and high confidence
              if (
                antFlags.useCachedResponses &&
                anticipation.isComplete &&
                anticipation.confidence >= antFlags.cacheConfidenceThreshold &&
                event.isFinal
              ) {
                const cached = anticipator.getCompleteResponse();
                if (cached) {
                  diag.state('⚡ CACHE HIT - Would use cached response', {
                    intent: anticipation.intent,
                    response: cached.response.slice(0, 50),
                  });
                  // Note: We could call session.say(cached.ssml) here
                  // but for now we're in monitoring mode
                }
              }
            }
          } catch (_antErr) {
            // Response anticipation is non-critical
          }
        }

        if (event.isFinal && event.transcript) {
          userData.turnCount = (userData.turnCount || 0) + 1;

          // Record turn in voice humanization for rhythm learning
          if (voiceHumanization) {
            voiceHumanization.recordTurn();
          }

          // ===============================================
          // FIRST TASTE TRIAL: Check trial status periodically
          // Inject transition prompt when trial is ending
          // ===============================================
          if (userData.isTrialUser && userId && !userData.hasSpokenTrialEndPrompt) {
            void (async () => {
              try {
                const sessionDurationMs = Date.now() - services.sessionStartTime;
                const trialStatus = await checkTrialStatus(userId, sessionDurationMs);

                // Update userData with latest trial status
                userData.trialStatus = {
                  inTrial: trialStatus.inTrial,
                  timeRemainingMs: trialStatus.timeRemainingMs,
                  approachingEnd: trialStatus.approachingEnd,
                  trialEnded: trialStatus.trialEnded,
                };

                // If trial is ending and we should show transition, inject it
                if (trialStatus.showTransition && trialStatus.transitionPrompt) {
                  userData.hasSpokenTrialEndPrompt = true;
                  diag.session('Trial ending - speaking transition prompt', {
                    timeRemainingMs: trialStatus.timeRemainingMs,
                    trialEnded: trialStatus.trialEnded,
                  });

                  // Speak the transition prompt after the agent's next response
                  // We'll queue it as a follow-up
                  setTimeout(() => {
                    try {
                      // FIX: Prevent double-speaking - only speak if agent is not already speaking
                      if (session && !conversationManager.isAgentSpeaking()) {
                        session.say(trialStatus.transitionPrompt!, { allowInterruptions: true });
                      } else if (session) {
                        // Agent is speaking - retry after another delay
                        setTimeout(() => {
                          try {
                            if (session && !conversationManager.isAgentSpeaking()) {
                              session.say(trialStatus.transitionPrompt!, {
                                allowInterruptions: true,
                              });
                            }
                          } catch {
                            // Ignore retry errors
                          }
                        }, 3000);
                      }
                    } catch (sayErr) {
                      diag.warn('Failed to speak trial transition', { error: String(sayErr) });
                    }
                  }, 2000); // Small delay to let current response finish
                }
              } catch (trialErr) {
                diag.warn('Trial status check failed (non-fatal)', { error: String(trialErr) });
              }
            })();
          }

          // ===============================================
          // 🎧 HUMAN LISTENING PIPELINE - "Better than Human" Analysis
          // ===============================================
          // Analyzes voice tremor, breath patterns, cognitive load,
          // hedging, self-soothing, and more for superhuman emotional awareness
          void (async () => {
            try {
              const pipeline = getHumanListeningPipeline(sessionId);

              // Get prosody features from voice emotion if available
              // This enables audio-based analysis without raw samples
              const prosodyFeatures = userData.voiceEmotion?.prosody
                ? {
                    pitchVariance: userData.voiceEmotion.prosody.pitchVariance,
                    jitter: userData.voiceEmotion.prosody.jitter,
                    shimmer: userData.voiceEmotion.prosody.shimmer,
                    breathiness: userData.voiceEmotion.prosody.breathiness,
                    energyMean: userData.voiceEmotion.prosody.energyMean,
                    energyVariance: userData.voiceEmotion.prosody.energyVariance,
                    speechRate: userData.voiceEmotion.prosody.speechRate,
                    pauseDuration: userData.voiceEmotion.prosody.pauseDuration,
                    pauseFrequency: userData.voiceEmotion.prosody.pauseFrequency,
                    utteranceDuration: userData.voiceEmotion.prosody.utteranceDuration,
                    voiceQuality: userData.voiceEmotion.prosody.voiceQuality,
                  }
                : undefined;

              const listeningResult = await pipeline.analyze({
                sessionId,
                text: event.transcript,
                turnNumber: userData.turnCount || 1,
                currentTopic: userData.lastTopic,
                emotion: userData.lastEmotionAnalysis?.primary,
                emotionalIntensity: userData.lastEmotionAnalysis?.intensity,
                durationMs: userData.voiceEmotion?.prosody?.utteranceDuration,
                prosodyFeatures,
                timeSinceAgentMessage: userData.lastAgentResponseTime
                  ? Date.now() - userData.lastAgentResponseTime
                  : undefined,
              });

              // Store for context builder access
              setHumanListeningResult(sessionId, listeningResult);

              if (listeningResult.possibleDistress) {
                diag.warn('🎧 Human listening: Distress signals detected', {
                  signals: listeningResult.prioritySignals,
                  guidance: listeningResult.agentGuidance,
                });
              } else if (listeningResult.shouldSlowDown) {
                diag.state('🎧 Human listening: User needs slower pace', {
                  assessment: listeningResult.overallAssessment.slice(0, 100),
                });
              }
            } catch (listeningErr) {
              diag.warn('Human listening pipeline error', { error: String(listeningErr) });
            }
          })();

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
          // 🔐 VOICE IDENTITY: Process user message for trust/identity context
          // ===============================================
          // This enables phone collection prompts, verification triggers,
          // and trust-level updates based on conversation content
          void (async () => {
            try {
              const { onUserMessage } =
                await import('../services/trust-and-identity/voice-agent-integration.js');
              const emotionalIntensity = userData?.lastEmotionAnalysis?.intensity ?? 0;
              const identityUpdate = await onUserMessage(
                sessionId,
                event.transcript,
                emotionalIntensity
              );

              if (identityUpdate.shouldAskForContact ?? false) {
                // Store the phone ask script for injection
                diag.state('🔐 Identity: Should ask for contact', {
                  reason: identityUpdate.contactAskReason ?? 'unknown',
                });
              }

              if (identityUpdate.requiresVerification ?? false) {
                diag.state('🔐 Identity: Verification required', {
                  reason: 'Speaker or content change detected',
                });
              }
            } catch (identityErr) {
              // Non-critical - identity processing shouldn't block conversation
              diag.warn('Identity message processing failed', { error: String(identityErr) });
            }
          })();

          // ===============================================
          // 🎧 DJ SESSION FLOW TRACKING & "OUR SONGS"
          // ===============================================
          // Track conversation topics and emotions for session summaries
          // Also detect "Our Songs" moments when music is playing
          void (async () => {
            try {
              const booth = getDJBooth();
              if (!booth) return;

              // Track topics discussed for session summary
              // Extract topics from transcript using simple keyword detection
              const topicKeywords: Record<string, string[]> = {
                work: ['work', 'job', 'boss', 'meeting', 'project', 'deadline', 'office'],
                family: ['mom', 'dad', 'sister', 'brother', 'family', 'kids', 'parents'],
                health: ['health', 'exercise', 'gym', 'doctor', 'sleep', 'tired', 'sick'],
                finances: ['money', 'budget', 'save', 'invest', 'bills', 'debt', 'salary'],
                relationships: [
                  'dating',
                  'relationship',
                  'partner',
                  'friend',
                  'boyfriend',
                  'girlfriend',
                ],
                goals: ['goal', 'dream', 'plan', 'future', 'want to', 'hope to', 'wish'],
                stress: ['stress', 'anxious', 'worried', 'overwhelmed', 'burned out'],
              };

              const transcriptLower = event.transcript.toLowerCase();
              for (const [topic, keywords] of Object.entries(topicKeywords)) {
                if (keywords.some((kw) => transcriptLower.includes(kw))) {
                  booth.trackTopic(topic);
                  diag.state('🎧 Session flow: tracked topic', { topic });
                  break; // Only track first match per message
                }
              }

              // Track emotional moments
              const emotionKeywords: Record<string, string[]> = {
                happy: ['happy', 'excited', 'great', 'amazing', 'wonderful', 'love'],
                sad: ['sad', 'upset', 'miss', 'hurt', 'lonely'],
                anxious: ['anxious', 'worried', 'nervous', 'scared', 'fear'],
                grateful: ['grateful', 'thankful', 'appreciate', 'blessed'],
              };

              for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
                if (keywords.some((kw) => transcriptLower.includes(kw))) {
                  booth.trackEmotion(emotion);
                  diag.state('🎧 Session flow: tracked emotion', { emotion });
                  break;
                }
              }

              // 🎵 "OUR SONGS" - Process user speech during music for meaningful moments
              // This captures shared music experiences that become relationship memories
              if (booth.isPlayingMusic()) {
                const voiceEmotion = userData.voiceEmotion?.primary || undefined;
                booth.processUserSpeechDuringMusic(
                  event.transcript,
                  voiceEmotion,
                  userData.lastTopic
                );
                diag.state('🎵 Processed user speech during music for "Our Songs"', {
                  transcript: event.transcript.slice(0, 50),
                  emotion: voiceEmotion,
                });
              }
            } catch (e) {
              // Session flow tracking is non-critical
              log().debug({ error: String(e) }, 'Session flow tracking error (non-critical)');
            }
          })();

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

            // Process feedback (synchronous)
            try {
              autoOptimizer.processUserMessage(event.transcript, feedbackContext, lastToolId);
            } catch (err) {
              diag.debug('Feedback processing error', { error: String(err) });
            }
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
      // CRITICAL: Initialize music player BEFORE session.start() to prevent race conditions.
      // If we wait until after session.start(), the agent could try to play music
      // before the music player is ready, causing silent "simulation mode" playback.
      const { isMusicEnabled } = await import('../config/environment.js');
      let _djBooth: DJBooth | null = null; // Track for cleanup

      if (ctx.room && isMusicEnabled()) {
        try {
          const { initializeMusicPlayer, getMusicPlayer, getAmbientMusicEndedPhrase } =
            await import('../audio/index.js');
          // Pass the agent session for proper audio mixing with voice
          await initializeMusicPlayer(ctx.room, session);

          // Set up callback for when ambient music ends - agent comes back in
          const player = getMusicPlayer();

          // 🎧 INITIALIZE DJ BOOTH - Audio-level orchestration
          // This gives us smooth volume fading, smart ducking, and timed DJ moments
          // Pass existing music preferences from user profile for cross-session memory (Phase 8)
          const existingMusicPrefs = services.userProfile?.musicMemory
            ? {
                likedArtists: services.userProfile.musicMemory.favoriteArtists || [],
                dislikedArtists: services.userProfile.musicMemory.dislikedArtists || [],
                favoriteGenres: services.userProfile.musicMemory.favoriteGenres || [],
                totalTracksPlayed: services.userProfile.musicMemory.totalTracksPlayed || 0,
                lastPlayed: services.userProfile.musicMemory.lastPlayedTrack
                  ? {
                      artist: services.userProfile.musicMemory.lastPlayedArtist || 'Unknown',
                      track: services.userProfile.musicMemory.lastPlayedTrack,
                      timestamp:
                        services.userProfile.musicMemory.updatedAt?.getTime() || Date.now(),
                    }
                  : undefined,
              }
            : undefined;

          _djBooth = initializeDJBooth(
            {
              personaId: sessionPersona.id,
              speakCallback: (phrase, options) => {
                try {
                  session.say(phrase, options);
                } catch (e) {
                  diag.warn('DJ Booth speak callback failed', { error: String(e) });
                }
              },
              onAgentSpeakStart: () => {
                diag.state('🎧 DJ Booth: Agent speaking (music will duck)');
              },
              onAgentSpeakEnd: () => {
                diag.state('🎧 DJ Booth: Agent stopped (music will restore)');
              },
              // FIX: Prevent double-speaking by providing agent speaking state
              isAgentSpeaking: () => conversationManager.isAgentSpeaking(),
            },
            existingMusicPrefs
          );

          // Set user ID for "Our Songs" trust system tracking
          if (services.userId) {
            _djBooth.setUserId(services.userId);
            diag.state('🎵 DJ Booth user ID set for "Our Songs"', { userId: services.userId });
          }

          diag.state('🎧 DJ Booth initialized with enhancements', {
            persona: sessionPersona.id,
            hasExistingPrefs: !!existingMusicPrefs,
            hasUserId: !!services.userId,
          });
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

              // 🐛 FIX: Forward state changes to DJ Booth (our callback overwrote theirs)
              // The DJ Booth handles post-music check-ins and other DJ behaviors
              if (_djBooth) {
                try {
                  // Access the DJ Booth's internal handler through its callback mechanism
                  // by notifying it of state changes
                  _djBooth.onMusicStateChange(state, track, isAmbient);
                } catch (e) {
                  diag.warn('Failed to forward music state to DJ Booth', { error: String(e) });
                }
              }

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

                // 🎧 DJ Integration: Track music for cross-session callbacks
                try {
                  const dj = getDJIntegration();
                  dj.trackMusicPlayed(track.artist);
                  diag.state('🎧 Tracked music for session', { artist: track.artist });
                } catch (e) {
                  diag.warn('🎧 Failed to track music', { error: String(e) });
                }

                // Clear any existing timers
                clearMusicTimers();

                // 🎵 MUSIC APPRECIATION: Random comments during playback
                // Like a real DJ who's vibing with the music
                appreciationTimer = setInterval(() => {
                  void (async () => {
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
                        const comment =
                          Math.random() < 0.7
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
                  })();
                }, 10000); // Check every 10 seconds

                // 🎯 READ THE ROOM: Check if user is engaged with the music
                readTheRoomTimer = setInterval(() => {
                  void (async () => {
                    try {
                      const { getReadTheRoomAction } = await import('../services/dj-service.js');

                      const now = Date.now();
                      const timeSinceStart = (now - (musicPlaybackStartTime || now)) / 1000;
                      const timeSinceLastCheck = lastReadTheRoomTime
                        ? (now - lastReadTheRoomTime) / 1000
                        : timeSinceStart;

                      // Only check every 60+ seconds
                      if (timeSinceLastCheck > 60) {
                        const action = getReadTheRoomAction(
                          {
                            musicHasBeenPlayingFor: timeSinceStart,
                            userIsSilentDuringMusic: true, // We don't have VAD data here, assume silent
                          },
                          sessionPersona.id
                        );

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
                  })();
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
      diag.session('Step 8: Generating greeting');

      let greeting: string | undefined;

      // ===============================================
      // FIRST TASTE TRIAL: Use special welcome for first-time trial users
      // This creates the "magic first impression" before any friction
      // ===============================================
      if (userData.isFirstConversation && userData.isTrialUser) {
        greeting = getTrialWelcomePrompt();
        diag.session('Using trial welcome prompt for first-time user', {
          userId,
          greeting: `${greeting.slice(0, 50)}...`,
        });
      }

      // Load persona-specific memories for memory-enhanced greetings (skip for trial welcome)
      let personaMemories: PersonaMemoryForGreeting[] = [];
      if (!greeting && isReturningUser && services.userProfile?.id && sessionPersona?.id) {
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

      // Try bundle runtime for enhanced greeting first (skip if trial welcome already set)
      if (!greeting && bundleRuntime) {
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
            // 🌟 Personal Journey: Pass userId for journey-enhanced greetings
            userId: services.userId,
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
      } else if (!greeting) {
        // Standard greeting without bundle - include persona memories and proactive context
        // (Skip if trial welcome was already set)

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
          // 🌟 Personal Journey: Pass userId for journey-enhanced greetings
          userId: services.userId,
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

      // ===============================================
      // STEP 8d: CROSS-SESSION VOICE ACKNOWLEDGMENT
      // Note: This happens AFTER voice data is available (turn 2+)
      // The acknowledgment is stored in userData.pendingCrossSessionAck
      // and delivered after we have voice prosody to compare
      // ===============================================
      // Cross-session ack is now handled in sttNode after voice analysis

      // ===============================================
      // 🎧 DJ INTEGRATION: "Open the Show" moment
      // ===============================================
      // This creates the radio DJ feel - a warm musical opening
      try {
        const dj = getDJIntegration();
        dj.setPersona(sessionPersona.id);

        const djIntroResult = await dj.openShow({
          personaId: sessionPersona.id,
          userId: userId || undefined,
          userName: userData.name || services.userProfile?.name,
          isFirstSession: !isReturningUser,
          sessionCount: services.userProfile?.totalConversations || 0,
          musicHistory: services.userProfile?.musicMemory,
          lastSessionTopics: services.userProfile?.lastConversationSummary
            ? [services.userProfile.lastConversationSummary.slice(0, 100)]
            : undefined,
        });

        // For first-time users or music callbacks, DJ intro may REPLACE the greeting
        if (djIntroResult.shouldReplaceGreeting && djIntroResult.phrase) {
          greeting = djIntroResult.phrase;
          diag.session('🎧 Using DJ intro as greeting', {
            type: djIntroResult.intro.introType,
            playedSound: djIntroResult.playedSound,
          });
        } else if (djIntroResult.playedSound && djIntroResult.intro.delayMs) {
          // Sound played - add a small delay before greeting for timing
          await new Promise<void>((resolve) => {
            setTimeout(resolve, djIntroResult.intro.delayMs);
          });
        }
      } catch (djError) {
        diag.warn('🎧 DJ intro failed (non-fatal)', { error: String(djError) });
      }

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
      // STEP 8a: INITIALIZE ADVANCED VOICE HUMANIZATION
      // ===============================================
      initializeFlags(); // Initialize feature flags
      const voiceFlags = getSessionFlags(sessionId);

      if (voiceFlags.enableMetrics) {
        recordSessionStart(sessionId);
        diag.session('📊 Voice humanization metrics enabled');
      }

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
                // FIX: Pass user profile for unlock validation
                const result = await executeHandoff(canonicalId, 'User requested via UI tap', {
                  userProfile: services.userProfile,
                  subscriptionTier:
                    (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') ||
                    'free',
                });

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
            const { gameType } = message;
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
                session.generateReply({
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
                session.generateReply({
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

          // =====================================================
          // 🎤 VOICE PACK CHANGE REQUEST (from Personalize UI)
          // =====================================================
          if (message.type === 'voice-pack-change') {
            logger.info({ packId: message.packId }, '🎤 User changed voice pack via Personalize');

            try {
              const { handleVoicePackMessage } = await import('../services/voice-pack-service.js');
              handleVoicePackMessage(userId ?? 'anonymous', message);

              // Acknowledge the change
              const ackMessage = JSON.stringify({
                type: 'voice_pack_ack',
                packId: message.packId,
                success: true,
                timestamp: Date.now(),
              });
              await ctx.room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
                reliable: true,
              });

              logger.info({ packId: message.packId }, '🎤 Voice pack updated successfully');
            } catch (voicePackErr) {
              logger.warn({ error: String(voicePackErr) }, 'Voice pack change failed');
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
diag.info('Worker configuration', { defaultPersona: PERSONA.id, agentName });

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
