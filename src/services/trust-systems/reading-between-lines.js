/**
 * Reading Between the Lines
 *
 * Understanding what's NOT being said - the gaps, the deflections,
 * the "I'm fine" that isn't fine.
 *
 * Philosophy: A great friend notices when you're holding back.
 * Not to push, but to create space. "You don't have to talk about it,
 * but I'm here if you want to."
 *
 * This system detects:
 * - Emotional/verbal mismatches ("I'm fine" + heavy topic)
 * - Topic avoidance patterns (consistently steering away)
 * - Deflection behaviors (changing subject, minimizing)
 * - Permission-seeking ("Can I tell you something?")
 * - Unfinished thoughts ("Never mind", trailing off)
 *
 * PERSISTENCE: User emotional profiles are persisted to Firestore.
 *
 * @module ReadingBetweenLines
 */
import { createLogger } from '../../utils/safe-logger.js';
import { createPersistenceStore } from '../persistence/index.js';
import { indexReadingBetweenLines } from '../data-layer/integrations/trust-integration.js';
const log = createLogger({ module: 'ReadingBetweenLines' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
/** Phrases that often mask real feelings */
const FINE_MASKS = [
    "i'm fine",
    "i'm okay",
    "it's fine",
    "it's okay",
    "i'm good",
    "it's whatever",
    "it doesn't matter",
    "it's not a big deal",
    "i'm over it",
    "i don't care anymore",
    'it is what it is',
    "i've moved on",
    // Natural conversation variants
    'it was fine',
    'it was okay',
    'was fine',
    'pretty standard',
    'not that bad',
    'could be worse',
    'nothing major',
    "it's nothing",
    'no big deal',
    // BETTER THAN HUMAN: Enhanced masking patterns
    'all good',
    "i'll be okay",
    "i'll be fine",
    'doing okay',
    'doing fine',
    'handling it',
    'dealing with it',
    'getting through',
    'managing',
    "i'm alright",
    "it's alright",
    "it's all good",
    "everything's fine",
    'all fine',
    'no worries',
    "i guess i'm okay",
    "yeah i'm fine",
    'totally fine',
    'completely fine',
    'perfectly fine',
    "i'm coping",
    'just dealing',
    // BETTER THAN HUMAN: Positive masks (excessive positivity about difficult situations)
    'actually relieved',
    'actually great',
    'actually a good thing',
    'best thing that happened',
    'blessing in disguise',
    'for the best',
    'meant to be',
    "i'm happy about it",
    'glad it happened',
    'weight off my shoulders',
    // Gen-Z / Casual deflection masks (P1 FIX)
    'literally fine',
    'literally okay',
    "i'm literally fine",
    "i'm literally okay",
    'lowkey fine',
    "i'm lowkey fine",
    'whatever honestly',
    'honestly whatever',
    "vibes are off but i'm fine",
    "it's giving fine",
    'not stressed',
    'we good',
    "i'm chillin",
    "i'm chilling",
    // More Gen-Z with "bestie" (P3 FIX)
    'literally fine bestie',
    "i'm literally fine bestie",
    'fine bestie',
    "i'm fine bestie",
    'all good bestie',
];
/** Nervous laughter patterns - masking with humor (P1 FIX) */
const NERVOUS_LAUGHTER_PATTERNS = [
    /\b(lol|lmao|haha|hehe|rofl)\s*(yeah|i'm|it's|that's|i guess|whatever)\s*(fine|okay|good|alright)/i,
    /\b(yeah|it's|i'm)\s*(fine|okay|good)\s*(lol|lmao|haha|hehe)/i,
    /\bhaha\s+(anyway|but|so)\b/i,
    /\b(lol|haha)\s+(it's nothing|no worries|i'm fine|all good)/i,
    /\b(fine|okay)\s+(haha|lol)\s*$/i,
    /\b😅|😂|🙃\s*(fine|okay|good|whatever)/i,
];
/** Excessive exclamation masking - forced positivity (P2 FIX) */
const EXCLAMATION_MASKING_PATTERNS = [
    /\b(i'm|it's|we're|that's)\s+(fine|okay|good|great|totally good)!/i, // "I'm fine!"
    /\bno worries!/i,
    /\ball good!/i,
    /\btotally (fine|okay|good)!/i,
    /!{2,}/, // Multiple exclamation marks often signal forced enthusiasm
];
/** Spiritual/fatalistic deflection - avoiding agency (P2 FIX) */
const SPIRITUAL_DEFLECTION_PATTERNS = [
    /\bgod has a plan\b/i,
    /\beverything happens for a reason\b/i,
    /\bit('s| is) (meant|supposed) to be\b/i,
    /\bwhat('s| is) meant to be will be\b/i,
    /\bin god('s|s) hands\b/i,
    /\bthe universe (has|knows)\b/i,
    /\bit('s| is) not (up to|for) me\b/i,
    /\blet go and let god\b/i,
    /\bthis too shall pass\b/i, // Can indicate avoidance of addressing feelings
    /\bgod('s| is) will\b/i,
];
/** Sudden topic change indicators - context needed (P2 FIX) */
const TOPIC_CHANGE_INDICATORS = [
    /^(so|anyway|but)\.*\s*(how|what|did|have|are)/i, // "So... how was your day?"
    /^that reminds me\b/i,
    /^speaking of\b/i,
    /^oh,? (by the way|btw)\b/i,
    /^random but\b/i,
];
/** Phrases that indicate wanting permission to share */
const PERMISSION_SEEKERS = [
    'can i tell you something',
    'is it okay if',
    "i don't know if i should say this",
    'this might sound',
    "you'll probably think",
    "i've never told anyone",
    "promise you won't",
    "i don't want to burden you",
    'i know this is silly but',
    'this is going to sound stupid',
    // BETTER THAN HUMAN: Reluctance/carrying patterns
    "i've been carrying",
    'been holding onto',
    "something i haven't",
    "don't want to dump",
    "don't want to put this on you",
    "if i'm being honest",
    "honestly i've been",
    'hard to say this',
    'this is hard but',
    'need to get something off',
];
/** Deflection patterns */
const DEFLECTION_PATTERNS = [
    /anyway,? (what about|how about|let's talk about)/i,
    /but enough about (me|that)/i,
    /it's not important/i,
    /forget i said/i,
    /never ?mind/i,
    /let's move on/i,
    /i don't (want to|wanna) talk about/i,
    /can we (change|talk about something)/i,
    /let's talk about something else/i,
    /sorry,? (i|that)/i,
    // More natural deflection patterns
    /let's not dwell/i,
    /what did you/i, // Turning conversation back
    // BETTER THAN HUMAN: Enhanced deflection patterns
    /anyway\b/i, // Simple "anyway" often signals deflection
    /so,? (what about|how (about|are)|did you)/i, // Sudden subject change
    /speaking of which/i,
    /on another note/i,
    /changing (the subject|topics)/i,
    /back to what we were/i,
    /that's (not|besides) the point/i,
    /whatever,? (anyway|it doesn't matter)/i,
    /\.\.\. (anyway|but|so)/i, // Trailing off then redirecting
    /i('d|'ll| just)? rather (not|talk about)/i,
    /we (don't need to|shouldn't) (talk|get into)/i,
    /it('s| is)? not (a big deal|worth|that important)/i,
    /just (wanted to|thought i'd) mention/i,
    /that aside/i,
    /different topic/i,
    /moving on/i,
    /drop it/i,
    /leave it (at that|alone)/i,
    /enough (about|of) (this|that)/i,
    /what about you/i,
    /so,? what's new/i,
    /but hey\b/i,
    // Gen-Z / Meme-based deflection (P1 FIX)
    /no thoughts head empty/i,
    /we don't talk about that/i,
    /that's not giving/i,
    /moving forward/i,
    /let's not go there/i,
    /it's giving avoidance/i,
    /not today satan/i,
    /touch grass/i, // "go outside" - dismissing topic
    /rent free/i, // dismissing something living in their head
    /slay (anyway|though)/i, // false confidence deflection
    /bestie,? (anyway|let's)/i,
];
/** Minimizing language */
const MINIMIZING_PATTERNS = [
    /it's (just|only) a/i,
    /i (just|only) (feel|think|am)/i,
    /it's (not that|no) big (deal|thing)/i,
    /i shouldn't complain/i,
    /other people have it worse/i,
    /i know i'm being/i,
    /i'm probably (just|being)/i,
    // BETTER THAN HUMAN: Guilt/self-invalidation patterns
    /i shouldn't (be|feel) (upset|sad|angry|hurt)/i,
    /i have no right to (feel|be|complain)/i,
    /first world problem/i,
    /i know (it's|this is) (stupid|silly|dumb)/i,
    /compared to (what|others|other people)/i,
    /at least (i|it|things)/i,
];
/** Heavy topics that "I'm fine" often masks */
const HEAVY_TOPIC_INDICATORS = [
    'divorce',
    'death',
    'cancer',
    'diagnosis',
    'fired',
    'laid off',
    'breakup',
    'cheated',
    'affair',
    'abuse',
    'addiction',
    'relapse',
    'suicide',
    'miscarriage',
    'infertility',
    'bankruptcy',
    'foreclosure',
    'accident',
    'hospital',
    'funeral',
    'died',
    'passed away',
    'lost my',
    // BETTER THAN HUMAN: Enhanced heavy topic detection
    'separated',
    'split up',
    'broke up',
    'anxiety',
    'depression',
    'depressed',
    'therapy',
    'therapist',
    'panic attack',
    'mental health',
    'laid me off',
    'let me go',
    'terminal',
    'surgery',
    'operation',
    'chemo',
    'radiation',
    'treatment',
    'sick',
    'illness',
    'disease',
    'dementia',
    'alzheimer',
    'stroke',
    'heart attack',
    'emergency',
    'icu',
    'overdose',
    'rehab',
    'detox',
    'sober',
    'drinking',
    'gambling',
    'debt',
    'eviction',
    'homeless',
    'custody',
    'restraining order',
    'assault',
    'attacked',
    'violation',
    'trauma',
    'ptsd',
    'flashback',
    'self-harm',
    'suicidal',
    'ended it',
    'took their life',
    'loss',
    'grief',
    'mourning',
    'gravely',
    'worst news',
    'bad news',
];
function serializeProfile(profile) {
    return {
        userId: profile.userId,
        avoidedTopics: profile.avoidedTopics.map((t) => ({
            ...t,
            lastAvoided: t.lastAvoided.toISOString(),
        })),
        falseFines: profile.falseFines.map((f) => ({
            ...f,
            timestamp: f.timestamp.toISOString(),
        })),
        hangingThreads: profile.hangingThreads.map((h) => ({
            ...h,
            lastMentioned: h.lastMentioned.toISOString(),
        })),
        permissionMoments: profile.permissionMoments.map((p) => ({
            ...p,
            timestamp: p.timestamp.toISOString(),
        })),
    };
}
function deserializeProfile(data) {
    return {
        userId: data.userId,
        avoidedTopics: data.avoidedTopics.map((t) => ({
            ...t,
            lastAvoided: new Date(t.lastAvoided),
        })),
        falseFines: data.falseFines.map((f) => ({
            ...f,
            timestamp: new Date(f.timestamp),
        })),
        hangingThreads: data.hangingThreads.map((h) => ({
            ...h,
            lastMentioned: new Date(h.lastMentioned),
        })),
        permissionMoments: data.permissionMoments.map((p) => ({
            ...p,
            timestamp: new Date(p.timestamp),
        })),
    };
}
// ============================================================================
// STORAGE (in-memory cache backed by Firestore)
// ============================================================================
const userProfiles = new Map();
const loadedUsers = new Set();
let persistence = null;
function getPersistence() {
    if (!persistence) {
        persistence = createPersistenceStore({
            collection: 'reading_between_lines',
            documentId: 'profile',
            syncIntervalMs: 5000,
        });
    }
    return persistence;
}
async function ensureUserLoaded(userId) {
    if (loadedUsers.has(userId))
        return;
    try {
        const data = await getPersistence().load(userId);
        if (data) {
            userProfiles.set(userId, deserializeProfile(data));
        }
        loadedUsers.add(userId);
        log.debug({ userId }, 'Loaded unsaid profile from persistence');
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to load unsaid profile');
        loadedUsers.add(userId);
    }
}
function persistProfile(userId) {
    const profile = userProfiles.get(userId);
    if (profile) {
        getPersistence().set(userId, serializeProfile(profile));
    }
}
/**
 * Flush persistence
 */
export async function flushReadingBetweenLinesPersistence() {
    await getPersistence().flush();
    log.info('Reading between lines persistence flushed');
}
/**
 * Shutdown reading between lines service
 */
export async function shutdownReadingBetweenLines() {
    await flushReadingBetweenLinesPersistence();
    // Clear state for clean restart
    loadedUsers.clear();
    userProfiles.clear();
    log.info('Reading between lines service shutdown complete');
}
function getOrCreateProfile(userId) {
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            avoidedTopics: [],
            falseFines: [],
            hangingThreads: [],
            permissionMoments: [],
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
/**
 * Get or create profile with persistence loading
 */
async function getOrCreateProfileAsync(userId) {
    await ensureUserLoaded(userId);
    return getOrCreateProfile(userId);
}
// ============================================================================
// CORE DETECTION
// ============================================================================
/**
 * Detect signals of what's NOT being said
 */
export function detectUnsaidSignals(userId, userMessage, context) {
    const signals = [];
    const lower = userMessage.toLowerCase();
    const profile = getOrCreateProfile(userId);
    let profileModified = false;
    // 1. Check for emotional mismatch ("I'm fine" + heavy context)
    const emotionalMismatch = detectEmotionalMismatch(lower, context, profile);
    if (emotionalMismatch) {
        signals.push(emotionalMismatch);
        profileModified = true; // detectEmotionalMismatch modifies profile
    }
    // 2. Check for topic avoidance
    const avoidance = detectTopicAvoidance(lower, context, profile);
    if (avoidance) {
        signals.push(avoidance);
        profileModified = true; // detectTopicAvoidance modifies profile
    }
    // 3. Check for deflection
    const deflection = detectDeflection(lower, context);
    if (deflection) {
        signals.push(deflection);
    }
    // 3.5. Check for nervous laughter (P1 FIX)
    const nervousLaughter = detectNervousLaughter(lower);
    if (nervousLaughter) {
        signals.push(nervousLaughter);
    }
    // 3.6. Check for exclamation masking (P2 FIX)
    const exclamationMask = detectExclamationMasking(lower, userMessage);
    if (exclamationMask) {
        signals.push(exclamationMask);
    }
    // 3.7. Check for spiritual deflection (P2 FIX)
    const spiritualDeflection = detectSpiritualDeflection(lower);
    if (spiritualDeflection) {
        signals.push(spiritualDeflection);
    }
    // 3.8. Check for sudden topic change (P2 FIX)
    const topicChange = detectTopicChange(lower, {
        topicBeforeThis: context.topicBeforeThis,
        recentTopics: context.recentTopics,
    });
    if (topicChange) {
        signals.push(topicChange);
    }
    // 3.9. Check for Gen-Z dismissive patterns (P3 FIX) - fires WITHOUT needing heavy context
    const genZDismissive = detectGenZDismissive(lower);
    if (genZDismissive) {
        signals.push(genZDismissive);
    }
    // 4. Check for permission-seeking
    const permissionSeek = detectPermissionSeeking(lower, userMessage);
    if (permissionSeek) {
        signals.push(permissionSeek);
        // Record this moment
        profile.permissionMoments.push({
            timestamp: new Date(),
            leadUp: userMessage.slice(0, 100),
            didShare: false, // Will update if they do share
        });
        profileModified = true;
    }
    // 5. Check for unfinished thoughts
    const unfinished = detectUnfinishedThought(userMessage, context);
    if (unfinished) {
        signals.push(unfinished);
    }
    // 6. Check for minimizing pain
    const minimizing = detectMinimizing(lower, context);
    if (minimizing) {
        signals.push(minimizing);
    }
    // Persist if profile was modified
    if (profileModified) {
        persistProfile(userId);
    }
    // Index significant signals to semantic memory
    if (signals.length > 0) {
        for (const signal of signals) {
            // Only index high-confidence signals
            if (signal.confidence >= 0.6) {
                indexReadingBetweenLines(userId, {
                    id: `unsaid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    observation: signal.observation,
                    whatTheySaid: userMessage.slice(0, 200),
                    whatTheyMeant: signal.underlying,
                });
            }
        }
        log.debug({
            userId,
            signalCount: signals.length,
            types: signals.map((s) => s.type),
        }, '🔍 Detected unsaid signals');
    }
    return signals;
}
/**
 * Detect when stated emotion doesn't match context
 */
function detectEmotionalMismatch(lower, context, profile) {
    // Check for "fine" masks
    const usesFine = FINE_MASKS.some((mask) => lower.includes(mask));
    if (!usesFine)
        return null;
    // Check if context suggests otherwise
    const hasHeavyTopic = HEAVY_TOPIC_INDICATORS.some((topic) => lower.includes(topic) || context.recentTopics?.some((t) => t.toLowerCase().includes(topic)));
    // Check if there's a negative emotion detected (without requiring high intensity)
    const emotionMismatch = context.detectedEmotion &&
        [
            'sad',
            'anxious',
            'angry',
            'hurt',
            'scared',
            'frustrated',
            'distressed',
            'overwhelmed',
        ].includes(context.detectedEmotion);
    // Also check for "but" patterns which often indicate masking
    // e.g., "I'm fine, but..." or "It's okay but the divorce..."
    const hasBut = /\b(but|though|although|however)\b/i.test(lower);
    const hasContradiction = usesFine && hasBut;
    // Check for minimizing language in same sentence as "fine"
    const hasMinimizing = MINIMIZING_PATTERNS.some((pattern) => pattern.test(lower));
    const minimizingWithFine = usesFine && hasMinimizing;
    if (hasHeavyTopic || emotionMismatch || hasContradiction || minimizingWithFine) {
        // Record this false fine
        profile.falseFines.push({
            timestamp: new Date(),
            context: lower.slice(0, 100),
            actualEmotion: context.detectedEmotion,
        });
        const phrases = [
            "You said you're fine, but... I'm not sure that's the whole story. You don't have to talk about it, but I'm here.",
            "I hear you saying it's okay, but something tells me there might be more to it. No pressure.",
            "That's a lot to be 'fine' about. I'm here if you want to say more.",
            "You don't have to be fine with me. What's really going on?",
        ];
        // Calculate confidence based on what triggered the detection
        let confidence = 0.65;
        if (hasHeavyTopic)
            confidence += 0.15;
        if (emotionMismatch)
            confidence += 0.1;
        if (hasContradiction)
            confidence += 0.05;
        if (minimizingWithFine)
            confidence += 0.05;
        confidence = Math.min(confidence, 0.95);
        return {
            type: 'emotional_mismatch',
            observation: "Said they're fine but context suggests otherwise",
            underlying: context.detectedEmotion || 'suppressed emotion',
            confidence,
            approach: 'create_space',
            phrase: phrases[Math.floor(Math.random() * phrases.length)],
            context: {
                userMessage: lower,
                statedEmotion: 'fine',
                detectedEmotion: context.detectedEmotion,
                recentTopics: context.recentTopics,
            },
        };
    }
    return null;
}
/**
 * Detect consistent avoidance of a topic
 */
function detectTopicAvoidance(lower, context, profile) {
    // Check if they're actively avoiding a topic that was just raised
    if (!context.topicBeforeThis)
        return null;
    const avoidancePhrases = [
        "i don't want to talk about",
        "let's not",
        'can we change',
        "i'd rather not",
        'not right now',
        'maybe later',
        'some other time',
    ];
    const isAvoiding = avoidancePhrases.some((phrase) => lower.includes(phrase));
    if (!isAvoiding)
        return null;
    // Track this avoidance
    const existingPattern = profile.avoidedTopics.find((t) => t.topic.toLowerCase() === context.topicBeforeThis?.toLowerCase());
    if (existingPattern) {
        existingPattern.avoidanceCount++;
        existingPattern.lastAvoided = new Date();
        existingPattern.deflectionPhrases.push(lower.slice(0, 50));
    }
    else {
        profile.avoidedTopics.push({
            topic: context.topicBeforeThis,
            avoidanceCount: 1,
            lastAvoided: new Date(),
            deflectionPhrases: [lower.slice(0, 50)],
        });
    }
    // Only flag if they've avoided this topic multiple times
    const avoidanceCount = existingPattern?.avoidanceCount || 1;
    if (avoidanceCount >= 2) {
        return {
            type: 'topic_avoidance',
            observation: `Has avoided "${context.topicBeforeThis}" ${avoidanceCount} times`,
            underlying: context.topicBeforeThis,
            confidence: Math.min(0.5 + avoidanceCount * 0.1, 0.9),
            approach: 'acknowledge_silently',
            context: {
                userMessage: lower,
                recentTopics: context.recentTopics,
            },
        };
    }
    return null;
}
/**
 * Detect deflection behaviors
 */
function detectDeflection(lower, context) {
    const matchedPattern = DEFLECTION_PATTERNS.find((pattern) => pattern.test(lower));
    if (!matchedPattern)
        return null;
    const phrases = [
        'I noticed you changed the subject. We can talk about that if you want, or not. Either way.',
        "We can move on, but if you want to come back to that later, I'm here.",
        "I'll follow your lead. Just know that topic is safe with me if you ever want to revisit it.",
    ];
    return {
        type: 'deflection',
        observation: 'Actively changed subject from previous topic',
        underlying: context.topicBeforeThis || 'previous topic',
        confidence: 0.75,
        approach: 'create_space',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: lower,
        },
    };
}
/**
 * Detect nervous laughter masking real feelings (P1 FIX)
 * "LOL yeah I'm fine" / "haha it's whatever" often masks distress
 */
function detectNervousLaughter(lower) {
    const hasNervousLaughter = NERVOUS_LAUGHTER_PATTERNS.some((pattern) => pattern.test(lower));
    if (!hasNervousLaughter)
        return null;
    const phrases = [
        "I noticed a 'haha' in there. Sometimes we use humor when things are harder than they seem.",
        'The laughter tells me something. How are you really doing?',
        "It's okay to not be okay, even when we joke about it.",
    ];
    return {
        type: 'emotional_mismatch',
        observation: 'Using humor/laughter to soften difficult feelings',
        underlying: 'real feelings masked with nervous laughter',
        confidence: 0.7,
        approach: 'name_gently',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: lower,
        },
    };
}
/**
 * Detect excessive exclamation masking - forced positivity (P2 FIX)
 * "No worries!" / "I'm totally fine!" with exclamation often masks stress
 */
function detectExclamationMasking(lower, original) {
    // Check original for exclamation marks
    const hasExclamationPattern = EXCLAMATION_MASKING_PATTERNS.some((pattern) => pattern.test(original));
    if (!hasExclamationPattern)
        return null;
    const phrases = [
        'That enthusiasm... are you sure everything is okay?',
        'I appreciate you trying to reassure me, but how are you really?',
        "You don't have to be positive for my sake.",
    ];
    return {
        type: 'emotional_mismatch',
        observation: 'Excessive positivity/exclamation may mask real feelings',
        underlying: 'forced enthusiasm covering stress',
        confidence: 0.6,
        approach: 'name_gently',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: original,
        },
    };
}
/**
 * Detect spiritual/fatalistic deflection (P2 FIX)
 * "God has a plan" / "Everything happens for a reason" can avoid addressing feelings
 */
function detectSpiritualDeflection(lower) {
    const hasSpiritual = SPIRITUAL_DEFLECTION_PATTERNS.some((pattern) => pattern.test(lower));
    if (!hasSpiritual)
        return null;
    const phrases = [
        'Faith can be a comfort. And... how are you feeling about all of this?',
        "I hear you trusting in something bigger. What's on your heart right now?",
        "Beyond what's meant to be... what do you want?",
    ];
    return {
        type: 'deflection',
        observation: 'Using spiritual framing to avoid addressing feelings directly',
        underlying: 'feelings about the situation',
        confidence: 0.55, // Lower confidence - spirituality is valid, not always deflection
        approach: 'create_space',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: lower,
        },
    };
}
/**
 * Detect sudden topic change (P2 FIX)
 * "So... how was your day?" after heavy topic = deflection
 */
function detectTopicChange(lower, context) {
    // Need previous topic OR recent heavy topics to detect change
    const previousTopic = context.topicBeforeThis || (context.recentTopics?.[0] ?? null);
    // Check if there's a heavy recent topic
    const hasHeavyRecentTopic = context.recentTopics?.some((topic) => HEAVY_TOPIC_INDICATORS.some((indicator) => topic.toLowerCase().includes(indicator)));
    // Need either explicit previous topic OR a heavy topic in recent topics
    if (!previousTopic && !hasHeavyRecentTopic)
        return null;
    const isTopicChange = TOPIC_CHANGE_INDICATORS.some((pattern) => pattern.test(lower));
    if (!isTopicChange)
        return null;
    const phrases = [
        'We can move on - and that previous topic is safe to return to whenever.',
        "I noticed we shifted gears. I'm here if you want to go back to that.",
        "New topic works for me. That earlier thing? Still here when you're ready.",
    ];
    return {
        type: 'deflection',
        observation: 'Changed subject from previous topic',
        underlying: previousTopic || 'previous heavy topic',
        confidence: 0.65,
        approach: 'create_space',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: lower,
            previousTopic: previousTopic || undefined,
            recentTopics: context.recentTopics,
        },
    };
}
/**
 * Detect Gen-Z dismissive patterns WITHOUT needing heavy context (P3 FIX)
 * These are phrases that ALWAYS warrant a gentle probe
 */
const GEN_Z_DISMISSIVE_PATTERNS = [
    /\bi('m| am) literally (fine|okay|good) bestie\b/i,
    /\bliterally fine bestie\b/i,
    /\bno thoughts head empty\b/i,
    /\bit('s| is) giving (fine|nothing|whatever)\b/i,
    /\bwe don't talk about that\b/i,
    /\bi('m| am) literally (so )?okay\b/i,
    /\b(fine|okay|good|great) bestie\b/i,
];
function detectGenZDismissive(lower) {
    const isGenZDismissive = GEN_Z_DISMISSIVE_PATTERNS.some((pattern) => pattern.test(lower));
    if (!isGenZDismissive)
        return null;
    const phrases = [
        'Bestie... how are you *really* doing?',
        "That's a vibe, but what's actually going on?",
        "I hear you. And... what's underneath that?",
    ];
    return {
        type: 'emotional_mismatch',
        observation: 'Using Gen-Z dismissive language that often masks real feelings',
        underlying: 'feelings beneath the casual facade',
        confidence: 0.65,
        approach: 'name_gently',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: lower,
        },
    };
}
/**
 * Detect when someone is seeking permission to share
 */
function detectPermissionSeeking(lower, original) {
    const isSeekingPermission = PERMISSION_SEEKERS.some((phrase) => lower.includes(phrase));
    if (!isSeekingPermission)
        return null;
    const phrases = [
        "Of course you can tell me. I'm listening.",
        'You can tell me anything. No judgment here.',
        "I'm here. Take your time.",
        'Whatever it is, I want to hear it.',
        "You don't need permission with me. Go ahead.",
    ];
    return {
        type: 'permission_seeking',
        observation: 'Seeking permission to share something vulnerable',
        underlying: 'something they want to share but feel uncertain about',
        confidence: 0.85,
        approach: 'gentle_probe',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: original,
        },
    };
}
/**
 * Detect unfinished thoughts
 */
function detectUnfinishedThought(message, context) {
    const unfinishedIndicators = [
        /never ?mind/i,
        /forget (it|i said)/i,
        /\.{3,}$/,
        /—$/,
        /i (was going to|wanted to) say/i,
        /actually,? (no|nothing)/i,
        /it's (nothing|stupid)/i,
        // BETTER THAN HUMAN: Enhanced unfinished thought patterns
        /well,?\s*(anyway|nevermind|forget it)/i,
        /i mean,?\s*—?$/i,
        /i just\s*—?$/i,
        /but\s*—?$/i,
        /you know what,?\s*(never ?mind|forget)/i,
        /i thought—/i,
        /it doesn't matter/i,
        /it's (fine|whatever|not important)/i,
        /\bugh\b/i,
        /\bsigh\b/i,
    ];
    const isUnfinished = unfinishedIndicators.some((pattern) => pattern.test(message));
    if (!isUnfinished)
        return null;
    const phrases = [
        "You started to say something. I'd like to hear it, if you want to share.",
        'I caught that. What were you going to say?',
        "It's not nothing. What's on your mind?",
        "I'm curious what you were about to say. No pressure though.",
    ];
    return {
        type: 'unfinished_thought',
        observation: 'Started to say something but stopped',
        underlying: 'a thought they pulled back from sharing',
        confidence: 0.7,
        approach: 'gentle_probe',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: message,
        },
    };
}
/**
 * Detect minimizing language
 */
function detectMinimizing(lower, context) {
    const isMinimizing = MINIMIZING_PATTERNS.some((pattern) => pattern.test(lower));
    if (!isMinimizing)
        return null;
    // Check for heavy topics that make minimizing more significant
    const hasHeavyTopic = HEAVY_TOPIC_INDICATORS.some((topic) => lower.includes(topic) || context.recentTopics?.some((t) => t.toLowerCase().includes(topic)));
    // Check for negative emotions that suggest they're downplaying
    const hasNegativeEmotion = context.detectedEmotion &&
        [
            'sad',
            'anxious',
            'angry',
            'hurt',
            'scared',
            'frustrated',
            'distressed',
            'overwhelmed',
        ].includes(context.detectedEmotion);
    // Strong minimizing patterns that are significant on their own
    const strongMinimizing = [
        /i shouldn't complain/i,
        /other people have it worse/i,
        /it's not that bad/i,
        /i'm probably (just|being) (dramatic|sensitive|silly)/i,
        /i know (i'm being|it's) silly/i,
        /it's (really )?nothing/i,
    ].some((pattern) => pattern.test(lower));
    // Trigger if: high emotion intensity OR heavy topic OR strong minimizing OR negative emotion
    const significantMinimizing = (context.emotionIntensity && context.emotionIntensity > 0.4) ||
        hasHeavyTopic ||
        strongMinimizing ||
        hasNegativeEmotion;
    if (!significantMinimizing)
        return null;
    const phrases = [
        "You don't have to minimize it. If it matters to you, it matters.",
        "It sounds like it's affecting you more than you're letting on.",
        "You're allowed to feel that fully. You don't have to make it smaller.",
        "Other people's struggles don't make yours less real.",
    ];
    // Calculate confidence
    let confidence = 0.55;
    if (hasHeavyTopic)
        confidence += 0.15;
    if (strongMinimizing)
        confidence += 0.15;
    if (hasNegativeEmotion)
        confidence += 0.1;
    if (context.emotionIntensity && context.emotionIntensity > 0.6)
        confidence += 0.1;
    confidence = Math.min(confidence, 0.9);
    return {
        type: 'minimizing_pain',
        observation: 'Downplaying something that seems significant',
        underlying: 'real pain being minimized',
        confidence,
        approach: 'create_space',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        context: {
            userMessage: lower,
            detectedEmotion: context.detectedEmotion,
        },
    };
}
// ============================================================================
// PROFILE ACCESS
// ============================================================================
/**
 * Get a user's unsaid profile for context building
 */
export function getUnsaidProfile(userId) {
    return userProfiles.get(userId) || null;
}
/**
 * Get topics this user consistently avoids
 */
export function getAvoidedTopics(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return [];
    return profile.avoidedTopics.filter((t) => t.avoidanceCount >= 2).map((t) => t.topic);
}
/**
 * Check if a topic should be avoided for this user
 */
export function shouldAvoidTopic(userId, topic) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return false;
    return profile.avoidedTopics.some((t) => t.topic.toLowerCase() === topic.toLowerCase() && t.avoidanceCount >= 2);
}
/**
 * Record that user actually did share after permission-seeking
 */
export function recordDidShare(userId) {
    const profile = userProfiles.get(userId);
    if (!profile || profile.permissionMoments.length === 0)
        return;
    // Mark most recent permission moment as shared
    const recent = profile.permissionMoments[profile.permissionMoments.length - 1];
    if (recent) {
        recent.didShare = true;
    }
}
// ============================================================================
// PERSISTENCE - Import/Export for Firestore
// ============================================================================
/**
 * Export the unsaid profile for persistence.
 */
export function exportUnsaidProfile(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    return serializeProfile(profile);
}
/**
 * Import a persisted unsaid profile into memory.
 * This restores deflection patterns from Firestore on session start.
 */
export function importUnsaidProfile(data) {
    if (!data || !data.userId) {
        log.warn('Invalid unsaid profile data - skipping import');
        return;
    }
    const profile = deserializeProfile(data);
    userProfiles.set(profile.userId, profile);
    log.info({
        userId: profile.userId,
        avoidedTopics: profile.avoidedTopics.length,
        falseFines: profile.falseFines.length,
        hangingThreads: profile.hangingThreads.length,
    }, '📥 Imported unsaid profile from Firestore');
}
/**
 * Record a deflection pattern (called when detectUnsaidSignals finds deflection).
 * This enables tracking across sessions.
 */
export function recordDeflectionPattern(userId, signal) {
    if (signal.type !== 'deflection' && signal.type !== 'topic_avoidance') {
        return; // Only track deflection patterns
    }
    const profile = getOrCreateProfile(userId);
    const topic = signal.underlying || 'unknown';
    // Find or create the pattern
    const existingPattern = profile.avoidedTopics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
    if (existingPattern) {
        existingPattern.avoidanceCount++;
        existingPattern.lastAvoided = new Date();
        if (signal.context.userMessage) {
            existingPattern.deflectionPhrases.push(signal.context.userMessage.slice(0, 50));
            // Keep last 10 phrases
            if (existingPattern.deflectionPhrases.length > 10) {
                existingPattern.deflectionPhrases = existingPattern.deflectionPhrases.slice(-10);
            }
        }
    }
    else {
        profile.avoidedTopics.push({
            topic,
            avoidanceCount: 1,
            lastAvoided: new Date(),
            deflectionPhrases: signal.context.userMessage
                ? [signal.context.userMessage.slice(0, 50)]
                : [],
        });
    }
    log.debug({ userId, topic, count: existingPattern?.avoidanceCount || 1 }, '📊 Recorded deflection pattern');
}
/**
 * Get deflection statistics for a user (for LLM context).
 */
export function getDeflectionStats(userId) {
    const profile = userProfiles.get(userId);
    if (!profile || profile.avoidedTopics.length === 0) {
        return { topics: [], totalDeflections: 0, mostAvoided: null };
    }
    const topics = profile.avoidedTopics
        .filter((t) => t.avoidanceCount >= 1)
        .map((t) => ({
        topic: t.topic,
        count: t.avoidanceCount,
        lastSeen: t.lastAvoided,
    }))
        .sort((a, b) => b.count - a.count);
    const totalDeflections = topics.reduce((sum, t) => sum + t.count, 0);
    const mostAvoided = topics.length > 0 ? topics[0].topic : null;
    return { topics, totalDeflections, mostAvoided };
}
/**
 * Build deflection awareness context for LLM injection.
 */
export function buildDeflectionContext(userId) {
    const stats = getDeflectionStats(userId);
    if (stats.totalDeflections === 0)
        return '';
    const lines = ['[DEFLECTION AWARENESS - Better Than Human Pattern Detection]'];
    lines.push('You notice patterns humans miss. These are topics they consistently avoid:');
    lines.push('');
    for (const topic of stats.topics.slice(0, 5)) {
        const daysSince = Math.floor((Date.now() - topic.lastSeen.getTime()) / (24 * 60 * 60 * 1000));
        const recency = daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`;
        lines.push(`• "${topic.topic}" - deflected ${topic.count}x (last: ${recency})`);
    }
    lines.push('');
    lines.push("Create space for these topics. Never push. They'll share when ready.");
    return lines.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    detectUnsaidSignals,
    getUnsaidProfile,
    exportUnsaidProfile,
    importUnsaidProfile,
    getAvoidedTopics,
    shouldAvoidTopic,
    recordDidShare,
    recordDeflectionPattern,
    getDeflectionStats,
    buildDeflectionContext,
};
//# sourceMappingURL=reading-between-lines.js.map