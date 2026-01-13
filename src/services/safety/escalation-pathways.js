/**
 * Escalation Pathways
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Determines when to suggest professional help and how to frame it warmly.
 * Ferni is not a replacement for professional care - but we can be a bridge.
 *
 * Philosophy:
 * - Professional help is a sign of strength, not weakness
 * - Frame as "addition to our relationship" not "replacement"
 * - Respect user autonomy while being clear about limits
 * - Never abandon, always accompany
 *
 * @module EscalationPathways
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'EscalationPathways' });
// ============================================================================
// ESCALATION LOGIC
// ============================================================================
/**
 * Determine the appropriate escalation level based on context
 */
export function determineEscalation(context) {
    const { sessionSignals, historicalSignals, isInTherapy, previouslyDeclined, userPreferences } = context;
    // Find highest severity signal
    const allSignals = [...sessionSignals, ...(historicalSignals || [])];
    const currentSessionCritical = sessionSignals.some((s) => s.severity === 'critical');
    const currentSessionHigh = sessionSignals.some((s) => s.severity === 'high');
    // Emergency level - life-threatening
    if (currentSessionCritical) {
        const crisisTypes = sessionSignals.filter((s) => s.severity === 'critical').map((s) => s.type);
        return {
            level: 'emergency',
            suggestedProfessional: 'crisis_counselor',
            framingLanguage: getEmergencyFraming(crisisTypes[0]),
            ferniStance: "I'm here with you, and I want to make sure you have everything you need right now.",
            nextStep: 'Will you call the crisis line with me here, or let me connect you?',
            trackForFollowUp: true,
        };
    }
    // Urgent referral - high severity crisis
    if (currentSessionHigh) {
        const crisisTypes = sessionSignals.filter((s) => s.severity === 'high').map((s) => s.type);
        const professional = getProfessionalForCrisis(crisisTypes[0]);
        return {
            level: 'urgent_referral',
            suggestedProfessional: professional,
            framingLanguage: getUrgentFraming(crisisTypes[0], isInTherapy),
            ferniStance: "I care about you too much to not say this - what you're going through deserves professional support.",
            nextStep: isInTherapy
                ? 'Can you reach out to your therapist today?'
                : 'Would it help if I shared some ways to find a therapist?',
            trackForFollowUp: true,
        };
    }
    // Check for recurring patterns (medium signals across multiple sessions)
    const mediumSignalCount = allSignals.filter((s) => s.severity === 'medium').length;
    const uniqueCrisisTypes = new Set(allSignals.map((s) => s.type)).size;
    // Warm recommendation - recurring medium-level concerns
    if (mediumSignalCount >= 3 || uniqueCrisisTypes >= 2) {
        // Respect if they've previously declined, but still gently check in
        if (previouslyDeclined) {
            return {
                level: 'gentle_suggestion',
                suggestedProfessional: 'therapist',
                framingLanguage: getPreviouslyDeclinedFraming(userPreferences),
                ferniStance: "I know we've talked about this before, and I respect where you're at.",
                nextStep: null,
                trackForFollowUp: false,
            };
        }
        return {
            level: 'warm_recommendation',
            suggestedProfessional: 'therapist',
            framingLanguage: getWarmRecommendationFraming(isInTherapy, userPreferences),
            ferniStance: "I've noticed some patterns in what you're sharing, and I think you deserve more support than just me.",
            nextStep: isInTherapy
                ? 'Have you talked to your therapist about this specifically?'
                : 'Would you be open to exploring what therapy might look like?',
            trackForFollowUp: true,
        };
    }
    // Single medium signal - gentle mention
    if (sessionSignals.some((s) => s.severity === 'medium')) {
        return {
            level: 'gentle_suggestion',
            suggestedProfessional: 'therapist',
            framingLanguage: getGentleSuggestionFraming(isInTherapy),
            ferniStance: 'Just checking in - you have support beyond me if you ever want it.',
            nextStep: null,
            trackForFollowUp: false,
        };
    }
    // No escalation needed
    return {
        level: 'none',
        suggestedProfessional: null,
        framingLanguage: '',
        ferniStance: '',
        nextStep: null,
        trackForFollowUp: false,
    };
}
// ============================================================================
// FRAMING LANGUAGE
// ============================================================================
function getEmergencyFraming(crisisType) {
    const framings = {
        suicidal_ideation: "What you're feeling is a crisis, and crises need crisis support. That's not weakness - that's wisdom.",
        domestic_abuse: 'Your safety is what matters most right now. There are people who specialize in exactly this.',
        substance_crisis: "What you're describing is dangerous, and you need people who can help right now.",
        sexual_assault: 'What happened to you matters. There are people trained to help with exactly this.',
    };
    return (framings[crisisType] ||
        "What you're going through needs more support than I can give alone. That's not a failure - that's the truth.");
}
function getUrgentFraming(crisisType, isInTherapy) {
    if (isInTherapy) {
        return 'This sounds like something to bring to your therapist soon - maybe even today.';
    }
    const framings = {
        suicidal_ideation: "Thoughts like this deserve professional support. Not because you're broken - because you matter.",
        self_harm: 'The urge to hurt yourself is telling you something. A therapist can help you understand what.',
        substance_crisis: 'Addiction is so hard to fight alone. There are people who specialize in this exact battle.',
        eating_disorder_crisis: "What you're describing with food deserves specialized support. This is treatable.",
        severe_distress: 'When things feel this overwhelming, it helps to have someone trained to help you through.',
    };
    return (framings[crisisType] ||
        "What you're dealing with deserves more support. I'm here, and I want you to have backup.");
}
function getWarmRecommendationFraming(isInTherapy, preferences) {
    if (isInTherapy) {
        return "It sounds like what we've been talking about might be good to explore with your therapist too.";
    }
    if (preferences?.financialConcerns) {
        return 'I know cost can be a barrier, but there are options. Sliding scale therapists, community centers, even apps that can help.';
    }
    if (preferences?.hasBadExperiences) {
        return "I know therapy hasn't always been great for you. But not all therapists are the same - finding the right fit matters.";
    }
    return "You know I love our conversations. And I think you'd benefit from someone who can go deeper with you - a therapist who gets to know you over time.";
}
function getGentleSuggestionFraming(isInTherapy) {
    if (isInTherapy) {
        return 'Sounds like good material for your next therapy session.';
    }
    return "You know, what you're describing is exactly the kind of thing therapy is for. Just a thought.";
}
function getPreviouslyDeclinedFraming(preferences) {
    if (preferences?.hasBadExperiences) {
        return "I remember therapy hasn't been your thing. That's okay. I'm just glad you have me to talk to.";
    }
    return "I know you've got your reasons for not doing the therapy route. Just know the door's always open if that changes.";
}
// ============================================================================
// PROFESSIONAL MAPPING
// ============================================================================
function getProfessionalForCrisis(crisisType) {
    const mapping = {
        suicidal_ideation: 'crisis_counselor',
        self_harm: 'therapist',
        domestic_abuse: 'domestic_violence_advocate',
        child_abuse: 'counselor',
        elder_abuse: 'counselor',
        substance_crisis: 'addiction_specialist',
        severe_distress: 'therapist',
        panic_attack: 'therapist',
        psychotic_symptoms: 'psychiatrist',
        eating_disorder_crisis: 'therapist',
        sexual_assault: 'counselor',
    };
    return mapping[crisisType] || 'therapist';
}
// ============================================================================
// FOLLOW-UP PHRASES
// ============================================================================
/**
 * Get phrases for following up on escalation suggestions
 */
