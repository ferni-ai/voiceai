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
import { getLogger } from '../../../utils/safe-logger.js';
import crypto from 'crypto';
const log = getLogger().child({ module: 'ab-testing' });
// ============================================================================
// STATE
// ============================================================================
const tests = new Map();
const assignments = new Map(); // userId -> assignments
const variantResults = new Map(); // testId -> variantId -> result
// ============================================================================
// TEST MANAGEMENT
// ============================================================================
/**
 * Create a new A/B test
 */
export function createTest(config) {
    const id = `test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    // Validate variants have valid weights
    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
        throw new Error(`Variant weights must sum to 100, got ${totalWeight}`);
    }
    const test = {
        ...config,
        id,
        status: 'draft',
        createdAt: new Date(),
    };
    tests.set(id, test);
    // Initialize results tracking
    const resultMap = new Map();
    for (const variant of config.variants) {
        resultMap.set(variant.id, {
            variantId: variant.id,
            participants: 0,
            conversions: 0,
            conversionRate: 0,
        });
    }
    variantResults.set(id, resultMap);
    log.info({ testId: id, name: config.name, type: config.type }, 'Created A/B test');
    return test;
}
/**
 * Start a test
 */
export function startTest(testId) {
    const test = tests.get(testId);
    if (!test) {
        log.warn({ testId }, 'Test not found');
        return false;
    }
    if (test.status !== 'draft' && test.status !== 'paused') {
        log.warn({ testId, status: test.status }, 'Test cannot be started');
        return false;
    }
    test.status = 'running';
    test.startedAt = test.startedAt || new Date();
    tests.set(testId, test);
    log.info({ testId, name: test.name }, '▶️ Started A/B test');
    return true;
}
/**
 * Pause a test
 */
export function pauseTest(testId) {
    const test = tests.get(testId);
    if (!test)
        return false;
    if (test.status !== 'running') {
        log.warn({ testId, status: test.status }, 'Test cannot be paused');
        return false;
    }
    test.status = 'paused';
    test.pausedAt = new Date();
    tests.set(testId, test);
    log.info({ testId, name: test.name }, '⏸️ Paused A/B test');
    return true;
}
/**
 * Complete a test and determine winner
 */
export function completeTest(testId) {
    const test = tests.get(testId);
    if (!test)
        return null;
    test.status = 'completed';
    test.completedAt = new Date();
    // Calculate final results
    const results = calculateTestResults(testId);
    test.results = results;
    tests.set(testId, test);
    log.info({
        testId,
        name: test.name,
        winningVariant: results.winningVariantId,
        isSignificant: results.isSignificant,
    }, '✅ Completed A/B test');
    return results;
}
/**
 * Cancel a test
 */
export function cancelTest(testId) {
    const test = tests.get(testId);
    if (!test)
        return false;
    test.status = 'cancelled';
    tests.set(testId, test);
    log.info({ testId, name: test.name }, '❌ Cancelled A/B test');
    return true;
}
/**
 * Get test by ID
 */
export function getTest(testId) {
    return tests.get(testId);
}
/**
 * Get all tests
 */
export function getAllTests(status) {
    let allTests = Array.from(tests.values());
    if (status) {
        allTests = allTests.filter((t) => t.status === status);
    }
    return allTests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
// ============================================================================
// VARIANT ASSIGNMENT
// ============================================================================
/**
 * Get variant assignment for a user
 * Uses consistent hashing so same user always gets same variant
 */
export function getVariantForUser(testId, userId) {
    const test = tests.get(testId);
    if (!test || test.status !== 'running') {
        return null;
    }
    // Check if user already assigned
    const userAssignments = assignments.get(userId) || [];
    const existingAssignment = userAssignments.find((a) => a.testId === testId);
    if (existingAssignment) {
        return test.variants.find((v) => v.id === existingAssignment.variantId) || null;
    }
    // Check sample size limit
    if (test.sampleSize) {
        const totalParticipants = getTotalParticipants(testId);
        if (totalParticipants >= test.sampleSize) {
            return null; // Test is full
        }
    }
    // Assign to variant using consistent hashing
    const hash = consistentHash(`${testId}:${userId}`);
    const variant = selectVariantByWeight(test.variants, hash);
    // Record assignment
    const assignment = {
        testId,
        variantId: variant.id,
        userId,
        assignedAt: new Date(),
        converted: false,
    };
    userAssignments.push(assignment);
    assignments.set(userId, userAssignments);
    // Update participant count
    const results = variantResults.get(testId);
    if (results) {
        const variantResult = results.get(variant.id);
        if (variantResult) {
            variantResult.participants++;
            results.set(variant.id, variantResult);
        }
    }
    log.debug({ testId, userId, variantId: variant.id }, 'Assigned user to variant');
    return variant;
}
/**
 * Consistent hash function for deterministic assignment
 */
function consistentHash(input) {
    const hash = crypto.createHash('md5').update(input).digest('hex');
    return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}
/**
 * Select variant based on weight distribution
 */
function selectVariantByWeight(variants, hash) {
    let cumulative = 0;
    const target = hash * 100;
    for (const variant of variants) {
        cumulative += variant.weight;
        if (target <= cumulative) {
            return variant;
        }
    }
    return variants[variants.length - 1];
}
/**
 * Get total participants in a test
 */
function getTotalParticipants(testId) {
    const results = variantResults.get(testId);
    if (!results)
        return 0;
    let total = 0;
    for (const result of results.values()) {
        total += result.participants;
    }
    return total;
}
// ============================================================================
// CONVERSION TRACKING
// ============================================================================
/**
 * Record a conversion (user responded, clicked, etc.)
 */
export function recordConversion(testId, userId, metadata) {
    const userAssignments = assignments.get(userId);
    if (!userAssignments)
        return false;
    const assignment = userAssignments.find((a) => a.testId === testId);
    if (!assignment || assignment.converted)
        return false;
    // Mark as converted
    assignment.converted = true;
    assignment.conversionAt = new Date();
    assignments.set(userId, userAssignments);
    // Update variant results
    const results = variantResults.get(testId);
    if (results) {
        const variantResult = results.get(assignment.variantId);
        if (variantResult) {
            variantResult.conversions++;
            variantResult.conversionRate =
                variantResult.participants > 0 ? variantResult.conversions / variantResult.participants : 0;
            results.set(assignment.variantId, variantResult);
        }
    }
    log.debug({ testId, userId, variantId: assignment.variantId }, 'Recorded conversion');
    // Check if test should auto-complete
    checkAutoComplete(testId);
    return true;
}
/**
 * Check if test should auto-complete based on sample size
 */
function checkAutoComplete(testId) {
    const test = tests.get(testId);
    if (!test || test.status !== 'running')
        return;
    const results = variantResults.get(testId);
    if (!results)
        return;
    // Check if all variants have minimum sample
    let allHaveMinimum = true;
    for (const result of results.values()) {
        if (result.participants < test.minimumSamplePerVariant) {
            allHaveMinimum = false;
            break;
        }
    }
    if (allHaveMinimum) {
        const testResults = calculateTestResults(testId);
        if (testResults.isSignificant) {
            log.info({ testId }, 'Test reached significance, auto-completing');
            completeTest(testId);
        }
    }
}
// ============================================================================
// STATISTICAL ANALYSIS
// ============================================================================
/**
 * Calculate test results with statistical significance
 */
export function calculateTestResults(testId) {
    const test = tests.get(testId);
    const results = variantResults.get(testId);
    if (!test || !results) {
        return {
            variantResults: [],
            isSignificant: false,
            summary: 'Test not found',
        };
    }
    const variantResultsArray = Array.from(results.values());
    // Find best performing variant
    let bestVariant = null;
    let bestRate = -1;
    for (const result of variantResultsArray) {
        if (result.conversionRate > bestRate) {
            bestRate = result.conversionRate;
            bestVariant = result;
        }
    }
    // Calculate statistical significance
    const { isSignificant, confidence } = calculateSignificance(variantResultsArray, test.controlVariantId, test.significanceLevel);
    // Generate summary
    let summary = '';
    if (!bestVariant) {
        summary = 'No results yet';
    }
    else if (!isSignificant) {
        summary = `Not enough data for statistical significance. Best so far: ${bestVariant.variantId} (${(bestVariant.conversionRate * 100).toFixed(1)}%)`;
    }
    else {
        const improvement = calculateImprovement(variantResultsArray, test.controlVariantId, bestVariant.variantId);
        summary = `Winner: ${bestVariant.variantId} with ${(bestVariant.conversionRate * 100).toFixed(1)}% conversion rate. ${improvement}% improvement over control with ${(confidence * 100).toFixed(1)}% confidence.`;
    }
    return {
        variantResults: variantResultsArray,
        winningVariantId: isSignificant ? bestVariant?.variantId : undefined,
        confidenceLevel: confidence,
        isSignificant,
        summary,
    };
}
/**
 * Calculate statistical significance using chi-squared test
 */
function calculateSignificance(results, controlId, requiredConfidence) {
    const control = results.find((r) => r.variantId === controlId);
    if (!control || control.participants < 30) {
        return { isSignificant: false };
    }
    // Find the best non-control variant
    let bestTreatment = null;
    for (const result of results) {
        if (result.variantId !== controlId && result.participants >= 30) {
            if (!bestTreatment || result.conversionRate > bestTreatment.conversionRate) {
                bestTreatment = result;
            }
        }
    }
    if (!bestTreatment) {
        return { isSignificant: false };
    }
    // Two-proportion z-test
    const p1 = control.conversionRate;
    const p2 = bestTreatment.conversionRate;
    const n1 = control.participants;
    const n2 = bestTreatment.participants;
    if (n1 === 0 || n2 === 0) {
        return { isSignificant: false };
    }
    const pooledP = (control.conversions + bestTreatment.conversions) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
    if (se === 0) {
        return { isSignificant: false };
    }
    const zScore = (p2 - p1) / se;
    // Convert z-score to confidence (using normal CDF approximation)
    const confidence = normalCDF(zScore);
    return {
        isSignificant: confidence >= requiredConfidence,
        confidence,
    };
}
/**
 * Normal CDF approximation
 */
function normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
}
/**
 * Calculate improvement percentage
 */
function calculateImprovement(results, controlId, winnerId) {
    const control = results.find((r) => r.variantId === controlId);
    const winner = results.find((r) => r.variantId === winnerId);
    if (!control || !winner || control.conversionRate === 0) {
        return 0;
    }
    return Math.round(((winner.conversionRate - control.conversionRate) / control.conversionRate) * 100);
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Get user's test assignments
 */
export function getUserAssignments(userId) {
    return assignments.get(userId) || [];
}
/**
 * Get active tests for a trigger type
 */
export function getActiveTestsForTrigger(triggerType) {
    return Array.from(tests.values()).filter((t) => t.status === 'running' && (!t.triggerTypes || t.triggerTypes.includes(triggerType)));
}
/**
 * Check if user is in any active test
 */
export function isUserInTest(userId, testId) {
    const userAssignments = assignments.get(userId);
    return userAssignments?.some((a) => a.testId === testId) || false;
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Clear old completed tests
 */
export function clearOldTests(maxAgeDays = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    let cleared = 0;
    for (const [id, test] of tests) {
        if ((test.status === 'completed' || test.status === 'cancelled') &&
            test.completedAt &&
            test.completedAt < cutoff) {
            tests.delete(id);
            variantResults.delete(id);
            cleared++;
        }
    }
    if (cleared > 0) {
        log.info({ cleared }, 'Cleared old A/B tests');
    }
    return cleared;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const abTesting = {
    createTest,
    startTest,
    pauseTest,
    completeTest,
    cancelTest,
    getTest,
    getAllTests,
    getVariantForUser,
    recordConversion,
    calculateTestResults,
    getUserAssignments,
    getActiveTestsForTrigger,
    isUserInTest,
    clearOldTests,
};
//# sourceMappingURL=ab-testing.js.map