/**
 * Daily Rituals Service
 *
 * Manages daily engagement touchpoints that give users reasons to return.
 * Each persona has their own ritual style that deepens relationships over time.
 *
 * RITUALS:
 *   Ferni: Morning Sky Check - "What's your weather inside today?"
 *   Alex: Inbox Pulse - Quick daily check on communication clarity
 *   Maya: Habit Heartbeat - Daily streak check with Compound & Interest
 *   Jordan: Today's Chapter - Frame the day in life arc context
 *   Nayan: Morning Stillness - 15-second wisdom drop
 *   Peter: Pattern Pulse - One insight about recent patterns
 */

import { getLogger } from '../../utils/safe-logger.js';
import { runBackground } from '../../utils/background-task.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  getEngagementStore,
  type StoredRitualStreak,
  type StoredWeatherEntry,
} from './engagement/engagement-store.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DailyRitual {
  id: string;
  personaId: string;
  name: string;
  description: string;
  duration: string; // e.g., "30 seconds", "1 minute"
  frequency: 'daily' | 'weekday' | 'weekend' | 'weekly';
  preferredTime?: string; // e.g., "morning", "evening"
  streakable: boolean;
}

export interface RitualCompletion {
  ritualId: string;
  userId: string;
  completedAt: Date;
  userResponse?: string;
  emotionalWeather?: EmotionalWeather;
  insights?: string[];
}

export interface EmotionalWeather {
  primary: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'rainbow';
  energy: 'high' | 'medium' | 'low';
  note?: string;
}

export interface RitualStreak {
  ritualId: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: Date;
  totalCompletions: number;
  streakHistory: Array<{ startDate: Date; endDate: Date; length: number }>;
}

export interface UserRitualProfile {
  userId: string;
  activeRituals: string[];
  streaks: Record<string, RitualStreak>;
  emotionalWeatherHistory: Array<{ date: Date; weather: EmotionalWeather }>;
  weeklyInsights: string[];
  lastRitualDate: Date;
  totalRitualDays: number;
  preferences: {
    preferredTime: 'morning' | 'afternoon' | 'evening';
    reminderEnabled: boolean;
    favoriteRitual?: string;
  };
}

// ============================================================================
// RITUAL DEFINITIONS
// ============================================================================

export const PERSONA_RITUALS: Record<string, DailyRitual> = {
  // Ferni's Morning Sky Check
  'ferni-sky-check': {
    id: 'ferni-sky-check',
    personaId: 'ferni',
    name: 'Morning Sky Check',
    description: 'A 30-second emotional weather report inspired by Wyoming skies',
    duration: '30 seconds',
    frequency: 'daily',
    preferredTime: 'morning',
    streakable: true,
  },

  // Alex's Inbox Pulse
  'alex-inbox-pulse': {
    id: 'alex-inbox-pulse',
    personaId: 'alex-chen',
    name: 'Inbox Pulse',
    description: 'Quick check on communication clarity and any loose ends',
    duration: '1 minute',
    frequency: 'weekday',
    preferredTime: 'morning',
    streakable: true,
  },

  // Maya's Habit Heartbeat
  'maya-habit-heartbeat': {
    id: 'maya-habit-heartbeat',
    personaId: 'maya-santos',
    name: 'Habit Heartbeat',
    description: 'Daily check-in with Compound & Interest tracking your habits',
    duration: '45 seconds',
    frequency: 'daily',
    preferredTime: 'morning',
    streakable: true,
  },

  // Jordan's Today's Chapter
  'jordan-todays-chapter': {
    id: 'jordan-todays-chapter',
    personaId: 'jordan-taylor',
    name: "Today's Chapter",
    description: 'Frame your day in the context of your larger life story',
    duration: '1 minute',
    frequency: 'daily',
    preferredTime: 'morning',
    streakable: true,
  },

  // Nayan's Morning Stillness
  'nayan-morning-stillness': {
    id: 'nayan-morning-stillness',
    personaId: 'nayan-patel',
    name: 'Morning Stillness',
    description: 'A 15-second wisdom drop to start your day with presence',
    duration: '15 seconds',
    frequency: 'daily',
    preferredTime: 'morning',
    streakable: true,
  },

  // Peter's Pattern Pulse
  'peter-pattern-pulse': {
    id: 'peter-pattern-pulse',
    personaId: 'peter-john',
    name: 'Pattern Pulse',
    description: 'One insight about patterns in your recent behavior',
    duration: '30 seconds',
    frequency: 'daily',
    preferredTime: 'morning',
    streakable: true,
  },
};

