/**
 * Music Reactions and Personality
 *
 * Provides playful reactions, intros, and comments for music playback.
 * These add personality and warmth to the music experience.
 *
 * Uses SSML for natural pauses and emphasis.
 */
// ============================================================================
// MUSIC REACTIONS
// ============================================================================
const MUSIC_REACTIONS = {
    intro: [
        'Ooh, <break time="100ms"/>good choice!',
        'I love this one.',
        'Nice pick!',
        'Ah, <break time="100ms"/>excellent taste.',
        'Coming right up!',
        'Here we go!',
        'Oh, this is a good one.',
        'Great song.',
        'You got it!',
        'Perfect.',
    ],
    appreciation: [
        'You know, <break time="150ms"/>there\'s something timeless about this.',
        'Music like this... <break time="200ms"/>it feeds the soul.',
        'This takes me back.',
        'A classic for a reason.',
        'Some songs just never get old.',
        'This is the good stuff.',
    ],
    mood: [
        'Perfect mood music, <break time="100ms"/>isn\'t it?',
        'This hits different at certain times.',
        'Music can really change your whole day.',
        'Sometimes you just need the right song.',
        'Sets the vibe, right?',
    ],
    transition: [
        'Alright, <break time="150ms"/>music off.',
        'Okay, silencing the tunes.',
        'And... <break time="200ms"/>quiet.',
        "Music's done.",
        'Fading out.',
    ],
    physical: [
        "I'm tapping my foot to this one.",
        '<break time="100ms"/>*nodding along*',
        'This has such a good rhythm.',
        'Got a good beat.',
    ],
    trackEnded: [
        'That was nice! <break time="150ms"/>Want more?',
        'Song finished. <break time="100ms"/>Another one?',
        "Good track! What's next?",
        "And that's a wrap on that one.",
        'The music finished. <break time="150ms"/>Want something else?',
    ],
};
const PLAYFUL_INTROS = [
    'Let me queue that up for you!',
    'Oh, I know just the thing.',
    'Say no more!',
    'One moment while I work my magic...',
    "I've got you covered.",
    'Coming right up!',
    'Excellent choice, if I do say so myself.',
    "Now we're talking!",
];
const GENRE_REACTIONS = {
    jazz: [
        'Ah, jazz... the language of improvisation.',
        'Now this is smooth.',
        'Jazz always puts me in a good mood.',
    ],
    classical: [
        'The classics never disappoint.',
        "Timeless, isn't it?",
        'Music that has stood the test of time.',
    ],
    rock: ['Time to turn it up!', "Now that's some energy.", 'Good choice for getting pumped up.'],
    blues: [
        'The blues... speaks to the soul.',
        "There's truth in the blues.",
        'Music with real feeling.',
    ],
    country: [
        'A little country never hurt anyone.',
        'Good storytelling in this one.',
        'Country has heart.',
    ],
    pop: ['A certified banger.', 'Catchy, right?', 'Try not to sing along. I dare you.'],
    hiphop: ['Great beats on this one.', 'The rhythm is solid.', 'Good flow.'],
    electronic: ['Great energy in this.', 'Perfect for focusing.', 'The beat just... works.'],
};
const MOOD_REACTIONS = {
    relaxing: [
        'Perfect for unwinding.',
        'Let the stress melt away.',
        'Take a deep breath and enjoy.',
    ],
    focus: ['Good for concentration.', "Let's get in the zone.", 'Time to focus up.'],
    energizing: ["Let's get that energy up!", 'Time to wake up!', 'Feel that energy!'],
    celebrating: ['Celebration time!', "Let's enjoy this moment!", 'Cheers to that!'],
    stressed: ['Let the music calm you.', 'Take a moment to breathe.', 'This should help.'],
};
const PLAYFUL_COMMENTS = [
    'Good stuff.',
    'A real gem.',
    "This one's a keeper.",
    "Can't go wrong with this.",
    'Quality right here.',
    'Top tier.',
];
// ============================================================================
// FUN DJ MOMENTS - Spontaneous humor and personality
// ============================================================================
// DJ_MOMENTS: Fun DJ personality moments
// NOTE: Do NOT use *asterisk* stage directions - they may be spoken aloud!
const DJ_MOMENTS = {
    airDJ: [
        '<break time="100ms"/>Alright, alright!',
        '<break time="100ms"/>Let me see what we got here...',
        '<break time="100ms"/>Coming right up!',
    ],
    funnyMishaps: [
        '<break time="100ms"/>Oops, wrong button. <break time="200ms"/>Just kidding, I nailed it.',
        '<break time="100ms"/>Let me pretend I meant to do that.',
        '<break time="100ms"/>DJ Ferni in the house! <break time="150ms"/>...okay that was embarrassing.',
    ],
    excitement: [
        'Oh! <break time="100ms"/>This is a GOOD one!',
        '<break time="100ms"/>Perfection.',
        "Now THIS is what I'm talking about!",
        'Oh man, <break time="100ms"/>I love this song!',
    ],
    dancing: [
        '<break time="100ms"/>Don\'t mind me.',
        '<break time="100ms"/>I\'m absolutely vibing right now.',
        '<break time="100ms"/>This groove...',
        'I may or may not be dancing in my chair right now.',
    ],
    quirky: [
        'Fun fact: <break time="100ms"/>music makes everything better. <break time="150ms"/>That\'s just science.',
        'You know what pairs well with this? <break time="200ms"/>Good conversation.',
        'If music was a language, <break time="150ms"/>this would be poetry.',
        'This song just fixed my mood. <break time="150ms"/>You\'re welcome, brain.',
    ],
    celebratory: [
        '<break time="100ms"/>Let\'s GO!',
        'Party time! <break time="100ms"/>Well, a chill party. <break time="150ms"/>A vibe party.',
        'This calls for a moment of appreciation...',
    ],
};
/**
 * Get a fun DJ moment (rare, special occasions)
 * Use sparingly for maximum delight!
 */
