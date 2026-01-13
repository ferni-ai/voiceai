/**
 * Breath Group Pacing
 *
 * Natural pauses at phrase boundaries, mimicking human breath patterns.
 * Humans speak in "breath groups" - phrases produced on a single exhalation.
 * This module identifies natural phrase boundaries and adds appropriate pauses.
 *
 * @module advanced-humanization/breath-groups
 */
import { DEFAULT_BREATH_CONFIG } from './types.js';
// ============================================================================
// BREATH GROUP PAUSES
// ============================================================================
/**
 * Add natural breath group pauses to text
 *
 * Humans speak in "breath groups" - phrases produced on a single exhalation.
 * This function identifies natural phrase boundaries and adds appropriate pauses.
 *
 * @param text - The text to add breath group pauses to
 * @param config - Breath group configuration
 * @returns Text with SSML breaks added at natural pause points
 */
export function addBreathGroupPauses(text, config = DEFAULT_BREATH_CONFIG) {
    if (!config.enabled)
        return text;
    let result = text;
    // ═══════════════════════════════════════════════════════════════════════════
    // SENTENCE-LEVEL PAUSES (Long breath)
    // ═══════════════════════════════════════════════════════════════════════════
    // After sentence endings (period, exclamation, question)
    result = result.replace(/([.!?])\s+(?=[A-Z])/g, `$1 <break time="${config.longPause}ms"/> `);
    // ═══════════════════════════════════════════════════════════════════════════
    // CLAUSE-LEVEL PAUSES (Medium breath)
    // ═══════════════════════════════════════════════════════════════════════════
    // Before conjunctions (but, however, although, though)
    result = result.replace(/\s+(but|however|although|though)\s+/gi, ` <break time="${config.mediumPause}ms"/> $1 `);
    // After long introductory phrases (more than 4 words before comma)
    result = result.replace(/^(\w+\s+\w+\s+\w+\s+\w+[^,]*),\s+/gm, `$1, <break time="${config.mediumPause}ms"/> `);
    // Before "because", "since", "so that"
    result = result.replace(/\s+(because|since|so that)\s+/gi, ` <break time="${config.shortPause}ms"/> $1 `);
    // ═══════════════════════════════════════════════════════════════════════════
    // PHRASE-LEVEL PAUSES (Short breath)
    // ═══════════════════════════════════════════════════════════════════════════
    // After commas in lists (if followed by "and" or "or")
    result = result.replace(/,\s+(and|or)\s+/gi, `, <break time="${config.shortPause}ms"/> $1 `);
    // Before parenthetical remarks
    result = result.replace(/\s+—\s+/g, ` <break time="${config.shortPause}ms"/> — `);
    // After time markers
    result = result.replace(/(right now|at this point|for now|currently),?\s+/gi, `$1 <break time="${config.shortPause}ms"/> `);
    // ═══════════════════════════════════════════════════════════════════════════
    // EMPHASIS PAUSES
    // ═══════════════════════════════════════════════════════════════════════════
    // Before important words/phrases
    result = result.replace(/\b(really|truly|actually|honestly|importantly)\s+/gi, `<break time="${config.shortPause}ms"/> $1 `);
    // Clean up double breaks
    result = result.replace(/(<break time="\d+ms"\/>\s*){2,}/g, (match) => {
        // Keep the longest pause
        const pauses = match.match(/\d+/g) || [];
        const maxPause = Math.max(...pauses.map(Number));
        return `<break time="${maxPause}ms"/> `;
    });
    // Clean up excessive whitespace
    result = result.replace(/\s{2,}/g, ' ');
    return result;
}
//# sourceMappingURL=breath-groups.js.map