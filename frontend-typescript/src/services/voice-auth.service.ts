/**
 * Voice Authentication Service
 *
 * Frontend service for voice enrollment, verification, and continuous authentication.
 * Integrates with the backend voice auth API endpoints.
 *
 * FEATURES:
 * - Voice enrollment with guided flow
 * - Real-time audio recording
 * - Verification (1:1 matching)
 * - Identification (1:N matching)
 * - Continuous authentication during sessions
 *
 * @module VoiceAuthService
 */

import { createLogger } from '../utils/logger.js';
import { appState } from '../state/app.state.js';

const log = createLogger('VoiceAuthService');

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceAuthStatus {
  available: boolean;
  neuralEmbedding: boolean;
  method: 'neural' | 'dsp';
  features: {
    enrollment: boolean;
    verification: boolean;
    identification: boolean;
    continuousAuth: boolean;
  };
}

export interface VoiceProfile {
  enrolled: boolean;
  enrolledAt?: Date;
  qualityScore?: number;
  verificationCount?: number;
  sampleCount?: number;
  needsReEnrollment?: boolean;
}

export interface EnrollmentProgress {
  collected: number;
  required: number;
  quality: number;
  status: 'collecting' | 'processing' | 'complete' | 'failed';
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  processingTimeMs: number;
  details?: {
    threshold: number;
    similarity: number;
    method: 'neural' | 'dsp';
  };
}

export interface IdentificationResult {
  identified: boolean;
  userId?: string;
  confidence: number;
  candidates: Array<{ userId: string; similarity: number }>;
  processingTimeMs: number;
}

export interface ContinuousAuthStatus {
  status: 'verified' | 'suspicious' | 'speaker_changed' | 'unknown';
  confidence: number;
  currentUserId?: string;
  anomalyCount: number;
  message?: string;
}

// ============================================================================
// AUDIO RECORDING
// ============================================================================

/**
 * Audio recorder for voice enrollment/verification.
 */
class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private analyser: AnalyserNode | null = null;

  /**
   * Start recording audio from microphone.
   */
  async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Create AudioContext for capturing raw samples
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });

      // Create analyser for visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      // Create script processor for raw audio capture
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(this.audioContext.destination);

      this.chunks = [];

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy to avoid reference issues
        this.chunks.push(new Float32Array(inputData));
      };

      log.debug('Recording started');
    } catch (error) {
      log.error('Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording and return audio samples.
   */
  stopRecording(): Float32Array {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    // Concatenate all chunks
    const totalLength = this.chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunks = [];
    log.debug('Recording stopped', { samples: result.length });

    return result;
  }

  /**
   * Get current audio level (0-1) for visualization.
   */
  getAudioLevel(): number {
    if (!this.analyser) return 0;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] ?? 0;
    }

    return sum / dataArray.length / 255;
  }

  /**
   * Check if currently recording.
   */
  isRecording(): boolean {
    return this.stream !== null;
  }

  /**
   * Get recording duration in seconds.
   */
  getDuration(): number {
    const samples = this.chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    return samples / 16000; // 16kHz sample rate
  }
}

// ============================================================================
// VOICE AUTH SERVICE
// ============================================================================

/**
 * Voice authentication service singleton.
 */
class VoiceAuthService {
  private recorder: VoiceRecorder;
  private continuousAuthSessionId: string | null = null;

  constructor() {
    this.recorder = new VoiceRecorder();
  }

  // ==========================================================================
  // API Helpers
  // ==========================================================================

  private getUserId(): string {
    return appState.getState().deviceId;
  }

  private async fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const userId = this.getUserId();

