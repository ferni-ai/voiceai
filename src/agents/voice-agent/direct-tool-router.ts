/**
 * Direct Tool Router - Intelligent Pre-LLM Tool Execution
 *
 * This module provides a high-confidence, low-false-positive tool routing
 * that runs BEFORE Gemini. Unlike the full semantic router (which has too many
 * false positives), this only handles OBVIOUS tool requests with very high certainty.
 *
 * WHY THIS EXISTS:
 * Gemini Live API sometimes returns NOTHING when users make tool requests like
 * "Could you play some music?". The function calling reinforcement in turn-processor.ts
 * is never executed because handleUserTurn() is never called in the Gemini Live flow.
 *
 * This router provides a surgical fix by:
 * 1. Detecting OBVIOUS tool intents (music, weather, handoff) with high confidence
 * 2. Executing the tool directly and letting Gemini respond naturally
 * 3. Falling back to Gemini for anything uncertain
 *
 * FALSE POSITIVE PREVENTION:
 * - Only match very specific patterns (not generic words)
 * - Require action verbs + domain nouns (not just domain words)
 * - Skip if user is in the middle of a conversation about the topic
 *
 * @module voice-agent/direct-tool-router
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DirectToolRouter' });

// ============================================================================
// TYPES
// ============================================================================

export interface DirectRouteResult {
  /** Whether the tool was executed directly */
  handled: boolean;
  /** Tool ID if executed */
  toolId?: string;
  /** Confidence of the match (0-1) */
  confidence: number;
  /** Human-readable intent detected */
  intent?: string;
  /** Response to speak (if any) */
  speechResponse?: string;
  /** Error if execution failed */
  error?: string;
}

export interface DirectRouteContext {
  userId: string;
  sessionId: string;
  personaId: string;
  /** Recent conversation context to avoid false positives */
  recentTopics?: string[];
  /** Last thing the agent said */
  lastAgentMessage?: string;
  /** User's IP-detected location (for weather, local info personalization) */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
}

// ============================================================================
// HIGH-CONFIDENCE INTENT PATTERNS
// ============================================================================

/**
 * Music intent patterns - VERY specific to avoid "bluegrass" → music false positives
 *
 * IMPORTANT: Allow common conversation starters like "Yeah", "Okay", "Sure" before commands
 * because users often start requests with affirmations after the agent asks "What kind of music?"
 */
const CONVERSATION_STARTERS =
  '(?:yeah|yes|yep|okay|ok|sure|alright|actually|um+|uh+|so|well|hey|oh|hmm),?\\s*';

const MUSIC_PATTERNS = [
  // Direct commands with "play" - allow conversation starters
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on|start|queue|throw on)(\\s+me)?\\s+(some\\s+)?(.+\\s+)?(music|songs?|tunes?)`,
    'i'
  ),
  // Direct commands with specific genres (including "morning music", "workout music", etc.)
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
  // "Play some more music" - continuation requests
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on)(\\s+some)?\\s+more\\s+(music|songs?|tunes?)`,
    'i'
  ),
  // "I want to hear/listen to music" variations
  new RegExp(
    `^${CONVERSATION_STARTERS}?i (want to|wanna) (hear|listen to)\\s+(some\\s+)?(music|songs?|tunes?)`,
    'i'
  ),
  // "Can we get some music" / "Let's have some music"
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can we|let('s| us)|how about)\\s+(get|have|hear)\\s+(some\\s+)?(music|songs?|tunes?)`,
    'i'
  ),
  // "Music please" / "Tunes please"
  new RegExp(`^${CONVERSATION_STARTERS}?(music|songs?|tunes?)\\s*(please)?\\??$`, 'i'),
];

/**
 * Weather intent patterns - simple and specific
 */
const WEATHER_PATTERNS = [
  new RegExp(
    `^${CONVERSATION_STARTERS}?(what('s| is)|how('s| is)|check)\\s+(the\\s+)?weather`,
    'i'
  ),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(is it|will it)\\s+(going to\\s+)?(rain|snow|cold|hot|warm|sunny|cloudy)`,
    'i'
  ),
  new RegExp(`^${CONVERSATION_STARTERS}?weather\\s*(forecast|today|tomorrow|this week)?$`, 'i'),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(do i need|should i bring)\\s+(an?\\s+)?(umbrella|jacket|coat)`,
    'i'
  ),
  // Additional natural phrasing
  new RegExp(`^${CONVERSATION_STARTERS}?how (cold|hot|warm) is it`, 'i'),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(is it|it is) (cold|hot|warm|raining|snowing)\\s*(outside|out)?\\??$`,
    'i'
  ),
  new RegExp(`^${CONVERSATION_STARTERS}?what('s| is) it like (outside|out there)\\??$`, 'i'),
  new RegExp(`^${CONVERSATION_STARTERS}?(gonna|going to) rain (today|tomorrow|later)?\\??$`, 'i'),
  new RegExp(`^${CONVERSATION_STARTERS}?(what('s| is) the|check the) (temp|temperature)`, 'i'),
];

