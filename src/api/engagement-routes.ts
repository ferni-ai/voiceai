/**
 * Engagement API Routes
 *
 * REST endpoints for:
 * - Conversations history
 * - User analytics
 * - Predictions
 * - Cognitive memories
 * - Rituals
 * - Team huddles
 * - Data export
 * - Relationship progress
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  parseBody,
  requireUserId,
  sendJSON,
  sendJSONCached,
  sendError,
  parsePositiveInt,
  handleCorsPreflightIfNeeded,
} from './helpers.js';
import { requireAuth, rateLimit } from './auth-middleware.js';
import {
  validateBody,
  CreateRitualSchema,
  CompleteRitualSchema,
  ExportDataSchema,
  DeleteAllDataSchema,
  UpdatePredictionActualsSchema,
} from './validators.js';

const log = createLogger({ module: 'EngagementAPI' });

// ============================================================================
// TYPES
// ============================================================================

// Use Record<string, unknown> for flexible typing from services
// The services return different shapes depending on storage layer

interface Weather {
  primary: string;
  energy?: string;
  note?: string;
}

interface Pattern {
  id: string;
  pattern: string;
  frequency: number;
  examples: string[];
  category: string;
}

interface UIMemory {
  id: string;
  type: string;
  content: string;
  confidence: number;
  source: string;
  learnedAt: string;
  personaId?: string;
  sourceType: string;
}

// Helper to safely get values from unknown objects
function safeGet<T>(obj: unknown, key: string, defaultValue: T): T {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key] as T ?? defaultValue;
  }
  return defaultValue;
}

function safeGetNested<T>(obj: unknown, path: string[], defaultValue: T): T {
  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }
  return (current as T) ?? defaultValue;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MILESTONE_MESSAGES: Record<number, string> = {
  3: "Three days in a row. You're building something real.",
  7: 'One whole week. The habit is taking root.',
  14: "Two weeks strong. This is becoming part of who you are.",
  21: 'Three weeks. Scientists say habits form around now.',
  30: "One month! You've proven you can stick with this.",
  60: 'Two months of consistency. Remarkable.',
  90: "90 days. This isn't a habit anymore—it's you.",
  100: 'Triple digits! 100 days of showing up for yourself.',
  365: 'One year. 365 days. Extraordinary commitment.',
};

const RITUAL_NAMES: Record<string, string> = {
  'ferni-sky-check': 'Morning Sky Check',
  'alex-inbox-pulse': 'Inbox Pulse',
  'maya-habit-heartbeat': 'Habit Heartbeat',
  'jordan-todays-chapter': "Today's Chapter",
  'nayan-morning-stillness': 'Morning Stillness',
  'peter-pattern-pulse': 'Pattern Pulse',
};

const MILESTONES = [3, 7, 14, 21, 30, 60, 90, 100, 365];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getMilestoneMessage(streak: number): string {
  return MILESTONE_MESSAGES[streak] || `${streak} days and counting!`;
}

function getRitualFriendlyName(ritualId: string | null): string | null {
  if (!ritualId) return null;
  if (RITUAL_NAMES[ritualId]) return RITUAL_NAMES[ritualId];
  if (ritualId.startsWith('ritual_') || ritualId.startsWith('ritual-')) {
    return 'Custom Practice';
  }
  return ritualId
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function mapMemoryTypeToUIType(memType: string, _personaId?: string): string {
  const typeMap: Record<string, string> = {
    // Facts
    fund: 'fact',
    stock: 'fact',
    company: 'fact',
    merchant: 'fact',
    bill: 'fact',
    date: 'fact',
    venue: 'fact',
    contact_note: 'fact',
    // Preferences
    preference: 'preference',
    philosophy: 'preference',
    style: 'preference',
    music: 'preference',
    communication_preference: 'preference',
    destination: 'preference',
    // Goals
    savings_goal: 'goal',
    watchlist: 'goal',
    win: 'goal',
    // Patterns
    trigger: 'pattern',
    category: 'pattern',
    allocation: 'pattern',
    scheduling_note: 'pattern',
    // Relationships
    milestone: 'relationship',
    inside_joke: 'relationship',
    story: 'relationship',
    vendor: 'relationship',
  };
  return typeMap[memType] || 'fact';
}

function formatMemoryContent(memory: AnyRecord): string {
  let content = memory.name || '';

  if (memory.details) {
    content += `: ${memory.details}`;
  }
  if (memory.ticker) {
    content = `${memory.name} (${memory.ticker})`;
  }
  if (memory.reason) {
    content += ` - ${memory.reason}`;
  }
  if (memory.amount) {
    content += ` ($${memory.amount})`;
  }
  if (memory.targetAmount) {
    content += ` - Goal: $${memory.targetAmount}`;
  }
  if (memory.date && memory.type === 'date') {
    content += ` on ${memory.date}`;
  }
  if (memory.person) {
    content += ` (${memory.person})`;
  }

  return content;
}

function calculateConfidence(memory: AnyRecord): number {
  const referenceBoost = Math.min(0.3, (memory.timesReferenced || 0) * 0.05);
  const baseConfidence = 0.7 + referenceBoost;
  const sentimentBoost =
    memory.sentiment && memory.sentiment !== 'neutral' ? 0.05 : 0;
  return Math.min(0.99, baseConfidence + sentimentBoost);
}

function getPersonaName(personaId?: string): string {
  const names: Record<string, string> = {
    'jack-b': 'Ferni',
    'nayan-patel': 'Jack Bogle',
    'peter-john': 'Peter',
    'spend-save': 'Maya',
    'event-planner': 'Jordan',
    'comm-specialist': 'Alex',
  };
  return names[personaId || ''] || 'conversation';
}

function extractPatternsFromProfile(profile: AnyRecord | null): Pattern[] {
  const patterns: Pattern[] = [];
  if (!profile) return patterns;

  const totalConvos = profile.totalConversations || 1;

  // Emotional patterns
  if (profile.emotionalPatterns?.length) {
    for (const ep of profile.emotionalPatterns.slice(0, 3)) {
      if (ep.pattern) {
        patterns.push({
          id: `ep_${ep.pattern.slice(0, 10)}`,
          pattern: ep.pattern,
          frequency: ep.occurrences || 1,
          examples: ep.examples || [],
          category: 'emotional',
        });
      }
    }
  }

  // Communication style
  if (profile.communicationStyle && profile.communicationStyle !== 'unknown') {
    const styleDescriptions: Record<string, string> = {
      direct: 'You prefer direct, to-the-point communication',
      analytical: 'You like detailed analysis and data-driven discussions',
      warm: 'You appreciate warm, personable conversation',
      reflective: 'You value thoughtful, reflective exchanges',
      casual: 'You enjoy casual, relaxed conversations',
      formal: 'You prefer professional, structured discussions',
    };
    patterns.push({
      id: 'comm_style',
      pattern:
        styleDescriptions[profile.communicationStyle] ||
        `Prefers ${profile.communicationStyle} communication`,
      frequency: totalConvos,
      examples: [],
      category: 'communication',
    });
  }

  // Speaking pace
  if (profile.speakingPace && profile.speakingPace !== 'medium') {
    const paceMessages: Record<string, string> = {
      fast: 'You think quickly and prefer fast-paced exchanges',
      slow: 'You appreciate taking time to think things through',
      variable: 'Your pace varies depending on the topic',
    };
    patterns.push({
      id: 'speaking_pace',
      pattern:
        paceMessages[profile.speakingPace] ||
        `Prefers ${profile.speakingPace} speaking pace`,
      frequency: totalConvos,
      examples: [],
      category: 'communication',
    });
  }

  // Humor appreciation
  if (profile.humorAppreciation && profile.humorAppreciation !== 'medium') {
    patterns.push({
      id: 'humor',
      pattern:
        profile.humorAppreciation === 'high'
          ? 'You enjoy humor and lighter moments in our conversations'
          : 'You prefer to keep conversations focused and serious',
      frequency: totalConvos,
      examples: [],
      category: 'communication',
    });
  }

  // Preferred topics
  if (profile.preferredTopics?.length) {
    const topTopics = profile.preferredTopics.slice(0, 5);
    patterns.push({
      id: 'preferred_topics',
      pattern: `Topics you love: ${topTopics.join(', ')}`,
      frequency: topTopics.length,
      examples: topTopics,
      category: 'interests',
    });
  }

  // Avoid topics
  if (profile.avoidTopics?.length) {
    patterns.push({
      id: 'avoid_topics',
      pattern: 'I know to be careful around certain topics',
      frequency: profile.avoidTopics.length,
      examples: [],
      category: 'boundaries',
    });
  }

  // Response preferences
  if (profile.responseQuality?.preferences) {
    const prefs = profile.responseQuality.preferences;

    if (prefs.likesStories) {
      patterns.push({
        id: 'likes_stories',
        pattern: 'You engage well when I share stories and examples',
        frequency: totalConvos,
        examples: [],
        category: 'engagement',
      });
    }

    if (prefs.likesQuestions) {
      patterns.push({
        id: 'likes_questions',
        pattern: 'You appreciate when I ask thoughtful questions',
        frequency: totalConvos,
        examples: [],
        category: 'engagement',
      });
    }

    if (prefs.prefersDirectAdvice) {
      patterns.push({
        id: 'direct_advice',
        pattern: 'You prefer direct advice over open-ended exploration',
        frequency: totalConvos,
        examples: [],
        category: 'engagement',
      });
    }

    if (prefs.preferredResponseLength) {
      const lengthMessages: Record<string, string> = {
        brief: 'You prefer concise, to-the-point responses',
        moderate: 'You like balanced responses with good detail',
        lengthy: 'You appreciate thorough, detailed explanations',
      };
      patterns.push({
        id: 'response_length',
        pattern: lengthMessages[prefs.preferredResponseLength],
        frequency: totalConvos,
        examples: [],
        category: 'communication',
      });
    }

    if (prefs.highEngagementTopics?.length) {
      patterns.push({
        id: 'high_engagement_topics',
        pattern: `You light up when we discuss: ${prefs.highEngagementTopics.slice(0, 3).join(', ')}`,
        frequency: prefs.highEngagementTopics.length,
        examples: prefs.highEngagementTopics,
        category: 'interests',
      });
    }
  }

  // Conversation timing
  if (profile.conversationPatterns?.preferences) {
    const convPrefs = profile.conversationPatterns.preferences;

    if (convPrefs.preferredTimes?.length) {
      const timeLabel = convPrefs.preferredTimes.includes('morning')
        ? 'morning'
        : convPrefs.preferredTimes.includes('evening')
          ? 'evening'
          : convPrefs.preferredTimes[0];
      patterns.push({
        id: 'preferred_time',
        pattern: `You tend to chat most in the ${timeLabel}`,
        frequency: convPrefs.preferredTimes.length,
        examples: [],
        category: 'timing',
      });
    }

    if (convPrefs.likesSmallTalkFirst) {
      patterns.push({
        id: 'small_talk',
        pattern: 'You appreciate warming up with small talk before diving in',
        frequency: totalConvos,
        examples: [],
        category: 'communication',
      });
    }

    if (convPrefs.prefersQuickConversations) {
      patterns.push({
        id: 'quick_convos',
        pattern: 'You tend to prefer focused, shorter conversations',
        frequency: totalConvos,
        examples: [],
        category: 'timing',
      });
    }

    if (convPrefs.avgDuration) {
      const avgMins = Math.round(convPrefs.avgDuration);
      if (avgMins > 0) {
        patterns.push({
          id: 'avg_duration',
          pattern: `Our conversations typically last around ${avgMins} minutes`,
          frequency: totalConvos,
          examples: [],
          category: 'timing',
        });
      }
    }
  }

  // Voice preferences
  if (profile.voicePace?.preferences) {
    const vp = profile.voicePace.preferences;

    if (vp.preferredTempo) {
      patterns.push({
        id: 'voice_tempo',
        pattern: `You respond best when I match your ${vp.preferredTempo} speaking rhythm`,
        frequency: totalConvos,
        examples: [],
        category: 'voice',
      });
    }

    if (vp.recommendedResponseLength) {
      const lengthMsg: Record<string, string> = {
        brief: 'I keep my spoken responses short and punchy for you',
        moderate: 'I aim for balanced responses when we talk',
        detailed: 'I know you appreciate when I elaborate verbally',
      };
      if (lengthMsg[vp.recommendedResponseLength]) {
        patterns.push({
          id: 'voice_length',
          pattern: lengthMsg[vp.recommendedResponseLength],
          frequency: totalConvos,
          examples: [],
          category: 'voice',
        });
      }
    }
  }

  // Life stage
  if (profile.lifeStage && profile.lifeStage !== 'unknown') {
    const stageMessages: Record<string, string> = {
      student: "You're in a learning and exploration phase of life",
      early_career: "You're building your career and establishing foundations",
      mid_career: "You're in a phase of career growth and family building",
      established: "You're in an established phase with different priorities",
      pre_retirement: "You're thinking ahead to retirement transitions",
      retired: "You're in a new chapter focused on what matters most",
      young_adult: "You're navigating the exciting transition to independence",
      new_parent: 'Parenthood has added wonderful new dimensions to your life',
    };
    if (stageMessages[profile.lifeStage]) {
      patterns.push({
        id: 'life_stage',
        pattern: stageMessages[profile.lifeStage],
        frequency: 1,
        examples: [],
        category: 'life',
      });
    }
  }

  // Relationship depth
  if (profile.relationshipStage) {
    const stageMessages: Record<string, string> = {
      stranger: "We're just getting to know each other",
      'getting-started': "We're building the foundation of our relationship",
      'building-trust': 'Trust is growing between us',
      established: 'We have a solid, established relationship',
      deep: "We've developed a deep connection",
    };
    if (stageMessages[profile.relationshipStage]) {
      patterns.push({
        id: 'relationship_stage',
        pattern: stageMessages[profile.relationshipStage],
        frequency: totalConvos,
        examples: [],
        category: 'relationship',
      });
    }
  }

  // Key moments
  if (profile.keyMoments?.length) {
    patterns.push({
      id: 'key_moments',
      pattern: `We've shared ${profile.keyMoments.length} meaningful moment${profile.keyMoments.length > 1 ? 's' : ''} together`,
      frequency: profile.keyMoments.length,
      examples: profile.keyMoments.slice(0, 3).map((m: AnyRecord) => m.description || m.type || ''),
      category: 'relationship',
    });
  }

  // Family connections
  if (profile.familyMembers?.length) {
    patterns.push({
      id: 'family_mentioned',
      pattern: `I know about ${profile.familyMembers.length} important ${profile.familyMembers.length === 1 ? 'person' : 'people'} in your life`,
      frequency: profile.familyMembers.length,
      examples: profile.familyMembers.slice(0, 3).map((f: AnyRecord) => f.name || f.relationship || ''),
      category: 'relationships',
    });
  }

  // Open threads
  if (profile.openThreads?.length) {
    const openCount = profile.openThreads.filter((t: AnyRecord) => t.status === 'open').length;
    if (openCount > 0) {
      patterns.push({
        id: 'open_threads',
        pattern: `We have ${openCount} conversation${openCount > 1 ? 's' : ''} to continue`,
        frequency: openCount,
        examples: profile.openThreads.slice(0, 3).map((t: AnyRecord) => t.topic || ''),
        category: 'continuity',
      });
    }
  }

  // Humanizing state
  if (profile.humanizingState) {
    const hs = profile.humanizingState;

    if (hs.vulnerabilityMoments && hs.vulnerabilityMoments > 0) {
      patterns.push({
        id: 'vulnerability',
        pattern: `I've opened up to you ${hs.vulnerabilityMoments} time${hs.vulnerabilityMoments > 1 ? 's' : ''}`,
        frequency: hs.vulnerabilityMoments,
        examples: [],
        category: 'relationship',
      });
    }

    if (hs.storiesTold?.length) {
      patterns.push({
        id: 'stories_told',
        pattern: `I've shared ${hs.storiesTold.length} personal stor${hs.storiesTold.length === 1 ? 'y' : 'ies'} with you`,
        frequency: hs.storiesTold.length,
        examples: [],
        category: 'relationship',
      });
    }

    if (hs.perPersonaRelationshipStage) {
      const deepRelationships = Object.entries(hs.perPersonaRelationshipStage)
        .filter(([_, stage]) => stage === 'trusted_advisor' || stage === 'friend')
        .map(([persona]) => getPersonaName(persona));

      if (deepRelationships.length > 0) {
        patterns.push({
          id: 'deep_persona_bonds',
          pattern: `You have strong bonds with: ${deepRelationships.join(', ')}`,
          frequency: deepRelationships.length,
          examples: deepRelationships,
          category: 'relationship',
        });
      }
    }
  }

  // Financial context
  if (profile.investmentExperience && profile.investmentExperience !== 'unknown') {
    const expMessages: Record<string, string> = {
      beginner: "You're newer to investing - I focus on fundamentals",
      intermediate: 'You have solid investment knowledge',
      experienced: "You're an experienced investor",
    };
    if (expMessages[profile.investmentExperience]) {
      patterns.push({
        id: 'investment_exp',
        pattern: expMessages[profile.investmentExperience],
        frequency: 1,
        examples: [],
        category: 'knowledge',
      });
    }
  }

  if (profile.riskProfile && profile.riskProfile !== 'unknown') {
    const riskMessages: Record<string, string> = {
      conservative: 'You prefer stability and lower-risk approaches',
      moderate: 'You balance growth with reasonable risk management',
      aggressive: "You're comfortable with higher risk for potential growth",
    };
    if (riskMessages[profile.riskProfile]) {
      patterns.push({
        id: 'risk_profile',
        pattern: riskMessages[profile.riskProfile],
        frequency: 1,
        examples: [],
        category: 'preferences',
      });
    }
  }

  if (profile.financialAnxietyTriggers?.length) {
    patterns.push({
      id: 'financial_sensitivity',
      pattern: "I'm mindful of certain financial topics that can feel stressful",
      frequency: profile.financialAnxietyTriggers.length,
      examples: [],
      category: 'boundaries',
    });
  }

  // Goals
  if (profile.goals?.length) {
    const activeGoals = profile.goals.filter(
      (g: AnyRecord) => g.status !== 'completed' && g.status !== 'abandoned'
    );
    if (activeGoals.length > 0) {
      patterns.push({
        id: 'active_goals',
        pattern: `You're working toward ${activeGoals.length} goal${activeGoals.length > 1 ? 's' : ''}`,
        frequency: activeGoals.length,
        examples: activeGoals.slice(0, 3).map((g: AnyRecord) => g.name || g.type || ''),
        category: 'goals',
      });
    }

    const completedGoals = profile.goals.filter((g: AnyRecord) => g.status === 'completed');
    if (completedGoals.length > 0) {
      patterns.push({
        id: 'completed_goals',
        pattern: `You've achieved ${completedGoals.length} goal${completedGoals.length > 1 ? 's' : ''} we discussed`,
        frequency: completedGoals.length,
        examples: completedGoals.slice(0, 3).map((g: AnyRecord) => g.name || g.type || ''),
        category: 'achievements',
      });
    }
  }

  // Total time together
  if (profile.totalMinutesTalked && profile.totalMinutesTalked > 10) {
    const hours = Math.floor(profile.totalMinutesTalked / 60);
    const mins = profile.totalMinutesTalked % 60;
    const timeStr =
      hours > 0
        ? `${hours} hour${hours > 1 ? 's' : ''}${mins > 0 ? ` and ${mins} minutes` : ''}`
        : `${mins} minutes`;
    patterns.push({
      id: 'time_together',
      pattern: `We've spent about ${timeStr} in conversation`,
      frequency: totalConvos,
      examples: [],
      category: 'relationship',
    });
  }

  return patterns;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/conversations - Get conversation history
 */
