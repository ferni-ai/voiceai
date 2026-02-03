/**
 * PersonaPlex Session Manager
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
 * This is the production-grade integration - NO SHORTCUTS.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { EventEmitter } from 'events';

// Types
import type { PersonaBundle } from '../../../personas/types.js';
import type { UserProfile } from '../../../types/user-profile.js';
import type { SessionServices } from '../../../types/session.js';

// PersonaPlex
import { PersonaPlexClient, createPersonaPlexClient } from '../client.js';
import { getVoiceEmbeddingPath, getFallbackVoice } from '../config.js';
import type { PersonaPlexConnectionOptions, PersonaPlexClientEvents } from '../types.js';

// Persona system
import { loadPersonaBundle } from '../../../personas/bundles/loader.js';
import { getCognitiveProfile } from '../../../personas/cognitive/cognitive-profiles.js';

// Context builders
import { buildConversationContext } from '../../../intelligence/context-builders/index.js';
import { buildIntegratedContext } from '../../../intelligence/context-builders/behavioral/orchestrator.js';
import type { ContextBuilderInput } from '../../../intelligence/context-builders/core/types.js';

// Tools
import { getToolsForAgent } from '../../../tools/orchestrator/voice-agent-integration.js';
import type { Tool } from '../../../tools/registry/types.js';

// Memory
import { fastCapture, type FastCaptureResult } from '../../../memory/dynamic/fast-capture.js';
import { getOrCreateSTMBuffer } from '../../../memory/dynamic/stm-buffer.js';
import { getMemoryContext } from '../../../memory/dynamic/dynamic-memory-context.js';
import { recordTurn } from '../../../memory/dynamic/turn-recorder.js';

// Humanization
import { HumanizationEngine, createHumanizationEngine } from '../../../conversation/humanization-engine.js';
import { getBackchannelResponse } from '../../../speech/backchanneling/backchannel-engine.js';
import { getListeningSignals } from '../../../speech/backchanneling/listening-signals.js';

// Handoff
import { HandoffManager, type HandoffRequest } from '../../../handoff/handoff-manager.js';
import { evaluateHandoffTrigger } from '../../../handoff/handoff-triggers.js';

// Music/DJ
import { getDJController } from '../../../audio/dj-controller.js';
import type { DJController } from '../../../audio/dj-controller.js';

// Analytics
import { AnalysisEngine } from '../../../intelligence/detectors/analysis-engine.js';

const log = createLogger({ module: 'personaplex-session' });

// =============================================================================
// TYPES
// =============================================================================

export interface PersonaPlexSessionConfig {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Initial persona ID */
  personaId: string;
  /** User profile (optional) */
  userProfile?: UserProfile | null;
  /** Session services (DI container) */
  services: SessionServices;
  /** PersonaPlex server URL */
  serverUrl?: string;
  /** Use custom voice embeddings */
  useCustomVoice?: boolean;
  /** Enable music/DJ controller */
  enableMusic?: boolean;
  /** Enable handoffs */
  enableHandoffs?: boolean;
}

export interface PersonaPlexSessionState {
  /** Current persona */
  persona: PersonaBundle | null;
  /** Cognitive profile for persona */
  cognitiveProfile: ReturnType<typeof getCognitiveProfile> | null;
  /** Available tools */
  tools: Map<string, Tool>;
  /** STM buffer for session */
  stmBuffer: ReturnType<typeof getOrCreateSTMBuffer> | null;
  /** Conversation turn count */
  turnCount: number;
  /** Is session active */
  isActive: boolean;
  /** Last user transcript */
  lastUserTranscript: string;
  /** Last agent response */
  lastAgentResponse: string;
  /** Current emotional state */
  emotionalState: {
    userEmotion: string;
    agentTone: string;
    energy: number;
  };
  /** Trust level (0-10) */
  trustLevel: number;
}

