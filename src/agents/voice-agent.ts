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
// CRITICAL: Check if we're a child process BEFORE heavy imports
// Child processes only need the agent definition, not all the plugins
const IS_CHILD_PROCESS = !!process.send;
if (IS_CHILD_PROCESS) {
  process.stderr.write(
    `[voice-agent] CHILD PROCESS - deferring heavy imports (pid=${process.pid})\n`
  );
}

// Core LiveKit imports - needed for both main and child
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
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

// These imports are deferred and loaded dynamically in functions that need them
// to speed up child process startup (which only needs the agent definition)
import type { Modality as ModalityType } from '@google/genai';
import type * as googleType from '@livekit/agents-plugin-google';
import type * as sileroType from '@livekit/agents-plugin-silero';

// Lightweight imports - fast to load
import { ReadableStream } from 'node:stream/web';
import { TextEncoder } from 'node:util';
import { DEBUG_STARTUP, earlyLog } from './shared/early-logger.js';

process.stderr.write(`[voice-agent] early-logger ready (pid=${process.pid})\n`);

// Heavy imports - only load in main process or when actually needed
let google: typeof googleType | null = null;
let silero: typeof sileroType | null = null;
let Modality: typeof ModalityType | null = null;
let TelephonyBackgroundVoiceCancellation:
  | typeof import('@livekit/noise-cancellation-node').TelephonyBackgroundVoiceCancellation
  | null = null;
let tagTextWithSsmlPersonaAware:
  | typeof import('../ssml/index.js').tagTextWithSsmlPersonaAware
  | null = null;

async function loadHeavyImports(): Promise<void> {
  if (google) return; // Already loaded

  process.stderr.write(`[voice-agent] Loading heavy imports (pid=${process.pid})\n`);
  const start = Date.now();

  const [googleModule, sileroModule, genaiModule, ncModule, ssmlModule] = await Promise.all([
    import('@livekit/agents-plugin-google'),
    import('@livekit/agents-plugin-silero'),
    import('@google/genai'),
    import('@livekit/noise-cancellation-node'),
    import('../ssml/index.js'),
  ]);

  google = googleModule;
  silero = sileroModule;
  Modality = genaiModule.Modality;
  TelephonyBackgroundVoiceCancellation = ncModule.TelephonyBackgroundVoiceCancellation;
  tagTextWithSsmlPersonaAware = ssmlModule.tagTextWithSsmlPersonaAware;

  process.stderr.write(
    `[voice-agent] Heavy imports loaded (${Date.now() - start}ms, pid=${process.pid})\n`
  );
}

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
import { hasSsmlTags, startHealthCheckServer, type UserData } from './shared/index.js';

// Persona System
import { getPersonaAsync, initializeFromBundles, type PersonaConfig } from '../personas/index.js';

// Response naturalness - acknowledgments, catchphrases

// Meaningful Silence System - SilenceContext imported for session state handlers
// (full meaningful-silence imports are in session-state-handler.ts)

// Services Bootstrap
import { initializeServices } from '../services/index.js';

// First Taste Trial - "Better than Human" free trial experience

// Adaptive SSML
import { applyPhasePersonality, tagGreeting } from '../speech/adaptive-ssml.js';

// Conversation Manager
import { getConversationManager } from '../services/conversation-manager.js';

// Trust Systems - "Better than human" trust profile loading and recording
import {
  // Phase 24: Voice Prosody Learning - BETTER-THAN-HUMAN baseline building
  recordVoiceSample,
} from '../services/trust-systems/index.js';

// Simple Utilities - "Better than human" everyday helpers (timers, tips, timezone, etc.)
import { initializeUtilitiesIntegration } from './shared/utilities-integration.js';

// Cognitive Intelligence - Session lifecycle hooks for persistent learning
import { onCognitiveSessionStart } from '../services/cognitive-session-hooks.js';

// 🎧 DJ Booth - Audio-level orchestration (ducking, fading, timing)
import { getDJBooth } from '../audio/index.js';

// Conversation State - Shared context for human-level tool orchestration

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

// Gemini multimodal emotion analysis (experimental feature)
import {
  startEmotionStream,
  clearSession as clearGeminiSession,
} from '../services/emotion-analysis/hume.js';
import { isExperimentalEnabled } from '../config/feature-flags.js';

// Emotion matching - connect prosody to voice response
import {
  applyHumanListeningAdjustments,
  getEmotionModulation,
  wrapWithEmotionProsody,
} from '../speech/emotion-matching.js';

// Conversation dynamics - emotional arc, response length, story timing
import { getEmotionalArcTracker, getResponseDynamicsEngine } from '../conversation/index.js';

