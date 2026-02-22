/**
 * Continuous Prosody Stream to LLM
 *
 * Maintains a rolling prosody window (last 500ms) and provides
 * periodic context updates so the LLM can adapt while user speaks.
 * Only active with OpenAI Realtime (supports context updates mid-turn).
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'continuous-prosody' });

/** Rolling prosody snapshot (500ms window) */
export interface ProsodySnapshot {
  /** Window start timestamp */
  timestampMs: number;
  /** Average pitch in Hz */
  pitchMean: number;
  /** Pitch trend: rising/falling/stable */
  pitchTrend: 'rising' | 'falling' | 'stable';
  /** Average energy (0-1) */
  energyMean: number;
  /** Energy trend */
  energyTrend: 'increasing' | 'decreasing' | 'stable';
  /** Speaking rate (syllables/sec) */
  speakingRate: number;
  /** Pause ratio in this window (0-1) */
  pauseRatio: number;
  /** Voice quality */
  voiceQuality: 'clear' | 'breathy' | 'strained' | 'trembling';
  /** Detected emotion shift */
  emotionShift: string | null;
}

/** Manages the rolling prosody window */
export class ContinuousProsodyStream {
  private snapshots: ProsodySnapshot[] = [];
  private readonly maxSnapshots = 20; // 10 seconds at 500ms intervals
  private updateCallback: ((snapshot: ProsodySnapshot) => void) | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private active = false;

  /** Start streaming prosody updates */
  start(onUpdate: (snapshot: ProsodySnapshot) => void): void {
    this.active = true;
    this.updateCallback = onUpdate;
    log.debug('Continuous prosody stream started');
  }

  /** Stop streaming */
  stop(): void {
    this.active = false;
    this.updateCallback = null;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log.debug('Continuous prosody stream stopped');
  }

  /** Push a new prosody snapshot (called every ~500ms from audio processor) */
  pushSnapshot(snapshot: ProsodySnapshot): void {
    if (!this.active) return;

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    if (this.updateCallback) {
      this.updateCallback(snapshot);
    }
  }

  /** Get the latest snapshot */
  getLatest(): ProsodySnapshot | null {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  /** Build context string for LLM injection */
  buildContextUpdate(): string {
    const latest = this.getLatest();
    if (!latest) return '';

    const lines = ['[LIVE PROSODY]'];
    lines.push(`pitch=${Math.round(latest.pitchMean)}Hz trend=${latest.pitchTrend}`);
    lines.push(
      `energy=${(latest.energyMean * 100).toFixed(0)}% trend=${latest.energyTrend}`
    );
    lines.push(
      `rate=${latest.speakingRate.toFixed(1)}sps pause_ratio=${(latest.pauseRatio * 100).toFixed(0)}%`
    );
    lines.push(`voice=${latest.voiceQuality}`);

    if (latest.emotionShift) {
      lines.push(`emotion_shift=${latest.emotionShift}`);
    }

    // Add trend analysis from last few snapshots
    if (this.snapshots.length >= 3) {
      const recent = this.snapshots.slice(-3);
      const pitchTrending = this.analyzeTrend(recent.map((s) => s.pitchMean));
      const energyTrending = this.analyzeTrend(recent.map((s) => s.energyMean));

      if (pitchTrending !== 'stable') {
        lines.push(`pitch_1.5s_trend=${pitchTrending}`);
      }
      if (energyTrending !== 'stable') {
        lines.push(`energy_1.5s_trend=${energyTrending}`);
      }
    }

    return lines.join('\n');
  }

  /** Analyze trend from a series of values */
  private analyzeTrend(values: number[]): 'rising' | 'falling' | 'stable' {
    if (values.length < 2) return 'stable';
    const first = values[0];
    const last = values[values.length - 1];
    const diff = (last - first) / (Math.abs(first) + 0.001);
    if (diff > 0.1) return 'rising';
    if (diff < -0.1) return 'falling';
    return 'stable';
  }

  /** Whether the stream is active */
  isActive(): boolean {
    return this.active;
  }

  /** Get snapshot count */
  getSnapshotCount(): number {
    return this.snapshots.length;
  }
}

/** Singleton instance */
let instance: ContinuousProsodyStream | null = null;

export function getContinuousProsodyStream(): ContinuousProsodyStream {
  if (!instance) {
    instance = new ContinuousProsodyStream();
  }
  return instance;
}
