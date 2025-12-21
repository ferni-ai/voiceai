/**
 * Voice Agent Phase Types
 *
 * Shared types for the voice agent entry phases.
 *
 * @module voice-agent/phases/types
 */

import type { JobContext, voice as voiceType, llm, tts } from '@livekit/agents';
import type { BundleRuntimeEngine } from '../../../personas/bundles/runtime.js';
import type { PersonaConfig } from '../../../personas/types.js';
import type { SessionServices } from '../../../services/index.js';
import type { UserData } from '../../shared/types.js';
import type { SessionStateManager } from '../../session/session-state.js';

// ============================================================================
// DEPENDENCY TYPES
// ============================================================================

export interface VoiceDeps {
  voice: typeof voiceType;
  google: typeof import('@livekit/agents-plugin-google');
  silero: typeof import('@livekit/agents-plugin-silero');
  genai: typeof import('@google/genai');
}

// ============================================================================
// PERSONA PHASE RESULT
// ============================================================================

export interface PersonaPhaseResult {
  personaId: string;
  persona: PersonaConfig;
  systemPrompt: string;
  usePrewarmed: boolean;
}

// ============================================================================
// SESSION INIT PHASE RESULT
// ============================================================================

export interface SessionInitPhaseResult {
  services: SessionServices;
  isReturningUser: boolean;
  isTrialUser: boolean;
  isFirstConversation: boolean;
  userData: UserData;
  sessionStateManager: SessionStateManager;
  stopPeriodicSync: (() => void) | null;
  userId: string | undefined;
  userName: string | undefined;
  userAccent: string;
}

// ============================================================================
// SESSION CREATION PHASE RESULT
// ============================================================================

export interface SessionCreationPhaseResult {
  /** LiveKit AgentSession for voice pipeline management */
  session: voiceType.AgentSession<UserData>;
  /** LiveKit Agent with persona instructions and tools */
  agent: voiceType.Agent<UserData>;
  /** Text-to-speech engine (Cartesia or other provider) */
  tts: tts.TTS;
  effectiveVoiceId: string;
  isLocalizedVoice: boolean;
  isPhoneCall: boolean;
}

// ============================================================================
// HANDLER SETUP PHASE RESULT
// ============================================================================

export interface HandlerSetupPhaseResult {
  cleanupHandlers: Array<() => void | Promise<void>>;
  musicResult: { initialized: boolean; clearTimers: () => void };
  voiceHumanization: { cleanup: () => void } | null;
  /** Persona bundle runtime engine for rich content and behaviors */
  bundleRuntime: BundleRuntimeEngine | undefined;
}

// ============================================================================
// PHASE CONTEXT (passed through all phases)
// ============================================================================

export interface PhaseContext {
  ctx: JobContext;
  sessionId: string;
  jobId: string;
  roomName: string;
  startTime: number;
  cleanupHandlers: Array<() => void | Promise<void>>;
}

// ============================================================================
// TOOL SET TYPE
// ============================================================================

/**
 * ToolSet matches the ToolContext type expected by voice.Agent
 * Uses the proper llm.ToolContext type from LiveKit agents
 */
export type ToolSet = llm.ToolContext<UserData>;
