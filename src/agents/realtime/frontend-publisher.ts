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
    /** Track duration in milliseconds */
    duration?: number;
    /** Album artwork URL (from Spotify/iTunes) */
    albumArt?: string;
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
 * Set language message - voice-triggered app language change
 *
 * Sent when the user asks Ferni to change the app language.
 * The frontend will change the locale WITHOUT reloading, keeping
 * the LiveKit connection alive.
 */
export interface SetLanguageMessage extends BaseMessage {
  type: 'set_language';
  language: string;
}

/**
 * Game state message - real-time game board updates
 *
 * Sent when game state changes (move made, turn taken, etc.)
 * The frontend renders visual game boards based on this data.
 */
export interface GameStateMessage extends BaseMessage {
  type: 'game_state';
  gameType: 'tic-tac-toe' | '20-questions' | 'word-association' | 'story-builder' | 'would-you-rather' | string;
  status: 'active' | 'completed' | 'abandoned';
  gameData: Record<string, unknown>;
}

/**
 * Game started message - notify frontend to show game board
 */
export interface GameStartedMessage extends BaseMessage {
  type: 'game_started';
  gameId: string;
  gameType: string;
  gameName: string;
}

/**
 * Game ended message - notify frontend to hide game board
 */
export interface GameEndedMessage extends BaseMessage {
  type: 'game_ended';
  gameType: string;
  result?: string;
}

/**
 * Pending action message - notify frontend of action needing approval
 *
 * Part of the AGI-like experience: Ferni shows what action she wants to take
 * and asks for permission. The UI displays a card with approve/reject buttons.
 */
export interface PendingActionMessage extends BaseMessage {
  type: 'pending_action';
  action: {
    id: string;
    actionType: string;
    category: string;
    title: string;
    summary: string;
    details: string[];
    canUndo: boolean;
    estimatedCost?: number;
    affectedParties?: string[];
    expiresAt: string;
  };
}

/**
 * Action resolved message - notify frontend that action was approved/rejected
 */