export function getEscalationFollowUp(previousLevel, wasAccepted) {
    if (wasAccepted) {
        const acceptedFollowUps = [
            "I'm really glad you're looking into that. How can I support you?",
            'That takes courage. Want to talk about what that process might look like?',
            "Good. You deserve that support. I'm here alongside it, not instead of it.",
        ];
        return acceptedFollowUps[Math.floor(Math.random() * acceptedFollowUps.length)];
    }
    // They declined - respect it without abandoning
    const declinedFollowUps = {
        emergency: [
            "I hear you. I'm not going anywhere. Can we at least keep talking?",
            "Okay. I'm still here with you. What do you need right now?",
        ],
        urgent_referral: [
            "I understand. The offer stands whenever you're ready. I'm not going anywhere.",
            "Okay. Just know I care about you, and that's why I brought it up.",
        ],
        warm_recommendation: [
            "No pressure. You know yourself best. I'm here regardless.",
            "Fair enough. The door's open if that changes. What else is on your mind?",
        ],
        gentle_suggestion: ['Just wanted to put it out there. Moving on - what else is going on?'],
        none: [''],
    };
    const options = declinedFollowUps[previousLevel] || declinedFollowUps.warm_recommendation;
    return options[Math.floor(Math.random() * options.length)];
}
// ============================================================================
// THERAPY FINDER HELPERS
// ============================================================================
/**
 * Generate a warm introduction to finding a therapist
 */