async function handleGetConversations(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 50, 500);

    const { getConversationHistoryService } = await import(
      '../services/conversation-history.js'
    );
    const historyService = getConversationHistoryService();
    const data = await historyService.getHistory(userId, limit);

    sendJSONCached(res, data, 60);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ error: err, userId }, 'Failed to get conversations');
    sendError(res, 'Failed to get conversations', 500);
  }
}

/**
 * GET /api/analytics/user - Get user progress analytics
 */
async function handleGetUserAnalytics(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as AnyRecord;
    const streaks = (await store.getAllStreaks(userId)) as AnyRecord[];
    const weatherHistory = (await store.getWeatherHistory(userId, 30)) as AnyRecord[];
    const predictions = (await store.getRecentPredictions(userId, 20)) as AnyRecord[];

    // Calculate analytics
    const completedPredictions = predictions.filter((p) => p.accuracy !== undefined);
    const averageAccuracy =
      completedPredictions.length > 0
        ? Math.round(
            completedPredictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) /
              completedPredictions.length
          )
        : null;

    // Find best day
    const dayCompletions: Record<string, number> = {};
    streaks.forEach((s) => {
      if (s.lastCompletedAt) {
        const day = new Date(s.lastCompletedAt).toLocaleDateString('en-US', {
          weekday: 'long',
        });
        dayCompletions[day] = (dayCompletions[day] || 0) + 1;
      }
    });
    const bestDay =
      Object.entries(dayCompletions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Mood trends
    const moodTrends = weatherHistory.slice(0, 14).map((w) => {
      const weather =
        typeof w.weather === 'object' ? w.weather : { primary: w.weather, energy: 'medium' };
      return {
        date: w.date,
        mood: weather.primary || 'cloudy',
        energy: weather.energy || 'medium',
      };
    });

    // Average mood
    const moodMap: Record<string, number> = {
      sunny: 5,
      'partly-cloudy': 4,
      cloudy: 3,
      rainy: 2,
      stormy: 1,
      foggy: 2,
      rainbow: 5,
    };
    const moodValues = moodTrends.map((m) => moodMap[m.mood] || 3);
    const averageMood =
      moodValues.length > 0
        ? moodValues.reduce((sum, v) => sum + v, 0) / moodValues.length
        : 3;

    // Streak trends
    const streakTrends: Array<{
      date: string;
      count: number;
      ritualId: string;
      personaId?: string;
    }> = [];
    const last14Days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return d.toISOString().split('T')[0];
    });

    for (const streak of streaks) {
      if (streak.lastCompletedAt) {
        for (let i = 0; i < Math.min(streak.currentStreak, 14); i++) {
          const d = new Date(streak.lastCompletedAt);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          if (last14Days.includes(dateStr)) {
            streakTrends.push({
              date: dateStr,
              count: 1,
              ritualId: streak.ritualId,
              personaId: streak.personaId,
            });
          }
        }
      }
    }

    // Prediction trends
    const predictionTrends = predictions
      .filter((p) => p.completedAt && p.accuracy !== undefined)
      .slice(0, 10)
      .map((p) => ({
        date: p.completedAt || p.createdAt,
        accuracy: p.accuracy,
        totalPredictions: Object.keys(p.predictions || {}).length,
      }));

    // Improvement areas
    const improvementAreas: string[] = [];
    const inconsistentRituals = streaks.filter(
      (s) => s.currentStreak === 0 && s.totalCompletions > 0
    );
    if (inconsistentRituals.length > 0) {
      improvementAreas.push('Some rituals could use more consistency');
    }
    const lowEnergyDays = moodTrends.filter((m) => m.energy === 'low').length;
    if (lowEnergyDays > moodTrends.length / 2) {
      improvementAreas.push(
        'Energy levels have been low - consider reviewing sleep or exercise habits'
      );
    }
    const pendingPredictions = predictions.filter((p) => !p.completedAt).length;
    if (pendingPredictions > 3) {
      improvementAreas.push('Try predictions in new categories');
    }

    // Most consistent ritual
    const sortedStreaks = [...streaks].sort((a, b) => b.longestStreak - a.longestStreak);
    const mostConsistentRitual = sortedStreaks[0]?.ritualId || null;

    const analytics = {
      totalDays: profile.totalRitualDays || 0,
      totalRituals: streaks.reduce((sum, s) => sum + (s.totalCompletions || 0), 0),
      currentLongestStreak: Math.max(...streaks.map((s) => s.currentStreak || 0), 0),
      averageMood: Math.round(averageMood * 10) / 10,
      predictionAccuracy: averageAccuracy,
      streakTrends,
      moodTrends,
      predictionTrends,
      bestDay,
      mostConsistentRitual: getRitualFriendlyName(mostConsistentRitual),
      improvementAreas,
    };

    sendJSONCached(res, analytics, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get user analytics');
    sendJSON(res, {
      error: 'Failed to get analytics',
      totalDays: 0,
      totalRituals: 0,
      currentLongestStreak: 0,
      averageMood: 0,
      predictionAccuracy: null,
      streakTrends: [],
      moodTrends: [],
      predictionTrends: [],
      bestDay: null,
      mostConsistentRitual: null,
      improvementAreas: [],
    }, 500);
  }
}

