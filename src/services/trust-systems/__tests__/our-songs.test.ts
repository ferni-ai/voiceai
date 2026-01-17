/**
 * Our Songs Integration Tests
 *
 * Tests the "Our Songs" shared musical memory system:
 * - Significant moment detection
 * - Song memory recording
 * - Playback callbacks
 * - Proactive "remember when" moments
 *
 * @module OurSongsTests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectSignificantMoment,
  recordOurSong,
  checkForOurSong,
  getProactiveRememberWhen,
  getOurSongsStats,
  getAllOurSongs,
  loadOurSongsProfile,
  getOurSongsProfileForPersistence,
  type RecordSongMomentParams,
  type SharedSongMemory,
  type OurSongsProfile,
} from '../our-songs.js';

describe('Our Songs Integration', () => {
  const testUserId = `test-user-${Date.now()}`;

  describe('Significant Moment Detection', () => {
    it('should detect breakthrough moments', () => {
      const contexts = [
        "I finally realized I've been too hard on myself",
        'It just clicked why I was so afraid',
        "I'm ready to forgive my mom",
        "I've been holding onto this resentment for years",
      ];

      for (const text of contexts) {
        const result = detectSignificantMoment({
          recentUserText: text,
          isUserSpeaking: true,
        });

        expect(result.isSignificant).toBe(true);
        expect(result.type).toBe('breakthrough');
      }
    });

    it('should detect celebration moments', () => {
      // NOTE: Phrases must NOT contain breakthrough indicators like "i finally"
      // or they will match breakthrough first (order matters in detection)
      const contexts = [
        'They said yes to my proposal',
        "I can't believe it worked!",
        'Best day ever, it happened!',
        'Dream come true!',
      ];

      for (const text of contexts) {
        const result = detectSignificantMoment({
          recentUserText: text,
          isUserSpeaking: true,
        });

        expect(result.isSignificant).toBe(true);
        expect(result.type).toBe('celebration');
        expect(result.emotion).toBe('excited');
      }
    });

    it('should detect vulnerability moments', () => {
      const contexts = [
        "I'm scared about what the doctor might say",
        "I've never said this out loud before",
        "I don't know who else to tell this to",
        "I'm not okay right now",
      ];

      for (const text of contexts) {
        const result = detectSignificantMoment({
          recentUserText: text,
          isUserSpeaking: true,
        });

        expect(result.isSignificant).toBe(true);
        expect(result.type).toBe('vulnerable');
        expect(result.emotion).toBe('vulnerable');
      }
    });

    it('should detect music love moments', () => {
      const contexts = [
        'Oh my god I love this song!',
        'This is my jam, turn it up!',
        "Don't skip this one, it's so good",
        'This hits different today',
      ];

      for (const text of contexts) {
        const result = detectSignificantMoment({
          recentUserText: text,
          isUserSpeaking: true,
        });

        expect(result.isSignificant).toBe(true);
        expect(result.type).toBe('they_loved_it');
      }
    });

    it('should return not significant for regular conversation', () => {
      const contexts = [
        "What's the weather like?",
        'Tell me a joke',
        "I'm going to make dinner now",
        'The meeting went okay today',
      ];

      for (const text of contexts) {
        const result = detectSignificantMoment({
          recentUserText: text,
          isUserSpeaking: true,
        });

        expect(result.isSignificant).toBe(false);
      }
    });

    it('should detect emotion from text when not provided', () => {
      const result = detectSignificantMoment({
        recentUserText: 'I finally feel grateful for what I have',
        isUserSpeaking: true,
      });

      expect(result.emotion).toBe('grateful');
    });
  });

  describe('Song Memory Recording', () => {
    it('should record a new song memory', () => {
      const params: RecordSongMomentParams = {
        userId: testUserId,
        song: {
          name: 'Test Song',
          artist: 'Test Artist',
          spotifyId: 'spotify:track:123',
        },
        momentType: 'celebration',
        emotion: 'excited',
        context: 'got the job offer',
        topic: 'career',
      };

      const memory = recordOurSong(params);

      expect(memory.id).toBeTruthy();
      expect(memory.song.name).toBe('Test Song');
      expect(memory.moment.type).toBe('celebration');
      expect(memory.moment.emotion).toBe('excited');
      expect(memory.significance).toBe('meaningful');
      expect(memory.callbackCount).toBe(0);
      expect(memory.canSuggest).toBe(true);
    });

    it('should update existing song with more significant moment', () => {
      const userId = `test-user-update-${Date.now()}`;

      // First recording - they loved it
      recordOurSong({
        userId,
        song: { name: 'Same Song', artist: 'Same Artist' },
        momentType: 'they_loved_it',
        emotion: 'happy',
        context: 'just liked it',
      });

      // Second recording - breakthrough (more significant)
      const updated = recordOurSong({
        userId,
        song: { name: 'Same Song', artist: 'Same Artist' },
        momentType: 'breakthrough',
        emotion: 'tearful',
        context: 'realized something profound',
        memorableQuote: 'I finally understand',
      });

      expect(updated.moment.type).toBe('breakthrough');
      expect(updated.moment.memorableQuote).toBe('I finally understand');
      expect(updated.significance).toBe('life_changing');
    });

    it('should mark vulnerable songs as not suggestable', () => {
      const memory = recordOurSong({
        userId: `test-user-vulnerable-${Date.now()}`,
        song: { name: 'Vulnerable Song', artist: 'Sad Artist' },
        momentType: 'vulnerable',
        emotion: 'tearful',
        context: 'opened up about loss',
      });

      expect(memory.canSuggest).toBe(false);
    });

    it('should track first song and most meaningful', () => {
      const userId = `test-user-tracking-${Date.now()}`;

      // First song
      recordOurSong({
        userId,
        song: { name: 'First Song', artist: 'Artist 1' },
        momentType: 'joy',
        emotion: 'happy',
        context: 'fun moment',
      });

      // More meaningful song
      recordOurSong({
        userId,
        song: { name: 'Meaningful Song', artist: 'Artist 2' },
        momentType: 'breakthrough',
        emotion: 'tearful',
        context: 'big realization',
      });

      const stats = getOurSongsStats(userId);

      expect(stats?.firstSong?.song.name).toBe('First Song');
      expect(stats?.mostMeaningful?.song.name).toBe('Meaningful Song');
    });
  });

  describe('Song Callback (Playback Integration)', () => {
    it('should generate callback when "our song" plays', () => {
      const userId = `test-user-callback-${Date.now()}`;

      // Record the song
      recordOurSong({
        userId,
        song: { name: 'Our Special Song', artist: 'Special Artist' },
        momentType: 'celebration',
        emotion: 'excited',
        context: 'got engaged',
        memorableQuote: 'She said yes!',
      });

      // Check for callback when song plays
      const callback = checkForOurSong(userId, 'Our Special Song', 'Special Artist');

      expect(callback).not.toBeNull();
      expect(callback?.phrase).toBeTruthy();
      expect(callback?.memory.song.name).toBe('Our Special Song');
      expect(callback?.timing).toBeDefined();
    });

    it('should not callback too frequently', () => {
      const userId = `test-user-frequency-${Date.now()}`;

      recordOurSong({
        userId,
        song: { name: 'Frequent Song', artist: 'Frequent Artist' },
        momentType: 'joy',
        emotion: 'happy',
        context: 'fun times',
      });

      // First callback
      const first = checkForOurSong(userId, 'Frequent Song', 'Frequent Artist');
      expect(first).not.toBeNull();

      // Second immediate callback should be skipped (within 24 hours)
      const second = checkForOurSong(userId, 'Frequent Song', 'Frequent Artist');
      expect(second).toBeNull();
    });

    it('should return null for unknown songs', () => {
      const callback = checkForOurSong(testUserId, 'Unknown Song', 'Unknown Artist');
      expect(callback).toBeNull();
    });

    it('should increment callback count on each callback', () => {
      const userId = `test-user-count-${Date.now()}`;

      recordOurSong({
        userId,
        song: { name: 'Count Song', artist: 'Count Artist' },
        momentType: 'celebration',
        emotion: 'happy',
        context: 'happy moment',
      });

      const callback = checkForOurSong(userId, 'Count Song', 'Count Artist');
      expect(callback?.memory.callbackCount).toBe(1);
    });
  });

  describe('Proactive "Remember When" Moments', () => {
    it('should return a proactive reminder for established songs', () => {
      const userId = `test-user-proactive-${Date.now()}`;

      // Record a song from a week ago (simulated by setting lastCallback to null)
      recordOurSong({
        userId,
        song: { name: 'Proactive Song', artist: 'Proactive Artist' },
        momentType: 'celebration',
        emotion: 'excited',
        context: 'promotion at work',
      });

      const reminder = getProactiveRememberWhen(userId);

      expect(reminder).not.toBeNull();
      // Proactive reminders can use various phrasings like "thinking about" or "remember"
      expect(reminder?.phrase).toBeTruthy();
      expect(reminder?.phrase.length).toBeGreaterThan(10);
    });

    it('should skip vulnerable moments in proactive reminders', () => {
      const userId = `test-user-skip-vulnerable-${Date.now()}`;

      // Only record a vulnerable song
      recordOurSong({
        userId,
        song: { name: 'Vulnerable Only', artist: 'Sad Artist' },
        momentType: 'vulnerable',
        emotion: 'tearful',
        context: 'opened up about trauma',
      });

      const reminder = getProactiveRememberWhen(userId);

      // Should not suggest vulnerable songs
      expect(reminder).toBeNull();
    });

    it('should return null when no songs recorded', () => {
      const reminder = getProactiveRememberWhen(`nonexistent-user-${Date.now()}`);
      expect(reminder).toBeNull();
    });
  });

  describe('Statistics and Insights', () => {
    it('should return song stats for user', () => {
      const userId = `test-user-stats-${Date.now()}`;

      recordOurSong({
        userId,
        song: { name: 'Stats Song 1', artist: 'Artist' },
        momentType: 'celebration',
        emotion: 'excited',
        context: 'event 1',
      });

      recordOurSong({
        userId,
        song: { name: 'Stats Song 2', artist: 'Artist' },
        momentType: 'joy',
        emotion: 'happy',
        context: 'event 2',
      });

      const stats = getOurSongsStats(userId);

      expect(stats).not.toBeNull();
      expect(stats?.totalSongs).toBe(2);
      expect(stats?.byMomentType['celebration']).toBe(1);
      expect(stats?.byMomentType['joy']).toBe(1);
    });

    it('should return null stats for nonexistent user', () => {
      const stats = getOurSongsStats(`nonexistent-${Date.now()}`);
      expect(stats).toBeNull();
    });

    it('should return all songs for user', () => {
      const userId = `test-user-all-${Date.now()}`;

      recordOurSong({
        userId,
        song: { name: 'All Song 1', artist: 'Artist' },
        momentType: 'joy',
        emotion: 'happy',
        context: 'event 1',
      });

      const songs = getAllOurSongs(userId);

      expect(songs.length).toBe(1);
      expect(songs[0].song.name).toBe('All Song 1');
    });
  });

  describe('Persistence', () => {
    it('should export profile for persistence', () => {
      const userId = `test-user-persist-${Date.now()}`;

      recordOurSong({
        userId,
        song: { name: 'Persist Song', artist: 'Artist' },
        momentType: 'celebration',
        emotion: 'excited',
        context: 'event',
      });

      const profile = getOurSongsProfileForPersistence(userId);

      expect(profile).not.toBeNull();
      expect(profile?.songs.length).toBe(1);
      expect(profile?.userId).toBe(userId);
    });

    it('should load profile from persistence data', () => {
      const userId = `test-user-load-${Date.now()}`;

      const data: OurSongsProfile = {
        userId,
        songs: [
          {
            id: 'song-1',
            song: { name: 'Loaded Song', artist: 'Loaded Artist' },
            moment: {
              timestamp: new Date('2024-01-01'),
              type: 'celebration',
              emotion: 'excited',
              context: 'loaded event',
            },
            significance: 'meaningful',
            callbackCount: 0,
            callbackReception: 'unknown',
            canSuggest: true,
          },
        ],
        totalMoments: 1,
        preferences: {
          lovedGenres: [],
          lovedArtists: [],
          preferredMoods: [],
        },
      };

      loadOurSongsProfile(userId, data);

      const songs = getAllOurSongs(userId);
      expect(songs.length).toBe(1);
      expect(songs[0].song.name).toBe('Loaded Song');
      expect(songs[0].moment.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Callback Phrase Generation', () => {
    it('should generate appropriate callback for breakthrough', () => {
      const userId = `test-phrase-breakthrough-${Date.now()}`;

      recordOurSong({
        userId,
        song: { name: 'Breakthrough Song', artist: 'Artist' },
        momentType: 'breakthrough',
        emotion: 'tearful',
        context: 'realized something important',
      });

      const callback = checkForOurSong(userId, 'Breakthrough Song', 'Artist');

      expect(callback?.phrase).toMatch(/remember|proud|courage|moment/i);
    });

    it('should generate appropriate callback for they_loved_it', () => {
      const userId = `test-phrase-loved-${Date.now()}`;

      recordOurSong({
        userId,
        song: { name: 'Loved Song', artist: 'Artist' },
        momentType: 'they_loved_it',
        emotion: 'happy',
        context: 'loved the vibe',
      });

      const callback = checkForOurSong(userId, 'Loved Song', 'Artist');

      expect(callback?.phrase).toMatch(/love|favorite|lit up/i);
    });
  });
});
