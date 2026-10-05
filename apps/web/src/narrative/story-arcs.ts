/**
 * 📖 Story Arc Definitions
 * 
 * Pre-defined narrative sequences for common user journeys.
 * Each arc is a choreographed sequence of beats that tells a story.
 * 
 * PIXAR STORY STRUCTURE:
 * 1. Opening (establish character/mood)
 * 2. Rising action (build engagement)
 * 3. Climax (the meaningful moment)
 * 4. Resolution (settle into new state)
 * 
 * @module @ferni/narrative/arcs
 */

import { type StoryBeat } from './narrative-director.js';

// ============================================================================
// TYPES
// ============================================================================

export interface StoryArcDefinition {
  id: string;
  name: string;
  nameKey: string;
  description: string;
  descriptionKey: string;
  beats: StoryBeat[];
  /** Estimated duration in ms */
  estimatedDuration: number;
  /** Context requirements */
  requirements?: {
    minConversations?: number;
    minStreak?: number;
    timeOfDay?: ('morning' | 'afternoon' | 'evening' | 'night')[];
  };
}

// ============================================================================
// ONBOARDING ARCS
// ============================================================================

export const FIRST_LAUNCH_ARC: StoryArcDefinition = {
  id: 'first_launch',
  name: 'First Launch Experience',
  nameKey: 'storyArcs.firstLaunch.name',
  description: 'Welcome a brand new user to Ferni',
  descriptionKey: 'storyArcs.firstLaunch.description',
  beats: [
    'first_launch',      // Warm welcome
    'connected',         // Connection established
  ],
  estimatedDuration: 3000,
};

export const WELCOME_BACK_ARC: StoryArcDefinition = {
  id: 'welcome_back',
  name: 'Welcome Back',
  nameKey: 'storyArcs.welcomeBack.name',
  description: 'Greet a returning user',
  descriptionKey: 'storyArcs.welcomeBack.description',
  beats: [
    'welcome_back',
    'connected',
  ],
  estimatedDuration: 2000,
};

// ============================================================================
// CONNECTION ARCS
// ============================================================================

export const CONNECTION_FLOW_ARC: StoryArcDefinition = {
  id: 'connection_flow',
  name: 'Connection Flow',
  nameKey: 'storyArcs.connectionFlow.name',
  description: 'Full connection sequence',
  descriptionKey: 'storyArcs.connectionFlow.description',
  beats: [
    'connecting',
    'connected',
  ],
  estimatedDuration: 2000,
};

export const RECONNECTION_ARC: StoryArcDefinition = {
  id: 'reconnection',
  name: 'Reconnection',
  nameKey: 'storyArcs.reconnection.name',
  description: 'Handle disconnect and reconnect',
  descriptionKey: 'storyArcs.reconnection.description',
  beats: [
    'connection_lost',
    'reconnected',
  ],
  estimatedDuration: 3000,
};

// ============================================================================
// CONVERSATION ARCS
// ============================================================================

export const CONVERSATION_START_ARC: StoryArcDefinition = {
  id: 'conversation_start',
  name: 'Conversation Start',
  nameKey: 'storyArcs.conversationStart.name',
  description: 'Beginning of a conversation',
  descriptionKey: 'storyArcs.conversationStart.description',
  beats: [
    'user_starts_speaking',
    'ferni_starts_speaking',
    'ferni_stops_speaking',
  ],
  estimatedDuration: 5000,
};

export const DEEP_CONVERSATION_ARC: StoryArcDefinition = {
  id: 'deep_conversation',
  name: 'Deep Conversation',
  nameKey: 'storyArcs.deepConversation.name',
  description: 'User opens up about something meaningful',
  descriptionKey: 'storyArcs.deepConversation.description',
  beats: [
    'user_vulnerable',
    'empathy_moment',
    'deep_thought',
    'ferni_starts_speaking',
    'ferni_stops_speaking',
  ],
  estimatedDuration: 8000,
  requirements: {
    minConversations: 3,
  },
};

export const BREAKTHROUGH_ARC: StoryArcDefinition = {
  id: 'breakthrough',
  name: 'Breakthrough Moment',
  nameKey: 'storyArcs.breakthrough.name',
  description: 'User has a realization or breakthrough',
  descriptionKey: 'storyArcs.breakthrough.description',
  beats: [
    'thinking',
    'breakthrough',
    'big_win',
  ],
  estimatedDuration: 5000,
};

// ============================================================================
// ACHIEVEMENT ARCS
// ============================================================================

export const SMALL_WIN_ARC: StoryArcDefinition = {
  id: 'small_win',
  name: 'Small Win',
  nameKey: 'storyArcs.smallWin.name',
  description: 'Quick accomplishment acknowledgment',
  descriptionKey: 'storyArcs.smallWin.description',
  beats: [
    'small_win',
  ],
  estimatedDuration: 1500,
};

export const BIG_WIN_ARC: StoryArcDefinition = {
  id: 'big_win',
  name: 'Big Win',
  nameKey: 'storyArcs.bigWin.name',
  description: 'Major achievement celebration',
  descriptionKey: 'storyArcs.bigWin.description',
  beats: [
    'big_win',
    'milestone_reached',
  ],
  estimatedDuration: 4000,
};

