/**
 * Communication Intelligence Engine - Better Than Human Service
 *
 * What no human friend can do: Analyze message tone with precision,
 * predict recipient response, assess face threats, and translate
 * communication patterns using research-backed frameworks.
 *
 * Research Foundation:
 * - Politeness Theory (Brown & Levinson)
 * - Face Threat Assessment
 * - Gottman Institute Four Horsemen
 * - Marshall Rosenberg's Nonviolent Communication (NVC)
 * - Fiske's Warmth-Competence Model
 *
 * @module services/superhuman/communication-intelligence-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'communication-intelligence-engine' });

// ============================================================================
// TYPES
// ============================================================================

export type AssertivenessLevel = 'passive' | 'passive_aggressive' | 'assertive' | 'aggressive';
export type FaceType = 'positive' | 'negative'; // Positive = desire to be liked; Negative = desire for autonomy
export type GottmanHorseman = 'criticism' | 'contempt' | 'defensiveness' | 'stonewalling';
export type NVCComponent = 'observation' | 'feeling' | 'need' | 'request';
export type CommunicationStyle = 'direct' | 'indirect' | 'high_context' | 'low_context';

export interface MessageAnalysis {
  id: string;
  userId: string;
  originalMessage: string;

  // Assertiveness
  assertivenessScore: number; // 0-1 scale (0=passive, 0.5=assertive, 1=aggressive)
  assertivenessLevel: AssertivenessLevel;

  // Warmth-Competence (Fiske's model)
  warmth: number; // 0-1
  competence: number; // 0-1

  // Face Threat Assessment (Brown & Levinson)
  faceThreat: {
    positive: number; // 0-1, threat to desire to be liked
    negative: number; // 0-1, threat to autonomy
    totalThreat: number;
    mitigations: string[];
  };

  // Predicted Response
  predictedResponse: {
    sentiment: number; // -1 to 1
    defensiveness: number; // 0-1
    cooperation: number; // 0-1
    likelyMisunderstandings: string[];
  };

  // Improvement suggestions
  suggestions: Array<{
    original: string;
    improved: string;
    rationale: string;
    aspect: 'assertiveness' | 'warmth' | 'face_threat' | 'clarity' | 'nvc';
  }>;

  // Gottman patterns detected
  gottmanPatterns: GottmanHorseman[];

  // NVC translation
  nvcTranslation?: {
    observation: string;
    feeling: string;
    need: string;
    request: string;
    fullStatement: string;
  };

  analyzedAt: number;
}

export interface RelationshipCommunicationProfile {
  relationshipId: string;
  userId: string;
  personName: string;

  // Communication patterns
  preferredStyle: CommunicationStyle;
  responsiveness: 'fast' | 'moderate' | 'slow';

  // Triggers
  escalationTriggers: string[];
  deescalationStrategies: string[];

  // Gottman tracking
  horsemenFrequency: Record<GottmanHorseman, number>;
  repairAttemptSuccess: number; // 0-1

  // Effective patterns
  effectivePhrases: string[];
  phrasesToAvoid: string[];

  // History
  communicationHistory: Array<{
    date: number;
    context: string;
    approach: string;
    outcome: 'positive' | 'neutral' | 'negative';
    learning: string;
  }>;

  updatedAt: number;
}

export interface CommunicationIntelligenceProfile {
  userId: string;

  // Overall patterns
  defaultStyle: CommunicationStyle;
  assertivenessBaseline: number;
  warmthBaseline: number;

  // Common issues
  overApologizing: boolean;
  hedgingExcessively: boolean;
  indirectCommunication: boolean;

  // Relationship profiles
  relationships: Record<string, RelationshipCommunicationProfile>;

  // Growth tracking
  improvements: Array<{
    date: number;
    aspect: string;
    before: string;
    after: string;
  }>;

  updatedAt: number;
}

// ============================================================================
// ASSERTIVENESS ANALYSIS
// ============================================================================

const PASSIVE_MARKERS = [
  'maybe',
  'i guess',
  "i'm not sure but",
  'sorry to bother',
  'if you want',
  'no big deal',
  'whenever you can',
  "if it's not too much trouble",
  'i was just wondering',
  'sorry if this is',
  'feel free to ignore',
  'this is probably stupid but',
  'i might be wrong but',
];

const AGGRESSIVE_MARKERS = [
  'you always',
  'you never',
  'you should',
  'you need to',
  'obviously',
  'i told you',
  'how many times',
  "what's wrong with you",
  "you're being",
  'you make me',
  "you don't care",
  "that's ridiculous",
  'whatever',
];

const ASSERTIVE_MARKERS = [
  'i feel',
  'i need',
  'i would like',
  'i prefer',
  'i think',
  'i believe',
  'in my view',
  'from my perspective',
  "i'd appreciate",
  'could we',
  "let's",
  'would you be willing',
  'i suggest',
  'i propose',
];

/**
 * Analyze assertiveness level of a message.
 */
