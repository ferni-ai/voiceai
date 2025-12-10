/**
 * Event Type Definitions
 *
 * Defines all custom events used in the Voice AI application.
 * Provides type-safe event handling with strong typing.
 */

import { createLogger } from '../utils/logger.js';
import type { PersonaId } from './persona.js';

const log = createLogger('Events');

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
 * 1. handoff_acknowledged - Request received (FIX BUG #17)
 * 2. handoff_started - Begin transition animation
 * 3. handoff_complete - Agent is ready to speak
 * 4. handoff_failed - (Optional) Recovery when something goes wrong
 * 5. handoff_cancelled - (Optional) User or system cancelled the handoff (FIX BUG #32)
 */
export type HandoffEventType =
  | 'handoff'
  | 'handoff_acknowledged'
  | 'handoff_started'
  | 'handoff_complete'
  | 'handoff_failed'
  | 'handoff_cancelled';

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
  readonly newAgent: string;
  /** The previous agent handing off (optional, for better tracking) */
  readonly previousAgent?: string;
  /** Direction of the handoff */
  readonly direction?: HandoffDirection;
  /** Optional greeting from new agent (on handoff_complete) */
  readonly greeting?: string;
  /** Sound hint for frontend */
  readonly playSound?: string;
  /** Error message (on handoff_failed) */
  readonly error?: string;
  /** Event timestamp */
  readonly timestamp: number;
  /** FIX BUG #31: Sequence number for ordering events and detecting out-of-order delivery */
  readonly seq?: number;
  /** FIX BUG #31: Session ID to correlate events to the right handoff request */
  readonly handoffId?: string;
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
  | 'error'
  | 'not_available';

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
// MUSIC EVENTS (from agent - iTunes/in-call music)
// ============================================================================

/**
 * Music playback state from the agent.
 *
 * - 'playing' = Music actively playing
 * - 'ducking' = Agent speaking over music (DJ fade-down)
 * - 'fading'  = Track ending soon (~5 seconds left)
 * - 'changing' = DJ crossfade - switching to a new track
 * - 'paused'  = Playback paused
 * - 'stopped' = Playback stopped
 * - 'idle'    = No music loaded
 */
export type MusicPlaybackState =
  | 'idle'
  | 'playing'
  | 'ducking'
  | 'fading'
  | 'changing'
  | 'paused'
  | 'stopped';

/**
 * Event fired when music playback state changes (from agent backend).
 * This is separate from Spotify which is for web SDK.
 *
 * Backend sends `type: 'music_state'` with `track: { name, artist }` structure.
 * We normalize to MusicEvent interface for the frontend handlers.
 */
export interface MusicEvent {
  readonly type: 'music';
  readonly state: MusicPlaybackState;
  readonly trackName?: string;
  readonly artistName?: string;
  /** Duration in ms */
  readonly duration?: number;
  /** Is this ambient/thinking music? */
  readonly isAmbient?: boolean;
  /** 💚 Is this a shared musical memory ("our song")? */
  readonly isOurSong?: boolean;
  /** 💚 Context for the shared memory (e.g., "When you got the job") */
  readonly ourSongContext?: string;
  readonly timestamp: number;
}

/**
 * Raw music state message from backend (before normalization).
 */
interface RawMusicStateMessage {
  readonly type: 'music_state';
  readonly state: MusicPlaybackState;
  readonly track?: {
    readonly name: string;
    readonly artist?: string;
  };
  readonly isAmbient?: boolean;
  readonly isOurSong?: boolean;
  readonly ourSongContext?: string;
}

/**
 * Type guard for music messages.
 * Backend sends `type: 'music_state'` - we check for that and normalize.
 */
export function isMusicMessage(data: unknown): data is MusicEvent {
  if (typeof data !== 'object' || data === null || !('type' in data)) {
    return false;
  }

  const type = (data as Record<string, unknown>)['type'];
  // Accept both 'music' (legacy) and 'music_state' (from backend)
  return type === 'music' || type === 'music_state';
}

/**
 * Normalize raw backend music message to frontend MusicEvent format.
 */
export function normalizeMusicMessage(data: unknown): MusicEvent | null {
  if (!isMusicMessage(data)) {
    return null;
  }

  // Type assertion is needed because isMusicMessage can't narrow to the union
  const raw = data as RawMusicStateMessage | MusicEvent;

  // If already normalized (type: 'music'), return as-is
  if (raw.type === 'music') {
    // After the type check, raw is narrowed to MusicEvent
    return raw;
  }

  // After the type check, raw is narrowed to RawMusicStateMessage
  return {
    type: 'music',
    state: raw.state,
    trackName: raw.track?.name,
    artistName: raw.track?.artist,
    isAmbient: raw.isAmbient,
    isOurSong: raw.isOurSong,
    ourSongContext: raw.ourSongContext,
    timestamp: Date.now(),
  };
}

// ============================================================================
// MESSAGE EVENTS
// ============================================================================

/**
 * Type of message to display.
 */
export type MessageType = 'info' | 'quote' | 'error' | 'success' | 'warning';

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
 * Recognizes: 'handoff', 'handoff_acknowledged', 'handoff_started', 'handoff_complete', 'handoff_failed', 'handoff_cancelled'
 *
 * FIX BUG: More lenient validation - accepts 'target' OR 'newAgent' for all types
 */
export function isHandoffMessage(data: unknown): data is HandoffEvent {
  if (typeof data !== 'object' || data === null) return false;

  const msg = data as Record<string, unknown>;

  // Must have type: 'handoff', 'handoff_acknowledged', 'handoff_started', 'handoff_complete', 'handoff_failed', or 'handoff_cancelled'
  const validTypes = [
    'handoff',
    'handoff_acknowledged',
    'handoff_started',
    'handoff_complete',
    'handoff_failed',
    'handoff_cancelled',
  ];
  if (!validTypes.includes(msg['type'] as string)) return false;

  // DEBUG: Log handoff messages to help diagnose issues
  log.debug(
    `Checking handoff message type=${msg['type']}, newAgent=${msg['newAgent']}, target=${msg['target']}`
  );

  // Accept either 'target' OR 'newAgent' for all handoff types (backend may use either)
  const hasAgent =
    (typeof msg['target'] === 'string' && msg['target'] !== '') ||
    (typeof msg['newAgent'] === 'string' && msg['newAgent'] !== '');

  // For failed events, agent field is optional (might just have error)
  if (msg['type'] === 'handoff_failed') {
    return true; // Always accept failed messages
  }

  return hasAgent;
}

/**
 * Check if a handoff was acknowledged (request received).
 */
export function isHandoffAcknowledged(
  data: unknown
): data is HandoffEvent & { type: 'handoff_acknowledged' } {
  if (!isHandoffMessage(data)) return false;
  return data.type === 'handoff_acknowledged';
}

/**
 * Check if a handoff is just starting (for loading state).
 */
export function isHandoffStarted(
  data: unknown
): data is HandoffEvent & { type: 'handoff_started' } {
  if (!isHandoffMessage(data)) return false;
  return data.type === 'handoff_started';
}

/**
 * Check if a handoff has completed (agent ready).
 */
export function isHandoffComplete(
  data: unknown
): data is HandoffEvent & { type: 'handoff_complete' } {
  if (!isHandoffMessage(data)) return false;
  return data.type === 'handoff_complete';
}

/**
 * Check if a handoff has failed (for recovery).
 */
export function isHandoffFailed(data: unknown): data is HandoffEvent & { type: 'handoff_failed' } {
  if (!isHandoffMessage(data)) return false;
  return data.type === 'handoff_failed';
}

/**
 * FIX BUG #32: Check if a handoff was cancelled.
 */
export function isHandoffCancelled(
  data: unknown
): data is HandoffEvent & { type: 'handoff_cancelled' } {
  if (!isHandoffMessage(data)) return false;
  return data.type === 'handoff_cancelled';
}

// ============================================================================
// STATE RESET EVENT
// ============================================================================

/**
 * FIX BUG #33: Event fired when backend resets state (e.g., on reconnection).
 */
export interface StateResetEvent {
  readonly type: 'state_reset';
  readonly activePersona: string;
  readonly timestamp: number;
}

/**
 * Type guard for state reset messages.
 */
export function isStateReset(data: unknown): data is StateResetEvent {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg['type'] === 'state_reset' && typeof msg['activePersona'] === 'string';
}

// ============================================================================
// EMOTION EVENTS (voice prosody analysis from agent)
// ============================================================================

/**
 * Detected voice emotion from user's speech.
 */
export type VoiceEmotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'anxious'
  | 'excited'
  | 'frustrated'
  | 'calm';

/**
 * Emotion event fired when voice analysis detects emotion changes.
 */
export interface EmotionEvent {
  readonly type: 'emotion';
  readonly emotion: VoiceEmotion;
  readonly confidence: number; // 0-1
  readonly intensity: number; // 0-1
  readonly timestamp: number;
  readonly message?: string; // Optional message from agent
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
// PERSONA MOOD EVENTS (humanizing state from agent)
// ============================================================================

/**
 * Persona mood states - how the AI is "feeling" this session.
 * This enables subtle UI changes that reflect the persona's current state.
 */
export type PersonaMood =
  | 'energized' // High energy, animated
  | 'reflective' // Thoughtful, story-heavy
  | 'playful' // Light-hearted, joking
  | 'grounded' // Calm, centered
  | 'tired_but_present' // Low energy but engaged
  | 'philosophical' // Deep, big-picture
  | 'nostalgic'; // Memory-heavy, wistful

/**
 * Relationship stage with the user.
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

/**
 * Mood event from the agent's humanizing system.
 */
export interface MoodEvent {
  readonly type: 'mood';
  readonly state: PersonaMood;
  readonly energyLevel: number; // 0-1
  readonly relationshipStage: RelationshipStage;
  readonly hasTransition?: boolean; // True if relationship just deepened
  readonly timestamp: number;
}

/**
 * Type guard for mood messages.
 */
export function isMoodMessage(data: unknown): data is MoodEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>)['type'] === 'mood'
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
  readonly emoji: string; // The emoji to morph into
  readonly meaning?: string; // Optional explanation
  readonly duration?: number; // How long to hold (ms)
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
// ENGAGEMENT EVENTS (from agent - streaks, rituals, predictions)
// ============================================================================

/**
 * Engagement data event fired by the agent to update frontend.
 * Contains ritual streaks, emotional weather, and engagement stats.
 */
export interface EngagementEvent {
  readonly type: 'engagement';
  readonly ritualStreaks: Array<{
    ritualId: string;
    ritualName: string;
    personaId: string;
    currentStreak: number;
    longestStreak: number;
    lastCompletedAt: string | null;
    dueToday: boolean;
  }>;
  readonly weatherHistory: Array<{
    primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
    energy: 'high' | 'medium' | 'low';
    note?: string;
    recordedAt: string;
  }>;
  readonly stats: {
    totalRitualDays: number;
    longestOverallStreak: number;
    currentActiveStreaks: number;
    predictionAccuracy?: number;
    teamHuddlesAttended: number;
  };
  readonly predictions?: Array<{
    id: string;
    category: string;
    question: string;
    userPrediction: number;
    actualOutcome?: number;
    status: 'pending' | 'resolved';
    createdAt: string;
  }>;
  readonly message?: string;
  readonly timestamp: number;
}

/**
 * Type guard for engagement messages.
 */
export function isEngagementMessage(data: unknown): data is EngagementEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>)['type'] === 'engagement'
  );
}