export const STREAK_CELEBRATION_ARC: StoryArcDefinition = {
  id: 'streak_celebration',
  name: 'Streak Celebration',
  nameKey: 'storyArcs.streakCelebration.name',
  description: 'Celebrate continued streak',
  descriptionKey: 'storyArcs.streakCelebration.description',
  beats: [
    'streak_continues',
    'small_win',
  ],
  estimatedDuration: 3000,
  requirements: {
    minStreak: 3,
  },
};

export const GOAL_COMPLETION_ARC: StoryArcDefinition = {
  id: 'goal_completion',
  name: 'Goal Completion',
  nameKey: 'storyArcs.goalCompletion.name',
  description: 'User completes a goal',
  descriptionKey: 'storyArcs.goalCompletion.description',
  beats: [
    'goal_completed',
    'big_win',
    'skill_improved',
  ],
  estimatedDuration: 6000,
};

// ============================================================================
// TEAM ARCS
// ============================================================================

export const MEET_TEAM_MEMBER_ARC: StoryArcDefinition = {
  id: 'meet_team_member',
  name: 'Meet Team Member',
  nameKey: 'storyArcs.meetTeamMember.name',
  description: 'First introduction to a new persona',
  descriptionKey: 'storyArcs.meetTeamMember.description',
  beats: [
    'team_unlock',
    'persona_introduced',
    'connected',
  ],
  estimatedDuration: 5000,
};

export const PERSONA_HANDOFF_ARC: StoryArcDefinition = {
  id: 'persona_handoff',
  name: 'Persona Handoff',
  nameKey: 'storyArcs.personaHandoff.name',
  description: 'Smooth transition between personas',
  descriptionKey: 'storyArcs.personaHandoff.description',
  beats: [
    'persona_handoff',
    'persona_introduced',
  ],
  estimatedDuration: 3000,
};

export const TEAM_HUDDLE_ARC: StoryArcDefinition = {
  id: 'team_huddle',
  name: 'Team Huddle',
  nameKey: 'storyArcs.teamHuddle.name',
  description: 'Multi-persona moment',
  descriptionKey: 'storyArcs.teamHuddle.description',
  beats: [
    'team_huddle_start',
    'connected',
  ],
  estimatedDuration: 3000,
};

// ============================================================================
// TIME-BASED ARCS
// ============================================================================

export const MORNING_GREETING_ARC: StoryArcDefinition = {
  id: 'morning_greeting',
  name: 'Morning Greeting',
  nameKey: 'storyArcs.morningGreeting.name',
  description: 'Start the day right',
  descriptionKey: 'storyArcs.morningGreeting.description',
  beats: [
    'morning_greeting',
    'connected',
  ],
  estimatedDuration: 2500,
  requirements: {
    timeOfDay: ['morning'],
  },
};

export const EVENING_WIND_DOWN_ARC: StoryArcDefinition = {
  id: 'evening_wind_down',
  name: 'Evening Wind Down',
  nameKey: 'storyArcs.eveningWindDown.name',
  description: 'Gentle evening session',
  descriptionKey: 'storyArcs.eveningWindDown.description',
  beats: [
    'evening_wind_down',
    'connected',
  ],
  estimatedDuration: 2500,
  requirements: {
    timeOfDay: ['evening'],
  },
};

export const LATE_NIGHT_ARC: StoryArcDefinition = {
  id: 'late_night',
  name: 'Late Night',
  nameKey: 'storyArcs.lateNight.name',
  description: 'Calm late-night presence',
  descriptionKey: 'storyArcs.lateNight.description',
  beats: [
    'late_night',
    'connected',
  ],
  estimatedDuration: 2500,
  requirements: {
    timeOfDay: ['night'],
  },
};

// ============================================================================
// SPECIAL ARCS
// ============================================================================

export const BIRTHDAY_ARC: StoryArcDefinition = {
  id: 'birthday',
  name: 'Birthday Celebration',
  nameKey: 'storyArcs.birthday.name',
  description: 'User birthday celebration',
  descriptionKey: 'storyArcs.birthday.description',
  beats: [
    'birthday',
    'big_win',
    'empathy_moment',
  ],
  estimatedDuration: 6000,
};

export const ANNIVERSARY_ARC: StoryArcDefinition = {
  id: 'anniversary',
  name: 'Anniversary',
  nameKey: 'storyArcs.anniversary.name',
  description: 'Relationship anniversary celebration',
  descriptionKey: 'storyArcs.anniversary.description',
  beats: [
    'anniversary',
    'milestone_reached',
    'empathy_moment',
  ],
  estimatedDuration: 5000,
};

// ============================================================================
// EMOTIONAL SUPPORT ARCS
// ============================================================================

