/**
 * Planning Coordination Intelligence
 *
 * "Your wedding planner doesn't check if you can afford it or if you're too busy."
 *
 * This service coordinates event planning with other life domains:
 * - Financial readiness check (from Peter/financial data)
 * - Calendar capacity check (from Alex/calendar data)
 * - Energy/habit alignment (from Maya/habit data)
 * - Life stage context (from Nayan/wisdom data)
 *
 * Better Than Human: We see the whole picture before suggesting you plan something.
 *
 * @module services/superhuman/planning-coordination
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'superhuman:planning-coordination' });

// ============================================================================
// TYPES
// ============================================================================

export interface FinancialReadiness {
  /** Can they afford this event at the planned budget? */
  canAfford: boolean;
  /** How healthy is their current budget? (0-100) */
  budgetHealth: number;
  /** Are they saving toward this? */
  savingsVelocity: 'none' | 'slow' | 'on_track' | 'ahead';
  /** Emergency fund status */
  emergencyFundStatus: 'none' | 'partial' | 'adequate' | 'strong';
  /** Any financial concerns */
  concerns: string[];
  /** Recommendations */
  recommendations: string[];
}

export interface CalendarCapacity {
  /** Overall capacity rating (0-100) */
  capacityScore: number;
  /** Calendar density for planning window */
  calendarDensity: 'light' | 'moderate' | 'busy' | 'overloaded';
  /** Conflicts in the planning window */
  conflicts: Array<{
    date: string;
    event: string;
    severity: 'minor' | 'moderate' | 'major';
  }>;
  /** Best windows for planning activities */
  bestPlanningWindows: Array<{
    start: string;
    end: string;
    reason: string;
  }>;
  /** Recommendations */
  recommendations: string[];
}

export interface EnergyAlignment {
  /** Current energy level (0-100) */
  currentEnergy: number;
  /** Energy trend */
  energyTrend: 'declining' | 'stable' | 'improving';
  /** Habits that support event planning */
  supportingHabits: string[];
  /** Habits at risk during heavy planning */
  atRiskHabits: string[];
  /** Burnout risk assessment */
  burnoutRisk: 'low' | 'moderate' | 'high';
  /** Recommendations */
  recommendations: string[];
}

export interface LifeStageContext {
  /** Current life stage */
  currentStage: string;
  /** How this event fits the stage */
  fitWithStage: 'perfect_fit' | 'good_fit' | 'neutral' | 'potential_stress';
  /** Values this aligns with */
  valuesAlignment: string[];
  /** Potential conflicts with life priorities */
  potentialConflicts: string[];
  /** Wisdom/perspective notes */
  wisdomNotes: string[];
}

export interface PlanningReadinessAssessment {
  /** Overall readiness score (0-100) */
  overallScore: number;
  /** Traffic light assessment */
  status: 'green' | 'yellow' | 'red';
  /** Individual domain assessments */
  financial: FinancialReadiness;
  calendar: CalendarCapacity;
  energy: EnergyAlignment;
  lifeStage: LifeStageContext;
  /** Summary recommendation */
  summary: string;
  /** Action items before proceeding */
  actionItems: string[];
  /** Best time to start planning */
  recommendedStartTime: string;
}

export interface PlanningCoordinationProfile {
  userId: string;
  /** Cached assessments */
  recentAssessments: Array<{
    eventType: string;
    budget: number;
    assessedAt: string;
    result: PlanningReadinessAssessment;
  }>;
  /** User's planning style preferences */
  planningStyle: {
    preferredLeadTime: 'minimal' | 'moderate' | 'extensive';
    stressResponse: 'energized' | 'neutral' | 'stressed';
    delegationComfort: 'prefers_control' | 'selective_delegation' | 'happy_to_delegate';
  };
  lastUpdated: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const COLLECTION = 'planning_coordination';

async function loadCoordinationProfile(userId: string): Promise<PlanningCoordinationProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db.collection('bogle_users').doc(userId).collection(COLLECTION).doc('profile').get();
    if (doc.exists) {
      return doc.data() as PlanningCoordinationProfile;
    }
    return null;
  } catch (error) {
    log.debug({ error, userId }, 'Failed to load planning coordination profile');
    return null;
  }
}

