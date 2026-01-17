/**
 * Superhuman → Outreach Bridge
 *
 * Connects all 29 superhuman services to the outreach system.
 * This is the critical E2E link that makes "Better Than Human" actually proactive.
 *
 * When superhuman services detect important changes, they call these bridge functions
 * to trigger appropriate outreach to the user.
 *
 * @module services/outreach/superhuman-outreach-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  publishOutreachTrigger,
  publishThinkingOfYouTrigger,
  publishEmotionalSupportTrigger,
  publishCommitmentTrigger,
} from './trigger-publisher.js';
import {
  initiateGroupOutreach,
  teamCelebrationOutreach,
  fullTeamSupportOutreach,
  peterFerniInsightOutreach,
} from '../conversation-thread/group-outreach.js';

const log = createLogger({ module: 'SuperhumanOutreachBridge' });

// ============================================================================
// DREAM KEEPER → OUTREACH
// ============================================================================

/**
 * Called when a dream becomes dormant (not mentioned in a while)
 */
export async function onDreamBecameDormant(
  userId: string,
  dream: { id: string; title: string; dormantDays: number }
): Promise<void> {
  if (dream.dormantDays < 30) return; // Wait at least 30 days

  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + 7); // Follow up in a week

  try {
    await publishThinkingOfYouTrigger(
      userId,
      `Gentle nudge about dream: "${dream.title}" - hasn't been mentioned in ${dream.dormantDays} days`,
      {
        personaId: 'ferni',
        metadata: { dreamId: dream.id, dreamTitle: dream.title, dormantDays: dream.dormantDays },
      }
    );

    log.info(
      { userId, dream: dream.title, dormantDays: dream.dormantDays },
      '💭 Dream revival outreach scheduled'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule dream outreach');
  }
}

/**
 * Called when a dream shows progress
 */
export async function onDreamProgress(
  userId: string,
  dream: { id: string; title: string; progressPercent: number }
): Promise<void> {
  // Celebrate milestones
  const milestones = [25, 50, 75, 100];
  const milestone = milestones.find(
    (m) => dream.progressPercent >= m && dream.progressPercent < m + 10
  );

  if (!milestone) return;

  try {
    await publishOutreachTrigger({
      userId,
      type: 'celebration',
      priority: 'medium',
      reason: `Dream milestone: "${dream.title}" is ${milestone}% complete!`,
      personaId: 'ferni',
      context: {
        milestone: `${milestone}% on dream: ${dream.title}`,
        metadata: { dreamId: dream.id, progressPercent: dream.progressPercent },
      },
    });

    log.info({ userId, dream: dream.title, milestone }, '🎉 Dream milestone celebration scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule dream celebration');
  }
}

// ============================================================================
// CAPACITY GUARDIAN → OUTREACH
// ============================================================================

/**
 * Called when burnout risk elevates
 */
