/**
 * Shared Vocabulary System for Holistic Natural Language Understanding
 *
 * Provides domain-agnostic vocabularies that enrich semantic routing across ALL tools.
 * Instead of each domain defining keywords independently, this provides shared understanding of:
 * - Relationships (family, friends, colleagues)
 * - Emotional states (stressed, happy, anxious)
 * - Time contexts (morning, night, weekend)
 * - Life domains (work, family, health)
 * - Intent markers (help me, I want, should I)
 *
 * @module tools/semantic-router/shared-vocabulary
 */

// ============================================================================
// RELATIONSHIP VOCABULARY
// ============================================================================

/**
 * Personal relationship terms that indicate the user is talking about someone they know.
 * These boost conversational, personal, and relationship-focused tools.
 */
export const RELATIONSHIP_VOCABULARY = {
  // Family - Immediate
  family_immediate: {
    terms: [
      'mom',
      'mother',
      'dad',
      'father',
      'parents',
      'son',
      'daughter',
      'child',
      'children',
      'kids',
    ],
    weight: 0.9,
    context: 'family',
    sentiment: 'personal',
  },
  // Family - Extended
  family_extended: {
    terms: [
      'grandma',
      'grandmother',
      'grandpa',
      'grandfather',
      'grandparents',
      'aunt',
      'uncle',
      'cousin',
      'niece',
      'nephew',
      'sister',
      'brother',
      'sibling',
      'siblings',
      'in-laws',
      'mother-in-law',
      'father-in-law',
    ],
    weight: 0.85,
    context: 'family',
    sentiment: 'personal',
  },
  // Romantic
  romantic: {
    terms: [
      'wife',
      'husband',
      'spouse',
      'partner',
      'boyfriend',
      'girlfriend',
      'fiance',
      'fiancee',
      'significant other',
      'SO',
      'bae',
      'love',
    ],
    weight: 0.9,
    context: 'romantic',
    sentiment: 'personal',
  },
  // Friends
  friends: {
    terms: [
      'friend',
      'friends',
      'best friend',
      'bestie',
      'bff',
      'buddy',
      'pal',
      'roommate',
      'housemate',
      'neighbor',
    ],
    weight: 0.8,
    context: 'social',
    sentiment: 'personal',
  },
  // Professional
  professional: {
    terms: [
      'boss',
      'manager',
      'supervisor',
      'coworker',
      'colleague',
      'employee',
      'team',
      'team member',
      'client',
      'customer',
      'mentor',
      'mentee',
    ],
    weight: 0.7,
    context: 'work',
    sentiment: 'professional',
  },
  // Services/Business
  services: {
    terms: [
      'doctor',
      'dentist',
      'therapist',
      'counselor',
      'lawyer',
      'accountant',
      'plumber',
      'electrician',
      'mechanic',
      'contractor',
      'bank',
      'pharmacy',
      'hospital',
      'clinic',
      'office',
    ],
    weight: 0.6,
    context: 'service',
    sentiment: 'transactional',
  },
  // Group/Team relationships
  group_team: {
    terms: [
      'team',
      'our team',
      'the team',
      'group',
      'our group',
      'committee',
      'board',
      'department',
      'squad',
      'crew',
      'staff',
      'organization',
    ],
    weight: 0.7,
    context: 'group',
    sentiment: 'collective',
  },
  // Community relationships
  community: {
    terms: [
      'community',
      'neighborhood',
      'neighbors',
      'congregation',
      'church',
      'temple',
      'mosque',
      'synagogue',
      'parish',
      'local',
      'town',
    ],
    weight: 0.65,
    context: 'community',
    sentiment: 'collective',
  },
  // Social groups
  social_group: {
    terms: [
      'book club',
      'support group',
      'meetup',
      'club',
      'class',
      'classmates',
      'alumni',
      'members',
      'fellow',
      'peers',
      'cohort',
      'circle of friends',
    ],
    weight: 0.7,
    context: 'social',
    sentiment: 'collective',
  },
} as const;

/**
 * Flatten all relationship terms for quick lookup
 */
