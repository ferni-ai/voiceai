/**
 * Life Chapter Awareness System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Understanding major life transitions and phases - knowing when someone
 * is building a career, navigating parenthood, healing from loss,
 * or exploring identity.
 *
 * "It sounds like you're in a real transition right now—leaving behind
 * the person you were at that company and figuring out who you want to become."
 *
 * This is superhuman because it synthesizes patterns across conversations
 * into a coherent narrative understanding of someone's life journey.
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'LifeChapter' });

// ============================================================================
// TYPES
// ============================================================================

export type ChapterType =
  | 'building_career' // Establishing professional identity
  | 'career_transition' // Changing career direction
  | 'early_relationship' // New romantic relationship
  | 'relationship_deepening' // Committing, moving in, marriage
  | 'relationship_struggle' // Working through difficulties
  | 'relationship_ending' // Breakup, divorce
  | 'early_parenthood' // New parent
  | 'active_parenthood' // Kids at home
  | 'empty_nest' // Kids leaving
  | 'caregiving' // Caring for aging parents
  | 'health_journey' // Dealing with health issues
  | 'healing_journey' // Recovering from trauma/loss
  | 'identity_exploration' // Figuring out who they are
  | 'midlife_reflection' // Reassessing life direction
  | 'retirement_transition' // Leaving work identity
  | 'grief_processing' // Processing significant loss
  | 'fresh_start' // Major life reset
  | 'stability_seeking' // Looking for groundedness
  | 'unknown';

export type TransitionPhase =
  | 'entering' // Just beginning this chapter
  | 'middle' // Deep in this chapter
  | 'exiting' // Beginning to leave this chapter
  | 'stable'; // Not in transition

export interface ChapterEvidence {
  /** Quote or signal */
  signal: string;

  /** When observed */
  timestamp: Date;

  /** What chapter it points to */
  suggestsChapter: ChapterType;

  /** Strength of signal */
  strength: number;
}

export interface LifeChapter {
  /** Current primary chapter */
  current: {
    chapter: ChapterType;
    subPhase: string;
    durationEstimate: number; // Months in chapter
    confidence: number;
  };

  /** Secondary chapters (can be in multiple) */
  secondary: ChapterType[];

  /** Transition state */
  transition: {
    phase: TransitionPhase;
    entering: ChapterType | null;
    leaving: ChapterType | null;
    grief: string[]; // What they're mourning
    excitement: string[]; // What they're anticipating
    resistance: string[]; // What they're resisting
  };

  /** What they need in this chapter */
  needs: {
    validation: string[]; // What needs to be seen
    permission: string[]; // What they need permission for
    guidance: string[]; // Where they need help
    witnessing: string[]; // What just needs to be heard
  };
}

export interface ChapterProfile {
  userId: string;

  /** Current life chapter assessment */
  chapter: LifeChapter;

  /** Historical evidence */
  evidence: ChapterEvidence[];

  /** Chapter history */
  history: Array<{
    chapter: ChapterType;
    entered: Date;
    exited?: Date;
    keyThemes: string[];
  }>;

  /** Metadata */
  metadata: {
    firstAssessed: Date;
    lastUpdated: Date;
    totalEvidence: number;
    assessmentConfidence: number;
  };
}

// ============================================================================
// CHAPTER DETECTION PATTERNS
// ============================================================================

const CHAPTER_SIGNALS: Record<
  ChapterType,
  {
    patterns: RegExp[];
    keywords: string[];
    emotionalSignatures: string[];
  }
