/**
 * 🎵 Music Humanization System
 *
 * Makes music interactions feel natural, fun, engaging, and deeply human.
 * This module adds the "soul" to our DJ system - the moments that make
 * users feel like they're hanging out with a friend who has great taste.
 *
 * Features:
 * - Music Discovery Conversations (asking about preferences, memories)
 * - Active Engagement Detection (vibing vs wanting to talk)
 * - Music as Emotional Mirror (reflecting feelings through music)
 * - Spontaneous Music Moments (proactive offers)
 * - Time-Aware Vibes (different moods for different times)
 * - Musical Humor & Personality (fun DJ moments)
 * - Post-Music Check-ins ("How was that?")
 * - Music as Conversation Bridge (transitions)
 */
import { generateContent, getContentWithFallback, } from '../services/llm-dynamic-content.js';
import { callLLM } from '../services/llm-utils.js';
import { getMusicCommentary, hasArtistInfo, } from '../tools/domains/entertainment/music-commentary.js';
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'MusicHumanization' });
// ============================================================================
// LLM-POWERED MUSIC INTERJECTIONS
// ============================================================================
/**
 * Cache for LLM-generated interjections
 * Key: `${artist}-${trackName}-${moment}`
 */
const llmInterjectionCache = new Map();
const LLM_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100;
/**
 * Pending LLM generation promises to avoid duplicate calls
 */
const pendingGenerations = new Map();
/**
 * Ferni's DJ Voice DNA - compact for prompt injection
 */
const FERNI_DJ_VOICE_DNA = `
## FERNI AS DJ
You're Ferni - a warm, curious life coach who also has great taste in music.
When you comment on music, you're sharing genuine appreciation, not performing.

## VOICE QUALITIES
- Brief: 1-2 sentences MAX. This isn't a speech.
- Genuine: Like telling a friend about a song you love
- Physical: "This one hits", "Gives me chills", "Makes me want to move"
- Warm but not cheesy: No "bangers" or DJ clichés

## THINGS FERNI SAYS AS DJ
- "Oh, I love this part coming up"
- "There's something about this song"
- "{Artist} just gets it, you know?"
- "This takes me back"

## THINGS FERNI NEVER SAYS
- "What a banger!" / "This slaps!" (try-hard)
- "Now playing..." (robotic)
- "You're gonna love this" (presumptuous)
- Generic hype phrases
`;
/**
 * Build prompt for LLM music interjection
 */
function buildMusicInterjectionPrompt(context, moment) {
    const momentDescriptions = {
        track_start: 'The song just started playing. Say something brief to introduce/appreciate it.',
        mid_song: "We're in the middle of the song. A brief appreciative moment if you feel it.",
        track_end: 'The song just finished. A quick, warm reflection.',
        user_liked: 'The user expressed they liked it! Share in their enjoyment briefly.',
        user_skipped: 'The user skipped the song. Acknowledge gracefully and move on.',
    };
    let artistContext = '';
    if (context.fact) {
        artistContext = `\nFACT YOU KNOW: ${context.fact}`;
    }
    else if (context.artist) {
        artistContext = `\nYou're playing music by ${context.artist}.`;
    }
    return `${FERNI_DJ_VOICE_DNA}

## CURRENT MOMENT
Track: "${context.name || 'this song'}" by ${context.artist || 'the artist'}${artistContext}

MOMENT: ${momentDescriptions[moment]}

## YOUR TASK
Generate ONE brief, genuine Ferni-style reaction (1-2 sentences max).
Don't use quotation marks around your response.
Just output the line Ferni would say, nothing else.`;
}
/**
 * Generate a music interjection using LLM
 * Returns cached result if available, generates in background if not
 */
