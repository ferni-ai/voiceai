/**
 * Visual Memory Service Tests
 *
 * "Better than Human" - We remember every photo you share.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger - must include both createLogger and getLogger
vi.mock('../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => mockLogger,
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

// Mock Firestore
vi.mock('../../../memory/firestore/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Mock Google Cloud Vision
vi.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: vi.fn(() => ({
    annotateImage: vi.fn(() => [
      {
        labelAnnotations: [
          { description: 'Dog', score: 0.95 },
          { description: 'Pet', score: 0.9 },
        ],
        faceAnnotations: [],
        safeSearchAnnotation: {
          adult: 'VERY_UNLIKELY',
          violence: 'VERY_UNLIKELY',
        },
      },
    ]),
  })),
}));

// Import after mocks
import { visualMemory, buildVisualMemoryInjection } from '../index.js';
import type { VisualMemory, VisualMemoryPreferences } from '../types.js';

describe('Visual Memory Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visualMemory.isEnabled', () => {
    it('should return false when not enabled', async () => {
      const isEnabled = await visualMemory.isEnabled('test-user');
      expect(isEnabled).toBe(false);
    });
  });

  describe('visualMemory.enable', () => {
    it('should enable visual memory', async () => {
      await expect(visualMemory.enable('test-user')).resolves.not.toThrow();
    });
  });

  describe('visualMemory.disable', () => {
    it('should disable visual memory', async () => {
      await expect(visualMemory.disable('test-user')).resolves.not.toThrow();
    });
  });

  describe('visualMemory.count', () => {
    it('should return count of visual memories', async () => {
      const count = await visualMemory.count('test-user');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('buildVisualMemoryInjection', () => {
    it('should return null when no visual memories', async () => {
      const injection = await buildVisualMemoryInjection('test-user');
      // Without real data, should return null
      expect(injection).toBeNull();
    });
  });

  describe('Visual Memory Types', () => {
    it('should have correct structure for VisualMemory', () => {
      const memory: VisualMemory = {
        id: 'vm-123',
        userId: 'test-user',
        createdAt: new Date().toISOString(),
        source: 'shared_in_chat',
        mimeType: 'image/jpeg',
        sizeBytes: 102400,
        storageUrl: 'https://storage.example.com/full.jpg',
        thumbnailUrl: 'https://storage.example.com/thumb.jpg',
        detectedLabels: ['Dog', 'Pet', 'Animal'],
        userDescription: 'My dog Max',
        isPrivate: false,
      };

      expect(memory.source).toBe('shared_in_chat');
      expect(memory.detectedLabels).toContain('Dog');
    });

    it('should have correct structure for VisualMemoryPreferences', () => {
      const prefs: VisualMemoryPreferences = {
        enabled: true,
        autoAnalyze: true,
        storePermanently: true,
        enableFaceDetection: false,
        enableLocationExtraction: false,
        defaultPrivate: false,
        autoDeleteDays: 0,
        updatedAt: new Date().toISOString(),
      };

      expect(prefs.enabled).toBe(true);
      expect(prefs.enableFaceDetection).toBe(false);
    });
  });

  describe('Search Request Types', () => {
    it('should accept valid search parameters', () => {
      const searchRequest = {
        userId: 'test-user',
        query: 'dog photos',
        limit: 10,
        includePrivate: false,
      };

      expect(searchRequest.query).toBe('dog photos');
      expect(searchRequest.limit).toBe(10);
    });
  });

  describe('Upload Request Types', () => {
    it('should accept valid upload parameters', () => {
      const uploadRequest = {
        userId: 'test-user',
        imageData: 'base64encodeddata...',
        mimeType: 'image/jpeg',
        caption: 'A beautiful sunset',
        source: 'shared_in_chat' as const,
        isPrivate: false,
      };

      expect(uploadRequest.mimeType).toBe('image/jpeg');
      expect(uploadRequest.source).toBe('shared_in_chat');
    });
  });
});
