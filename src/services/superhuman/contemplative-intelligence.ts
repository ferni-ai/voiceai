/**
 * Contemplative Intelligence Engine - Better Than Human Service
 *
 * What no human friend can do: Track wisdom development with validated instruments,
 * measure mindfulness quality across dimensions, detect psychological flexibility,
 * and guide contemplative practice with research precision.
 *
 * Research Foundation:
 * - Mindfulness-Based Stress Reduction (MBSR) protocols
 * - Self-Compassion Scale (Kristin Neff)
 * - Wisdom Development Scales (Monika Ardelt's 3D-WS)
 * - Acceptance and Commitment Therapy (ACT)
 * - Five Facet Mindfulness Questionnaire (FFMQ)
 *
 * @module services/superhuman/contemplative-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'contemplative-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type MindfulnessFacet =
  | 'observing'
  | 'describing'
  | 'acting_with_awareness'
  | 'nonjudging'
  | 'nonreactivity';

export type SelfCompassionDimension =
  | 'self_kindness'
  | 'common_humanity'
  | 'mindfulness'
  | 'self_judgment' // Negative (to be reduced)
  | 'isolation' // Negative
  | 'overidentification'; // Negative

export type WisdomDimension = 'cognitive' | 'reflective' | 'affective';

export type GrowthTrajectory = 'emerging' | 'developing' | 'established' | 'integrated';

export type ACTProcess =
  | 'acceptance'
  | 'cognitive_defusion'
  | 'present_moment'
  | 'self_as_context'
  | 'values'
  | 'committed_action';

export interface MindfulnessAssessment {
  id: string;
  userId: string;

  // Five Facet Mindfulness (FFMQ-based)
  facets: Record<
    MindfulnessFacet,
    {
      score: number; // 1-5 scale
      trend: 'improving' | 'stable' | 'declining';
      observations: string[];
    }
  >;

  // Overall
  overallScore: number;
  primaryStrength: MindfulnessFacet;
  areaForGrowth: MindfulnessFacet;

  // Practice metrics
  practiceConsistency: number; // 0-1
  averageSessionLength: number; // minutes
  preferredPractices: string[];

  assessedAt: number;
  basedOn: string[]; // Conversation IDs or observation sources
}

export interface SelfCompassionAssessment {
  id: string;
  userId: string;

  // Kristin Neff's Six Components
  dimensions: Record<
    SelfCompassionDimension,
    {
      score: number; // 1-5 scale
      examples: string[]; // Things they've said that indicate this
    }
  >;

  // Composite scores
  positiveSubscale: number; // Average of self-kindness, common_humanity, mindfulness
  negativeSubscale: number; // Average of self_judgment, isolation, overidentification
  overallSelfCompassion: number; // Positive - Negative

  // Growth
  growthAreas: string[];
  strengths: string[];

  assessedAt: number;
}

export interface WisdomAssessment {
  id: string;
  userId: string;

  // Ardelt's Three-Dimensional Wisdom Scale
  dimensions: Record<
    WisdomDimension,
    {
      score: number; // 1-5 scale
      subcomponents: string[];
    }
  >;

  // Cognitive wisdom indicators
  cognitiveIndicators: {
    perspectiveTaking: number;
    transcendenceOfSubjectivity: number;
    deepUnderstanding: number;
  };

  // Reflective wisdom indicators
  reflectiveIndicators: {
    selfExamination: number;
    selfInsight: number;
    selfAwareness: number;
  };

  // Affective wisdom indicators
  affectiveIndicators: {
    compassion: number;
    sympathy: number;
    positiveEmotionsToOthers: number;
  };

  overallWisdom: number;
  trajectory: GrowthTrajectory;

  assessedAt: number;
}

export interface PsychologicalFlexibilityProfile {
  userId: string;

  // ACT Hexaflex processes
  processes: Record<
    ACTProcess,
    {
      score: number; // 0-10
      examples: string[];
      growthEdge: string;
    }
  >;

  // Overall flexibility
  flexibilityScore: number;
  rigidityPatterns: string[];

  // Values clarity
  identifiedValues: string[];
  valuesCongruence: number; // 0-1, are they living their values?

  // Defusion skill
  thoughtFusionLevel: number; // 0-10, high = fused with thoughts
  defusionTechniquesUsed: string[];

  assessedAt: number;
}

export interface ContemplativeAssessment {
  mindfulness: MindfulnessAssessment;
  selfCompassion: SelfCompassionAssessment;
  wisdom: WisdomAssessment;
  psychologicalFlexibility: PsychologicalFlexibilityProfile;
  growthTrajectory: GrowthTrajectory;
  overallAssessment: string;
}

export interface ContemplativeProfile {
  userId: string;
  assessments: ContemplativeAssessment[];
  practiceLog: Array<{
    date: number;
    practice: string;
    duration: number;
    quality: number;
    insights: string;
  }>;
  growthJourney: Array<{
    date: number;
    milestone: string;
    area: 'mindfulness' | 'compassion' | 'wisdom' | 'flexibility';
  }>;
  currentFocus: string;
  suggestedPractices: string[];
  updatedAt: number;
}

// ============================================================================
// MINDFULNESS ASSESSMENT (FFMQ-Based)
// ============================================================================

/**
 * Analyze mindfulness from conversation patterns.
 * Based on Five Facet Mindfulness Questionnaire constructs.
 */
