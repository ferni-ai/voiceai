/**
 * Comfort Pattern Application
 *
 * Apply what helps when stress is detected.
 *
 * @module superhuman-memory/comfort-patterns
 */
/**
 * Determine comfort guidance based on detected emotional state
 */
export function getComfortGuidance(humanMemory, detectedEmotion, detectedStressLevel // 0-1
) {
    const result = {
        stressLevel: 'none',
        supportType: null,
        promptInjection: null,
        avoid: [],
    };
    // Determine stress level
    if (detectedStressLevel >= 0.7) {
        result.stressLevel = 'high';
    }
    else if (detectedStressLevel >= 0.4) {
        result.stressLevel = 'moderate';
    }
    else if (detectedStressLevel >= 0.2) {
        result.stressLevel = 'mild';
    }
    // No comfort patterns or low stress? Return early
    if (!humanMemory?.emotionalSignature?.comfortPatterns?.length || result.stressLevel === 'none') {
        return result;
    }
    // Find the best comfort pattern for this situation
    const patterns = humanMemory.emotionalSignature.comfortPatterns;
    // Try to match by detected emotion or stress trigger
    let bestPattern = null;
    // First, check if we have a stress trigger match
    if (humanMemory.emotionalSignature.stressTriggers?.length) {
        for (const trigger of humanMemory.emotionalSignature.stressTriggers) {
            // Find a comfort pattern that works for this trigger
            const matchingPattern = patterns.find((p) => p.effectiveFor.toLowerCase().includes(trigger.category.toLowerCase()) ||
                trigger.trigger.toLowerCase().includes(p.effectiveFor.toLowerCase()));
            if (matchingPattern) {
                bestPattern = matchingPattern;
                break;
            }
        }
    }
    // If no trigger match, use the first general pattern
    if (!bestPattern && patterns.length > 0) {
        bestPattern = patterns[0];
    }
    if (bestPattern) {
        result.supportType = bestPattern.type;
        result.promptInjection = generateComfortPromptInjection(bestPattern, result.stressLevel);
    }
    // Add things to avoid based on stress triggers
    if (humanMemory.emotionalSignature.stressTriggers) {
        for (const trigger of humanMemory.emotionalSignature.stressTriggers) {
            if (trigger.unhelpfulResponses) {
                result.avoid.push(...trigger.unhelpfulResponses);
            }
        }
    }
    return result;
}
/**
 * Generate prompt injection for comfort pattern
 */
function generateComfortPromptInjection(pattern, stressLevel) {
    const lines = ['[COMFORT GUIDANCE - Apply based on user state]'];
    switch (pattern.type) {
        case 'validation':
            lines.push('- Lead with validation before any advice');
            lines.push('- Acknowledge their feelings explicitly');
            lines.push('- Use phrases like "That makes sense" or "Of course you feel that way"');
            break;
        case 'problem_solving':
            lines.push('- User prefers actionable solutions');
            lines.push('- After brief acknowledgment, move to "What can we do about this?"');
            lines.push('- Be practical and concrete');
            break;
        case 'distraction':
            lines.push('- Consider lightening the mood or changing topic');
            lines.push('- They may not want to dwell - follow their lead if they shift');
            break;
        case 'presence':
            lines.push('- Less advice, more listening');
            lines.push('- Short, supportive responses');
            lines.push('- Let them lead the conversation');
            break;
        case 'encouragement':
            lines.push('- Remind them of their strengths');
            lines.push("- Reference past times they've overcome challenges");
            lines.push('- Express confidence in them');
            break;
        case 'perspective':
            lines.push('- Help them see the bigger picture');
            lines.push('- Gentle reframing without dismissing feelings');
            break;
        case 'humor':
            lines.push('- Light humor may help (they appreciate it when stressed)');
            lines.push('- Keep it gentle and warm');
            break;
        case 'practical_help':
            lines.push('- Offer concrete assistance');
            lines.push('- Ask "What would be most helpful right now?"');
            break;
        case 'space':
            lines.push("- They may need processing time - don't push");
            lines.push('- Keep responses brief');
            lines.push("- Let them know you're here when they're ready");
            break;
    }
    if (stressLevel === 'high') {
        lines.push('- This seems significant - prioritize support over other goals');
    }
    return lines.join('\n');
}
//# sourceMappingURL=comfort-patterns.js.map