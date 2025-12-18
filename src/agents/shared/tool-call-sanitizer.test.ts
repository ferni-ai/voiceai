/**
 * Unit tests for tool call sanitizer
 *
 * Validates that the sanitizer catches various patterns of tool call leakage
 * where Gemini "talks about" executing a tool instead of executing it silently.
 */

import { describe, expect, test } from 'vitest';
import {
  createSanitizerTransformStream,
  detectsFunctionCallLeakage,
  sanitizeToolCallLeakage,
} from './tool-call-sanitizer.js';

describe('detectsFunctionCallLeakage', () => {
  describe('should detect handoff announcements', () => {
    const handoffPhrases = [
      'Let me transfer you to Maya',
      "I'll connect you with Maya",
      "I'm transferring you to Maya Santos",
      'Let me hand you off to Peter',
    ];

    for (const phrase of handoffPhrases) {
      test(`detects: "${phrase}"`, () => {
        const result = detectsFunctionCallLeakage(phrase);
        expect(result.detected).toBe(true);
        console.log(`  Pattern: ${result.pattern}, Tool: ${result.toolName}`);
      });
    }
  });

  describe('should detect music tool announcements', () => {
    const musicPhrases = ["I'll play some jazz for you", 'Let me play that song'];

    for (const phrase of musicPhrases) {
      test(`detects: "${phrase}"`, () => {
        const result = detectsFunctionCallLeakage(phrase);
        expect(result.detected).toBe(true);
        console.log(`  Pattern: ${result.pattern}, Tool: ${result.toolName}`);
      });
    }
  });

  describe('should detect function call syntax leakage', () => {
    const syntaxPhrases = [
      "playMusic(query: 'jazz')",
      'handoffToMaya()',
      "I'll call playMusic",
      'The handoffToMaya function',
    ];

    for (const phrase of syntaxPhrases) {
      test(`detects: "${phrase}"`, () => {
        const result = detectsFunctionCallLeakage(phrase);
        expect(result.detected).toBe(true);
        console.log(`  Pattern: ${result.pattern}, Tool: ${result.toolName}`);
      });
    }
  });

  describe('should NOT detect normal conversation', () => {
    const normalPhrases = [
      'Maya is great at helping with budgets',
      'I think jazz is wonderful music',
      'The weather looks beautiful today',
      'That reminds me of a time when',
      'I understand how you feel',
    ];

    for (const phrase of normalPhrases) {
      test(`allows: "${phrase}"`, () => {
        const result = detectsFunctionCallLeakage(phrase);
        expect(result.detected).toBe(false);
      });
    }
  });
});

describe('sanitizeToolCallLeakage', () => {
  test('returns empty string for handoff announcements (suppress entirely)', () => {
    const result = sanitizeToolCallLeakage('Let me transfer you to Maya');
    // Handoff announcements should be suppressed (empty string = silent)
    expect(result).toBe('');
  });

  test('returns replacement text for music announcements', () => {
    const result = sanitizeToolCallLeakage("I'll play some jazz for you");
    expect(result).toBeDefined();
    // Should not contain "play" since that announces the tool
    expect(result).not.toContain("I'll play");
  });

  test('returns replacement for function call syntax', () => {
    const result = sanitizeToolCallLeakage("playMusic(query: 'jazz')");
    // Should replace with something neutral
    expect(result).toBeDefined();
    expect(result).not.toContain('playMusic(');
  });
});

describe('detectsFunctionCallLeakage - INTERNAL markers', () => {
  describe('should detect [INTERNAL:...] tool response markers', () => {
    const internalPhrases = [
      '[INTERNAL: Name "John" stored. Respond naturally - do NOT read this message aloud.]',
      '[INTERNAL: Emotional state "anxious" noted. Respond with genuine empathy - do NOT read this.]',
      '[INTERNAL: Graceful exit initiated. The call will disconnect shortly.]',
      '[INTERNAL: Conversation ending.]',
    ];

    for (const phrase of internalPhrases) {
      test(`detects: "${phrase.substring(0, 40)}..."`, () => {
        const result = detectsFunctionCallLeakage(phrase);
        expect(result.detected).toBe(true);
        expect(result.pattern).toBe('internal_marker');
      });
    }
  });

  describe('should detect "do NOT read this" instruction patterns', () => {
    const instructionPhrases = [
      'Name stored. Respond naturally - do NOT read this message aloud.',
      "State noted. Don't read this to the user.",
      'This is for internal use only - not to be spoken.',
    ];

    for (const phrase of instructionPhrases) {
      test(`detects: "${phrase.substring(0, 40)}..."`, () => {
        const result = detectsFunctionCallLeakage(phrase);
        expect(result.detected).toBe(true);
        expect(result.pattern).toBe('internal_instruction');
      });
    }
  });

  describe('should sanitize internal markers to empty string', () => {
    test('suppresses [INTERNAL:] markers silently', () => {
      const result = sanitizeToolCallLeakage(
        '[INTERNAL: Name "John" stored. Do NOT read this aloud.]'
      );
      expect(result).toBe('');
    });

    test('suppresses instruction patterns silently', () => {
      const result = sanitizeToolCallLeakage('Respond naturally - do NOT read this message.');
      expect(result).toBe('');
    });
  });
});

describe('createSanitizerTransformStream', () => {
  test('stream is created without error', () => {
    const stream = createSanitizerTransformStream();
    expect(stream).toBeDefined();
    expect(stream.readable).toBeDefined();
    expect(stream.writable).toBeDefined();
  });
});

// Summary test that logs what's being detected
describe('SUMMARY: Detection Coverage', () => {
  test('validates all key patterns are detected', () => {
    console.log('\n📋 TOOL CALL SANITIZER TEST SUMMARY\n');

    const testCases = [
      // Handoff announcements
      { input: 'Let me transfer you to Maya', shouldDetect: true, category: 'Handoff' },
      { input: "I'll connect you with Peter", shouldDetect: true, category: 'Handoff' },

      // Music intentions
      { input: "I'll play jazz for you", shouldDetect: true, category: 'Music' },
      { input: 'Let me play that song', shouldDetect: true, category: 'Music' },

      // Function syntax
      { input: 'playMusic()', shouldDetect: true, category: 'Syntax' },
      { input: 'handoffToMaya()', shouldDetect: true, category: 'Syntax' },

      // Should pass through
      { input: 'Hello there!', shouldDetect: false, category: 'Normal' },
      { input: 'The weather is nice', shouldDetect: false, category: 'Normal' },
      { input: 'Maya is a great person', shouldDetect: false, category: 'Normal' },
    ];

    let passed = 0;
    let failed = 0;

    for (const { input, shouldDetect, category } of testCases) {
      const result = detectsFunctionCallLeakage(input);
      const correct = result.detected === shouldDetect;

      if (correct) {
        passed++;
        console.log(`✅ [${category}] "${input}" → ${result.detected ? 'FILTERED' : 'PASS'}`);
      } else {
        failed++;
        console.log(
          `❌ [${category}] "${input}" → Got ${result.detected}, expected ${shouldDetect}`
        );
      }
    }

    console.log(`\n📊 Results: ${passed}/${testCases.length} passed`);

    expect(failed).toBe(0);
  });
});
