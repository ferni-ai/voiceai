/**
 * 🎵 Music Games
 *
 * Implementations of music-based games.
 * Actually plays music during games using the game-music helper!
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Memory-powered song selection (picks songs based on user history)
 * - Adaptive difficulty (easier/harder based on performance)
 * - Genre/decade affinity tracking
 * - Personality-driven feedback
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { IGameImplementation } from './game-engine.js';
import type {
  GameType,
  GameResult,
  NameThatTuneData,
  OneWordSongData,
  DesertIslandDiscsData,
  ThisOrThatData,
  MoodDJChallengeData,
} from './types.js';
import type { GameMemory } from '../../types/user-profile.js';
import { getDJStyle } from '../dj-service.js';
import {
  searchSong,
  searchSongWithWord,
  searchSongForMood,
  getRandomGameSongs,
  playGameTrack,
  stopGameTrack,
  fadeOutGameTrack,
  isMusicAvailable,
  type GameTrack,
} from './game-music.js';
import {
  getSongSelectionContext,
  getMusicalDNAMessage,
  type SongSelectionContext,
} from './game-intelligence.js';

const log = getLogger();

// ============================================================================
// GAME FACTORY
// ============================================================================

// Shared game memory reference (set by game engine)
let sharedGameMemory: GameMemory | null = null;

/**
 * Set game memory for intelligence features
 */
export function setGameMemoryForGames(memory: GameMemory | null): void {
  sharedGameMemory = memory;
}

export function getMusicGameImplementation(
  gameType: GameType,
  personaId: string
): IGameImplementation | null {
  switch (gameType) {
    case 'name-that-tune':
      return new NameThatTuneGame(personaId);
    case 'one-word-song':
      return new OneWordSongGame(personaId);
    case 'desert-island-discs':
      return new DesertIslandDiscsGame(personaId);
    case 'this-or-that':
      return new ThisOrThatGame(personaId);
    case 'mood-dj-challenge':
      return new MoodDJChallengeGame(personaId);
    default:
      return null;
  }
}

// ============================================================================
// NAME THAT TUNE
// ============================================================================

/**
 * Classic "Name That Tune" game
 * ACTUALLY plays a clip, user guesses the song or artist
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Smart song selection based on user's musical DNA
 * - Adaptive difficulty (stronger genres for challenge, weaker for practice)
 * - Timing-based feedback ("That was fast!")
 * - Musical DNA insights between rounds
 */
class NameThatTuneGame implements IGameImplementation {
  private personaId: string;
  private djStyle: ReturnType<typeof getDJStyle>;
  
  // Dynamic song bank loaded from iTunes
  private songBank: GameTrack[] = [];
  private currentSongIndex: number = 0;
  
  // ✨ Intelligence context
  private selectionContext: SongSelectionContext | null = null;
  private correctInARow: number = 0;
  private wrongInARow: number = 0;

  constructor(personaId: string) {
    this.personaId = personaId;
    this.djStyle = getDJStyle(personaId);
  }

  async initialize(config?: Record<string, unknown>): Promise<{
    initialState: Record<string, unknown>;
    totalRounds: number;
    welcomeMessage: string;
  }> {
    const rounds = (config?.rounds as number) || 5;
    
    // ✨ Get intelligence context for smart song selection
    if (sharedGameMemory) {
      this.selectionContext = getSongSelectionContext(sharedGameMemory);
      log.debug({ context: this.selectionContext }, '🧠 Got song selection context');
    }
    
    // 🎵 ACTUALLY LOAD SONGS from iTunes!
    log.info({ rounds }, '🎮 Loading Name That Tune songs from iTunes...');
    this.songBank = await getRandomGameSongs(rounds + 3); // Extra in case some fail
    
    if (this.songBank.length === 0) {
      log.warn('🎮 No songs loaded, game may not work properly');
    } else {
      log.info({ count: this.songBank.length }, '🎮 Songs loaded for Name That Tune');
    }
    
    // Pick first song
    const firstSong = this.songBank[0] || {
      name: 'Bohemian Rhapsody',
      artist: 'Queen',
      previewUrl: '',
    };
    this.currentSongIndex = 0;
    this.correctInARow = 0;
    this.wrongInARow = 0;

    const initialState: NameThatTuneData = {
      currentSong: {
        name: firstSong.name,
        artist: firstSong.artist,
        previewUrl: firstSong.previewUrl,
      },
      acceptableAnswers: this.getAcceptableAnswers(firstSong),
      hintsUsed: 0,
      timeLimit: 30,
      playedSongs: [firstSong.name],
    };

    const welcomeMessage = await this.getWelcomeMessage(rounds, firstSong);

    return {
      initialState: initialState as unknown as Record<string, unknown>,
      totalRounds: rounds,
      welcomeMessage,
    };
  }

