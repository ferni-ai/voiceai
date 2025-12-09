/**
 * Frontend Publisher
 *
 * Centralized real-time communication with the frontend via LiveKit data channels.
 * Extracted from voice-agent.ts to consolidate all publishData calls.
 *
 * Benefits:
 * - Single point of control for all frontend messages
 * - Consistent error handling and retry logic
 * - Type-safe message definitions
 * - Easy to mock for testing
 * - Centralized logging
 */

import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Room reference type (minimal interface for LiveKit room)
 */
export interface RoomRef {
  localParticipant?: {
    identity?: string;
    publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
  };
}

/**
 * Base message type - all messages have these fields
 */
interface BaseMessage {
  type: string;
  timestamp: number;
}

/**
 * Handoff started message
 */
export interface HandoffStartedMessage extends BaseMessage {
  type: 'handoff_started';
  newAgent: string;
  previousAgent: string;
  direction: string;
  playSound?: string;
}

/**
 * Handoff complete message
 */
export interface HandoffCompleteMessage extends BaseMessage {
  type: 'handoff_complete';
  newAgent: string;
  previousAgent: string;
  greeting?: string;
}

/**
 * Handoff failed message
 */
export interface HandoffFailedMessage extends BaseMessage {
  type: 'handoff_failed';
  newAgent: string;
  previousAgent?: string;
  error: string;
}

/**
 * Handoff acknowledged message
 */
export interface HandoffAcknowledgedMessage extends BaseMessage {
  type: 'handoff_acknowledged';
  target: string;
  success: boolean;
  error?: string;
}

/**
 * Emotion update message
 */
export interface EmotionMessage extends BaseMessage {
  type: 'emotion';
  emotion: string;
  confidence: number;
  intensity: number;
}

/**
 * Mood update message
 */
export interface MoodMessage extends BaseMessage {
  type: 'mood';
  state: string;
  energyLevel: number;
  relationshipStage: string;
  hasTransition: boolean;
}

/**
 * Celebration message
 */
export interface CelebrationMessage extends BaseMessage {
  type: 'celebration';
  celebrationType: string;
  effect: 'fireworks' | 'sparkles';
  message?: string;
}

/**
 * Music state message
 *
 * States:
 * - 'playing' = Music actively playing
 * - 'ducking' = Agent speaking over music (DJ fade-down)
 * - 'fading' = Track ending soon (~5 seconds left)
 * - 'changing' = DJ crossfade - switching to a new track
 * - 'paused' = Playback paused
 * - 'stopped' = Playback stopped
 * - 'idle' = No music loaded
 */
export interface MusicStateMessage extends BaseMessage {
  type: 'music_state';
  state: 'playing' | 'ducking' | 'fading' | 'changing' | 'paused' | 'stopped' | 'idle';
  track?: {
    name: string;
    artist?: string;
  };
  isAmbient: boolean;
  /** 💚 Is this a shared musical memory ("our song")? */
  isOurSong?: boolean;
  /** 💚 Context for the shared memory (e.g., "When you got the job") */
  ourSongContext?: string;
}

/**
 * Engagement data message
 */
export interface EngagementDataMessage extends BaseMessage {
  type: 'engagement_data';
  streak?: number;
  totalConversations?: number;
  predictions?: unknown[];
  achievements?: unknown[];
}

/**
 * All possible message types
 */
export type FrontendMessage =
  | HandoffStartedMessage
  | HandoffCompleteMessage
  | HandoffFailedMessage
  | HandoffAcknowledgedMessage
  | EmotionMessage
  | MoodMessage
  | CelebrationMessage
  | MusicStateMessage
  | EngagementDataMessage;

/**
 * Publisher configuration
 */
export interface PublisherConfig {
  /** Max retry attempts for failed sends */
  maxRetries?: number;
  /** Base delay between retries in ms */
  retryDelayMs?: number;
  /** Whether to log all sends */
  verbose?: boolean;
}

// ============================================================================
// FRONTEND PUBLISHER CLASS
// ============================================================================