export async function onBurnoutRiskElevated(
  userId: string,
  assessment: {
    risk: 'low' | 'elevated' | 'high' | 'critical';
    riskScore: number;
    factors: string[];
  }
): Promise<void> {
  if (assessment.risk !== 'high' && assessment.risk !== 'critical') return;

  try {
    await publishEmotionalSupportTrigger(userId, 'burnout', assessment.riskScore / 100, {
      personaId: 'ferni',
      topics: assessment.factors,
    });

    log.info(
      { userId, risk: assessment.risk, score: assessment.riskScore },
      '🔥 Burnout support outreach triggered'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to trigger burnout outreach');
  }
}

/**
 * Called when capacity recovers after being low
 */
export async function onCapacityRecovered(
  userId: string,
  recovery: { previousRisk: string; currentRisk: string; daysToRecover: number }
): Promise<void> {
  try {
    await publishOutreachTrigger({
      userId,
      type: 'celebration',
      priority: 'low',
      reason: `Capacity recovery noticed - came back from ${recovery.previousRisk} in ${recovery.daysToRecover} days`,
      personaId: 'ferni',
      context: {
        milestone: 'Capacity recovered',
        metadata: recovery,
      },
    });

    log.info({ userId, ...recovery }, '💪 Capacity recovery celebration scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule recovery celebration');
  }
}

// ============================================================================
// VALUES ALIGNMENT → OUTREACH
// ============================================================================

/**
 * Called when a values conflict is detected
 */
export async function onValuesConflictDetected(
  userId: string,
  conflict: { values: string[]; situation: string; severity: 'low' | 'medium' | 'high' }
): Promise<void> {
  if (conflict.severity === 'low') return;

  const scheduledFor = new Date();
  scheduledFor.setHours(scheduledFor.getHours() + 24); // Give them a day

  try {
    await publishThinkingOfYouTrigger(
      userId,
      `Values reflection: ${conflict.values.join(' vs ')} in "${conflict.situation}"`,
      {
        personaId: 'nayan', // Wisdom persona for values
        metadata: { conflictingValues: conflict.values, situation: conflict.situation },
      }
    );

    log.info({ userId, values: conflict.values }, '⚖️ Values reflection outreach scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule values outreach');
  }
}

/**
 * Called when values alignment is strong
 */
export async function onValuesAligned(
  userId: string,
  alignment: { value: string; action: string; alignmentScore: number }
): Promise<void> {
  if (alignment.alignmentScore < 0.8) return; // Only celebrate strong alignment

  try {
    await publishOutreachTrigger({
      userId,
      type: 'thinking_of_you',
      priority: 'low',
      reason: `Values alignment celebration: "${alignment.action}" aligns with value "${alignment.value}"`,
      personaId: 'nayan',
      context: {
        metadata: alignment,
      },
    });

    log.info({ userId, value: alignment.value }, '✨ Values alignment celebration scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule values celebration');
  }
}

// ============================================================================
// COMMITMENT KEEPER → OUTREACH
// ============================================================================

/**
 * Called when a commitment is made
 */
export async function onCommitmentMade(
  userId: string,
  commitment: { id: string; summary: string; deadline?: Date }
): Promise<void> {
  const followUpDate = commitment.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await publishCommitmentTrigger(userId, commitment.summary, followUpDate, {
      personaId: 'maya', // Maya is good at habit/commitment tracking
      priority: 'medium',
    });

    log.info({ userId, commitment: commitment.summary }, '📝 Commitment follow-up scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule commitment follow-up');
  }
}

/**
 * Called when a commitment is at risk of being missed
 */
