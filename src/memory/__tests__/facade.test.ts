/**
 * Memory Facade Integration Tests
 *
 * Tests the unified Memory facade API.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock the external dependencies before importing Memory
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: vi.fn((data) => data),
}));

describe('Memory Facade', () => {
  describe('Lifecycle', () => {
    it('should expose initialize method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.initialize).toBe('function');
    });

    it('should expose shutdown method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.shutdown).toBe('function');
    });

    it('should expose isInitialized method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.isInitialized).toBe('function');
    });
  });

  describe('Health', () => {
    it('should expose isHealthy method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.isHealthy).toBe('function');
    });

    it('should expose getHealth method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.getHealth).toBe('function');
    });
  });

  describe('Capture', () => {
    it('should expose capture method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.capture).toBe('function');
    });

    it('should expose capturePerson method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.capturePerson).toBe('function');
    });
  });

  describe('Retrieval', () => {
    it('should expose retrieve method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.retrieve).toBe('function');
    });

    it('should expose search method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.search).toBe('function');
    });

    it('should expose findEntity method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.findEntity).toBe('function');
    });

    it('should expose getRecentContext method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.getRecentContext).toBe('function');
    });
  });

  describe('Persistence', () => {
    it('should expose saveDocument method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.saveDocument).toBe('function');
    });

    it('should expose getDocument method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.getDocument).toBe('function');
    });

    it('should expose deleteDocument method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.deleteDocument).toBe('function');
    });
  });

  describe('Knowledge Graph', () => {
    it('should expose ask method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.ask).toBe('function');
    });

    it('should expose whatDoWeKnow method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.whatDoWeKnow).toBe('function');
    });
  });

  describe('Session Management', () => {
    it('should expose onSessionEnd method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.onSessionEnd).toBe('function');
    });

    it('should expose clearSession method', async () => {
      const { Memory } = await import('../facade.js');
      expect(typeof Memory.clearSession).toBe('function');
    });
  });
});
