/**
 * What the Director carries from one reply to the next: the previous reply's
 * emotion and speed, for turn-to-turn smoothing.
 *
 * Keyed by session AND persona, so a handoff inside one session starts the
 * new persona fresh instead of inheriting the last one's emotion and pace,
 * and never shared between sessions (the gateway builds a new TTS node per
 * reply, so state cannot live in the node). cleanupSpeechSession() clears a
 * session's entries when it ends (session-mgmt/session-cleanup.ts); as a
 * backstop the map is bounded and drops the least recently used entry past
 * the cap. Same keyed-by-session pattern as output-control/speech-context.ts.
 *
 * @module speech/tts-gateway/director/session-state
 */

export interface CarryOver {
  emotion?: string;
  speed: number;
  /** Replies since the last opening sigh / breath (nonverbal.ts cooldowns). */
  sinceSigh?: number;
  sinceBreath?: number;
}

const DEFAULT: CarryOver = { speed: 1 };

const keyOf = (sessionId: string, personaId = ''): string => `${sessionId}\u0000${personaId}`;

export class DirectorSessions {
  private readonly states = new Map<string, CarryOver>();

  constructor(private readonly maxSessions = 1000) {}

  get size(): number {
    return this.states.size;
  }

  get(sessionId: string, personaId?: string): CarryOver {
    const key = keyOf(sessionId, personaId);
    const state = this.states.get(key);
    if (!state) return { ...DEFAULT };
    // Re-insert to mark as most recently used.
    this.states.delete(key);
    this.states.set(key, state);
    return { ...state };
  }

  update(sessionId: string, personaId: string | undefined, state: CarryOver): void {
    const key = keyOf(sessionId, personaId);
    this.states.delete(key);
    this.states.set(key, { ...state });
    while (this.states.size > this.maxSessions) {
      const oldest = this.states.keys().next().value;
      if (oldest === undefined) break;
      this.states.delete(oldest);
    }
  }

  /** Forget every persona's carry-over for a session (call when it ends). */
  clear(sessionId: string): void {
    const prefix = keyOf(sessionId);
    for (const key of [...this.states.keys()]) {
      if (key.startsWith(prefix)) this.states.delete(key);
    }
  }
}

/** The process's Director carry-over, one entry per live session and persona. */
export const directorSessions = new DirectorSessions();