// ============================================================================
// RITUAL PROMPTS - What each persona says during their ritual
// ============================================================================

export const RITUAL_PROMPTS = {
  'ferni-sky-check': {
    openings: [
      'Good morning. <break time="300ms"/>Before we dive into anything, let\'s check the weather inside. <break time="200ms"/>If your emotional state were the sky right now, what would it look like?',
      'Hey. <break time="200ms"/>Quick sky check. <break time="300ms"/>Close your eyes for a second. What\'s the weather inside you this morning?',
      'Morning. <break time="300ms"/>Let\'s start with a simple check-in. <break time="200ms"/>If I asked you to describe how you\'re feeling as weather, what would you say?',
      'Before anything else— <break time="300ms"/>what\'s your internal forecast today? Sunny? Cloudy? Something brewing?',
    ],
    weatherResponses: {
      sunny: [
        'Sunny inside. <break time="200ms"/>That\'s good energy. <break time="200ms"/>Hold onto that. What\'s contributing to the sunshine?',
        'Clear skies. <break time="300ms"/>I love that. <break time="200ms"/>What\'s one thing you want to do with that energy today?',
      ],
      'partly-cloudy': [
        'Partly cloudy. <break time="300ms"/>That\'s honest. <break time="200ms"/>Some good, some uncertainty. <break time="200ms"/>What are the clouds about?',
        'A mix of sun and clouds. <break time="200ms"/>That\'s most days, really. <break time="200ms"/>What would help clear some of those clouds?',
      ],
      cloudy: [
        'Cloudy. <break time="300ms"/>I hear you. <break time="200ms"/>Sometimes the sky needs to be gray before it can clear. <break time="200ms"/>What\'s weighing on you?',
        'Overcast. <break time="200ms"/>That takes honesty to admit. <break time="300ms"/>Is there something specific, or just a general heaviness?',
      ],
      rainy: [
        'Rainy inside. <break time="300ms"/>That\'s okay. <break time="200ms"/>Rain is necessary. <break time="200ms"/>What do you need today?',
        'It\'s raining in there. <break time="300ms"/>Thank you for being honest. <break time="200ms"/>Sometimes we just need to let it rain. <break time="200ms"/>What would help?',
      ],
      stormy: [
        'A storm. <break time="300ms"/>I\'m glad you told me. <break time="200ms"/>Storms pass, but they\'re intense while they\'re here. <break time="200ms"/>What\'s happening?',
        'Stormy. <break time="200ms"/>That\'s a lot to carry. <break time="300ms"/>Do you want to talk about what\'s causing the storm, or just ride it out together?',
      ],
      foggy: [
        'Foggy. <break time="300ms"/>That\'s a good word. <break time="200ms"/>Hard to see clearly. <break time="200ms"/>What\'s creating the fog?',
        'Fog inside. <break time="200ms"/>Uncertainty, maybe? <break time="300ms"/>Hard to know which way to go. <break time="200ms"/>What would help you see more clearly?',
      ],
      rainbow: [
        'A rainbow! <break time="200ms"/>After the rain comes the beauty. <break time="300ms"/>What\'s creating that feeling?',
        'Rainbow weather. <break time="300ms"/>That\'s special. <break time="200ms"/>Something shifted for the better? <break time="200ms"/>Tell me about it.',
      ],
    },
    streakCelebrations: {
      3: 'Three days of sky checks. <break time="200ms"/>You\'re building a habit of self-awareness. <break time="200ms"/>That matters.',
      7: 'A full week of checking in with yourself. <break time="300ms"/>That\'s not nothing. <break time="200ms"/>How does it feel to track your inner weather?',
      14: 'Two weeks. <break time="200ms"/>You\'re starting to see patterns, aren\'t you? <break time="300ms"/>That\'s the point.',
      30: 'A month of morning sky checks. <break time="300ms"/>You know yourself better now than you did thirty days ago. <break time="200ms"/>I can feel it.',
      66: 'Sixty-six days. <break time="200ms"/>The research says that\'s when habits become automatic. <break time="300ms"/>This is part of you now.',
      100: 'One hundred sky checks. <break time="300ms"/>You\'ve built something real here. <break time="200ms"/>A hundred moments of honesty with yourself.',
    },
  },

  'alex-inbox-pulse': {
    openings: [
      'Quick pulse check. <break time="200ms"/>How\'s your inbox feeling? Scale of 1-10, where 1 is zen and 10 is chaos.',
      'Inbox pulse time. <break time="200ms"/>What\'s the state of your communications? Feeling clear or buried?',
      'Let\'s do a quick inbox check. <break time="200ms"/>Any loose ends haunting you? Anything that needs a quick response?',
    ],
    followUps: {
      clear: [
        'Inbox zen. <break time="200ms"/>Love to see it. <break time="200ms"/>What\'s one proactive message you could send today?',
        'Clear inbox, clear mind. <break time="200ms"/>That\'s the way. <break time="200ms"/>Keep that momentum.',
      ],
      manageable: [
        'Manageable is good. <break time="200ms"/>What\'s the one thing that would move the needle most today?',
        'Not perfect, but under control. <break time="200ms"/>That\'s realistic. <break time="200ms"/>What\'s the oldest thing lurking?',
      ],
      chaotic: [
        'Inbox chaos. <break time="200ms"/>Been there. <break time="200ms"/>Here\'s what I\'d do: pick the three things that matter most, ignore the rest for now.',
        'Buried. <break time="200ms"/>Okay, triage time. <break time="200ms"/>What\'s urgent? What can wait? What can you delete without reading?',
      ],
    },
    streakCelebrations: {
      5: 'Five days of inbox awareness. <break time="200ms"/>You\'re building visibility into your communications.',
      10: 'Ten days. <break time="200ms"/>I bet you\'re already more responsive than you were two weeks ago.',
      21: 'Three weeks of inbox discipline. <break time="200ms"/>That\'s a habit forming.',
    },
  },

  'maya-habit-heartbeat': {
    openings: [
      'Habit heartbeat time! <break time="200ms"/>Compound and Interest want to know— <break time="200ms"/>how are your habits doing today?',
      'Good morning! <break time="200ms"/>Quick check-in with your habits. <break time="200ms"/>Which ones are you planning to hit today?',
      'Hey! <break time="200ms"/>Compound is curious— <break time="200ms"/>did you stick with your habits yesterday? <break time="200ms"/>No judgment, just awareness.',
    ],
    catCommentary: {
      compound: [
        'Compound is purring. <break time="200ms"/>Slow and steady growth.',
        'Compound is sitting calmly, watching your progress accumulate.',
        'Compound stretched out in the sun. <break time="200ms"/>Just like your habits— <break time="200ms"/>growing quietly.',
      ],
      interest: [
        'Interest is bouncing around excited about your progress!',
        'Interest just knocked something off the counter to celebrate your streak.',
        'Interest is demanding attention— <break time="200ms"/>in a good way! <break time="200ms"/>Your habits are paying off.',
      ],
    },
    streakCelebrations: {
      3: 'Three days! <break time="200ms"/>Compound just started paying attention to you.',
      7: 'A full week! <break time="200ms"/>Interest is officially interested in you now.',
      21: 'Twenty-one days. <break time="200ms"/>Both cats are fully invested in your success. <break time="200ms"/>And honestly? So am I.',
      30: 'Thirty days. <break time="200ms"/>You\'ve fed your habits for a whole month. <break time="200ms"/>Compound and Interest are thriving.',
      66: 'Sixty-six days. <break time="200ms"/>This isn\'t just a habit anymore— <break time="200ms"/>it\'s who you are.',
    },
  },

  'jordan-todays-chapter': {
    openings: [
      'Good morning! <break time="200ms"/>Let\'s frame today. <break time="300ms"/>If today were a chapter in your life story, what would it be about?',
      'New day, new chapter! <break time="200ms"/>What\'s the theme of today\'s page in your story?',
      'Hey! <break time="200ms"/>Quick chapter check. <break time="200ms"/>What\'s this day setting up in your larger arc?',
    ],
    framingPrompts: [
      'Is today a building day, a resting day, or a pivoting day?',
      "What's one thing that would make this chapter memorable?",
      'If future-you looked back at today, what would you want them to see?',
    ],
    streakCelebrations: {
      7: 'A week of intentional days. <break time="200ms"/>You\'re writing your story consciously now.',
      30: 'Thirty chapters of awareness. <break time="200ms"/>That\'s a whole act of your life you\'ve been present for.',
    },
  },

  'nayan-morning-stillness': {
    wisdomDrops: [
      'The sky does not struggle to be blue. <break time="500ms"/>What in you is trying too hard today?',
      'You are not your thoughts. <break time="300ms"/>You are the one watching the thoughts. <break time="500ms"/>Watch.',
      'Before you do, <break time="200ms"/>be. <break time="500ms"/>Everything else follows.',
      'The river does not rush to reach the ocean. <break time="300ms"/>It arrives by being what it is.',
      'Worry is interest paid on trouble not yet borrowed. <break time="500ms"/>What can you release today?',
      'You have been seeking something that has never left. <break time="300ms"/>Stillness is always available.',
      'The breath is always now. <break time="500ms"/>Three breaths. <break time="300ms"/>That is your reset button.',
      'Confusion is the beginning of understanding. <break time="300ms"/>Do not rush to clarity. <break time="300ms"/>Sit with the fog.',
      'Your body knows things your mind has forgotten. <break time="500ms"/>What is it telling you?',
      'The greatest distance you will travel is from your head to your heart. <break time="500ms"/>Begin.',
    ],
    streakCelebrations: {
      7: 'Seven mornings of stillness. <break time="300ms"/>The practice is taking root.',
      30: 'Thirty days. <break time="200ms"/>You have sat with yourself more than most people do in a year.',
      100: 'One hundred mornings. <break time="500ms"/>You are not the same person who started this journey.',
    },
  },

  'peter-pattern-pulse': {
    openings: [
      'Pattern pulse! <break time="200ms"/>I\'ve been watching your data. <break time="200ms"/>Want to know what I see?',
      'Morning! <break time="200ms"/>I noticed something interesting in your patterns. <break time="200ms"/>Ready for today\'s insight?',
      'Hey! <break time="200ms"/>The data told me something overnight. <break time="200ms"/>Let me share.',
    ],
    patternTypes: [
      'time-based', // "You're most productive at..."
      'correlation', // "When you do X, Y happens"
      'trend', // "Over the last week..."
      'prediction', // "Based on patterns, today might be..."
      'anomaly', // "Yesterday was unusual because..."
    ],
    streakCelebrations: {
      7: 'A week of pattern tracking. <break time="200ms"/>The sample size is getting interesting.',
      14: 'Two weeks. <break time="200ms"/>Now I can start seeing REAL patterns.',
      30: 'Thirty days of data. <break time="200ms"/>The patterns are becoming predictive now.',
    },
  },
};