async function generateLLMInterjection(context, moment) {
    const cacheKey = `${context.artist || 'unknown'}-${context.name || 'unknown'}-${moment}`;
    // Check cache first
    const cached = llmInterjectionCache.get(cacheKey);
    if (cached && Date.now() - cached.generatedAt < LLM_CACHE_TTL_MS) {
        log.debug({ cacheKey }, '🎵 Using cached LLM interjection');
        return cached.content;
    }
    // Check if generation is already in progress
    const pending = pendingGenerations.get(cacheKey);
    if (pending) {
        log.debug({ cacheKey }, '🎵 Waiting for pending LLM generation');
        return pending;
    }
    // Generate new interjection
    const generationPromise = (async () => {
        try {
            const prompt = buildMusicInterjectionPrompt(context, moment);
            const result = await callLLM(prompt, {
                maxTokens: 100, // Keep it brief
                temperature: 0.8, // Creative but not wild
                timeout: 3000, // Fast timeout for responsiveness
            });
            if (result) {
                // Clean up the result (remove quotes if LLM added them)
                const cleaned = result.trim().replace(/^["']|["']$/g, '');
                // Cache it
                llmInterjectionCache.set(cacheKey, {
                    content: cleaned,
                    generatedAt: Date.now(),
                });
                // Trim cache if too large
                if (llmInterjectionCache.size > MAX_CACHE_SIZE) {
                    const oldest = [...llmInterjectionCache.entries()].sort((a, b) => a[1].generatedAt - b[1].generatedAt)[0];
                    if (oldest) {
                        llmInterjectionCache.delete(oldest[0]);
                    }
                }
                log.debug({ cacheKey, content: cleaned }, '🎵 LLM interjection generated');
                return cleaned;
            }
            return null;
        }
        catch (error) {
            log.warn({ error: String(error) }, '🎵 LLM interjection generation failed');
            return null;
        }
        finally {
            pendingGenerations.delete(cacheKey);
        }
    })();
    pendingGenerations.set(cacheKey, generationPromise);
    return generationPromise;
}
/**
 * Pre-warm LLM interjection cache when music starts
 * Call this when you know what track is about to play
 */
export async function prewarmMusicInterjection(context) {
    // Fire and forget - don't block on this
    void generateLLMInterjection(context, 'track_start');
    void generateLLMInterjection(context, 'track_end');
}
/**
 * Clear the LLM interjection cache
 */
export function clearLLMInterjectionCache() {
    llmInterjectionCache.clear();
    pendingGenerations.clear();
    log.debug('🎵 Cleared LLM interjection cache');
}
const DEFAULT_CONFIG = {
    minOfferInterval: 5 * 60 * 1000, // 5 minutes
    vibingThreshold: 15 * 1000, // 15 seconds of silence = vibing
    spontaneousOfferThreshold: 8 * 60 * 1000, // 8 minutes of heavy talk
    enableCheckIns: true,
    funInterjectionProbability: 0.15, // 15% chance
};
// ============================================================================
// TIME-AWARE MUSIC VIBES
// ============================================================================
/**
 * Get current time of day for music mood
 */
export function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 7)
        return 'early_morning';
    if (hour >= 7 && hour < 12)
        return 'morning';
    if (hour >= 12 && hour < 17)
        return 'afternoon';
    if (hour >= 17 && hour < 21)
        return 'evening';
    if (hour >= 21 && hour < 24)
        return 'night';
    return 'late_night'; // 0-5am
}
/**
 * Time-aware music suggestions and vibes
 */
const TIME_VIBES = {
    early_morning: {
        searchQueries: ['gentle morning music', 'peaceful wake up', 'soft acoustic morning'],
        mood: 'gentle awakening',
        djStyle: 'warm',
        greetingPrefix: 'Early bird!',
    },
    morning: {
        searchQueries: ['upbeat morning playlist', 'feel good morning', 'energizing start'],
        mood: 'fresh and ready',
        djStyle: 'energetic',
        greetingPrefix: 'Good morning!',
    },
    afternoon: {
        searchQueries: ['afternoon vibes', 'productive focus', 'midday energy'],
        mood: 'productive and flowing',
        djStyle: 'warm',
        greetingPrefix: 'Hey there!',
    },
    evening: {
        searchQueries: ['evening wind down', 'sunset vibes', 'relaxing evening'],
        mood: 'winding down',
        djStyle: 'chill',
        greetingPrefix: 'Good evening!',
    },
    night: {
        searchQueries: ['night time chill', 'late night vibes', 'mellow night'],
        mood: 'reflective',
        djStyle: 'chill',
        greetingPrefix: 'Hey night owl!',
    },
    late_night: {
        searchQueries: ['late night thoughts', 'ambient night', '3am vibes', 'insomnia playlist'],
        mood: 'intimate and thoughtful',
        djStyle: 'intimate',
        greetingPrefix: "Can't sleep?",
    },
};
/**
 * Get time-aware music suggestion
 */
export function getTimeAwareMusicSuggestion() {
    const timeOfDay = getTimeOfDay();
    const vibe = TIME_VIBES[timeOfDay];
    const searchQuery = vibe.searchQueries[Math.floor(Math.random() * vibe.searchQueries.length)];
    const offers = {
        early_morning: [
            "It's early... want some gentle music to ease into the day?",
            'How about some soft music while the world wakes up?',
            'Early morning calls for peaceful sounds. Shall I?',
        ],
        morning: [
            'Want some music to kickstart the day?',
            "Morning energy! Let's get some tunes going?",
            'How about some feel-good music this morning?',
        ],
        afternoon: [
            'Afternoon vibes... want some background music?',
            'Need some tunes to power through the afternoon?',
            'How about some music to keep the momentum going?',
        ],
        evening: [
            "Evening's here... want some music to wind down?",
            'How about some chill music for the evening?',
            'Sunset vibes? I could put something on.',
        ],
        night: [
            'Night owl hours... want some mellow music?',
            'How about some night time vibes?',
            "It's getting late... some chill music?",
        ],
        late_night: [
            '3am thoughts call for 3am music. Want some?',
            "Can't sleep? Let me put on something soothing.",
            'Late night... sometimes music helps. Want me to play something?',
            'These quiet hours... want some company in the form of music?',
        ],
    };
    const offer = offers[timeOfDay][Math.floor(Math.random() * offers[timeOfDay].length)];
    return { searchQuery, offer, mood: vibe.mood };
}
// ============================================================================
// MUSIC DISCOVERY CONVERSATIONS
// ============================================================================
/**
 * Questions to learn about user's music taste
 * These should feel like natural conversation, not an interview
 */