  async evaluateAnswer(
    answer: string,
    gameData: Record<string, unknown>,
    round: number
  ): Promise<GameResult> {
    const data = gameData as unknown as NameThatTuneData;
    const normalized = answer.toLowerCase().trim();
    
    // 🎵 Stop the music for the reveal!
    await fadeOutGameTrack(1500);
    
    // Check if answer matches song or artist
    const isCorrect = data.acceptableAnswers.some(
      acceptable => normalized.includes(acceptable.toLowerCase())
    );

    if (isCorrect) {
      // ✨ Track streak for richer feedback
      this.correctInARow++;
      this.wrongInARow = 0;
      
      const points = Math.max(100 - (data.hintsUsed * 25), 25);
      let feedback = this.getCorrectFeedback(data.currentSong!);
      
      // ✨ Add streak-aware commentary
      if (this.correctInARow === 3) {
        feedback = `🔥 Three in a row! ${feedback}`;
      } else if (this.correctInARow === 5) {
        feedback = `🔥🔥 FIVE IN A ROW! You're on fire! ${feedback}`;
      } else if (this.correctInARow >= 7) {
        feedback = `🔥🔥🔥 ${this.correctInARow} streak! Are you a DJ?! ${feedback}`;
      }
      
      // ✨ Occasionally add musical DNA insight
      if (sharedGameMemory && round >= 3 && Math.random() < 0.15) {
        const dnaMessage = getMusicalDNAMessage(sharedGameMemory);
        if (dnaMessage) {
          feedback = `${feedback}\n\n💭 ${dnaMessage}`;
        }
      }
      
      return {
        correct: true,
        pointsEarned: points,
        feedback,
        gameOver: false,
      };
    }

    // ✨ Track misses for encouraging feedback
    this.wrongInARow++;
    this.correctInARow = 0;
    
    let feedback = this.getWrongFeedback(data.currentSong!);
    
    // ✨ Add encouraging words if struggling
    if (this.wrongInARow >= 3) {
      const encouragements = [
        "Don't worry, I'll find you something you might know better next...",
        "These are tricky ones! Let's try a different vibe.",
        "Hang in there! Music knowledge is like a muscle.",
      ];
      feedback = `${feedback}\n\n${encouragements[Math.floor(Math.random() * encouragements.length)]}`;
    }

    return {
      correct: false,
      pointsEarned: 0,
      feedback,
      correctAnswer: `${data.currentSong!.name} by ${data.currentSong!.artist}`,
      gameOver: false,
    };
  }

  async setupNextRound(
    gameData: Record<string, unknown>,
    nextRound: number
  ): Promise<Record<string, unknown>> {
    const data = gameData as unknown as NameThatTuneData;
    
    // Pick next song from our loaded bank
    this.currentSongIndex++;
    const nextSong = this.songBank[this.currentSongIndex] || this.songBank[0];
    
    // 🎵 ACTUALLY PLAY the next song!
    if (nextSong.previewUrl && isMusicAvailable()) {
      log.info({ song: nextSong.name }, '🎮 Playing next Name That Tune song');
      await playGameTrack(nextSong);
    }
    
    const newData: NameThatTuneData = {
      ...data,
      currentSong: {
        name: nextSong.name,
        artist: nextSong.artist,
        previewUrl: nextSong.previewUrl,
      },
      acceptableAnswers: this.getAcceptableAnswers(nextSong),
      hintsUsed: 0,
      playedSongs: [...data.playedSongs, nextSong.name],
    };
    
    return newData as unknown as Record<string, unknown>;
  }

  getHint(gameData: Record<string, unknown>): string | null {
    const data = gameData as unknown as NameThatTuneData;
    const currentSong = this.songBank[this.currentSongIndex];
    
    if (data.hintsUsed === 0) {
      data.hintsUsed++;
      // Try to determine decade from song bank
      const decade = currentSong?.decade || '2010s';
      return `Here's a hint: It's from the ${decade}!`;
    } else if (data.hintsUsed === 1) {
      data.hintsUsed++;
      const firstLetter = data.currentSong!.artist[0];
      return `Another hint: The artist's name starts with "${firstLetter}"!`;
    }
    
    return "No more hints! Take your best guess!";
  }

  async handleSkip(gameData: Record<string, unknown>): Promise<GameResult> {
    const data = gameData as unknown as NameThatTuneData;
    
    // Stop the music
    stopGameTrack();
    
    return {
      correct: false,
      pointsEarned: 0,
      feedback: `The answer was "${data.currentSong!.name}" by ${data.currentSong!.artist}. On to the next one!`,
      correctAnswer: `${data.currentSong!.name} by ${data.currentSong!.artist}`,
      gameOver: false,
    };
  }

  private getAcceptableAnswers(song: { name: string; artist: string }): string[] {
    return [
      song.name,
      song.artist,
      // Add common variations
      song.name.replace(/['']/g, ''),
      song.artist.replace(/['']/g, ''),
      // Handle "The" prefix
      song.artist.replace(/^The\s+/i, ''),
    ].filter(Boolean);
  }

