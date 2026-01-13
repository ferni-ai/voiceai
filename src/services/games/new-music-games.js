/**
 * 🎵 New Music Games - Phase 2
 *
 * - Finish the Lyric: Complete famous song lyrics
 * - Decade Challenge: Guess the era from the sound
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Curated lyric database with iconic lines
 * - Intelligent decade selection based on user's musical DNA
 * - Voice-first interaction for lyric completion
 */
import { getLogger } from '../../utils/safe-logger.js';
import { searchSong, playGameTrack, stopGameTrack, fadeOutGameTrack } from './game-music.js';
import { getSongSelectionContext } from './game-intelligence.js';
const log = getLogger();
// Shared game memory reference
let sharedGameMemory = null;
export function setGameMemoryForNewGames(memory) {
    sharedGameMemory = memory;
}
// Persona style phrases for variety
const PERSONA_PHRASES = {
    celebration: ['Yes! 🎉', 'Nailed it! 🎵', 'Perfect! 🎤', 'You got it! 🔥', 'Spot on! ✨'],
    encouragement: [
        "Good try! Let's keep going.",
        "That's okay, next one!",
        "Close! Let's try another.",
        'No worries, moving on!',
    ],
    gameStart: ["Let's do this!", 'Game time!', 'Ready to play?', 'Here we go!'],
};
function getRandomPhrase(type) {
    const phrases = PERSONA_PHRASES[type];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
// Curated database of iconic lyrics - these are chosen for voice recognition
const LYRIC_DATABASE = [
    // Easy - Very famous, everyone knows
    {
        prompt: "Don't stop believin', hold on to that",
        completion: 'feeling',
        fullLyric: "Don't stop believin', hold on to that feeling",
        songName: "Don't Stop Believin'",
        artistName: 'Journey',
        hints: ['Think about emotions', 'Rhymes with dealing'],
        difficulty: 'easy',
        decade: '1980s',
    },
    {
        prompt: 'I will always love',
        completion: 'you',
        fullLyric: 'I will always love you',
        songName: 'I Will Always Love You',
        artistName: 'Whitney Houston',
        hints: ['One word', 'A pronoun'],
        difficulty: 'easy',
        decade: '1990s',
    },
    {
        prompt: 'Sweet Caroline, bum bum',
        completion: 'bum',
        fullLyric: 'Sweet Caroline, bum bum bum',
        songName: 'Sweet Caroline',
        artistName: 'Neil Diamond',
        hints: ['Same as the previous sound', 'Three syllables total'],
        difficulty: 'easy',
        decade: '1960s',
    },
    {
        prompt: 'We will, we will rock',
        completion: 'you',
        fullLyric: 'We will, we will rock you',
        songName: 'We Will Rock You',
        artistName: 'Queen',
        hints: ['One word', 'Think about who is being rocked'],
        difficulty: 'easy',
        decade: '1970s',
    },
    {
        prompt: "Hey Jude, don't make it",
        completion: 'bad',
        fullLyric: "Hey Jude, don't make it bad",
        songName: 'Hey Jude',
        artistName: 'The Beatles',
        hints: ['Opposite of good', 'Three letters'],
        difficulty: 'easy',
        decade: '1960s',
    },
    {
        prompt: 'Is this the real life? Is this just',
        completion: 'fantasy',
        fullLyric: 'Is this the real life? Is this just fantasy',
        songName: 'Bohemian Rhapsody',
        artistName: 'Queen',
        hints: ['Opposite of reality', 'Imagination'],
        difficulty: 'easy',
        decade: '1970s',
    },
    {
        prompt: 'Happy birthday to',
        completion: 'you',
        fullLyric: 'Happy birthday to you',
        songName: 'Happy Birthday',
        artistName: 'Traditional',
        hints: ['One word', 'The birthday person'],
        difficulty: 'easy',
        decade: '1900s',
    },
    // Medium - Well-known but requires more thought
    {
        prompt: "I got a feeling that tonight's gonna be a good",
        completion: 'night',
        fullLyric: "I got a feeling that tonight's gonna be a good night",
        songName: 'I Gotta Feeling',
        artistName: 'Black Eyed Peas',
        hints: ['When is tonight?', 'Opposite of day'],
        difficulty: 'medium',
        decade: '2000s',
    },
    {
        prompt: 'Baby one more',
        completion: 'time',
        fullLyric: 'Hit me baby one more time',
        songName: '...Baby One More Time',
        artistName: 'Britney Spears',
        hints: ['Related to clocks', 'Rhymes with crime'],
        difficulty: 'medium',
        decade: '1990s',
    },
    {
        prompt: 'Living on a',
        completion: 'prayer',
        fullLyric: "Woah, we're halfway there, livin' on a prayer",
        songName: "Livin' on a Prayer",
        artistName: 'Bon Jovi',
        hints: ['Something religious', 'What you do when you hope'],
        difficulty: 'medium',
        decade: '1980s',
    },
    {
        prompt: 'You make me feel like a natural',
        completion: 'woman',
        fullLyric: 'You make me feel like a natural woman',
        songName: '(You Make Me Feel Like) A Natural Woman',
        artistName: 'Aretha Franklin',
        hints: ['A person', 'Opposite of man'],
        difficulty: 'medium',
        decade: '1960s',
    },
    {
        prompt: 'Just a small town girl, living in a lonely',
        completion: 'world',
        fullLyric: 'Just a small town girl, living in a lonely world',
        songName: "Don't Stop Believin'",
        artistName: 'Journey',
        hints: ['Our planet', 'Where we all live'],
        difficulty: 'medium',
        decade: '1980s',
    },
    {
        prompt: 'Shake it off, shake it off, haters gonna hate hate hate hate',
        completion: 'hate',
        fullLyric: 'Shake it off, shake it off, haters gonna hate hate hate hate hate',
        songName: 'Shake It Off',
        artistName: 'Taylor Swift',
        hints: ['What haters do', 'Opposite of love'],
        difficulty: 'medium',
        decade: '2010s',
    },
    {
        prompt: 'Every breath you take, every move you',
        completion: 'make',
        fullLyric: 'Every breath you take, every move you make',
        songName: 'Every Breath You Take',
        artistName: 'The Police',
        hints: ['Rhymes with take', 'What you do when you act'],
        difficulty: 'medium',
        decade: '1980s',
    },
    // Hard - Requires real fans
    {
        prompt: 'Ground control to Major',
        completion: 'Tom',
        fullLyric: 'Ground control to Major Tom',
        songName: 'Space Oddity',
        artistName: 'David Bowie',
        hints: ["A man's name", 'Three letters, starts with T'],
        difficulty: 'hard',
        decade: '1960s',
    },
    {
        prompt: 'Goodbye yellow brick',
        completion: 'road',
        fullLyric: 'Goodbye yellow brick road',
        songName: 'Goodbye Yellow Brick Road',
        artistName: 'Elton John',
        hints: ['Something you walk on', 'Wizard of Oz reference'],
        difficulty: 'hard',
        decade: '1970s',
    },
    {
        prompt: 'Mama, just killed a',
        completion: 'man',
        fullLyric: 'Mama, just killed a man',
        songName: 'Bohemian Rhapsody',
        artistName: 'Queen',
        hints: ['A person', 'Three letters'],
        difficulty: 'hard',
        decade: '1970s',
    },
    {
        prompt: 'I see a red door and I want it painted',
        completion: 'black',
        fullLyric: 'I see a red door and I want it painted black',
        songName: 'Paint It Black',
        artistName: 'The Rolling Stones',
        hints: ['A color', 'Opposite of white'],
        difficulty: 'hard',
        decade: '1960s',
    },
    {
        prompt: 'Here comes the sun, doo da doo',
        completion: 'doo',
        fullLyric: 'Here comes the sun, doo da doo doo',
        songName: 'Here Comes the Sun',
        artistName: 'The Beatles',
        hints: ['Same syllable repeated', 'Rhymes with new'],
        difficulty: 'hard',
        decade: '1960s',
    },
    {
        prompt: 'I heard it through the',
        completion: 'grapevine',
        fullLyric: 'I heard it through the grapevine',
        songName: 'I Heard It Through the Grapevine',
        artistName: 'Marvin Gaye',
        hints: ['A type of plant', 'Where wine comes from'],
        difficulty: 'hard',
        decade: '1960s',
    },
    {
        prompt: 'Carry on my wayward',
        completion: 'son',
        fullLyric: 'Carry on my wayward son',
        songName: 'Carry On Wayward Son',
        artistName: 'Kansas',
        hints: ["A parent's child", 'Male offspring'],
        difficulty: 'hard',
        decade: '1970s',
    },
];
// ============================================================================
// FINISH THE LYRIC GAME
// ============================================================================
export class FinishTheLyricGame {
    // Game state
    challenges = [];
    currentChallengeIndex = 0;
    hintsUsed = 0;
    selectionContext = null;
    correctInARow = 0;
    async initialize(config) {
        const rounds = config?.rounds || 5;
        const difficulty = config?.difficulty || 'medium';
        // Get intelligence context
        if (sharedGameMemory) {
            this.selectionContext = getSongSelectionContext(sharedGameMemory);
            log.debug({ context: this.selectionContext }, '🧠 Finish the Lyric - got selection context');
        }
        // Select challenges based on difficulty
        const availableChallenges = LYRIC_DATABASE.filter((c) => {
            if (difficulty === 'easy')
                return c.difficulty === 'easy';
            if (difficulty === 'medium')
                return c.difficulty === 'easy' || c.difficulty === 'medium';
            return true; // hard includes all
        });
        // Shuffle and select
        this.challenges = this.shuffleArray([...availableChallenges]).slice(0, rounds);
        this.currentChallengeIndex = 0;
        this.hintsUsed = 0;
        this.correctInARow = 0;
        if (this.challenges.length === 0) {
            log.warn('🎤 No lyric challenges available');
            this.challenges = LYRIC_DATABASE.slice(0, rounds);
        }
        const firstChallenge = this.challenges[0];
        const initialState = {
            lyricPrompt: firstChallenge.prompt,
            expectedCompletion: firstChallenge.completion,
            fullLyric: firstChallenge.fullLyric,
            song: {
                name: firstChallenge.songName,
                artist: firstChallenge.artistName,
            },
            hintsUsed: 0,
        };
        const welcomeMessage = `${getRandomPhrase('gameStart')} 🎤 Let's play Finish the Lyric! ` +
            `I'll give you a famous song lyric, and you complete it. ` +
            `Here's your first one: "${firstChallenge.prompt}"... what comes next?`;
        log.info({ rounds, difficulty }, '🎤 Finish the Lyric initialized');
        return {
            initialState: initialState,
            totalRounds: rounds,
            welcomeMessage,
        };
    }
    async evaluateAnswer(answer, gameData, round) {
        const currentChallenge = this.challenges[this.currentChallengeIndex];
        if (!currentChallenge) {
            return {
                correct: false,
                pointsEarned: 0,
                feedback: 'Game data error - no challenge found',
                gameOver: true,
                finalScore: 0,
            };
        }
        // Normalize input for comparison
        const normalizedInput = answer.toLowerCase().trim();
        const normalizedExpected = currentChallenge.completion.toLowerCase().trim();
        // Check if answer is correct (allow some flexibility)
        const isCorrect = normalizedInput === normalizedExpected ||
            normalizedInput.includes(normalizedExpected) ||
            this.fuzzyMatch(normalizedInput, normalizedExpected);
        let pointsEarned = 0;
        let feedback = '';
        if (isCorrect) {
            this.correctInARow++;
            // Points: base + bonus for no hints + streak bonus
            pointsEarned = 100 + (this.hintsUsed === 0 ? 50 : 0) + this.correctInARow * 10;
            feedback =
                `${getRandomPhrase('celebration')} "${currentChallenge.fullLyric}" - ` +
                    `${currentChallenge.songName} by ${currentChallenge.artistName}!`;
            if (this.correctInARow >= 3) {
                feedback = `🔥 ${this.correctInARow} in a row! ${feedback}`;
            }
        }
        else {
            this.correctInARow = 0;
            feedback =
                `${getRandomPhrase('encouragement')} The answer was "${currentChallenge.completion}" - ` +
                    `"${currentChallenge.fullLyric}" from ${currentChallenge.songName} ` +
                    `by ${currentChallenge.artistName}.`;
        }
        // Move to next challenge
        this.currentChallengeIndex++;
        this.hintsUsed = 0;
        const isGameOver = this.currentChallengeIndex >= this.challenges.length;
        return {
            correct: isCorrect,
            pointsEarned,
            feedback,
            gameOver: isGameOver,
        };
    }
    async setupNextRound(gameData, nextRound) {
        if (this.currentChallengeIndex >= this.challenges.length) {
            return gameData;
        }
        const nextChallenge = this.challenges[this.currentChallengeIndex];
        const nextState = {
            lyricPrompt: nextChallenge.prompt,
            expectedCompletion: nextChallenge.completion,
            fullLyric: nextChallenge.fullLyric,
            song: {
                name: nextChallenge.songName,
                artist: nextChallenge.artistName,
            },
            hintsUsed: 0,
        };
        return nextState;
    }
    getHint(gameData) {
        const currentChallenge = this.challenges[this.currentChallengeIndex];
        if (!currentChallenge)
            return null;
        if (this.hintsUsed >= currentChallenge.hints.length) {
            return `Final hint: The answer starts with "${currentChallenge.completion[0].toUpperCase()}"`;
        }
        const hint = currentChallenge.hints[this.hintsUsed];
        this.hintsUsed++;
        return `Hint ${this.hintsUsed}: ${hint}`;
    }
    async handleSkip(gameData) {
        const currentChallenge = this.challenges[this.currentChallengeIndex];
        this.currentChallengeIndex++;
        this.hintsUsed = 0;
        this.correctInARow = 0;
        const isGameOver = this.currentChallengeIndex >= this.challenges.length;
        return {
            correct: false,
            pointsEarned: 0,
            feedback: currentChallenge
                ? `The answer was "${currentChallenge.completion}" from ${currentChallenge.songName}.`
                : 'Skipped!',
            gameOver: isGameOver,
            correctAnswer: currentChallenge?.completion,
        };
    }
    // Helper methods
    shuffleArray(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    fuzzyMatch(input, expected) {
        // Allow for minor typos or variations
        if (input.length < 2 || expected.length < 2)
            return false;
        // Remove punctuation and extra spaces
        const cleanInput = input.replace(/[^a-z0-9]/g, '');
        const cleanExpected = expected.replace(/[^a-z0-9]/g, '');
        // Check if they're similar enough
        if (cleanInput === cleanExpected)
            return true;
        // Check if one contains the other
        if (cleanInput.includes(cleanExpected) || cleanExpected.includes(cleanInput))
            return true;
        // Levenshtein distance for close matches
        const distance = this.levenshteinDistance(cleanInput, cleanExpected);
        return distance <= Math.max(1, Math.floor(cleanExpected.length / 4));
    }
    levenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
            }
        }
        return matrix[b.length][a.length];
    }
}
const DECADE_SONGS = [
    // 1960s
    {
        name: 'Twist and Shout',
        artist: 'The Beatles',
        releaseYear: 1963,
        decade: '1960s',
        searchTerm: 'twist and shout beatles',
    },
    {
        name: 'Respect',
        artist: 'Aretha Franklin',
        releaseYear: 1967,
        decade: '1960s',
        searchTerm: 'respect aretha franklin',
    },
    {
        name: 'Good Vibrations',
        artist: 'Beach Boys',
        releaseYear: 1966,
        decade: '1960s',
        searchTerm: 'good vibrations beach boys',
    },
    {
        name: 'Hey Jude',
        artist: 'The Beatles',
        releaseYear: 1968,
        decade: '1960s',
        searchTerm: 'hey jude beatles',
    },
    // 1970s
    {
        name: 'Bohemian Rhapsody',
        artist: 'Queen',
        releaseYear: 1975,
        decade: '1970s',
        searchTerm: 'bohemian rhapsody queen',
    },
    {
        name: 'Stayin Alive',
        artist: 'Bee Gees',
        releaseYear: 1977,
        decade: '1970s',
        searchTerm: 'stayin alive bee gees',
    },
    {
        name: 'Hotel California',
        artist: 'Eagles',
        releaseYear: 1977,
        decade: '1970s',
        searchTerm: 'hotel california eagles',
    },
    {
        name: 'Dancing Queen',
        artist: 'ABBA',
        releaseYear: 1976,
        decade: '1970s',
        searchTerm: 'dancing queen abba',
    },
    // 1980s
    {
        name: 'Billie Jean',
        artist: 'Michael Jackson',
        releaseYear: 1983,
        decade: '1980s',
        searchTerm: 'billie jean michael jackson',
    },
    {
        name: 'Sweet Child O Mine',
        artist: "Guns N' Roses",
        releaseYear: 1987,
        decade: '1980s',
        searchTerm: 'sweet child o mine',
    },
    {
        name: 'Take On Me',
        artist: 'a-ha',
        releaseYear: 1985,
        decade: '1980s',
        searchTerm: 'take on me aha',
    },
    {
        name: 'Livin on a Prayer',
        artist: 'Bon Jovi',
        releaseYear: 1986,
        decade: '1980s',
        searchTerm: 'livin on a prayer bon jovi',
    },
    // 1990s
    {
        name: 'Smells Like Teen Spirit',
        artist: 'Nirvana',
        releaseYear: 1991,
        decade: '1990s',
        searchTerm: 'smells like teen spirit',
    },
    {
        name: 'Wannabe',
        artist: 'Spice Girls',
        releaseYear: 1996,
        decade: '1990s',
        searchTerm: 'wannabe spice girls',
    },
    {
        name: 'Wonderwall',
        artist: 'Oasis',
        releaseYear: 1995,
        decade: '1990s',
        searchTerm: 'wonderwall oasis',
    },
    {
        name: 'Baby One More Time',
        artist: 'Britney Spears',
        releaseYear: 1998,
        decade: '1990s',
        searchTerm: 'baby one more time',
    },
    // 2000s
    {
        name: 'Crazy in Love',
        artist: 'Beyoncé',
        releaseYear: 2003,
        decade: '2000s',
        searchTerm: 'crazy in love beyonce',
    },
    {
        name: 'Mr. Brightside',
        artist: 'The Killers',
        releaseYear: 2004,
        decade: '2000s',
        searchTerm: 'mr brightside killers',
    },
    {
        name: 'Hey Ya',
        artist: 'OutKast',
        releaseYear: 2003,
        decade: '2000s',
        searchTerm: 'hey ya outkast',
    },
    {
        name: 'Single Ladies',
        artist: 'Beyoncé',
        releaseYear: 2008,
        decade: '2000s',
        searchTerm: 'single ladies beyonce',
    },
    // 2010s
    {
        name: 'Rolling in the Deep',
        artist: 'Adele',
        releaseYear: 2011,
        decade: '2010s',
        searchTerm: 'rolling in the deep adele',
    },
    {
        name: 'Uptown Funk',
        artist: 'Bruno Mars',
        releaseYear: 2014,
        decade: '2010s',
        searchTerm: 'uptown funk',
    },
    {
        name: 'Shape of You',
        artist: 'Ed Sheeran',
        releaseYear: 2017,
        decade: '2010s',
        searchTerm: 'shape of you ed sheeran',
    },
    {
        name: 'Happy',
        artist: 'Pharrell Williams',
        releaseYear: 2013,
        decade: '2010s',
        searchTerm: 'happy pharrell',
    },
];
const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s'];
export class DecadeChallengeGame {
    // Game state
    songs = [];
    currentSongIndex = 0;
    selectionContext = null;
    correctInARow = 0;
    async initialize(config) {
        const rounds = config?.rounds || 5;
        // Get intelligence context
        if (sharedGameMemory) {
            this.selectionContext = getSongSelectionContext(sharedGameMemory);
            log.debug({ context: this.selectionContext }, '🕰️ Decade Challenge - got selection context');
        }
        // Select songs from different decades, shuffle
        this.songs = this.selectBalancedSongs(rounds);
        this.currentSongIndex = 0;
        this.correctInARow = 0;
        // Load preview URLs from iTunes
        await this.loadPreviewUrls();
        const firstSong = this.songs[0];
        const initialState = {
            currentSong: {
                name: firstSong.name,
                artist: firstSong.artist,
                previewUrl: firstSong.previewUrl || '',
                releaseYear: firstSong.releaseYear,
                decade: firstSong.decade,
            },
            playedSongs: [],
        };
        // Play the first song
        if (firstSong.previewUrl) {
            await playGameTrack({
                name: firstSong.name,
                artist: firstSong.artist,
                previewUrl: firstSong.previewUrl,
            });
        }
        const welcomeMessage = `${getRandomPhrase('gameStart')} 🕰️ Time for the Decade Challenge! ` +
            `I'll play you a song, and you guess what decade it's from. ` +
            `Your options are: ${DECADES.join(', ')}. ` +
            `Here's your first song - what decade is this from?`;
        log.info({ rounds }, '🕰️ Decade Challenge initialized');
        return {
            initialState: initialState,
            totalRounds: rounds,
            welcomeMessage,
        };
    }
    async evaluateAnswer(answer, gameData, round) {
        // Stop the current song
        await fadeOutGameTrack();
        const currentSong = this.songs[this.currentSongIndex];
        if (!currentSong) {
            return {
                correct: false,
                pointsEarned: 0,
                feedback: 'Game data error - no song found',
                gameOver: true,
                finalScore: 0,
            };
        }
        // Parse the user's decade guess
        const guessedDecade = this.parseDecadeFromInput(answer);
        const correctDecade = currentSong.decade;
        const isCorrect = guessedDecade === correctDecade;
        const isClose = this.isDecadeClose(guessedDecade, correctDecade);
        let pointsEarned = 0;
        let feedback = '';
        if (isCorrect) {
            this.correctInARow++;
            pointsEarned = 100 + this.correctInARow * 10;
            feedback =
                `${getRandomPhrase('celebration')} "${currentSong.name}" by ${currentSong.artist} ` +
                    `was released in ${currentSong.releaseYear}!`;
            if (this.correctInARow >= 3) {
                feedback = `🔥 ${this.correctInARow} in a row! ${feedback}`;
            }
        }
        else if (isClose) {
            this.correctInARow = 0;
            pointsEarned = 25; // Partial credit
            feedback =
                `Close! "${currentSong.name}" was actually from ${currentSong.releaseYear} (${correctDecade}). ` +
                    `You guessed ${guessedDecade} - only one decade off!`;
        }
        else {
            this.correctInARow = 0;
            feedback =
                `${getRandomPhrase('encouragement')} That was "${currentSong.name}" by ${currentSong.artist}, ` +
                    `released in ${currentSong.releaseYear} - so it's ${correctDecade}, not ${guessedDecade || 'unknown'}!`;
        }
        // Move to next song
        this.currentSongIndex++;
        const isGameOver = this.currentSongIndex >= this.songs.length;
        return {
            correct: isCorrect,
            pointsEarned,
            feedback,
            gameOver: isGameOver,
            correctAnswer: correctDecade,
        };
    }
    async setupNextRound(gameData, nextRound) {
        if (this.currentSongIndex >= this.songs.length) {
            return gameData;
        }
        const nextSong = this.songs[this.currentSongIndex];
        const data = gameData;
        const nextState = {
            currentSong: {
                name: nextSong.name,
                artist: nextSong.artist,
                previewUrl: nextSong.previewUrl || '',
                releaseYear: nextSong.releaseYear,
                decade: nextSong.decade,
            },
            playedSongs: [...(data.playedSongs || [])],
        };
        // Play next song
        if (nextSong.previewUrl) {
            await playGameTrack({
                name: nextSong.name,
                artist: nextSong.artist,
                previewUrl: nextSong.previewUrl,
            });
        }
        return nextState;
    }
    getHint(gameData) {
        const currentSong = this.songs[this.currentSongIndex];
        if (!currentSong)
            return null;
        const hints = [
            `This artist was huge in the ${currentSong.decade}`,
            `Think about what music sounded like around ${currentSong.releaseYear}`,
            `The answer is ${currentSong.decade.slice(0, 3)}_ something...`,
        ];
        return hints[Math.floor(Math.random() * hints.length)];
    }
    async handleSkip(gameData) {
        await stopGameTrack();
        const currentSong = this.songs[this.currentSongIndex];
        this.currentSongIndex++;
        this.correctInARow = 0;
        const isGameOver = this.currentSongIndex >= this.songs.length;
        return {
            correct: false,
            pointsEarned: 0,
            feedback: currentSong
                ? `That was "${currentSong.name}" from ${currentSong.releaseYear} (${currentSong.decade}).`
                : 'Skipped!',
            gameOver: isGameOver,
            correctAnswer: currentSong?.decade,
        };
    }
    // Helper methods
    selectBalancedSongs(count) {
        // Try to get songs from different decades
        const shuffled = this.shuffleArray([...DECADE_SONGS]);
        const selected = [];
        const usedDecades = new Set();
        // First pass: one from each decade
        for (const song of shuffled) {
            if (selected.length >= count)
                break;
            if (!usedDecades.has(song.decade)) {
                selected.push(song);
                usedDecades.add(song.decade);
            }
        }
        // Second pass: fill remaining slots
        for (const song of shuffled) {
            if (selected.length >= count)
                break;
            if (!selected.includes(song)) {
                selected.push(song);
            }
        }
        return this.shuffleArray(selected);
    }
    async loadPreviewUrls() {
        for (const song of this.songs) {
            try {
                const result = await searchSong(song.searchTerm);
                if (result.found && result.track) {
                    song.previewUrl = result.track.previewUrl;
                }
            }
            catch (error) {
                log.warn({ song: song.name, error }, '🕰️ Failed to get preview URL');
            }
        }
    }
    parseDecadeFromInput(input) {
        const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Direct matches
        for (const decade of DECADES) {
            if (normalized.includes(decade.replace('s', '')))
                return decade;
        }
        // Word matches
        const wordMap = {
            sixties: '1960s',
            sixty: '1960s',
            seventies: '1970s',
            seventy: '1970s',
            eighties: '1980s',
            eighty: '1980s',
            nineties: '1990s',
            ninety: '1990s',
            twothousands: '2000s',
            twothousand: '2000s',
            zeroes: '2000s',
            aughts: '2000s',
            tens: '2010s',
            twenty: '2010s',
        };
        for (const [word, decade] of Object.entries(wordMap)) {
            if (normalized.includes(word))
                return decade;
        }
        return null;
    }
    isDecadeClose(guessed, correct) {
        if (!guessed)
            return false;
        const guessedNum = parseInt(guessed.replace('s', ''));
        const correctNum = parseInt(correct.replace('s', ''));
        return Math.abs(guessedNum - correctNum) === 10;
    }
    shuffleArray(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
//# sourceMappingURL=new-music-games.js.map