export function assessMindfulness(
  conversationPatterns: {
    presenceLevel: number; // 0-10, how present do they seem
    emotionalAwareness: number; // 0-10
    reactivityLevel: number; // 0-10, high = reactive
    judgmentLevel: number; // 0-10, high = judgmental
    abilityToDescribeExperience: number; // 0-10
    automaticPilotBehavior: boolean;
    observationStatements: string[];
  },
  userId: string
): MindfulnessAssessment {
  const {
    presenceLevel,
    emotionalAwareness,
    reactivityLevel,
    judgmentLevel,
    abilityToDescribeExperience,
    automaticPilotBehavior,
    observationStatements,
  } = conversationPatterns;

  // Calculate facet scores (scaled to 1-5)
  const facets: MindfulnessAssessment['facets'] = {
    observing: {
      score: Math.min(5, 1 + (emotionalAwareness / 10) * 4),
      trend: 'stable',
      observations: observationStatements.filter(
        (s) => s.toLowerCase().includes('notice') || s.toLowerCase().includes('aware')
      ),
    },
    describing: {
      score: Math.min(5, 1 + (abilityToDescribeExperience / 10) * 4),
      trend: 'stable',
      observations: [],
    },
    acting_with_awareness: {
      score: Math.min(5, 1 + (presenceLevel / 10) * 4 - (automaticPilotBehavior ? 1 : 0)),
      trend: 'stable',
      observations: [],
    },
    nonjudging: {
      score: Math.min(5, 5 - (judgmentLevel / 10) * 4),
      trend: 'stable',
      observations: [],
    },
    nonreactivity: {
      score: Math.min(5, 5 - (reactivityLevel / 10) * 4),
      trend: 'stable',
      observations: [],
    },
  };

  // Calculate overall score
  const scores = Object.values(facets).map((f) => f.score);
  const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Find strengths and growth areas
  const sortedFacets = Object.entries(facets).sort(([, a], [, b]) => b.score - a.score) as [
    MindfulnessFacet,
    (typeof facets)[MindfulnessFacet],
  ][];

  const primaryStrength = sortedFacets[0][0];
  const areaForGrowth = sortedFacets[sortedFacets.length - 1][0];

  return {
    id: `mindfulness_${Date.now()}`,
    userId,
    facets,
    overallScore,
    primaryStrength,
    areaForGrowth,
    practiceConsistency: 0, // To be updated from practice log
    averageSessionLength: 0,
    preferredPractices: [],
    assessedAt: Date.now(),
    basedOn: [],
  };
}

/**
 * Generate mindfulness practice recommendations based on assessment.
 */
export function recommendMindfulnessPractices(assessment: MindfulnessAssessment): {
  primaryRecommendation: { practice: string; rationale: string; duration: string };
  secondaryRecommendations: Array<{ practice: string; rationale: string }>;
  warning?: string;
} {
  const { areaForGrowth } = assessment;

  const practicesByFacet: Record<
    MindfulnessFacet,
    { practice: string; rationale: string; duration: string }
  > = {
    observing: {
      practice: 'Body Scan Meditation',
      rationale: 'Develops capacity to notice physical sensations with precision',
      duration: '10-20 minutes',
    },
    describing: {
      practice: 'Journaling after meditation',
      rationale: 'Builds vocabulary for internal experience',
      duration: '5-10 minutes',
    },
    acting_with_awareness: {
      practice: 'Walking meditation or mindful activities',
      rationale: 'Bridges formal practice with daily life awareness',
      duration: '10-15 minutes',
    },
    nonjudging: {
      practice: 'Loving-kindness meditation (metta)',
      rationale: 'Cultivates acceptance and reduces self-criticism',
      duration: '15-20 minutes',
    },
    nonreactivity: {
      practice: 'RAIN meditation (Recognize, Allow, Investigate, Non-identify)',
      rationale: 'Develops pause between stimulus and response',
      duration: '10-15 minutes',
    },
  };

  const primary = practicesByFacet[areaForGrowth];

  const secondary = Object.entries(practicesByFacet)
    .filter(([facet]) => facet !== areaForGrowth)
    .slice(0, 2)
    .map(([, recommendation]) => ({
      practice: recommendation.practice,
      rationale: recommendation.rationale,
    }));

  let warning: string | undefined;
  if (assessment.overallScore < 2) {
    warning = 'Start with very short practices (2-5 minutes) to build consistency before duration';
  }

  return { primaryRecommendation: primary, secondaryRecommendations: secondary, warning };
}

