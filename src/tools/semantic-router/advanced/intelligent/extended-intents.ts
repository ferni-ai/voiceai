/**
 * Extended Domain-Specific Intents
 *
 * Additional intents beyond the core Ferni intents:
 * - Weather queries
 * - Reminders & alarms
 * - Timers
 * - Voice memos & notes
 * - Spotify specifics (playlists, genres, moods)
 * - Search & information
 * - Location queries
 *
 * @module semantic-router/advanced/intelligent/extended-intents
 */

import type { Intent } from './intent-classifier.js';

// ============================================================================
// WEATHER INTENTS
// ============================================================================

export const WEATHER_INTENTS: Intent[] = [
  {
    id: 'weather.current',
    category: 'weather',
    action: 'check',
    name: 'Current Weather',
    patterns: [
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?weather/i,
      /^(?:how(?:'s| is)\s+)?(?:the\s+)?weather/i,
      /^(?:is\s+it\s+)?(?:going\s+to\s+)?(?:rain|snow|sunny|cold|hot|warm)/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:temperature|temp)/i,
      /^(?:do\s+i\s+)?need\s+(?:an?\s+)?(?:umbrella|jacket|coat)/i,
      /^weather\s+(?:today|tomorrow|this\s+week)/i,
      /^(?:what(?:'s| is)\s+)?(?:it\s+)?(?:like\s+)?outside/i,
    ],
    keywords: ['weather', 'temperature', 'rain', 'snow', 'sunny', 'cold', 'hot', 'forecast', 'umbrella'],
    requiredSlots: [],
    optionalSlots: ['location', 'datetime'],
    toolId: 'weather_check',
    priority: 10,
  },
  {
    id: 'weather.forecast',
    category: 'weather',
    action: 'forecast',
    name: 'Weather Forecast',
    patterns: [
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:weather\s+)?forecast/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?weather\s+(?:for\s+)?(?:this|next)\s+week/i,
      /^(?:will\s+it\s+)?(?:rain|snow)\s+(?:this|next)\s+(?:week|weekend)/i,
      /^(?:how(?:'s| is)\s+)?(?:the\s+)?weather\s+looking/i,
      /^(?:7|five|ten)\s*day\s+forecast/i,
    ],
    keywords: ['forecast', 'week', 'weekend', 'outlook', 'prediction'],
    requiredSlots: [],
    optionalSlots: ['location', 'datetime'],
    toolId: 'weather_forecast',
    priority: 8,
  },
];

// ============================================================================
// REMINDER INTENTS
// ============================================================================

export const REMINDER_INTENTS: Intent[] = [
  {
    id: 'reminder.set',
    category: 'reminder',
    action: 'set',
    name: 'Set Reminder',
    patterns: [
      /^(?:set\s+)?(?:a\s+)?reminder\s+(?:to\s+)?/i,
      /^remind\s+me\s+(?:to\s+)?/i,
      /^(?:don(?:'t| not)\s+)?let\s+me\s+forget\s+(?:to\s+)?/i,
      /^(?:i\s+need\s+)?(?:to\s+)?(?:be\s+)?remind(?:ed)?\s+(?:to\s+)?/i,
      /^(?:can\s+you\s+)?remind\s+me/i,
    ],
    keywords: ['remind', 'reminder', 'forget', 'remember', 'alert', 'notification'],
    requiredSlots: ['query'],
    optionalSlots: ['datetime', 'location'],
    toolId: 'reminder_set',
    priority: 12,
  },
  {
    id: 'reminder.list',
    category: 'reminder',
    action: 'list',
    name: 'List Reminders',
    patterns: [
      /^(?:what|show)\s+(?:are\s+)?(?:my\s+)?reminders?/i,
      /^(?:list|check)\s+(?:my\s+)?reminders?/i,
      /^(?:what\s+)?(?:do\s+i\s+have\s+)?(?:coming\s+up|scheduled)/i,
      /^(?:any\s+)?reminders?\s+(?:today|this\s+week)/i,
    ],
    keywords: ['reminders', 'list', 'show', 'upcoming', 'scheduled'],
    requiredSlots: [],
    optionalSlots: ['datetime'],
    toolId: 'reminder_list',
    priority: 8,
  },
  {
    id: 'reminder.cancel',
    category: 'reminder',
    action: 'cancel',
    name: 'Cancel Reminder',
    patterns: [
      /^(?:cancel|delete|remove)\s+(?:my\s+)?(?:the\s+)?reminder/i,
      /^(?:never\s+mind\s+)?(?:that\s+)?reminder/i,
      /^(?:i\s+)?(?:don(?:'t| not)\s+)?need\s+(?:that\s+)?reminder/i,
    ],
    keywords: ['cancel', 'delete', 'remove', 'clear', 'never mind'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'reminder_cancel',
    priority: 8,
  },
];

// ============================================================================
// TIMER & ALARM INTENTS
// ============================================================================

export const TIMER_INTENTS: Intent[] = [
  {
    id: 'timer.set',
    category: 'timer',
    action: 'set',
    name: 'Set Timer',
    patterns: [
      /^(?:set\s+)?(?:a\s+)?timer\s+(?:for\s+)?(\d+)\s*(?:minutes?|mins?|hours?|hrs?|seconds?|secs?)/i,
      /^(\d+)\s*(?:minute|min|hour|hr|second|sec)\s+timer/i,
      /^(?:start\s+)?(?:a\s+)?(?:countdown|timer)\s+(?:for\s+)?/i,
      /^(?:time\s+)?(?:me\s+)?(?:for\s+)?(\d+)\s*(?:minutes?|mins?)/i,
    ],
    keywords: ['timer', 'countdown', 'minutes', 'seconds', 'hours'],
    requiredSlots: ['duration'],
    optionalSlots: ['query'],
    toolId: 'timer_set',
    priority: 12,
  },
  {
    id: 'timer.check',
    category: 'timer',
    action: 'check',
    name: 'Check Timer',
    patterns: [
      /^(?:how\s+much\s+)?time\s+(?:is\s+)?(?:left|remaining)/i,
      /^(?:check|show)\s+(?:my\s+)?timer/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?timer\s+(?:at|status)/i,
      /^(?:how\s+long\s+)?(?:until\s+)?(?:the\s+)?timer/i,
    ],
    keywords: ['timer', 'remaining', 'left', 'status', 'check'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'timer_check',
    priority: 8,
  },
  {
    id: 'timer.cancel',
    category: 'timer',
    action: 'cancel',
    name: 'Cancel Timer',
    patterns: [
      /^(?:cancel|stop|clear)\s+(?:the\s+)?timer/i,
      /^(?:turn\s+off|end)\s+(?:the\s+)?timer/i,
      /^(?:never\s+mind\s+)?(?:the\s+)?timer/i,
    ],
    keywords: ['cancel', 'stop', 'clear', 'end', 'timer'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'timer_cancel',
    priority: 10,
  },
  {
    id: 'alarm.set',
    category: 'alarm',
    action: 'set',
    name: 'Set Alarm',
    patterns: [
      /^(?:set\s+)?(?:an?\s+)?alarm\s+(?:for\s+)?/i,
      /^wake\s+me\s+(?:up\s+)?(?:at\s+)?/i,
      /^(?:i\s+need\s+)?(?:to\s+)?(?:wake\s+up|get\s+up)\s+(?:at\s+)?/i,
    ],
    keywords: ['alarm', 'wake', 'morning', 'clock'],
    requiredSlots: ['datetime'],
    optionalSlots: ['query'],
    toolId: 'alarm_set',
    priority: 12,
  },
];

// ============================================================================
// VOICE MEMO & NOTES INTENTS
// ============================================================================

export const NOTES_INTENTS: Intent[] = [
  {
    id: 'voicememo.start',
    category: 'notes',
    action: 'record',
    name: 'Start Voice Memo',
    patterns: [
      /^(?:start\s+)?(?:a\s+)?voice\s+memo/i,
      /^(?:record|take)\s+(?:a\s+)?(?:voice\s+)?(?:memo|note|recording)/i,
      /^(?:i\s+want\s+to\s+)?(?:record|dictate)\s+(?:something|a\s+note)/i,
      /^(?:let\s+me\s+)?(?:record|dictate)/i,
    ],
    keywords: ['voice', 'memo', 'record', 'dictate', 'recording', 'note'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'voicememo_start',
    priority: 10,
  },
  {
    id: 'note.create',
    category: 'notes',
    action: 'create',
    name: 'Create Note',
    patterns: [
      /^(?:make|create|take|write)\s+(?:a\s+)?note/i,
      /^(?:add\s+)?(?:a\s+)?note\s+(?:that\s+)?/i,
      /^(?:jot|write)\s+(?:this\s+)?down/i,
      /^note\s+(?:to\s+)?(?:self|myself)/i,
    ],
    keywords: ['note', 'write', 'jot', 'create', 'add'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'note_create',
    priority: 10,
  },
  {
    id: 'note.search',
    category: 'notes',
    action: 'search',
    name: 'Search Notes',
    patterns: [
      /^(?:find|search)\s+(?:my\s+)?notes?\s+(?:about|for)/i,
      /^(?:what\s+)?(?:did\s+i\s+)?(?:note|write)\s+(?:about|down)/i,
      /^(?:show|list)\s+(?:my\s+)?notes?/i,
      /^(?:look\s+(?:up|for)\s+)?(?:my\s+)?notes?\s+(?:on|about)/i,
    ],
    keywords: ['notes', 'find', 'search', 'look', 'show'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'note_search',
    priority: 8,
  },
];

// ============================================================================
// SPOTIFY SPECIFIC INTENTS
// ============================================================================

export const SPOTIFY_INTENTS: Intent[] = [
  {
    id: 'spotify.playlist',
    category: 'music',
    action: 'playlist',
    name: 'Play Playlist',
    patterns: [
      /^play\s+(?:my\s+)?(?:playlist|mix)\s+/i,
      /^(?:put\s+on|start)\s+(?:my\s+)?(?:liked\s+songs|discover\s+weekly|release\s+radar)/i,
      /^play\s+(?:my\s+)?(?:liked|saved)\s+(?:songs|music)/i,
      /^shuffle\s+(?:my\s+)?(?:playlist|music|library)/i,
    ],
    keywords: ['playlist', 'liked', 'saved', 'discover', 'shuffle', 'mix', 'radar'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'spotify_playlist',
    priority: 12,
  },
  {
    id: 'spotify.genre',
    category: 'music',
    action: 'genre',
    name: 'Play Genre',
    patterns: [
      /^play\s+(?:some\s+)?(?:jazz|rock|pop|classical|hip\s*hop|r&b|country|electronic|indie|metal|folk|blues|reggae|latin|soul)/i,
      /^(?:put\s+on|i\s+want)\s+(?:some\s+)?(?:jazz|rock|pop|classical|hip\s*hop)/i,
      /^(?:play\s+)?(?:something\s+)?(?:jazzy|rocky|poppy|classical)/i,
    ],
    keywords: ['jazz', 'rock', 'pop', 'classical', 'hip hop', 'electronic', 'indie', 'country', 'folk', 'blues'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'spotify_genre',
    priority: 10,
  },
  {
    id: 'spotify.mood',
    category: 'music',
    action: 'mood',
    name: 'Play Mood',
    patterns: [
      /^play\s+(?:something\s+)?(?:relaxing|chill|upbeat|energetic|happy|sad|mellow|peaceful|motivating|focused)/i,
      /^(?:i\s+)?(?:want|need)\s+(?:something\s+)?(?:relaxing|chill|upbeat|energetic|calm)/i,
      /^(?:put\s+on\s+)?(?:some\s+)?(?:chill|relaxing|workout|focus|sleep)\s+music/i,
      /^(?:music\s+)?(?:for\s+)?(?:studying|working\s+out|sleeping|relaxing|focusing)/i,
    ],
    keywords: ['chill', 'relax', 'upbeat', 'energetic', 'calm', 'focus', 'workout', 'sleep', 'study'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'spotify_mood',
    priority: 10,
  },
  {
    id: 'spotify.artist',
    category: 'music',
    action: 'artist',
    name: 'Play Artist',
    patterns: [
      /^play\s+(?:some\s+)?(?:music\s+by|songs?\s+by|)\s*(.+)/i,
      /^(?:put\s+on|i\s+want\s+to\s+listen\s+to)\s+(.+)/i,
      /^(?:play\s+)?(?:more\s+)?(?:like|similar\s+to)\s+(.+)/i,
    ],
    keywords: ['artist', 'band', 'singer', 'musician', 'by'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'spotify_artist',
    priority: 8,
  },
  {
    id: 'spotify.nowplaying',
    category: 'music',
    action: 'info',
    name: 'Now Playing',
    patterns: [
      /^(?:what(?:'s| is)\s+)?(?:this\s+)?(?:song|playing|track)/i,
      /^(?:who(?:'s| is)\s+)?(?:this|singing|the\s+artist)/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:name\s+of\s+)?(?:this\s+)?song/i,
      /^(?:tell\s+me\s+)?(?:about\s+)?(?:this\s+)?(?:song|track)/i,
    ],
    keywords: ['song', 'playing', 'track', 'artist', 'who', 'name'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'spotify_nowplaying',
    priority: 8,
  },
  {
    id: 'spotify.like',
    category: 'music',
    action: 'like',
    name: 'Like Song',
    patterns: [
      /^(?:like|love|save)\s+(?:this\s+)?(?:song|track)/i,
      /^(?:add\s+)?(?:this\s+)?(?:to\s+)?(?:my\s+)?(?:liked|saved|favorites?)/i,
      /^(?:i\s+)?(?:like|love)\s+(?:this\s+)?(?:song|one)/i,
    ],
    keywords: ['like', 'love', 'save', 'favorite', 'add'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'spotify_like',
    priority: 10,
  },
  {
    id: 'spotify.volume',
    category: 'music',
    action: 'volume',
    name: 'Adjust Volume',
    patterns: [
      /^(?:turn\s+)?(?:the\s+)?(?:volume|music)\s+(?:up|down)/i,
      /^(?:louder|quieter|softer)/i,
      /^(?:set\s+)?(?:the\s+)?volume\s+(?:to\s+)?(\d+)/i,
      /^(?:volume\s+)?(?:at\s+)?(\d+)\s*(?:percent)?/i,
    ],
    keywords: ['volume', 'louder', 'quieter', 'softer', 'turn', 'up', 'down'],
    requiredSlots: [],
    optionalSlots: ['level'],
    toolId: 'spotify_volume',
    priority: 10,
  },
];

// ============================================================================
// SEARCH & INFORMATION INTENTS
// ============================================================================

export const SEARCH_INTENTS: Intent[] = [
  {
    id: 'search.web',
    category: 'search',
    action: 'search',
    name: 'Web Search',
    patterns: [
      /^(?:search|google|look\s+up)\s+(?:for\s+)?/i,
      /^(?:what\s+is|what(?:'s| is)|who\s+is|who(?:'s| is))\s+/i,
      /^(?:find\s+)?(?:information|info)\s+(?:about|on)/i,
      /^(?:tell\s+me\s+)?(?:about|more\s+about)/i,
    ],
    keywords: ['search', 'google', 'find', 'look', 'information', 'what', 'who'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'search_web',
    priority: 6,
  },
  {
    id: 'search.news',
    category: 'search',
    action: 'news',
    name: 'News Search',
    patterns: [
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:latest\s+)?news/i,
      /^(?:any\s+)?news\s+(?:about|on)/i,
      /^(?:what(?:'s| is)\s+)?happening\s+(?:in\s+)?(?:the\s+)?world/i,
      /^(?:headlines|top\s+stories)/i,
    ],
    keywords: ['news', 'headlines', 'happening', 'latest', 'stories', 'current events'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'news_search',
    priority: 8,
  },
  {
    id: 'search.definition',
    category: 'search',
    action: 'define',
    name: 'Definition',
    patterns: [
      /^(?:what\s+)?(?:does\s+)?(.+)\s+mean/i,
      /^define\s+(.+)/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?definition\s+(?:of\s+)?/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?meaning\s+(?:of\s+)?/i,
    ],
    keywords: ['define', 'definition', 'meaning', 'mean', 'what is'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'search_define',
    priority: 8,
  },
];

// ============================================================================
// LOCATION INTENTS
// ============================================================================

export const LOCATION_INTENTS: Intent[] = [
  {
    id: 'location.find',
    category: 'location',
    action: 'find',
    name: 'Find Location',
    patterns: [
      /^(?:find|locate|where\s+is)\s+(?:the\s+)?(?:nearest|closest)\s+/i,
      /^(?:where\s+)?(?:can\s+i\s+)?(?:find|get)\s+/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:address|location)\s+(?:of|for)/i,
      /^(?:how\s+)?(?:do\s+i\s+)?(?:get\s+)?(?:to\s+)?/i,
    ],
    keywords: ['find', 'nearest', 'closest', 'where', 'location', 'address', 'directions'],
    requiredSlots: ['query'],
    optionalSlots: ['location'],
    toolId: 'location_find',
    priority: 8,
  },
  {
    id: 'location.directions',
    category: 'location',
    action: 'directions',
    name: 'Get Directions',
    patterns: [
      /^(?:get\s+)?directions\s+(?:to\s+)?/i,
      /^(?:how\s+)?(?:do\s+i\s+)?(?:get\s+)?(?:to\s+)?/i,
      /^(?:navigate|take\s+me)\s+(?:to\s+)?/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:best\s+)?(?:way|route)\s+(?:to\s+)?/i,
    ],
    keywords: ['directions', 'navigate', 'route', 'way', 'get to', 'take me'],
    requiredSlots: ['query'],
    optionalSlots: ['location'],
    toolId: 'location_directions',
    priority: 10,
  },
];

// ============================================================================
// DATE & TIME INTENTS
// ============================================================================

export const DATETIME_INTENTS: Intent[] = [
  {
    id: 'datetime.time',
    category: 'datetime',
    action: 'check',
    name: 'Check Time',
    patterns: [
      /^(?:what\s+)?time\s+(?:is\s+)?it/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:current\s+)?time/i,
      /^(?:what\s+)?time\s+(?:is\s+it\s+)?(?:in\s+)?/i,
    ],
    keywords: ['time', 'clock', 'hour'],
    requiredSlots: [],
    optionalSlots: ['location'],
    toolId: 'datetime_time',
    priority: 8,
  },
  {
    id: 'datetime.date',
    category: 'datetime',
    action: 'check',
    name: 'Check Date',
    patterns: [
      /^(?:what\s+)?(?:is\s+)?(?:the\s+)?date/i,
      /^(?:what(?:'s| is)\s+)?(?:today(?:'s| is)\s+)?date/i,
      /^(?:what\s+)?day\s+(?:is\s+)?(?:it|today)/i,
      /^(?:when\s+is\s+)?(?:christmas|thanksgiving|easter|new\s+year)/i,
    ],
    keywords: ['date', 'day', 'today', 'tomorrow', 'when'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'datetime_date',
    priority: 8,
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

/**
 * All extended intents
 */
export const EXTENDED_INTENTS: Intent[] = [
  ...WEATHER_INTENTS,
  ...REMINDER_INTENTS,
  ...TIMER_INTENTS,
  ...NOTES_INTENTS,
  ...SPOTIFY_INTENTS,
  ...SEARCH_INTENTS,
  ...LOCATION_INTENTS,
  ...DATETIME_INTENTS,
];

/**
 * Get all intents including extended ones
 */
export function getAllExtendedIntents(): Intent[] {
  return EXTENDED_INTENTS;
}

/**
 * Get intents by category
 */
export function getIntentsByCategory(category: string): Intent[] {
  return EXTENDED_INTENTS.filter((i) => i.category === category);
}