> = {
  building_career: {
    patterns: [
      /just\s+(started|got)\s+(a\s+)?(new\s+)?(job|position|role)/i,
      /trying\s+to\s+(prove|establish|build)\s+(myself|my\s+career)/i,
      /early\s+in\s+my\s+career/i,
      /climb(ing)?\s+the\s+ladder/i,
    ],
    keywords: ['promotion', 'career growth', 'networking', 'entry level', 'first job'],
    emotionalSignatures: ['ambitious', 'excited', 'anxious', 'proving'],
  },
  career_transition: {
    patterns: [
      /thinking\s+(about|of)\s+(leaving|quitting|changing)/i,
      /career\s+(change|pivot|switch)/i,
      /don't\s+know\s+what\s+i\s+want\s+to\s+do/i,
      /hate\s+my\s+job/i,
      /burnt?\s*out/i,
    ],
    keywords: ['career change', 'new direction', 'burnout', 'quit', 'pivot'],
    emotionalSignatures: ['stuck', 'frustrated', 'uncertain', 'hopeful', 'scared'],
  },
  early_relationship: {
    patterns: [
      /just\s+started\s+(dating|seeing)/i,
      /new\s+(relationship|boyfriend|girlfriend|partner)/i,
      /getting\s+to\s+know/i,
      /really\s+like\s+(them|him|her)/i,
    ],
    keywords: ['dating', 'new relationship', 'falling for', 'chemistry'],
    emotionalSignatures: ['excited', 'nervous', 'hopeful', 'vulnerable'],
  },
  relationship_deepening: {
    patterns: [
      /moving\s+in\s+(together|with)/i,
      /getting\s+(engaged|married)/i,
      /taking\s+(it|things)\s+to\s+the\s+next/i,
      /ready\s+to\s+commit/i,
    ],
    keywords: ['engagement', 'moving in', 'commitment', 'marriage', 'next step'],
    emotionalSignatures: ['committed', 'scared', 'excited', 'serious'],
  },
  relationship_struggle: {
    patterns: [
      /having\s+(problems|issues|trouble)\s+(with|in)/i,
      /we('re|\s+are)\s+(fighting|arguing|not\s+getting\s+along)/i,
      /don't\s+know\s+if\s+(we|this)/i,
      /couples\s+(therapy|counseling)/i,
    ],
    keywords: ['relationship problems', 'fighting', 'disconnect', 'therapy'],
    emotionalSignatures: ['frustrated', 'sad', 'confused', 'hopeful', 'stuck'],
  },
  relationship_ending: {
    patterns: [
      /broke\s+up|breaking\s+up/i,
      /getting\s+(a\s+)?divorce/i,
      /it's\s+over/i,
      /we('re|\s+are)\s+(separating|splitting)/i,
      /ex\s+(boyfriend|girlfriend|husband|wife|partner)/i,
    ],
    keywords: ['breakup', 'divorce', 'separation', 'ex', 'split'],
    emotionalSignatures: ['heartbroken', 'relieved', 'lost', 'angry', 'sad'],
  },
  early_parenthood: {
    patterns: [
      /new\s+(baby|mom|dad|parent)/i,
      /just\s+had\s+(a\s+)?(baby|kid|child)/i,
      /pregnant|expecting/i,
      /newborn/i,
    ],
    keywords: ['baby', 'newborn', 'pregnant', 'first child', 'new parent'],
    emotionalSignatures: ['overwhelmed', 'joyful', 'exhausted', 'anxious', 'loving'],
  },
  active_parenthood: {
    patterns: [
      /my\s+(kid|kids|child|children)/i,
      /raising\s+(kids|children)/i,
      /parenting\s+is/i,
      /school|homework|activities/i,
    ],
    keywords: ['kids', 'parenting', 'school', 'activities', 'family'],
    emotionalSignatures: ['busy', 'proud', 'worried', 'fulfilled'],
  },
  empty_nest: {
    patterns: [
      /kids?\s+(left|leaving|moved\s+out)/i,
      /empty\s+nest/i,
      /house\s+is\s+(so\s+)?quiet/i,
      /just\s+the\s+two\s+of\s+us/i,
    ],
    keywords: ['empty nest', 'kids leaving', 'alone again', 'quiet house'],
    emotionalSignatures: ['sad', 'free', 'lost', 'reflective', 'lonely'],
  },
  caregiving: {
    patterns: [
      /taking\s+care\s+of\s+(my\s+)?(mom|dad|parent|mother|father)/i,
      /aging\s+parents?/i,
      /they\s+need\s+help/i,
      /caregiv(er|ing)/i,
    ],
    keywords: ['caregiving', 'aging parents', 'elderly', 'helping parents'],
    emotionalSignatures: ['overwhelmed', 'guilty', 'sad', 'dutiful', 'exhausted'],
  },
  health_journey: {
    patterns: [
      /diagnos(ed|is)/i,
      /dealing\s+with\s+.{1,20}(illness|condition|disease)/i,
      /health\s+(issues?|problems?|concerns?)/i,
      /treatment|surgery|recovery/i,
    ],
    keywords: ['diagnosis', 'health', 'illness', 'treatment', 'recovery'],
    emotionalSignatures: ['scared', 'determined', 'frustrated', 'hopeful'],
  },
  healing_journey: {
    patterns: [
      /healing\s+from/i,
      /working\s+(through|on)\s+(my|the)/i,
      /in\s+therapy/i,
      /processing\s+(what|my|the)/i,
      /trauma/i,
    ],
    keywords: ['healing', 'therapy', 'trauma', 'recovery', 'processing'],
    emotionalSignatures: ['vulnerable', 'hopeful', 'sad', 'growing', 'brave'],
  },
  identity_exploration: {
    patterns: [
      /figuring\s+out\s+who\s+i/i,
      /finding\s+myself/i,
      /don't\s+know\s+who\s+i\s+(am|want)/i,
      /identity/i,
      /what\s+do\s+i\s+(really\s+)?want/i,
    ],
    keywords: ['identity', 'self-discovery', 'who am I', 'finding myself'],
    emotionalSignatures: ['confused', 'curious', 'lost', 'excited', 'searching'],
  },
  midlife_reflection: {
    patterns: [
      /midlife/i,
      /half(way)?\s+(through|over)/i,
      /is\s+this\s+(all|it)/i,
      /look(ing)?\s+back\s+at\s+my\s+life/i,
      /what\s+have\s+i\s+(done|accomplished)/i,
    ],
    keywords: ['midlife', 'reflection', 'legacy', 'meaning', 'purpose'],
    emotionalSignatures: ['reflective', 'restless', 'grateful', 'questioning'],
  },
  retirement_transition: {
    patterns: [
      /retir(ing|ed|ement)/i,
      /after\s+\d+\s+years\s+(of|at)/i,
      /leaving\s+(work|my\s+career)/i,
      /what\s+do\s+i\s+do\s+now/i,
    ],
    keywords: ['retirement', 'leaving work', 'next chapter', 'legacy'],
    emotionalSignatures: ['uncertain', 'excited', 'scared', 'free', 'lost'],
  },
  grief_processing: {
    patterns: [
      /lost\s+(my|a)\s+(mom|dad|parent|friend|partner|husband|wife)/i,
      /passed\s+away/i,
      /death|died/i,
      /grieving|grief/i,
      /i\s+miss\s+(them|him|her)\s+so\s+much/i,
    ],
    keywords: ['grief', 'loss', 'death', 'passed away', 'mourning'],
    emotionalSignatures: ['sad', 'numb', 'angry', 'lost', 'reflective'],
  },
  fresh_start: {
    patterns: [
      /start(ing)?\s+(over|fresh|new)/i,
      /new\s+(beginning|chapter|life)/i,
      /moved\s+to\s+a\s+new/i,
      /leaving\s+everything\s+behind/i,
      /clean\s+slate/i,
    ],
    keywords: ['fresh start', 'new beginning', 'starting over', 'new chapter'],
    emotionalSignatures: ['hopeful', 'scared', 'excited', 'uncertain', 'free'],
  },
  stability_seeking: {
    patterns: [
      /need\s+(some\s+)?(stability|peace|calm)/i,
      /tired\s+of\s+(change|chaos|uncertainty)/i,
      /want\s+(things\s+to\s+)?settle\s+down/i,
      /craving\s+(routine|normalcy)/i,
    ],
    keywords: ['stability', 'peace', 'routine', 'settle down', 'calm'],
    emotionalSignatures: ['exhausted', 'hopeful', 'determined', 'craving'],
  },
  unknown: {
    patterns: [],
    keywords: [],
    emotionalSignatures: [],
  },
};

// ============================================================================
// STORAGE
// ============================================================================

const profiles = new Map<string, ChapterProfile>();

/**
 * Get or create chapter profile
 */
export function getChapterProfile(userId: string): ChapterProfile {
  let profile = profiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      chapter: {
        current: {
          chapter: 'unknown',
          subPhase: 'initial assessment',
          durationEstimate: 0,
          confidence: 0,
        },
        secondary: [],
        transition: {
          phase: 'stable',
          entering: null,
          leaving: null,
          grief: [],
          excitement: [],
          resistance: [],
        },
        needs: {
          validation: [],
          permission: [],
          guidance: [],
          witnessing: [],
        },
      },
      evidence: [],
      history: [],
      metadata: {
        firstAssessed: new Date(),
        lastUpdated: new Date(),
        totalEvidence: 0,
        assessmentConfidence: 0,
      },
    };
    profiles.set(userId, profile);
  }

  return profile;
}