    const response = await fetch(`/api/voice${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    return response.json();
  }

  // ==========================================================================
  // System Status
  // ==========================================================================

  /**
   * Get voice auth system status.
   */
  async getStatus(): Promise<VoiceAuthStatus> {
    try {
      const response = await this.fetchApi<{
        status: string;
        neuralEmbedding: boolean;
        method: 'neural' | 'dsp';
        features: VoiceAuthStatus['features'];
      }>('/status');

      return {
        available: response.status === 'ok',
        neuralEmbedding: response.neuralEmbedding,
        method: response.method,
        features: response.features,
      };
    } catch (error) {
      log.error('Failed to get voice auth status:', error);
      return {
        available: false,
        neuralEmbedding: false,
        method: 'dsp',
        features: {
          enrollment: false,
          verification: false,
          identification: false,
          continuousAuth: false,
        },
      };
    }
  }

  // ==========================================================================
  // Profile Management
  // ==========================================================================

  /**
   * Get user's voice profile status.
   */
  async getProfile(): Promise<VoiceProfile> {
    try {
      const response = await this.fetchApi<VoiceProfile>('/profile');
      return response;
    } catch (error) {
      log.error('Failed to get voice profile:', error);
      return { enrolled: false };
    }
  }

  /**
   * Delete user's voice profile.
   */
  async deleteProfile(): Promise<boolean> {
    try {
      await this.fetchApi('/profile', { method: 'DELETE' });
      log.info('Voice profile deleted');
      return true;
    } catch (error) {
      log.error('Failed to delete voice profile:', error);
      return false;
    }
  }

  // ==========================================================================
  // Enrollment
  // ==========================================================================

  /**
   * Start enrollment session.
   */
  async startEnrollment(requiredSamples = 5): Promise<{
    success: boolean;
    sessionId?: string;
    requiredSamples?: number;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await this.fetchApi<{
        success: boolean;
        sessionId: string;
        requiredSamples: number;
        message: string;
      }>('/enroll/start', {
        method: 'POST',
        body: JSON.stringify({ requiredSamples }),
      });

      log.info('Enrollment session started', { sessionId: response.sessionId });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to start enrollment:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Record and submit an enrollment sample.
   *
   * @param durationSeconds - Recording duration (default 3 seconds)
   * @param onProgress - Callback for recording progress updates
   */
  async recordEnrollmentSample(
    durationSeconds = 3,
    onProgress?: (elapsed: number, level: number) => void
  ): Promise<{
    success: boolean;
    progress?: EnrollmentProgress;
    message?: string;
    error?: string;
  }> {
    try {
      // Start recording
      await this.recorder.startRecording();

      // Record for specified duration with progress updates
      const startTime = Date.now();
      const durationMs = durationSeconds * 1000;

      await new Promise<void>((resolve) => {
        const updateProgress = () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const level = this.recorder.getAudioLevel();

          if (onProgress) {
            onProgress(elapsed, level);
          }

          if (elapsed < durationSeconds) {
            requestAnimationFrame(updateProgress);
          } else {
            resolve();
          }
        };
        updateProgress();
      });

      // Stop and get samples
      const samples = this.recorder.stopRecording();

      // Submit to API
      const response = await this.fetchApi<{
        success: boolean;
        message: string;
        progress: EnrollmentProgress;
      }>('/enroll/sample', {
        method: 'POST',
        body: JSON.stringify({
          samples: Array.from(samples),
          deviceType: this.getDeviceType(),
        }),
      });

      log.info('Enrollment sample submitted', { progress: response.progress });
      return {
        success: response.success,
        progress: response.progress,
        message: response.message,
      };
    } catch (error) {
      // Ensure recording is stopped
      if (this.recorder.isRecording()) {
        this.recorder.stopRecording();
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to record enrollment sample:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Complete enrollment and create voice profile.
   */
  async completeEnrollment(displayName?: string): Promise<{
    success: boolean;
    profile?: {
      userId: string;
      displayName?: string;
      qualityScore: number;
      threshold: number;
      sampleCount: number;
    };
    error?: string;
  }> {
    try {
      const response = await this.fetchApi<{
        success: boolean;
        message: string;
        profile: {
          userId: string;
          displayName?: string;
          qualityScore: number;
          threshold: number;
          sampleCount: number;
        };
      }>('/enroll/complete', {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      });

      log.info('Enrollment completed', { profile: response.profile });
      return {
        success: response.success,
        profile: response.profile,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to complete enrollment:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Cancel enrollment session.
   */
  async cancelEnrollment(): Promise<void> {
    try {
      await this.fetchApi('/enroll/cancel', { method: 'POST' });
      log.info('Enrollment cancelled');
    } catch (error) {
      log.warn('Failed to cancel enrollment:', error);
    }
  }

  // ==========================================================================
  // Verification
  // ==========================================================================

  /**
   * Record and verify voice against enrolled profile.
   */
  async verify(
    durationSeconds = 2,
    onProgress?: (elapsed: number, level: number) => void
  ): Promise<VerificationResult> {
    try {
      // Record audio
      await this.recorder.startRecording();

      const startTime = Date.now();
      await new Promise<void>((resolve) => {
        const updateProgress = () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const level = this.recorder.getAudioLevel();
          if (onProgress) onProgress(elapsed, level);

          if (elapsed < durationSeconds) {
            requestAnimationFrame(updateProgress);
          } else {
            resolve();
          }
        };
        updateProgress();
      });

      const samples = this.recorder.stopRecording();

      // Verify
      const response = await this.fetchApi<VerificationResult>('/verify', {
        method: 'POST',
        body: JSON.stringify({
          samples: Array.from(samples),
        }),
      });

      log.info('Verification result', {
        verified: response.verified,
        confidence: response.confidence,
      });

      return response;
    } catch (error) {
      if (this.recorder.isRecording()) {
        this.recorder.stopRecording();
      }
      log.error('Verification failed:', error);
      return {
        verified: false,
        confidence: 0,
        processingTimeMs: 0,
      };
    }
  }

  // ==========================================================================
  // Identification
  // ==========================================================================

  /**
   * Record and identify speaker from enrolled users.
   */
  async identify(
    durationSeconds = 2,
    onProgress?: (elapsed: number, level: number) => void
  ): Promise<IdentificationResult> {
    try {
      // Record audio
      await this.recorder.startRecording();

      const startTime = Date.now();
      await new Promise<void>((resolve) => {
        const updateProgress = () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const level = this.recorder.getAudioLevel();
          if (onProgress) onProgress(elapsed, level);

          if (elapsed < durationSeconds) {
            requestAnimationFrame(updateProgress);
          } else {
            resolve();
          }
        };
        updateProgress();
      });

      const samples = this.recorder.stopRecording();

      // Identify
      const response = await this.fetchApi<IdentificationResult>('/identify', {
        method: 'POST',
        body: JSON.stringify({
          samples: Array.from(samples),
        }),
      });

      log.info('Identification result', {
        identified: response.identified,
        userId: response.userId,
      });

      return response;
    } catch (error) {
      if (this.recorder.isRecording()) {
        this.recorder.stopRecording();
      }
      log.error('Identification failed:', error);
      return {
        identified: false,
        confidence: 0,
        candidates: [],
        processingTimeMs: 0,
      };
    }
  }

  // ==========================================================================
  // Continuous Authentication
  // ==========================================================================

  /**
   * Start continuous authentication session.
   */
  async startContinuousAuth(): Promise<boolean> {
    try {
      const response = await this.fetchApi<{
        success: boolean;
        sessionId: string;
      }>('/auth/start', {
        method: 'POST',
      });

      this.continuousAuthSessionId = response.sessionId;
      log.info('Continuous auth started', { sessionId: response.sessionId });
      return true;
    } catch (error) {
      log.error('Failed to start continuous auth:', error);
      return false;
    }
  }

  /**
   * Check continuous auth with audio chunk.
   */
  async checkContinuousAuth(samples: Float32Array): Promise<ContinuousAuthStatus | null> {
    if (!this.continuousAuthSessionId) {
      return null;
    }

    try {
      const response = await this.fetchApi<ContinuousAuthStatus>('/auth/check', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: this.continuousAuthSessionId,
          samples: Array.from(samples),
        }),
      });

      return response;
    } catch (error) {
      log.warn('Continuous auth check failed:', error);
      return null;
    }
  }

  /**
   * Stop continuous authentication.
   */
  async stopContinuousAuth(): Promise<void> {
    if (!this.continuousAuthSessionId) return;

    try {
      await this.fetchApi('/auth/stop', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: this.continuousAuthSessionId,
        }),
      });
      log.info('Continuous auth stopped');
    } catch (error) {
      log.warn('Failed to stop continuous auth:', error);
    } finally {
      this.continuousAuthSessionId = null;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Mac/i.test(ua)) return 'mac';
    if (/Windows/i.test(ua)) return 'windows';
    return 'unknown';
  }

  /**
   * Get the voice recorder for custom recording scenarios.
   */
  getRecorder(): VoiceRecorder {
    return this.recorder;
  }

  // ==========================================================================
  // Re-enrollment Check
  // ==========================================================================

  /**
   * Check if the user needs to re-enroll (low quality voice profile).
   * Returns true if re-enrollment is recommended.
   *
   * Quality thresholds:
   * - < 50%: Strong recommendation to re-enroll
   * - < 70%: Gentle suggestion to re-enroll
   * - >= 70%: Good quality, no action needed
   */
  async checkReEnrollmentNeeded(): Promise<{
    needed: boolean;
    severity: 'none' | 'low' | 'high';
    qualityScore?: number;
    message?: string;
  }> {
    try {
      const profile = await this.getProfile();

      if (!profile.enrolled) {
        return { needed: false, severity: 'none' };
      }

      const quality = profile.qualityScore ?? 0;

      if (quality < 0.5) {
        return {
          needed: true,
          severity: 'high',
          qualityScore: quality,
          message: "Your voice profile quality is low. Re-enrolling will help me recognize you better.",
        };
      }

      if (quality < 0.7) {
        return {
          needed: true,
          severity: 'low',
          qualityScore: quality,
          message: "Your voice profile could be improved. Consider re-enrolling for better recognition.",
        };
      }

      return { needed: false, severity: 'none', qualityScore: quality };
    } catch (error) {
      log.error('Failed to check re-enrollment:', error);
      return { needed: false, severity: 'none' };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let voiceAuthServiceInstance: VoiceAuthService | null = null;

export function getVoiceAuthService(): VoiceAuthService {
  if (!voiceAuthServiceInstance) {
    voiceAuthServiceInstance = new VoiceAuthService();
  }
  return voiceAuthServiceInstance;
}

export const voiceAuth = getVoiceAuthService();

// Expose on window for debugging
if (typeof window !== 'undefined') {
  (window as unknown as { ferniVoiceAuth: VoiceAuthService }).ferniVoiceAuth = voiceAuth;
}

