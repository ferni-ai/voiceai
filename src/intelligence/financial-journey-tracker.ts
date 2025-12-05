/**
 * Financial Journey Tracker
 *
 * Tracks a user's long-term financial progress and creates narrative context.
 * Jack can say: "When we first met, you had no emergency fund and $15k in
 * credit card debt. Look how far you've come!"
 *
 * Features:
 * - Starting point snapshot
 * - Milestone tracking
 * - Progress narrative generation
 * - Trend analysis
 * - Celebration moments
 */

import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile, FinancialGoal, InvestmentEvent } from '../types/user-profile.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Snapshot of financial state at a point in time
 */
export interface FinancialSnapshot {
  id: string;
  date: Date;
  type: 'starting_point' | 'milestone' | 'check_in' | 'year_end';

  // Cash position
  emergencyFundStatus: 'none' | 'partial' | 'adequate' | 'strong';
  emergencyFundMonths?: number;

  // Debt
  hasDebt: boolean;
  debtAmount?: number;
  debtTypes?: string[];

  // Investments
  hasInvestments: boolean;
  investmentExperience: 'beginner' | 'intermediate' | 'experienced' | 'unknown';
  retirementAccountTypes?: string[];

  // Goals
  activeGoalCount: number;
  goalsAchieved: number;

  // Mindset (inferred from conversations)
  financialConfidence: 'low' | 'growing' | 'moderate' | 'high';
  primaryConcern?: string;

  // Notes
  jackNotes?: string;
}

/**
 * A milestone in the financial journey
 */
export interface JourneyMilestone {
  id: string;
  date: Date;
  type:
    | 'started_investing'
    | 'debt_free'
    | 'emergency_fund_complete'
    | 'first_goal_achieved'
    | 'major_contribution'
    | 'mindset_shift'
    | 'knowledge_breakthrough'
    | 'habit_formed'
    | 'anniversary';

  title: string;
  description: string;
  emotionalSignificance: 'minor' | 'moderate' | 'major';
  celebrationGiven: boolean;
  snapshotAtMilestone?: FinancialSnapshot;
}

/**
 * Progress trend over time
 */
export interface ProgressTrend {
  metric: string;
  direction: 'improving' | 'stable' | 'declining';
  confidence: number; // 0-1
  dataPoints: number;
  summary: string;
}

/**
 * The complete financial journey
 */
export interface FinancialJourney {
  userId: string;
  startedAt: Date;

  // Snapshots over time
  startingPoint: FinancialSnapshot;
  currentState: FinancialSnapshot;
  snapshots: FinancialSnapshot[];

  // Milestones achieved
  milestones: JourneyMilestone[];

  // Trends
  trends: ProgressTrend[];

  // Narrative
  progressNarrative: string;
  journeySummary: string;

  // Stats
  daysOnJourney: number;
  goalsAchieved: number;
  milestoneCount: number;
}

// ============================================================================
// FINANCIAL JOURNEY TRACKER
// ============================================================================

export class FinancialJourneyTracker {
  private userId: string;
  private snapshots: FinancialSnapshot[] = [];
  private milestones: JourneyMilestone[] = [];

  constructor(
    userId: string,
    existingSnapshots?: FinancialSnapshot[],
    existingMilestones?: JourneyMilestone[]
  ) {
    this.userId = userId;
    if (existingSnapshots) {
      this.snapshots = existingSnapshots;
    }
    if (existingMilestones) {
      this.milestones = existingMilestones;
    }
  }

  // ============================================================================
  // SNAPSHOT MANAGEMENT
  // ============================================================================

  /**
   * Create a snapshot from user profile
   */
  createSnapshot(
    profile: UserProfile,
    type: FinancialSnapshot['type'],
    jackNotes?: string
  ): FinancialSnapshot {
    // Determine emergency fund status
    let emergencyFundStatus: FinancialSnapshot['emergencyFundStatus'] = 'none';
    let emergencyFundMonths: number | undefined;

    if (profile.financialSituation?.hasEmergencyFund) {
      // Infer from conversation history if possible
      emergencyFundStatus = 'adequate'; // Default assumption
    }

    // Count active and achieved goals
    const activeGoalCount = profile.goals.filter(
      (g) => g.status === 'active' || g.status === 'on_track'
    ).length;
    const goalsAchieved = profile.goals.filter((g) => g.status === 'achieved').length;

    // Infer confidence from conversation patterns
    let financialConfidence: FinancialSnapshot['financialConfidence'] = 'moderate';
    if (profile.financialAnxietyTriggers && profile.financialAnxietyTriggers.length > 3) {
      financialConfidence = 'low';
    } else if (profile.investmentExperience === 'experienced') {
      financialConfidence = 'high';
    } else if (profile.totalConversations > 5) {
      financialConfidence = 'growing';
    }

    const snapshot: FinancialSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date(),
      type,

      emergencyFundStatus,
      emergencyFundMonths,

      hasDebt: profile.financialSituation?.hasDebt || false,
      debtTypes: profile.financialSituation?.debtTypes,

      hasInvestments: profile.hasInvestments,
      investmentExperience: profile.investmentExperience,
      retirementAccountTypes: profile.financialSituation?.investmentAccounts
        ?.filter((a) => a.hasAccount)
        .map((a) => a.type),

      activeGoalCount,
      goalsAchieved,

      financialConfidence,
      primaryConcern: profile.primaryConcerns[0],

      jackNotes,
    };