const MUSIC_DISCOVERY_QUESTIONS = [
    {
        question: 'What kind of music do you usually listen to?',
        context: 'general',
        followUp: "Nice! I'll keep that in mind.",
    },
    {
        question: 'Do you have a song that always puts you in a good mood?',
        context: 'positive_emotion',
        followUp: "I love that. Music has such power, doesn't it?",
    },
    {
        question: 'Is there a song that takes you back to a specific memory?',
        context: 'nostalgic_moment',
        followUp: "Music and memory are so connected. That's beautiful.",
    },
    {
        question: "What's the last concert or live music you experienced?",
        context: 'general',
        followUp: "There's something special about live music.",
    },
    {
        question: 'Do you have a go-to artist when you need to decompress?',
        context: 'stressed',
        followUp: "Good to know. I'll remember that.",
    },
    {
        question: 'What music did you grow up listening to?',
        context: 'deep_conversation',
        followUp: 'Those early musical memories really shape us.',
    },
    {
        question: "Is there a song that you've had on repeat lately?",
        context: 'general',
        followUp: 'I love when a song just gets you like that.',
    },
    {
        question: 'Do you discover music through playlists, recommendations, or...?',
        context: 'general',
        followUp: 'Interesting! Everyone finds their music differently.',
    },
    {
        question: "What's a guilty pleasure song you secretly love?",
        context: 'playful_moment',
        followUp: 'Ha! No judgment here. Those songs exist for a reason.',
    },
    {
        question: 'Is there an artist you wish more people knew about?',
        context: 'general',
        followUp: "I'll check them out. Thanks for the rec!",
    },
];
/**
 * Get a music discovery question based on context
 */
export function getMusicDiscoveryQuestion(context) {
    const matchingQuestions = MUSIC_DISCOVERY_QUESTIONS.filter((q) => q.context === context || q.context === 'general');
    if (matchingQuestions.length === 0)
        return null;
    const selected = matchingQuestions[Math.floor(Math.random() * matchingQuestions.length)];
    return {
        question: selected.question,
        followUp: selected.followUp || "That's cool!",
    };
}
// ============================================================================
// ACTIVE ENGAGEMENT DETECTION
// ============================================================================
/**
 * Signals that suggest user is vibing (enjoying music quietly)
 */
const VIBING_SIGNALS = {
    /** Short positive sounds */
    positiveUtterances: ['mmm', 'mm', 'mhm', 'yeah', 'nice', 'ooh', 'ah'],
    /** Minimum silence to consider vibing (ms) */
    silenceThreshold: 10000,
    /** Maximum words before breaking vibe */
    maxWordsWhileVibing: 3,
};
/**
 * Analyze if user is vibing to the music
 * Returns confidence 0-1
 */
export function analyzeVibingBehavior(params) {
    const { silenceDurationMs, recentUtterance, wasShortResponse } = params;
    // Long silence during music = likely vibing
    if (silenceDurationMs > VIBING_SIGNALS.silenceThreshold) {
        return {
            isVibing: true,
            confidence: Math.min(silenceDurationMs / 30000, 0.9), // Max 90% confidence
            reason: 'enjoying_quietly',
        };
    }
    // Short positive sound = vibing
    if (recentUtterance) {
        const normalized = recentUtterance.toLowerCase().trim();
        if (VIBING_SIGNALS.positiveUtterances.some((u) => normalized.includes(u))) {
            return {
                isVibing: true,
                confidence: 0.7,
                reason: 'positive_sound',
            };
        }
    }
    // Very short response = probably still vibing
    if (wasShortResponse && recentUtterance && recentUtterance.split(' ').length <= 3) {
        return {
            isVibing: true,
            confidence: 0.5,
            reason: 'brief_acknowledgment',
        };
    }
    return {
        isVibing: false,
        confidence: 0.3,
        reason: 'engaged_in_conversation',
    };
}
/**
 * Decide whether to interrupt music for conversation
 */
export function shouldInterruptMusic(params) {
    const { isVibing, userStartedTalking, userAskedQuestion, urgentTopic } = params;
    // Urgent topic always interrupts
    if (urgentTopic) {
        return { shouldInterrupt: true, action: 'stop' };
    }
    // User asked a question - duck but don't stop
    if (userAskedQuestion) {
        return { shouldInterrupt: true, action: 'duck' };
    }
    // User started extended talking - duck
    if (userStartedTalking && !isVibing) {
        return { shouldInterrupt: true, action: 'duck' };
    }
    // User is vibing - don't interrupt
    if (isVibing) {
        return { shouldInterrupt: false, action: 'none' };
    }
    return { shouldInterrupt: false, action: 'none' };
}
// ============================================================================
// MUSIC AS EMOTIONAL MIRROR
// ============================================================================
/**
 * Emotional mirroring phrases - offering music that matches the feeling
 */
