/**
 * Pronunciation Memory Tests
 *
 * Tests for the pronunciation memory system that learns and applies
 * consistent pronunciations for names and technical terms.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PronunciationMemoryService,
  getPronunciationMemory,
  resetPronunciationMemory,
  resetAllPronunciationMemory,
  getActivePronunciationMemoryCount,
  analyzePronunciationNeeds,
  COMMON_DIFFICULT_NAMES,
} from '../pronunciation-memory/index.js';

describe('PronunciationMemoryService', () => {
  const sessionId = 'test-session-789';

  afterEach(() => {
    resetAllPronunciationMemory();
  });

  describe('session management', () => {
    it('should create and retrieve memory for session', () => {
      const memory = getPronunciationMemory(sessionId);
      expect(memory).toBeInstanceOf(PronunciationMemoryService);

      // Should return same instance
      const memory2 = getPronunciationMemory(sessionId);
      expect(memory2).toBe(memory);
    });

    it('should track active memories', () => {
      expect(getActivePronunciationMemoryCount()).toBe(0);

      getPronunciationMemory('session-1');
      expect(getActivePronunciationMemoryCount()).toBe(1);

      getPronunciationMemory('session-2');
      expect(getActivePronunciationMemoryCount()).toBe(2);

      resetPronunciationMemory('session-1');
      expect(getActivePronunciationMemoryCount()).toBe(1);
    });
  });

  describe('processUserMessage()', () => {
    it('should detect name introductions', () => {
      const memory = getPronunciationMemory(sessionId);

      const result = memory.processUserMessage("Hi, I'm John");

      expect(result).not.toBeNull();
      expect(result!.text).toBe('John');
      expect(result!.source).toBe('user_introduction');
    });

    it('should apply known pronunciation for difficult names', () => {
      const memory = getPronunciationMemory(sessionId);

      const result = memory.processUserMessage("My name is Siobhan");

      expect(result).not.toBeNull();
      expect(result!.text).toBe('Siobhan');
      expect(result!.phonetic).toBe('Shi-vawn');
      expect(result!.source).toBe('phonetic_pattern');
    });

    it('should handle pronunciation corrections', () => {
      const memory = getPronunciationMemory(sessionId);

      // First, introduce name (Niamh has built-in pronunciation)
      memory.processUserMessage("I'm Niamh");

      // Verify built-in pronunciation was applied
      const entry = memory.getPronunciation('Niamh');
      expect(entry).not.toBeNull();
      expect(entry!.phonetic).toBe('Neev');
    });

    it('should return null for non-introduction messages', () => {
      const memory = getPronunciationMemory(sessionId);

      const result = memory.processUserMessage('The weather is nice today');

      expect(result).toBeNull();
    });
  });

  describe('getPronunciation()', () => {
    it('should return learned pronunciation', () => {
      const memory = getPronunciationMemory(sessionId);
      memory.processUserMessage("My name is Aoife");

      const entry = memory.getPronunciation('Aoife');

      expect(entry).not.toBeNull();
      expect(entry!.phonetic).toBe('Ee-fa');
    });

    it('should return common difficult name pronunciation', () => {
      const memory = getPronunciationMemory(sessionId);

      const entry = memory.getPronunciation('Joaquin');

      expect(entry).not.toBeNull();
      expect(entry!.phonetic).toBe('Wa-keen');
    });

    it('should return null for unknown words', () => {
      const memory = getPronunciationMemory(sessionId);

      const entry = memory.getPronunciation('xyzabc');

      expect(entry).toBeNull();
    });

    it('should increment use count', () => {
      const memory = getPronunciationMemory(sessionId);
      memory.processUserMessage("I'm Saoirse");

      memory.getPronunciation('Saoirse');
      memory.getPronunciation('Saoirse');
      const entry = memory.getPronunciation('Saoirse');

      expect(entry!.useCount).toBeGreaterThan(0);
    });
  });

  describe('getUserName()', () => {
    it('should return user name after introduction', () => {
      const memory = getPronunciationMemory(sessionId);
      memory.processUserMessage("Call me Maya");

      const userName = memory.getUserName();

      expect(userName).not.toBeNull();
      expect(userName!.text).toBe('Maya');
    });

    it('should return null if no name set', () => {
      const memory = getPronunciationMemory(sessionId);

      expect(memory.getUserName()).toBeNull();
    });
  });

  describe('applyToText()', () => {
    it('should replace names with pronunciations', () => {
      const memory = getPronunciationMemory(sessionId);
      memory.processUserMessage("I'm Siobhan");

      const result = memory.applyToText('Hello Siobhan, how are you today?');

      expect(result).toBe('Hello Shi-vawn, how are you today?');
    });

    it('should handle case insensitivity', () => {
      const memory = getPronunciationMemory(sessionId);
      memory.processUserMessage("I'm SIOBHAN");

      const result = memory.applyToText('siobhan said hello');

      expect(result.toLowerCase()).toContain('shi-vawn');
    });

    it('should not replace if phonetic equals text', () => {
      const memory = getPronunciationMemory(sessionId);
      memory.processUserMessage("I'm John");

      const result = memory.applyToText('Hello John!');

      // John is pronounced as written
      expect(result).toBe('Hello John!');
    });
  });

  describe('learnFromContext()', () => {
    it('should learn technical terms', () => {
      const memory = getPronunciationMemory(sessionId);

      memory.learnFromContext('kubectl', 'kube-control', 'technical', 0.8);

      const entry = memory.getPronunciation('kubectl');

      expect(entry).not.toBeNull();
      expect(entry!.phonetic).toBe('kube-control');
      expect(entry!.context).toBe('technical');
    });
  });

  describe('export/import state', () => {
    it('should export and import state', () => {
      const memory1 = getPronunciationMemory('session-export');
      memory1.processUserMessage("I'm Niamh");
      memory1.learnFromContext('GraphQL', 'Graph-Q-L', 'technical');

      const exported = memory1.exportState();

      // Create new session and import
      const memory2 = getPronunciationMemory('session-import');
      memory2.importState(exported);

      expect(memory2.getUserName()?.text).toBe('Niamh');
      expect(memory2.getPronunciation('GraphQL')?.phonetic).toBe('Graph-Q-L');
    });
  });

  describe('reset()', () => {
    it('should clear all learned pronunciations', () => {
      const memory = getPronunciationMemory(sessionId);
      memory.processUserMessage("I'm Aoife");

      memory.reset();

      expect(memory.getUserName()).toBeNull();
      expect(memory.getAllPronunciations()).toHaveLength(0);
    });
  });
});

describe('COMMON_DIFFICULT_NAMES', () => {
  it('should include Ferni team personas', () => {
    expect(COMMON_DIFFICULT_NAMES.ferni).toBe('Fur-nee');
    expect(COMMON_DIFFICULT_NAMES.nayan).toBe('Nuh-yahn');
  });

  it('should include Irish names', () => {
    expect(COMMON_DIFFICULT_NAMES.siobhan).toBe('Shi-vawn');
    expect(COMMON_DIFFICULT_NAMES.niamh).toBe('Neev');
    expect(COMMON_DIFFICULT_NAMES.caoimhe).toBe('Kee-va');
    expect(COMMON_DIFFICULT_NAMES.saoirse).toBe('Seer-sha');
  });

  it('should include Welsh names', () => {
    expect(COMMON_DIFFICULT_NAMES.rhiannon).toBe('Ree-an-on');
    expect(COMMON_DIFFICULT_NAMES.siân).toBe('Shahn');
  });

  it('should include Asian names', () => {
    expect(COMMON_DIFFICULT_NAMES.nguyen).toBe('Win');
    expect(COMMON_DIFFICULT_NAMES.xiaoming).toBe('Shao-ming');
  });
});

describe('analyzePronunciationNeeds()', () => {
  it('should detect acronyms', () => {
    const needs = analyzePronunciationNeeds('The API and SDK are ready');

    expect(needs).toContain('API');
    expect(needs).toContain('SDK');
  });

  it('should detect CamelCase terms', () => {
    const needs = analyzePronunciationNeeds('Use the TypeScript endpoint with JavaScript');

    // TypeScript has capital letters in middle
    expect(needs).toContain('TypeScript');
    expect(needs).toContain('JavaScript');
  });

  it('should detect terms with numbers', () => {
    const needs = analyzePronunciationNeeds('The GPT4 model is better than GPT3');

    expect(needs).toContain('GPT4');
    expect(needs).toContain('GPT3');
  });

  it('should return unique values', () => {
    const needs = analyzePronunciationNeeds('API API API');

    const apiCount = needs.filter((n) => n === 'API').length;
    expect(apiCount).toBe(1);
  });
});

