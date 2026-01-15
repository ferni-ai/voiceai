/**
 * Synthetic Memory Conversation Fixtures
 *
 * Test data for validating the dynamic memory pipeline:
 * - Fast capture extraction
 * - Deep extraction (LLM)
 * - Entity/fact/relationship storage
 * - Context retrieval
 *
 * @module tests/fixtures/memory-conversations
 */

import type { EntityMention, EmotionSignal, DateSignal } from '../../memory/dynamic/fast-capture.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  turnNumber: number;
  transcript: string;
  voiceEmotion?: string;
  personaId?: string;
  /** Expected fast capture results */
  expected: {
    entities: Array<{ name: string; type: EntityMention['type'] }>;
    emotions: Array<{ emotion: string; intensity: EmotionSignal['intensity'] }>;
    topics: string[];
    dateSignals: Array<{ type: DateSignal['type'] }>;
    shouldQueueDeepExtraction: boolean;
  };
}

export interface SyntheticConversation {
  id: string;
  name: string;
  description: string;
  userId: string;
  sessionId: string;
  turns: ConversationTurn[];
  /** Expected final state after all turns */
  finalState: {
    totalEntities: number;
    totalFacts: number;
    totalRelationships: number;
    keyPeople: string[];
    keyTopics: string[];
  };
}

// ============================================================================
// CONVERSATION: CAREER COACHING
// ============================================================================