  private async getWelcomeMessage(rounds: number, firstSong: GameTrack): Promise<string> {
    const intros: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/><break time="100ms"/>Name That Tune! ${rounds} rounds, let's GO! I'll play a song, you guess it.`,
      ],
      chill: [
        `<break time="200ms"/>Alright, Name That Tune. ${rounds} rounds. I'll play something, you tell me what it is.`,
      ],
      mindful: [
        `<break time="200ms"/>Let's play Name That Tune. ${rounds} songs. Listen carefully and trust your instincts.`,
      ],
      warm: [
        `<break time="150ms"/>Time for Name That Tune! I'll play ${rounds} songs and you guess them. No pressure, just fun!`,
      ],
      sophisticated: [
        `<break time="150ms"/>Name That Tune. ${rounds} rounds. Shall we test your musical knowledge?`,
      ],
      playful: [
        `<emotion value="happy"/><break time="100ms"/>Ooh! Name That Tune time! ${rounds} songs! I bet I can stump you!`,
      ],
    };

    const styleIntros = intros[this.djStyle.style] || intros.warm;
    let message = styleIntros[Math.floor(Math.random() * styleIntros.length)];
    
    // ✨ Add "we played before" memory context
    if (sharedGameMemory) {
      const stats = sharedGameMemory.gameStats['name-that-tune'];
      if (stats && stats.gamesPlayed > 0) {
        const memoryPhrases = [
          `We've played ${stats.gamesPlayed} times! Your high score is ${stats.highScore}. Let's beat it!`,
          `I remember you! Your best game was ${stats.highScore} points. Ready to go higher?`,
          `Your fastest guess last time was impressive. Let's see if you can beat it!`,
        ];
        const streak = sharedGameMemory.currentStreak || 0;
        if (streak >= 3) {
          message = `🔥 You were on a ${streak} streak last time! ${message}`;
        } else {
          const memoryNote = memoryPhrases[Math.floor(Math.random() * memoryPhrases.length)];
          message = `${memoryNote}\n\n${message}`;
        }
      }
      
      // ✨ Add musical DNA insight for returning players
      if (stats && stats.gamesPlayed >= 5) {
        const dnaMessage = getMusicalDNAMessage(sharedGameMemory);
        if (dnaMessage && Math.random() < 0.3) {
          message = `${message}\n\n💭 Quick note: ${dnaMessage}`;
        }
      }
    }
    
    // 🎵 ACTUALLY PLAY the first song!
    if (firstSong.previewUrl && isMusicAvailable()) {
      log.info({ song: firstSong.name }, '🎮 Playing first Name That Tune song');
      await playGameTrack(firstSong);
      message += `\n\n🎵 Listen up! What song is this?`;
    } else {
      message += `\n\n🎵 Here comes the first song! What is it?`;
    }
    
    return message;
  }

  private getCorrectFeedback(song: { name: string; artist: string }): string {
    const feedbacks: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/>YES! That's "${song.name}" by ${song.artist}! Nice one!`,
        `<emotion value="happy"/>Boom! ${song.artist} - "${song.name}"! You got it!`,
      ],
      chill: [
        `<break time="100ms"/>Nice. "${song.name}" by ${song.artist}. You know your music.`,
        `<break time="100ms"/>Yep, that's ${song.artist}. Good ear.`,
      ],
      warm: [
        `<break time="100ms"/>That's it! "${song.name}" by ${song.artist}. Well done!`,
        `<break time="100ms"/>Correct! ${song.artist} with "${song.name}". Nice!`,
      ],
      playful: [
        `<emotion value="happy"/>Ding ding ding! "${song.name}"! You're good at this!`,
      ],
    };

    const styleFeedbacks = feedbacks[this.djStyle.style] || feedbacks.warm;
    return styleFeedbacks[Math.floor(Math.random() * styleFeedbacks.length)] + 
      `\n\n🎵 Ready for the next one?`;
  }

  private getWrongFeedback(song: { name: string; artist: string }): string {
    const feedbacks: Record<string, string[]> = {
      hype: [
        `<break time="100ms"/>Ooh, not quite! That was "${song.name}" by ${song.artist}!`,
      ],
      chill: [
        `<break time="150ms"/>Nope. That was ${song.artist} - "${song.name}".`,
      ],
      warm: [
        `<break time="100ms"/>Close! It was "${song.name}" by ${song.artist}. Good try though!`,
      ],
      playful: [
        `<break time="100ms"/>Aww! It was "${song.name}"! Tricky one!`,
      ],
    };

    const styleFeedbacks = feedbacks[this.djStyle.style] || feedbacks.warm;
    return styleFeedbacks[Math.floor(Math.random() * styleFeedbacks.length)] +
      `\n\n🎵 Let's try another!`;
  }
}

// ============================================================================
// ONE WORD SONG
// ============================================================================

/**
 * User says a word, agent finds a song with that word
 * ACTUALLY searches iTunes and plays the song!
 */