export function getFunDJMoment() {
    // Only 15% chance - keep it special
    if (Math.random() > 0.15)
        return null;
    const categories = Object.keys(DJ_MOMENTS);
    const category = categories[Math.floor(Math.random() * categories.length)];
    const moments = DJ_MOMENTS[category];
    return moments[Math.floor(Math.random() * moments.length)];
}
/**
 * Get an air DJ moment (for playful music intros)
 */
export function getAirDJMoment() {
    return DJ_MOMENTS.airDJ[Math.floor(Math.random() * DJ_MOMENTS.airDJ.length)];
}
/**
 * Get an excited reaction for really good songs
 */
export function getExcitedMusicReaction() {
    return DJ_MOMENTS.excitement[Math.floor(Math.random() * DJ_MOMENTS.excitement.length)];
}
/**
 * Get a dancing/vibing comment
 */
export function getDancingComment() {
    return DJ_MOMENTS.dancing[Math.floor(Math.random() * DJ_MOMENTS.dancing.length)];
}
// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================
/**
 * Get a random music reaction of a specific type
 */
export function getMusicReaction(type) {
    const reactions = MUSIC_REACTIONS[type] || MUSIC_REACTIONS.intro;
    return reactions[Math.floor(Math.random() * reactions.length)];
}
/**
 * Determine if we should add a reaction (adds variety, not every time)
 */
export function shouldReactToMusic() {
    return Math.random() < 0.35; // 35% chance
}
/**
 * Get a playful intro for music
 */
export function getPlayfulMusicIntro() {
    return PLAYFUL_INTROS[Math.floor(Math.random() * PLAYFUL_INTROS.length)];
}
/**
 * Get a genre-specific reaction if applicable
 */
export function getGenreReaction(query) {
    const lowerQuery = query.toLowerCase();
    for (const [genre, reactions] of Object.entries(GENRE_REACTIONS)) {
        if (lowerQuery.includes(genre)) {
            return reactions[Math.floor(Math.random() * reactions.length)];
        }
    }
    return null;
}
/**
 * Get a mood-based music reaction
 */
export function getMoodMusicReaction(mood) {
    const lowerMood = mood.toLowerCase();
    for (const [moodKey, reactions] of Object.entries(MOOD_REACTIONS)) {
        if (lowerMood.includes(moodKey)) {
            return reactions[Math.floor(Math.random() * reactions.length)];
        }
    }
    // Default
    return "Here's something for you.";
}
/**
 * Get a playful comment about music
 */
export function getPlayfulMusicComment() {
    return PLAYFUL_COMMENTS[Math.floor(Math.random() * PLAYFUL_COMMENTS.length)];
}
//# sourceMappingURL=music-reactions.js.map