// ============================================================================
// SELF-COMPASSION ASSESSMENT (Neff Scale)
// ============================================================================

/**
 * Assess self-compassion from conversation patterns.
 * Based on Kristin Neff's Self-Compassion Scale.
 */
export function assessSelfCompassion(
  signals: {
    selfTalkTone: 'harsh' | 'neutral' | 'kind';
    isolationLanguage: boolean; // "I'm the only one who..."
    overIdentificationWithFailure: boolean; // "I AM a failure" vs "I failed"
    acknowledgingSharedHumanity: boolean; // "Everyone struggles with..."
    mindfulBalanceInDifficulty: boolean;
  },
  userId: string
): SelfCompassionAssessment {
  const {
    selfTalkTone,
    isolationLanguage,
    overIdentificationWithFailure,
    acknowledgingSharedHumanity,
    mindfulBalanceInDifficulty,
  } = signals;

  const dimensions: SelfCompassionAssessment['dimensions'] = {
    self_kindness: {
      score: selfTalkTone === 'kind' ? 4 : selfTalkTone === 'neutral' ? 3 : 2,
      examples: [],
    },
    common_humanity: {
      score: acknowledgingSharedHumanity ? 4 : isolationLanguage ? 2 : 3,
      examples: [],
    },
    mindfulness: {
      score: mindfulBalanceInDifficulty ? 4 : 3,
      examples: [],
    },
    self_judgment: {
      score: selfTalkTone === 'harsh' ? 4 : selfTalkTone === 'neutral' ? 3 : 2,
      examples: [],
    },
    isolation: {
      score: isolationLanguage ? 4 : acknowledgingSharedHumanity ? 2 : 3,
      examples: [],
    },
    overidentification: {
      score: overIdentificationWithFailure ? 4 : 2,
      examples: [],
    },
  };

  // Calculate subscales
  const positiveSubscale =
    (dimensions.self_kindness.score +
      dimensions.common_humanity.score +
      dimensions.mindfulness.score) /
    3;

  const negativeSubscale =
    (dimensions.self_judgment.score +
      dimensions.isolation.score +
      dimensions.overidentification.score) /
    3;

  const overallSelfCompassion = positiveSubscale - (negativeSubscale - 3); // Adjusted

  // Identify growth areas
  const growthAreas: string[] = [];
  const strengths: string[] = [];

  if (dimensions.self_judgment.score > 3) {
    growthAreas.push('Reducing self-criticism and harsh self-talk');
  }
  if (dimensions.isolation.score > 3) {
    growthAreas.push('Recognizing shared human experience in struggles');
  }
  if (dimensions.overidentification.score > 3) {
    growthAreas.push('Developing distance from difficult emotions');
  }

  if (dimensions.self_kindness.score > 3) {
    strengths.push('Treating yourself with kindness');
  }
  if (dimensions.common_humanity.score > 3) {
    strengths.push('Connecting to shared human experience');
  }

  return {
    id: `selfcompassion_${Date.now()}`,
    userId,
    dimensions,
    positiveSubscale,
    negativeSubscale,
    overallSelfCompassion,
    growthAreas,
    strengths,
    assessedAt: Date.now(),
  };
}

/**
 * Self-compassion phrases for different situations.
 */
