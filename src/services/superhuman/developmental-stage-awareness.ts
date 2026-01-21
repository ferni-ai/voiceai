/**
 * Developmental Stage Awareness - Better Than Human Service
 *
 * What no human friend can do: Track developmental stage progression,
 * adapt wisdom to the right level, recognize growth edges,
 * and support stage-appropriate challenges without imposing.
 *
 * Research Foundation:
 * - Kegan's Adult Development Theory (5 stages)
 * - Erikson's Psychosocial Stages
 * - Spiral Dynamics (Graves/Beck)
 * - Loevinger's Ego Development
 * - Cook-Greuter's Leadership Development Framework
 *
 * @module services/superhuman/developmental-stage-awareness
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'developmental-stage-awareness' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Kegan's Subject-Object Theory stages.
 * Each stage represents what we can "see" (object) vs what "has us" (subject).
 */
export type KeganStage =
  | 'imperial' // Stage 2: Own needs/desires
  | 'socialized' // Stage 3: External expectations, relationships
  | 'self_authoring' // Stage 4: Internal compass, self-direction
  | 'self_transforming'; // Stage 5: Multiple systems, paradox

/**
 * Spiral Dynamics value memes.
 */
export type SpiralStage =
  | 'purple' // Tribal, safety through belonging
  | 'red' // Power, self-assertion
  | 'blue' // Order, truth, structure
  | 'orange' // Achievement, success, science
  | 'green' // Community, equality, consensus
  | 'yellow' // Integration, flexibility
  | 'turquoise'; // Holistic, unified

/**
 * Erikson's psychosocial stages.
 */
export type EriksonStage =
  | 'identity' // vs Role Confusion (12-18)
  | 'intimacy' // vs Isolation (18-40)
  | 'generativity' // vs Stagnation (40-65)
  | 'integrity'; // vs Despair (65+)

export interface DevelopmentalProfile {
  userId: string;

  // Age-based context
  ageRange?: 'young_adult' | 'early_midlife' | 'midlife' | 'later_life';
  approximateAge?: number;

  // Kegan assessment
  kegan: {
    primaryStage: KeganStage;
    emergingStage?: KeganStage;
    confidence: number; // 0-1
    assessmentBasis: string[];
    transitionSignals: string[];
  };

  // Spiral assessment
  spiral: {
    centerOfGravity: SpiralStage;
    activeStages: SpiralStage[]; // We operate from multiple stages
    healthyExpression: Record<SpiralStage, number>; // 0-10 health at each stage
  };

  // Erikson assessment
  erikson: {
    currentStage: EriksonStage;
    resolution: number; // 0-10, how well resolved
    activeQuestions: string[];
  };

  // Growth edges
  growthEdges: Array<{
    edge: string;
    description: string;
    supportStrategies: string[];
    potentialChallenges: string[];
  }>;

  // Communication adaptation
  communicationGuidelines: {
    framingStyle: string;
    languageLevel: string;
    challengeReadiness: number; // 0-10
    preferredApproaches: string[];
    approachesToAvoid: string[];
  };

  updatedAt: number;
}

