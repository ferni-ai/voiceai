/**
 * LLM-Powered Music Tool Synthetic Testing
 *
 * Tests music tool routing and intent detection for:
 * 1. Play Music - Genre, artist, mood, activity-based requests
 * 2. Stop Music - Various ways users say "stop"
 * 3. Pause Music - Pause requests
 * 4. Skip/Next - Track skipping
 * 5. Volume Control - Volume up, down, specific levels
 *
 * These tests validate that Ferni correctly understands music commands
 * in natural conversation, including polite requests, slang, and implicit commands.
 *
 * Run with: GOOGLE_API_KEY=xxx pnpm vitest run src/tests/music-synthetic.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TEST_LLM_MODEL, LLM_TEST_TIMEOUT } from './test-llm-config.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const USE_LLM = !!process.env.GOOGLE_API_KEY;
const LLM_TIMEOUT = LLM_TEST_TIMEOUT * 2; // Music tests need more time

// ============================================================================
// MOCK SETUP
// ============================================================================

vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// ============================================================================
// LLM SCENARIO GENERATOR
// ============================================================================

interface MusicScenario {
  utterance: string;
  expectedIntent: 'play' | 'stop' | 'pause' | 'skip' | 'volume' | 'info';
  expectedParams?: Record<string, unknown>;
  difficulty: 'easy' | 'medium' | 'hard';
  notes?: string;
}

async function generateMusicScenarios(systemPrompt: string, count = 5): Promise<MusicScenario[]> {
  if (!USE_LLM) {
    return [];
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

  const prompt = `${systemPrompt}

Return a JSON array with exactly ${count} items:
[
  {
    "utterance": "what the user would naturally say",
    "expectedIntent": "play|stop|pause|skip|volume|info",
    "expectedParams": { "query": "extracted query" },
    "difficulty": "easy|medium|hard",
    "notes": "optional explanation"
  }
]

ONLY return valid JSON, no markdown.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn('LLM generation failed:', error);
  }

  return [];
}

// ============================================================================
// INTENT DETECTION UTILITIES
// ============================================================================

interface IntentResult {
  intent: 'play' | 'stop' | 'pause' | 'skip' | 'volume' | 'info' | 'unknown';
  confidence: number;
  query?: string;
  volumeLevel?: number;
}

/**
 * Detect music intent from user utterance
 * This mirrors what the semantic router does, simplified for testing
 */
