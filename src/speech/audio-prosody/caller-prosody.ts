/**
 * How the caller sounds this turn, against their own baseline.
 *
 * The native analyzer returns a reading for every 10-20 ms frame
 * (pitchHz, pitchConfidence, energyDb, isSpeech); its end-of-turn reading
 * measured mostly the silence after speech (energy -200 dB, rate 0, dev
 * 2026-10-04). This keeps only voiced frames, and at each reply reads the
 * turn just finished relative to how this caller usually sounds, so
 * "louder and faster than usual" means something whatever their voice.
 *
 * @module speech/audio-prosody/caller-prosody
 */

export interface ProsodyFrame {
  pitchHz: number;
  pitchConfidence: number;
  energyDb: number;
  isSpeech: boolean;
}

export interface CallerProsody {
  pitchMedianHz: number;
  /** Turn median pitch vs the caller's baseline, in semitones. */
  pitchRelSt: number;
  /** Pitch movement over the last second of voice, semitones per second (negative = falling). */
  pitchSlopeStPerS: number;
  /** Turn median energy vs the caller's baseline, in dB. */
  energyRelDb: number;
  /** Words per voiced second vs the caller's baseline (1 = usual pace, or unknown). */
  rateRel: number;
  voicedMs: number;
}

/** Less voice than this and a reading is noise (a laugh, a "yeah"). */
const MIN_VOICED_MS = 1500;
const MIN_PITCH_CONFIDENCE = 0.5;
const PITCH_RANGE_HZ = [60, 500] as const;
const SLOPE_WINDOW_MS = 1000;
/** How much each turn moves the baseline. */
const BASELINE_WEIGHT = 0.3;
const DEFAULT_FRAME_MS = 10;
const MAX_FRAME_GAP_MS = 50;

const semitones = (hz: number) => 12 * Math.log2(hz / 100);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Least-squares slope of y over t (per second). */
function slopePerSecond(points: Array<{ t: number; y: number }>): number {
  if (points.length < 2) return 0;
  const mt = points.reduce((a, p) => a + p.t, 0) / points.length;
  const my = points.reduce((a, p) => a + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - mt) * (p.y - my);
    den += (p.t - mt) ** 2;
  }
  return den === 0 ? 0 : (num / den) * 1000;
}

interface Baseline {
  pitchSt: number;
  energyDb: number;
  rate?: number;
}

export class CallerProsodyTracker {
  private pitch: Array<{ t: number; hz: number }> = [];
  private energy: number[] = [];
  private voicedMs = 0;
  private lastVoicedAt?: number;
  private baseline?: Baseline;
  /** Words in the turn a reply has read; the turn closes when the caller speaks again. */
  private readWords?: number;

  addFrame(frame: ProsodyFrame, timestampMs: number): void {
    if (!frame.isSpeech) return;
    // The caller speaks after Ferni answered: the read turn joins the baseline.
    if (this.readWords !== undefined) this.closeTurn();
    const gap = this.lastVoicedAt === undefined ? DEFAULT_FRAME_MS : timestampMs - this.lastVoicedAt;
    this.voicedMs += gap > 0 && gap <= MAX_FRAME_GAP_MS ? gap : DEFAULT_FRAME_MS;
    this.lastVoicedAt = timestampMs;
    if (Number.isFinite(frame.energyDb) && frame.energyDb > -120) push(this.energy, frame.energyDb);
    const hz = frame.pitchHz;
    if (frame.pitchConfidence >= MIN_PITCH_CONFIDENCE && hz > PITCH_RANGE_HZ[0] && hz < PITCH_RANGE_HZ[1]) {
      push(this.pitch, { t: timestampMs, hz });
    }
  }

  /**
   * The turn so far, relative to the caller's baseline. Every reply to this
   * turn (a preemptive one, then the real one) gets the same reading; the
   * turn joins the baseline when the caller next speaks. Undefined with too
   * little voice.
   */
  readTurn(words?: number): CallerProsody | undefined {
    this.readWords = words ?? 0;
    return this.measure(words)?.reading;
  }

  private measure(words?: number): { reading: CallerProsody; turn: Baseline } | undefined {
    const { pitch, energy, voicedMs } = this;
    if (voicedMs < MIN_VOICED_MS || pitch.length === 0 || energy.length === 0) return undefined;
    const pitchMedianHz = median(pitch.map((p) => p.hz));
    const turn: Baseline = {
      pitchSt: semitones(pitchMedianHz),
      energyDb: median(energy),
      rate: words && words > 0 ? words / (voicedMs / 1000) : undefined,
    };
    const end = pitch[pitch.length - 1].t;
    const tail = pitch
      .filter((p) => end - p.t <= SLOPE_WINDOW_MS)
      .map((p) => ({ t: p.t, y: semitones(p.hz) }));
    const base = this.baseline ?? turn;
    return {
      turn,
      reading: {
        pitchMedianHz,
        pitchRelSt: turn.pitchSt - base.pitchSt,
        pitchSlopeStPerS: slopePerSecond(tail),
        energyRelDb: turn.energyDb - base.energyDb,
        rateRel: turn.rate !== undefined && base.rate ? turn.rate / base.rate : 1,
        voicedMs,
      },
    };
  }

  private closeTurn(): void {
    const turn = this.measure(this.readWords)?.turn;
    if (turn) {
      const b = this.baseline;
      this.baseline = b
        ? {
            pitchSt: b.pitchSt + BASELINE_WEIGHT * (turn.pitchSt - b.pitchSt),
            energyDb: b.energyDb + BASELINE_WEIGHT * (turn.energyDb - b.energyDb),
            rate:
              turn.rate === undefined
                ? b.rate
                : b.rate === undefined
                  ? turn.rate
                  : b.rate + BASELINE_WEIGHT * (turn.rate - b.rate),
          }
        : turn;
    }
    this.pitch = [];
    this.energy = [];
    this.voicedMs = 0;
    this.lastVoicedAt = undefined;
    this.readWords = undefined;
  }
}

/** A turn keeps at most a minute of frames (the Director may be off and never read it). */
const MAX_FRAMES = 6000;
function push<T>(list: T[], item: T): void {
  list.push(item);
  if (list.length > MAX_FRAMES) list.shift();
}

const trackers = new Map<string, CallerProsodyTracker>();

export function getCallerProsodyTracker(sessionId: string): CallerProsodyTracker {
  let t = trackers.get(sessionId);
  if (!t) {
    t = new CallerProsodyTracker();
    trackers.set(sessionId, t);
  }
  return t;
}

/** The caller's turn as Ferni starts to answer it; undefined without a tracker or enough voice. */
export function readCallerProsody(sessionId: string, words?: number): CallerProsody | undefined {
  return trackers.get(sessionId)?.readTurn(words);
}

export function removeCallerProsodyTracker(sessionId: string): void {
  trackers.delete(sessionId);
}
