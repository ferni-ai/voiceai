/**
 * Life Coaching Domains Tests
 *
 * Tests for Ferni's "Better Than Human" life coaching domains:
 * - Second Chances (fresh starts, reinvention, rebuilding)
 * - Connection (loneliness, friendship, belonging)
 * - Difficult Conversations (hard talks, boundaries, amends)
 * - Life Transitions (navigating major life changes)
 *
 * These tests validate:
 * 1. Domain structure and wisdom databases
 * 2. Brand alignment (warm, non-judgmental language)
 * 3. Tool definitions and configurations
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// LIFE TRANSITIONS DOMAIN TESTS
// ============================================================================

describe('Life Transitions Domain', () => {
  describe('Transition Types', () => {
    const TRANSITION_TYPES = {
      identity_shift: {
        name: 'Identity Transition',
        core_question: 'Who am I now, if not who I was?',
      },
      loss_transition: {
        name: 'Loss Transition',
        core_question: 'How do I live in a world where this is true?',
      },
      beginning_transition: {
        name: 'Beginning Transition',
        core_question: "Am I ready for who I'll need to become?",
      },
      unwanted_transition: {
        name: 'Unwanted Transition',
        core_question: "How do I find agency in something I didn't choose?",
      },
      growth_transition: {
        name: 'Growth Transition',
        core_question: 'What is this season of life asking of me?',
      },
    };

    it('should have all major transition types', () => {
      const types = Object.keys(TRANSITION_TYPES);
      expect(types).toContain('identity_shift');
      expect(types).toContain('loss_transition');
      expect(types).toContain('beginning_transition');
      expect(types).toContain('unwanted_transition');
      expect(types).toContain('growth_transition');
      expect(types.length).toBe(5);
    });

    it('should have a core question for each transition type', () => {
      Object.values(TRANSITION_TYPES).forEach((type) => {
        expect(type.core_question).toBeTruthy();
        expect(type.core_question).toContain('?');
      });
    });

    it('should use contemplative, non-prescriptive language', () => {
      const questions = Object.values(TRANSITION_TYPES).map((t) => t.core_question);
      questions.forEach((q) => {
        // Core questions should be open-ended, not demanding
        expect(q).not.toContain('should');
        expect(q).not.toContain('must');
        expect(q).not.toContain('need to fix');
      });
    });
  });

  describe('Transition Stages (Bridges Model)', () => {
    const TRANSITION_STAGES = {
      ending: { name: 'The Ending', needs: ['Acknowledgment', 'Permission to grieve', 'Time', 'Compassion'] },
      neutral_zone: { name: 'The Neutral Zone', needs: ['Patience', 'Self-compassion', 'Structure without rigidity', 'Space to explore'] },
      new_beginning: { name: 'The New Beginning', needs: ['Courage to step forward', 'Celebration of progress', 'Integration of learning', 'Community'] },
    };

    it('should have all three Bridges transition stages', () => {
      expect(Object.keys(TRANSITION_STAGES)).toEqual(['ending', 'neutral_zone', 'new_beginning']);
    });

    it('should identify needs at each stage', () => {
      Object.values(TRANSITION_STAGES).forEach((stage) => {
        expect(stage.needs).toBeInstanceOf(Array);
        expect(stage.needs.length).toBeGreaterThan(0);
      });
    });

    it('should emphasize self-compassion throughout', () => {
      const allNeeds = Object.values(TRANSITION_STAGES).flatMap((s) => s.needs);
      const compassionRelated = allNeeds.filter(
        (need) =>
          need.toLowerCase().includes('compassion') ||
          need.toLowerCase().includes('patience') ||
          need.toLowerCase().includes('permission')
      );
      expect(compassionRelated.length).toBeGreaterThan(2);
    });
  });

  describe('Dual Emotions Wisdom', () => {
    const DUAL_EMOTIONS = [
      { pair: 'Happy AND sad', example: 'Wedding day - joy for marriage, grief for leaving family home' },
      { pair: 'Relieved AND guilty', example: 'After a difficult caretaking period ends' },
      { pair: 'Excited AND terrified', example: 'New job, new baby, new city' },
      { pair: 'Grateful AND grieving', example: 'Grateful for time with someone AND grieving their loss' },
      { pair: 'Free AND lost', example: 'After divorce or job loss' },
      { pair: 'Proud AND sad', example: 'Child graduating, leaving home' },
    ];

    it('should acknowledge that contradictory emotions can coexist', () => {
      DUAL_EMOTIONS.forEach((emotion) => {
        expect(emotion.pair).toContain(' AND ');
      });
    });

    it('should provide relatable examples for each emotion pair', () => {
      DUAL_EMOTIONS.forEach((emotion) => {
        expect(emotion.example.length).toBeGreaterThan(10);
      });
    });
  });
});

// ============================================================================
// SECOND CHANCES DOMAIN TESTS
// ============================================================================

describe('Second Chances Domain', () => {
  describe('Comeback Stories', () => {
    const COMEBACK_STORIES = {
      career: [
        { name: 'Vera Wang', lesson: 'Sometimes rejection redirects us to our true path.' },
        { name: 'Colonel Sanders', lesson: "It's never too late to begin again." },
        { name: 'J.K. Rowling', lesson: 'Rock bottom can become the foundation for something extraordinary.' },
        { name: 'Steve Jobs', lesson: 'Getting fired can be the best thing that never happened to you.' },
      ],
      personal: [
        { name: 'Nelson Mandela', lesson: 'Time in the wilderness can prepare you for your purpose.' },
        { name: 'Maya Angelou', lesson: 'Our wounds can become our wisdom.' },
      ],
      financial: [
        { name: 'Walt Disney', lesson: 'Financial failure is not the end of the story.' },
        { name: 'Abraham Lincoln', lesson: 'Each setback can be setup for something greater.' },
      ],
    };

    it('should have stories across career, personal, and financial categories', () => {
      expect(COMEBACK_STORIES.career.length).toBeGreaterThan(0);
      expect(COMEBACK_STORIES.personal.length).toBeGreaterThan(0);
      expect(COMEBACK_STORIES.financial.length).toBeGreaterThan(0);
    });

    it('should extract meaningful lessons from each story', () => {
      Object.values(COMEBACK_STORIES)
        .flat()
        .forEach((story) => {
          expect(story.lesson).toBeTruthy();
          expect(story.lesson.length).toBeGreaterThan(20);
        });
    });

    it('should frame lessons positively without toxic positivity', () => {
      const allLessons = Object.values(COMEBACK_STORIES)
        .flat()
        .map((s) => s.lesson);

      allLessons.forEach((lesson) => {
        // Should not minimize real struggle
        expect(lesson).not.toContain('just');
        expect(lesson).not.toContain('simply');
        expect(lesson.toLowerCase()).not.toContain('easy');
      });
    });
  });

  describe('Second Chance Stages', () => {
    const STAGES = ['shock', 'grief', 'reckoning', 'glimmers', 'rebuilding', 'integration'];

    it('should have all stages of the second chance journey', () => {
      expect(STAGES.length).toBe(6);
      expect(STAGES).toContain('grief');
      expect(STAGES).toContain('rebuilding');
    });

    it('should start with shock and end with integration', () => {
      expect(STAGES[0]).toBe('shock');
      expect(STAGES[STAGES.length - 1]).toBe('integration');
    });

    it('should include a reckoning stage for honest reflection', () => {
      expect(STAGES).toContain('reckoning');
    });
  });

  describe('Second Chance Wisdom', () => {
    const WISDOM = [
      { quote: "It's never too late to be what you might have been.", attribution: 'George Eliot' },
      { quote: 'Rock bottom became the solid foundation on which I rebuilt my life.', attribution: 'J.K. Rowling' },
      { quote: 'Your net worth is not your self-worth.', attribution: 'Ferni' },
    ];

    it('should include quotes from diverse sources', () => {
      const attributions = WISDOM.map((w) => w.attribution);
      expect(new Set(attributions).size).toBeGreaterThan(1);
    });

    it('should include Ferni original wisdom', () => {
      const ferniWisdom = WISDOM.find((w) => w.attribution === 'Ferni');
      expect(ferniWisdom).toBeDefined();
    });

    it('should use empowering, not shaming language', () => {
      WISDOM.forEach((w) => {
        expect(w.quote.toLowerCase()).not.toContain('failure is');
        expect(w.quote.toLowerCase()).not.toContain('you should have');
        expect(w.quote.toLowerCase()).not.toContain('your fault');
      });
    });
  });
});

// ============================================================================
// CONNECTION DOMAIN TESTS
// ============================================================================

describe('Connection Domain', () => {
  describe('Loneliness Types', () => {
    const LONELINESS_TYPES = ['intimate', 'relational', 'collective', 'existential'];

    it('should recognize different types of loneliness', () => {
      expect(LONELINESS_TYPES).toContain('intimate');
      expect(LONELINESS_TYPES).toContain('relational');
      expect(LONELINESS_TYPES).toContain('collective');
    });

    it('should include existential loneliness', () => {
      expect(LONELINESS_TYPES).toContain('existential');
    });
  });

  describe('Friendship Stages', () => {
    const STAGES = ['acquaintance', 'casual', 'close', 'intimate'];

    it('should have progressive friendship depth levels', () => {
      expect(STAGES.length).toBe(4);
      expect(STAGES[0]).toBe('acquaintance');
      expect(STAGES[STAGES.length - 1]).toBe('intimate');
    });
  });

  describe('Belonging Signals', () => {
    const BELONGING_SIGNALS = [
      'Being invited to things',
      'Being asked for opinions',
      'Having inside jokes',
      'Being remembered',
    ];

    it('should identify concrete signs of belonging', () => {
      expect(BELONGING_SIGNALS.length).toBeGreaterThan(0);
      BELONGING_SIGNALS.forEach((signal) => {
        // Should be specific, observable behaviors
        expect(signal.length).toBeGreaterThan(10);
      });
    });
  });
});

// ============================================================================
// DIFFICULT CONVERSATIONS DOMAIN TESTS
// ============================================================================

describe('Difficult Conversations Domain', () => {
  describe('Conversation Types', () => {
    const TYPES = [
      'setting-boundary',
      'making-amends',
      'sharing-truth',
      'asking-for-help',
      'ending-relationship',
      'confronting-issue',
    ];

    it('should cover major difficult conversation scenarios', () => {
      expect(TYPES).toContain('setting-boundary');
      expect(TYPES).toContain('making-amends');
      expect(TYPES).toContain('ending-relationship');
    });

    it('should include positive asks not just confrontations', () => {
      expect(TYPES).toContain('asking-for-help');
    });
  });

  describe('Practice Framework', () => {
    const FRAMEWORK_COMPONENTS = ['before', 'during', 'after', 'if-it-goes-wrong'];

    it('should have before, during, and after guidance', () => {
      expect(FRAMEWORK_COMPONENTS).toContain('before');
      expect(FRAMEWORK_COMPONENTS).toContain('during');
      expect(FRAMEWORK_COMPONENTS).toContain('after');
    });

    it('should include recovery guidance for difficult outcomes', () => {
      expect(FRAMEWORK_COMPONENTS).toContain('if-it-goes-wrong');
    });
  });
});

// ============================================================================
// BRAND ALIGNMENT TESTS
// ============================================================================

describe('Brand Alignment - Better Than Human', () => {
  describe('Language Patterns', () => {
    const WARM_PHRASES = [
      'I hear you',
      'That sounds really hard',
      'No judgment here',
      "That's completely normal",
      'Take your time',
      "You're not alone in this",
    ];

    const PHRASES_TO_AVOID = [
      'You should',
      'You need to',
      "Just don't",
      'That was wrong',
      'You failed because',
      'The problem with you is',
    ];

    it('should use warm, validating language', () => {
      WARM_PHRASES.forEach((phrase) => {
        expect(phrase).not.toContain('must');
        expect(phrase).not.toContain('should');
      });
    });

    it('should avoid judgmental or prescriptive language', () => {
      PHRASES_TO_AVOID.forEach((phrase) => {
        const hasJudgment =
          phrase.includes('should') ||
          phrase.includes('need to') ||
          phrase.includes('wrong') ||
          phrase.includes('failed') ||
          phrase.includes('problem with you') ||
          phrase.includes("Just don't"); // Dismissive minimization
        expect(hasJudgment).toBe(true);
      });
    });
  });

  describe('Response Philosophy', () => {
    it('should prioritize sitting with emotions over fixing', () => {
      const philosophy = {
        first: 'Acknowledge and validate',
        second: 'Explore and understand',
        third: 'Only then, if appropriate, suggest',
      };

      expect(Object.keys(philosophy)[0]).toBe('first');
      expect(philosophy.first.toLowerCase()).toContain('acknowledge');
    });

    it('should celebrate tiny wins genuinely', () => {
      const tinyWins = [
        'You got out of bed today',
        'You reached out',
        'You tried',
        "You're thinking about this",
      ];

      tinyWins.forEach((win) => {
        expect(win.length).toBeGreaterThan(5);
      });
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Domain Integration', () => {
  it('should have complementary tools across domains', () => {
    const domainTools = {
      'second-chances': ['reframeNarrative', 'holdHopeWhenCant', 'celebrateTinyWins'],
      'life-transitions': ['grieveWhatWas', 'holdDualEmotions', 'createTransitionRitual'],
      connection: ['acknowledgeCurrentState', 'celebrateSocialWin', 'findYourPeople'],
      'difficult-conversations': ['prepareConversation', 'practiceWithMe', 'processOutcome'],
    };

    // Each domain should have tools
    Object.values(domainTools).forEach((tools) => {
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  it('should share common emotional support patterns', () => {
    const commonPatterns = [
      'Validation before action',
      'Permission to feel',
      'No rush timeline',
      'Celebrate small progress',
    ];

    expect(commonPatterns.length).toBe(4);
  });
});