export function getSelfCompassionPhrases(situation: 'failure' | 'suffering' | 'inadequacy'): {
  selfKindness: string;
  commonHumanity: string;
  mindfulness: string;
} {
  const phrases = {
    failure: {
      selfKindness: 'This is a moment of disappointment. Let me be gentle with myself.',
      commonHumanity: 'Everyone fails sometimes. This is part of being human.',
      mindfulness: 'I notice I feel upset about this. That feeling is here, and it will pass.',
    },
    suffering: {
      selfKindness: 'This is really hard. I deserve compassion right now.',
      commonHumanity: "Suffering is universal. I'm not alone in feeling this.",
      mindfulness: "I'm aware of this pain without being consumed by it.",
    },
    inadequacy: {
      selfKindness: "It's okay to feel like I'm not enough sometimes.",
      commonHumanity: 'Everyone feels inadequate sometimes. This is deeply human.',
      mindfulness: 'I notice these thoughts of inadequacy. They are thoughts, not facts.',
    },
  };

  return phrases[situation];
}

// ============================================================================
// WISDOM ASSESSMENT (Ardelt's 3D-WS)
// ============================================================================

/**
 * Assess wisdom using Ardelt's three-dimensional model.
 */
export function assessWisdom(
  signals: {
    // Cognitive
    seeksDeeperUnderstanding: boolean;
    transcendsPersonalPerspective: boolean;
    comfortableWithAmbiguity: boolean;
    // Reflective
    practicesSelfExamination: boolean;
    seeksMultiplePerspectives: boolean;
    learnsFromExperience: boolean;
    // Affective
    showsCompassionToOthers: boolean;
    absenceOfBitterIndifference: boolean;
    positiveEmotionsTowardLife: boolean;
  },
  userId: string
): WisdomAssessment {
  // Cognitive dimension
  const cognitiveScore =
    (signals.seeksDeeperUnderstanding ? 1.5 : 0) +
    (signals.transcendsPersonalPerspective ? 1.5 : 0) +
    (signals.comfortableWithAmbiguity ? 2 : 0);

  // Reflective dimension
  const reflectiveScore =
    (signals.practicesSelfExamination ? 1.5 : 0) +
    (signals.seeksMultiplePerspectives ? 1.5 : 0) +
    (signals.learnsFromExperience ? 2 : 0);

  // Affective dimension
  const affectiveScore =
    (signals.showsCompassionToOthers ? 2 : 0) +
    (signals.absenceOfBitterIndifference ? 1.5 : 0) +
    (signals.positiveEmotionsTowardLife ? 1.5 : 0);

  const dimensions: WisdomAssessment['dimensions'] = {
    cognitive: {
      score: Math.min(5, 1 + cognitiveScore),
      subcomponents: [
        signals.seeksDeeperUnderstanding ? 'Deep understanding' : '',
        signals.transcendsPersonalPerspective ? 'Perspective transcendence' : '',
        signals.comfortableWithAmbiguity ? 'Tolerance of ambiguity' : '',
      ].filter(Boolean),
    },
    reflective: {
      score: Math.min(5, 1 + reflectiveScore),
      subcomponents: [
        signals.practicesSelfExamination ? 'Self-examination' : '',
        signals.seeksMultiplePerspectives ? 'Multiple perspectives' : '',
        signals.learnsFromExperience ? 'Learning from experience' : '',
      ].filter(Boolean),
    },
    affective: {
      score: Math.min(5, 1 + affectiveScore),
      subcomponents: [
        signals.showsCompassionToOthers ? 'Compassion' : '',
        signals.absenceOfBitterIndifference ? 'Engaged concern' : '',
        signals.positiveEmotionsTowardLife ? 'Positive outlook' : '',
      ].filter(Boolean),
    },
  };

  const overallWisdom =
    (dimensions.cognitive.score + dimensions.reflective.score + dimensions.affective.score) / 3;

  // Determine trajectory
  let trajectory: GrowthTrajectory;
  if (overallWisdom >= 4) trajectory = 'integrated';
  else if (overallWisdom >= 3) trajectory = 'established';
  else if (overallWisdom >= 2) trajectory = 'developing';
  else trajectory = 'emerging';

  return {
    id: `wisdom_${Date.now()}`,
    userId,
    dimensions,
    cognitiveIndicators: {
      perspectiveTaking: signals.transcendsPersonalPerspective ? 8 : 5,
      transcendenceOfSubjectivity: signals.transcendsPersonalPerspective ? 7 : 4,
      deepUnderstanding: signals.seeksDeeperUnderstanding ? 8 : 5,
    },
    reflectiveIndicators: {
      selfExamination: signals.practicesSelfExamination ? 8 : 5,
      selfInsight: signals.practicesSelfExamination ? 7 : 5,
      selfAwareness: signals.practicesSelfExamination ? 7 : 5,
    },
    affectiveIndicators: {
      compassion: signals.showsCompassionToOthers ? 8 : 5,
      sympathy: signals.showsCompassionToOthers ? 7 : 5,
      positiveEmotionsToOthers: signals.positiveEmotionsTowardLife ? 7 : 5,
    },
    overallWisdom,
    trajectory,
    assessedAt: Date.now(),
  };
}

