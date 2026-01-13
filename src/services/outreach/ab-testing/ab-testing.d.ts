/**
 * A/B Testing Framework for Outreach
 *
 * Test different approaches to optimize outreach effectiveness:
 * - Message variants (wording, tone, length)
 * - Timing variants (time of day, day of week)
 * - Channel variants (SMS vs email vs call)
 * - Persona variants (which agent reaches out)
 *
 * Uses statistical significance testing to determine winners.
 */
export type TestType = 'message' | 'timing' | 'channel' | 'persona';
export type TestStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
export interface ABTestVariant {
    id: string;
    name: string;
    description?: string;
    weight: number;
    messageTemplate?: string;
    tone?: string;
    sendTime?: {
        hour: number;
        minute?: number;
        dayOfWeek?: number[];
    };
    channel?: 'sms' | 'email' | 'call' | 'push';
    personaId?: string;
}
export interface ABTest {
    id: string;
    name: string;
    description?: string;
    type: TestType;
    status: TestStatus;
    variants: ABTestVariant[];
    controlVariantId: string;
    triggerTypes?: string[];
    userSegment?: 'all' | 'new' | 'established' | 'deep';
    sampleSize?: number;
    createdAt: Date;
    startedAt?: Date;
    pausedAt?: Date;
    completedAt?: Date;
    scheduledEndDate?: Date;
    primaryMetric: 'response_rate' | 'click_rate' | 'open_rate' | 'conversion';
    minimumSamplePerVariant: number;
    significanceLevel: number;
    results?: ABTestResults;
}
export interface ABTestResults {
    variantResults: VariantResult[];
    winningVariantId?: string;
    confidenceLevel?: number;
    isSignificant: boolean;
    completedAt?: Date;
    summary: string;
}
export interface VariantResult {
    variantId: string;
    participants: number;
    conversions: number;
    conversionRate: number;
    confidence?: number;
}
export interface TestAssignment {
    testId: string;
    variantId: string;
    userId: string;
    assignedAt: Date;
    converted: boolean;
    conversionAt?: Date;
}
/**
 * Create a new A/B test
 */
export declare function createTest(config: Omit<ABTest, 'id' | 'createdAt' | 'status'>): ABTest;
/**
 * Start a test
 */
export declare function startTest(testId: string): boolean;
/**
 * Pause a test
 */
export declare function pauseTest(testId: string): boolean;
/**
 * Complete a test and determine winner
 */
export declare function completeTest(testId: string): ABTestResults | null;
/**
 * Cancel a test
 */
export declare function cancelTest(testId: string): boolean;
/**
 * Get test by ID
 */
export declare function getTest(testId: string): ABTest | undefined;
/**
 * Get all tests
 */
export declare function getAllTests(status?: TestStatus): ABTest[];
/**
 * Get variant assignment for a user
 * Uses consistent hashing so same user always gets same variant
 */
export declare function getVariantForUser(testId: string, userId: string): ABTestVariant | null;
/**
 * Record a conversion (user responded, clicked, etc.)
 */
export declare function recordConversion(testId: string, userId: string, metadata?: {
    responseTimeMs?: number;
    channel?: string;
}): boolean;
/**
 * Calculate test results with statistical significance
 */
export declare function calculateTestResults(testId: string): ABTestResults;
/**
 * Get user's test assignments
 */
export declare function getUserAssignments(userId: string): TestAssignment[];
/**
 * Get active tests for a trigger type
 */
export declare function getActiveTestsForTrigger(triggerType: string): ABTest[];
/**
 * Check if user is in any active test
 */
export declare function isUserInTest(userId: string, testId: string): boolean;
/**
 * Clear old completed tests
 */
export declare function clearOldTests(maxAgeDays?: number): number;
export declare const abTesting: {
    createTest: typeof createTest;
    startTest: typeof startTest;
    pauseTest: typeof pauseTest;
    completeTest: typeof completeTest;
    cancelTest: typeof cancelTest;
    getTest: typeof getTest;
    getAllTests: typeof getAllTests;
    getVariantForUser: typeof getVariantForUser;
    recordConversion: typeof recordConversion;
    calculateTestResults: typeof calculateTestResults;
    getUserAssignments: typeof getUserAssignments;
    getActiveTestsForTrigger: typeof getActiveTestsForTrigger;
    isUserInTest: typeof isUserInTest;
    clearOldTests: typeof clearOldTests;
};
//# sourceMappingURL=ab-testing.d.ts.map