export function analyzeAssertiveness(message: string): {
  score: number;
  level: AssertivenessLevel;
  markers: { passive: string[]; assertive: string[]; aggressive: string[] };
  suggestions: string[];
} {
  const lower = message.toLowerCase();

  const passiveFound = PASSIVE_MARKERS.filter((m) => lower.includes(m));
  const aggressiveFound = AGGRESSIVE_MARKERS.filter((m) => lower.includes(m));
  const assertiveFound = ASSERTIVE_MARKERS.filter((m) => lower.includes(m));

  // Calculate score (0 = passive, 0.5 = assertive, 1 = aggressive)
  const passiveWeight = passiveFound.length * 0.15;
  const aggressiveWeight = aggressiveFound.length * 0.15;
  const assertiveWeight = assertiveFound.length * 0.1;

  let score = 0.5; // Start at assertive
  score -= passiveWeight;
  score += aggressiveWeight;
  score += assertiveWeight * 0.1; // Slight push toward assertive end

  // Check for passive-aggressive patterns
  const hasPassiveAggressive =
    (lower.includes('fine') && lower.includes('whatever')) ||
    (passiveFound.length > 0 && aggressiveFound.length > 0) ||
    lower.includes("i'm not mad") ||
    lower.includes('do what you want');

  // Normalize to 0-1
  score = Math.max(0, Math.min(1, score));

  // Determine level
  let level: AssertivenessLevel;
  if (hasPassiveAggressive) {
    level = 'passive_aggressive';
  } else if (score < 0.3) {
    level = 'passive';
  } else if (score > 0.7) {
    level = 'aggressive';
  } else {
    level = 'assertive';
  }

  // Generate suggestions
  const suggestions: string[] = [];

  if (passiveFound.length > 0) {
    suggestions.push(
      `Remove hedging phrases like "${passiveFound[0]}" - state your point directly`
    );
  }

  if (aggressiveFound.length > 0) {
    suggestions.push(
      `Replace "${aggressiveFound[0]}" with an "I" statement to reduce defensiveness`
    );
  }

  if (level === 'passive') {
    suggestions.push('Start with a clear "I" statement about what you need or want');
  }

  if (level === 'aggressive') {
    suggestions.push('Separate the observation from the judgment to reduce threat');
  }

  return {
    score,
    level,
    markers: {
      passive: passiveFound,
      assertive: assertiveFound,
      aggressive: aggressiveFound,
    },
    suggestions,
  };
}

// ============================================================================
// WARMTH-COMPETENCE ANALYSIS (Fiske's Model)
// ============================================================================

const WARMTH_POSITIVE = [
  'thank you',
  'appreciate',
  "hope you're",
  'thinking of you',
  'care about',
  'understand',
  'support',
  'help',
  'together',
  'value',
  'grateful',
  'enjoy',
  'looking forward',
  'excited',
  'love',
  'wonderful',
  'great',
];

const WARMTH_NEGATIVE = [
  'disappointed',
  'frustrated',
  'annoyed',
  'busy',
  "don't have time",
  "can't",
  "won't",
  "shouldn't",
  'impossible',
  'no way',
];

const COMPETENCE_MARKERS = [
  'analysis',
  'research',
  'data',
  'strategy',
  'efficient',
  'effective',
  'results',
  'performance',
  'metrics',
  'plan',
  'solution',
  'recommendation',
  'based on',
  'according to',
  'evidence',
  'optimal',
  'best practice',
];

/**
 * Analyze warmth and competence dimensions.
 */