// ============================================================================
// PSYCHOLOGICAL FLEXIBILITY (ACT)
// ============================================================================

/**
 * Assess psychological flexibility using ACT hexaflex model.
 */
export function assessPsychologicalFlexibility(
  signals: {
    acceptance: number; // 0-10
    defusion: number; // 0-10
    presentMoment: number; // 0-10
    selfAsContext: number; // 0-10
    valuesClarity: number; // 0-10
    committedAction: number; // 0-10
    identifiedValues: string[];
    rigidityPatterns: string[];
  },
  userId: string
): PsychologicalFlexibilityProfile {
  const processes: PsychologicalFlexibilityProfile['processes'] = {
    acceptance: {
      score: signals.acceptance,
      examples: [],
      growthEdge: signals.acceptance < 6 ? 'Practice welcoming difficult emotions' : '',
    },
    cognitive_defusion: {
      score: signals.defusion,
      examples: [],
      growthEdge: signals.defusion < 6 ? 'Practice naming thoughts as thoughts' : '',
    },
    present_moment: {
      score: signals.presentMoment,
      examples: [],
      growthEdge: signals.presentMoment < 6 ? 'Regular present-moment anchoring' : '',
    },
    self_as_context: {
      score: signals.selfAsContext,
      examples: [],
      growthEdge: signals.selfAsContext < 6 ? 'Explore observer-self perspective' : '',
    },
    values: {
      score: signals.valuesClarity,
      examples: signals.identifiedValues,
      growthEdge: signals.valuesClarity < 6 ? 'Values clarification exercises' : '',
    },
    committed_action: {
      score: signals.committedAction,
      examples: [],
      growthEdge: signals.committedAction < 6 ? 'Small values-aligned action steps' : '',
    },
  };

  const scores = Object.values(processes).map((p) => p.score);
  const flexibilityScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  const thoughtFusionLevel = 10 - signals.defusion;

  return {
    userId,
    processes,
    flexibilityScore,
    rigidityPatterns: signals.rigidityPatterns,
    identifiedValues: signals.identifiedValues,
    valuesCongruence: signals.committedAction / 10,
    thoughtFusionLevel,
    defusionTechniquesUsed: [],
    assessedAt: Date.now(),
  };
}

/**
 * ACT defusion techniques for specific thought patterns.
 */
export function getDefusionTechnique(thoughtPattern: string): {
  technique: string;
  instruction: string;
  example: string;
} {
  const techniques = [
    {
      technique: 'Naming the story',
      instruction: 'Notice and name the thought as a story your mind is telling',
      example: `"Ah, there's the '${thoughtPattern}' story again"`,
    },
    {
      technique: 'Silly voice',
      instruction: 'Repeat the thought in a silly voice (cartoon character)',
      example: `Say "${thoughtPattern}" in a Mickey Mouse voice`,
    },
    {
      technique: 'Thought parade',
      instruction: 'Imagine the thought on a sign carried by a parade participant',
      example: 'Watch the thought march by without joining the parade',
    },
    {
      technique: 'Adding "I notice"',
      instruction: 'Preface the thought with "I notice I\'m having the thought that..."',
      example: `"I notice I'm having the thought that ${thoughtPattern}"`,
    },
    {
      technique: 'Leaves on a stream',
      instruction: 'Imagine placing each thought on a leaf floating down a stream',
      example: 'Let each thought float by at its own pace',
    },
  ];

  // Return a random technique
  return techniques[Math.floor(Math.random() * techniques.length)];
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadContemplativeProfile(
  userId: string
): Promise<ContemplativeProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('contemplative')
      .get();

    if (!doc.exists) return null;
    return doc.data() as ContemplativeProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load contemplative profile');
    return null;
  }
}

export async function saveContemplativeProfile(profile: ContemplativeProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('contemplative')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Contemplative profile saved');
  } catch (error) {
    log.warn(
      { error: String(error), userId: profile.userId },
      'Failed to save contemplative profile'
    );
  }
}

