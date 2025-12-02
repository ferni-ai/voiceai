/**
 * Event Type Definitions
 * 
 * Defines all custom events used in the Voice AI application.
 * Provides type-safe event handling with strong typing.
 */

import type { PersonaId } from './persona.js';

// ============================================================================
// CONNECTION EVENTS
// ============================================================================

/**
 * Connection state for the LiveKit room.
 */
export type ConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Event fired when connection state changes.
 */
export interface ConnectionStateEvent {
  readonly type: 'connectionState';
  readonly state: ConnectionState;
  readonly error?: string;
  readonly timestamp: number;
}

// ============================================================================
// HANDOFF EVENTS
// ============================================================================

/**
 * Direction of an agent handoff.
 */
export type HandoffDirection = 
  | 'jack-to-peter'
  | 'peter-to-jack'
  | 'coach-to-team'
  | 'team-to-coach';

/**
 * Handoff event types for delightful transitions.
 * The backend sends these in sequence:
 * 1. handoff_started - Begin transition animation
 * 2. handoff_complete - Agent is ready to speak
 */
export type HandoffEventType = 'handoff' | 'handoff_started' | 'handoff_complete';

/**
 * Event fired when agents hand off to each other.
 * 
 * Backend may send various agent ID formats:
 * - Full IDs: 'jack-bogle', 'peter-lynch', 'comm-specialist', 'spend-save', 'event-planner'
 * - Short aliases: 'jack', 'peter', 'alex', 'maya', 'jordan'
 * - Coach: 'jack-b'
 */
export interface HandoffEvent {
  readonly type: HandoffEventType;
  /** The new agent taking over (may be full ID, alias, or short name) */
  readonly newAgent: PersonaId | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | string;
  /** The previous agent handing off (optional, for better tracking) */
  readonly previousAgent?: string;
  /** Direction of the handoff */
  readonly direction?: HandoffDirection;
  /** Optional greeting from new agent (on handoff_complete) */
  readonly greeting?: string;
  /** Sound hint for frontend */
  readonly playSound?: string;
  /** Event timestamp */
  readonly timestamp: number;
}

/**
 * Normalized handoff data after processing.
 */
export interface NormalizedHandoff {
  readonly fromPersona: PersonaId;
  readonly toPersona: PersonaId;
  readonly direction: HandoffDirection;
}

// ============================================================================
// AUDIO EVENTS
// ============================================================================

/**
 * Audio activity state.
 */
export type AudioState = 'idle' | 'speaking' | 'listening';

/**
 * Event fired when audio activity changes.
 */
export interface AudioStateEvent {
  readonly type: 'audioState';
  readonly state: AudioState;
  readonly volume?: number;
  readonly timestamp: number;
}

// ============================================================================
// SPOTIFY EVENTS
// ============================================================================

/**
 * Spotify player state.
 */
export type SpotifyState = 
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error';

/**
 * Event fired when Spotify state changes.
 */
export interface SpotifyStateEvent {
  readonly type: 'spotifyState';
  readonly state: SpotifyState;
  readonly trackName?: string;
  readonly artistName?: string;
  readonly error?: string;
  readonly timestamp: number;
}

// ============================================================================
// MESSAGE EVENTS
// ============================================================================

/**
 * Type of message to display.
 */
export type MessageType = 'info' | 'quote' | 'error' | 'success';

/**
 * Event fired when a message should be displayed.
 */
export interface MessageEvent {
  readonly type: 'message';
  readonly text: string;
  readonly messageType: MessageType;
  readonly duration?: number;
  readonly timestamp: number;
}

// ============================================================================
// DATA MESSAGE EVENTS (from LiveKit)
// ============================================================================

/**
 * Raw data message received from the agent.
 */