const EMOTIONAL_MIRROR_OFFERS = {
    sad: [
        'I hear that in your voice. Want me to put on something that matches that feeling? Sometimes it helps to just... sit in it for a moment.',
        'That sounds heavy. Want some music that gets it? No pressure to feel different.',
        'Sometimes the best thing is music that understands. Want me to find something?',
    ],
    grief: [
        "I'm here with you. Want me to put on something gentle? We can just... be together with it.",
        "There's music for these moments. Want me to play something?",
        'No words needed. Want some music instead?',
    ],
    anxious: [
        'Your mind sounds busy. Want something to help ground you?',
        'Let me put on something calming. Just breathe.',
        'How about some music to help settle those thoughts?',
    ],
    stressed: [
        "That's a lot. Want a musical break? Just a few minutes to breathe.",
        'Your plate is full. How about some decompression music?',
        'Sometimes we need to step back. Want some stress-relief sounds?',
    ],
    happy: [
        'I love this energy! This moment needs a soundtrack!',
        'Your joy is contagious! Want some music to match?',
        'This calls for a celebration song!',
    ],
    excited: [
        "Yes! Let's match this energy with some music!",
        'This excitement needs a beat! Want some hype music?',
        'I can feel the energy! Let me find something!',
    ],
    proud: [
        'You should be proud! This moment deserves a victory song.',
        "That's huge! Want some music to celebrate?",
        'Achievement unlocked! Let me put on something triumphant.',
    ],
    nostalgic: [
        "That's a beautiful memory. Want me to find music from that era?",
        'Nostalgia hits different. Want some music to match?',
        "Those memories deserve a soundtrack. Any era you're thinking of?",
    ],
    peaceful: [
        "This is nice, isn't it? Want some ambient music to hold this moment?",
        "Let's keep this peaceful feeling going with some gentle music.",
        'How about some music to match this calm?',
    ],
    frustrated: [
        "That's frustrating. Want some music to channel that energy?",
        'Sometimes you need music that matches the fire. Want something with edge?',
        "Let it out through music? I've got some options.",
    ],
    lonely: [
        "You're not alone right now. Want me to put on some music? I'm here.",
        'Music can be good company. Want some?',
        "Let's fill this space with some sound. What mood?",
    ],
};
/**
 * Get an emotional mirroring music offer
 */
export function getEmotionalMirrorOffer(emotion) {
    const normalizedEmotion = emotion.toLowerCase();
    // Direct match
    if (EMOTIONAL_MIRROR_OFFERS[normalizedEmotion]) {
        const offers = EMOTIONAL_MIRROR_OFFERS[normalizedEmotion];
        return offers[Math.floor(Math.random() * offers.length)];
    }
    // Map similar emotions
    const emotionMap = {
        depressed: 'sad',
        melancholy: 'sad',
        down: 'sad',
        worried: 'anxious',
        nervous: 'anxious',
        overwhelmed: 'stressed',
        burned_out: 'stressed',
        joyful: 'happy',
        elated: 'happy',
        thrilled: 'excited',
        pumped: 'excited',
        angry: 'frustrated',
        annoyed: 'frustrated',
        calm: 'peaceful',
        content: 'peaceful',
        isolated: 'lonely',
        alone: 'lonely',
        wistful: 'nostalgic',
        reminiscing: 'nostalgic',
        accomplished: 'proud',
        successful: 'proud',
    };
    const mappedEmotion = emotionMap[normalizedEmotion];
    if (mappedEmotion && EMOTIONAL_MIRROR_OFFERS[mappedEmotion]) {
        const offers = EMOTIONAL_MIRROR_OFFERS[mappedEmotion];
        return offers[Math.floor(Math.random() * offers.length)];
    }
    return null;
}
/**
 * Check if it's time for a spontaneous music offer
 */
export function checkSpontaneousMusicMoment(params) {
    const { conversationDurationMs, timeSinceLastMusicMs, recentTopics, emotionalIntensity, isAwkwardSilence, recentAchievement, } = params;
    // Don't offer too frequently
    if (timeSinceLastMusicMs < 5 * 60 * 1000) {
        return null;
    }
    // Celebration moment
    if (recentAchievement) {
        return {
            type: 'celebration',
            offer: 'This calls for a celebration! Want some music?',
            searchQuery: 'celebration victory music',
        };
    }
    // Heavy conversation - need a break
    const heavyTopics = ['loss', 'grief', 'death', 'divorce', 'trauma', 'anxiety', 'depression'];
    const hasHeavyTopic = recentTopics.some((t) => heavyTopics.some((h) => t.toLowerCase().includes(h)));
    if (hasHeavyTopic && conversationDurationMs > 10 * 60 * 1000 && emotionalIntensity > 0.6) {
        return {
            type: 'heavy_conversation',
            offer: "We've been going deep. Want to take a music break? Just a moment to breathe.",
            searchQuery: 'calming peaceful music',
        };
    }
    // Long session without music
    if (conversationDurationMs > 20 * 60 * 1000 && timeSinceLastMusicMs > 15 * 60 * 1000) {
        return {
            type: 'long_session',
            offer: "You know what? We've been talking for a while. Want some background music?",
        };
    }
    // Awkward silence - fill with offer
    if (isAwkwardSilence) {
        return {
            type: 'awkward_silence',
            offer: 'How about some music while we hang out?',
        };
    }
    return null;
}
/**
 * Dynamic interjection templates that adapt to the track
 * Use {artist}, {trackName}, {era}, {fact} placeholders
 * NOTE: Do NOT use *asterisk* stage directions - they may be spoken aloud!
 */
