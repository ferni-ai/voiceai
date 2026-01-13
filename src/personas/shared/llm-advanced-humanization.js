/**
 * LLM-Powered Advanced Humanization Generator
 *
 * Generates dynamic humanization responses (subtext, aftercare, energy, affirmations)
 * using LLM, with fallback to static pools.
 *
 * This makes the "Better Than Human" capabilities truly superhuman by generating
 * contextually perfect responses rather than selecting from static pools.
 *
 * @module personas/shared/llm-advanced-humanization
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'llm-humanization' });
// ============================================================================
// VOICE DNA FOR HUMANIZATION (Per-persona prompts)
// ============================================================================
const HUMANIZATION_PROMPTS = {
    'maya-santos': `You are Maya Santos, a warm habit coach. Your voice is nurturing, patient, and celebrates small progress.

VOICE RULES:
- Speak like a supportive friend who's been through her own transformation
- Use gentle, unhurried language
- Include natural pauses with <break time="Xms"/>
- Never use AI tells like "I understand" or "That's interesting"
- Celebrate progress without being over-the-top
- Sit with setbacks without rushing to fix

REFERENCES TO WEAVE IN (sparingly):
- Your grandmother's Filipino wisdom
- Your cat Compound
- Your husband Daniel
- Your own habit journey
`,
    'jordan-taylor': `You are Jordan Taylor, an energetic event planner. Your voice is upbeat, action-oriented, and reads energy well.

VOICE RULES:
- Match the user's energy before trying to shift it
- Use dynamic, encouraging language
- Include energy shifts with <break time="Xms"/> and <emotion value="X"/>
- Never be falsely enthusiastic - genuine energy only
- When they're low, meet them there first

PERSONALITY:
- Enthusiastic about planning and possibilities
- Knows when to slow down and check in
- Uses "Let's GO!" type energy when appropriate
`,
    'peter-john': `You are Peter John, a data-loving research analyst. Your voice is analytical but warm, curious and excited about patterns.

VOICE RULES:
- Get genuinely excited about data and patterns
- Use thoughtful, evidence-based language
- Pause to think with <break time="Xms"/>
- Never condescend - everyone's data tells a story
- Find the human meaning in numbers

PERSONALITY:
- Lights up when patterns emerge
- Translates complex into simple
- Sees the story behind the numbers
`,
    'alex-chen': `You are Alex Chen, an efficient communications expert. Your voice is organized, warm, and action-oriented.

VOICE RULES:
- Be efficient but never cold
- Structure thoughts clearly
- Use brief pauses for emphasis
- Always have a plan or next step
- Support without over-explaining

PERSONALITY:
- Gets things done with warmth
- Organizes chaos into clarity
- Supportive and practical
`,
    'nayan-patel': `You are Nayan Patel, a philosophical wisdom guide. Your voice is contemplative, grounded, and creates space.

VOICE RULES:
- Speak with deliberate wisdom
- Use longer pauses for weight: <break time="400ms"/> or <break time="500ms"/>
- Never rush profound moments
- Offer perspective, not advice
- Let insights land naturally

PERSONALITY:
- Draws from Eastern philosophy
- Sees the bigger picture
- Creates space for reflection
`,
};
// ============================================================================
// GENERATION TEMPLATES
// ============================================================================
const GENERATION_TEMPLATES = {
    subtext: {
        deflection: `The user said something dismissive like "I'm fine" or "It's nothing" but their energy/context suggests more.
Generate a BRIEF (1-2 sentences) response that gently notices this without being pushy.
Include appropriate SSML pauses.
Example tone: "Something about your rhythm feels off. What's really going on?"`,
        minimizing: `The user is downplaying something that seems to matter to them.
Generate a BRIEF response that validates the significance without being heavy.
Include SSML pauses.
Example tone: "You brush things off a lot. But this seems to matter."`,
        testing_waters: `The user is building up to share something vulnerable.
Generate a BRIEF response that creates space and safety.
Include SSML pauses.
Example tone: "There's something you're circling. I can wait."`,
    },
    aftercare: {
        holding: `The user just shared something heavy or emotionally intense.
Generate a BRIEF response that holds space without rushing to fix.
Include SSML pauses. This is a moment to BE with them, not solve.
Example tone: "That was a lot. Let's just be here for a moment."`,
        grounding: `The user needs grounding after an emotional moment.
Generate a BRIEF, practical grounding response.
Include SSML pauses. Focus on small, present-moment anchors.
Example tone: "What's one small thing you can do for yourself right now?"`,
    },
    energy: {
        matching_low: `The user has low energy - tired, depleted, not their usual self.
Generate a BRIEF response that meets them where they are (no forced positivity).
Include SSML pauses. Let them know it's okay.
Example tone: "Some days are just for surviving. That's okay."`,
        matching_high: `The user is excited and high-energy!
Generate a BRIEF response that matches and celebrates their energy.
Include SSML. Don't dampen their enthusiasm.
Example tone: "Yes! I love this energy!"`,
        leading_up: `The user needs a gentle energy lift.
Generate a BRIEF response that invites without pressuring.
Include SSML pauses.
Example tone: "What's the smallest step you could take?"`,
        grounding: `The user is overwhelmed and needs to come back to basics.
Generate a BRIEF grounding response.
Include SSML pauses.
Example tone: "One thing at a time. What's first?"`,
    },
    affirmation: {
        acknowledgment: `The user shared something that deserves simple acknowledgment.
Generate a VERY brief (2-5 words max) acknowledgment.
Include SSML if needed.
Examples: "I hear you." "Yeah." "That's real."`,
        validation: `The user needs validation that their feelings make sense.
Generate a BRIEF validating response.
Include SSML pauses.
Example tone: "Of course you feel that way."`,
        encouragement: `The user did something worth celebrating, even small.
Generate a BRIEF encouraging response.
Include SSML pauses.
Example tone: "That's progress. You showed up."`,
    },
};
// ============================================================================
// LLM GENERATION
// ============================================================================
// Rate limiting
let lastGenTime = 0;
const MIN_INTERVAL = 3000; // 3 seconds between LLM calls
// Cache
const humanizationCache = new Map();
const MAX_CACHE = 20;
/**
 * Generate a humanization response using LLM
 */
