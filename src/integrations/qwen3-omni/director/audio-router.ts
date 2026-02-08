/**
 * Audio Router
 *
 * Routes audio transcripts based on whether the source is the user or the Director.
 *
 * When Director Mode is toggled ON for a participant:
 * - Their transcripts are injected as director instructions (never spoken back)
 * - They are NOT added to conversation history
 * - They go through the DirectorEngine.injectVoiceInstruction() path
 *
 * When Director Mode is OFF:
 * - Normal user conversation flow
 * - Transcripts go to turn processing
 *
 * The toggle is controlled via LiveKit data channel messages:
 * - { type: 'director_mode_enabled', directorUserId: '...' }
 * - { type: 'director_mode_disabled' }
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DirectorEngine } from './director-engine.js';
import type { DirectorCommand, DirectorDataChannelMessage } from './types.js';

const log = createLogger({ module: 'AudioRouter' });

// =============================================================================
// TYPES
// =============================================================================

/** Routing decision for an audio transcript */
export type AudioRouteDecision =
  | { type: 'user_conversation'; transcript: string }
  | { type: 'director_instruction'; transcript: string }
  | { type: 'director_command'; command: DirectorCommand };

/** Audio route handler callbacks */
export interface AudioRouteHandlers {
  /** Called when audio should go to normal conversation */
  onUserTranscript: (transcript: string) => void;
  /** Called when audio should be treated as director instruction */
  onDirectorInstruction: (transcript: string) => void;
  /** Called when a director command is received via data channel */
  onDirectorCommand: (command: DirectorCommand) => void;
}

// =============================================================================
// AUDIO ROUTER CLASS
// =============================================================================

export class AudioRouter {
  private readonly directorEngine: DirectorEngine;
  private readonly authorizedDirectorIds: ReadonlySet<string>;
  private _isDirectorModeActive = false;
  private _directorParticipantId: string | null = null;

  constructor(config: {
    directorEngine: DirectorEngine;
    /** Authorized director user IDs */
    authorizedDirectorIds: readonly string[];
  }) {
    this.directorEngine = config.directorEngine;
    this.authorizedDirectorIds = new Set(config.authorizedDirectorIds);

    log.debug({ authorizedDirectors: config.authorizedDirectorIds }, 'AudioRouter initialized');
  }

  // ===========================================================================
  // DIRECTOR MODE TOGGLE
  // ===========================================================================

  /**
   * Handle a data channel message that may be director-related.
   *
   * @returns true if the message was handled as a director message
   */
  handleDataChannelMessage(message: unknown, participantIdentity: string): boolean {
    if (!isDirectorDataChannelMessage(message)) {
      return false;
    }

    switch (message.type) {
      case 'director_mode_enabled': {
        if (!this.authorizedDirectorIds.has(message.directorUserId)) {
          log.warn({ userId: message.directorUserId }, 'Unauthorized director mode attempt');
          return true;
        }

        this._isDirectorModeActive = true;
        this._directorParticipantId = participantIdentity;
        this.directorEngine.setDirectorAudioActive(true);

        log.info({ participantId: participantIdentity }, 'Director mode enabled');
        return true;
      }

      case 'director_mode_disabled': {
        this._isDirectorModeActive = false;
        this._directorParticipantId = null;
        this.directorEngine.setDirectorAudioActive(false);

        log.info('Director mode disabled');
        return true;
      }

      case 'director_command': {
        if (!this.authorizedDirectorIds.has(participantIdentity)) {
          log.warn({ participantId: participantIdentity }, 'Unauthorized director command attempt');
          return true;
        }

        this.directorEngine.executeCommand(message.command);
        return true;
      }

      default:
        return false;
    }
  }

  // ===========================================================================
  // TRANSCRIPT ROUTING
  // ===========================================================================

  /**
   * Route a transcript based on director mode state.
   *
   * @param transcript - The STT transcript
   * @param participantIdentity - Who spoke (LiveKit participant identity)
   * @returns Routing decision
   */
  routeTranscript(transcript: string, participantIdentity: string): AudioRouteDecision {
    // Check if this participant is the active director
    if (this._isDirectorModeActive && this._directorParticipantId === participantIdentity) {
      // This is director audio — route as instruction
      this.directorEngine.injectVoiceInstruction(transcript);

      return {
        type: 'director_instruction',
        transcript,
      };
    }

    // Normal user conversation
    return {
      type: 'user_conversation',
      transcript,
    };
  }

  /**
   * Check if a participant's audio should be routed as director input.
   *
   * @param participantIdentity - LiveKit participant identity
   * @returns true if this participant is in director mode
   */
  isDirectorParticipant(participantIdentity: string): boolean {
    return this._isDirectorModeActive && this._directorParticipantId === participantIdentity;
  }

  // ===========================================================================
  // STATE
  // ===========================================================================

  /** Whether director mode is currently active */
  get isDirectorModeActive(): boolean {
    return this._isDirectorModeActive;
  }

  /** The participant ID that is currently in director mode */
  get directorParticipantId(): string | null {
    return this._directorParticipantId;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  cleanup(): void {
    this._isDirectorModeActive = false;
    this._directorParticipantId = null;
  }
}

// =============================================================================
// TYPE GUARD
// =============================================================================

function isDirectorDataChannelMessage(message: unknown): message is DirectorDataChannelMessage {
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  return (
    msg.type === 'director_mode_enabled' ||
    msg.type === 'director_mode_disabled' ||
    msg.type === 'director_command'
  );
}
