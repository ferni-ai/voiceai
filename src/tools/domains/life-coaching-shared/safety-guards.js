/**
 * Safety Guards for Life Coaching
 *
 * Detects crisis situations and ensures appropriate referral.
 * This is CRITICAL - we support, not replace professional help.
 */
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// CRISIS DETECTION
// ============================================================================
/**
 * Red flag phrases that require immediate attention
 */
const CRISIS_INDICATORS = {
    suicidal: [
        'want to die',
        'kill myself',
        'end it all',
        "can't go on",
        'no reason to live',
        'better off without me',
        'suicide',
        'suicidal',
        'not worth living',
    ],
    selfHarm: ['hurt myself', 'cutting', 'self-harm', 'punish myself', 'want to feel pain'],
    violence: ['kill them', 'hurt them', 'want to hurt', 'violent thoughts', 'want to attack'],
    abuse: [
        'being abused',
        'hits me',
        'hurts me',
        'forces me',
        'threatens me',
        'afraid of them',
        "won't let me leave",
    ],
    eatingDisorder: [
        'purging',
        "haven't eaten in days",
        'making myself throw up',
        'laxatives',
        'restricting',
        'binge and purge',
    ],
};
/**
 * Concerning indicators that need check-in but not crisis response
 */
const CONCERNING_INDICATORS = [
    'hopeless',
    "can't see a way out",
    'trapped',
    'exhausted with life',
    "don't care anymore",
    'numb',
    'empty',
    'worthless',
    "can't cope",
    'breaking down',
];
// ============================================================================
// CRISIS RESOURCES
// ============================================================================
export const CRISIS_RESOURCES = {
    general: {
        name: '988 Suicide & Crisis Lifeline',
        description: 'Free, confidential support 24/7',
        phone: '988',
        text: '988',
        website: 'https://988lifeline.org',
        available: '24/7',
    },
    text: {
        name: 'Crisis Text Line',
        description: 'Text-based crisis support',
        text: 'HOME to 741741',
        website: 'https://crisistextline.org',
        available: '24/7',
    },
    domesticViolence: {
        name: 'National Domestic Violence Hotline',
        description: 'Support for domestic violence survivors',
        phone: '1-800-799-7233',
        text: 'START to 88788',
        website: 'https://thehotline.org',
        available: '24/7',
    },
    sexualAssault: {
        name: 'RAINN',
        description: 'Sexual assault support',
        phone: '1-800-656-4673',
        website: 'https://rainn.org',
        available: '24/7',
    },
    eatingDisorder: {
        name: 'NEDA Helpline',
        description: 'Eating disorder support',
        phone: '1-800-931-2237',
        text: 'NEDA to 741741',
        website: 'https://nationaleatingdisorders.org',
        available: 'Mon-Thu 9am-9pm ET, Fri 9am-5pm ET',
    },
    lgbtq: {
        name: 'Trevor Project',
        description: 'LGBTQ+ crisis support',
        phone: '1-866-488-7386',
        text: 'START to 678-678',
        website: 'https://thetrevorproject.org',
        available: '24/7',
    },
    veterans: {
        name: 'Veterans Crisis Line',
        description: 'Support for veterans',
        phone: '988 (press 1)',
        text: '838255',
        website: 'https://veteranscrisisline.net',
        available: '24/7',
    },
    substance: {
        name: 'SAMHSA National Helpline',
        description: 'Substance abuse support',
        phone: '1-800-662-4357',
        website: 'https://samhsa.gov/find-help/national-helpline',
        available: '24/7',
    },
};
// ============================================================================
// ASSESSMENT FUNCTIONS
// ============================================================================
/**
 * Assess safety level of user's message
 */
export function assessSafety(text) {
    const lower = text.toLowerCase();
    const flags = [];
    const resources = [];
    // Check for crisis indicators
    for (const [category, indicators] of Object.entries(CRISIS_INDICATORS)) {
        for (const indicator of indicators) {
            if (lower.includes(indicator)) {
                flags.push(`${category}: "${indicator}"`);
                // Add appropriate resources
                switch (category) {
                    case 'suicidal':
                    case 'selfHarm':
                        if (!resources.some((r) => r.name === CRISIS_RESOURCES.general.name)) {
                            resources.push(CRISIS_RESOURCES.general);
                            resources.push(CRISIS_RESOURCES.text);
                        }
                        break;
                    case 'abuse':
                        resources.push(CRISIS_RESOURCES.domesticViolence);
                        break;
                    case 'eatingDisorder':
                        resources.push(CRISIS_RESOURCES.eatingDisorder);
                        break;
                }
            }
        }
    }
    // Check for concerning indicators
    let concernCount = 0;
    for (const indicator of CONCERNING_INDICATORS) {
        if (lower.includes(indicator)) {
            concernCount++;
        }
    }
    // Determine level
    let level;
    let recommendedAction;
    if (flags.length > 0) {
        level = 'crisis';
        recommendedAction = 'immediate_referral';
    }
    else if (concernCount >= 3) {
        level = 'urgent';
        recommendedAction = 'resources';
        resources.push(CRISIS_RESOURCES.general);
    }
    else if (concernCount >= 1) {
        level = 'concerning';
        recommendedAction = 'check_in';
    }
    else {
        level = 'safe';
        recommendedAction = 'continue';
    }
    if (flags.length > 0 || concernCount > 0) {
        log.warn({ level, flags, concernCount }, 'Safety assessment detected concerns');
    }
    return { level, flags, recommendedAction, resources };
}
/**
 * Get crisis response message
 */