export const ALL_RELATIONSHIP_TERMS = new Set(
  Object.values(RELATIONSHIP_VOCABULARY).flatMap((v) => v.terms)
);

/**
 * Escape special regex characters in a string (for relationship detection)
 * Note: duplicated from below to ensure it's available before first use
 */
function escapeRegexChars(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a term exists as a complete word/phrase in text (for relationship detection)
 */
function matchesAsWord(term: string, text: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegexChars(term)}\\b`, 'i');
  return pattern.test(text);
}

/**
 * Get relationship context from text
 */
export function detectRelationshipContext(
  text: string
): { found: boolean; type: string; weight: number; context: string; sentiment: string } | null {
  const normalized = text.toLowerCase();

  for (const [type, vocab] of Object.entries(RELATIONSHIP_VOCABULARY)) {
    for (const term of vocab.terms) {
      if (matchesAsWord(term, normalized)) {
        return {
          found: true,
          type,
          weight: vocab.weight,
          context: vocab.context,
          sentiment: vocab.sentiment,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// EMOTIONAL VOCABULARY
// ============================================================================

/**
 * Emotional state terms that indicate how the user is feeling.
 * These boost wellness, support, and context-appropriate tools.
 */
export const EMOTIONAL_VOCABULARY = {
  // Positive emotions
  positive: {
    terms: [
      'happy',
      'excited',
      'grateful',
      'thankful',
      'joyful',
      'content',
      'proud',
      'confident',
      'hopeful',
      'optimistic',
      'calm',
      'peaceful',
      'energized',
      'motivated',
      'inspired',
      'accomplished',
    ],
    weight: 0.7,
    valence: 'positive',
    urgency: 'low',
  },
  // Negative - Stress/Anxiety
  stressed: {
    terms: [
      'stressed',
      'anxious',
      'worried',
      'nervous',
      'overwhelmed',
      'panicked',
      'tense',
      'on edge',
      'freaking out',
      'cant cope',
      "can't cope",
    ],
    weight: 0.85,
    valence: 'negative',
    urgency: 'medium',
    boostDomains: ['wellness', 'self-compassion', 'presence', 'crisis'],
  },
  // Negative - Sadness
  sad: {
    terms: [
      'sad',
      'depressed',
      'down',
      'blue',
      'unhappy',
      'miserable',
      'lonely',
      'isolated',
      'empty',
      'numb',
      'hopeless',
      'despair',
    ],
    weight: 0.85,
    valence: 'negative',
    urgency: 'medium',
    boostDomains: ['wellness', 'connection', 'grief', 'self-compassion'],
  },
  // Negative - Anger
  angry: {
    terms: [
      'angry',
      'mad',
      'furious',
      'frustrated',
      'annoyed',
      'irritated',
      'pissed',
      'enraged',
      'resentful',
      'bitter',
    ],
    weight: 0.8,
    valence: 'negative',
    urgency: 'medium',
    boostDomains: ['communication', 'relationships', 'anger'],
  },
  // Crisis - High urgency
  crisis: {
    terms: [
      'suicidal',
      'kill myself',
      'end it',
      'cant go on',
      "can't go on",
      'no reason to live',
      'want to die',
      'hurt myself',
      'self-harm',
      'emergency',
      'crisis',
      'urgent',
      'help me now',
    ],
    weight: 1.0,
    valence: 'crisis',
    urgency: 'critical',
    boostDomains: ['crisis', 'safety'],
  },
  // Confusion/Uncertainty
  confused: {
    terms: [
      'confused',
      'lost',
      'stuck',
      'dont know',
      "don't know",
      'uncertain',
      'unsure',
      'torn',
      'conflicted',
      'indecisive',
    ],
    weight: 0.7,
    valence: 'neutral',
    urgency: 'low',
    boostDomains: ['decisions', 'wisdom', 'meaning'],
  },
  // Burnout/Exhaustion
  exhausted: {
    terms: [
      'exhausted',
      'burnt out',
      'burnout',
      'drained',
      'tired',
      'fatigued',
      'wiped out',
      'running on empty',
      'overwhelmed',
    ],
    weight: 0.85,
    valence: 'negative',
    urgency: 'medium',
    boostDomains: ['wellness', 'habits', 'capacity-guardian'],
  },
  // Fear/Scared
  scared: {
    terms: [
      'scared',
      'afraid',
      'frightened',
      'terrified',
      'fearful',
      'dreading',
      'spooked',
      'alarmed',
      'petrified',
      'panicking',
    ],
    weight: 0.85,
    valence: 'negative',
    urgency: 'medium',
    boostDomains: ['wellness', 'self-compassion', 'safety'],
  },
  // Shame/Guilt
  ashamed: {
    terms: [
      'ashamed',
      'embarrassed',
      'guilty',
      'regret',
      'mortified',
      'humiliated',
      'self-conscious',
      'disgraceful',
      'blaming myself',
    ],
    weight: 0.8,
    valence: 'negative',
    urgency: 'medium',
    boostDomains: ['self-compassion', 'vulnerability', 'relationships'],
  },
  // Disgust
  disgusted: {
    terms: [
      'disgusted',
      'repulsed',
      'grossed out',
      'revolted',
      'sickened',
      'appalled',
      'offended',
      'turned off',
    ],
    weight: 0.7,
    valence: 'negative',
    urgency: 'low',
    boostDomains: ['communication', 'boundaries'],
  },
  // Surprise
  surprised: {
    terms: [
      'surprised',
      'shocked',
      'amazed',
      'astonished',
      'stunned',
      'blown away',
      'caught off guard',
      'unexpected',
    ],
    weight: 0.6,
    valence: 'neutral',
    urgency: 'low',
    boostDomains: ['communication'],
  },
  // Curiosity/Interest
  curious: {
    terms: [
      'curious',
      'interested',
      'fascinated',
      'intrigued',
      'wondering',
      'want to know',
      'want to learn',
      'exploring',
    ],
    weight: 0.65,
    valence: 'positive',
    urgency: 'low',
    boostDomains: ['information', 'learning', 'curiosity', 'research'],
  },
  // Boredom
  bored: {
    terms: [
      'bored',
      'boring',
      'unstimulated',
      'uninterested',
      'disengaged',
      'nothing to do',
      'monotonous',
      'dull',
      'tedious',
    ],
    weight: 0.6,
    valence: 'neutral',
    urgency: 'low',
    boostDomains: ['entertainment', 'play', 'creativity', 'curiosity'],
  },
  // Love/Affection
  loving: {
    terms: [
      'love',
      'loving',
      'affection',
      'adore',
      'cherish',
      'care deeply',
      'devoted',
      'fond',
      'smitten',
    ],
    weight: 0.75,
    valence: 'positive',
    urgency: 'low',
    boostDomains: ['relationships', 'communication', 'connection'],
  },
  // Grief/Loss
  grieving: {
    terms: [
      'grieving',
      'mourning',
      'loss',
      'lost someone',
      'passed away',
      'died',
      'death',
      'bereaved',
      'missing them',
    ],
    weight: 0.9,
    valence: 'negative',
    urgency: 'medium',
    boostDomains: ['grief', 'self-compassion', 'connection', 'wellness'],
  },
  // Jealousy/Envy
  jealous: {
    terms: [
      'jealous',
      'envious',
      'envy',
      'resentful',
      'covetous',
      'comparing myself',
      'feeling left out',
      'fomo',
    ],
    weight: 0.7,
    valence: 'negative',
    urgency: 'low',
    boostDomains: ['self-compassion', 'meaning', 'relationships'],
  },
  // Anticipation/Excitement
  anticipating: {
    terms: [
      'looking forward',
      'cant wait',
      "can't wait",
      'excited about',
      'eager',
      'anticipating',
      'counting down',
      'pumped',
    ],
    weight: 0.7,
    valence: 'positive',
    urgency: 'low',
    boostDomains: ['life-planning', 'calendar', 'habits'],
  },
} as const;

/**
 * Detect emotional state from text
 * Uses word boundary matching (matchesAsWord) to prevent false positives
 * like "blue" matching "bluegrass" or "low" matching "allow"
 */
export function detectEmotionalState(text: string): {
  found: boolean;
  type: string;
  weight: number;
  valence: string;
  urgency: string;
  boostDomains?: readonly string[];
} | null {
  const normalized = text.toLowerCase();

  // Check crisis first (highest priority)
  // Crisis terms use substring match since they're multi-word phrases
  // and we want to catch partial matches like "want to die" in context
  for (const term of EMOTIONAL_VOCABULARY.crisis.terms) {
    if (normalized.includes(term.toLowerCase())) {
      return {
        found: true,
        type: 'crisis',
        weight: EMOTIONAL_VOCABULARY.crisis.weight,
        valence: EMOTIONAL_VOCABULARY.crisis.valence,
        urgency: EMOTIONAL_VOCABULARY.crisis.urgency,
        boostDomains: EMOTIONAL_VOCABULARY.crisis.boostDomains,
      };
    }
  }

  // Check other emotions - use word boundary matching to prevent false positives
  for (const [type, vocab] of Object.entries(EMOTIONAL_VOCABULARY)) {
    if (type === 'crisis') continue; // Already checked
    for (const term of vocab.terms) {
      if (matchesAsWord(term, normalized)) {
        return {
          found: true,
          type,
          weight: vocab.weight,
          valence: vocab.valence,
          urgency: vocab.urgency,
          boostDomains: 'boostDomains' in vocab ? vocab.boostDomains : undefined,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// TIME CONTEXT VOCABULARY
// ============================================================================

/**
 * Time-based context terms that indicate when something is happening.
 * These can boost time-appropriate tools.
 */
export const TIME_VOCABULARY = {
  // Time of day
  morning: {
    terms: ['morning', 'sunrise', 'dawn', 'wake up', 'waking up', 'first thing'],
    weight: 0.6,
    period: 'morning',
    boostDomains: ['habits', 'wellness', 'productivity'],
  },
  evening: {
    terms: ['evening', 'night', 'nighttime', 'tonight', 'sunset', 'dusk', 'before bed', 'bedtime'],
    weight: 0.6,
    period: 'evening',
    boostDomains: ['wellness', 'presence', 'reflection'],
  },
  weekend: {
    terms: ['weekend', 'saturday', 'sunday', 'day off', 'days off'],
    weight: 0.5,
    period: 'weekend',
    boostDomains: ['play', 'creativity', 'relationships'],
  },
  workday: {
    terms: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'workday', 'work day'],
    weight: 0.5,
    period: 'workday',
    boostDomains: ['productivity', 'calendar', 'communication'],
  },
  // Urgency indicators
  now: {
    terms: ['now', 'right now', 'immediately', 'asap', 'urgent', 'quickly', 'hurry'],
    weight: 0.8,
    period: 'immediate',
    urgency: 'high',
  },
  later: {
    terms: ['later', 'tomorrow', 'next week', 'sometime', 'eventually', 'when I have time'],
    weight: 0.4,
    period: 'future',
    urgency: 'low',
  },
  // Critical/Emergency timing
  emergency: {
    terms: [
      'emergency',
      'critical',
      'life or death',
      'cant wait',
      "can't wait",
      'need it now',
      'this instant',
      'right away',
    ],
    weight: 1.0,
    period: 'immediate',
    urgency: 'critical',
  },
  // Deadline-driven
  deadline: {
    terms: [
      'deadline',
      'due',
      'due date',
      'by tomorrow',
      'by tonight',
      'end of day',
      'eod',
      'before',
      'must be done',
      'running out of time',
    ],
    weight: 0.75,
    period: 'deadline',
    urgency: 'high',
    boostDomains: ['productivity', 'calendar', 'tasks'],
  },
  // Time-sensitive but not urgent
  soon: {
    terms: [
      'soon',
      'shortly',
      'in a bit',
      'in a few minutes',
      'in an hour',
      'this afternoon',
      'this morning',
      'today',
    ],
    weight: 0.6,
    period: 'near_future',
    urgency: 'medium',
  },
  // Seasonal
  seasonal: {
    terms: [
      'holiday',
      'christmas',
      'thanksgiving',
      'new years',
      'birthday',
      'anniversary',
      'summer',
      'winter',
      'spring',
      'fall',
      'season',
    ],
    weight: 0.5,
    period: 'seasonal',
    boostDomains: ['life-planning', 'calendar', 'relationships'],
  },
} as const;

/**
 * Detect time context from text
 * Uses word boundary matching to prevent false positives
 */
export function detectTimeContext(text: string): {
  found: boolean;
  type: string;
  weight: number;
  period: string;
  urgency?: string;
  boostDomains?: readonly string[];
} | null {
  const normalized = text.toLowerCase();

  for (const [type, vocab] of Object.entries(TIME_VOCABULARY)) {
    for (const term of vocab.terms) {
      if (matchesAsWord(term, normalized)) {
        return {
          found: true,
          type,
          weight: vocab.weight,
          period: vocab.period,
          urgency: 'urgency' in vocab ? vocab.urgency : undefined,
          boostDomains: 'boostDomains' in vocab ? vocab.boostDomains : undefined,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// LIFE DOMAIN VOCABULARY
// ============================================================================

/**
 * Life domain terms that indicate what area of life the user is talking about.
 * These help route to the right category of tools.
 */
export const LIFE_DOMAIN_VOCABULARY = {
  work: {
    terms: [
      'work',
      'job',
      'career',
      'office',
      'meeting',
      'presentation',
      'deadline',
      'project',
      'boss',
      'coworker',
      'promotion',
      'salary',
      'interview',
    ],
    weight: 0.8,
    domain: 'work',
    toolCategories: ['career', 'productivity', 'communication', 'calendar'],
  },
  health: {
    terms: [
      'health',
      'healthy',
      'doctor',
      'medical',
      'sick',
      'illness',
      'symptom',
      'medication',
      'exercise',
      'diet',
      'nutrition',
      'sleep',
      'fitness',
    ],
    weight: 0.8,
    domain: 'health',
    toolCategories: ['wellness', 'habits', 'information'],
  },
  finance: {
    terms: [
      'money',
      'budget',
      'finance',
      'financial',
      'savings',
      'debt',
      'investment',
      'stock',
      'bank',
      'credit',
      'loan',
      'mortgage',
      'retirement',
      'expense',
    ],
    weight: 0.8,
    domain: 'finance',
    toolCategories: ['finance', 'research', 'decisions'],
  },
  relationships: {
    terms: [
      'relationship',
      'dating',
      'marriage',
      'divorce',
      'family',
      'friend',
      'breakup',
      'conflict',
      'communication',
      'trust',
      'love',
    ],
    weight: 0.85,
    domain: 'relationships',
    toolCategories: ['relationships', 'communication', 'connection'],
  },
  personal_growth: {
    terms: [
      'growth',
      'self-improvement',
      'learning',
      'goal',
      'habit',
      'change',
      'purpose',
      'meaning',
      'values',
      'mindset',
      'motivation',
    ],
    weight: 0.75,
    domain: 'personal_growth',
    toolCategories: ['habits', 'meaning', 'learning', 'life-planning'],
  },
  mental_health: {
    terms: [
      'mental health',
      'therapy',
      'therapist',
      'counseling',
      'anxiety',
      'depression',
      'trauma',
      'healing',
      'coping',
      'self-care',
      'mindfulness',
    ],
    weight: 0.9,
    domain: 'mental_health',
    toolCategories: ['wellness', 'self-compassion', 'crisis', 'trauma'],
  },
} as const;

/**
 * Detect life domain from text
 * Uses word boundary matching to prevent false positives
 */
export function detectLifeDomain(text: string): {
  found: boolean;
  type: string;
  weight: number;
  domain: string;
  toolCategories: readonly string[];
} | null {
  const normalized = text.toLowerCase();

  for (const [type, vocab] of Object.entries(LIFE_DOMAIN_VOCABULARY)) {
    for (const term of vocab.terms) {
      if (matchesAsWord(term, normalized)) {
        return {
          found: true,
          type,
          weight: vocab.weight,
          domain: vocab.domain,
          toolCategories: vocab.toolCategories,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// INTENT MARKER VOCABULARY
// ============================================================================

/**
 * Intent markers that indicate what kind of action the user wants.
 */
export const INTENT_VOCABULARY = {
  // Help-seeking
  help: {
    terms: ['help me', 'help with', 'i need help', 'can you help', 'assist me', 'support me'],
    weight: 0.7,
    intent: 'help',
    mood: 'request',
  },
  // Decision-making
  decide: {
    terms: [
      'should i',
      'what should',
      'help me decide',
      'torn between',
      'cant decide',
      "can't decide",
      'which one',
      'better option',
      'pros and cons',
    ],
    weight: 0.8,
    intent: 'decide',
    mood: 'question',
    boostDomains: ['decisions', 'wisdom'],
  },
  // Planning
  plan: {
    terms: [
      'plan',
      'planning',
      'schedule',
      'organize',
      'prepare',
      'set up',
      'get ready',
      'make a plan',
      'strategy',
    ],
    weight: 0.75,
    intent: 'plan',
    mood: 'request',
    boostDomains: ['life-planning', 'calendar', 'productivity'],
  },
  // Understanding
  understand: {
    terms: [
      'why',
      'how come',
      'what does',
      'explain',
      'understand',
      'tell me about',
      'what is',
      'how does',
      'learn about',
    ],
    weight: 0.6,
    intent: 'understand',
    mood: 'question',
    boostDomains: ['information', 'wisdom', 'research'],
  },
  // Action
  action: {
    terms: [
      'do',
      'start',
      'begin',
      'make',
      'create',
      'send',
      'call',
      'text',
      'play',
      'stop',
      'pause',
      'set',
      'add',
      'remove',
      'delete',
    ],
    weight: 0.9,
    intent: 'action',
    mood: 'command',
  },
  // Reflection
  reflect: {
    terms: [
      'think about',
      'reflect on',
      'process',
      'work through',
      'figure out',
      'make sense of',
      'come to terms',
      'understand myself',
    ],
    weight: 0.7,
    intent: 'reflect',
    mood: 'request',
    boostDomains: ['wisdom', 'meaning', 'self-compassion'],
  },
} as const;

/**
 * Detect intent markers from text (help me, I want, should I, etc.)
 * Named detectIntentMarkers to distinguish from matcher.ts detectIntent
 * Uses word boundary matching to prevent false positives
 */
export function detectIntentMarkers(text: string): {
  found: boolean;
  type: string;
  weight: number;
  intent: string;
  mood: string;
  boostDomains?: readonly string[];
} | null {
  const normalized = text.toLowerCase();

  for (const [type, vocab] of Object.entries(INTENT_VOCABULARY)) {
    for (const term of vocab.terms) {
      if (matchesAsWord(term, normalized)) {
        return {
          found: true,
          type,
          weight: vocab.weight,
          intent: vocab.intent,
          mood: vocab.mood,
          boostDomains: 'boostDomains' in vocab ? vocab.boostDomains : undefined,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// HOLISTIC CONTEXT ANALYSIS
// ============================================================================

export interface HolisticContext {
  relationship: ReturnType<typeof detectRelationshipContext>;
  emotion: ReturnType<typeof detectEmotionalState>;
  time: ReturnType<typeof detectTimeContext>;
  lifeDomain: ReturnType<typeof detectLifeDomain>;
  intent: ReturnType<typeof detectIntentMarkers>;
  // Computed boosts
  domainBoosts: Map<string, number>;
  overallUrgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: 'positive' | 'neutral' | 'negative' | 'crisis';
}

/**
 * Perform holistic context analysis on user input.
 * Returns all detected context and computed domain boosts.
 */
export function analyzeHolisticContext(text: string): HolisticContext {
  const relationship = detectRelationshipContext(text);
  const emotion = detectEmotionalState(text);
  const time = detectTimeContext(text);
  const lifeDomain = detectLifeDomain(text);
  const intent = detectIntentMarkers(text);

  // Compute domain boosts from all detected contexts
  const domainBoosts = new Map<string, number>();

  // Add boosts from emotion
  if (emotion?.boostDomains) {
    for (const domain of emotion.boostDomains) {
      domainBoosts.set(domain, (domainBoosts.get(domain) || 0) + emotion.weight * 0.3);
    }
  }

  // Add boosts from time
  if (time?.boostDomains) {
    for (const domain of time.boostDomains) {
      domainBoosts.set(domain, (domainBoosts.get(domain) || 0) + time.weight * 0.2);
    }
  }

  // Add boosts from life domain
  if (lifeDomain?.toolCategories) {
    for (const category of lifeDomain.toolCategories) {
      domainBoosts.set(category, (domainBoosts.get(category) || 0) + lifeDomain.weight * 0.25);
    }
  }

  // Add boosts from intent
  if (intent?.boostDomains) {
    for (const domain of intent.boostDomains) {
      domainBoosts.set(domain, (domainBoosts.get(domain) || 0) + intent.weight * 0.2);
    }
  }

  // Add relationship context boosts
  if (relationship) {
    if (relationship.sentiment === 'personal') {
      domainBoosts.set('relationships', (domainBoosts.get('relationships') || 0) + 0.2);
      domainBoosts.set('communication', (domainBoosts.get('communication') || 0) + 0.15);
    }
  }

  // Determine overall urgency
  let overallUrgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (emotion?.urgency === 'critical') overallUrgency = 'critical';
  else if (emotion?.urgency === 'medium' || time?.urgency === 'high') overallUrgency = 'medium';
  else if (time?.urgency === 'high') overallUrgency = 'high';

  // Determine overall sentiment
  let sentiment: 'positive' | 'neutral' | 'negative' | 'crisis' = 'neutral';
  if (emotion?.valence === 'crisis') sentiment = 'crisis';
  else if (emotion?.valence === 'negative') sentiment = 'negative';
  else if (emotion?.valence === 'positive') sentiment = 'positive';

  return {
    relationship,
    emotion,
    time,
    lifeDomain,
    intent,
    domainBoosts,
    overallUrgency,
    sentiment,
  };
}

// ============================================================================
// TOOL BOOST CALCULATION
// ============================================================================

/**
 * Calculate boost for a specific tool based on holistic context.
 * This can be used by the semantic router to adjust tool scores.
 */
export function calculateToolBoost(
  toolId: string,
  toolCategory: string,
  holisticContext: HolisticContext
): number {
  let boost = 0;

  // Category-based boost
  const categoryBoost = holisticContext.domainBoosts.get(toolCategory) || 0;
  boost += categoryBoost;

  // Relationship-based boost for communication tools
  if (holisticContext.relationship && toolCategory === 'telephony') {
    if (holisticContext.relationship.sentiment === 'personal') {
      // Personal relationships → boost conversational tools
      if (toolId.includes('converse') || toolId.includes('talk') || toolId.includes('chat')) {
        boost += 0.3;
      }
    } else if (holisticContext.relationship.sentiment === 'transactional') {
      // Business/service → boost simple call/voicemail tools
      if (toolId.includes('call') && !toolId.includes('converse')) {
        boost += 0.2;
      }
    }
  }

  // Crisis boost
  if (holisticContext.sentiment === 'crisis') {
    if (toolCategory === 'crisis' || toolCategory === 'safety') {
      boost += 0.5; // Strong boost for crisis tools
    }
  }

  return boost;
}

/**
 * Calculate penalty for a tool based on holistic context.
 * This can be used to reduce scores for inappropriate tools.
 */
export function calculateToolPenalty(
  toolId: string,
  toolCategory: string,
  holisticContext: HolisticContext
): number {
  let penalty = 0;

  // Personal relationship + simple call tool = penalty
  if (holisticContext.relationship?.sentiment === 'personal' && toolCategory === 'telephony') {
    if (!toolId.includes('converse') && toolId.includes('call')) {
      penalty += 0.25; // Penalize simple call for personal contacts
    }
  }

  // Negative emotion + entertainment = slight penalty (not always appropriate)
  if (holisticContext.sentiment === 'negative' && toolCategory === 'entertainment') {
    penalty += 0.1;
  }

  return penalty;
}