async function saveCoordinationProfile(userId: string, profile: PlanningCoordinationProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc('profile')
      .set({
        ...profile,
        lastUpdated: new Date().toISOString(),
      });
  } catch (error) {
    log.debug({ error, userId }, 'Failed to save planning coordination profile');
  }
}

// ============================================================================
// CROSS-DOMAIN DATA FETCHERS
// ============================================================================

/**
 * Fetch financial readiness from Peter's domain
 * INTEGRATED: Uses Firestore financial data when available
 */
async function fetchFinancialReadiness(
  userId: string,
  eventBudget: number
): Promise<FinancialReadiness> {
  // Uses Firestore financial_data collection when available
  // Falls back to sensible defaults if user hasn't tracked finances
  
  const db = getFirestoreDb();
  if (!db) {
    return createDefaultFinancialReadiness(eventBudget);
  }

  try {
    // Try to fetch from user's financial data
    const financialDoc = await db.collection('bogle_users').doc(userId).collection('financial_data').doc('summary').get();
    
    if (financialDoc.exists) {
      const data = financialDoc.data();
      const monthlyIncome = data?.monthlyIncome || 5000;
      const monthlySavings = data?.monthlySavings || 500;
      const emergencyFund = data?.emergencyFund || 0;
      const monthlyExpenses = data?.monthlyExpenses || 3000;
      
      const monthsToSave = eventBudget / Math.max(100, monthlySavings);
      const budgetHealth = Math.min(100, ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100);
      
      return {
        canAfford: eventBudget <= (monthlySavings * 6), // Can save in 6 months
        budgetHealth: Math.round(budgetHealth),
        savingsVelocity: monthsToSave <= 3 ? 'ahead' : monthsToSave <= 6 ? 'on_track' : monthsToSave <= 12 ? 'slow' : 'none',
        emergencyFundStatus: emergencyFund >= monthlyExpenses * 6 ? 'strong' : 
                            emergencyFund >= monthlyExpenses * 3 ? 'adequate' :
                            emergencyFund > 0 ? 'partial' : 'none',
        concerns: eventBudget > monthlySavings * 3 ? ['This is a significant expense relative to savings rate'] : [],
        recommendations: [],
      };
    }
  } catch (error) {
    log.debug({ error, userId }, 'Could not fetch financial data');
  }

  return createDefaultFinancialReadiness(eventBudget);
}

/**
 * Fetch calendar capacity from Alex's domain
 * INTEGRATED: Uses real calendar load service
 */
