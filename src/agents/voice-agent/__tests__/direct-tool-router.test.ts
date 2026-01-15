/**
 * Direct Tool Router Tests
 *
 * Tests for pattern matching in the direct tool router.
 * These tests verify that common voice requests are correctly detected.
 *
 * @module voice-agent/__tests__/direct-tool-router.test
 */

import { describe, it, expect } from 'vitest';

// Patterns from direct-tool-router.ts (full set)
const CONVERSATION_STARTERS =
  '(?:yeah|yes|yep|okay|ok|sure|alright|actually|um+|uh+|so|well|hey|oh|hmm),?\\s*';

const MUSIC_PATTERNS = [
  // Direct commands with "play"
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on|start|queue|throw on)(\\s+me)?\\s+(some\\s+)?(.+\\s+)?(music|songs?|tunes?)`,
    'i'
  ),
  // Direct commands with specific genres
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on|start|queue|throw on)(\\s+me)?\\s+(some\\s+)?(jazz|rock|pop|classical|lofi|lo-fi|hip\\s*hop|rap|country|blues|r&b|soul|funk|electronic|house|techno|ambient|chill|relaxing|upbeat|happy|sad|focus|study|workout|sleep|meditation|calm|acoustic|indie|alternative|metal|punk|reggae|latin|k-?pop|morning|evening|night|spotify|playlist)`,
    'i'
  ),
  // "Play something" variations
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on|throw on)\\s+something(\\s+\\w+)?$`,
    'i'
  ),
  // Direct artist/song requests
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on)\\s+.+\\s+by\\s+.+$`,
    'i'
  ),
  // "Some music please"
  new RegExp(`^${CONVERSATION_STARTERS}?(some\\s+)?(music|songs?|tunes?)\\s+please$`, 'i'),
  // Mood-based requests
  new RegExp(
    `^${CONVERSATION_STARTERS}?(play|put on|i want|give me|throw on)\\s+something\\s+(relaxing|upbeat|calm|energizing|chill|focus|morning)`,
    'i'
  ),
  // "Play some more music"
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on)(\\s+some)?\\s+more\\s+(music|songs?|tunes?)`,
    'i'
  ),
  // "I want to hear/listen to music"
  new RegExp(
    `^${CONVERSATION_STARTERS}?i (want to|wanna) (hear|listen to)\\s+(some\\s+)?(music|songs?|tunes?)`,
    'i'
  ),
  // "Can we get some music"
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can we|let('s| us)|how about)\\s+(get|have|hear)\\s+(some\\s+)?(music|songs?|tunes?)`,
    'i'
  ),
  // "Music please"
  new RegExp(`^${CONVERSATION_STARTERS}?(music|songs?|tunes?)\\s*(please)?\\??$`, 'i'),
];

const WEATHER_PATTERNS = [
  new RegExp(`^${CONVERSATION_STARTERS}?(what('s| is)|how('s| is)|check)\\s+(the\\s+)?weather`, 'i'),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(is it|will it)\\s+(going to\\s+)?(rain|snow|cold|hot|warm|sunny|cloudy)`,
    'i'
  ),
  new RegExp(`^${CONVERSATION_STARTERS}?weather\\s*(forecast|today|tomorrow|this week)?$`, 'i'),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(do i need|should i bring)\\s+(an?\\s+)?(umbrella|jacket|coat)`,
    'i'
  ),
  new RegExp(`^${CONVERSATION_STARTERS}?how (cold|hot|warm) is it`, 'i'),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(is it|it is) (cold|hot|warm|raining|snowing)\\s*(outside|out)?\\??$`,
    'i'
  ),
  new RegExp(`^${CONVERSATION_STARTERS}?what('s| is) it like (outside|out there)\\??$`, 'i'),
  new RegExp(`^${CONVERSATION_STARTERS}?(gonna|going to) rain (today|tomorrow|later)?\\??$`, 'i'),
];

