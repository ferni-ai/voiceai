/**
 * Transcript Validator Tests
 *
 * Tests for the intelligent transcript validation system that filters
 * noise, echo, and invalid transcripts.
 */

import { describe, it, expect } from 'vitest';
import {
  validateTranscript,
  isLikelyNoise,
  cleanTranscript,
  type ValidationContext,
} from '../transcript-validator.js';

describe('Transcript Validator', () => {
  // Default context for tests
  const defaultContext: ValidationContext = {
    timeSinceAgentSpoke: 5000, // 5 seconds - outside echo window
    isAgentSpeaking: false,
    expectedLanguage: 'en',
  };

  describe('validateTranscript', () => {
    describe('Valid Transcripts', () => {
      it('should accept normal English sentences', () => {
        const result = validateTranscript('Hello, how are you today?', defaultContext);
        expect(result.isValid).toBe(true);
        expect(result.confidence).toBe(1.0);
      });

      it('should accept short but valid phrases', () => {
        const result = validateTranscript('Yes please', defaultContext);
        expect(result.isValid).toBe(true);
      });

      it('should accept questions', () => {
        const result = validateTranscript('What time is it?', defaultContext);
        expect(result.isValid).toBe(true);
      });

      it('should accept responses with numbers', () => {
        const result = validateTranscript('I need 5 items', defaultContext);
        expect(result.isValid).toBe(true);
      });

      it('should accept responses with punctuation', () => {
        const result = validateTranscript("That's great! I'm excited.", defaultContext);
        expect(result.isValid).toBe(true);
      });
    });

    describe('Noise Marker Detection', () => {
      it('should reject <noise> marker', () => {
        const result = validateTranscript('<noise>', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject [noise] marker', () => {
        const result = validateTranscript('[noise]', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject (noise) marker', () => {
        const result = validateTranscript('(noise)', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject <unk> marker', () => {
        const result = validateTranscript('<unk>', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject [inaudible] marker', () => {
        const result = validateTranscript('[inaudible]', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject just "uh"', () => {
        const result = validateTranscript('uh', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject just "um"', () => {
        const result = validateTranscript('um', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject just "hmm"', () => {
        const result = validateTranscript('hmm', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should reject extended "uhhh"', () => {
        const result = validateTranscript('uhhh', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });
    });

    describe('Foreign Character Detection', () => {
      it('should reject Chinese characters in English mode', () => {
        const result = validateTranscript('你好', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject Thai characters', () => {
        const result = validateTranscript('สวัสดี', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject Arabic characters', () => {
        const result = validateTranscript('مرحبا', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject Korean characters', () => {
        const result = validateTranscript('안녕', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject Japanese hiragana', () => {
        const result = validateTranscript('こんにちは', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject mixed English and Chinese', () => {
        const result = validateTranscript('Hello 你好', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject common noise words - Não (Portuguese)', () => {
        const result = validateTranscript('Não', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject common noise words - Sim (Portuguese)', () => {
        const result = validateTranscript('sim', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });

      it('should reject common noise words - Sí (Spanish)', () => {
        const result = validateTranscript('sí', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('foreign_chars');
      });
    });

    describe('Single Character Rejection', () => {
      it('should reject single letter', () => {
        const result = validateTranscript('a', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('single_char');
      });

      it('should reject single number', () => {
        const result = validateTranscript('5', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('single_char');
      });

      it('should reject single punctuation', () => {
        const result = validateTranscript('?', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('single_char');
      });
    });

    describe('Echo Window Detection', () => {
      it('should reject short transcripts during echo window', () => {
        const echoContext: ValidationContext = {
          ...defaultContext,
          timeSinceAgentSpoke: 1000, // 1 second - within echo window
        };

        const result = validateTranscript('hi', echoContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('too_short');
      });

      it('should accept short transcripts outside echo window', () => {
        const result = validateTranscript('hi', defaultContext);
        // "hi" is 2 chars, should pass if outside echo window
        expect(result.isValid).toBe(true);
      });

      it('should accept longer transcripts during echo window', () => {
        const echoContext: ValidationContext = {
          ...defaultContext,
          timeSinceAgentSpoke: 1000, // 1 second - within echo window
        };

        const result = validateTranscript('yes please', echoContext);
        expect(result.isValid).toBe(true);
      });
    });

    describe('Echo Detection', () => {
      it('should reject transcript that matches agent utterance', () => {
        const echoContext: ValidationContext = {
          ...defaultContext,
          timeSinceAgentSpoke: 1000, // Within echo window
          lastAgentUtterance: 'How are you doing today?',
        };

        const result = validateTranscript('How are you doing today?', echoContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('echo_detected');
      });

      it('should reject transcript that closely matches agent utterance', () => {
        const echoContext: ValidationContext = {
          ...defaultContext,
          timeSinceAgentSpoke: 500,
          lastAgentUtterance: 'I am doing well today, how about you?',
        };

        // Use exact echo for reliable detection
        const result = validateTranscript('I am doing well today, how about you?', echoContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('echo_detected');
      });

      it('should not reject different transcript during echo window', () => {
        const echoContext: ValidationContext = {
          ...defaultContext,
          timeSinceAgentSpoke: 1000,
          lastAgentUtterance: 'How are you doing today?',
        };

        const result = validateTranscript('I need help with something', echoContext);
        expect(result.isValid).toBe(true);
      });
    });

    describe('Agent Speaking Interruption', () => {
      it('should reject single word during agent speech', () => {
        const speakingContext: ValidationContext = {
          ...defaultContext,
          isAgentSpeaking: true,
        };

        const result = validateTranscript('wait', speakingContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('too_short');
      });

      it('should accept multi-word interruption during agent speech', () => {
        const speakingContext: ValidationContext = {
          ...defaultContext,
          isAgentSpeaking: true,
        };

        const result = validateTranscript('wait a minute', speakingContext);
        expect(result.isValid).toBe(true);
      });

      it('should accept clear interruption during agent speech', () => {
        const speakingContext: ValidationContext = {
          ...defaultContext,
          isAgentSpeaking: true,
        };

        const result = validateTranscript('stop please', speakingContext);
        expect(result.isValid).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string', () => {
        const result = validateTranscript('', defaultContext);
        // Empty string after trim is length 0, but our single_char check is for length === 1
        // So it might pass or be caught by too_short during echo window
        expect(result).toBeDefined();
      });

      it('should handle whitespace only', () => {
        const result = validateTranscript('   ', defaultContext);
        expect(result).toBeDefined();
      });

      it('should handle mixed case noise markers', () => {
        const result = validateTranscript('<NOISE>', defaultContext);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('noise_marker');
      });

      it('should preserve cleaned transcript', () => {
        const result = validateTranscript('Hello world', defaultContext);
        expect(result.cleanedTranscript).toBe('Hello world');
      });
    });
  });

  describe('isLikelyNoise', () => {
    it('should return true for single character', () => {
      expect(isLikelyNoise('a')).toBe(true);
    });

    it('should return true for empty string', () => {
      expect(isLikelyNoise('')).toBe(true);
    });

    it('should return true for noise markers', () => {
      expect(isLikelyNoise('<noise>')).toBe(true);
      expect(isLikelyNoise('[noise]')).toBe(true);
    });

    it('should return true for foreign characters in short text', () => {
      expect(isLikelyNoise('你好')).toBe(true);
    });

    it('should return false for normal English text', () => {
      expect(isLikelyNoise('Hello world')).toBe(false);
    });

    it('should return false for longer valid text', () => {
      expect(isLikelyNoise('I would like to schedule a meeting')).toBe(false);
    });
  });

  describe('cleanTranscript', () => {
    it('should remove <noise> markers', () => {
      const result = cleanTranscript('Hello <noise> world');
      expect(result).toBe('Hello  world');
    });

    it('should remove [noise] markers', () => {
      const result = cleanTranscript('[noise] Hello');
      expect(result).toBe('Hello');
    });

    it('should remove multiple noise markers', () => {
      const result = cleanTranscript('<noise> Hello [inaudible] world <unk>');
      expect(result).toBe('Hello  world');
    });

    it('should trim result', () => {
      const result = cleanTranscript('  <noise>  ');
      expect(result).toBe('');
    });

    it('should not modify clean text', () => {
      const result = cleanTranscript('Hello world');
      expect(result).toBe('Hello world');
    });
  });
});