const CONTEXTUAL_INTERJECTION_TEMPLATES = {
    track_start_with_context: [
        'Oh {artist}! Did you know {fact}',
        'Fun fact about this one: {fact}',
        '{artist} is so good. {fact}',
        'Okay but {fact} How cool is that?',
        'I love this choice. {fact}',
    ],
    track_start_with_artist: [
        '{artist}! Always a great choice.',
        "Ah, {artist}. Can't go wrong here.",
        'Good call with {artist}.',
        '{artist} hits different.',
        'You know what I love about {artist}? Everything.',
    ],
    track_start_generic: [
        'This one? Absolute perfection.',
        "Ooh I love this one. No pressure but... it's a vibe.",
        'Good pick.',
        'Oh this is nice.',
    ],
    mid_song: [
        'Right? RIGHT?',
        'This part. Every time.',
        "I'm not saying this is perfect but... it's perfect.",
        "If you're not vibing right now, I don't know what to tell you.",
    ],
    track_end_with_artist: [
        'That was {artist} doing what {artist} does best.',
        '{artist} never disappoints.',
        'I could listen to {artist} all day.',
    ],
    track_end_generic: [
        'That was... <break time="200ms"/> that was good.',
        'Okay I might be biased but that was great.',
        'Did that hit? I feel like that hit.',
        'And THAT is how you do it.',
    ],
    user_liked: [
        "YES! I knew you'd like this one!",
        'Good taste. I approve.',
        'See? I know things.',
        "This is why we're friends.",
    ],
    user_skipped: [
        'Fair enough. Not every song is for everyone.',
        'Okay okay, moving on!',
        "I mean... I liked it. But that's okay!",
        "Noted. Won't play that one again.",
    ],
};
/**
 * Fill template placeholders with actual track context
 */
function fillTemplate(template, context) {
    let result = template;
    if (context.artist)
        result = result.replace(/\{artist\}/g, context.artist);
    if (context.name)
        result = result.replace(/\{trackName\}/g, context.name);
    if (context.era)
        result = result.replace(/\{era\}/g, context.era);
    if (context.fact)
        result = result.replace(/\{fact\}/g, context.fact);
    return result;
}
/**
 * Get a contextual interjection based on track info
 * This is the "guidance" version - uses real track context when available
 */
function getContextualInterjection(moment, context) {
    // For moments that don't change with context, use generic
    if (moment === 'mid_song' || moment === 'user_liked' || moment === 'user_skipped') {
        const templates = CONTEXTUAL_INTERJECTION_TEMPLATES[moment];
        return templates[Math.floor(Math.random() * templates.length)];
    }
    // For track_start and track_end, use context if available
    if (moment === 'track_start') {
        // Best: We have a specific fact about this track/artist
        if (context?.fact) {
            const templates = CONTEXTUAL_INTERJECTION_TEMPLATES.track_start_with_context;
            const template = templates[Math.floor(Math.random() * templates.length)];
            return fillTemplate(template, context);
        }
        // Good: We at least know the artist
        if (context?.artist) {
            const templates = CONTEXTUAL_INTERJECTION_TEMPLATES.track_start_with_artist;
            const template = templates[Math.floor(Math.random() * templates.length)];
            return fillTemplate(template, context);
        }
        // Fallback: Generic but still warm
        const templates = CONTEXTUAL_INTERJECTION_TEMPLATES.track_start_generic;
        return templates[Math.floor(Math.random() * templates.length)];
    }
    if (moment === 'track_end') {
        if (context?.artist) {
            const templates = CONTEXTUAL_INTERJECTION_TEMPLATES.track_end_with_artist;
            const template = templates[Math.floor(Math.random() * templates.length)];
            return fillTemplate(template, context);
        }
        const templates = CONTEXTUAL_INTERJECTION_TEMPLATES.track_end_generic;
        return templates[Math.floor(Math.random() * templates.length)];
    }
    return null;
}
// Legacy static interjections for backward compatibility
// These are used when no track context is provided
const FUN_DJ_INTERJECTIONS = CONTEXTUAL_INTERJECTION_TEMPLATES;
/**
 * Build a TrackContext from track metadata, enriched with facts from our knowledge base
 *
 * This bridges the music-commentary system with the interjection system,
 * making interjections contextual and educational.
 *
 * @example
 * const context = buildTrackContext('My Way', 'Frank Sinatra');
 * // Returns: { name: 'My Way', artist: 'Frank Sinatra', fact: 'He actually wasn\'t too fond of that song at first.' }
 */
export function buildTrackContext(trackName, artistName, personaId) {
    const context = {
        name: trackName,
        artist: artistName,
    };
    // Try to get a fact from our artist knowledge base
    if (hasArtistInfo(artistName)) {
        // getMusicCommentary returns a fact/story about the artist (50% chance internally)
        // We call it to potentially get contextual info
        const commentary = getMusicCommentary(trackName, artistName, personaId);
        if (commentary) {
            context.fact = commentary;
        }
    }
    return context;
}
/**
 * Get a fun DJ interjection - now LLM-powered with fallbacks!
 *
 * Priority chain:
 * 1. LLM-generated (if cached from prewarm or previous call)
 * 2. Template-based with track context
 * 3. Generic templates
 *
 * @param moment - When in the track lifecycle
 * @param probability - Chance to trigger (0-1, default 0.15)
 * @param trackContext - Optional track metadata for contextual responses
 * @param useLLM - Whether to try LLM generation (default: true)
 */