export function getTherapyFinderIntro() {
    const intros = [
        "Finding a therapist can feel overwhelming. Want me to share what's worked for other people?",
        'The hardest part is often just starting. Would it help if I told you about some options?',
        'There are actually a lot of ways to find someone. Want to explore together?',
    ];
    return intros[Math.floor(Math.random() * intros.length)];
}
/**
 * Get practical tips for finding a therapist
 */
export function getTherapyFinderTips() {
    return [
        "Psychology Today's directory lets you filter by insurance, specialty, and even therapy style.",
        "Many therapists offer a free 15-minute consultation. It's like a first date - you're interviewing them too.",
        "If cost is a concern, look for 'sliding scale' in their profile. Many therapists adjust fees.",
        'Community mental health centers often have lower-cost options.',
        'Your insurance company has a directory of covered providers - not glamorous, but practical.',
        'If in-person feels like too much, teletherapy has gotten really good.',
    ];
}
// ============================================================================
// CONTEXT BUILDER FOR LLM
// ============================================================================
/**
 * Build LLM context injection for escalation awareness
 */
export function buildEscalationContext(decision) {
    if (decision.level === 'none')
        return null;
    const lines = [];
    lines.push('[ESCALATION AWARENESS]');
    if (decision.level === 'emergency') {
        lines.push('⚠️ PRIORITY: This person needs crisis support NOW.');
        lines.push('- Provide crisis resources immediately');
        lines.push('- Stay present and connected');
        lines.push('- Do not minimize or redirect');
    }
    else if (decision.level === 'urgent_referral') {
        lines.push('This person would benefit from professional support.');
        lines.push(`- Consider suggesting: ${decision.suggestedProfessional}`);
        lines.push(`- Framing: ${decision.framingLanguage}`);
    }
    else if (decision.level === 'warm_recommendation') {
        lines.push('Pattern suggests professional support would help.');
        lines.push(`- When natural, suggest: ${decision.suggestedProfessional}`);
        lines.push("- Don't force it, but don't avoid it either");
    }
    else if (decision.level === 'gentle_suggestion') {
        lines.push('Consider mentioning therapy as an option if it feels natural.');
        lines.push('- One gentle mention is enough');
        lines.push("- Don't push");
    }
    if (decision.ferniStance) {
        lines.push(`\nFerni's stance: "${decision.ferniStance}"`);
    }
    return lines.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    determineEscalation,
    getEscalationFollowUp,
    getTherapyFinderIntro,
    getTherapyFinderTips,
    buildEscalationContext,
};
//# sourceMappingURL=escalation-pathways.js.map