// ============================================================================
// CHAPTER ANALYSIS
// ============================================================================

export interface ChapterAnalysis {
  /** Updated chapter assessment */
  chapter: LifeChapter;

  /** New evidence detected */
  newEvidence: ChapterEvidence[];

  /** Chapter-specific guidance */
  guidance: {
    approach: string;
    validate: string[];
    explore: string[];
    avoid: string[];
  };

  /** Narrative insight */
  narrativeInsight: string | null;
}

/**
 * Analyze for life chapter signals
 */
export function analyzeChapter(
  userId: string,
  text: string,
  topics: string[],
  emotions: string[]
): ChapterAnalysis {
  const profile = getChapterProfile(userId);
  const newEvidence: ChapterEvidence[] = [];

  // ========== DETECT CHAPTER SIGNALS ==========

  for (const [chapterType, signals] of Object.entries(CHAPTER_SIGNALS)) {
    const type = chapterType as ChapterType;
    if (type === 'unknown') continue;

    // Check patterns
    for (const pattern of signals.patterns) {
      if (pattern.test(text)) {
        newEvidence.push({
          signal: text.match(pattern)?.[0] || text.substring(0, 100),
          timestamp: new Date(),
          suggestsChapter: type,
          strength: 0.7,
        });
        break;
      }
    }

    // Check keywords
    for (const keyword of signals.keywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        newEvidence.push({
          signal: keyword,
          timestamp: new Date(),
          suggestsChapter: type,
          strength: 0.5,
        });
        break;
      }
    }

    // Check emotional signatures
    const matchingEmotions = signals.emotionalSignatures.filter((e) =>
      emotions.some((ue) => ue.toLowerCase().includes(e.toLowerCase()))
    );
    if (matchingEmotions.length >= 2) {
      // Need multiple matching emotions
      newEvidence.push({
        signal: `Emotional signature: ${matchingEmotions.join(', ')}`,
        timestamp: new Date(),
        suggestsChapter: type,
        strength: 0.3,
      });
    }
  }

  // Add evidence to profile
  for (const evidence of newEvidence) {
    profile.evidence.push(evidence);
  }

  // Keep evidence bounded
  if (profile.evidence.length > 100) {
    profile.evidence = profile.evidence.slice(-100);
  }

  // ========== UPDATE CHAPTER ASSESSMENT ==========

  updateChapterAssessment(profile);

  // ========== DETECT TRANSITION STATE ==========

  detectTransitionState(profile, text);

  // ========== IDENTIFY NEEDS ==========

  identifyChapterNeeds(profile, text, emotions);

  // ========== BUILD GUIDANCE ==========

  const guidance = buildChapterGuidance(profile);

  // ========== GENERATE NARRATIVE INSIGHT ==========

  const narrativeInsight = generateNarrativeInsight(profile, newEvidence);

  // Update metadata
  profile.metadata.lastUpdated = new Date();
  profile.metadata.totalEvidence = profile.evidence.length;

  log.debug(
    {
      userId,
      chapter: profile.chapter.current.chapter,
      confidence: profile.chapter.current.confidence,
    },
    '📖 Life chapter updated'
  );

  return {
    chapter: profile.chapter,
    newEvidence,
    guidance,
    narrativeInsight,
  };
}

