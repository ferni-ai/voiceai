/**
 * Continuous voice authentication during a session (split from
 * voice-enrollment.ts, which re-exports it).
 *
 * Fails closed: a chunk with no usable voice print (extraction failed, no
 * neural model, or a profile not enrolled with it; see voice-match-trust)
 * yields status 'unknown' with confidence 0. It never repeats the previous
 * status, so a stale 'verified' cannot outlive the evidence for it.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { cosineSimilarity } from '../../memory/rust-accelerator.js';
import { extractSpeakerEmbedding } from '../voice-memory-enhanced.js';
import { voiceMatchRefusal } from './voice-match-trust.js';
import type { AuthStatus, VoiceProfile } from './voice-enrollment.js';

const log = getLogger().child({ module: 'VoiceContinuousAuth' });

/** Anomaly count before triggering speaker change */
const SPEAKER_CHANGE_THRESHOLD = 3;

/**
 * Continuous authenticator for ongoing verification during a session.
 */
export class ContinuousAuthenticator {
  private profile: VoiceProfile;
  private recentEmbeddings: Float32Array[] = [];
  private anomalyCount = 0;
  private lastStatus: AuthStatus;

  constructor(profile: VoiceProfile) {
    this.profile = profile;
    this.lastStatus = {
      status: 'unknown',
      confidence: 0,
      currentUserId: profile.userId,
      anomalyCount: 0,
    };
  }

  /**
   * Process an audio chunk and update authentication status.
   */
  async processAudioChunk(audio: Float32Array): Promise<AuthStatus> {
    // No usable voice print this chunk means unknown, never the last status
    const unknown = (message: string): AuthStatus => {
      this.lastStatus = {
        status: 'unknown',
        confidence: 0,
        currentUserId: this.profile.userId,
        anomalyCount: this.anomalyCount,
        message,
      };
      return this.lastStatus;
    };
    try {
      const embedding = await extractSpeakerEmbedding(audio);
      if (!embedding) return unknown('No voice embedding for this audio');
      const refusal = voiceMatchRefusal(embedding.method, this.profile.embeddingMethod);
      if (refusal) return unknown(refusal);

      const similarity = cosineSimilarity(Array.from(embedding.vector), this.profile.centroid);

      // Track recent embeddings for consistency
      this.recentEmbeddings.push(embedding.vector);
      if (this.recentEmbeddings.length > 10) {
        this.recentEmbeddings.shift();
      }

      // Detect anomalies
      if (similarity < this.profile.threshold * 0.9) {
        this.anomalyCount++;

        if (this.anomalyCount >= SPEAKER_CHANGE_THRESHOLD) {
          this.lastStatus = {
            status: 'speaker_changed',
            confidence: similarity,
            currentUserId: this.profile.userId,
            anomalyCount: this.anomalyCount,
            message: 'Different speaker detected',
          };
        } else {
          this.lastStatus = {
            status: 'suspicious',
            confidence: similarity,
            currentUserId: this.profile.userId,
            anomalyCount: this.anomalyCount,
            message: 'Voice inconsistency detected',
          };
        }
      } else {
        // Reset anomaly count on good match
        this.anomalyCount = Math.max(0, this.anomalyCount - 1);

        this.lastStatus = {
          status: 'verified',
          confidence: similarity,
          currentUserId: this.profile.userId,
          anomalyCount: this.anomalyCount,
        };
      }

      return this.lastStatus;
    } catch (error) {
      log.error({ error }, 'Continuous auth processing failed');
      return unknown('Continuous auth processing failed');
    }
  }

  /**
   * Get current authentication status.
   */
  getStatus(): AuthStatus {
    return this.lastStatus;
  }

  /**
   * Reset the authenticator state.
   */
  reset(): void {
    this.recentEmbeddings = [];
    this.anomalyCount = 0;
    this.lastStatus = {
      status: 'unknown',
      confidence: 0,
      currentUserId: this.profile.userId,
      anomalyCount: 0,
    };
  }
}