/**
 * Engagement trigger event - prompts for engagement-related conversation.
 * Sent by agents to naturally introduce engagement topics.
 */
export interface EngagementTriggerEvent {
  readonly type: 'engagement_trigger';
  readonly triggerType:
    | 'streak_due'
    | 'streak_milestone'
    | 'prediction_result'
    | 'team_suggestion'
    | 'ritual_reminder'
    | 'weather_check';
  readonly personaId: string;
  readonly message: string;
  readonly priority: 'low' | 'medium' | 'high';
  readonly data?: Record<string, unknown>;
  readonly timestamp: number;
}

/**
 * Type guard for engagement trigger messages.
 */
export function isEngagementTriggerMessage(data: unknown): data is EngagementTriggerEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>)['type'] === 'engagement_trigger'
  );
}

// ============================================================================
// WRAP-UP EVENTS (conversation ending)
// ============================================================================

/**
 * Wrap-up sentiment types.
 */
export type WrapUpSentiment = 'warm' | 'encouraging' | 'thoughtful' | 'caring';

/**
 * Event fired when the agent is wrapping up the conversation.
 * This signals the UI to prepare for goodbye (prominent disconnect button, etc.)
 */
export interface WrapUpEvent {
  readonly type: 'wrap_up';
  readonly sentiment: WrapUpSentiment;
  readonly message?: string;
  readonly timestamp: number;
}

/**
 * Type guard for wrap-up messages.
 */
export function isWrapUpMessage(data: unknown): data is WrapUpEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>)['type'] === 'wrap_up'
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
  | MusicEvent
  | MessageEvent
  | EmotionEvent
  | CelebrationEvent
  | ExpressionEvent
  | EngagementEvent
  | EngagementTriggerEvent
  | WrapUpEvent;

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
