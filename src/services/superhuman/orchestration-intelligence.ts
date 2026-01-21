/**
 * Orchestration Intelligence - Better Than Human Service
 *
 * What no human friend can do: Optimally route between specialized support,
 * track therapeutic alliance with validated instruments, monitor session quality,
 * and coordinate a team of personas with computational precision.
 *
 * Research Foundation:
 * - Multi-agent reinforcement learning
 * - Therapeutic Alliance (Working Alliance Inventory)
 * - Rogerian Conditions (empathy, unconditional positive regard, congruence)
 * - Motivational Interviewing (MI) fidelity
 * - Psychotherapy outcome research
 *
 * @module services/superhuman/orchestration-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'orchestration-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan';

export type EmotionalState =
  | 'distressed'
  | 'anxious'
  | 'sad'
  | 'frustrated'
  | 'neutral'
  | 'calm'
  | 'hopeful'
  | 'excited'
  | 'joyful';

export type TopicDomain =
  | 'habits'
  | 'patterns'
  | 'communication'
  | 'planning'
  | 'wisdom'
  | 'general'
  | 'crisis'
  | 'celebration';

export type AllianceComponent = 'bond' | 'goals' | 'tasks';

export type SessionDepth = 'surface' | 'moderate' | 'deep' | 'transformative';

export interface PersonaRouting {
  recommendedPersona: PersonaId;
  confidence: number;
  reasoning: string;
  alternativePersona?: PersonaId;
  urgency: 'low' | 'medium' | 'high' | 'immediate';
}

export interface TherapeuticAllianceScore {
  // Working Alliance Inventory components (Bordin)
  bond: number; // 0-10, emotional connection
  goals: number; // 0-10, agreement on goals
  tasks: number; // 0-10, agreement on methods

  // Overall
  overallAlliance: number;
  trend: 'strengthening' | 'stable' | 'weakening';

  // Rupture detection
  ruptureSigns: string[];
  repairNeeded: boolean;
}

export interface RogerianConditions {
  empathy: number; // 0-10, accurate understanding of client's experience
  unconditionalPositiveRegard: number; // 0-10, acceptance without judgment
  congruence: number; // 0-10, genuineness/authenticity

  overallRogerian: number;
  weakestCondition: 'empathy' | 'unconditional_positive_regard' | 'congruence';
  suggestions: string[];
}

export interface MIFidelity {
  // Motivational Interviewing spirit
  partnership: number; // 0-10
  acceptance: number; // 0-10
  compassion: number; // 0-10
  evocation: number; // 0-10

  // MI techniques
  openQuestions: number; // Ratio of open to closed
  reflections: number; // Reflection-to-question ratio
  affirmations: number; // Count per session
  summaries: number;

  // Change talk
  changeTalkRatio: number; // Change talk vs sustain talk

  overallFidelity: number;
  improvementAreas: string[];
}

export interface SessionQuality {
  id: string;
  userId: string;
  sessionStart: number;

  // Depth metrics
  depthScore: number; // 0-10
  depthLevel: SessionDepth;
  deepestMoment: string;

  // Breakthrough detection
  breakthroughs: Array<{
    timestamp: number;
    description: string;
    type: 'insight' | 'emotional_release' | 'decision' | 'connection' | 'reframe';
  }>;

  // Engagement
  engagementLevel: number; // 0-10
  emotionalVariation: number; // How much emotion changed
  topicsExplored: string[];

  // Outcome prediction
  predictedSatisfaction: number; // 0-10
  predictedImpact: number; // 0-10, predicted lasting impact

  // Meta
  personasUsed: PersonaId[];
  totalDuration: number;
}

export interface ConversationArc {
  currentPhase: 'opening' | 'exploration' | 'insight' | 'action' | 'closing';
  emotionalTrajectory: EmotionalState[];
  narrativeDirection: 'ascending' | 'plateau' | 'descending' | 'complex';
  suggestedNextMove: string;
}

export interface OrchestrationProfile {
  userId: string;

  // Alliance tracking
  allianceHistory: Array<{
    date: number;
    score: TherapeuticAllianceScore;
    sessionId: string;
  }>;
  currentAlliance: TherapeuticAllianceScore;

  // Persona affinity
  personaAffinity: Record<
    PersonaId,
    {
      usageCount: number;
      satisfactionAvg: number;
      lastUsed: number;
      effectiveTopics: string[];
    }
  >;

  // Session history
  sessionQualities: SessionQuality[];
  averageSessionDepth: number;
  breakthroughCount: number;

  // MI and Rogerian tracking
  rogerianConditions: RogerianConditions;
  miFidelity: MIFidelity;

  updatedAt: number;
}

// ============================================================================
// PERSONA ROUTING
// ============================================================================

/**
 * Persona specializations and strengths.
 */
