/**
 * Ferni Ritual Registry
 * 
 * Central registry of all defined rituals.
 * 
 * @module @ferni/rituals
 */

import type { Ritual } from './ritual.types.js';

// ============================================================================
// CONNECTION RITUALS
// ============================================================================

const FIRST_TIME_RITUAL: Ritual = {
  id: 'first-time-ever',
  name: 'First Time Ever',
  description: 'Welcome ritual for brand new users',
  trigger: 'session_start_first_ever',
  priority: 100,
  interruptible: false,
  tags: ['connection', 'welcome', 'critical'],
  
  sequence: [
    {
      type: 'visual',
      action: 'avatar-entrance',
      duration: 1200,
    },
    {
      type: 'audio',
      sound: 'ferni-startup',
    },
    {
      type: 'haptic',
      pattern: 'warm-welcome',
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'speech',
      template: 'first_ever_greeting',
      style: 'warm',
    },
  ],
};

const WELCOME_BACK_RITUAL: Ritual = {
  id: 'welcome-back',
  name: 'Welcome Back',
  description: 'Warm welcome for returning users (24h+ gap)',
  trigger: 'session_start_after_24h',
  priority: 70,
  interruptible: true,
  cooldown: 0, // Always play on qualifying session start
  tags: ['connection', 'welcome'],
  
  sequence: [
    {
      type: 'visual',
      action: 'avatar-anticipation',
      duration: 500,
    },
    {
      type: 'audio',
      sound: 'connection-success',
    },
    {
      type: 'haptic',
      pattern: 'warm-welcome',
    },
    {
      type: 'pause',
      duration: 300,
    },
    {
      type: 'speech',
      template: 'welcome_back',
      style: 'warm',
    },
  ],
};

const CONNECTION_HEALING_RITUAL: Ritual = {
  id: 'connection-healing',
  name: 'Connection Healing',
  description: 'Seamless recovery after disconnection',
  trigger: 'session_start', // Triggered by reconnection logic
  conditions: [
    { type: 'user_preference', key: 'wasDisconnected', value: true },
  ],
  priority: 80,
  interruptible: true,
  tags: ['connection', 'recovery'],
  
  sequence: [
    {
      type: 'visual',
      action: 'avatar-settle',
      duration: 300,
    },
    {
      type: 'audio',
      sound: 'connection-success',
      volume: -6,
    },
    {
      type: 'speech',
      template: 'connection_healed',
      style: 'warm',
    },
  ],
};

// ============================================================================
// CONVERSATION RITUALS
// ============================================================================

const ACKNOWLEDGMENT_RITUAL: Ritual = {
  id: 'emotional-acknowledgment',
  name: 'Emotional Acknowledgment',
  description: 'Acknowledge when user shares something significant',
  trigger: 'emotional_content_detected',
  conditions: [
    { type: 'emotion', emotion: 'vulnerable' },
  ],
  priority: 60,
  interruptible: false,
  cooldown: 60000, // 1 minute cooldown
  tags: ['conversation', 'emotional'],
  
  sequence: [
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'visual',
      action: 'avatar-warm',
      duration: 300,
    },
    {
      type: 'haptic',
      pattern: 'empathy',
    },
    {
      type: 'speech',
      template: 'acknowledgment',
      style: 'warm',
    },
  ],
};

const DEEP_BREATH_RITUAL: Ritual = {
  id: 'deep-breath',
  name: 'Deep Breath',
  description: 'Settle before discussing something serious',
  trigger: 'emotional_content_detected',
  conditions: [
    {
      type: 'or',
      conditions: [
        { type: 'emotion', emotion: 'anxious' },
        { type: 'emotion', emotion: 'sad' },
      ],
    },
  ],
  priority: 55,
  interruptible: true,
  cooldown: 120000, // 2 minute cooldown
  tags: ['conversation', 'grounding'],
  
  sequence: [
    {
      type: 'visual',
      action: 'avatar-settle',
      duration: 500,
    },
    {
      type: 'audio',
      sound: 'breath-settle',
      volume: -12,
    },
    {
      type: 'pause',
      duration: 800,
    },
    {
      type: 'speech',
      template: 'deep_breath_transition',
      style: 'thoughtful',
    },
  ],
};

// ============================================================================
// CELEBRATION RITUALS
// ============================================================================

const SMALL_WIN_RITUAL: Ritual = {
  id: 'small-win',
  name: 'Small Win Celebration',
  description: 'Celebrate daily wins and progress',
  trigger: 'win_detected',
  conditions: [
    { type: 'win_type', winType: 'followed_through' },
  ],
  priority: 50,
  interruptible: true,
  cooldown: 30000, // 30 second cooldown
  tags: ['celebration', 'win'],
  
  sequence: [
    {
      type: 'speech',
      template: 'win_recognition',
      style: 'excited',
    },
    {
      type: 'parallel',
      steps: [
        {
          type: 'visual',
          action: 'sparkle',
          duration: 800,
        },
        {
          type: 'audio',
          sound: 'celebration-small',
        },
        {
          type: 'haptic',
          pattern: 'sparkle',
        },
      ],
    },
    {
      type: 'pause',
      duration: 200,
    },
    {
      type: 'speech',
      template: 'win_acknowledgment',
      style: 'warm',
    },
  ],
};

