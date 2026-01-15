import { describe, it, expect, beforeEach } from 'vitest';
import { IntentClassifier } from '../intelligence/detectors/intent.js';

describe('Intent Classifier - Financial Intents Tests', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
  });

  describe('Investment Questions', () => {
    it('should detect investment questions', () => {
      const result = classifier.classify('Should I invest in stocks or bonds?');

      expect(result.primary).toBe('investment_question');
      expect(result.requiresAction).toBe(true);
    });

    it('should detect seeking_advice for investment decisions', () => {
      const result = classifier.classify('What should I do with my 401k?');

      expect(['seeking_advice', 'investment_question']).toContain(result.primary);
    });

    it('should detect portfolio allocation questions', () => {
      const result = classifier.classify('How should I allocate my portfolio?');

      expect(['seeking_advice', 'investment_question']).toContain(result.primary);
    });

    it('should detect fund selection questions', () => {
      const result = classifier.classify('Which index fund should I choose?');

      expect(result.primary).toBe('investment_question');
    });
  });

  describe('Market Concerns', () => {
    it('should detect market concern with high urgency', () => {
      const result = classifier.classify('The market is crashing! Should I sell everything?');

      expect(['market_concern', 'seeking_advice']).toContain(result.primary);
      expect(result.urgency).toBe('high');
      expect(result.requiresEmpathy).toBe(true);
    });

    it('should distinguish between concern and panic', () => {
      const concern = classifier.classify("I'm watching the market closely");
      const panic = classifier.classify("I'm panicking about the market crash!");

      expect(panic.urgency).toBe('high');
      expect(['low', 'medium']).toContain(concern.urgency);
    });

    it('should detect volatility concerns', () => {
      const result = classifier.classify('The market is so volatile lately');

      expect(['market_concern', 'expressing_concern']).toContain(result.primary);
    });
  });

  describe('Fee Questions', () => {
    it('should detect fee questions', () => {
      const result = classifier.classify('What are the fees for this fund?');

      expect(result.primary).toBe('fee_question');
    });

    it('should detect expense ratio questions', () => {
      const result = classifier.classify('What is the expense ratio?');

      expect(result.primary).toBe('fee_question');
    });

    it('should detect cost comparison questions', () => {
      const result = classifier.classify('Are the fees lower at Vanguard?');

      expect(result.primary).toBe('fee_question');
    });
  });

  describe('Goal Discussion', () => {
    it('should detect retirement goals', () => {
      const result = classifier.classify('I want to retire at 65 with $2 million');

      expect(['goal_discussion', 'planning']).toContain(result.primary);
    });

    it('should detect college savings goals', () => {
      const result = classifier.classify("I need to save for my kid's college");

      expect(['goal_discussion', 'planning']).toContain(result.primary);
    });

    it('should detect financial independence goals', () => {
      const result = classifier.classify('My goal is to achieve financial independence');

      expect(result.primary).toBe('goal_discussion');
    });

    it('should detect short-term goals', () => {
      const result = classifier.classify("I'm saving for a house down payment");

      expect(['goal_discussion', 'planning']).toContain(result.primary);
    });
  });

  describe('Risk Discussion', () => {
    it('should detect risk tolerance questions', () => {
      const result = classifier.classify('How much risk should I take?');

      expect(result.primary).toBe('risk_discussion');
    });

    it('should detect sleep-at-night test', () => {
      const result = classifier.classify("I can't sleep at night worrying about my investments");

      expect(result.primary).toBeTruthy();
      expect(result.requiresEmpathy).toBe(true);
    });

    it('should detect risk aversion', () => {
      const result = classifier.classify("I'm very risk-averse");

      expect(['risk_discussion', 'sharing_preference']).toContain(result.primary);
    });
  });

  describe('Information Requests', () => {
    it('should detect definition requests', () => {
      const result = classifier.classify('What is an index fund?');

      expect(result.primary).toBe('requesting_info');
    });

    it('should detect explanation requests', () => {
      const result = classifier.classify('Can you explain dollar-cost averaging?');

      expect(result.primary).toBe('requesting_info');
    });

    it('should detect how-to questions', () => {
      const result = classifier.classify('How do I rebalance my portfolio?');

      expect(['requesting_info', 'seeking_advice']).toContain(result.primary);
    });
  });

  describe('Multi-Intent Classification', () => {
    it('should detect multiple intents in complex messages', () => {
      const result = classifier.classify(
        "I'm worried about the market. Should I move to bonds? What are the fees?"
      );

      expect(result.secondary.length).toBeGreaterThan(0);
      // Should detect market_concern, investment_question, and fee_question
    });

    it('should prioritize primary intent', () => {
      const result = classifier.classify('Help! The market is crashing! What should I do?');

      expect(result.urgency).toBe('high');
      expect(result.primary).toBeTruthy();
    });

    it('should detect advice-seeking with context', () => {
      const result = classifier.classify(
        "I just inherited $100k. What should I do with it? I'm new to investing."
      );

      expect(result.primary).toBe('seeking_advice');
      expect(result.requiresAction).toBe(true);
    });
  });

  describe('Urgency Detection', () => {
    it('should mark crisis keywords as high urgency', () => {
      const result = classifier.classify('This is urgent! I need advice immediately!');

      expect(result.urgency).toBe('high');
    });

    it('should mark casual questions as low urgency', () => {
      const result = classifier.classify('What is an index fund?');

      expect(result.urgency).toBe('low');
    });

    it('should detect moderate urgency', () => {
      const result = classifier.classify('I should probably rebalance soon');

      expect(result.urgency).toBe('medium');
    });

    it('should prioritize urgency for financial distress', () => {
      const result = classifier.classify('I just lost my job and need to tap into my 401k');

      expect(result.urgency).toBe('high');
      expect(result.requiresEmpathy).toBe(true);
    });
  });

  describe('Suggested Approach', () => {
    it('should suggest empathy first for venting', () => {
      const result = classifier.classify("I'm so frustrated with these market losses");

      expect(result.primary).toBe('venting');
      expect(result.requiresEmpathy).toBe(true);
    });

    it('should suggest exploration for seeking_advice', () => {
      const result = classifier.classify('What should I do about my investments?');

      expect(result.primary).toBe('seeking_advice');
      expect(result.requiresAction).toBe(true);
    });

    it('should suggest informative approach for requesting_info', () => {
      const result = classifier.classify('Tell me about Vanguard funds');

      expect(result.primary).toBe('requesting_info');
      expect(result.requiresAction).toBe(true);
    });
  });

  describe('Social Intents', () => {
    it('should detect greetings', () => {
      const result = classifier.classify('Hi Jack, how are you?');

      expect(result.primary).toBe('greeting');
      expect(result.requiresAction).toBe(false);
    });

    it('should detect gratitude', () => {
      const result = classifier.classify('Thank you so much for your help!');

      expect(result.primary).toBe('gratitude');
    });

    it('should detect farewells', () => {
      const result = classifier.classify('I need to go now. Thanks for everything!');

      expect(result.primary).toBe('farewell');
    });

    it('should detect small talk', () => {
      const result = classifier.classify("How's the weather in your area?");

      expect(result.primary).toBe('small_talk');
    });
  });

  describe('Emotional Support Needs', () => {
    it('should detect when empathy is required', () => {
      const result = classifier.classify("I'm scared about losing money");

      expect(result.requiresEmpathy).toBe(true);
    });

    it('should detect validation needs', () => {
      const result = classifier.classify('Am I doing this right? I feel so unsure.');

      expect(result.requiresEmpathy).toBe(true);
    });

    it('should not require empathy for factual questions', () => {
      const result = classifier.classify('What time does the market close?');

      expect(result.requiresEmpathy).toBe(false);
    });
  });

  describe('Sharing vs. Seeking', () => {
    it('should distinguish sharing information from seeking advice', () => {
      const sharing = classifier.classify('I just opened a Roth IRA');
      const seeking = classifier.classify('Should I open a Roth IRA?');

      expect(sharing.primary).toBe('sharing_information');
      expect(seeking.primary).toBe('seeking_advice');
    });

    it('should detect preference sharing', () => {
      const result = classifier.classify('I prefer Vanguard funds');

      expect(result.primary).toBe('sharing_preference');
    });

    it('should detect opinion sharing', () => {
      const result = classifier.classify('I think low-cost funds are the best');

      expect(['sharing_opinion', 'sharing_preference']).toContain(result.primary);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(() => classifier.classify('')).not.toThrow();
      const result = classifier.classify('');

      expect(result).toBeTruthy();
      expect(result.primary).toBeTruthy();
    });

    it('should handle very long text', () => {
      const longText = "I'm worried about my investments. ".repeat(50);

      expect(() => classifier.classify(longText)).not.toThrow();
      const result = classifier.classify(longText);

      expect(result.primary).toBeTruthy();
    });

    it('should handle mixed languages gracefully', () => {
      const result = classifier.classify('What is a 401k? Je ne comprends pas.');

      expect(result.primary).toBeTruthy();
    });

    it('should handle questions with typos', () => {
      const result = classifier.classify('What shuld I do with my retirment savings?');

      expect(result.primary).toBeTruthy();
    });

    it('should handle all caps', () => {
      const result = classifier.classify('WHAT SHOULD I DO WITH MY 401K?');

      expect(result.primary).toBeTruthy();
    });
  });
});