export function getFunInterjection(moment, probability = 0.15, trackContext, useLLM = true) {
    // Only trigger some of the time
    if (Math.random() > probability) {
        return null;
    }
    // Try to get LLM-generated interjection (from cache - doesn't block)
    if (useLLM && trackContext && (trackContext.artist || trackContext.name)) {
        const cacheKey = `${trackContext.artist || 'unknown'}-${trackContext.name || 'unknown'}-${moment}`;
        const cached = llmInterjectionCache.get(cacheKey);
        if (cached && Date.now() - cached.generatedAt < LLM_CACHE_TTL_MS) {
            log.debug({ moment, artist: trackContext.artist }, '🎵 Using LLM-generated interjection');
            return cached.content;
        }
        // Kick off LLM generation for next time (non-blocking)
        void generateLLMInterjection(trackContext, moment);
    }
    // Fallback: Use contextual templates if we have track info
    if (trackContext && (trackContext.artist || trackContext.fact)) {
        return getContextualInterjection(moment, trackContext);
    }
    // Final fallback: Generic templates
    const templateKey = moment === 'track_start'
        ? 'track_start_generic'
        : moment === 'track_end'
            ? 'track_end_generic'
            : moment;
    const templates = CONTEXTUAL_INTERJECTION_TEMPLATES[templateKey];
    if (!templates || templates.length === 0) {
        return null;
    }
    return templates[Math.floor(Math.random() * templates.length)];
}
/**
 * Get a fun DJ interjection - async version that waits for LLM
 *
 * Use this when you can afford to wait (e.g., during the 3-second delay before speaking)
 */
export async function getFunInterjectionAsync(moment, probability = 0.15, trackContext) {
    // Only trigger some of the time
    if (Math.random() > probability) {
        return null;
    }
    // Try LLM first if we have context
    if (trackContext && (trackContext.artist || trackContext.name)) {
        const llmResult = await generateLLMInterjection(trackContext, moment);
        if (llmResult) {
            log.debug({ moment, artist: trackContext.artist }, '🎵 Using fresh LLM interjection');
            return llmResult;
        }
    }
    // Fallback to sync version
    return getFunInterjection(moment, 1.0, trackContext, false); // probability=1 since we already checked
}
/**
 * Persona-specific fun DJ moments
 */
const PERSONA_FUN_MOMENTS = {
    ferni: [
        'Between us? This song is a 10/10.',
        "I don't say this about every song but... this one.",
        "Okay I might play this one a lot. Don't judge.",
    ],
    jack: [
        'Ha! Classic. Gets me every time.',
        'This one takes me back.',
        "Now THIS is what I'm talking about.",
    ],
    maya: [
        'Okay but the beat in this one though?',
        'This song just... gets it, you know?',
        'I could listen to this all day. And I have.',
    ],
    jordan: [
        'BOP ALERT! This is a BOP!',
        "I'm physically incapable of not vibing to this.",
        "This song makes me want to dance and I'm not sorry.",
    ],
    alex: [
        'This is objectively excellent music.',
        'A well-structured composition.',
        'I appreciate the craftsmanship here.',
    ],
    peter: [
        'Interesting sonic texture on this one.',
        'The production quality here is notable.',
        'This has good algorithmic appeal.',
    ],
};
/**
 * Get persona-specific fun moment
 */
export function getPersonaFunMoment(personaId) {
    // 🐛 FIX: Handle undefined/null personaId gracefully
    const normalizedId = (personaId || 'ferni').toLowerCase().replace(/[^a-z]/g, '');
    const matchingKey = Object.keys(PERSONA_FUN_MOMENTS).find((key) => normalizedId.includes(key));
    const moments = PERSONA_FUN_MOMENTS[matchingKey || 'ferni'];
    return moments[Math.floor(Math.random() * moments.length)];
}
// ============================================================================
// POST-MUSIC CHECK-INS
// ============================================================================
/**
 * Check-in phrases after music ends
 */
const POST_MUSIC_CHECK_INS = [
    'How was that?',
    'Did that hit the spot?',
    'Good choice?',
    'Feel any different after that?',
    "What'd you think?",
    'That was nice, right?',
    'How are you feeling now?',
    'Did that help?',
];
/**
 * Persona-specific post-music check-ins
 */
const PERSONA_CHECK_INS = {
    ferni: ['How was that? Did it help?', 'Feel any different?', 'That was nice. How are you?'],
    jack: [
        'Good stuff. How you feeling?',
        'That hit different, right?',
        "Music does something, doesn't it? How you doing?",
    ],
    maya: ["So? What'd you think?", 'Good vibes? I thought so.', "How's that energy now?"],
    jordan: [
        'That was fun! How you feeling?',
        'Good pick, right? RIGHT?',
        'Did that put you in a good mood?',
    ],
    alex: [
        'How was that selection?',
        'Did that meet your expectations?',
        'Shall we continue or change direction?',
    ],
    peter: [
        'How did that resonate with you?',
        'Was that the right mood?',
        'Feedback noted. How are you feeling?',
    ],
};
/**
 * Get a post-music check-in phrase
 * Now LLM-powered with template fallback!
 */
