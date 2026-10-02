/**
 * 🎵 Mood DJ Challenge
 *
 * Music game implementation, split out of music-games.ts (which owns the
 * game factory).
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { IGameImplementation } from './game-engine.js';
import type { GameResult, MoodDJChallengeData } from './types.js';
import { getDJStyle } from '../dj-service.js';
import { searchSongForMood, playGameTrack, stopGameTrack, isMusicAvailable } from './game-music.js';

const log = getLogger();

// ============================================================================
// MOOD DJ CHALLENGE
// ============================================================================

/**
 * User describes a mood/scenario, agent picks the perfect song
 * ACTUALLY searches and plays mood-appropriate music!
 */
export class MoodDJChallengeGame implements IGameImplementation {
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

  async evaluateAnswer(answer: string, gameData: Record<string, unknown>): Promise<GameResult> {
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

  async setupNextRound(gameData: Record<string, unknown>): Promise<Record<string, unknown>> {
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
    return (
      `<break time="150ms"/>Mood DJ Challenge! Describe a mood or scenario, and I'll find the perfect song.\n\n` +
      `Then rate my pick from 1 to 5!\n\n` +
      `What's the mood?`
    );
  }

  private getSongPickFeedback(mood: string, song: { name: string; artist: string }): string {
    const feedbacks: Record<string, string[]> = {
      hype: [
        `<emotion value="happy"/>"${mood}"? Oh I got this! Here's "${song.name}" by ${song.artist}!`,
      ],
      chill: [`<break time="100ms"/>"${mood}"... "${song.name}" by ${song.artist}. How'd I do?`],
      warm: [
        `<break time="100ms"/>For "${mood}"... I'm thinking "${song.name}" by ${song.artist}.`,
      ],
    };

    const styleFeedbacks = feedbacks[this.djStyle.style] || feedbacks.warm;
    return `${
      styleFeedbacks[Math.floor(Math.random() * styleFeedbacks.length)]
    }\n\n🎵 Playing now! Rate my pick 1-5!`;
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