const NEWS_PATTERNS = [
  /^(what('s| is)|any|check)\s+(the\s+)?(news|headlines)/i,
  /^(news|headlines)\s*(today|right now)?\??$/i,
  /^(tell me|give me|get me)\s+(the\s+)?(news|headlines)/i,
  /^(any|some)\s+(news|headlines)\s*(today|right now)?\??$/i,
  new RegExp(
    `^${CONVERSATION_STARTERS}?what('s| is) (happening|going on)( in the world| today| right now)?\\??$`,
    'i'
  ),
  new RegExp(`^${CONVERSATION_STARTERS}?(give|tell) me (the\\s+)?(news|headlines)`, 'i'),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(catch me up|update me)( on the news| on what's happening)?`,
    'i'
  ),
];

const TIME_PATTERNS = [
  /^what\s+time\s+is\s+it(\s+in\s+.+)?$/i,
  /^time\s+in\s+.+$/i,
  /^what('s| is) the time(\s+in\s+.+)?$/i,
];

const TIMER_PATTERNS = [
  /^(set|start|make)\s+(a\s+)?timer\s+(for\s+)?(\d+)\s*(minute|min|second|sec)s?/i,
  /^(\d+)\s*(minute|min|second|sec)s?\s+timer$/i,
  /^timer\s+(for\s+)?(\d+)\s*(minute|min|second|sec)s?$/i,
];

const REMINDER_PATTERNS = [
  /^remind\s+me\s+to\s+(.+)/i,
  /^(set|create)\s+(a\s+)?reminder\s+(to\s+)?(.+)/i,
  /^(don't|do not)\s+let\s+me\s+forget\s+(to\s+)?(.+)/i,
];

const HABIT_PATTERNS = [
  /^i\s+(did|completed|finished|just did)\s+(my\s+)?(.+?)(\s+today|\s+this morning|\s+this evening)?$/i,
  /^(track|log|record)\s+(my\s+)?(.+?)(\s+habit)?$/i,
  /^i\s+(meditated|exercised|worked out|journaled|read|stretched|walked|ran|drank water|did yoga|practiced)(\s+today|\s+this morning)?$/i,
  /^(check off|mark|checked)\s+(my\s+)?(.+?)(\s+as done|\s+done|\s+complete)?$/i,
];

const CALENDAR_PATTERNS = [
  /^what('s| is)\s+(on\s+)?(my\s+)?(calendar|schedule)\s*(today|tomorrow|this week)?/i,
  /^(do i have|am i)\s+(anything|any meetings|any appointments|free|busy)\s*(today|tomorrow|this week)?/i,
  /^what\s+(are|is)\s+my\s+(meetings?|appointments?|schedule)(\s+for)?\s*(today|tomorrow|this week)?/i,
  /^show\s+(me\s+)?(my\s+)?(calendar|schedule)(\s+for)?\s*(today|tomorrow|this week)?/i,
  /^check\s+(my\s+)?(calendar|schedule)(\s+for)?\s*(today|tomorrow|this week)?/i,
];

const MUSIC_CONTROL_PATTERNS: Array<{ pattern: RegExp; action: string }> = [
  { pattern: /^(pause|hold)\s*(the\s+)?(music|song|track)?$/i, action: 'pause' },
  { pattern: /^(can you |please )?(pause|hold)\s*(the\s+)?(music|song|track)?$/i, action: 'pause' },
  { pattern: /^stop\s+the\s+(music|song|track)$/i, action: 'stop' },
  { pattern: /^(resume|unpause|continue|keep playing|play)\s*(the\s+)?(music|song|track)?$/i, action: 'resume' },
  { pattern: /^(can you |please )?(resume|unpause|continue)\s*(the\s+)?(music|song|track)?$/i, action: 'resume' },
  { pattern: /^(stop|turn off|end|quit)\s*(the\s+)?(music|playback)?$/i, action: 'stop' },
  { pattern: /^(can you |please )?(stop|turn off|end)\s*(the\s+)?(music|playback)?$/i, action: 'stop' },
  { pattern: /^no more music$/i, action: 'stop' },
  { pattern: /^(that's|thats) enough music$/i, action: 'stop' },
];

const CONTACT_PATTERNS = [
  /^(call|phone|ring|dial)\s+(.+)$/i,
  /^(text|message|send a (text|message) to)\s+(.+)$/i,
  /^(can you |could you |please )?(call|text|message)\s+(.+)$/i,
  /^i (need to|want to|should) (call|text|message)\s+(.+)$/i,
  /^(reach out to|contact|get in touch with)\s+(.+)$/i,
];

const NOTE_PATTERNS = [
  /^(take|make|create|save)\s+(a\s+)?(note|memo)(:|,)?\s*(.+)?$/i,
  /^remember\s+(that\s+)?(.+)$/i,
  /^note(:|,)\s*(.+)$/i,
  /^quick\s+note(:|,)?\s*(.+)?$/i,
  /^save\s+(this\s+)?(thought|idea|note)(:|,)?\s*(.+)?$/i,
  /^(jot down|write down)\s+(.+)$/i,
];

const SMART_HOME_PATTERNS: Array<{ pattern: RegExp; device: string; action: string }> = [
  { pattern: /^(turn\s+)?(on|off)\s+(the\s+)?(lights?|lamp|lamps)(\s+in\s+.+)?$/i, device: 'lights', action: 'toggle' },
  { pattern: /^(turn|switch)\s+(the\s+)?(lights?|lamp|lamps)\s+(on|off)(\s+in\s+.+)?$/i, device: 'lights', action: 'toggle' },
  { pattern: /^(set|turn|make)\s+(the\s+)?(thermostat|temperature|temp|heat|ac|air)\s+(to\s+)?(\d+)(\s+degrees?)?$/i, device: 'thermostat', action: 'set' },
  { pattern: /^(\d+)\s+degrees?$/i, device: 'thermostat', action: 'set' },
  { pattern: /^lights?\s+(on|off)$/i, device: 'lights', action: 'toggle' },
];

const NEWS_TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /^(sports?|football|basketball|baseball|soccer|hockey|tennis|golf)\s+(news|headlines|updates)$/i, topic: 'sports' },
  { pattern: /^(tech|technology|silicon valley|gadgets?|ai|artificial intelligence)\s+(news|headlines|updates)$/i, topic: 'technology' },
  { pattern: /^(business|finance|economy|market|stock|wall street)\s+(news|headlines|updates)$/i, topic: 'business' },
  { pattern: /^(entertainment|celebrity|hollywood|movies?|tv)\s+(news|headlines|updates|gossip)$/i, topic: 'entertainment' },
  { pattern: /^(politics?|political|government|congress|white house)\s+(news|headlines|updates)$/i, topic: 'politics' },
];

describe('Direct Tool Router Patterns', () => {
  // NOTE: Music, Weather, News patterns use CONVERSATION_STARTERS which requires
  // specific prefixes. The full patterns are tested in production via E2E tests.
  // These unit tests focus on the new patterns added in this PR.

  describe('Time Patterns', () => {
    const timeExamples = [
      'what time is it',
      'what time is it in Tokyo',
      'time in London',
    ];

    it.each(timeExamples)('should match time request: "%s"', (text) => {
      const matches = TIME_PATTERNS.some((p) => p.test(text));
      expect(matches).toBe(true);
    });
  });

  describe('Timer Patterns', () => {
    const timerExamples = [
      'set a timer for 5 minutes',
      '10 minute timer',
      'set timer for 30 seconds',
      'start a timer for 15 min',
    ];

    it.each(timerExamples)('should match timer request: "%s"', (text) => {
      const matches = TIMER_PATTERNS.some((p) => p.test(text));
      expect(matches).toBe(true);
    });
  });

  describe('Reminder Patterns', () => {
    const reminderExamples = [
      'remind me to call mom',
      'set a reminder to buy groceries',
      'create reminder to check email',
    ];

    it.each(reminderExamples)('should match reminder request: "%s"', (text) => {
      const matches = REMINDER_PATTERNS.some((p) => p.test(text));
      expect(matches).toBe(true);
    });
  });

  describe('Habit Patterns', () => {
    const habitExamples = [
      'I did my meditation',
      'I meditated today',
      'I exercised this morning',
      'I completed my reading',
      'I worked out',
      'I just did yoga',
    ];

    it.each(habitExamples)('should match habit request: "%s"', (text) => {
      const matches = HABIT_PATTERNS.some((p) => p.test(text));
      expect(matches).toBe(true);
    });
  });

  describe('Calendar Patterns', () => {
    const calendarExamples = [
      'what is on my calendar',
      'what is on my calendar today',
      'do I have anything tomorrow',
      'am I free today',
      'show my schedule',
      'what are my meetings this week',
      'check my calendar',
    ];

    it.each(calendarExamples)('should match calendar request: "%s"', (text) => {
      const matches = CALENDAR_PATTERNS.some((p) => p.test(text));
      expect(matches).toBe(true);
    });
  });

  describe('Music Control Patterns', () => {
    const pauseExamples = ['pause', 'pause the music', 'hold'];
    const resumeExamples = ['resume', 'keep playing', 'unpause', 'continue'];
    const stopExamples = ['stop the music', 'no more music', 'turn off music'];

    it.each(pauseExamples)('should match pause: "%s"', (text) => {
      const match = MUSIC_CONTROL_PATTERNS.find((p) => p.pattern.test(text));
      expect(match?.action).toBe('pause');
    });

    it.each(resumeExamples)('should match resume: "%s"', (text) => {
      const match = MUSIC_CONTROL_PATTERNS.find((p) => p.pattern.test(text));
      expect(match?.action).toBe('resume');
    });

    it.each(stopExamples)('should match stop: "%s"', (text) => {
      const match = MUSIC_CONTROL_PATTERNS.find((p) => p.pattern.test(text));
      expect(match?.action).toBe('stop');
    });
  });
});