export interface PersonaPlexTurnContext {
  /** User's speech transcript */
  userTranscript: string;
  /** Analysis results */
  analysis: ReturnType<typeof AnalysisEngine.prototype.analyze> | null;
  /** Memory context */
  memoryContext: string;
  /** Tool context */
  toolContext: string;
  /** Behavioral signals */
  behavioralSignals: Record<string, unknown>;
  /** Humanization guidance (translated from SSML) */
  humanizationGuidance: string;
  /** Full PersonaPlex prompt */
  fullPrompt: string;
}

// =============================================================================
// SESSION MANAGER
// =============================================================================

export class PersonaPlexSessionManager extends EventEmitter {
  private config: PersonaPlexSessionConfig;
  private state: PersonaPlexSessionState;
  private client: PersonaPlexClient | null = null;
  private humanizationEngine: HumanizationEngine | null = null;
  private handoffManager: HandoffManager | null = null;
  private djController: DJController | null = null;
  private analysisEngine: AnalysisEngine;
  private isInitialized = false;

  constructor(config: PersonaPlexSessionConfig) {
    super();
    this.config = config;
    this.state = {
      persona: null,
      cognitiveProfile: null,
      tools: new Map(),
      stmBuffer: null,
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
    log.info({ sessionId: this.config.sessionId, personaId: this.config.personaId }, 'Initializing PersonaPlex session');

    try {
      // 1. Load persona bundle
      await this.loadPersona(this.config.personaId);

      // 2. Initialize STM buffer
      this.state.stmBuffer = getOrCreateSTMBuffer(this.config.userId);

      // 3. Build tools for persona
      await this.buildTools();

      // 4. Initialize humanization engine
      this.humanizationEngine = createHumanizationEngine({
        userId: this.config.userId,
        personaId: this.config.personaId,
      });

      // 5. Initialize handoff manager (if enabled)
      if (this.config.enableHandoffs) {
        this.handoffManager = new HandoffManager({
          sessionId: this.config.sessionId,
          userId: this.config.userId,
          services: this.config.services,
        });
      }

      // 6. Get DJ controller (if enabled)
      if (this.config.enableMusic) {
        this.djController = getDJController();
      }

      // 7. Create PersonaPlex client
      this.client = createPersonaPlexClient({
        url: this.config.serverUrl || process.env.PERSONAPLEX_URL || 'wss://localhost:8998/api/chat',
        debug: process.env.NODE_ENV === 'development',
      });

      // 8. Wire up client events
      this.wireClientEvents();

      this.isInitialized = true;
      this.state.isActive = true;

      log.info(
        {
          sessionId: this.config.sessionId,
          personaId: this.config.personaId,
          initTimeMs: Date.now() - startTime,
          toolCount: this.state.tools.size,
        },
        'PersonaPlex session initialized'
      );

      this.emit('initialized', { sessionId: this.config.sessionId });
    } catch (error) {
      log.error({ error: String(error), sessionId: this.config.sessionId }, 'Failed to initialize session');
      throw error;
    }
  }

  /**
   * Connect to PersonaPlex server and start conversation
   */
  async connect(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Session not initialized. Call initialize() first.');
    }

    if (!this.client) {
      throw new Error('PersonaPlex client not created');
    }

    // Build initial prompt
    const initialPrompt = await this.buildFullPrompt({
      userTranscript: '',
      isSessionStart: true,
    });

    // Get voice embedding
    const { path: voicePath, isCustom } = getVoiceEmbeddingPath(this.config.personaId);
    const voicePrompt = this.config.useCustomVoice && isCustom
      ? voicePath
      : getFallbackVoice(this.config.personaId) + '.pt';

    log.info(
      {
        sessionId: this.config.sessionId,
        voicePrompt,
        isCustomVoice: this.config.useCustomVoice && isCustom,
        promptLength: initialPrompt.length,
      },
      'Connecting to PersonaPlex'
    );

    await this.client.connect({
      voicePrompt,
      textPrompt: initialPrompt,
      seed: 42, // Deterministic for testing
    });

    this.emit('connected', { sessionId: this.config.sessionId });
  }

