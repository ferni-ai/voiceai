/**
 * A/B Testing Index
 *
 * Exports for A/B testing functionality
 */
export { abTesting, createTest, startTest, pauseTest, completeTest, cancelTest, getTest, getAllTests, getVariantForUser, recordConversion, calculateTestResults, getUserAssignments, getActiveTestsForTrigger, isUserInTest, clearOldTests, } from './ab-testing.js';
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
import { createTest, startTest } from './ab-testing.js';
/**
 * Create and start a message A/B test
 */
export function createMessageTest(config) {
    const variants = config.variants.map((v, i) => ({
        id: `variant-${i}`,
        name: v.name,
        messageTemplate: v.messageTemplate,
        tone: v.tone,
        weight: v.weight ?? 100 / config.variants.length,
    }));
    const test = createTest({
        name: config.name,
        description: config.description,
        type: 'message',
        variants,
        controlVariantId: 'variant-0',
        triggerTypes: config.triggerTypes,
        primaryMetric: 'response_rate',
        minimumSamplePerVariant: config.minimumSamplePerVariant ?? 100,
        significanceLevel: 0.95,
    });
    return test;
}
/**
 * Create and start a timing A/B test
 */
export function createTimingTest(config) {
    const variants = config.variants.map((v, i) => ({
        id: `variant-${i}`,
        name: v.name,
        sendTime: {
            hour: v.hour,
            dayOfWeek: v.dayOfWeek,
        },
        weight: v.weight ?? 100 / config.variants.length,
    }));
    const test = createTest({
        name: config.name,
        description: config.description,
        type: 'timing',
        variants,
        controlVariantId: 'variant-0',
        triggerTypes: config.triggerTypes,
        primaryMetric: 'response_rate',
        minimumSamplePerVariant: config.minimumSamplePerVariant ?? 100,
        significanceLevel: 0.95,
    });
    return test;
}
/**
 * Create and start a channel A/B test
 */
export function createChannelTest(config) {
    const variants = config.channels.map((c, i) => ({
        id: `variant-${i}`,
        name: `${c.channel} variant`,
        channel: c.channel,
        weight: c.weight ?? 100 / config.channels.length,
    }));
    const test = createTest({
        name: config.name,
        description: config.description,
        type: 'channel',
        variants,
        controlVariantId: 'variant-0',
        triggerTypes: config.triggerTypes,
        primaryMetric: 'response_rate',
        minimumSamplePerVariant: config.minimumSamplePerVariant ?? 100,
        significanceLevel: 0.95,
    });
    return test;
}
/**
 * Create and start a persona A/B test
 */
export function createPersonaTest(config) {
    const variants = config.personas.map((p, i) => ({
        id: `variant-${i}`,
        name: `${p.personaId} variant`,
        personaId: p.personaId,
        weight: p.weight ?? 100 / config.personas.length,
    }));
    const test = createTest({
        name: config.name,
        description: config.description,
        type: 'persona',
        variants,
        controlVariantId: 'variant-0',
        triggerTypes: config.triggerTypes,
        primaryMetric: 'response_rate',
        minimumSamplePerVariant: config.minimumSamplePerVariant ?? 100,
        significanceLevel: 0.95,
    });
    return test;
}
/**
 * Quick start a test after creation
 */
export function createAndStartTest(testFn) {
    const test = testFn();
    startTest(test.id);
    return test;
}
//# sourceMappingURL=index.js.map