/**
 * FrontendPublisher - Centralized frontend communication
 *
 * Usage:
 * ```ts
 * const publisher = new FrontendPublisher(room);
 *
 * // Send typed messages
 * await publisher.sendEmotion('happy', 0.8, 0.7);
 * await publisher.sendHandoffStarted('alex-chen', 'ferni', 'coach-to-team');
 * await publisher.sendCelebration('milestone', 'fireworks');
 * ```
 */
export class FrontendPublisher {
  private room: RoomRef | null = null;
  private logger = getLogger();
  private config: Required<PublisherConfig>;

  constructor(room?: RoomRef, config: PublisherConfig = {}) {
    this.room = room || null;
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 100,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Set or update the room reference
   */
  setRoom(room: RoomRef): void {
    this.room = room;
  }

  /**
   * Check if connected and ready to send
   */
  isConnected(): boolean {
    return !!this.room?.localParticipant;
  }

  // ============================================================================
  // CORE SEND METHOD
  // ============================================================================

  /**
   * Send a message to the frontend with retry logic
   */
  async send<T extends FrontendMessage>(message: Omit<T, 'timestamp'>): Promise<boolean> {
    if (!this.room?.localParticipant) {
      if (this.config.verbose) {
        this.logger.debug({ type: message.type }, 'Cannot send: no room connection');
      }
      return false;
    }

    const fullMessage: FrontendMessage = {
      ...message,
      timestamp: Date.now(),
    } as FrontendMessage;

    const data = new TextEncoder().encode(JSON.stringify(fullMessage));

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.room.localParticipant.publishData(data, { reliable: true });

        if (this.config.verbose) {
          this.logger.debug({ type: message.type }, 'Message sent to frontend');
        }

        return true;
      } catch (error) {
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * (attempt + 1);
          this.logger.warn(
            { type: message.type, attempt: attempt + 1, error: String(error) },
            `Send failed, retrying in ${delay}ms...`
          );
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delay);
          });
        } else {
          this.logger.error(
            { type: message.type, attempts: attempt + 1, error: String(error) },
            'Failed to send after retries'
          );
          return false;
        }
      }
    }

    return false;
  }

  // ============================================================================
  // HANDOFF MESSAGES
  // ============================================================================

  /**
   * Send handoff_started event
   */
  async sendHandoffStarted(
    newAgent: string,
    previousAgent: string,
    direction: string,
    playSound?: string
  ): Promise<boolean> {
    diag.entry(`Handoff started: ${previousAgent} → ${newAgent}`);

    return this.send<HandoffStartedMessage>({
      type: 'handoff_started',
      newAgent,
      previousAgent,
      direction,
      playSound,
    });
  }

  /**
   * Send handoff_complete event
   */
  async sendHandoffComplete(
    newAgent: string,
    previousAgent: string,
    greeting?: string
  ): Promise<boolean> {
    diag.entry(`Handoff complete: ${newAgent} ready to speak`);

    return this.send<HandoffCompleteMessage>({
      type: 'handoff_complete',
      newAgent,
      previousAgent,
      greeting,
    });
  }

  /**
   * Send handoff_failed event
   */
  async sendHandoffFailed(
    newAgent: string,
    error: string,
    previousAgent?: string
  ): Promise<boolean> {
    diag.error(`Handoff failed: ${error}`);

    return this.send<HandoffFailedMessage>({
      type: 'handoff_failed',
      newAgent,
      previousAgent,
      error,
    });
  }

  /**
   * Send handoff_acknowledged event
   */
  async sendHandoffAcknowledged(
    target: string,
    success: boolean,
    error?: string
  ): Promise<boolean> {
    return this.send<HandoffAcknowledgedMessage>({
      type: 'handoff_acknowledged',
      target,
      success,
      error,
    });
  }

  // ============================================================================
  // EMOTION & MOOD MESSAGES
  // ============================================================================

  /**
   * Send emotion update to frontend
   */
  async sendEmotion(emotion: string, confidence: number, intensity: number): Promise<boolean> {
    // Only send if confidence is meaningful
    if (confidence < 0.5) {
      return false;
    }

    return this.send<EmotionMessage>({
      type: 'emotion',
      emotion,
      confidence,
      intensity,
    });
  }

  /**
   * Send mood update to frontend
   */
  async sendMood(
    state: string,
    energyLevel: number,
    relationshipStage: string,
    hasTransition: boolean
  ): Promise<boolean> {
    return this.send<MoodMessage>({
      type: 'mood',
      state,
      energyLevel,
      relationshipStage,
      hasTransition,
    });
  }

  // ============================================================================
  // CELEBRATION MESSAGES
  // ============================================================================

  /**
   * Send celebration event for visual feedback
   */
  async sendCelebration(
    celebrationType: string,
    effect: 'fireworks' | 'sparkles',
    message?: string
  ): Promise<boolean> {
    diag.entry(`Celebration: ${celebrationType} (${effect})`);

    return this.send<CelebrationMessage>({
      type: 'celebration',
      celebrationType,
      effect,
      message,
    });
  }

  /**
   * Send multiple celebration events from context injections
   */
  async sendCelebrationEvents(
    injections: Array<{ category: string; content: string }>
  ): Promise<void> {
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
        await this.sendCelebration(config.celebrationType, config.effect, config.message);
      }
    }
  }

  // ============================================================================
  // MUSIC STATE MESSAGES
  // ============================================================================

  /**
   * Send music state update to frontend
   *
   * States:
   * - 'playing' = Music actively playing
   * - 'ducking' = Agent speaking over music (DJ fade-down)
   * - 'fading' = Track ending soon (~5 seconds left)
   * - 'changing' = DJ crossfade - switching to a new track
   * - 'paused' = Playback paused
   * - 'stopped' = Playback stopped
   * - 'idle' = No music loaded
   */
  async sendMusicState(
    state: 'playing' | 'ducking' | 'fading' | 'changing' | 'paused' | 'stopped' | 'idle',
    track?: { name: string; artist?: string },
    isAmbient = false,
    ourSongInfo?: { isOurSong: boolean; context?: string }
  ): Promise<boolean> {
    diag.state('Music state', {
      state,
      track: track?.name,
      isAmbient,
      isOurSong: ourSongInfo?.isOurSong,
    });

    return this.send<MusicStateMessage>({
      type: 'music_state',
      state,
      track,
      isAmbient,
      isOurSong: ourSongInfo?.isOurSong,
      ourSongContext: ourSongInfo?.context,
    });
  }

  // ============================================================================
  // ENGAGEMENT MESSAGES
  // ============================================================================

  /**
   * Send engagement data to frontend
   */
  async sendEngagementData(
    data: Omit<EngagementDataMessage, 'type' | 'timestamp'>
  ): Promise<boolean> {
    return this.send<EngagementDataMessage>({
      type: 'engagement_data',
      ...data,
    });
  }

  // ============================================================================
  // GENERIC DATA MESSAGE
  // ============================================================================

  /**
   * Send a generic data message (for custom message types)
   */
  async sendData(type: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!this.room?.localParticipant) {
      if (this.config.verbose) {
        this.logger.debug({ type }, 'Cannot send: no room connection');
      }
      return false;
    }

    try {
      const message = JSON.stringify({
        type,
        ...payload,
        timestamp: Date.now(),
      });

      await this.room.localParticipant.publishData(new TextEncoder().encode(message), {
        reliable: true,
      });

      if (this.config.verbose) {
        this.logger.debug({ type }, 'Generic message sent to frontend');
      }

      return true;
    } catch (error) {
      this.logger.warn({ type, error: String(error) }, 'Failed to send generic message');
      return false;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let publisherInstance: FrontendPublisher | null = null;

/**
 * Get the singleton FrontendPublisher instance
 */
export function getFrontendPublisher(): FrontendPublisher {
  if (!publisherInstance) {
    publisherInstance = new FrontendPublisher();
  }
  return publisherInstance;
}

/**
 * Initialize the FrontendPublisher with a room
 */
export function initializeFrontendPublisher(
  room: RoomRef,
  config?: PublisherConfig
): FrontendPublisher {
  if (!publisherInstance) {
    publisherInstance = new FrontendPublisher(room, config);
  } else {
    publisherInstance.setRoom(room);
  }
  return publisherInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetFrontendPublisher(): void {
  publisherInstance = null;
}