  /**
   * Process a conversation turn
   */
  async processTurn(userTranscript: string): Promise<PersonaPlexTurnContext> {
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

    // 3. Check for handoff triggers
    if (this.config.enableHandoffs) {
      await this.checkHandoffTriggers(userTranscript, analysis);
    }

    // 4. Get memory context
    const memoryContext = await this.getMemoryContext();

    // 5. Build behavioral context (all 200+ builders)
    const behavioralSignals = await this.buildBehavioralContext(userTranscript, analysis);

    // 6. Get humanization guidance (SSML translated to text)
    const humanizationGuidance = await this.getHumanizationGuidance(analysis);

    // 7. Get tool context
    const toolContext = this.buildToolContext();

    // 8. Build full prompt
    const fullPrompt = await this.buildFullPrompt({
      userTranscript,
      analysis,
      memoryContext,
      behavioralSignals,
      humanizationGuidance,
      toolContext,
    });

    // 9. Update PersonaPlex with new prompt
    await this.updatePrompt(fullPrompt);

    // 10. Record turn to memory
    await this.recordTurnToMemory(userTranscript, analysis, captureResult);

    const turnContext: PersonaPlexTurnContext = {
      userTranscript,
      analysis,
      memoryContext,
      toolContext,
      behavioralSignals,
      humanizationGuidance,
      fullPrompt,
    };

    log.debug(
      {
        sessionId: this.config.sessionId,
        turnCount: this.state.turnCount,
        processingTimeMs: Date.now() - turnStartTime,
      },
      'Turn processed'
    );

    this.emit('turnProcessed', turnContext);
    return turnContext;
  }

  /**
   * Clean up session
   */
  async cleanup(): Promise<void> {
    log.info({ sessionId: this.config.sessionId }, 'Cleaning up PersonaPlex session');

    this.state.isActive = false;

    // Promote STM to long-term memory
    if (this.state.stmBuffer) {
      try {
        await this.state.stmBuffer.promoteToLongTerm();
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to promote STM buffer');
      }
    }

    // Disconnect client
    if (this.client) {
      this.client.disconnect();
    }

    // Clean up DJ controller
    if (this.djController) {
      this.djController.dispatch({ type: 'STOP' });
    }

    this.emit('cleanup', { sessionId: this.config.sessionId });
  }

  // ===========================================================================
  // PERSONA LOADING
  // ===========================================================================

  private async loadPersona(personaId: string): Promise<void> {
    log.debug({ personaId }, 'Loading persona bundle');

    // Load full persona bundle
    const bundle = await loadPersonaBundle(personaId);
    if (!bundle) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    this.state.persona = bundle;

    // Load cognitive profile
    this.state.cognitiveProfile = getCognitiveProfile(personaId);

    log.debug(
      {
        personaId,
        hasSystemPrompt: !!bundle.identity?.systemPrompt,
        behaviorCount: Object.keys(bundle.content?.behaviors || {}).length,
        storyCount: bundle.content?.stories?.length || 0,
      },
      'Persona loaded'
    );
  }

  // ===========================================================================
  // TOOL INTEGRATION
  // ===========================================================================

  private async buildTools(): Promise<void> {
    if (!this.state.persona) {
      throw new Error('Persona not loaded');
    }

    log.debug({ personaId: this.config.personaId }, 'Building tools for persona');

    const { tools, meta } = await getToolsForAgent({
      persona: {
        id: this.state.persona.id,
        displayName: this.state.persona.displayName,
      },
      userId: this.config.userId,
      userProfile: this.config.userProfile,
      services: this.config.services,
    });

    // Store tools
    for (const [name, tool] of Object.entries(tools)) {
      this.state.tools.set(name, tool);
    }

    log.debug(
      {
        personaId: this.config.personaId,
        toolCount: this.state.tools.size,
        source: meta?.source,
      },
      'Tools built'
    );
  }

