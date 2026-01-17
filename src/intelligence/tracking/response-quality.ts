/**
 * Response Quality Tracker
 *
 * Learns what kind of responses resonate with each user by tracking:
 * - User engagement signals (expanded reply, short answer, topic change)
 * - Response types that work (stories, advice, questions, humor)
 * - Topics that generate positive engagement
 * - Response lengths that match user preferences
 *
 * Over time, Jack learns: "This user loves stories but wants brief advice"
 */

import { getLogger } from '../../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';

const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type of response Jack gave
 */
export type ResponseType =
  | 'story' // Jack shared a personal story
  | 'advice' // Direct financial advice
  | 'question' // Asked user a question
  | 'humor' // Joke or playful comment
  | 'empathy' // Emotional support/validation
  | 'explanation' // Educational content
  | 'encouragement' // Motivational message
  | 'reflection' // Thoughtful observation
  | 'factual' // Data/stats/numbers
  | 'mixed'; // Combination

/**
 * User's reaction to Jack's response
 */
export type UserReaction =
  | 'highly_engaged' // Long, enthusiastic reply with follow-ups
  | 'engaged' // Normal positive engagement
  | 'neutral' // Brief acknowledgment
  | 'disengaged' // Very short reply, topic change
  | 'negative' // Explicit negative feedback
  | 'clarification' // Asked for clarification (response unclear)
  | 'emotional' // Strong emotional reaction
  | 'continued' // User wanted more on the topic
  | 'redirected'; // User changed topic

/**
 * A single response quality signal
 */
export interface ResponseSignal {
  id: string;
  timestamp: Date;

  // What Jack said
  responseType: ResponseType;
  responseLength: 'brief' | 'moderate' | 'lengthy';
  topic: string;
  hadStory: boolean;
  hadHumor: boolean;
  hadQuestion: boolean;
  hadAdvice: boolean;

  // How user reacted
  userReaction: UserReaction;
  userResponseLength: number; // word count
  userAskedFollowUp: boolean;
  userShowedEmotion: boolean;
  engagementScore: number; // 0-1 composite score

  // Context
  conversationPhase: string;
  emotionalContext: string;
}

/**
 * Aggregated preferences learned over time
 */
export interface LearnedResponsePreferences {
  // Response type effectiveness (0-1 scores)
  storyEffectiveness: number;
  adviceEffectiveness: number;
  humorEffectiveness: number;
  questionEffectiveness: number;
  empathyEffectiveness: number;
  explanationEffectiveness: number;

  // Length preferences
  preferredResponseLength: 'brief' | 'moderate' | 'lengthy';
  lengthConfidence: number;

  // Topic engagement
  highEngagementTopics: string[];
  lowEngagementTopics: string[];

  // Patterns
  likesStories: boolean;
  likesHumor: boolean;
  likesQuestions: boolean;
  prefersDirectAdvice: boolean;
  needsMoreEmpathy: boolean;

  // Stats
  totalSignals: number;
  lastUpdated: Date;
}

/**
 * Response quality tracker per user
 */
export interface UserResponseQuality {
  userId: string;
  signals: ResponseSignal[];
  preferences: LearnedResponsePreferences;

  // Quick access stats
  avgEngagementScore: number;
  bestResponseType: ResponseType;
  worstResponseType: ResponseType;
}

// ============================================================================
// RESPONSE QUALITY TRACKER
// ============================================================================

export class ResponseQualityTracker {
  private signals: ResponseSignal[] = [];
  private userId: string;

  constructor(userId: string, existingSignals?: ResponseSignal[]) {
    this.userId = userId;
    if (existingSignals) {
      this.signals = existingSignals;
    }
  }

