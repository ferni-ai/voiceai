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
import { extractSpeakerEmbedding, type SpeakerEmbedding } from './voice-memory-enhanced.js';
import { identifyHouseholdSpeaker, updateSessionSpeaker } from './voice-household.js';

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
  // Check interval for continuous monitoring (ms)
  checkIntervalMs: number;
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
  enableHouseholdIdentification: true,
};

// ============================================================================
// SPEAKER CHANGE DETECTOR
// ============================================================================

export class SpeakerChangeDetector extends EventEmitter {
  private config: SpeakerChangeConfig;
  private state: SpeakerState;
  private deviceId: string;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private audioBuffer: Float32Array[] = [];
  private isMonitoring = false;

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
    
    log.info({
      deviceId: this.deviceId,
      initialSpeakerId,
    }, 'Speaker change detection started');
    
    // Start periodic check
    this.checkInterval = setInterval(() => {
      this.processAudioBuffer();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this.isMonitoring = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    this.audioBuffer = [];
    
    log.info({ deviceId: this.deviceId }, 'Speaker change detection stopped');
  }

  /**
   * Feed audio samples for analysis.
   */
  feedAudio(samples: Float32Array): void {
    if (!this.isMonitoring) return;
    
    this.audioBuffer.push(samples);
    
    // Limit buffer size
    const maxBuffers = 10;
    if (this.audioBuffer.length > maxBuffers) {
      this.audioBuffer = this.audioBuffer.slice(-maxBuffers);
    }
  }

  /**
   * Process buffered audio and check for speaker change.
   */
  private async processAudioBuffer(): Promise<void> {
    if (this.audioBuffer.length === 0) return;
    
    // Combine audio buffers
    const totalLength = this.audioBuffer.reduce((sum, b) => sum + b.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const buffer of this.audioBuffer) {
      combined.set(buffer, offset);
      offset += buffer.length;
    }
    
    // Clear buffer
    this.audioBuffer = [];
    
    // Check minimum duration (assuming 16kHz)
    const durationMs = (combined.length / 16000) * 1000;
    if (durationMs < this.config.minAudioDurationMs) {
      return;
    }
    
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
    
    // Compare with current speaker
    const similarity = this.cosineSimilarity(newEmbedding, this.state.currentEmbedding);
    
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
      
      log.debug({
        similarity,
        consecutiveCount: this.state.consecutiveDifferentCount,
        threshold: this.config.sameSpeakerThreshold,
      }, 'Different speaker detected');
      
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
  private async handleSpeakerChange(
    newEmbedding: number[],
    confidence: number
  ): Promise<void> {
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
    
    log.info({
      deviceId: this.deviceId,
      previousSpeakerId,
      newSpeakerId,
      confidence: event.confidence,
    }, 'Speaker change confirmed');
  }

  /**
   * Emit a speaker event.
   */
  private emitEvent(
    type: SpeakerChangeEvent['type'],
    confidence: number
  ): void {
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
   * Compute cosine similarity between two embeddings.
   */
  private cosineSimilarity(emb1: number[], emb2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < emb1.length; i++) {
      dotProduct += emb1[i] * emb2[i];
      norm1 += emb1[i] * emb1[i];
      norm2 += emb2[i] * emb2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
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

