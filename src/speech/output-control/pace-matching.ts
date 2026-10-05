/**
 * Pace matching: drift toward the user's speaking rate.
 *
 * Conversation partners converge on speaking rate and intensity (Levitan et
 * al. 2012, "Acoustic-prosodic entrainment and social behavior"). This keeps
 * a per-session estimate of the user's rate (words over the time from their
 * first to last word, pauses included) and turns it into a base speech speed
 * for replies: half-way toward the user's relative rate, within 0.9-1.1, so a
 * fast talker gets a slightly quicker Ferni and a slow, tired one a slower
 * one, without caricature. Per-sentence speed tags from the reply apply on
 * top of it.
 *
 * @module speech/output-control/pace-matching
 */

/** A typical conversational rate with pauses included, words per minute. */
export const REFERENCE_WPM = 160;
const MIN_WORDS = 6;
const MIN_TURNS = 2;
const WINDOW = 5;
const PULL = 0.5;
const MIN_SPEED = 0.9;
const MAX_SPEED = 1.1;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export class PaceMatcher {
  private readonly rates: number[] = [];

  /** Record one user turn. Short turns ("yeah", "ok") say little about pace. */
  recordTurn(transcript: string, speakingMs: number): void {
    const words = transcript.split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS || speakingMs < 1000) return;
    const wpm = words / (speakingMs / 60000);
    if (wpm < 60 || wpm > 320) return; // a timing glitch, not a pace
    this.rates.push(wpm);
    if (this.rates.length > WINDOW) this.rates.shift();
  }

  get userWpm(): number | null {
    return this.rates.length >= MIN_TURNS ? median(this.rates) : null;
  }

  /** Base speech speed for replies (1 until there is enough evidence). */
  speed(): number {
    const wpm = this.userWpm;
    if (wpm === null) return 1;
    const target = 1 + PULL * (wpm / REFERENCE_WPM - 1);
    return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, target)) * 100) / 100;
  }
}

const matchers = new Map<string, PaceMatcher>();

export function getPaceMatcher(sessionId: string): PaceMatcher {
  let m = matchers.get(sessionId);
  if (!m) {
    m = new PaceMatcher();
    matchers.set(sessionId, m);
  }
  return m;
}

/** The base reply speed for a session; 1 when unknown or PACE_MATCHING=off. */
export function sessionSpeed(sessionId: string | undefined): number {
  if (!sessionId || process.env.PACE_MATCHING === 'off') return 1;
  return matchers.get(sessionId)?.speed() ?? 1;
}

export function clearPaceMatcher(sessionId: string): void {
  matchers.delete(sessionId);
}