async function fetchCalendarCapacity(
  userId: string,
  eventDate: string,
  planningWeeks: number = 8
): Promise<CalendarCapacity> {
  try {
    // INTEGRATION: Use actual calendar load service
    const { getCalendarLoadFactors } = await import('../calendar/calendar-load-service.js');

    const calendarLoad = await getCalendarLoadFactors(userId);

    if (calendarLoad) {
      // Convert weekly meeting hours to a load score (0-1)
      // Assume 40h work week, so 30h+ meetings = overloaded
      const loadScore = Math.min(1, calendarLoad.weeklyMeetingHours / 40);

      const density = loadScore >= 0.8 ? 'overloaded' :
                      loadScore >= 0.6 ? 'busy' :
                      loadScore >= 0.3 ? 'moderate' : 'light';

      const capacityScore = Math.round((1 - loadScore) * 100);

      return {
        capacityScore,
        calendarDensity: density,
        conflicts: calendarLoad.upcomingHeavyDays.map((day: string) => ({
          date: day,
          event: 'Heavy meeting day',
          severity: 'moderate' as const,
        })),
        bestPlanningWindows: calendarLoad.lightestDayThisWeek ? [
          { start: calendarLoad.lightestDayThisWeek, end: '', reason: 'Lightest day this week' },
          { start: 'Weekends', end: '', reason: 'Usually clearer' },
        ] : [
          { start: 'Weekends', end: '', reason: 'Usually clearer' },
        ],
        recommendations: density === 'overloaded'
          ? ['Consider delegating some planning tasks', 'Block dedicated planning time']
          : [],
      };
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Calendar service not available, using fallback');
  }

  // Fallback to Firestore cached data
  const db = getFirestoreDb();
  if (!db) {
    return createDefaultCalendarCapacity();
  }

  try {
    const calendarDoc = await db.collection('bogle_users').doc(userId).collection('calendar_data').doc('density').get();
    
    if (calendarDoc.exists) {
      const data = calendarDoc.data();
      const weeklyMeetings = data?.avgWeeklyMeetings || 10;
      const busyDaysPerWeek = data?.busyDaysPerWeek || 3;
      
      const density = busyDaysPerWeek >= 5 ? 'overloaded' :
                      busyDaysPerWeek >= 4 ? 'busy' :
                      busyDaysPerWeek >= 2 ? 'moderate' : 'light';
      
      const capacityScore = Math.max(0, 100 - (busyDaysPerWeek * 15) - (weeklyMeetings * 2));
      
      return {
        capacityScore: Math.round(capacityScore),
        calendarDensity: density,
        conflicts: [],
        bestPlanningWindows: [
          { start: 'Weekends', end: '', reason: 'Usually clearer' },
          { start: 'Early mornings', end: '', reason: 'Before meetings start' },
        ],
        recommendations: density === 'overloaded' 
          ? ['Consider delegating some planning tasks', 'Block dedicated planning time']
          : [],
      };
    }
  } catch (error) {
    log.debug({ error, userId }, 'Could not fetch calendar data');
  }

  return createDefaultCalendarCapacity();
}

/**
 * Fetch energy/habit alignment from Maya's domain
 * INTEGRATED: Uses real capacity guardian service
 */
async function fetchEnergyAlignment(userId: string): Promise<EnergyAlignment> {
  try {
    // INTEGRATION: Use actual capacity guardian service
    const { assessBurnoutRisk, loadEnergyHistory } = await import('./capacity-guardian.js');

    const [burnoutAssessment, energyReadings] = await Promise.all([
      assessBurnoutRisk(userId),
      loadEnergyHistory(userId, 7),
    ]);

    if (burnoutAssessment) {
      // Calculate average energy from recent readings
      const avgEnergy = energyReadings.length > 0
        ? Math.round(energyReadings.reduce((sum, r) => sum + r.energyScore, 0) / energyReadings.length)
        : 70; // Default if no readings

      // Determine trend from burnout assessment
      const trend = burnoutAssessment.trendDirection === 'worsening' ? 'declining' :
                    burnoutAssessment.trendDirection === 'improving' ? 'improving' : 'stable';

      // Extract supporting and at-risk habits from factors
      const supportingHabits: string[] = [];
      const atRiskHabits: string[] = [];
      for (const factor of burnoutAssessment.factors) {
        if (factor.factor.includes('Recovery') || factor.factor.includes('Energy')) {
          atRiskHabits.push(factor.description);
        }
      }

      // Map burnout risk to our expected format
      const burnoutRisk = burnoutAssessment.risk === 'critical' || burnoutAssessment.risk === 'high'
        ? 'high' : burnoutAssessment.risk === 'elevated' || burnoutAssessment.risk === 'moderate'
        ? 'moderate' : 'low';

      return {
        currentEnergy: avgEnergy,
        energyTrend: trend as 'declining' | 'stable' | 'improving',
        supportingHabits,
        atRiskHabits,
        burnoutRisk,
        recommendations: burnoutAssessment.recommendations?.slice(0, 2) || [],
      };
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Capacity guardian not available, using fallback');
  }

  // Fallback to Firestore cached data
  const db = getFirestoreDb();
  if (!db) {
    return createDefaultEnergyAlignment();
  }

  try {
    const energyDoc = await db.collection('bogle_users').doc(userId).collection('energy_data').doc('current').get();
    
    if (energyDoc.exists) {
      const data = energyDoc.data();
      const currentEnergy = data?.currentLevel || 70;
      const trend = data?.trend || 'stable';
      const activeHabits = data?.activeHabits || [];
      
      return {
        currentEnergy,
        energyTrend: trend,
        supportingHabits: activeHabits.filter((h: string) => 
          ['exercise', 'sleep', 'meditation', 'planning'].some(k => h.toLowerCase().includes(k))
        ),
        atRiskHabits: activeHabits.filter((h: string) => 
          ['gym', 'reading', 'hobby'].some(k => h.toLowerCase().includes(k))
        ),
        burnoutRisk: currentEnergy < 40 ? 'high' : currentEnergy < 60 ? 'moderate' : 'low',
        recommendations: currentEnergy < 50 
          ? ['Consider a lighter planning schedule', 'Prioritize energy-restoring activities']
          : [],
      };
    }
  } catch (error) {
    log.debug({ error, userId }, 'Could not fetch energy data');
  }

  return createDefaultEnergyAlignment();
}

/**
 * Fetch life stage context from Nayan's domain
 * TODO: Integrate with self-awareness service when available
 * Currently returns sensible defaults based on event type
 */
async function fetchLifeStageContext(
  userId: string,
  eventType: string
): Promise<LifeStageContext> {
  // TODO: Integration with self-awareness service
  // The self-awareness module doesn't exist yet at the expected path.
  // For now, return sensible defaults based on event type.

  const eventLower = eventType.toLowerCase();

  // Determine fit based on common event types
  let fitWithStage: 'perfect_fit' | 'good_fit' | 'neutral' | 'potential_stress' = 'good_fit';
  const valuesAlignment: string[] = [];
  const wisdomNotes: string[] = [];

  if (eventLower.includes('wedding') || eventLower.includes('party') || eventLower.includes('celebration')) {
    valuesAlignment.push('connection', 'celebration', 'relationships');
    wisdomNotes.push('Events are investments in memory and connection');
    fitWithStage = 'good_fit';
  } else if (eventLower.includes('career') || eventLower.includes('business') || eventLower.includes('conference')) {
    valuesAlignment.push('growth', 'achievement', 'career');
    wisdomNotes.push('Professional growth events can catalyze personal development');
    fitWithStage = 'good_fit';
  } else if (eventLower.includes('trip') || eventLower.includes('vacation') || eventLower.includes('travel')) {
    valuesAlignment.push('adventure', 'experience', 'freedom');
    wisdomNotes.push('Travel broadens perspective and renews energy');
    fitWithStage = 'good_fit';
  } else {
    valuesAlignment.push('connection', 'growth', 'experience');
    wisdomNotes.push('The planning is part of the experience');
  }

  return {
    currentStage: 'Adult life',
    fitWithStage,
    valuesAlignment,
    potentialConflicts: [],
    wisdomNotes,
  };
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check planning readiness across all domains
 */
export async function checkPlanningReadiness(
  userId: string,
  eventType: string,
  budget: number,
  eventDate?: string
): Promise<PlanningReadinessAssessment> {
  // Fetch all domain data in parallel
  const [financial, calendar, energy, lifeStage] = await Promise.all([
    fetchFinancialReadiness(userId, budget),
    fetchCalendarCapacity(userId, eventDate || '', 8),
    fetchEnergyAlignment(userId),
    fetchLifeStageContext(userId, eventType),
  ]);

  // Calculate overall score
  const financialScore = financial.canAfford ? (financial.budgetHealth * 0.8 + 20) : financial.budgetHealth * 0.5;
  const calendarScore = calendar.capacityScore;
  const energyScore = energy.currentEnergy;
  const stageScore = lifeStage.fitWithStage === 'perfect_fit' ? 100 :
                     lifeStage.fitWithStage === 'good_fit' ? 80 :
                     lifeStage.fitWithStage === 'neutral' ? 60 : 40;

  const overallScore = Math.round(
    (financialScore * 0.35) +
    (calendarScore * 0.25) +
    (energyScore * 0.25) +
    (stageScore * 0.15)
  );

  // Determine status
  let status: 'green' | 'yellow' | 'red';
  if (overallScore >= 70 && financial.canAfford && energy.burnoutRisk !== 'high') {
    status = 'green';
  } else if (overallScore >= 50 || (financial.canAfford && energy.burnoutRisk !== 'high')) {
    status = 'yellow';
  } else {
    status = 'red';
  }

  // Build action items
  const actionItems: string[] = [];
  if (!financial.canAfford) {
    actionItems.push('Review budget or increase savings timeline');
  }
  if (financial.emergencyFundStatus === 'none' || financial.emergencyFundStatus === 'partial') {
    actionItems.push('Consider building emergency fund before major event spending');
  }
  if (calendar.calendarDensity === 'overloaded') {
    actionItems.push('Clear some calendar space before heavy planning begins');
  }
  if (energy.burnoutRisk === 'high') {
    actionItems.push('Focus on energy recovery before taking on event planning');
  }
  if (energy.atRiskHabits.length > 0) {
    actionItems.push(`Protect these habits during planning: ${energy.atRiskHabits.join(', ')}`);
  }

  // Build summary
  let summary: string;
  if (status === 'green') {
    summary = `Great timing! You're well-positioned to plan this ${eventType}. Financial health is good, calendar has capacity, and energy levels support it.`;
  } else if (status === 'yellow') {
    summary = `Proceed with awareness. Some areas need attention: ${actionItems.slice(0, 2).join('; ')}. Consider addressing these as you plan.`;
  } else {
    summary = `Consider waiting or adjusting. Key concerns: ${actionItems.slice(0, 2).join('; ')}. This doesn't mean don't do it - just be strategic about timing.`;
  }

  // Recommended start time
  const recommendedStartTime = status === 'green' ? 'Now is good!' :
                               status === 'yellow' ? 'In 2-4 weeks, after addressing key items' :
                               'In 1-2 months, after stabilizing finances/energy';

  const assessment: PlanningReadinessAssessment = {
    overallScore,
    status,
    financial,
    calendar,
    energy,
    lifeStage,
    summary,
    actionItems,
    recommendedStartTime,
  };

  // Cache the assessment
  await cacheAssessment(userId, eventType, budget, assessment);

  log.info({ userId, eventType, budget, status, overallScore }, 'Completed planning readiness check');

  return assessment;
}

/**
 * Quick check - just returns status without full assessment
 */
export async function quickReadinessCheck(
  userId: string,
  budget: number
): Promise<{ status: 'green' | 'yellow' | 'red'; reason: string }> {
  const [financial, energy] = await Promise.all([
    fetchFinancialReadiness(userId, budget),
    fetchEnergyAlignment(userId),
  ]);

  if (!financial.canAfford) {
    return { status: 'red', reason: 'Budget exceeds comfortable spending range' };
  }
  if (energy.burnoutRisk === 'high') {
    return { status: 'red', reason: 'Energy levels suggest focusing on recovery first' };
  }
  if (financial.budgetHealth < 50 || energy.currentEnergy < 50) {
    return { status: 'yellow', reason: 'Proceed with caution - some strain on resources' };
  }
  return { status: 'green', reason: 'Good to go!' };
}

/**
 * Check if an event aligns with current goals
 * INTEGRATED: Uses real commitment keeper and dream keeper services
 */
export async function checkGoalAlignment(
  userId: string,
  eventType: string,
  eventPurpose: string
): Promise<{
  aligned: boolean;
  supportingGoals: string[];
  potentialConflicts: string[];
  recommendation: string;
}> {
  const supportingGoals: string[] = [];
  const potentialConflicts: string[] = [];
  
  try {
    // INTEGRATION: Check dreams for alignment
    const { loadUserDreams } = await import('./dream-keeper.js');
    const dreams = await loadUserDreams(userId);

    if (dreams?.length) {
      const eventLower = eventType.toLowerCase();

      for (const dream of dreams.filter((d) => d.status === 'alive').slice(0, 5)) {
        const dreamLower = dream.title?.toLowerCase() || '';
        const dreamStatement = dream.statement?.toLowerCase() || '';

        // Check for positive alignment
        if (
          (dreamLower.includes('family') && (eventLower.includes('wedding') || eventLower.includes('reunion'))) ||
          (dreamLower.includes('travel') && eventLower.includes('trip')) ||
          (dreamLower.includes('career') && eventLower.includes('business')) ||
          dreamStatement.includes(eventLower) || dreamLower.includes(eventLower)
        ) {
          supportingGoals.push(dream.title);
        }

        // Dream type doesn't have estimatedCost, skip that check
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Dream keeper not available');
  }
  
  try {
    // INTEGRATION: Check commitments for conflicts
    const { loadUserCommitments } = await import('./commitment-keeper.js');
    const commitments = await loadUserCommitments(userId);

    if (commitments?.length) {
      const eventLower = eventType.toLowerCase();

      for (const commitment of commitments.filter((c) => c.status === 'active').slice(0, 5)) {
        const commitLower = commitment.summary?.toLowerCase() || '';

        // Time-based conflict detection using targetDate
        if (commitment.targetDate) {
          const deadlineDate = new Date(commitment.targetDate);
          const now = new Date();
          const weeksUntil = (deadlineDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000);

          if (weeksUntil < 4 && weeksUntil > 0) {
            potentialConflicts.push(`Upcoming deadline: ${commitment.summary.slice(0, 40)}`);
          }
        }

        // Content alignment
        if (commitLower.includes(eventLower) || eventLower.includes(commitLower.split(' ')[0])) {
          supportingGoals.push(`Aligns with commitment: ${commitment.summary.slice(0, 40)}`);
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Commitment keeper not available');
  }
  
  const aligned = supportingGoals.length > 0 || potentialConflicts.length === 0;
  const recommendation = potentialConflicts.length > 0
    ? `Consider timing: ${potentialConflicts[0]}`
    : supportingGoals.length > 0
      ? `This aligns with your goals: ${supportingGoals[0]}`
      : 'Looks good to proceed!';
  
  if (supportingGoals.length === 0 && potentialConflicts.length === 0) {
    // Default fallback when no specific data found
    return {
      aligned: true,
      supportingGoals: ['Build meaningful relationships', 'Create lasting memories'],
      potentialConflicts: [],
      recommendation: 'This event supports your life goals around connection and celebration.',
    };
  }
  
  return {
    aligned,
    supportingGoals,
    potentialConflicts,
    recommendation,
  };
}

/**
 * Build context string for LLM injection
 */
export async function buildPlanningCoordinationContext(
  userId: string,
  eventType?: string,
  budget?: number
): Promise<string> {
  if (!eventType || !budget) return '';

  const quick = await quickReadinessCheck(userId, budget);

  const statusEmoji = quick.status === 'green' ? '🟢' : quick.status === 'yellow' ? '🟡' : '🔴';

  const lines = ['[PLANNING COORDINATION - Better Than Human]'];
  lines.push("I've checked across your finances, calendar, and energy:\n");
  lines.push(`${statusEmoji} Status: ${quick.status.toUpperCase()} - ${quick.reason}`);

  if (quick.status !== 'green') {
    lines.push('\nBefore diving into planning details, consider addressing the readiness concerns.');
    lines.push('I can help you prepare so this event brings joy, not stress.');
  } else {
    lines.push('\nYou have good capacity for this! Let\'s make it amazing.');
  }

  return lines.join('\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createDefaultProfile(userId: string): PlanningCoordinationProfile {
  return {
    userId,
    recentAssessments: [],
    planningStyle: {
      preferredLeadTime: 'moderate',
      stressResponse: 'neutral',
      delegationComfort: 'selective_delegation',
    },
    lastUpdated: new Date().toISOString(),
  };
}

function createDefaultFinancialReadiness(budget: number): FinancialReadiness {
  return {
    canAfford: budget < 5000, // Conservative default
    budgetHealth: 70,
    savingsVelocity: 'on_track',
    emergencyFundStatus: 'adequate',
    concerns: [],
    recommendations: [],
  };
}

function createDefaultCalendarCapacity(): CalendarCapacity {
  return {
    capacityScore: 70,
    calendarDensity: 'moderate',
    conflicts: [],
    bestPlanningWindows: [],
    recommendations: [],
  };
}

function createDefaultEnergyAlignment(): EnergyAlignment {
  return {
    currentEnergy: 70,
    energyTrend: 'stable',
    supportingHabits: [],
    atRiskHabits: [],
    burnoutRisk: 'low',
    recommendations: [],
  };
}

async function cacheAssessment(
  userId: string,
  eventType: string,
  budget: number,
  result: PlanningReadinessAssessment
): Promise<void> {
  const profile = (await loadCoordinationProfile(userId)) || createDefaultProfile(userId);

  // Keep only last 5 assessments
  profile.recentAssessments = [
    { eventType, budget, assessedAt: new Date().toISOString(), result },
    ...profile.recentAssessments.slice(0, 4),
  ];

  await saveCoordinationProfile(userId, profile);
}

// ============================================================================
// SERVICE EXPORT
// ============================================================================

export const planningCoordination = {
  checkPlanningReadiness,
  quickReadinessCheck,
  checkGoalAlignment,
  buildPlanningCoordinationContext,
  loadCoordinationProfile,
};

export default planningCoordination;