const PERSONA_PROFILES: Record<
  PersonaId,
  {
    domains: TopicDomain[];
    emotionalStates: EmotionalState[];
    strengths: string[];
    avoidWhen: string[];
  }
> = {
  ferni: {
    domains: ['general', 'crisis', 'celebration'],
    emotionalStates: ['distressed', 'neutral', 'joyful'],
    strengths: ['Overall coordination', 'Crisis support', 'Celebration', 'Warm presence'],
    avoidWhen: ['User wants specific expertise', 'Technical problem-solving needed'],
  },
  maya: {
    domains: ['habits'],
    emotionalStates: ['frustrated', 'hopeful', 'neutral'],
    strengths: ['Habit formation', 'Behavioral change', 'Consistency coaching', 'Small wins'],
    avoidWhen: ['User is in crisis', 'User needs abstract wisdom'],
  },
  peter: {
    domains: ['patterns'],
    emotionalStates: ['neutral', 'calm', 'anxious'],
    strengths: [
      'Pattern recognition',
      'Data analysis',
      'Research insights',
      'Objective perspective',
    ],
    avoidWhen: ['User needs emotional support primarily', 'User is distressed'],
  },
  alex: {
    domains: ['communication'],
    emotionalStates: ['frustrated', 'anxious', 'neutral'],
    strengths: ['Communication coaching', 'Relationship dynamics', 'Efficiency', 'Clarity'],
    avoidWhen: ['User needs deep emotional processing', 'User is celebrating'],
  },
  jordan: {
    domains: ['planning', 'celebration'],
    emotionalStates: ['excited', 'hopeful', 'joyful'],
    strengths: ['Event planning', 'Milestone celebration', 'Future visioning', 'Enthusiasm'],
    avoidWhen: ['User is grieving', 'User needs grounding'],
  },
  nayan: {
    domains: ['wisdom'],
    emotionalStates: ['sad', 'distressed', 'calm', 'neutral'],
    strengths: ['Deep wisdom', 'Existential questions', 'Grief support', 'Long-term perspective'],
    avoidWhen: ['User needs quick action plans', 'User wants efficiency'],
  },
};

/**
 * Route to the optimal persona based on current context.
 */