export interface ActionResolvedMessage extends BaseMessage {
  type: 'action_resolved';
  actionId: string;
  status: 'approved' | 'rejected' | 'expired' | 'executed';
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
  | EngagementDataMessage
  | SetLanguageMessage
  | GameStateMessage
  | GameStartedMessage
  | GameEndedMessage
  | PendingActionMessage
  | ActionResolvedMessage;

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
      // Always log for music_state messages since we're debugging
      if (message.type === 'music_state') {
        diag.warn('🎧 [PUBLISHER.send] Cannot send music_state: no room connection', {
          hasRoom: !!this.room,
          hasLocalParticipant: !!this.room?.localParticipant,
        });
      } else if (this.config.verbose) {
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

        // Always log success for music_state messages
        if (message.type === 'music_state') {
          const musicMsg = fullMessage as MusicStateMessage;
          diag.state('🎧 [PUBLISHER.send] music_state published to LiveKit data channel', {
            trackName: musicMsg.track?.name,
            state: musicMsg.state,
          });
        } else if (this.config.verbose) {
          this.logger.debug({ type: message.type }, 'Message sent to frontend');
        }

        return true;
      } catch (error) {
        const errorStr = String(error);
        // Don't retry if connection is already closed - bail out immediately
        if (errorStr.includes('closed') || errorStr.includes('disconnect')) {
          if (message.type === 'music_state') {
            diag.debug('🎧 [PUBLISHER.send] music_state skipped - connection closed');
          } else if (this.config.verbose) {
            this.logger.debug({ type: message.type }, 'Send skipped - connection closed');
          }
          return false;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * (attempt + 1);
          this.logger.warn(
            { type: message.type, attempt: attempt + 1, error: errorStr },
            `Send failed, retrying in ${delay}ms...`
          );
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delay);
          });
        } else {
          this.logger.error(
            { type: message.type, attempts: attempt + 1, error: errorStr },
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
    track?: { name: string; artist?: string; duration?: number; albumArt?: string },
    isAmbient = false,
    ourSongInfo?: { isOurSong: boolean; context?: string }
  ): Promise<boolean> {
    diag.state('🎧 [PUBLISHER] sendMusicState called', {
      state,
      track: track?.name,
      duration: track?.duration,
      albumArt: track?.albumArt ? 'present' : 'none',
      isAmbient,
      isOurSong: ourSongInfo?.isOurSong,
      hasLocalParticipant: !!this.room?.localParticipant,
    });

    const result = await this.send<MusicStateMessage>({
      type: 'music_state',
      state,
      track,
      isAmbient,
      isOurSong: ourSongInfo?.isOurSong,
      ourSongContext: ourSongInfo?.context,
    });

    diag.state('🎧 [PUBLISHER] sendMusicState result', {
      success: result,
      state,
      trackName: track?.name,
    });

    return result;
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
  // APP SETTINGS MESSAGES
  // ============================================================================

  /**
   * Send a language change request to the frontend
   *
   * The frontend will change the locale WITHOUT reloading the page,
   * keeping the LiveKit connection alive. This enables voice-triggered
   * language changes without disconnecting the call.
   *
   * @param language - The locale code (e.g., 'es', 'fr', 'ja')
   */
  async sendSetLanguage(language: string): Promise<boolean> {
    this.logger.info({ language }, '🌐 Sending language change to frontend');

    return this.send<SetLanguageMessage>({
      type: 'set_language',
      language,
    });
  }

  // ============================================================================
  // GAME STATE MESSAGES
  // ============================================================================

  /**
   * Send game started notification to frontend
   *
   * Triggers the game board UI to appear with the appropriate game type.
   */
  async sendGameStarted(
    gameId: string,
    gameType: string,
    gameName: string
  ): Promise<boolean> {
    this.logger.info({ gameId, gameType, gameName }, '🎮 Game started');

    return this.send<GameStartedMessage>({
      type: 'game_started',
      gameId,
      gameType,
      gameName,
    });
  }

  /**
   * Send game state update to frontend
   *
   * Updates the visual game board with current state (moves, scores, turns).
   */
  async sendGameState(
    gameType: GameStateMessage['gameType'],
    status: GameStateMessage['status'],
    gameData: Record<string, unknown>
  ): Promise<boolean> {
    if (this.config.verbose) {
      this.logger.debug({ gameType, status }, '🎮 Sending game state update');
    }

    return this.send<GameStateMessage>({
      type: 'game_state',
      gameType,
      status,
      gameData,
    });
  }

  /**
   * Send game ended notification to frontend
   *
   * Triggers the game board UI to show results and then hide.
   */
  async sendGameEnded(gameType: string, result?: string): Promise<boolean> {
    this.logger.info({ gameType, result }, '🎮 Game ended');

    return this.send<GameEndedMessage>({
      type: 'game_ended',
      gameType,
      result,
    });
  }

  // ============================================================================
  // ACTION CONFIRMATION MESSAGES
  // ============================================================================

  /**
   * Send a pending action to the frontend for user approval
   *
   * This is part of the AGI-like experience: Ferni shows what action she wants
   * to take and asks for permission. The UI displays a card with approve/reject.
   *
   * @param action - The pending action from the trust level system
   */
  async sendPendingAction(action: {
    id: string;
    actionType: string;
    category: string;
    description: string;
    preview: {
      title: string;
      summary: string;
      details: string[];
      canUndo: boolean;
      estimatedCost?: number;
      affectedParties?: string[];
    };
    expiresAt: string;
  }): Promise<boolean> {
    this.logger.info(
      { actionId: action.id, actionType: action.actionType },
      '🎯 Sending pending action to frontend'
    );

    return this.send<PendingActionMessage>({
      type: 'pending_action',
      action: {
        id: action.id,
        actionType: action.actionType,
        category: action.category,
        title: action.preview.title,
        summary: action.preview.summary,
        details: action.preview.details,
        canUndo: action.preview.canUndo,
        estimatedCost: action.preview.estimatedCost,
        affectedParties: action.preview.affectedParties,
        expiresAt: action.expiresAt,
      },
    });
  }

  /**
   * Send action resolved notification to frontend
   *
   * Called when an action is approved, rejected, expired, or executed.
   */
  async sendActionResolved(
    actionId: string,
    status: 'approved' | 'rejected' | 'expired' | 'executed'
  ): Promise<boolean> {
    this.logger.info({ actionId, status }, '🎯 Action resolved');

    return this.send<ActionResolvedMessage>({
      type: 'action_resolved',
      actionId,
      status,
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
