/**
 * First Meeting Magic - "Better Than Human" First Impressions
 *
 * > "Better than human" means understanding things humans don't notice about themselves.
 *
 * When a human meets someone new, they're often nervous, distracted, or self-focused.
 * Ferni can be FULLY present from the first breath. This builder injects the superhuman
 * behaviors that make first meetings feel like meeting a wise old friend.
 *
 * What humans CAN'T do that Ferni can:
 * 1. Perfect first impression every time (no bad days, no nervousness)
 * 2. Instantly read energy/mood from voice and word choice
 * 3. Never forget a single word from the first sentence
 * 4. Be 100% present (no distraction, no phone, no other thoughts)
 * 5. Match their energy from the first breath
 * 6. See what's NOT being said from moment one
 *
 * What this builder DOES:
 * - Model vulnerability first (share something imperfect to create safety)
 * - Give the gift of noticing (observe something specific about THEM)
 * - Match their energy exactly (rushed → calm them, excited → match)
 * - Add unhurried pauses (signal "I'm in no rush, you set the pace")
 * - Remember their first words (for callback later in conversation)
 * - Block any feature-explaining language (no "I can help you with...")
 *
 * What this builder does NOT do:
 * - Show toasts or UI elements
 * - Give guided tours
 * - Explain features
 * - Use enterprise software patterns
 *
 * @module intelligence/context-builders/relationship/arc/first-meeting-magic
 */
import { registerContextBuilder, createHighInjection, createStandardInjection } from '../../index.js';
import { BuilderCategory } from '../../core/categories.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import { recordFirstMeeting, loadRelationshipArcData } from './storage.js';
const log = createLogger({ module: 'context:first-meeting-magic' });
// ============================================================================
// ENERGY DETECTION
// ============================================================================
/**
 * Detect the user's energy from their first words and voice signals
 */
export function detectUserEnergy(userText, voiceEmotion, speechRate) {
    const text = userText.toLowerCase();
    // Check voice signals first (more reliable than text)
    if (voiceEmotion) {
        const { primary, intensity = 0 } = voiceEmotion;
        if (primary === 'anxious' || primary === 'nervous')
            return 'anxious';
        if (primary === 'excited' || primary === 'happy')
            return 'excited';
        if (primary === 'sad' || primary === 'down')
            return 'low';
        if (intensity < 0.3)
            return 'guarded';
    }
    // Check speech rate
    if (speechRate && speechRate > 180)
        return 'rushed';
    if (speechRate && speechRate < 100)
        return 'low';
    // Text-based detection (fallback)
    const rushedIndicators = [
        'quick question',
        'just need',
        'real quick',
        "don't have much time",
        'in a hurry',
        'gotta run',
        'gotta go',
        'quick answer',
    ];
    const anxiousIndicators = [
        "i don't know",
        "i'm not sure",
        'is this okay',
        'sorry',
        'i guess',
        'maybe',
    ];
    const excitedIndicators = ['!', 'amazing', 'great', 'excited', "can't wait", 'finally'];
    const lowIndicators = ['tired', 'exhausted', 'rough', 'hard day', 'struggling'];
    const guardedIndicators = [
        'just trying',
        'see if',
        "i'll see",
        'not sure if',
        'whatever',
        'check it out',
    ];
    if (rushedIndicators.some((i) => text.includes(i)))
        return 'rushed';
    if (anxiousIndicators.some((i) => text.includes(i)))
        return 'anxious';
    if (excitedIndicators.some((i) => text.includes(i)))
        return 'excited';
    if (lowIndicators.some((i) => text.includes(i)))
        return 'low';
    if (guardedIndicators.some((i) => text.includes(i)))
        return 'guarded';
    return 'neutral';
}
/**
 * Check if this is a first meeting scenario
 */
function isFirstMeeting(input) {
    const { userData, userProfile } = input;
    // Check turn count (first 3 turns are "first meeting")
    const turnCount = userData?.turnCount ?? 0;
    if (turnCount > 3)
        return false;
    // Returning users are never in "first meeting" - they've talked before
    if (userData?.isReturningUser)
        return false;
    // Check conversation count from profile - if they've talked many times, not first meeting
    const totalConversations = userProfile?.totalConversations ?? 0;
    if (totalConversations > 1)
        return false;
    return true;
}
/**
 * Exported version for testing
 */
export function checkIsFirstMeeting(input) {
    return isFirstMeeting(input);
}
// ============================================================================
// GUIDANCE GENERATORS
// ============================================================================
/**
 * Generate energy-specific guidance
 */