export interface StageIndicator {
  stage: KeganStage;
  indicator: string;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface DevelopmentalIntervention {
  type: 'support' | 'challenge' | 'bridge';
  description: string;
  rationale: string;
  examples: string[];
  risks: string[];
}

// ============================================================================
// KEGAN STAGE ASSESSMENT
// ============================================================================

/**
 * Indicators for each Kegan stage.
 */
const KEGAN_INDICATORS: Record<KeganStage, string[]> = {
  imperial: [
    'Focuses primarily on own needs and desires',
    'Relationships are instrumental ("what can I get?")',
    'Rules are seen as external constraints to manage',
    'Limited perspective-taking',
    'Black-and-white thinking about fairness',
  ],
  socialized: [
    'Identity shaped by important others and groups',
    'Values relationships and belonging highly',
    'Seeks external validation and approval',
    'Difficulty acting against group norms',
    "Can take others' perspectives but may lose own",
    'Conflict feels threatening to relationship',
  ],
  self_authoring: [
    'Has developed internal compass for decisions',
    'Can evaluate external opinions rather than absorbing them',
    'Takes responsibility for own emotions and reactions',
    'Can hold different perspectives while maintaining own',
    'Sets own standards independent of others',
    'May become overly attached to own system/ideology',
  ],
  self_transforming: [
    'Sees own ideology/self as one of many valid systems',
    'Comfortable with paradox and contradiction',
    'Identity is fluid, not fixed',
    'Can genuinely learn from very different perspectives',
    'Holds certainty and uncertainty simultaneously',
    'Integrated multiple aspects of self',
  ],
};

/**
 * Assess Kegan stage from conversation patterns.
 */
export function assessKeganStage(signals: {
  decisionMakingPatterns: string[];
  conflictHandling: string;
  identityStatements: string[];
  perspectiveTaking: string;
  relationshipToAuthority: string;
  responseToDisagreement: string;
}): DevelopmentalProfile['kegan'] {
  const scores: Record<KeganStage, number> = {
    imperial: 0,
    socialized: 0,
    self_authoring: 0,
    self_transforming: 0,
  };

  const assessmentBasis: string[] = [];

  // Analyze decision-making patterns
  for (const pattern of signals.decisionMakingPatterns) {
    const lowerPattern = pattern.toLowerCase();

    if (lowerPattern.includes('what i want') || lowerPattern.includes('what works for me')) {
      scores.imperial += 1;
      assessmentBasis.push('Self-focused decision language');
    }
    if (
      lowerPattern.includes('what they would think') ||
      lowerPattern.includes("what's expected")
    ) {
      scores.socialized += 1;
      assessmentBasis.push('External-reference in decisions');
    }
    if (lowerPattern.includes("i've decided") || lowerPattern.includes('my values')) {
      scores.self_authoring += 1;
      assessmentBasis.push('Internal compass language');
    }
    if (lowerPattern.includes('multiple perspectives') || lowerPattern.includes('both true')) {
      scores.self_transforming += 1;
      assessmentBasis.push('Multi-perspective integration');
    }
  }

  // Analyze conflict handling
  const conflict = signals.conflictHandling.toLowerCase();
  if (conflict.includes('win') || conflict.includes('get what i want')) {
    scores.imperial += 2;
    assessmentBasis.push('Win-focused conflict approach');
  } else if (
    conflict.includes('keep peace') ||
    conflict.includes('avoid') ||
    conflict.includes("they're right")
  ) {
    scores.socialized += 2;
    assessmentBasis.push('Harmony-seeking conflict approach');
  } else if (conflict.includes('stand my ground') || conflict.includes('my position')) {
    scores.self_authoring += 2;
    assessmentBasis.push('Principled conflict approach');
  } else if (conflict.includes('learn') || conflict.includes('understand their view')) {
    scores.self_transforming += 2;
    assessmentBasis.push('Growth-oriented conflict approach');
  }

  // Analyze identity statements
  for (const statement of signals.identityStatements) {
    const lower = statement.toLowerCase();

    if (lower.includes('i am a') && lower.includes('person')) {
      // Simple identity label
      scores.socialized += 1;
    }
    if (lower.includes('i choose to be') || lower.includes('i define myself')) {
      scores.self_authoring += 1;
    }
    if (lower.includes('part of me') || lower.includes("sometimes i'm")) {
      scores.self_transforming += 1;
    }
  }

  // Find primary and emerging stages
  const sortedStages = (Object.entries(scores) as [KeganStage, number][]).sort(
    (a, b) => b[1] - a[1]
  );

  const primaryStage = sortedStages[0][0];
  const primaryScore = sortedStages[0][1];
  const secondScore = sortedStages[1][1];

  // Detect emerging stage (if second is close to first)
  let emergingStage: KeganStage | undefined;
  if (secondScore > primaryScore * 0.6) {
    emergingStage = sortedStages[1][0];
  }

  // Detect transition signals
  const transitionSignals: string[] = [];
  if (emergingStage) {
    transitionSignals.push(`Signs of ${emergingStage} emerging`);

    if (primaryStage === 'socialized' && emergingStage === 'self_authoring') {
      transitionSignals.push('Beginning to question external expectations');
      transitionSignals.push('Developing own values separate from others');
    }
    if (primaryStage === 'self_authoring' && emergingStage === 'self_transforming') {
      transitionSignals.push('Recognizing limits of own system');
      transitionSignals.push('Greater comfort with not knowing');
    }
  }

  // Calculate confidence
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? Math.min(1, (primaryScore / totalScore) * 1.5) : 0.3;

  return {
    primaryStage,
    emergingStage,
    confidence,
    assessmentBasis,
    transitionSignals,
  };
}

// ============================================================================
// SPIRAL DYNAMICS ASSESSMENT
// ============================================================================

/**
 * Assess Spiral Dynamics value memes.
 */
export function assessSpiralStage(signals: {
  valueStatements: string[];
  worldview: string;
  motivations: string[];
  leadership_style?: string;
}): DevelopmentalProfile['spiral'] {
  const scores: Record<SpiralStage, number> = {
    purple: 0,
    red: 0,
    blue: 0,
    orange: 0,
    green: 0,
    yellow: 0,
    turquoise: 0,
  };

  // Analyze value statements
  for (const value of signals.valueStatements) {
    const lower = value.toLowerCase();

    if (lower.includes('tradition') || lower.includes('ancestors') || lower.includes('tribe')) {
      scores.purple += 1;
    }
    if (lower.includes('power') || lower.includes('strength') || lower.includes('win')) {
      scores.red += 1;
    }
    if (
      lower.includes('order') ||
      lower.includes('truth') ||
      lower.includes('duty') ||
      lower.includes('right way')
    ) {
      scores.blue += 1;
    }
    if (
      lower.includes('success') ||
      lower.includes('achievement') ||
      lower.includes('progress') ||
      lower.includes('efficiency')
    ) {
      scores.orange += 1;
    }
    if (
      lower.includes('equality') ||
      lower.includes('consensus') ||
      lower.includes('community') ||
      lower.includes('feelings')
    ) {
      scores.green += 1;
    }
    if (
      lower.includes('integrate') ||
      lower.includes('systems') ||
      lower.includes('complexity') ||
      lower.includes('adapt')
    ) {
      scores.yellow += 1;
    }
    if (
      lower.includes('unified') ||
      lower.includes('collective consciousness') ||
      lower.includes('planetary')
    ) {
      scores.turquoise += 1;
    }
  }

  // Find center of gravity
  const sortedStages = (Object.entries(scores) as [SpiralStage, number][]).sort(
    (a, b) => b[1] - a[1]
  );

  const centerOfGravity = sortedStages[0][0];

  // Find all active stages (any with score > 0)
  const activeStages = sortedStages.filter(([, score]) => score > 0).map(([stage]) => stage);

  // Assess healthy expression at each active stage
  const healthyExpression: Record<SpiralStage, number> = {
    purple: 0,
    red: 0,
    blue: 0,
    orange: 0,
    green: 0,
    yellow: 0,
    turquoise: 0,
  };

  // Default to 5 (moderate health) for active stages
  for (const stage of activeStages) {
    healthyExpression[stage] = 5;
  }

  return {
    centerOfGravity,
    activeStages,
    healthyExpression,
  };
}

// ============================================================================
// ERIKSON STAGE ASSESSMENT
// ============================================================================

/**
 * Assess Erikson stage based on age and life concerns.
 */
export function assessEriksonStage(context: {
  ageRange: DevelopmentalProfile['ageRange'];
  currentConcerns: string[];
  lifeQuestions: string[];
}): DevelopmentalProfile['erikson'] {
  let currentStage: EriksonStage;
  let activeQuestions: string[] = [];

  // Age-based primary stage
  switch (context.ageRange) {
    case 'young_adult':
      currentStage = 'intimacy';
      activeQuestions = [
        'Can I form deep connections while maintaining my identity?',
        'What does commitment mean to me?',
        'How do I balance independence and togetherness?',
      ];
      break;
    case 'early_midlife':
    case 'midlife':
      currentStage = 'generativity';
      activeQuestions = [
        'What am I contributing to the next generation?',
        'Am I making a difference?',
        'What is my legacy?',
        'How do I balance personal growth with giving back?',
      ];
      break;
    case 'later_life':
      currentStage = 'integrity';
      activeQuestions = [
        'Can I accept my life as it was?',
        'What meaning do I find in my story?',
        'How do I face mortality with peace?',
        'What wisdom can I share?',
      ];
      break;
    default:
      currentStage = 'generativity';
      activeQuestions = ['What is my contribution?'];
  }

  // Analyze current concerns for resolution level
  let resolution = 5; // Default moderate

  const concerns = context.currentConcerns.join(' ').toLowerCase();

  // Signs of working through the stage well
  if (
    concerns.includes('meaningful') ||
    concerns.includes('satisfied') ||
    concerns.includes('purpose')
  ) {
    resolution += 2;
  }

  // Signs of struggle
  if (concerns.includes('stuck') || concerns.includes('lost') || concerns.includes('regret')) {
    resolution -= 2;
  }

  resolution = Math.max(0, Math.min(10, resolution));

  return {
    currentStage,
    resolution,
    activeQuestions,
  };
}

// ============================================================================
// GROWTH EDGE IDENTIFICATION
// ============================================================================

/**
 * Identify growth edges and appropriate support strategies.
 */
export function identifyGrowthEdges(
  kegan: DevelopmentalProfile['kegan'],
  spiral: DevelopmentalProfile['spiral'],
  erikson: DevelopmentalProfile['erikson']
): DevelopmentalProfile['growthEdges'] {
  const edges: DevelopmentalProfile['growthEdges'] = [];

  // Kegan transition edges
  if (kegan.primaryStage === 'socialized' && kegan.emergingStage === 'self_authoring') {
    edges.push({
      edge: 'Self-Authoring Emergence',
      description: 'Developing own internal compass while honoring relationships',
      supportStrategies: [
        'Validate their own opinions and values',
        'Ask "What do YOU think?" before "What would others think?"',
        'Celebrate moments of self-direction',
        'Help distinguish between caring for others and losing self',
      ],
      potentialChallenges: [
        'May feel guilt when prioritizing own needs',
        'Relationships may feel threatened',
        'Identity may feel destabilized',
      ],
    });
  }

  if (kegan.primaryStage === 'self_authoring' && kegan.emergingStage === 'self_transforming') {
    edges.push({
      edge: 'Self-Transforming Emergence',
      description: 'Learning to hold own system more lightly, embracing paradox',
      supportStrategies: [
        'Introduce "both/and" thinking',
        'Model comfort with not knowing',
        'Explore the limits of their current framework',
        'Invite genuine curiosity about opposing views',
      ],
      potentialChallenges: [
        'May feel loss of certainty',
        'Identity built on achievements may feel threatened',
        'May struggle with appearing inconsistent',
      ],
    });
  }

  // Erikson edges
  if (erikson.resolution < 5) {
    switch (erikson.currentStage) {
      case 'intimacy':
        edges.push({
          edge: 'Intimacy Development',
          description: 'Building capacity for deep connection while maintaining self',
          supportStrategies: [
            'Explore fears around vulnerability',
            'Distinguish healthy boundaries from walls',
            'Practice emotional availability in safe contexts',
          ],
          potentialChallenges: [
            'May have experienced relational wounds',
            'May equate closeness with loss of self',
          ],
        });
        break;

      case 'generativity':
        edges.push({
          edge: 'Generativity Activation',
          description: 'Finding meaningful contribution and legacy',
          supportStrategies: [
            'Connect daily activities to larger purpose',
            'Explore what they want to pass on',
            'Identify opportunities for mentorship/contribution',
          ],
          potentialChallenges: ["May feel it's too late", 'May compare to others unfavorably'],
        });
        break;

      case 'integrity':
        edges.push({
          edge: 'Integrity Integration',
          description: 'Finding peace and meaning in life as lived',
          supportStrategies: [
            'Life review with compassion',
            'Reframe regrets as learning',
            'Identify wisdom gained from struggles',
          ],
          potentialChallenges: ['May have significant regrets', 'May face unresolved grief'],
        });
        break;
    }
  }

  return edges;
}

// ============================================================================
// COMMUNICATION ADAPTATION
// ============================================================================

/**
 * Generate communication guidelines based on developmental stage.
 */
export function generateCommunicationGuidelines(
  kegan: DevelopmentalProfile['kegan'],
  spiral: DevelopmentalProfile['spiral']
): DevelopmentalProfile['communicationGuidelines'] {
  let framingStyle: string;
  let languageLevel: string;
  let challengeReadiness: number;
  const preferredApproaches: string[] = [];
  const approachesToAvoid: string[] = [];

  // Kegan-based adaptations
  switch (kegan.primaryStage) {
    case 'imperial':
      framingStyle = 'Focus on practical benefits and concrete outcomes';
      languageLevel = 'Simple, direct, action-oriented';
      challengeReadiness = 3;
      preferredApproaches.push('Clear cause-effect explanations');
      preferredApproaches.push('Concrete examples');
      preferredApproaches.push('Immediate practical application');
      approachesToAvoid.push('Abstract philosophical discussions');
      approachesToAvoid.push("Appeals to others' feelings");
      break;

    case 'socialized':
      framingStyle = 'Connect to relationships and shared values';
      languageLevel = 'Warm, relational, inclusive';
      challengeReadiness = 4;
      preferredApproaches.push('How will this affect important relationships?');
      preferredApproaches.push('Validation before challenge');
      preferredApproaches.push('Gentle normalization');
      approachesToAvoid.push('Harsh challenges to group beliefs');
      approachesToAvoid.push('Forcing solo decisions without support');
      break;

    case 'self_authoring':
      framingStyle = 'Respect their framework while offering new perspectives';
      languageLevel = 'Conceptual, principled, nuanced';
      challengeReadiness = 7;
      preferredApproaches.push('Engage with their values and goals');
      preferredApproaches.push('Offer frameworks and models');
      preferredApproaches.push('Respectful debate and dialogue');
      approachesToAvoid.push('Dismissing their worldview');
      approachesToAvoid.push('Over-emphasizing external validation');
      break;

    case 'self_transforming':
      framingStyle = 'Explore together as fellow seekers';
      languageLevel = 'Paradox-embracing, inquiry-based';
      challengeReadiness = 9;
      preferredApproaches.push('Mutual exploration');
      preferredApproaches.push('Embracing not-knowing');
      preferredApproaches.push('Holding multiple truths');
      approachesToAvoid.push('Overly simplistic answers');
      approachesToAvoid.push('Forcing single-frame solutions');
      break;
  }

  // Spiral-based adjustments
  if (spiral.centerOfGravity === 'orange') {
    preferredApproaches.push('Data and evidence');
    preferredApproaches.push('Efficiency and optimization');
  } else if (spiral.centerOfGravity === 'green') {
    preferredApproaches.push('Inclusive, feeling-aware language');
    preferredApproaches.push('Process as important as outcome');
  }

  return {
    framingStyle,
    languageLevel,
    challengeReadiness,
    preferredApproaches,
    approachesToAvoid,
  };
}

// ============================================================================
// DEVELOPMENTAL INTERVENTIONS
// ============================================================================

/**
 * Generate stage-appropriate interventions.
 */
export function generateDevelopmentalIntervention(
  profile: DevelopmentalProfile,
  situation: string
): DevelopmentalIntervention[] {
  const interventions: DevelopmentalIntervention[] = [];

  const kegan = profile.kegan;

  // Support intervention (meet them where they are)
  interventions.push({
    type: 'support',
    description: `Meet at ${kegan.primaryStage} level`,
    rationale: 'Build trust and alliance before any challenge',
    examples: getSupportExamples(kegan.primaryStage),
    risks: ['May feel patronizing if done poorly'],
  });

  // Challenge intervention (gentle growth pressure)
  if (profile.communicationGuidelines.challengeReadiness >= 5) {
    interventions.push({
      type: 'challenge',
      description: `Invite toward ${kegan.emergingStage || 'growth'}`,
      rationale: 'They show readiness for developmental stretch',
      examples: getChallengeExamples(kegan.primaryStage, kegan.emergingStage),
      risks: ['May feel destabilizing', 'Retreat if pushed too hard'],
    });
  }

  // Bridge intervention (connect stages)
  if (kegan.emergingStage) {
    interventions.push({
      type: 'bridge',
      description: 'Connect current and emerging capacities',
      rationale: 'They are naturally in transition',
      examples: getBridgeExamples(kegan.primaryStage, kegan.emergingStage),
      risks: ['May feel confusing', 'Needs patience'],
    });
  }

  return interventions;
}

function getSupportExamples(stage: KeganStage): string[] {
  switch (stage) {
    case 'socialized':
      return [
        '"It makes sense you\'d worry about what they think"',
        '"The relationship is clearly important to you"',
        '"How do the important people in your life see this?"',
      ];
    case 'self_authoring':
      return [
        '"You\'ve clearly thought this through carefully"',
        '"Your values are showing up here"',
        '"How does this fit with your goals?"',
      ];
    case 'self_transforming':
      return [
        '"I notice you\'re holding multiple truths here"',
        '"The complexity you see is real"',
        '"There may not be a single right answer"',
      ];
    default:
      return ['Meet them with curiosity'];
  }
}

function getChallengeExamples(current: KeganStage, emerging?: KeganStage): string[] {
  if (current === 'socialized' && emerging === 'self_authoring') {
    return [
      '"Setting aside what others think for a moment, what do YOU want?"',
      '"If you knew no one would judge you, what would you do?"',
      '"What are YOUR values here, separate from what you were taught?"',
    ];
  }
  if (current === 'self_authoring' && emerging === 'self_transforming') {
    return [
      '"What if both perspectives contain some truth?"',
      '"How might someone with a completely different worldview see this?"',
      '"What would it mean to hold your view more lightly?"',
    ];
  }
  return ['Gentle invitation to consider new perspective'];
}

function getBridgeExamples(current: KeganStage, emerging?: KeganStage): string[] {
  if (current === 'socialized' && emerging === 'self_authoring') {
    return [
      '"How can you honor the relationship AND your own needs?"',
      '"What would it look like to care for them while also caring for yourself?"',
      '"You can value their opinion and still form your own"',
    ];
  }
  if (current === 'self_authoring' && emerging === 'self_transforming') {
    return [
      '"Your framework has served you well; it\'s okay to expand it"',
      '"Being certain and being open can coexist"',
      '"You can maintain your values while embracing complexity"',
    ];
  }
  return ['Connect current strength to emerging capacity'];
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadDevelopmentalProfile(
  userId: string
): Promise<DevelopmentalProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('developmental')
      .get();

    if (!doc.exists) return null;
    return doc.data() as DevelopmentalProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load developmental profile');
    return null;
  }
}

