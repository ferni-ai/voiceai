/**
 * TTS Mock Infrastructure
 *
 * Comprehensive mocks for Text-to-Speech components used in voice agent testing.
 * Supports:
 * - Cartesia TTS mocking
 * - Audio frame generation
 * - Streaming synthesis
 * - Voice characteristic simulation
 *
 * @module agents/__tests__/mocks/tts-mock
 */

import { vi } from 'vitest';

// ============================================================================
// TYPES
// ============================================================================

export interface MockTTSOptions {
  /** Voice ID to use */
  voiceId?: string;
  /** Default speaking rate */
  speakingRate?: number;
  /** Should fail on synthesis */
  shouldFail?: boolean;
  /** Error message if failing */
  errorMessage?: string;
  /** Simulated audio duration per character (ms) */
  msPerCharacter?: number;
}

export interface MockAudioFrame {
  data: Uint8Array;
  sampleRate: number;
  channels: number;
  samplesPerChannel: number;
}

export interface MockSynthesisResult {
  audio: Uint8Array;
  duration: number;
  text: string;
}

export interface MockTTSEvent {
  type: 'start' | 'audio' | 'end' | 'error';
  timestamp: number;
  text?: string;
  audio?: MockAudioFrame;
  error?: Error;
}

// ============================================================================
// MOCK AUDIO FRAME FACTORY
// ============================================================================

/**
 * Create a mock audio frame
 */
export function createMockAudioFrame(durationMs = 100, sampleRate = 24000): MockAudioFrame {
  const samplesPerChannel = Math.floor((sampleRate * durationMs) / 1000);
  const channels = 1;

  // Create simple sine wave data for testing
  const data = new Uint8Array(samplesPerChannel * channels * 2);
  for (let i = 0; i < data.length; i += 2) {
    const sample = Math.sin((i / data.length) * Math.PI * 2 * 440) * 32767;
    data[i] = sample & 0xff;
    data[i + 1] = (sample >> 8) & 0xff;
  }

  return {
    data,
    sampleRate,
    channels,
    samplesPerChannel,
  };
}

/**
 * Create multiple audio frames for streaming
 */
export function createMockAudioFrames(
  text: string,
  options: { frameSize?: number; msPerCharacter?: number } = {}
): MockAudioFrame[] {
  const { frameSize = 100, msPerCharacter = 50 } = options;
  const totalDuration = text.length * msPerCharacter;
  const frameCount = Math.ceil(totalDuration / frameSize);

  const frames: MockAudioFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(createMockAudioFrame(frameSize));
  }

  return frames;
}

// ============================================================================
// MOCK TTS CLIENT
// ============================================================================

/**
 * Mock TTS client with configurable behavior
 */
export class MockTTSClient {
  private options: MockTTSOptions;
  private synthesisHistory: MockSynthesisResult[] = [];
  private eventHistory: MockTTSEvent[] = [];

  constructor(options: MockTTSOptions = {}) {
    this.options = {
      voiceId: 'mock-voice-id',
      speakingRate: 1.0,
      shouldFail: false,
      msPerCharacter: 50,
      ...options,
    };
  }

  /**
   * Synthesize text to audio (non-streaming)
   */
  async synthesize(text: string): Promise<MockSynthesisResult> {
    if (this.options.shouldFail) {
      const error = new Error(this.options.errorMessage || 'TTS synthesis failed');
      this.eventHistory.push({ type: 'error', timestamp: Date.now(), error });
      throw error;
    }

    this.eventHistory.push({ type: 'start', timestamp: Date.now(), text });

    // Simulate synthesis time
    const duration = (text.length * this.options.msPerCharacter!) / 1000;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });

    const frames = createMockAudioFrames(text, {
      msPerCharacter: this.options.msPerCharacter,
    });

    // Combine frames into single audio buffer
    const totalSize = frames.reduce((sum, f) => sum + f.data.length, 0);
    const audio = new Uint8Array(totalSize);
    let offset = 0;
    for (const frame of frames) {
      audio.set(frame.data, offset);
      offset += frame.data.length;
    }

    const result: MockSynthesisResult = { audio, duration, text };
    this.synthesisHistory.push(result);

    this.eventHistory.push({ type: 'end', timestamp: Date.now(), text });

    return result;
  }

  /**
   * Synthesize text to audio (streaming)
   */
  async *synthesizeStream(text: string): AsyncGenerator<MockAudioFrame> {
    if (this.options.shouldFail) {
      const error = new Error(this.options.errorMessage || 'TTS synthesis failed');
      this.eventHistory.push({ type: 'error', timestamp: Date.now(), error });
      throw error;
    }

    this.eventHistory.push({ type: 'start', timestamp: Date.now(), text });

    const frames = createMockAudioFrames(text, {
      msPerCharacter: this.options.msPerCharacter,
    });

    for (const frame of frames) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
      this.eventHistory.push({ type: 'audio', timestamp: Date.now(), audio: frame });
      yield frame;
    }

    this.eventHistory.push({ type: 'end', timestamp: Date.now(), text });
  }

  /**
   * Get synthesis history for assertions
   */
  getSynthesisHistory(): MockSynthesisResult[] {
    return [...this.synthesisHistory];
  }

  /**
   * Get event history for assertions
   */
  getEventHistory(): MockTTSEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Get last synthesis for assertions
   */
  getLastSynthesis(): MockSynthesisResult | undefined {
    return this.synthesisHistory[this.synthesisHistory.length - 1];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.synthesisHistory = [];
    this.eventHistory = [];
  }

  /**
   * Set failure mode
   */
  setFailure(shouldFail: boolean, errorMessage?: string): void {
    this.options.shouldFail = shouldFail;
    if (errorMessage) {
      this.options.errorMessage = errorMessage;
    }
  }

  /**
   * Set voice options
   */
  setVoice(voiceId: string, speakingRate?: number): void {
    this.options.voiceId = voiceId;
    if (speakingRate !== undefined) {
      this.options.speakingRate = speakingRate;
    }
  }
}