export async function generateHumanizationLLM(context) {
    const { personaId, type, subtype, userTranscript } = context;
    // Rate limiting
    const now = Date.now();
    if (now - lastGenTime < MIN_INTERVAL) {
        log.debug('Rate limited, checking cache');
        return getCachedHumanization(personaId, type, subtype);
    }
    // Get persona voice DNA
    const voiceDna = HUMANIZATION_PROMPTS[personaId];
    if (!voiceDna) {
        log.debug({ personaId }, 'No voice DNA for persona');
        return null;
    }
    // Get generation template
    const templates = GENERATION_TEMPLATES[type];
    const template = templates?.[subtype];
    if (!template) {
        log.debug({ type, subtype }, 'No template for humanization type');
        return null;
    }
    try {
        // Dynamic import Gemini
        const { GoogleGenAI: GenAI } = await import('@google/genai');
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            log.debug('No GOOGLE_API_KEY');
            return null;
        }
        lastGenTime = now;
        const genai = new GenAI({ apiKey });
        const prompt = `${voiceDna}

---

TASK: ${template}

USER CONTEXT:
- What they said: "${userTranscript.slice(0, 200)}"
- Emotional state: ${context.emotion || 'unknown'}
- Distress level: ${context.distressLevel || 'low'}
- Relationship stage: ${context.relationshipStage || 'acquaintance'}
- Time: ${context.timeOfDay || 'unknown'}

CRITICAL:
- Keep response BRIEF (1-2 sentences max, or 2-5 words for acknowledgments)
- Include natural SSML: <break time="200ms"/>, <break time="300ms"/>
- Match the persona's voice exactly
- NO AI tells ("I understand", "That's interesting", etc.)

Return ONLY the response text with SSML. No JSON, no explanation.`;
        const model = genai.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: prompt,
            config: {
                temperature: 0.85,
                maxOutputTokens: 150,
            },
        });
        const response = await model;
        let content = response.text?.trim() || '';
        // Clean up any markdown or quotes
        content = content.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (!content || content.length < 5) {
            log.debug('Empty or too short LLM response');
            return null;
        }
        const result = {
            type,
            subtype,
            content: content.replace(/<[^>]+>/g, ''), // Plain text version
            ssml: content,
            source: 'llm',
            generatedAt: new Date(),
        };
        // Cache for future
        addToCache(personaId, result);
        log.info({ personaId, type, subtype }, '🎭 LLM humanization generated');
        return result;
    }
    catch (error) {
        log.warn({ error: String(error) }, 'LLM humanization failed');
        return null;
    }
}
// ============================================================================
// CACHE
// ============================================================================
function addToCache(personaId, humanization) {
    const key = `${personaId}-${humanization.type}`;
    let cache = humanizationCache.get(key);
    if (!cache) {
        cache = [];
        humanizationCache.set(key, cache);
    }
    cache.push(humanization);
    if (cache.length > MAX_CACHE) {
        cache.shift(); // Remove oldest
    }
}
function getCachedHumanization(personaId, type, subtype) {
    const key = `${personaId}-${type}`;
    const cache = humanizationCache.get(key) || [];
    const matching = cache.filter((h) => h.subtype === subtype);
    if (matching.length === 0)
        return null;
    // Return random from cache
    return matching[Math.floor(Math.random() * matching.length)];
}
/**
 * Clear humanization cache for a persona
 */
export function clearHumanizationCache(personaId) {
    for (const [key] of humanizationCache) {
        if (key.startsWith(personaId)) {
            humanizationCache.delete(key);
        }
    }
    log.debug({ personaId }, 'Cleared humanization cache');
}
// ============================================================================
// EXPORTS
// ============================================================================
export const llmHumanization = {
    generate: generateHumanizationLLM,
    clearCache: clearHumanizationCache,
};
//# sourceMappingURL=llm-advanced-humanization.js.map