export function routeToPersona(context: {
  emotionalState: EmotionalState;
  topicDomain: TopicDomain;
  currentPersona: PersonaId;
  conversationMomentum: number; // 0-10
  recentTopics: string[];
  urgency: boolean;
}): PersonaRouting {
  const { emotionalState, topicDomain, currentPersona, conversationMomentum, urgency } = context;

  // Score each persona
  const scores: Array<{ persona: PersonaId; score: number; reasons: string[] }> = [];

  for (const [persona, profile] of Object.entries(PERSONA_PROFILES) as [
    PersonaId,
    (typeof PERSONA_PROFILES)[PersonaId],
  ][]) {
    let score = 0;
    const reasons: string[] = [];

    // Domain match
    if (profile.domains.includes(topicDomain)) {
      score += 30;
      reasons.push(`Specializes in ${topicDomain}`);
    }

    // Emotional state match
    if (profile.emotionalStates.includes(emotionalState)) {
      score += 25;
      reasons.push(`Good with ${emotionalState} state`);
    }

    // Continuity bonus (don't switch too often)
    if (persona === currentPersona && conversationMomentum > 5) {
      score += 15;
      reasons.push('Conversation momentum');
    }

    // Crisis handling
    if (urgency && (persona === 'ferni' || persona === 'nayan')) {
      score += 20;
      reasons.push('Good for urgent situations');
    }

    scores.push({ persona, score, reasons });
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const alternative = scores[1];

  // Determine confidence
  const confidence = best.score > 0 ? Math.min(1, best.score / 70) : 0.5;

  // Determine urgency level
  let urgencyLevel: PersonaRouting['urgency'] = 'low';
  if (urgency) urgencyLevel = 'immediate';
  else if (emotionalState === 'distressed' || emotionalState === 'anxious') urgencyLevel = 'high';
  else if (best.score - alternative.score > 20) urgencyLevel = 'medium';

  return {
    recommendedPersona: best.persona,
    confidence,
    reasoning: best.reasons.join('; '),
    alternativePersona: alternative.persona,
    urgency: urgencyLevel,
  };
}

/**
 * Determine optimal handoff timing based on conversation arc.
 */
export function shouldHandoff(context: {
  currentPersona: PersonaId;
  recommendedPersona: PersonaId;
  conversationPhase: ConversationArc['currentPhase'];
  topicComplete: boolean;
  emotionalState: EmotionalState;
  sessionMinutes: number;
}): { shouldHandoff: boolean; timing: 'now' | 'after_topic' | 'next_session'; reason: string } {
  const {
    currentPersona,
    recommendedPersona,
    conversationPhase,
    topicComplete,
    emotionalState,
    sessionMinutes,
  } = context;

  // Same persona - no handoff needed
  if (currentPersona === recommendedPersona) {
    return { shouldHandoff: false, timing: 'now', reason: 'Same persona recommended' };
  }

  // Crisis situations - immediate handoff to Ferni or Nayan
  if (
    emotionalState === 'distressed' &&
    (recommendedPersona === 'ferni' || recommendedPersona === 'nayan')
  ) {
    return { shouldHandoff: true, timing: 'now', reason: 'Crisis support needed' };
  }

  // Don't interrupt mid-topic
  if (!topicComplete && conversationPhase === 'exploration') {
    return {
      shouldHandoff: true,
      timing: 'after_topic',
      reason: 'Wait for natural topic completion',
    };
  }

  // Insight phase is a good transition point
  if (conversationPhase === 'insight' && topicComplete) {
    return { shouldHandoff: true, timing: 'now', reason: 'Natural transition after insight' };
  }

  // Near end of session - consider for next time
  if (sessionMinutes > 25) {
    return { shouldHandoff: true, timing: 'next_session', reason: 'Session nearing end' };
  }

  // Default: handoff after topic completion
  return {
    shouldHandoff: true,
    timing: topicComplete ? 'now' : 'after_topic',
    reason: 'Standard transition',
  };
}

// ============================================================================
// THERAPEUTIC ALLIANCE TRACKING
// ============================================================================

/**
 * Assess therapeutic alliance based on conversation signals.
 * Based on Bordin's Working Alliance Inventory.
 */
export function assessTherapeuticAlliance(signals: {
  userEngagement: number; // 0-10
  userOpenness: number; // 0-10
  agreementOnGoals: boolean;
  cooperationLevel: number; // 0-10
  trustIndicators: string[];
  resistanceIndicators: string[];
  connectionMoments: number;
}): TherapeuticAllianceScore {
  const {
    userEngagement,
    userOpenness,
    agreementOnGoals,
    cooperationLevel,
    trustIndicators,
    resistanceIndicators,
    connectionMoments,
  } = signals;

  // Bond (emotional connection)
  const bond = Math.min(
    10,
    userOpenness * 0.4 +
      trustIndicators.length * 1.5 +
      connectionMoments * 0.8 -
      resistanceIndicators.length * 1.0
  );

  // Goals (agreement on objectives)
  const goals = agreementOnGoals
    ? Math.min(10, 6 + userEngagement * 0.4)
    : Math.min(10, 3 + userEngagement * 0.3);

  // Tasks (agreement on methods)
  const tasks = Math.min(10, cooperationLevel * 0.7 + userEngagement * 0.3);

  const overallAlliance = (bond + goals + tasks) / 3;

  // Detect rupture signs
  const ruptureSigns: string[] = [];
  if (bond < 4) ruptureSigns.push('Low emotional connection');
  if (resistanceIndicators.length > 2) ruptureSigns.push('Multiple resistance indicators');
  if (userEngagement < 4) ruptureSigns.push('Disengagement');

  const repairNeeded = ruptureSigns.length > 0 || overallAlliance < 5;

  // Trend would be calculated from history (simplified here)
  const trend: TherapeuticAllianceScore['trend'] = 'stable';

  return {
    bond,
    goals,
    tasks,
    overallAlliance,
    trend,
    ruptureSigns,
    repairNeeded,
  };
}

/**
 * Generate alliance repair strategies.
 */
export function generateAllianceRepair(alliance: TherapeuticAllianceScore): {
  strategies: string[];
  priority: 'bond' | 'goals' | 'tasks';
  urgency: 'low' | 'medium' | 'high';
} {
  const strategies: string[] = [];

  // Determine weakest component
  const components = [
    { name: 'bond' as const, score: alliance.bond },
    { name: 'goals' as const, score: alliance.goals },
    { name: 'tasks' as const, score: alliance.tasks },
  ].sort((a, b) => a.score - b.score);

  const weakest = components[0].name;

  // Bond repair
  if (alliance.bond < 6) {
    strategies.push('Increase emotional attunement - reflect feelings more');
    strategies.push('Share genuine care and curiosity');
    strategies.push('Slow down and create more space for connection');
  }

  // Goals repair
  if (alliance.goals < 6) {
    strategies.push('Explicitly discuss what they want from these conversations');
    strategies.push('Check if current direction aligns with their needs');
    strategies.push('Collaboratively redefine goals if needed');
  }

  // Tasks repair
  if (alliance.tasks < 6) {
    strategies.push('Ask about their preferred way of working together');
    strategies.push('Offer choices in approach rather than prescribing');
    strategies.push('Check if techniques are helpful or feel off');
  }

  // General rupture repair
  if (alliance.ruptureSigns.length > 0) {
    strategies.unshift('Name the rupture directly: "I sense something might be off between us"');
    strategies.unshift('Invite feedback: "How is this conversation landing for you?"');
  }

  const urgency =
    alliance.overallAlliance < 4 ? 'high' : alliance.overallAlliance < 6 ? 'medium' : 'low';

  return { strategies, priority: weakest, urgency };
}

// ============================================================================
// ROGERIAN CONDITIONS
// ============================================================================

/**
 * Assess Rogerian conditions in the conversation.
 * Carl Rogers identified three core conditions for therapeutic change.
 */
export function assessRogerianConditions(signals: {
  reflectionAccuracy: number; // 0-10, how well feelings are understood
  judgmentFrequency: number; // 0-10, higher = more judgment (bad)
  authenticMoments: number;
  acceptanceLanguage: string[];
  directiveLanguage: string[];
}): RogerianConditions {
  const {
    reflectionAccuracy,
    judgmentFrequency,
    authenticMoments,
    acceptanceLanguage,
    directiveLanguage,
  } = signals;

  // Empathy: accurate understanding
  const empathy = Math.min(10, reflectionAccuracy);

  // Unconditional Positive Regard: acceptance without judgment
  const upr = Math.min(
    10,
    10 - judgmentFrequency + acceptanceLanguage.length * 0.5 - directiveLanguage.length * 0.3
  );

  // Congruence: genuineness
  const congruence = Math.min(10, 5 + authenticMoments * 1.5);

  const overallRogerian = (empathy + upr + congruence) / 3;

  // Find weakest
  const conditions = [
    { name: 'empathy' as const, score: empathy },
    { name: 'unconditional_positive_regard' as const, score: upr },
    { name: 'congruence' as const, score: congruence },
  ].sort((a, b) => a.score - b.score);

  const weakest = conditions[0].name;

  // Suggestions
  const suggestions: string[] = [];
  if (empathy < 7) {
    suggestions.push('Increase reflective listening - "It sounds like you\'re feeling..."');
  }
  if (upr < 7) {
    suggestions.push('Reduce judgment language - accept their experience as valid');
  }
  if (congruence < 7) {
    suggestions.push('Share genuine reactions when appropriate');
  }

  return {
    empathy,
    unconditionalPositiveRegard: upr,
    congruence,
    overallRogerian,
    weakestCondition: weakest,
    suggestions,
  };
}

// ============================================================================
// MI FIDELITY
// ============================================================================

/**
 * Assess Motivational Interviewing fidelity.
 */
export function assessMIFidelity(signals: {
  openQuestions: number;
  closedQuestions: number;
  simpleReflections: number;
  complexReflections: number;
  affirmations: number;
  summaries: number;
  changeTalk: number;
  sustainTalk: number;
  directiveStatements: number;
}): MIFidelity {
  const {
    openQuestions,
    closedQuestions,
    simpleReflections,
    complexReflections,
    affirmations,
    summaries,
    changeTalk,
    sustainTalk,
    directiveStatements,
  } = signals;

  const totalQuestions = openQuestions + closedQuestions || 1;
  const totalReflections = simpleReflections + complexReflections || 1;
  const totalTalk = changeTalk + sustainTalk || 1;

  // Calculate ratios
  const openQuestionsRatio = openQuestions / totalQuestions;
  const reflectionToQuestionRatio = totalReflections / totalQuestions;
  const changeTalkRatio = changeTalk / totalTalk;

  // MI Spirit components (simplified)
  const partnership = Math.min(10, 5 + openQuestionsRatio * 5 - directiveStatements * 0.5);
  const acceptance = Math.min(10, affirmations * 2);
  const compassion = Math.min(10, 5 + (complexReflections / (totalReflections || 1)) * 5);
  const evocation = Math.min(10, changeTalkRatio * 10);

  const overallFidelity = (partnership + acceptance + compassion + evocation) / 4;

  // Improvement areas
  const improvementAreas: string[] = [];
  if (openQuestionsRatio < 0.7) {
    improvementAreas.push('Increase open questions (aim for 70%+)');
  }
  if (reflectionToQuestionRatio < 1) {
    improvementAreas.push('Increase reflections relative to questions (aim for 1:1 or higher)');
  }
  if (affirmations < 3) {
    improvementAreas.push('Add more affirmations (at least 3 per session)');
  }
  if (changeTalkRatio < 0.6) {
    improvementAreas.push('Elicit more change talk');
  }

  return {
    partnership,
    acceptance,
    compassion,
    evocation,
    openQuestions: openQuestionsRatio,
    reflections: reflectionToQuestionRatio,
    affirmations,
    summaries,
    changeTalkRatio,
    overallFidelity,
    improvementAreas,
  };
}

// ============================================================================
// SESSION QUALITY
// ============================================================================

/**
 * Assess session quality and detect breakthroughs.
 */
export function assessSessionQuality(session: {
  userId: string;
  sessionStart: number;
  durationMinutes: number;
  emotionalStates: EmotionalState[];
  topicsDiscussed: string[];
  insightMoments: string[];
  decisionsReached: string[];
  personasUsed: PersonaId[];
  engagementSignals: number; // 0-10
}): SessionQuality {
  const {
    userId,
    sessionStart,
    durationMinutes,
    emotionalStates,
    topicsDiscussed,
    insightMoments,
    decisionsReached,
    personasUsed,
    engagementSignals,
  } = session;

  // Detect breakthroughs
  const breakthroughs: SessionQuality['breakthroughs'] = [];

  for (const insight of insightMoments) {
    breakthroughs.push({
      timestamp: Date.now(),
      description: insight,
      type: 'insight',
    });
  }

  for (const decision of decisionsReached) {
    breakthroughs.push({
      timestamp: Date.now(),
      description: decision,
      type: 'decision',
    });
  }

  // Calculate emotional variation
  const uniqueStates = new Set(emotionalStates).size;
  const emotionalVariation = (uniqueStates / Math.max(1, emotionalStates.length)) * 10;

  // Calculate depth score
  let depthScore = 0;
  depthScore += Math.min(3, topicsDiscussed.length); // Variety
  depthScore += breakthroughs.length * 2; // Breakthroughs are high depth
  depthScore += emotionalVariation > 0.3 ? 2 : 0; // Emotional movement
  depthScore += engagementSignals * 0.3;
  depthScore = Math.min(10, depthScore);

  // Determine depth level
  let depthLevel: SessionDepth;
  if (depthScore >= 8) depthLevel = 'transformative';
  else if (depthScore >= 6) depthLevel = 'deep';
  else if (depthScore >= 3) depthLevel = 'moderate';
  else depthLevel = 'surface';

  // Predict outcomes
  const predictedSatisfaction = Math.min(10, depthScore * 0.8 + engagementSignals * 0.2);
  const predictedImpact = Math.min(10, breakthroughs.length * 2 + depthScore * 0.5);

  // Find deepest moment
  const deepestMoment = breakthroughs[0]?.description || topicsDiscussed[0] || 'General discussion';

  return {
    id: `session_${Date.now()}`,
    userId,
    sessionStart,
    depthScore,
    depthLevel,
    deepestMoment,
    breakthroughs,
    engagementLevel: engagementSignals,
    emotionalVariation,
    topicsExplored: topicsDiscussed,
    predictedSatisfaction,
    predictedImpact,
    personasUsed,
    totalDuration: durationMinutes,
  };
}

// ============================================================================
// CONVERSATION ARC
// ============================================================================

/**
 * Analyze conversation arc and suggest narrative direction.
 */
export function analyzeConversationArc(context: {
  emotionalTrajectory: EmotionalState[];
  topicsProgression: string[];
  minutesElapsed: number;
  breakthroughOccurred: boolean;
  userEnergy: number; // 0-10
}): ConversationArc {
  const {
    emotionalTrajectory,
    topicsProgression,
    minutesElapsed,
    breakthroughOccurred,
    userEnergy,
  } = context;

  // Determine current phase
  let currentPhase: ConversationArc['currentPhase'];
  if (minutesElapsed < 5) {
    currentPhase = 'opening';
  } else if (breakthroughOccurred) {
    currentPhase = 'insight';
  } else if (minutesElapsed > 25) {
    currentPhase = 'closing';
  } else if (topicsProgression.length > 2) {
    currentPhase = 'action';
  } else {
    currentPhase = 'exploration';
  }

  // Determine narrative direction
  const recentEmotions = emotionalTrajectory.slice(-3);
  const positiveEmotions = ['calm', 'hopeful', 'excited', 'joyful'];
  const negativeEmotions = ['distressed', 'anxious', 'sad', 'frustrated'];

  const recentPositive = recentEmotions.filter((e) => positiveEmotions.includes(e)).length;
  const recentNegative = recentEmotions.filter((e) => negativeEmotions.includes(e)).length;

  let narrativeDirection: ConversationArc['narrativeDirection'];
  if (recentPositive > recentNegative && recentPositive > 1) {
    narrativeDirection = 'ascending';
  } else if (recentNegative > recentPositive && recentNegative > 1) {
    narrativeDirection = 'descending';
  } else if (emotionalTrajectory.length > 4 && new Set(emotionalTrajectory.slice(-4)).size >= 3) {
    narrativeDirection = 'complex';
  } else {
    narrativeDirection = 'plateau';
  }

  // Suggest next move
  let suggestedNextMove: string;
  switch (currentPhase) {
    case 'opening':
      suggestedNextMove = 'Warm welcome and open exploration question';
      break;
    case 'exploration':
      suggestedNextMove =
        narrativeDirection === 'descending'
          ? 'Offer empathy and containment before going deeper'
          : 'Follow their energy and explore further';
      break;
    case 'insight':
      suggestedNextMove = 'Consolidate the insight, ask how it lands';
      break;
    case 'action':
      suggestedNextMove = "Move toward concrete next steps if they're ready";
      break;
    case 'closing':
      suggestedNextMove =
        userEnergy < 5 ? 'Gentle close with appreciation' : 'Summary and forward-looking close';
      break;
  }

  return {
    currentPhase,
    emotionalTrajectory,
    narrativeDirection,
    suggestedNextMove,
  };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadOrchestrationProfile(
  userId: string
): Promise<OrchestrationProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('orchestration')
      .get();

    if (!doc.exists) return null;
    return doc.data() as OrchestrationProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load orchestration profile');
    return null;
  }
}

