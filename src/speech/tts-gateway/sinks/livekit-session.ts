/**
 * LiveKit Session Audio Sink
 *
 * Sends audio to a LiveKit AgentSession via session.say().
 * This is the simplest sink but requires text input to session.say().
 *
 * LIMITATION: session.say() expects text, not audio buffers.
 * This sink can only be used when we want LiveKit to handle TTS internally.
 * For pre-generated audio, use LiveKitTrackSink instead.
 *
 * @module speech/tts-gateway/sinks/livekit-session
 */

import type { voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import type { IAudioSink, AudioFormat } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'LiveKitSessionSink' });

/**
 * LiveKit Session Sink configuration
 */
export interface LiveKitSessionSinkConfig {
  /** Allow interruptions when speaking */
  allowInterruptions?: boolean;
}

/**
 * LiveKit Session Audio Sink
 *
 * Wraps a LiveKit AgentSession for audio output.
 *
 * NOTE: This sink has a fundamental limitation - session.say() expects TEXT,
 * not audio. When using this sink, the TTS gateway must either:
 * 1. Pass clean text to let LiveKit's internal TTS handle it
 * 2. Use a different sink that can accept raw audio
 *
 * For pre-generated audio from our gateway, use LiveKitTrackSink.
 */
export class LiveKitSessionSink implements IAudioSink {
  readonly name = 'livekit-session';

  private readonly session: voice.AgentSession;
  private readonly allowInterruptions: boolean;
  private isReady_ = false;

  constructor(session: voice.AgentSession, config: LiveKitSessionSinkConfig = {}) {
    this.session = session;
    this.allowInterruptions = config.allowInterruptions ?? true;
    this.isReady_ = true;
  }

  /**
   * Send text to the session (session.say handles TTS internally)
   *
   * NOTE: This method accepts text, not audio!
   * For actual audio buffers, use sendAudioDirect or LiveKitTrackSink.
   */
  async sendText(text: string): Promise<void> {
    if (!text.trim()) {
      log.debug({}, 'Empty text, skipping');
      return;
    }

    try {
      this.session.say(text, {
        allowInterruptions: this.allowInterruptions,
      });

      log.debug(
        { text: text.slice(0, 50), allowInterruptions: this.allowInterruptions },
        '🎤 Sent text to LiveKit session'
      );
    } catch (error) {
      const errorStr = String(error);
      if (errorStr.includes('AgentSession is not running')) {
        log.debug({ error: errorStr }, 'Session closed, cannot send text');
      } else {
        log.error({ error: errorStr }, 'Failed to send text to session');
      }
      throw error;
    }
  }

  /**
   * Send audio buffer to sink
   *
   * WARNING: session.say() doesn't accept audio buffers directly!
   * This method is implemented for interface compatibility but will throw.
   * Use LiveKitTrackSink for raw audio output.
   */
  async sendAudio(_audio: ArrayBuffer, _format: AudioFormat): Promise<void> {
    throw new Error(
      'LiveKitSessionSink.sendAudio() is not supported. ' +
        'session.say() expects text, not audio. ' +
        'Use LiveKitTrackSink for raw audio output, or use sendText() for text.'
    );
  }

  /**
   * Send audio frames to sink
   *
   * WARNING: Same limitation as sendAudio - use LiveKitTrackSink instead.
   */
  async sendFrames(_frames: AsyncIterable<AudioFrame>): Promise<void> {
    throw new Error(
      'LiveKitSessionSink.sendFrames() is not supported. ' +
        'session.say() expects text, not audio frames. ' +
        'Use LiveKitTrackSink for raw audio output.'
    );
  }

  /**
   * Check if sink is ready
   */
  isReady(): boolean {
    return this.isReady_;
  }

  /**
   * Flush - no-op for session sink
   */
  async flush(): Promise<void> {
    // session.say() is fire-and-forget, nothing to flush
  }

  /**
   * Mark sink as not ready (e.g., when session disconnects)
   */
  setNotReady(): void {
    this.isReady_ = false;
  }
}

/**
 * Create a LiveKit session sink
 */
export function createSessionSink(
  session: voice.AgentSession,
  config?: LiveKitSessionSinkConfig
): LiveKitSessionSink {
  return new LiveKitSessionSink(session, config);
}
