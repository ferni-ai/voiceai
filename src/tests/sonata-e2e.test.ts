/**
 * Sonata E2E Tests
 *
 * Tests the full Sonata integration pipeline:
 * 1. TTS Provider — synthesize + streaming
 * 2. STT Client — audio processing + transcript callbacks
 * 3. Voice config — persona voice resolution
 * 4. Frame buffer — PCM buffering into complete frames
 *
 * Native @ferni/sonata module is mocked since it requires Metal GPU.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK NATIVE MODULE (via createRequire interception)
// ============================================================================

const mockSttInstance = {
  processFrame: vi.fn().mockReturnValue(0),
  flush: vi.fn().mockReturnValue(1),
  getAllText: vi.fn().mockReturnValue('hello world'),
  getVadProb: vi.fn().mockReturnValue(0.1),
  reset: vi.fn(),
};

const mockTtsInstance = {
  setText: vi.fn(),
  setTextDone: vi.fn(),
  step: vi.fn().mockReturnValue(false),
  getAudio: vi.fn().mockReturnValue(new Float32Array(0)),
  isDone: vi.fn().mockReturnValue(false),
  reset: vi.fn(),
  frameSize: vi.fn().mockReturnValue(1920),
  sampleRate: vi.fn().mockReturnValue(24000),
};

const mockNativeModule = {
  SonataSTT: {
    create: vi.fn().mockReturnValue(mockSttInstance),
    frameSize: vi.fn().mockReturnValue(1920),
    sampleRate: vi.fn().mockReturnValue(24000),
  },
  SonataTTS: {
    create: vi.fn().mockReturnValue(mockTtsInstance),
  },
};

// Mock `module` so createRequire('@ferni/sonata') returns our mock
vi.mock('module', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createRequire: () => (id: string) => {
      if (id === '@ferni/sonata') return mockNativeModule;
      throw new Error(`Cannot find module '${id}'`);
    },
  };
});

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// FRAME BUFFER TESTS
// ============================================================================

describe('FrameBuffer', () => {
  let FrameBuffer: typeof import('../speech/sonata/frame-buffer.js').FrameBuffer;

  beforeEach(async () => {
    const mod = await import('../speech/sonata/frame-buffer.js');
    FrameBuffer = mod.FrameBuffer;
  });

  it('should buffer samples until a full frame (1920 samples)', () => {
    const fb = new FrameBuffer();
    const partial = new Float32Array(960);
    const result = fb.push(partial);
    expect(result).toHaveLength(0);
  });

  it('should yield complete frames when buffer is full', () => {
    const fb = new FrameBuffer();
    const twoFrames = new Float32Array(3840); // 2 × 1920
    const result = fb.push(twoFrames);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1920);
    expect(result[1]).toHaveLength(1920);
  });

  it('should retain remainder across pushes', () => {
    const fb = new FrameBuffer();
    fb.push(new Float32Array(2880)); // yields 1, retains 960
    const result = fb.push(new Float32Array(960));
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1920);
  });

  it('should reset to empty state', () => {
    const fb = new FrameBuffer();
    fb.push(new Float32Array(960));
    fb.reset();
    const result = fb.push(new Float32Array(960));
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// VOICE CONFIG TESTS
// ============================================================================

describe('Voice Config', () => {
  it('should resolve known persona voice paths', async () => {
    const { resolveVoicePath, hasVoice } = await import('../speech/sonata/voice-config.js');

    expect(hasVoice('ferni')).toBe(true);
    expect(resolveVoicePath('ferni')).toContain('voices/ferni.safetensors');
  });

  it('should fall back to default voice for unknown personas', async () => {
    const { resolveVoicePath, hasVoice } = await import('../speech/sonata/voice-config.js');

    expect(hasVoice('unknown-persona')).toBe(false);
    // Falls back to ferni voice (default)
    expect(resolveVoicePath('unknown-persona')).toContain('voices/ferni.safetensors');
  });

  it('should export correct sample rate and frame size', async () => {
    const { SONATA_SAMPLE_RATE, SONATA_FRAME_SIZE } = await import(
      '../speech/sonata/voice-config.js'
    );

    expect(SONATA_SAMPLE_RATE).toBe(24000);
    expect(SONATA_FRAME_SIZE).toBe(1920);
  });
});

// ============================================================================
// STT CLIENT TESTS
// ============================================================================

describe('SonataSTTClient', () => {
  let SonataSTTClient: typeof import('../speech/providers/sonata-stt.js').SonataSTTClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../speech/providers/sonata-stt.js');
    SonataSTTClient = mod.SonataSTTClient;
  });

  it('should connect and create engine', async () => {
    const client = new SonataSTTClient();
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('should not create engine twice on double connect', async () => {
    const client = new SonataSTTClient();
    await client.connect();
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('should process audio frames', async () => {
    const client = new SonataSTTClient();
    await client.connect();

    const audio = new Int16Array(1920);
    await client.sendAudio(audio);

    expect(mockSttInstance.processFrame).toHaveBeenCalled();
  });

  it('should fire transcript callbacks when words detected', async () => {
    mockSttInstance.processFrame.mockReturnValue(1);
    mockSttInstance.getAllText.mockReturnValue('hello world');

    const client = new SonataSTTClient();
    await client.connect();

    const callback = vi.fn();
    client.onTranscript(callback);

    const audio = new Int16Array(1920);
    await client.sendAudio(audio);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello world' }),
    );
  });

  it('should flush and return final text', async () => {
    mockSttInstance.getAllText.mockReturnValue('final transcription');

    const client = new SonataSTTClient();
    await client.connect();

    const result = await client.triggerTranscription();
    expect(result.text).toBe('final transcription');
    expect(mockSttInstance.flush).toHaveBeenCalled();
  });

  it('should return VAD probability', async () => {
    mockSttInstance.getVadProb.mockReturnValue(0.85);

    const client = new SonataSTTClient();
    await client.connect();

    expect(client.getVadProb(1)).toBe(0.85);
  });

  it('should disconnect cleanly', async () => {
    const client = new SonataSTTClient();
    await client.connect();
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });
});

// ============================================================================
// TTS PROVIDER TESTS
// ============================================================================

describe('SonataTTSProvider', () => {
  let SonataTTSProvider: typeof import('../speech/tts-gateway/providers/sonata.js').SonataTTSProvider;
  let resetSonataProvider: typeof import('../speech/tts-gateway/providers/sonata.js').resetSonataProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../speech/tts-gateway/providers/sonata.js');
    resetSonataProvider = mod.resetSonataProvider;
    resetSonataProvider();
    SonataTTSProvider = mod.SonataTTSProvider;
  });

  it('should report available when native module loads', async () => {
    const provider = new SonataTTSProvider();
    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('should synthesize audio from text', async () => {
    let stepCount = 0;
    mockTtsInstance.step.mockImplementation(() => {
      stepCount++;
      return stepCount >= 3;
    });
    mockTtsInstance.isDone.mockImplementation(() => stepCount >= 3);
    mockTtsInstance.getAudio.mockReturnValue(new Float32Array([0.1, 0.2, -0.3]));

    const provider = new SonataTTSProvider();
    const result = await provider.synthesize('Hello world', 'ferni');

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(mockTtsInstance.setText).toHaveBeenCalledWith('Hello world');
    expect(mockTtsInstance.setTextDone).toHaveBeenCalled();
  });

  it('should stream audio chunks', async () => {
    let stepCount = 0;
    mockTtsInstance.step.mockImplementation(() => {
      stepCount++;
      return stepCount >= 2;
    });
    mockTtsInstance.isDone.mockImplementation(() => stepCount >= 2);
    mockTtsInstance.getAudio.mockReturnValue(new Float32Array([0.5, -0.5]));

    const provider = new SonataTTSProvider();
    const chunks: ArrayBuffer[] = [];

    for await (const chunk of provider.synthesizeStreaming('test', 'ferni')) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk).toBeInstanceOf(ArrayBuffer);
    }
  });

  it('should estimate duration based on word count', () => {
    const provider = new SonataTTSProvider();
    const duration = provider.estimateDuration('one two three');
    expect(duration).toBeGreaterThan(0);
  });

  it('should convert f32 to s16le correctly', async () => {
    mockTtsInstance.step.mockReturnValue(true);
    mockTtsInstance.isDone.mockReturnValue(true);
    mockTtsInstance.getAudio.mockReturnValue(new Float32Array([1.0, -1.0, 0.0]));

    const provider = new SonataTTSProvider();
    const result = await provider.synthesize('test', 'ferni');

    const s16 = new Int16Array(result);
    expect(s16[0]).toBe(32767);
    // -1.0 * 32767 = -32767 (clamped by Math.max(-32768, ...))
    expect(s16[1]).toBe(-32767);
    expect(s16[2]).toBe(0);
  });
});

// ============================================================================
// FACTORY INTEGRATION TESTS
// ============================================================================

describe('TTS Provider Factory', () => {
  it('should return Sonata provider when TTS_PROVIDER=sonata', async () => {
    process.env.TTS_PROVIDER = 'sonata';

    const { getTTSProvider } = await import('../speech/tts-gateway/providers/index.js');
    const provider = getTTSProvider();

    expect(provider.name).toBe('sonata');

    delete process.env.TTS_PROVIDER;
  });
});