export async function saveDevelopmentalProfile(profile: DevelopmentalProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('developmental')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Developmental profile saved');
  } catch (error) {
    log.warn(
      { error: String(error), userId: profile.userId },
      'Failed to save developmental profile'
    );
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildDevelopmentalContext(userId: string): Promise<string> {
  const profile = await loadDevelopmentalProfile(userId);
  if (!profile) return '';

  const sections: string[] = [
    '[DEVELOPMENTAL STAGE AWARENESS - Better Than Human Wisdom Calibration]',
  ];
  sections.push('You understand their developmental stage and can meet them where they are.');

  // Kegan stage
  sections.push(
    `\n**Development Stage** (Kegan): ${profile.kegan.primaryStage.replace(/_/g, ' ')} (${Math.round(profile.kegan.confidence * 100)}% confidence)`
  );

  if (profile.kegan.emergingStage) {
    sections.push(`• Emerging: ${profile.kegan.emergingStage.replace(/_/g, ' ')}`);
  }

  if (profile.kegan.transitionSignals.length > 0) {
    sections.push(`• Transition signals: ${profile.kegan.transitionSignals[0]}`);
  }

  // Erikson stage
  sections.push(
    `\n**Life Stage** (Erikson): ${profile.erikson.currentStage} (resolution: ${profile.erikson.resolution}/10)`
  );
  if (profile.erikson.activeQuestions.length > 0) {
    sections.push(`• Active question: "${profile.erikson.activeQuestions[0]}"`);
  }

  // Communication guidelines
  const comm = profile.communicationGuidelines;
  sections.push('\n**Communication Guidelines**:');
  sections.push(`• Framing: ${comm.framingStyle}`);
  sections.push(`• Language: ${comm.languageLevel}`);
  sections.push(`• Challenge readiness: ${comm.challengeReadiness}/10`);

  if (comm.approachesToAvoid.length > 0) {
    sections.push(`• Avoid: ${comm.approachesToAvoid[0]}`);
  }

  // Growth edges
  if (profile.growthEdges.length > 0) {
    const edge = profile.growthEdges[0];
    sections.push(`\n**Growth Edge**: ${edge.edge}`);
    sections.push(`• ${edge.description}`);
  }

  sections.push(
    '\nMeet them where they are. Support before challenge. Never impose higher stages.'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const developmentalStageAwareness = {
  // Assessment
  assessKeganStage,
  assessSpiralStage,
  assessEriksonStage,

  // Growth
  identifyGrowthEdges,
  generateCommunicationGuidelines,
  generateDevelopmentalIntervention,

  // Persistence
  loadProfile: loadDevelopmentalProfile,
  saveProfile: saveDevelopmentalProfile,

  // Context
  buildContext: buildDevelopmentalContext,
};
