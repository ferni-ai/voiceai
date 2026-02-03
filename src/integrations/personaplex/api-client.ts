/**
 * PersonaPlex.io API Client
 *
 * Uses the hosted PersonaPlex API at personaplex.io
 * Much easier than running your own GPU server!
 *
 * Pricing: $0.08/minute
 * Latency: ~170ms
 * Features: Full-duplex, 16 voices, custom personas
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFallbackVoice } from './config.js';
import {
  buildEnhancedPersonaPlexPrompt,
  type EnhancedPromptContext,
} from './enhanced-prompt-builder.js';

const log = createLogger({ module: 'PersonaPlexAPI' });

// =============================================================================
// API CONFIGURATION
// =============================================================================

interface PersonaPlexAPIConfig {
  /** API key from personaplex.io */
  apiKey: string;
  /** Base URL (default: api.personaplex.io) */
  baseUrl?: string;
  /** Debug mode */
  debug?: boolean;
}

interface SessionConfig {
  /** Voice ID (e.g., 'NAT-F2', 'NAT-M1') */
  voice: string;
  /** Persona/role prompt */
  persona: string;
  /** Session ID for continuity */
  sessionId?: string;
}

interface StreamResponse {
  /** Audio data */
  audio: Uint8Array;
  /** Transcribed text */
  text?: string;
  /** Is final response */
  isFinal: boolean;
}

// =============================================================================
// API CLIENT
// =============================================================================

export class PersonaPlexAPIClient {
  private config: PersonaPlexAPIConfig;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;

  constructor(config: PersonaPlexAPIConfig) {
    this.config = {
      baseUrl: 'wss://api.personaplex.io',
      ...config,
    };
  }

  /**
   * Create a session with the PersonaPlex API
   */
  async createSession(options: {
    personaId: string;
    context?: EnhancedPromptContext;
    useCustomVoice?: boolean;
  }): Promise<string> {
    const { personaId, context, useCustomVoice = false } = options;

    // Build the enhanced prompt
    const { textPrompt } = await buildEnhancedPersonaPlexPrompt(personaId, context);

    // Map to PersonaPlex voice format
    const voice = this.mapVoiceId(personaId, useCustomVoice);

    log.info({ personaId, voice }, 'Creating PersonaPlex session');

    // Connect to API
    const url = new URL('/v1/session', this.config.baseUrl);
    url.searchParams.set('voice', voice);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url.toString(), {
        // @ts-expect-error - headers not in standard WebSocket but supported by most implementations
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      this.ws.onopen = () => {
        // Send persona configuration
        this.ws?.send(
          JSON.stringify({
            type: 'config',
            persona: textPrompt,
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'session_created') {
            this.sessionId = data.sessionId;
            resolve(data.sessionId);
          } else if (data.type === 'error') {
            reject(new Error(data.message));
          }
        } catch {
          // Binary audio data
        }
      };

      this.ws.onerror = (error) => {
        reject(new Error(`WebSocket error: ${error}`));
      };

      setTimeout(() => {
        if (!this.sessionId) {
          reject(new Error('Session creation timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Stream audio to the API and receive responses
   */
  async *stream(audioInput: AsyncIterable<Uint8Array>): AsyncGenerator<StreamResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('No active session');
    }

    // Set up response queue
    const responseQueue: StreamResponse[] = [];
    let resolveNext: ((value: StreamResponse) => void) | null = null;

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const response: StreamResponse = {
          audio: new Uint8Array(event.data),
          isFinal: false,
        };
        if (resolveNext) {
          resolveNext(response);
          resolveNext = null;
        } else {
          responseQueue.push(response);
        }
      } else {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'text') {
            const response: StreamResponse = {
              audio: new Uint8Array(0),
              text: data.text,
              isFinal: data.isFinal || false,
            };
            if (resolveNext) {
              resolveNext(response);
              resolveNext = null;
            } else {
              responseQueue.push(response);
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    };

    // Send audio input
    for await (const chunk of audioInput) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(chunk);
      }

      // Yield any pending responses
      while (responseQueue.length > 0) {
        yield responseQueue.shift()!;
      }

      // Wait for next response
      const response = await new Promise<StreamResponse>((resolve) => {
        if (responseQueue.length > 0) {
          resolve(responseQueue.shift()!);
        } else {
          resolveNext = resolve;
        }
      });
      yield response;
    }
  }

  /**
   * Close the session
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
  }

  /**
   * Map Ferni persona to PersonaPlex voice
   */
  private mapVoiceId(personaId: string, useCustomVoice: boolean): string {
    if (useCustomVoice) {
      // Would use custom .pt file - requires self-hosted server
      return `custom:${personaId}`;
    }

    // Map to PersonaPlex stock voices
    const fallback = getFallbackVoice(personaId);

    // PersonaPlex API uses format like 'NAT-F2' not 'NATF2'
    const formatted = fallback.replace(/([A-Z]+)([FM])(\d)/, '$1-$2$3');
    return formatted;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a PersonaPlex API client
 *
 * @example
 * ```typescript
 * const client = createPersonaPlexAPIClient({
 *   apiKey: process.env.PERSONAPLEX_API_KEY!
 * });
 *
 * const sessionId = await client.createSession({
 *   personaId: 'ferni',
 *   context: { userId: 'user-123' }
 * });
 *
 * // Stream audio
 * for await (const response of client.stream(audioInput)) {
 *   playAudio(response.audio);
 *   if (response.text) console.log(response.text);
 * }
 * ```
 */
export function createPersonaPlexAPIClient(config: PersonaPlexAPIConfig): PersonaPlexAPIClient {
  return new PersonaPlexAPIClient(config);
}

// =============================================================================
// ENVIRONMENT HELPERS
// =============================================================================

/**
 * Check if PersonaPlex API is configured
 */
export function isPersonaPlexAPIConfigured(): boolean {
  return !!process.env.PERSONAPLEX_API_KEY;
}

/**
 * Get PersonaPlex API key from environment
 */
export function getPersonaPlexAPIKey(): string | undefined {
  return process.env.PERSONAPLEX_API_KEY;
}
