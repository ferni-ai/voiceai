/**
 * Conversation Pattern Analyzer
 *
 * Learns user habits and patterns over time:
 * - When they typically call (morning person? night owl?)
 * - How long they like to chat
 * - Typical conversation flow (small talk → topic → wrap up)
 * - Topic sequences that work well
 * - Engagement patterns throughout conversation
 *
 * Jack learns: "This user calls Monday mornings, likes 10-min chats,
 *              always starts with weather then moves to portfolio"
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Time of day buckets
 */
export type TimeOfDay =
  | 'early_morning'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night';

/**
 * Day of week
 */
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/**
 * Conversation duration bucket
 */
export type DurationBucket = 'very_short' | 'short' | 'medium' | 'long' | 'extended';

/**
 * Opening style detected
 */
export type OpeningStyle =
  | 'quick_question' // "Hey, quick question about..."
  | 'social_greeting' // "Hey Jack! How are you?"
  | 'direct_topic' // Immediately into substance
  | 'check_in' // "Just checking in"
  | 'anxious_start' // Signs of worry/stress
  | 'casual_chat'; // Just want to talk

/**
 * A single conversation session record
 */
export interface ConversationSession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt: Date;

  // Timing
  dayOfWeek: DayOfWeek;
  timeOfDay: TimeOfDay;
  durationMinutes: number;
  durationBucket: DurationBucket;

  // Flow
  openingStyle: OpeningStyle;
  topicSequence: string[];
  peakEngagementTopics: string[];

  // Engagement curve (0-1 at each quarter)
  engagementCurve: [number, number, number, number];

  // Outcomes
  endedNaturally: boolean;
  hadGoodbye: boolean;
  userSatisfaction: 'positive' | 'neutral' | 'negative' | 'unknown';
  followUpScheduled: boolean;
}

/**
 * Learned patterns from conversation history
 */
export interface LearnedConversationPatterns {
  // Timing preferences
  preferredTimes: TimeOfDay[];
  preferredDays: DayOfWeek[];
  avgTimeBetweenConversations: number; // days

  // Duration patterns
  avgDuration: number;
  preferredDuration: DurationBucket;
  hasTimeConstraints: boolean; // Often rushes/ends early

  // Opening patterns
  typicalOpeningStyle: OpeningStyle;
  commonOpeningPhrases: string[];

  // Topic flow patterns
  commonTopicSequences: string[][]; // Common topic orderings
  preferredFirstTopic: string;
  topicsThatLeadToEngagement: string[];

  // Engagement patterns
  typicalEngagementCurve: [number, number, number, number];
  peakEngagementTime: 'early' | 'middle' | 'late';
  engagementDropoffPoint?: number; // Minutes in when engagement drops

  // Behavior patterns
  likesSmallTalkFirst: boolean;
  prefersQuickConversations: boolean;
  oftenReturnsToTopic: boolean; // Circles back to same topics

  // Stats
  totalSessions: number;
  lastUpdated: Date;
}

/**
 * Prediction for next conversation
 */
export interface ConversationPrediction {
  likelyTimeOfDay: TimeOfDay;
  likelyDuration: DurationBucket;
  likelyOpeningStyle: OpeningStyle;
  suggestedFirstTopic: string;
  suggestedTopicFlow: string[];
  warnings: string[]; // e.g., "User often rushes in morning"
}

// ============================================================================
// CONVERSATION PATTERN ANALYZER
// ============================================================================

export class ConversationPatternAnalyzer {
  private sessions: ConversationSession[] = [];
  private userId: string;
  private currentSession: Partial<ConversationSession> | null = null;

