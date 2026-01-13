/**
 * Superhuman Communication Tools - Better Than Human
 *
 * 10 communication capabilities that exceed what any human friend can provide.
 *
 * These tools give Alex superhuman abilities:
 *
 * 1. Communication Archaeology - Perfect recall of past conversations
 * 2. Relationship Temperature - Track gradual drift in relationships
 * 3. Unsaid Words Detector - Notice what they DON'T say
 * 4. Reception Predictor - Predict how messages will land
 * 5. Apology Effectiveness - Learn what works per person
 * 6. Conflict Replay - Objective conflict analysis
 * 7. Communication Debt - Track all obligations
 * 8. Third-Party Perspective - Truly neutral viewpoints
 * 9. Strategic Silence - Know when NOT to communicate
 * 10. Unspoken Needs - Surface underlying needs
 *
 * @module tools/domains/communication/superhuman-tools
 */
import { createLogger } from '../../../../utils/safe-logger.js';
// Re-export all tools
export { communicationArchaeology } from './communication-archaeology.js';
export { relationshipTemperature } from './relationship-temperature.js';
export { unsaidWordsDetector } from './unsaid-words-detector.js';
export { receptionPredictor } from './reception-predictor.js';
export { apologyEffectiveness } from './apology-effectiveness.js';
export { conflictReplay } from './conflict-replay.js';
export { communicationDebt } from './communication-debt.js';
export { thirdPartyPerspective } from './third-party-perspective.js';
export { strategicSilence } from './strategic-silence.js';
export { unspokenNeeds } from './unspoken-needs.js';
// Re-export LLM tools for domain registration
export { createSuperhumanCommunicationTools, getToolDefinitions, domain as llmToolsDomain, definitions as llmToolsDefinitions, } from './llm-tools.js';
// Import context builders
import { buildGeneralArchaeologyContext } from './communication-archaeology.js';
import { buildTemperatureContext } from './relationship-temperature.js';
import { buildUnsaidWordsContext } from './unsaid-words-detector.js';
import { buildReceptionPredictorContext } from './reception-predictor.js';
import { buildApologyContext } from './apology-effectiveness.js';
import { buildConflictContext } from './conflict-replay.js';
import { buildDebtContext } from './communication-debt.js';
import { buildPerspectiveContext } from './third-party-perspective.js';
import { buildSilenceContext } from './strategic-silence.js';
import { buildNeedsContext } from './unspoken-needs.js';
const log = createLogger({ module: 'superhuman-communication' });
// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================
/**
 * Build unified superhuman communication context for Alex.
 *
 * This combines all 10 capabilities into a single context string
 * for LLM injection.
 */
