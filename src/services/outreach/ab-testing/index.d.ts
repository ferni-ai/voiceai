/**
 * A/B Testing Index
 *
 * Exports for A/B testing functionality
 */
export { abTesting, createTest, startTest, pauseTest, completeTest, cancelTest, getTest, getAllTests, getVariantForUser, recordConversion, calculateTestResults, getUserAssignments, getActiveTestsForTrigger, isUserInTest, clearOldTests, type TestType, type TestStatus, type ABTestVariant, type ABTest, type ABTestResults, type VariantResult, type TestAssignment, } from './ab-testing.js';
import { type ABTest } from './ab-testing.js';
/**
 * Create and start a message A/B test
 */
export declare function createMessageTest(config: {
    name: string;
    description?: string;
    variants: Array<{
        name: string;
        messageTemplate: string;
        tone?: string;
        weight?: number;
    }>;
    triggerTypes?: string[];
    minimumSamplePerVariant?: number;
}): ABTest;
/**
 * Create and start a timing A/B test
 */
export declare function createTimingTest(config: {
    name: string;
    description?: string;
    variants: Array<{
        name: string;
        hour: number;
        dayOfWeek?: number[];
        weight?: number;
    }>;
    triggerTypes?: string[];
    minimumSamplePerVariant?: number;
}): ABTest;
/**
 * Create and start a channel A/B test
 */
export declare function createChannelTest(config: {
    name: string;
    description?: string;
    channels: Array<{
        channel: 'sms' | 'email' | 'call' | 'push';
        weight?: number;
    }>;
    triggerTypes?: string[];
    minimumSamplePerVariant?: number;
}): ABTest;
/**
 * Create and start a persona A/B test
 */
export declare function createPersonaTest(config: {
    name: string;
    description?: string;
    personas: Array<{
        personaId: string;
        weight?: number;
    }>;
    triggerTypes?: string[];
    minimumSamplePerVariant?: number;
}): ABTest;
/**
 * Quick start a test after creation
 */
export declare function createAndStartTest(testFn: () => ABTest): ABTest;
//# sourceMappingURL=index.d.ts.map