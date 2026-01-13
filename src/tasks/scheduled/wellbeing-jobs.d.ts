/**
 * Wellbeing Scheduled Jobs
 *
 * Background tasks for wellbeing intelligence:
 * - Weekly ANT (Automatic Negative Thought) reports
 * - Daily early warning checks
 * - Wisdom contribution aggregation
 * - Engagement nudges for missing check-ins
 *
 * @module WellbeingJobs
 */
interface JobConfig {
    name: string;
    schedule: string;
    enabled: boolean;
    lastRun?: Date;
    nextRun?: Date;
}
/**
 * Run weekly ANT reports for all users
 */
export declare function runWeeklyANTReports(): Promise<{
    processed: number;
    reports: number;
    errors: number;
}>;
/**
 * Run daily early warning checks for all users
 */
export declare function runDailyWarningChecks(): Promise<{
    processed: number;
    warnings: number;
    urgent: number;
    outreachTriggered: number;
}>;
/**
 * Aggregate wisdom patterns from population
 */
export declare function runWisdomAggregation(): Promise<{
    patternsDiscovered: number;
    insightsGenerated: number;
}>;
/**
 * Send gentle nudges to users who haven't checked in
 */
export declare function runCheckInNudges(): Promise<{
    eligible: number;
    nudged: number;
}>;
/**
 * Process and send "thinking of you" proactive outreach
 *
 * This is THE differentiator - the AI that remembers and checks in
 * on things the user mentioned. A human friend might forget, but Ferni doesn't.
 */
export declare function runThinkingOfYouOutreach(): Promise<{
    usersProcessed: number;
    momentsGenerated: number;
    outreachSent: number;
    errors: number;
}>;
/**
 * Run a specific job by name
 */
export declare function runJob(jobName: string): Promise<unknown>;
/**
 * Get all job configurations
 */
export declare function getJobConfigs(): Record<string, JobConfig>;
/**
 * Enable/disable a job
 */
export declare function setJobEnabled(jobName: string, enabled: boolean): void;
export declare const wellbeingJobs: {
    runWeeklyANTReports: typeof runWeeklyANTReports;
    runDailyWarningChecks: typeof runDailyWarningChecks;
    runWisdomAggregation: typeof runWisdomAggregation;
    runCheckInNudges: typeof runCheckInNudges;
    runThinkingOfYouOutreach: typeof runThinkingOfYouOutreach;
    runJob: typeof runJob;
    getJobConfigs: typeof getJobConfigs;
    setJobEnabled: typeof setJobEnabled;
};
export default wellbeingJobs;
//# sourceMappingURL=wellbeing-jobs.d.ts.map