export function analyzeWarmthCompetence(message: string): {
  warmth: number;
  competence: number;
  quadrant: 'admired' | 'pitied' | 'envied' | 'contemptuous';
  adjustments: string[];
} {
  const lower = message.toLowerCase();

  const warmthPositive = WARMTH_POSITIVE.filter((m) => lower.includes(m)).length;
  const warmthNegative = WARMTH_NEGATIVE.filter((m) => lower.includes(m)).length;
  const competenceMarkers = COMPETENCE_MARKERS.filter((m) => lower.includes(m)).length;

  // Calculate scores
  const warmth = Math.max(0, Math.min(1, 0.5 + warmthPositive * 0.1 - warmthNegative * 0.15));
  const competence = Math.max(0, Math.min(1, 0.4 + competenceMarkers * 0.1));

  // Determine quadrant
  let quadrant: 'admired' | 'pitied' | 'envied' | 'contemptuous';
  if (warmth > 0.5 && competence > 0.5) {
    quadrant = 'admired'; // High warmth, high competence
  } else if (warmth > 0.5 && competence <= 0.5) {
    quadrant = 'pitied'; // High warmth, low competence
  } else if (warmth <= 0.5 && competence > 0.5) {
    quadrant = 'envied'; // Low warmth, high competence
  } else {
    quadrant = 'contemptuous'; // Low warmth, low competence
  }

  // Generate adjustments
  const adjustments: string[] = [];

  if (warmth < 0.4) {
    adjustments.push('Add warmth: Start with acknowledgment or appreciation');
  }
  if (competence < 0.4) {
    adjustments.push('Add competence: Include specific details or clear reasoning');
  }
  if (quadrant === 'envied') {
    adjustments.push('Balance with warmth: High competence without warmth can feel cold');
  }

  return { warmth, competence, quadrant, adjustments };
}

// ============================================================================
// FACE THREAT ASSESSMENT (Brown & Levinson)
// ============================================================================

/**
 * Assess face-threatening acts in a message.
 * Positive face = desire to be liked, approved of
 * Negative face = desire for autonomy, freedom from imposition
 */