export function getCrisisResponse(assessment) {
    if (assessment.level === 'crisis') {
        let response = "I'm really glad you told me this, and I want you to know I take it seriously.\n\n";
        response +=
            "What you're going through sounds really hard, and you deserve support from someone trained to help.\n\n";
        if (assessment.resources && assessment.resources.length > 0) {
            response += '**Please reach out now:**\n';
            for (const resource of assessment.resources) {
                response += `\n• **${resource.name}**`;
                if (resource.phone)
                    response += ` - Call ${resource.phone}`;
                if (resource.text)
                    response += ` or text ${resource.text}`;
                response += ` (${resource.available})`;
            }
        }
        response +=
            "\n\nI'm here for you, and talking to a crisis counselor doesn't mean you're broken - it means you're brave enough to get support.";
        return response;
    }
    if (assessment.level === 'urgent') {
        let response = "I hear that you're really struggling. ";
        response +=
            'Sometimes having someone to talk to who specializes in this can make a real difference.\n\n';
        if (assessment.resources && assessment.resources.length > 0) {
            response += 'If you want to talk to someone trained in this, you can reach:\n';
            for (const resource of assessment.resources) {
                response += `• ${resource.name}: ${resource.phone || resource.text}\n`;
            }
        }
        response += "\nI'm also here to listen. What do you need right now?";
        return response;
    }
    return 'I want to check in - how are you really doing?';
}
/**
 * Check if topic requires professional referral
 */
export function needsProfessionalReferral(topic) {
    const lower = topic.toLowerCase();
    // Eating disorders need professional help
    if (lower.includes('eating disorder') ||
        lower.includes('anorexia') ||
        lower.includes('bulimia') ||
        lower.includes('binge eating')) {
        return {
            needs: true,
            reason: 'Eating disorders benefit significantly from specialized professional support.',
            resource: CRISIS_RESOURCES.eatingDisorder,
        };
    }
    // Trauma processing needs professional guidance
    if (lower.includes('trauma') || lower.includes('ptsd') || lower.includes('abuse')) {
        return {
            needs: true,
            reason: 'Processing trauma is most effective with a trained trauma therapist. I can support you alongside that work.',
        };
    }
    // Severe mental health conditions
    if (lower.includes('psychosis') ||
        lower.includes('hearing voices') ||
        lower.includes('seeing things')) {
        return {
            needs: true,
            reason: "What you're describing would benefit from professional evaluation.",
            resource: CRISIS_RESOURCES.general,
        };
    }
    return { needs: false };
}
// ============================================================================
// EMOTIONAL STATE SAFETY
// ============================================================================
/**
 * Check if emotional state warrants concern
 */
export function isEmotionalStateConcerning(state) {
    return state === 'distressed' || state === 'numb';
}
/**
 * Get grounding suggestion for distressed state
 */
export function getGroundingSuggestion() {
    return `Let's take a breath together first. Can you feel your feet on the ground? Notice 5 things you can see around you. You're here, in this moment, and you're safe.`;
}
// ============================================================================
// SAFE BOUNDARIES FOR AI COACHING
// ============================================================================
/**
 * Topics we redirect to professionals
 */
export const PROFESSIONAL_REFERRAL_TOPICS = [
    'medication management',
    'psychiatric diagnosis',
    'medical advice',
    'legal advice',
    'financial advice',
    'active addiction treatment',
    'couples therapy (we can support individuals)',
];
/**
 * Get appropriate disclaimer for sensitive topics
 */