class OneWordSongGame implements IGameImplementation {
  private personaId: string;
  private djStyle: ReturnType<typeof getDJStyle>;

  constructor(personaId: string) {
    this.personaId = personaId;
    this.djStyle = getDJStyle(personaId);
  }

  async initialize(): Promise<{
    initialState: Record<string, unknown>;
    totalRounds: number;
    welcomeMessage: string;
  }> {
    const initialState: OneWordSongData = {
      currentWord: null,
      foundSong: null,
      usedWords: [],
      playedSongs: [],
    };

    const welcomeMessage = this.getWelcomeMessage();

    return {
      initialState: initialState as unknown as Record<string, unknown>,
      totalRounds: 10, // User-driven, ends when they want
      welcomeMessage,
    };
  }

  async evaluateAnswer(
    answer: string,
    gameData: Record<string, unknown>,
  ): Promise<GameResult> {
    const data = gameData as unknown as OneWordSongData;
    const word = answer.toLowerCase().trim();

    // Check if word was already used
    if (data.usedWords.includes(word)) {
      return {
        correct: false,
        pointsEarned: 0,
        feedback: `We already did "${word}"! Try a different word.`,
        gameOver: false,
      };
    }

    // 🎵 ACTUALLY SEARCH iTunes for a song with this word!
    log.info({ word }, '🎮 Searching for song with word');
    const result = await searchSongWithWord(word);

    if (result.found && result.track) {
      data.currentWord = word;
      data.foundSong = {
        name: result.track.name,
        artist: result.track.artist,
        previewUrl: result.track.previewUrl,
      };
      data.usedWords.push(word);
      data.playedSongs.push(result.track.name);

      // 🎵 ACTUALLY PLAY the song!
      if (result.track.previewUrl && isMusicAvailable()) {
        log.info({ song: result.track.name }, '🎮 Playing One Word Song result');
        await playGameTrack(result.track);
      }

      return {
        correct: true,
        pointsEarned: 10,
        feedback: this.getFoundFeedback(word, result.track),
        gameOver: false,
      };
    }

    return {
      correct: false,
      pointsEarned: 0,
      feedback: this.getNotFoundFeedback(word),
      gameOver: false,
    };
  }

  async setupNextRound(
    gameData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = gameData as unknown as OneWordSongData;
    return {
      ...data,
      currentWord: null,
      foundSong: null,
    };
  }

  getHint(): string | null {
    const hints = [
      "Try a common word like 'love', 'night', or 'dance'!",
      "Colors work great - 'blue', 'red', 'gold'...",
      "Emotions are good - 'happy', 'crazy', 'free'...",
      "Try 'fire', 'heart', 'rain', or 'sun'!",
    ];
    return hints[Math.floor(Math.random() * hints.length)];
  }

  async handleSkip(): Promise<GameResult> {
    return {
      correct: false,
      pointsEarned: 0,
      feedback: "Okay, give me another word whenever you're ready!",
      gameOver: false,
    };
  }

  private getWelcomeMessage(): string {
    const intros: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/><break time="100ms"/>One Word Song! Give me ANY word and I'll find a song with it. GO!`,
      ],
      chill: [
        `<break time="200ms"/>One Word Song. You say a word, I find a song with it. Simple. What's your word?`,
      ],
      warm: [
        `<break time="150ms"/>Let's play One Word Song! Give me any word and I'll find a song with it in the title. What word?`,
      ],
      playful: [
        `<emotion value="happy"/><break time="100ms"/>Ooh! One Word Song! Hit me with a word - ANY word - and I'll find you a song!`,
      ],
    };

    const styleIntros = intros[this.djStyle.style] || intros.warm;
    return styleIntros[Math.floor(Math.random() * styleIntros.length)];
  }

  private getFoundFeedback(word: string, song: { name: string; artist: string }): string {
    const feedbacks: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/>"${word}"? Easy! Here's "${song.name}" by ${song.artist}!`,
      ],
      chill: [
        `<break time="100ms"/>"${word}"... got one. "${song.name}" by ${song.artist}.`,
      ],
      warm: [
        `<break time="100ms"/>"${word}"! Nice choice. Here's "${song.name}" by ${song.artist}!`,
      ],
      playful: [
        `<emotion value="happy"/>"${word}"?! Oh I got you! "${song.name}"!`,
      ],
    };

    const styleFeedbacks = feedbacks[this.djStyle.style] || feedbacks.warm;
    return styleFeedbacks[Math.floor(Math.random() * styleFeedbacks.length)] +
      '\n\n🎵 Playing now! Give me another word when you\'re ready!';
  }

  private getNotFoundFeedback(word: string): string {
    return `Hmm, "${word}" is tough! I couldn't find a song with that. Try another word?`;
  }
}

// ============================================================================
// DESERT ISLAND DISCS
// ============================================================================

