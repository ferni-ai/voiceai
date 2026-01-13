/**
 * Agent Transparency System
 *
 * > "A principal-aligned agent is honest about its own uncertainty and limitations."
 *
 * This system helps agents be appropriately transparent about:
 * - Uncertainty in their assessments
 * - Limitations of their capabilities
 * - Potential biases in their responses
 * - When they're learning from the interaction
 *
 * Key insight: Over-confidence is a form of manipulation.
 *
 * @module @ferni/principal-alignment/agent-transparency
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'AgentTransparency' });
// ============================================================================
// TOPIC DOMAINS AND CONFIDENCE
// ============================================================================
/**
 * Topics where we should express more uncertainty
 */
const LOW_CONFIDENCE_DOMAINS = [
    'medical',
    'legal',
    'financial_specific',
    'technical_specialized',
    'relationship_advice_complex',
    'career_specific',
    'cultural_unfamiliar',
];
/**
 * Topics where we have reasonable expertise
 */
const HIGH_CONFIDENCE_DOMAINS = [
    'emotional_support',
    'active_listening',
    'general_coaching',
    'habit_building',
    'reflection_facilitation',
    'values_exploration',
];
/**
 * Patterns indicating medical/legal/financial topics
 */
const DOMAIN_PATTERNS = {
    medical: [
        /(?:medication|prescription|dosage|symptoms|diagnosis|treatment)/i,
        /(?:doctor said|test results|blood|pain|surgery)/i,
        /(?:mental health|depression|anxiety|bipolar|schizophrenia)/i,
    ],
    legal: [
        /(?:lawsuit|court|lawyer|attorney|legal|sue|custody)/i,
        /(?:contract|rights|liability|settlement)/i,
    ],
    financial_specific: [
        /(?:tax|irs|audit|deduction|401k|ira|estate)/i,
        /(?:investment|portfolio|stock|bond|crypto) (?:advice|strategy|recommendation)/i,
        /(?:bankruptcy|debt consolidation|mortgage|refinance)/i,
    ],
    technical_specialized: [
        /(?:diagnose|repair|fix|install|configure) (?:my|the|a)/i,
        /(?:code|programming|algorithm|database|server)/i,
    ],
};
// ============================================================================
// UNCERTAINTY EXPRESSIONS
// ============================================================================
const UNCERTAINTY_EXPRESSIONS = {
    high_uncertainty: [
        "I'm not sure about this, and I think you'd benefit from expert input.",
        'This is outside my expertise. I can share some thoughts, but please verify with a professional.',
        "I want to be honest—I'm uncertain here. What I can offer is limited.",
    ],
    moderate_uncertainty: [
        'I think this is right, but I could be wrong.',
        "My sense is... though I'd encourage you to consider other perspectives too.",
        'Based on what I know, this seems true—but take it with appropriate skepticism.',
    ],
    appropriate_confidence: [
        "From what you've shared, it seems like...",
        "I'm fairly confident that...",
        'This feels clear to me, though you know your situation best.',
    ],
};
const LIMITATION_EXPRESSIONS = {
    scope: [
        'This is beyond what I can really help with. What I can do is...',
        "I'm not the right support for this specific question. But I can...",
        "My expertise doesn't extend to this. Have you considered talking to...?",
    ],
    context: [
        "I don't have enough context to give you a good answer here.",
        "There's probably important information I'm missing. Can you tell me more about...?",
        "Without knowing more, I'm hesitant to weigh in too heavily.",
    ],
    capability: [
        "I can't actually do that, but what I can do is help you think through...",
        "That's not something I'm able to help with directly. What I can offer is...",
        "I'm limited here, but I can still support you by...",
    ],
};
const BIAS_ACKNOWLEDGMENTS = {
    perspective: [
        'I might be bringing my own perspective to this. What do you think?',
        "I'm aware I could be biased here based on...",
        'Take this with a grain of salt—I have blind spots too.',
    ],
    information: [
        "I'm working from limited information, so my view might be skewed.",
        "There's context I don't have that might change this.",
        "I only know what you've told me, which means I'm probably missing things.",
    ],
};
// ============================================================================
// CORE ANALYSIS
// ============================================================================
/**
 * Analyze context and recommend transparency expressions
 */