/**
 * GET /api/predictions - Get user predictions
 */
async function handleGetPredictions(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 20, 100);

    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();
    let predictions = (await store.getRecentPredictions(userId, limit)) as AnyRecord[];
    const profile = (await store.getProfile(userId)) as AnyRecord;

    // Auto-expire old predictions
    const EXPIRY_DAYS = 7;
    const expiryThreshold = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    predictions = predictions.map((p) => {
      if (!p.completedAt && new Date(p.createdAt).getTime() < expiryThreshold) {
        return { ...p, status: 'expired', expiredAt: new Date().toISOString() };
      }
      return p;
    });

    const validPredictions = predictions.filter((p) => p.status !== 'expired');
    const completedPredictions = validPredictions.filter((p) => p.accuracy !== undefined);
    const avgAccuracy =
      completedPredictions.length > 0
        ? Math.round(
            completedPredictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) /
              completedPredictions.length
          )
        : profile.stats?.predictionAccuracy || 0;

    sendJSONCached(res, {
      predictions,
      stats: {
        totalPredictions: profile.stats?.totalPredictions || 0,
        averageAccuracy: avgAccuracy,
        pendingCount: validPredictions.filter((p) => !p.completedAt).length,
        expiredCount: predictions.filter((p) => p.status === 'expired').length,
      },
    }, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get predictions');
    sendJSON(res, {
      error: 'Failed to get predictions',
      predictions: [],
      stats: { totalPredictions: 0, averageAccuracy: 0 },
    }, 500);
  }
}

