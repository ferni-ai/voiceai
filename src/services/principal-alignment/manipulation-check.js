/**
 * Manipulation Self-Check
 *
 * > "If you're asking because you think you know where it should go, stop. That's manipulation dressed as curiosity."
 *
 * This system analyzes our own responses for potentially manipulative patterns.
 * A principal-aligned agent doesn't just avoid being manipulated—it avoids manipulating.
 *
 * Key insight: Sometimes "being helpful" is actually steering toward hidden agendas.
 *
 * @module @ferni/principal-alignment/manipulation-check
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'ManipulationCheck' });
// ============================================================================
// MANIPULATION PATTERNS
// ============================================================================
/**
 * Patterns that indicate leading questions
 */
const LEADING_QUESTION_PATTERNS = [
    // Questions with embedded assumptions
    {
        pattern: /don't you think (?:you|it|that)/i,
        description: 'Question with embedded assumption',
        severity: 0.7,
    },
    {
        pattern: /wouldn't (?:you|it) be better/i,
        description: 'Steering toward preferred answer',
        severity: 0.6,
    },
    {
        pattern: /isn't it (?:true|obvious|clear) that/i,
        description: 'Question assuming agreement',
        severity: 0.7,
    },
    {
        pattern: /you know what (?:you|I) think/i,
        description: 'Presupposing shared conclusion',
        severity: 0.5,
    },
    // Questions that imply the "right" answer
    {
        pattern: /have you (?:thought about|considered) (?:maybe|that|how)/i,
        description: 'Suggestion disguised as question',
        severity: 0.4,
    },
    {
        pattern: /what if you (?:just|tried|could)/i,
        description: 'Leading toward specific action',
        severity: 0.5,
    },
    {
        pattern: /(?:have|has) it occurred to you/i,
        description: 'Implying they should think differently',
        severity: 0.6,
    },
    // Questions that guilt or pressure
    {
        pattern: /how would (?:your|they|X) feel if/i,
        description: 'Guilt-inducing question',
        severity: 0.6,
    },
    {
        pattern: /what would (?:happen|X think) if/i,
        description: 'Consequence-implying question',
        severity: 0.5,
    },
];
/**
 * Patterns that indicate false validation
 */
const FALSE_VALIDATION_PATTERNS = [
    // Validating without basis
    {
        pattern: /(?:you're|that's) (?:absolutely|totally|completely) right/i,
        context: 'Excessive agreement',
        severity: 0.6,
    },
    {
        pattern: /I (?:totally|completely) (?:agree|understand)/i,
        context: 'Over-enthusiastic agreement',
        severity: 0.5,
    },
    // Empty validation
    {
        pattern: /(?:that's|it's) (?:totally|completely) (?:valid|understandable|normal)/i,
        context: 'Blanket validation',
        severity: 0.4,
    },
    {
        pattern: /anyone would (?:feel|think|do) that/i,
        context: 'Normalizing without assessment',
        severity: 0.5,
    },
    // Avoiding disagreement
    {
        pattern: /I see where you're coming from, but/i,
        context: 'Softening before disagreement (OK)',
        severity: 0.2,
    },
    { pattern: /well, (?:if you think|you might be)/i, context: 'Weak hedging', severity: 0.3 },
];
/**
 * Patterns that indicate emotional exploitation
 */
