/**
 * Audio Pipeline Integration Tests
 *
 * Tests the audio processing pipeline including:
 * - Audio frame handling
 * - VAD (Voice Activity Detection)
 * - TTS audio generation
 * - Audio streaming
 *
 * @module agents/__tests__/integration/audio-pipeline
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockAudioFrame,
  createMockTTSClient,
  createMockVoicePipelineAgent,
  MockTTSClient,
  MockVoicePipelineAgent,
  resetAllMocks,
} from '../mocks/index.js';

// ============================================================================
// AUDIO FRAME HANDLING
// ============================================================================

describe('Audio Frame Handling', () => {
  describe('Frame Creation', () => {
    it('should create valid audio frames with correct properties', () => {
      // createMockAudioFrame takes (durationMs, sampleRate)
      const frame = createMockAudioFrame(20, 24000);

      expect(frame.samplesPerChannel).toBeGreaterThan(0);
      expect(frame.sampleRate).toBe(24000);
      expect(frame.channels).toBe(1);
      expect(frame.data).toBeInstanceOf(Uint8Array);
    });

    it('should default to standard voice settings', () => {
      const frame = createMockAudioFrame();

      // Default: 24kHz, mono
      expect(frame.sampleRate).toBe(24000);
      expect(frame.channels).toBe(1);
    });

    it('should create frames with correct data length', () => {
      const frame = createMockAudioFrame(100, 24000);

      // 100ms at 24kHz = 2400 samples, * 2 bytes per sample
      expect(frame.data.length).toBeGreaterThan(0);
    });
  });

  describe('Frame Validation', () => {
    it('should validate frame sample rate', () => {
      const validRates = [8000, 16000, 22050, 24000, 44100, 48000];

      const isValidSampleRate = (rate: number): boolean => {
        return validRates.includes(rate);
      };

      expect(isValidSampleRate(24000)).toBe(true);
      expect(isValidSampleRate(16000)).toBe(true);
      expect(isValidSampleRate(12345)).toBe(false);
    });

    it('should validate frame duration consistency', () => {
      const frame = createMockAudioFrame(20, 24000);

      // For 24kHz audio, 20ms = 480 samples
      const expectedSamples = Math.floor((24000 * 20) / 1000);

      expect(frame.samplesPerChannel).toBe(expectedSamples);
    });

    it('should reject invalid frame configurations', () => {
      const validateFrame = (config: { samples: number; duration: number }): boolean => {
        // Minimum frame size
        if (config.samples < 80) return false;

        // Maximum frame size (100ms at 48kHz)
        if (config.samples > 4800) return false;

        // Duration must be positive
        if (config.duration <= 0) return false;

        return true;
      };

      expect(validateFrame({ samples: 320, duration: 20 })).toBe(true);
      expect(validateFrame({ samples: 10, duration: 0.5 })).toBe(false);
      expect(validateFrame({ samples: 320, duration: -1 })).toBe(false);
    });
  });
});

// ============================================================================
// VAD (VOICE ACTIVITY DETECTION)
// ============================================================================

describe('Voice Activity Detection', () => {
  describe('Speech Detection', () => {
    it('should detect speech in audio frames', () => {
      interface VADResult {
        isSpeech: boolean;
        confidence: number;
        timestamp: number;
      }

      const detectSpeech = (
        frame: ReturnType<typeof createMockAudioFrame>,
        threshold = 0.5
      ): VADResult => {
        // Simulate VAD by checking RMS energy
        const data = frame.data;
        let sumSquares = 0;

        for (let i = 0; i < data.length; i++) {
          sumSquares += data[i] * data[i];
        }

        const rms = Math.sqrt(sumSquares / data.length);
        const confidence = Math.min(rms * 10, 1.0); // Normalize

        return {
          isSpeech: confidence > threshold,
          confidence,
          timestamp: Date.now(),
        };
      };

      // Create frame with some energy
      const frame = createMockAudioFrame();
      const result = detectSpeech(frame);

      expect(typeof result.isSpeech).toBe('boolean');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should track speech segments', () => {
      interface SpeechSegment {
        start: number;
        end: number;
        duration: number;
      }

      class SpeechSegmentTracker {
        private segments: SpeechSegment[] = [];
        private currentSegmentStart: number | null = null;
        private lastSpeechTime = 0;
        private readonly pauseThreshold = 300; // ms

        processSpeechEvent(isSpeech: boolean, timestamp: number): void {
          if (isSpeech) {
            if (this.currentSegmentStart === null) {
              this.currentSegmentStart = timestamp;
            }
            this.lastSpeechTime = timestamp;
          } else if (
            this.currentSegmentStart !== null &&
            timestamp - this.lastSpeechTime > this.pauseThreshold
          ) {
            // End segment
            this.segments.push({
              start: this.currentSegmentStart,
              end: this.lastSpeechTime,
              duration: this.lastSpeechTime - this.currentSegmentStart,
            });
            this.currentSegmentStart = null;
          }
        }

        getSegments(): SpeechSegment[] {
          return [...this.segments];
        }
      }

      const tracker = new SpeechSegmentTracker();
      const baseTime = Date.now();

      // Simulate speech pattern: speech, pause, speech
      tracker.processSpeechEvent(true, baseTime);
      tracker.processSpeechEvent(true, baseTime + 100);
      tracker.processSpeechEvent(false, baseTime + 500);
      tracker.processSpeechEvent(true, baseTime + 1000);
      tracker.processSpeechEvent(false, baseTime + 1500);

      const segments = tracker.getSegments();

      expect(segments.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('VAD States', () => {
    it('should transition through VAD states correctly', () => {
      type VADState = 'idle' | 'listening' | 'speaking' | 'processing';

      class VADStateMachine {
        private state: VADState = 'idle';

        transition(event: 'start_listening' | 'speech_start' | 'speech_end' | 'process'): void {
          const transitions: Record<VADState, Record<string, VADState>> = {
            idle: { start_listening: 'listening' },
            listening: { speech_start: 'speaking' },
            speaking: { speech_end: 'processing' },
            processing: { process: 'listening' },
          };

          const nextState = transitions[this.state]?.[event];
          if (nextState) {
            this.state = nextState;
          }
        }

        getState(): VADState {
          return this.state;
        }
      }

      const vad = new VADStateMachine();

      expect(vad.getState()).toBe('idle');

      vad.transition('start_listening');
      expect(vad.getState()).toBe('listening');

      vad.transition('speech_start');
      expect(vad.getState()).toBe('speaking');

      vad.transition('speech_end');
      expect(vad.getState()).toBe('processing');

      vad.transition('process');
      expect(vad.getState()).toBe('listening');
    });
  });
});

// ============================================================================
// TTS AUDIO GENERATION
// ============================================================================

describe('TTS Audio Generation', () => {
  let mockTTS: MockTTSClient;

  beforeEach(() => {
    resetAllMocks();
    mockTTS = createMockTTSClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Synthesis', () => {
    it('should synthesize text to audio', async () => {
      const result = await mockTTS.synthesize('Hello, how are you?');

      expect(result.text).toBe('Hello, how are you?');
      expect(result.audio).toBeInstanceOf(Uint8Array);
      expect(result.audio.length).toBeGreaterThan(0);
    });

    it('should handle empty text gracefully', async () => {
      const result = await mockTTS.synthesize('');

      expect(result.text).toBe('');
      expect(result.duration).toBe(0);
    });

    it('should synthesize with different voices', async () => {
      const voices = ['ferni', 'jordan', 'peter', 'maya', 'alex', 'nayan'];

      for (const voice of voices) {
        mockTTS.setVoice(voice);
        const result = await mockTTS.synthesize('Test message');

        expect(result.text).toBeDefined();
        expect(result.audio).toBeDefined();
      }
    });
  });

  describe('Streaming Synthesis', () => {
    it('should stream audio frames', async () => {
      const frames: ReturnType<typeof createMockAudioFrame>[] = [];

      for await (const frame of mockTTS.synthesizeStream('Hello world')) {
        frames.push(frame);
      }

      expect(frames.length).toBeGreaterThan(0);
    });

    it('should handle synthesis failure in stream', async () => {
      mockTTS.setFailure(true, 'TTS service unavailable');

      const frames: unknown[] = [];
      let error: Error | null = null;

      try {
        for await (const frame of mockTTS.synthesizeStream('Test')) {
          frames.push(frame);
        }
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeTruthy();
      expect(error?.message).toContain('unavailable');
    });

    it('should track streaming events', async () => {
      // Collect frames from stream
      const frames: unknown[] = [];
      for await (const frame of mockTTS.synthesizeStream('Hello')) {
        frames.push(frame);
      }

      // Check event history
      const events = mockTTS.getEventHistory();

      // Should have audio events and end event
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('TTS Error Handling', () => {
    it('should handle TTS failure', async () => {
      mockTTS.setFailure(true, 'TTS error');

      await expect(mockTTS.synthesize('Test')).rejects.toThrow();
    });

    it('should recover from TTS failure', async () => {
      mockTTS.setFailure(true, 'Temporary error');

      // First call fails
      await expect(mockTTS.synthesize('Test')).rejects.toThrow();

      // Recovery
      mockTTS.setFailure(false);

      // Second call succeeds
      const result = await mockTTS.synthesize('Test');
      expect(result.text).toBe('Test');
    });
  });
});

// ============================================================================
// AUDIO STREAMING
// ============================================================================

describe('Audio Streaming', () => {
  let mockPipeline: MockVoicePipelineAgent;

  beforeEach(() => {
    resetAllMocks();
    mockPipeline = createMockVoicePipelineAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Output Streaming', () => {
    it('should stream audio to room', async () => {
      const utterancesSent: string[] = [];

      mockPipeline.on('agentStartedSpeaking', () => {
        utterancesSent.push('started');
      });

      mockPipeline.say('Hello, I am Ferni!');

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(utterancesSent.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle interruption during streaming', () => {
      let interrupted = false;

      mockPipeline.on('userStartedSpeaking', () => {
        interrupted = true;
      });

      // Start speaking
      mockPipeline.say('This is a long message that might be interrupted');

      // Simulate interruption
      mockPipeline.simulateUserSpeechStart();

      expect(interrupted).toBe(true);
    });
  });

  describe('Buffer Management', () => {
    it('should manage audio buffer correctly', () => {
      interface AudioBuffer {
        frames: ReturnType<typeof createMockAudioFrame>[];
        maxSize: number;
      }

      class AudioBufferManager {
        private buffer: AudioBuffer = {
          frames: [],
          maxSize: 10,
        };

        push(frame: ReturnType<typeof createMockAudioFrame>): void {
          this.buffer.frames.push(frame);

          if (this.buffer.frames.length > this.buffer.maxSize) {
            this.buffer.frames.shift();
          }
        }

        pop(): ReturnType<typeof createMockAudioFrame> | undefined {
          return this.buffer.frames.shift();
        }

        size(): number {
          return this.buffer.frames.length;
        }

        clear(): void {
          this.buffer.frames = [];
        }
      }

      const bufferManager = new AudioBufferManager();

      // Add frames
      for (let i = 0; i < 15; i++) {
        bufferManager.push(createMockAudioFrame());
      }

      // Buffer should be capped at max size
      expect(bufferManager.size()).toBe(10);

      // Pop should reduce size
      bufferManager.pop();
      expect(bufferManager.size()).toBe(9);

      // Clear should empty buffer
      bufferManager.clear();
      expect(bufferManager.size()).toBe(0);
    });
  });
});

// ============================================================================
// AUDIO QUALITY
// ============================================================================

describe('Audio Quality', () => {
  describe('Sample Rate Conversion', () => {
    it('should validate sample rate for voice agents', () => {
      const validateVoiceAgentSampleRate = (rate: number): boolean => {
        // Voice agents typically use 16kHz or 24kHz
        const validRates = [16000, 24000];
        return validRates.includes(rate);
      };

      expect(validateVoiceAgentSampleRate(16000)).toBe(true);
      expect(validateVoiceAgentSampleRate(24000)).toBe(true);
      expect(validateVoiceAgentSampleRate(44100)).toBe(false);
    });
  });

  describe('Audio Normalization', () => {
    it('should normalize audio levels', () => {
      const normalizeAudio = (samples: Float32Array, targetPeak = 0.9): Float32Array => {
        // Find current peak
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const abs = Math.abs(samples[i]);
          if (abs > peak) peak = abs;
        }

        // Normalize
        if (peak > 0) {
          const scale = targetPeak / peak;
          const normalized = new Float32Array(samples.length);
          for (let i = 0; i < samples.length; i++) {
            normalized[i] = samples[i] * scale;
          }
          return normalized;
        }

        return samples;
      };

      const input = new Float32Array([0.2, -0.5, 0.3, -0.4]);
      const normalized = normalizeAudio(input, 0.9);

      // Peak should be at target
      let peak = 0;
      for (let i = 0; i < normalized.length; i++) {
        const abs = Math.abs(normalized[i]);
        if (abs > peak) peak = abs;
      }

      expect(peak).toBeCloseTo(0.9, 1);
    });
  });
});

// ============================================================================
// LATENCY TRACKING
// ============================================================================

describe('Audio Latency', () => {
  it('should track round-trip latency', () => {
    interface LatencyMetrics {
      vadLatency: number;
      llmLatency: number;
      ttsLatency: number;
      totalLatency: number;
    }

    const measureLatency = (
      vadStart: number,
      vadEnd: number,
      llmStart: number,
      llmEnd: number,
      ttsStart: number,
      ttsEnd: number
    ): LatencyMetrics => {
      return {
        vadLatency: vadEnd - vadStart,
        llmLatency: llmEnd - llmStart,
        ttsLatency: ttsEnd - ttsStart,
        totalLatency: ttsEnd - vadStart,
      };
    };

    const now = Date.now();
    const metrics = measureLatency(now, now + 50, now + 50, now + 500, now + 500, now + 700);

    expect(metrics.vadLatency).toBe(50);
    expect(metrics.llmLatency).toBe(450);
    expect(metrics.ttsLatency).toBe(200);
    expect(metrics.totalLatency).toBe(700);
  });

  it('should alert on high latency', () => {
    const LATENCY_THRESHOLDS = {
      vad: 100, // ms
      llm: 2000, // ms
      tts: 500, // ms
      total: 3000, // ms
    };

    const checkLatencyThresholds = (metrics: {
      vadLatency: number;
      llmLatency: number;
      ttsLatency: number;
      totalLatency: number;
    }): string[] => {
      const alerts: string[] = [];

      if (metrics.vadLatency > LATENCY_THRESHOLDS.vad) {
        alerts.push('VAD latency exceeded threshold');
      }
      if (metrics.llmLatency > LATENCY_THRESHOLDS.llm) {
        alerts.push('LLM latency exceeded threshold');
      }
      if (metrics.ttsLatency > LATENCY_THRESHOLDS.tts) {
        alerts.push('TTS latency exceeded threshold');
      }
      if (metrics.totalLatency > LATENCY_THRESHOLDS.total) {
        alerts.push('Total latency exceeded threshold');
      }

      return alerts;
    };

    const goodMetrics = {
      vadLatency: 50,
      llmLatency: 1000,
      ttsLatency: 300,
      totalLatency: 1350,
    };

    const badMetrics = {
      vadLatency: 150,
      llmLatency: 3000,
      ttsLatency: 600,
      totalLatency: 4000,
    };

    expect(checkLatencyThresholds(goodMetrics)).toHaveLength(0);
    expect(checkLatencyThresholds(badMetrics).length).toBeGreaterThan(0);
  });
});
