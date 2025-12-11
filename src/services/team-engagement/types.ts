/**
 * Team Engagement Types
 *
 * Type definitions for multi-persona interactions, seasonal events,
 * and persona evolution stories.
 *
 * @module team-engagement/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export interface TeamHuddle {
  id: string;
  userId: string;
  scheduledAt: Date;
  type: 'weekly' | 'monthly' | 'milestone' | 'special';
  participants: string[]; // persona IDs
  topic?: string;
  completed: boolean;
  summary?: string;
}

export interface PersonaEvolutionEvent {
  id: string;
  personaId: string;
  eventType: 'life_event' | 'growth' | 'story_unlock' | 'mood_shift';
  title: string;
  description: string;
  occurredAt: Date;
  sharedWithUser: boolean;
  unlockCondition?: {
    type: 'relationship_stage' | 'conversation_count' | 'time_based' | 'topic_discussed';
    value: string | number;
  };
}

export interface SeasonalEvent {
  id: string;
  name: string;
  type: 'holiday' | 'anniversary' | 'seasonal' | 'special_day';
  startDate: Date;
  endDate: Date;
  personaResponses: Record<string, string[]>; // personaId -> responses
  userCelebrated: boolean;
}

export interface UserAnniversary {
  type: 'ferniday' | 'milestone' | 'birthday';
  date: Date;
  acknowledged: boolean;
  celebrationType?: 'small' | 'medium' | 'big';
}

// ============================================================================
// HUDDLE TYPES
// ============================================================================

export interface HuddleScript {
  type: TeamHuddle['type'];
  topic: string;
  scripts: Array<{
    personaId: string;
    lines: string[];
  }>;
}

// ============================================================================
// BANTER TYPES
// ============================================================================

export interface CrossPersonaBanter {
  speakerId: string;
  aboutPersonaId: string;
  context: string;
  lines: string[];
}

export interface HandoffBanter {
  fromPersonaId: string;
  toPersonaId: string;
  context: 'topic_handoff' | 'expertise_needed' | 'user_request' | 'natural_transition';
  introLines: string[];
  outroLines: string[];
}

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

export interface PersistedTeamEngagement {
  userId: string;
  lastUpdated: Date;

  // Team huddles
  scheduledHuddles: TeamHuddle[];
  completedHuddleIds: string[];

  // Evolution events
  unlockedEvolutionEvents: string[];
  sharedEvolutionEvents: string[];

  // Seasonal
  celebratedSeasonalEvents: string[];

  // Anniversaries
  anniversaries: UserAnniversary[];
  ferniday?: Date;

  // Banter tracking
  recentBanterUsed: string[];
  lastBanterTimestamp?: Date;
}