/**
 * Create a mock TTS client
 */
export function createMockTTSClient(options?: MockTTSOptions): MockTTSClient {
  return new MockTTSClient(options);
}

// ============================================================================
// CARTESIA TTS MOCK
// ============================================================================

/**
 * Mock Cartesia TTS implementation
 */
export class MockCartesiaTTS {
  private client: MockTTSClient;
  private voiceId: string;

  constructor(voiceId = 'mock-cartesia-voice') {
    this.voiceId = voiceId;
    this.client = new MockTTSClient({ voiceId });
  }

  async synthesize(
    text: string,
    options?: { emotion?: string; speed?: number }
  ): Promise<{ audio: Uint8Array; duration: number }> {
    if (options?.speed) {
      this.client.setVoice(this.voiceId, options.speed);
    }
    const result = await this.client.synthesize(text);
    return { audio: result.audio, duration: result.duration };
  }

  async *stream(
    text: string,
    options?: { emotion?: string; speed?: number }
  ): AsyncGenerator<Uint8Array> {
    for await (const frame of this.client.synthesizeStream(text)) {
      yield frame.data;
    }
  }

  getHistory(): MockSynthesisResult[] {
    return this.client.getSynthesisHistory();
  }

  clearHistory(): void {
    this.client.clearHistory();
  }
}

/**
 * Create a mock Cartesia TTS
 */
export function createMockCartesiaTTS(voiceId?: string): MockCartesiaTTS {
  return new MockCartesiaTTS(voiceId);
}

// ============================================================================
// VOICE PERSONA MAPPING
// ============================================================================

/**
 * Voice characteristics for different personas
 */
export const mockVoiceCharacteristics: Record<
  string,
  { voiceId: string; speakingRate: number; pitch: string }
> = {
  ferni: {
    voiceId: 'mock-ferni-voice',
    speakingRate: 1.0,
    pitch: 'warm',
  },
  peter: {
    voiceId: 'mock-peter-voice',
    speakingRate: 0.95,
    pitch: 'thoughtful',
  },
  alex: {
    voiceId: 'mock-alex-voice',
    speakingRate: 1.1,
    pitch: 'energetic',
  },
  maya: {
    voiceId: 'mock-maya-voice',
    speakingRate: 0.9,
    pitch: 'calm',
  },
  jordan: {
    voiceId: 'mock-jordan-voice',
    speakingRate: 1.05,
    pitch: 'practical',
  },
  nayan: {
    voiceId: 'mock-nayan-voice',
    speakingRate: 0.85,
    pitch: 'wise',
  },
};

/**
 * Get mock TTS client for a specific persona
 */
export function getMockTTSForPersona(personaId: string): MockTTSClient {
  const characteristics = mockVoiceCharacteristics[personaId] || mockVoiceCharacteristics.ferni;
  return new MockTTSClient({
    voiceId: characteristics.voiceId,
    speakingRate: characteristics.speakingRate,
  });
}

// ============================================================================
// TTS MODULE MOCK SETUP
// ============================================================================

/**
 * Setup TTS module mocks for vi.mock()
 */
export function setupTTSMocks(client?: MockTTSClient): void {
  const mockClient = client || createMockTTSClient();

  // Mock Cartesia TTS
  vi.mock('../../speech/cartesia-tts.js', () => ({
    CartesiaTTS: vi.fn().mockImplementation(() => ({
      synthesize: vi.fn().mockImplementation((text) => mockClient.synthesize(text)),
      stream: vi.fn().mockImplementation((text) => mockClient.synthesizeStream(text)),
    })),
    getCartesiaTTS: vi.fn(() => ({
      synthesize: vi.fn().mockImplementation((text) => mockClient.synthesize(text)),
      stream: vi.fn().mockImplementation((text) => mockClient.synthesizeStream(text)),
    })),
  }));

  // Mock lightweight TTS
  vi.mock('../shared/lightweight-tts.js', () => ({
    getLightweightTTS: vi.fn(() => ({
      speak: vi.fn().mockImplementation((text) => mockClient.synthesize(text)),
    })),
  }));
}

/**
 * Setup Silero VAD mocks
 */
export function setupSileroMocks(): void {
  vi.mock('@livekit/agents-plugin-silero', () => ({
    VAD: {
      load: vi.fn().mockResolvedValue({
        detect: vi.fn().mockReturnValue({
          isSpeech: false,
          probability: 0.1,
        }),
      }),
    },
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createMockAudioFrame,
  createMockAudioFrames,
  createMockTTSClient,
  createMockCartesiaTTS,
  getMockTTSForPersona,
  setupTTSMocks,
  setupSileroMocks,
  mockVoiceCharacteristics,
  MockTTSClient,
  MockCartesiaTTS,
};
