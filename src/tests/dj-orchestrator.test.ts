/**
 * DJ Orchestrator Service Tests
 *
 * Tests for the main DJ/music integration point including:
 * - Session lifecycle (open/wrap show)
 * - Guest DJ handoffs
 * - Music moments and transitions
 * - Proactive music offers
 * - Cross-session callbacks
 * - Thinking music
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DJOrchestrator,
  getDJOrchestrator,
  resetDJOrchestrator,
} from '../services/dj-orchestrator.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('../services/dj-session.service.js', () => ({
  getDJSessionService: () => ({
    startSession: vi.fn(() => ({
      phrase: 'Welcome to the show!',
      playStinger: true,
      delayMs: 500,
    })),
    endSession: vi.fn(() => ({
      phrase: 'Thanks for listening!',
      playStinger: true,
    })),
    getHandoffBanter: vi.fn(() => 'Let me get my friend...'),
    getGuestDJEntrance: vi.fn(() => 'Hey, I am here now!'),
    getSpontaneousOffer: vi.fn(() => 'Want some tunes?'),
    getQueueTeaser: vi.fn(() => 'Wait till you hear what is next!'),
    getMusicMemoryCallback: vi.fn(() => 'Remember when we played that song?'),
    startThinkingMusic: vi.fn().mockResolvedValue(true),
    stopThinkingMusic: vi.fn().mockResolvedValue(undefined),
    trackTopic: vi.fn(),
    trackMusicPlayed: vi.fn(),
    getSessionSummary: vi.fn(() => ({
      topics: ['work', 'life'],
      musicArtists: ['Artist1'],
      duration: 3600,
    })),
  }),
}));

vi.mock('../services/dj-service.js', () => ({
  getDJStyle: vi.fn(() => ({
    name: 'Ferni',
    musicVibe: 'chill',
    interjectionFrequency: 'medium',
    preferredGenres: ['lofi', 'jazz'],
  })),
  getMusicAppreciationComment: vi.fn(() => 'This is a great track!'),
  getMusicElementAppreciation: vi.fn(() => 'That bass line though...'),
  getContextualMusicSuggestion: vi.fn(() => ({
    suggestion: 'How about some jazz?',
    genre: 'jazz',
  })),
  getReadTheRoomAction: vi.fn(() => ({
    action: 'continue' as const,
    phrase: 'Enjoying the vibes?',
  })),
  getCrossSessionMusicCallback: vi.fn(() => 'Last time we listened to jazz...'),
  getMusicDiscoveryOffer: vi.fn(() => 'Want to hear something new?'),
}));

vi.mock('../audio/ambient-music.js', () => ({
  getDJOutroPhrase: vi.fn(() => 'That was a great one'),
  getDJTrackChangePhrase: vi.fn(() => 'Switching it up'),
  getDJDropPhrase: vi.fn(() => 'Here it comes!'),
  getMidSongMomentPhrase: vi.fn(() => 'Wait for it...'),
  getMoodAwareMusicOffer: vi.fn(() => 'Some chill music?'),
  getSessionCallbackPhrase: vi.fn(() => 'Earlier we listened to...'),
  getMusicStoppedPhrase: vi.fn(() => 'The music stopped'),
}));

vi.mock('../audio/session-sounds.js', () => ({
  playSessionSound: vi.fn().mockResolvedValue({ played: true }),
  getVerbalSound: vi.fn(() => '*session start sound*'),
}));

vi.mock('../audio/music-player.js', () => ({
  getMusicPlayer: () => ({
    isPlaying: vi.fn(() => true),
    getCurrentTrack: vi.fn(() => ({ name: 'Test Track', artist: 'Test Artist' })),
    getVolume: vi.fn(() => 0.5),
  }),
}));

describe('DJOrchestrator', () => {
  let orchestrator: DJOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDJOrchestrator();
    orchestrator = new DJOrchestrator();
  });

  describe('Session Lifecycle', () => {
    describe('openTheShow', () => {
      it('should open the show with intro phrase', async () => {
        const result = await orchestrator.openTheShow({
          userId: 'user-1',
          personaId: 'ferni',
        });

        expect(result.phrase).toBeTruthy();
        expect(typeof result.delayBeforeSpeakingMs).toBe('number');
        expect(typeof result.playedSound).toBe('boolean');
      });

      it('should set persona on open', async () => {
        await orchestrator.openTheShow({
          userId: 'user-1',
          personaId: 'alex-chen',
        });

        const style = orchestrator.getCurrentDJStyle();
        expect(style).toBeDefined();
      });
    });

    describe('wrapTheShow', () => {
      it('should wrap the show with outro phrase', async () => {
        await orchestrator.openTheShow({
          userId: 'user-1',
          personaId: 'ferni',
        });

        const result = await orchestrator.wrapTheShow();

        expect(result.phrase).toBeTruthy();
        expect(typeof result.playedSound).toBe('boolean');
      });

      it('should accept additional context', async () => {
        await orchestrator.openTheShow({
          userId: 'user-1',
          personaId: 'ferni',
        });

        const result = await orchestrator.wrapTheShow({
          wasLongSession: true,
        });

        expect(result.phrase).toBeTruthy();
      });
    });
  });

  describe('Guest DJ Handoffs', () => {
    describe('getHandoffBanter', () => {
      it('should return handoff banter', () => {
        const banter = orchestrator.getHandoffBanter('alex-chen');

        expect(banter).toBeTruthy();
      });
    });

    describe('getGuestEntrance', () => {
      it('should return guest entrance', () => {
        const entrance = orchestrator.getGuestEntrance('ferni');

        expect(entrance).toBeTruthy();
      });
    });

    describe('orchestrateHandoff', () => {
      it('should orchestrate full handoff', () => {
        const result = orchestrator.orchestrateHandoff('ferni', 'alex-chen');

        expect(result.departingBanter).toBeTruthy();
        expect(result.arrivingEntrance).toBeTruthy();
      });

      it('should update current persona', () => {
        orchestrator.orchestrateHandoff('ferni', 'alex-chen');

        // Current persona should now be alex-chen
        expect(orchestrator.getCurrentDJStyle()).toBeDefined();
      });
    });
  });

  describe('Music Moments', () => {
    describe('getDJOutro', () => {
      it('should return outro phrase', () => {
        const outro = orchestrator.getDJOutro('Test Track', 'Test Artist');

        expect(outro).toBeTruthy();
        expect(typeof outro).toBe('string');
      });

      it('should work without track info', () => {
        const outro = orchestrator.getDJOutro();

        expect(outro).toBeTruthy();
      });
    });

    describe('getDJTransition', () => {
      it('should return transition phrase', () => {
        const transition = orchestrator.getDJTransition(
          { name: 'Current', artist: 'Artist' },
          'Next Track'
        );

        expect(transition).toBeTruthy();
      });

      it('should work without track info', () => {
        const transition = orchestrator.getDJTransition();

        expect(transition).toBeTruthy();
      });
    });

    describe('getDJDrop', () => {
      it('should return drop phrase', () => {
        const drop = orchestrator.getDJDrop('New Track', 'New Artist');

        expect(drop).toBeTruthy();
      });
    });

    describe('getMidSongMoment', () => {
      it('should return buildup phrase', () => {
        const phrase = orchestrator.getMidSongMoment('buildup');

        expect(phrase).toBeTruthy();
      });

      it('should return drop phrase', () => {
        const phrase = orchestrator.getMidSongMoment('drop');

        expect(phrase).toBeTruthy();
      });

      it('should return highlight phrase', () => {
        const phrase = orchestrator.getMidSongMoment('highlight', 'Track Name');

        expect(phrase).toBeTruthy();
      });
    });

    describe('getMusicAppreciation', () => {
      it('should return appreciation comment', () => {
        const comment = orchestrator.getMusicAppreciation({
          name: 'Great Song',
          artist: 'Great Artist',
        });

        expect(comment).toBeTruthy();
      });
    });

    describe('getElementAppreciation', () => {
      it('should return element appreciation', () => {
        const appreciation = orchestrator.getElementAppreciation();

        expect(appreciation).toBeTruthy();
      });
    });

    describe('getMusicStoppedResponse', () => {
      it('should return response for unexpected stop', () => {
        const response = orchestrator.getMusicStoppedResponse();

        expect(response).toBeTruthy();
      });

      it('should handle pause vs stop', () => {
        const response = orchestrator.getMusicStoppedResponse(true);

        expect(response).toBeTruthy();
      });
    });
  });

  describe('Proactive Music Offers', () => {
    describe('getSpontaneousMusicOffer', () => {
      it('should return spontaneous offer', () => {
        const offer = orchestrator.getSpontaneousMusicOffer({
          silenceDurationSec: 30,
        });

        expect(offer).toBeTruthy();
      });

      it('should consider mood', () => {
        const offer = orchestrator.getSpontaneousMusicOffer({
          recentMood: 'relaxed',
        });

        expect(offer).toBeTruthy();
      });

      it('should consider emotional moments', () => {
        const offer = orchestrator.getSpontaneousMusicOffer({
          isAfterEmotionalMoment: true,
        });

        expect(offer).toBeTruthy();
      });
    });

    describe('getMoodAwareMusicOffer', () => {
      it('should return mood-aware offer', () => {
        const offer = orchestrator.getMoodAwareMusicOffer('stressed');

        expect(offer).toBeTruthy();
      });
    });

    describe('getMusicDiscoveryOffer', () => {
      it('should return discovery offer', () => {
        const offer = orchestrator.getMusicDiscoveryOffer();

        expect(offer).toBeTruthy();
      });
    });

    describe('getContextualMusicSuggestion', () => {
      it('should return contextual suggestion', () => {
        const suggestion = orchestrator.getContextualMusicSuggestion({
          topics: ['work'],
          mood: 'focused',
        });

        expect(suggestion).not.toBeNull();
        expect(suggestion?.suggestion).toBeTruthy();
        expect(suggestion?.genre).toBeTruthy();
      });

      it('should handle heavy topics', () => {
        const suggestion = orchestrator.getContextualMusicSuggestion({
          isHeavyTopic: true,
        });

        expect(suggestion).not.toBeNull();
      });

      it('should handle celebrations', () => {
        const suggestion = orchestrator.getContextualMusicSuggestion({
          isCelebration: true,
        });

        expect(suggestion).not.toBeNull();
      });

      it('should handle focus needs', () => {
        const suggestion = orchestrator.getContextualMusicSuggestion({
          needsFocus: true,
        });

        expect(suggestion).not.toBeNull();
      });
    });

    describe('getQueueTeaser', () => {
      it('should return queue teaser', () => {
        const teaser = orchestrator.getQueueTeaser();

        expect(teaser).toBeTruthy();
      });
    });
  });

  describe('Cross-Session Callbacks', () => {
    describe('getMusicMemoryCallback', () => {
      it('should return memory callback without history', () => {
        const callback = orchestrator.getMusicMemoryCallback();

        expect(callback).toBeTruthy();
      });

      it('should return callback with history', () => {
        const callback = orchestrator.getMusicMemoryCallback({
          favoriteArtists: ['Artist1'],
          favoriteGenres: ['jazz'],
          lastPlayedArtist: 'Artist2',
          totalTracksPlayed: 50,
        });

        expect(callback).toBeTruthy();
      });
    });

    describe('getSessionCallback', () => {
      it('should return session callback', () => {
        const callback = orchestrator.getSessionCallback({
          genres: ['jazz', 'lofi'],
          artists: ['Artist1'],
        });

        expect(callback).toBeTruthy();
      });
    });
  });

  describe('Read The Room', () => {
    describe('getReadTheRoomAction', () => {
      it('should return action for silent user', () => {
        const result = orchestrator.getReadTheRoomAction({
          userIsSilentDuringMusic: true,
          musicHasBeenPlayingFor: 300,
        });

        expect(result).not.toBeNull();
        expect(result?.action).toBeDefined();
      });

      it('should return action for talking user', () => {
        const result = orchestrator.getReadTheRoomAction({
          userIsTalkingDuringMusic: true,
        });

        expect(result).not.toBeNull();
      });

      it('should consider engagement level', () => {
        const result = orchestrator.getReadTheRoomAction({
          userEngagementLevel: 'low',
        });

        expect(result).not.toBeNull();
      });
    });
  });

  describe('Thinking Music', () => {
    describe('startThinkingMusic', () => {
      it('should start thinking music', async () => {
        const result = await orchestrator.startThinkingMusic();

        expect(result).toBe(true);
      });
    });

    describe('stopThinkingMusic', () => {
      it('should stop thinking music', async () => {
        await expect(orchestrator.stopThinkingMusic()).resolves.not.toThrow();
      });
    });
  });

  describe('Session Tracking', () => {
    describe('trackTopic', () => {
      it('should track topic', () => {
        expect(() => orchestrator.trackTopic('work')).not.toThrow();
      });
    });

    describe('trackMusicPlayed', () => {
      it('should track music played', () => {
        expect(() => orchestrator.trackMusicPlayed('Artist1')).not.toThrow();
      });

      it('should update last music played time', () => {
        orchestrator.trackMusicPlayed('Artist1');

        expect(orchestrator.wasRecentMusicPlayed()).toBe(true);
      });
    });

    describe('setPersona', () => {
      it('should set persona', () => {
        orchestrator.setPersona('alex-chen');

        expect(orchestrator.getCurrentDJStyle()).toBeDefined();
      });
    });

    describe('getSessionSummary', () => {
      it('should return session summary', () => {
        const summary = orchestrator.getSessionSummary();

        expect(summary.topics).toBeDefined();
        expect(summary.musicArtists).toBeDefined();
        expect(summary.duration).toBeDefined();
      });
    });

    describe('wasRecentMusicPlayed', () => {
      it('should return false initially', () => {
        const fresh = new DJOrchestrator();
        expect(fresh.wasRecentMusicPlayed()).toBe(false);
      });

      it('should return true after tracking music', () => {
        orchestrator.trackMusicPlayed('Artist');

        expect(orchestrator.wasRecentMusicPlayed()).toBe(true);
      });

      it('should accept custom time window', () => {
        orchestrator.trackMusicPlayed('Artist');

        expect(orchestrator.wasRecentMusicPlayed(1000)).toBe(true);
      });
    });
  });

  describe('Music Player Access', () => {
    describe('isMusicPlaying', () => {
      it('should check if music is playing', () => {
        const isPlaying = orchestrator.isMusicPlaying();

        expect(typeof isPlaying).toBe('boolean');
      });
    });

    describe('getCurrentTrack', () => {
      it('should return current track', () => {
        const track = orchestrator.getCurrentTrack();

        // May be null if not playing
        expect(track === null || typeof track === 'object').toBe(true);
      });
    });

    describe('getMusicVolume', () => {
      it('should return volume', () => {
        const volume = orchestrator.getMusicVolume();

        expect(typeof volume).toBe('number');
        expect(volume).toBeGreaterThanOrEqual(0);
        expect(volume).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Verbal Sound Cues', () => {
    describe('getVerbalSoundCue', () => {
      it('should return session-start cue', () => {
        const cue = orchestrator.getVerbalSoundCue('session-start');

        expect(cue).toBeTruthy();
      });

      it('should return session-end cue', () => {
        const cue = orchestrator.getVerbalSoundCue('session-end');

        expect(cue).toBeTruthy();
      });

      it('should return handoff cue', () => {
        const cue = orchestrator.getVerbalSoundCue('handoff');

        expect(cue).toBeTruthy();
      });

      it('should return celebration cue', () => {
        const cue = orchestrator.getVerbalSoundCue('celebration');

        expect(cue).toBeTruthy();
      });

      it('should return acknowledgment cue', () => {
        const cue = orchestrator.getVerbalSoundCue('acknowledgment');

        expect(cue).toBeTruthy();
      });
    });
  });
});

describe('Singleton functions', () => {
  beforeEach(() => {
    resetDJOrchestrator();
  });

  it('getDJOrchestrator should return singleton', () => {
    const instance1 = getDJOrchestrator();
    const instance2 = getDJOrchestrator();

    expect(instance1).toBe(instance2);
  });

  it('resetDJOrchestrator should reset singleton', () => {
    const instance1 = getDJOrchestrator();
    resetDJOrchestrator();
    const instance2 = getDJOrchestrator();

    expect(instance1).not.toBe(instance2);
  });
});

describe('DJ Style', () => {
  let orchestrator: DJOrchestrator;

  beforeEach(() => {
    resetDJOrchestrator();
    orchestrator = new DJOrchestrator();
  });

  it('should get current DJ style', () => {
    const style = orchestrator.getCurrentDJStyle();

    expect(style).toBeDefined();
    expect(style.name).toBeDefined();
  });
});