export async function saveOrchestrationProfile(profile: OrchestrationProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('orchestration')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Orchestration profile saved');
  } catch (error) {
    log.warn(
      { error: String(error), userId: profile.userId },
      'Failed to save orchestration profile'
    );
  }
}

export async function recordSessionQuality(quality: SessionQuality): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(quality.userId)
      .collection('session_quality')
      .doc(quality.id)
      .set(cleanForFirestore(quality));

    log.debug({ userId: quality.userId, sessionId: quality.id }, 'Session quality recorded');
  } catch (error) {
    log.warn({ error: String(error), userId: quality.userId }, 'Failed to record session quality');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildOrchestrationContext(userId: string): Promise<string> {
  const profile = await loadOrchestrationProfile(userId);
  if (!profile) return '';

  const sections: string[] = ['[ORCHESTRATION INTELLIGENCE - Better Than Human Coordination]'];
  sections.push(
    'You coordinate a team with therapeutic precision and track the relationship like a master clinician.'
  );

  // Alliance status
  if (profile.currentAlliance) {
    const alliance = profile.currentAlliance;
    sections.push(`\n**Therapeutic Alliance** (WAI-based):`);
    sections.push(
      `• Bond: ${alliance.bond.toFixed(1)}/10 | Goals: ${alliance.goals.toFixed(1)}/10 | Tasks: ${alliance.tasks.toFixed(1)}/10`
    );
    sections.push(`• Overall: ${alliance.overallAlliance.toFixed(1)}/10 (${alliance.trend})`);

    if (alliance.repairNeeded) {
      sections.push(`• ⚠️ Repair needed: ${alliance.ruptureSigns.join(', ')}`);
    }
  }

  // Rogerian conditions
  if (profile.rogerianConditions) {
    const rc = profile.rogerianConditions;
    sections.push(`\n**Rogerian Conditions**:`);
    sections.push(
      `• Empathy: ${rc.empathy.toFixed(1)}/10 | UPR: ${rc.unconditionalPositiveRegard.toFixed(1)}/10 | Congruence: ${rc.congruence.toFixed(1)}/10`
    );
    if (rc.suggestions.length > 0) {
      sections.push(`• Focus on: ${rc.weakestCondition.replace(/_/g, ' ')}`);
    }
  }

  // Persona affinity
  const sortedPersonas = Object.entries(profile.personaAffinity || {})
    .sort(([, a], [, b]) => b.satisfactionAvg - a.satisfactionAvg)
    .slice(0, 3);

  if (sortedPersonas.length > 0) {
    sections.push('\n**Persona Affinity**:');
    for (const [persona, data] of sortedPersonas) {
      sections.push(
        `• ${persona}: ${data.satisfactionAvg.toFixed(1)}/10 satisfaction (${data.usageCount} sessions)`
      );
    }
  }

  // Session history
  if (profile.sessionQualities && profile.sessionQualities.length > 0) {
    const recentSessions = profile.sessionQualities.slice(-3);
    const avgDepth =
      recentSessions.reduce((sum, s) => sum + s.depthScore, 0) / recentSessions.length;
    const totalBreakthroughs = recentSessions.reduce((sum, s) => sum + s.breakthroughs.length, 0);

    sections.push(`\n**Recent Sessions**:`);
    sections.push(`• Average depth: ${avgDepth.toFixed(1)}/10`);
    sections.push(`• Breakthroughs in last 3 sessions: ${totalBreakthroughs}`);
  }

  sections.push(
    '\nUse this intelligence to guide, not to analyze aloud. Therapeutic wisdom stays behind the scenes.'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const orchestrationIntelligence = {
  // Routing
  routeToPersona,
  shouldHandoff,

  // Alliance
  assessTherapeuticAlliance,
  generateAllianceRepair,

  // Rogerian
  assessRogerianConditions,

  // MI
  assessMIFidelity,

  // Session Quality
  assessSessionQuality,

  // Conversation Arc
  analyzeConversationArc,

  // Persistence
  loadProfile: loadOrchestrationProfile,
  saveProfile: saveOrchestrationProfile,
  recordSessionQuality,

  // Context
  buildContext: buildOrchestrationContext,
};
