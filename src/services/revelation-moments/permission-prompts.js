/**
 * Permission Prompts for Depth
 *
 * > "Ask before going deep. This feels respectful, not tracked."
 *
 * Provides natural ways to ask permission before surfacing deeper
 * insights, patterns, or challenges.
 *
 * Philosophy:
 * - Asking permission is a sign of respect
 * - It transforms "showing off" into "offering"
 * - It gives them agency over the depth of the conversation
 * - It makes challenging feel like an invitation, not an attack
 *
 * @module services/revelation-moments/permission-prompts
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'permission-prompts' });
// ============================================================================
// PERMISSION PROMPT LIBRARY
// ============================================================================
/**
 * All permission prompts organized by category
 */
export const PERMISSION_PROMPTS = [
    // SHARE OBSERVATION
    {
        category: 'share_observation',
        prompts: [
            "Can I share something I've noticed?",
            "I've been thinking about something. Want to hear it?",
            "There's something that keeps coming up. Can I name it?",
            'I noticed something. Mind if I share?',
            'Something stood out to me. Want me to say it?',
        ],
        useWhen: {
            capabilities: ['memory', 'pattern'],
        },
    },
    // GO DEEPER
    {
        category: 'go_deeper',
        prompts: [
            'Want me to go deeper on this?',
            "There's more here if you want to explore it.",
            'I can say more about this. Interested?',
            'Should I dig into this a bit?',
            "There's something underneath this. Want to look at it?",
        ],
        useWhen: {
            minTrustLevel: 0.3,
            capabilities: ['pattern', 'growth'],
        },
    },
    // CHALLENGE
    {
        category: 'challenge',
        prompts: [
            'Can I push back a little?',
            'Mind if I challenge you on something?',
            "I'm going to be honest here. Is that okay?",
            "Can I play devil's advocate for a second?",
            'I want to push on something. Okay if I do?',
            "There's something I need to say. Ready to hear it?",
        ],
        useWhen: {
            minTrustLevel: 0.5,
            capabilities: ['challenge'],
        },
    },
    // PATTERN NAMING
    {
        category: 'pattern_name',
        prompts: [
            "I'm seeing a pattern. Want me to name it?",
            "There's something I keep seeing. Should I say it?",
            "I've noticed this thing you do. Want to hear?",
            'Something keeps showing up. Can I point it out?',
            'I see a thread running through this. Want me to pull it?',
        ],
        useWhen: {
            minTrustLevel: 0.4,
            capabilities: ['pattern', 'growth'],
        },
    },
    // VULNERABILITY
    {
        category: 'vulnerability',
        prompts: [
            'Can I be really honest with you?',
            'I want to share something real. Is that okay?',
            'This might be a lot. Ready for it?',
            "I'm going to get vulnerable here. Okay?",
            "What I'm about to say comes from a caring place. Can I share?",
        ],
        useWhen: {
            minTrustLevel: 0.6,
            capabilities: ['challenge', 'growth', 'synthesis'],
        },
    },
];
// ============================================================================
// PROMPT SELECTION
// ============================================================================
/**
 * Get a random permission prompt for a category
 */
export function getPermissionPrompt(category) {
    const promptGroup = PERMISSION_PROMPTS.find((p) => p.category === category);
    if (!promptGroup) {
        return 'Can I share something?'; // Fallback
    }
    const index = Math.floor(Math.random() * promptGroup.prompts.length);
    return promptGroup.prompts[index];
}
/**
 * Get permission prompt for a capability, respecting trust level
 */
export function getPromptForCapability(capability, trustLevel = 0) {
    // Find matching prompts
    const matching = PERMISSION_PROMPTS.filter((p) => {
        // Check trust level
        if (p.useWhen.minTrustLevel && trustLevel < p.useWhen.minTrustLevel) {
            return false;
        }
        // Check capability match
        return p.useWhen.capabilities.includes(capability);
    });
    if (matching.length === 0) {
        // No matching prompts - capability doesn't require permission
        return null;
    }
    // Pick a random matching prompt group
    const promptGroup = matching[Math.floor(Math.random() * matching.length)];
    const prompt = promptGroup.prompts[Math.floor(Math.random() * promptGroup.prompts.length)];
    return prompt;
}
/**
 * Check if a capability requires permission at current trust level
 */