export const FRUSTRATION_SUPPORT_ARC: StoryArcDefinition = {
  id: 'frustration_support',
  name: 'Frustration Support',
  nameKey: 'storyArcs.frustrationSupport.name',
  description: 'Support user through frustration',
  descriptionKey: 'storyArcs.frustrationSupport.description',
  beats: [
    'user_frustrated',
    'empathy_moment',
    'deep_thought',
    'ferni_starts_speaking',
  ],
  estimatedDuration: 6000,
};

export const SADNESS_SUPPORT_ARC: StoryArcDefinition = {
  id: 'sadness_support',
  name: 'Sadness Support',
  nameKey: 'storyArcs.sadnessSupport.name',
  description: 'Support user through sadness',
  descriptionKey: 'storyArcs.sadnessSupport.description',
  beats: [
    'user_sad',
    'empathy_moment',
    'deep_thought',
    'ferni_starts_speaking',
  ],
  estimatedDuration: 6000,
};

export const EXCITEMENT_CELEBRATION_ARC: StoryArcDefinition = {
  id: 'excitement_celebration',
  name: 'Excitement Celebration',
  nameKey: 'storyArcs.excitementCelebration.name',
  description: 'Share in user excitement',
  descriptionKey: 'storyArcs.excitementCelebration.description',
  beats: [
    'user_excited',
    'big_win',
  ],
  estimatedDuration: 4000,
};

// ============================================================================
// ARC REGISTRY
// ============================================================================

export const STORY_ARCS: Record<string, StoryArcDefinition> = {
  // Onboarding
  first_launch: FIRST_LAUNCH_ARC,
  welcome_back: WELCOME_BACK_ARC,
  
  // Connection
  connection_flow: CONNECTION_FLOW_ARC,
  reconnection: RECONNECTION_ARC,
  
  // Conversation
  conversation_start: CONVERSATION_START_ARC,
  deep_conversation: DEEP_CONVERSATION_ARC,
  breakthrough: BREAKTHROUGH_ARC,
  
  // Achievement
  small_win: SMALL_WIN_ARC,
  big_win: BIG_WIN_ARC,
  streak_celebration: STREAK_CELEBRATION_ARC,
  goal_completion: GOAL_COMPLETION_ARC,
  
  // Team
  meet_team_member: MEET_TEAM_MEMBER_ARC,
  persona_handoff: PERSONA_HANDOFF_ARC,
  team_huddle: TEAM_HUDDLE_ARC,
  
  // Time-based
  morning_greeting: MORNING_GREETING_ARC,
  evening_wind_down: EVENING_WIND_DOWN_ARC,
  late_night: LATE_NIGHT_ARC,
  
  // Special
  birthday: BIRTHDAY_ARC,
  anniversary: ANNIVERSARY_ARC,
  
  // Emotional support
  frustration_support: FRUSTRATION_SUPPORT_ARC,
  sadness_support: SADNESS_SUPPORT_ARC,
  excitement_celebration: EXCITEMENT_CELEBRATION_ARC,
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get arc by ID
 */
export function getArc(id: string): StoryArcDefinition | undefined {
  return STORY_ARCS[id];
}

/**
 * Get all arcs matching requirements
 */
export function getAvailableArcs(context: {
  conversations: number;
  streak: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}): StoryArcDefinition[] {
  return Object.values(STORY_ARCS).filter(arc => {
    if (!arc.requirements) return true;
    
    const { minConversations, minStreak, timeOfDay } = arc.requirements;
    
    if (minConversations && context.conversations < minConversations) return false;
    if (minStreak && context.streak < minStreak) return false;
    if (timeOfDay && !timeOfDay.includes(context.timeOfDay)) return false;
    
    return true;
  });
}

/**
 * Get suggested arc for current context
 */
export function getSuggestedArc(context: {
  conversations: number;
  streak: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isFirstLaunch: boolean;
  userEmotion?: string;
}): StoryArcDefinition {
  // First launch always gets the welcome
  if (context.isFirstLaunch) {
    return FIRST_LAUNCH_ARC;
  }

  // Handle emotions first
  if (context.userEmotion === 'sad') {
    return SADNESS_SUPPORT_ARC;
  }
  if (context.userEmotion === 'frustrated') {
    return FRUSTRATION_SUPPORT_ARC;
  }
  if (context.userEmotion === 'excited') {
    return EXCITEMENT_CELEBRATION_ARC;
  }

  // Streaks are important
  if (context.streak >= 7) {
    return STREAK_CELEBRATION_ARC;
  }

  // Time-based greetings
  if (context.timeOfDay === 'morning') {
    return MORNING_GREETING_ARC;
  }
  if (context.timeOfDay === 'evening') {
    return EVENING_WIND_DOWN_ARC;
  }
  if (context.timeOfDay === 'night') {
    return LATE_NIGHT_ARC;
  }

  // Default
  return WELCOME_BACK_ARC;
}

/**
 * Get localized arc name (call with t() at render time)
 */
export function getArcNameKey(arc: StoryArcDefinition): string {
  return arc.nameKey;
}

/**
 * Get localized arc description (call with t() at render time)
 */
export function getArcDescriptionKey(arc: StoryArcDefinition): string {
  return arc.descriptionKey;
}