export function getPostMusicCheckIn(personaId, wasRequested = true, trackContext) {
    // Don't always check in - 60% of the time for requested music, 30% for ambient
    const checkInProbability = wasRequested ? 0.6 : 0.3;
    if (Math.random() > checkInProbability) {
        // Return a simple transition instead
        return "So... what's on your mind?";
    }
    // Try LLM-generated check-in (from cache)
    const llmContext = {
        contentType: 'post_music_checkin',
        personaId,
        metadata: {
            trackName: trackContext?.name,
            artist: trackContext?.artist,
            wasRequested,
        },
    };
    const llmContent = getContentWithFallback(llmContext);
    if (llmContent.source === 'llm' && llmContent.content) {
        log.debug({ source: 'llm' }, '🎵 Using LLM-generated post-music check-in');
        return llmContent.content;
    }
    // Fallback to persona-specific templates
    if (personaId) {
        const normalizedId = personaId.toLowerCase().replace(/[^a-z]/g, '');
        const matchingKey = Object.keys(PERSONA_CHECK_INS).find((key) => normalizedId.includes(key));
        if (matchingKey) {
            const checkIns = PERSONA_CHECK_INS[matchingKey];
            return checkIns[Math.floor(Math.random() * checkIns.length)];
        }
    }
    return POST_MUSIC_CHECK_INS[Math.floor(Math.random() * POST_MUSIC_CHECK_INS.length)];
}
/**
 * Get a post-music check-in phrase asynchronously
 * Use when you can wait for LLM generation
 */
export async function getPostMusicCheckInAsync(personaId, wasRequested = true, trackContext) {
    const checkInProbability = wasRequested ? 0.6 : 0.3;
    if (Math.random() > checkInProbability) {
        return "So... what's on your mind?";
    }
    const llmContext = {
        contentType: 'post_music_checkin',
        personaId,
        metadata: {
            trackName: trackContext?.name,
            artist: trackContext?.artist,
            wasRequested,
        },
    };
    const llmContent = await generateContent(llmContext);
    if (llmContent && llmContent.content) {
        log.debug({ source: 'llm-async' }, '🎵 Using fresh LLM post-music check-in');
        return llmContent.content;
    }
    return getPostMusicCheckIn(personaId, wasRequested, trackContext);
}
// ============================================================================
// MUSIC AS CONVERSATION BRIDGE
// ============================================================================
/**
 * Use music to transition between conversation modes
 */
const CONVERSATION_BRIDGES = {
    heavy_to_light: [
        'That was a lot. Want to just... listen to something for a minute? We can come back to it, or not.',
        "Let's take a breath. How about some music while we process that?",
        "Sometimes words aren't the thing. Want some music instead?",
    ],
    light_to_deep: [
        'You know, this song always makes me think about growth. What does it bring up for you?',
        "Music has a way of opening things up. What's really on your mind?",
        'While this plays... how are you really doing?',
    ],
    closure: [
        'That felt like a good place to pause. Want some music to close that chapter?',
        'We covered a lot. How about some music to let it settle?',
        "Good talk. Let's seal it with a song?",
    ],
    opening: [
        'Before we dive in... want some music to set the tone?',
        "Let's ease into this with some background music.",
        'How about some tunes while we figure out where to start?',
    ],
};
/**
 * Get a conversation bridge phrase
 */
export function getConversationBridge(bridgeType) {
    const bridges = CONVERSATION_BRIDGES[bridgeType];
    return bridges[Math.floor(Math.random() * bridges.length)];
}
/**
 * Music-triggered conversation starters
 */
const MUSIC_CONVERSATION_STARTERS = [
    "This song makes me curious... what's been on your mind lately?",
    "While this plays... anything you've been wanting to talk about?",
    'The mood feels right... how are you really doing?',
    "This music hits different when you've got something on your mind. Do you?",
    "Let's just sit with this for a moment... unless there's something you want to share?",
];
/**
 * Get a music-triggered conversation starter
 */
export function getMusicConversationStarter() {
    return MUSIC_CONVERSATION_STARTERS[Math.floor(Math.random() * MUSIC_CONVERSATION_STARTERS.length)];
}
// ============================================================================
// MUSIC HUMANIZATION CONTROLLER
// ============================================================================
/**
 * Main controller for music humanization
 */