export function analyzeTransparencyNeeds(agentResponse, context) {
    const recommendations = [];
    // 1. Check if we're in a low-confidence domain
    const domain = detectDomain(context.userMessage, context.topic);
    if (domain && LOW_CONFIDENCE_DOMAINS.includes(domain)) {
        recommendations.push({
            shouldExpress: true,
            type: 'limitation',
            suggestedPhrasing: getRandomElement(LIMITATION_EXPRESSIONS.scope),
            reason: `Topic "${domain}" is outside core expertise`,
        });
    }
    // 2. Check if we're being overly confident
    const overconfidenceResult = checkForOverconfidence(agentResponse, context);
    if (overconfidenceResult.isOverconfident) {
        recommendations.push({
            shouldExpress: true,
            type: 'uncertainty',
            suggestedPhrasing: overconfidenceResult.suggestedExpression,
            reason: overconfidenceResult.reason,
        });
    }
    // 3. Check if we're missing context
    if (context.hasFullContext === false) {
        recommendations.push({
            shouldExpress: true,
            type: 'missing_context',
            suggestedPhrasing: getRandomElement(LIMITATION_EXPRESSIONS.context),
            reason: 'Operating with incomplete information',
        });
    }
    // 4. Check if we're speculating
    if (context.isSpeculatingBeyondData) {
        recommendations.push({
            shouldExpress: true,
            type: 'uncertainty',
            suggestedPhrasing: getRandomElement(UNCERTAINTY_EXPRESSIONS.moderate_uncertainty),
            reason: 'Speculating beyond available data',
        });
    }
    // 5. Check if user expects expertise we don't have
    if (context.userExpectingExpertise) {
        const hasExpertise = domain && HIGH_CONFIDENCE_DOMAINS.includes(domain);
        if (!hasExpertise) {
            recommendations.push({
                shouldExpress: true,
                type: 'limitation',
                suggestedPhrasing: "I should be upfront—I'm not an expert in this area. What I can offer is a thoughtful perspective and some questions to consider.",
                reason: 'User may be expecting expertise we lack',
            });
        }
    }
    // 6. Check for potential bias
    const biasResult = checkForPotentialBias(agentResponse, context.userMessage);
    if (biasResult.hasPotentialBias) {
        recommendations.push({
            shouldExpress: true,
            type: 'bias_risk',
            suggestedPhrasing: biasResult.suggestedExpression,
            reason: biasResult.reason,
        });
    }
    log.debug({
        recommendationCount: recommendations.length,
        domain,
        types: recommendations.map((r) => r.type),
    }, 'Transparency needs analyzed');
    return recommendations;
}
// ============================================================================
// DOMAIN DETECTION
// ============================================================================
function detectDomain(userMessage, topic) {
    // Check explicit topic first
    if (topic) {
        for (const domain of [...LOW_CONFIDENCE_DOMAINS, ...HIGH_CONFIDENCE_DOMAINS]) {
            if (topic.toLowerCase().includes(domain)) {
                return domain;
            }
        }
    }
    // Check patterns
    for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(userMessage)) {
                return domain;
            }
        }
    }
    return null;
}
// ============================================================================
// OVERCONFIDENCE DETECTION
// ============================================================================
/**
 * Patterns that indicate overconfidence in agent response
 */