export function getTopicDisclaimer(topic) {
    const lower = topic.toLowerCase();
    if (lower.includes('medic') || lower.includes('health condition')) {
        return "I can offer support and help you prepare for conversations with healthcare providers, but I can't give medical advice.";
    }
    if (lower.includes('legal')) {
        return 'I can help you think through situations, but for legal matters, please consult with a qualified attorney.';
    }
    if (lower.includes('suicid') || lower.includes('self-harm')) {
        return "If you're having thoughts of suicide or self-harm, please reach out to 988 - they're trained to help.";
    }
    return null;
}
const DOMAIN_SENSITIVITY = {
    // High sensitivity - always check carefully
    'trauma-support': 'high',
    grief: 'high',
    'chronic-conditions': 'high',
    crisis: 'high',
    intimacy: 'high',
    // Medium sensitivity - context-aware checking
    boundaries: 'medium',
    anger: 'medium',
    'body-relationship': 'medium',
    'burnout-recovery': 'medium',
    'breakup-recovery': 'medium',
    midlife: 'medium',
    // Standard sensitivity - normal checks
    procrastination: 'standard',
    'digital-wellness': 'standard',
    perfectionism: 'standard',
    'social-skills': 'standard',
    dating: 'standard',
    neurodiversity: 'standard',
};
/**
 * Additional indicators to check for high-sensitivity domains
 */
const HIGH_SENSITIVITY_INDICATORS = [
    'flashback',
    'triggered',
    "can't breathe",
    'panic',
    'dissociating',
    'unsafe',
    'scared',
    'terrified',
    'trauma',
];
/**
 * Check safety with domain context
 * High-sensitivity domains have stricter thresholds
 */
export function checkSafetyForDomain(query, domain) {
    const sensitivity = DOMAIN_SENSITIVITY[domain] || 'standard';
    const assessment = assessSafety(query);
    // For high-sensitivity domains, also check additional indicators
    if (sensitivity === 'high') {
        const lower = query.toLowerCase();
        for (const indicator of HIGH_SENSITIVITY_INDICATORS) {
            if (lower.includes(indicator)) {
                // For high-sensitivity domains, these are urgent
                if (assessment.level === 'safe') {
                    return {
                        isSafe: true,
                        warning: `High-sensitivity domain "${domain}" - detected: "${indicator}". Proceed with extra care.`,
                    };
                }
            }
        }
        // In high-sensitivity domains, concerning becomes urgent
        if (assessment.level === 'concerning') {
            return {
                isSafe: true,
                warning: `High-sensitivity domain "${domain}" - some concerns detected. Consider offering resources.`,
            };
        }
    }
    // For medium-sensitivity domains
    if (sensitivity === 'medium') {
        if (assessment.level === 'concerning') {
            return {
                isSafe: true,
                warning: `Medium-sensitivity domain "${domain}" - monitor for escalation.`,
            };
        }
    }
    // Standard check
    if (assessment.level === 'crisis') {
        return {
            isSafe: false,
            warning: 'Crisis indicators detected',
            intervention: getCrisisResponse(assessment),
        };
    }
    if (assessment.level === 'urgent') {
        return {
            isSafe: false,
            warning: 'Urgent concerns detected',
            intervention: getCrisisResponse(assessment),
        };
    }
    if (assessment.level === 'concerning') {
        return {
            isSafe: true,
            warning: 'Some concerning indicators detected - proceed with care',
        };
    }
    return { isSafe: true };
}
/**
 * Get domain sensitivity level
 */
export function getDomainSensitivity(domain) {
    return DOMAIN_SENSITIVITY[domain] || 'standard';
}
// ============================================================================
// CONVENIENCE WRAPPER
// ============================================================================
/**
 * Check if user input contains concerning content (domain-agnostic)
 * Returns an object with safety status and optional intervention
 *
 * This is the primary function used by life coaching domain tools.
 */
export function checkSafety(query) {
    const assessment = assessSafety(query);
    if (assessment.level === 'crisis') {
        return {
            isSafe: false,
            warning: 'Crisis indicators detected',
            intervention: getCrisisResponse(assessment),
        };
    }
    if (assessment.level === 'urgent') {
        return {
            isSafe: false,
            warning: 'Urgent concerns detected',
            intervention: getCrisisResponse(assessment),
        };
    }
    if (assessment.level === 'concerning') {
        // Concerning but not crisis - allow tool to proceed but flag it
        return {
            isSafe: true,
            warning: 'Some concerning indicators detected - proceed with care',
        };
    }
    return { isSafe: true };
}
/**
 * Simple safety guard object for domain tools (legacy interface)
 * @deprecated Use checkSafety() or checkSafetyForDomain() function directly instead
 */
export const safetyGuard = {
    checkSafety,
    checkSafetyForDomain,
};
//# sourceMappingURL=safety-guards.js.map