/**
 * Update chapter assessment based on all evidence
 */
function updateChapterAssessment(profile: ChapterProfile): void {
  if (profile.evidence.length < 3) {
    return; // Need minimum evidence
  }

  // Count weighted evidence for each chapter
  // Using Partial since not all chapter types will have scores
  const chapterScores: Partial<Record<ChapterType, number>> = {};

  // More recent evidence weighted more heavily
  const now = Date.now();
  for (const evidence of profile.evidence) {
    const age = (now - evidence.timestamp.getTime()) / (1000 * 60 * 60 * 24); // Days
    const recencyWeight = Math.max(0.3, 1 - age / 30); // Decay over 30 days

    chapterScores[evidence.suggestsChapter] =
      (chapterScores[evidence.suggestsChapter] || 0) + evidence.strength * recencyWeight;
  }

  // Find top chapters
  const sortedChapters = Object.entries(chapterScores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  if (sortedChapters.length > 0) {
    const [topChapter, topScore] = sortedChapters[0];
    const previousChapter = profile.chapter.current.chapter;

    profile.chapter.current.chapter = topChapter as ChapterType;
    profile.chapter.current.confidence = Math.min(0.9, topScore / 5);

    // Track chapter change
    if (previousChapter !== topChapter && previousChapter !== 'unknown') {
      profile.chapter.transition.leaving = previousChapter as ChapterType;
      profile.chapter.transition.entering = topChapter as ChapterType;
      profile.chapter.transition.phase = 'entering';

      // Add to history
      const lastHistory = profile.history[profile.history.length - 1];
      if (lastHistory && !lastHistory.exited) {
        lastHistory.exited = new Date();
      }

      profile.history.push({
        chapter: topChapter as ChapterType,
        entered: new Date(),
        keyThemes: [],
      });
    }

    // Secondary chapters (others with significant scores)
    profile.chapter.secondary = sortedChapters
      .slice(1, 4)
      .filter(([, score]) => score > topScore * 0.5)
      .map(([chapter]) => chapter as ChapterType);
  }

  // Estimate duration in chapter
  const currentChapterStart = profile.history.find(
    (h) => h.chapter === profile.chapter.current.chapter && !h.exited
  )?.entered;

  if (currentChapterStart) {
    profile.chapter.current.durationEstimate = Math.floor(
      (Date.now() - currentChapterStart.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
  }
}

/**
 * Detect transition state
 */
function detectTransitionState(profile: ChapterProfile, text: string): void {
  const { transition } = profile.chapter;

  // Grief detection (what they're mourning)
  const griefPatterns = [
    /i\s+miss\s+(.{5,30})/i,
    /i('ll| will)\s+never\s+(.{5,20})\s+again/i,
    /losing|lost\s+(.{5,20})/i,
    /used\s+to\s+be/i,
  ];

  for (const pattern of griefPatterns) {
    const match = text.match(pattern);
    if (match) {
      const grief = match[1] || match[0];
      if (!transition.grief.includes(grief) && transition.grief.length < 5) {
        transition.grief.push(grief);
      }
    }
  }

  // Excitement detection
  const excitementPatterns = [
    /excited\s+(about|to|for)\s+(.{5,30})/i,
    /looking\s+forward\s+to\s+(.{5,30})/i,
    /can't\s+wait\s+(to|for)\s+(.{5,20})/i,
  ];

  for (const pattern of excitementPatterns) {
    const match = text.match(pattern);
    if (match) {
      const excitement = match[2] || match[1];
      if (!transition.excitement.includes(excitement) && transition.excitement.length < 5) {
        transition.excitement.push(excitement);
      }
    }
  }

  // Resistance detection
  const resistancePatterns = [
    /don't\s+want\s+to\s+(.{5,20})/i,
    /not\s+ready\s+(to|for)\s+(.{5,20})/i,
    /scared\s+to\s+(.{5,20})/i,
  ];

  for (const pattern of resistancePatterns) {
    const match = text.match(pattern);
    if (match) {
      const resistance = match[2] || match[1];
      if (!transition.resistance.includes(resistance) && transition.resistance.length < 5) {
        transition.resistance.push(resistance);
      }
    }
  }

  // Update phase
  if (transition.entering && transition.leaving) {
    transition.phase = 'entering';
  } else if (transition.grief.length > 0 && transition.excitement.length === 0) {
    transition.phase = 'exiting';
  } else if (transition.excitement.length > 0 && transition.grief.length === 0) {
    transition.phase = 'entering';
  } else if (profile.chapter.current.durationEstimate > 3) {
    transition.phase = 'middle';
  }
}

/**
 * Identify what they need in this chapter
 */
function identifyChapterNeeds(profile: ChapterProfile, text: string, emotions: string[]): void {
  const { needs } = profile.chapter;
  const { chapter } = profile.chapter.current;

  // Chapter-specific needs
  const chapterNeeds: Partial<Record<ChapterType, LifeChapter['needs']>> = {
    career_transition: {
      validation: ["It's okay to want more", 'Your feelings are valid'],
      permission: ['To explore', 'To leave', 'To prioritize yourself'],
      guidance: ['What steps to take', 'How to think about this'],
      witnessing: ['The fear', 'The excitement', 'The uncertainty'],
    },
    relationship_ending: {
      validation: ['The grief is real', 'This is hard'],
      permission: ['To grieve', 'To be angry', 'To take time'],
      guidance: ['How to move forward', 'Self-care strategies'],
      witnessing: ['The pain', 'The history', 'The loss'],
    },
    healing_journey: {
      validation: ['Your healing matters', "Progress isn't linear"],
      permission: ['To take time', 'To set boundaries', 'To feel'],
      guidance: ['When to push vs. rest', 'Resources and support'],
      witnessing: ["The work you're doing", "How far you've come"],
    },
    midlife_reflection: {
      validation: ['These questions are normal', 'This matters'],
      permission: ['To question', 'To want more', 'To change'],
      guidance: ['Making sense of the past', 'Choosing the future'],
      witnessing: ["The life you've built", 'Your growth'],
    },
    identity_exploration: {
      validation: ["It's okay not to know", 'Exploration is growth'],
      permission: ['To experiment', 'To change your mind', 'To be multiple things'],
      guidance: ['How to explore safely', 'Questions to ask yourself'],
      witnessing: ['The search', 'Who you are becoming'],
    },
    grief_processing: {
      validation: ['Grief has no timeline', 'All feelings are valid'],
      permission: ['To grieve in your way', 'To feel joy too', 'To take time'],
      guidance: ['How to hold grief', 'Supporting yourself'],
      witnessing: ['Their memory', 'Your love', 'The loss'],
    },
  };

  const defaultNeeds = chapterNeeds[chapter] || {
    validation: ['Your experience is valid'],
    permission: ['To feel what you feel'],
    guidance: ['How to navigate this'],
    witnessing: ['Where you are'],
  };

  needs.validation = defaultNeeds.validation;
  needs.permission = defaultNeeds.permission;
  needs.guidance = defaultNeeds.guidance;
  needs.witnessing = defaultNeeds.witnessing;
}

/**
 * Build chapter-specific guidance
 */
function buildChapterGuidance(profile: ChapterProfile): ChapterAnalysis['guidance'] {
  const { chapter } = profile;

  const chapterApproaches: Partial<Record<ChapterType, string>> = {
    career_transition: 'Explore the desire without rushing to solutions. Honor the complexity.',
    relationship_ending: "Hold space for grief. Don't try to fix or move past too quickly.",
    healing_journey: "Celebrate small wins. Don't push pace. Affirm their agency in healing.",
    midlife_reflection: "Take the questions seriously. Don't minimize the search for meaning.",
    identity_exploration: 'Be curious, not directive. Reflect back what you see without judging.',
    grief_processing:
      'Follow their lead. Share space with the loss. Let them talk about the person.',
    fresh_start: 'Balance hope with acknowledging what was left behind.',
  };

  const approach = chapterApproaches[chapter.current.chapter] || 'Meet them where they are.';

  const validate = chapter.needs.validation.slice(0, 2);
  const explore =
    chapter.transition.phase === 'entering'
      ? ['What draws you to this new chapter?', 'What feels different now?']
      : chapter.transition.phase === 'exiting'
        ? ['What are you leaving behind?', 'What do you want to carry forward?']
        : ["What's most present for you in this chapter?"];

  const avoid =
    chapter.transition.grief.length > 0
      ? ['Rushing past the grief', 'Silver linings', 'Fixing']
      : ['Dismissing the significance', 'Advice before understanding'];

  return { approach, validate, explore, avoid };
}

/**
 * Generate a narrative insight when appropriate
 */
function generateNarrativeInsight(
  profile: ChapterProfile,
  newEvidence: ChapterEvidence[]
): string | null {
  // Only generate insight if we have enough confidence and evidence
  if (
    profile.chapter.current.confidence < 0.6 ||
    newEvidence.length === 0 ||
    profile.metadata.totalEvidence < 5
  ) {
    return null;
  }

  // Generate insight based on chapter and transition
  const { chapter } = profile;

  if (chapter.transition.phase === 'entering' && chapter.transition.leaving) {
    return `It sounds like you're in a real transition right now—moving from ${formatChapterName(chapter.transition.leaving)} into ${formatChapterName(chapter.current.chapter)}. That's a significant shift.`;
  }

  if (chapter.transition.grief.length > 0 && chapter.transition.excitement.length > 0) {
    return `I notice you're holding both grief and excitement right now. That's the complexity of real transitions.`;
  }

  if (chapter.current.durationEstimate > 6 && chapter.transition.phase === 'middle') {
    return `You've been in this chapter for a while now. How has your relationship with it changed?`;
  }

  return null;
}

/**
 * Format chapter name for display
 */
function formatChapterName(chapter: ChapterType): string {
  const names: Record<ChapterType, string> = {
    building_career: 'building your career',
    career_transition: 'a career transition',
    early_relationship: 'a new relationship',
    relationship_deepening: 'deepening your relationship',
    relationship_struggle: 'relationship challenges',
    relationship_ending: 'a relationship ending',
    early_parenthood: 'new parenthood',
    active_parenthood: 'active parenting',
    empty_nest: 'the empty nest',
    caregiving: 'caregiving',
    health_journey: 'a health journey',
    healing_journey: 'healing',
    identity_exploration: 'exploring your identity',
    midlife_reflection: 'midlife reflection',
    retirement_transition: 'retirement',
    grief_processing: 'processing grief',
    fresh_start: 'a fresh start',
    stability_seeking: 'seeking stability',
    unknown: 'this chapter',
  };

  return names[chapter] || 'this chapter';
}

// ============================================================================
// PROMPT FORMATTING
// ============================================================================

/**
 * Format chapter analysis for prompt
 */
export function formatChapterForPrompt(analysis: ChapterAnalysis): string {
  const lines = ['[LIFE CHAPTER AWARENESS]'];

  if (analysis.chapter.current.confidence > 0.5) {
    lines.push(`Chapter: ${formatChapterName(analysis.chapter.current.chapter)}`);

    if (analysis.chapter.transition.phase !== 'stable') {
      lines.push(`Transition: ${analysis.chapter.transition.phase}`);
    }

    if (analysis.chapter.transition.grief.length > 0) {
      lines.push(`Mourning: ${analysis.chapter.transition.grief.slice(0, 2).join(', ')}`);
    }

    if (analysis.chapter.transition.excitement.length > 0) {
      lines.push(`Anticipating: ${analysis.chapter.transition.excitement.slice(0, 2).join(', ')}`);
    }
  }

  lines.push(`Approach: ${analysis.guidance.approach}`);

  if (analysis.guidance.validate.length > 0) {
    lines.push(`Validate: ${analysis.guidance.validate[0]}`);
  }

  if (analysis.guidance.avoid.length > 0) {
    lines.push(`Avoid: ${analysis.guidance.avoid[0]}`);
  }

  if (analysis.narrativeInsight) {
    lines.push(`Consider saying: "${analysis.narrativeInsight}"`);
  }

  return lines.join('\n');
}

// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================

/**
 * Import a chapter profile into memory (for persistence)
 */
export function importChapterProfile(profile: ChapterProfile): void {
  profiles.set(profile.userId, profile);
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all life chapter awareness state (for testing)
 */
export function resetLifeChapterAwareness(): void {
  profiles.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getChapterProfile,
  analyzeChapter,
  formatChapterForPrompt,
  resetLifeChapterAwareness,
};
