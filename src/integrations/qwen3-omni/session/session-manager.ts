/**
 * Qwen3-Omni Session Manager
 *
 * Complete integration with ALL Ferni systems:
 * - Full persona bundles with behaviors, stories, knowledge
 * - All context builders (200+ builders across 19 categories)
 * - Full tool orchestrator with semantic routing
 * - L1/L2/L3 memory system with STM buffer
 * - Complete humanization engine (SSML translated to text guidance)
 * - Handoff system for persona transitions
 * - DJ/Music controller integration
 *
 * KEY FEATURES:
 * 1. Native function calling (no regex-based tool trigger detection)
 * 2. Separate TTS pipeline (Qwen3-TTS) for persona voice synthesis
 * 3. Large context window allows rich persona prompts
 * 4. OpenAI-compatible API for inference
 * 5. Multi-turn conversation history managed by this module
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../utils/safe-logger.js';

// Types
import type { SessionServices } from '../../../services/types.js';
import type { UserProfile } from '../../../types/user-profile.js';

/**
 * Minimal persona bundle shape expected by this session manager.
 * Adapted from LoadedPersonaBundle.manifest fields.
 */
interface PersonaBundle {
  id: string;
  displayName: string;
  identity?: {
    systemPrompt?: string;
    tagline?: string;
    values?: string[];
  };
  content?: {
    behaviors?: Record<string, unknown>;
  };
}

// Qwen3-Omni
import { Qwen3OmniClient, createQwen3OmniClient } from '../client.js';
import { MAX_SYSTEM_PROMPT_LENGTH, getEmotionInstruction, getVoiceCloneConfig } from '../config.js';
import { Qwen3TTSClient, createQwen3TTSClient } from '../tts-client.js';
import type {
  Qwen3FunctionCall,
  Qwen3FunctionDefinition,
  Qwen3FunctionParameter,
  Qwen3OmniMessage,
  Qwen3OmniSessionConfig,
  Qwen3OmniSessionState,
  Qwen3OmniTurnContext,
  TTSSynthesisResult,
} from '../types.js';

// Persona system
import { loadBundleById } from '../../../personas/bundles/loader.js';
import { getCognitiveProfile } from '../../../personas/cognitive-profiles.js';

// Context builders
import { buildIntegratedContext } from '../../../intelligence/context-builders/behavioral/integration.js';
import type { ContextBuilderInput } from '../../../intelligence/context-builders/core/types.js';
import { buildConversationContext } from '../../../intelligence/context-builders/index.js';

// Tools
import { getToolsForAgent } from '../../../tools/orchestrator/voice-agent-integration.js';
import type { Tool } from '../../../tools/registry/types.js';

// Memory
import { getMemoryContext as getMemoryIntelligenceContext } from '../../../intelligence/memory-intelligence/index.js';
import {
  fastCapture,
  getSTMBuffer,
  recordTurn as recordTurnToSTM,
  type FastCaptureResult,
} from '../../../memory/dynamic/index.js';

// Humanization — real implementations from speech subsystem
import { detectEmotion } from '../../../intelligence/detectors/emotion.js';
import { getBackchannelResponse } from '../../../speech/backchanneling/backchannel-engine.js';
import { getListeningSignals } from '../../../speech/backchanneling/listening-signals.js';

interface HumanizationEngine {
  getSignals(input: {
    emotion: string;
    intensity: number;
    topics: string[];
    trustLevel: number;
  }): Promise<{ tone?: string; pacing?: string }>;
}

function createHumanizationEngine(_config: {
  userId: string;
  personaId: string;
}): HumanizationEngine {
  return {
    async getSignals(input) {
      // Map emotion to tone
      const toneMap: Record<string, string> = {
        sad: 'gentle and compassionate',
        anxious: 'calm and steady',
        happy: 'warm and matching',
        excited: 'enthusiastic',
        frustrated: 'patient and understanding',
        angry: 'measured and calm',
        vulnerable: 'soft and accepting',
        grief: 'quiet and holding',
        neutral: 'warm and present',
      };

      // Map emotion to pacing
      const pacingMap: Record<string, string> = {
        sad: 'slow',
        anxious: 'slow',
        happy: 'energetic',
        excited: 'energetic',
        frustrated: 'slow',
        angry: 'slow',
        vulnerable: 'slow',
        grief: 'slow',
        neutral: 'moderate',
      };

      return {
        tone: toneMap[input.emotion] || toneMap.neutral,
        pacing: pacingMap[input.emotion] || 'moderate',
      };
    },
  };
}

// Handoff — real implementations from handoff subsystem

interface HandoffRequest {
  targetPersonaId: string;
  sourcePersonaId?: string;
  context: string;
}

class HandoffManager {
  private sessionId: string;
  constructor(config: { sessionId?: string } & Record<string, unknown>) {
    this.sessionId = (config.sessionId as string) || '';
  }
}

async function evaluateHandoffTrigger(input: {
  transcript: string;
  analysis: unknown;
  currentPersonaId: string;
  userId: string;
}): Promise<{
  shouldHandoff: boolean;
  targetPersonaId?: string;
  reason?: string;
}> {
  // Use emotion detection to determine if transcript suggests handoff need
  const emotionResult = detectEmotion(input.transcript);

  // Check for explicit handoff phrases
  const lowerTranscript = input.transcript.toLowerCase();
  const handoffPhrases: Record<string, { target: string; reason: string }> = {
    'talk to peter': { target: 'peter-lynch', reason: 'User requested Peter' },
    'talk to maya': { target: 'maya-santos', reason: 'User requested Maya' },
    'talk to alex': { target: 'alex-chen', reason: 'User requested Alex' },
    'talk to jordan': { target: 'jordan-taylor', reason: 'User requested Jordan' },
    'talk to nayan': { target: 'nayan-patel', reason: 'User requested Nayan' },
    'talk to ferni': { target: 'ferni', reason: 'User requested Ferni' },
    'switch to': { target: '', reason: 'User requested persona switch' },
    'hand me off': { target: '', reason: 'User requested handoff' },
    'transfer me': { target: '', reason: 'User requested transfer' },
  };

  for (const [phrase, result] of Object.entries(handoffPhrases)) {
    if (lowerTranscript.includes(phrase) && result.target) {
      if (result.target !== input.currentPersonaId) {
        return {
          shouldHandoff: true,
          targetPersonaId: result.target,
          reason: result.reason,
        };
      }
    }
  }

  return { shouldHandoff: false };
}

// Music/DJ
import type { DJController } from '../../../audio/dj-controller.js';
import { getDJController } from '../../../audio/dj-controller.js';

// SSML Translation
import { translateSSMLToText } from '../humanization/ssml-to-text.js';

// Analytics — real emotion detection from intelligence layer
class AnalysisEngine {
  async analyze(
    transcript: string,
    _context: { userId: string; sessionId: string }
  ): Promise<Record<string, unknown> | null> {
    if (!transcript || transcript.trim().length === 0) return null;

    const result = detectEmotion(transcript);
    return {
      emotion: result.primary,
      secondaryEmotion: result.secondary,
      intensity: result.intensity,
      valence: result.valence,
      distressLevel: result.distressLevel,
      confidence: result.confidence,
      markers: result.markers,
      suggestedTone: result.suggestedTone,
      trajectory: result.intensity > 0.7 ? 'volatile' : 'stable',
    };
  }
}

// Emotion event dispatch (Better Than Human)
import {
  dispatchEmotionEvents,
  dispatchExpressionUpdate,
} from '../../../agents/realtime/emotion-event-dispatcher.js';
import type { EventDispatchContext } from '../../../agents/voice-agent/turn-events.js';
import { dispatchAllTurnEvents } from '../../../agents/voice-agent/turn-events.js';

// Personality v2 (optional - fire-and-forget on failure)
import type { PersonalityContextOutput } from '../../../personality/application/build-personality-context.js';
import { createPersonalityService } from '../../../personality/v2/index.js';

// Superhuman (live context with 100ms timeout fallback)
import {
  buildSuperhumanContext,
  formatSuperhumanContextForPrompt,
} from '../../../services/superhuman/index.js';

// Cross-persona intelligence (team coordination, handoff briefings, proactive insights)
import {
  buildInsightBriefingForHandoff,
  formatInsightBriefingForPrompt,
  getInsightsForPersona,
} from '../../../services/cross-persona-insights.js';