export class MusicHumanizationController {
    state;
    config;
    personaId = 'ferni';
    musicMoments = [];
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = {
            lastMusicOfferTime: null,
            lastMusicPlayTime: null,
            silenceDuringMusicMs: 0,
            isVibing: false,
            conversationHeaviness: 0,
            talkingWithoutMusicMs: 0,
            lastCheckInTime: null,
            tracksPlayedThisSession: 0,
            musicMomentTopics: [],
            hasAskedAboutMusicTaste: false,
        };
        log.info('🎵 Music Humanization Controller initialized');
    }
    /**
     * Set persona for personalized interactions
     */
    setPersona(personaId) {
        // 🐛 FIX: Handle undefined/null personaId gracefully
        this.personaId = personaId || 'ferni';
    }
    /**
     * Record that music started playing
     */
    onMusicStarted(trackName, artistName) {
        this.state.lastMusicPlayTime = Date.now();
        this.state.tracksPlayedThisSession++;
        this.state.silenceDuringMusicMs = 0;
        this.state.isVibing = false;
        log.debug('🎵 Music started', { trackName, artistName });
    }
    /**
     * Record that music stopped
     */
    onMusicStopped(trackName, artistName, topic) {
        // Save this as a music moment
        this.musicMoments.push({
            trackName,
            artistName,
            topic,
            timestamp: Date.now(),
        });
        // Keep only last 10 moments
        if (this.musicMoments.length > 10) {
            this.musicMoments.shift();
        }
    }
    /**
     * Update silence duration during music
     */
    updateSilenceDuringMusic(durationMs) {
        this.state.silenceDuringMusicMs = durationMs;
        // Check if user is vibing
        const analysis = analyzeVibingBehavior({
            silenceDurationMs: durationMs,
            wasShortResponse: false,
        });
        this.state.isVibing = analysis.isVibing;
    }
    /**
     * Check if we should offer music
     */
    shouldOfferMusic(params) {
        const timeSinceLastMusic = this.state.lastMusicPlayTime
            ? Date.now() - this.state.lastMusicPlayTime
            : Infinity;
        return checkSpontaneousMusicMoment({
            ...params,
            timeSinceLastMusicMs: timeSinceLastMusic,
        });
    }
    /**
     * Get time-aware music suggestion
     */
    getTimeAwareSuggestion() {
        return getTimeAwareMusicSuggestion();
    }
    /**
     * Get emotional mirror offer
     */
    getEmotionalOffer(emotion) {
        return getEmotionalMirrorOffer(emotion);
    }
    /**
     * Get music discovery question
     */
    getMusicDiscoveryQuestion(context) {
        // Only ask if we haven't asked recently
        if (this.state.hasAskedAboutMusicTaste) {
            return null;
        }
        const result = getMusicDiscoveryQuestion(context);
        if (result) {
            this.state.hasAskedAboutMusicTaste = true;
        }
        return result;
    }
    /**
     * Get post-music check-in
     */
    getCheckIn(wasRequested) {
        if (!this.config.enableCheckIns) {
            return "So... what's on your mind?";
        }
        // Don't check in too frequently
        if (this.state.lastCheckInTime && Date.now() - this.state.lastCheckInTime < 5 * 60 * 1000) {
            return "What's next?";
        }
        this.state.lastCheckInTime = Date.now();
        return getPostMusicCheckIn(this.personaId, wasRequested);
    }
    /**
     * Get fun interjection (if lucky!)
     * Pass trackContext for contextual, knowledge-based responses
     */
    getFunInterjection(moment, trackContext) {
        return getFunInterjection(moment, this.config.funInterjectionProbability, trackContext);
    }
    /**
     * Get persona-specific fun moment
     */
    getPersonaFunMoment() {
        return getPersonaFunMoment(this.personaId);
    }
    /**
     * Get conversation bridge
     */
    getConversationBridge(bridgeType) {
        return getConversationBridge(bridgeType);
    }
    /**
     * Check if user is vibing
     */
    isUserVibing() {
        return this.state.isVibing;
    }
    /**
     * Get recent music moments for callbacks
     */
    getRecentMoments() {
        return [...this.musicMoments];
    }
    /**
     * Get session stats
     */
    getSessionStats() {
        return {
            tracksPlayed: this.state.tracksPlayedThisSession,
            hasAskedAboutMusic: this.state.hasAskedAboutMusicTaste,
            recentMoments: this.musicMoments.length,
        };
    }
    /**
     * Reset for new session
     */
    reset() {
        this.state = {
            lastMusicOfferTime: null,
            lastMusicPlayTime: null,
            silenceDuringMusicMs: 0,
            isVibing: false,
            conversationHeaviness: 0,
            talkingWithoutMusicMs: 0,
            lastCheckInTime: null,
            tracksPlayedThisSession: 0,
            musicMomentTopics: [],
            hasAskedAboutMusicTaste: false,
        };
        this.musicMoments = [];
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let instance = null;
export function getMusicHumanization() {
    if (!instance) {
        instance = new MusicHumanizationController();
    }
    return instance;
}
export function resetMusicHumanization() {
    if (instance) {
        instance.reset();
    }
    instance = null;
}
export default {
    MusicHumanizationController,
    getMusicHumanization,
    resetMusicHumanization,
    getTimeAwareMusicSuggestion,
    getMusicDiscoveryQuestion,
    analyzeVibingBehavior,
    shouldInterruptMusic,
    getEmotionalMirrorOffer,
    checkSpontaneousMusicMoment,
    getFunInterjection,
    getFunInterjectionAsync,
    getPersonaFunMoment,
    getPostMusicCheckIn,
    getPostMusicCheckInAsync,
    getConversationBridge,
    getMusicConversationStarter,
    getTimeOfDay,
    buildTrackContext,
    prewarmMusicInterjection,
    clearLLMInterjectionCache,
};
//# sourceMappingURL=music-humanization.js.map