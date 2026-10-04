/**
 * Voice Speaker Change Detection
 *
 * Automatically detects when a different person starts speaking
 * during an active conversation.
 *
 * FEATURES:
 * - Real-time speaker diarization
 * - Embedding-based change detection
 * - Smooth transitions (handles brief interruptions)
 * - Event emission for UI updates
 *
 * @module VoiceSpeakerChange
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { extractSpeakerEmbedding, type SpeakerEmbedding } from '../voice-memory-enhanced.js';
import { identifyHouseholdSpeaker, updateSessionSpeaker } from './voice-household.js';
// Centralized cosine similarity - uses optimized implementation from rust-accelerator
import { cosineSimilarity } from '../../memory/rust-accelerator.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';

const log = pino({ name: 'speaker-change' });

// ============================================================================
// TYPES
// ============================================================================

export interface SpeakerChangeEvent {
  type: 'speaker_changed' | 'speaker_confirmed' | 'unknown_speaker';
  previousSpeakerId: string | null;
  currentSpeakerId: string | null;
  confidence: number;
  timestamp: Date;
  isNewSpeaker: boolean;
}

export interface SpeakerChangeConfig {
  // Minimum similarity to consider same speaker
  sameSpeakerThreshold: number;
  // Minimum confidence to trigger speaker change
  changeConfidenceThreshold: number;
  // Number of consecutive different samples before triggering change
  changeDebounceCount: number;
  // Minimum audio duration for embedding extraction (ms)
  minAudioDurationMs: number;
  // Check interval for continuous monitoring (ms): at most one comparison per interval
  checkIntervalMs: number;
  // Most recent audio kept for the next comparison (ms of 16 kHz audio, any frame size)
  maxBufferedMs: number;
  // Windows quieter than this RMS are skipped (silence, not a voice to compare)
  minSpeechRms: number;
  // Enable household identification
  enableHouseholdIdentification: boolean;
}

interface SpeakerState {
  currentSpeakerId: string | null;
  currentEmbedding: number[] | null;
  recentEmbeddings: Array<{
    embedding: number[];
    timestamp: Date;
  }>;
  consecutiveDifferentCount: number;
  lastCheckTime: Date;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: SpeakerChangeConfig = {
  sameSpeakerThreshold: 0.75,
  changeConfidenceThreshold: 0.6,
  changeDebounceCount: 2,
  minAudioDurationMs: 1000,
  checkIntervalMs: 2000,
  maxBufferedMs: 2000,
  minSpeechRms: 0.01, // about -40 dBFS
  enableHouseholdIdentification: true,
};

const SAMPLE_RATE = 16000;

// ============================================================================
// SPEAKER CHANGE DETECTOR
// ============================================================================

export class SpeakerChangeDetector extends EventEmitter {
  private config: SpeakerChangeConfig;
  private state: SpeakerState;
  private deviceId: string;
  private audioBuffer: Float32Array[] = [];
  private bufferedSamples = 0;
  private isMonitoring = false;
  private isComparing = false;

  private getIntervalName(): string {
    return `speaker-change-detector-${this.deviceId}`;
  }

  constructor(deviceId: string, config: Partial<SpeakerChangeConfig> = {}) {
    super();

    this.deviceId = deviceId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      currentSpeakerId: null,
      currentEmbedding: null,
      recentEmbeddings: [],
      consecutiveDifferentCount: 0,
      lastCheckTime: new Date(),
    };
  }

  /**
   * Start monitoring for speaker changes.
   */
  start(initialSpeakerId?: string): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.state.currentSpeakerId = initialSpeakerId || null;

    log.info(
      {
        deviceId: this.deviceId,
        initialSpeakerId,
      },
      'Speaker change detection started'
    );

    // Start periodic check using managed interval
    registerInterval(
      this.getIntervalName(),
      () => {
        void this.processAudioBuffer();
      },
      this.config.checkIntervalMs
    );
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.isMonitoring = false;
    clearNamedInterval(this.getIntervalName());
    this.audioBuffer = [];
    this.bufferedSamples = 0;

    log.info({ deviceId: this.deviceId }, 'Speaker change detection stopped');
  }

  /**
   * Feed audio samples for analysis. Only stores them (cheap, per frame); the
   * comparison runs on the interval. Keeps the most recent maxBufferedMs of
   * audio whatever the frame size (a 10-frame cap held only 100-200 ms of
   * 10-20 ms frames, so the 1 s minimum was never reached).
   */
  feedAudio(samples: Float32Array): void {
    if (!this.isMonitoring) return;

    this.audioBuffer.push(samples);
    this.bufferedSamples += samples.length;

    const maxSamples = (this.config.maxBufferedMs / 1000) * SAMPLE_RATE;
    while (
      this.audioBuffer.length > 1 &&
      this.bufferedSamples - this.audioBuffer[0].length >= maxSamples
    ) {
      this.bufferedSamples -= this.audioBuffer.shift()?.length ?? 0;
    }
  }

  /**
   * Process buffered audio and check for speaker change. Runs at most once per
   * checkIntervalMs (the interval), never overlapping, and skips silence.
   */
  private async processAudioBuffer(): Promise<void> {
    if (this.audioBuffer.length === 0 || this.isComparing) return;

    // Combine audio buffers
    const combined = new Float32Array(this.bufferedSamples);
    let offset = 0;
    for (const buffer of this.audioBuffer) {
      combined.set(buffer, offset);
      offset += buffer.length;
    }

    // Clear buffer
    this.audioBuffer = [];
    this.bufferedSamples = 0;

    // Check minimum duration (16 kHz)
    const durationMs = (combined.length / SAMPLE_RATE) * 1000;
    if (durationMs < this.config.minAudioDurationMs) {
      return;
    }

    // Silence is not a voice: comparing it would read as a "change"
    let energy = 0;
    for (const sample of combined) energy += sample * sample;
    if (Math.sqrt(energy / combined.length) < this.config.minSpeechRms) {
      return;
    }

    this.isComparing = true;
    try {
      // Extract embedding
      const speakerEmbedding = await extractSpeakerEmbedding(combined);

      // Skip if embedding extraction failed
      if (!speakerEmbedding) {
        log.debug('Could not extract embedding from audio');
        return;
      }

      // Convert Float32Array to number[] for internal use
      const embedding = Array.from(speakerEmbedding.vector);

      // Compare with current speaker
      await this.checkSpeakerChange(embedding);
    } catch (error) {
      log.error({ error }, 'Error processing audio for speaker change');
    } finally {
      this.isComparing = false;
    }
  }

  /**
   * Check if speaker has changed based on embedding.
   */
  private async checkSpeakerChange(newEmbedding: number[]): Promise<void> {
    const now = new Date();

    // Add to recent embeddings
    this.state.recentEmbeddings.push({
      embedding: newEmbedding,
      timestamp: now,
    });

    // Keep only last 5 embeddings
    if (this.state.recentEmbeddings.length > 5) {
      this.state.recentEmbeddings = this.state.recentEmbeddings.slice(-5);
    }

    // If no current embedding, this is the first speaker
    if (!this.state.currentEmbedding) {
      await this.handleNewSpeaker(newEmbedding);
      return;
    }

    // Compare with current speaker - uses centralized SIMD-ready implementation
    const similarity = cosineSimilarity(newEmbedding, this.state.currentEmbedding);

    if (similarity >= this.config.sameSpeakerThreshold) {
      // Same speaker - reset debounce counter
      this.state.consecutiveDifferentCount = 0;

      // Update embedding with average for better tracking
      this.state.currentEmbedding = this.averageEmbeddings([
        this.state.currentEmbedding,
        newEmbedding,
      ]);

      // Emit confirmation event occasionally
      if (Math.random() < 0.1) {
        this.emitEvent('speaker_confirmed', similarity);
      }
    } else {
      // Different speaker detected
      this.state.consecutiveDifferentCount++;

      log.debug(
        {
          similarity,
          consecutiveCount: this.state.consecutiveDifferentCount,
          threshold: this.config.sameSpeakerThreshold,
        },
        'Different speaker detected'
      );

      // Check if we should trigger a change
      if (this.state.consecutiveDifferentCount >= this.config.changeDebounceCount) {
        await this.handleSpeakerChange(newEmbedding, similarity);
      }
    }

    this.state.lastCheckTime = now;
  }

  /**
   * Handle the first speaker in a session.
   */
  private async handleNewSpeaker(embedding: number[]): Promise<void> {
    this.state.currentEmbedding = embedding;

    // Try to identify speaker
    if (this.config.enableHouseholdIdentification) {
      // Reconstruct audio from embedding is not possible,
      // so we'll use the most recent audio buffer
      // This is a limitation - in practice, you'd keep the audio

      // For now, emit unknown speaker event
      this.emitEvent('unknown_speaker', 0);

      log.info({ deviceId: this.deviceId }, 'New speaker detected (unidentified)');
    }
  }

  /**
   * Handle confirmed speaker change.
   */
  private async handleSpeakerChange(newEmbedding: number[], confidence: number): Promise<void> {
    const previousSpeakerId = this.state.currentSpeakerId;

    // Try to identify new speaker from household
    const newSpeakerId: string | null = null;
    const isNewSpeaker = true;

    // Update state
    this.state.currentEmbedding = newEmbedding;
    this.state.currentSpeakerId = newSpeakerId;
    this.state.consecutiveDifferentCount = 0;

    // Update household session
    await updateSessionSpeaker(this.deviceId, newSpeakerId, confidence);

    // Emit speaker change event
    const event: SpeakerChangeEvent = {
      type: 'speaker_changed',
      previousSpeakerId,
      currentSpeakerId: newSpeakerId,
      confidence: 1 - confidence, // Invert - lower similarity = higher confidence in change
      timestamp: new Date(),
      isNewSpeaker,
    };

    this.emit('speaker_changed', event);

    log.info(
      {
        deviceId: this.deviceId,
        previousSpeakerId,
        newSpeakerId,
        confidence: event.confidence,
      },
      'Speaker change confirmed'
    );
  }

  /**
   * Emit a speaker event.
   */
  private emitEvent(type: SpeakerChangeEvent['type'], confidence: number): void {
    const event: SpeakerChangeEvent = {
      type,
      previousSpeakerId: null,
      currentSpeakerId: this.state.currentSpeakerId,
      confidence,
      timestamp: new Date(),
      isNewSpeaker: false,
    };

    this.emit(type, event);
  }

  /**
   * Average multiple embeddings.
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    if (embeddings.length === 1) return embeddings[0];

    const result = new Array(embeddings[0].length).fill(0);

    for (const emb of embeddings) {
      for (let i = 0; i < emb.length; i++) {
        result[i] += emb[i];
      }
    }

    for (let i = 0; i < result.length; i++) {
      result[i] /= embeddings.length;
    }

    return result;
  }

  /**
   * Get current state.
   */
  getState(): {
    currentSpeakerId: string | null;
    isMonitoring: boolean;
    lastCheckTime: Date;
  } {
    return {
      currentSpeakerId: this.state.currentSpeakerId,
      isMonitoring: this.isMonitoring,
      lastCheckTime: this.state.lastCheckTime,
    };
  }

  /** Minimum change confidence (1 - similarity) for a change worth acting on. */
  getChangeConfidenceThreshold(): number {
    return this.config.changeConfidenceThreshold;
  }

  /**
   * Manually set current speaker.
   */
  setCurrentSpeaker(speakerId: string, embedding?: number[]): void {
    this.state.currentSpeakerId = speakerId;
    if (embedding) {
      this.state.currentEmbedding = embedding;
    }
    this.state.consecutiveDifferentCount = 0;

    log.info({ deviceId: this.deviceId, speakerId }, 'Current speaker manually set');
  }
}

// ============================================================================
// FACTORY & MANAGEMENT
// ============================================================================

const detectors = new Map<string, SpeakerChangeDetector>();

/**
 * Get or create a speaker change detector for a device.
 */
export function getSpeakerChangeDetector(
  deviceId: string,
  config?: Partial<SpeakerChangeConfig>
): SpeakerChangeDetector {
  let detector = detectors.get(deviceId);

  if (!detector) {
    detector = new SpeakerChangeDetector(deviceId, config);
    detectors.set(deviceId, detector);
  }

  return detector;
}

/**
 * Remove detector for a device.
 */
export function removeSpeakerChangeDetector(deviceId: string): void {
  const detector = detectors.get(deviceId);
  if (detector) {
    detector.stop();
    detectors.delete(deviceId);
  }
}

/**
 * Stop all detectors.
 */
export function stopAllDetectors(): void {
  for (const detector of detectors.values()) {
    detector.stop();
  }
  detectors.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  SpeakerChangeDetector,
  getSpeakerChangeDetector,
  removeSpeakerChangeDetector,
  stopAllDetectors,
};
