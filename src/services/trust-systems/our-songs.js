/**
 * Our Songs - Shared Musical Memories
 *
 * The most powerful relationship marker: "Remember when this was playing?"
 *
 * Philosophy: Music is temporal and emotional. When a song plays during
 * a significant moment, it becomes "our song" - a shared memory that
 * creates instant connection when heard again.
 *
 * This system tracks:
 * - Songs playing during emotional breakthroughs
 * - Music present during celebrations and milestones
 * - Tracks that accompanied vulnerable moments
 * - Songs the user explicitly loved or connected with
 *
 * The magic: When that song plays again, Ferni remembers.
 * "Oh... this was playing when you finally forgave yourself."
 *
 * @module OurSongs
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'OurSongs' });
// ============================================================================
// DETECTION PATTERNS - What makes a moment significant
// ============================================================================
/** Phrases that indicate a breakthrough moment */
const BREAKTHROUGH_INDICATORS = [
    'i finally',
    'i realized',
    "i've been afraid to",
    'i never told anyone',
    'i think i understand now',
    "i'm ready to",
    'it just clicked',
    'i forgive',
    "i'm letting go",
    "i've been holding onto",
];
/** Phrases indicating celebration */
const CELEBRATION_INDICATORS = [
    'i got the',
    'they said yes',
    'i did it',
    'i passed',
    'it worked',
    "i can't believe it",
    'this is amazing',
    'best day',
    'finally happened',
    'dream come true',
];
/** Phrases indicating vulnerability */
const VULNERABILITY_INDICATORS = [
    "i'm scared",
    "i've never said this",
    'this is hard to talk about',
    'i feel so',
    "i don't know who else to tell",
    "i've been struggling",
    'the truth is',
    'i pretend to be',
    "i'm not okay",
];
/** Phrases indicating they love the music */
const MUSIC_LOVE_INDICATORS = [
    'i love this song',
    'this is my jam',
    'oh my god this song',
    'turn it up',
    "don't skip this",
    'this hits different',
    'play this again',
    'this is perfect',
    'i needed this',
];
// ============================================================================
// IN-MEMORY STORE (will be persisted via unified persistence)
// ============================================================================
const profiles = new Map();
function getOrCreateProfile(userId) {
    let profile = profiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            songs: [],
            totalMoments: 0,
            preferences: {
                lovedGenres: [],
                lovedArtists: [],
                preferredMoods: [],
            },
        };
        profiles.set(userId, profile);
    }
    return profile;
}
/**
 * Detect if the current moment is significant enough to mark a song
 */
export function detectSignificantMoment(context) {
    const text = context.recentUserText.toLowerCase();
    // Check for breakthrough
    if (BREAKTHROUGH_INDICATORS.some((indicator) => text.includes(indicator))) {
        return {
            isSignificant: true,
            type: 'breakthrough',
            emotion: detectEmotion(text, context.emotion),
        };
    }
    // Check for celebration
    if (CELEBRATION_INDICATORS.some((indicator) => text.includes(indicator))) {
        return {
            isSignificant: true,
            type: 'celebration',
            emotion: 'excited',
        };
    }
    // Check for vulnerability
    if (VULNERABILITY_INDICATORS.some((indicator) => text.includes(indicator))) {
        return {
            isSignificant: true,
            type: 'vulnerable',
            emotion: 'vulnerable',
        };
    }
    // Check for music love
    if (MUSIC_LOVE_INDICATORS.some((indicator) => text.includes(indicator))) {
        return {
            isSignificant: true,
            type: 'they_loved_it',
            emotion: 'happy',
        };
    }
    return { isSignificant: false };
}
function detectEmotion(text, providedEmotion) {
    if (providedEmotion) {
        // Map provided emotion to our types
        const emotionMap = {
            happy: 'happy',
            excited: 'excited',
            sad: 'vulnerable',
            anxious: 'vulnerable',
            calm: 'peaceful',
            grateful: 'grateful',
            proud: 'proud',
            hopeful: 'hopeful',
        };
        return emotionMap[providedEmotion] || 'grateful';
    }
    // Detect from text
    if (text.includes('happy') || text.includes('joy'))
        return 'happy';
    if (text.includes('excited') || text.includes("can't wait"))
        return 'excited';
    if (text.includes('grateful') || text.includes('thankful'))
        return 'grateful';
    if (text.includes('proud'))
        return 'proud';
    if (text.includes('peaceful') || text.includes('calm'))
        return 'peaceful';
    if (text.includes('hope') || text.includes('looking forward'))
        return 'hopeful';
    if (text.includes('scared') || text.includes('afraid'))
        return 'vulnerable';
    if (text.includes('relieved'))
        return 'relieved';
    return 'grateful'; // Default positive emotion
}
/**
 * Record a song as "our song" - a shared musical memory
 */
