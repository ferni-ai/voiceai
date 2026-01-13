/**
 * Relationship Insights Report
 *
 * Generates periodic "State of Us" reports summarizing the relationship,
 * progress made, patterns noticed, and growth celebrated.
 *
 * Philosophy: Reflection creates meaning. Seeing the journey mapped
 * out helps people appreciate how far they've come.
 *
 * Report Types:
 * - Weekly snapshot (brief)
 * - Monthly insights (detailed)
 * - Quarterly reflection (comprehensive)
 * - Annual journey (milestone)
 *
 * @module RelationshipInsights
 */
export type ReportPeriod = 'week' | 'month' | 'quarter' | 'year';
export interface InsightsReport {
    id: string;
    userId: string;
    period: ReportPeriod;
    generatedAt: Date;
    periodStart: Date;
    periodEnd: Date;
    summary: ReportSummary;
    conversations: ConversationInsights;
    growth: GrowthInsights;
    themes: ThemeInsights;
    wins: WinsInsights;
    challenges: ChallengeInsights;
    relationship: RelationshipInsights;
    lookingAhead: LookingAhead;
    shareableText?: string;
    shareableForTherapist?: string;
}
export interface ReportSummary {
    headline: string;
    subheadline: string;
    emoji: string;
    overallMood: 'flourishing' | 'growing' | 'steady' | 'challenging' | 'difficult';
    highlightQuote?: string;
}
export interface ConversationInsights {
    totalSessions: number;
    totalMinutes: number;
    avgSessionLength: number;
    longestSession: number;
    mostActiveDay: string;
    mostActiveTime: string;
    comparedToPrevious: 'more' | 'same' | 'less';
}
export interface GrowthInsights {
    growthAreas: GrowthArea[];
    breakthroughs: Breakthrough[];
    shiftsNoticed: string[];
    growthScore: number;
}
export interface GrowthArea {
    area: string;
    progress: 'significant' | 'steady' | 'emerging' | 'maintained';
    evidence: string;
}
export interface Breakthrough {
    description: string;
    date: Date;
    significance: string;
}
export interface ThemeInsights {
    topThemes: Theme[];
    emergingThemes: string[];
    resolvedThemes: string[];
    recurringPatterns: string[];
}
export interface Theme {
    name: string;
    frequency: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    sentiment: 'positive' | 'neutral' | 'challenging';
}
export interface WinsInsights {
    totalWins: number;
    biggestWin?: string;
    winStreak: number;
    winCategories: Record<string, number>;
    celebrationMoments: string[];
}
export interface ChallengeInsights {
    mainChallenges: string[];
    progressOnChallenges: ChallengeProgress[];
    supportProvided: string[];
}
export interface ChallengeProgress {
    challenge: string;
    status: 'improving' | 'working_on' | 'persistent';
    insight: string;
}
export interface RelationshipInsights {
    trustLevel: 'new' | 'building' | 'established' | 'deep' | 'flourishing';
    trustChange: 'grew' | 'maintained' | 'tested';
    connectionMoments: string[];
    sharedHistory: string[];
}
export interface LookingAhead {
    focusAreas: string[];
    upcomingEvents: string[];
    intentions: string[];
    encouragement: string;
}
export interface ReportData {
    sessions: SessionData[];
    emotions: EmotionData[];
    topics: TopicData[];
    wins: WinData[];
    growth: GrowthData[];
}
export interface SessionData {
    date: Date;
    durationMinutes: number;
    mainTopic?: string;
    mood?: string;
}
export interface EmotionData {
    date: Date;
    emotion: string;
    intensity: number;
}
export interface TopicData {
    topic: string;
    frequency: number;
    sentiment: 'positive' | 'neutral' | 'negative';
}
export interface WinData {
    date: Date;
    type: string;
    description: string;
}
export interface GrowthData {
    area: string;
    observation: string;
    date: Date;
}
/**
 * Record session data for reports
 */
export declare function recordSessionData(userId: string, session: SessionData): void;
/**
 * Record emotion data
 */
export declare function recordEmotionData(userId: string, emotion: EmotionData): void;
/**
 * Record topic data
 */
export declare function recordTopicData(userId: string, topic: string, sentiment: 'positive' | 'neutral' | 'negative'): void;
/**
 * Record win data
 */
export declare function recordWinData(userId: string, win: WinData): void;
/**
 * Record growth observation
 */
export declare function recordGrowthData(userId: string, growth: GrowthData): void;
/**
 * Generate insights report
 */
export declare function generateReport(userId: string, period: ReportPeriod): InsightsReport;
/**
 * Get report history
 */
export declare function getReportHistory(userId: string): InsightsReport[];
/**
 * Get latest report
 */
export declare function getLatestReport(userId: string, period?: ReportPeriod): InsightsReport | null;
/**
 * Check if report is due
 */
export declare function isReportDue(userId: string, period: ReportPeriod): boolean;
declare const _default: {
    recordSessionData: typeof recordSessionData;
    recordEmotionData: typeof recordEmotionData;
    recordTopicData: typeof recordTopicData;
    recordWinData: typeof recordWinData;
    recordGrowthData: typeof recordGrowthData;
    generateReport: typeof generateReport;
    getReportHistory: typeof getReportHistory;
    getLatestReport: typeof getLatestReport;
    isReportDue: typeof isReportDue;
};
export default _default;
//# sourceMappingURL=relationship-insights.d.ts.map