/**
 * News intent patterns - specific to avoid false positives
 */
const NEWS_PATTERNS = [
  new RegExp(
    `^${CONVERSATION_STARTERS}?(can you |could you |would you |please |i was hoping you could |i was hoping you would |i was hoping )?(check|get|read|share|tell me|pull up|look up)?\\s*(the\\s+)?(latest\\s+)?(news|headlines|top stories)(\\s+today)?\\??$`,
    'i'
  ),
  new RegExp(
    `^${CONVERSATION_STARTERS}?(what('s| is)\\s+the\\s+)?(news|headlines|top stories)\\s*(today|right now)?\\??$`,
    'i'
  ),
  /^(any|some)\s+(news|headlines)\s*(today|right now)?\??$/i,
  // "What's happening" / "What's going on"
  new RegExp(
    `^${CONVERSATION_STARTERS}?what('s| is) (happening|going on)( in the world| today| right now)?\\??$`,
    'i'
  ),
  // "Give me the news" / "Tell me the news"
  new RegExp(`^${CONVERSATION_STARTERS}?(give|tell) me (the\\s+)?(news|headlines)`, 'i'),
  // "Catch me up" / "Update me"
  new RegExp(
    `^${CONVERSATION_STARTERS}?(catch me up|update me)( on the news| on what's happening)?`,
    'i'
  ),
];

const NEWS_TOPIC_HINTS: Array<{
  pattern: RegExp;
  topic: string;
  category?: 'general' | 'forex' | 'crypto' | 'merger';
}> = [
  {
    pattern: /\b(tech|technology|ai|artificial intelligence|startup|silicon valley)\b/i,
    topic: 'technology',
  },
  { pattern: /\b(crypto|bitcoin|ethereum|blockchain)\b/i, topic: 'financial', category: 'crypto' },
  { pattern: /\b(forex|currency|currencies|fx)\b/i, topic: 'financial', category: 'forex' },
  { pattern: /\b(merger|acquisition|m&a)\b/i, topic: 'financial', category: 'merger' },
  {
    pattern: /\b(finance|financial|markets?|stocks?|investing|economy|economic)\b/i,
    topic: 'financial',
  },
];

/**
 * Time intent patterns - asking for current time or time in other cities
 */
