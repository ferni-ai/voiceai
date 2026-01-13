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
/**
 * Called when a dream becomes dormant (not mentioned in a while)
 */
export declare function onDreamBecameDormant(userId: string, dream: {
    id: string;
    title: string;
    dormantDays: number;
}): Promise<void>;
/**
 * Called when a dream shows progress
 */
export declare function onDreamProgress(userId: string, dream: {
    id: string;
    title: string;
    progressPercent: number;
}): Promise<void>;
/**
 * Called when burnout risk elevates
 */
export declare function onBurnoutRiskElevated(userId: string, assessment: {
    risk: 'low' | 'elevated' | 'high' | 'critical';
    riskScore: number;
    factors: string[];
}): Promise<void>;
/**
 * Called when capacity recovers after being low
 */
export declare function onCapacityRecovered(userId: string, recovery: {
    previousRisk: string;
    currentRisk: string;
    daysToRecover: number;
}): Promise<void>;
/**
 * Called when a values conflict is detected
 */
export declare function onValuesConflictDetected(userId: string, conflict: {
    values: string[];
    situation: string;
    severity: 'low' | 'medium' | 'high';
}): Promise<void>;
/**
 * Called when values alignment is strong
 */
export declare function onValuesAligned(userId: string, alignment: {
    value: string;
    action: string;
    alignmentScore: number;
}): Promise<void>;
/**
 * Called when a commitment is made
 */
export declare function onCommitmentMade(userId: string, commitment: {
    id: string;
    summary: string;
    deadline?: Date;
}): Promise<void>;
/**
 * Called when a commitment is at risk of being missed
 */
export declare function onCommitmentAtRisk(userId: string, commitment: {
    id: string;
    summary: string;
    daysOverdue: number;
}): Promise<void>;
/**
 * Called when an important date is approaching
 */
export declare function onImportantDateApproaching(userId: string, date: {
    name: string;
    date: Date;
    daysUntil: number;
    type: string;
}): Promise<void>;
/**
 * Called when a seasonal pattern is detected
 */
export declare function onSeasonalPatternDetected(userId: string, pattern: {
    season: string;
    pattern: string;
    historicalOccurrences: number;
}): Promise<void>;
/**
 * Called when a life chapter transition is detected
 */
export declare function onLifeChapterTransition(userId: string, transition: {
    fromChapter: string;
    toChapter: string;
    significance: 'minor' | 'major' | 'transformative';
}): Promise<void>;
/**
 * Called when a struggle is predicted
 */
export declare function onStrugglePredicted(userId: string, prediction: {
    type: string;
    confidence: number;
    preventionTip: string;
    timeframe: string;
}): Promise<void>;
/**
 * Called when crisis signals are detected
 */
export declare function onCrisisSignalsDetected(userId: string, crisis: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    signals: string[];
}): Promise<void>;
/**
 * Called when relationship health declines
 */
export declare function onRelationshipHealthDecline(userId: string, relationship: {
    personName: string;
    previousHealth: string;
    currentHealth: string;
    daysSinceContact: number;
}): Promise<void>;
/**
 * Called when mood pattern is detected
 */
export declare function onMoodPatternDetected(userId: string, pattern: {
    type: 'weekly' | 'monthly' | 'seasonal';
    lowPoint: string;
    frequency: number;
}): Promise<void>;
/**
 * Called when energy consistently low
 */
export declare function onPersistentLowEnergy(userId: string, energy: {
    averageLevel: number;
    consecutiveDays: number;
    potentialCauses: string[];
}): Promise<void>;
/**
 * Called for recovery check-ins
 */
export declare function onRecoveryCheckIn(userId: string, recovery: {
    type: string;
    daysSober: number;
    nextMilestone: number;
}): Promise<void>;
/**
 * Called when user needs full team support (major life event or crisis)
 * Triggers group outreach with multiple personas
 */
export declare function onNeedsTeamSupport(userId: string, situation: {
    type: 'crisis' | 'major_life_event' | 'complex_challenge' | 'celebration';
    description: string;
    preferredName?: string;
    currentStruggles?: string[];
}): Promise<void>;
/**
 * Called when multiple perspectives would help (research + coaching)
 * Triggers Peter + Ferni collaborative outreach
 */
export declare function onNeedsMultiplePerspectives(userId: string, insight: {
    topic: string;
    insightSummary: string;
    preferredName?: string;
}): Promise<void>;
/**
 * Called when a commitment is severely at risk and needs team intervention
 * More urgent than single-persona follow-up
 */
export declare function onCommitmentNeedsTeamSupport(userId: string, commitment: {
    id: string;
    summary: string;
    daysOverdue: number;
    preferredName?: string;
    relatedStruggles?: string[];
}): Promise<void>;
/**
 * Called for team roundtable voice calls on complex topics
 */
export declare function onNeedsTeamRoundtable(userId: string, roundtable: {
    topic: string;
    reason: string;
    suggestedPersonas?: string[];
    collaborationMode?: 'discussion' | 'brainstorm' | 'support';
    preferredName?: string;
}): Promise<void>;
/**
 * Register all bridge functions for easy access
 */
export declare const superhumanOutreachBridge: {
    onDreamBecameDormant: typeof onDreamBecameDormant;
    onDreamProgress: typeof onDreamProgress;
    onBurnoutRiskElevated: typeof onBurnoutRiskElevated;
    onCapacityRecovered: typeof onCapacityRecovered;
    onValuesConflictDetected: typeof onValuesConflictDetected;
    onValuesAligned: typeof onValuesAligned;
    onCommitmentMade: typeof onCommitmentMade;
    onCommitmentAtRisk: typeof onCommitmentAtRisk;
    onCommitmentNeedsTeamSupport: typeof onCommitmentNeedsTeamSupport;
    onImportantDateApproaching: typeof onImportantDateApproaching;
    onSeasonalPatternDetected: typeof onSeasonalPatternDetected;
    onLifeChapterTransition: typeof onLifeChapterTransition;
    onStrugglePredicted: typeof onStrugglePredicted;
    onCrisisSignalsDetected: typeof onCrisisSignalsDetected;
    onRelationshipHealthDecline: typeof onRelationshipHealthDecline;
    onMoodPatternDetected: typeof onMoodPatternDetected;
    onPersistentLowEnergy: typeof onPersistentLowEnergy;
    onRecoveryCheckIn: typeof onRecoveryCheckIn;
    onNeedsTeamSupport: typeof onNeedsTeamSupport;
    onNeedsMultiplePerspectives: typeof onNeedsMultiplePerspectives;
    onNeedsTeamRoundtable: typeof onNeedsTeamRoundtable;
};
export default superhumanOutreachBridge;
//# sourceMappingURL=superhuman-outreach-bridge.d.ts.map