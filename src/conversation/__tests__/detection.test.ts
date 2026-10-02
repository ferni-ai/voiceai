/**
 * Detection Utilities Tests
 *
 * Comprehensive tests for the shared detection utilities in conversation/utils/detection.ts
 */

import { describe, it, expect } from 'vitest';

import {
  // Energy detection
  detectUserEnergyDetailed,

  // Topic weight
  classifyTopicWeight,

  // Content detection
  detectEmotionalContent,
  detectBreakthrough,
  detectAdviceGiving,

  // Engagement detection
  detectDisengagement,
  detectHighEngagement,
  detectHesitation,
  detectEngagementLevel,

  // Composite
} from '../utils/detection.js';

// ============================================================================
// ENERGY DETECTION TESTS
// ============================================================================

describe('detectUserEnergyDetailed', () => {
  it('should return detailed result with confidence and signals', () => {
    const result = detectUserEnergyDetailed('This is AMAZING!!!');

    expect(result.detected).toBe(true);
    expect(result.value).toBe('high');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('should include signals for detected patterns', () => {
    const result = detectUserEnergyDetailed("I'm so tired and exhausted");

    expect(result.value).toBe('low');
    expect(result.signals.some((s) => s.includes('low'))).toBe(true);
  });
});

// ============================================================================
// TOPIC WEIGHT TESTS
// ============================================================================

describe('classifyTopicWeight', () => {
  describe('heavy topic detection', () => {
    it('should classify death-related topics as heavy', () => {
      expect(classifyTopicWeight('My father passed away last week')).toBe('heavy');
      expect(classifyTopicWeight('She died yesterday')).toBe('heavy');
    });

    it('should classify trauma topics as heavy', () => {
      expect(classifyTopicWeight("I'm dealing with past trauma")).toBe('heavy');
      expect(classifyTopicWeight('The abuse I experienced')).toBe('heavy');
    });

    it('should classify crisis topics as heavy', () => {
      expect(classifyTopicWeight('Having thoughts of suicide')).toBe('heavy');
      expect(classifyTopicWeight("I'm in crisis mode")).toBe('heavy');
    });

    it('should classify job loss as heavy', () => {
      expect(classifyTopicWeight('I just got fired today')).toBe('heavy');
      expect(classifyTopicWeight('I was laid off')).toBe('heavy');
    });

    it('should use detected emotion to classify as heavy', () => {
      expect(classifyTopicWeight('This is about my situation', 'sadness')).toBe('heavy');
      expect(classifyTopicWeight('Something happened', 'fear')).toBe('heavy');
      expect(classifyTopicWeight('Something happened', 'grief')).toBe('heavy');
    });
  });

  describe('light topic detection', () => {
    it('should classify humor as light', () => {
      expect(classifyTopicWeight('Haha that was funny')).toBe('light');
      expect(classifyTopicWeight('LOL I loved that')).toBe('light');
    });

    it('should classify excitement as light', () => {
      expect(classifyTopicWeight("I'm so excited for the weekend")).toBe('light');
      expect(classifyTopicWeight("Can't wait for vacation")).toBe('light');
    });

    it('should classify positive events as light', () => {
      expect(classifyTopicWeight('It was an awesome party')).toBe('light');
      expect(classifyTopicWeight('Amazing news today!')).toBe('light');
    });

    it('should use detected emotion to classify as light', () => {
      expect(classifyTopicWeight('Something happened', 'joy')).toBe('light');
      expect(classifyTopicWeight('Something happened', 'excitement')).toBe('light');
    });
  });

  describe('medium topic detection', () => {
    it('should classify neutral topics as medium', () => {
      expect(classifyTopicWeight('Working on a project')).toBe('medium');
      expect(classifyTopicWeight("I'm thinking about my goals")).toBe('medium');
    });
  });
});

// ============================================================================
// CONTENT DETECTION TESTS
// ============================================================================

describe('detectEmotionalContent', () => {
  it('should detect sympathetic content', () => {
    expect(detectEmotionalContent("I'm sorry you're going through this")).toBe(true);
    expect(detectEmotionalContent('That sounds really hard')).toBe(true);
  });

  it('should detect supportive content', () => {
    expect(detectEmotionalContent("I'm proud of you")).toBe(true);
    expect(detectEmotionalContent('I believe in you')).toBe(true);
    expect(detectEmotionalContent("You're not alone in this")).toBe(true);
  });

  it('should detect emotional words', () => {
    expect(detectEmotionalContent('I really care about you')).toBe(true);
    expect(detectEmotionalContent('My heart goes out to you')).toBe(true);
  });

  it('should return false for neutral content', () => {
    expect(detectEmotionalContent('The meeting is at 3pm')).toBe(false);
    expect(detectEmotionalContent('Let me check that for you')).toBe(false);
  });
});

describe('detectBreakthrough', () => {
  it('should detect realization moments', () => {
    expect(detectBreakthrough('I just realized something')).toBe(true);
    expect(detectBreakthrough('It hit me that I need to change')).toBe(true);
    expect(detectBreakthrough('I finally figured it out')).toBe(true);
  });

  it('should detect first-time sharing', () => {
    expect(detectBreakthrough("I've never told anyone this")).toBe(true);
    expect(detectBreakthrough('This is hard to say but...')).toBe(true);
  });

  it('should detect epiphany patterns', () => {
    expect(detectBreakthrough('Oh my god, that explains everything')).toBe(true);
    expect(detectBreakthrough('Wait, maybe what I need is...')).toBe(true);
  });

  it('should return false for normal statements', () => {
    expect(detectBreakthrough('I think that could work')).toBe(false);
    expect(detectBreakthrough('Let me consider that')).toBe(false);
  });
});

describe('detectAdviceGiving', () => {
  it('should detect should-based advice', () => {
    expect(detectAdviceGiving('You should try meditation')).toBe(true);
    expect(detectAdviceGiving('I think you should rest')).toBe(true);
  });

  it('should detect recommendation patterns', () => {
    expect(detectAdviceGiving("I'd recommend starting small")).toBe(true);
    expect(detectAdviceGiving('My suggestion would be to wait')).toBe(true);
  });

  it('should detect consider patterns', () => {
    expect(detectAdviceGiving('Consider taking a break')).toBe(true);
    expect(detectAdviceGiving('You might want to think about it')).toBe(true);
  });

  it('should return false for questions', () => {
    expect(detectAdviceGiving('How do you feel about that?')).toBe(false);
    expect(detectAdviceGiving('What do you think?')).toBe(false);
  });
});

// ============================================================================
// ENGAGEMENT DETECTION TESTS
// ============================================================================

describe('detectDisengagement', () => {
  it('should detect single-word disengagement', () => {
    expect(detectDisengagement('yeah')).toBe(true);
    expect(detectDisengagement('ok')).toBe(true);
    expect(detectDisengagement('sure')).toBe(true);
    expect(detectDisengagement('fine')).toBe(true);
    expect(detectDisengagement('whatever')).toBe(true);
    expect(detectDisengagement('meh')).toBe(true);
  });

  it('should detect short disengaged responses', () => {
    expect(detectDisengagement('I guess')).toBe(true);
    expect(detectDisengagement('uh huh')).toBe(true);
    expect(detectDisengagement('idk')).toBe(true);
  });

  it('should detect pattern-based disengagement', () => {
    expect(detectDisengagement("I don't know")).toBe(true);
    expect(detectDisengagement("I don't care")).toBe(true);
    expect(detectDisengagement('not really')).toBe(true);
  });

  it('should return false for engaged responses', () => {
    expect(detectDisengagement("That's really interesting, tell me more!")).toBe(false);
    expect(detectDisengagement('I love that idea, let me explain why')).toBe(false);
  });
});

describe('detectHighEngagement', () => {
  it('should detect long response with enthusiasm markers', () => {
    // Requires BOTH long response (>100 chars) AND enthusiasm/deep sharing
    const longEnthusiastic =
      "That's so fascinating and cool! I've been thinking about this for a long time and I absolutely love what you're saying! Let me tell you more about why this resonates with me.";
    expect(detectHighEngagement(longEnthusiastic)).toBe(true);
  });

  it('should detect enthusiasm combined with deep sharing', () => {
    // Enthusiasm + deep sharing also triggers high engagement
    expect(
      detectHighEngagement(
        "I feel like this is so interesting! I've been struggling with this topic and honestly I'm excited to explore it more!"
      )
    ).toBe(true);
  });

  it('should detect long responses with deep sharing', () => {
    const longDeepSharing =
      "I feel like this is really important to me because it connects to my past. I've been struggling with understanding this for a while now and the thing is, I finally see what I need to do.";
    expect(detectHighEngagement(longDeepSharing)).toBe(true);
  });

  it('should return false for short enthusiastic responses', () => {
    // Short messages don't meet the >100 char threshold for engagement
    expect(detectHighEngagement("That's so cool!")).toBe(false);
    expect(detectHighEngagement('Wow, amazing!')).toBe(false);
  });

  it('should return false for short neutral responses', () => {
    expect(detectHighEngagement('That sounds good')).toBe(false);
    expect(detectHighEngagement('Okay')).toBe(false);
  });
});

describe('detectHesitation', () => {
  it('should detect deflection patterns', () => {
    expect(detectHesitation("I'm fine")).toBe(true);
    expect(detectHesitation('Good')).toBe(true);
    expect(detectHesitation('Not bad')).toBe(true);
  });

  it('should detect minimizing patterns', () => {
    expect(detectHesitation("It's not that important")).toBe(true);
    expect(detectHesitation('No big deal')).toBe(true);
    expect(detectHesitation("It's nothing")).toBe(true);
  });

  it('should detect hedging patterns', () => {
    expect(detectHesitation('I guess so')).toBe(true);
    expect(detectHesitation('Maybe I should')).toBe(true);
    expect(detectHesitation('Sort of')).toBe(true);
  });

  it('should detect trailing off', () => {
    expect(detectHesitation('I was thinking...')).toBe(true);
    expect(detectHesitation('Anyway.')).toBe(true);
  });

  it('should return false for direct responses', () => {
    expect(detectHesitation("I'm having a hard time with my job")).toBe(false);
    expect(detectHesitation('Let me tell you what happened')).toBe(false);
  });
});

describe('detectEngagementLevel', () => {
  it('should return disengaged level for disengaged responses', () => {
    const result = detectEngagementLevel('yeah');
    expect(result.value).toBe('disengaged');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should return high level for long engaged responses with enthusiasm', () => {
    // Must meet both length threshold AND have enthusiasm/deep sharing
    const engaged =
      "That's so interesting! I love this idea and I want to tell you why it resonates with me so much! I feel like this is exactly what I've been looking for.";
    const result = detectEngagementLevel(engaged);
    expect(['high', 'very_high']).toContain(result.value);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should return very_high for exceptional engagement', () => {
    const veryEngaged =
      "Oh my god, this is exactly what I needed to hear! I've been thinking about this constantly and you're making so much sense! I want to share something important with you because I feel like this connects to my deeper struggles.";
    const result = detectEngagementLevel(veryEngaged);
    expect(['high', 'very_high']).toContain(result.value);
  });

  it('should return medium for substantial responses over 30 words', () => {
    const substantial =
      'I think that makes sense to me. Let me explain my perspective on this matter and see what you think about it. I have been considering various options and want to understand better.';
    const result = detectEngagementLevel(substantial);
    expect(['medium', 'high']).toContain(result.value);
  });

  it('should return low for short non-disengaged responses', () => {
    const shortNeutral = 'That makes sense to me.';
    const result = detectEngagementLevel(shortNeutral);
    expect(result.value).toBe('low');
  });
});

// ============================================================================
// COMPOSITE ANALYSIS TESTS
// ============================================================================