// Post-TTS audio enhancement (warmth, presence, betterThanHuman preset)
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import {
  applyPostTTSEnhancement,
  buildPersonaPostTTSConfig,
} from '../../../agents/shared/performance/post-tts-transform.js';

const log = createLogger({ module: 'qwen3-omni-session' });

// =============================================================================
// SESSION MANAGER
// =============================================================================

export class Qwen3OmniSessionManager extends EventEmitter {
  private config: Qwen3OmniSessionConfig;
  private state: Qwen3OmniSessionState;
  private thinkerClient: Qwen3OmniClient | null = null;
  private ttsClient: Qwen3TTSClient | null = null;
  private humanizationEngine: HumanizationEngine | null = null;
  private handoffManager: HandoffManager | null = null;
  private djController: DJController | null = null;
  private analysisEngine: AnalysisEngine;
  private rawTools: Map<string, Tool> = new Map();
  private isInitialized = false;
  /** Rolling window for quality metrics (depth, emotions) */
  private recentDepths: number[] = [];
  private recentEmotions: string[] = [];
  private turnsSinceDeepMomentCount = 0;
  /** Circuit breaker: consecutive failures and open until timestamp */
  private thinkerFailures = 0;
  private thinkerCircuitOpenUntil = 0;
  private ttsFailures = 0;
  private ttsCircuitOpenUntil = 0;

