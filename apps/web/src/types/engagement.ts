/**
 * Engagement data shapes shared by the engagement services and their UI.
 *
 * @module types/engagement
 */

export interface RitualStreakData {
  ritualId: string;
  ritualName: string;
  personaId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: string | null;
  dueToday: boolean;
}

export interface EmotionalWeatherData {
  primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
  energy: 'high' | 'medium' | 'low';
  note?: string;
  recordedAt: string;
}

export interface EngagementStats {
  totalRitualDays: number;
  longestOverallStreak: number;
  currentActiveStreaks: number;
  predictionAccuracy?: number;
  teamHuddlesAttended: number;
}

export interface EngagementData {
  ritualStreaks: RitualStreakData[];
  weatherHistory: EmotionalWeatherData[];
  stats: EngagementStats;
  lastEngagementAt: string | null;
}

export interface TeamHuddleParticipant {
  personaId: string;
  name: string;
  initials: string;
  comment: string;
  avatarColor: string;
}

export interface TeamHuddleData {
  id: string;
  title: string;
  intro: string;
  participants: TeamHuddleParticipant[];
  outro: string;
  scheduledAt: string;
  type: 'weekly' | 'milestone' | 'special';
}