const EMOTIONAL_EXPLOITATION_PATTERNS = [
    // Using vulnerability
    {
        pattern: /I know (?:you're|this is) (?:hard|difficult|painful)/i,
        description: 'Acknowledging vulnerability',
        severity: 0.3,
    },
    {
        pattern: /since you (?:trust|opened up|shared)/i,
        description: 'Leveraging trust',
        severity: 0.7,
    },
    // Creating obligation
    {
        pattern: /I've been thinking about (?:you|our)/i,
        description: 'Creating sense of investment',
        severity: 0.4,
    },
    { pattern: /because I care about you/i, description: 'Using care as leverage', severity: 0.5 },
    // Timing exploitation
    {
        pattern: /now that you're (?:feeling|in a) (?:good|better)/i,
        description: 'Exploiting positive state',
        severity: 0.6,
    },
    {
        pattern: /while you're (?:feeling|thinking about)/i,
        description: 'Capitalizing on state',
        severity: 0.5,
    },
];
/**
 * Patterns that indicate truth avoidance
 */
const TRUTH_AVOIDANCE_PATTERNS = [
    // Softening too much
    {
        pattern: /(?:maybe|perhaps|possibly) (?:you could|you might|there's)/i,
        description: 'Excessive hedging',
        severity: 0.4,
    },
    {
        pattern: /I'm not sure, but/i,
        description: 'Unnecessary uncertainty (check context)',
        severity: 0.3,
    },
    // Avoiding the point
    {
        pattern: /(?:that's|it's) (?:one way to|an interesting way to) (?:look at|think about)/i,
        description: 'Deflecting from evaluation',
        severity: 0.5,
    },
    {
        pattern: /there are (?:many|different) (?:ways|perspectives)/i,
        description: 'False balance',
        severity: 0.4,
    },
    // Changing subject
    {
        pattern: /(?:anyway|but|let's talk about)/i,
        description: 'Potential topic change (check context)',
        severity: 0.3,
    },
];
/**
 * Patterns that indicate dependency creation
 */
const DEPENDENCY_CREATION_PATTERNS = [
    // Positioning as essential
    {
        pattern: /(?:you|we) should talk about this (?:more|again)/i,
        description: 'Creating need for future sessions',
        severity: 0.4,
    },
    {
        pattern: /(?:whenever|anytime) you need to talk/i,
        description: 'Offering availability (OK if appropriate)',
        severity: 0.2,
    },
    // Undermining confidence
    {
        pattern: /this is (?:complex|complicated|tricky)/i,
        description: 'Implying need for guidance',
        severity: 0.3,
    },
    {
        pattern: /(?:let me|let's) think through this together/i,
        description: 'Positioning as thinking partner',
        severity: 0.2,
    },
    // Creating reliance
    {
        pattern: /I'll (?:help you|be here to|guide you)/i,
        description: 'Offering ongoing support',
        severity: 0.3,
    },
    {
        pattern: /we can (?:work on|figure out) this together/i,
        description: 'Joint problem framing',
        severity: 0.2,
    },
];
/**
 * Patterns that indicate premature closure
 */
const PREMATURE_CLOSURE_PATTERNS = [
    // Rushing to resolution
    {
        pattern: /(?:so|okay),? (?:the|your) (?:plan|next step|action) (?:is|should be)/i,
        description: 'Jumping to action items',
        severity: 0.5,
    },
    {
        pattern: /(?:let's|we should) (?:wrap up|summarize|conclude)/i,
        description: 'Premature closing',
        severity: 0.4,
    },
    // Oversimplifying
    {
        pattern: /it's (?:really|actually|just) (?:simple|straightforward)/i,
        description: 'Oversimplifying complexity',
        severity: 0.5,
    },
    {
        pattern: /all you (?:need to|have to) do is/i,
        description: 'Reductive framing',
        severity: 0.6,
    },
    // Assuming resolution
    {
        pattern: /(?:glad|good) we (?:figured|worked) (?:this|that) out/i,
        description: 'Premature resolution claim',
        severity: 0.5,
    },
    {
        pattern: /(?:feel|feeling) better (?:about|now)/i,
        description: 'Assuming emotional resolution',
        severity: 0.4,
    },
];
// ============================================================================
// CORE ANALYSIS
// ============================================================================
/**
 * Check agent response for manipulation risks
 */
export function checkForManipulation(agentResponse, context = {}) {
    const risks = [];
    // Check leading questions
    for (const { pattern, description, severity } of LEADING_QUESTION_PATTERNS) {
        const match = agentResponse.match(pattern);
        if (match) {
            risks.push({
                type: 'leading_question',
                description,
                severity,
                element: match[0],
            });
        }
    }
    // Check false validation
    for (const { pattern, context: ctx, severity } of FALSE_VALIDATION_PATTERNS) {
        const match = agentResponse.match(pattern);
        if (match) {
            risks.push({
                type: 'false_validation',
                description: ctx,
                severity,
                element: match[0],
            });
        }
    }
    // Check emotional exploitation (higher severity if user is vulnerable)
    for (const { pattern, description, severity } of EMOTIONAL_EXPLOITATION_PATTERNS) {
        const match = agentResponse.match(pattern);
        if (match) {
            const adjustedSeverity = context.userVulnerable ? severity * 1.5 : severity;
            risks.push({
                type: 'emotional_exploitation',
                description,
                severity: Math.min(1, adjustedSeverity),
                element: match[0],
            });
        }
    }
    // Check truth avoidance
    for (const { pattern, description, severity } of TRUTH_AVOIDANCE_PATTERNS) {
        const match = agentResponse.match(pattern);
        if (match) {
            risks.push({
                type: 'truth_avoidance',
                description,
                severity,
                element: match[0],
            });
        }
    }
    // Check dependency creation
    for (const { pattern, description, severity } of DEPENDENCY_CREATION_PATTERNS) {
        const match = agentResponse.match(pattern);
        if (match) {
            risks.push({
                type: 'dependency_creation',
                description,
                severity,
                element: match[0],
            });
        }
    }
    // Check premature closure
    for (const { pattern, description, severity } of PREMATURE_CLOSURE_PATTERNS) {
        const match = agentResponse.match(pattern);
        if (match) {
            // Higher severity early in conversation
            const adjustedSeverity = context.turnCount && context.turnCount < 5 ? severity * 1.3 : severity;
            risks.push({
                type: 'premature_closure',
                description,
                severity: Math.min(1, adjustedSeverity),
                element: match[0],
            });
        }
    }
    // Find highest risk
    if (risks.length === 0) {
        return {
            hasRisk: false,
            riskType: null,
            confidence: 0,
            problematicElement: null,
            correction: null,
            flagForReview: false,
        };
    }
    // Sort by severity
    risks.sort((a, b) => b.severity - a.severity);
    const highestRisk = risks[0];
    // Determine if this should be flagged
    const flagForReview = highestRisk.severity >= 0.6 || risks.length >= 3;
    // Generate correction suggestion
    const correction = generateCorrection(highestRisk.type, highestRisk.element);
    log.debug({
        hasRisk: true,
        riskType: highestRisk.type,
        severity: highestRisk.severity,
        totalRisks: risks.length,
        flagForReview,
    }, 'Manipulation check completed');
    return {
        hasRisk: true,
        riskType: highestRisk.type,
        confidence: highestRisk.severity,
        problematicElement: highestRisk.element,
        correction,
        flagForReview,
    };
}
// ============================================================================
// HELPERS
// ============================================================================
function generateCorrection(type, element) {
    const corrections = {
        leading_question: 'Ask an open-ended question instead: "What do you think?" or "How are you feeling about this?"',
        false_validation: 'Be genuine: If you agree, say why. If you have concerns, express them gently.',
        emotional_exploitation: 'Let them feel without using it: "I hear that this is difficult" without leveraging it.',
        dependency_creation: 'Empower their independence: "What do you think you should do?" Trust their judgment.',
        truth_avoidance: 'Be direct with kindness: Share your honest perspective while respecting their autonomy.',
        agenda_steering: 'Follow their lead: Let the conversation go where they need it to go.',
        premature_closure: 'Stay with the complexity: "This is a lot to sit with. Take your time."',
    };
    return corrections[type];
}
// ============================================================================
// BATCH ANALYSIS
// ============================================================================
/**
 * Analyze multiple responses for patterns of manipulation
 */
export function analyzeConversationPatterns(responses) {
    const allRisks = [];
    let totalSeverity = 0;
    for (const response of responses) {
        const result = checkForManipulation(response);
        if (result.hasRisk && result.riskType) {
            allRisks.push(result.riskType);
            totalSeverity += result.confidence;
        }
    }
    const overallRisk = responses.length > 0 ? totalSeverity / responses.length : 0;
    // Find most common pattern
    const patternCounts = new Map();
    for (const risk of allRisks) {
        patternCounts.set(risk, (patternCounts.get(risk) || 0) + 1);
    }
    const patterns = [...new Set(allRisks)];
    // Generate recommendation
    let recommendation = 'No significant manipulation patterns detected.';
    if (overallRisk > 0.5) {
        recommendation = 'High manipulation risk detected. Review conversation for authenticity.';
    }
    else if (overallRisk > 0.3) {
        recommendation = 'Moderate manipulation risk. Consider being more direct and less leading.';
    }
    else if (patterns.length > 0) {
        recommendation = `Minor patterns detected: ${patterns.join(', ')}. Stay aware.`;
    }
    return {
        overallRisk,
        patterns,
        recommendation,
    };
}
// ============================================================================
// REAL-TIME GUARD
// ============================================================================
/**
 * Quick check for obvious manipulation before sending response
 */
export function quickManipulationGuard(response) {
    // High-severity patterns only
    const criticalPatterns = [
        { pattern: /don't you think you should/i, warning: 'Leading question detected' },
        { pattern: /you know I'm right/i, warning: 'Asserting correctness over user' },
        { pattern: /since you trust me/i, warning: 'Leveraging trust inappropriately' },
        { pattern: /all you have to do is/i, warning: "Oversimplifying user's situation" },
    ];
    for (const { pattern, warning } of criticalPatterns) {
        if (pattern.test(response)) {
            return { safe: false, warning };
        }
    }
    return { safe: true };
}
// ============================================================================
// EXPORTS
// ============================================================================
export { LEADING_QUESTION_PATTERNS, FALSE_VALIDATION_PATTERNS, EMOTIONAL_EXPLOITATION_PATTERNS, TRUTH_AVOIDANCE_PATTERNS, DEPENDENCY_CREATION_PATTERNS, PREMATURE_CLOSURE_PATTERNS, };
//# sourceMappingURL=manipulation-check.js.map