  /**
   * Analyze Jack's response to determine its type
   */
  analyzeResponse(response: string): {
    type: ResponseType;
    length: 'brief' | 'moderate' | 'lengthy';
    hadStory: boolean;
    hadHumor: boolean;
    hadQuestion: boolean;
    hadAdvice: boolean;
  } {
    // 🦀 Rust-accelerated word counting
    const wordCount = RUST_COUNTING_AVAILABLE
      ? countWordsRust(response)
      : response.split(/\s+/).length;
    const lower = response.toLowerCase();

    // Detect response elements
    const hadStory = /\b(when i|i remember|back in|years ago|one time|there was a)\b/i.test(
      response
    );
    const hadHumor =
      /\b(haha|joke|kidding|funny[laughter]😄|😂)\b/i.test(response) || /\!.*\!/i.test(response);
    const hadQuestion = response.includes('?');
    const hadAdvice = /\b(should|recommend|suggest|consider|try|important|make sure)\b/i.test(
      response
    );
    const hadEmpathy = /\b(understand|feel|tough|hard|sorry|hear you|with you)\b/i.test(response);
    const hadExplanation = /\b(means|because|reason|works|basically|essentially)\b/i.test(response);

    // Determine primary type
    let type: ResponseType = 'mixed';
    if (hadStory && wordCount > 50) type = 'story';
    else if (hadEmpathy && !hadAdvice) type = 'empathy';
    else if (hadAdvice && !hadStory) type = 'advice';
    else if (hadQuestion && wordCount < 30) type = 'question';
    else if (hadHumor && wordCount < 40) type = 'humor';
    else if (hadExplanation && wordCount > 40) type = 'explanation';

    // Determine length
    let length: 'brief' | 'moderate' | 'lengthy' = 'moderate';
    if (wordCount < 30) length = 'brief';
    else if (wordCount > 100) length = 'lengthy';

    return { type, length, hadStory, hadHumor, hadQuestion, hadAdvice };
  }

  /**
   * Analyze user's reaction to determine engagement
   */
  analyzeUserReaction(
    userResponse: string,
    previousTopic: string,
    emotion?: { primary: string; intensity: number }
  ): {
    reaction: UserReaction;
    engagementScore: number;
    askedFollowUp: boolean;
    showedEmotion: boolean;
  } {
    // 🦀 Rust-accelerated word counting
    const wordCount = RUST_COUNTING_AVAILABLE
      ? countWordsRust(userResponse)
      : userResponse.split(/\s+/).length;
    const lower = userResponse.toLowerCase();

    // Detect signals
    const askedFollowUp =
      userResponse.includes('?') ||
      /\b(tell me more|what about|how|why|can you)\b/i.test(userResponse);
    const showedEmotion = emotion
      ? emotion.intensity > 0.5
      : /\b(wow|amazing|great|love|hate|worried|scared|excited|thank)\b/i.test(userResponse);
    const changedTopic = /\b(anyway|actually|by the way|different|speaking of|what about)\b/i.test(
      userResponse
    );
    const shortResponse = wordCount < 5;
    const longResponse = wordCount > 30;
    const enthusiastic =
      /!/.test(userResponse) || /\b(yes|definitely|absolutely|exactly)\b/i.test(userResponse);
    const negative = /\b(no|not really|don't|disagree|wrong)\b/i.test(userResponse);
    const wantsMore = /\b(more|continue|go on|tell me|interested)\b/i.test(userResponse);
    const confused = /\b(what do you mean|don't understand|confused|huh|unclear)\b/i.test(
      userResponse
    );

    // Determine reaction
    let reaction: UserReaction = 'neutral';
    let engagementScore = 0.5;

    if (confused) {
      reaction = 'clarification';
      engagementScore = 0.4;
    } else if (negative && shortResponse) {
      reaction = 'negative';
      engagementScore = 0.1;
    } else if (changedTopic && shortResponse) {
      reaction = 'redirected';
      engagementScore = 0.3;
    } else if (shortResponse && !enthusiastic) {
      reaction = 'disengaged';
      engagementScore = 0.3;
    } else if (wantsMore || (longResponse && askedFollowUp)) {
      reaction = 'highly_engaged';
      engagementScore = 0.95;
    } else if (showedEmotion && longResponse) {
      reaction = 'emotional';
      engagementScore = 0.85;
    } else if (askedFollowUp) {
      reaction = 'continued';
      engagementScore = 0.8;
    } else if (enthusiastic || longResponse) {
      reaction = 'engaged';
      engagementScore = 0.7;
    }

    return { reaction, engagementScore, askedFollowUp, showedEmotion };
  }

  /**
   * Record a response quality signal
   */
  recordSignal(
    jackResponse: string,
    userResponse: string,
    topic: string,
    conversationPhase: string,
    emotion?: { primary: string; intensity: number }
  ): ResponseSignal {
    const responseAnalysis = this.analyzeResponse(jackResponse);
    const reactionAnalysis = this.analyzeUserReaction(userResponse, topic, emotion);

    const signal: ResponseSignal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),

      responseType: responseAnalysis.type,
      responseLength: responseAnalysis.length,
      topic,
      hadStory: responseAnalysis.hadStory,
      hadHumor: responseAnalysis.hadHumor,
      hadQuestion: responseAnalysis.hadQuestion,
      hadAdvice: responseAnalysis.hadAdvice,

      userReaction: reactionAnalysis.reaction,
      // 🦀 Rust-accelerated word counting
      userResponseLength: RUST_COUNTING_AVAILABLE
        ? countWordsRust(userResponse)
        : userResponse.split(/\s+/).length,
      userAskedFollowUp: reactionAnalysis.askedFollowUp,
      userShowedEmotion: reactionAnalysis.showedEmotion,
      engagementScore: reactionAnalysis.engagementScore,

      conversationPhase,
      emotionalContext: emotion?.primary || 'neutral',
    };