export function assessFaceThreat(message: string): {
  positive: number;
  negative: number;
  totalThreat: number;
  threats: string[];
  mitigations: string[];
} {
  const lower = message.toLowerCase();
  const threats: string[] = [];
  const mitigations: string[] = [];

  let positiveThreat = 0;
  let negativeThreat = 0;

  // Positive face threats (threatening desire to be liked)
  if (/you('re| are) wrong/i.test(message)) {
    positiveThreat += 0.3;
    threats.push('Direct contradiction threatens positive face');
    mitigations.push('Try: "I see it differently..." instead of "You\'re wrong"');
  }

  if (/that('s| is) (not|n\'t) (right|correct|true)/i.test(message)) {
    positiveThreat += 0.2;
    threats.push('Negation of their view');
    mitigations.push('Try: "Another perspective might be..."');
  }

  if (/(disagree|don't think so)/i.test(message)) {
    positiveThreat += 0.1;
    // Minor, but present
  }

  // Negative face threats (threatening autonomy)
  if (/(you (need|have|must|should) to)/i.test(message)) {
    negativeThreat += 0.3;
    threats.push('Imperative threatens autonomy');
    mitigations.push('Try: "Would you consider..." instead of "You need to"');
  }

  if (/(by (monday|tomorrow|end of))/i.test(message)) {
    negativeThreat += 0.2;
    threats.push('Deadline imposes on their time');
    mitigations.push('Frame as request: "If possible by..."');
  }

  if (/(can you|will you|could you)/i.test(message)) {
    negativeThreat += 0.1;
    // Request form, but still an imposition
  }

  // Mitigating factors
  if (/(please|if you can|when you have time)/i.test(message)) {
    negativeThreat -= 0.1;
  }

  if (/(i was wondering|would you mind|i'd appreciate)/i.test(message)) {
    negativeThreat -= 0.15;
    positiveThreat -= 0.05;
  }

  if (/(i understand|i know you're busy)/i.test(message)) {
    negativeThreat -= 0.1;
    positiveThreat -= 0.05;
  }

  // Normalize
  positiveThreat = Math.max(0, Math.min(1, positiveThreat));
  negativeThreat = Math.max(0, Math.min(1, negativeThreat));
  const totalThreat = (positiveThreat + negativeThreat) / 2;

  return {
    positive: positiveThreat,
    negative: negativeThreat,
    totalThreat,
    threats,
    mitigations,
  };
}

// ============================================================================
// GOTTMAN FOUR HORSEMEN DETECTION
// ============================================================================

const GOTTMAN_PATTERNS: Record<GottmanHorseman, { patterns: RegExp[]; description: string }> = {
  criticism: {
    patterns: [
      /you always/i,
      /you never/i,
      /what('s| is) wrong with you/i,
      /why can('t|'t) you/i,
      /you('re| are) (so|such a)/i,
    ],
    description: 'Attacking character rather than specific behavior',
  },
  contempt: {
    patterns: [
      /eye roll/i,
      /whatever/i,
      /disgust/i,
      /pathetic/i,
      /here we go again/i,
      /you('re| are) (an|a) (idiot|moron|joke)/i,
    ],
    description: 'Expression of superiority or disrespect',
  },
  defensiveness: {
    patterns: [
      /it('s| is) not my fault/i,
      /but you/i,
      /yes but/i,
      /i didn't/i,
      /that's not what i/i,
      /you're the one who/i,
    ],
    description: 'Self-protection without accepting responsibility',
  },
  stonewalling: {
    patterns: [
      /i('m| am) done/i,
      /leave me alone/i,
      /i don('t|'t) want to talk/i,
      /fine/i,
      /whatever you say/i,
    ],
    description: 'Withdrawal from interaction',
  },
};

/**
 * Detect Gottman Four Horsemen patterns.
 */
export function detectGottmanPatterns(message: string): {
  detected: GottmanHorseman[];
  details: Array<{ horseman: GottmanHorseman; description: string; alternatives: string[] }>;
} {
  const detected: GottmanHorseman[] = [];
  const details: Array<{ horseman: GottmanHorseman; description: string; alternatives: string[] }> =
    [];

  for (const [horseman, config] of Object.entries(GOTTMAN_PATTERNS) as [
    GottmanHorseman,
    (typeof GOTTMAN_PATTERNS)[GottmanHorseman],
  ][]) {
    for (const pattern of config.patterns) {
      if (pattern.test(message)) {
        if (!detected.includes(horseman)) {
          detected.push(horseman);

          const alternatives = getGottmanAlternatives(horseman);
          details.push({
            horseman,
            description: config.description,
            alternatives,
          });
        }
        break;
      }
    }
  }

  return { detected, details };
}

function getGottmanAlternatives(horseman: GottmanHorseman): string[] {
  switch (horseman) {
    case 'criticism':
      return [
        'Use "I" statements instead: "I feel... when... because..."',
        'Focus on specific behavior, not character',
        'Express the need behind the complaint',
      ];
    case 'contempt':
      return [
        'Build culture of appreciation - notice the good',
        'Express needs without put-downs',
        'Take a break if you feel superior/disgusted',
      ];
    case 'defensiveness':
      return [
        'Accept some responsibility, even small',
        'Focus on understanding their perspective first',
        'Say "You\'re right about [X], and..."',
      ];
    case 'stonewalling':
      return [
        'Request a break with commitment to return: "I need 20 minutes, then let\'s talk"',
        "Self-soothe during break (don't rehearse arguments)",
        'Practice physiological calming techniques',
      ];
  }
}

// ============================================================================
// NVC TRANSLATION (Nonviolent Communication)
// ============================================================================

/**
 * Translate a complaint/statement into NVC format.
 * "When [observation], I feel [feeling] because I need [need]. Would you be willing to [request]?"
 */
export function translateToNVC(input: {
  situation: string;
  feeling?: string;
  underlyingNeed?: string;
  desiredAction?: string;
}): {
  observation: string;
  feeling: string;
  need: string;
  request: string;
  fullStatement: string;
} {
  const { situation, feeling, underlyingNeed, desiredAction } = input;

  // Extract observation (strip judgments)
  const observation = extractObservation(situation);

  // Infer or use provided feeling
  const inferredFeeling = feeling || inferFeeling(situation);

  // Infer or use provided need
  const inferredNeed = underlyingNeed || inferNeed(situation, inferredFeeling);

  // Create request
  const request = desiredAction || createRequest(inferredNeed);

  const fullStatement =
    `When ${observation}, I feel ${inferredFeeling} because I need ${inferredNeed}. ` +
    `Would you be willing to ${request}?`;

  return {
    observation,
    feeling: inferredFeeling,
    need: inferredNeed,
    request,
    fullStatement,
  };
}

function extractObservation(situation: string): string {
  // Remove judgmental language
  let observation = situation
    .replace(/always|never|should|must|obviously/gi, '')
    .replace(/you('re| are) (so|such a)/gi, 'I noticed')
    .replace(/what('s| is) wrong with/gi, 'when')
    .replace(/lazy|stupid|careless|inconsiderate/gi, '[specific behavior]')
    .trim();

  // Ensure it starts with observable
  if (
    !observation.toLowerCase().startsWith('when ') &&
    !observation.toLowerCase().startsWith('i noticed')
  ) {
    observation = `I notice that ${observation}`;
  }

  return observation;
}

function inferFeeling(situation: string): string {
  const lower = situation.toLowerCase();

  if (lower.includes('angry') || lower.includes('mad') || lower.includes('furious')) {
    return 'frustrated';
  }
  if (lower.includes('sad') || lower.includes('hurt') || lower.includes('disappointed')) {
    return 'disappointed';
  }
  if (lower.includes('scared') || lower.includes('worried') || lower.includes('anxious')) {
    return 'worried';
  }
  if (lower.includes('alone') || lower.includes('lonely') || lower.includes('abandoned')) {
    return 'disconnected';
  }
  if (lower.includes('overwhelm') || lower.includes('too much')) {
    return 'overwhelmed';
  }
  if (lower.includes('disrespect') || lower.includes('dismiss')) {
    return 'unvalued';
  }

  return 'concerned'; // Default feeling
}

function inferNeed(situation: string, feeling: string): string {
  const lower = situation.toLowerCase();

  // Map feelings/situations to needs
  if (feeling === 'disconnected' || lower.includes('together') || lower.includes('time')) {
    return 'connection';
  }
  if (feeling === 'unvalued' || lower.includes('respect') || lower.includes('listen')) {
    return 'respect and acknowledgment';
  }
  if (feeling === 'overwhelmed') {
    return 'support';
  }
  if (lower.includes('trust') || lower.includes('promise') || lower.includes('reliable')) {
    return 'reliability and trust';
  }
  if (lower.includes('decide') || lower.includes('choice') || lower.includes('control')) {
    return 'autonomy';
  }
  if (lower.includes('clear') || lower.includes('understand') || lower.includes('confused')) {
    return 'clarity';
  }
  if (lower.includes('safe') || lower.includes('secure')) {
    return 'safety';
  }

  return 'understanding'; // Default need
}

function createRequest(need: string): string {
  const requestMap: Record<string, string> = {
    connection: 'spend some uninterrupted time together this week',
    'respect and acknowledgment': 'hear my perspective before responding',
    support: 'help me with [specific task]',
    'reliability and trust': 'follow through on what you said you would do',
    autonomy: 'let me make this decision myself',
    clarity: 'explain what you meant by that',
    safety: 'reassure me that [specific concern]',
    understanding: 'listen to how I experienced this',
  };

  return requestMap[need] || 'talk about how we can address this together';
}

// ============================================================================
// PREDICTED RESPONSE
// ============================================================================

/**
 * Predict how a recipient might respond to a message.
 */
export function predictResponse(
  message: string,
  context?: {
    relationshipDynamic?: 'equal' | 'superior' | 'subordinate';
    currentTension?: boolean;
    recipientStyle?: CommunicationStyle;
  }
): {
  sentiment: number;
  defensiveness: number;
  cooperation: number;
  likelyMisunderstandings: string[];
} {
  const assertiveness = analyzeAssertiveness(message);
  const faceThreat = assessFaceThreat(message);
  const gottman = detectGottmanPatterns(message);
  const warmthCompetence = analyzeWarmthCompetence(message);

  let sentiment = 0.5; // Neutral baseline
  let defensiveness = 0;
  let cooperation = 0.5;
  const likelyMisunderstandings: string[] = [];

  // Adjust based on analysis

  // Assertiveness effects
  if (assertiveness.level === 'passive') {
    cooperation -= 0.1; // May not take seriously
    likelyMisunderstandings.push('May not understand the importance or urgency');
  } else if (assertiveness.level === 'aggressive') {
    defensiveness += 0.4;
    sentiment -= 0.3;
    cooperation -= 0.3;
    likelyMisunderstandings.push('May focus on tone rather than content');
  }

  // Face threat effects
  defensiveness += faceThreat.totalThreat * 0.5;
  sentiment -= faceThreat.totalThreat * 0.3;

  // Gottman effects
  if (gottman.detected.length > 0) {
    defensiveness += gottman.detected.length * 0.15;
    sentiment -= gottman.detected.length * 0.15;

    if (gottman.detected.includes('contempt')) {
      sentiment -= 0.2;
      cooperation -= 0.3;
      likelyMisunderstandings.push('Contempt signals may overshadow your message');
    }
  }

  // Warmth effects
  sentiment += (warmthCompetence.warmth - 0.5) * 0.3;
  cooperation += (warmthCompetence.warmth - 0.5) * 0.2;

  // Context adjustments
  if (context?.currentTension) {
    defensiveness += 0.2;
    sentiment -= 0.1;
  }

  if (context?.relationshipDynamic === 'subordinate') {
    // Power imbalance means higher threat perception
    defensiveness += 0.1;
  }

  // Normalize
  sentiment = Math.max(-1, Math.min(1, sentiment));
  defensiveness = Math.max(0, Math.min(1, defensiveness));
  cooperation = Math.max(0, Math.min(1, cooperation));

  return {
    sentiment,
    defensiveness,
    cooperation,
    likelyMisunderstandings,
  };
}

// ============================================================================
// FULL MESSAGE ANALYSIS
// ============================================================================

/**
 * Perform comprehensive message analysis.
 */
export function analyzeMessage(userId: string, message: string): MessageAnalysis {
  const assertiveness = analyzeAssertiveness(message);
  const warmthCompetence = analyzeWarmthCompetence(message);
  const faceThreat = assessFaceThreat(message);
  const gottman = detectGottmanPatterns(message);
  const predicted = predictResponse(message);

  // Compile suggestions from all analyses
  const suggestions: MessageAnalysis['suggestions'] = [];

  for (const suggestion of assertiveness.suggestions) {
    suggestions.push({
      original: message,
      improved: suggestion,
      rationale: 'Improve assertiveness balance',
      aspect: 'assertiveness',
    });
  }

  for (const adjustment of warmthCompetence.adjustments) {
    suggestions.push({
      original: message,
      improved: adjustment,
      rationale: 'Balance warmth and competence',
      aspect: 'warmth',
    });
  }

  for (const mitigation of faceThreat.mitigations) {
    suggestions.push({
      original: message,
      improved: mitigation,
      rationale: 'Reduce face threat',
      aspect: 'face_threat',
    });
  }

  for (const detail of gottman.details) {
    for (const alt of detail.alternatives) {
      suggestions.push({
        original: message,
        improved: alt,
        rationale: `Address ${detail.horseman}`,
        aspect: 'nvc',
      });
    }
  }

  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    originalMessage: message,
    assertivenessScore: assertiveness.score,
    assertivenessLevel: assertiveness.level,
    warmth: warmthCompetence.warmth,
    competence: warmthCompetence.competence,
    faceThreat: {
      positive: faceThreat.positive,
      negative: faceThreat.negative,
      totalThreat: faceThreat.totalThreat,
      mitigations: faceThreat.mitigations,
    },
    predictedResponse: predicted,
    suggestions: suggestions.slice(0, 5), // Top 5
    gottmanPatterns: gottman.detected,
    analyzedAt: Date.now(),
  };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadCommunicationProfile(
  userId: string
): Promise<CommunicationIntelligenceProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('communication_intelligence')
      .get();

    if (!doc.exists) return null;
    return doc.data() as CommunicationIntelligenceProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load communication profile');
    return null;
  }
}

export async function saveCommunicationProfile(
  profile: CommunicationIntelligenceProfile
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('communication_intelligence')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Communication profile saved');
  } catch (error) {
    log.warn(
      { error: String(error), userId: profile.userId },
      'Failed to save communication profile'
    );
  }
}

export async function recordCommunicationOutcome(
  userId: string,
  personName: string,
  outcome: {
    context: string;
    approach: string;
    result: 'positive' | 'neutral' | 'negative';
    learning: string;
  }
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const profile = await loadCommunicationProfile(userId);
    if (!profile) return;

    const relationshipKey = personName.toLowerCase().replace(/\s+/g, '_');

    if (!profile.relationships[relationshipKey]) {
      profile.relationships[relationshipKey] = {
        relationshipId: relationshipKey,
        userId,
        personName,
        preferredStyle: 'direct',
        responsiveness: 'moderate',
        escalationTriggers: [],
        deescalationStrategies: [],
        horsemenFrequency: { criticism: 0, contempt: 0, defensiveness: 0, stonewalling: 0 },
        repairAttemptSuccess: 0.5,
        effectivePhrases: [],
        phrasesToAvoid: [],
        communicationHistory: [],
        updatedAt: Date.now(),
      };
    }

    profile.relationships[relationshipKey].communicationHistory.push({
      date: Date.now(),
      context: outcome.context,
      approach: outcome.approach,
      outcome: outcome.result,
      learning: outcome.learning,
    });

    // Keep last 20 interactions
    profile.relationships[relationshipKey].communicationHistory =
      profile.relationships[relationshipKey].communicationHistory.slice(-20);

    await saveCommunicationProfile(profile);
    log.debug({ userId, personName }, 'Communication outcome recorded');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record communication outcome');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildCommunicationIntelligenceContext(userId: string): Promise<string> {
  const profile = await loadCommunicationProfile(userId);
  if (!profile) return '';

  const sections: string[] = ['[COMMUNICATION INTELLIGENCE - Better Than Human Precision]'];
  sections.push(
    'You analyze tone, predict responses, and optimize communication with research-backed frameworks.'
  );

  // Communication patterns
  if (profile.overApologizing) {
    sections.push(
      '\n**Pattern Alert**: This person tends to over-apologize. Watch for unnecessary "sorry"s.'
    );
  }

  if (profile.hedgingExcessively) {
    sections.push(
      '\n**Pattern Alert**: Excessive hedging detected. May undermine their own messages.'
    );
  }

  // Key relationships
  const relationshipEntries = Object.entries(profile.relationships).slice(0, 3);
  if (relationshipEntries.length > 0) {
    sections.push('\n**Key Relationship Dynamics**:');
    for (const [, rel] of relationshipEntries) {
      const recentOutcomes = rel.communicationHistory.slice(-3);
      const successRate =
        recentOutcomes.filter((o) => o.outcome === 'positive').length /
        Math.max(1, recentOutcomes.length);

      sections.push(
        `• ${rel.personName}: ${rel.preferredStyle} style, ${Math.round(successRate * 100)}% recent success`
      );

      if (rel.escalationTriggers.length > 0) {
        sections.push(`  Avoid: ${rel.escalationTriggers[0]}`);
      }
      if (rel.effectivePhrases.length > 0) {
        sections.push(`  Works well: "${rel.effectivePhrases[0]}"`);
      }
    }
  }

  // Improvement tracking
  if (profile.improvements && profile.improvements.length > 0) {
    const recent = profile.improvements.slice(-2);
    sections.push('\n**Recent Communication Growth**:');
    for (const imp of recent) {
      sections.push(`• ${imp.aspect}: Progressed from "${imp.before}" to "${imp.after}"`);
    }
  }

  sections.push(
    '\nCoach communication naturally. "That phrasing might land better as..." not "My analysis indicates..."'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const communicationIntelligenceEngine = {
  // Analysis
  analyzeMessage,
  analyzeAssertiveness,
  analyzeWarmthCompetence,
  assessFaceThreat,
  detectGottmanPatterns,
  translateToNVC,
  predictResponse,

  // Persistence
  loadProfile: loadCommunicationProfile,
  saveProfile: saveCommunicationProfile,
  recordOutcome: recordCommunicationOutcome,

  // Context
  buildContext: buildCommunicationIntelligenceContext,
};
