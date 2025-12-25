/**
 * Ferni-Specific Intent Definitions
 *
 * Comprehensive intent patterns for the Ferni voice agent including:
 * - Persona handoffs (Ferni, Maya, Peter, Alex, Jordan, Nayan)
 * - Habit tracking (Maya's specialty)
 * - Research & finance (Peter's specialty)
 * - Calendar & communication (Alex's specialty)
 * - Life planning & events (Jordan's specialty)
 * - Wisdom & philosophy (Nayan's specialty)
 * - Common tools (music, weather, reminders, etc.)
 *
 * @module semantic-router/advanced/intelligent/ferni-intents
 */

import type { Intent } from './intent-classifier.js';

// ============================================================================
// PERSONA HANDOFFS
// ============================================================================

export const PERSONA_HANDOFF_INTENTS: Intent[] = [
  // Ferni (Life Coach - Default)
  {
    id: 'handoff.ferni',
    category: 'handoff',
    action: 'transfer',
    name: 'Talk to Ferni',
    patterns: [
      /^(?:talk|speak|switch|go\s+back?)\s+to\s+ferni/i,
      /^(?:let\s+me\s+)?(?:talk|speak)\s+(?:with|to)\s+ferni/i,
      /^(?:i\s+)?(?:want|need)\s+(?:to\s+)?(?:talk|speak)\s+(?:with|to)\s+ferni/i,
      /^(?:can\s+i\s+)?(?:talk|speak)\s+(?:with|to)\s+ferni/i,
      /^(?:transfer|hand\s+(?:me\s+)?off?)\s+(?:to\s+)?ferni/i,
      /^back\s+to\s+ferni/i,
    ],
    keywords: ['ferni', 'life coach', 'main', 'back', 'default'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'handoff_ferni',
    priority: 15,
  },

  // Maya (Habits & Routines Coach)
  {
    id: 'handoff.maya',
    category: 'handoff',
    action: 'transfer',
    name: 'Talk to Maya',
    patterns: [
      /^(?:talk|speak|switch)\s+to\s+maya/i,
      /^(?:let\s+me\s+)?(?:talk|speak)\s+(?:with|to)\s+maya/i,
      /^(?:i\s+)?(?:want|need)\s+(?:to\s+)?(?:talk|speak)\s+(?:with|to)\s+maya/i,
      /^maya\s+can\s+help/i,
      /^(?:transfer|hand\s+(?:me\s+)?off?)\s+(?:to\s+)?maya/i,
      /^(?:i\s+need\s+)?help\s+with\s+(?:my\s+)?(?:habits?|routines?)/i,
    ],
    keywords: ['maya', 'habits', 'routines', 'daily', 'morning', 'evening', 'rituals', 'consistency'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'handoff_maya',
    priority: 15,
  },

  // Peter (Research & Finance)
  {
    id: 'handoff.peter',
    category: 'handoff',
    action: 'transfer',
    name: 'Talk to Peter',
    patterns: [
      /^(?:talk|speak|switch)\s+to\s+peter/i,
      /^(?:let\s+me\s+)?(?:talk|speak)\s+(?:with|to)\s+peter/i,
      /^(?:i\s+)?(?:want|need)\s+(?:to\s+)?(?:talk|speak)\s+(?:with|to)\s+peter/i,
      /^peter\s+can\s+help/i,
      /^(?:transfer|hand\s+(?:me\s+)?off?)\s+(?:to\s+)?peter/i,
      /^(?:i\s+need\s+)?help\s+with\s+(?:my\s+)?(?:finances?|investing|stocks?|research)/i,
    ],
    keywords: ['peter', 'research', 'finance', 'stocks', 'investing', 'money', 'market', 'analysis'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'handoff_peter',
    priority: 15,
  },

  // Alex (Communication & Calendar)
  {
    id: 'handoff.alex',
    category: 'handoff',
    action: 'transfer',
    name: 'Talk to Alex',
    patterns: [
      /^(?:talk|speak|switch)\s+to\s+alex/i,
      /^(?:let\s+me\s+)?(?:talk|speak)\s+(?:with|to)\s+alex/i,
      /^(?:i\s+)?(?:want|need)\s+(?:to\s+)?(?:talk|speak)\s+(?:with|to)\s+alex/i,
      /^alex\s+can\s+help/i,
      /^(?:transfer|hand\s+(?:me\s+)?off?)\s+(?:to\s+)?alex/i,
      /^(?:i\s+need\s+)?help\s+with\s+(?:my\s+)?(?:calendar|schedule|emails?|communication)/i,
    ],
    keywords: ['alex', 'calendar', 'schedule', 'email', 'communication', 'meetings', 'appointments'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'handoff_alex',
    priority: 15,
  },

  // Jordan (Life Planning & Events)
  {
    id: 'handoff.jordan',
    category: 'handoff',
    action: 'transfer',
    name: 'Talk to Jordan',
    patterns: [
      /^(?:talk|speak|switch)\s+to\s+jordan/i,
      /^(?:let\s+me\s+)?(?:talk|speak)\s+(?:with|to)\s+jordan/i,
      /^(?:i\s+)?(?:want|need)\s+(?:to\s+)?(?:talk|speak)\s+(?:with|to)\s+jordan/i,
      /^jordan\s+can\s+help/i,
      /^(?:transfer|hand\s+(?:me\s+)?off?)\s+(?:to\s+)?jordan/i,
      /^(?:i\s+need\s+)?help\s+(?:planning|organizing)\s+(?:an?\s+)?(?:event|party|trip|milestone)/i,
    ],
    keywords: ['jordan', 'planning', 'events', 'party', 'milestone', 'goals', 'trip', 'celebration'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'handoff_jordan',
    priority: 15,
  },

  // Nayan (Wisdom & Philosophy)
  {
    id: 'handoff.nayan',
    category: 'handoff',
    action: 'transfer',
    name: 'Talk to Nayan',
    patterns: [
      /^(?:talk|speak|switch)\s+to\s+nayan/i,
      /^(?:let\s+me\s+)?(?:talk|speak)\s+(?:with|to)\s+nayan/i,
      /^(?:i\s+)?(?:want|need)\s+(?:to\s+)?(?:talk|speak)\s+(?:with|to)\s+nayan/i,
      /^nayan\s+can\s+help/i,
      /^(?:transfer|hand\s+(?:me\s+)?off?)\s+(?:to\s+)?nayan/i,
      /^(?:i\s+need\s+)?(?:some\s+)?(?:wisdom|philosophy|perspective|meaning)/i,
      /^(?:what(?:'s| is)\s+the\s+meaning\s+of)/i,
    ],
    keywords: ['nayan', 'wisdom', 'philosophy', 'meaning', 'purpose', 'perspective', 'deep', 'life'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'handoff_nayan',
    priority: 15,
  },
];

// ============================================================================
// HABIT TRACKING (Maya's Domain)
// ============================================================================

export const HABIT_INTENTS: Intent[] = [
  {
    id: 'habits.log',
    category: 'habits',
    action: 'log',
    name: 'Log Habit',
    patterns: [
      /^(?:i\s+)?(?:just\s+)?(?:did|completed|finished)\s+(?:my\s+)?(?:workout|exercise|meditation|yoga|journaling|reading)/i,
      /^(?:i\s+)?(?:just\s+)?(?:worked\s+out|exercised|meditated|stretched)/i,
      /^log\s+(?:my\s+)?(?:habit|workout|exercise|meditation)/i,
      /^track\s+(?:my\s+)?(?:habit|workout|exercise)/i,
      /^mark\s+(?:my\s+)?(?:\w+)\s+(?:as\s+)?(?:done|complete)/i,
    ],
    keywords: ['habit', 'log', 'track', 'completed', 'did', 'finished', 'workout', 'exercise', 'meditation'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'habit_log',
    priority: 10,
  },
  {
    id: 'habits.check',
    category: 'habits',
    action: 'check',
    name: 'Check Habits',
    patterns: [
      /^(?:how(?:'s| is)\s+)?(?:my\s+)?habit\s+(?:progress|streak)/i,
      /^(?:what|which)\s+habits?\s+(?:have\s+i|did\s+i)\s+(?:done|complete)/i,
      /^(?:show|check)\s+(?:my\s+)?habits?/i,
      /^(?:what(?:'s| is)\s+)?my\s+streak/i,
    ],
    keywords: ['habits', 'streak', 'progress', 'check', 'show', 'how'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'habit_check',
    priority: 8,
  },
  {
    id: 'habits.create',
    category: 'habits',
    action: 'create',
    name: 'Create Habit',
    patterns: [
      /^(?:i\s+want\s+to\s+)?(?:start|begin|create)\s+(?:a\s+)?(?:new\s+)?habit/i,
      /^(?:help\s+me\s+)?(?:build|develop|form)\s+(?:a\s+)?habit/i,
      /^(?:add|create)\s+(?:a\s+)?(?:new\s+)?habit/i,
    ],
    keywords: ['habit', 'start', 'create', 'new', 'build', 'develop', 'form'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'habit_create',
    priority: 8,
  },
  {
    id: 'habits.routine',
    category: 'habits',
    action: 'routine',
    name: 'Morning/Evening Routine',
    patterns: [
      /^(?:start|begin)\s+(?:my\s+)?(?:morning|evening|night|bedtime)\s+routine/i,
      /^(?:let(?:'s| us)\s+)?(?:do|start)\s+(?:my\s+)?routine/i,
      /^(?:morning|evening|night)\s+routine/i,
      /^(?:what(?:'s| is)\s+)?(?:my\s+)?(?:morning|evening)\s+routine/i,
    ],
    keywords: ['routine', 'morning', 'evening', 'night', 'bedtime', 'ritual'],
    requiredSlots: [],
    optionalSlots: ['datetime'],
    toolId: 'habit_routine',
    priority: 10,
  },
];

// ============================================================================
// FINANCE & RESEARCH (Peter's Domain)
// ============================================================================

export const FINANCE_INTENTS: Intent[] = [
  {
    id: 'finance.stock_check',
    category: 'finance',
    action: 'check',
    name: 'Check Stock',
    patterns: [
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:stock\s+)?price\s+(?:of|for)\s+(\w+)/i,
      /^(?:how(?:'s| is)\s+)?(\w+)\s+(?:stock\s+)?(?:doing|performing)/i,
      /^(?:check|look\s+up)\s+(?:the\s+)?(?:stock\s+)?(\w+)/i,
      /^(\w+)\s+stock\s+(?:price|quote)/i,
    ],
    keywords: ['stock', 'price', 'quote', 'market', 'check', 'look'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'stock_check',
    priority: 10,
  },
  {
    id: 'finance.portfolio',
    category: 'finance',
    action: 'check',
    name: 'Check Portfolio',
    patterns: [
      /^(?:how(?:'s| is)\s+)?(?:my\s+)?portfolio/i,
      /^(?:check|show)\s+(?:my\s+)?(?:portfolio|investments?)/i,
      /^(?:what(?:'s| is)\s+)?(?:my\s+)?(?:portfolio|investment)\s+(?:value|worth)/i,
    ],
    keywords: ['portfolio', 'investments', 'check', 'show', 'worth', 'value'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'portfolio_check',
    priority: 8,
  },
  {
    id: 'finance.budget',
    category: 'finance',
    action: 'check',
    name: 'Check Budget',
    patterns: [
      /^(?:how(?:'s| is)\s+)?(?:my\s+)?budget/i,
      /^(?:check|show)\s+(?:my\s+)?(?:budget|spending)/i,
      /^(?:how\s+much\s+)?(?:have\s+i|did\s+i)\s+(?:spend|spent)/i,
      /^(?:what(?:'s| is)\s+)?(?:my\s+)?(?:spending|budget)\s+(?:like|status)/i,
    ],
    keywords: ['budget', 'spending', 'money', 'spent', 'check', 'show'],
    requiredSlots: [],
    optionalSlots: ['datetime'],
    toolId: 'budget_check',
    priority: 8,
  },
];

// ============================================================================
// CALENDAR & COMMUNICATION (Alex's Domain)
// ============================================================================

export const CALENDAR_INTENTS: Intent[] = [
  {
    id: 'calendar.check',
    category: 'calendar',
    action: 'check',
    name: 'Check Calendar',
    patterns: [
      /^(?:what(?:'s| is)\s+)?(?:on\s+)?(?:my\s+)?(?:calendar|schedule)/i,
      /^(?:what|do\s+i)\s+have\s+(?:on|today|tomorrow|this\s+week)/i,
      /^(?:show|check)\s+(?:my\s+)?(?:calendar|schedule)/i,
      /^(?:am\s+i\s+)?(?:free|busy)\s+(?:today|tomorrow|on\s+\w+)/i,
      /^(?:what(?:'s| is)\s+)?(?:my\s+)?(?:next\s+)?(?:meeting|appointment)/i,
    ],
    keywords: ['calendar', 'schedule', 'meeting', 'appointment', 'free', 'busy', 'event'],
    requiredSlots: [],
    optionalSlots: ['datetime'],
    toolId: 'calendar_check',
    priority: 10,
  },
  {
    id: 'calendar.create',
    category: 'calendar',
    action: 'create',
    name: 'Create Event',
    patterns: [
      /^(?:add|create|schedule|put)\s+(?:a\s+)?(?:meeting|event|appointment)/i,
      /^(?:schedule|book)\s+(?:a\s+)?(?:time|slot)\s+(?:with|for)/i,
      /^(?:put|add)\s+(?:it\s+)?(?:on|in)\s+(?:my\s+)?calendar/i,
      /^(?:set\s+up|arrange)\s+(?:a\s+)?(?:meeting|call)\s+(?:with|for)/i,
    ],
    keywords: ['calendar', 'schedule', 'meeting', 'event', 'appointment', 'create', 'add', 'book'],
    requiredSlots: ['query'],
    optionalSlots: ['datetime', 'person', 'duration'],
    toolId: 'calendar_create',
    priority: 10,
  },
  {
    id: 'communication.email',
    category: 'communication',
    action: 'compose',
    name: 'Compose Email',
    patterns: [
      /^(?:send|write|compose)\s+(?:an?\s+)?email\s+(?:to\s+)?(\w+)?/i,
      /^(?:email|message)\s+(\w+)/i,
      /^(?:draft|write)\s+(?:an?\s+)?(?:email|message)\s+(?:to|for)/i,
    ],
    keywords: ['email', 'send', 'write', 'compose', 'message', 'draft'],
    requiredSlots: [],
    optionalSlots: ['contact', 'query'],
    toolId: 'email_compose',
    priority: 8,
  },
  {
    id: 'communication.text',
    category: 'communication',
    action: 'send',
    name: 'Send Text',
    patterns: [
      /^(?:send\s+)?(?:a\s+)?text\s+(?:to\s+)?(\w+)/i,
      /^(?:text|message)\s+(\w+)/i,
      /^(?:sms|text)\s+(?:to\s+)?(\w+)/i,
    ],
    keywords: ['text', 'message', 'sms', 'send'],
    requiredSlots: ['contact'],
    optionalSlots: ['query'],
    toolId: 'text_send',
    priority: 10,
  },
];

// ============================================================================
// LIFE PLANNING (Jordan's Domain)
// ============================================================================

export const PLANNING_INTENTS: Intent[] = [
  {
    id: 'planning.goal',
    category: 'planning',
    action: 'set',
    name: 'Set Goal',
    patterns: [
      /^(?:i\s+want\s+to\s+)?(?:set|create)\s+(?:a\s+)?(?:new\s+)?goal/i,
      /^(?:my\s+)?goal\s+is\s+(?:to\s+)?/i,
      /^(?:help\s+me\s+)?(?:set|define|clarify)\s+(?:my\s+)?goals?/i,
      /^(?:what\s+should\s+)?(?:my\s+)?goals?\s+(?:be|look\s+like)/i,
    ],
    keywords: ['goal', 'goals', 'set', 'create', 'achieve', 'target', 'objective'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'goal_set',
    priority: 8,
  },
  {
    id: 'planning.milestone',
    category: 'planning',
    action: 'track',
    name: 'Track Milestone',
    patterns: [
      /^(?:track|record|celebrate)\s+(?:a\s+)?(?:milestone|achievement)/i,
      /^(?:i\s+)?(?:achieved|accomplished|reached)\s+(?:a\s+)?/i,
      /^(?:mark|log)\s+(?:my\s+)?(?:milestone|achievement)/i,
    ],
    keywords: ['milestone', 'achievement', 'track', 'celebrate', 'accomplished', 'reached'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'milestone_track',
    priority: 8,
  },
  {
    id: 'planning.event',
    category: 'planning',
    action: 'plan',
    name: 'Plan Event',
    patterns: [
      /^(?:help\s+me\s+)?(?:plan|organize)\s+(?:a\s+)?(?:party|event|celebration|trip)/i,
      /^(?:i(?:'m| am)\s+)?(?:planning|organizing)\s+(?:a\s+)?/i,
      /^(?:let(?:'s| us)\s+)?plan\s+(?:a\s+)?/i,
    ],
    keywords: ['plan', 'event', 'party', 'celebration', 'trip', 'organize', 'birthday', 'wedding'],
    requiredSlots: ['query'],
    optionalSlots: ['datetime', 'location'],
    toolId: 'event_plan',
    priority: 8,
  },
];

// ============================================================================
// WISDOM & PHILOSOPHY (Nayan's Domain)
// ============================================================================

export const WISDOM_INTENTS: Intent[] = [
  {
    id: 'wisdom.quote',
    category: 'wisdom',
    action: 'get',
    name: 'Get Quote',
    patterns: [
      /^(?:give\s+me\s+)?(?:a\s+)?(?:quote|saying|proverb)/i,
      /^(?:what(?:'s| is)\s+)?(?:a\s+)?(?:good|inspiring|motivating)\s+quote/i,
      /^(?:inspire|motivate)\s+me/i,
      /^(?:i\s+need\s+)?(?:some\s+)?(?:inspiration|motivation|wisdom)/i,
    ],
    keywords: ['quote', 'wisdom', 'inspiration', 'motivate', 'inspire', 'saying', 'proverb'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'quote_get',
    priority: 8,
  },
  {
    id: 'wisdom.reflection',
    category: 'wisdom',
    action: 'reflect',
    name: 'Deep Reflection',
    patterns: [
      /^(?:help\s+me\s+)?(?:reflect|think)\s+(?:on|about)/i,
      /^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:meaning|purpose)\s+of/i,
      /^(?:i(?:'m| am)\s+)?(?:thinking|wondering|questioning)\s+(?:about\s+)?/i,
      /^(?:let(?:'s| us)\s+)?(?:think|reflect)\s+(?:deeply\s+)?(?:about|on)/i,
    ],
    keywords: ['reflect', 'meaning', 'purpose', 'think', 'ponder', 'question', 'wonder'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'reflection_guide',
    priority: 8,
  },
  {
    id: 'wisdom.gratitude',
    category: 'wisdom',
    action: 'practice',
    name: 'Gratitude Practice',
    patterns: [
      /^(?:i(?:'m| am)\s+)?(?:grateful|thankful)\s+(?:for\s+)?/i,
      /^(?:let(?:'s| us)\s+)?(?:practice|do)\s+(?:some\s+)?gratitude/i,
      /^(?:what\s+should\s+)?(?:i\s+)?(?:be\s+)?grateful\s+for/i,
      /^(?:gratitude|thankfulness)\s+(?:practice|exercise)/i,
    ],
    keywords: ['grateful', 'thankful', 'gratitude', 'appreciate', 'blessing'],
    requiredSlots: [],
    optionalSlots: ['query'],
    toolId: 'gratitude_practice',
    priority: 8,
  },
];

// ============================================================================
// EMOTIONAL SUPPORT
// ============================================================================

export const EMOTIONAL_INTENTS: Intent[] = [
  {
    id: 'emotion.stressed',
    category: 'emotion',
    action: 'support',
    name: 'Stress Support',
    patterns: [
      /^(?:i(?:'m| am)\s+)?(?:feeling\s+)?(?:stressed|overwhelmed|anxious)/i,
      /^(?:i\s+)?(?:have|feel)\s+(?:so\s+much\s+)?(?:stress|anxiety)/i,
      /^(?:help\s+me\s+)?(?:with\s+)?(?:my\s+)?(?:stress|anxiety)/i,
      /^(?:i\s+)?(?:can(?:'t| not)\s+)?(?:cope|handle|deal)/i,
    ],
    keywords: ['stressed', 'stress', 'anxious', 'anxiety', 'overwhelmed', 'cope', 'handle'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'stress_support',
    priority: 12,
  },
  {
    id: 'emotion.sad',
    category: 'emotion',
    action: 'support',
    name: 'Sadness Support',
    patterns: [
      /^(?:i(?:'m| am)\s+)?(?:feeling\s+)?(?:sad|down|depressed|low)/i,
      /^(?:i\s+)?(?:feel\s+)?(?:really\s+)?(?:unhappy|blue|gloomy)/i,
      /^(?:i(?:'m| am)\s+)?(?:having\s+a\s+)?(?:bad|rough|hard)\s+(?:day|time)/i,
    ],
    keywords: ['sad', 'down', 'depressed', 'unhappy', 'low', 'blue', 'rough'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'sadness_support',
    priority: 12,
  },
  {
    id: 'emotion.happy',
    category: 'emotion',
    action: 'celebrate',
    name: 'Celebration',
    patterns: [
      /^(?:i(?:'m| am)\s+)?(?:feeling\s+)?(?:great|amazing|wonderful|fantastic|happy)/i,
      /^(?:i\s+)?(?:feel\s+)?(?:so\s+)?(?:good|excited|pumped)/i,
      /^(?:guess\s+what|you\s+won(?:'t| not)\s+believe)/i,
      /^(?:i\s+)?(?:did\s+it|made\s+it|got\s+(?:it|the\s+job))/i,
    ],
    keywords: ['happy', 'great', 'excited', 'wonderful', 'amazing', 'celebrate', 'good news'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'celebration_support',
    priority: 8,
  },
  {
    id: 'emotion.angry',
    category: 'emotion',
    action: 'support',
    name: 'Anger Support',
    patterns: [
      /^(?:i(?:'m| am)\s+)?(?:feeling\s+)?(?:angry|furious|mad|frustrated)/i,
      /^(?:i\s+)?(?:feel\s+)?(?:so\s+)?(?:pissed|annoyed|irritated)/i,
      /^(?:this\s+)?(?:makes\s+me\s+)?(?:so\s+)?(?:angry|mad)/i,
    ],
    keywords: ['angry', 'mad', 'furious', 'frustrated', 'annoyed', 'pissed', 'irritated'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'anger_support',
    priority: 12,
  },
];

// ============================================================================
// CRISIS & SAFETY
// ============================================================================

export const CRISIS_INTENTS: Intent[] = [
  {
    id: 'crisis.help',
    category: 'crisis',
    action: 'help',
    name: 'Crisis Help',
    patterns: [
      /^(?:i\s+)?(?:need\s+)?(?:urgent\s+)?(?:help|assistance)/i,
      /^(?:i(?:'m| am)\s+)?(?:in\s+)?(?:crisis|danger|trouble)/i,
      /^(?:call|get)\s+(?:me\s+)?(?:help|emergency)/i,
      /^(?:i(?:'m| am)\s+)?(?:not\s+)?(?:safe|okay)/i,
      /^(?:i\s+)?(?:want|need)\s+to\s+(?:hurt|harm)\s+myself/i,
      /^(?:i(?:'m| am)\s+)?(?:thinking\s+(?:about|of)\s+)?(?:suicide|killing\s+myself)/i,
    ],
    keywords: ['crisis', 'help', 'emergency', 'danger', 'hurt', 'harm', 'suicide', 'unsafe'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'crisis_help',
    priority: 20, // Highest priority
  },
];

// ============================================================================
// MUSIC & ENTERTAINMENT
// ============================================================================

export const MUSIC_INTENTS: Intent[] = [
  {
    id: 'music.play',
    category: 'music',
    action: 'play',
    name: 'Play Music',
    patterns: [
      /^play\s+(?:some\s+)?(?:music|song|songs|tunes?)/i,
      /^play\s+(?:some\s+)?(\w+)\s+(?:music|song)/i,
      /^put\s+on\s+(?:some\s+)?(?:music|song)/i,
      /^(?:i\s+)?(?:want|need)\s+(?:some\s+)?music/i,
      /^(?:let(?:'s| us)\s+)?listen\s+to\s+(?:some\s+)?/i,
      /^(?:can\s+you\s+)?play\s+(?:me\s+)?(?:some|a)\s+/i,
    ],
    keywords: ['play', 'music', 'song', 'listen', 'spotify', 'tunes', 'jam'],
    requiredSlots: [],
    optionalSlots: ['genre', 'mood', 'query'],
    toolId: 'spotify_play',
    priority: 12,
  },
  {
    id: 'music.pause',
    category: 'music',
    action: 'pause',
    name: 'Pause Music',
    patterns: [
      /^(?:pause|stop)\s+(?:the\s+)?music/i,
      /^stop\s+playing/i,
      /^(?:turn\s+)?(?:the\s+)?music\s+off/i,
    ],
    keywords: ['pause', 'stop', 'music', 'off'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'spotify_pause',
    priority: 12,
  },
  {
    id: 'music.skip',
    category: 'music',
    action: 'skip',
    name: 'Skip Song',
    patterns: [
      /^(?:skip|next)\s+(?:this\s+)?(?:song|track)/i,
      /^(?:play\s+)?(?:the\s+)?next\s+(?:song|one|track)/i,
      /^(?:i\s+)?(?:don(?:'t| not)\s+)?like\s+this\s+(?:song|one)/i,
    ],
    keywords: ['skip', 'next', 'song', 'track'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: 'spotify_skip',
    priority: 10,
  },
];

// ============================================================================
// MEMORY & NOTES
// ============================================================================

export const MEMORY_INTENTS: Intent[] = [
  {
    id: 'memory.remember',
    category: 'memory',
    action: 'store',
    name: 'Remember Something',
    patterns: [
      /^remember\s+(?:that\s+)?/i,
      /^(?:don(?:'t| not)\s+)?(?:let\s+me\s+)?forget\s+(?:that\s+)?/i,
      /^(?:make\s+a\s+)?(?:note|memo)\s+(?:that\s+)?/i,
      /^(?:save|store)\s+(?:this|that)/i,
      /^(?:i\s+)?(?:want|need)\s+(?:to\s+)?remember/i,
    ],
    keywords: ['remember', 'forget', 'note', 'memo', 'save', 'store'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'memory_store',
    priority: 10,
  },
  {
    id: 'memory.recall',
    category: 'memory',
    action: 'recall',
    name: 'Recall Memory',
    patterns: [
      /^(?:what\s+)?(?:did\s+i\s+)?(?:say|tell\s+you)\s+about/i,
      /^(?:do\s+you\s+)?remember\s+(?:when|what|that)/i,
      /^(?:what(?:'s| is)\s+)?(?:that\s+thing\s+)?(?:i\s+)?(?:said|mentioned)\s+about/i,
      /^(?:remind\s+me\s+)?what\s+(?:i\s+)?(?:said|told\s+you)/i,
    ],
    keywords: ['remember', 'recall', 'said', 'mentioned', 'told'],
    requiredSlots: ['query'],
    optionalSlots: [],
    toolId: 'memory_recall',
    priority: 8,
  },
];

// ============================================================================
// SMALL TALK
// ============================================================================

export const SMALLTALK_INTENTS: Intent[] = [
  {
    id: 'smalltalk.greeting',
    category: 'smalltalk',
    action: 'greeting',
    name: 'Greeting',
    patterns: [
      /^(?:hi|hello|hey|howdy|yo)\s*(?:there)?$/i,
      /^good\s+(?:morning|afternoon|evening|night)$/i,
      /^(?:what(?:'s| is)\s+)?up\??$/i,
      /^(?:how(?:'s| is)\s+it\s+going|how\s+are\s+you)/i,
    ],
    keywords: ['hi', 'hello', 'hey', 'morning', 'afternoon', 'evening', 'howdy'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: '__conversation__',
    priority: 3,
  },
  {
    id: 'smalltalk.thanks',
    category: 'smalltalk',
    action: 'thanks',
    name: 'Thanks',
    patterns: [
      /^(?:thanks?|thank\s+you)\s*(?:so\s+much)?$/i,
      /^(?:i\s+)?(?:really\s+)?appreciate\s+(?:it|that|you)$/i,
      /^(?:that(?:'s| is)\s+)?(?:great|awesome|perfect|wonderful|amazing)$/i,
    ],
    keywords: ['thank', 'thanks', 'appreciate', 'great', 'awesome', 'perfect'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: '__conversation__',
    priority: 3,
  },
  {
    id: 'smalltalk.goodbye',
    category: 'smalltalk',
    action: 'goodbye',
    name: 'Goodbye',
    patterns: [
      /^(?:bye|goodbye|see\s+you|later|take\s+care)\s*$/i,
      /^(?:i(?:'ve| have)\s+)?(?:got\s+to\s+)?go\s*$/i,
      /^(?:good)?night$/i,
      /^(?:talk\s+to\s+you\s+)?later$/i,
    ],
    keywords: ['bye', 'goodbye', 'later', 'night', 'care'],
    requiredSlots: [],
    optionalSlots: [],
    toolId: '__conversation__',
    priority: 3,
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

/**
 * All Ferni-specific intents
 */
export const FERNI_INTENTS: Intent[] = [
  ...CRISIS_INTENTS, // Highest priority
  ...PERSONA_HANDOFF_INTENTS,
  ...MUSIC_INTENTS,
  ...HABIT_INTENTS,
  ...CALENDAR_INTENTS,
  ...FINANCE_INTENTS,
  ...PLANNING_INTENTS,
  ...WISDOM_INTENTS,
  ...EMOTIONAL_INTENTS,
  ...MEMORY_INTENTS,
  ...SMALLTALK_INTENTS,
];

/**
 * Get intents for a specific persona
 */
export function getIntentsForPersona(personaId: string): Intent[] {
  const base = [...CRISIS_INTENTS, ...PERSONA_HANDOFF_INTENTS, ...SMALLTALK_INTENTS];

  switch (personaId) {
    case 'maya':
      return [...base, ...HABIT_INTENTS, ...EMOTIONAL_INTENTS];
    case 'peter':
      return [...base, ...FINANCE_INTENTS];
    case 'alex':
      return [...base, ...CALENDAR_INTENTS];
    case 'jordan':
      return [...base, ...PLANNING_INTENTS];
    case 'nayan':
      return [...base, ...WISDOM_INTENTS, ...EMOTIONAL_INTENTS];
    case 'ferni':
    default:
      return FERNI_INTENTS;
  }
}

/**
 * Initialize the intent classifier with Ferni intents
 */
export function registerFerniIntents(): void {
  const { getIntentClassifier } = require('./intent-classifier.js');
  const classifier = getIntentClassifier();
  classifier.registerIntents(FERNI_INTENTS);
}