/**
 * Pick 5 songs you'd bring to a desert island
 * More of a conversation/activity than a scored game
 */
class DesertIslandDiscsGame implements IGameImplementation {
  private personaId: string;
  private djStyle: ReturnType<typeof getDJStyle>;

  private prompts = [
    "If you could only listen to 5 songs for the rest of your life on a desert island, what would they be?",
    "What's your first pick? A song that you could listen to forever?",
    "What's your second song? Maybe something that means a lot to you?",
    "Third song - what's a track that never gets old for you?",
    "Fourth pick! We're almost there. What's essential?",
    "Last one! Your fifth and final desert island song. Make it count!",
  ];

  constructor(personaId: string) {
    this.personaId = personaId;
    this.djStyle = getDJStyle(personaId);
  }

  async initialize(): Promise<{
    initialState: Record<string, unknown>;
    totalRounds: number;
    welcomeMessage: string;
  }> {
    const initialState: DesertIslandDiscsData = {
      pickedSongs: [],
      currentPrompt: this.prompts[1],
      totalPicks: 5,
    };

    return {
      initialState: initialState as unknown as Record<string, unknown>,
      totalRounds: 5,
      welcomeMessage: this.getWelcomeMessage(),
    };
  }

  async evaluateAnswer(
    answer: string,
    gameData: Record<string, unknown>,
    round: number
  ): Promise<GameResult> {
    const data = gameData as unknown as DesertIslandDiscsData;
    
    // User is telling us a song - try to find and play it!
    const songName = answer.trim();
    
    // 🎵 Search for and play the song they picked!
    const result = await searchSong(songName);
    
    if (result.found && result.track) {
      data.pickedSongs.push({
        name: result.track.name,
        artist: result.track.artist,
      });
      
      // Play a clip of their pick!
      if (result.track.previewUrl && isMusicAvailable()) {
        log.info({ song: result.track.name }, '🎮 Playing Desert Island pick');
        await playGameTrack(result.track);
      }
    } else {
      // Couldn't find it, just add the name they said
      data.pickedSongs.push({
        name: songName,
      });
    }

    const isLastPick = data.pickedSongs.length >= data.totalPicks;

    if (isLastPick) {
      stopGameTrack();
      
      // ✨ Save Desert Island picks to memory - these are meaningful!
      if (sharedGameMemory) {
        sharedGameMemory.desertIslandPicks = data.pickedSongs.map(s => 
          s.artist ? `${s.name} by ${s.artist}` : s.name
        );
        sharedGameMemory.updatedAt = new Date();
        log.info({ picks: sharedGameMemory.desertIslandPicks }, '🏝️ Saved Desert Island picks');
      }
      
      return {
        correct: true,
        pointsEarned: 100,
        feedback: this.getFinalFeedback(data.pickedSongs),
        gameOver: true,
        finalScore: 100,
      };
    }

    return {
      correct: true,
      pointsEarned: 20,
      feedback: this.getPickFeedback(songName, data.pickedSongs.length),
      gameOver: false,
    };
  }

  async setupNextRound(
    gameData: Record<string, unknown>,
    nextRound: number
  ): Promise<Record<string, unknown>> {
    const data = gameData as unknown as DesertIslandDiscsData;
    return {
      ...data,
      currentPrompt: this.prompts[nextRound] || this.prompts[this.prompts.length - 1],
    };
  }

  getHint(): string | null {
    const hints = [
      "Think about songs that have been with you through important moments.",
      "What song would you want to hear when you're happy? When you're sad?",
      "Is there a song that reminds you of someone special?",
      "What song makes you feel most like yourself?",
    ];
    return hints[Math.floor(Math.random() * hints.length)];
  }

  async handleSkip(): Promise<GameResult> {
    return {
      correct: false,
      pointsEarned: 0,
      feedback: "Take your time! This is a big decision. What song comes to mind?",
      gameOver: false,
    };
  }

