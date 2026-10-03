/**
 * What the Director carries from one reply to the next in a session: the
 * previous reply's emotion and speed, for turn-to-turn smoothing.
 *
 * Keyed by sessionId and never shared between sessions (the gateway builds a
 * new TTS node per reply, so state cannot live in the node). Bounded: the
 * least recently used session is dropped past the cap, so a session that ends
 * without cleanup cannot grow the map. Same keyed-by-session pattern as
 * output-control/speech-context.ts.
 *
 * @module speech/tts-gateway/director/session-state
 */

export interface CarryOver {
  emotion?: string;
  speed: number;
}

const DEFAULT: CarryOver = { speed: 1 };

export class DirectorSessions {
  private readonly states = new Map<string, CarryOver>();

  constructor(private readonly maxSessions = 1000) {}

  get size(): number {
    return this.states.size;
  }

  get(sessionId: string): CarryOver {
    const state = this.states.get(sessionId);
    if (!state) return { ...DEFAULT };
    // Re-insert to mark as most recently used.
    this.states.delete(sessionId);
    this.states.set(sessionId, state);
    return { ...state };
  }

  update(sessionId: string, state: CarryOver): void {
    this.states.delete(sessionId);
    this.states.set(sessionId, { ...state });
    while (this.states.size > this.maxSessions) {
      const oldest = this.states.keys().next().value;
      if (oldest === undefined) break;
      this.states.delete(oldest);
    }
  }

  clear(sessionId: string): void {
    this.states.delete(sessionId);
  }
}

/** The process's Director carry-over, one entry per live session. */
export const directorSessions = new DirectorSessions();
