/**
 * Agent Session Creator
 *
 * Handles the creation of voice agent sessions including:
 * - TTS initialization with voice localization
 * - VAD (Voice Activity Detection) setup
 * - Tool orchestration initialization
 * - LLM model creation
 * - AgentSession instantiation
 *
 * @module agents/agent-session-creator
 */

import type { PersonaConfig } from '../personas/types.js';
import type { BundleRuntimeEngine } from '../personas/bundles/runtime.js';
import type { EnglishAccent } from '../config/voice-accents.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceAgentRef {
  setPersona: (personaOrId: unknown, instructions?: string) => void;
  getPersona: () => { id: string } | undefined;
  setBundleRuntime: (runtime: unknown) => void;
  getBundleRuntime: () => { getState: () => { personaId?: string } } | undefined;
  readonly instructions: string | undefined;
}

export interface SessionCreationConfig {
  sessionId: string;
  userId: string | null;
  userAccent: string | undefined;
  sessionPersona: PersonaConfig;
  userProfile: unknown;
  subscriptionTier: 'free' | 'friend' | 'partner';
  userData: Record<string, unknown>;
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
  isCrisis?: boolean;
}

export interface SessionCreationResult {
  session: unknown;
  agent: unknown;
  voiceAgentRef: VoiceAgentRef;
  tts: unknown;
  llm: unknown;
  vad?: unknown;
  toolsMeta: {
    toolCount: number;
    mode: string;
    selectionTimeMs: number;
  };
}

// ============================================================================
// VOICE AGENT REF FACTORY
// ============================================================================

/**
 * Creates a lightweight VoiceAgentRef for handoff support.
 * This allows personas to be switched mid-session.
 */
export function createLightweightVoiceAgentRef(
  agent: { _instructions?: string },
  initialPersona: PersonaConfig
): VoiceAgentRef {
  let currentPersona: PersonaConfig = initialPersona;
  let bundleRuntime: BundleRuntimeEngine | undefined;

  return {
    setPersona(personaOrId: unknown, instructions?: string): void {
      if (typeof personaOrId === 'string' && typeof instructions === 'string') {
        agent._instructions = instructions;
        process.stderr.write(
          `[agent-session-creator] 🎭 LLM instructions updated for ${personaOrId} (${instructions.length} chars)\n`
        );
        return;
      }
      const p = personaOrId as PersonaConfig;
      currentPersona = p;
      if (p.systemPrompt) {
        agent._instructions = p.systemPrompt;
        process.stderr.write(
          `[agent-session-creator] 🎭 LLM instructions updated for ${p.name} (${p.systemPrompt.length} chars)\n`
        );
      } else {
        process.stderr.write(`[agent-session-creator] ⚠️ Persona ${p.name} has no systemPrompt!\n`);
      }
    },
    getPersona(): { id: string } | undefined {
      return currentPersona ? { id: currentPersona.id } : undefined;
    },
    setBundleRuntime(runtime: unknown): void {
      bundleRuntime = runtime as BundleRuntimeEngine;
      process.stderr.write(
        `[agent-session-creator] 📦 Bundle runtime updated for ${currentPersona?.name}\n`
      );
    },
    getBundleRuntime(): { getState: () => { personaId?: string } } | undefined {
      if (!bundleRuntime) return undefined;
      return {
        getState: () => {
          const state = bundleRuntime?.getState?.();
          return { personaId: state?.personaId };
        },
      };
    },
    get instructions(): string | undefined {
      return agent._instructions;
    },
  };
}

// ============================================================================
// VAD SETUP
// ============================================================================

export interface VadSetupConfig {
  useLocalVad: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sileroModule: any;
}

/**
 * Sets up Voice Activity Detection (VAD) if enabled.
 */
export async function setupVad(config: VadSetupConfig): Promise<unknown> {
  if (!config.useLocalVad) {
    return undefined;
  }

  try {
    const vadLoadStart = Date.now();
    const vad = await config.sileroModule.VAD.load();
    process.stderr.write(
      `[agent-session-creator] 🎙️ Silero VAD loaded as fallback in ${Date.now() - vadLoadStart}ms\n`
    );
    return vad;
  } catch (vadErr) {
    process.stderr.write(
      `[agent-session-creator] ⚠️ VAD fallback load failed (non-fatal): ${vadErr}\n`
    );
    return undefined;
  }
}

// ============================================================================
// VOICE LOCALIZATION
// ============================================================================

export interface VoiceLocalizationConfig {
  personaId: string;
  userAccent: string | undefined;
  defaultVoiceId: string;
}

export interface VoiceLocalizationResult {
  effectiveVoiceId: string;
  isLocalizedVoice: boolean;
}

/**
 * Localizes voice based on user accent.
 */