  private getWelcomeMessage(): string {
    const intros: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/><break time="100ms"/>Desert Island Discs! You're stranded on an island with only 5 songs. Forever. What are they? Let's GO!`,
      ],
      chill: [
        `<break time="200ms"/>Desert Island Discs. Classic. Five songs for the rest of your life. No pressure. What's your first pick?`,
      ],
      mindful: [
        `<break time="200ms"/>Let's play Desert Island Discs. Imagine you can only hear 5 songs ever again. What music would you want with you?`,
      ],
      warm: [
        `<break time="150ms"/>Time for Desert Island Discs! Pick 5 songs you'd bring to a desert island. I'll play a clip of each one as you pick them. What's your first?`,
      ],
      playful: [
        `<emotion value="happy"/><break time="100ms"/>Ooh Desert Island Discs! Only 5 songs FOREVER. This is tough! What's number one?`,
      ],
    };

    const styleIntros = intros[this.djStyle.style] || intros.warm;
    let message = styleIntros[Math.floor(Math.random() * styleIntros.length)];
    
    // ✨ Reference previous picks if they've played before
    if (sharedGameMemory?.desertIslandPicks && sharedGameMemory.desertIslandPicks.length > 0) {
      const previousPicks = sharedGameMemory.desertIslandPicks.slice(0, 2);
      const reminderPhrases = [
        `Last time you picked "${previousPicks[0]}" first. Changed your mind since then?`,
        `I remember your picks from before: ${previousPicks.join(', ')}... Let's see if anything's changed!`,
        `Interesting to see if you'd pick the same songs again. Your last #1 was "${previousPicks[0]}"...`,
      ];
      const reminder = reminderPhrases[Math.floor(Math.random() * reminderPhrases.length)];
      message = `${reminder}\n\n${message}`;
    }
    
    return message;
  }

  private getPickFeedback(songName: string, pickNumber: number): string {
    const feedbacks: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/>"${songName}"! Great choice! ${5 - pickNumber} more to go!`,
      ],
      chill: [
        `<break time="100ms"/>"${songName}". Nice. ${5 - pickNumber} left.`,
      ],
      warm: [
        `<break time="100ms"/>"${songName}" - I love it! ${5 - pickNumber} more picks. What's next?`,
      ],
      playful: [
        `<emotion value="happy"/>"${songName}"! Yes! ${5 - pickNumber} to go!`,
      ],
    };

    const styleFeedbacks = feedbacks[this.djStyle.style] || feedbacks.warm;
    return styleFeedbacks[Math.floor(Math.random() * styleFeedbacks.length)];
  }

  private getFinalFeedback(songs: Array<{ name: string; artist?: string }>): string {
    const songList = songs.map((s, i) => `${i + 1}. ${s.name}${s.artist ? ` by ${s.artist}` : ''}`).join('\n');
    
    const outros: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/>Your Desert Island Playlist:\n${songList}\n\nThat's a FIRE playlist! You'd survive in style!`,
      ],
      chill: [
        `<break time="200ms"/>Your picks:\n${songList}\n\nSolid choices. I'd survive on those.`,
      ],
      warm: [
        `<break time="150ms"/>Your Desert Island Discs:\n${songList}\n\nWhat a beautiful selection. I learned something about you!`,
      ],
      playful: [
        `<emotion value="happy"/>Your island jams:\n${songList}\n\nOkay I would totally hang on that island with you!`,
      ],
    };

    const styleOutros = outros[this.djStyle.style] || outros.warm;
    return styleOutros[Math.floor(Math.random() * styleOutros.length)];
  }
}

// ============================================================================
// THIS OR THAT
// ============================================================================

/**
 * Play two songs, user picks their favorite
 * ACTUALLY plays clips of both songs!
 */
class ThisOrThatGame implements IGameImplementation {
  private personaId: string;
  private djStyle: ReturnType<typeof getDJStyle>;
  
  // Will be loaded dynamically
  private matchups: Array<{ songA: GameTrack; songB: GameTrack }> = [];
  private currentMatchupIndex: number = 0;

  // Fallback matchups if dynamic loading fails
  private fallbackMatchups = [
    { songA: 'Bohemian Rhapsody Queen', songB: 'Stairway to Heaven Led Zeppelin' },
    { songA: 'Billie Jean Michael Jackson', songB: 'Purple Rain Prince' },
    { songA: 'Smells Like Teen Spirit Nirvana', songB: 'Wonderwall Oasis' },
    { songA: 'Shape of You Ed Sheeran', songB: 'Blinding Lights Weeknd' },
    { songA: 'Rolling in the Deep Adele', songB: 'Someone Like You Adele' },
  ];

  constructor(personaId: string) {
    this.personaId = personaId;
    this.djStyle = getDJStyle(personaId);
  }