    this.signals.push(signal);

    // Keep only last 200 signals
    if (this.signals.length > 200) {
      this.signals = this.signals.slice(-200);
    }

    getLogger().debug(
      {
        responseType: signal.responseType,
        reaction: signal.userReaction,
        engagement: signal.engagementScore,
      },
      'Response quality signal recorded'
    );

    return signal;
  }

  /**
   * Calculate learned preferences from signals
   */
  calculatePreferences(): LearnedResponsePreferences {
    if (this.signals.length < 3) {
      return this.getDefaultPreferences();
    }

    // Calculate effectiveness by response type
    const typeScores: Record<ResponseType, number[]> = {
      story: [],
      advice: [],
      question: [],
      humor: [],
      empathy: [],
      explanation: [],
      encouragement: [],
      reflection: [],
      factual: [],
      mixed: [],
    };

    const lengthScores: Record<string, number[]> = {
      brief: [],
      moderate: [],
      lengthy: [],
    };

    const topicScores: Record<string, number[]> = {};

    for (const signal of this.signals) {
      // Type effectiveness
      typeScores[signal.responseType].push(signal.engagementScore);

      // Length effectiveness
      lengthScores[signal.responseLength].push(signal.engagementScore);

      // Topic engagement
      if (!topicScores[signal.topic]) topicScores[signal.topic] = [];
      topicScores[signal.topic].push(signal.engagementScore);
    }

    // Calculate averages
    const avgScore = (scores: number[]) =>
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;

    const storyScore = avgScore(typeScores.story);
    const adviceScore = avgScore(typeScores.advice);
    const humorScore = avgScore(typeScores.humor);
    const questionScore = avgScore(typeScores.question);
    const empathyScore = avgScore(typeScores.empathy);
    const explanationScore = avgScore(typeScores.explanation);

    // Determine preferred length
    const lengthAvgs = {
      brief: avgScore(lengthScores.brief),
      moderate: avgScore(lengthScores.moderate),
      lengthy: avgScore(lengthScores.lengthy),
    };
    const preferredLength = Object.entries(lengthAvgs).sort((a, b) => b[1] - a[1])[0][0] as
      | 'brief'
      | 'moderate'
      | 'lengthy';

    // High/low engagement topics
    const topicAvgs = Object.entries(topicScores)
      .map(([topic, scores]) => ({ topic, avg: avgScore(scores), count: scores.length }))
      .filter((t) => t.count >= 2); // Need at least 2 data points

    const highTopics = topicAvgs
      .filter((t) => t.avg > 0.7)
      .map((t) => t.topic)
      .slice(0, 10);
    const lowTopics = topicAvgs
      .filter((t) => t.avg < 0.4)
      .map((t) => t.topic)
      .slice(0, 5);

    return {
      storyEffectiveness: storyScore,
      adviceEffectiveness: adviceScore,
      humorEffectiveness: humorScore,
      questionEffectiveness: questionScore,
      empathyEffectiveness: empathyScore,
      explanationEffectiveness: explanationScore,

      preferredResponseLength: preferredLength,
      lengthConfidence: Math.max(...Object.values(lengthAvgs)) - 0.5,

      highEngagementTopics: highTopics,
      lowEngagementTopics: lowTopics,

      likesStories: storyScore > 0.65,
      likesHumor: humorScore > 0.6,
      likesQuestions: questionScore > 0.6,
      prefersDirectAdvice: adviceScore > 0.65 && storyScore < 0.5,
      needsMoreEmpathy: empathyScore > 0.75,

      totalSignals: this.signals.length,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get default preferences for new users
   */
  private getDefaultPreferences(): LearnedResponsePreferences {
    return {
      storyEffectiveness: 0.5,
      adviceEffectiveness: 0.5,
      humorEffectiveness: 0.5,
      questionEffectiveness: 0.5,
      empathyEffectiveness: 0.5,
      explanationEffectiveness: 0.5,

      preferredResponseLength: 'moderate',
      lengthConfidence: 0,

      highEngagementTopics: [],
      lowEngagementTopics: [],

      likesStories: true, // Default: everyone likes stories
      likesHumor: true,
      likesQuestions: true,
      prefersDirectAdvice: false,
      needsMoreEmpathy: false,

      totalSignals: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get response guidance based on learned preferences
   */
  getResponseGuidance(): string {
    const prefs = this.calculatePreferences();
    const lines: string[] = [];

    if (prefs.totalSignals < 5) {
      return ''; // Not enough data yet
    }

    // Response style guidance
    if (prefs.likesStories) {
      lines.push('• User enjoys your stories - feel free to share experiences');
    } else if (prefs.storyEffectiveness < 0.4) {
      lines.push('• Keep stories brief - user prefers direct information');
    }

    if (prefs.likesHumor) {
      lines.push('• Your humor lands well - keep the personality');
    } else if (prefs.humorEffectiveness < 0.4) {
      lines.push('• User prefers serious tone - save humor for special moments');
    }

    if (prefs.prefersDirectAdvice) {
      lines.push('• User values direct, actionable advice');
    }

    if (prefs.needsMoreEmpathy) {
      lines.push('• Extra empathy resonates - acknowledge their feelings');
    }

    // Length guidance
    if (prefs.lengthConfidence > 0.2) {
      const lengthMap = { brief: 'concise', moderate: 'balanced', lengthy: 'detailed' };
      lines.push(`• User prefers ${lengthMap[prefs.preferredResponseLength]} responses`);
    }

    // Topic guidance
    if (prefs.highEngagementTopics.length > 0) {
      lines.push(`• High engagement topics: ${prefs.highEngagementTopics.slice(0, 3).join(', ')}`);
    }

    return lines.length > 0 ? `[RESPONSE PREFERENCES]\n${lines.join('\n')}` : '';
  }

  /**
   * Get all signals for persistence
   */
  getSignals(): ResponseSignal[] {
    return [...this.signals];
  }

  /**
   * Get full quality data for persistence
   */
  getQualityData(): UserResponseQuality {
    const prefs = this.calculatePreferences();

    // Find best/worst response types
    const typeScores: Array<[ResponseType, number]> = [
      ['story', prefs.storyEffectiveness],
      ['advice', prefs.adviceEffectiveness],
      ['humor', prefs.humorEffectiveness],
      ['question', prefs.questionEffectiveness],
      ['empathy', prefs.empathyEffectiveness],
      ['explanation', prefs.explanationEffectiveness],
    ];

    const sorted = typeScores.sort((a, b) => b[1] - a[1]);

    return {
      userId: this.userId,
      signals: this.signals,
      preferences: prefs,
      avgEngagementScore:
        this.signals.length > 0
          ? this.signals.reduce((sum, s) => sum + s.engagementScore, 0) / this.signals.length
          : 0.5,
      bestResponseType: sorted[0][0],
      worstResponseType: sorted[sorted.length - 1][0],
    };
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const trackers = new Map<string, ResponseQualityTracker>();

export function getResponseQualityTracker(
  userId: string,
  existingSignals?: ResponseSignal[]
): ResponseQualityTracker {
  let tracker = trackers.get(userId);
  if (!tracker) {
    tracker = new ResponseQualityTracker(userId, existingSignals);
    trackers.set(userId, tracker);
  }
  return tracker;
}

export function removeResponseQualityTracker(userId: string): void {
  trackers.delete(userId);
}

export default ResponseQualityTracker;
