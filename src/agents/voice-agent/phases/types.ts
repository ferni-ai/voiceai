/**
 * Voice Agent Phase Types
 *
 * Shared types for the voice agent entry phases.
 *
 * @module voice-agent/phases/types
 */

import type { JobContext, voice as voiceType } from '@livekit/agents';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tts: any;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bundleRuntime: any | undefined;
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

// ToolSet matches the ToolContext type expected by voice.Agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolSet = Record<string, any>;