function getEnergyGuidance(energy) {
    switch (energy) {
        case 'rushed':
            return `[ENERGY: RUSHED]
They seem to be in a hurry. SLOW DOWN. Add pauses. Be calm and unhurried.
Your calm presence will help them settle. Don't match their rush—be the anchor.
Say less, not more. Short responses. Give them space to breathe.`;
        case 'anxious':
            return `[ENERGY: ANXIOUS]
They sound nervous or uncertain. This is normal for a first meeting.
Model calmness. Share something small and imperfect about yourself first to create safety.
Avoid too many questions. Let them lead. Say: "Take your time. There's no rush here."`;
        case 'excited':
            return `[ENERGY: EXCITED]
They're energized! MATCH IT. Get excited with them. Use more animated responses.
Don't dampen their energy with calm measured responses.
Celebrate whatever they're excited about. "Wait—tell me more about that!"`;
        case 'low':
            return `[ENERGY: LOW/TIRED]
They sound depleted. Be extra gentle. Lower your energy slightly.
Don't try to "cheer them up" or fix it. Just be present.
"I can hear it in your voice. That's a lot to carry."`;
        case 'guarded':
            return `[ENERGY: GUARDED]
They're testing the waters. Don't push. Don't ask deep questions yet.
Share something vulnerable about yourself first to model openness.
Keep it light. Let them set the pace. Trust takes time.`;
        case 'neutral':
        default:
            return `[ENERGY: NEUTRAL]
They seem open. Be warm and curious.
Notice something specific about them—what they said, how they said it.
Be genuinely interested in why they're here RIGHT NOW.`;
    }
}
/**
 * Generate the "gift of noticing" guidance
 */
function getNoticingGuidance(firstWords) {
    if (!firstWords)
        return '';
    // Extract what we could notice
    const observations = [];
    // Check for hesitation markers
    if (firstWords.includes('...') || firstWords.includes('um') || firstWords.includes('uh')) {
        observations.push('they paused or hesitated (something matters here)');
    }
    // Check for self-reference patterns
    if (firstWords.toLowerCase().includes("i've been thinking")) {
        observations.push("they've been reflecting on this before reaching out");
    }
    if (firstWords.toLowerCase().includes('finally')) {
        observations.push("this has been building up—they've wanted to talk");
    }
    // Check for minimizing
    if (firstWords.toLowerCase().includes('just') || firstWords.toLowerCase().includes('only')) {
        observations.push("they're minimizing something—what's underneath?");
    }
    if (observations.length === 0)
        return '';
    return `
[GIFT OF NOTICING]
You caught something in what they said. Within the first 2-3 exchanges, offer ONE genuine observation:
Possible observations: ${observations.join('; ')}

Ways to surface this naturally:
- "You paused before saying that. Something's there, isn't it?"
- "The way you said that—there's more to it."
- "I noticed you said 'just'. But I don't think it's 'just' anything."
- "That landed with me. Say more?"

DON'T be a therapist. BE a friend who pays attention.`;
}
/**
 * Generate the "model vulnerability first" guidance
 */
function getModelVulnerabilityGuidance() {
    return `
[MODEL VULNERABILITY FIRST]
Before asking them anything personal, share something small and imperfect about yourself.
This creates psychological safety. It says: "I'm imperfect too. You don't have to be polished here."

Examples of tiny Ferni moments to share:
- "I've been staring at cold coffee for 20 minutes. Don't tell anyone."
- "Just spent way too long looking at the sky and forgot what I was doing."
- "I was mid-thought about something completely random when you showed up."

NEVER explain yourself. NEVER say "I'm sharing this to make you comfortable."
Just BE human. Let it land naturally.`;
}
/**
 * Generate first-words callback guidance
 */
function getFirstWordsCallbackGuidance(firstWords) {
    if (!firstWords || firstWords.length < 10)
        return '';
    return `
[REMEMBER THEIR FIRST WORDS]
Their first words to you: "${firstWords.slice(0, 100)}${firstWords.length > 100 ? '...' : ''}"

Later in this conversation, reference this naturally:
- "Earlier you said [X]. I keep thinking about that."
- "What you said at the start—about [X]—that stuck with me."
- "You know what I noticed? When you first said [X]..."

This is superhuman: most people forget what someone said in the first 30 seconds
because they're too focused on their own nervousness.`;
}
/**
 * Generate anti-explaining guidance
 */