const BIG_WIN_RITUAL: Ritual = {
  id: 'big-win',
  name: 'Big Win Celebration',
  description: 'Major celebration for significant accomplishments',
  trigger: 'win_detected',
  conditions: [
    {
      type: 'or',
      conditions: [
        { type: 'win_type', winType: 'courage_moment' },
        { type: 'win_type', winType: 'breakthrough' },
        { type: 'win_type', winType: 'hard_conversation' },
      ],
    },
  ],
  priority: 80,
  interruptible: false,
  cooldown: 60000, // 1 minute cooldown
  tags: ['celebration', 'win', 'major'],
  
  sequence: [
    {
      type: 'speech',
      template: 'big_win_intro',
      style: 'excited',
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'parallel',
      steps: [
        {
          type: 'visual',
          action: 'celebration-burst',
          duration: 1200,
        },
        {
          type: 'audio',
          sound: 'celebration-big',
        },
        {
          type: 'haptic',
          pattern: 'celebration',
          intensity: 0.8,
        },
      ],
    },
    {
      type: 'pause',
      duration: 300,
    },
    {
      type: 'speech',
      template: 'big_win_acknowledgment',
      style: 'warm',
    },
  ],
};

const COURAGE_RITUAL: Ritual = {
  id: 'courage-moment',
  name: 'Courage Celebration',
  description: 'Acknowledge when user did something brave',
  trigger: 'win_detected',
  conditions: [
    { type: 'win_type', winType: 'courage_moment' },
  ],
  priority: 75,
  interruptible: false,
  tags: ['celebration', 'courage'],
  
  sequence: [
    {
      type: 'pause',
      duration: 300,
    },
    {
      type: 'speech',
      template: 'courage_recognition',
      style: 'warm',
    },
    {
      type: 'parallel',
      steps: [
        {
          type: 'visual',
          action: 'warm-pulse',
          duration: 900,
        },
        {
          type: 'haptic',
          pattern: 'heartbeat',
        },
      ],
    },
    {
      type: 'speech',
      template: 'courage_pride',
      style: 'warm',
    },
  ],
};

// ============================================================================
// MILESTONE RITUALS
// ============================================================================

const STAGE_UP_RITUAL: Ritual = {
  id: 'stage-up',
  name: 'Relationship Stage Up',
  description: 'Celebrate advancing to a new relationship stage',
  trigger: 'stage_up',
  priority: 90,
  interruptible: false,
  tags: ['milestone', 'relationship', 'critical'],
  
  sequence: [
    {
      type: 'speech',
      template: 'stage_reflection_intro',
      style: 'thoughtful',
    },
    {
      type: 'pause',
      duration: 1500,
    },
    {
      type: 'speech',
      template: 'stage_journey_acknowledgment',
      style: 'warm',
    },
    {
      type: 'parallel',
      steps: [
        {
          type: 'visual',
          action: 'stage-up-celebration',
          duration: 1500,
        },
        {
          type: 'audio',
          sound: 'milestone-reached',
        },
        {
          type: 'haptic',
          pattern: 'milestone',
        },
      ],
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'speech',
      template: 'stage_welcome',
      style: 'warm',
    },
  ],
};

const TEAM_UNLOCK_RITUAL: Ritual = {
  id: 'team-unlock',
  name: 'Team Member Unlock',
  description: 'Welcome a new team member',
  trigger: 'team_unlock',
  priority: 85,
  interruptible: false,
  tags: ['milestone', 'team'],
  
  sequence: [
    {
      type: 'speech',
      template: 'team_intro',
      style: 'excited',
    },
    {
      type: 'pause',
      duration: 500,
    },
    {
      type: 'visual',
      action: 'persona-reveal',
      duration: 1000,
    },
    {
      type: 'audio',
      sound: 'team-unlock',
    },
    {
      type: 'speech',
      template: 'team_welcome',
      style: 'warm',
    },
  ],
};

const CONVERSATION_MILESTONE_RITUAL: Ritual = {
  id: 'conversation-milestone',
  name: 'Conversation Milestone',
  description: 'Acknowledge conversation count milestones',
  trigger: 'conversation_milestone',
  conditions: [
    {
      type: 'or',
      conditions: [
        { type: 'conversation_count', count: 10, operator: 'eq' },
        { type: 'conversation_count', count: 25, operator: 'eq' },
        { type: 'conversation_count', count: 50, operator: 'eq' },
        { type: 'conversation_count', count: 100, operator: 'eq' },
      ],
    },
  ],
  priority: 60,
  interruptible: true,
  tags: ['milestone'],
  
  sequence: [
    {
      type: 'speech',
      template: 'conversation_milestone',
      style: 'warm',
    },
    {
      type: 'visual',
      action: 'gentle-glow',
      duration: 800,
    },
  ],
};

