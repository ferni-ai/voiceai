/**
 * Startup Validation Tests
 *
 * Tests for the startup validation system that ensures proper configuration
 * before the application starts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// These tests expect a minimal environment without real GCP credentials
// Skip degraded-mode tests when running in a fully configured environment
const hasRealGcpCredentials = Boolean(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_SERVICE_KEY
);

// We need to dynamically import to get fresh module state
async function getValidationModule() {
  const mod = await import('../services/startup-validation.js');
  return mod;
}

describe('Startup Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables before each test
    vi.resetModules();
    // Clear specific env vars that affect validation
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.MEMORY_STORE_TYPE;
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.CARTESIA_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.EMBEDDING_DIMENSIONS;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GCLOUD_SERVICE_KEY;
  });

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe('validateStartup', () => {
    it('should return valid result with all keys configured', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.LIVEKIT_URL = 'wss://test.livekit.io';
      process.env.LIVEKIT_API_KEY = 'test-api-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json';

      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.capabilities.persistentMemory).toBe(true);
      expect(result.capabilities.semanticSearch).toBe(true);
      expect(result.capabilities.storeType).toBe('firestore');
      expect(result.capabilities.embeddingProvider).toBe('google');
    });

    it.skipIf(hasRealGcpCredentials)('should warn about missing Google Cloud project', async () => {
      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.warnings.some((w) => w.includes('GOOGLE_CLOUD_PROJECT'))).toBe(true);
      expect(result.capabilities.storeType).toBe('memory');
    });

    it('should warn about missing embedding API key', async () => {
      // Add LLM key to avoid LLM error
      process.env.ANTHROPIC_API_KEY = 'test';

      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.warnings.some((w) => w.includes('embedding API key'))).toBe(true);
      expect(result.capabilities.semanticSearch).toBe(false);
      expect(result.capabilities.embeddingProvider).toBe('local');
    });

    it('should error when no LLM API key is set', async () => {
      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.errors.some((e) => e.includes('LLM API key'))).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('should error when LiveKit is not configured', async () => {
      process.env.GOOGLE_API_KEY = 'test';

      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.errors.some((e) => e.includes('LIVEKIT_URL'))).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('should detect OpenAI embeddings when only OpenAI key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.capabilities.embeddingProvider).toBe('openai');
      expect(result.capabilities.semanticSearch).toBe(true);
    });

    it('should prefer Google embeddings when both keys are set', async () => {
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.capabilities.embeddingProvider).toBe('google');
    });

    it.skipIf(hasRealGcpCredentials)(
      'should detect PostgreSQL store when DATABASE_URL is set',
      async () => {
        process.env.DATABASE_URL = 'postgres://localhost/test';
        process.env.GOOGLE_API_KEY = 'test';

        const { validateStartup } = await getValidationModule();
        const result = validateStartup();

        expect(result.capabilities.storeType).toBe('postgres');
        expect(result.capabilities.persistentMemory).toBe(true);
      }
    );

    it('should respect explicit MEMORY_STORE_TYPE', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.DATABASE_URL = 'postgres://localhost/test';
      process.env.MEMORY_STORE_TYPE = 'memory';
      process.env.GOOGLE_API_KEY = 'test';

      const { validateStartup } = await getValidationModule();
      const result = validateStartup();

      expect(result.capabilities.storeType).toBe('memory');
      expect(result.capabilities.persistentMemory).toBe(false);
    });
  });

  describe('validateStartup - production requirements', () => {
    it.skipIf(hasRealGcpCredentials)(
      'should error in production when memory is not persistent',
      async () => {
        process.env.NODE_ENV = 'production';
        process.env.GOOGLE_API_KEY = 'test';
        process.env.LIVEKIT_URL = 'wss://test';
        process.env.LIVEKIT_API_KEY = 'key';
        process.env.LIVEKIT_API_SECRET = 'secret';

        const { validateStartup } = await getValidationModule();
        const result = validateStartup({
          environment: 'production',
          requirePersistentMemory: true,
        });

        expect(result.errors.some((e) => e.includes('persistent memory'))).toBe(true);
        expect(result.valid).toBe(false);
      }
    );

    it('should error in production when semantic search is disabled', async () => {
      process.env.NODE_ENV = 'production';
      process.env.GOOGLE_CLOUD_PROJECT = 'test';
      process.env.ANTHROPIC_API_KEY = 'test';
      process.env.LIVEKIT_URL = 'wss://test';
      process.env.LIVEKIT_API_KEY = 'key';
      process.env.LIVEKIT_API_SECRET = 'secret';

      const { validateStartup } = await getValidationModule();
      const result = validateStartup({
        environment: 'production',
        requireSemanticSearch: true,
      });

      expect(result.errors.some((e) => e.includes('semantic search'))).toBe(true);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAndLog', () => {
    it('should return capabilities when validation passes', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.LIVEKIT_URL = 'wss://test';
      process.env.LIVEKIT_API_KEY = 'key';
      process.env.LIVEKIT_API_SECRET = 'secret';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json';

      const { validateAndLog } = await getValidationModule();
      const capabilities = validateAndLog({ environment: 'development' });

      expect(capabilities).toBeDefined();
      expect(capabilities.persistentMemory).toBe(true);
      expect(capabilities.semanticSearch).toBe(true);
    });

    it('should throw when validation fails in production', async () => {
      process.env.NODE_ENV = 'production';

      const { validateAndLog } = await getValidationModule();
      expect(() => validateAndLog({ environment: 'production' })).toThrow(
        'Startup validation failed'
      );
    });
  });

  describe('hasFullCapabilities', () => {
    it('should return true when all capabilities are available', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.LIVEKIT_URL = 'wss://test';
      process.env.LIVEKIT_API_KEY = 'key';
      process.env.LIVEKIT_API_SECRET = 'secret';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json';

      const { hasFullCapabilities } = await getValidationModule();
      expect(hasFullCapabilities()).toBe(true);
    });

    it.skipIf(hasRealGcpCredentials)(
      'should return false when memory is not persistent',
      async () => {
        process.env.GOOGLE_API_KEY = 'test';
        process.env.LIVEKIT_URL = 'wss://test';
        process.env.LIVEKIT_API_KEY = 'key';
        process.env.LIVEKIT_API_SECRET = 'secret';

        const { hasFullCapabilities } = await getValidationModule();
        expect(hasFullCapabilities()).toBe(false);
      }
    );

    it('should return false when semantic search is disabled', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test';
      process.env.ANTHROPIC_API_KEY = 'test';
      process.env.LIVEKIT_URL = 'wss://test';
      process.env.LIVEKIT_API_KEY = 'key';
      process.env.LIVEKIT_API_SECRET = 'secret';

      const { hasFullCapabilities } = await getValidationModule();
      expect(hasFullCapabilities()).toBe(false);
    });
  });

  describe('getCapabilitySummary', () => {
    it('should return a human-readable summary', async () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.LIVEKIT_URL = 'wss://test';
      process.env.LIVEKIT_API_KEY = 'key';
      process.env.LIVEKIT_API_SECRET = 'secret';

      const { getCapabilitySummary } = await getValidationModule();
      const summary = getCapabilitySummary();

      expect(summary).toContain('Ferni AI Capabilities');
      expect(summary).toContain('Memory');
      expect(summary).toContain('Semantic Search');
      expect(summary).toContain('LLM');
    });

    it('should include warnings in summary', async () => {
      process.env.GOOGLE_API_KEY = 'test';
      process.env.LIVEKIT_URL = 'wss://test';
      process.env.LIVEKIT_API_KEY = 'key';
      process.env.LIVEKIT_API_SECRET = 'secret';

      const { getCapabilitySummary } = await getValidationModule();
      const summary = getCapabilitySummary();

      expect(summary).toContain('Warnings');
    });
  });

  describe('checkEmbeddingConsistency', () => {
    it('should return consistent when dimensions match', async () => {
      process.env.GOOGLE_API_KEY = 'test';
      process.env.EMBEDDING_DIMENSIONS = '768'; // Google dimensions

      const { checkEmbeddingConsistency } = await getValidationModule();
      const result = await checkEmbeddingConsistency();

      expect(result.consistent).toBe(true);
      expect(result.currentDimensions).toBe(768);
    });

    it('should warn about dimension mismatch', async () => {
      process.env.GOOGLE_API_KEY = 'test';
      process.env.EMBEDDING_DIMENSIONS = '1536'; // OpenAI dimensions, but using Google

      const { checkEmbeddingConsistency } = await getValidationModule();
      const result = await checkEmbeddingConsistency();

      expect(result.consistent).toBe(false);
      expect(result.warning).toContain('mismatch');
    });

    it('should return correct dimensions for OpenAI', async () => {
      process.env.OPENAI_API_KEY = 'test';

      const { checkEmbeddingConsistency } = await getValidationModule();
      const result = await checkEmbeddingConsistency();

      expect(result.currentDimensions).toBe(1536);
    });

    it('should return correct dimensions for local embeddings', async () => {
      const { checkEmbeddingConsistency } = await getValidationModule();
      const result = await checkEmbeddingConsistency();

      expect(result.currentDimensions).toBe(384);
    });
  });
});