export async function recordPractice(
  userId: string,
  practice: {
    type: string;
    duration: number;
    quality: number;
    insights?: string;
  }
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const profile = await loadContemplativeProfile(userId);
    if (!profile) {
      // Create new profile
      const newProfile: ContemplativeProfile = {
        userId,
        assessments: [],
        practiceLog: [],
        growthJourney: [],
        currentFocus: 'mindfulness',
        suggestedPractices: [],
        updatedAt: Date.now(),
      };
      await saveContemplativeProfile(newProfile);
    }

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('contemplative_practices')
      .add(
        cleanForFirestore({
          ...practice,
          date: Date.now(),
        })
      );

    log.debug({ userId, practice: practice.type }, 'Practice recorded');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record practice');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildContemplativeContext(userId: string): Promise<string> {
  const profile = await loadContemplativeProfile(userId);
  if (!profile) return '';

  const sections: string[] = ['[CONTEMPLATIVE INTELLIGENCE - Better Than Human Wisdom Tracking]'];
  sections.push('You track wisdom development with validated psychological instruments.');

  // Get most recent assessment
  const recentAssessment = profile.assessments[profile.assessments.length - 1];

  if (recentAssessment) {
    // Mindfulness summary
    if (recentAssessment.mindfulness) {
      const mf = recentAssessment.mindfulness;
      sections.push(`\n**Mindfulness Profile** (FFMQ-based):`);
      sections.push(`• Overall: ${mf.overallScore.toFixed(1)}/5`);
      sections.push(`• Strength: ${mf.primaryStrength.replace(/_/g, ' ')}`);
      sections.push(`• Growth edge: ${mf.areaForGrowth.replace(/_/g, ' ')}`);
    }

    // Self-compassion summary
    if (recentAssessment.selfCompassion) {
      const sc = recentAssessment.selfCompassion;
      sections.push(`\n**Self-Compassion** (Neff Scale):`);
      sections.push(`• Overall: ${sc.overallSelfCompassion.toFixed(1)}/5`);
      if (sc.growthAreas.length > 0) {
        sections.push(`• Working on: ${sc.growthAreas[0]}`);
      }
      if (sc.strengths.length > 0) {
        sections.push(`• Strength: ${sc.strengths[0]}`);
      }
    }

    // Wisdom summary
    if (recentAssessment.wisdom) {
      const ws = recentAssessment.wisdom;
      sections.push(`\n**Wisdom Development** (Ardelt 3D-WS):`);
      sections.push(`• Trajectory: ${ws.trajectory}`);
      sections.push(`• Cognitive: ${ws.dimensions.cognitive.score.toFixed(1)}/5`);
      sections.push(`• Reflective: ${ws.dimensions.reflective.score.toFixed(1)}/5`);
      sections.push(`• Affective: ${ws.dimensions.affective.score.toFixed(1)}/5`);
    }

    // Psychological flexibility
    if (recentAssessment.psychologicalFlexibility) {
      const pf = recentAssessment.psychologicalFlexibility;
      sections.push(`\n**Psychological Flexibility** (ACT):`);
      sections.push(`• Overall: ${pf.flexibilityScore.toFixed(1)}/10`);
      if (pf.rigidityPatterns.length > 0) {
        sections.push(`• Pattern to watch: ${pf.rigidityPatterns[0]}`);
      }
      if (pf.identifiedValues.length > 0) {
        sections.push(`• Core values: ${pf.identifiedValues.slice(0, 3).join(', ')}`);
      }
    }
  }

  // Growth milestones
  const recentMilestones = profile.growthJourney.slice(-3);
  if (recentMilestones.length > 0) {
    sections.push('\n**Recent Growth Milestones**:');
    for (const milestone of recentMilestones) {
      sections.push(`• ${milestone.milestone} (${milestone.area})`);
    }
  }

  // Current focus
  if (profile.currentFocus) {
    sections.push(`\n**Current Focus**: ${profile.currentFocus}`);
  }

  sections.push('\nHold space for their journey. Wisdom cannot be rushed.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const contemplativeIntelligence = {
  // Mindfulness
  assessMindfulness,
  recommendMindfulnessPractices,

  // Self-Compassion
  assessSelfCompassion,
  getSelfCompassionPhrases,

  // Wisdom
  assessWisdom,

  // Psychological Flexibility
  assessPsychologicalFlexibility,
  getDefusionTechnique,

  // Persistence
  loadProfile: loadContemplativeProfile,
  saveProfile: saveContemplativeProfile,
  recordPractice,

  // Context
  buildContext: buildContemplativeContext,
};
