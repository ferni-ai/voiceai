/**
 * PersonaPlex WebSocket Client
 *
 * Handles real-time communication with PersonaPlex server for
 * full-duplex speech-to-speech conversations.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getPersonaPlexConfig } from './config.js';
import type {
  PersonaPlexClientEvents,
  PersonaPlexConfig,
  PersonaPlexConnectionOptions,
  PersonaPlexConnectionState,
} from './types.js';

const log = createLogger({ module: 'PersonaPlexClient' });

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * PersonaPlex uses a simple binary protocol:
 * - Byte 0: Message type
 * - Bytes 1+: Payload
 *
 * Message types:
 * - 0x00: Handshake (server ready)
 * - 0x01: Audio data (Opus encoded)
 * - 0x02: Text token
 */
const MESSAGE_TYPE = {
  HANDSHAKE: 0x00,
  AUDIO: 0x01,
  TEXT: 0x02,
} as const;

// =============================================================================
// CLIENT IMPLEMENTATION
// =============================================================================

export class PersonaPlexClient {
  private config: PersonaPlexConfig;
  private ws: WebSocket | null = null;
  private state: PersonaPlexConnectionState = 'disconnected';
  private events: PersonaPlexClientEvents = {};
  private connectionOptions: PersonaPlexConnectionOptions | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private accumulatedText = '';

  constructor(config?: Partial<PersonaPlexConfig>) {
    this.config = { ...getPersonaPlexConfig(), ...config };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Connect to PersonaPlex server with specified voice and prompt
   */
  async connect(options: PersonaPlexConnectionOptions): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      log.warn('Already connected or connecting');
      return;
    }

    this.connectionOptions = options;
    this.setState('connecting');

    try {
      await this.establishConnection(options);
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  /**
   * Disconnect from PersonaPlex server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
    this.accumulatedText = '';
  }

  /**
   * Send audio data to PersonaPlex
   */
  sendAudio(data: Uint8Array): void {
    if (this.state !== 'connected') {
      log.warn({ state: this.state }, 'Cannot send audio: not connected');
      return;
    }

    if (!this.ws) return;

    // Prepend message type byte
    const message = new Uint8Array(data.length + 1);
    message[0] = MESSAGE_TYPE.AUDIO;
    message.set(data, 1);

    this.ws.send(message);
  }

  /**
   * Get current connection state
   */
  getState(): PersonaPlexConnectionState {
    return this.state;
  }

  /**
   * Get accumulated transcript text
   */
  getTranscript(): string {
    return this.accumulatedText;
  }

  /**
   * Set event handlers
   */
  on<K extends keyof PersonaPlexClientEvents>(event: K, handler: PersonaPlexClientEvents[K]): void {
    this.events[event] = handler;
  }

  /**
   * Remove event handler
   */
  off<K extends keyof PersonaPlexClientEvents>(event: K): void {
    delete this.events[event];
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async establishConnection(options: PersonaPlexConnectionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.buildConnectionUrl(options);

      log.info(
        { url: this.config.url, voicePrompt: options.voicePrompt },
        'Connecting to PersonaPlex'
      );

      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';
      } catch (error) {
        reject(new Error(`Failed to create WebSocket: ${error}`));
        return;
      }

      const timeout = setTimeout(() => {
        if (this.state !== 'connected') {
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }
      }, this.config.connectionTimeoutMs);

      this.ws.onopen = () => {
        log.info('WebSocket connection opened, waiting for handshake');
        this.setState('handshake');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as ArrayBuffer, resolve, clearTimeout.bind(null, timeout));
      };

      this.ws.onerror = (event) => {
        log.error({ event }, 'WebSocket error');
        clearTimeout(timeout);
        this.events.onError?.(new Error('WebSocket error'));
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = (event) => {
        log.info({ code: event.code, reason: event.reason }, 'WebSocket closed');
        clearTimeout(timeout);
        this.setState('disconnected');
        this.events.onClose?.();
      };
    });
  }

  private buildConnectionUrl(options: PersonaPlexConnectionOptions): string {
    const url = new URL(this.config.url);

    // Add query parameters for PersonaPlex configuration
    url.searchParams.set('voice_prompt', options.voicePrompt);
    url.searchParams.set('text_prompt', options.textPrompt);

    if (options.seed !== undefined) {
      url.searchParams.set('seed', options.seed.toString());
    }
    if (options.audioTemperature !== undefined) {
      url.searchParams.set('audio_temperature', options.audioTemperature.toString());
    }
    if (options.textTemperature !== undefined) {
      url.searchParams.set('text_temperature', options.textTemperature.toString());
    }
    if (options.textTopK !== undefined) {
      url.searchParams.set('text_topk', options.textTopK.toString());
    }
    if (options.audioTopK !== undefined) {
      url.searchParams.set('audio_topk', options.audioTopK.toString());
    }

    return url.toString();
  }

  private handleMessage(
    data: ArrayBuffer,
    resolveConnection?: () => void,
    clearConnectionTimeout?: () => void
  ): void {
    const bytes = new Uint8Array(data);
    if (bytes.length === 0) {
      log.warn('Received empty message');
      return;
    }

    const messageType = bytes[0];
    const payload = bytes.slice(1);

    switch (messageType) {
      case MESSAGE_TYPE.HANDSHAKE:
        log.info('Received handshake, connection ready');
        this.setState('connected');
        clearConnectionTimeout?.();
        this.events.onReady?.();
        resolveConnection?.();
        break;

      case MESSAGE_TYPE.AUDIO:
        this.events.onAudio?.(payload);
        break;

      case MESSAGE_TYPE.TEXT:
        const text = new TextDecoder().decode(payload);
        this.accumulatedText += text;
        this.events.onText?.(text);
        break;

      default:
        log.warn({ messageType }, 'Unknown message type');
    }
  }

  private setState(state: PersonaPlexConnectionState): void {
    if (this.state !== state) {
      const prevState = this.state;
      this.state = state;
      log.debug({ from: prevState, to: state }, 'State changed');
      this.events.onStateChange?.(state);
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a PersonaPlex client instance
 */
export function createPersonaPlexClient(config?: Partial<PersonaPlexConfig>): PersonaPlexClient {
  return new PersonaPlexClient(config);
}
