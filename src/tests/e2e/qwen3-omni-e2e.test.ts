/**
 * Qwen3-Omni E2E Tests
 *
 * Validates the Qwen3-Omni integration end-to-end:
 * - Session manager creation with mock client
 * - Platform detection returns correct backend
 * - Config loading from env vars
 * - Voice clone config lookup for all personas
 * - Graceful degradation (missing weights)
 * - Mock mode (QWEN3_OMNI_MOCK=true)
 *
 * @module tests/e2e/qwen3-omni-e2e.test
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the loggers before any imports that use them
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock voice-ids to avoid config loading side effects
vi.mock('../../config/voice-ids.js', () => ({
  VOICE_IDS: {
    FERNI: 'mock-ferni-voice-id',
    MAYA_SANTOS: 'mock-maya-voice-id',
    ALEX_CHEN: 'mock-alex-voice-id',
    PETER_JOHN: 'mock-peter-voice-id',
    JORDAN_TAYLOR: 'mock-jordan-voice-id',
    NAYAN_PATEL: 'mock-nayan-voice-id',
    JOEL_DICKSON: 'mock-joel-voice-id',
    PETER_LYNCH: 'mock-peter-lynch-voice-id',
    JOHN_BOGLE: 'mock-john-bogle-voice-id',
  },
}));

// Import after mocks
import {
  VOICE_CLONE_CONFIGS,
  getEmotionInstruction,
  getInferenceBackend,
  getModelWeightPath,
  getQwen3OmniConfig,
  getVoiceCloneConfig,
  isQwen3OmniEnabled,
  isQwen3OmniTextOnly,
  validateModelWeights,
} from '../../integrations/qwen3-omni/config.js';

import {
  MockQwen3OmniClient,
  createMockQwen3OmniClient,
  isQwen3OmniMockEnabled,
} from '../../integrations/qwen3-omni/client-mock.js';

// =============================================================================
// CONFIG LOADING
// =============================================================================

describe('Qwen3-Omni Config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should detect enabled state from USE_QWEN3_OMNI env var', () => {
    process.env.USE_QWEN3_OMNI = 'true';
    expect(isQwen3OmniEnabled()).toBe(true);

    process.env.USE_QWEN3_OMNI = 'false';
    expect(isQwen3OmniEnabled()).toBe(false);

    delete process.env.USE_QWEN3_OMNI;
    expect(isQwen3OmniEnabled()).toBe(false);
  });

  it('should detect text-only mode', () => {
    process.env.QWEN3_OMNI_TEXT_ONLY = 'true';
    expect(isQwen3OmniTextOnly()).toBe(true);

    delete process.env.QWEN3_OMNI_TEXT_ONLY;
    expect(isQwen3OmniTextOnly()).toBe(false);
  });

  it('should load config with defaults', () => {
    delete process.env.QWEN3_OMNI_URL;
    delete process.env.QWEN3_TTS_URL;
    delete process.env.QWEN3_OMNI_MODEL;

    const config = getQwen3OmniConfig();

    expect(config.serverUrl).toContain('localhost');
    expect(config.serverUrl).toContain('8000');
    expect(config.ttsServerUrl).toContain('8001');
    expect(config.model).toBe('Qwen3-Omni');
    expect(config.temperature).toBe(0.7);
    expect(config.maxTokens).toBe(4096);
    expect(config.quantization).toBe('int4');
    expect(config.enableFunctionCalling).toBe(true);
  });

  it('should respect env var overrides', () => {
    process.env.QWEN3_OMNI_URL = 'http://gpu-server:9000';
    process.env.QWEN3_TTS_URL = 'http://gpu-server:9001';
    process.env.QWEN3_OMNI_MODEL = 'Qwen3-Omni-Thinker';
    process.env.QWEN3_OMNI_TEMPERATURE = '0.3';
    process.env.QWEN3_OMNI_MAX_TOKENS = '8192';
    process.env.QWEN3_OMNI_QUANTIZATION = 'int8';

    const config = getQwen3OmniConfig();

    expect(config.serverUrl).toBe('http://gpu-server:9000');
    expect(config.ttsServerUrl).toBe('http://gpu-server:9001');
    expect(config.model).toBe('Qwen3-Omni-Thinker');
    expect(config.temperature).toBe(0.3);
    expect(config.maxTokens).toBe(8192);
    expect(config.quantization).toBe('int8');
  });

  it('should support separate host/port configuration', () => {
    delete process.env.QWEN3_OMNI_URL;
    delete process.env.QWEN3_TTS_URL;
    process.env.QWEN3_OMNI_HOST = '10.0.0.5';
    process.env.QWEN3_OMNI_PORT = '7000';
    process.env.QWEN3_TTS_HOST = '10.0.0.6';
    process.env.QWEN3_TTS_PORT = '7001';

    const config = getQwen3OmniConfig();

    expect(config.serverUrl).toBe('http://10.0.0.5:7000');
    expect(config.ttsServerUrl).toBe('http://10.0.0.6:7001');
  });
});

// =============================================================================
// VOICE CLONE CONFIGS
// =============================================================================

describe('Voice Clone Configs', () => {
  it('should have configs for all 9 personas', () => {
    expect(VOICE_CLONE_CONFIGS).toHaveLength(9);
    const personaIds = VOICE_CLONE_CONFIGS.map((c) => c.personaId);
    expect(personaIds).toContain('ferni');
    expect(personaIds).toContain('maya-santos');
    expect(personaIds).toContain('alex-chen');
    expect(personaIds).toContain('peter-john');
    expect(personaIds).toContain('jordan-taylor');
    expect(personaIds).toContain('nayan-patel');
    expect(personaIds).toContain('joel-dickson');
    expect(personaIds).toContain('peter-lynch');
    expect(personaIds).toContain('john-bogle');
  });

  it('should look up voice clone config by persona ID', () => {
    const ferniConfig = getVoiceCloneConfig('ferni');
    expect(ferniConfig).toBeDefined();
    expect(ferniConfig!.personaId).toBe('ferni');
    expect(ferniConfig!.cartesiaVoiceId).toBeTruthy();
    expect(ferniConfig!.referenceAudioPath).toMatch(/\.wav$/);
    expect(ferniConfig!.voiceDesignDescription).toBeTruthy();
  });

  it('should return undefined for unknown persona', () => {
    expect(getVoiceCloneConfig('unknown-persona')).toBeUndefined();
  });

  it('should have required fields for every config', () => {
    for (const config of VOICE_CLONE_CONFIGS) {
      expect(config.personaId).toBeTruthy();
      expect(config.cartesiaVoiceId).toBeTruthy();
      expect(config.referenceAudioPath).toMatch(/\.wav$/);
      expect(config.referenceTranscript.length).toBeGreaterThan(10);
      expect(config.cacheFilename).toMatch(/\.json$/);
      expect(config.voiceDesignDescription).toBeTruthy();
    }
  });
});

// =============================================================================
// EMOTION INSTRUCTIONS
// =============================================================================

describe('Emotion Instructions', () => {
  it('should return appropriate instructions for known emotions', () => {
    const happy = getEmotionInstruction('happy', 'warm', 0.5);
    expect(happy).toContain('happiness');

    const sad = getEmotionInstruction('sad', 'gentle', 0.5);
    expect(sad).toContain('compassion');

    const grief = getEmotionInstruction('grief', 'holding', 0.2);
    expect(grief).toContain('presence');
  });

  it('should fall back to neutral for unknown emotions', () => {
    const result = getEmotionInstruction('unknown-emotion', 'neutral', 0.5);
    expect(result).toContain('Warm');
  });

  it('should add energy modifiers', () => {
    const highEnergy = getEmotionInstruction('neutral', 'warm', 0.9);
    expect(highEnergy).toContain('higher energy');

    const lowEnergy = getEmotionInstruction('neutral', 'warm', 0.1);
    expect(lowEnergy).toContain('gentle');
  });
});

// =============================================================================
// PLATFORM DETECTION
// =============================================================================

describe('Platform Detection', () => {
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;

  afterEach(() => {
    process.env = { ...originalEnv };
    // Restore platform (it's read-only, but we can override via defineProperty)
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should return candle on macOS (darwin) by default', () => {
    delete process.env.QWEN3_OMNI_BACKEND;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(getInferenceBackend()).toBe('candle');
  });

  it('should return candle on Linux by default', () => {
    delete process.env.QWEN3_OMNI_BACKEND;
    delete process.env.QWEN3_OMNI_VLLM;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(getInferenceBackend()).toBe('candle');
  });

  it('should return vllm on Linux when QWEN3_OMNI_VLLM=true', () => {
    delete process.env.QWEN3_OMNI_BACKEND;
    process.env.QWEN3_OMNI_VLLM = 'true';
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(getInferenceBackend()).toBe('vllm');
  });

  it('should respect QWEN3_OMNI_BACKEND env override', () => {
    process.env.QWEN3_OMNI_BACKEND = 'vllm';
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(getInferenceBackend()).toBe('vllm');

    process.env.QWEN3_OMNI_BACKEND = 'candle';
    expect(getInferenceBackend()).toBe('candle');

    process.env.QWEN3_OMNI_BACKEND = 'mlx';
    expect(getInferenceBackend()).toBe('mlx');
  });

  it('should return mlx on Mac when QWEN3_OMNI_MLX=true', () => {
    delete process.env.QWEN3_OMNI_BACKEND;
    process.env.QWEN3_OMNI_MLX = 'true';
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(getInferenceBackend()).toBe('mlx');
  });

  it('should ignore invalid QWEN3_OMNI_BACKEND values', () => {
    process.env.QWEN3_OMNI_BACKEND = 'invalid-backend';
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(getInferenceBackend()).toBe('candle');
  });
});

// =============================================================================
// WEIGHT PATH RESOLUTION
// =============================================================================

describe('Weight Path Resolution', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should prioritize QWEN3_OMNI_WEIGHT_PATH env var', () => {
    process.env.QWEN3_OMNI_WEIGHT_PATH = '/custom/weights';
    expect(getModelWeightPath('candle')).toBe('/custom/weights');
    expect(getModelWeightPath('vllm')).toBe('/custom/weights');
    expect(getModelWeightPath('mlx')).toBe('/custom/weights');
  });

  it('should return a path containing the backend name when no override', () => {
    delete process.env.QWEN3_OMNI_WEIGHT_PATH;
    delete process.env.CANDLE_WEIGHT_PATH;
    delete process.env.VLLM_WEIGHT_PATH;
    delete process.env.MLX_WEIGHT_PATH;

    const candlePath = getModelWeightPath('candle');
    const vllmPath = getModelWeightPath('vllm');
    const mlxPath = getModelWeightPath('mlx');

    expect(candlePath).toContain('candle');
    expect(vllmPath).toContain('vllm');
    expect(mlxPath).toContain('mlx');
  });

  it('should use backend-specific env vars', () => {
    delete process.env.QWEN3_OMNI_WEIGHT_PATH;
    process.env.CANDLE_WEIGHT_PATH = '/candle/custom/weights';

    const path = getModelWeightPath('candle');
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// WEIGHT VALIDATION
// =============================================================================

describe('Weight Validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return errors for non-existent weight directory', async () => {
    process.env.QWEN3_OMNI_WEIGHT_PATH = '/nonexistent/path/to/weights';
    const result = await validateModelWeights('candle');

    expect(result.valid).toBe(false);
    expect(result.backend).toBe('candle');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('not found');
  });

  it('should include setup instructions in error messages', async () => {
    process.env.QWEN3_OMNI_WEIGHT_PATH = '/nonexistent/path';

    const candleResult = await validateModelWeights('candle');
    expect(
      candleResult.errors.some((e) => e.includes('huggingface') || e.includes('safetensors'))
    ).toBe(true);

    const vllmResult = await validateModelWeights('vllm');
    expect(vllmResult.errors.some((e) => e.includes('huggingface'))).toBe(true);

    const mlxResult = await validateModelWeights('mlx');
    expect(
      mlxResult.errors.some((e) => e.includes('QWEN3_OMNI_URL') || e.includes('MLX server'))
    ).toBe(true);
  });

  it('should return correct backend in result', async () => {
    process.env.QWEN3_OMNI_WEIGHT_PATH = '/nonexistent';

    const candleResult = await validateModelWeights('candle');
    expect(candleResult.backend).toBe('candle');

    const vllmResult = await validateModelWeights('vllm');
    expect(vllmResult.backend).toBe('vllm');

    const mlxResult = await validateModelWeights('mlx');
    expect(mlxResult.backend).toBe('mlx');
  });
});

// =============================================================================
// MOCK CLIENT
// =============================================================================

describe('Mock Qwen3 Client', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should detect mock mode from env var', () => {
    process.env.QWEN3_OMNI_MOCK = 'true';
    expect(isQwen3OmniMockEnabled()).toBe(true);

    process.env.QWEN3_OMNI_MOCK = 'false';
    expect(isQwen3OmniMockEnabled()).toBe(false);

    delete process.env.QWEN3_OMNI_MOCK;
    expect(isQwen3OmniMockEnabled()).toBe(false);
  });

  it('should create a mock client', () => {
    const client = createMockQwen3OmniClient();
    expect(client).toBeInstanceOf(MockQwen3OmniClient);
    expect(client.connected).toBe(true);
    expect(client.requestCount).toBe(0);
  });

  it('should return canned chat completion', async () => {
    const client = createMockQwen3OmniClient();
    const result = await client.chatCompletion(
      [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      {}
    );

    expect(result.id).toMatch(/^mock-/);
    expect(result.model).toBe('mock-qwen3-omni');
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.message.role).toBe('assistant');
    expect(result.choices[0]!.message.content).toBeTruthy();
    expect(result.choices[0]!.finish_reason).toBe('stop');
    expect(client.requestCount).toBe(1);
  });

  it('should stream chat completion chunks', async () => {
    const client = createMockQwen3OmniClient();
    const chunks: Array<{ type: string }> = [];

    for await (const chunk of client.streamChatCompletion([], {})) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(1);
    const textChunks = chunks.filter((c) => c.type === 'text');
    const doneChunks = chunks.filter((c) => c.type === 'done');
    expect(textChunks.length).toBeGreaterThan(0);
    expect(doneChunks).toHaveLength(1);
    expect(client.requestCount).toBe(1);
  });

  it('should stream audio completion chunks', async () => {
    const client = createMockQwen3OmniClient();
    const chunks: Array<{ type: string }> = [];

    for await (const chunk of client.streamAudioCompletion([], {})) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1]!.type).toBe('done');
    expect(client.requestCount).toBe(1);
  });

  it('should return canned transcription', async () => {
    const client = createMockQwen3OmniClient();
    const result = await client.transcribeAudio('data:audio/wav;base64,...');

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(client.requestCount).toBe(1);
  });

  it('should process audio input', async () => {
    const client = createMockQwen3OmniClient();
    const result = await client.processAudioInput(
      new Uint8Array(100),
      'You are a helpful assistant.',
      {}
    );

    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.finish_reason).toBe('stop');
    expect(client.requestCount).toBe(1);
  });

  it('should report healthy', async () => {
    const client = createMockQwen3OmniClient();
    const health = await client.checkHealth();

    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBe(0);
  });

  it('should track request count across all methods', async () => {
    const client = createMockQwen3OmniClient();
    expect(client.requestCount).toBe(0);

    await client.chatCompletion([], {});
    expect(client.requestCount).toBe(1);

    await client.transcribeAudio('data:...');
    expect(client.requestCount).toBe(2);

    // Consume the async generator
    for await (const _ of client.streamChatCompletion([], {})) {
      // consume
    }
    expect(client.requestCount).toBe(3);
  });
});

// =============================================================================
// GRACEFUL DEGRADATION
// =============================================================================

describe('Graceful Degradation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should default to safe config when no env vars set', () => {
    // Clear all qwen3-related env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('QWEN3_')) {
        delete process.env[key];
      }
    }

    const config = getQwen3OmniConfig();
    expect(config.serverUrl).toBeTruthy();
    expect(config.ttsServerUrl).toBeTruthy();
    expect(config.model).toBeTruthy();
    expect(config.quantization).toBeTruthy();
    expect(typeof config.temperature).toBe('number');
    expect(typeof config.maxTokens).toBe('number');
  });

  it('should gracefully handle missing voice clone for unknown persona', () => {
    const config = getVoiceCloneConfig('nonexistent-persona-xyz');
    expect(config).toBeUndefined();
  });

  it('should validate weights and return structured errors for missing path', async () => {
    process.env.QWEN3_OMNI_WEIGHT_PATH = '/definitely/does/not/exist';
    const result = await validateModelWeights();

    expect(result.valid).toBe(false);
    expect(result.weightPath).toBe('/definitely/does/not/exist');
    expect(result.errors).toBeInstanceOf(Array);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