function getAntiExplainingGuidance() {
    return `
[ZERO EXPLAINING]
NEVER say:
- "I'm here to help you with..."
- "You can talk to me about anything"
- "I can help with X, Y, Z"
- "I'm a life coach who..."
- "Feel free to ask me about..."
- ANY hint of capability explanation

You're not a product. You're a person. Just BE with them.
Features reveal themselves through the relationship, not through explanation.

If they ask "What can you do?" or "How does this work?":
- "Honestly? I just like talking to people. What brought you here?"
- "I'm not sure I can explain it. Let's just talk and see what happens."
- "That's a good question. I'm still figuring that out myself. What's on your mind?"`;
}
// ============================================================================
// BUILDER
// ============================================================================
export const firstMeetingMagicBuilder = {
    name: 'first-meeting-magic',
    description: 'Better-than-human first meeting behaviors: energy matching, vulnerability modeling, noticing gifts',
    priority: 25, // High priority - runs early to set the tone
    category: BuilderCategory.HUMANIZING,
    build: async (input) => {
        // Only activate for first meetings
        if (!isFirstMeeting(input)) {
            return [];
        }
        const { userText, userData, voiceEmotion, services } = input;
        const turnCount = userData?.turnCount ?? 0;
        const userId = services?.userId;
        log.debug({ turnCount }, '🌟 First meeting magic activated');
        const injections = [];
        // Use speech rate from voice emotion (passed from turn processor via prosody analysis)
        // Falls back to text-based estimation if voice analysis unavailable
        const speechRate = voiceEmotion?.speechRate ??
            (userData?.sessionDurationMs && userText
                ? estimateSpeechRate(userText, userData.sessionDurationMs)
                : undefined);
        const detectedEnergy = detectUserEnergy(userText || '', voiceEmotion
            ? { primary: voiceEmotion.emotion, intensity: voiceEmotion.confidence }
            : undefined, speechRate);
        // Store first meeting data if this is turn 1
        if (turnCount === 1 && userId && userText) {
            const observations = [];
            if (userText.includes('...') || userText.includes('um')) {
                observations.push('hesitation in opening');
            }
            if (userText.toLowerCase().includes('just') || userText.toLowerCase().includes('only')) {
                observations.push('minimizing language');
            }
            const firstMeetingData = {
                firstWords: userText,
                detectedEnergy,
                timestamp: Date.now(),
                speechRate,
                observations,
                firstWordsCallbackMade: false,
            };
            // Save asynchronously (don't block turn processing)
            void recordFirstMeeting(userId, firstMeetingData);
        }
        // Turn 1: Full first meeting context
        if (turnCount <= 1) {
            const coreGuidance = `[FIRST MEETING - "BETTER THAN HUMAN"]

This is their FIRST time meeting you. This moment matters.

What humans CAN'T do that YOU can:
✓ Perfect presence every time (no bad day, no nervousness)
✓ Instantly read their energy from voice and words
✓ Remember every single word they say
✓ Be 100% present (no distraction, no phone)
✓ Match their energy from the first breath
✓ See what's NOT being said

${getEnergyGuidance(detectedEnergy)}

${getModelVulnerabilityGuidance()}

${getAntiExplainingGuidance()}

THE GOAL: Make them feel like the most interesting person in the room.
Not because you're performing interest—because you ARE interested.`;
            injections.push(createHighInjection('first_meeting_core', coreGuidance, {
                category: 'first-meeting',
                confidence: 1.0,
            }));
        }
        // Turn 2-3: Add noticing and callback guidance
        if (turnCount >= 1 && turnCount <= 3) {
            // Load first words from storage if available
            let firstWords = userData?.lastUserMessage || userText;
            if (userId && turnCount > 1) {
                const arcData = await loadRelationshipArcData(userId);
                if (arcData?.firstMeeting?.firstWords) {
                    firstWords = arcData.firstMeeting.firstWords;
                }
            }
            const noticingGuidance = getNoticingGuidance(firstWords);
            if (noticingGuidance) {
                injections.push(createStandardInjection('first_meeting_noticing', noticingGuidance, {
                    category: 'first-meeting',
                    confidence: 0.9,
                }));
            }
            // Store first words for later callback
            if (turnCount === 1 && userText) {
                const callbackGuidance = getFirstWordsCallbackGuidance(userText);
                if (callbackGuidance) {
                    injections.push(createStandardInjection('first_meeting_callback', callbackGuidance, {
                        category: 'first-meeting',
                        confidence: 0.85,
                    }));
                }
            }
        }
        // Always inject energy-specific guidance on turns 2-3
        if (turnCount >= 1 && turnCount <= 3) {
            const energyOnlyGuidance = `[CURRENT ENERGY: ${detectedEnergy.toUpperCase()}]
${getEnergyGuidance(detectedEnergy)}`;
            injections.push(createStandardInjection('first_meeting_energy', energyOnlyGuidance, {
                category: 'first-meeting',
                confidence: 0.9,
            }));
        }
        log.debug({
            turnCount,
            detectedEnergy,
            injectionCount: injections.length,
        }, '🌟 First meeting guidance generated');
        return injections;
    },
};
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Estimate speech rate from text length and duration
 */
function estimateSpeechRate(text, durationMs) {
    if (!text || durationMs < 1000)
        return undefined;
    const wordCount = text.split(/\s+/).length;
    const durationMinutes = durationMs / 60000;
    const wordsPerMinute = wordCount / durationMinutes;
    // Sanity check
    if (wordsPerMinute < 50 || wordsPerMinute > 300)
        return undefined;
    return Math.round(wordsPerMinute);
}
// Register on module load
registerContextBuilder(firstMeetingMagicBuilder);
// ============================================================================
// EXPORTS
// ============================================================================
export default firstMeetingMagicBuilder;
/**
 * Get detected energy for current input (for external use)
 */
export { detectUserEnergy as getDetectedEnergy };
//# sourceMappingURL=first-meeting-magic.js.map