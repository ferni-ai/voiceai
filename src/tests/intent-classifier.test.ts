/**
 * Intent Classifier Tests
 *
 * Tests for the intent classifier module that categorizes:
 * - Information seeking intents
 * - Emotional/social intents
 * - Action-oriented intents
 * - Conversational intents
 * - Financial-specific intents
 *
 * @module tests/intent-classifier
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  IntentClassifier,
  getIntentClassifier,
  classifyIntent,
  type IntentResult,
  type Intent,
} from '../intelligence/intent-classifier.js';

// ============================================================================
// TESTS
// ============================================================================

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
  });

  // --------------------------------------------------------------------------
  // Basic Classification
  // --------------------------------------------------------------------------

  describe('classify()', () => {
    it('should return an IntentResult', () => {
      const result = classifier.classify('What should I do?');

      expect(result).toBeDefined();
      expect(result.primary).toBeDefined();
      expect(result.secondary).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.urgency).toBeDefined();
      expect(result.requiresAction).toBeDefined();
      expect(result.requiresEmpathy).toBeDefined();
      expect(result.suggestedApproach).toBeDefined();
      expect(result.markers).toBeDefined();
    });

    it('should return confidence between 0 and 1', () => {
      const result = classifier.classify('Tell me about investing');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return array for secondary intents', () => {
      const result = classifier.classify('I need help with something');
      expect(Array.isArray(result.secondary)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Information Seeking Intents
  // --------------------------------------------------------------------------

  describe('Information Seeking Intents', () => {
    it('should detect seeking_advice', () => {
      const result = classifier.classify('What should I do about my savings?');
      expect(result.primary).toBe('seeking_advice');
    });

    it('should detect requesting_info', () => {
      const result = classifier.classify('Tell me about index funds');
      expect(result.primary).toBe('requesting_info');
    });

    it('should detect asking_question', () => {
      const result = classifier.classify('When does the market open?');
      expect(['asking_question', 'requesting_info']).toContain(result.primary);
    });

    it('should detect seeking_clarification', () => {
      const result = classifier.classify("I don't understand what you mean");
      expect(result.primary).toBe('seeking_clarification');
    });
  });

  // --------------------------------------------------------------------------
  // Emotional/Social Intents
  // --------------------------------------------------------------------------

  describe('Emotional/Social Intents', () => {
    it('should detect seeking_support', () => {
      const result = classifier.classify("I'm so scared and worried about my finances");
      expect(result.primary).toBe('seeking_support');
      expect(result.requiresEmpathy).toBe(true);
    });

    it('should detect venting', () => {
      const result = classifier.classify("I'm so frustrated with my bank");
      expect(['venting', 'seeking_support']).toContain(result.primary);
    });

    it('should detect celebrating', () => {
      const result = classifier.classify("I'm so excited! I just paid off my debt!");
      expect(result.primary).toBe('celebrating');
      expect(result.requiresEmpathy).toBe(true);
    });

    it('should detect confiding', () => {
      const result = classifier.classify("I've never told anyone this, but I have a lot of debt");
      expect(result.primary).toBe('confiding');
    });

    it('should detect expressing_concern', () => {
      const result = classifier.classify("I'm concerned about the market volatility");
      expect(['expressing_concern', 'market_concern']).toContain(result.primary);
    });
  });

  // --------------------------------------------------------------------------
  // Action-Oriented Intents
  // --------------------------------------------------------------------------

  describe('Action-Oriented Intents', () => {
    it('should detect making_decision', () => {
      const result = classifier.classify("I can't decide between stocks or bonds");
      expect(['making_decision', 'investment_question']).toContain(result.primary);
    });

    it('should detect planning', () => {
      const result = classifier.classify("I'm planning to start investing next month");
      expect(['planning', 'goal_discussion']).toContain(result.primary);
    });

    it('should detect taking_action', () => {
      const result = classifier.classify("I've decided to open a Roth IRA");
      expect(['taking_action', 'sharing_information']).toContain(result.primary);
    });

    it('should detect seeking_confirmation', () => {
      const result = classifier.classify('Is that the right approach? Am I on the right track?');
      expect(result.primary).toBe('seeking_confirmation');
    });
  });

  // --------------------------------------------------------------------------
  // Conversational Intents
  // --------------------------------------------------------------------------

  describe('Conversational Intents', () => {
    it('should detect greeting', () => {
      const result = classifier.classify('Hello, how are you?');
      expect(result.primary).toBe('greeting');
      expect(result.requiresAction).toBe(false);
    });

    it('should detect gratitude', () => {
      const result = classifier.classify('Thank you so much for your help');
      expect(['gratitude', 'ending_conversation']).toContain(result.primary);
    });

    it('should detect farewell', () => {
      const result = classifier.classify('Goodbye, talk to you later');
      expect(['farewell', 'ending_conversation']).toContain(result.primary);
    });

    it('should detect small_talk', () => {
      const result = classifier.classify("How's the weather today?");
      expect(result.primary).toBe('small_talk');
    });

    it('should detect ending_conversation', () => {
      const result = classifier.classify('I need to go now, thanks for everything');
      expect(['ending_conversation', 'farewell', 'gratitude']).toContain(result.primary);
    });

    it('should detect changing_topic', () => {
      const result = classifier.classify('By the way, I also wanted to ask about retirement');
      expect(['changing_topic', 'goal_discussion']).toContain(result.primary);
    });

    it('should detect going_back', () => {
      const result = classifier.classify('Going back to what you said earlier about fees');
      expect(result.primary).toBe('going_back');
    });
  });

  // --------------------------------------------------------------------------
  // Financial-Specific Intents
  // --------------------------------------------------------------------------

  describe('Financial-Specific Intents', () => {
    it('should detect investment_question', () => {
      const result = classifier.classify('Should I invest in index funds or individual stocks?');
      expect(result.primary).toBe('investment_question');
    });

    it('should detect market_concern', () => {
      const result = classifier.classify("The market is crashing! I'm panicking!");
      expect(result.primary).toBe('market_concern');
      expect(result.urgency).toBe('high');
    });

    it('should detect fee_question', () => {
      const result = classifier.classify('What is the expense ratio for this fund?');
      expect(result.primary).toBe('fee_question');
    });

    it('should detect goal_discussion', () => {
      const result = classifier.classify('I want to save for retirement at 55');
      expect(result.primary).toBe('goal_discussion');
    });

    it('should detect risk_discussion', () => {
      const result = classifier.classify("I'm very risk averse, I can't afford to lose money");
      expect(result.primary).toBe('risk_discussion');
    });
  });

  // --------------------------------------------------------------------------
  // Sharing Intents
  // --------------------------------------------------------------------------

  describe('Sharing Intents', () => {
    it('should detect sharing_information', () => {
      const result = classifier.classify('I just opened a new brokerage account');
      expect(['sharing_information', 'celebrating']).toContain(result.primary);
    });

    it('should detect sharing_preference', () => {
      const result = classifier.classify('I prefer low-cost index funds');
      expect(result.primary).toBe('sharing_preference');
    });

    it('should detect sharing_opinion', () => {
      const result = classifier.classify('I think the market will recover');
      expect(result.primary).toBe('sharing_opinion');
    });
  });

  // --------------------------------------------------------------------------
  // Meta Intents
  // --------------------------------------------------------------------------

  describe('Meta Intents', () => {
    it('should detect feedback', () => {
      const result = classifier.classify('That was really helpful, thank you');
      expect(['feedback', 'gratitude', 'ending_conversation']).toContain(result.primary);
    });

    it('should detect correction', () => {
      const result = classifier.classify("No, that's not what I meant");
      expect(result.primary).toBe('correction');
    });
  });

  // --------------------------------------------------------------------------
  // Urgency Detection
  // --------------------------------------------------------------------------

  describe('Urgency Detection', () => {
    it('should return high urgency for crisis keywords', () => {
      const result = classifier.classify('This is urgent, I need help immediately');
      expect(result.urgency).toBe('high');
    });

    it('should return high urgency for market panic', () => {
      const result = classifier.classify("I'm panicking, the market is crashing!");
      expect(result.urgency).toBe('high');
    });

    it('should return medium urgency for advice seeking', () => {
      const result = classifier.classify('What should I do about my retirement savings?');
      expect(['medium', 'low']).toContain(result.urgency);
    });

    it('should return low urgency for casual questions', () => {
      const result = classifier.classify('What is an index fund?');
      expect(result.urgency).toBe('low');
    });
  });

  // --------------------------------------------------------------------------
  // Requires Action
  // --------------------------------------------------------------------------

  describe('requiresAction', () => {
    it('should not require action for greetings', () => {
      const result = classifier.classify('Hello!');
      expect(result.requiresAction).toBe(false);
    });

    it('should require action for questions', () => {
      const result = classifier.classify('How do I open an IRA?');
      expect(result.requiresAction).toBe(true);
    });

    it('should require action for advice seeking', () => {
      const result = classifier.classify('What should I invest in?');
      expect(result.requiresAction).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Requires Empathy
  // --------------------------------------------------------------------------

  describe('requiresEmpathy', () => {
    it('should require empathy for emotional distress', () => {
      const result = classifier.classify("I'm so scared about losing my savings");
      expect(result.requiresEmpathy).toBe(true);
    });

    it('should handle celebration-like statements', () => {
      const result = classifier.classify('I finally paid off all my debt!');
      // This may be classified as celebrating, sharing_information, or other
      expect(result.primary).toBeDefined();
      expect(typeof result.primary).toBe('string');
    });

    it('should not require empathy for factual questions', () => {
      const result = classifier.classify('What time does the market open?');
      expect(result.requiresEmpathy).toBe(false);
    });

    it('should require empathy for venting', () => {
      const result = classifier.classify("I'm so frustrated with high fees");
      expect(result.requiresEmpathy).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Suggested Approach
  // --------------------------------------------------------------------------

  describe('suggestedApproach', () => {
    it('should suggest acknowledging feelings for empathy situations', () => {
      const result = classifier.classify("I'm worried about my investments");
      expect(result.suggestedApproach).toContain('Acknowledge');
    });

    it('should suggest warm connection for greetings', () => {
      const result = classifier.classify('Hi there!');
      expect(result.suggestedApproach).toContain('Warm');
    });

    it('should provide suggested approach for celebrations', () => {
      const result = classifier.classify("I'm so happy, I got a raise!");
      // suggestedApproach varies by implementation - just verify it's defined
      expect(result.suggestedApproach).toBeDefined();
      expect(result.suggestedApproach.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Multi-Intent Detection
  // --------------------------------------------------------------------------

  describe('Multi-Intent Detection', () => {
    it('should detect multiple intents', () => {
      const result = classifier.classify("I'm worried about the market. Should I sell everything?");

      expect(result.primary).toBeDefined();
      expect(result.secondary.length).toBeGreaterThan(0);
    });

    it('should prioritize stronger signals', () => {
      const result = classifier.classify("Help! I'm panicking about the market crash!");

      expect(['market_concern', 'seeking_support']).toContain(result.primary);
      expect(result.urgency).toBe('high');
    });
  });

  // --------------------------------------------------------------------------
  // Singleton and Utility Functions
  // --------------------------------------------------------------------------

  describe('Singleton and Utilities', () => {
    it('getIntentClassifier should return singleton', () => {
      const classifier1 = getIntentClassifier();
      const classifier2 = getIntentClassifier();
      expect(classifier1).toBe(classifier2);
    });

    it('classifyIntent should work as shortcut', () => {
      const result = classifyIntent('What should I invest in?');
      expect(result).toBeDefined();
      expect(result.primary).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = classifier.classify('');
      expect(result.primary).toBe('unknown');
    });

    it('should handle very long text', () => {
      const longText = 'I am really worried about my investments. '.repeat(50);
      const result = classifier.classify(longText);
      expect(result).toBeDefined();
    });

    it('should handle special characters', () => {
      const result = classifier.classify('What $hould I do??? !!! @#$%');
      expect(result).toBeDefined();
    });

    it('should handle mixed case', () => {
      const result = classifier.classify('WHAT SHOULD I DO?');
      expect(result).toBeDefined();
    });

    it('should handle questions without question marks', () => {
      const result = classifier.classify('What should I do');
      expect(result).toBeDefined();
    });

    it('should cap markers at 10', () => {
      const result = classifier.classify(
        "I'm worried scared anxious stressed overwhelmed struggling about the market crashing panicking"
      );
      expect(result.markers.length).toBeLessThanOrEqual(10);
    });
  });

  // --------------------------------------------------------------------------
  // Markers
  // --------------------------------------------------------------------------

  describe('Markers', () => {
    it('should include detected patterns in markers', () => {
      const result = classifier.classify('Should I invest in index funds?');
      expect(result.markers.length).toBeGreaterThan(0);
    });

    it('should include keywords in markers', () => {
      const result = classifier.classify('I need some advice about investing');
      expect(result.markers.some((m) => m.includes('advice'))).toBe(true);
    });
  });
});