// 🎭 UNIFIED CONVERSATION HUMANIZATION (replaces scattered humanization calls)
// NOTE: These are loaded DYNAMICALLY to avoid slowing down agent startup
// The unified integration imports heavy modules that would timeout runner init
// Use: const { initConversationSession } = await import('./integrations/conversation-session-integration.js');

// Legacy humanization imports (for prosody bridge - still needed)
import {
  initializeFromPersistence as initHumanizationPersistence,
  initProsodyBridge,
  processProsodyForHumanization,
} from '../conversation/humanization/index.js';

// 🧠 Superhuman Intelligence Persistence - cross-session learning & memory

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
  getPersonaSpeedProfile,
} from './integrations/dynamic-speed-integration.js';
import { trackEmotionDetection } from './integrations/speech-metrics-integration.js';

// ============================================================================
// ADVANCED VOICE HUMANIZATION (Phase 7+)
// Note: FFT, turn predictor, response anticipation are initialized in
// voice-humanization-init-handler.ts; below imports are still used in
// transcriptionNode/sttNode for runtime access
// ============================================================================

// Multi-signal laughter detection (~85% accuracy)
import { getMultiSignalLaughterDetector } from '../speech/multi-signal-laughter.js';

// Live backchanneling - breath pause detection for "mm-hmm" during user speech
import { getBreathPauseDetector } from '../speech/live-backchanneling/index.js';

// Word-timing rhythm mirroring
import { getWordTimingRhythmService } from '../speech/word-timing-rhythm.js';

// Feature flags for gradual rollout
import { getSessionFlags } from '../config/voice-humanization-flags.js';

// Metrics collection
import { recordLaughterDetection } from '../services/voice-humanization-metrics.js';

// Mid-session accent change support
import { registerSessionTTS } from '../api/session-accent-routes.js';

// Conversation humanizing context builder (speech naturalization, active listening, memory callbacks)

// Engagement System - Real-time engagement data and conversation triggers
import { buildEngagementContextPrompt } from '../services/engagement-conversation-triggers.js';
import { getEngagementDataSender } from '../services/engagement-data-sender.js';
import { getRitualOnboardingService } from '../services/ritual-onboarding.js';

// Handoff system (for multi-persona support)
import { handoffEvents, initializeHandoffContext } from '../tools/handoff/index.js';
import { createHandoffHandler, type VoiceAgentRef } from './shared/handoff-handler.js';

// Cameo system (for team member pop-ins)
import { registerCameoHandlers } from './shared/cameo-handler.js';

