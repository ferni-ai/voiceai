/**
 * Superhuman Outreach Intelligence
 *
 * This is the BRAIN that makes Ferni "better than human."
 *
 * No human friend can:
 * - Track 19 different signals about your life
 * - Detect when Sunday evening anxiety is hitting someone with low energy
 * - Notice you haven't mentioned your dream in 6 months
 * - Coordinate 6 specialists to reach out together
 *
 * This module connects the superhuman services to the group outreach system,
 * creating genuinely intelligent proactive care.
 *
 * @module services/conversation-thread/superhuman-outreach-intelligence
 */
import type { PersonaId } from '../../personas/types.js';
import { type GroupOutreachResult } from './group-outreach.js';
export interface SuperhumanSignal {
    type: SignalType;
    severity: 'low' | 'medium' | 'high' | 'urgent';
    source: string;
    data: Record<string, unknown>;
    timestamp: Date;
}
export type SignalType = 'crisis_detected' | 'emotional_peak' | 'voice_distress' | 'voice_biomarker_alert' | 'predictive_pattern_match' | 'temporal_anomaly' | 'values_conflict' | 'capacity_depleted' | 'capacity_low' | 'blind_spot_pattern' | 'mood_prediction_low' | 'energy_wave_optimal' | 'energy_wave_avoid' | 'life_event_detected' | 'life_chapter_change' | 'open_loop_high_priority' | 'commitment_milestone' | 'dream_reignited' | 'relationship_reconnect' | 'seasonal_date_upcoming' | 'seasonal_pattern_match' | 'silence_processing' | 'silence_invitation' | 'contradiction_detected' | 'receptivity_high' | 'receptivity_low' | 'future_trajectory_concern' | 'social_battery_depleted' | 'social_battery_recharged' | 'conflict_unresolved' | 'calendar_prep_needed' | 'vague_emotion_detected' | 'recovery_needed' | 'recovery_check_in' | 'inside_joke_opportunity' | 'protective_boundary_crossed' | 'habit_streak_broken' | 'habit_streak_milestone' | 'task_overdue' | 'financial_goal_progress' | 'financial_bill_due' | 'sleep_quality_poor' | 'calendar_busy_day' | 'correlation_discovered' | 'emotional_trajectory_shift' | 'relational_tension' | 'counterfactual_regret' | 'growth_pattern_detected' | 'cross_session_thread_found' | 'breakthrough_moment' | 'streak_milestone' | 'goal_achieved';
interface OutreachRule {
    name: string;
    description: string;
    /**
     * Which signals trigger this rule.
     * Can combine with AND/OR logic.
     */
    triggers: {
        signalTypes: SignalType[];
        operator: 'AND' | 'OR';
        minSeverity?: 'low' | 'medium' | 'high' | 'urgent';
    };
    /**
     * Additional conditions that must be true.
     */
    conditions?: {
        relationshipStage?: ('established' | 'deep')[];
        timeOfDay?: 'any' | 'quiet_hours_ok' | 'business_hours';
        recentOutreach?: 'none_in_24h' | 'none_in_week' | 'any';
    };
    /**
     * What action to take.
     */
    action: OutreachAction;
    /**
     * Priority when multiple rules match.
     */
    priority: number;
}
type OutreachAction = {
    type: 'full_team_support';
    situation: string;
} | {
    type: 'team_celebration';
    achievement: string;
} | {
    type: 'peter_ferni_insight';
    topic: string;
    insight: string;
} | {
    type: 'maya_jordan_planning';
    eventName: string;
} | {
    type: 'team_roundtable';
    personas: PersonaId[];
    topic: string;
    reason: string;
} | {
    type: 'ferni_check_in';
    reason: string;
} | {
    type: 'maya_habit_support';
    habitName: string;
    isEncouragement: boolean;
};
declare const OUTREACH_RULES: OutreachRule[];
/**
 * Get optimal outreach time for a user.
 *
 * Returns a future time when outreach would be appropriate,
 * useful for scheduling deferred messages.
 */
export declare function getOptimalOutreachTime(context: {
    quietHoursStart?: number;
    quietHoursEnd?: number;
    timezone?: string;
}): Date;
/**
 * Process incoming superhuman signals and determine if outreach is warranted.
 *
 * This is the core "intelligence" - it receives signals from all 19 superhuman
 * services and decides whether/how to reach out.
 */
export declare function processSuperhumanSignals(userId: string, signals: SuperhumanSignal[], userContext: {
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastOutreachAt?: Date;
    preferredName?: string;
    quietHoursStart?: number;
    quietHoursEnd?: number;
}): Promise<GroupOutreachResult | null>;
/**
 * Generate signals from crisis detection.
 */
export declare function signalFromCrisis(crisisData: {
    type: string;
    severity: 'low' | 'moderate' | 'high' | 'severe';
    context?: string;
}): SuperhumanSignal;
/**
 * Generate signals from predictive coaching.
 */
export declare function signalFromPrediction(prediction: {
    patternId: string;
    confidence: number;
    timing: string;
    context?: string;
}): SuperhumanSignal;
/**
 * Generate signals from capacity guardian.
 */