export interface DataMessage {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * Type guard for handoff messages.
 * Validates that the message has the required structure for a handoff event.
 * Recognizes: 'handoff', 'handoff_started', 'handoff_complete'
 */
export function isHandoffMessage(data: unknown): data is HandoffEvent {
  if (typeof data !== 'object' || data === null) return false;
  
  const msg = data as Record<string, unknown>;
  
  // Must have type: 'handoff', 'handoff_started', or 'handoff_complete'
  const validTypes = ['handoff', 'handoff_started', 'handoff_complete'];
  if (!validTypes.includes(msg['type'] as string)) return false;
  
  // Must have newAgent (string)
  if (typeof msg['newAgent'] !== 'string' || !msg['newAgent']) return false;
  
  return true;
}

/**
 * Check if a handoff is just starting (for loading state).
 */
export function isHandoffStarted(data: unknown): boolean {
  if (!isHandoffMessage(data)) return false;
  return (data as HandoffEvent).type === 'handoff_started';
}

/**
 * Check if a handoff has completed (agent ready).
 */
export function isHandoffComplete(data: unknown): boolean {
  if (!isHandoffMessage(data)) return false;
  return (data as HandoffEvent).type === 'handoff_complete';
}

// ============================================================================
// EMOTION EVENTS (voice prosody analysis from agent)
// ============================================================================

/**
 * Detected voice emotion from user's speech.
 */
export type VoiceEmotion = 'neutral' | 'happy' | 'sad' | 'anxious' | 'excited' | 'frustrated' | 'calm';

/**
 * Emotion event fired when voice analysis detects emotion changes.
 */
export interface EmotionEvent {
  readonly type: 'emotion';
  readonly emotion: VoiceEmotion;
  readonly confidence: number;  // 0-1
  readonly intensity: number;   // 0-1
  readonly timestamp: number;
  readonly message?: string;    // Optional message from agent
}

/**
 * Type guard for emotion messages.
 */
export function isEmotionMessage(data: unknown): data is EmotionEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>)['type'] === 'emotion'
  );
}

// ============================================================================
// CELEBRATION EVENTS (from agent)
// ============================================================================

/**
 * Celebration type triggered by the agent.
 */
export type CelebrationType = 'milestone' | 'achievement' | 'aha_moment' | 'good_news';

/**
 * Celebration event fired by the agent.
 */
export interface CelebrationEvent {
  readonly type: 'celebration';
  readonly celebrationType: CelebrationType;
  readonly message?: string;
  readonly timestamp: number;
}

/**
 * Type guard for celebration messages.
 */
export function isCelebrationMessage(data: unknown): data is CelebrationEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>)['type'] === 'celebration'
  );
}

// ============================================================================
// EXPRESSION EVENTS (emoji morphing from agent)
// ============================================================================

/**
 * Expression event - triggers waveform emoji morph.
 * Sent by agents to express meaningful moments visually.
 */
export interface ExpressionEvent {
  readonly type: 'expression';
  readonly emoji: string;           // The emoji to morph into
  readonly meaning?: string;        // Optional explanation
  readonly duration?: number;       // How long to hold (ms)
  readonly timestamp: number;
}

/**
 * Type guard for expression messages.
 */
export function isExpressionMessage(data: unknown): data is ExpressionEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>)['type'] === 'expression' &&
    'emoji' in data &&
    typeof (data as Record<string, unknown>)['emoji'] === 'string'
  );
}

// ============================================================================
// AGGREGATED EVENT TYPES
// ============================================================================

/**
 * All possible app events.
 */
export type AppEvent =
  | ConnectionStateEvent
  | HandoffEvent
  | AudioStateEvent
  | SpotifyStateEvent
  | MessageEvent
  | EmotionEvent
  | CelebrationEvent
  | ExpressionEvent;

/**
 * Event type discriminator.
 */
export type AppEventType = AppEvent['type'];

/**
 * Extract event by type.
 */
export type ExtractEvent<T extends AppEventType> = Extract<AppEvent, { type: T }>;

// ============================================================================
// EVENT LISTENER TYPES
// ============================================================================

/**
 * Strongly-typed event listener function.
 */
export type EventListener<T extends AppEvent> = (event: T) => void;

/**
 * Event listener map for all event types.
 */
export type EventListenerMap = {
  [K in AppEventType]?: Set<EventListener<ExtractEvent<K>>>;
};

