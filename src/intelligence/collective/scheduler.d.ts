/**
 * Collective Learning Background Scheduler
 *
 * Runs periodic background jobs to:
 * 1. Save community insights to Firestore
 * 2. Trigger pattern recomputation
 * 3. Feed learnings back to personas
 *
 * This creates the "collective intelligence" loop that makes
 * all personas smarter from community learnings.
 *
 * @module intelligence/collective-learning-scheduler
 */
/**
 * Start the collective learning scheduler
 */
export declare function startCollectiveLearningScheduler(): void;
/**
 * Stop the collective learning scheduler
 */
export declare function stopCollectiveLearningScheduler(): void;
/**
 * Force run all aggregation jobs (for testing/debugging)
 */
export declare function forceRunAllJobs(): Promise<{
    patternRecomputation: boolean;
    storyAnalysis: boolean;
    evolutionUpdate: boolean;
}>;
/**
 * Get scheduler status
 */
export declare function getSchedulerStatus(): {
    isRunning: boolean;
    uptimeMs: number | null;
};
declare const _default: {
    startCollectiveLearningScheduler: typeof startCollectiveLearningScheduler;
    stopCollectiveLearningScheduler: typeof stopCollectiveLearningScheduler;
    forceRunAllJobs: typeof forceRunAllJobs;
    getSchedulerStatus: typeof getSchedulerStatus;
};
export default _default;
//# sourceMappingURL=scheduler.d.ts.map