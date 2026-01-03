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
 * In a full implementation, this would query actual financial data
 */
async function fetchFinancialReadiness(
  userId: string,
  eventBudget: number
): Promise<FinancialReadiness> {
  // TODO: Integrate with actual financial tracking service
  // For now, return a reasonable default that can be overridden
  
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
 */
async function fetchCalendarCapacity(
  userId: string,
  eventDate: string,
  planningWeeks: number = 8
): Promise<CalendarCapacity> {
  // TODO: Integrate with actual calendar service
  // For now, return a reasonable default
  
  const db = getFirestoreDb();
  if (!db) {
    return createDefaultCalendarCapacity();
  }

  try {
    // Try to fetch calendar density data
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
 */
async function fetchEnergyAlignment(userId: string): Promise<EnergyAlignment> {
  // TODO: Integrate with actual habit/energy tracking service
  
  const db = getFirestoreDb();
  if (!db) {
    return createDefaultEnergyAlignment();
  }

  try {
    // Try to fetch energy data
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
 */
async function fetchLifeStageContext(
  userId: string,
  eventType: string
): Promise<LifeStageContext> {
  // TODO: Integrate with actual life narrative service
  
  return {
    currentStage: 'Adult life',
    fitWithStage: 'good_fit',
    valuesAlignment: ['connection', 'celebration', 'relationships'],
    potentialConflicts: [],
    wisdomNotes: [
      'Events are investments in memory and connection',
      'The planning is part of the experience',
    ],
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
  // TODO: Integrate with actual goals service
  // For now, return positive alignment
  
  return {
    aligned: true,
    supportingGoals: ['Build meaningful relationships', 'Create lasting memories'],
    potentialConflicts: [],
    recommendation: 'This event supports your life goals around connection and celebration.',
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