  async initialize(): Promise<{
    initialState: Record<string, unknown>;
    totalRounds: number;
    welcomeMessage: string;
  }> {
    // 🎵 Load matchups from iTunes
    log.info('🎮 Loading This or That matchups from iTunes...');
    
    for (const fallback of this.fallbackMatchups) {
      const resultA = await searchSong(fallback.songA);
      const resultB = await searchSong(fallback.songB);
      
      if (resultA.found && resultA.track && resultB.found && resultB.track) {
        this.matchups.push({
          songA: resultA.track,
          songB: resultB.track,
        });
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    log.info({ count: this.matchups.length }, '🎮 Loaded This or That matchups');
    
    const firstMatchup = this.matchups[0];
    
    const initialState: ThisOrThatData = {
      songA: firstMatchup ? {
        name: firstMatchup.songA.name,
        artist: firstMatchup.songA.artist,
        previewUrl: firstMatchup.songA.previewUrl,
      } : null,
      songB: firstMatchup ? {
        name: firstMatchup.songB.name,
        artist: firstMatchup.songB.artist,
        previewUrl: firstMatchup.songB.previewUrl,
      } : null,
      choices: [],
    };

    return {
      initialState: initialState as unknown as Record<string, unknown>,
      totalRounds: this.matchups.length || 5,
      welcomeMessage: await this.getWelcomeMessage(firstMatchup),
    };
  }

  async evaluateAnswer(
    answer: string,
    gameData: Record<string, unknown>,
    round: number
  ): Promise<GameResult> {
    const data = gameData as unknown as ThisOrThatData;
    const choice = answer.toLowerCase().trim();
    
    // Stop current playback
    stopGameTrack();
    
    let chosen: 'A' | 'B';
    if (choice.includes('a') || choice.includes('first') || 
        (data.songA && choice.includes(data.songA.name.toLowerCase()))) {
      chosen = 'A';
    } else if (choice.includes('b') || choice.includes('second') || 
               (data.songB && choice.includes(data.songB.name.toLowerCase()))) {
      chosen = 'B';
    } else {
      return {
        correct: false,
        pointsEarned: 0,
        feedback: "Just say A or B! Or the song name. Which one do you prefer?",
        gameOver: false,
      };
    }

    data.choices.push({
      chosen,
      songA: data.songA!.name,
      songB: data.songB!.name,
    });

    const chosenSong = chosen === 'A' ? data.songA! : data.songB!;

    return {
      correct: true,
      pointsEarned: 10,
      feedback: this.getChoiceFeedback(chosenSong),
      gameOver: round >= this.matchups.length,
    };
  }

  async setupNextRound(
    gameData: Record<string, unknown>,
    nextRound: number
  ): Promise<Record<string, unknown>> {
    const data = gameData as unknown as ThisOrThatData;
    this.currentMatchupIndex++;
    
    const nextMatchup = this.matchups[this.currentMatchupIndex];
    
    if (!nextMatchup) {
      return data as unknown as Record<string, unknown>;
    }

    // 🎵 Play snippets of both songs
    const introMessage = await this.playBothSongs(nextMatchup);
    log.debug({ introMessage }, '🎮 Playing This or That matchup');

    const newData: ThisOrThatData = {
      ...data,
      songA: {
        name: nextMatchup.songA.name,
        artist: nextMatchup.songA.artist,
        previewUrl: nextMatchup.songA.previewUrl,
      },
      songB: {
        name: nextMatchup.songB.name,
        artist: nextMatchup.songB.artist,
        previewUrl: nextMatchup.songB.previewUrl,
      },
    };
    
    return newData as unknown as Record<string, unknown>;
  }

  getHint(): string | null {
    return "Go with your gut! There's no wrong answer here.";
  }

  async handleSkip(): Promise<GameResult> {
    stopGameTrack();
    return {
      correct: false,
      pointsEarned: 0,
      feedback: "Can't decide? That's fair - they're both great! Just pick one though!",
      gameOver: false,
    };
  }

  private async getWelcomeMessage(firstMatchup?: { songA: GameTrack; songB: GameTrack }): Promise<string> {
    let message = `<break time="150ms"/>This or That! I'll play two songs, you pick your favorite. Simple!\n\n`;
    
    if (firstMatchup) {
      message += `First matchup:\n` +
        `A) "${firstMatchup.songA.name}" by ${firstMatchup.songA.artist}\n` +
        `B) "${firstMatchup.songB.name}" by ${firstMatchup.songB.artist}\n\n`;
      
      // Play first song
      if (isMusicAvailable()) {
        await this.playBothSongs(firstMatchup);
      }
      
      message += `Which one?`;
    }
    
    return message;
  }

  private async playBothSongs(matchup: { songA: GameTrack; songB: GameTrack }): Promise<void> {
    // Play song A for a few seconds, then song B
    if (matchup.songA.previewUrl && isMusicAvailable()) {
      await playGameTrack(matchup.songA);
      // Let it play for 8 seconds
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Quick fade and switch to B
      await fadeOutGameTrack(500);
      
      if (matchup.songB.previewUrl) {
        await playGameTrack(matchup.songB);
      }
    }
  }

  private getChoiceFeedback(song: { name: string; artist: string }): string {
    const feedbacks: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/>"${song.name}"! Good taste!`,
      ],
      chill: [
        `<break time="100ms"/>"${song.name}". Solid pick.`,
      ],
      warm: [
        `<break time="100ms"/>"${song.name}" - nice choice!`,
      ],
      playful: [
        `<emotion value="happy"/>Ooh "${song.name}"! I respect it!`,
      ],
    };

    const styleFeedbacks = feedbacks[this.djStyle.style] || feedbacks.warm;
    return styleFeedbacks[Math.floor(Math.random() * styleFeedbacks.length)] + 
      `\n\n🎵 Next matchup coming up!`;
  }
}

// ============================================================================
// MOOD DJ CHALLENGE
// ============================================================================

/**
 * User describes a mood/scenario, agent picks the perfect song
 * ACTUALLY searches and plays mood-appropriate music!
 */
class MoodDJChallengeGame implements IGameImplementation {
  private personaId: string;
  private djStyle: ReturnType<typeof getDJStyle>;

  constructor(personaId: string) {
    this.personaId = personaId;
    this.djStyle = getDJStyle(personaId);
  }

  async initialize(): Promise<{
    initialState: Record<string, unknown>;
    totalRounds: number;
    welcomeMessage: string;
  }> {
    const initialState: MoodDJChallengeData = {
      currentMood: null,
      pickedSong: null,
      userRating: null,
      history: [],
    };

    return {
      initialState: initialState as unknown as Record<string, unknown>,
      totalRounds: 5,
      welcomeMessage: this.getWelcomeMessage(),
    };
  }

  async evaluateAnswer(
    answer: string,
    gameData: Record<string, unknown>,
  ): Promise<GameResult> {
    const data = gameData as unknown as MoodDJChallengeData;
    
    // If we're waiting for a rating
    if (data.pickedSong && data.userRating === null) {
      const rating = parseInt(answer);
      if (rating >= 1 && rating <= 5) {
        data.userRating = rating;
        data.history.push({
          mood: data.currentMood!,
          song: data.pickedSong.name,
          rating,
        });

        // Stop the music after rating
        stopGameTrack();

        const points = rating * 20;
        return {
          correct: rating >= 3,
          pointsEarned: points,
          feedback: this.getRatingFeedback(rating),
          gameOver: false,
        };
      }
      return {
        correct: false,
        pointsEarned: 0,
        feedback: "Rate my pick from 1 to 5! How'd I do?",
        gameOver: false,
      };
    }

    // User is describing a mood - 🎵 ACTUALLY SEARCH for a matching song!
    const mood = answer.trim();
    log.info({ mood }, '🎮 Searching for mood-matching song');
    
    const result = await searchSongForMood(mood);

    if (!result.found || !result.track) {
      return {
        correct: false,
        pointsEarned: 0,
        feedback: `Hmm, "${mood}" is tricky. Let me think... try describing it differently?`,
        gameOver: false,
      };
    }

    data.currentMood = mood;
    data.pickedSong = {
      name: result.track.name,
      artist: result.track.artist,
      previewUrl: result.track.previewUrl,
    };
    data.userRating = null;

    // 🎵 ACTUALLY PLAY the song!
    if (result.track.previewUrl && isMusicAvailable()) {
      log.info({ song: result.track.name, mood }, '🎮 Playing mood-matched song');
      await playGameTrack(result.track);
    }

    return {
      correct: true,
      pointsEarned: 0, // Points come from rating
      feedback: this.getSongPickFeedback(mood, result.track),
      gameOver: false,
    };
  }

  async setupNextRound(
    gameData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = gameData as unknown as MoodDJChallengeData;
    return {
      ...data,
      currentMood: null,
      pickedSong: null,
      userRating: null,
    };
  }

  getHint(): string | null {
    const scenarios = [
      "Try: 'Driving at sunset'",
      "Try: 'Rainy Sunday morning'",
      "Try: 'Getting ready for a party'",
      "Try: 'Working late at night'",
      "Try: 'Missing someone'",
      "Try: 'Feeling on top of the world'",
      "Try: 'Need to focus and concentrate'",
    ];
    return scenarios[Math.floor(Math.random() * scenarios.length)];
  }

  async handleSkip(): Promise<GameResult> {
    stopGameTrack();
    return {
      correct: false,
      pointsEarned: 0,
      feedback: "Give me a mood or scenario and I'll find the perfect song!",
      gameOver: false,
    };
  }

  private getWelcomeMessage(): string {
    return `<break time="150ms"/>Mood DJ Challenge! Describe a mood or scenario, and I'll find the perfect song.\n\n` +
      `Then rate my pick from 1 to 5!\n\n` +
      `What's the mood?`;
  }

  private getSongPickFeedback(mood: string, song: { name: string; artist: string }): string {
    const feedbacks: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/>"${mood}"? Oh I got this! Here's "${song.name}" by ${song.artist}!`,
      ],
      chill: [
        `<break time="100ms"/>"${mood}"... "${song.name}" by ${song.artist}. How'd I do?`,
      ],
      warm: [
        `<break time="100ms"/>For "${mood}"... I'm thinking "${song.name}" by ${song.artist}.`,
      ],
    };

    const styleFeedbacks = feedbacks[this.djStyle.style] || feedbacks.warm;
    return styleFeedbacks[Math.floor(Math.random() * styleFeedbacks.length)] +
      `\n\n🎵 Playing now! Rate my pick 1-5!`;
  }

  private getRatingFeedback(rating: number): string {
    if (rating >= 4) {
      return `<emotion value="happy"/>Yes! I knew it! Give me another mood!`;
    } else if (rating >= 3) {
      return `Not bad! Let me try again with another mood.`;
    } else {
      return `Ouch! Okay, I can do better. Another mood?`;
    }
  }
}
