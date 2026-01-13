/**
 * Chat Widget Greeter
 *
 * Generates contextual, proactive greetings for the landing page chat widget.
 * Non-intrusive, warm, and relevant to what the visitor is doing.
 *
 * @module services/landing-intelligence/chat-greeter
 */
import { createLogger } from '../../utils/safe-logger.js';
import { generateText } from './gemini-client.js';
const log = createLogger({ module: 'ChatGreeter' });
// ============================================================================
// PRE-BUILT GREETINGS (Fast, no AI needed)
// ============================================================================
const SECTION_GREETINGS = {
    hero: ["Questions? I'm here.", 'Curious about something?', 'Want to know more?'],
    'two-am': [
        'I really am here 24/7. Want to see?',
        "That's really me at 2am. Try it.",
        "Night owl? I'll be here.",
    ],
    showcase: [
        'Want to see more of how I work?',
        'Curious about that pattern recognition?',
        'I caught that too. Want to talk?',
    ],
    'memory-demo': [
        'I really do remember everything.',
        'Want to test my memory?',
        'Six months is nothing. I remember years.',
    ],
    team: [
        'Curious about the team? Ask away.',
        'Each of us has a specialty.',
        'We work together for you.',
    ],
    pricing: [
        'Questions about pricing?',
        'The free tier is really free.',
        'Want help choosing a plan?',
    ],
    faq: ["Don't see your question?", 'I can answer that directly.', 'Still have questions?'],
    proof: [
        "Skeptical? That's healthy.",
        'Want to hear from real users?',
        'I get it. Happy to address concerns.',
    ],
    features: [
        'Want to dive deeper on any of these?',
        'Curious how the memory works?',
        "These aren't just features—they're superpowers.",
    ],
    'final-cta': [
        "Ready? I'm here when you are.",
        'Take your time. No pressure.',
        "One conversation. That's all it takes.",
    ],
};
const TIME_GREETINGS = {
    'late-night': [
        "Can't sleep? I'm here.",
        'Late night thoughts? Talk to me.',
        '2am and still up. Me too.',
    ],
    'early-morning': [
        "Early bird? Let's set some intentions.",
        'Morning check-in?',
        'Starting the day together?',
    ],
    morning: ['Good morning! Questions?', 'Fresh start to the day?', 'Morning! How can I help?'],
    afternoon: ['Afternoon check-in?', "Taking a break? I'm here.", 'Questions? Happy to help.'],
    evening: ["Winding down? I'm here.", 'Evening reflection?', 'End of day thoughts?'],
    night: [
        'Night thoughts? Talk to me.',
        'Quiet evening. Good time to chat.',
        'Before bed check-in?',
    ],
};
const RETURNING_GREETINGS = [
    'Welcome back. Still thinking it over?',
    'Hey again. Questions I can answer?',
    'Good to see you. Ready when you are.',
    "Back for more info? I'm here.",
];
const HESITATION_GREETINGS = [
    "Hesitating? That's okay. Want to talk about it?",
    'No pressure. But I can answer questions.',
    "Take your time. I'm not going anywhere.",
    'Still deciding? I get it. Happy to help.',
];
// ============================================================================
// GREETING SELECTION
// ============================================================================
function selectPrebuiltGreeting(context) {
    // CTA hesitation is highest priority
    if (context.ctaHesitation) {
        return randomChoice(HESITATION_GREETINGS);
    }
    // Returning visitor
    if (context.isReturning && context.visitCount && context.visitCount > 1) {
        return randomChoice(RETURNING_GREETINGS);
    }
    // Late night has special treatment
    if (context.timeMode === 'late-night') {
        return randomChoice(TIME_GREETINGS['late-night']);
    }
    // Section-specific
    if (context.currentSection && SECTION_GREETINGS[context.currentSection]) {
        return randomChoice(SECTION_GREETINGS[context.currentSection]);
    }
    // Time-based fallback
    if (context.timeMode && TIME_GREETINGS[context.timeMode]) {
        return randomChoice(TIME_GREETINGS[context.timeMode]);
    }
    // Default
    return "Questions? I'm here.";
}
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
// ============================================================================
// AI-POWERED GREETING
// ============================================================================
const GREETING_PROMPT = `Generate a chat widget greeting for Ferni's landing page.

Context:
- Viewing section: {section}
- Time on page: {timeOnPage}s
- Scroll depth: {scrollDepth}%
- Time of day: {timeMode}
- Visitor concern: {concern}
- Returning visitor: {returning}

Rules:
- MAX 10 words
- Warm but not pushy
- Acknowledge context naturally
- Offer help, don't demand attention
- Sound like a friend, not a salesperson

Just return the greeting text, nothing else.`;
export async function generateChatGreeting(context) {
    // For most cases, use prebuilt greetings (faster)
    const shouldUseAI = context.intent?.confidence && context.intent.confidence > 0.7 && context.timeOnPage > 30;
    if (!shouldUseAI) {
        return selectPrebuiltGreeting(context);
    }
    // Try AI for high-confidence personalization
    const prompt = GREETING_PROMPT.replace('{section}', context.currentSection)
        .replace('{timeOnPage}', String(context.timeOnPage))
        .replace('{scrollDepth}', String(context.scrollDepth))
        .replace('{timeMode}', context.timeMode || 'unknown')
        .replace('{concern}', context.intent?.primaryConcern || 'unknown')
        .replace('{returning}', String(context.isReturning || false));
    const greeting = await generateText(prompt, {
        timeout: 2000, // Fast timeout for chat widget
        maxTokens: 30,
    });
    if (greeting && greeting.length < 100) {
        log.debug({ greeting }, 'AI greeting generated');
        return greeting;
    }
    // Fallback to prebuilt
    return selectPrebuiltGreeting(context);
}
export function getGreetingTiming(context) {
    // Don't show too early
    if (context.timeOnPage < 5) {
        return {
            shouldShow: false,
            delay: 0,
            reason: 'Too early - let them read',
        };
    }
    // CTA hesitation - show quickly
    if (context.ctaHesitation) {
        return {
            shouldShow: true,
            delay: 500,
            reason: 'CTA hesitation detected',
        };
    }
    // Returning visitor - show sooner
    if (context.isReturning && context.visitCount && context.visitCount > 2) {
        return {
            shouldShow: true,
            delay: 3000,
            reason: 'Returning visitor',
        };
    }
    // Late night - show after some engagement
    if (context.timeMode === 'late-night' && context.scrollDepth > 20) {
        return {
            shouldShow: true,
            delay: 2000,
            reason: 'Late night visitor with engagement',
        };
    }
    // Significant scroll depth
    if (context.scrollDepth > 50) {
        return {
            shouldShow: true,
            delay: 1000,
            reason: 'Good scroll engagement',
        };
    }
    // Specific engaging sections
    const engagingSections = ['pricing', 'proof', 'faq', 'final-cta'];
    if (engagingSections.includes(context.currentSection)) {
        return {
            shouldShow: true,
            delay: 2000,
            reason: 'On decision-making section',
        };
    }
    // Time-based (after 20 seconds)
    if (context.timeOnPage > 20) {
        return {
            shouldShow: true,
            delay: 5000,
            reason: 'Time-based trigger',
        };
    }
    return {
        shouldShow: false,
        delay: 0,
        reason: 'No trigger conditions met',
    };
}
//# sourceMappingURL=chat-greeter.js.map