// ============================================================================
// DAILY RITUALS SERVICE
// ============================================================================

export class DailyRitualsService {
  private userProfiles = new Map<string, UserRitualProfile>();
  private firestoreEnabled = false;

  /**
   * Initialize Firestore integration
   */
  async initializeFirestore(): Promise<void> {
    try {
      const store = await getEngagementStore();
      this.firestoreEnabled = true;
      getLogger().info('Daily rituals Firestore integration enabled');
    } catch (error) {
      getLogger().warn({ error }, 'Firestore not available for daily rituals');
    }
  }

  /**
   * Get or create a user's ritual profile
   */
  async getOrCreateProfileAsync(userId: string): Promise<UserRitualProfile> {
    // Check memory cache first
    let profile = this.userProfiles.get(userId);
    if (profile) return profile;

    // Try Firestore
    if (this.firestoreEnabled) {
      try {
        const store = await getEngagementStore();
        profile = await store.toRitualProfile(userId);
        this.userProfiles.set(userId, profile);
        return profile;
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to load ritual profile from Firestore');
      }
    }

    // Create default
    return this.getOrCreateProfile(userId);
  }

  /**
   * Get or create a user's ritual profile (sync for backward compatibility)
   */
  getOrCreateProfile(userId: string): UserRitualProfile {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        activeRituals: [],
        streaks: {},
        emotionalWeatherHistory: [],
        weeklyInsights: [],
        lastRitualDate: new Date(0),
        totalRitualDays: 0,
        preferences: {
          preferredTime: 'morning',
          reminderEnabled: false,
        },
      };
      this.userProfiles.set(userId, profile);
    }

    return profile;
  }

  /**
   * Activate a ritual for a user
   */
  async activateRitual(userId: string, ritualId: string): Promise<void> {
    const profile = await this.getOrCreateProfileAsync(userId);

    if (!profile.activeRituals.includes(ritualId)) {
      profile.activeRituals.push(ritualId);

      // Initialize streak
      profile.streaks[ritualId] = {
        ritualId,
        userId,
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedAt: new Date(0),
        totalCompletions: 0,
        streakHistory: [],
      };

      // Persist to Firestore
      if (this.firestoreEnabled) {
        try {
          const store = await getEngagementStore();
          const engagementProfile = await store.getProfile(userId);
          engagementProfile.activeRituals = profile.activeRituals;
          await store.saveProfile(engagementProfile);

          const ritual = PERSONA_RITUALS[ritualId];
          await store.saveRitualStreak(userId, {
            ritualId,
            personaId: ritual?.personaId || 'unknown',
            currentStreak: 0,
            longestStreak: 0,
            lastCompletedAt: new Date(0).toISOString(),
            totalCompletions: 0,
            streakHistory: [],
          });
        } catch (error) {
          getLogger().warn({ error, userId, ritualId }, 'Failed to persist ritual activation');
        }
      }
    }

    getLogger().info({ userId, ritualId }, '🌅 Ritual activated');
  }

  /**
   * Record a ritual completion
   */
  async recordCompletionAsync(
    userId: string,
    ritualId: string,
    data?: {
      userResponse?: string;
      emotionalWeather?: EmotionalWeather;
      insights?: string[];
    }
  ): Promise<{ newStreak: number; isNewRecord: boolean; celebration?: string }> {
    const profile = await this.getOrCreateProfileAsync(userId);
    const streak = profile.streaks[ritualId];

    if (!streak) {
      await this.activateRitual(userId, ritualId);
      return this.recordCompletionAsync(userId, ritualId, data);
    }

    const now = new Date();
    const lastCompletion = new Date(streak.lastCompletedAt);
    const daysSinceLast = Math.floor(
      (now.getTime() - lastCompletion.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Update streak
    if (daysSinceLast === 1) {
      // Consecutive day - extend streak
      streak.currentStreak++;
    } else if (daysSinceLast > 1) {
      // Streak broken - record old streak and start new
      if (streak.currentStreak > 0) {
        streak.streakHistory.push({
          startDate: new Date(
            lastCompletion.getTime() - streak.currentStreak * 24 * 60 * 60 * 1000
          ),
          endDate: lastCompletion,
          length: streak.currentStreak,
        });
      }
      streak.currentStreak = 1;
    } else if (daysSinceLast === 0) {
      // Same day - don't change streak
    } else {
      // First completion
      streak.currentStreak = 1;
    }

    // Check for new record
    const isNewRecord = streak.currentStreak > streak.longestStreak;
    if (isNewRecord) {
      streak.longestStreak = streak.currentStreak;
    }

    // Update completion data
    streak.lastCompletedAt = now;
    streak.totalCompletions++;

    // Record emotional weather if provided
    if (data?.emotionalWeather) {
      profile.emotionalWeatherHistory.push({
        date: now,
        weather: data.emotionalWeather,
      });
      // Keep last 90 days
      profile.emotionalWeatherHistory = profile.emotionalWeatherHistory.slice(-90);
    }

    // Check for celebration milestone
    const celebration = this.getStreakCelebration(ritualId, streak.currentStreak);

    // Update profile totals
    const today = now.toDateString();
    const lastDay = lastCompletion.toDateString();
    if (today !== lastDay) {
      profile.totalRitualDays++;
    }
    profile.lastRitualDate = now;

    // Persist to Firestore
    if (this.firestoreEnabled) {
      try {
        const store = await getEngagementStore();
        const ritual = PERSONA_RITUALS[ritualId];

        // Save streak
        await store.saveRitualStreak(userId, {
          ritualId,
          personaId: ritual?.personaId || 'unknown',
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastCompletedAt: streak.lastCompletedAt.toISOString(),
          totalCompletions: streak.totalCompletions,
          streakHistory: streak.streakHistory.map((h) => ({
            startDate: h.startDate.toISOString(),
            endDate: h.endDate.toISOString(),
            length: h.length,
          })),
        });

        // Save weather if provided
        if (data?.emotionalWeather) {
          await store.recordWeather(userId, {
            date: now.toISOString(),
            weather: data.emotionalWeather,
            ritualId,
            insights: data.insights,
          });
        }

        // Update engagement profile
        const engagementProfile = await store.getProfile(userId);
        engagementProfile.totalRitualDays = profile.totalRitualDays;
        engagementProfile.lastEngagementAt = now.toISOString();
        if (streak.longestStreak > engagementProfile.longestOverallStreak) {
          engagementProfile.longestOverallStreak = streak.longestStreak;
        }
        await store.saveProfile(engagementProfile);
      } catch (error) {
        getLogger().warn({ error, userId, ritualId }, 'Failed to persist ritual completion');
      }
    }

    getLogger().info(
      { userId, ritualId, streak: streak.currentStreak, isNewRecord },
      '✅ Ritual completed'
    );

    return {
      newStreak: streak.currentStreak,
      isNewRecord,
      celebration,
    };
  }

  /**
   * Record a ritual completion (sync for backward compatibility)
   */
  recordCompletion(
    userId: string,
    ritualId: string,
    data?: {
      userResponse?: string;
      emotionalWeather?: EmotionalWeather;
      insights?: string[];
    }
  ): { newStreak: number; isNewRecord: boolean; celebration?: string } {
    // Call async version without awaiting for backward compatibility
    // The persistence will happen in the background
    this.recordCompletionAsync(userId, ritualId, data).catch((error) => {
      getLogger().warn({ error, userId, ritualId }, 'Background ritual persistence failed');
    });

    // Synchronous logic for immediate return
    const profile = this.getOrCreateProfile(userId);
    const streak = profile.streaks[ritualId];

    if (!streak) {
      // Trigger activation in background
      runBackground(this.activateRitual(userId, ritualId), {
        task: 'activateRitual',
        userId,
        ritualId,
      });
      return { newStreak: 1, isNewRecord: true };
    }

    return {
      newStreak: streak.currentStreak,
      isNewRecord: false,
    };
  }

  /**
   * Get streak celebration message if applicable
   */
  private getStreakCelebration(ritualId: string, streak: number): string | undefined {
    const prompts = RITUAL_PROMPTS[ritualId as keyof typeof RITUAL_PROMPTS];
    if (!prompts || !('streakCelebrations' in prompts)) return undefined;

    const celebrations = prompts.streakCelebrations as Record<number, string>;
    return celebrations[streak];
  }

  /**
   * Get ritual opening for a persona
   */
  getRitualOpening(ritualId: string): string {
    const prompts = RITUAL_PROMPTS[ritualId as keyof typeof RITUAL_PROMPTS];
    if (!prompts || !('openings' in prompts)) {
      return 'Time for your daily ritual.';
    }

    const openings = prompts.openings as string[];
    return openings[Math.floor(Math.random() * openings.length)];
  }

  /**
   * Get weather-specific response for Ferni's sky check
   */
  getWeatherResponse(weather: EmotionalWeather['primary']): string {
    const responses = RITUAL_PROMPTS['ferni-sky-check'].weatherResponses;
    const options = responses[weather];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Get Nayan's daily wisdom
   */
  getDailyWisdom(): string {
    const wisdoms = RITUAL_PROMPTS['nayan-morning-stillness'].wisdomDrops;
    // Use date-based selection so everyone gets the same wisdom on the same day
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
    );
    return wisdoms[dayOfYear % wisdoms.length];
  }

  /**
   * Get Maya's cat commentary
   */
  getCatCommentary(): { compound: string; interest: string } {
    const cats = RITUAL_PROMPTS['maya-habit-heartbeat'].catCommentary;
    return {
      compound: cats.compound[Math.floor(Math.random() * cats.compound.length)],
      interest: cats.interest[Math.floor(Math.random() * cats.interest.length)],
    };
  }

  /**
   * Get emotional weather trends for a user
   */
  getWeatherTrends(
    userId: string,
    days = 7
  ): {
    dominantWeather: EmotionalWeather['primary'] | null;
    energyTrend: 'increasing' | 'stable' | 'decreasing';
    pattern?: string;
  } {
    const profile = this.userProfiles.get(userId);
    if (!profile || profile.emotionalWeatherHistory.length < 2) {
      return { dominantWeather: null, energyTrend: 'stable' };
    }

    const recent = profile.emotionalWeatherHistory.slice(-days);

    // Find dominant weather
    const weatherCounts = new Map<EmotionalWeather['primary'], number>();
    for (const entry of recent) {
      const count = weatherCounts.get(entry.weather.primary) || 0;
      weatherCounts.set(entry.weather.primary, count + 1);
    }

    let dominantWeather: EmotionalWeather['primary'] | null = null;
    let maxCount = 0;
    for (const [weather, count] of weatherCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantWeather = weather;
      }
    }

    // Calculate energy trend
    const energyValues = { high: 3, medium: 2, low: 1 };
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));

    const firstAvg =
      firstHalf.reduce((sum, e) => sum + energyValues[e.weather.energy], 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, e) => sum + energyValues[e.weather.energy], 0) / secondHalf.length;

    let energyTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (secondAvg - firstAvg > 0.3) energyTrend = 'increasing';
    else if (firstAvg - secondAvg > 0.3) energyTrend = 'decreasing';

    // Detect patterns
    let pattern: string | undefined;
    if (recent.length >= 7) {
      const weekdayWeathers = recent.filter((_, i) => {
        const day = new Date(Date.now() - (recent.length - 1 - i) * 24 * 60 * 60 * 1000).getDay();
        return day > 0 && day < 6;
      });
      const weekendWeathers = recent.filter((_, i) => {
        const day = new Date(Date.now() - (recent.length - 1 - i) * 24 * 60 * 60 * 1000).getDay();
        return day === 0 || day === 6;
      });

      if (weekdayWeathers.length && weekendWeathers.length) {
        const weekdayEnergy =
          weekdayWeathers.reduce((sum, e) => sum + energyValues[e.weather.energy], 0) /
          weekdayWeathers.length;
        const weekendEnergy =
          weekendWeathers.reduce((sum, e) => sum + energyValues[e.weather.energy], 0) /
          weekendWeathers.length;

        if (weekendEnergy - weekdayEnergy > 0.5) {
          pattern = 'Higher energy on weekends';
        } else if (weekdayEnergy - weekendEnergy > 0.5) {
          pattern = 'Higher energy on weekdays';
        }
      }
    }

    return { dominantWeather, energyTrend, pattern };
  }

  /**
   * Check if user should be reminded about a ritual
   */
  shouldRemind(userId: string, ritualId: string): boolean {
    const profile = this.userProfiles.get(userId);
    if (!profile || !profile.preferences.reminderEnabled) return false;

    const streak = profile.streaks[ritualId];
    if (!streak) return false;

    const now = new Date();
    const lastCompletion = new Date(streak.lastCompletedAt);
    const daysSinceLast = Math.floor(
      (now.getTime() - lastCompletion.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Remind if it's been a day and they have a streak to protect
    return daysSinceLast >= 1 && streak.currentStreak > 0;
  }

  /**
   * Get all due rituals for a user
   */
  getDueRituals(userId: string): DailyRitual[] {
    const profile = this.userProfiles.get(userId);
    if (!profile) return [];

    const now = new Date();
    const today = now.toDateString();
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    return profile.activeRituals
      .map((id) => PERSONA_RITUALS[id])
      .filter((ritual) => {
        if (!ritual) return false;

        // Check frequency
        if (ritual.frequency === 'weekday' && isWeekend) return false;
        if (ritual.frequency === 'weekend' && !isWeekend) return false;

        // Check if already completed today
        const streak = profile.streaks[ritual.id];
        if (streak && new Date(streak.lastCompletedAt).toDateString() === today) {
          return false;
        }

        return true;
      });
  }

  /**
   * Export profile for persistence
   */
  exportProfile(userId: string): UserRitualProfile | null {
    return this.userProfiles.get(userId) || null;
  }

  /**
   * Import profile from persistence
   */
  importProfile(profile: UserRitualProfile): void {
    this.userProfiles.set(profile.userId, profile);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let dailyRitualsService: DailyRitualsService | null = null;

export function getDailyRitualsService(): DailyRitualsService {
  if (!dailyRitualsService) {
    dailyRitualsService = new DailyRitualsService();
  }
  return dailyRitualsService;
}

export function resetDailyRitualsService(): void {
  dailyRitualsService = null;
}

export default DailyRitualsService;