    this.snapshots.push(snapshot);

    getLogger().info(
      { type, goalsAchieved, hasInvestments: profile.hasInvestments },
      'Financial snapshot created'
    );

    return snapshot;
  }

  /**
   * Get the starting point snapshot
   */
  getStartingPoint(): FinancialSnapshot | null {
    return this.snapshots.find((s) => s.type === 'starting_point') || this.snapshots[0] || null;
  }

  /**
   * Get the most recent snapshot
   */
  getCurrentState(): FinancialSnapshot | null {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1];
  }

  // ============================================================================
  // MILESTONE DETECTION
  // ============================================================================

  /**
   * Check for new milestones based on profile changes
   */
  detectMilestones(profile: UserProfile, previousSnapshot?: FinancialSnapshot): JourneyMilestone[] {
    const newMilestones: JourneyMilestone[] = [];
    const current = this.getCurrentState();

    // First investment milestone
    if (profile.hasInvestments && !previousSnapshot?.hasInvestments) {
      newMilestones.push(
        this.createMilestone(
          'started_investing',
          'Started Investing Journey',
          "You've taken the first step into investing. This is huge - most people never get this far!",
          'major'
        )
      );
    }

    // Debt-free milestone
    if (!profile.financialSituation?.hasDebt && previousSnapshot?.hasDebt) {
      newMilestones.push(
        this.createMilestone(
          'debt_free',
          'Debt Free!',
          "You've paid off your debt! That's incredible discipline. This is a moment to really celebrate.",
          'major'
        )
      );
    }

    // Emergency fund milestone
    if (profile.financialSituation?.hasEmergencyFund && current?.emergencyFundStatus === 'none') {
      newMilestones.push(
        this.createMilestone(
          'emergency_fund_complete',
          'Emergency Fund Established',
          "You now have an emergency fund! That's one of the most important foundations of financial security.",
          'major'
        )
      );
    }

    // First goal achieved
    const achievedGoals = profile.goals.filter((g) => g.status === 'achieved');
    if (achievedGoals.length === 1 && (!previousSnapshot || previousSnapshot.goalsAchieved === 0)) {
      newMilestones.push(
        this.createMilestone(
          'first_goal_achieved',
          'First Goal Achieved!',
          `You did it! You achieved your first financial goal: ${achievedGoals[0].name}. This proves you can do it.`,
          'major'
        )
      );
    }

    // Anniversary milestones
    const firstContact = new Date(profile.firstContact);
    const daysSinceStart = Math.floor(
      (Date.now() - firstContact.getTime()) / (1000 * 60 * 60 * 24)
    );

    const anniversaryDays = [365, 730, 1095, 1460, 1825]; // 1-5 years
    for (const days of anniversaryDays) {
      if (daysSinceStart >= days && daysSinceStart < days + 7) {
        const years = Math.round(days / 365);
        const existingAnniversary = this.milestones.find(
          (m) => m.type === 'anniversary' && m.title.includes(`${years} Year`)
        );

        if (!existingAnniversary) {
          newMilestones.push(
            this.createMilestone(
              'anniversary',
              `${years} Year${years > 1 ? 's' : ''} on the Journey`,
              `Can you believe it? We've been on this financial journey together for ${years} year${years > 1 ? 's' : ''}. I'm honored to be part of it.`,
              years >= 3 ? 'major' : 'moderate'
            )
          );
        }
      }
    }

    // Add new milestones to tracker
    for (const milestone of newMilestones) {
      milestone.snapshotAtMilestone = current || undefined;
      this.milestones.push(milestone);
    }

    return newMilestones;
  }

  /**
   * Create a milestone record
   */
  private createMilestone(
    type: JourneyMilestone['type'],
    title: string,
    description: string,
    significance: JourneyMilestone['emotionalSignificance']
  ): JourneyMilestone {
    return {
      id: `mile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: new Date(),
      type,
      title,
      description,
      emotionalSignificance: significance,
      celebrationGiven: false,
    };
  }

  // ============================================================================
  // PROGRESS ANALYSIS
  // ============================================================================

  /**
   * Analyze trends in financial progress
   */
  analyzeTrends(): ProgressTrend[] {
    if (this.snapshots.length < 2) return [];

    const trends: ProgressTrend[] = [];
    const sorted = [...this.snapshots].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Confidence trend
    const confidenceLevels = { low: 1, growing: 2, moderate: 3, high: 4 };
    const confidenceValues = sorted.map((s) => confidenceLevels[s.financialConfidence]);
    const confidenceTrend = this.calculateTrend(confidenceValues);

    if (confidenceTrend !== 'stable') {
      trends.push({
        metric: 'Financial Confidence',
        direction: confidenceTrend,
        confidence: 0.7,
        dataPoints: sorted.length,
        summary:
          confidenceTrend === 'improving'
            ? 'Your financial confidence has been growing!'
            : "I've noticed some financial stress lately - let's talk about it.",
      });
    }

    // Goals achieved trend
    const goalsValues = sorted.map((s) => s.goalsAchieved);
    if (goalsValues[goalsValues.length - 1] > goalsValues[0]) {
      trends.push({
        metric: 'Goals Achieved',
        direction: 'improving',
        confidence: 0.9,
        dataPoints: sorted.length,
        summary: `You've achieved ${goalsValues[goalsValues.length - 1] - goalsValues[0]} new goals since we started!`,
      });
    }

    // Investment journey
    const investingStart = sorted.findIndex((s) => s.hasInvestments);
    if (investingStart > 0) {
      trends.push({
        metric: 'Investing',
        direction: 'improving',
        confidence: 0.95,
        dataPoints: sorted.length - investingStart,
        summary: "You've started investing - that's a major step forward!",
      });
    }

    return trends;
  }

  /**
   * Calculate simple trend direction from values
   */
  private calculateTrend(values: number[]): 'improving' | 'stable' | 'declining' {
    if (values.length < 2) return 'stable';

    const first = values.slice(0, Math.ceil(values.length / 2));
    const second = values.slice(Math.ceil(values.length / 2));

    const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;

    const diff = secondAvg - firstAvg;
    if (diff > 0.5) return 'improving';
    if (diff < -0.5) return 'declining';
    return 'stable';
  }

  // ============================================================================
  // NARRATIVE GENERATION
  // ============================================================================

  /**
   * Generate a progress narrative for the user
   */
  generateProgressNarrative(profile: UserProfile): string {
    const starting = this.getStartingPoint();
    const current = this.getCurrentState();

    if (!starting || !current) {
      return "We're just getting started on this journey together!";
    }

    const sections: string[] = [];

    // Opening
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(starting.date).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceStart > 30) {
      const monthsOrYears =
        daysSinceStart > 365
          ? `${Math.round(daysSinceStart / 365)} year${daysSinceStart > 730 ? 's' : ''}`
          : `${Math.round(daysSinceStart / 30)} months`;

      sections.push(`We've been on this journey together for ${monthsOrYears} now.`);
    }

    // Starting point
    const startingConditions: string[] = [];
    if (starting.emergencyFundStatus === 'none') {
      startingConditions.push('no emergency fund');
    }
    if (starting.hasDebt) {
      startingConditions.push('carrying debt');
    }
    if (!starting.hasInvestments) {
      startingConditions.push("hadn't started investing");
    }
    if (starting.financialConfidence === 'low') {
      startingConditions.push('feeling uncertain about finances');
    }

    if (startingConditions.length > 0) {
      sections.push(`When we first met, you were ${startingConditions.join(', ')}.`);
    }

    // Progress made
    const progress: string[] = [];
    if (starting.emergencyFundStatus === 'none' && current.emergencyFundStatus !== 'none') {
      progress.push('built an emergency fund');
    }
    if (starting.hasDebt && !current.hasDebt) {
      progress.push('paid off your debt');
    }
    if (!starting.hasInvestments && current.hasInvestments) {
      progress.push('started investing');
    }
    if (current.goalsAchieved > starting.goalsAchieved) {
      const diff = current.goalsAchieved - starting.goalsAchieved;
      progress.push(`achieved ${diff} financial goal${diff > 1 ? 's' : ''}`);
    }

    if (progress.length > 0) {
      sections.push(`Since then, you've ${progress.join(', ')}.`);
    }

    // Emotional journey
    if (
      starting.financialConfidence === 'low' &&
      (current.financialConfidence === 'moderate' || current.financialConfidence === 'high')
    ) {
      sections.push("I've watched your confidence grow. That's what this is really about.");
    }

    // Closing
    if (progress.length > 0) {
      sections.push("That's real progress. You should be proud.");
    } else {
      sections.push('Every conversation is a step forward. Keep going.');
    }

    return sections.join(' ');
  }

  /**
   * Generate a journey summary for context
   */
  generateJourneySummary(profile: UserProfile): string {
    const milestoneCount = this.milestones.length;
    const majorMilestones = this.milestones.filter((m) => m.emotionalSignificance === 'major');
    const goalsAchieved = profile.goals.filter((g) => g.status === 'achieved').length;

    const highlights: string[] = [];

    if (majorMilestones.length > 0) {
      highlights.push(`Major milestones: ${majorMilestones.map((m) => m.title).join(', ')}`);
    }

    if (goalsAchieved > 0) {
      highlights.push(`Goals achieved: ${goalsAchieved}`);
    }

    if (profile.hasInvestments) {
      highlights.push(`Investment experience: ${profile.investmentExperience}`);
    }

    return highlights.join(' | ');
  }

  // ============================================================================
  // DATA ACCESS
  // ============================================================================

  /**
   * Get the complete financial journey
   */
  getJourney(profile: UserProfile): FinancialJourney {
    const starting = this.getStartingPoint();
    const current = this.getCurrentState();

    // Create default starting point if none exists
    const startingPoint = starting || {
      id: 'default_start',
      date: new Date(profile.firstContact),
      type: 'starting_point' as const,
      emergencyFundStatus: 'none' as const,
      hasDebt: false,
      hasInvestments: false,
      investmentExperience: 'unknown' as const,
      activeGoalCount: 0,
      goalsAchieved: 0,
      financialConfidence: 'low' as const,
    };

    const currentState = current || this.createSnapshot(profile, 'check_in');

    const firstContact = new Date(profile.firstContact);
    const daysOnJourney = Math.floor((Date.now() - firstContact.getTime()) / (1000 * 60 * 60 * 24));

    return {
      userId: this.userId,
      startedAt: firstContact,
      startingPoint,
      currentState,
      snapshots: this.snapshots,
      milestones: this.milestones,
      trends: this.analyzeTrends(),
      progressNarrative: this.generateProgressNarrative(profile),
      journeySummary: this.generateJourneySummary(profile),
      daysOnJourney,
      goalsAchieved: profile.goals.filter((g) => g.status === 'achieved').length,
      milestoneCount: this.milestones.length,
    };
  }

  /**
   * Get journey context for prompt injection
   */
  getJourneyContext(profile: UserProfile): string {
    const journey = this.getJourney(profile);
    const lines: string[] = [];

    if (journey.daysOnJourney > 30) {
      lines.push(`Journey: ${Math.round(journey.daysOnJourney / 30)} months`);
    }

    if (journey.milestoneCount > 0) {
      lines.push(`Milestones: ${journey.milestoneCount}`);
    }

    if (journey.goalsAchieved > 0) {
      lines.push(`Goals achieved: ${journey.goalsAchieved}`);
    }

    // Add any uncelebrated milestones
    const uncelebrated = this.milestones.filter((m) => !m.celebrationGiven);
    if (uncelebrated.length > 0) {
      lines.push(`⭐ Celebrate: ${uncelebrated[0].title}`);
    }

    return lines.length > 0 ? `[FINANCIAL JOURNEY]\n${lines.join('\n')}` : '';
  }

  /**
   * Mark a milestone as celebrated
   */
  markMilestoneCelebrated(milestoneId: string): void {
    const milestone = this.milestones.find((m) => m.id === milestoneId);
    if (milestone) {
      milestone.celebrationGiven = true;
    }
  }

  /**
   * Get uncelebrated milestones
   */
  getUncelebratedMilestones(): JourneyMilestone[] {
    return this.milestones.filter((m) => !m.celebrationGiven);
  }

  /**
   * Get all data for persistence
   */
  getAllData(): { snapshots: FinancialSnapshot[]; milestones: JourneyMilestone[] } {
    return {
      snapshots: [...this.snapshots],
      milestones: [...this.milestones],
    };
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const trackers = new Map<string, FinancialJourneyTracker>();

export function getFinancialJourneyTracker(
  userId: string,
  existingSnapshots?: FinancialSnapshot[],
  existingMilestones?: JourneyMilestone[]
): FinancialJourneyTracker {
  let tracker = trackers.get(userId);
  if (!tracker) {
    tracker = new FinancialJourneyTracker(userId, existingSnapshots, existingMilestones);
    trackers.set(userId, tracker);
  }
  return tracker;
}

export function removeFinancialJourneyTracker(userId: string): void {
  trackers.delete(userId);
}

export default FinancialJourneyTracker;