  private buildToolContext(): string {
    if (this.state.tools.size === 0) {
      return '';
    }

    // Build tool descriptions for context injection
    const toolDescriptions: string[] = [];

    for (const [name, tool] of this.state.tools) {
      // Extract description from tool
      const desc = (tool as { description?: string }).description || name;
      toolDescriptions.push(`- ${name}: ${desc}`);
    }

    return `
AVAILABLE CAPABILITIES:
When the user asks for something you can help with, acknowledge and take action naturally.
${toolDescriptions.slice(0, 20).join('\n')}
${this.state.tools.size > 20 ? `\n... and ${this.state.tools.size - 20} more capabilities` : ''}

IMPORTANT: Don't announce tool usage. Just help naturally.
`;
  }

  // ===========================================================================
  // MEMORY INTEGRATION
  // ===========================================================================

  private async captureToMemory(transcript: string): Promise<FastCaptureResult | null> {
    if (!transcript.trim()) return null;

    try {
      const result = await fastCapture(transcript, {
        userId: this.config.userId,
        sessionId: this.config.sessionId,
        personaId: this.config.personaId,
      });

      return result;
    } catch (error) {
      log.error({ error: String(error) }, 'Fast capture failed');
      return null;
    }
  }

  private async getMemoryContext(): Promise<string> {
    try {
      const context = await getMemoryContext(this.config.userId, {
        sessionId: this.config.sessionId,
        personaId: this.config.personaId,
        maxTokens: 500,
      });

      return context || '';
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get memory context');
      return '';
    }
  }