export declare function signalFromCapacity(capacity: {
    level: 'depleted' | 'low' | 'moderate' | 'good' | 'high';
    burnoutRisk: boolean;
    indicators: string[];
}): SuperhumanSignal | null;
/**
 * Generate signals from values alignment.
 */
export declare function signalFromValuesConflict(conflict: {
    statedValue: string;
    demonstratedValue: string;
    tension: string;
}): SuperhumanSignal;
/**
 * Generate signals from open loops.
 */
export declare function signalFromOpenLoop(loop: {
    type: string;
    content: string;
    priority: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from temporal patterns.
 */
export declare function signalFromTemporalAnomaly(anomaly: {
    description: string;
    unusualBehavior: string;
}): SuperhumanSignal;
/**
 * Generate signals from voice prosody analysis.
 */
export declare function signalFromVoiceDistress(voice: {
    hasStrain: boolean;
    hasTremor: boolean;
    arousal: number;
    valence: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from dream keeper.
 */
export declare function signalFromDreamReignition(dream: {
    dreamText: string;
    dormantDays: number;
    mentionedAgain: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from relationship milestones.
 */
export declare function signalFromMilestone(milestone: {
    type: 'duration' | 'conversations' | 'trust' | 'breakthrough' | 'growth';
    title: string;
    isSignificant: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from habit streaks.
 */
export declare function signalFromStreak(streak: {
    habitName: string;
    streakDays: number;
    isRecord: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from goal completion.
 */
export declare function signalFromGoalAchieved(goal: {
    goalId: string;
    goalTitle: string;
    completionDate: Date;
    importance: 'low' | 'medium' | 'high';
}): SuperhumanSignal;
/**
 * Generate signals from relationship network.
 */
export declare function signalFromReconnection(reconnect: {
    personName: string;
    daysSinceLastMention: number;
    importance: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from life narrative chapter changes.
 */
export declare function signalFromLifeChapter(chapter: {
    chapterType: string;
    title: string;
    isNewChapter: boolean;
    significance: 'minor' | 'moderate' | 'major';
}): SuperhumanSignal | null;
/**
 * Generate signals from seasonal awareness.
 */
export declare function signalFromSeasonalDate(date: {
    name: string;
    daysUntil: number;
    dateType: 'anniversary' | 'birthday' | 'memorial' | 'custom';
    importance: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from seasonal pattern detection.
 */
export declare function signalFromSeasonalPattern(pattern: {
    patternType: string;
    currentSeason: string;
    userTendency: string;
    confidence: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from silence interpreter.
 */
export declare function signalFromSilence(silence: {
    silenceType: 'processing' | 'invitation' | 'thinking' | 'resistance' | 'emotional';
    duration: number;
    context?: string;
}): SuperhumanSignal | null;
/**
 * Generate signals from contradiction comfort.
 */
export declare function signalFromContradiction(contradiction: {
    emotions: [string, string];
    intensity: number;
    validated: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from perfect timing / receptivity.
 */
export declare function signalFromReceptivity(receptivity: {
    score: number;
    factors: string[];
    bestTopics?: string[];
    avoidTopics?: string[];
}): SuperhumanSignal | null;
/**
 * Generate signals from pattern mirror (blind spots).
 */
export declare function signalFromBlindSpot(pattern: {
    patternType: 'topic_energy' | 'cyclical' | 'fading' | 'mismatch';
    description: string;
    confidence: number;
    surfaceable: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from future self projection.
 */
export declare function signalFromFutureTrajectory(trajectory: {
    timeframe: '3_months' | '1_year' | '5_years';
    concern: string;
    positivePatterns: string[];
    concerningPatterns: string[];
}): SuperhumanSignal | null;
/**
 * Generate signals from voice biomarkers.
 */
export declare function signalFromVoiceBiomarkers(biomarkers: {
    stressLevel: number;
    fatigueLevel: number;
    moodScore: number;
    trends: {
        improving: boolean;
        concerning: boolean;
    };
}): SuperhumanSignal | null;
/**
 * Generate signals from mood calendar predictions.
 */
export declare function signalFromMoodPrediction(prediction: {
    predictedMood: string;
    predictedDate: Date;
    confidence: number;
    basedOn: string[];
}): SuperhumanSignal | null;
/**
 * Generate signals from social battery.
 */
export declare function signalFromSocialBattery(battery: {
    level: number;
    recentEvents: number;
    needsRecharge: boolean;
    recharged: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from conflict resolution memory.
 */
export declare function signalFromConflict(conflict: {
    conflictId: string;
    personName: string;
    daysSinceConflict: number;
    resolved: boolean;
    recommendation?: string;
}): SuperhumanSignal | null;
/**
 * Generate signals from calendar prep coaching.
 */
export declare function signalFromCalendarPrep(event: {
    eventId: string;
    title: string;
    difficulty: 'easy' | 'moderate' | 'challenging' | 'high_stakes';
    hoursUntil: number;
    prepNeeded: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from energy wave mapping.
 */
export declare function signalFromEnergyWave(wave: {
    currentEnergy: number;
    optimalTime: boolean;
    avoidTime: boolean;
    recommendation?: string;
}): SuperhumanSignal | null;
/**
 * Generate signals from emotional vocabulary.
 */
export declare function signalFromVagueEmotion(emotion: {
    vagueWord: string;
    possibleMeanings: string[];
    context?: string;
}): SuperhumanSignal;
/**
 * Generate signals from recovery tracking.
 */
export declare function signalFromRecovery(recovery: {
    eventType: string;
    eventName: string;
    daysSinceEvent: number;
    recoveryStatus: 'not_started' | 'in_progress' | 'recovered';
    checkInDue: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from inside joke memory.
 */
export declare function signalFromInsideJoke(opportunity: {
    momentType: string;
    momentText: string;
    relevanceScore: number;
    canCallback: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from protective silence (boundaries).
 */
export declare function signalFromBoundary(boundary: {
    topic: string;
    severity: 'mild' | 'moderate' | 'severe';
    wasHit: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from habit tracking.
 */
export declare function signalFromHabit(habit: {
    habitName: string;
    action: 'completed' | 'skipped' | 'streak_broken';
    streakDays?: number;
    wasRecord?: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from task tracking.
 */
export declare function signalFromTask(task: {
    taskTitle: string;
    priority: 'low' | 'medium' | 'high';
    isOverdue: boolean;
    daysOverdue?: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from financial tracking.
 */
export declare function signalFromFinancial(event: {
    eventType: 'savings_progress' | 'bill_due' | 'budget_exceeded';
    title: string;
    progress?: number;
    daysUntilDue?: number;
    amount?: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from sleep tracking.
 */
export declare function signalFromSleep(sleep: {
    quality: 'good' | 'fair' | 'poor';
    hoursSlept: number;
    consecutivePoorNights?: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from calendar density.
 */
export declare function signalFromCalendarDensity(calendar: {
    date: Date;
    meetingCount: number;
    totalHours: number;
    isBusyDay: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from correlation mining.
 */
export declare function signalFromCorrelation(correlation: {
    domains: [string, string];
    description: string;
    strength: number;
    actionable: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from emotional trajectories.
 */
export declare function signalFromEmotionalTrajectory(trajectory: {
    direction: 'improving' | 'declining' | 'stable';
    currentEmotion: string;
    weeklyTrend: number;
}): SuperhumanSignal | null;
/**
 * Generate signals from relational semantics.
 */
export declare function signalFromRelationalTension(tension: {
    personName: string;
    tensionType: string;
    severity: number;
    suggestedAction?: string;
}): SuperhumanSignal | null;
/**
 * Generate signals from counterfactual memory.
 */
export declare function signalFromCounterfactual(decision: {
    decisionPoint: string;
    hasRegret: boolean;
    regretIntensity?: number;
    alternativeMentioned: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from growth fingerprint.
 */
export declare function signalFromGrowth(growth: {
    areaOfGrowth: string;
    changeType: 'improvement' | 'regression' | 'emergence';
    magnitude: number;
    celebrationWorthy: boolean;
}): SuperhumanSignal | null;
/**
 * Generate signals from cross-session threading.
 */
export declare function signalFromCrossSessionThread(thread: {
    threadId: string;
    topic: string;
    sessionCount: number;
    lastMentioned: Date;
    needsResolution: boolean;
}): SuperhumanSignal | null;
/**
 * Accumulate a signal for later processing.
 * Signals are collected during a session and processed periodically.
 */
export declare function accumulateSignal(userId: string, signal: SuperhumanSignal): void;
/**
 * Get accumulated signals for a user (and optionally clear them).
 */
export declare function getAccumulatedSignals(userId: string, clear?: boolean): SuperhumanSignal[];
/**
 * Process accumulated signals at end of session or periodically.
 * This is the main entry point for intelligent outreach decisions.
 */
export declare function processAccumulatedSignals(userId: string, userContext: {
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastOutreachAt?: Date;
    preferredName?: string;
}): Promise<GroupOutreachResult | null>;
/**
 * Call this from semantic intelligence integration to accumulate signals.
 * Should be called with the results of each superhuman service.
 */
export declare function integrateWithSemanticIntelligence(userId: string, turnData: {
    crisisDetected?: {
        type: string;
        severity: 'low' | 'moderate' | 'high' | 'severe';
    };
    capacityLevel?: {
        level: 'depleted' | 'low' | 'moderate' | 'good' | 'high';
        burnoutRisk: boolean;
        indicators: string[];
    };
    valuesConflict?: {
        statedValue: string;
        demonstratedValue: string;
        tension: string;
    };
    openLoops?: Array<{
        type: string;
        content: string;
        priority: number;
    }>;
    temporalAnomaly?: {
        description: string;
        unusualBehavior: string;
    };
    voiceDistress?: {
        hasStrain: boolean;
        hasTremor: boolean;
        arousal: number;
        valence: number;
    };
    emotionalPeak?: {
        emotion: string;
        intensity: number;
    };
}): Promise<void>;
export { OUTREACH_RULES };
//# sourceMappingURL=superhuman-outreach-intelligence.d.ts.map