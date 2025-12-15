/**
 * Handoff Types
 *
 * Type definitions for the handoff system.
 * Extracted from handoff-handler.ts for modularity.
 *
 * @module agents/shared/handoff/types
 */

import type { JobContext, voice } from '@livekit/agents';
import type { SessionServices } from '../../../services/types.js';
import type { UserData } from '../types.js';

// ============================================================================
// PERSONA TYPES
// ============================================================================

/**
 * Persona type for handoff events
 */
export interface HandoffPersona {
  id: string;
  name: string;
  voiceId: string;
  role: 'coach' | 'team';
  isCoach: boolean;
  handoffTool: string;
  aliases: readonly string[];
}

/**
 * Convert PersonaConfig to HandoffPersona format
 * Adapts the new persona system to the handoff handler's expected format
 */
export function toHandoffPersona(
  persona: import('../../../personas/types.js').PersonaConfig
): HandoffPersona {
  const isCoach = persona.id === 'ferni';
  return {
    id: persona.id,
    name: persona.name,
    voiceId: persona.voice.voiceId,
    role: isCoach ? 'coach' : 'team',
    isCoach,
    handoffTool: `handoffTo${persona.name.split(' ')[0]}`,
    aliases: [persona.id],
  };
}

// ============================================================================
// HANDOFF EVENT PAYLOAD TYPES
// ============================================================================

/**
 * Legacy handoff data format (old format with newAgent + voiceId)
 */
export interface LegacyHandoffData {
  readonly format?: 'legacy';
  newAgent: string;
  voiceId: string;
  greeting?: string;
  playSound?: string;
  previousAgent?: string;
}

/**
 * New handoff data format (clean format with persona object)
 */
export interface NewHandoffData {
  readonly format: 'new';
  persona: HandoffPersona;
  greeting?: string;
  playSound?: string;
  previousAgentId?: string;
  /** Explicit flag instead of parsing greeting string */
  isUserInitiated?: boolean;
}

export type HandoffEventPayload = NewHandoffData | LegacyHandoffData;

/**
 * Type guard to check if handoff data is in new format
 */
export function isNewHandoffData(data: HandoffEventPayload): data is NewHandoffData {
  return data.format === 'new' || 'persona' in data;
}

/**
 * Type guard to check if handoff data is in legacy format
 */
export function isLegacyHandoffData(data: HandoffEventPayload): data is LegacyHandoffData {
  return !('persona' in data) && 'newAgent' in data;
}

// ============================================================================
// VOICE AGENT TYPES
// ============================================================================

/**
 * Voice agent reference interface (minimal subset needed for handoffs)
 */
export interface VoiceAgentRef {
  setPersona: (persona: unknown) => void;
  getPersona: () => { id: string } | undefined;
  setBundleRuntime: (runtime: unknown) => void;
  getBundleRuntime: () => { getState: () => { personaId?: string } } | undefined;
  instructions?: string;
}

/**
 * Handoff handler configuration
 */
export interface HandoffHandlerConfig {
  ctx: JobContext;
  session: voice.AgentSession<UserData>;
  tts: { switchVoice?: (name: string, id: string) => void };
  services: SessionServices;
  userData: UserData;
  getVoiceAgentRef: () => VoiceAgentRef | null;
}

// ============================================================================
// SESSION STATE TYPES
// ============================================================================

/**
 * Session-scoped handoff state to prevent cross-session contamination
 */
export interface HandoffSessionState {
  /** Whether a handoff is currently in progress */
  isHandoffInProgress: boolean;
  /** Queue of pending handoffs (max 10) */
  pendingHandoffs: HandoffEventPayload[];
  /** Timeout timer for current handoff */
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  /** When current handoff started */
  handoffStartTime: number | null;
}

// ============================================================================
// BUNDLE STATE TYPES
// ============================================================================

/**
 * Partial bundle state structure for handoff state extraction
 */
export interface PartialBundleState {
  relationshipTurns?: number;
  storiesToldThisSession?: string[];
  currentMode?: string;
}

/**
 * Type guard to safely extract bundle state properties
 */
export function isPartialBundleState(value: unknown): value is PartialBundleState {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if ('relationshipTurns' in obj && typeof obj.relationshipTurns !== 'number') return false;
  if ('storiesToldThisSession' in obj && !Array.isArray(obj.storiesToldThisSession)) return false;
  if ('currentMode' in obj && typeof obj.currentMode !== 'string') return false;
  return true;
}

// ============================================================================
// TRANSITION TYPES
// ============================================================================

/**
 * Direction of persona transition
 */
export type TransitionDirection = 'to-team' | 'to-coach' | 'team-to-team';

/**
 * Handoff result status
 */
export interface HandoffResult {
  success: boolean;
  newPersonaId: string;
  previousPersonaId: string;
  transitionDirection: TransitionDirection;
  durationMs: number;
  error?: string;
}