const STREAK_RITUAL: Ritual = {
  id: 'streak-achieved',
  name: 'Streak Achievement',
  description: 'Celebrate conversation streaks',
  trigger: 'streak_achieved',
  priority: 55,
  interruptible: true,
  cooldown: 86400000, // Once per day
  tags: ['milestone', 'streak'],
  
  sequence: [
    {
      type: 'branch',
      condition: { type: 'streak', length: 7, operator: 'gte' },
      then: [
        {
          type: 'speech',
          template: 'streak_week',
          style: 'excited',
        },
        {
          type: 'visual',
          action: 'streak-celebration',
          duration: 1000,
        },
        {
          type: 'audio',
          sound: 'celebration-small',
        },
      ],
      else: [
        {
          type: 'speech',
          template: 'streak_building',
          style: 'warm',
        },
      ],
    },
  ],
};

const ANNIVERSARY_RITUAL: Ritual = {
  id: 'anniversary',
  name: 'Anniversary',
  description: 'One year since first conversation',
  trigger: 'anniversary',
  conditions: [
    { type: 'days_since_first', days: 365, operator: 'eq' },
  ],
  priority: 95,
  interruptible: false,
  tags: ['milestone', 'anniversary', 'critical'],
  
  sequence: [
    {
      type: 'speech',
      template: 'anniversary_intro',
      style: 'thoughtful',
    },
    {
      type: 'pause',
      duration: 2000,
    },
    {
      type: 'parallel',
      steps: [
        {
          type: 'visual',
          action: 'anniversary-celebration',
          duration: 2000,
        },
        {
          type: 'audio',
          sound: 'celebration-big',
        },
        {
          type: 'haptic',
          pattern: 'milestone',
          intensity: 1,
        },
      ],
    },
    {
      type: 'speech',
      template: 'anniversary_reflection',
      style: 'warm',
    },
  ],
};

// ============================================================================
// GOODBYE RITUALS
// ============================================================================

const SESSION_END_RITUAL: Ritual = {
  id: 'session-end',
  name: 'Session End',
  description: 'Warm goodbye at session end',
  trigger: 'session_end',
  priority: 30,
  interruptible: true,
  tags: ['goodbye'],
  
  sequence: [
    {
      type: 'speech',
      template: 'session_end',
      style: 'warm',
    },
    {
      type: 'parallel',
      steps: [
        {
          type: 'visual',
          action: 'avatar-wave',
          duration: 600,
        },
        {
          type: 'audio',
          sound: 'session-end',
        },
      ],
    },
  ],
};

const CALLBACK_PROMISE_RITUAL: Ritual = {
  id: 'callback-promise',
  name: 'Callback Promise',
  description: 'End with promise to follow up',
  trigger: 'session_end',
  conditions: [
    { type: 'user_preference', key: 'hasPendingTopic', value: true },
  ],
  priority: 35,
  interruptible: true,
  tags: ['goodbye', 'callback'],
  
  sequence: [
    {
      type: 'speech',
      template: 'callback_promise',
      style: 'warm',
    },
    {
      type: 'pause',
      duration: 300,
    },
    {
      type: 'speech',
      template: 'session_end',
      style: 'warm',
    },
  ],
};

// ============================================================================
// REGISTRY EXPORT
// ============================================================================

/**
 * All registered rituals
 */
export const RITUAL_REGISTRY: Ritual[] = [
  // Connection
  FIRST_TIME_RITUAL,
  WELCOME_BACK_RITUAL,
  CONNECTION_HEALING_RITUAL,
  
  // Conversation
  ACKNOWLEDGMENT_RITUAL,
  DEEP_BREATH_RITUAL,
  
  // Celebration
  SMALL_WIN_RITUAL,
  BIG_WIN_RITUAL,
  COURAGE_RITUAL,
  
  // Milestones
  STAGE_UP_RITUAL,
  TEAM_UNLOCK_RITUAL,
  CONVERSATION_MILESTONE_RITUAL,
  STREAK_RITUAL,
  ANNIVERSARY_RITUAL,
  
  // Goodbye
  SESSION_END_RITUAL,
  CALLBACK_PROMISE_RITUAL,
];

/**
 * Get rituals by trigger type
 */
export function getRitualsByTrigger(trigger: string): Ritual[] {
  return RITUAL_REGISTRY
    .filter(r => r.trigger === trigger)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Get ritual by ID
 */
export function getRitualById(id: string): Ritual | undefined {
  return RITUAL_REGISTRY.find(r => r.id === id);
}

/**
 * Get rituals by tag
 */
export function getRitualsByTag(tag: string): Ritual[] {
  return RITUAL_REGISTRY.filter(r => r.tags?.includes(tag));
}