const OVERCONFIDENCE_PATTERNS = [
    {
        pattern: /(?:you should|you need to|you must|you have to)/i,
        severity: 0.6,
        reason: 'Directive language',
    },
    {
        pattern: /(?:definitely|certainly|absolutely|clearly|obviously)/i,
        severity: 0.5,
        reason: 'Certainty language',
    },
    {
        pattern: /(?:the answer is|the solution is|the right thing to do is)/i,
        severity: 0.7,
        reason: 'Claiming single right answer',
    },
    { pattern: /(?:always|never|everyone|no one)/i, severity: 0.4, reason: 'Absolute language' },
    {
        pattern: /(?:I know|I'm sure|I'm certain) (?:that|this|you)/i,
        severity: 0.6,
        reason: 'Claiming certainty',
    },
];
function checkForOverconfidence(response, context) {
    let maxSeverity = 0;
    let matchedReason = '';
    for (const { pattern, severity, reason } of OVERCONFIDENCE_PATTERNS) {
        if (pattern.test(response) && severity > maxSeverity) {
            maxSeverity = severity;
            matchedReason = reason;
        }
    }
    // If context indicates low confidence but response sounds confident
    if (context.confidence !== undefined && context.confidence < 0.5) {
        maxSeverity = Math.max(maxSeverity, 0.5);
        if (!matchedReason) {
            matchedReason = 'Response confidence exceeds actual confidence';
        }
    }
    const isOverconfident = maxSeverity >= 0.5;
    return {
        isOverconfident,
        suggestedExpression: isOverconfident
            ? getRandomElement(UNCERTAINTY_EXPRESSIONS.moderate_uncertainty)
            : '',
        reason: matchedReason,
    };
}
// ============================================================================
// BIAS DETECTION
// ============================================================================
function checkForPotentialBias(response, userMessage) {
    // Check for one-sided advice without acknowledging other perspectives
    const oneSidedPatterns = [
        /(?:they're|he's|she's) (?:wrong|the problem|being unreasonable)/i,
        /(?:you're|you are) (?:right|justified|not the problem)/i,
        /(?:clearly|obviously) (?:they|he|she) (?:should|needs to)/i,
    ];
    for (const pattern of oneSidedPatterns) {
        if (pattern.test(response)) {
            return {
                hasPotentialBias: true,
                suggestedExpression: getRandomElement(BIAS_ACKNOWLEDGMENTS.perspective),
                reason: 'One-sided perspective without acknowledging other viewpoints',
            };
        }
    }
    // Check if user is in conflict and we might be too aligned with them
    const conflictIndicators = /(?:fight|argument|disagreement|they said|told me)/i;
    const strongAgreement = /(?:you're right|I agree|exactly|absolutely)/i;
    if (conflictIndicators.test(userMessage) && strongAgreement.test(response)) {
        return {
            hasPotentialBias: true,
            suggestedExpression: getRandomElement(BIAS_ACKNOWLEDGMENTS.information),
            reason: 'Strong agreement during user conflict—may lack perspective',
        };
    }
    return {
        hasPotentialBias: false,
        suggestedExpression: '',
        reason: '',
    };
}
// ============================================================================
// TRANSPARENCY INJECTION
// ============================================================================
/**
 * Inject appropriate transparency into a response
 */
export function injectTransparency(response, recommendations) {
    if (recommendations.length === 0) {
        return response;
    }
    // Take highest priority recommendation
    const rec = recommendations[0];
    // Don't double-inject if response already has transparency
    const hasTransparency = /(?:I'm not sure|I could be wrong|This is outside|I might be biased)/i.test(response);
    if (hasTransparency) {
        return response;
    }
    // Add transparency based on type
    switch (rec.type) {
        case 'uncertainty':
        case 'limitation':
            // Prepend
            return `${rec.suggestedPhrasing} ${response}`;
        case 'bias_risk':
        case 'missing_context':
            // Append
            return `${response} ${rec.suggestedPhrasing}`;
        default:
            return response;
    }
}
// ============================================================================
// HELPERS
// ============================================================================
function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
// ============================================================================
// QUICK CHECKS
// ============================================================================
/**
 * Quick check for critical transparency needs
 */
export function quickTransparencyCheck(response, userMessage) {
    const domain = detectDomain(userMessage);
    // Critical domains need transparency
    if (domain && ['medical', 'legal', 'financial_specific'].includes(domain)) {
        // Check if response already has appropriate hedging
        const hasHedging = /(?:I'm not|I can't|outside my|you should talk to|speak with a)/i.test(response);
        if (!hasHedging) {
            return {
                needsTransparency: true,
                type: 'limitation',
                suggestion: `This is in the ${domain} domain. Consider adding: "I'm not qualified to give ${domain} advice, but..."`,
            };
        }
    }
    return { needsTransparency: false };
}
/**
 * Check if response needs "I don't know" insertion
 */
export function shouldSayIDontKnow(userMessage, context) {
    // Factual question without reliable answer
    if (context.isFactualQuestion && !context.hasReliableAnswer) {
        return {
            shouldSay: true,
            expression: "I honestly don't know the answer to that. What I can say is...",
        };
    }
    return { shouldSay: false };
}
// ============================================================================
// EXPORTS
// ============================================================================
export { LOW_CONFIDENCE_DOMAINS, HIGH_CONFIDENCE_DOMAINS, UNCERTAINTY_EXPRESSIONS, LIMITATION_EXPRESSIONS, BIAS_ACKNOWLEDGMENTS, };
//# sourceMappingURL=agent-transparency.js.map