export async function onCommitmentAtRisk(
  userId: string,
  commitment: { id: string; summary: string; daysOverdue: number }
): Promise<void> {
  try {
    await publishOutreachTrigger({
      userId,
      type: 'commitment_check',
      priority: commitment.daysOverdue > 3 ? 'high' : 'medium',
      reason: `Commitment "${commitment.summary}" is ${commitment.daysOverdue} days overdue`,
      personaId: 'ferni',
      context: {
        commitment: commitment.summary,
        metadata: { commitmentId: commitment.id, daysOverdue: commitment.daysOverdue },
      },
    });

    log.info(
      { userId, commitment: commitment.summary, daysOverdue: commitment.daysOverdue },
      '⚠️ Commitment risk outreach triggered'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to trigger commitment risk outreach');
  }
}

// ============================================================================
// SEASONAL AWARENESS → OUTREACH
// ============================================================================

/**
 * Called when an important date is approaching
 */
export async function onImportantDateApproaching(
  userId: string,
  date: { name: string; date: Date; daysUntil: number; type: string }
): Promise<void> {
  if (date.daysUntil > 7) return; // Only within a week

  try {
    await publishOutreachTrigger({
      userId,
      type: 'milestone_approaching',
      priority: date.daysUntil <= 1 ? 'high' : 'medium',
      reason: `${date.name} is ${date.daysUntil === 0 ? 'today' : `in ${date.daysUntil} days`}`,
      personaId: 'jordan', // Jordan is the planner
      context: {
        milestone: date.name,
        metadata: { dateType: date.type, daysUntil: date.daysUntil },
      },
    });

    log.info(
      { userId, date: date.name, daysUntil: date.daysUntil },
      '📅 Important date reminder scheduled'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule date reminder');
  }
}

/**
 * Called when a seasonal pattern is detected
 */
export async function onSeasonalPatternDetected(
  userId: string,
  pattern: { season: string; pattern: string; historicalOccurrences: number }
): Promise<void> {
  if (pattern.historicalOccurrences < 2) return; // Need at least 2 data points

  try {
    await publishThinkingOfYouTrigger(
      userId,
      `Seasonal awareness: "${pattern.pattern}" tends to happen in ${pattern.season}`,
      {
        personaId: 'ferni',
        metadata: pattern,
      }
    );

    log.info(
      { userId, pattern: pattern.pattern, season: pattern.season },
      '🍂 Seasonal awareness outreach scheduled'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule seasonal outreach');
  }
}

// ============================================================================
// LIFE NARRATIVE → OUTREACH
// ============================================================================

/**
 * Called when a life chapter transition is detected
 */
export async function onLifeChapterTransition(
  userId: string,
  transition: {
    fromChapter: string;
    toChapter: string;
    significance: 'minor' | 'major' | 'transformative';
  }
): Promise<void> {
  if (transition.significance === 'minor') return;

  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + 3); // Give them time to settle

  try {
    await publishThinkingOfYouTrigger(
      userId,
      `Life chapter transition: Moving from "${transition.fromChapter}" to "${transition.toChapter}"`,
      {
        personaId: 'nayan',
        metadata: transition,
      }
    );

    log.info(
      { userId, from: transition.fromChapter, to: transition.toChapter },
      '📖 Life chapter transition outreach scheduled'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule chapter transition outreach');
  }
}

// ============================================================================
// PREDICTIVE COACHING → OUTREACH
// ============================================================================

/**
 * Called when a struggle is predicted
 */
export async function onStrugglePredicted(
  userId: string,
  prediction: { type: string; confidence: number; preventionTip: string; timeframe: string }
): Promise<void> {
  if (prediction.confidence < 0.7) return; // Only high-confidence predictions

  try {
    await publishOutreachTrigger({
      userId,
      type: 'thinking_of_you',
      priority: 'medium',
      reason: `Proactive support: Predicted ${prediction.type} challenge in ${prediction.timeframe}`,
      personaId: 'ferni',
      context: {
        metadata: prediction,
      },
    });

    log.info(
      { userId, prediction: prediction.type, confidence: prediction.confidence },
      '🔮 Predictive outreach scheduled'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule predictive outreach');
  }
}

// ============================================================================
// EMOTIONAL FIRST AID → OUTREACH
// ============================================================================

/**
 * Called when crisis signals are detected
 */
export async function onCrisisSignalsDetected(
  userId: string,
  crisis: { severity: 'low' | 'medium' | 'high' | 'critical'; signals: string[] }
): Promise<void> {
  if (crisis.severity === 'low') return;

  try {
    await publishEmotionalSupportTrigger(
      userId,
      'crisis',
      crisis.severity === 'critical' ? 1.0 : crisis.severity === 'high' ? 0.8 : 0.6,
      {
        personaId: 'ferni',
        topics: crisis.signals,
      }
    );

    log.info({ userId, severity: crisis.severity }, '🆘 Crisis support outreach triggered');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to trigger crisis outreach');
  }
}

// ============================================================================
// RELATIONSHIP NETWORK → OUTREACH
// ============================================================================

/**
 * Called when relationship health declines
 */
export async function onRelationshipHealthDecline(
  userId: string,
  relationship: {
    personName: string;
    previousHealth: string;
    currentHealth: string;
    daysSinceContact: number;
  }
): Promise<void> {
  if (relationship.daysSinceContact < 14) return; // Give it at least 2 weeks

  try {
    await publishThinkingOfYouTrigger(
      userId,
      `Relationship check-in: Haven't heard about ${relationship.personName} in a while`,
      {
        personaId: 'ferni',
        metadata: relationship,
      }
    );

    log.info({ userId, person: relationship.personName }, '👥 Relationship check-in scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule relationship check-in');
  }
}

// ============================================================================
// MOOD CALENDAR → OUTREACH
// ============================================================================

/**
 * Called when mood pattern is detected
 */
export async function onMoodPatternDetected(
  userId: string,
  pattern: { type: 'weekly' | 'monthly' | 'seasonal'; lowPoint: string; frequency: number }
): Promise<void> {
  try {
    await publishThinkingOfYouTrigger(
      userId,
      `Mood pattern awareness: ${pattern.type} dip around ${pattern.lowPoint}`,
      {
        personaId: 'ferni',
        metadata: pattern,
      }
    );

    log.info({ userId, pattern: pattern.type }, '🌈 Mood pattern awareness scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule mood pattern outreach');
  }
}

// ============================================================================
// ENERGY WAVE MAPPING → OUTREACH
// ============================================================================

/**
 * Called when energy consistently low
 */
export async function onPersistentLowEnergy(
  userId: string,
  energy: { averageLevel: number; consecutiveDays: number; potentialCauses: string[] }
): Promise<void> {
  if (energy.consecutiveDays < 3) return;

  try {
    await publishEmotionalSupportTrigger(userId, 'fatigue', energy.averageLevel, {
      personaId: 'maya', // Maya handles wellness
      topics: energy.potentialCauses,
    });

    log.info({ userId, days: energy.consecutiveDays }, '⚡ Low energy support scheduled');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule energy support');
  }
}

// ============================================================================
// SOBRIETY / RECOVERY → OUTREACH
// ============================================================================

/**
 * Called for recovery check-ins
 */
export async function onRecoveryCheckIn(
  userId: string,
  recovery: { type: string; daysSober: number; nextMilestone: number }
): Promise<void> {
  const daysToMilestone = recovery.nextMilestone - recovery.daysSober;

  if (daysToMilestone > 7 && daysToMilestone !== 1) return; // Only near milestones

  try {
    await publishOutreachTrigger({
      userId,
      type: daysToMilestone <= 1 ? 'celebration' : 'thinking_of_you',
      priority: 'medium',
      reason: `Recovery milestone: ${recovery.daysSober} days - ${daysToMilestone} days to ${recovery.nextMilestone}`,
      personaId: 'ferni',
      context: {
        milestone: `${recovery.daysSober} days ${recovery.type}`,
        metadata: recovery,
      },
    });

    log.info(
      { userId, days: recovery.daysSober, type: recovery.type },
      '🎖️ Recovery milestone outreach scheduled'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to schedule recovery outreach');
  }
}

// ============================================================================
// GROUP OUTREACH TRIGGERS (TEAM SUPPORT)
// ============================================================================

/**
 * Called when user needs full team support (major life event or crisis)
 * Triggers group outreach with multiple personas
 */
export async function onNeedsTeamSupport(
  userId: string,
  situation: {
    type: 'crisis' | 'major_life_event' | 'complex_challenge' | 'celebration';
    description: string;
    preferredName?: string;
    currentStruggles?: string[];
  }
): Promise<void> {
  try {
    let result;

    if (situation.type === 'celebration') {
      // Use celebration team (Ferni, Maya, Jordan)
      result = await teamCelebrationOutreach(userId, {
        achievement: situation.description,
        preferredName: situation.preferredName,
      });
    } else {
      // Use support team (Ferni, Maya, Nayan)
      result = await fullTeamSupportOutreach(userId, {
        situation: situation.description,
        preferredName: situation.preferredName,
        currentStruggles: situation.currentStruggles,
      });
    }

    if (result.success) {
      log.info(
        { userId, type: situation.type, personas: result.personas },
        '👥 Team support outreach initiated'
      );
    } else {
      log.warn({ userId, error: result.error }, 'Failed to initiate team support');
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to trigger team support outreach');
  }
}

/**
 * Called when multiple perspectives would help (research + coaching)
 * Triggers Peter + Ferni collaborative outreach
 */
export async function onNeedsMultiplePerspectives(
  userId: string,
  insight: {
    topic: string;
    insightSummary: string;
    preferredName?: string;
  }
): Promise<void> {
  try {
    const result = await peterFerniInsightOutreach(userId, {
      topic: insight.topic,
      insight: insight.insightSummary,
      preferredName: insight.preferredName,
    });

    if (result.success) {
      log.info(
        { userId, topic: insight.topic },
        '🔬 Peter + Ferni insight outreach initiated'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to trigger multi-perspective outreach');
  }
}

/**
 * Called when a commitment is severely at risk and needs team intervention
 * More urgent than single-persona follow-up
 */
export async function onCommitmentNeedsTeamSupport(
  userId: string,
  commitment: {
    id: string;
    summary: string;
    daysOverdue: number;
    preferredName?: string;
    relatedStruggles?: string[];
  }
): Promise<void> {
  // Only trigger team support for significantly overdue commitments
  if (commitment.daysOverdue < 7) {
    // Fall back to single persona
    await onCommitmentAtRisk(userId, commitment);
    return;
  }

  try {
    const result = await fullTeamSupportOutreach(userId, {
      situation: `commitment "${commitment.summary}" has been challenging for ${commitment.daysOverdue} days`,
      preferredName: commitment.preferredName,
      currentStruggles: commitment.relatedStruggles,
    });

    if (result.success) {
      log.info(
        { userId, commitment: commitment.summary, daysOverdue: commitment.daysOverdue },
        '👥 Team support for commitment initiated'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to trigger team commitment support');
  }
}

/**
 * Called for team roundtable voice calls on complex topics
 */
export async function onNeedsTeamRoundtable(
  userId: string,
  roundtable: {
    topic: string;
    reason: string;
    suggestedPersonas?: string[];
    collaborationMode?: 'discussion' | 'brainstorm' | 'support';
    preferredName?: string;
  }
): Promise<void> {
  try {
    // Default to a well-rounded team if not specified
    const personas = roundtable.suggestedPersonas || ['ferni', 'peter-john', 'maya-habits'];

    const result = await initiateGroupOutreach({
      userId,
      personas: personas as import('../../personas/types.js').PersonaId[],
      leadPersona: 'ferni',
      preferredChannel: 'voice',
      triggerType: 'team_insight',
      reason: roundtable.reason,
      topic: roundtable.topic,
      collaborationMode: roundtable.collaborationMode || 'discussion',
      context: {
        preferredName: roundtable.preferredName,
      },
    });

    if (result.success) {
      log.info(
        { userId, topic: roundtable.topic, personas },
        '🎙️ Team roundtable call initiated'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to initiate team roundtable');
  }
}

// ============================================================================
// BATCH BRIDGE - Call from superhuman services
// ============================================================================

/**
 * Register all bridge functions for easy access
 */
export const superhumanOutreachBridge = {
  // Dream Keeper
  onDreamBecameDormant,
  onDreamProgress,

  // Capacity Guardian
  onBurnoutRiskElevated,
  onCapacityRecovered,

  // Values Alignment
  onValuesConflictDetected,
  onValuesAligned,

  // Commitment Keeper
  onCommitmentMade,
  onCommitmentAtRisk,
  onCommitmentNeedsTeamSupport, // NEW: Team support for severely overdue

  // Seasonal Awareness
  onImportantDateApproaching,
  onSeasonalPatternDetected,

  // Life Narrative
  onLifeChapterTransition,

  // Predictive Coaching
  onStrugglePredicted,

  // Emotional First Aid
  onCrisisSignalsDetected,

  // Relationship Network
  onRelationshipHealthDecline,

  // Mood Calendar
  onMoodPatternDetected,

  // Energy Wave
  onPersistentLowEnergy,

  // Recovery
  onRecoveryCheckIn,

  // GROUP OUTREACH (Team Support)
  onNeedsTeamSupport,
  onNeedsMultiplePerspectives,
  onNeedsTeamRoundtable,
};

export default superhumanOutreachBridge;