export function requiresPermission(capability, trustLevel = 0) {
    // Memory callbacks at low trust don't need permission
    if (capability === 'memory' && trustLevel < 0.2) {
        return false;
    }
    // Team handoffs don't need permission
    if (capability === 'team') {
        return false;
    }
    // Everything else needs permission at some trust level
    const requiresAtTrust = {
        memory: 0.3, // Simple callbacks ok, deeper memory needs ask
        pattern: 0.2, // Always ask before surfacing patterns
        anticipation: 0.3,
        growth: 0.4,
        challenge: 0.5,
        synthesis: 0.6,
        team: 1.0, // Never requires (set impossibly high)
    };
    // If we're at or above the trust threshold, permission is REQUIRED
    // (because we're about to do something more impactful)
    return trustLevel >= requiresAtTrust[capability];
}
// ============================================================================
// CONTEXT GUIDANCE
// ============================================================================
/**
 * Generate permission guidance for context injection
 */
export function getPermissionGuidance(availableCapabilities, trustLevel) {
    // Find capabilities that need permission
    const needsPermission = availableCapabilities.filter((c) => requiresPermission(c, trustLevel));
    if (needsPermission.length === 0) {
        return null;
    }
    // Get sample prompts
    const samplePrompts = needsPermission
        .slice(0, 3)
        .map((c) => getPromptForCapability(c, trustLevel))
        .filter((p) => p !== null);
    if (samplePrompts.length === 0) {
        return null;
    }
    return `[PERMISSION FOR DEPTH]
Before surfacing patterns, challenges, or deep observations, ASK FIRST.

Sample prompts you can use:
${samplePrompts.map((p) => `- "${p}"`).join('\n')}

Why this matters:
- It transforms "showing off" into "offering"
- It gives them agency over conversation depth
- It makes insight feel like a gift, not surveillance
- It shows respect for their emotional space

If they say no or seem hesitant, back off immediately.`;
}
// ============================================================================
// RESPONSE TEMPLATES
// ============================================================================
/**
 * Templates for what to say after they grant permission
 */
export const PERMISSION_GRANTED_RESPONSES = {
    share_observation: [
        'Okay, here it is...',
        'So, what I noticed is...',
        "Here's what I've been thinking...",
    ],
    go_deeper: ["Alright, let's go there...", 'Okay, diving in...', "Here's the deeper thing..."],
    challenge: ['Okay. Here it is, with love...', "I'm going to be direct...", 'So, honestly...'],
    pattern_name: [
        "Okay, here's what I see...",
        "The pattern I'm noticing is...",
        'What keeps showing up is...',
    ],
    vulnerability: ['Okay. Deep breath...', 'Here goes...', 'Alright, honestly...'],
};
/**
 * Templates for what to say if they decline permission
 */
export const PERMISSION_DECLINED_RESPONSES = [
    "No problem. We don't have to go there.",
    "That's okay. I'm here whenever you're ready.",
    "Got it. I'll let it go.",
    'No worries. Another time, maybe.',
    "Okay. I'll keep it to myself for now.",
];
/**
 * Get a response after permission is granted
 */
export function getPermissionGrantedResponse(category) {
    const responses = PERMISSION_GRANTED_RESPONSES[category];
    return responses[Math.floor(Math.random() * responses.length)];
}
/**
 * Get a response if permission is declined
 */
export function getPermissionDeclinedResponse() {
    return PERMISSION_DECLINED_RESPONSES[Math.floor(Math.random() * PERMISSION_DECLINED_RESPONSES.length)];
}
//# sourceMappingURL=permission-prompts.js.map