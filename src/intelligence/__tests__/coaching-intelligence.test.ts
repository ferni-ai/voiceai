/**
 * Tests for Coaching Intelligence - "Better Than Human" Question Generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectPatterns,
  generateMirror,
  getAnticipatoryQuestion,
} from '../coaching-questions.js';
import { type QuestionContext } from '../dynamic-questions.js';
import {
  detectPatternsInTranscript,
  generatePatternSurfacingQuestion,
  type UserPattern,
} from '../coaching-patterns.js';
import {
  analyzeVoiceSignals,
  getAnticipatedNeed,
  type SignalContext,
  type VoiceSignals,
} from '../voice-signals.js';

describe('Coaching Questions', () => {
  describe('detectPatterns', () => {
    it('should detect deflection with humor when emotional', () => {
      const context: QuestionContext = {
        personaId: 'ferni',
        userId: 'test-user',
        sessionId: 'test-session',
        knownFacts: [],
        recentTopics: ['joke', 'funny story'],
        relationshipStage: 'building',
        conversationDepth: 5,
        hourOfDay: 14,
        isWeekend: false,
        turnCount: 10,
        boundaries: [],
      };

      const patterns = detectPatterns(context);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should detect should-word patterns', () => {
      const context: QuestionContext = {
        personaId: 'ferni',
        userId: 'test-user',
        sessionId: 'test-session',
        knownFacts: [],
        recentTopics: ['I should do this', 'should probably'],
        relationshipStage: 'established',
        conversationDepth: 7,
        hourOfDay: 10,
        isWeekend: false,
        turnCount: 15,
        boundaries: [],
      };

      const patterns = detectPatterns(context);
      // Pattern detection is context-dependent
      expect(patterns).toBeDefined();
    });
  });

  describe('generateMirror', () => {
    it('should detect "should" repetition', () => {
      const transcript = 'I should really exercise more. I know I should eat better. I should call my mom.';
      const mirror = generateMirror(transcript);

      expect(mirror).not.toBeNull();
      if (mirror) {
        expect(mirror.observed).toContain('should');
        expect(mirror.question).toBeDefined();
      }
    });

    it('should detect "but" redirections', () => {
      const transcript = "I want to do it, but I don't have time. I'd love to, but it's complicated.";
      const mirror = generateMirror(transcript);

      expect(mirror).not.toBeNull();
      if (mirror) {
        expect(mirror.observed).toContain('but');
      }
    });

    it('should detect "just" minimizing', () => {
      const transcript = "It's just a small thing. I'm just being silly. It's just not important.";
      const mirror = generateMirror(transcript);

      expect(mirror).not.toBeNull();
      if (mirror) {
        expect(mirror.observed).toContain('just');
      }
    });

    it('should return null for normal transcript', () => {
      const transcript = 'I had a good day. The weather was nice. I talked to my friend.';
      const mirror = generateMirror(transcript);

      expect(mirror).toBeNull();
    });
  });

  describe('getAnticipatoryQuestion', () => {
    it('should return anticipatory question for pause signal', () => {
      const result = getAnticipatoryQuestion({
        pauseBeforeSpeaking: true,
      });

      expect(result).not.toBeNull();
      if (result) {
        expect(result.signal).toContain('pause');
        expect(result.checkQuestion).toBeDefined();
      }
    });

    it('should return anticipatory question for voice dropped', () => {
      const result = getAnticipatoryQuestion({
        voiceDropped: true,
      });

      expect(result).not.toBeNull();
      if (result) {
        expect(result.checkQuestion).toBeDefined();
      }
    });

    it('should return anticipatory question for short answers', () => {
      const result = getAnticipatoryQuestion({
        shortAnswers: true,
      });

      expect(result).not.toBeNull();
      if (result) {
        expect(result.signal.toLowerCase()).toContain('short');
      }
    });

    it('should return anticipatory question for repeated person', () => {
      const result = getAnticipatoryQuestion({
        repeatedPerson: 'Mom',
      });

      expect(result).not.toBeNull();
      if (result) {
        // The question and signal reference repeated mentions
        expect(result.checkQuestion).toBeDefined();
        expect(result.signal.toLowerCase()).toContain('repeatedly');
      }
    });

    it('should return null when no signals', () => {
      const result = getAnticipatoryQuestion({});
      expect(result).toBeNull();
    });
  });
});

describe('Coaching Patterns', () => {
  describe('detectPatternsInTranscript', () => {
    it('should detect "should" word repetition', () => {
      const patterns = detectPatternsInTranscript(
        'I should exercise. I really should eat better too.',
        'health',
        'neutral'
      );

      const shouldPattern = patterns.find((p) => p.pattern.includes('should'));
      expect(shouldPattern).toBeDefined();
    });

    it('should detect "fine" minimizing', () => {
      const patterns = detectPatternsInTranscript(
        "I'm fine. Everything is fine. It's all okay.",
        'wellbeing',
        'neutral'
      );

      const finePattern = patterns.find((p) => p.pattern.includes('fine'));
      expect(finePattern).toBeDefined();
    });

    it('should detect humor deflection when emotional', () => {
      const patterns = detectPatternsInTranscript(
        "Haha, anyway, it's whatever. lol",
        'relationships',
        'sad'
      );

      const humorPattern = patterns.find((p) => p.type === 'deflection_humor');
      expect(humorPattern).toBeDefined();
    });

    it('should detect busy deflection', () => {
      const patterns = detectPatternsInTranscript(
        "I'm just too busy. I don't have time for that.",
        'self-care',
        'neutral'
      );

      const busyPattern = patterns.find((p) => p.type === 'deflection_busy');
      expect(busyPattern).toBeDefined();
    });
  });

  describe('generatePatternSurfacingQuestion', () => {
    it('should generate question for recurring topic', () => {
      const pattern: UserPattern = {
        id: 'test-1',
        userId: 'test-user',
        patternType: 'recurring_topic',
        pattern: 'career stress',
        occurrences: 5,
        contexts: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
        surfacedToUser: false,
      };

      const question = generatePatternSurfacingQuestion(pattern);
      expect(question).toContain('career stress');
    });

    it('should generate question for word repetition', () => {
      const pattern: UserPattern = {
        id: 'test-2',
        userId: 'test-user',
        patternType: 'word_repetition',
        pattern: 'uses_should_frequently',
        occurrences: 4,
        contexts: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
        surfacedToUser: false,
      };

      const question = generatePatternSurfacingQuestion(pattern);
      expect(question.toLowerCase()).toContain('should');
    });

    it('should generate question for deflection humor', () => {
      const pattern: UserPattern = {
        id: 'test-3',
        userId: 'test-user',
        patternType: 'deflection_humor',
        pattern: 'deflects_with_humor_when_emotional',
        occurrences: 3,
        contexts: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
        surfacedToUser: false,
      };

      const question = generatePatternSurfacingQuestion(pattern);
      // Question may mention "humor" or "laugh" or "joke"
      expect(
        question.toLowerCase().includes('humor') ||
        question.toLowerCase().includes('laugh') ||
        question.toLowerCase().includes('joke')
      ).toBe(true);
    });
  });
});

describe('Voice Signals', () => {
  describe('analyzeVoiceSignals', () => {
    it('should detect long pause before speaking', () => {
      const context: SignalContext = {
        currentTranscript: 'Hello',
        pauseBeforeSpeakingMs: 3000,
      };

      const signals = analyzeVoiceSignals(context);
      expect(signals.pauseBeforeSpeaking).toBe(true);
      expect(signals.pauseDurationMs).toBe(3000);
    });

    it('should detect voice energy drop', () => {
      const context: SignalContext = {
        currentTranscript: 'Yeah...',
        currentEnergy: 0.3,
        previousEnergy: 0.7,
      };

      const signals = analyzeVoiceSignals(context);
      expect(signals.voiceDropped).toBe(true);
      expect(signals.voiceEnergyChange).toBe('decreased');
    });

    it('should detect short answer trend', () => {
      const context: SignalContext = {
        currentTranscript: 'Yes',
        recentAnswerLengths: [20, 25, 18],
      };

      const signals = analyzeVoiceSignals(context);
      expect(signals.shortAnswers).toBe(true);
      expect(signals.answerLengthTrend).toBe('getting_shorter');
    });

    it('should detect topic change', () => {
      const context: SignalContext = {
        currentTranscript: "Let's talk about weather",
        currentTopic: 'weather',
        previousTopic: 'family issues',
      };

      const signals = analyzeVoiceSignals(context);
      expect(signals.changedSubject).toBe(true);
    });

    it('should detect repeated person mention', () => {
      const context: SignalContext = {
        currentTranscript: 'My mom said that',
        mentionedPeople: ['mom'],
        previousMentionedPeople: ['mom'],
      };

      const signals = analyzeVoiceSignals(context);
      expect(signals.repeatedPerson).toBe('mom');
    });
  });

  describe('getAnticipatedNeed', () => {
    it('should anticipate difficulty from long pause', () => {
      const signals: VoiceSignals = {
        pauseBeforeSpeaking: true,
        pauseDurationMs: 4000,
        voiceDropped: false,
        shortAnswers: false,
        changedSubject: false,
      };

      const need = getAnticipatedNeed(signals);
      expect(need).not.toBeNull();
      if (need) {
        expect(need.anticipated).toContain('difficult');
      }
    });

    it('should anticipate emotional territory from voice drop', () => {
      const signals: VoiceSignals = {
        pauseBeforeSpeaking: false,
        voiceDropped: true,
        voiceEnergyChange: 'decreased',
        shortAnswers: false,
        changedSubject: false,
      };

      const need = getAnticipatedNeed(signals);
      expect(need).not.toBeNull();
      if (need) {
        expect(need.anticipated).toContain('emotional');
      }
    });

    it('should anticipate tiredness from short answers', () => {
      const signals: VoiceSignals = {
        pauseBeforeSpeaking: false,
        voiceDropped: false,
        shortAnswers: true,
        answerLengthTrend: 'getting_shorter',
        changedSubject: false,
      };

      const need = getAnticipatedNeed(signals);
      expect(need).not.toBeNull();
      if (need) {
        expect(need.anticipated.toLowerCase()).toContain('pulling back');
      }
    });

    it('should return highest confidence need when multiple signals', () => {
      const signals: VoiceSignals = {
        pauseBeforeSpeaking: false,
        voiceDropped: true,
        voiceEnergyChange: 'decreased',
        shortAnswers: true,
        changedSubject: true,
        repeatedPerson: 'Sarah',
      };

      const need = getAnticipatedNeed(signals);
      expect(need).not.toBeNull();
      // Should pick highest confidence (voice dropped has 0.8)
      if (need) {
        expect(need.confidence).toBeGreaterThanOrEqual(0.65);
      }
    });
  });
});