const TIME_PATTERNS = [
  // Current time
  /^what('s| is) the time\??$/i,
  /^what time is it\??$/i,
  /^tell me the time$/i,
  /^(can you |could you |would you )?check the time\??$/i,
  // Time in a city
  /^what('s| is) the time in .+\??$/i,
  /^what time is it in .+\??$/i,
  /^time in .+$/i,
];

/**
 * Search/define intent patterns - simple lookups
 */
const SEARCH_PATTERNS = [
  // Definition requests
  /^(what('s| is)|define|meaning of) .+\??$/i,
  /^who (is|was) .+\??$/i,
  // Simple search
  /^(search|look up|find out about) .+$/i,
];

/**
 * Timer intent patterns - countdown timers
 */
const TIMER_PATTERNS = [
  // "Set a timer for X minutes"
  /^(set|start|make)\s+(a\s+)?timer\s+(for\s+)?(\d+)\s*(minute|min|second|sec)s?/i,
  // "X minute timer"
  /^(\d+)\s*(minute|min|second|sec)s?\s+timer$/i,
  // "Timer for X minutes"
  /^timer\s+(for\s+)?(\d+)\s*(minute|min|second|sec)s?$/i,
];

/**
 * Reminder intent patterns - "remind me to..."
 */
const REMINDER_PATTERNS = [
  // "Remind me to..."
  /^remind\s+me\s+to\s+(.+)/i,
  // "Set a reminder to..."
  /^(set|create)\s+(a\s+)?reminder\s+(to\s+)?(.+)/i,
  // "Don't let me forget to..."
  /^(don't|do not)\s+let\s+me\s+forget\s+(to\s+)?(.+)/i,
];

/**
 * Music control patterns - pause, resume, stop
 */
const MUSIC_CONTROL_PATTERNS: Array<{ pattern: RegExp; action: 'pause' | 'resume' | 'stop' }> = [
  // Pause
  { pattern: /^(pause|hold)\s*(the\s+)?(music|song|track)?$/i, action: 'pause' },
  { pattern: /^(can you |please )?(pause|hold)\s*(the\s+)?(music|song|track)?$/i, action: 'pause' },
  { pattern: /^stop\s+the\s+(music|song|track)$/i, action: 'stop' },
  // Resume/unpause
  { pattern: /^(resume|unpause|continue|keep playing|play)\s*(the\s+)?(music|song|track)?$/i, action: 'resume' },
  { pattern: /^(can you |please )?(resume|unpause|continue)\s*(the\s+)?(music|song|track)?$/i, action: 'resume' },
  // Stop completely
  { pattern: /^(stop|turn off|end|quit)\s*(the\s+)?(music|playback)?$/i, action: 'stop' },
  { pattern: /^(can you |please )?(stop|turn off|end)\s*(the\s+)?(music|playback)?$/i, action: 'stop' },
  { pattern: /^no more music$/i, action: 'stop' },
  { pattern: /^(that's|thats) enough music$/i, action: 'stop' },
];

/**
 * Calendar patterns - "What's on my calendar?"
 */
const CALENDAR_PATTERNS = [
  // "What's on my calendar today?"
  /^what('s| is)\s+(on\s+)?(my\s+)?(calendar|schedule)\s*(today|tomorrow|this week)?/i,
  // "Do I have anything today?"
  /^(do i have|am i)\s+(anything|any meetings|any appointments|free|busy)\s*(today|tomorrow|this week)?/i,
  // "What are my meetings?"
  /^what\s+(are|is)\s+my\s+(meetings?|appointments?|schedule)(\s+for)?\s*(today|tomorrow|this week)?/i,
  // "Show me my calendar"
  /^show\s+(me\s+)?(my\s+)?(calendar|schedule)(\s+for)?\s*(today|tomorrow|this week)?/i,
  // "Check my calendar"
  /^check\s+(my\s+)?(calendar|schedule)(\s+for)?\s*(today|tomorrow|this week)?/i,
];

/**
 * Habit tracking patterns - "I did my meditation"
 */
const HABIT_PATTERNS = [
  // "I did my X" / "I did X today"
  /^i\s+(did|completed|finished|just did)\s+(my\s+)?(.+?)(\s+today|\s+this morning|\s+this evening)?$/i,
  // "Track my X" / "Log my X"
  /^(track|log|record)\s+(my\s+)?(.+?)(\s+habit)?$/i,
  // "I meditated" / "I exercised" / "I worked out"
  /^i\s+(meditated|exercised|worked out|journaled|read|stretched|walked|ran|drank water|did yoga|practiced)(\s+today|\s+this morning)?$/i,
  // "Check off X" / "Mark X as done"
  /^(check off|mark|checked)\s+(my\s+)?(.+?)(\s+as done|\s+done|\s+complete)?$/i,
];

/**
 * Contact/calling patterns - "Call mom", "Text John"
 */
const CONTACT_PATTERNS = [
  // "Call X"
  /^(call|phone|ring|dial)\s+(.+)$/i,
  // "Text X" / "Message X"
  /^(text|message|send a (text|message) to)\s+(.+)$/i,
  // "Can you call X"
  /^(can you |could you |please )?(call|text|message)\s+(.+)$/i,
  // "I need to call X"
  /^i (need to|want to|should) (call|text|message)\s+(.+)$/i,
  // "Reach out to X"
  /^(reach out to|contact|get in touch with)\s+(.+)$/i,
];

/**
 * Note-taking patterns - "Take a note", "Remember this"
 */
const NOTE_PATTERNS = [
  // "Take a note"
  /^(take|make|create|save)\s+(a\s+)?(note|memo)(:|,)?\s*(.+)?$/i,
  // "Remember that X" / "Remember this"
  /^remember\s+(that\s+)?(.+)$/i,
  // "Note: X"
  /^note(:|,)\s*(.+)$/i,
  // "Quick note"
  /^quick\s+note(:|,)?\s*(.+)?$/i,
  // "Save this thought"
  /^save\s+(this\s+)?(thought|idea|note)(:|,)?\s*(.+)?$/i,
  // "Remind me later about X" (note-style, not timed reminder)
  /^(jot down|write down)\s+(.+)$/i,
];

/**
 * Smart home patterns - "Turn off the lights", "Set thermostat"
 */
const SMART_HOME_PATTERNS: Array<{ pattern: RegExp; device: 'lights' | 'thermostat'; action: string }> = [
  // Lights on/off
  { pattern: /^(turn\s+)?(on|off)\s+(the\s+)?(lights?|lamp|lamps)(\s+in\s+.+)?$/i, device: 'lights', action: 'toggle' },
  { pattern: /^(turn|switch)\s+(the\s+)?(lights?|lamp|lamps)\s+(on|off)(\s+in\s+.+)?$/i, device: 'lights', action: 'toggle' },
  // Dim lights
  { pattern: /^(dim|brighten)\s+(the\s+)?(lights?|lamp|lamps)(\s+to\s+\d+%?)?/i, device: 'lights', action: 'dim' },
  { pattern: /^(set|make)\s+(the\s+)?(lights?|lamp|lamps)\s+(brighter|dimmer|to\s+\d+%?)$/i, device: 'lights', action: 'dim' },
  // Thermostat
  { pattern: /^(set|turn|make)\s+(the\s+)?(thermostat|temperature|temp|heat|ac|air)\s+(to\s+)?(\d+)(\s+degrees?)?$/i, device: 'thermostat', action: 'set' },
  { pattern: /^(turn|make)\s+(it|the room|the house)\s+(warmer|cooler|hotter|colder)$/i, device: 'thermostat', action: 'adjust' },
  { pattern: /^(raise|lower)\s+(the\s+)?(temperature|temp|thermostat)(\s+to\s+\d+)?$/i, device: 'thermostat', action: 'adjust' },
  // Shorthand
  { pattern: /^(\d+)\s+degrees?$/i, device: 'thermostat', action: 'set' },
  { pattern: /^lights?\s+(on|off)$/i, device: 'lights', action: 'toggle' },
];

/**
 * Topic-specific news patterns - "Sports news", "Tech headlines"
 */
const NEWS_TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /^(sports?|football|basketball|baseball|soccer|hockey|tennis|golf)\s+(news|headlines|updates)$/i, topic: 'sports' },
  { pattern: /^(tech|technology|silicon valley|gadgets?|ai|artificial intelligence)\s+(news|headlines|updates)$/i, topic: 'technology' },
  { pattern: /^(business|finance|economy|market|stock|wall street)\s+(news|headlines|updates)$/i, topic: 'business' },
  { pattern: /^(entertainment|celebrity|hollywood|movies?|tv)\s+(news|headlines|updates|gossip)$/i, topic: 'entertainment' },
  { pattern: /^(politics?|political|government|congress|white house)\s+(news|headlines|updates)$/i, topic: 'politics' },
  { pattern: /^(world|international|global)\s+(news|headlines|updates)$/i, topic: 'world' },
  { pattern: /^(local|neighborhood|city)\s+(news|headlines|updates)$/i, topic: 'local' },
  { pattern: /^(health|medical|healthcare)\s+(news|headlines|updates)$/i, topic: 'health' },
  { pattern: /^(science|research|scientific)\s+(news|headlines|updates|discoveries)$/i, topic: 'science' },
  // Also match "What's happening in X"
  { pattern: /^what('s| is)\s+(happening|going on)\s+(in|with)\s+(sports?|tech|business|politics)$/i, topic: 'dynamic' },
];

/**
 * Handoff intent patterns - explicit persona switches
 */
const HANDOFF_PATTERNS: Array<{ pattern: RegExp; personaId: string }> = [
  {
    pattern:
      /^(talk to|speak with|switch to|transfer( me)? to|let me talk to|can i (talk|speak) (to|with)|i (want|need) to (talk|speak) (to|with)|bring in|get)\s+maya/i,
    personaId: 'maya-santos',
  },
  {
    pattern:
      /^(talk to|speak with|switch to|transfer( me)? to|let me talk to|can i (talk|speak) (to|with)|i (want|need) to (talk|speak) (to|with)|bring in|get)\s+peter/i,
    personaId: 'peter-john',
  },
  {
    pattern:
      /^(talk to|speak with|switch to|transfer( me)? to|let me talk to|can i (talk|speak) (to|with)|i (want|need) to (talk|speak) (to|with)|bring in|get)\s+alex/i,
    personaId: 'alex-chen',
  },
  {
    pattern:
      /^(talk to|speak with|switch to|transfer( me)? to|let me talk to|can i (talk|speak) (to|with)|i (want|need) to (talk|speak) (to|with)|bring in|get)\s+jordan/i,
    personaId: 'jordan-taylor',
  },
  {
    pattern:
      /^(talk to|speak with|switch to|transfer( me)? to|let me talk to|can i (talk|speak) (to|with)|i (want|need) to (talk|speak) (to|with)|bring in|get)\s+nayan/i,
    personaId: 'nayan-patel',
  },
  {
    pattern:
      /^(talk to|speak with|switch to|transfer( me)? to|let me talk to|can i (talk|speak) (to|with)|i (want|need) to (talk|speak) (to|with)|bring in|get)\s+ferni/i,
    personaId: 'ferni',
  },
];

// ============================================================================
// INTENT DETECTION
// ============================================================================

interface DetectedIntent {
  type: 'music' | 'musicControl' | 'weather' | 'news' | 'time' | 'search' | 'timer' | 'reminder' | 'habit' | 'calendar' | 'contact' | 'note' | 'smartHome' | 'handoff' | 'none';
  confidence: number;
  query?: string;
  topic?: string;
  category?: 'general' | 'forex' | 'crypto' | 'merger';
  targetPersonaId?: string;
  /** For time queries - extracted city name if asking about another timezone */
  city?: string;
  /** For timer - duration in minutes */
  timerMinutes?: number;
  /** For timer - duration in seconds */
  timerSeconds?: number;
  /** For timer/reminder - label/message */
  label?: string;
  /** For reminder - when to remind (natural language) */
  when?: string;
  /** For habit - the habit that was completed */
  habitName?: string;
  /** For calendar - which day to check */
  calendarDay?: 'today' | 'tomorrow' | 'week';
  /** For music control - what action */
  musicAction?: 'pause' | 'resume' | 'stop';
  /** For contact - who to contact and how */
  contactName?: string;
  contactMethod?: 'call' | 'text';
  /** For note - the content to save */
  noteContent?: string;
  /** For smart home - device and action */
  smartDevice?: 'lights' | 'thermostat';
  smartAction?: string;
  smartValue?: string;
}

/**
 * Detect high-confidence tool intent from transcript
 */
function detectIntent(transcript: string, context: DirectRouteContext): DetectedIntent {
  const text = transcript.trim();

  // Skip very short or very long messages (not likely to be direct commands)
  if (text.length < 3 || text.length > 150) {
    return { type: 'none', confidence: 0 };
  }

  // Skip if this looks like a continuation of a conversation about the topic
  // (e.g., "I love playing music" is not a request to play music)
  if (
    context.recentTopics?.includes('music') &&
    !text.match(/^(can|could|would|please|play|put)/i)
  ) {
    return { type: 'none', confidence: 0 };
  }

  // Check music patterns
  for (const pattern of MUSIC_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Extract the query (everything after "play/put on", ignoring conversation starters)
      // Handle: "Yeah, play some morning music" → "morning music"
      // Handle: "Play some jazz" → "jazz"
      const queryMatch = text.match(
        /(?:play|put on|start|queue)(?:\s+me)?\s+(?:some\s+)?(?:more\s+)?(.+)/i
      );
      let query = queryMatch?.[1] || 'music';

      // Clean up the query - remove trailing punctuation and "please"
      query = query
        .replace(/[.!?]+$/i, '')
        .replace(/\s+please$/i, '')
        .trim();

      // If query is just "music" or empty, use a sensible default
      if (
        !query ||
        query.toLowerCase() === 'music' ||
        query.toLowerCase() === 'songs' ||
        query.toLowerCase() === 'tunes'
      ) {
        query = 'music';
      }

      log.info({ transcript: text.slice(0, 50), query }, '🎵 Music intent detected');
      return {
        type: 'music',
        confidence: 0.95,
        query,
      };
    }
  }

  // Check music control patterns (pause/resume/stop)
  for (const { pattern, action } of MUSIC_CONTROL_PATTERNS) {
    if (pattern.test(text)) {
      log.info({ transcript: text.slice(0, 50), action }, '🎛️ Music control intent detected');
      return {
        type: 'musicControl',
        confidence: 0.95,
        musicAction: action,
      };
    }
  }

  // Check weather patterns
  for (const pattern of WEATHER_PATTERNS) {
    if (pattern.test(text)) {
      log.info({ transcript: text.slice(0, 50) }, '🌤️ Weather intent detected');
      return { type: 'weather', confidence: 0.95 };
    }
  }

  // Check news patterns
  for (const pattern of NEWS_PATTERNS) {
    if (pattern.test(text)) {
      const topicMatch = NEWS_TOPIC_HINTS.find((hint) => hint.pattern.test(text));
      log.info(
        { transcript: text.slice(0, 50), topic: topicMatch?.topic, category: topicMatch?.category },
        '📰 News intent detected'
      );
      return {
        type: 'news',
        confidence: 0.95,
        topic: topicMatch?.topic,
        category: topicMatch?.category,
      };
    }
  }

  // Check time patterns
  for (const pattern of TIME_PATTERNS) {
    if (pattern.test(text)) {
      // Extract city if asking about another timezone
      const cityMatch = text.match(/(?:time in|is it in)\s+(.+?)\??$/i);
      const city = cityMatch?.[1]?.trim();

      log.info({ transcript: text.slice(0, 50), city }, '🕐 Time intent detected');
      return {
        type: 'time',
        confidence: 0.95,
        city,
      };
    }
  }

  // Check search/define patterns
  for (const pattern of SEARCH_PATTERNS) {
    if (pattern.test(text)) {
      // Extract the search query
      const queryMatch = text.match(
        /(?:what(?:'s| is)|define|meaning of|who (?:is|was)|search|look up|find out about)\s+(.+?)\??$/i
      );
      const query = queryMatch?.[1]?.trim();

      log.info({ transcript: text.slice(0, 50), query }, '🔍 Search intent detected');
      return {
        type: 'search',
        confidence: 0.9,
        query,
      };
    }
  }

  // Check timer patterns
  for (const pattern of TIMER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Extract duration - patterns vary
      let minutes = 0;
      let seconds = 0;
      
      // Find the number and unit in the match
      const numMatch = text.match(/(\d+)\s*(minute|min|second|sec)/i);
      if (numMatch) {
        const value = parseInt(numMatch[1]);
        const unit = numMatch[2].toLowerCase();
        if (unit.startsWith('min')) {
          minutes = value;
        } else {
          seconds = value;
        }
      }

      log.info({ transcript: text.slice(0, 50), minutes, seconds }, '⏱️ Timer intent detected');
      return {
        type: 'timer',
        confidence: 0.95,
        timerMinutes: minutes,
        timerSeconds: seconds,
      };
    }
  }

  // Check reminder patterns
  for (const pattern of REMINDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Extract what to remind and when
      // "remind me to call mom tomorrow" → message: "call mom tomorrow"
      // "remind me to call mom in 30 minutes" → message: "call mom", when: "in 30 minutes"
      let message = '';
      
      if (pattern.source.includes('remind\\s+me')) {
        message = match[1] || '';
      } else if (pattern.source.includes('set|create')) {
        message = match[4] || '';
      } else if (pattern.source.includes("don't")) {
        message = match[3] || '';
      }

      // Try to extract "when" from the message if it contains time phrases
      const timeMatch = message.match(/\s+(in\s+\d+\s+(?:minute|hour|min|hr)s?|tomorrow|tonight|at\s+\d+|next\s+\w+).*$/i);
      let when = '';
      if (timeMatch) {
        when = timeMatch[1];
        message = message.replace(timeMatch[0], '').trim();
      }

      log.info({ transcript: text.slice(0, 50), message, when }, '🔔 Reminder intent detected');
      return {
        type: 'reminder',
        confidence: 0.92,
        label: message,
        when: when || 'soon',
      };
    }
  }

  // Check calendar patterns
  for (const pattern of CALENDAR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Determine which day to check
      const dayText = match[match.length - 1]?.toLowerCase() || '';
      let calendarDay: 'today' | 'tomorrow' | 'week' = 'today';
      
      if (dayText.includes('tomorrow')) {
        calendarDay = 'tomorrow';
      } else if (dayText.includes('week')) {
        calendarDay = 'week';
      }

      log.info({ transcript: text.slice(0, 50), calendarDay }, '📅 Calendar intent detected');
      return {
        type: 'calendar',
        confidence: 0.92,
        calendarDay,
      };
    }
  }

  // Check habit tracking patterns
  for (const pattern of HABIT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let habitName = '';
      
      // Extract habit name based on pattern type
      if (pattern.source.includes('i\\s+(meditated|exercised')) {
        // Direct verb pattern: "I meditated" → "meditation"
        const verb = match[1]?.toLowerCase();
        const verbToHabit: Record<string, string> = {
          'meditated': 'meditation',
          'exercised': 'exercise',
          'worked out': 'workout',
          'journaled': 'journaling',
          'read': 'reading',
          'stretched': 'stretching',
          'walked': 'walking',
          'ran': 'running',
          'drank water': 'water',
          'did yoga': 'yoga',
          'practiced': 'practice',
        };
        habitName = verbToHabit[verb] || verb;
      } else if (pattern.source.includes('i\\s+(did|completed')) {
        // "I did my meditation" → "meditation"
        habitName = match[3]?.trim() || '';
      } else if (pattern.source.includes('track|log|record')) {
        // "Track my meditation" → "meditation"
        habitName = match[3]?.trim() || '';
      } else if (pattern.source.includes('check off|mark')) {
        // "Check off meditation" → "meditation"
        habitName = match[3]?.trim() || '';
      }

      // Clean up habit name
      habitName = habitName.replace(/\s+(habit|today|this morning|this evening)$/i, '').trim();

      if (habitName) {
        log.info({ transcript: text.slice(0, 50), habitName }, '✅ Habit intent detected');
        return {
          type: 'habit',
          confidence: 0.9,
          habitName,
        };
      }
    }
  }

  // Check contact/calling patterns
  for (const pattern of CONTACT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Determine contact method (call vs text)
      const method = text.match(/^(call|phone|ring|dial)/i) ? 'call' : 'text';
      
      // Extract contact name - it's usually the last capture group
      let contactName = '';
      for (let i = match.length - 1; i >= 0; i--) {
        if (match[i] && !['call', 'text', 'message', 'phone', 'ring', 'dial', 'contact', 'reach out to'].some(w => match[i]?.toLowerCase() === w)) {
          contactName = match[i].trim();
          break;
        }
      }

      if (contactName) {
        log.info({ transcript: text.slice(0, 50), contactName, method }, '📞 Contact intent detected');
        return {
          type: 'contact',
          confidence: 0.9,
          contactName,
          contactMethod: method,
        };
      }
    }
  }

  // Check note-taking patterns
  for (const pattern of NOTE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Extract note content - usually the last non-empty capture group
      let noteContent = '';
      for (let i = match.length - 1; i >= 0; i--) {
        if (match[i] && match[i].length > 2) {
          noteContent = match[i].trim();
          break;
        }
      }

      // For "remember that X" patterns, the content is after "that"
      if (pattern.source.includes('remember') && !noteContent) {
        const rememberMatch = text.match(/remember\s+(?:that\s+)?(.+)$/i);
        if (rememberMatch) noteContent = rememberMatch[1];
      }

      log.info({ transcript: text.slice(0, 50), noteContent: noteContent.slice(0, 30) }, '📝 Note intent detected');
      return {
        type: 'note',
        confidence: 0.88,
        noteContent: noteContent || text,
      };
    }
  }

  // Check smart home patterns
  for (const { pattern, device, action } of SMART_HOME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let smartValue = '';
      
      // Extract value for thermostat (temperature) or lights (brightness)
      const tempMatch = text.match(/(\d+)\s*degrees?/i) || text.match(/to\s+(\d+)/i);
      if (tempMatch) {
        smartValue = tempMatch[1];
      }
      
      // Extract on/off state for lights
      const stateMatch = text.match(/\b(on|off)\b/i);
      if (device === 'lights' && stateMatch) {
        smartValue = stateMatch[1].toLowerCase();
      }

      log.info({ transcript: text.slice(0, 50), device, action, value: smartValue }, '🏠 Smart home intent detected');
      return {
        type: 'smartHome',
        confidence: 0.9,
        smartDevice: device,
        smartAction: action,
        smartValue,
      };
    }
  }

  // Check topic-specific news patterns
  for (const { pattern, topic } of NEWS_TOPIC_PATTERNS) {
    if (pattern.test(text)) {
      log.info({ transcript: text.slice(0, 50), topic }, '📰 Topic news intent detected');
      return {
        type: 'news',
        confidence: 0.92,
        topic,
      };
    }
  }

  // Check handoff patterns
  for (const { pattern, personaId } of HANDOFF_PATTERNS) {
    if (pattern.test(text)) {
      log.info(
        { transcript: text.slice(0, 50), targetPersona: personaId },
        '🤝 Handoff intent detected'
      );
      return {
        type: 'handoff',
        confidence: 0.98,
        targetPersonaId: personaId,
      };
    }
  }

  return { type: 'none', confidence: 0 };
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a tool directly based on detected intent
 */
async function executeTool(
  intent: DetectedIntent,
  context: DirectRouteContext
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    // Use executeJsonFunction which is the public API for tool execution
    const { executeJsonFunction } = await import('../shared/json-function-executor.js');

    // Helper to build a JsonFunctionCall with required 'raw' field
    const buildFunctionCall = (
      fn: string,
      args: Record<string, unknown>
    ): { fn: string; args: Record<string, unknown>; raw: string } => ({
      fn,
      args,
      raw: JSON.stringify({ fn, args }),
    });

    switch (intent.type) {
      case 'music': {
        const result = await executeJsonFunction(
          buildFunctionCall('playMusic', { query: intent.query || 'music' }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );

        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'weather': {
        const result = await executeJsonFunction(buildFunctionCall('getWeather', {}), {
          sessionId: context.sessionId,
          userId: context.userId,
          personaId: context.personaId,
          userLocation: context.userLocation,
        });

        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'news': {
        const args: Record<string, unknown> = {};
        if (intent.topic) {
          args.topic = intent.topic;
        }
        if (intent.category) {
          args.category = intent.category;
        }
        const result = await executeJsonFunction(buildFunctionCall('getNews', args), {
          sessionId: context.sessionId,
          userId: context.userId,
          personaId: context.personaId,
        });

        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'time': {
        // Use timeInCity for timezone queries, or getCurrentTime for local time
        if (intent.city) {
          const result = await executeJsonFunction(
            buildFunctionCall('timeInCity', { city: intent.city }),
            {
              sessionId: context.sessionId,
              userId: context.userId,
              personaId: context.personaId,
            }
          );
          return {
            success: result.success,
            response: typeof result.result === 'string' ? result.result : undefined,
            error: result.error,
          };
        } else {
          // Local time - just return the current time directly (no tool needed)
          const now = new Date();
          const timeStr = now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          return {
            success: true,
            response: `It's ${timeStr}.`,
          };
        }
      }

      case 'search': {
        const result = await executeJsonFunction(
          buildFunctionCall('searchWeb', { query: intent.query || '' }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'timer': {
        const result = await executeJsonFunction(
          buildFunctionCall('setTimer', {
            minutes: intent.timerMinutes || 0,
            seconds: intent.timerSeconds || 0,
            label: intent.label,
          }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'reminder': {
        const result = await executeJsonFunction(
          buildFunctionCall('setReminder', {
            message: intent.label || '',
            when: intent.when || 'in 30 minutes',
          }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'habit': {
        const result = await executeJsonFunction(
          buildFunctionCall('trackHabit', {
            habitName: intent.habitName || '',
          }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'calendar': {
        // Use getCalendarWeek for "this week", otherwise getCalendarToday
        const toolName = intent.calendarDay === 'week' ? 'getCalendarWeek' : 'getCalendarToday';
        const result = await executeJsonFunction(
          buildFunctionCall(toolName, {}),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'musicControl': {
        // Map action to tool name
        const actionToTool: Record<string, string> = {
          pause: 'pauseMusic',
          resume: 'resumeMusic',
          stop: 'stopMusic',
        };
        const toolName = actionToTool[intent.musicAction || 'pause'];
        
        const result = await executeJsonFunction(
          buildFunctionCall(toolName, {}),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'contact': {
        // Use reachOut tool for contacting people
        const result = await executeJsonFunction(
          buildFunctionCall('reachOut', {
            contactName: intent.contactName || '',
            method: intent.contactMethod || 'call',
          }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'note': {
        // Use quickNote tool for saving notes
        const result = await executeJsonFunction(
          buildFunctionCall('quickNote', {
            content: intent.noteContent || '',
          }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );
        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'smartHome': {
        // Use appropriate smart home tool based on device
        if (intent.smartDevice === 'lights') {
          const result = await executeJsonFunction(
            buildFunctionCall('controlLight', {
              action: intent.smartValue === 'off' ? 'off' : 'on',
              brightness: intent.smartAction === 'dim' ? parseInt(intent.smartValue || '50') : undefined,
            }),
            {
              sessionId: context.sessionId,
              userId: context.userId,
              personaId: context.personaId,
            }
          );
          return {
            success: result.success,
            response: typeof result.result === 'string' ? result.result : undefined,
            error: result.error,
          };
        } else if (intent.smartDevice === 'thermostat') {
          const result = await executeJsonFunction(
            buildFunctionCall('setThermostat', {
              temperature: parseInt(intent.smartValue || '72'),
            }),
            {
              sessionId: context.sessionId,
              userId: context.userId,
              personaId: context.personaId,
            }
          );
          return {
            success: result.success,
            response: typeof result.result === 'string' ? result.result : undefined,
            error: result.error,
          };
        }
        return { success: false, error: 'Unknown smart home device' };
      }

      case 'handoff': {
        const targetName = intent.targetPersonaId?.split('-')[0] || 'team member';
        const capitalizedName = targetName.charAt(0).toUpperCase() + targetName.slice(1);

        const result = await executeJsonFunction(
          buildFunctionCall(`handoffTo${capitalizedName}`, { reason: 'User requested' }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );

        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      default:
        return { success: false, error: 'Unknown intent type' };
    }
  } catch (error) {
    log.error({ error: String(error), intent: intent.type }, 'Direct tool execution failed');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Route transcript directly to tool execution if high-confidence intent is detected
 *
 * Call this BEFORE sending to Gemini. If it returns handled=true, skip the LLM.
 * If it returns handled=false, proceed with normal Gemini flow.
 *
 * @example
 * ```typescript
 * const routeResult = await routeDirectly(transcript, {
 *   userId,
 *   sessionId,
 *   personaId: persona.id,
 *   session,
 * });
 *
 * if (routeResult.handled) {
 *   // Tool executed, let Gemini respond naturally
 *   return;
 * }
 *
 * // Continue with normal Gemini flow
 * ```
 */
export async function routeDirectly(
  transcript: string,
  context: DirectRouteContext
): Promise<DirectRouteResult> {
  // Detect intent
  const intent = detectIntent(transcript, context);

  // Only handle high-confidence intents
  if (intent.type === 'none' || intent.confidence < 0.9) {
    return { handled: false, confidence: intent.confidence };
  }

  log.info(
    {
      transcript: transcript.slice(0, 50),
      intent: intent.type,
      confidence: intent.confidence,
      query: intent.query,
    },
    '🎯 Direct routing: High-confidence intent detected'
  );

  // Execute the tool
  const result = await executeTool(intent, context);

  if (result.success) {
    log.info(
      {
        intent: intent.type,
        hasResponse: !!result.response,
      },
      '✅ Direct routing: Tool executed successfully'
    );

    // Map intent type to tool ID
    const toolIdMap: Record<string, string> = {
      music: 'playMusic',
      weather: 'getWeather',
      news: 'getNews',
      search: 'searchWeb',
      timer: 'setTimer',
      reminder: 'setReminder',
      habit: 'trackHabit',
      contact: 'reachOut',
      note: 'quickNote',
      handoff: 'handoff',
    };

    let toolId: string;
    if (intent.type === 'musicControl') {
      toolId = intent.musicAction === 'resume' ? 'resumeMusic' : intent.musicAction === 'stop' ? 'stopMusic' : 'pauseMusic';
    } else if (intent.type === 'time') {
      toolId = intent.city ? 'timeInCity' : 'getCurrentTime';
    } else if (intent.type === 'calendar') {
      toolId = intent.calendarDay === 'week' ? 'getCalendarWeek' : 'getCalendarToday';
    } else if (intent.type === 'smartHome') {
      toolId = intent.smartDevice === 'thermostat' ? 'setThermostat' : 'controlLight';
    } else {
      toolId = toolIdMap[intent.type] || 'unknown';
    }

    return {
      handled: true,
      toolId,
      confidence: intent.confidence,
      intent: intent.type,
      speechResponse: result.response,
    };
  }

  // Tool failed - let Gemini handle it
  log.warn(
    {
      intent: intent.type,
      error: result.error,
    },
    '⚠️ Direct routing: Tool failed, falling back to Gemini'
  );

  return {
    handled: false,
    confidence: intent.confidence,
    intent: intent.type,
    error: result.error,
  };
}

/**
 * Check if direct routing is enabled
 * Can be disabled via DIRECT_TOOL_ROUTING=false
 */
export function isDirectRoutingEnabled(): boolean {
  return process.env.DIRECT_TOOL_ROUTING !== 'false';
}