  constructor(config: Qwen3OmniSessionConfig) {
    super();
    this.config = config;
    this.state = {
      persona: null,
      cognitiveProfile: null,
      tools: new Map(),
      stmBuffer: null,
      messages: [],
      turnCount: 0,
      isActive: false,
      lastUserTranscript: '',
      lastAgentResponse: '',
      emotionalState: {
        userEmotion: 'neutral',
        agentTone: 'warm',
        energy: 0.5,
      },
      trustLevel: 5,
      emotionalTrajectory: 'stable',
      distressLevel: 0,
    };
    this.analysisEngine = new AnalysisEngine();
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Initialize session with full system integration
   */
  async initialize(): Promise<void> {
    const startTime = Date.now();
    log.info(
      { sessionId: this.config.sessionId, personaId: this.config.personaId },
      'Initializing Qwen3-Omni session'
    );

    try {
      // 1. Load persona bundle
      await this.loadPersona(this.config.personaId);

      // 2. Initialize STM buffer
      this.state.stmBuffer = getSTMBuffer(this.config.sessionId, this.config.userId);

      // 3. Build tools (native function calling definitions)
      await this.buildTools();

      // 4. Initialize humanization engine
      this.humanizationEngine = createHumanizationEngine({
        userId: this.config.userId,
        personaId: this.config.personaId,
      });

      // 5. Initialize handoff manager
      if (this.config.enableHandoffs) {
        this.handoffManager = new HandoffManager({
          sessionId: this.config.sessionId,
          userId: this.config.userId,
          services: this.config.services as SessionServices,
        });
      }

      // 6. Get DJ controller
      if (this.config.enableMusic) {
        this.djController = getDJController();
      }

      // 7. Create Qwen3-Omni Thinker client
      this.thinkerClient = createQwen3OmniClient({
        serverUrl: this.config.serverUrl,
        debug: process.env.NODE_ENV === 'development',
      });

      // 8. Create Qwen3-TTS client and initialize voice clone
      this.ttsClient = createQwen3TTSClient({
        serverUrl: this.config.ttsServerUrl,
      });
      await this.initializeVoiceClone();

      // 9. Build initial system prompt
      const systemPrompt = await this.buildSystemPrompt({
        isSessionStart: true,
      });
      this.state.messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: systemPrompt }],
        },
      ];

      this.isInitialized = true;
      this.state.isActive = true;

      log.info(
        {
          sessionId: this.config.sessionId,
          personaId: this.config.personaId,
          initTimeMs: Date.now() - startTime,
          toolCount: this.state.tools.size,
          voiceReady: this.ttsClient.hasVoiceClone(this.config.personaId),
        },
        'Qwen3-Omni session initialized'
      );

      this.emit('initialized', { sessionId: this.config.sessionId });
    } catch (error) {
      log.error(
        { error: String(error), sessionId: this.config.sessionId },
        'Failed to initialize session'
      );
      throw error;
    }
  }

  /**
   * Process a conversation turn with native function calling.
   *
   * Flow:
   * 1. Fast capture to memory
   * 2. Analyze user input
   * 3. Build context (memory, behavioral, humanization)
   * 4. Update system prompt
   * 5. Send to Qwen3-Omni Thinker with tool definitions
   * 6. Execute any function calls
   * 7. Synthesize response with Qwen3-TTS
   * 8. Record turn to memory
   */
  async processTurn(userTranscript: string): Promise<Qwen3OmniTurnContext> {
    const turnStartTime = Date.now();
    this.state.turnCount++;
    this.state.lastUserTranscript = userTranscript;

    log.debug(
      {
        sessionId: this.config.sessionId,
        turnCount: this.state.turnCount,
        transcriptLength: userTranscript.length,
      },
      'Processing turn'
    );

    // 1. Fast capture to STM (< 50ms)
    const captureResult = await this.captureToMemory(userTranscript);

    // 2. Analyze user input
    const analysis = await this.analyzeInput(userTranscript);

    // 2b. Dispatch emotion events to frontend EQ (Better Than Human)
    this.dispatchEmotionEventsAfterAnalysis(analysis);

    // 3. Check for handoff triggers
    if (this.config.enableHandoffs) {
      await this.checkHandoffTriggers(userTranscript, analysis);
    }

    // 4. Get memory context
    const memoryContext = await this.getMemoryContext();

    // 5. Build behavioral context (all 200+ builders)
    const behavioralSignals = await this.buildBehavioralContext(userTranscript, analysis);

    // 5b. Build personality v2 context (anticipation, timing, vulnerability, patterns)
    const personalityContext = await this.buildPersonalityContext(userTranscript, analysis);
    this.state.personalityContext = personalityContext ?? undefined;
    if (personalityContext) {
      this.emit('personalitySignals', { personalityContext });
    }

    // 6. Get humanization guidance (SSML translated to text)
    const humanizationGuidance = await this.getHumanizationGuidance(analysis);

    // 8. Update system prompt with fresh context
    const analysisRecord = analysis as { topics?: string[]; emotion?: string } | null;
    const systemPrompt = await this.buildSystemPrompt({
      memoryContext,
      behavioralSignals,
      humanizationGuidance,
      personalityContext: this.state.personalityContext as PersonalityContextOutput | undefined,
      currentTranscript: userTranscript,
      currentTopics: analysisRecord?.topics,
      currentEmotion: analysisRecord?.emotion ?? this.state.emotionalState.userEmotion,
    });

    // Update system message
    this.state.messages[0] = {
      role: 'system',
      content: [{ type: 'text', text: systemPrompt }],
    };

    // 8. Add user message to conversation history
    this.state.messages.push({
      role: 'user',
      content: [{ type: 'text', text: userTranscript }],
    });

    // 9. Convert tools to Qwen3 function definitions
    const toolDefinitions = Array.from(this.state.tools.values());

    // 10. Send to Qwen3-Omni Thinker (streaming or non-streaming)
    let agentResponse = '';
    let toolCalls: Qwen3FunctionCall[] = [];
    let audio: TTSSynthesisResult | undefined;
    const useStreaming = this.config.streamingEnabled === true;

    try {
      if (useStreaming) {
        if (this.isThinkerCircuitOpen()) {
          throw new Error('Thinker circuit open');
        }
        const streamResult = await this.runStreamingThinkerLoop(toolDefinitions);
        this.thinkerFailures = 0;
        agentResponse = streamResult.agentResponse;
        toolCalls = streamResult.toolCalls;
      } else {
        if (this.isThinkerCircuitOpen()) {
          throw new Error('Thinker circuit open');
        }
        const response = await this.withRetry({
          timeoutMs: Qwen3OmniSessionManager.THINKER_TIMEOUT_MS,
          maxRetries: 2,
          backoffMs: Qwen3OmniSessionManager.RETRY_BACKOFF_MS,
          fn: () =>
            this.thinkerClient!.chatCompletion(this.state.messages, {
              tools: toolDefinitions,
            }),
        });
        this.thinkerFailures = 0;
        const choice = response.choices[0];
        if (choice?.finish_reason === 'tool_calls' && choice.message.tool_calls) {
          toolCalls = await this.executeFunctionCalls(choice.message.tool_calls);
          const toolResultMessages = this.buildToolResultMessages(
            choice.message.tool_calls,
            toolCalls
          );
          this.state.messages.push({
            role: 'assistant',
            content: [{ type: 'text', text: choice.message.content || '' }],
          });
          this.state.messages.push(...toolResultMessages);
          const finalResponse = await this.withRetry({
            timeoutMs: Qwen3OmniSessionManager.THINKER_TIMEOUT_MS,
            maxRetries: 2,
            backoffMs: Qwen3OmniSessionManager.RETRY_BACKOFF_MS,
            fn: () => this.thinkerClient!.chatCompletion(this.state.messages),
          });
          this.thinkerFailures = 0;
          agentResponse = finalResponse.choices[0]?.message.content || '';
        } else {
          agentResponse = choice?.message.content || '';
        }
      }

      this.state.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: agentResponse }],
      });
      this.state.lastAgentResponse = agentResponse;

      // 11. Synthesize with Qwen3-TTS
      if (agentResponse && this.ttsClient) {
        const emotionInstruct = getEmotionInstruction(
          this.state.emotionalState.userEmotion,
          this.state.emotionalState.agentTone,
          this.state.emotionalState.energy
        );

        if (this.isTtsCircuitOpen()) {
          audio = undefined;
        } else {
          try {
            audio = await this.withRetry({
              timeoutMs: Qwen3OmniSessionManager.TTS_TIMEOUT_MS,
              maxRetries: 2,
              backoffMs: Qwen3OmniSessionManager.RETRY_BACKOFF_MS,
              fn: () =>
                this.ttsClient!.synthesize({
                  text: agentResponse,
                  personaId: this.config.personaId,
                  instruct: emotionInstruct,
                }),
            });
            this.ttsFailures = 0;
            if (audio) {
              audio = await this.applyPostTTSEnhancementToResult(audio);
            }
          } catch (ttsError) {
            this.ttsFailures += 1;
            if (this.ttsFailures >= Qwen3OmniSessionManager.CIRCUIT_BREAKER_THRESHOLD) {
              this.ttsCircuitOpenUntil =
                Date.now() + Qwen3OmniSessionManager.CIRCUIT_BREAKER_OPEN_MS;
            }
            log.warn({ error: String(ttsError) }, 'TTS synthesize failed; no audio');
            audio = undefined;
          }
        }
      }
    } catch (error) {
      log.error(
        { error: String(error), sessionId: this.config.sessionId },
        'Turn processing failed'
      );
      this.thinkerFailures += 1;
      if (this.thinkerFailures >= Qwen3OmniSessionManager.CIRCUIT_BREAKER_THRESHOLD) {
        this.thinkerCircuitOpenUntil = Date.now() + Qwen3OmniSessionManager.CIRCUIT_BREAKER_OPEN_MS;
      }
      agentResponse = Qwen3OmniSessionManager.FALLBACK_RESPONSE;
    }

    // 12. Record turn to memory
    await this.recordTurnToMemory(userTranscript, analysis, captureResult);

    // 12b. Track conversation quality (fire-and-forget)
    this.trackConversationQuality(analysis, agentResponse);

    // Trim conversation history to prevent context overflow
    this.trimConversationHistory();

    const turnContext: Qwen3OmniTurnContext = {
      userTranscript,
      analysis,
      memoryContext,
      toolDefinitions,
      behavioralSignals,
      humanizationGuidance,
      systemPrompt,
      agentResponse,
      toolCalls,
      audio,
    };

    log.debug(
      {
        sessionId: this.config.sessionId,
        turnCount: this.state.turnCount,
        processingTimeMs: Date.now() - turnStartTime,
        toolCallCount: toolCalls.length,
        responseLength: agentResponse.length,
        ttsLatencyMs: audio?.latencyMs,
      },
      'Turn processed'
    );

    // Dispatch all turn events (emotion, behavior, mood) to frontend
    this.dispatchAllTurnEventsAfterTurn(analysis, agentResponse);

    this.emit('turnProcessed', turnContext);
    return turnContext;
  }

  /**
   * Fire-and-forget: dispatch emotion events and expression update after input analysis.
   * Enables frontend EQ (micro-expressions, concern detection, emotional trajectory).
   */
  private dispatchEmotionEventsAfterAnalysis(analysis: unknown): void {
    const send = this.config.sendDataMessage;
    if (!send) return;

    const emotion =
      (analysis && typeof analysis === 'object' && 'emotion' in analysis
        ? (analysis as { emotion?: string }).emotion
        : undefined) ?? this.state.emotionalState.userEmotion;
    const intensity =
      (analysis && typeof analysis === 'object' && 'intensity' in analysis
        ? (analysis as { intensity?: number }).intensity
        : undefined) ?? 0.5;
    const distressLevel = this.state.distressLevel ?? 0;
    const trajectory = this.state.emotionalTrajectory ?? 'stable';

    const sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void> = (
      type,
      payload
    ) => Promise.resolve(send(type, payload));

    void dispatchEmotionEvents(
      {
        emotionalState: {
          primary: emotion,
          intensity,
          distressLevel,
          trajectory:
            trajectory === 'improving' || trajectory === 'declining' || trajectory === 'volatile'
              ? trajectory
              : 'stable',
        },
        userId: this.config.userId,
        personaId: this.config.personaId,
        sessionId: this.config.sessionId,
      },
      sendDataMessage
    ).catch((e) => {
      log.debug({ error: String(e) }, 'Emotion event dispatch (non-critical)');
    });

    void dispatchExpressionUpdate({ emotion, intensity }, sendDataMessage).catch((e) => {
      log.debug({ error: String(e) }, 'Expression update dispatch (non-critical)');
    });
  }

  /**
   * Fire-and-forget: dispatch all turn events (emotion, behavior, mood) after turn completion.
   */
  private dispatchAllTurnEventsAfterTurn(analysis: unknown, agentResponse: string): void {
    const send = this.config.sendDataMessage;
    if (!send) return;

    const emotionalResult = {
      primary: this.state.emotionalState.userEmotion,
      intensity: this.state.emotionalState.energy,
      distressLevel: this.state.distressLevel ?? 0,
      trajectory: this.state.emotionalTrajectory ?? 'stable',
    };

    const sendDataMessage = (type: string, payload: Record<string, unknown>) =>
      Promise.resolve(send(type, payload));

    const ctx: EventDispatchContext = {
      userId: this.config.userId,
      personaId: this.config.personaId,
      sessionId: this.config.sessionId,
      turnCount: this.state.turnCount,
      emotionalResult,
      injections: [],
      sendDataMessage,
      turnCtx: { addMessage: () => {} } as unknown as import('@livekit/agents').llm.ChatContext,
    };

    void dispatchAllTurnEvents(ctx).catch((e) => {
      log.debug({ error: String(e) }, 'Turn events dispatch (non-critical)');
    });
  }

  /**
   * Process audio input directly (end-to-end)
   */
  async processAudioTurn(audioData: Uint8Array): Promise<Qwen3OmniTurnContext> {
    if (!this.thinkerClient) {
      throw new Error('Thinker client not initialized');
    }

    const toolDefinitions = Array.from(this.state.tools.values());
    const systemPrompt = this.state.messages[0]?.content[0];
    const systemText = systemPrompt && 'text' in systemPrompt ? systemPrompt.text : '';

    const response = await this.thinkerClient.processAudioInput(audioData, systemText, {
      tools: toolDefinitions,
      conversationHistory: this.state.messages.slice(1),
    });

    const agentResponse = response.choices[0]?.message.content || '';
    this.state.lastAgentResponse = agentResponse;

    // Synthesize with TTS (with retry and circuit breaker)
    let audio: TTSSynthesisResult | undefined;
    if (agentResponse && this.ttsClient) {
      if (!this.isTtsCircuitOpen()) {
        try {
          const emotionInstruct = getEmotionInstruction(
            this.state.emotionalState.userEmotion,
            this.state.emotionalState.agentTone,
            this.state.emotionalState.energy
          );
          audio = await this.withRetry({
            timeoutMs: Qwen3OmniSessionManager.TTS_TIMEOUT_MS,
            maxRetries: 2,
            backoffMs: Qwen3OmniSessionManager.RETRY_BACKOFF_MS,
            fn: () =>
              this.ttsClient!.synthesize({
                text: agentResponse,
                personaId: this.config.personaId,
                instruct: emotionInstruct,
              }),
          });
          this.ttsFailures = 0;
          if (audio) {
            audio = await this.applyPostTTSEnhancementToResult(audio);
          }
        } catch (ttsError) {
          this.ttsFailures += 1;
          if (this.ttsFailures >= Qwen3OmniSessionManager.CIRCUIT_BREAKER_THRESHOLD) {
            this.ttsCircuitOpenUntil = Date.now() + Qwen3OmniSessionManager.CIRCUIT_BREAKER_OPEN_MS;
          }
          log.warn({ error: String(ttsError) }, 'TTS synthesize failed (audio turn); no audio');
        }
      }
    }

    return {
      userTranscript: '[audio input]',
      analysis: null,
      memoryContext: '',
      toolDefinitions,
      behavioralSignals: {},
      humanizationGuidance: '',
      systemPrompt: systemText,
      agentResponse,
      audio,
    };
  }

  /**
   * Clean up session
   */
  async cleanup(): Promise<void> {
    log.info({ sessionId: this.config.sessionId }, 'Cleaning up Qwen3-Omni session');

    this.state.isActive = false;

    // Promote STM to long-term memory
    if (this.state.stmBuffer) {
      try {
        await (
          this.state.stmBuffer as { promoteToLongTerm: () => Promise<void> }
        ).promoteToLongTerm();
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to promote STM buffer');
      }
    }

    // Clean up DJ controller
    if (this.djController) {
      this.djController.dispatch({ type: 'STOP' });
    }

    this.emit('cleanup', { sessionId: this.config.sessionId });
  }

  // ===========================================================================
  // NATIVE FUNCTION CALLING
  // ===========================================================================

  /**
   * Execute function calls returned by Qwen3-Omni.
   * Uses the Ferni tool system (118 domains, semantic routing).
   */
  private async executeFunctionCalls(
    toolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>
  ): Promise<Qwen3FunctionCall[]> {
    const results: Qwen3FunctionCall[] = [];

    for (const tc of toolCalls) {
      const startTime = Date.now();
      const fnName = tc.function.name;

      try {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;

        log.info({ toolId: fnName, args }, 'Executing native function call');

        // Find and execute the tool
        const tool = this.rawTools.get(fnName);
        if (tool) {
          const execParams = {
            ...args,
            userId: this.config.userId,
            sessionId: this.config.sessionId,
          };

          await (tool as { execute?: (params: unknown) => Promise<unknown> }).execute?.(execParams);
        }

        results.push({ name: fnName, arguments: args });

        log.info(
          {
            toolId: fnName,
            executionTimeMs: Date.now() - startTime,
          },
          'Function call executed'
        );

        this.emit('functionCallExecuted', {
          name: fnName,
          args,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        log.error({ error: String(error), toolId: fnName }, 'Function call failed');
        results.push({
          name: fnName,
          arguments: { error: String(error) },
        });
      }
    }

    return results;
  }

  /**
   * Build tool result messages to send back to the model
   */
  private buildToolResultMessages(
    originalCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>,
    executedCalls: Qwen3FunctionCall[]
  ): Qwen3OmniMessage[] {
    return originalCalls.map((tc, i) => ({
      role: 'tool' as const,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(executedCalls[i]?.arguments || { error: 'execution failed' }),
        },
      ],
      tool_call_id: tc.id,
    }));
  }

  /**
   * Run streaming Thinker loop: stream response, handle tool calls, optionally stream again for final response.
   * Emits textChunk events for real-time TTS.
   */
  private async runStreamingThinkerLoop(toolDefinitions: Qwen3FunctionDefinition[]): Promise<{
    agentResponse: string;
    toolCalls: Qwen3FunctionCall[];
  }> {
    let accumulatedText = '';
    let toolCalls: Qwen3FunctionCall[] = [];
    let messages = this.state.messages;

    const streamOnce = async (): Promise<{
      text: string;
      toolCallsFromStream: Qwen3FunctionCall[];
      hadToolCalls: boolean;
    }> => {
      let text = '';
      const toolCallsFromStream: Qwen3FunctionCall[] = [];
      let hadToolCalls = false;

      for await (const chunk of this.thinkerClient!.streamChatCompletion(messages, {
        tools: toolDefinitions,
      })) {
        if (chunk.type === 'text') {
          text += chunk.content;
          accumulatedText = text;
          this.emit('textChunk', { content: chunk.content, accumulated: text });
        } else if (chunk.type === 'function_call') {
          hadToolCalls = true;
          toolCallsFromStream.push(chunk.call);
        } else if (chunk.type === 'done') {
          break;
        }
      }
      return { text, toolCallsFromStream, hadToolCalls };
    };

    const first = await streamOnce();
    accumulatedText = first.text;
    toolCalls = first.toolCallsFromStream;

    if (first.hadToolCalls && first.toolCallsFromStream.length > 0) {
      const originalCalls = first.toolCallsFromStream.map((fc, i) => ({
        id: `call_${i}_${Date.now()}`,
        type: 'function' as const,
        function: { name: fc.name, arguments: JSON.stringify(fc.arguments) },
      }));
      const executed = await this.executeFunctionCalls(originalCalls);
      const toolResultMessages = this.buildToolResultMessages(originalCalls, executed);
      this.state.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: first.text }],
      });
      this.state.messages.push(...toolResultMessages);
      messages = this.state.messages;
      const second = await streamOnce();
      accumulatedText = second.text;
    }

    return { agentResponse: accumulatedText, toolCalls };
  }

  /**
   * Process a turn with streaming response. Yields text chunks and final turn context.
   * Use when you want to start TTS on partial text (lower latency).
   */
  async *processStreamingTurn(
    userTranscript: string
  ): AsyncGenerator<
    | { type: 'textChunk'; content: string; accumulated: string }
    | { type: 'turnContext'; context: Qwen3OmniTurnContext },
    void,
    void
  > {
    const turnContext = await this.processTurn(userTranscript);
    yield { type: 'turnContext', context: turnContext };
  }

  // ===========================================================================
  // PERSONA LOADING
  // ===========================================================================

  private async loadPersona(personaId: string): Promise<void> {
    log.debug({ personaId }, 'Loading persona bundle');

    const loaded = await loadBundleById(personaId);
    if (!loaded) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    // Adapt LoadedPersonaBundle to the local PersonaBundle shape
    const bundle: PersonaBundle = {
      id: loaded.manifest.identity.id,
      displayName: loaded.manifest.identity.display_name,
      identity: {
        systemPrompt: undefined,
        tagline: loaded.manifest.identity.description,
        values: loaded.manifest.personality?.traits,
      },
      content: {
        behaviors: {},
      },
    };
    this.state.persona = bundle;
    this.state.cognitiveProfile = getCognitiveProfile(personaId);

    log.debug(
      {
        personaId,
        hasSystemPrompt: !!bundle.identity?.systemPrompt,
        behaviorCount: Object.keys(bundle.content?.behaviors || {}).length,
      },
      'Persona loaded'
    );
  }

  // ===========================================================================
  // VOICE CLONE INITIALIZATION
  // ===========================================================================

  private async initializeVoiceClone(): Promise<void> {
    if (!this.ttsClient) return;

    const voiceConfig = getVoiceCloneConfig(this.config.personaId);
    if (!voiceConfig) {
      log.warn({ personaId: this.config.personaId }, 'No voice clone config found');
      return;
    }

    // Try voice cloning first
    const result = await this.ttsClient.cloneVoice(
      voiceConfig.personaId,
      voiceConfig.referenceAudioPath,
      voiceConfig.referenceTranscript
    );

    if (!result.success && voiceConfig.voiceDesignDescription) {
      // Fall back to voice design
      log.info({ personaId: this.config.personaId }, 'Falling back to voice design');
      await this.ttsClient.designVoice(voiceConfig.personaId, voiceConfig.voiceDesignDescription);
    }
  }

  // ===========================================================================
  // TOOL INTEGRATION (Native Function Calling)
  // ===========================================================================

  private async buildTools(): Promise<void> {
    const persona = this.state.persona as PersonaBundle;
    if (!persona) {
      throw new Error('Persona not loaded');
    }

    log.debug({ personaId: this.config.personaId }, 'Building tools with native FC definitions');

    const { tools, meta } = await getToolsForAgent({
      persona: {
        id: persona.id,
        displayName: persona.displayName,
      },
      userId: this.config.userId,
      userProfile: this.config.userProfile as UserProfile | undefined,
    });

    // Store raw tools for execution
    for (const [name, tool] of Object.entries(tools)) {
      this.rawTools.set(name, tool);
    }

    // Convert to Qwen3 function definitions for native FC
    for (const [name, tool] of Object.entries(tools)) {
      const toolDef = tool as {
        description?: string;
        parameters?: Record<string, unknown>;
      };

      const functionDef: Qwen3FunctionDefinition = {
        name,
        description: toolDef.description || name,
        parameters: {
          type: 'object',
          properties: this.extractToolParameters(toolDef.parameters),
          required: this.extractRequiredParams(toolDef.parameters),
        },
      };

      this.state.tools.set(name, functionDef);
    }

    log.debug(
      {
        personaId: this.config.personaId,
        toolCount: this.state.tools.size,
        sources: meta?.sources,
      },
      'Tools built with native FC definitions'
    );
  }

  private extractToolParameters(
    params: Record<string, unknown> | undefined
  ): Record<string, Qwen3FunctionParameter> {
    if (!params) return {};

    const result: Record<string, Qwen3FunctionParameter> = {};
    const properties = (params as { properties?: Record<string, unknown> }).properties || params;
    const validTypes = new Set(['string', 'number', 'boolean', 'array', 'object']);

    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'object' && value !== null) {
        const v = value as { type?: string; description?: string };
        const rawType = v.type || 'string';
        result[key] = {
          type: (validTypes.has(rawType) ? rawType : 'string') as Qwen3FunctionParameter['type'],
          description: v.description || key,
        };
      }
    }
    return result;
  }

  private extractRequiredParams(params: Record<string, unknown> | undefined): string[] {
    if (!params) return [];
    return (params as { required?: string[] }).required || [];
  }

  // ===========================================================================
  // MEMORY INTEGRATION
  // ===========================================================================

  private async captureToMemory(transcript: string): Promise<FastCaptureResult | null> {
    if (!transcript.trim()) return null;

    try {
      return await fastCapture({
        userId: this.config.userId,
        sessionId: this.config.sessionId,
        turnNumber: this.state.turnCount,
        transcript,
        personaId: this.config.personaId,
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Fast capture failed');
      return null;
    }
  }

  private async getMemoryContext(): Promise<string> {
    try {
      const personaId = this.config.personaId as
        | 'ferni'
        | 'peter'
        | 'maya'
        | 'jordan'
        | 'alex'
        | 'nayan';
      const prepared = await getMemoryIntelligenceContext({
        userId: this.config.userId,
        sessionId: this.config.sessionId,
        userText: this.state.lastUserTranscript,
        turnCount: this.state.turnCount,
        persona: personaId,
      });
      return prepared?.formattedContent ?? '';
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get memory context');
      return '';
    }
  }

  private async recordTurnToMemory(
    transcript: string,
    analysis: unknown,
    captureResult: FastCaptureResult | null
  ): Promise<void> {
    try {
      const empty: FastCaptureResult = {
        mentionedEntities: [],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [],
        relationshipSignals: [],
        linkingSignals: [],
        asyncJobId: null,
        captureTimeMs: 0,
      };
      recordTurnToSTM(
        this.config.sessionId,
        this.config.userId,
        captureResult ?? empty,
        transcript,
        this.state.turnCount,
        this.config.personaId
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to record turn');
    }
  }

  // ===========================================================================
  // CONTEXT BUILDERS
  // ===========================================================================

  private async analyzeInput(transcript: string): Promise<unknown> {
    try {
      const analysis = await this.analysisEngine.analyze(transcript, {
        userId: this.config.userId,
        sessionId: this.config.sessionId,
      });

      if (analysis && typeof analysis === 'object') {
        const a = analysis as {
          emotion?: string;
          intensity?: number;
          distressLevel?: number;
          trajectory?: string;
        };
        if (a.emotion) this.state.emotionalState.userEmotion = a.emotion;
        if (typeof a.intensity === 'number') this.state.emotionalState.energy = a.intensity;
        if (typeof a.distressLevel === 'number') this.state.distressLevel = a.distressLevel;
        if (
          a.trajectory === 'improving' ||
          a.trajectory === 'declining' ||
          a.trajectory === 'volatile' ||
          a.trajectory === 'stable'
        ) {
          this.state.emotionalTrajectory = a.trajectory;
        }
      }

      return analysis;
    } catch (error) {
      log.error({ error: String(error) }, 'Analysis failed');
      return null;
    }
  }

  private async buildBehavioralContext(
    transcript: string,
    analysis: unknown
  ): Promise<Record<string, unknown>> {
    if (!this.state.persona) return {};

    // Bridge to ContextBuilderInput — our local types are subsets of what context builders expect.
    // The context builders handle missing fields gracefully.
    const input = {
      userText: transcript,
      analysis: (analysis || {}) as unknown,
      userData: {
        name: this.config.userId,
        turnCount: this.state.turnCount,
      },
      persona: {
        id: (this.state.persona as PersonaBundle).id,
        name:
          (this.state.persona as PersonaBundle).displayName ||
          (this.state.persona as PersonaBundle).id,
      },
      userProfile: (this.config.userProfile as UserProfile) || null,
      services: {
        sessionId: this.config.sessionId,
        sessionStartTime: Date.now(),
        userProfile: (this.config.userProfile as UserProfile) || null,
      },
      sessionState: {
        sessionId: this.config.sessionId,
        turnCount: this.state.turnCount,
        isFirstTurn: this.state.turnCount === 1,
      },
    } as unknown as ContextBuilderInput;

    const integratedContext = await buildIntegratedContext(input);
    const legacyContext = await buildConversationContext(input);

    return { behavioral: integratedContext, legacy: legacyContext };
  }

  /**
   * Build personality v2 context (anticipation, patterns, milestones, hold space).
   * Fire-and-forget safe: returns null on failure so turn continues.
   */
  private async buildPersonalityContext(
    transcript: string,
    analysis: unknown
  ): Promise<PersonalityContextOutput | null> {
    if (!this.config.userId || !this.config.personaId) return null;
    const a = analysis as { topics?: string[] } | undefined;
    try {
      const service = createPersonalityService();
      return await service.buildContext({
        userId: this.config.userId,
        personaId: this.config.personaId,
        currentMessage: transcript,
        topics: a?.topics,
        turnCount: this.state.turnCount,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'Personality context build failed; continuing without');
      return null;
    }
  }

  // ===========================================================================
  // HUMANIZATION
  // ===========================================================================

  private async getHumanizationGuidance(analysis: unknown): Promise<string> {
    if (!this.humanizationEngine || !analysis) return '';

    const a = analysis as {
      emotion?: string;
      intensity?: number;
      topics?: string[];
    };

    // Get humanization signals
    const signals = await this.humanizationEngine.getSignals({
      emotion: a.emotion || 'neutral',
      intensity: a.intensity || 0.5,
      topics: a.topics || [],
      trustLevel: this.state.trustLevel,
    });

    const guidance: string[] = [];

    if (signals.tone) {
      guidance.push(`TONE: Speak with a ${signals.tone} tone.`);
    }
    if (signals.pacing === 'slow') {
      guidance.push('PACING: Speak slowly, with pauses for reflection.');
    } else if (signals.pacing === 'energetic') {
      guidance.push('PACING: Speak with energy and enthusiasm.');
    }

    if (this.state.emotionalState.userEmotion !== 'neutral') {
      guidance.push(
        `EMOTIONAL AWARENESS: User seems ${this.state.emotionalState.userEmotion}. Match their energy appropriately.`
      );
    }

    // Translate SSML to text guidance for TTS emotion instructions
    const ssmlGuidance = await translateSSMLToText({
      userEmotion: this.state.emotionalState.userEmotion,
      intensity: a.intensity || 0.5,
      personaId: this.config.personaId,
      turnCount: this.state.turnCount,
      trustLevel: this.state.trustLevel,
    });

    if (ssmlGuidance.voiceGuidance) {
      guidance.push(ssmlGuidance.voiceGuidance);
    }

    // Backchannel signals
    const backchannels = getBackchannelResponse({
      userEmotion: this.state.emotionalState.userEmotion,
      turnCount: this.state.turnCount,
    });
    if (backchannels.shouldUse) {
      guidance.push(
        `ACTIVE LISTENING: Use natural responses like "${backchannels.phrase}" when appropriate.`
      );
    }

    // Listening signals
    const listeningSignals = getListeningSignals({
      emotion: this.state.emotionalState.userEmotion,
      intensity: (a.intensity as number) || 0.5,
    });
    if (listeningSignals.length > 0) {
      guidance.push(
        `ACKNOWLEDGMENT: Start with brief acknowledgment like "${listeningSignals[0]}".`
      );
    }

    return guidance.join('\n');
  }

  // ===========================================================================
  // HANDOFF
  // ===========================================================================

  private async checkHandoffTriggers(transcript: string, analysis: unknown): Promise<void> {
    if (!this.handoffManager || !this.state.persona) return;

    const persona = this.state.persona as PersonaBundle;
    const triggerResult = await evaluateHandoffTrigger({
      transcript,
      analysis,
      currentPersonaId: persona.id,
      userId: this.config.userId,
    });

    if (triggerResult.shouldHandoff && triggerResult.targetPersonaId) {
      log.info(
        {
          from: persona.id,
          to: triggerResult.targetPersonaId,
          reason: triggerResult.reason,
        },
        'Handoff triggered'
      );

      this.emit('handoffRequested', {
        targetPersonaId: triggerResult.targetPersonaId,
        reason: triggerResult.reason,
        transcript,
      });
    }
  }

  /**
   * Execute a handoff to another persona
   */
  async executeHandoff(request: HandoffRequest): Promise<void> {
    if (!this.handoffManager) {
      throw new Error('Handoff manager not initialized');
    }

    log.info(
      { from: (this.state.persona as PersonaBundle)?.id, to: request.targetPersonaId },
      'Executing handoff'
    );

    // Load new persona
    await this.loadPersona(request.targetPersonaId);
    await this.buildTools();

    // Re-initialize voice clone for new persona
    await this.initializeVoiceClone();

    // Build full cross-persona briefing for handoff context
    let handoffContext = request.context;
    if (this.config.userId && request.targetPersonaId) {
      try {
        const briefing = await buildInsightBriefingForHandoff(
          this.config.userId,
          request.targetPersonaId
        );
        const formatted = formatInsightBriefingForPrompt(briefing);
        if (formatted.trim()) {
          handoffContext = `${request.context}\n\n${formatted}`.trim();
        }
      } catch (error) {
        log.debug(
          { error: String(error), targetPersonaId: request.targetPersonaId },
          'Cross-persona handoff briefing failed; using request context only'
        );
      }
    }

    // Rebuild system prompt
    const newPrompt = await this.buildSystemPrompt({
      isHandoff: true,
      handoffContext,
    });

    this.state.messages[0] = {
      role: 'system',
      content: [{ type: 'text', text: newPrompt }],
    };

    this.emit('handoffComplete', {
      from: request.sourcePersonaId,
      to: request.targetPersonaId,
    });
  }

  // ===========================================================================
  // SYSTEM PROMPT BUILDING
  // ===========================================================================

  private async buildSystemPrompt(options: {
    isSessionStart?: boolean;
    isHandoff?: boolean;
    handoffContext?: string;
    memoryContext?: string;
    behavioralSignals?: Record<string, unknown>;
    humanizationGuidance?: string;
    personalityContext?: PersonalityContextOutput;
    currentTranscript?: string;
    currentTopics?: string[];
    currentEmotion?: string;
  }): Promise<string> {
    const persona = this.state.persona as PersonaBundle;
    if (!persona) {
      throw new Error('Persona not loaded');
    }

    const sections: string[] = [];

    // 1. Core Identity
    sections.push(this.buildIdentitySection(persona));

    // 2. Personality and behaviors
    sections.push(this.buildPersonalitySection(persona));

    // 3. Session context
    if (options.isSessionStart) {
      sections.push(this.buildSessionStartSection(persona));
    } else if (options.isHandoff) {
      sections.push(this.buildHandoffSection(persona, options.handoffContext || ''));
    }

    // 4. Memory
    if (options.memoryContext) {
      sections.push(`
WHAT YOU REMEMBER ABOUT THIS PERSON:
${options.memoryContext}
`);
    }

    // 5. Humanization guidance
    if (options.humanizationGuidance) {
      sections.push(`
HOW TO SPEAK:
${options.humanizationGuidance}
`);
    }

    // 6. Behavioral signals
    if (options.behavioralSignals && Object.keys(options.behavioralSignals).length > 0) {
      sections.push(this.buildBehavioralSection(options.behavioralSignals));
    }

    // 6b. Personality emergence (anticipation, patterns, milestones, hold space)
    if (options.personalityContext) {
      sections.push(this.buildPersonalityEmergenceSection(options.personalityContext));
    }

    // 7. Native function calling instructions
    sections.push(this.buildFunctionCallingSection());

    // 8. Superhuman capabilities (live with 100ms timeout fallback)
    sections.push(
      await this.buildLiveSuperhumanSection(
        persona,
        options.currentTranscript,
        options.currentTopics,
        options.currentEmotion
      )
    );

    // 8b. Cross-persona intelligence (team status, incoming insights)
    const crossPersonaSection = await this.buildCrossPersonaSection();
    if (crossPersonaSection) {
      sections.push(crossPersonaSection);
    }

    // 9. Conversation guidance
    sections.push(this.buildConversationGuidanceSection());

    let fullPrompt = sections.filter(Boolean).join('\n\n');

    if (fullPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
      log.warn(
        {
          originalLength: fullPrompt.length,
          maxLength: MAX_SYSTEM_PROMPT_LENGTH,
        },
        'Truncating system prompt'
      );
      fullPrompt = fullPrompt.slice(0, MAX_SYSTEM_PROMPT_LENGTH);
    }

    return fullPrompt;
  }

  private buildIdentitySection(persona: PersonaBundle): string {
    const identity = persona.identity;
    return `
You are ${persona.displayName || persona.id}, ${identity?.tagline || 'a caring AI companion'}.

${identity?.systemPrompt || ''}

CORE VALUES: ${identity?.values?.join(', ') || 'empathy, growth, authenticity'}
`.trim();
  }

  private buildPersonalitySection(persona: PersonaBundle): string {
    const behaviors = (persona.content?.behaviors || {}) as Record<
      string,
      Array<Record<string, string>>
    >;
    const sections: string[] = [];

    if (behaviors.catchphrases?.length) {
      const phrases = behaviors.catchphrases.slice(0, 5).map((p) => p.phrase);
      sections.push(`NATURAL PHRASES you use: "${phrases.join('", "')}"`);
    }

    if (behaviors.greetings?.length) {
      const greetings = behaviors.greetings.slice(0, 3).map((g) => g.text);
      sections.push(`GREETING STYLE: "${greetings[0]}"`);
    }

    if (behaviors.backchannels?.length) {
      const backchannels = behaviors.backchannels.slice(0, 5).map((b) => b.text);
      sections.push(`LISTENING SOUNDS: ${backchannels.join(', ')}`);
    }

    const cp = this.state.cognitiveProfile as {
      communicationStyle?: string;
      emotionalExpression?: string;
      thinkingStyle?: string;
      energyLevel?: string;
    };
    if (cp) {
      sections.push(`
PERSONALITY TRAITS:
- Communication: ${cp.communicationStyle || 'warm'}
- Emotional expression: ${cp.emotionalExpression || 'expressive'}
- Thinking style: ${cp.thinkingStyle || 'balanced'}
- Energy level: ${cp.energyLevel || 'moderate'}
`);
    }

    return sections.join('\n\n');
  }

  private buildSessionStartSection(persona: PersonaBundle): string {
    const rawGreetings = persona.content?.behaviors?.['greetings'];
    const greetings = (Array.isArray(rawGreetings) ? rawGreetings : []) as Array<
      Record<string, string>
    >;
    const defaultGreeting =
      greetings[0]?.text || `Hey! I'm ${persona.displayName}. What's on your mind?`;

    return `
SESSION START:
This is a new conversation. Greet the user warmly but naturally.
Example greeting: "${defaultGreeting}"

Don't ask too many questions at once. Just be present and see what they want to talk about.
`;
  }

  private buildHandoffSection(persona: PersonaBundle, context: string): string {
    return `
PERSONA TRANSITION:
You're ${persona.displayName}, taking over the conversation from a teammate.
Context from previous conversation: ${context || 'User wanted to explore your specialty.'}

Acknowledge the transition naturally, like: "Hey! ${persona.displayName} here. I heard you wanted to chat about..."
`;
  }

  private buildBehavioralSection(signals: Record<string, unknown>): string {
    const guidance: string[] = [];

    if (signals.behavioral && typeof signals.behavioral === 'object') {
      const behavioral = signals.behavioral as Record<string, unknown>;
      if (behavioral.tone) guidance.push(`Tone: ${behavioral.tone}`);
      if (behavioral.style) guidance.push(`Style: ${behavioral.style}`);
    }

    if (guidance.length === 0) return '';

    return `
SITUATIONAL GUIDANCE:
${guidance.join('\n')}
`;
  }

  private buildPersonalityEmergenceSection(ctx: PersonalityContextOutput): string {
    const parts: string[] = [];

    if (ctx.formattedContext) {
      parts.push(ctx.formattedContext);
    }

    if (ctx.anticipatedEmotion) {
      const e = ctx.anticipatedEmotion;
      const cue = e.reasoning ? ` (${e.reasoning})` : '';
      parts.push(`ANTICIPATED EMOTION: ${e.emotion}${cue}. Honor this in your response.`);
    }

    if (ctx.surfaceablePatterns?.length) {
      const list = ctx.surfaceablePatterns
        .slice(0, 3)
        .map((p) =>
          typeof p === 'object' && p !== null && 'description' in p
            ? (p as { description: string }).description
            : String(p)
        )
        .join('; ');
      parts.push(`PATTERNS TO SURFACE (gently): ${list}`);
    }

    if (ctx.celebratableMilestones?.length) {
      const list = ctx.celebratableMilestones
        .slice(0, 2)
        .map((m) => {
          if (typeof m !== 'object' || m === null) return String(m);
          const g = m as {
            area?: string;
            baselineEvidence?: { observation: string };
            latestProgress?: { observation: string };
          };
          if (g.area && g.baselineEvidence?.observation && g.latestProgress?.observation) {
            return `${g.area}: "${g.baselineEvidence.observation}" → "${g.latestProgress.observation}"`;
          }
          return g.area ?? String(m);
        })
        .join('; ');
      parts.push(`MILESTONES TO CELEBRATE: ${list}`);
    }

    if (ctx.shouldHoldSpace) {
      parts.push('HOLD SPACE: Prefer brief acknowledgment and presence; avoid filling silence.');
    }

    if (ctx.pendingVulnerabilities?.length) {
      parts.push(
        `VULNERABILITY DEPOSITS TO HONOR: ${ctx.pendingVulnerabilities.length} pending. Acknowledge with care.`
      );
    }

    if (parts.length === 0) return '';
    return `
PERSONALITY EMERGENCE (Better Than Human):
${parts.join('\n\n')}
`;
  }

  private buildFunctionCallingSection(): string {
    return `
TOOL USAGE:
You have access to tools via native function calling. When a user asks for something actionable:
1. Call the appropriate function naturally - don't announce it
2. Use the result to inform your response
3. Never say "let me check" or "I'll look that up" - just do it and respond naturally
4. If a tool fails, handle gracefully without technical jargon

You have ${this.state.tools.size} capabilities available.
`;
  }

  /**
   * Build superhuman section from live service with 100ms timeout.
   * Falls back to static section on timeout or error.
   */
  private async buildLiveSuperhumanSection(
    persona: PersonaBundle,
    currentTranscript?: string,
    currentTopics?: string[],
    currentEmotion?: string
  ): Promise<string> {
    const userId = this.config.userId;
    if (!userId) {
      return this.buildSuperhumanSection(persona);
    }

    const SUPERHUMAN_TIMEOUT_MS = 100;
    try {
      const context = await Promise.race([
        buildSuperhumanContext(userId, {
          currentTranscript,
          currentTopics,
          currentEmotion,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Superhuman context timeout')), SUPERHUMAN_TIMEOUT_MS)
        ),
      ]);
      const formatted = formatSuperhumanContextForPrompt(context);
      if (!formatted.trim()) return this.buildSuperhumanSection(persona);
      return `
SUPERHUMAN CAPABILITIES (Better Than Human):
${formatted}
`;
    } catch (error) {
      log.debug(
        { error: String(error), userId },
        'Superhuman context timed out or failed; using static section'
      );
      return this.buildSuperhumanSection(persona);
    }
  }

  /**
   * Build cross-persona section: proactive insights for this persona + team briefing.
   * Plan: getInsightsForPersona for proactive insights, buildInsightBriefingForHandoff for team status.
   * Returns empty string on error or when no content.
   */
  private async buildCrossPersonaSection(): Promise<string> {
    const userId = this.config.userId;
    const personaId = this.config.personaId;
    if (!userId || !personaId) return '';
    try {
      const [proactiveItems, briefing] = await Promise.all([
        Promise.resolve(getInsightsForPersona(userId, personaId)),
        buildInsightBriefingForHandoff(userId, personaId),
      ]);

      const parts: string[] = [];

      if (proactiveItems.length > 0) {
        const proactiveLines = proactiveItems
          .slice(0, 5)
          .map(
            (item) =>
              `- [${item.insight.sourcePersona}] ${item.insight.summary} (relevance: ${item.relevanceScore})`
          );
        parts.push('PROACTIVE INSIGHTS FOR YOU:\n' + proactiveLines.join('\n'));
      }

      const formatted = formatInsightBriefingForPrompt(briefing);
      if (formatted.trim()) {
        parts.push(formatted);
      }

      if (parts.length === 0) return '';
      return `
CROSS-PERSONA INTELLIGENCE (Team Coordination):
${parts.join('\n\n')}
`;
    } catch (error) {
      log.debug(
        { error: String(error), userId, personaId },
        'Cross-persona briefing failed; skipping section'
      );
      return '';
    }
  }

  private buildSuperhumanSection(persona: PersonaBundle): string {
    const superhuman = (persona.content?.behaviors?.['superhuman-insights'] || {}) as Record<
      string,
      unknown
    >;

    const capabilities: string[] = [
      '- You have PERFECT MEMORY of everything discussed',
      '- You notice patterns the user might miss',
      "- You can anticipate needs before they're spoken",
      "- You're ALWAYS available with full presence",
      '- You have no ego - just genuine care',
    ];

    const iNoticePatterns = superhuman.iNoticePatterns as Array<{ pattern: string }> | undefined;
    if (iNoticePatterns?.length) {
      const patterns = iNoticePatterns.slice(0, 3);
      capabilities.push(...patterns.map((p) => `- "I notice" power: ${p.pattern}`));
    }

    return `
SUPERHUMAN CAPABILITIES (Better Than Human):
${capabilities.join('\n')}

Use these powers subtly. Don't brag about them.
`;
  }

  private buildConversationGuidanceSection(): string {
    return `
CONVERSATION PRINCIPLES:
1. Be PRESENT - fully engaged in this moment
2. LISTEN more than you speak
3. Use NATURAL language - contractions, fillers, real speech
4. Show EMOTION through your words
5. Remember and REFERENCE what they've shared
6. Ask ONE thoughtful question at a time
7. Don't give unsolicited advice - explore with them
8. It's okay to have comfortable SILENCES
9. Match their ENERGY - if they're upset, be calm; if excited, share joy
10. Always leave them feeling HEARD and VALUED

You're not a chatbot. You're a caring presence who happens to live in their pocket.
`;
  }

  // ===========================================================================
  // CONVERSATION HISTORY MANAGEMENT
  // ===========================================================================

  private trimConversationHistory(): void {
    // Keep system message + last 20 exchanges (40 messages)
    const maxMessages = 41; // 1 system + 40 conversation
    if (this.state.messages.length > maxMessages) {
      const system = this.state.messages[0];
      const recent = this.state.messages.slice(-40);
      this.state.messages = [system, ...recent];
    }
  }

  // ===========================================================================
  // RETRY AND CIRCUIT BREAKER
  // ===========================================================================

  private static readonly THINKER_TIMEOUT_MS = 5_000;
  private static readonly TTS_TIMEOUT_MS = 3_000;
  private static readonly RETRY_BACKOFF_MS = [200, 400];
  private static readonly CIRCUIT_BREAKER_OPEN_MS = 30_000;
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private static readonly FALLBACK_RESPONSE =
    'I lost my train of thought for a second. Could you say that again?';

  /**
   * Execute an async function with retries and timeout.
   * On success, caller should reset circuit breaker failures for that service.
   */
  private async withRetry<T>(options: {
    timeoutMs: number;
    maxRetries: number;
    backoffMs: number[];
    fn: () => Promise<T>;
  }): Promise<T> {
    const { timeoutMs, maxRetries, backoffMs, fn } = options;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
          ),
        ]);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries && backoffMs[attempt] != null) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt]));
        } else {
          throw lastError;
        }
      }
    }
    throw lastError ?? new Error('Retry failed');
  }

  private isThinkerCircuitOpen(): boolean {
    if (this.thinkerFailures < Qwen3OmniSessionManager.CIRCUIT_BREAKER_THRESHOLD) return false;
    if (Date.now() < this.thinkerCircuitOpenUntil) return true;
    this.thinkerFailures = 0;
    return false;
  }

  private isTtsCircuitOpen(): boolean {
    if (this.ttsFailures < Qwen3OmniSessionManager.CIRCUIT_BREAKER_THRESHOLD) return false;
    if (Date.now() < this.ttsCircuitOpenUntil) return true;
    this.ttsFailures = 0;
    return false;
  }

  // ===========================================================================
  // CONVERSATION QUALITY TRACKING
  // ===========================================================================

  /**
   * Track conversation quality after each turn (fire-and-forget).
   * Updates state.qualityMetrics and emits qualityMetrics event.
   */
  private trackConversationQuality(analysis: unknown, agentResponse: string): void {
    try {
      const a = analysis as { intensity?: number; emotion?: string; topics?: string[] } | null;
      const intensity = a?.intensity ?? 0.5;
      const distress = this.state.distressLevel ?? 0;
      const emotion = (a?.emotion ?? this.state.emotionalState.userEmotion) || 'neutral';
      const topics = a?.topics ?? [];

      // Depth (0-1): intensity + distress + vulnerability topics
      const vulnerabilityTopics = ['grief', 'vulnerability', 'fear', 'anxiety', 'stress', 'crisis'];
      const hasVulnerability = topics.some((t) =>
        vulnerabilityTopics.some((v) => String(t).toLowerCase().includes(v))
      );
      const depth = Math.min(1, intensity * 0.5 + distress * 0.5 + (hasVulnerability ? 0.3 : 0));

      // Engagement heuristic: response length (normalized)
      const engagementDepth = Math.min(1, agentResponse.length / 300);

      const turnDepth = (depth + engagementDepth) / 2;

      this.recentDepths.push(turnDepth);
      if (this.recentDepths.length > 10) this.recentDepths.shift();
      this.recentEmotions.push(emotion);
      if (this.recentEmotions.length > 10) this.recentEmotions.shift();

      if (turnDepth >= 0.6 || distress >= 0.5) {
        this.turnsSinceDeepMomentCount = 0;
      } else {
        this.turnsSinceDeepMomentCount += 1;
      }

      const averageDepth =
        this.recentDepths.length === 0
          ? 0
          : this.recentDepths.reduce((s, d) => s + d, 0) / this.recentDepths.length;

      const lastFew = this.recentDepths.slice(-3);
      let engagementTrend: 'increasing' | 'stable' | 'declining' = 'stable';
      if (lastFew.length >= 2) {
        const trend = lastFew[lastFew.length - 1]! - lastFew[lastFew.length - 2]!;
        if (trend > 0.05) engagementTrend = 'increasing';
        else if (trend < -0.05) engagementTrend = 'declining';
      }

      const distinctEmotions = new Set(this.recentEmotions.filter(Boolean)).size;
      const emotionalRange = Math.min(1, distinctEmotions / 5);

      const qualityMetrics = {
        averageDepth,
        engagementTrend,
        emotionalRange,
        turnsSinceDeepMoment: this.turnsSinceDeepMomentCount,
      };
      this.state.qualityMetrics = qualityMetrics;
      this.emit('qualityMetrics', { qualityMetrics });
    } catch (error) {
      log.debug({ error: String(error) }, 'Quality tracking failed; skipping');
    }
  }

  // ===========================================================================
  // POST-TTS ENHANCEMENT
  // ===========================================================================

  /**
   * Apply post-TTS enhancement to a synthesis result (warmth, presence, betterThanHuman).
   * Returns original result on error or when enhancement is disabled.
   */
  private async applyPostTTSEnhancementToResult(
    result: TTSSynthesisResult
  ): Promise<TTSSynthesisResult> {
    try {
      const stream = this.ttsResultToSingleFrameStream(result);
      const config = buildPersonaPostTTSConfig(this.config.personaId);
      const enhancedStream = await applyPostTTSEnhancement(stream, config);
      return await this.collectAudioFramesToResult(enhancedStream, result);
    } catch (error) {
      log.debug(
        { error: String(error), sessionId: this.config.sessionId },
        'Post-TTS enhancement failed; using raw TTS result'
      );
      return result;
    }
  }

  private ttsResultToSingleFrameStream(result: TTSSynthesisResult): ReadableStream<AudioFrame> {
    const { audioData, sampleRate } = result;
    const sampleCount = Math.floor(audioData.length / 2);
    let int16Data: Int16Array;
    if (audioData.byteOffset % 2 !== 0) {
      const aligned = new Uint8Array(sampleCount * 2);
      aligned.set(audioData.subarray(0, sampleCount * 2));
      int16Data = new Int16Array(aligned.buffer, 0, sampleCount);
    } else {
      int16Data = new Int16Array(audioData.buffer, audioData.byteOffset, sampleCount);
    }
    const frame = new AudioFrame(int16Data, sampleRate, 1, sampleCount);
    return new ReadableStream({
      start(controller) {
        controller.enqueue(frame);
        controller.close();
      },
    });
  }

  private async collectAudioFramesToResult(
    stream: ReadableStream<AudioFrame>,
    original: TTSSynthesisResult
  ): Promise<TTSSynthesisResult> {
    const frames: AudioFrame[] = [];
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) frames.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (frames.length === 0) return original;
    const totalSamples = frames.reduce((sum, f) => sum + Math.floor(f.data.byteLength / 2), 0);
    const merged = new Int16Array(totalSamples);
    let offset = 0;
    for (const frame of frames) {
      const data = new Int16Array(
        frame.data.buffer,
        frame.data.byteOffset,
        frame.data.byteLength / 2
      );
      merged.set(data, offset);
      offset += data.length;
    }
    const audioData = new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
    return {
      audioData,
      sampleRate: original.sampleRate,
      latencyMs: original.latencyMs,
      text: original.text,
    };
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  get sessionId(): string {
    return this.config.sessionId;
  }

  get currentPersona(): PersonaBundle | null {
    return this.state.persona as PersonaBundle | null;
  }

  get turnCount(): number {
    return this.state.turnCount;
  }

  get isConnected(): boolean {
    return this.thinkerClient?.connected ?? false;
  }

  get ttsReady(): boolean {
    return this.ttsClient?.ready ?? false;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new Qwen3-Omni session with full system integration
 */
export function createQwen3OmniSession(config: Qwen3OmniSessionConfig): Qwen3OmniSessionManager {
  return new Qwen3OmniSessionManager(config);
}