export async function localizeVoice(
  config: VoiceLocalizationConfig
): Promise<VoiceLocalizationResult> {
  if (!config.userAccent || config.userAccent === 'american') {
    return {
      effectiveVoiceId: config.defaultVoiceId,
      isLocalizedVoice: false,
    };
  }

  try {
    const { getLocalizedVoiceId } =
      await import('../services/voice/cartesia-voice-localization.js');

    const localizationResult = await getLocalizedVoiceId(
      config.personaId,
      config.userAccent as EnglishAccent
    );
    process.stderr.write(
      `[agent-session-creator] 🌍 Voice localized: ${config.userAccent} (cached: ${localizationResult.cached})\n`
    );
    return {
      effectiveVoiceId: localizationResult.voiceId,
      isLocalizedVoice: localizationResult.isLocalized,
    };
  } catch (locErr) {
    process.stderr.write(
      `[agent-session-creator] Voice localization failed (non-fatal): ${locErr}\n`
    );
    return {
      effectiveVoiceId: config.defaultVoiceId,
      isLocalizedVoice: false,
    };
  }
}

// ============================================================================
// TOOL ORCHESTRATION
// ============================================================================

export interface ToolOrchestrationConfig {
  sessionPersona: PersonaConfig;
  userId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userProfile: any;
  subscriptionTier: 'free' | 'friend' | 'partner';
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services?: any;
}

export interface ToolOrchestrationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any;
  meta: {
    toolCount: number;
    mode: string;
    selectionTimeMs: number;
  };
}

/**
 * Initializes tool orchestration and retrieves tools for the agent.
 */
export async function initializeTools(
  config: ToolOrchestrationConfig
): Promise<ToolOrchestrationResult> {
  const toolOrchestratorModule = await import('../tools/orchestrator/voice-agent-integration.js');
  const { getToolsForAgent, initializeToolOrchestrator, isOrchestratorInitialized } =
    toolOrchestratorModule;

  if (!isOrchestratorInitialized()) {
    try {
      await initializeToolOrchestrator();
    } catch (orchErr) {
      process.stderr.write(
        `[agent-session-creator] Orchestrator init failed (will use legacy): ${orchErr}\n`
      );
    }
  }

  const { tools, meta } = await getToolsForAgent({
    persona: { id: config.sessionPersona.id, displayName: config.sessionPersona.name },
    userId: config.userId || 'anonymous',
    userProfile: config.userProfile,
    subscriptionTier: config.subscriptionTier,
    initialTranscript: '',
    services: config.services,
    userLocation: config.userLocation,
    fastPath: true,
    sessionId: config.sessionId,
  });

  process.stderr.write(
    `[agent-session-creator] Got ${meta.toolCount} tools from ${meta.mode} (${meta.selectionTimeMs}ms)\n`
  );

  return { tools, meta };
}

// ============================================================================
// LLM MODEL CREATION
// ============================================================================

export interface LlmCreationConfig {
  model: string;
  instructions: string;
  temperature: number;
}

/**
 * Creates the LLM model using the configured model provider.
 */
export async function createLlmModel(config: LlmCreationConfig): Promise<unknown> {
  const { getModelProvider } = await import('./model-provider/index.js');
  const modelProvider = getModelProvider();

  process.stderr.write(
    `[agent-session-creator] ${modelProvider.getLogPrefix()} Creating LLM model...\n`
  );

  const llm = await modelProvider.createLLMModel({
    model: config.model,
    instructions: config.instructions,
    temperature: config.temperature,
  });

  process.stderr.write(
    `[agent-session-creator] ${modelProvider.getLogPrefix()} LLM model created\n`
  );

  return llm;
}

// ============================================================================
// TTS CREATION
// ============================================================================

export interface TtsCreationConfig {
  personaName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  voiceConfig: any;
  effectiveVoiceId: string;
  userAccent: string;
  isLocalizedVoice: boolean;
}

/**
 * Creates the Text-to-Speech engine with persona-aware configuration.
 */
export async function createTts(config: TtsCreationConfig): Promise<unknown> {
  const voiceManager = await import('../speech/voice-manager.js');

  return voiceManager.createPersonaAwareTTS(config.personaName, {
    ...config.voiceConfig,
    voiceId: config.effectiveVoiceId,
    accent: config.userAccent || 'american',
    isLocalizedVoice: config.isLocalizedVoice,
  });
}

// ============================================================================
// SESSION VOICE MANAGER
// ============================================================================

/**
 * Initializes the session voice manager for a given session.
 */
export async function initializeSessionVoiceManager(sessionId: string): Promise<void> {
  const voiceManager = await import('../speech/voice-manager.js');
  const sessionVoiceManager = voiceManager.getSessionVoiceManager(sessionId);
  sessionVoiceManager.initialize();
}

// ============================================================================
// TOOL CONFIG BUILDING
// ============================================================================

export interface ToolConfigParams {
  isCrisis: boolean;
}

/**
 * Builds tool configuration based on environment and crisis state.
 */
export async function buildToolConfiguration(params: ToolConfigParams): Promise<unknown> {
  const functionCallingModule = await import('../tools/utils/function-calling-config.js');
  const { buildToolConfig } = functionCallingModule;
  return buildToolConfig({ environment: 'production', isCrisis: params.isCrisis });
}