// Voice Agent modules (extracted for maintainability)
import {
  createTranscriptHandler,
  generateAndSpeakGreeting,
  handleSessionCleanup,
  handleUserTurn,
  identifyUser,
  initializeSession,
  setupDataChannelHandler,
  setupMusicHandler,
  setupSessionStateHandlers,
  setupToolTrackingHandler,
  setupVoiceHumanizationInit,
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

    // 🔍 DIAGNOSTIC: Check specifically for music tools
    const musicToolNames = toolNames.filter(
      (name) =>
        name.toLowerCase().includes('music') ||
        name.toLowerCase().includes('spotify') ||
        name === 'playMusic' ||
        name === 'pauseMusic'
    );
    logger.info(
      {
        musicToolCount: musicToolNames.length,
        musicTools: musicToolNames,
        hasPlayMusic: toolNames.includes('playMusic'),
        hasMusicControl: toolNames.includes('musicControl'),
        hasMusicInfo: toolNames.includes('musicInfo'),
      },
      '🎵 [DIAG] Music tools in final agent toolset'
    );

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
            // 🔊 AMBIENT AWARENESS: Prepend offer to pause for noisy environments
            // This shows Ferni cares about the user's context
            // ============================================================
            if (userData?.pendingAmbientAcknowledgment) {
              const acknowledgment = userData.pendingAmbientAcknowledgment;
              userData.pendingAmbientAcknowledgment = null; // Clear after use
              
              // Prepend the ambient acknowledgment (only if response isn't already about pausing)
              if (!taggedText.toLowerCase().includes('pause') && 
                  !taggedText.toLowerCase().includes('later') &&
                  !taggedText.toLowerCase().includes('busy')) {
                taggedText = `${acknowledgment} But if you'd like to keep going - ${taggedText}`;
                agent.logger.info(
                  { acknowledgment },
                  '🔊 Offered to pause due to noisy environment'
                );
              }
            }

            // ============================================================
            // 🎭 UNIFIED POST-LLM HUMANIZATION (dynamic import)
            // Uses the unified conversation session for all humanization:
            // - Speech naturalization, vocabulary mirroring
            // - Deep humanization: mood drift, spontaneous thoughts
            // - Superhuman intelligence: concern detection, predictive anticipation
            // - Better-than-human: emotional memory, protective instincts
            // ============================================================
            try {
              // Get session ID from userData
              const agentSessionId =
                (userData?.sessionData as { sessionId?: string } | undefined)?.sessionId ||
                `session-${agent.persona.id}`;

              // Dynamic import to avoid startup timeout
              const { humanizeAgentResponse, recordVulnerabilityEvent } =
                await import('./integrations/conversation-session-integration.js');

              // Use the unified humanization API
              const humanized = await humanizeAgentResponse(agentSessionId, accumulatedText, {
                userMessage: userData?.lastUserMessage || '',
                userEmotion: userData?.lastEmotionAnalysis?.primary,
                topic: userData?.lastTopic,
                isSeriousContext: (userData?.lastEmotionAnalysis?.distressLevel ?? 0) > 0.3,
                wasPersonalSharing: (userData?.lastEmotionAnalysis?.intensity ?? 0) > 0.7,
                sessionData: userData?.sessionData,
              });

              if (humanized) {
                // Use the humanized text
                taggedText = humanized.text;

                // Log what was applied
                if (humanized.appliedFeatures.length > 0) {
                  agent.logger.debug(
                    {
                      features: humanized.appliedFeatures,
                      pacing: humanized.pacing,
                      timing: `${humanized.timing.total.toFixed(0)}ms`,
                    },
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

                // Track vulnerability/breakthrough events for relationship building
                if ((userData?.lastEmotionAnalysis?.intensity ?? 0) > 0.8) {
                  recordVulnerabilityEvent(agentSessionId);
                }
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
                taggedText = tagTextWithSsmlPersonaAware!(accumulatedText, {
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

                  // Apply momentum-based prosody adjustments using Cartesia-compatible tags
                  // NOTE: Cartesia doesn't support <prosody>, use <speed> and <volume> instead
                  if (hints.prosody.speedAdjust !== 0 || hints.prosody.volumeAdjust !== 1.0) {
                    // Convert percentage adjustment to Cartesia ratio (0.6-1.5 for speed)
                    const speedRatio = Math.max(0.6, Math.min(1.5, 1 + hints.prosody.speedAdjust));
                    // Convert volume adjustment to Cartesia ratio (0.5-2.0)
                    const volumeRatio = Math.max(0.5, Math.min(2.0, hints.prosody.volumeAdjust));

                    if (!taggedText.includes('<speed') && !taggedText.includes('<volume')) {
                      taggedText = `<speed ratio="${speedRatio.toFixed(2)}"/><volume ratio="${volumeRatio.toFixed(2)}"/>${taggedText}`;
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
                    // NOTE: Cartesia uses <speed ratio="X"/> not <prosody rate="X%">
                    if (ssmlAdjustments.rate !== 1.0 && !taggedText.includes('<speed')) {
                      // Clamp to Cartesia's valid range (0.6-1.5)
                      const speedRatio = Math.max(0.6, Math.min(1.5, ssmlAdjustments.rate));
                      if (speedRatio !== 1.0) {
                        taggedText = `<speed ratio="${speedRatio.toFixed(2)}"/>${taggedText}`;
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

            // ============================================================
            // 6. SMART EMPHASIS - Emphasize key words naturally
            // Makes speech more expressive by stressing important words
            // ============================================================
            try {
              const { applySmartEmphasis } =
                await import('../speech/adaptive-ssml/smart-emphasis.js');
              const userName = userData?.name;
              taggedText = applySmartEmphasis(taggedText, {
                maxEmphasis: 2, // Subtle - max 2 emphasis pauses
                userName: userName || undefined,
                skipIfHasManyBreaks: true,
              });
            } catch (_emphasisErr) {
              // Smart emphasis is non-critical
            }

            // ============================================================
            // 7. THINKING PAUSES - Add natural "thinking" before responses
            // Creates authentic pauses based on question complexity
            // ============================================================
            try {
              const { wrapWithThinkingPause, createThinkingContext } =
                await import('../speech/authentic-thinking.js');
              const thinkingSessionId = userData?.services?.sessionId;
              // IMPORTANT: Check if USER asked a question (not if agent's response has one)
              // This prevents "good question" phrases when Ferni is about to ask a question
              const userAskedQuestion = (userData?.lastUserMessage || '').includes('?');
              const thinkingContext = createThinkingContext(
                userData?.lastUserMessage || '',
                userData?.voiceEmotion?.arousal || 0,
                userAskedQuestion, // ✅ Now correctly checks user's message
                userData?.turnCount || 0,
                agent.persona.id,
                thinkingSessionId // Pass sessionId for coordination
              );
              taggedText = wrapWithThinkingPause(taggedText, thinkingContext);
            } catch (_thinkingErr) {
              // Thinking pauses are non-critical
            }

            // ============================================================
            // 8. NONVERBAL SOUNDS - Add [laughter], [sigh] for emotion
            // Makes speech more human with natural nonverbal expressions
            // ============================================================
            try {
              const { addNonverbalSounds } =
                await import('../speech/adaptive-ssml/nonverbal-sounds.js');
              taggedText = addNonverbalSounds(
                taggedText,
                {
                  userEmotion: userData?.voiceEmotion?.primary,
                  turnCount: userData?.turnCount || 0,
                },
                {
                  maxSounds: 1,
                  skipIfHasSounds: true,
                  userEmotion: userData?.voiceEmotion?.primary,
                }
              );
            } catch (_nonverbalErr) {
              // Nonverbal sounds are non-critical
            }

            // ============================================================
            // 9. AUDIO SMOOTHING - Fix scratchy starts/endings
            // Final pass: adds micro-pauses for soft onset and clean ending
            // ============================================================
            try {
              const { applyAudioSmoothing } =
                await import('../speech/adaptive-ssml/audio-smoothing.js');
              taggedText = applyAudioSmoothing(taggedText, {
                softOnset: true,
                trailingPadding: true,
                leadingPauseMs: 30, // Imperceptible but smooths audio start
                trailingPauseMs: 50, // Prevents cutoff at end
                skipIfHasBreaks: true,
              });
            } catch (_smoothingErr) {
              // Audio smoothing is non-critical
            }

            // ============================================================
            // 10. EMOTIONAL PACING - Pause before heavy topics
            // Adds thoughtful pause + softer tone for grief, loss, crisis
            // ============================================================
            try {
              const { applyEmotionalPacing } =
                await import('../speech/adaptive-ssml/emotional-pacing.js');
              // Determine if this is an emotional/vulnerable share
              const voiceEmotionNow = userData?.voiceEmotion;
              const isEmotionalShare = voiceEmotionNow
                ? voiceEmotionNow.stressLevel > 0.4 || Math.abs(voiceEmotionNow.valence) > 0.3
                : false;
              const pacingResult = applyEmotionalPacing(taggedText, {
                userEmotion: userData?.voiceEmotion?.primary,
                userMessage: userData?.lastUserMessage,
                isVulnerableShare: isEmotionalShare,
              });
              if (pacingResult.applied) {
                taggedText = pacingResult.text;
                agent.logger.debug(
                  { reason: pacingResult.reason, pauseMs: pacingResult.pauseMs },
                  '🫂 Applied emotional pacing'
                );
              }
            } catch (_pacingErr) {
              // Emotional pacing is non-critical
            }

            // ============================================================
            // 11. VOICE WARMTH - Adjust tone based on user emotion
            // Slower/softer for distress, match energy for excitement
            // ============================================================
            try {
              const { applyVoiceWarmth } = await import('../speech/adaptive-ssml/voice-warmth.js');
              // Estimate intensity from confidence or stress level
              const emotionIntensity = userData?.voiceEmotion?.confidence ?? 0.7;
              const warmthResult = applyVoiceWarmth(taggedText, {
                userEmotion: userData?.voiceEmotion?.primary,
                emotionIntensity,
                arousal: userData?.voiceEmotion?.arousal,
                valence: userData?.voiceEmotion?.valence,
              });
              if (
                warmthResult.adjustments.reason !== 'skipped - existing tags' &&
                warmthResult.adjustments.reason !== 'no significant adjustment needed'
              ) {
                taggedText = warmthResult.text;
                agent.logger.debug(
                  {
                    speed: warmthResult.adjustments.speedRatio,
                    volume: warmthResult.adjustments.volumeRatio,
                    reason: warmthResult.adjustments.reason,
                  },
                  '💜 Applied voice warmth modulation'
                );
              }
            } catch (_warmthErr) {
              // Voice warmth is non-critical
            }

            // ============================================================
            // 12. TEMPORAL VOICE - Time-of-day awareness
            // Late night = softer/slower, Friday = lighter energy
            // ============================================================
            try {
              const { applyTemporalVoice } =
                await import('../speech/adaptive-ssml/temporal-voice.js');
              const temporalResult = applyTemporalVoice(taggedText, {
                hour: new Date().getHours(),
                dayOfWeek: new Date().getDay(),
              });
              if (
                temporalResult.adjustments.speedRatio !== 1.0 ||
                temporalResult.adjustments.volumeRatio !== 1.0
              ) {
                taggedText = temporalResult.text;
                agent.logger.debug(
                  {
                    period: temporalResult.adjustments.period,
                    speed: temporalResult.adjustments.speedRatio,
                  },
                  '🕐 Applied temporal voice adjustment'
                );
              }
            } catch (_temporalErr) {
              // Temporal voice is non-critical
            }

            // ============================================================
            // 13. SPEED MIRRORING - Match user's speaking pace
            // Builds unconscious rapport through subtle pace matching
            // ============================================================
            try {
              const { applySpeedMirroring } =
                await import('../speech/adaptive-ssml/speed-mirroring.js');
              const mirrorResult = applySpeedMirroring(taggedText, {
                userArousal: userData?.voiceEmotion?.arousal,
                isRapidSpeech: userData?.voiceEmotion?.arousal
                  ? userData.voiceEmotion.arousal > 0.7
                  : undefined,
                isSlowSpeech: userData?.voiceEmotion?.arousal
                  ? userData.voiceEmotion.arousal < 0.3
                  : undefined,
              });
              if (mirrorResult.speedRatio !== 1.0) {
                taggedText = mirrorResult.text;
                agent.logger.debug(
                  { speedRatio: mirrorResult.speedRatio, reason: mirrorResult.reason },
                  '🔄 Applied speed mirroring'
                );
              }
            } catch (_mirrorErr) {
              // Speed mirroring is non-critical
            }

            // ============================================================
            // 14. SPONTANEOUS APPRECIATION - Random genuine connection
            // 5% chance to add "I really enjoy talking with you" etc.
            // ============================================================
            try {
              const { injectSpontaneousAppreciation } =
                await import('../speech/adaptive-ssml/spontaneous-appreciation.js');
              // Determine conversation tone from voice emotion
              const voiceEmotionForTone = userData?.voiceEmotion;
              const isHeavyTone = voiceEmotionForTone
                ? voiceEmotionForTone.stressLevel > 0.6
                : false;
              const isPositiveTone = voiceEmotionForTone
                ? voiceEmotionForTone.arousal > 0.6 && voiceEmotionForTone.valence > 0.2
                : false;
              const appreciationResult = injectSpontaneousAppreciation(taggedText, {
                turnCount: userData?.turnCount || 0,
                // Get total conversations from services if available
                totalConversations: userData?.services?.userProfile?.totalConversations,
                userName: userData?.name,
                conversationTone: isHeavyTone ? 'heavy' : isPositiveTone ? 'positive' : 'neutral',
                sessionId,
              });
              if (appreciationResult.appreciationAdded) {
                taggedText = appreciationResult.text;
                agent.logger.debug(
                  { phrase: appreciationResult.phrase },
                  '💜 Injected spontaneous appreciation'
                );
              }
            } catch (_appreciationErr) {
              // Spontaneous appreciation is non-critical
            }

            // ============================================================
            // 15. FINAL SSML CLEANUP - Consolidate stacked tags
            // Multiple speed/volume tags can cause TTS screeching/glitches
            // ============================================================
            try {
              const { sanitizeSsml } = await import('../speech/ssml-tagger/index.js');
              taggedText = sanitizeSsml(taggedText);
            } catch (_sanitizeErr) {
              // sanitize is non-critical, pass through as-is
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

      // Gemini multimodal emotion analysis (experimental feature toggle)
      const geminiEmotionEnabled = isExperimentalEnabled('geminiEmotionAnalysis');
      let geminiEmotionStream: Awaited<ReturnType<typeof startEmotionStream>> | null = null;
      let geminiSessionId: string | null = null;

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

            // Lazy init Gemini emotion stream when feature enabled and sessionId available
            if (geminiEmotionEnabled && !geminiEmotionStream) {
              const userData = agent.getUserDataFromContext();
              geminiSessionId = userData?.services?.sessionId ?? null;
              if (geminiSessionId) {
                try {
                  geminiEmotionStream = await startEmotionStream(geminiSessionId, (result) => {
                    // Gemini emotion results update session timeline automatically
                    // Log for debugging when enabled
                    log().debug(
                      { primary: result.primary, confidence: result.confidence },
                      'Gemini emotion analysis result'
                    );
                  });
                  log().info({ sessionId: geminiSessionId }, 'Gemini emotion analysis started');
                } catch (err) {
                  log().warn({ error: String(err) }, 'Failed to start Gemini emotion stream');
                }
              }
            }

            // Feed audio frame to Gemini stream (if enabled and initialized)
            if (geminiEmotionStream && frame.data) {
              // Convert Int16Array to ArrayBuffer for Gemini
              const audioBuffer = new Int16Array(frame.data).buffer;
              geminiEmotionStream.sendAudio(audioBuffer);
            }

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

              // 🎤 Live Backchanneling: Feed audio to breath pause detector
              // Enables "mm-hmm" during user speech at natural breath pauses
              try {
                const breathDetector = getBreathPauseDetector(sessionId);
                breathDetector.processAudioFrame({
                  data: frame.data,
                  sampleRate: frame.sampleRate,
                  channels: frame.channels,
                });

                // Update userData with breath pause state for session-state-handler
                if (userData) {
                  userData.isInBreathPause = breathDetector.isBreathPause();
                  userData.currentSpeechDurationMs = breathDetector.getCurrentSpeechDuration();
                }
              } catch {
                // Breath detector not initialized - ignore
              }
            }
          }
        }

        // Stop Gemini emotion stream when audio ends
        if (geminiEmotionStream) {
          geminiEmotionStream.stop();
          if (geminiSessionId) {
            clearGeminiSession(geminiSessionId);
          }
          log().debug('Gemini emotion stream stopped');
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

                  // 🔊 ACT on noisy environment - offer to pause (once per session)
                  if (
                    ambient.recommendations.offerToPause &&
                    !userData.hasOfferedToPause &&
                    ambient.recommendations.acknowledgment
                  ) {
                    userData.pendingAmbientAcknowledgment = ambient.recommendations.acknowledgment;
                    userData.hasOfferedToPause = true;
                    log().info(
                      {
                        environment: ambient.environment,
                        noiseLevel: ambient.noiseLevel,
                        acknowledgment: ambient.recommendations.acknowledgment,
                      },
                      '🔊 Noisy environment detected - will offer to pause'
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
          // 🎭 BETTER THAN HUMAN: Include tremor data for extra-sensitive delivery
          // Voice tremor = user is stressed, even if they sound "neutral" emotionally
          let tremorOptions: { intensity?: 'none' | 'subtle' | 'noticeable' | 'pronounced' } = {};
          try {
            const sessionId = userData?.services?.sessionId;
            if (sessionId) {
              const { getHumanListeningResult } =
                await import('../intelligence/context-builders/human-listening.js');
              const listeningResult = getHumanListeningResult(sessionId);
              if (listeningResult?.audio?.tremor?.detected) {
                tremorOptions = {
                  intensity: listeningResult.audio.tremor.intensity as 'subtle' | 'noticeable' | 'pronounced',
                };
              }
            }
          } catch {
            // Non-critical - tremor detection is a bonus
          }

          const modulation = getEmotionModulation(voiceEmotion, tremorOptions);
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
    const userData = this.getUserDataFromContext();
    const services = userData?.services;

    if (!services) {
      this.logger.error('No services available for turn processing');
      return;
    }

    // Delegate to extracted turn handler
    await handleUserTurn({
      turnCtx,
      userText: userText || '',
      persona: this.persona,
      bundleRuntime: this.bundleRuntime,
      services,
      userData: userData as UserData,
      currentSession: this._currentSession,
      room: this._room,
      sendDataMessage: this.sendDataMessage.bind(this),
    });
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
        const BACKGROUND_TIMEOUT = 90_000; // 90 seconds max for background init (Cloud Run cold starts)

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

            // Pre-warm greeting for instant first response
            try {
              const { prewarmGreeting } = await import('./shared/warm-greeting.js');
              const defaultPersona = process.env.PERSONA_ID || 'ferni';
              prewarmGreeting(defaultPersona);
            } catch {
              // Non-fatal - greeting will generate on demand
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

            // Signal worker readiness for zero-downtime deployments
            try {
              const { signalPrewarmComplete } = await import('./shared/worker-readiness.js');
              signalPrewarmComplete();
            } catch {
              // Non-fatal - readiness tracking is optional
            }

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

    // Record job dispatch for keep-alive monitoring
    // This prevents Cloud Run from killing the container thinking it's idle
    try {
      const { recordJobDispatch } = await import('./shared/livekit-keepalive.js');
      recordJobDispatch();
    } catch {
      // Non-fatal
    }

    // CRITICAL: Load heavy imports before using google/silero/etc
    // These are deferred to speed up child process startup
    await loadHeavyImports();

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
        // CRITICAL: Add timeout to prevent hanging forever
        // If services don't initialize in 60s, continue anyway - agent may work in degraded mode
        const FALLBACK_TIMEOUT = 60_000; // 60 seconds
        await Promise.race([
          (async () => {
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
          })(),
          new Promise<void>((_, reject) => {
            setTimeout(
              () => reject(new Error('Fallback initialization timeout')),
              FALLBACK_TIMEOUT
            );
          }),
        ]);
      } catch (initError) {
        diag.warn('Fallback initialization failed or timed out, continuing anyway', {
          error: String(initError),
        });
        process.stderr.write(`[voice-agent] ENTRY: Fallback init failed/timeout: ${initError}\n`);
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
      // STEP 2-3: INITIALIZE SESSION (services, trial, user data)
      // ===============================================
      // Extracted to voice-agent/session-init-handler.ts for maintainability
      const {
        services,
        isReturningUser,
        isTrialUser,
        isFirstConversation,
        trialStatus,
        userData,
        stopPeriodicSync,
      } = await initializeSession({
        sessionId,
        userId,
        userName,
        userAccent,
        sessionPersona,
        room: ctx.room,
      });

      // ===============================================
      // STEP 2b: EMIT CONVERSATION START (Phase 2 Scaling)
      // Fire-and-forget - triggers async background processing
      // ===============================================
      try {
        const { emitConversationStart } = await import('../services/async-events/index.js');
        emitConversationStart({
          sessionId,
          userId: userId || 'anonymous',
          personaId: sessionPersona.id,
          isReturning: isReturningUser,
        });
        diag.session('📤 conversation:start emitted for async processing');
      } catch (eventErr) {
        diag.warn('Event emission failed (non-fatal)', { error: String(eventErr) });
      }

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
        vad = await silero!.VAD.load();
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
        vad: vad as sileroType.VAD,
        llm: new google!.beta.realtime.RealtimeModel({
          model: 'gemini-2.0-flash-exp',
          modalities: [Modality!.TEXT],
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
      (userData as unknown as Record<string, unknown>).extensibilitySessionPrompt =
        extensibilitySessionPrompt;

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
              noiseCancellation: TelephonyBackgroundVoiceCancellation!(),
            }
          : undefined,
      });

      diag.state('Session started', { isPhoneCall, hasNoiseCancellation: isPhoneCall });

      // ===============================================
      // STEP 7a2: INITIALIZE UNIFIED CONVERSATION HUMANIZATION
      // Single entry point for all humanization: voice print, memory, breathing sync,
      // superhuman capabilities, deep humanization, and more
      // ===============================================
      try {
        const userId = services.userId || 'anonymous';

        // Initialize prosody bridge for this session (still needed for voice analysis)
        initProsodyBridge(sessionId, userId);

        // 🎭 UNIFIED CONVERSATION SESSION (dynamic import to avoid startup timeout)
        // This replaces all the scattered humanization initialization calls:
        // - startHumanizationSession
        // - initAdvancedHumanizationSession
        // - humanizationAnalytics.startSession
        // All coordinated through a single session object
        const { initConversationSession } =
          await import('./integrations/conversation-session-integration.js');
        const conversationSession = initConversationSession({
          sessionId,
          userId,
          personaId: sessionPersona.id,
          sessionCount: services.userProfile?.totalConversations,
          relationshipStage: services.userProfile?.relationshipStage as
            | 'stranger'
            | 'acquaintance'
            | 'friend'
            | 'trusted_advisor'
            | undefined,
        });

        if (conversationSession) {
          const sessionState = conversationSession.getState();
          diag.state('🎭 Unified conversation session initialized', {
            turnCount: sessionState.turnCount,
            comfortLevel: sessionState.comfortLevel.toFixed(2),
            relationshipStage: sessionState.relationshipStage,
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
      // PARALLEL INITIALIZATION: Non-critical services
      // ===============================================
      // These run in parallel for faster session start (~100ms savings)
      let utilitiesCleanup: (() => Promise<void>) | undefined;
      let utilitiesProactiveOpener: string | null = null;

      const parallelInitStart = Date.now();

      const parallelInits = await Promise.allSettled([
        // STEP 6b: Engagement data sender
        (async () => {
          const engagementDataSender = getEngagementDataSender();
          engagementDataSender.setRoom(
            ctx.room as Parameters<typeof engagementDataSender.setRoom>[0]
          );
          if (userId) {
            await engagementDataSender.sendEngagementData(userId);
          }
          return 'engagement';
        })(),

        // STEP 6c: Cognitive intelligence
        (async () => {
          await onCognitiveSessionStart({
            userId: userId || 'anonymous',
            personaId: sessionPersona.id,
            userProfile: services.userProfile,
            sessionId,
          });
          return 'cognitive';
        })(),

        // STEP 6d: Game engine
        (async () => {
          const { getGameEngine } = await import('../services/games/index.js');
          const engine = getGameEngine(sessionPersona.id);
          if (userId) {
            await engine.initializeForUser(userId);
          }
          return 'games';
        })(),

        // STEP 6e: Simple utilities
        (async () => {
          if (userId) {
            const utilitiesResult = await initializeUtilitiesIntegration({
              session,
              userId,
              enableProactive: isReturningUser,
              enableVoiceCallbacks: true,
            });
            utilitiesCleanup = utilitiesResult.cleanup;
            utilitiesProactiveOpener = utilitiesResult.proactiveOpener;
          }
          return 'utilities';
        })(),
      ]);

      // Log results
      const parallelElapsed = Date.now() - parallelInitStart;
      const succeeded = parallelInits.filter((r) => r.status === 'fulfilled').length;
      const failed = parallelInits.filter((r) => r.status === 'rejected');

      diag.state('Parallel session init complete', {
        elapsedMs: parallelElapsed,
        succeeded,
        failed: failed.length,
        hasProactiveOpener: !!utilitiesProactiveOpener,
      });

      // Log any failures (all non-critical)
      for (const failure of failed) {
        if (failure.status === 'rejected') {
          diag.debug('Parallel init failure (non-critical)', {
            error: String(failure.reason).slice(0, 100),
          });
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
      // Extracted to voice-agent/voice-humanization-init-handler.ts for maintainability
      // Handles: feature flags, metrics, response anticipation, turn prediction,
      // laughter detection, rhythm service, FFT analysis
      setupVoiceHumanizationInit({
        sessionId,
        sessionPersona,
        userId,
        userProfile: services.userProfile,
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
        void handleSessionCleanup({
          sessionId,
          userId,
          services,
          sessionPersona,
          voiceHumanization,
          utilitiesCleanup,
          patternAnalyzer,
          autoOptimizer,
          feedbackCollector,
          dataChannelCleanup: dataChannelResult.cleanup,
          handoffHandler: wrappedHandoffHandler,
          cameoCleanup: cleanupCameoHandlers || undefined,
          musicCleanup: musicResult.clearTimers,
          userData,
          stopPeriodicSync,
        }).catch((err) => {
          diag.error('Session cleanup failed', { error: String(err) });
        });
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

// Only run cli.runApp in the main process, not in child processes
// Child processes are spawned by LiveKit and import this module to get prewarm/entry
// process.send is only defined in child processes (IPC channel to parent)
if (!process.send) {
  // ============================================================================
  // GRACEFUL SHUTDOWN HANDLER (MAIN PROCESS ONLY)
  // ============================================================================
  // CRITICAL: This must only run in the main process, NOT in child processes!
  // Running it in child processes interferes with LiveKit's IPC communication
  // and causes "runner initialization timed out" errors.
  const { registerShutdownSignalHandlers } = await import('./shared/shutdown-handler.js');
  registerShutdownSignalHandlers();

  // Use lightweight child entry point for spawned processes
  // This avoids loading 51 heavy imports in child processes, allowing them to respond
  // to the SDK within the timeout window
  const childAgentPath = fileURLToPath(new URL('./voice-agent-child.js', import.meta.url));

  cli.runApp(
    new WorkerOptions({
      // CRITICAL: Point to lightweight child file, NOT this file!
      // Child processes load voice-agent-child.js which has minimal imports
      // and dynamically loads the full agent when entry() is called
      agent: childAgentPath,
      agentName,
      // Enable production mode for proper settings (port, load thresholds)
      production: true,
      // RE-ENABLE idle processes now that we have lightweight child entry
      numIdleProcesses: 1,
      // Increase timeout for safety margin
      initializeProcessTimeout: 300 * 1000, // 300 seconds (5 minutes)
    })
  );

  // Signal that worker is accepting jobs for zero-downtime deployments
  // This is called after cli.runApp() which means the worker is ready
  try {
    const { signalWorkerAcceptingJobs } = await import('./shared/worker-readiness.js');
    signalWorkerAcceptingJobs();
    diag.info('Worker signaled ready for zero-downtime deployments');
  } catch {
    // Non-fatal - readiness tracking is optional
  }

  // Start LiveKit connection keep-alive monitor
  // This detects when the WebSocket goes stale and forces container restart
  try {
    const { startKeepalive } = await import('./shared/livekit-keepalive.js');
    startKeepalive();
  } catch {
    // Non-fatal - keep-alive is optional
  }

  diag.info('CLI.runApp called - worker running');

  // ============================================================================
  // PHASE 2: PRE-WARM EXPENSIVE RESOURCES (Background)
  // ============================================================================
  // Google/Anthropic pattern: Main process owns resources, children request access
  // This runs AFTER the worker is ready, so it doesn't block startup
  try {
    const { warmupResources, setupIPCHandler } = await import('./shared/resource-server.js');

    // Setup IPC handler for child process requests
    setupIPCHandler();

    // Warmup resources in background (non-blocking)
    warmupResources()
      .then(() => {
        diag.info('Resource warmup complete - VAD, TTS, Personas ready for fast session starts');
      })
      .catch((error) => {
        diag.warn('Resource warmup failed (non-fatal)', { error: String(error) });
      });
  } catch {
    // Non-fatal - warmup is an optimization
  }
} else {
  diag.info('Child process detected - skipping cli.runApp');
}