export async function buildSuperhumanCommunicationContext(userId, options) {
    const { includeAll = false, contactName, maxLength = 3000 } = options || {};
    const sections = [];
    try {
        // Always include these core capabilities
        const [temperatureCtx, debtCtx, archaeologyCtx] = await Promise.all([
            buildTemperatureContext(userId),
            buildDebtContext(userId),
            buildGeneralArchaeologyContext(userId),
        ]);
        if (temperatureCtx)
            sections.push(temperatureCtx);
        if (debtCtx)
            sections.push(debtCtx);
        if (archaeologyCtx)
            sections.push(archaeologyCtx);
        // Add contextual capabilities based on what's relevant
        if (includeAll) {
            const [unsaidCtx, silenceCtx, needsCtx, conflictCtx, apologyCtx] = await Promise.all([
                buildUnsaidWordsContext(userId),
                buildSilenceContext(userId),
                buildNeedsContext(userId),
                buildConflictContext(userId),
                buildApologyContext(userId),
            ]);
            if (unsaidCtx)
                sections.push(unsaidCtx);
            if (silenceCtx)
                sections.push(silenceCtx);
            if (needsCtx)
                sections.push(needsCtx);
            if (conflictCtx)
                sections.push(conflictCtx);
            if (apologyCtx)
                sections.push(apologyCtx);
            // Static context builders
            sections.push(buildReceptionPredictorContext());
            sections.push(buildPerspectiveContext());
        }
        // Add contact-specific context if requested
        if (contactName) {
            const { buildArchaeologyContext } = await import('./communication-archaeology.js');
            const { buildContactTemperatureContext } = await import('./relationship-temperature.js');
            const { analyzeApologyEffectiveness } = await import('./apology-effectiveness.js');
            const { analyzeConflictPatterns } = await import('./conflict-replay.js');
            const [archCtx, tempCtx, apologyProfile, conflictPatterns] = await Promise.all([
                buildArchaeologyContext(userId, contactName),
                buildContactTemperatureContext(userId, contactName),
                analyzeApologyEffectiveness(userId, contactName),
                analyzeConflictPatterns(userId, contactName),
            ]);
            if (archCtx)
                sections.push(archCtx);
            if (tempCtx)
                sections.push(tempCtx);
            if (apologyProfile) {
                sections.push(`[APOLOGY PATTERNS - ${contactName}]\n` +
                    `Best approach: ${apologyProfile.bestApproach}\n` +
                    (apologyProfile.insights.length > 0 ? `Insight: ${apologyProfile.insights[0]}` : ''));
            }
            if (conflictPatterns) {
                sections.push(`[CONFLICT PATTERNS - ${contactName}]\n` +
                    `Resolution rate: ${Math.round(conflictPatterns.resolutionRate * 100)}%\n` +
                    (conflictPatterns.recommendations.length > 0
                        ? `Recommendation: ${conflictPatterns.recommendations[0]}`
                        : ''));
            }
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to build some superhuman communication context');
    }
    // Combine and truncate if needed
    let combined = sections.join('\n\n');
    if (combined.length > maxLength) {
        combined = combined.slice(0, maxLength - 50) + '\n\n[Context truncated for length]';
    }
    return combined;
}
/**
 * Build quick superhuman context (lightweight, for every turn).
 */
export async function buildQuickCommunicationContext(userId) {
    try {
        // Only the most actionable capabilities
        const [temperatureCtx, debtCtx] = await Promise.all([
            buildTemperatureContext(userId),
            buildDebtContext(userId),
        ]);
        const sections = [];
        if (temperatureCtx)
            sections.push(temperatureCtx);
        if (debtCtx)
            sections.push(debtCtx);
        return sections.join('\n\n');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to build quick communication context');
        return '';
    }
}
// ============================================================================
// CAPABILITY SUMMARY
// ============================================================================
/**
 * Get a summary of what superhuman communication capabilities are available.
 */
export function getSuperhumanCapabilitiesSummary() {
    return `## 🦸 Alex's Superhuman Communication Capabilities

### What No Human Friend Can Do:

1. **Communication Archaeology** 🏛️
   Perfect recall of every conversation you've mentioned.
   "Last time you talked to your dad about money..."

2. **Relationship Temperature Monitor** 🌡️
   Track gradual drift before you notice it.
   "Your exchanges with Sarah have shifted from warm to transactional..."

3. **Unsaid Words Detector** 🔇
   Notice what you DON'T say.
   "You mention work stress but always change the subject about your manager..."

4. **Reception Predictor** 🎯
   Know how messages will land.
   "This phrase might trigger defensiveness. Try..."

5. **Apology Effectiveness Memory** 💔→❤️
   Learn what apologies work for each person.
   "With Lisa, action-focused apologies work better..."

6. **Conflict Replay Analysis** 🔄
   Objectively analyze your conflicts.
   "When you said 'You always do this,' that's when things shifted..."

7. **Communication Debt Dashboard** 📊
   Track all your communication obligations.
   "🔴 Dad (4 weeks), 🟡 College roommate (2 weeks)..."

8. **Third-Party Perspective Generator** 👥
   Truly neutral viewpoints.
   "A neutral observer might see two people who both feel unheard..."

9. **Strategic Silence Coach** 🤫
   Know when NOT to communicate.
   "Your quick responses to your ex backfire 75% of the time..."

10. **Unspoken Needs Translator** 💭
    Surface what you actually need.
    "When you say 'She never calls,' I hear a need to feel valued..."`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const superhumanCommunication = {
    buildContext: buildSuperhumanCommunicationContext,
    buildQuickContext: buildQuickCommunicationContext,
    getCapabilitiesSummary: getSuperhumanCapabilitiesSummary,
};
export default superhumanCommunication;
//# sourceMappingURL=index.js.map