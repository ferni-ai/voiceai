/**
 * Relationship Dashboard Service
 *
 * Makes Ferni's learning VISIBLE to users.
 * Shows the journey, patterns, and memories that make the relationship feel real.
 *
 * This is a key differentiator: no other AI shows "relationship progress."
 *
 * Dashboard components:
 * - Journey Overview: Conversations, hours together, milestones
 * - Emotional Patterns: When they open up, what topics resonate
 * - What We've Learned: Communication preferences, important people
 * - Things We Remember: Key quotes, breakthrough moments
 * - Team Connections: Which personas they've connected with
 *
 * @module @ferni/relationship-dashboard
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  UserProfile,
  KeyMoment,
  EmotionalPattern,
  FamilyMember,
} from '../../types/user-profile.js';

const log = createLogger({ module: 'RelationshipDashboard' });

// ============================================================================
// TYPES
// ============================================================================

export interface JourneyOverview {
  totalConversations: number;
  totalHoursTogether: number;
  firstConversation?: Date;
  longestSession: number; // minutes
  currentStreak: number; // days
  breakthroughMoments: number;
  goalsAchieved: number;
  relationshipStage: 'new_friend' | 'getting_to_know' | 'trusted_companion' | 'deep_connection';
}

export interface EmotionalPatternInsight {
  pattern: string;
  description: string;
  evidence: string;
  icon: string;
}

export interface LearnedPreference {
  category: 'communication' | 'timing' | 'topics' | 'support';
  insight: string;
  confidence: number;
  learnedFrom?: string;
}

export interface MemorableQuote {
  text: string;
  context: string;
  date: Date;
  significance: 'meaningful' | 'breakthrough' | 'turning_point';
}

export interface TeamConnection {
  personaId: string;
  personaName: string;
  conversationCount: number;
  topics: string[];
  connectionStrength: number; // 0-1
  lastInteraction?: Date;
}

export interface RelationshipDashboard {
  userId: string;
  generatedAt: Date;

  journey: JourneyOverview;
  emotionalPatterns: EmotionalPatternInsight[];
  learnedPreferences: LearnedPreference[];
  memorableQuotes: MemorableQuote[];
  teamConnections: TeamConnection[];

  // Summary for display
  headline: string;
  subheadline: string;
}

// ============================================================================
// DASHBOARD GENERATION
// ============================================================================

/**
 * Generate full relationship dashboard for a user
 */
export async function generateDashboard(
  userId: string,
  userProfile: UserProfile | null,
  additionalData?: {
    sessionHistory?: SessionHistoryEntry[];
    keyMoments?: KeyMoment[];
    emotionalPatterns?: EmotionalPattern[];
  }
): Promise<RelationshipDashboard> {
  const journey = buildJourneyOverview(userProfile, additionalData?.sessionHistory);
  const emotionalPatterns = extractEmotionalPatterns(
    userProfile,
    additionalData?.emotionalPatterns
  );
  const learnedPreferences = extractLearnedPreferences(userProfile);
  const memorableQuotes = extractMemorableQuotes(userProfile, additionalData?.keyMoments);
  const teamConnections = buildTeamConnections(userProfile);

  const { headline, subheadline } = generateSummary(journey, emotionalPatterns, userProfile);

  const dashboard: RelationshipDashboard = {
    userId,
    generatedAt: new Date(),
    journey,
    emotionalPatterns,
    learnedPreferences,
    memorableQuotes,
    teamConnections,
    headline,
    subheadline,
  };

  log.debug(
    {
      userId,
      conversations: journey.totalConversations,
      stage: journey.relationshipStage,
    },
    '📊 Dashboard generated'
  );

  return dashboard;
}

// ============================================================================
// JOURNEY OVERVIEW
// ============================================================================

interface SessionHistoryEntry {
  date: Date;
  durationMinutes: number;
  personaId: string;
  hadBreakthrough?: boolean;
}