  private async recordTurnToMemory(
    transcript: string,
    analysis: ReturnType<typeof AnalysisEngine.prototype.analyze> | null,
    captureResult: FastCaptureResult | null
  ): Promise<void> {
    try {
      await recordTurn({
        userId: this.config.userId,
        sessionId: this.config.sessionId,
        personaId: this.config.personaId,
        userTranscript: transcript,
        agentResponse: this.state.lastAgentResponse,
        analysis,
        entities: captureResult?.entities || [],
        facts: captureResult?.facts || [],
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to record turn');
    }
  }

  // ===========================================================================
  // CONTEXT BUILDERS INTEGRATION
  // ===========================================================================

  private async analyzeInput(
    transcript: string
  ): Promise<ReturnType<typeof AnalysisEngine.prototype.analyze> | null> {
    try {
      const analysis = await this.analysisEngine.analyze(transcript, {
        userId: this.config.userId,
        sessionId: this.config.sessionId,
      });

      // Update emotional state
      if (analysis.emotion) {
        this.state.emotionalState.userEmotion = analysis.emotion;
      }

      return analysis;
    } catch (error) {
      log.error({ error: String(error) }, 'Analysis failed');
      return null;
    }
  }

  private async buildBehavioralContext(
    transcript: string,
    analysis: ReturnType<typeof AnalysisEngine.prototype.analyze> | null
  ): Promise<Record<string, unknown>> {
    if (!this.state.persona) {
      return {};
    }

    const input: ContextBuilderInput = {
      userText: transcript,
      analysis: analysis || {},
      userData: {
        userId: this.config.userId,
        profile: this.config.userProfile || undefined,
      },
      persona: this.state.persona,
      sessionState: {
        sessionId: this.config.sessionId,
        turnCount: this.state.turnCount,
        isFirstTurn: this.state.turnCount === 1,
      },
    };

    // Run ALL behavioral builders (200+)
    const integratedContext = await buildIntegratedContext(input);

    // Also run legacy builders for compatibility
    const legacyContext = await buildConversationContext(input);

    return {
      behavioral: integratedContext,
      legacy: legacyContext,
    };
  }

  // ===========================================================================
  // HUMANIZATION ENGINE (SSML TRANSLATION)
  // ===========================================================================

  private async getHumanizationGuidance(
    analysis: ReturnType<typeof AnalysisEngine.prototype.analyze> | null
  ): Promise<string> {
    if (!this.humanizationEngine || !analysis) {
      return '';
    }

    // Get humanization signals
    const signals = await this.humanizationEngine.getSignals({
      emotion: analysis.emotion,
      intensity: analysis.intensity,
      topics: analysis.topics,
      trustLevel: this.state.trustLevel,
    });

    // Translate SSML-style guidance to text instructions for PersonaPlex
    const guidance: string[] = [];

    // Tone guidance
    if (signals.tone) {
      guidance.push(`TONE: Speak with a ${signals.tone} tone.`);
    }

    // Pacing guidance (from SSML prosody)
    if (signals.pacing === 'slow') {
      guidance.push('PACING: Speak slowly, with pauses for reflection.');
    } else if (signals.pacing === 'energetic') {
      guidance.push('PACING: Speak with energy and enthusiasm.');
    }

    // Emotional mirroring
    if (this.state.emotionalState.userEmotion !== 'neutral') {
      guidance.push(
        `EMOTIONAL AWARENESS: User seems ${this.state.emotionalState.userEmotion}. Match their energy appropriately.`
      );
    }

    // Backchannel signals
    const backchannels = getBackchannelResponse({
      userEmotion: this.state.emotionalState.userEmotion,
      turnCount: this.state.turnCount,
    });
    if (backchannels.shouldUse) {
      guidance.push(`ACTIVE LISTENING: Use natural responses like "${backchannels.phrase}" when appropriate.`);
    }

    // Listening signals
    const listeningSignals = getListeningSignals({
      emotion: this.state.emotionalState.userEmotion,
      intensity: analysis.intensity || 0.5,
    });
    if (listeningSignals.length > 0) {
      guidance.push(`ACKNOWLEDGMENT: Start with brief acknowledgment like "${listeningSignals[0]}".`);
    }

    // Cognitive profile adjustments
    if (this.state.cognitiveProfile) {
      const cp = this.state.cognitiveProfile;
      if (cp.communicationStyle === 'direct') {
        guidance.push('STYLE: Be direct and get to the point.');
      } else if (cp.communicationStyle === 'exploratory') {
        guidance.push('STYLE: Explore ideas with curiosity and open questions.');
      }

      if (cp.emotionalExpression === 'expressive') {
        guidance.push('EXPRESSION: Be warm and emotionally expressive.');
      } else if (cp.emotionalExpression === 'reserved') {
        guidance.push('EXPRESSION: Be thoughtful and measured.');
      }
    }

    return guidance.join('\n');
  }

  // ===========================================================================
  // HANDOFF INTEGRATION
  // ===========================================================================

  private async checkHandoffTriggers(
    transcript: string,
    analysis: ReturnType<typeof AnalysisEngine.prototype.analyze> | null
  ): Promise<void> {
    if (!this.handoffManager || !this.state.persona) return;

    const triggerResult = await evaluateHandoffTrigger({
      transcript,
      analysis,
      currentPersonaId: this.state.persona.id,
      userId: this.config.userId,
    });

    if (triggerResult.shouldHandoff && triggerResult.targetPersonaId) {
      log.info(
        {
          from: this.state.persona.id,
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
      {
        from: this.state.persona?.id,
        to: request.targetPersonaId,
      },
      'Executing handoff'
    );

    // Load new persona
    await this.loadPersona(request.targetPersonaId);

    // Rebuild tools for new persona
    await this.buildTools();

    // Rebuild prompt
    const newPrompt = await this.buildFullPrompt({
      userTranscript: this.state.lastUserTranscript,
      isHandoff: true,
      handoffContext: request.context,
    });

    // Update PersonaPlex
    await this.updatePrompt(newPrompt);

    // Update voice (if using custom voices)
    if (this.client && this.config.useCustomVoice) {
      const { path: voicePath, isCustom } = getVoiceEmbeddingPath(request.targetPersonaId);
      if (isCustom) {
        // Note: PersonaPlex may not support mid-session voice changes
        log.warn('Voice change during handoff not yet supported by PersonaPlex');
      }
    }

    this.emit('handoffComplete', {
      from: request.sourcePersonaId,
      to: request.targetPersonaId,
    });
  }

  // ===========================================================================
  // MUSIC/DJ INTEGRATION
  // ===========================================================================

  /**
   * Handle music commands detected in conversation
   */
  async handleMusicCommand(command: {
    action: 'play' | 'pause' | 'stop' | 'skip' | 'volume';
    query?: string;
    value?: number;
  }): Promise<void> {
    if (!this.djController) return;

    switch (command.action) {
      case 'play':
        if (command.query) {
          this.djController.dispatch({
            type: 'PLAY_TRACK',
            track: { title: command.query, source: 'search' },
            isAmbient: false,
          });
        }
        break;
      case 'pause':
        this.djController.dispatch({ type: 'AGENT_SPEAKING_START' });
        break;
      case 'stop':
        this.djController.dispatch({ type: 'STOP' });
        break;
      case 'volume':
        if (command.value !== undefined) {
          this.djController.dispatch({
            type: 'SET_VOLUME',
            volume: command.value / 100,
          });
        }
        break;
    }
  }

  // ===========================================================================
  // PROMPT BUILDING
  // ===========================================================================

  private async buildFullPrompt(options: {
    userTranscript?: string;
    isSessionStart?: boolean;
    isHandoff?: boolean;
    handoffContext?: string;
    analysis?: ReturnType<typeof AnalysisEngine.prototype.analyze> | null;
    memoryContext?: string;
    behavioralSignals?: Record<string, unknown>;
    humanizationGuidance?: string;
    toolContext?: string;
  }): Promise<string> {
    const {
      userTranscript = '',
      isSessionStart = false,
      isHandoff = false,
      handoffContext = '',
      analysis = null,
      memoryContext = '',
      behavioralSignals = {},
      humanizationGuidance = '',
      toolContext = '',
    } = options;

    if (!this.state.persona) {
      throw new Error('Persona not loaded');
    }

    const sections: string[] = [];

    // 1. Core Identity
    sections.push(this.buildIdentitySection());

    // 2. Persona behaviors and personality
    sections.push(this.buildPersonalitySection());

    // 3. Session context
    if (isSessionStart) {
      sections.push(this.buildSessionStartSection());
    } else if (isHandoff) {
      sections.push(this.buildHandoffSection(handoffContext));
    }

    // 4. Memory context
    if (memoryContext) {
      sections.push(`
WHAT YOU REMEMBER ABOUT THIS PERSON:
${memoryContext}
`);
    }

    // 5. Humanization guidance (translated SSML)
    if (humanizationGuidance) {
      sections.push(`
HOW TO SPEAK:
${humanizationGuidance}
`);
    }

    // 6. Behavioral signals from context builders
    if (Object.keys(behavioralSignals).length > 0) {
      sections.push(this.buildBehavioralSection(behavioralSignals));
    }

    // 7. Tool context
    if (toolContext) {
      sections.push(toolContext);
    }

    // 8. Superhuman capabilities
    sections.push(this.buildSuperhumanSection());

    // 9. Conversation guidance
    sections.push(this.buildConversationGuidanceSection());

    // Combine and truncate if needed
    let fullPrompt = sections.filter(Boolean).join('\n\n');

    // PersonaPlex has a context window limit
    const MAX_PROMPT_LENGTH = 8000;
    if (fullPrompt.length > MAX_PROMPT_LENGTH) {
      log.warn(
        { originalLength: fullPrompt.length, maxLength: MAX_PROMPT_LENGTH },
        'Truncating prompt'
      );
      fullPrompt = this.truncatePrompt(fullPrompt, MAX_PROMPT_LENGTH);
    }

    return fullPrompt;
  }

  private buildIdentitySection(): string {
    const persona = this.state.persona!;
    const identity = persona.identity;

    return `
You are ${persona.displayName || persona.id}, ${identity?.tagline || 'a caring AI companion'}.

${identity?.systemPrompt || ''}

CORE VALUES: ${identity?.values?.join(', ') || 'empathy, growth, authenticity'}
`.trim();
  }

  private buildPersonalitySection(): string {
    const persona = this.state.persona!;
    const behaviors = persona.content?.behaviors || {};

    const sections: string[] = [];

    // Catchphrases and natural speech patterns
    if (behaviors.catchphrases?.length) {
      const phrases = behaviors.catchphrases.slice(0, 5).map((p: { phrase: string }) => p.phrase);
      sections.push(`NATURAL PHRASES you use: "${phrases.join('", "')}"`);
    }

    // Greetings
    if (behaviors.greetings?.length) {
      const greetings = behaviors.greetings.slice(0, 3).map((g: { text: string }) => g.text);
      sections.push(`GREETING STYLE: "${greetings[0]}"`);
    }

    // Backchannels
    if (behaviors.backchannels?.length) {
      const backchannels = behaviors.backchannels.slice(0, 5).map((b: { text: string }) => b.text);
      sections.push(`LISTENING SOUNDS: ${backchannels.join(', ')}`);
    }

    // Cognitive profile
    if (this.state.cognitiveProfile) {
      const cp = this.state.cognitiveProfile;
      sections.push(`
PERSONALITY TRAITS:
- Communication: ${cp.communicationStyle}
- Emotional expression: ${cp.emotionalExpression}
- Thinking style: ${cp.thinkingStyle}
- Energy level: ${cp.energyLevel}
`);
    }

    return sections.join('\n\n');
  }

  private buildSessionStartSection(): string {
    const persona = this.state.persona!;
    const greetings = persona.content?.behaviors?.greetings || [];
    const defaultGreeting = greetings[0]?.text || `Hey! I'm ${persona.displayName}. What's on your mind?`;

    return `
SESSION START:
This is a new conversation. Greet the user warmly but naturally.
Example greeting: "${defaultGreeting}"

Don't ask too many questions at once. Just be present and see what they want to talk about.
`;
  }

  private buildHandoffSection(context: string): string {
    const persona = this.state.persona!;

    return `
PERSONA TRANSITION:
You're ${persona.displayName}, taking over the conversation from a teammate.
Context from previous conversation: ${context || 'User wanted to explore your specialty.'}

Acknowledge the transition naturally, like: "Hey! ${persona.displayName} here. I heard you wanted to chat about..."
`;
  }

  private buildBehavioralSection(signals: Record<string, unknown>): string {
    const guidance: string[] = [];

    // Extract guidance from behavioral signals
    if (signals.behavioral && typeof signals.behavioral === 'object') {
      const behavioral = signals.behavioral as Record<string, unknown>;
      if (behavioral.tone) guidance.push(`Tone: ${behavioral.tone}`);
      if (behavioral.style) guidance.push(`Style: ${behavioral.style}`);
      if (behavioral.callbacks && Array.isArray(behavioral.callbacks)) {
        for (const cb of behavioral.callbacks.slice(0, 3)) {
          if ((cb as { hint?: string }).hint) {
            guidance.push(`Guidance: ${(cb as { hint: string }).hint}`);
          }
        }
      }
    }

    if (guidance.length === 0) return '';

    return `
SITUATIONAL GUIDANCE:
${guidance.join('\n')}
`;
  }

  private buildSuperhumanSection(): string {
    const persona = this.state.persona!;
    const superhuman = persona.content?.behaviors?.['superhuman-insights'] || {};

    const capabilities: string[] = [
      '- You have PERFECT MEMORY of everything discussed',
      '- You notice patterns the user might miss',
      '- You can anticipate needs before they\'re spoken',
      '- You\'re ALWAYS available with full presence',
      '- You have no ego - just genuine care',
    ];

    if (superhuman.iNoticePatterns?.length) {
      const patterns = superhuman.iNoticePatterns.slice(0, 3);
      capabilities.push(...patterns.map((p: { pattern: string }) => `- "I notice" power: ${p.pattern}`));
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

  private truncatePrompt(prompt: string, maxLength: number): string {
    if (prompt.length <= maxLength) return prompt;

    // Priority sections (keep these)
    const prioritySections = [
      'You are',
      'CORE VALUES',
      'SUPERHUMAN',
      'CONVERSATION PRINCIPLES',
    ];

    const lines = prompt.split('\n');
    const result: string[] = [];
    let currentLength = 0;

    for (const line of lines) {
      const isPriority = prioritySections.some((p) => line.includes(p));

      if (isPriority || currentLength + line.length < maxLength * 0.8) {
        result.push(line);
        currentLength += line.length + 1;
      }
    }

    return result.join('\n');
  }

  // ===========================================================================
  // CLIENT COMMUNICATION
  // ===========================================================================

  private wireClientEvents(): void {
    if (!this.client) return;

    this.client.on('connected', () => {
      log.info({ sessionId: this.config.sessionId }, 'PersonaPlex connected');
    });

    this.client.on('disconnected', (reason) => {
      log.info({ sessionId: this.config.sessionId, reason }, 'PersonaPlex disconnected');
      this.emit('disconnected', { reason });
    });

    this.client.on('audio', (data) => {
      this.emit('audio', data);
    });

    this.client.on('text', (data) => {
      this.state.lastAgentResponse = data.text;
      this.emit('text', data);

      // Check for tool triggers in response
      this.detectToolTriggers(data.text);
    });

    this.client.on('error', (error) => {
      log.error({ error: String(error), sessionId: this.config.sessionId }, 'PersonaPlex error');
      this.emit('error', error);
    });
  }

  private async updatePrompt(prompt: string): Promise<void> {
    if (!this.client) return;

    // PersonaPlex supports mid-conversation prompt updates
    // This is how we inject context without interrupting the flow
    await this.client.updatePrompt(prompt);
  }

  private detectToolTriggers(text: string): void {
    // Detect phrases that should trigger tool execution
    const toolTriggers: Array<{ pattern: RegExp; tool: string; extract: (m: RegExpMatchArray) => Record<string, string> }> = [
      {
        pattern: /let me (check|look at) (your |the )?calendar/i,
        tool: 'getCalendarEvents',
        extract: () => ({}),
      },
      {
        pattern: /i('ll| will) play (some )?(.+?)( music| for you)?$/i,
        tool: 'playMusic',
        extract: (m) => ({ query: m[3] }),
      },
      {
        pattern: /let me (check|look up) the weather/i,
        tool: 'getWeather',
        extract: () => ({}),
      },
      {
        pattern: /i('ll| will) set a reminder/i,
        tool: 'createReminder',
        extract: () => ({}),
      },
    ];

    for (const trigger of toolTriggers) {
      const match = text.match(trigger.pattern);
      if (match) {
        const params = trigger.extract(match);
        this.emit('toolTrigger', { tool: trigger.tool, params });
        break;
      }
    }
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  get sessionId(): string {
    return this.config.sessionId;
  }

  get currentPersona(): PersonaBundle | null {
    return this.state.persona;
  }

  get turnCount(): number {
    return this.state.turnCount;
  }

  get isConnected(): boolean {
    return this.client?.isConnected ?? false;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new PersonaPlex session with full system integration
 */
export function createPersonaPlexSession(
  config: PersonaPlexSessionConfig
): PersonaPlexSessionManager {
  return new PersonaPlexSessionManager(config);
}
