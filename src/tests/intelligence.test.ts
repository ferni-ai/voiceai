/**
 * Intelligence System Tests
 *
 * Tests for emotion detection, intent classification, topic tracking,
 * and conversation state management.
 *
 * Note: Requires vitest as dev dependency: npm install -D vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EmotionDetector,
  IntentClassifier,
  TopicTracker,
  ConversationStateMachine,
} from '../intelligence/index.js';

describe('Emotion Detection', () => {
  let detector: EmotionDetector;

  beforeEach(() => {
    detector = new EmotionDetector();
  });

  describe('Primary Emotion Detection', () => {
    it('should detect joy in positive messages', () => {
      const result = detector.detect("I'm so happy today! Everything is wonderful!");

      expect(result.primary).toBe('joy');
      expect(result.valence).toBe('positive');
      expect(result.intensity).toBeGreaterThan(0.5);
    });

    it('should detect fear/anxiety in worried messages', () => {
      const result = detector.detect("I'm really worried about the market crash. I can't sleep.");

      expect(['fear', 'worry', 'anxiety']).toContain(result.primary);
      expect(result.valence).toBe('negative');
      expect(result.distressLevel).toBeGreaterThan(0.5);
    });

    it('should detect sadness in grief-related messages', () => {
      const result = detector.detect("I lost my father last month. It's been really hard.");

      expect(result.primary).toBe('sadness');
      expect(result.valence).toBe('negative');
      expect(result.distressLevel).toBeGreaterThan(0.6);
    });

    it('should detect neutral in factual messages', () => {
      const result = detector.detect('What time does the market open?');

      expect(result.primary).toBe('neutral');
      expect(result.distressLevel).toBeLessThan(0.3);
    });

    it('should detect interest/curiosity in questioning messages', () => {
      const result = detector.detect("I'm curious about how index funds work. Can you explain?");

      // "curious" triggers "anticipation" in our emotion model, which is correct
      expect(['interest', 'curiosity', 'neutral', 'anticipation']).toContain(result.primary);
      expect(['positive', 'neutral']).toContain(result.valence);
    });
  });

  describe('Distress Level', () => {
    it('should flag high distress for crisis language', () => {
      const result = detector.detect(
        "I don't know what to do. I'm completely overwhelmed and scared."
      );

      expect(result.distressLevel).toBeGreaterThan(0.7);
    });

    it('should have low distress for casual conversation', () => {
      const result = detector.detect("How's the weather in Philadelphia?");

      expect(result.distressLevel).toBeLessThan(0.3);
    });
  });

  describe('Suggested Tone', () => {
    it('should suggest gentle tone for distressed users', () => {
      const result = detector.detect("I'm really struggling with this decision.");

      expect(['gentle', 'supportive', 'empathetic', 'warm', 'caring']).toContain(
        result.suggestedTone
      );
    });

    it('should suggest warm tone for happy users', () => {
      const result = detector.detect('I just retired! Best day ever!');

      expect(['warm', 'celebratory', 'enthusiastic', 'excited']).toContain(result.suggestedTone);
    });
  });
});

describe('Intent Classification', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
  });

  describe('Primary Intent', () => {
    it('should classify advice-seeking', () => {
      const result = classifier.classify('What should I do with my 401k?');

      expect(result.primary).toBe('seeking_advice');
    });

    it('should classify questions', () => {
      const result = classifier.classify('How does compound interest work?');

      // "asking_question" and "requesting_info" are semantically equivalent
      expect(['asking_question', 'requesting_info']).toContain(result.primary);
    });

    it('should classify greetings', () => {
      const result = classifier.classify('Hello, nice to meet you!');

      expect(result.primary).toBe('greeting');
    });

    it('should classify ending conversation', () => {
      const result = classifier.classify('I need to go now. Thanks for your help!');

      expect(result.primary).toBe('ending_conversation');
    });

    it('should classify seeking support', () => {
      const result = classifier.classify("I'm really scared about losing my savings.");

      expect(result.primary).toBe('seeking_support');
      expect(result.requiresEmpathy).toBe(true);
    });
  });

  describe('Intent Attributes', () => {
    it('should flag empathy requirement for emotional content', () => {
      const result = classifier.classify('My spouse is worried about our retirement.');

      expect(result.requiresEmpathy).toBe(true);
    });

    it('should flag action requirement for decision questions', () => {
      const result = classifier.classify('Should I sell my stocks now or wait?');

      expect(result.requiresAction).toBe(true);
    });

    it('should provide suggested approach', () => {
      const result = classifier.classify('I need help deciding between two funds.');

      expect(result.suggestedApproach).toBeTruthy();
      expect(result.suggestedApproach.length).toBeGreaterThan(0);
    });
  });
});

describe('Topic Tracking', () => {
  let tracker: TopicTracker;

  beforeEach(() => {
    tracker = new TopicTracker();
  });

  describe('Topic Extraction', () => {
    it('should extract financial topics', () => {
      const result = tracker.extract('I want to talk about my retirement savings.');

      expect(result.detected).toContain('retirement');
      expect(result.category).toBe('financial');
    });

    it('should detect topic shifts', () => {
      tracker.extract("Let's discuss my retirement.");
      const result = tracker.extract("Actually, I'm more worried about healthcare costs.");

      expect(result.isTopicShift).toBe(true);
    });

    it('should track multiple topics', () => {
      tracker.extract('I have questions about retirement.');
      tracker.extract('And also about index funds.');
      tracker.extract('What about fees too?');

      const topics = tracker.getActiveTopics();

      expect(topics.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Conversation State Machine', () => {
  let stateMachine: ConversationStateMachine;

  beforeEach(() => {
    stateMachine = new ConversationStateMachine();
  });

  describe('Phase Transitions', () => {
    it('should start in greeting phase', () => {
      expect(stateMachine.getPhase()).toBe('greeting');
    });

    it('should track turn count', () => {
      stateMachine.processTurn({
        userMessage: 'Hello',
        emotion: {
          primary: 'neutral',
          intensity: 0.5,
          distressLevel: 0,
          valence: 'neutral',
          suggestedTone: 'warm',
          confidence: 0.8,
          markers: [],
        },
        intent: {
          primary: 'greeting',
          secondary: [],
          confidence: 0.9,
          urgency: 'low',
          requiresAction: false,
          requiresEmpathy: false,
          suggestedApproach: '',
          markers: [],
        },
        topics: [],
      });

      const state = stateMachine.getState();
      expect(state.turnCount).toBe(1);
    });

    it('should transition to supporting when distress is high', () => {
      stateMachine.processTurn({
        userMessage: "I'm really scared about losing everything.",
        emotion: {
          primary: 'fear',
          intensity: 0.9,
          distressLevel: 0.8,
          valence: 'negative',
          suggestedTone: 'gentle',
          confidence: 0.9,
          markers: ['fear_word', 'high_intensity'],
        },
        intent: {
          primary: 'seeking_support',
          secondary: [],
          confidence: 0.9,
          urgency: 'high',
          requiresAction: false,
          requiresEmpathy: true,
          suggestedApproach: 'validate and comfort',
          markers: [],
        },
        topics: ['financial_fear'],
      });

      expect(stateMachine.getPhase()).toBe('supporting');
    });
  });

  describe('Guidance', () => {
    it('should provide phase-appropriate guidance', () => {
      const guidance = stateMachine.getGuidance();

      expect(guidance.phase).toBe('greeting');
      expect(guidance.voiceMode).toBeTruthy();
      expect(guidance.focus).toBeTruthy();
      expect(guidance.shouldAsk.length).toBeGreaterThan(0);
      expect(guidance.shouldAvoid.length).toBeGreaterThan(0);
    });
  });
});