export function recordOurSong(params) {
    const profile = getOrCreateProfile(params.userId);
    // Check if we already have this song
    const existingSong = profile.songs.find((s) => s.song.name.toLowerCase() === params.song.name.toLowerCase() &&
        s.song.artist.toLowerCase() === params.song.artist.toLowerCase());
    if (existingSong) {
        // Update existing - this song has multiple meaningful moments!
        log.info({ song: params.song.name, userId: params.userId }, '🎵 Song already in "our songs" - adding new moment context');
        // Keep the most significant moment
        if (getSignificanceWeight(params.momentType) > getSignificanceWeight(existingSong.moment.type)) {
            existingSong.moment = {
                timestamp: new Date(),
                type: params.momentType,
                emotion: params.emotion,
                context: params.context,
                topic: params.topic,
                memorableQuote: params.memorableQuote,
            };
            existingSong.significance = determineSignificance(params.momentType);
        }
        return existingSong;
    }
    // Create new song memory
    const newMemory = {
        id: `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        song: params.song,
        moment: {
            timestamp: new Date(),
            type: params.momentType,
            emotion: params.emotion,
            context: params.context,
            topic: params.topic,
            memorableQuote: params.memorableQuote,
        },
        significance: determineSignificance(params.momentType),
        callbackCount: 0,
        callbackReception: 'unknown',
        canSuggest: params.momentType !== 'vulnerable', // Be careful with vulnerable moments
    };
    profile.songs.push(newMemory);
    profile.totalMoments++;
    // Track first song
    if (!profile.firstSong) {
        profile.firstSong = newMemory;
    }
    // Update most meaningful
    if (!profile.mostMeaningful ||
        getSignificanceWeight(newMemory.moment.type) >
            getSignificanceWeight(profile.mostMeaningful.moment.type)) {
        profile.mostMeaningful = newMemory;
    }
    log.info({
        userId: params.userId,
        song: params.song.name,
        momentType: params.momentType,
        totalSongs: profile.songs.length,
    }, '🎵 New "our song" recorded!');
    return newMemory;
}
function getSignificanceWeight(type) {
    const weights = {
        breakthrough: 10,
        vulnerable: 9,
        growth: 8,
        celebration: 7,
        decision: 7,
        connection: 6,
        comfort: 6,
        joy: 5,
        first_time: 4,
        they_loved_it: 3,
    };
    return weights[type] || 1;
}
function determineSignificance(type) {
    if (type === 'breakthrough' || type === 'vulnerable')
        return 'life_changing';
    if (type === 'growth' || type === 'celebration' || type === 'decision')
        return 'meaningful';
    if (type === 'connection' || type === 'comfort')
        return 'warm';
    return 'fun';
}
// ============================================================================
// CALLBACK GENERATION - The Magic
// ============================================================================
/**
 * Check if a song is "our song" and generate a callback if so
 */
export function checkForOurSong(userId, songName, artistName) {
    const profile = profiles.get(userId);
    if (!profile)
        return null;
    const memory = profile.songs.find((s) => s.song.name.toLowerCase() === songName.toLowerCase() ||
        (s.song.artist.toLowerCase() === artistName.toLowerCase() &&
            s.song.name.toLowerCase().includes(songName.toLowerCase().split(' ')[0])));
    if (!memory)
        return null;
    // Don't callback too frequently to the same song
    if (memory.lastCallback) {
        const hoursSinceLastCallback = (Date.now() - new Date(memory.lastCallback).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastCallback < 24) {
            log.debug({ song: songName }, '🎵 Skipping callback - too recent');
            return null;
        }
    }
    // Generate the callback
    const callback = generateCallback(memory);
    // Update tracking
    memory.callbackCount++;
    memory.lastCallback = new Date();
    log.info({
        song: songName,
        momentType: memory.moment.type,
        callbackCount: memory.callbackCount,
    }, '🎵 "Our song" callback triggered!');
    return callback;
}
function generateCallback(memory) {
    const { moment, song } = memory;
    let phrase;
    // Generate context-appropriate callback
    switch (moment.type) {
        case 'breakthrough':
            phrase = generateBreakthroughCallback(memory);
            break;
        case 'celebration':
            phrase = generateCelebrationCallback(memory);
            break;
        case 'vulnerable':
            phrase = generateVulnerableCallback(memory);
            break;
        case 'comfort':
            phrase = generateComfortCallback(memory);
            break;
        case 'joy':
            phrase = generateJoyCallback(memory);
            break;
        case 'growth':
            phrase = generateGrowthCallback(memory);
            break;
        case 'connection':
            phrase = generateConnectionCallback(memory);
            break;
        case 'first_time':
            phrase = generateFirstTimeCallback(memory);
            break;
        case 'they_loved_it':
            phrase = generateTheyLovedItCallback(memory);
            break;
        default:
            phrase = `Oh... I remember this song.`;
    }
    // Add natural pause with SSML
    const ssml = `<speak><prosody rate="95%">${phrase}</prosody></speak>`;
    return {
        memory,
        phrase,
        ssml,
        timing: memory.significance === 'life_changing' ? 'immediate' : 'after_intro',
    };
}
// ============================================================================
// CALLBACK PHRASE GENERATORS - Warm, Human, Real
// ============================================================================
function generateBreakthroughCallback(memory) {
    const phrases = [
        `Oh... this was playing when ${memory.moment.context}. I remember that moment.`,
        `This song... we were listening to this when you finally ${memory.moment.context.replace('finally ', '')}. That took real courage.`,
        `I can't hear this without thinking of you and that ${memory.moment.emotion} moment. When you ${memory.moment.context}.`,
        `You know what this song reminds me of? When you ${memory.moment.context}. I was so proud of you.`,
    ];
    if (memory.moment.memorableQuote) {
        phrases.push(`Remember when you said "${memory.moment.memorableQuote}"? This song was playing. I'll never forget that.`);
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateCelebrationCallback(memory) {
    const phrases = [
        `This song! This was playing when you found out about ${memory.moment.context}. I can still hear you celebrating.`,
        `Oh, this one makes me smile. We were listening to this when ${memory.moment.context}. What a moment.`,
        `I love that this is playing. Remember ${memory.moment.context}? This was our soundtrack.`,
        `Hey, this was our victory song! When ${memory.moment.context}. Still makes me happy.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateVulnerableCallback(memory) {
    // Be extra gentle with vulnerable moments
    const phrases = [
        `This song... we've shared some real moments with this one playing.`,
        `I remember when we listened to this together. You trusted me with something important.`,
        `This brings back memories. Quiet ones. Meaningful ones.`,
    ];
    // Only reference specifics if it was received well before
    if (memory.callbackReception === 'loved_it' || memory.callbackReception === 'positive') {
        phrases.push(`This was playing when you opened up to me about ${memory.moment.topic || 'something important'}. Thank you for trusting me.`);
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateComfortCallback(memory) {
    const phrases = [
        `I put this on when you were going through that ${memory.moment.context}. Hope you're doing better now.`,
        `Remember this? We sat with this song when things were hard. You've come so far since then.`,
        `This one... we've been through some things together with this playing.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateJoyCallback(memory) {
    const phrases = [
        `This song makes me think of you laughing. Remember when ${memory.moment.context}?`,
        `Oh I love this one. We were having so much fun when this was playing.`,
        `This is such a happy song for us. That time when ${memory.moment.context}... pure joy.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateGrowthCallback(memory) {
    const phrases = [
        `You know what? This song was playing when you realized ${memory.moment.context}. Look how far you've come.`,
        `I remember this song. It was on when you had that big realization about ${memory.moment.topic || 'yourself'}. You've grown so much.`,
        `This brings me back to when you ${memory.moment.context}. That was a turning point, wasn't it?`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateConnectionCallback(memory) {
    const phrases = [
        `This was playing during one of our really good talks. About ${memory.moment.topic || 'life'}.`,
        `I associate this song with us... just talking. Being real. I love those moments.`,
        `Remember this? One of those conversations where time just disappeared.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateFirstTimeCallback(memory) {
    const phrases = [
        `Hey, this was one of the first songs we ever listened to together. Our beginning.`,
        `Oh wow, remember this? This takes me back to when we first started listening to music together.`,
        `This is kind of special - one of our first songs together. Look at us now.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateTheyLovedItCallback(memory) {
    const phrases = [
        `I remember you loved this one. Still hits, right?`,
        `Putting this on because I know it's one of your favorites.`,
        `This song. You lit up when this played last time.`,
        `I know you love this one. Thought you might want to hear it.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
// ============================================================================
// PROACTIVE "REMEMBER WHEN" MOMENTS
// ============================================================================
/**
 * Get a song memory to bring up proactively (for outreach, session openers, etc.)
 */
export function getProactiveRememberWhen(userId) {
    const profile = profiles.get(userId);
    if (!profile || profile.songs.length === 0)
        return null;
    // Find a good candidate - meaningful but not too recent
    const candidates = profile.songs.filter((song) => {
        // Skip vulnerable moments for proactive mentions
        if (song.moment.type === 'vulnerable')
            return false;
        // Skip if we've mentioned it recently
        if (song.lastCallback) {
            const daysSinceCallback = (Date.now() - new Date(song.lastCallback).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceCallback < 7)
                return false;
        }
        return true;
    });
    if (candidates.length === 0)
        return null;
    // Prefer more meaningful songs
    candidates.sort((a, b) => getSignificanceWeight(b.moment.type) - getSignificanceWeight(a.moment.type));
    const memory = candidates[0];
    const phrase = generateProactivePhrase(memory);
    return {
        memory,
        phrase,
        ssml: `<speak><prosody rate="95%">${phrase}</prosody></speak>`,
        timing: 'immediate',
    };
}
function generateProactivePhrase(memory) {
    const daysSinceMoment = Math.floor((Date.now() - new Date(memory.moment.timestamp).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceMoment < 7) {
        return `Hey, I was thinking about ${memory.moment.context} the other day. That song that was playing... still feels like yesterday.`;
    }
    else if (daysSinceMoment < 30) {
        return `You know what I remembered today? That time when ${memory.moment.context}. The song that was playing is stuck in my head.`;
    }
    else {
        return `Something reminded me of you today. Remember ${memory.moment.context}? And that song we were listening to? "${memory.song.name}" - that's become one of ours.`;
    }
}
// ============================================================================
// STATISTICS & INSIGHTS
// ============================================================================
export function getOurSongsStats(userId) {
    const profile = profiles.get(userId);
    if (!profile)
        return null;
    const byMomentType = {};
    for (const song of profile.songs) {
        byMomentType[song.moment.type] = (byMomentType[song.moment.type] || 0) + 1;
    }
    return {
        totalSongs: profile.songs.length,
        byMomentType,
        mostMeaningful: profile.mostMeaningful,
        firstSong: profile.firstSong,
    };
}
/**
 * Get all our songs for a user (for display/export)
 */
export function getAllOurSongs(userId) {
    const profile = profiles.get(userId);
    return profile?.songs || [];
}
// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================
export function loadOurSongsProfile(userId, data) {
    // Convert date strings back to Date objects
    const hydrated = {
        ...data,
        songs: data.songs.map((song) => ({
            ...song,
            moment: {
                ...song.moment,
                timestamp: new Date(song.moment.timestamp),
            },
            lastCallback: song.lastCallback ? new Date(song.lastCallback) : undefined,
        })),
        firstSong: data.firstSong
            ? {
                ...data.firstSong,
                moment: {
                    ...data.firstSong.moment,
                    timestamp: new Date(data.firstSong.moment.timestamp),
                },
            }
            : undefined,
        mostMeaningful: data.mostMeaningful
            ? {
                ...data.mostMeaningful,
                moment: {
                    ...data.mostMeaningful.moment,
                    timestamp: new Date(data.mostMeaningful.moment.timestamp),
                },
            }
            : undefined,
    };
    profiles.set(userId, hydrated);
    log.debug({ userId, songCount: hydrated.songs.length }, '🎵 Loaded "our songs" profile');
}
export function getOurSongsProfileForPersistence(userId) {
    return profiles.get(userId) || null;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    detectSignificantMoment,
    recordOurSong,
    checkForOurSong,
    getProactiveRememberWhen,
    getOurSongsStats,
    getAllOurSongs,
    loadOurSongsProfile,
    getOurSongsProfileForPersistence,
};
//# sourceMappingURL=our-songs.js.map