/**
 * POST /api/predictions/:id/actuals - Update prediction with actual values
 */
async function handleUpdatePredictionActuals(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  predictionId: string
): Promise<void> {
  try {
    const body = await validateBody(req, res, UpdatePredictionActualsSchema);
    if (!body) return; // Validation failed

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();
    const result = await store.updatePredictionActuals(userId, predictionId, body.actuals);

    if (!result) {
      sendError(res, 'Prediction not found', 404);
      return;
    }

    sendJSON(res, result);
  } catch (err) {
    log.error({ error: err, predictionId }, 'Failed to update prediction');
    sendError(res, err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * GET /api/cognitive/memories - What I've Learned
 */
async function handleGetCognitiveMemories(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getAllUserMemories } = await import('../services/persona-memories.js');
    const { getDefaultStore } = await import('../memory/index.js');
    const { extractLearnedMemories } = await import('../services/learned-memories.js');

    const rawMemories = (await getAllUserMemories(userId)) as AnyRecord[];
    const store = getDefaultStore();
    const userProfile = (await store.getProfile(userId)) as AnyRecord | null;

    // Transform persona memories
    const personaMemories: UIMemory[] = rawMemories.map((m) => ({
      id: m.id,
      type: mapMemoryTypeToUIType(m.type, m.personaId),
      content: formatMemoryContent(m),
      confidence: calculateConfidence(m),
      source: getPersonaName(m.personaId),
      learnedAt: m.createdAt?.toISOString?.() || new Date().toISOString(),
      personaId: m.personaId,
      sourceType: 'persona_memory',
    }));

    // Extract from profile
    let profileMemories: UIMemory[] = [];
    let profilePatterns: Pattern[] = [];
    if (userProfile) {
      // Cast to satisfy extractLearnedMemories signature
      const profileData = extractLearnedMemories(userProfile as unknown as Parameters<typeof extractLearnedMemories>[0]);
      // The returned memories/patterns may have optional fields, normalize them
      profileMemories = (profileData.memories || []).map((m: AnyRecord) => ({
        id: m.id || '',
        type: m.type || 'fact',
        content: m.content || '',
        confidence: m.confidence ?? 0.7,
        source: m.source || 'profile',
        learnedAt: m.learnedAt || new Date().toISOString(),
        personaId: m.personaId,
        sourceType: m.sourceType || 'profile',
      }));
      profilePatterns = (profileData.patterns || []).map((p: AnyRecord) => ({
        id: p.id || '',
        pattern: p.pattern || '',
        frequency: p.frequency ?? 1,
        examples: p.examples || [],
        category: p.category || 'general',
      }));
    }

    // Deduplicate
    const seenContent = new Set(personaMemories.map((m) => m.content.toLowerCase()));
    const uniqueProfileMemories = profileMemories.filter(
      (m) => !seenContent.has(m.content.toLowerCase())
    );

    const allMemories = [...personaMemories, ...uniqueProfileMemories];
    allMemories.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime();
    });

    // Patterns
    const patterns = [...extractPatternsFromProfile(userProfile), ...profilePatterns];
    const seenPatterns = new Set<string>();
    const uniquePatterns = patterns.filter((p) => {
      if (seenPatterns.has(p.pattern)) return false;
      seenPatterns.add(p.pattern);
      return true;
    });

    const totalInteractions = userProfile?.totalConversations || 0;
    const knowledgeScore = Math.min(
      100,
      Math.round(allMemories.length * 3 + totalInteractions * 2 + uniquePatterns.length * 5)
    );

    sendJSONCached(res, {
      memories: allMemories,
      patterns: uniquePatterns,
      totalInteractions,
      knowledgeScore,
    }, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get cognitive memories');
    sendJSON(res, {
      memories: [],
      patterns: [],
      totalInteractions: 0,
      knowledgeScore: 0,
    }, 500);
  }
}