  constructor(userId: string, existingSessions?: ConversationSession[]) {
    this.userId = userId;
    if (existingSessions) {
      this.sessions = existingSessions;
    }
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  private getTimeOfDay(date: Date): TimeOfDay {
    const hour = date.getHours();
    if (hour < 6) return 'late_night';
    if (hour < 9) return 'early_morning';
    if (hour < 12) return 'morning';
    if (hour < 14) return 'midday';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  private getDayOfWeek(date: Date): DayOfWeek {
    const days: DayOfWeek[] = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    return days[date.getDay()];
  }

  private getDurationBucket(minutes: number): DurationBucket {
    if (minutes < 3) return 'very_short';
    if (minutes < 8) return 'short';
    if (minutes < 15) return 'medium';
    if (minutes < 30) return 'long';
    return 'extended';
  }

  private detectOpeningStyle(firstUserMessage: string): OpeningStyle {
    const lower = firstUserMessage.toLowerCase();

    if (/\b(quick question|real quick|quickly|one thing)\b/.test(lower)) {
      return 'quick_question';
    }
    if (/\b(how are you|how's it going|what's up|hey jack)\b/.test(lower)) {
      return 'social_greeting';
    }
    if (/\b(checking in|just wanted to|thought i'd)\b/.test(lower)) {
      return 'check_in';
    }
    if (/\b(worried|anxious|scared|nervous|stressed|concerned)\b/.test(lower)) {
      return 'anxious_start';
    }
    if (/^(hi|hey|hello|morning|evening)[\s,!.]*$/i.test(lower.trim())) {
      return 'casual_chat';
    }

    return 'direct_topic';
  }

  // ============================================================================
  // SESSION TRACKING
  // ============================================================================

  /**
   * Start tracking a new conversation session
   */
  startSession(firstUserMessage: string): void {
    const now = new Date();

    this.currentSession = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: this.userId,
      startedAt: now,
      dayOfWeek: this.getDayOfWeek(now),
      timeOfDay: this.getTimeOfDay(now),
      openingStyle: this.detectOpeningStyle(firstUserMessage),
      topicSequence: [],
      peakEngagementTopics: [],
      engagementCurve: [0.5, 0.5, 0.5, 0.5],
    };

    getLogger().info(
      {
        timeOfDay: this.currentSession.timeOfDay,
        openingStyle: this.currentSession.openingStyle,
      },
      'Conversation session started'
    );
  }

  /**
   * Record a topic discussed
   */
  recordTopic(topic: string, engagement: number): void {
    if (!this.currentSession) return;

    // Ensure arrays exist (should be initialized in startSession)
    const topicSequence = this.currentSession.topicSequence ?? [];
    const peakTopics = this.currentSession.peakEngagementTopics ?? [];

    if (!topicSequence.includes(topic)) {
      topicSequence.push(topic);
      this.currentSession.topicSequence = topicSequence;
    }

    if (engagement > 0.7 && !peakTopics.includes(topic)) {
      peakTopics.push(topic);
      this.currentSession.peakEngagementTopics = peakTopics;
    }
  }

  /**
   * Update engagement at a point in conversation
   */
  recordEngagement(minutesIn: number, totalExpectedMinutes: number, engagement: number): void {
    if (!this.currentSession) return;

    const progress = minutesIn / Math.max(totalExpectedMinutes, 10);
    let quarter: 0 | 1 | 2 | 3;

    if (progress < 0.25) quarter = 0;
    else if (progress < 0.5) quarter = 1;
    else if (progress < 0.75) quarter = 2;
    else quarter = 3;

    // Ensure engagementCurve exists (should be initialized in startSession)
    const engagementCurve = this.currentSession.engagementCurve ?? [0, 0, 0, 0];

    // Update with weighted average
    const current = engagementCurve[quarter];
    engagementCurve[quarter] = (current + engagement) / 2;
    this.currentSession.engagementCurve = engagementCurve;
  }

  /**
   * End the current session
   */
  endSession(options: {
    endedNaturally: boolean;
    hadGoodbye: boolean;
    userSatisfaction: 'positive' | 'neutral' | 'negative' | 'unknown';
    followUpScheduled: boolean;
  }): ConversationSession | null {
    if (!this.currentSession) return null;

    const now = new Date();
    const startedAt = this.currentSession.startedAt ?? now;
    const durationMinutes = Math.round((now.getTime() - startedAt.getTime()) / 60000);

    const session: ConversationSession = {
      ...(this.currentSession as ConversationSession),
      endedAt: now,
      durationMinutes,
      durationBucket: this.getDurationBucket(durationMinutes),
      ...options,
    };

    this.sessions.push(session);

    // Keep only last 100 sessions
    if (this.sessions.length > 100) {
      this.sessions = this.sessions.slice(-100);
    }

    this.currentSession = null;

    getLogger().info(
      {
        duration: durationMinutes,
        topics: session.topicSequence.length,
        satisfaction: options.userSatisfaction,
      },
      'Conversation session ended'
    );

    return session;
  }

  // ============================================================================
  // PATTERN ANALYSIS
  // ============================================================================

  /**
   * Analyze all sessions to learn patterns
   */
  analyzePatterns(): LearnedConversationPatterns {
    if (this.sessions.length < 2) {
      return this.getDefaultPatterns();
    }

    // Count frequencies
    const timeCounts: Record<TimeOfDay, number> = {} as Record<TimeOfDay, number>;
    const dayCounts: Record<DayOfWeek, number> = {} as Record<DayOfWeek, number>;
    const durationCounts: Record<DurationBucket, number> = {} as Record<DurationBucket, number>;
    const openingCounts: Record<OpeningStyle, number> = {} as Record<OpeningStyle, number>;
    const firstTopicCounts: Record<string, number> = {};
    const topicSequences: string[][] = [];

    let totalDuration = 0;
    let rushCount = 0;
    const engagementCurves: [number, number, number, number][] = [];
    const engagementByTopic: Record<string, number[]> = {};

    for (const session of this.sessions) {
      // Time/day
      timeCounts[session.timeOfDay] = (timeCounts[session.timeOfDay] || 0) + 1;
      dayCounts[session.dayOfWeek] = (dayCounts[session.dayOfWeek] || 0) + 1;
      durationCounts[session.durationBucket] = (durationCounts[session.durationBucket] || 0) + 1;
      openingCounts[session.openingStyle] = (openingCounts[session.openingStyle] || 0) + 1;

      totalDuration += session.durationMinutes;

      if (session.durationBucket === 'very_short' || !session.endedNaturally) {
        rushCount++;
      }

      // First topic
      if (session.topicSequence.length > 0) {
        const first = session.topicSequence[0];
        firstTopicCounts[first] = (firstTopicCounts[first] || 0) + 1;
      }

      // Topic sequences
      if (session.topicSequence.length >= 2) {
        topicSequences.push(session.topicSequence);
      }

      // Engagement
      engagementCurves.push(session.engagementCurve);

      for (const topic of session.peakEngagementTopics) {
        if (!engagementByTopic[topic]) engagementByTopic[topic] = [];
        engagementByTopic[topic].push(1.0);
      }
    }

    // Calculate preferred times (top 2)
    const sortedTimes = Object.entries(timeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([time]) => time as TimeOfDay);

    // Calculate preferred days (top 3)
    const sortedDays = Object.entries(dayCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([day]) => day as DayOfWeek);

    // Calculate typical opening
    const typicalOpening =
      (Object.entries(openingCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as OpeningStyle) ||
      'social_greeting';

    // Calculate preferred duration
    const preferredDuration =
      (Object.entries(durationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as DurationBucket) ||
      'medium';

    // Calculate avg engagement curve
    const avgCurve: [number, number, number, number] = [0, 0, 0, 0];
    for (const curve of engagementCurves) {
      for (let i = 0; i < 4; i++) {
        avgCurve[i] += curve[i];
      }
    }
    for (let i = 0; i < 4; i++) {
      avgCurve[i] /= engagementCurves.length;
    }

    // Find peak engagement time
    const maxEngagement = Math.max(...avgCurve);
    const peakIndex = avgCurve.indexOf(maxEngagement);
    const peakTime: 'early' | 'middle' | 'late' =
      peakIndex <= 1 ? 'early' : peakIndex === 2 ? 'middle' : 'late';

    // Find common topic sequences
    const sequenceStrings = topicSequences.map((s) => s.slice(0, 3).join('→'));
    const sequenceCounts: Record<string, number> = {};
    for (const seq of sequenceStrings) {
      sequenceCounts[seq] = (sequenceCounts[seq] || 0) + 1;
    }
    const commonSequences = Object.entries(sequenceCounts)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([seq]) => seq.split('→'));

    // Topics that lead to engagement
    const engagingTopics = Object.entries(engagementByTopic)
      .filter(([_, scores]) => scores.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([topic]) => topic);

    // Calculate time between conversations
    let totalGaps = 0;
    let gapCount = 0;
    const sortedSessions = [...this.sessions].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
    );
    for (let i = 1; i < sortedSessions.length; i++) {
      const gap =
        (sortedSessions[i].startedAt.getTime() - sortedSessions[i - 1].endedAt.getTime()) /
        (1000 * 60 * 60 * 24);
      if (gap < 30) {
        // Only count gaps < 30 days
        totalGaps += gap;
        gapCount++;
      }
    }

    // Detect if user likes small talk first
    const smallTalkOpenings =
      (openingCounts['social_greeting'] || 0) + (openingCounts['casual_chat'] || 0);
    const likesSmallTalk = smallTalkOpenings > this.sessions.length * 0.4;

    return {
      preferredTimes: sortedTimes,
      preferredDays: sortedDays,
      avgTimeBetweenConversations: gapCount > 0 ? totalGaps / gapCount : 7,

      avgDuration: totalDuration / this.sessions.length,
      preferredDuration,
      hasTimeConstraints: rushCount > this.sessions.length * 0.3,

      typicalOpeningStyle: typicalOpening,
      commonOpeningPhrases: [], // Would need NLP to extract

      commonTopicSequences: commonSequences,
      preferredFirstTopic:
        Object.entries(firstTopicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general',
      topicsThatLeadToEngagement: engagingTopics,

      typicalEngagementCurve: avgCurve,
      peakEngagementTime: peakTime,

      likesSmallTalkFirst: likesSmallTalk,
      prefersQuickConversations:
        preferredDuration === 'short' || preferredDuration === 'very_short',
      oftenReturnsToTopic: false, // Would need more analysis

      totalSessions: this.sessions.length,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get default patterns for new users
   */
  private getDefaultPatterns(): LearnedConversationPatterns {
    return {
      preferredTimes: ['morning', 'evening'],
      preferredDays: ['monday', 'wednesday', 'friday'],
      avgTimeBetweenConversations: 7,

      avgDuration: 10,
      preferredDuration: 'medium',
      hasTimeConstraints: false,

      typicalOpeningStyle: 'social_greeting',
      commonOpeningPhrases: [],

      commonTopicSequences: [],
      preferredFirstTopic: 'general',
      topicsThatLeadToEngagement: [],

      typicalEngagementCurve: [0.6, 0.7, 0.7, 0.6],
      peakEngagementTime: 'middle',

      likesSmallTalkFirst: true,
      prefersQuickConversations: false,
      oftenReturnsToTopic: false,

      totalSessions: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Predict what the next conversation will be like
   */
  predictNextConversation(): ConversationPrediction {
    const patterns = this.analyzePatterns();
    const warnings: string[] = [];

    // Timing prediction
    const now = new Date();
    const currentTime = this.getTimeOfDay(now);
    const isPreferredTime = patterns.preferredTimes.includes(currentTime);

    if (
      patterns.hasTimeConstraints &&
      (currentTime === 'morning' || currentTime === 'early_morning')
    ) {
      warnings.push('User often rushes in morning - keep responses concise');
    }

    // Suggest topic flow
    const suggestedFlow: string[] = [];
    if (patterns.likesSmallTalkFirst) {
      suggestedFlow.push('greeting/small talk');
    }
    if (patterns.preferredFirstTopic) {
      suggestedFlow.push(patterns.preferredFirstTopic);
    }
    if (patterns.topicsThatLeadToEngagement.length > 0) {
      suggestedFlow.push(...patterns.topicsThatLeadToEngagement.slice(0, 2));
    }

    return {
      likelyTimeOfDay: patterns.preferredTimes[0] || 'morning',
      likelyDuration: patterns.preferredDuration,
      likelyOpeningStyle: patterns.typicalOpeningStyle,
      suggestedFirstTopic: patterns.preferredFirstTopic,
      suggestedTopicFlow: suggestedFlow,
      warnings,
    };
  }

  /**
   * Get pattern guidance for prompt
   */
  getPatternGuidance(): string {
    const patterns = this.analyzePatterns();

    if (patterns.totalSessions < 3) {
      return ''; // Not enough data
    }

    const lines: string[] = [];

    if (patterns.prefersQuickConversations) {
      lines.push('• User prefers shorter conversations - be efficient');
    }

    if (patterns.likesSmallTalkFirst) {
      lines.push('• Start with small talk before diving into topics');
    } else {
      lines.push('• User prefers getting straight to the point');
    }

    if (patterns.hasTimeConstraints) {
      lines.push('• User often has limited time - check in on availability');
    }

    if (patterns.peakEngagementTime === 'early') {
      lines.push('• User most engaged early in conversation - cover important topics first');
    } else if (patterns.peakEngagementTime === 'late') {
      lines.push('• User warms up over time - save deeper topics for later');
    }

    if (patterns.topicsThatLeadToEngagement.length > 0) {
      lines.push(
        `• High-engagement topics: ${patterns.topicsThatLeadToEngagement.slice(0, 3).join(', ')}`
      );
    }

    return lines.length > 0 ? `[CONVERSATION PATTERNS]\n${lines.join('\n')}` : '';
  }

  /**
   * Get all sessions for persistence
   */
  getSessions(): ConversationSession[] {
    return [...this.sessions];
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const analyzers = new Map<string, ConversationPatternAnalyzer>();

export function getConversationPatternAnalyzer(
  userId: string,
  existingSessions?: ConversationSession[]
): ConversationPatternAnalyzer {
  let analyzer = analyzers.get(userId);
  if (!analyzer) {
    analyzer = new ConversationPatternAnalyzer(userId, existingSessions);
    analyzers.set(userId, analyzer);
  }
  return analyzer;
}

export function removeConversationPatternAnalyzer(userId: string): void {
  analyzers.delete(userId);
}

export default ConversationPatternAnalyzer;