function buildJourneyOverview(
  profile: UserProfile | null,
  sessionHistory?: SessionHistoryEntry[]
): JourneyOverview {
  const totalConversations = profile?.totalConversations || 0;
  const totalMinutes = profile?.totalMinutesTalked || 0;
  const totalHoursTogether = Math.round((totalMinutes / 60) * 10) / 10;

  // Calculate longest session
  let longestSession = 0;
  if (sessionHistory) {
    for (const session of sessionHistory) {
      if (session.durationMinutes > longestSession) {
        longestSession = session.durationMinutes;
      }
    }
  }

  // Calculate current streak
  let currentStreak = 0;
  if (sessionHistory && sessionHistory.length > 0) {
    const sortedSessions = [...sessionHistory].sort((a, b) => b.date.getTime() - a.date.getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let checkDate = new Date(today);
    for (const session of sortedSessions) {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor(
        (checkDate.getTime() - sessionDate.getTime()) / (24 * 60 * 60 * 1000)
      );

      if (daysDiff <= 1) {
        currentStreak++;
        checkDate = sessionDate;
      } else {
        break;
      }
    }
  }

  // Count breakthroughs
  const breakthroughMoments = sessionHistory?.filter((s) => s.hadBreakthrough).length || 0;

  // Determine relationship stage
  let relationshipStage: JourneyOverview['relationshipStage'] = 'new_friend';
  if (totalConversations >= 50) {
    relationshipStage = 'deep_connection';
  } else if (totalConversations >= 20) {
    relationshipStage = 'trusted_companion';
  } else if (totalConversations >= 5) {
    relationshipStage = 'getting_to_know';
  }

  return {
    totalConversations,
    totalHoursTogether,
    firstConversation: profile?.firstContact,
    longestSession,
    currentStreak,
    breakthroughMoments,
    goalsAchieved: profile?.goals?.filter((g) => g.status === 'achieved').length || 0,
    relationshipStage,
  };
}

// ============================================================================
// EMOTIONAL PATTERNS
// ============================================================================

function extractEmotionalPatterns(
  profile: UserProfile | null,
  patterns?: EmotionalPattern[]
): EmotionalPatternInsight[] {
  const insights: EmotionalPatternInsight[] = [];

  // Topic-based patterns from EmotionalPattern
  if (patterns && patterns.length > 0) {
    // Find recurring emotional themes by trigger
    const triggerEmotions = new Map<string, string[]>();

    for (const pattern of patterns) {
      // EmotionalPattern has trigger and emotion fields
      if (pattern.trigger && pattern.emotion) {
        const emotions = triggerEmotions.get(pattern.trigger) || [];
        emotions.push(pattern.emotion);
        triggerEmotions.set(pattern.trigger, emotions);
      }
    }

    // Generate insights from patterns
    for (const [trigger, emotions] of triggerEmotions) {
      if (emotions.length >= 2) {
        const dominantEmotion = findMostCommon(emotions);
        if (dominantEmotion) {
          insights.push({
            pattern: `${capitalize(trigger)} Talk`,
            description: `${capitalize(trigger)} conversations often bring up ${dominantEmotion} feelings`,
            evidence: `Noticed across ${emotions.length} conversations`,
            icon: getTopicEmoji(trigger),
          });
        }
      }
    }
  }

  // Energy patterns from verbosity preference
  if (profile?.preferences?.verbosity === 'storytelling') {
    insights.push({
      pattern: 'Story Lover',
      description: 'You appreciate when we share stories and examples',
      evidence: 'Based on engagement with narrative content',
      icon: '📖',
    });
  }

  // Humor appreciation pattern
  if (profile?.humorAppreciation === 'high') {
    insights.push({
      pattern: 'Humor Enthusiast',
      description: 'You enjoy lightness and humor in conversations',
      evidence: 'Based on your interactions',
      icon: '😄',
    });
  }

  return insights.slice(0, 5); // Limit to 5 most relevant
}

// ============================================================================
// LEARNED PREFERENCES
// ============================================================================

function extractLearnedPreferences(profile: UserProfile | null): LearnedPreference[] {
  const preferences: LearnedPreference[] = [];

  if (!profile) return preferences;

  // Communication style (from communicationStyle at profile level)
  // CommunicationStyle is: 'formal' | 'casual' | 'playful' | 'mixed'
  if (profile.communicationStyle) {
    const style = profile.communicationStyle;
    preferences.push({
      category: 'communication',
      insight:
        style === 'formal'
          ? 'You prefer professional, thoughtful communication'
          : style === 'casual'
            ? 'You appreciate relaxed, casual conversation'
            : style === 'playful'
              ? 'You enjoy playful, light-hearted exchanges'
              : 'You like a mix of conversation styles',
      confidence: 0.8,
    });
  }

  // Response length preference
  if (profile.preferences?.verbosity) {
    const { verbosity } = profile.preferences;
    preferences.push({
      category: 'communication',
      insight:
        verbosity === 'concise'
          ? 'You prefer brief, to-the-point responses'
          : verbosity === 'storytelling'
            ? 'You enjoy detailed responses with stories'
            : 'You like balanced responses - not too short, not too long',
      confidence: 0.75,
    });
  }

  // Humor preference (from humorAppreciation at profile level)
  if (profile.humorAppreciation) {
    const humor = profile.humorAppreciation;
    if (humor === 'high') {
      preferences.push({
        category: 'communication',
        insight: 'You appreciate humor and lightness in conversations',
        confidence: 0.8,
      });
    }
  }

  // Important people (from family members)
  if (profile.familyMembers && profile.familyMembers.length > 0) {
    const importantPeople = profile.familyMembers
      .slice(0, 3)
      .map((p: FamilyMember) => p.name || p.relationship);
    preferences.push({
      category: 'topics',
      insight: `${importantPeople.join(', ')} are important people in your life`,
      confidence: 0.9,
      learnedFrom: 'Mentioned in conversations',
    });
  }

  // Support preference (inferred from proactive advice preference)
  if (profile.preferences?.wantsProactiveAdvice !== undefined) {
    const wantsAdvice = profile.preferences.wantsProactiveAdvice;
    preferences.push({
      category: 'support',
      insight: wantsAdvice
        ? 'You appreciate proactive suggestions and guidance'
        : 'You prefer to lead conversations and ask for advice when you need it',
      confidence: 0.7,
    });
  }

  return preferences;
}

// ============================================================================
// MEMORABLE QUOTES
// ============================================================================

function extractMemorableQuotes(
  profile: UserProfile | null,
  keyMoments?: KeyMoment[]
): MemorableQuote[] {
  const quotes: MemorableQuote[] = [];

  if (keyMoments) {
    for (const moment of keyMoments) {
      // KeyMoment has summary, not userQuote - use summary for breakthrough moments
      if (moment.type === 'breakthrough' || moment.type === 'shared_vulnerability') {
        quotes.push({
          text: moment.summary,
          context: moment.topics.join(', ') || 'In conversation',
          date: moment.timestamp,
          significance: moment.type === 'breakthrough' ? 'breakthrough' : 'meaningful',
        });
      }
    }
  }

  // Sort by significance then date
  quotes.sort((a, b) => {
    const sigOrder = { breakthrough: 0, turning_point: 1, meaningful: 2 };
    const sigDiff = sigOrder[a.significance] - sigOrder[b.significance];
    if (sigDiff !== 0) return sigDiff;
    return b.date.getTime() - a.date.getTime();
  });

  return quotes.slice(0, 5); // Top 5 quotes
}

// ============================================================================
// TEAM CONNECTIONS
// ============================================================================

function buildTeamConnections(profile: UserProfile | null): TeamConnection[] {
  const connections: TeamConnection[] = [];

  // UserProfile doesn't have personaInteractions - use customData if available
  // or return placeholder based on preferred topics
  if (!profile) return connections;

  const personaNames: Record<string, string> = {
    ferni: 'Ferni',
    jack: 'Jack',
    peter: 'Peter',
    alex: 'Alex',
    maya: 'Maya',
    jordan: 'Jordan',
    nayan: 'Nayan',
  };

  // Check if personaInteractions exists in customData
  const personaInteractions = profile.customData?.personaInteractions as
    | Record<
        string,
        {
          conversationCount?: number;
          frequentTopics?: string[];
          lastInteraction?: Date;
        }
      >
    | undefined;

  if (personaInteractions) {
    for (const [personaId, interaction] of Object.entries(personaInteractions)) {
      const conversationCount = interaction.conversationCount || 0;
      if (conversationCount === 0) continue;

      connections.push({
        personaId,
        personaName: personaNames[personaId] || personaId,
        conversationCount,
        topics: interaction.frequentTopics || [],
        connectionStrength: Math.min(1, conversationCount / 20), // Max at 20 conversations
        lastInteraction: interaction.lastInteraction,
      });
    }
  } else {
    // Default: just Ferni with the total conversations
    connections.push({
      personaId: 'ferni',
      personaName: 'Ferni',
      conversationCount: profile.totalConversations,
      topics: profile.preferredTopics.slice(0, 3),
      connectionStrength: Math.min(1, profile.totalConversations / 20),
      lastInteraction: profile.lastContact,
    });
  }

  // Sort by connection strength
  connections.sort((a, b) => b.connectionStrength - a.connectionStrength);

  return connections;
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

function generateSummary(
  journey: JourneyOverview,
  patterns: EmotionalPatternInsight[],
  profile: UserProfile | null
): { headline: string; subheadline: string } {
  // Headline based on relationship stage
  let headline: string;
  switch (journey.relationshipStage) {
    case 'deep_connection':
      headline = 'A Real Connection';
      break;
    case 'trusted_companion':
      headline = 'Growing Together';
      break;
    case 'getting_to_know':
      headline = 'Building Trust';
      break;
    default:
      headline = 'Just Getting Started';
  }

  // Subheadline with specific stats
  const parts: string[] = [];

  if (journey.totalConversations > 0) {
    parts.push(`${journey.totalConversations} conversations`);
  }

  if (journey.totalHoursTogether > 0) {
    parts.push(`${journey.totalHoursTogether} hours together`);
  }

  if (journey.breakthroughMoments > 0) {
    parts.push(
      `${journey.breakthroughMoments} breakthrough${journey.breakthroughMoments > 1 ? 's' : ''}`
    );
  }

  if (journey.currentStreak > 2) {
    parts.push(`${journey.currentStreak}-day streak`);
  }

  const subheadline = parts.length > 0 ? parts.join(' · ') : 'Your journey is just beginning';

  return { headline, subheadline };
}

// ============================================================================
// UTILITIES
// ============================================================================

function findMostCommon<T>(arr: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon: T | undefined;

  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = item;
    }
  }

  return mostCommon;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getTopicEmoji(topic: string): string {
  const emojiMap: Record<string, string> = {
    work: '💼',
    family: '👨‍👩‍👧',
    relationships: '❤️',
    health: '🏃',
    money: '💰',
    career: '📈',
    stress: '😮‍💨',
    goals: '🎯',
    gratitude: '🙏',
    creativity: '🎨',
  };

  return emojiMap[topic.toLowerCase()] || '💭';
}

// ============================================================================
// API RESPONSE FORMATTING
// ============================================================================

/**
 * Format dashboard for API response
 */
export function formatDashboardForApi(dashboard: RelationshipDashboard): Record<string, unknown> {
  return {
    headline: dashboard.headline,
    subheadline: dashboard.subheadline,
    generatedAt: dashboard.generatedAt.toISOString(),

    journey: {
      conversations: dashboard.journey.totalConversations,
      hoursTogether: dashboard.journey.totalHoursTogether,
      streak: dashboard.journey.currentStreak,
      breakthroughs: dashboard.journey.breakthroughMoments,
      stage: dashboard.journey.relationshipStage,
      firstConversation: dashboard.journey.firstConversation?.toISOString(),
    },

    patterns: dashboard.emotionalPatterns.map((p) => ({
      name: p.pattern,
      description: p.description,
      icon: p.icon,
    })),

    preferences: dashboard.learnedPreferences.map((p) => ({
      category: p.category,
      insight: p.insight,
    })),

    memories: dashboard.memorableQuotes.map((q) => ({
      text: q.text,
      context: q.context,
      date: q.date.toISOString(),
      type: q.significance,
    })),

    team: dashboard.teamConnections.map((t) => ({
      id: t.personaId,
      name: t.personaName,
      conversations: t.conversationCount,
      strength: Math.round(t.connectionStrength * 100),
      topics: t.topics.slice(0, 3),
    })),
  };
}

/**
 * Format dashboard for prompt context
 */
export function formatDashboardForPrompt(dashboard: RelationshipDashboard): string {
  const lines: string[] = ['[RELATIONSHIP CONTEXT]'];

  lines.push(`Stage: ${dashboard.journey.relationshipStage.replace(/_/g, ' ')}`);
  lines.push(
    `Together: ${dashboard.journey.totalConversations} conversations, ${dashboard.journey.totalHoursTogether}h`
  );

  if (dashboard.emotionalPatterns.length > 0) {
    lines.push('');
    lines.push('Known patterns:');
    for (const pattern of dashboard.emotionalPatterns) {
      lines.push(`- ${pattern.pattern}: ${pattern.description}`);
    }
  }

  if (dashboard.learnedPreferences.length > 0) {
    lines.push('');
    lines.push('User prefers:');
    for (const pref of dashboard.learnedPreferences) {
      lines.push(`- ${pref.insight}`);
    }
  }

  if (dashboard.memorableQuotes.length > 0) {
    lines.push('');
    lines.push('Key moments:');
    for (const quote of dashboard.memorableQuotes.slice(0, 2)) {
      lines.push(`- "${quote.text.slice(0, 100)}..."`);
    }
  }

  return lines.join('\n');
}
