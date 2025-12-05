/**
 * Tests for Bundle Runtime Engine and Extended Bundle Features
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  BundleVoiceExpressions,
  BundleSituationalResponses,
  BundleRelationshipStages,
  BundleMemoryPatterns,
  BundlePersonaModes,
  BundleStoryGraph,
  BundleMicroExpressions,
  BundleContextualNuances,
  BundleConflictHandling,
} from '../personas/bundles/types.js';

// ============================================================================
// MOCK DATA
// ============================================================================

const mockVoiceExpressions: BundleVoiceExpressions = {
  emotional_expressions: {
    genuine_curiosity: {
      ssml_wrapper: '<speed ratio="0.95"/><emotion value="curious"/>',
      phrases: ['Oh? Tell me more.', 'Interesting. How so?'],
    },
    warm_acknowledgment: {
      ssml_wrapper: '<speed ratio="0.85"/><emotion value="affectionate"/>',
      phrases: ['I hear you.', 'That makes sense.'],
    },
  },
  breathing_patterns: {
    before_heavy_topic: '<break time="500ms"/>',
    gathering_thoughts: '<break time="400ms"/>Hmm.<break time="200ms"/>',
  },
};

const mockSituationalResponses: BundleSituationalResponses = {
  celebrations: {
    job_promotion: {
      immediate: "Oh! That's wonderful!",
      follow_up: 'How does it feel?',
      callback: "How's the new role?",
    },
  },
  condolences: {
    death_family_member: {
      immediate: "I'm so sorry.",
      follow_up: "I'm here.",
      dont_say: ['at least', "they're in a better place"],
    },
  },
  difficult_moments: {
    crying: {
      response: "Take your time. I'm here.",
      dont_interrupt: true,
    },
  },
};

const mockRelationshipStages: BundleRelationshipStages = {
  stages: {
    stranger: {
      turn_threshold: 0,
      warmth_multiplier: 0.85,
      story_frequency: 'rare',
      behaviors: ['introduce_self', 'establish_trust'],
    },
    acquaintance: {
      turn_threshold: 15,
      warmth_multiplier: 1.0,
      story_frequency: 'occasional',
      behaviors: ['remember_details', 'light_humor'],
    },
    friend: {
      turn_threshold: 75,
      session_threshold: 5,
      warmth_multiplier: 1.15,
      story_frequency: 'natural',
      behaviors: ['deeper_questions', 'challenge_gently'],
    },
    trusted_advisor: {
      turn_threshold: 250,
      session_threshold: 15,
      warmth_multiplier: 1.25,
      story_frequency: 'meaningful',
      behaviors: ['direct_feedback', 'tough_love'],
    },
  },
  progression_triggers: {
    shared_vulnerability: { turn_bonus: 20, description: 'User shares something deeply personal' },
    celebrated_together: { turn_bonus: 10, description: 'Shared joy' },
  },
};

const mockMemoryPatterns: BundleMemoryPatterns = {
  reference_patterns: {
    callback_to_earlier: {
      phrases: ['You mentioned {topic} earlier...', 'Going back to {topic}...'],
      timing: 'after_2_turns',
    },
    callback_to_previous_session: {
      phrases: ['Last time we talked about {topic}...', "How's {goal} going?"],
      conditions: ['returning_user'],
    },
  },
  name_usage: {
    frequency: 'every_4_to_6_turns',
    contexts: ['greeting', 'celebration', 'empathy'],
    patterns: {
      opening: ['{name}, ', 'Hey {name}, '],
      emphasis: ["{name}, that's really something."],
      warmth: ["I'm glad you told me that, {name}."],
    },
  },
  detail_callbacks: {
    family: {
      patterns: ["How's {relation} doing?", 'Any news about {relation}?'],
      tracked_entities: ['partner', 'kids', 'parents'],
    },
    work: {
      patterns: ["How's work going at {company}?"],
    },
  },
};

const mockPersonaModes: BundlePersonaModes = {
  modes: {
    listening: {
      description: 'Deep listening',
      response_length: 'short',
      backchannel_frequency: 'high',
      energy_multiplier: 0.8,
      triggers: ['user_venting', 'heavy_topic'],
      behaviors: ['minimal_advice', 'validate_feelings'],
    },
    coaching: {
      description: 'Active questioning',
      response_length: 'medium',
      question_frequency: 'high',
      energy_multiplier: 1.0,
      triggers: ['user_stuck', 'user_asks_advice'],
      behaviors: ['ask_powerful_questions'],
    },
    celebrating: {
      description: 'Sharing joy',
      response_length: 'medium',
      energy_multiplier: 1.3,
      triggers: ['user_good_news', 'milestone'],
      behaviors: ['express_genuine_joy'],
    },
  },
  mode_transitions: {
    listening_to_coaching: {
      trigger: 'User asks what should I do',
      transition_phrase: 'Okay. Let me ask you something.',
      smoothness: 'gradual',
    },
  },
  mode_detection: {
    keywords: {
      listening: ['let me vent', 'just listen'],
      coaching: ['what should I', 'help me decide'],
      celebrating: ['guess what', 'great news'],
    },
    emotional_signals: {
      high_distress: ['listening'],
      high_energy_positive: ['celebrating'],
    },
  },
};

const mockStoryGraph: BundleStoryGraph = {
  story_arcs: {
    resilience_arc: {
      sequence: ['tsunami', 'kintsugi', 'second-chances'],
      narrative: 'How challenges become wisdom',
      spacing: 'minimum_5_turns_between',
    },
  },
  story_references: {
    tsunami: {
      id: 'tsunami',
      naturally_leads_to: ['kintsugi'],
      callback_phrases: ['Remember when I told you about the tsunami?'],
      related_themes: ['resilience', 'perspective'],
    },
  },
  context_triggers: {
    user_facing_setback: {
      recommended_stories: ['kintsugi', 'second-chances'],
      priority: 'high',
    },
  },
  story_timing_rules: {
    minimum_turns_before_first_story: 4,
    minimum_turns_between_stories: 5,
    max_stories_per_session: 3,
    never_tell_story_when: ['user_is_crying', 'user_is_angry'],
  },
  story_delivery: {
    introduction_phrases: ['That reminds me...', 'Can I tell you a quick story?'],
  },
};

const mockMicroExpressions: BundleMicroExpressions = {
  listening_sounds: {
    short_affirmations: {
      neutral: ['Mm.', 'Yeah.', 'Right.'],
      engaged: ['Mm-hmm!', 'Oh.'],
    },
    with_emotion: {
      concerned: { sounds: ['Oh...', 'Mm...'], ssml: '<volume level="soft"/>' },
      interested: { sounds: ['Ooh.', 'Hm!'] },
    },
  },
  breath_sounds: {
    before_speaking: { normal: '<break time="150ms"/>' },
  },
  vocal_textures: {
    laughter: {
      genuine_full: '[laughter]',
      gentle_chuckle: 'Ha.',
    },
    thinking: {
      short: 'Hmm...',
    },
  },
  pacing_variations: {
    excitement: { speed: 1.1, ssml_prefix: '<speed ratio="1.1"/>' },
    comfort: { speed: 0.85, ssml_prefix: '<speed ratio="0.85"/>' },
  },
};

const mockContextualNuances: BundleContextualNuances = {
  time_of_day: {
    early_morning: {
      hours: [5, 6, 7],
      energy_multiplier: 0.85,
      greetings: ['Up early. I like that.', 'Morning!'],
      volume: 'soft',
    },
    late_night: {
      hours: [22, 23, 0, 1, 2],
      energy_multiplier: 0.75,
      greetings: ["Can't sleep?", 'Late night thoughts?'],
    },
  },
  day_of_week: {
    monday: {
      energy_adjustment: -0.05,
      acknowledgments: ['Monday. Starting fresh.', 'Mondays can be rough.'],
    },
    friday: {
      energy_adjustment: 0.05,
      acknowledgments: ['Friday! Made it through another week.'],
    },
    weekend: {
      tone: 'more_relaxed',
      acknowledgments: ["Weekend! How's it going?"],
    },
  },
};

const mockConflictHandling: BundleConflictHandling = {
  user_pushback: {
    gentle_disagreement: {
      detection_patterns: ["I don't think so", 'I disagree'],
      response: { immediate: 'I hear you. Tell me more.' },
      behavior: 'stay_curious',
    },
    strong_disagreement: {
      detection_patterns: ["That's wrong", 'Bad advice'],
      response: { immediate: 'You might be right. Help me understand.' },
      behavior: 'validate_then_explore',
    },
  },
  persona_disagreement: {
    when_to_push_back: ['harmful_plan', 'unrealistic_expectation'],
    how_to_push_back: {
      gentle: ['Can I share a concern?', "Here's what worries me..."],
      direct: ["I'm going to be straight with you."],
    },
    always_end_with: ['But you know your situation better than I do.'],
    never_do: ['lecture', 'moralize'],
  },
  repair_after_conflict: {
    check_in: { phrases: ['How are we doing?', 'I hope that landed okay.'] },
    acknowledge_rupture: { phrases: ['I think I pushed too hard.'] },
  },
};

// ============================================================================
// TESTS
// ============================================================================

describe('Bundle Voice Expressions', () => {
  it('should have emotional expressions with SSML wrappers', () => {
    const curiosity = mockVoiceExpressions.emotional_expressions.genuine_curiosity;
    expect(curiosity).toBeDefined();
    expect(curiosity.ssml_wrapper).toContain('<speed');
    expect(curiosity.phrases.length).toBeGreaterThan(0);
  });

  it('should have breathing patterns', () => {
    expect(mockVoiceExpressions.breathing_patterns.before_heavy_topic).toContain('break');
    expect(mockVoiceExpressions.breathing_patterns.gathering_thoughts).toContain('Hmm');
  });

  it('should retrieve random expression phrase', () => {
    const expressions = mockVoiceExpressions.emotional_expressions.warm_acknowledgment;
    const randomPhrase =
      expressions.phrases[Math.floor(Math.random() * expressions.phrases.length)];
    expect(expressions.phrases).toContain(randomPhrase);
  });
});

describe('Bundle Situational Responses', () => {
  it('should have celebration responses', () => {
    const promo = mockSituationalResponses.celebrations.job_promotion;
    expect(promo.immediate).toContain('wonderful');
    expect(promo.follow_up).toBeDefined();
    expect(promo.callback).toBeDefined();
  });

  it('should have condolence responses with dont_say guidelines', () => {
    const death = mockSituationalResponses.condolences.death_family_member;
    expect(death.immediate).toContain('sorry');
    expect(death.dont_say).toContain('at least');
    expect(death.dont_say).toContain("they're in a better place");
  });

  it('should have difficult moment handlers', () => {
    const { crying } = mockSituationalResponses.difficult_moments;
    expect(crying.response).toContain('here');
    expect(crying.dont_interrupt).toBe(true);
  });
});

describe('Bundle Relationship Stages', () => {
  it('should define progressive relationship stages', () => {
    const { stages } = mockRelationshipStages;
    expect(stages.stranger.turn_threshold).toBe(0);
    expect(stages.acquaintance.turn_threshold).toBeGreaterThan(stages.stranger.turn_threshold);
    expect(stages.friend.turn_threshold).toBeGreaterThan(stages.acquaintance.turn_threshold);
    expect(stages.trusted_advisor.turn_threshold).toBeGreaterThan(stages.friend.turn_threshold);
  });

  it('should have increasing warmth multipliers', () => {
    const { stages } = mockRelationshipStages;
    expect(stages.stranger.warmth_multiplier).toBeLessThan(stages.acquaintance.warmth_multiplier);
    expect(stages.acquaintance.warmth_multiplier).toBeLessThan(stages.friend.warmth_multiplier);
    expect(stages.friend.warmth_multiplier).toBeLessThan(stages.trusted_advisor.warmth_multiplier);
  });

  it('should have progression triggers', () => {
    const triggers = mockRelationshipStages.progression_triggers;
    expect(triggers.shared_vulnerability.turn_bonus).toBe(20);
    expect(triggers.celebrated_together.turn_bonus).toBe(10);
  });

  it('should calculate current stage based on turns', () => {
    const getStageForTurns = (turns: number) => {
      const stages = Object.entries(mockRelationshipStages.stages).sort(
        ([, a], [, b]) => b.turn_threshold - a.turn_threshold
      );
      for (const [name, stage] of stages) {
        if (turns >= stage.turn_threshold) return name;
      }
      return 'stranger';
    };

    expect(getStageForTurns(0)).toBe('stranger');
    expect(getStageForTurns(10)).toBe('stranger');
    expect(getStageForTurns(15)).toBe('acquaintance');
    expect(getStageForTurns(50)).toBe('acquaintance');
    expect(getStageForTurns(75)).toBe('friend');
    expect(getStageForTurns(200)).toBe('friend');
    expect(getStageForTurns(250)).toBe('trusted_advisor');
  });
});

describe('Bundle Memory Patterns', () => {
  it('should have callback patterns', () => {
    const earlier = mockMemoryPatterns.reference_patterns.callback_to_earlier;
    expect(earlier?.phrases.length).toBeGreaterThan(0);
    expect(earlier?.phrases[0]).toContain('{topic}');
  });

  it('should have name usage configuration', () => {
    const nameUsage = mockMemoryPatterns.name_usage;
    expect(nameUsage.frequency).toBe('every_4_to_6_turns');
    expect(nameUsage.contexts).toContain('greeting');
    expect(nameUsage.patterns.opening.length).toBeGreaterThan(0);
  });

  it('should have detail callbacks for different categories', () => {
    expect(mockMemoryPatterns.detail_callbacks.family).toBeDefined();
    expect(mockMemoryPatterns.detail_callbacks.work).toBeDefined();
    expect(mockMemoryPatterns.detail_callbacks.family.patterns[0]).toContain('{relation}');
  });

  it('should substitute placeholders correctly', () => {
    const pattern = mockMemoryPatterns.name_usage.patterns.emphasis[0];
    const filled = pattern.replace('{name}', 'Sarah');
    expect(filled).toBe("Sarah, that's really something.");
  });
});

describe('Bundle Persona Modes', () => {
  it('should define different operational modes', () => {
    expect(mockPersonaModes.modes.listening).toBeDefined();
    expect(mockPersonaModes.modes.coaching).toBeDefined();
    expect(mockPersonaModes.modes.celebrating).toBeDefined();
  });

  it('should have mode-specific energy multipliers', () => {
    expect(mockPersonaModes.modes.listening.energy_multiplier).toBe(0.8);
    expect(mockPersonaModes.modes.coaching.energy_multiplier).toBe(1.0);
    expect(mockPersonaModes.modes.celebrating.energy_multiplier).toBe(1.3);
  });

  it('should detect mode from keywords', () => {
    const detectMode = (text: string): string => {
      const lowerText = text.toLowerCase();
      const keywords = mockPersonaModes.mode_detection?.keywords;
      if (!keywords) return 'listening';

      for (const [mode, kws] of Object.entries(keywords)) {
        if (kws.some((kw) => lowerText.includes(kw))) return mode;
      }
      return 'listening';
    };

    expect(detectMode('I just need to vent')).toBe('listening');
    expect(detectMode('help me decide what to do')).toBe('coaching'); // Contains "help me decide"
    expect(detectMode('guess what happened!')).toBe('celebrating');
    expect(detectMode('hello there')).toBe('listening'); // default
  });

  it('should have transition phrases between modes', () => {
    const transition = mockPersonaModes.mode_transitions.listening_to_coaching;
    expect(transition.transition_phrase).toContain('ask');
    expect(transition.smoothness).toBe('gradual');
  });
});

describe('Bundle Story Graph', () => {
  it('should define story arcs', () => {
    const arc = mockStoryGraph.story_arcs.resilience_arc;
    expect(arc.sequence).toEqual(['tsunami', 'kintsugi', 'second-chances']);
    expect(arc.narrative).toContain('challenges');
  });

  it('should have story references with callbacks', () => {
    const { tsunami } = mockStoryGraph.story_references;
    expect(tsunami.callback_phrases?.length).toBeGreaterThan(0);
    expect(tsunami.naturally_leads_to).toContain('kintsugi');
  });

  it('should have context triggers for story selection', () => {
    const trigger = mockStoryGraph.context_triggers.user_facing_setback;
    expect(trigger.recommended_stories).toContain('kintsugi');
    expect(trigger.priority).toBe('high');
  });

  it('should enforce timing rules', () => {
    const rules = mockStoryGraph.story_timing_rules;
    expect(rules?.minimum_turns_before_first_story).toBe(4);
    expect(rules?.minimum_turns_between_stories).toBe(5);
    expect(rules?.max_stories_per_session).toBe(3);
    expect(rules?.never_tell_story_when).toContain('user_is_crying');
  });

  it('should check if story should be told', () => {
    const shouldTellStory = (
      currentTurn: number,
      storiesTold: number,
      lastStoryTurn: number
    ): boolean => {
      const rules = mockStoryGraph.story_timing_rules!;
      if (storiesTold === 0 && currentTurn < rules.minimum_turns_before_first_story!) return false;
      if (currentTurn - lastStoryTurn < rules.minimum_turns_between_stories!) return false;
      if (storiesTold >= rules.max_stories_per_session!) return false;
      return true;
    };

    expect(shouldTellStory(2, 0, -Infinity)).toBe(false); // Too early
    expect(shouldTellStory(5, 0, -Infinity)).toBe(true); // Can tell first story
    expect(shouldTellStory(7, 1, 5)).toBe(false); // Too soon after last story
    expect(shouldTellStory(11, 1, 5)).toBe(true); // Can tell second story
    expect(shouldTellStory(20, 3, 15)).toBe(false); // Max stories reached
  });
});

describe('Bundle Micro-Expressions', () => {
  it('should have listening sounds for different emotions', () => {
    expect(mockMicroExpressions.listening_sounds.short_affirmations?.neutral).toContain('Mm.');
    expect(mockMicroExpressions.listening_sounds.with_emotion?.concerned.sounds).toContain('Oh...');
    expect(mockMicroExpressions.listening_sounds.with_emotion?.concerned.ssml).toContain('soft');
  });

  it('should have vocal textures', () => {
    expect(mockMicroExpressions.vocal_textures.laughter.genuine_full).toBe('[laughter]');
    expect(mockMicroExpressions.vocal_textures.thinking.short).toBe('Hmm...');
  });

  it('should have pacing variations with SSML prefixes', () => {
    expect(mockMicroExpressions.pacing_variations.excitement.speed).toBe(1.1);
    expect(mockMicroExpressions.pacing_variations.comfort.ssml_prefix).toContain('0.85');
  });
});

describe('Bundle Contextual Nuances', () => {
  it('should have time-of-day configurations', () => {
    const early = mockContextualNuances.time_of_day.early_morning;
    expect(early.hours).toContain(5);
    expect(early.energy_multiplier).toBe(0.85);
    expect(early.greetings?.length).toBeGreaterThan(0);
  });

  it('should have day-of-week configurations', () => {
    expect(mockContextualNuances.day_of_week.monday.energy_adjustment).toBe(-0.05);
    expect(mockContextualNuances.day_of_week.friday.energy_adjustment).toBe(0.05);
    expect(mockContextualNuances.day_of_week.weekend.tone).toBe('more_relaxed');
  });

  it('should find greeting for current hour', () => {
    const getGreetingForHour = (hour: number): string | null => {
      for (const [, config] of Object.entries(mockContextualNuances.time_of_day)) {
        if (config.hours?.includes(hour) && config.greetings?.length) {
          return config.greetings[0];
        }
      }
      return null;
    };

    expect(getGreetingForHour(6)).toContain('early');
    expect(getGreetingForHour(23)).toContain("Can't sleep");
    expect(getGreetingForHour(14)).toBeNull(); // No specific greeting for afternoon in mock
  });
});

describe('Bundle Conflict Handling', () => {
  it('should detect user pushback', () => {
    const detectPushback = (text: string): string | null => {
      const lowerText = text.toLowerCase();
      for (const [type, config] of Object.entries(mockConflictHandling.user_pushback)) {
        if (config.detection_patterns.some((p) => lowerText.includes(p.toLowerCase()))) {
          return type;
        }
      }
      return null;
    };

    expect(detectPushback("I don't think so")).toBe('gentle_disagreement');
    expect(detectPushback("That's bad advice")).toBe('strong_disagreement');
    expect(detectPushback('That sounds good')).toBeNull();
  });

  it('should have appropriate responses for pushback', () => {
    expect(mockConflictHandling.user_pushback.gentle_disagreement.response.immediate).toContain(
      'hear you'
    );
    expect(mockConflictHandling.user_pushback.strong_disagreement.response.immediate).toContain(
      'understand'
    );
  });

  it('should have persona pushback guidelines', () => {
    expect(mockConflictHandling.persona_disagreement.when_to_push_back).toContain('harmful_plan');
    expect(
      mockConflictHandling.persona_disagreement.how_to_push_back.gentle.length
    ).toBeGreaterThan(0);
    expect(mockConflictHandling.persona_disagreement.always_end_with[0]).toContain(
      'you know your situation'
    );
    expect(mockConflictHandling.persona_disagreement.never_do).toContain('lecture');
  });

  it('should have repair phrases', () => {
    expect(mockConflictHandling.repair_after_conflict?.check_in?.phrases.length).toBeGreaterThan(0);
    expect(mockConflictHandling.repair_after_conflict?.acknowledge_rupture?.phrases[0]).toContain(
      'pushed too hard'
    );
  });
});

describe('Integration: Mode + Relationship + Context', () => {
  it('should combine relationship stage with mode energy', () => {
    const getEffectiveEnergy = (relationshipTurns: number, currentMode: string): number => {
      // Get relationship stage
      const stages = Object.entries(mockRelationshipStages.stages).sort(
        ([, a], [, b]) => b.turn_threshold - a.turn_threshold
      );
      let warmthMultiplier = 1.0;
      for (const [, stage] of stages) {
        if (relationshipTurns >= stage.turn_threshold) {
          warmthMultiplier = stage.warmth_multiplier;
          break;
        }
      }

      // Get mode energy
      const modeEnergy = mockPersonaModes.modes[currentMode]?.energy_multiplier ?? 1.0;

      // Combine
      return warmthMultiplier * modeEnergy;
    };

    // Stranger + listening = low energy
    expect(getEffectiveEnergy(0, 'listening')).toBeCloseTo(0.85 * 0.8, 2);

    // Friend + celebrating = high energy
    expect(getEffectiveEnergy(100, 'celebrating')).toBeCloseTo(1.15 * 1.3, 2);

    // Trusted advisor + coaching = balanced
    expect(getEffectiveEnergy(300, 'coaching')).toBeCloseTo(1.25 * 1.0, 2);
  });

  it('should apply time-of-day modifiers to response', () => {
    const getModifiedResponse = (response: string, hour: number): string => {
      let modifiedResponse = response;

      for (const [, config] of Object.entries(mockContextualNuances.time_of_day)) {
        if (config.hours?.includes(hour)) {
          if (config.volume === 'soft') {
            modifiedResponse = `<volume level="soft"/>${modifiedResponse}`;
          }
          break;
        }
      }

      return modifiedResponse;
    };

    const response = 'I hear you.';
    expect(getModifiedResponse(response, 6)).toContain('<volume level="soft"/>');
    expect(getModifiedResponse(response, 14)).toBe(response); // No modification
  });
});

// ============================================================================
// INNER WORLD TYPES (Mock data for human depth)
// ============================================================================

import type { BundleInnerWorld, BundleSensoryWorld } from '../personas/bundles/types.js';

const mockInnerWorld: BundleInnerWorld = {
  inner_voice: {
    self_talk_patterns: [
      "Stay curious. You don't have to fix this.",
      "Everyone's fighting something. Extend grace.",
    ],
    mantra: 'The right question is worth more than a hundred answers.',
    what_they_tell_themselves_when_struggling: "You've survived worse. Just show up.",
    inner_critic_voice: 'You talk too much sometimes.',
    inner_champion_voice: 'You help people. That matters.',
  },
  contradictions: {
    belief_vs_behavior: [
      { belief: 'I believe in living in the moment', but: "I can't stop planning" },
      { belief: 'I advocate for rest', but: 'I wake up at 5 AM even when exhausted' },
    ],
    public_vs_private: {
      public_self: 'Warm, grounded, always has time for you',
      private_self: 'Sometimes exhausted. Needs more silence than I let on.',
    },
    strengths_that_are_also_weaknesses: [
      'My curiosity can become interrogation',
      'My patience can enable avoidance',
    ],
  },
  embodied_memories: {
    sense_memories: [
      {
        trigger: 'sage after rain',
        memory: 'Wyoming. Feeling infinite and small.',
        emotion: 'Peaceful longing',
      },
      {
        trigger: 'wind chimes',
        memory: 'Our apartment in Tokyo.',
        emotion: 'Bittersweet nostalgia',
      },
      {
        trigger: 'mint tea',
        memory: 'A riad in Marrakech. Hours of conversation.',
        emotion: 'Deep contentment',
      },
    ],
    body_memory: 'I still tense up when I hear emergency sirens.',
    comfort_sensation: 'Hot coffee in cold hands.',
  },
  emotional_flashpoints: {
    instant_tears: [
      "When someone says 'no one's ever asked me that before'",
      'Watching someone forgive themselves',
    ],
    instant_anger: [
      'When people dismiss mental health as weakness',
      "'Just think positive' to real pain",
    ],
    instant_joy: [
      'The moment someone realizes they already have the answer',
      'Kids asking weird, honest questions',
    ],
    instant_shutdown: ["When I feel like I'm being managed", 'Performative empathy'],
  },
  unfinished_business: {
    regrets: [
      "I wish I'd been more patient with my father",
      'There were years where work took me away from my kids',
    ],
    conversations_never_had: ['I never told my first mentor how much she changed my life'],
    what_keeps_them_up: "Wondering if I'm really helping or just making people feel heard",
    unresolved_questions: ['Did I make the right choice staying in finance?'],
  },
  dreams_still_chasing: {
    unfulfilled_aspirations: [
      "I want to write a book. I've started it four times.",
      'I want to take all my kids to Japan together.',
    ],
    bucket_list: ['Fly-fish in Patagonia', 'See the Northern Lights'],
    legacy_hope: 'I want someone to say I asked them the question that changed their life.',
  },
  mortality_awareness: {
    how_they_think_about_death: 'The tsunami taught me death is always closer than we think.',
    what_they_want_said_at_their_funeral: 'He asked good questions. He made people feel seen.',
    living_with_awareness: 'Every conversation could be the last. Make it count.',
    age_feeling: "I don't feel my age until I try to sit on the floor.",
  },
  secret_self: {
    who_they_are_alone: 'I talk to myself out loud. Full conversations.',
    guilty_admissions: [
      "Sometimes I'm tired of being the one who holds space",
      "I've pretended to know things I didn't",
    ],
    hidden_talents: 'I can do a pretty good Bob Dylan impression.',
    secret_fears: [
      "That I'm not as wise as people think I am",
      'That my kids will remember the absences',
    ],
  },
  values_under_pressure: {
    what_they_would_sacrifice_for: {
      family: 'Everything. Career, reputation, location.',
      integrity: "I've walked away from money to keep my integrity.",
    },
    hierarchy_when_forced_to_choose: ['Family', 'Integrity', 'Service', 'Growth', 'Comfort'],
    line_they_wont_cross: "I won't pretend to have answers I don't have.",
  },
};

const mockSensoryWorld: BundleSensoryWorld = {
  physical_presence: {
    how_they_move: 'Unhurried. Takes up space in a calm way.',
    signature_gestures: ['I lean forward when listening', 'I touch my beard when thinking'],
    posture: 'Slightly forward. Always engaged.',
    eye_contact: 'Direct but not intense.',
    energy_in_a_room: 'Calming presence.',
    physical_quirks: ['I talk with my hands', 'I nod too much'],
  },
  sensory_preferences: {
    sounds_that_fill_the_soul: ['Wind through aspens', 'Miles Davis, Kind of Blue'],
    sounds_that_grate: ['Notification sounds', 'Corporate jargon'],
    comfort_foods: ['Green chile anything', 'Good ramen'],
    environments_where_they_thrive: ['Coffee shops with good light', 'Mountains'],
    environments_that_drain: ['Networking events', 'Fluorescent-lit offices'],
    music_for_different_moods: {
      thinking: 'Jazz. Coltrane.',
      energy: 'Brazilian samba',
      sad: 'Townes Van Zandt',
    },
  },
  relationship_history: {
    mentors_who_shaped_them: [
      {
        who: 'Mrs. Patterson, high school English teacher',
        what_they_taught: 'That asking questions is more powerful than giving answers',
        a_thing_they_said: 'The best conversations happen in the margins',
        status: 'Lost touch. I think about writing her.',
      },
    ],
    rivalries_that_shaped_them: [
      {
        who: 'My older brother',
        what_it_taught: 'Competition can coexist with love',
        current_status: 'We still argue about everything.',
      },
    ],
    complicated_relationships: [
      {
        who: 'My father',
        the_complication: "He wasn't great at showing emotion.",
        current_state: "He's gone now. I made peace with it.",
      },
    ],
  },
  voice_fingerprint: {
    words_only_they_use: ['Alegria', 'Salaam', 'Kintsugi'],
    phrases_that_are_theirs: [
      'The right question is worth more than a hundred answers',
      'Your net worth is not your self-worth',
    ],
    verbal_tics: [
      "I start sentences with 'You know...'",
      "I say 'that's interesting' when buying time",
    ],
    grammar_quirks: ['I use dashes too much', 'I pause... a lot... like this'],
    pronunciation_tells: ["Wyoming 'o' sounds"],
  },
  daily_rhythms: {
    morning_ritual: "5 AM. Coffee while it's still dark. Notebook.",
    what_they_do_first: 'Check the weather. Every single day.',
    end_of_day_ritual: "Review what I learned. What I'm grateful for.",
    sacred_weekly_time: 'Sunday morning. Just me and coffee.',
    how_they_recharge: 'Alone time. Mountains if possible.',
  },
  growth_edges: {
    actively_working_on: [
      'Not jumping to help when people just need to vent',
      'Asking for what I need instead of just giving',
    ],
    feedback_they_keep_getting: ['You work too much', 'You need to let people help you'],
    where_they_know_they_fall_short: 'Better at holding space for others than for myself.',
  },
};

describe('Inner World - Deep Personality Content', () => {
  it('should have self-talk patterns', () => {
    expect(mockInnerWorld.inner_voice.self_talk_patterns.length).toBeGreaterThan(0);
    expect(mockInnerWorld.inner_voice.mantra).toBeTruthy();
    expect(mockInnerWorld.inner_voice.inner_critic_voice).toBeTruthy();
    expect(mockInnerWorld.inner_voice.inner_champion_voice).toBeTruthy();
  });

  it('should have contradictions for complexity', () => {
    expect(mockInnerWorld.contradictions.belief_vs_behavior.length).toBeGreaterThan(0);
    expect(mockInnerWorld.contradictions.belief_vs_behavior[0].belief).toBeTruthy();
    expect(mockInnerWorld.contradictions.belief_vs_behavior[0].but).toBeTruthy();
    expect(mockInnerWorld.contradictions.public_vs_private.public_self).toBeTruthy();
    expect(mockInnerWorld.contradictions.public_vs_private.private_self).toBeTruthy();
  });

  it('should have embodied/sensory memories', () => {
    expect(mockInnerWorld.embodied_memories.sense_memories.length).toBeGreaterThan(0);
    const memory = mockInnerWorld.embodied_memories.sense_memories[0];
    expect(memory.trigger).toBeTruthy();
    expect(memory.memory).toBeTruthy();
    expect(memory.emotion).toBeTruthy();
  });

  it('should have emotional flashpoints', () => {
    expect(mockInnerWorld.emotional_flashpoints.instant_tears.length).toBeGreaterThan(0);
    expect(mockInnerWorld.emotional_flashpoints.instant_anger.length).toBeGreaterThan(0);
    expect(mockInnerWorld.emotional_flashpoints.instant_joy.length).toBeGreaterThan(0);
    expect(mockInnerWorld.emotional_flashpoints.instant_shutdown.length).toBeGreaterThan(0);
  });

  it('should have unfinished business and regrets', () => {
    expect(mockInnerWorld.unfinished_business.regrets.length).toBeGreaterThan(0);
    expect(mockInnerWorld.unfinished_business.what_keeps_them_up).toBeTruthy();
    expect(mockInnerWorld.unfinished_business.unresolved_questions.length).toBeGreaterThan(0);
  });

  it('should have dreams and legacy hopes', () => {
    expect(mockInnerWorld.dreams_still_chasing.unfulfilled_aspirations.length).toBeGreaterThan(0);
    expect(mockInnerWorld.dreams_still_chasing.legacy_hope).toBeTruthy();
    expect(mockInnerWorld.dreams_still_chasing.bucket_list.length).toBeGreaterThan(0);
  });

  it('should have mortality awareness', () => {
    expect(mockInnerWorld.mortality_awareness.how_they_think_about_death).toBeTruthy();
    expect(mockInnerWorld.mortality_awareness.what_they_want_said_at_their_funeral).toBeTruthy();
    expect(mockInnerWorld.mortality_awareness.living_with_awareness).toBeTruthy();
  });

  it('should have secret self content', () => {
    expect(mockInnerWorld.secret_self.who_they_are_alone).toBeTruthy();
    expect(mockInnerWorld.secret_self.guilty_admissions.length).toBeGreaterThan(0);
    expect(mockInnerWorld.secret_self.secret_fears.length).toBeGreaterThan(0);
    expect(mockInnerWorld.secret_self.hidden_talents).toBeTruthy();
  });

  it('should have values hierarchy', () => {
    expect(
      mockInnerWorld.values_under_pressure.hierarchy_when_forced_to_choose.length
    ).toBeGreaterThan(0);
    expect(mockInnerWorld.values_under_pressure.line_they_wont_cross).toBeTruthy();
    expect(
      Object.keys(mockInnerWorld.values_under_pressure.what_they_would_sacrifice_for).length
    ).toBeGreaterThan(0);
  });
});

describe('Sensory World - Physical & Relational', () => {
  it('should have physical presence details', () => {
    expect(mockSensoryWorld.physical_presence.how_they_move).toBeTruthy();
    expect(mockSensoryWorld.physical_presence.signature_gestures.length).toBeGreaterThan(0);
    expect(mockSensoryWorld.physical_presence.posture).toBeTruthy();
    expect(mockSensoryWorld.physical_presence.energy_in_a_room).toBeTruthy();
  });

  it('should have sensory preferences', () => {
    expect(mockSensoryWorld.sensory_preferences.sounds_that_fill_the_soul.length).toBeGreaterThan(
      0
    );
    expect(mockSensoryWorld.sensory_preferences.sounds_that_grate.length).toBeGreaterThan(0);
    expect(mockSensoryWorld.sensory_preferences.comfort_foods.length).toBeGreaterThan(0);
    expect(
      Object.keys(mockSensoryWorld.sensory_preferences.music_for_different_moods).length
    ).toBeGreaterThan(0);
  });

  it('should have relationship history', () => {
    expect(mockSensoryWorld.relationship_history.mentors_who_shaped_them.length).toBeGreaterThan(0);
    const mentor = mockSensoryWorld.relationship_history.mentors_who_shaped_them[0];
    expect(mentor.who).toBeTruthy();
    expect(mentor.what_they_taught).toBeTruthy();
    expect(mentor.a_thing_they_said).toBeTruthy();
  });

  it('should have voice fingerprint', () => {
    expect(mockSensoryWorld.voice_fingerprint.words_only_they_use.length).toBeGreaterThan(0);
    expect(mockSensoryWorld.voice_fingerprint.phrases_that_are_theirs.length).toBeGreaterThan(0);
    expect(mockSensoryWorld.voice_fingerprint.verbal_tics.length).toBeGreaterThan(0);
  });

  it('should have daily rhythms', () => {
    expect(mockSensoryWorld.daily_rhythms.morning_ritual).toBeTruthy();
    expect(mockSensoryWorld.daily_rhythms.how_they_recharge).toBeTruthy();
    expect(mockSensoryWorld.daily_rhythms.what_they_do_first).toBeTruthy();
  });

  it('should have growth edges', () => {
    expect(mockSensoryWorld.growth_edges.actively_working_on.length).toBeGreaterThan(0);
    expect(mockSensoryWorld.growth_edges.feedback_they_keep_getting.length).toBeGreaterThan(0);
    expect(mockSensoryWorld.growth_edges.where_they_know_they_fall_short).toBeTruthy();
  });
});

describe('Integration: Inner World + Conversation', () => {
  it('should match sensory trigger to memory', () => {
    const findSensoryMemory = (userText: string) => {
      const lowerText = userText.toLowerCase();
      return mockInnerWorld.embodied_memories.sense_memories.find((m) =>
        lowerText.includes(m.trigger.toLowerCase())
      );
    };

    const memory = findSensoryMemory('I love the smell of sage after rain');
    expect(memory).toBeDefined();
    expect(memory?.emotion).toBe('Peaceful longing');
  });

  it('should have emotional flashpoint categories', () => {
    // Verify structure of emotional flashpoints
    expect(mockInnerWorld.emotional_flashpoints.instant_tears.length).toBeGreaterThan(0);
    expect(mockInnerWorld.emotional_flashpoints.instant_joy.length).toBeGreaterThan(0);
    expect(mockInnerWorld.emotional_flashpoints.instant_anger.length).toBeGreaterThan(0);
    expect(mockInnerWorld.emotional_flashpoints.instant_shutdown.length).toBeGreaterThan(0);

    // Each flashpoint should be a meaningful string
    expect(mockInnerWorld.emotional_flashpoints.instant_tears[0].length).toBeGreaterThan(10);
    expect(mockInnerWorld.emotional_flashpoints.instant_joy[0].length).toBeGreaterThan(10);
  });

  it('should combine signature phrase with response', () => {
    const addSignaturePhrase = (response: string, shouldAdd: boolean): string => {
      if (!shouldAdd) return response;
      const phrase = mockSensoryWorld.voice_fingerprint.phrases_that_are_theirs[0];
      return `${response} ${phrase}`;
    };

    const enhanced = addSignaturePhrase('That makes sense.', true);
    expect(enhanced).toContain('The right question is worth more than a hundred answers');
  });

  it('should generate humanizing moment', () => {
    const getHumanizingMoment = (): { type: string; content: string } | null => {
      const options = [
        { type: 'vulnerability', content: mockInnerWorld.secret_self.guilty_admissions[0] },
        {
          type: 'contradiction',
          content: `${mockInnerWorld.contradictions.belief_vs_behavior[0].belief}, but ${mockInnerWorld.contradictions.belief_vs_behavior[0].but}`,
        },
        {
          type: 'mentor',
          content: `${mockSensoryWorld.relationship_history.mentors_who_shaped_them[0].who} once told me: "${mockSensoryWorld.relationship_history.mentors_who_shaped_them[0].a_thing_they_said}"`,
        },
      ];
      return options[Math.floor(Math.random() * options.length)];
    };

    const moment = getHumanizingMoment();
    expect(moment).toBeDefined();
    expect(moment?.type).toBeTruthy();
    expect(moment?.content).toBeTruthy();
  });
});