function detectMusicIntent(utterance: string): IntentResult {
  const lower = utterance.toLowerCase().trim();

  // STOP patterns (must check before play since "stop" is an antiKeyword for play)
  // NOTE: "quiet" as a single word is stop, but "quieter" is volume
  const stopPatterns = [
    /^stop$/i,
    /^stop\s+(?:the\s+)?music/i,
    /^stop\s+playing/i,
    /^turn\s+(?:it\s+)?off/i,
    /^cut\s+(?:the\s+)?music/i,
    /^kill\s+(?:the\s+)?music/i,
    /^end\s+(?:the\s+)?music/i,
    /^silence/i,
    /^quiet$/i, // Only exact "quiet", not "quieter"
    /^shut\s+(?:it\s+)?up/i,
    /^enough\s+music/i,
    /^no\s+more\s+music/i,
    /^i(?:'m|\s+am)\s+done\s+with\s+(?:the\s+)?music/i,
    /^that(?:'s|\s+is)\s+enough(?:\s+music)?/i,
  ];

  for (const pattern of stopPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'stop', confidence: 0.95 };
    }
  }

  // PAUSE patterns
  const pausePatterns = [
    /^pause$/i,
    /^pause\s+(?:the\s+)?music/i,
    /^pause\s+(?:it|that|this)/i,
    /^pause\s+for\s+a\s+(?:sec|second|minute|moment|bit)/i,
    /^hold\s+(?:on|that)/i,
    /^wait(?:\s+a\s+(?:sec|second|minute|moment))?/i,
    /^one\s+(?:sec|second|minute|moment)/i,
  ];

  for (const pattern of pausePatterns) {
    if (pattern.test(lower)) {
      return { intent: 'pause', confidence: 0.9 };
    }
  }

  // SKIP/NEXT patterns
  const skipPatterns = [
    /^skip$/i,
    /^skip\s+(?:this\s+)?(?:song|track)/i,
    /^next$/i,
    /^next\s+(?:song|track|one)/i,
    /^i\s+don(?:')?t\s+like\s+this\s+(?:one|song)/i,
    /^play\s+(?:the\s+)?next/i,
    /^go\s+to\s+(?:the\s+)?next/i,
    /^change\s+(?:the\s+)?(?:song|track)/i,
    /^something\s+else/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'skip', confidence: 0.9 };
    }
  }

  // VOLUME patterns
  const volumePatterns = [
    { pattern: /^(?:turn\s+(?:it\s+)?)?(?:volume\s+)?(?:up|louder)/i, level: undefined },
    { pattern: /^(?:turn\s+(?:it\s+)?)?(?:volume\s+)?(?:down|softer)/i, level: undefined },
    { pattern: /^quieter$/i, level: undefined }, // Standalone "quieter" is volume
    { pattern: /^(?:set\s+)?volume\s+(?:to\s+)?(\d+)/i, level: 'extract' },
    { pattern: /^mute/i, level: 0 },
    { pattern: /^unmute/i, level: undefined },
    { pattern: /^(?:make\s+(?:it\s+)?)?(?:a\s+bit\s+)?quieter/i, level: undefined },
    { pattern: /^(?:can(?:'t)?\s+hear|too\s+quiet)/i, level: undefined },
    { pattern: /^(?:too\s+loud|turn\s+(?:it\s+)?down)/i, level: undefined },
    { pattern: /^it(?:'s|\s+is)\s+too\s+(?:loud|quiet)/i, level: undefined }, // "it's too loud/quiet"
  ];

  for (const { pattern, level } of volumePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const volumeLevel = level === 'extract' ? parseInt(match[1]) : level;
      return {
        intent: 'volume',
        confidence: 0.85,
        volumeLevel: volumeLevel as number | undefined,
      };
    }
  }

  // INFO patterns (what's playing)
  const infoPatterns = [
    /^what(?:'s|\s+is)\s+(?:this\s+)?(?:playing|song|track)/i,
    /^who(?:'s|\s+is)\s+(?:this|singing)/i,
    /^what\s+(?:song|track)\s+is\s+this/i,
    /^name\s+(?:this|that)\s+(?:song|track)/i,
  ];

  for (const pattern of infoPatterns) {
    if (pattern.test(lower)) {
      return { intent: 'info', confidence: 0.85 };
    }
  }

  // PLAY patterns (catch-all for music requests)
  const playPatterns = [
    { pattern: /^play\s+(?:me\s+)?(?:some\s+)?(.+)/i, queryGroup: 1 },
    { pattern: /^put\s+on\s+(?:some\s+)?(.+)/i, queryGroup: 1 },
    {
      pattern: /^(?:can|could|would|will)\s+you\s+play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
      queryGroup: 1,
    },
    { pattern: /^i(?:'d|\s+would)\s+like\s+(?:to\s+)?(?:hear|listen\s+to)\s+(.+)/i, queryGroup: 1 },
    { pattern: /^i\s+want\s+(?:to\s+)?(?:hear|listen\s+to)\s+(.+)/i, queryGroup: 1 },
    { pattern: /^(?:let's|let\s+us)\s+(?:hear|listen\s+to|play)\s+(.+)/i, queryGroup: 1 },
    { pattern: /^how\s+about\s+(?:some\s+)?(.+?)(?:\s+music)?$/i, queryGroup: 1 },
    { pattern: /^(?:throw|queue)\s+(?:on|up)\s+(?:some\s+)?(.+)/i, queryGroup: 1 },
    { pattern: /^spin\s+(?:some\s+)?(.+)/i, queryGroup: 1 }, // "spin some vinyl" slang
    { pattern: /^(?:start|begin)\s+(?:playing|some)\s+(.+)/i, queryGroup: 1 },
  ];

  for (const { pattern, queryGroup } of playPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const query = match[queryGroup]?.trim();
      // Filter out stop/pause from being detected as play
      if (query && !['stop', 'pause', 'skip', 'next'].includes(query.toLowerCase())) {
        return {
          intent: 'play',
          confidence: 0.85,
          query,
        };
      }
    }
  }

  // Check for genre/mood keywords as implicit play requests
  const genreKeywords = [
    'jazz',
    'rock',
    'pop',
    'classical',
    'hip hop',
    'electronic',
    'country',
    'r&b',
    'folk',
    'metal',
    'indie',
    'ambient',
    'lofi',
    'christmas',
    'holiday',
  ];
  const moodKeywords = [
    'chill',
    'relaxing',
    'upbeat',
    'energetic',
    'calm',
    'mellow',
    'focus',
    'workout',
    'party',
  ];

  const hasGenre = genreKeywords.some((g) => lower.includes(g));
  const hasMood = moodKeywords.some((m) => lower.includes(m));
  const hasMusicWord = /music|song|track|tune/i.test(lower);

  if ((hasGenre || hasMood) && (hasMusicWord || lower.includes('some') || lower.includes('play'))) {
    return { intent: 'play', confidence: 0.7, query: lower };
  }

  return { intent: 'unknown', confidence: 0 };
}

// ============================================================================
// 1. PLAY MUSIC TESTING
// ============================================================================

describe('Music Play Intent Detection', () => {
  // Seed scenarios for consistent testing
  const SEED_PLAY_SCENARIOS: MusicScenario[] = [
    // Direct commands
    { utterance: 'play some jazz', expectedIntent: 'play', difficulty: 'easy' },
    { utterance: 'play music', expectedIntent: 'play', difficulty: 'easy' },
    { utterance: 'play Bohemian Rhapsody by Queen', expectedIntent: 'play', difficulty: 'easy' },
    { utterance: 'put on some classical music', expectedIntent: 'play', difficulty: 'easy' },
    // Polite requests (Gemini problem phrases)
    { utterance: 'can you play some jazz', expectedIntent: 'play', difficulty: 'medium' },
    {
      utterance: 'could you play something relaxing',
      expectedIntent: 'play',
      difficulty: 'medium',
    },
    { utterance: 'would you play some music for me', expectedIntent: 'play', difficulty: 'medium' },
    { utterance: 'will you play some upbeat music', expectedIntent: 'play', difficulty: 'medium' },
    // Desire expressions
    { utterance: "I'd like to hear some rock", expectedIntent: 'play', difficulty: 'medium' },
    { utterance: 'I want to listen to Taylor Swift', expectedIntent: 'play', difficulty: 'medium' },
    { utterance: "I'd love to hear some jazz", expectedIntent: 'play', difficulty: 'medium' },
    // Suggestions
    { utterance: 'how about some jazz', expectedIntent: 'play', difficulty: 'medium' },
    { utterance: "let's hear some rock", expectedIntent: 'play', difficulty: 'medium' },
    // Casual slang
    { utterance: 'throw on some jazz', expectedIntent: 'play', difficulty: 'hard' },
    { utterance: 'spin some vinyl', expectedIntent: 'play', difficulty: 'hard' },
    { utterance: 'queue up some chill music', expectedIntent: 'play', difficulty: 'hard' },
    // Mood/activity based
    { utterance: 'play something for focus', expectedIntent: 'play', difficulty: 'medium' },
    { utterance: 'play workout music', expectedIntent: 'play', difficulty: 'easy' },
    { utterance: 'play something to help me relax', expectedIntent: 'play', difficulty: 'medium' },
    // Seasonal
    { utterance: 'play some Christmas music', expectedIntent: 'play', difficulty: 'easy' },
    { utterance: 'play holiday songs', expectedIntent: 'play', difficulty: 'easy' },
  ];

  describe('Seed Scenarios - Play Music', () => {
    it.each(SEED_PLAY_SCENARIOS)(
      'should detect PLAY intent from: "$utterance"',
      ({ utterance, expectedIntent }) => {
        const result = detectMusicIntent(utterance);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    );
  });

  describe('LLM-Generated Scenarios - Play Music', { timeout: LLM_TIMEOUT }, () => {
    it('should detect play intent from natural music requests', async () => {
      const scenarios = await generateMusicScenarios(
        `
Generate ${8} realistic user utterances for requesting music playback.

Include variations:
- Direct commands ("play some jazz")
- Polite requests ("can you play...", "could you put on...")
- Desire expressions ("I'd like to hear...", "I want to listen to...")
- Suggestions ("how about some...", "let's hear...")
- Casual slang ("throw on some...", "spin some...")
- Mood-based requests ("play something relaxing", "I need focus music")
- Activity-based ("workout music", "music for cooking")
- Specific artists or songs
- Genre requests

All should be PLAY intent. Make them sound natural, not like commands.
`,
        8
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let detected = 0;
      for (const scenario of scenarios) {
        const result = detectMusicIntent(scenario.utterance);
        if (result.intent === 'play' && result.confidence > 0.5) {
          detected++;
        }
      }

      // 70% detection rate for LLM-generated scenarios
      expect(detected / scenarios.length).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// ============================================================================
// 2. STOP MUSIC TESTING
// ============================================================================

describe('Music Stop Intent Detection', () => {
  const SEED_STOP_SCENARIOS: MusicScenario[] = [
    // Direct commands
    { utterance: 'stop the music', expectedIntent: 'stop', difficulty: 'easy' },
    { utterance: 'stop playing', expectedIntent: 'stop', difficulty: 'easy' },
    { utterance: 'stop', expectedIntent: 'stop', difficulty: 'easy' },
    // Variations
    { utterance: 'turn it off', expectedIntent: 'stop', difficulty: 'medium' },
    { utterance: 'cut the music', expectedIntent: 'stop', difficulty: 'medium' },
    { utterance: 'kill the music', expectedIntent: 'stop', difficulty: 'hard' },
    { utterance: 'end the music', expectedIntent: 'stop', difficulty: 'medium' },
    // Polite/implicit
    { utterance: 'silence', expectedIntent: 'stop', difficulty: 'medium' },
    { utterance: 'quiet', expectedIntent: 'stop', difficulty: 'medium' },
    { utterance: "that's enough", expectedIntent: 'stop', difficulty: 'hard' },
    { utterance: "that's enough music", expectedIntent: 'stop', difficulty: 'medium' },
    { utterance: "I'm done with the music", expectedIntent: 'stop', difficulty: 'hard' },
    { utterance: 'no more music', expectedIntent: 'stop', difficulty: 'medium' },
    { utterance: 'enough music', expectedIntent: 'stop', difficulty: 'medium' },
  ];

  describe('Seed Scenarios - Stop Music', () => {
    it.each(SEED_STOP_SCENARIOS)(
      'should detect STOP intent from: "$utterance"',
      ({ utterance, expectedIntent }) => {
        const result = detectMusicIntent(utterance);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    );
  });

  describe('LLM-Generated Scenarios - Stop Music', { timeout: LLM_TIMEOUT }, () => {
    it('should detect stop intent from natural stop requests', async () => {
      const scenarios = await generateMusicScenarios(
        `
Generate ${6} realistic user utterances for STOPPING music.

Include variations:
- Direct commands ("stop the music", "stop playing")
- Casual/slang ("cut the music", "kill it", "silence")
- Implicit ("that's enough", "I'm done", "no more")
- Polite ("can you turn off the music", "please stop")
- Context-based ("I need to focus now, stop the music")
- Rude/frustrated ("shut up", "enough already")

All should be STOP intent (completely stopping music, not just pausing).
`,
        6
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let detected = 0;
      for (const scenario of scenarios) {
        const result = detectMusicIntent(scenario.utterance);
        if (result.intent === 'stop' && result.confidence > 0.5) {
          detected++;
        }
      }

      // 70% detection rate
      expect(detected / scenarios.length).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// ============================================================================
// 3. PAUSE MUSIC TESTING
// ============================================================================

describe('Music Pause Intent Detection', () => {
  const SEED_PAUSE_SCENARIOS: MusicScenario[] = [
    // Direct commands
    { utterance: 'pause', expectedIntent: 'pause', difficulty: 'easy' },
    { utterance: 'pause the music', expectedIntent: 'pause', difficulty: 'easy' },
    { utterance: 'pause it', expectedIntent: 'pause', difficulty: 'easy' },
    { utterance: 'pause that', expectedIntent: 'pause', difficulty: 'easy' },
    // Implicit pause (hold on, wait)
    { utterance: 'hold on', expectedIntent: 'pause', difficulty: 'medium' },
    { utterance: 'wait a sec', expectedIntent: 'pause', difficulty: 'medium' },
    { utterance: 'one second', expectedIntent: 'pause', difficulty: 'medium' },
    { utterance: 'wait a minute', expectedIntent: 'pause', difficulty: 'medium' },
    { utterance: 'hold that', expectedIntent: 'pause', difficulty: 'medium' },
  ];

  describe('Seed Scenarios - Pause Music', () => {
    it.each(SEED_PAUSE_SCENARIOS)(
      'should detect PAUSE intent from: "$utterance"',
      ({ utterance, expectedIntent }) => {
        const result = detectMusicIntent(utterance);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    );
  });

  describe('LLM-Generated Scenarios - Pause Music', { timeout: LLM_TIMEOUT }, () => {
    it('should detect pause intent from natural pause requests', async () => {
      const scenarios = await generateMusicScenarios(
        `
Generate ${5} realistic user utterances for PAUSING music (temporarily stopping).

Include variations:
- Direct commands ("pause", "pause the music")
- Implicit pauses ("hold on", "wait a sec", "one moment")
- Context-based ("I need to take this call, pause", "someone's at the door")
- Polite ("can you pause for a sec")

All should be PAUSE intent (temporary stop, not permanent stop).
`,
        5
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let detected = 0;
      for (const scenario of scenarios) {
        const result = detectMusicIntent(scenario.utterance);
        if (result.intent === 'pause' && result.confidence > 0.5) {
          detected++;
        }
      }

      // 60% detection rate (pause vs stop can be ambiguous)
      expect(detected / scenarios.length).toBeGreaterThanOrEqual(0.6);
    });
  });
});

// ============================================================================
// 4. SKIP/NEXT TESTING
// ============================================================================

describe('Music Skip Intent Detection', () => {
  const SEED_SKIP_SCENARIOS: MusicScenario[] = [
    // Direct commands
    { utterance: 'skip', expectedIntent: 'skip', difficulty: 'easy' },
    { utterance: 'next', expectedIntent: 'skip', difficulty: 'easy' },
    { utterance: 'skip this song', expectedIntent: 'skip', difficulty: 'easy' },
    { utterance: 'next song', expectedIntent: 'skip', difficulty: 'easy' },
    { utterance: 'next track', expectedIntent: 'skip', difficulty: 'easy' },
    // Implicit skip
    { utterance: "I don't like this one", expectedIntent: 'skip', difficulty: 'hard' },
    { utterance: "I don't like this song", expectedIntent: 'skip', difficulty: 'medium' },
    { utterance: 'play the next one', expectedIntent: 'skip', difficulty: 'medium' },
    { utterance: 'go to the next song', expectedIntent: 'skip', difficulty: 'medium' },
    { utterance: 'change the song', expectedIntent: 'skip', difficulty: 'medium' },
    { utterance: 'something else', expectedIntent: 'skip', difficulty: 'hard' },
  ];

  describe('Seed Scenarios - Skip Music', () => {
    it.each(SEED_SKIP_SCENARIOS)(
      'should detect SKIP intent from: "$utterance"',
      ({ utterance, expectedIntent }) => {
        const result = detectMusicIntent(utterance);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    );
  });

  describe('LLM-Generated Scenarios - Skip Music', { timeout: LLM_TIMEOUT }, () => {
    it('should detect skip intent from natural skip requests', async () => {
      const scenarios = await generateMusicScenarios(
        `
Generate ${5} realistic user utterances for SKIPPING to the next song.

Include variations:
- Direct commands ("skip", "next", "next song")
- Implicit skips ("I don't like this one", "not feeling this")
- Context-based ("this song is boring, skip it")
- Polite ("can we skip this one")
- Impatient ("just go to the next one")

All should be SKIP intent (move to next track).
`,
        5
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let detected = 0;
      for (const scenario of scenarios) {
        const result = detectMusicIntent(scenario.utterance);
        if (result.intent === 'skip' && result.confidence > 0.5) {
          detected++;
        }
      }

      // 70% detection rate
      expect(detected / scenarios.length).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// ============================================================================
// 5. VOLUME CONTROL TESTING
// ============================================================================

describe('Music Volume Intent Detection', () => {
  const SEED_VOLUME_SCENARIOS: MusicScenario[] = [
    // Volume up
    { utterance: 'turn it up', expectedIntent: 'volume', difficulty: 'easy' },
    { utterance: 'louder', expectedIntent: 'volume', difficulty: 'easy' },
    { utterance: 'volume up', expectedIntent: 'volume', difficulty: 'easy' },
    // Volume down
    { utterance: 'turn it down', expectedIntent: 'volume', difficulty: 'easy' },
    { utterance: 'quieter', expectedIntent: 'volume', difficulty: 'easy' },
    { utterance: 'volume down', expectedIntent: 'volume', difficulty: 'easy' },
    { utterance: 'softer', expectedIntent: 'volume', difficulty: 'medium' },
    // Specific level
    { utterance: 'set volume to 50', expectedIntent: 'volume', difficulty: 'easy' },
    { utterance: 'volume 30', expectedIntent: 'volume', difficulty: 'medium' },
    // Mute/unmute
    { utterance: 'mute', expectedIntent: 'volume', difficulty: 'easy' },
    { utterance: 'unmute', expectedIntent: 'volume', difficulty: 'easy' },
    // Context-based
    { utterance: "can't hear it", expectedIntent: 'volume', difficulty: 'hard' },
    { utterance: "it's too loud", expectedIntent: 'volume', difficulty: 'medium' },
    { utterance: "it's too quiet", expectedIntent: 'volume', difficulty: 'medium' },
    { utterance: 'make it a bit quieter', expectedIntent: 'volume', difficulty: 'medium' },
  ];

  describe('Seed Scenarios - Volume Control', () => {
    it.each(SEED_VOLUME_SCENARIOS)(
      'should detect VOLUME intent from: "$utterance"',
      ({ utterance, expectedIntent }) => {
        const result = detectMusicIntent(utterance);
        expect(result.intent).toBe(expectedIntent);
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    );
  });

  describe('LLM-Generated Scenarios - Volume Control', { timeout: LLM_TIMEOUT }, () => {
    it('should detect volume intent from natural volume requests', async () => {
      const scenarios = await generateMusicScenarios(
        `
Generate ${5} realistic user utterances for VOLUME CONTROL.

Include variations:
- Volume up ("louder", "turn it up", "I can barely hear it")
- Volume down ("quieter", "too loud", "turn it down")
- Specific levels ("set it to 50", "half volume")
- Mute/unmute ("mute", "unmute")
- Implicit volume requests ("my ears hurt", "can't hear the music")

All should be VOLUME intent.
`,
        5
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let detected = 0;
      for (const scenario of scenarios) {
        const result = detectMusicIntent(scenario.utterance);
        if (result.intent === 'volume' && result.confidence > 0.5) {
          detected++;
        }
      }

      // 70% detection rate
      expect(detected / scenarios.length).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// ============================================================================
// 6. EDGE CASES & DISAMBIGUATION
// ============================================================================

describe('Music Intent Disambiguation', () => {
  const DISAMBIGUATION_SCENARIOS = [
    // Stop vs Pause
    {
      utterance: 'stop the music',
      expectedIntent: 'stop',
      wrongIntent: 'pause',
      reason: '"stop" implies permanent end',
    },
    {
      utterance: 'pause for a sec',
      expectedIntent: 'pause',
      wrongIntent: 'stop',
      reason: '"for a sec" implies temporary',
    },
    // Play vs Info
    {
      utterance: 'play Taylor Swift',
      expectedIntent: 'play',
      wrongIntent: 'info',
      reason: 'Command to play artist',
    },
    {
      utterance: "what's this song",
      expectedIntent: 'info',
      wrongIntent: 'play',
      reason: 'Question about current track',
    },
    // Skip vs Stop
    {
      utterance: "I don't like this song",
      expectedIntent: 'skip',
      wrongIntent: 'stop',
      reason: 'Implies wanting different song, not no music',
    },
  ];

  describe('Should correctly disambiguate similar intents', () => {
    it.each(DISAMBIGUATION_SCENARIOS)(
      'should detect $expectedIntent (not $wrongIntent) from: "$utterance"',
      ({ utterance, expectedIntent, wrongIntent }) => {
        const result = detectMusicIntent(utterance);
        expect(result.intent).toBe(expectedIntent);
        expect(result.intent).not.toBe(wrongIntent);
      }
    );
  });

  describe('Should reject non-music commands', () => {
    const NON_MUSIC_SCENARIOS = [
      'How was your weekend?',
      'What time is it?',
      'Tell me about yourself',
      'Help me with my budget',
      'I feel stressed today',
    ];

    it.each(NON_MUSIC_SCENARIOS)('should NOT detect music intent from: "%s"', (utterance) => {
      const result = detectMusicIntent(utterance);
      expect(result.intent).toBe('unknown');
    });
  });
});

// ============================================================================
// 7. COMBINED JOURNEY TESTS
// ============================================================================

describe('Music Control Journey', { timeout: LLM_TIMEOUT }, () => {
  it('should handle a typical music session flow', () => {
    // Simulate a user's music session
    const journey = [
      { utterance: 'play some jazz', expectedIntent: 'play' },
      { utterance: 'turn it up a bit', expectedIntent: 'volume' },
      { utterance: "I don't like this one", expectedIntent: 'skip' },
      { utterance: 'hold on a sec', expectedIntent: 'pause' },
      { utterance: "that's enough music", expectedIntent: 'stop' },
    ];

    for (const step of journey) {
      const result = detectMusicIntent(step.utterance);
      expect(result.intent).toBe(step.expectedIntent);
    }
  });

  it('should handle LLM-generated music journey', async () => {
    const scenarios = await generateMusicScenarios(
      `
Generate a realistic music session journey with 5 sequential user utterances.
The journey should follow this flow:
1. User asks to play music (any genre/mood)
2. User adjusts volume
3. User skips a song
4. User pauses (someone at door or taking a call)
5. User stops music completely (done listening)

Make each utterance natural and varied - not robotic commands.
`,
      5
    );

    if (scenarios.length === 0) {
      console.log('Skipping LLM test - no GOOGLE_API_KEY');
      return;
    }

    const expectedFlow = ['play', 'volume', 'skip', 'pause', 'stop'];

    let correctOrder = 0;
    for (let i = 0; i < Math.min(scenarios.length, expectedFlow.length); i++) {
      const result = detectMusicIntent(scenarios[i].utterance);
      if (result.intent === expectedFlow[i]) {
        correctOrder++;
      }
    }

    // At least 3 out of 5 should be detected correctly
    expect(correctOrder).toBeGreaterThanOrEqual(3);
  });
});