/**
 * DELETE /api/cognitive/memories/:id - Forget a specific memory
 */
async function handleDeleteMemory(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  memoryId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    let deleted = false;
    let deleteSource = '';

    // Try persona memories first
    const { forget } = await import('../services/persona-memories.js');
    const personaDeleted = await forget(memoryId);
    if (personaDeleted) {
      deleted = true;
      deleteSource = 'persona_memory';
    }

    // Try profile-based memories
    if (!deleted) {
      const { deleteMemoryFromProfile } = await import('../services/learned-memories.js');
      const { getDefaultStore } = await import('../memory/index.js');

      const store = getDefaultStore();
      const profile = await store.getProfile(userId);

      if (profile) {
        const result = deleteMemoryFromProfile(profile, memoryId);
        if (result.success) {
          await store.saveProfile(result.profile);
          deleted = true;
          deleteSource = result.deletedType || 'profile';
        }
      }
    }

    if (deleted) {
      log.info({ memoryId, source: deleteSource, userId }, 'Memory deleted');
      sendJSON(res, { success: true, memoryId, source: deleteSource });
    } else {
      sendError(res, 'Memory not found', 404);
    }
  } catch (err) {
    log.error({ error: err, memoryId, userId }, 'Failed to delete memory');
    sendError(res, err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * GET /api/rituals - Get user rituals
 */
async function handleGetRituals(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as AnyRecord;
    const streaks = await store.getAllStreaks(userId);
    const weatherHistory = await store.getWeatherHistory(userId, 30);

    sendJSONCached(res, {
      activeRituals: profile.activeRituals || [],
      streaks,
      weatherHistory,
      preferences: profile.preferences,
      stats: {
        totalRitualDays: profile.totalRitualDays,
        longestOverallStreak: profile.longestOverallStreak,
        totalSkyChecks: profile.stats?.totalSkyChecks || 0,
      },
    }, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get rituals');
    sendJSON(res, {
      error: 'Failed to get rituals',
      activeRituals: [],
      streaks: [],
      weatherHistory: [],
    }, 500);
  }
}

/**
 * POST /api/rituals - Create ritual
 */
async function handleCreateRitual(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  try {
    const body = await validateBody(req, res, CreateRitualSchema);
    if (!body) return; // Validation failed, 400 sent

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as AnyRecord;

    const ritualId = `ritual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    profile.activeRituals = profile.activeRituals || [];
    profile.activeRituals.push(ritualId);
    // Type assertion needed - the profile is compatible with EngagementProfile
    await store.saveProfile(profile as Parameters<typeof store.saveProfile>[0]);

    await store.saveRitualStreak(userId, {
      ritualId,
      personaId: body.ritual?.personaId || 'ferni',
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedAt: '', // Empty string = never completed
      totalCompletions: 0,
      streakHistory: [],
    });

    log.info({ ritualId, userId }, 'Ritual created');
    sendJSON(res, { success: true, ritualId }, 201);
  } catch (err) {
    log.error({ error: err }, 'Failed to create ritual');
    sendError(res, err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * DELETE /api/rituals/:id - Delete a ritual
 */
async function handleDeleteRitual(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  ritualId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as AnyRecord;

    if (profile.activeRituals) {
      profile.activeRituals = profile.activeRituals.filter((id: string) => id !== ritualId);
      await store.saveProfile(profile as Parameters<typeof store.saveProfile>[0]);
    }

    log.info({ ritualId, userId }, 'Ritual deleted');
    sendJSON(res, { success: true, ritualId });
  } catch (err) {
    log.error({ error: err, ritualId, userId }, 'Failed to delete ritual');
    sendError(res, err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * POST /api/rituals/:id/complete - Complete a ritual
 */
async function handleCompleteRitual(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  ritualId: string
): Promise<void> {
  try {
    const body = await validateBody(req, res, CompleteRitualSchema);
    if (!body) return; // Validation failed

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();

    let streak = (await store.getRitualStreak(userId, ritualId)) as AnyRecord | null;
    if (!streak) {
      sendError(res, 'Ritual not found', 404);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const lastCompleted = streak.lastCompletedAt?.split('T')[0];

    if (lastCompleted === today) {
      sendJSON(res, {
        success: true,
        message: 'Already completed today',
        streak: streak.currentStreak,
      });
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const wasConsecutive = lastCompleted === yesterday;
    const wasNeverCompleted = !lastCompleted;

    if (wasConsecutive) {
      streak.currentStreak = streak.currentStreak + 1;
    } else {
      if (streak.currentStreak > 0 && !wasNeverCompleted) {
        streak.streakHistory = streak.streakHistory || [];
        streak.streakHistory.push({
          endedAt: streak.lastCompletedAt!,
          length: streak.currentStreak,
          reason: 'missed_day',
        });
      }
      streak.currentStreak = 1;
    }

    streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
    streak.totalCompletions++;
    streak.lastCompletedAt = new Date().toISOString();

    await store.saveRitualStreak(userId, streak as Parameters<typeof store.saveRitualStreak>[1]);

    if (body.weather) {
      // Cast weather to the expected EmotionalWeather type
      await store.recordWeather(userId, {
        date: new Date().toISOString(),
        weather: body.weather as Parameters<typeof store.recordWeather>[1]['weather'],
        ritualId,
      });
    }

    const profile = (await store.getProfile(userId)) as AnyRecord;
    profile.totalRitualDays++;
    profile.longestOverallStreak = Math.max(
      profile.longestOverallStreak || 0,
      streak.currentStreak
    );
    profile.lastEngagementAt = new Date().toISOString();
    await store.saveProfile(profile as Parameters<typeof store.saveProfile>[0]);

    log.info({ ritualId, streak: streak.currentStreak, userId }, 'Ritual completed');

    const isMilestone = MILESTONES.includes(streak.currentStreak);
    const isPersonalBest =
      streak.currentStreak === streak.longestStreak && streak.currentStreak > 1;

    sendJSON(res, {
      success: true,
      streak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      totalCompletions: streak.totalCompletions,
      celebration:
        isMilestone || isPersonalBest
          ? {
              type: isMilestone ? 'milestone' : 'personal_best',
              milestone: streak.currentStreak,
              message: isMilestone
                ? getMilestoneMessage(streak.currentStreak)
                : `New personal best: ${streak.currentStreak} days!`,
            }
          : null,
    });
  } catch (err) {
    log.error({ error: err, ritualId }, 'Failed to complete ritual');
    sendError(res, err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * GET /api/huddles - Get team huddles
 */
async function handleGetHuddles(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../services/engagement-store.js');
    const store = await getEngagementStore();
    const profile = (await store.getProfile(userId)) as AnyRecord;

    sendJSONCached(res, {
      totalHuddles: profile.stats?.teamHuddlesAttended || 0,
      lastHuddleAt: profile.lastEngagementAt,
      recentHuddles: [],
    }, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get huddles');
    sendJSON(res, {
      error: 'Failed to get huddles',
      totalHuddles: 0,
      recentHuddles: [],
    }, 500);
  }
}

/**
 * GET /api/export/categories - Get exportable categories
 */
async function handleGetExportCategories(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getDataExportService } = await import('../services/data-export.js');
    const exportService = getDataExportService();
    const categories = await exportService.getExportableCategories(userId);

    sendJSON(res, { categories });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get export categories');
    sendJSON(res, { error: 'Failed to get categories', categories: [] }, 500);
  }
}

/**
 * POST /api/export - Export user data
 */
async function handleExportData(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  try {
    const body = await validateBody(req, res, ExportDataSchema);
    if (!body) return; // Validation failed

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    const { getDataExportService } = await import('../services/data-export.js');
    const exportService = getDataExportService();
    const data = await exportService.exportData(
      userId,
      body.format,
      body.categories || []
    );

    const contentType = body.format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `ferni-export-${new Date().toISOString().split('T')[0]}.${body.format}`;

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(data);
  } catch (err) {
    log.error({ error: err }, 'Failed to export data');
    sendError(res, err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * DELETE /api/export/all - GDPR data deletion
 */
async function handleDeleteAllData(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  try {
    const body = await validateBody(req, res, DeleteAllDataSchema);
    if (!body) return; // Validation failed (includes confirmDelete check)

    const userId = body.userId || requireUserId(req, res, parsedUrl);
    if (!userId) return;

    // Validator already ensures confirmDelete === true, but double-check
    if (body.confirmDelete !== true) {
      sendError(res, 'Must confirm deletion with confirmDelete: true', 400);
      return;
    }

    const { getDataExportService } = await import('../services/data-export.js');
    const exportService = getDataExportService();
    await exportService.deleteAllData(userId);

    log.info({ userId }, 'All user data deleted (GDPR request)');
    sendJSON(res, { success: true, message: 'All data deleted' });
  } catch (err) {
    log.error({ error: err }, 'Failed to delete data');
    sendError(res, err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * GET /api/relationship/progress - Get relationship progress
 */
async function handleGetRelationshipProgress(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getEngagementStore } = await import('../services/engagement-store.js');
    const { getConversationHistoryService } = await import(
      '../services/conversation-history.js'
    );

    const store = await getEngagementStore();
    const historyService = getConversationHistoryService();

    const profile = (await store.getProfile(userId)) as AnyRecord;
    const history = await historyService.getHistory(userId, 100);

    const totalConversations = history.totalSessions;
    const totalRitualDays = profile.totalRitualDays || 0;
    const engagementScore = totalConversations + totalRitualDays * 2;

    let stage = 'stranger';
    let stageNumber = 1;
    let nextStageAt: number | null = 5;

    if (engagementScore >= 100) {
      stage = 'family';
      stageNumber = 6;
      nextStageAt = null;
    } else if (engagementScore >= 50) {
      stage = 'confidant';
      stageNumber = 5;
      nextStageAt = 100;
    } else if (engagementScore >= 25) {
      stage = 'friend';
      stageNumber = 4;
      nextStageAt = 50;
    } else if (engagementScore >= 10) {
      stage = 'acquaintance';
      stageNumber = 3;
      nextStageAt = 25;
    } else if (engagementScore >= 5) {
      stage = 'familiar';
      stageNumber = 2;
      nextStageAt = 10;
    }

    sendJSONCached(res, {
      stage,
      stageNumber,
      engagementScore,
      nextStageAt,
      progress: nextStageAt
        ? Math.min(100, Math.round((engagementScore / nextStageAt) * 100))
        : 100,
      stats: {
        totalConversations,
        totalRitualDays,
        lastEngagement: profile.lastEngagementAt,
      },
    }, 60);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get relationship progress');
    sendJSON(res, {
      error: 'Failed to get progress',
      stage: 'stranger',
      stageNumber: 1,
      engagementScore: 0,
    }, 500);
  }
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

/**
 * Handle engagement API routes
 * @returns true if route was handled
 */
export async function handleEngagementRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting (100 requests per minute per IP)
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true; // Rate limited
  }

  // Require authentication for all engagement routes
  const auth = requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // Auth failed, 401 already sent
  }

  // GET /api/conversations
  if (pathname === '/api/conversations' && method === 'GET') {
    await handleGetConversations(req, res, parsedUrl);
    return true;
  }

  // GET /api/analytics/user
  if (pathname === '/api/analytics/user' && method === 'GET') {
    await handleGetUserAnalytics(req, res, parsedUrl);
    return true;
  }

  // GET /api/predictions
  if (pathname === '/api/predictions' && method === 'GET') {
    await handleGetPredictions(req, res, parsedUrl);
    return true;
  }

  // POST /api/predictions/:id/actuals
  const actualsMatch = pathname.match(/^\/api\/predictions\/([^/]+)\/actuals$/);
  if (actualsMatch && method === 'POST') {
    await handleUpdatePredictionActuals(req, res, parsedUrl, actualsMatch[1]);
    return true;
  }

  // GET /api/cognitive/memories
  if (pathname === '/api/cognitive/memories' && method === 'GET') {
    await handleGetCognitiveMemories(req, res, parsedUrl);
    return true;
  }

  // DELETE /api/cognitive/memories/:id
  const deleteMemoryMatch = pathname.match(/^\/api\/cognitive\/memories\/([^/]+)$/);
  if (deleteMemoryMatch && method === 'DELETE') {
    await handleDeleteMemory(req, res, parsedUrl, decodeURIComponent(deleteMemoryMatch[1]));
    return true;
  }

  // GET /api/rituals
  if (pathname === '/api/rituals' && method === 'GET') {
    await handleGetRituals(req, res, parsedUrl);
    return true;
  }

  // POST /api/rituals
  if (pathname === '/api/rituals' && method === 'POST') {
    await handleCreateRitual(req, res, parsedUrl);
    return true;
  }

  // DELETE /api/rituals/:id
  const deleteRitualMatch = pathname.match(/^\/api\/rituals\/([^/]+)$/);
  if (deleteRitualMatch && method === 'DELETE') {
    await handleDeleteRitual(req, res, parsedUrl, deleteRitualMatch[1]);
    return true;
  }

  // POST /api/rituals/:id/complete
  const completeMatch = pathname.match(/^\/api\/rituals\/([^/]+)\/complete$/);
  if (completeMatch && method === 'POST') {
    await handleCompleteRitual(req, res, parsedUrl, completeMatch[1]);
    return true;
  }

  // GET /api/huddles
  if (pathname === '/api/huddles' && method === 'GET') {
    await handleGetHuddles(req, res, parsedUrl);
    return true;
  }

  // GET /api/export/categories
  if (pathname === '/api/export/categories' && method === 'GET') {
    await handleGetExportCategories(req, res, parsedUrl);
    return true;
  }

  // POST /api/export
  if (pathname === '/api/export' && method === 'POST') {
    await handleExportData(req, res, parsedUrl);
    return true;
  }

  // DELETE /api/export/all
  if (pathname === '/api/export/all' && method === 'DELETE') {
    await handleDeleteAllData(req, res, parsedUrl);
    return true;
  }

  // GET /api/relationship/progress
  if (pathname === '/api/relationship/progress' && method === 'GET') {
    await handleGetRelationshipProgress(req, res, parsedUrl);
    return true;
  }

  // Route not handled
  return false;
}