export const CAREER_COACHING_CONVERSATION: SyntheticConversation = {
  id: 'career-coaching-001',
  name: 'Career Coaching Session',
  description: 'User discusses career goals, mentions colleagues and upcoming events',
  userId: 'test-user-career',
  sessionId: 'session-career-001',
  turns: [
    {
      turnNumber: 1,
      transcript: "Hi, I'm Sarah and I've been feeling really anxious about my job lately.",
      expected: {
        entities: [], // Sarah is user introducing themselves, not a third party
        emotions: [{ emotion: 'stress', intensity: 'medium' }],
        topics: ['work'],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 2,
      transcript: 'My boss Michael wants to talk about a promotion next week.',
      expected: {
        entities: [{ name: 'boss', type: 'person' }],
        emotions: [],
        topics: ['work'],
        dateSignals: [{ type: 'relative' }],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 3,
      transcript: "I'm worried because my coworker Lisa also applied for the same position.",
      expected: {
        entities: [{ name: 'coworker', type: 'person' }],
        emotions: [{ emotion: 'concern', intensity: 'low' }],
        topics: ['work'],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 4,
      transcript: 'The interview is scheduled for January 15th at the downtown office.',
      expected: {
        entities: [],
        emotions: [],
        topics: ['work'],
        dateSignals: [{ type: 'absolute' }],
        shouldQueueDeepExtraction: true,
      },
    },
  ],
  finalState: {
    totalEntities: 2, // boss, coworker
    totalFacts: 3, // promotion, interview date, location
    totalRelationships: 2, // user-boss, user-coworker
    keyPeople: ['boss', 'coworker'],
    keyTopics: ['work'],
  },
};

// ============================================================================
// CONVERSATION: FAMILY PLANNING
// ============================================================================

export const FAMILY_PLANNING_CONVERSATION: SyntheticConversation = {
  id: 'family-planning-001',
  name: 'Family Event Planning',
  description: 'User plans a family gathering, mentions relatives and dates',
  userId: 'test-user-family',
  sessionId: 'session-family-001',
  turns: [
    {
      turnNumber: 1,
      transcript: "I'm planning my sister Sarah's birthday party next week.",
      expected: {
        entities: [{ name: 'sister', type: 'person' }],
        emotions: [],
        topics: ['family'],
        dateSignals: [{ type: 'relative' }, { type: 'recurring' }],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 2,
      transcript: "She's turning 30 and wants to have dinner at that Italian place in Boston.",
      expected: {
        entities: [{ name: 'Boston', type: 'place' }],
        emotions: [],
        topics: [],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 3,
      transcript: "My mom is flying in from California. She's so excited!",
      expected: {
        entities: [
          { name: 'mom', type: 'person' },
          { name: 'California', type: 'place' },
        ],
        emotions: [{ emotion: 'joy', intensity: 'high' }],
        topics: ['family'],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 4,
      transcript: 'Dad said he might not make it because of work.',
      expected: {
        entities: [{ name: 'dad', type: 'person' }],
        emotions: [],
        topics: ['family', 'work'],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
  ],
  finalState: {
    totalEntities: 4, // sister, mom, dad, Boston (or California)
    totalFacts: 5, // birthday, age 30, Italian restaurant, flying from CA, dad work conflict
    totalRelationships: 3, // user-sister, user-mom, user-dad
    keyPeople: ['sister', 'mom', 'dad'],
    keyTopics: ['family'],
  },
};

// ============================================================================
// CONVERSATION: HEALTH TRACKING
// ============================================================================

export const HEALTH_TRACKING_CONVERSATION: SyntheticConversation = {
  id: 'health-tracking-001',
  name: 'Health Check-in',
  description: 'User discusses health concerns, appointments, and support',
  userId: 'test-user-health',
  sessionId: 'session-health-001',
  turns: [
    {
      turnNumber: 1,
      transcript: "I haven't been sleeping well lately. Maybe 4 hours a night.",
      expected: {
        entities: [],
        emotions: [],
        topics: ['sleep', 'health'],
        dateSignals: [],
        // No entities or high emotions, so no extraction queued
        shouldQueueDeepExtraction: false,
      },
    },
    {
      turnNumber: 2,
      transcript: "I have a doctor's appointment tomorrow morning.",
      expected: {
        entities: [{ name: 'doctor', type: 'person' }],
        emotions: [],
        topics: ['health'],
        dateSignals: [{ type: 'relative' }],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 3,
      transcript: "My therapist Dr. Johnson thinks it might be stress-related.",
      expected: {
        entities: [{ name: 'therapist', type: 'person' }],
        emotions: [],
        topics: ['health', 'mental_health'],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 4,
      transcript: "I'm exhausted but trying to exercise every morning.",
      expected: {
        entities: [],
        emotions: [],
        topics: ['fitness', 'sleep'],
        dateSignals: [],
        // No entities or high-intensity emotions - won't trigger deep extraction
        shouldQueueDeepExtraction: false,
      },
    },
  ],
  finalState: {
    totalEntities: 2, // doctor, therapist
    totalFacts: 4, // sleep hours, appointment, stress diagnosis, exercise routine
    totalRelationships: 2, // user-doctor, user-therapist
    keyPeople: ['doctor', 'therapist'],
    keyTopics: ['health', 'sleep'],
  },
};

// ============================================================================
// CONVERSATION: EMOTIONAL SUPPORT
// ============================================================================

export const EMOTIONAL_SUPPORT_CONVERSATION: SyntheticConversation = {
  id: 'emotional-support-001',
  name: 'Emotional Support Session',
  description: 'High-intensity emotional conversation with support network mentions',
  userId: 'test-user-emotional',
  sessionId: 'session-emotional-001',
  turns: [
    {
      turnNumber: 1,
      transcript: "I'm feeling devastated. My best friend Rachel moved away yesterday.",
      voiceEmotion: 'sad',
      expected: {
        entities: [{ name: 'friend', type: 'person' }],
        emotions: [
          { emotion: 'distress', intensity: 'high' },
          { emotion: 'sad', intensity: 'medium' }, // from voice
        ],
        topics: ['relationships'],
        dateSignals: [{ type: 'relative' }],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 2,
      transcript: "We've been friends for 15 years. She's like a sister to me.",
      expected: {
        entities: [{ name: 'sister', type: 'person' }],
        emotions: [],
        topics: ['relationships', 'family'],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 3,
      transcript: "My husband Mike has been really supportive though.",
      expected: {
        entities: [{ name: 'husband', type: 'person' }],
        emotions: [],
        topics: ['relationships'],
        dateSignals: [],
        shouldQueueDeepExtraction: true,
      },
    },
    {
      turnNumber: 4,
      transcript: "I'm trying to stay positive. We're planning to video call every Sunday.",
      expected: {
        entities: [],
        emotions: [{ emotion: 'contentment', intensity: 'medium' }],
        topics: [],
        dateSignals: [{ type: 'recurring' }],
        shouldQueueDeepExtraction: true,
      },
    },
  ],
  finalState: {
    totalEntities: 3, // friend Rachel, husband Mike, sister reference
    totalFacts: 4, // 15 years friends, moved away, video call schedule, supportive husband
    totalRelationships: 3, // user-friend, user-husband, friend-sister-like
    keyPeople: ['friend', 'husband'],
    keyTopics: ['relationships'],
  },
};

// ============================================================================
// EDGE CASES
// ============================================================================

export const MINIMAL_CONVERSATION: SyntheticConversation = {
  id: 'minimal-001',
  name: 'Minimal Input',
  description: 'Short, trivial inputs that should NOT trigger deep extraction',
  userId: 'test-user-minimal',
  sessionId: 'session-minimal-001',
  turns: [
    {
      turnNumber: 1,
      transcript: 'ok',
      expected: {
        entities: [],
        emotions: [],
        topics: [],
        dateSignals: [],
        shouldQueueDeepExtraction: false,
      },
    },
    {
      turnNumber: 2,
      transcript: 'yes',
      expected: {
        entities: [],
        emotions: [],
        topics: [],
        dateSignals: [],
        shouldQueueDeepExtraction: false,
      },
    },
    {
      turnNumber: 3,
      transcript: 'hmm',
      expected: {
        entities: [],
        emotions: [],
        topics: [],
        dateSignals: [],
        shouldQueueDeepExtraction: false,
      },
    },
  ],
  finalState: {
    totalEntities: 0,
    totalFacts: 0,
    totalRelationships: 0,
    keyPeople: [],
    keyTopics: [],
  },
};

export const HIGH_EMOTION_CONVERSATION: SyntheticConversation = {
  id: 'high-emotion-001',
  name: 'High Emotion Priority',
  description: 'Tests that high-intensity emotions trigger priority extraction',
  userId: 'test-user-emotion',
  sessionId: 'session-emotion-001',
  turns: [
    {
      turnNumber: 1,
      transcript: "I'm absolutely furious! My landlord raised the rent by 40%!",
      voiceEmotion: 'angry',
      expected: {
        entities: [{ name: 'landlord', type: 'person' }],
        emotions: [
          { emotion: 'distress', intensity: 'high' },
          { emotion: 'angry', intensity: 'medium' }, // from voice
        ],
        topics: ['finances'],
        dateSignals: [],
        shouldQueueDeepExtraction: true, // High priority due to emotion
      },
    },
  ],
  finalState: {
    totalEntities: 1,
    totalFacts: 1, // rent increase
    totalRelationships: 1, // user-landlord
    keyPeople: ['landlord'],
    keyTopics: ['finances'],
  },
};

// ============================================================================
// ALL CONVERSATIONS EXPORT
// ============================================================================

export const ALL_SYNTHETIC_CONVERSATIONS: SyntheticConversation[] = [
  CAREER_COACHING_CONVERSATION,
  FAMILY_PLANNING_CONVERSATION,
  HEALTH_TRACKING_CONVERSATION,
  EMOTIONAL_SUPPORT_CONVERSATION,
  MINIMAL_CONVERSATION,
  HIGH_EMOTION_CONVERSATION,
];

// ============================================================================
// INDIVIDUAL TRANSCRIPT TEST CASES
// ============================================================================

export interface TranscriptTestCase {
  id: string;
  transcript: string;
  voiceEmotion?: string;
  expectedEntities: Array<{ name: string; type: string }>;
  expectedEmotions: Array<{ emotion: string; intensity: string }>;
  expectedTopics: string[];
  expectedDateTypes: string[];
  description: string;
}

export const ENTITY_DETECTION_CASES: TranscriptTestCase[] = [
  {
    id: 'entity-family-members',
    transcript: 'My mom called and said my brother is visiting next week.',
    expectedEntities: [
      { name: 'mom', type: 'person' },
      { name: 'brother', type: 'person' },
    ],
    expectedEmotions: [],
    expectedTopics: ['family'],
    expectedDateTypes: ['relative'],
    description: 'Detects multiple family members',
  },
  {
    id: 'entity-proper-names',
    transcript: 'Sarah told me that Michael is getting married.',
    expectedEntities: [{ name: 'Sarah', type: 'person' }],
    expectedEmotions: [],
    expectedTopics: ['relationships'],
    expectedDateTypes: [],
    description: 'Detects proper names with action verbs',
  },
  {
    id: 'entity-places',
    transcript: 'I traveled to California and then to Boston last month.',
    expectedEntities: [
      { name: 'California', type: 'place' },
      { name: 'Boston', type: 'place' },
    ],
    expectedEmotions: [],
    expectedTopics: [],
    expectedDateTypes: ['relative'],
    description: 'Detects place names',
  },
  {
    id: 'entity-professional',
    transcript: 'My boss scheduled a meeting with my therapist.',
    expectedEntities: [
      { name: 'boss', type: 'person' },
      { name: 'therapist', type: 'person' },
    ],
    expectedEmotions: [],
    expectedTopics: ['work', 'health'],
    expectedDateTypes: [],
    description: 'Detects professional relationships',
  },
];

export const EMOTION_DETECTION_CASES: TranscriptTestCase[] = [
  {
    id: 'emotion-high-negative',
    transcript: "I'm devastated and heartbroken about what happened.",
    expectedEntities: [],
    expectedEmotions: [{ emotion: 'distress', intensity: 'high' }],
    expectedTopics: [],
    expectedDateTypes: [],
    description: 'Detects high-intensity negative emotions',
  },
  {
    id: 'emotion-medium-positive',
    transcript: "I'm really happy and excited about the news!",
    expectedEntities: [],
    expectedEmotions: [
      { emotion: 'positive', intensity: 'medium' },
      { emotion: 'positive', intensity: 'medium' },
    ],
    expectedTopics: [],
    expectedDateTypes: [],
    description: 'Detects medium-intensity positive emotions',
  },
  {
    id: 'emotion-low-concern',
    transcript: "I'm kind of worried about the situation.",
    expectedEntities: [],
    expectedEmotions: [{ emotion: 'concern', intensity: 'low' }],
    expectedTopics: [],
    expectedDateTypes: [],
    description: 'Detects low-intensity concerns',
  },
  {
    id: 'emotion-voice-override',
    transcript: 'Everything is fine.',
    voiceEmotion: 'anxious',
    expectedEntities: [],
    expectedEmotions: [
      { emotion: 'neutral', intensity: 'low' },
      { emotion: 'anxious', intensity: 'medium' },
    ],
    expectedTopics: [],
    expectedDateTypes: [],
    description: 'Voice emotion adds to keyword detection',
  },
];

export const TOPIC_DETECTION_CASES: TranscriptTestCase[] = [
  {
    id: 'topic-work',
    transcript: 'I have a meeting with my boss about the project deadline.',
    expectedEntities: [{ name: 'boss', type: 'person' }],
    expectedEmotions: [],
    expectedTopics: ['work'],
    expectedDateTypes: [],
    description: 'Detects work-related topics',
  },
  {
    id: 'topic-health-mental',
    transcript: "I've been feeling anxious and thinking about therapy.",
    expectedEntities: [],
    expectedEmotions: [{ emotion: 'stress', intensity: 'medium' }],
    expectedTopics: ['mental_health'],
    expectedDateTypes: [],
    description: 'Detects mental health topics',
  },
  {
    id: 'topic-multiple',
    transcript: "I'm stressed about money and can't sleep at night.",
    expectedEntities: [],
    expectedEmotions: [{ emotion: 'stress', intensity: 'medium' }],
    expectedTopics: ['finances', 'sleep'],
    expectedDateTypes: [],
    description: 'Detects multiple topics',
  },
];

export const DATE_DETECTION_CASES: TranscriptTestCase[] = [
  {
    id: 'date-absolute',
    transcript: 'The event is on January 15th at 3pm.',
    expectedEntities: [],
    expectedEmotions: [],
    expectedTopics: [],
    expectedDateTypes: ['absolute'],
    description: 'Detects absolute dates',
  },
  {
    id: 'date-relative',
    transcript: "I'll do it tomorrow or next week.",
    expectedEntities: [],
    expectedEmotions: [],
    expectedTopics: [],
    expectedDateTypes: ['relative'],
    description: 'Detects relative dates',
  },
  {
    id: 'date-recurring',
    transcript: "It's her birthday and we celebrate every year.",
    expectedEntities: [],
    expectedEmotions: [],
    expectedTopics: [],
    expectedDateTypes: ['recurring'],
    description: 'Detects recurring dates',
  },
];
