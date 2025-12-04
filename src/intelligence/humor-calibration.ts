/**
 * Humor Calibration Engine
 *
 * Learns what types of humor resonate with each user through:
 * - Tracking humor usage and user reactions
 * - Detecting laughter/engagement signals in voice and text
 * - Building personalized humor preferences
 * - Providing real-time guidance on when/how to be funny
 *
 * Humor Types:
 * - callbacks: Referencing earlier jokes/moments
 * - self_deprecating: Making fun of oneself
 * - observational: Commenting on shared situations
 * - dry_wit: Subtle, understated humor
 * - puns: Wordplay and word jokes
 * - playful: Light teasing and banter
 * - absurdist: Unexpected/surreal humor
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

export type HumorType =
  | 'callbacks'      // "Remember what I said about compound interest?"
  | 'self_deprecating' // "I may be AI, but even I know that's a bad idea"
  | 'observational'  // "Isn't it funny how we always check the market at 3am?"
  | 'dry_wit'        // "Another volatile day. How refreshing."
  | 'puns'           // "That's quite the interest-ing situation"
  | 'playful'        // Light teasing, banter
  | 'absurdist';     // Unexpected, surreal observations

export type HumorReaction =
  | 'laughed'        // User audibly laughed or typed "haha"
  | 'engaged'        // User responded positively, continued topic
  | 'acknowledged'   // User noticed but didn't engage (neutral)
  | 'ignored'        // User changed topic or gave minimal response
  | 'negative';      // User expressed discomfort or asked to stop

export interface HumorAttempt {
  id: string;
  timestamp: Date;
  type: HumorType;
  content: string;
  context: string;     // What triggered the humor (topic, emotion, etc.)
  reaction?: HumorReaction;
  reactionTimestamp?: Date;
}

export interface HumorPreferences {
  // Effectiveness scores (0-1) for each type
  typeScores: Record<HumorType, number>;
  
  // Preferred humor contexts
  goodContexts: string[];   // Topics/situations where humor works
  badContexts: string[];    // Topics/situations to avoid humor
  
  // Timing preferences
  preferredFrequency: 'frequent' | 'moderate' | 'rare';
  preferredTiming: 'early' | 'rapport_built' | 'tension_break';
  
  // Overall metrics
  totalAttempts: number;
  positiveReactions: number;
  averageScore: number;
  
  // Computed guidance
  shouldUseHumor: boolean;
  recommendedTypes: HumorType[];
}

export interface HumorGuidance {
  shouldAttempt: boolean;
  recommendedType?: HumorType;
  suggestedApproach?: string;
  avoidTypes: HumorType[];
  contextNote?: string;
  confidence: number;
}

// ============================================================================
// HUMOR DETECTION PATTERNS
// ============================================================================

const LAUGHTER_PATTERNS = [
  /\b(haha|hahaha|lol|lmao|rofl|😂|🤣|😄|😆)\b/i,
  /\b(that's funny|you're funny|made me laugh|cracked me up)\b/i,
  /\b(good one|nice one|ha|hehe)\b/i,
];

const POSITIVE_HUMOR_REACTIONS = [
  /\b(love that|i like that|keep it up|more of that)\b/i,
  /\b(you always|you crack me up|appreciate the humor)\b/i,
];

const NEGATIVE_HUMOR_REACTIONS = [
  /\b(not funny|stop|serious|please|don't joke)\b/i,
  /\b(this is important|not the time|inappropriate)\b/i,
];

const HUMOR_TYPE_PATTERNS: Record<HumorType, RegExp[]> = {
  callbacks: [
    /remember (what|when|how)/i,
    /as (i|we) (said|discussed)/i,
    /our (running|inside) joke/i,
    /you know (what|this)/i,
  ],
  self_deprecating: [
    /even (i|an ai|a robot)/i,
    /what do i know/i,
    /i'm (just|only)/i,
    /don't listen to me/i,
  ],
  observational: [
    /isn't it (funny|ironic|interesting)/i,
    /you ever notice/i,
    /typical|classic/i,
    /story of (my|our)/i,
  ],
  dry_wit: [
    /how (refreshing|surprising|unexpected)/i,
    /shocking|groundbreaking/i,
    /who would have thought/i,
  ],
  puns: [
    /interest-ing|cents|capital idea/i,
    /bank on|invested in|rich (in|with)/i,
  ],
  playful: [
    /oh come on|just kidding|i tease/i,
    /between (you and|us)/i,
    /don't tell anyone/i,
  ],
  absurdist: [
    /imagine if|what if|picture this/i,
    /alternate universe|parallel dimension/i,
  ],
};

// ============================================================================
// HUMOR CALIBRATION ENGINE
// ============================================================================

export class HumorCalibrationEngine {
  private attempts: HumorAttempt[] = [];
  private pendingAttempt: HumorAttempt | null = null;
  private userLaughsDetected = 0;
  private sessionHumorCount = 0;
  
  constructor() {
    getLogger().debug('HumorCalibrationEngine initialized');
  }

  // ============================================================================
  // HUMOR ATTEMPT RECORDING
  // ============================================================================

  /**
   * Record when humor is used in a response
   */
  recordHumorAttempt(
    content: string,
    context: string,
    type?: HumorType
  ): string {
    const detectedType = type || this.detectHumorType(content);
    
    const attempt: HumorAttempt = {
      id: `humor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      type: detectedType,
      content: content.slice(0, 200),
      context,
    };

    this.attempts.push(attempt);
    this.pendingAttempt = attempt;
    this.sessionHumorCount++;

    // Keep last 100 attempts
    if (this.attempts.length > 100) {
      this.attempts = this.attempts.slice(-100);
    }

    getLogger().debug({
      type: detectedType,
      context,
    }, 'Humor attempt recorded');

    return attempt.id;
  }

  /**
   * Detect what type of humor was used
   */
  private detectHumorType(content: string): HumorType {
    for (const [type, patterns] of Object.entries(HUMOR_TYPE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          return type as HumorType;
        }
      }
    }
    return 'observational'; // Default
  }

  // ============================================================================
  // REACTION ANALYSIS
  // ============================================================================

  /**
   * Analyze user response for humor reaction
   */
  analyzeReaction(
    userResponse: string,
    userLaughed?: boolean // From voice detection
  ): HumorReaction | null {
    if (!this.pendingAttempt) return null;

    let reaction: HumorReaction;

    // Check for laughter (voice or text)
    if (userLaughed || LAUGHTER_PATTERNS.some(p => p.test(userResponse))) {
      reaction = 'laughed';
      this.userLaughsDetected++;
    }
    // Check for positive engagement
    else if (POSITIVE_HUMOR_REACTIONS.some(p => p.test(userResponse))) {
      reaction = 'engaged';
    }
    // Check for negative reaction
    else if (NEGATIVE_HUMOR_REACTIONS.some(p => p.test(userResponse))) {
      reaction = 'negative';
    }
    // Check response length/engagement
    else if (userResponse.length > 50) {
      reaction = 'engaged';
    }
    else if (userResponse.length < 15) {
      reaction = 'ignored';
    }
    else {
      reaction = 'acknowledged';
    }

    // Record reaction
    this.pendingAttempt.reaction = reaction;
    this.pendingAttempt.reactionTimestamp = new Date();
    this.pendingAttempt = null;

    getLogger().debug({
      reaction,
      laughCount: this.userLaughsDetected,
    }, 'Humor reaction analyzed');

    return reaction;
  }

  /**
   * Record voice-detected laughter
   */
  recordVoiceLaughter(): void {
    this.userLaughsDetected++;
    
    if (this.pendingAttempt) {
      this.pendingAttempt.reaction = 'laughed';
      this.pendingAttempt.reactionTimestamp = new Date();
      this.pendingAttempt = null;
    }

    getLogger().debug('Voice laughter detected');
  }

  // ============================================================================
  // PREFERENCE CALCULATION
  // ============================================================================

  /**
   * Calculate humor preferences from history
   */
  calculatePreferences(): HumorPreferences {
    const typeScores: Record<HumorType, number> = {
      callbacks: 0.5,
      self_deprecating: 0.5,
      observational: 0.5,
      dry_wit: 0.5,
      puns: 0.5,
      playful: 0.5,
      absurdist: 0.5,
    };

    const typeAttempts: Record<HumorType, HumorAttempt[]> = {
      callbacks: [],
      self_deprecating: [],
      observational: [],
      dry_wit: [],
      puns: [],
      playful: [],
      absurdist: [],
    };

    const goodContexts = new Set<string>();
    const badContexts = new Set<string>();
    let positiveCount = 0;
    let totalReacted = 0;

    // Group attempts by type and calculate scores
    for (const attempt of this.attempts) {
      typeAttempts[attempt.type].push(attempt);

      if (attempt.reaction) {
        totalReacted++;
        const score = this.reactionToScore(attempt.reaction);
        
        if (score >= 0.7) {
          positiveCount++;
          goodContexts.add(attempt.context);
        } else if (score <= 0.3) {
          badContexts.add(attempt.context);
        }
      }
    }

    // Calculate per-type effectiveness
    for (const [type, attempts] of Object.entries(typeAttempts)) {
      if (attempts.length >= 2) {
        const reactedAttempts = attempts.filter(a => a.reaction);
        if (reactedAttempts.length > 0) {
          const avgScore = reactedAttempts.reduce(
            (sum, a) => sum + this.reactionToScore(a.reaction!),
            0
          ) / reactedAttempts.length;
          typeScores[type as HumorType] = avgScore;
        }
      }
    }

    // Calculate overall metrics
    const averageScore = totalReacted > 0
      ? this.attempts
          .filter(a => a.reaction)
          .reduce((sum, a) => sum + this.reactionToScore(a.reaction!), 0) / totalReacted
      : 0.5;

    // Determine frequency preference
    let preferredFrequency: 'frequent' | 'moderate' | 'rare' = 'moderate';
    if (averageScore > 0.7 && positiveCount > 3) {
      preferredFrequency = 'frequent';
    } else if (averageScore < 0.4 || this.attempts.filter(a => a.reaction === 'negative').length > 2) {
      preferredFrequency = 'rare';
    }

    // Get recommended types (score > 0.6)
    const recommendedTypes = (Object.entries(typeScores) as [HumorType, number][])
      .filter(([_, score]) => score > 0.6)
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type);

    return {
      typeScores,
      goodContexts: Array.from(goodContexts),
      badContexts: Array.from(badContexts),
      preferredFrequency,
      preferredTiming: positiveCount > 5 ? 'early' : 'rapport_built',
      totalAttempts: this.attempts.length,
      positiveReactions: positiveCount,
      averageScore,
      shouldUseHumor: averageScore >= 0.5 && preferredFrequency !== 'rare',
      recommendedTypes,
    };
  }

  private reactionToScore(reaction: HumorReaction): number {
    switch (reaction) {
      case 'laughed': return 1.0;
      case 'engaged': return 0.8;
      case 'acknowledged': return 0.5;
      case 'ignored': return 0.3;
      case 'negative': return 0.0;
    }
  }

  // ============================================================================
  // REAL-TIME GUIDANCE
  // ============================================================================

  /**
   * Get guidance on whether/how to use humor now
   */
  getHumorGuidance(
    currentContext: string,
    currentEmotion?: string,
    turnCount?: number
  ): HumorGuidance {
    const prefs = this.calculatePreferences();

    // Default: don't attempt humor in first few turns or during distress
    if ((turnCount || 0) < 3) {
      return {
        shouldAttempt: false,
        avoidTypes: [],
        contextNote: 'Build rapport first before attempting humor',
        confidence: 0.8,
      };
    }

    if (currentEmotion && ['fear', 'sadness', 'grief', 'anxiety'].includes(currentEmotion)) {
      return {
        shouldAttempt: false,
        avoidTypes: ['puns', 'absurdist', 'playful'],
        contextNote: 'User may be in emotional distress - hold humor',
        confidence: 0.9,
      };
    }

    // Check if context is known bad
    if (prefs.badContexts.includes(currentContext)) {
      return {
        shouldAttempt: false,
        avoidTypes: [],
        contextNote: `User hasn't responded well to humor about "${currentContext}"`,
        confidence: 0.7,
      };
    }

    // Check session frequency
    if (this.sessionHumorCount >= 5 && prefs.preferredFrequency !== 'frequent') {
      return {
        shouldAttempt: false,
        avoidTypes: [],
        contextNote: 'Already used humor several times this session',
        confidence: 0.6,
      };
    }

    // Build positive guidance
    if (!prefs.shouldUseHumor) {
      return {
        shouldAttempt: false,
        avoidTypes: Object.keys(prefs.typeScores) as HumorType[],
        contextNote: 'User generally prefers serious conversations',
        confidence: 0.7,
      };
    }

    // Recommend humor
    const recommendedType = prefs.recommendedTypes[0];
    const avoidTypes = (Object.entries(prefs.typeScores) as [HumorType, number][])
      .filter(([_, score]) => score < 0.4)
      .map(([type]) => type);

    return {
      shouldAttempt: true,
      recommendedType,
      suggestedApproach: this.getSuggestedApproach(recommendedType, currentContext),
      avoidTypes,
      contextNote: prefs.goodContexts.includes(currentContext)
        ? `User has responded well to humor about "${currentContext}"`
        : undefined,
      confidence: Math.min(prefs.averageScore + 0.1, 0.9),
    };
  }

  private getSuggestedApproach(type: HumorType, context: string): string {
    switch (type) {
      case 'callbacks':
        return 'Reference a shared moment or earlier joke';
      case 'self_deprecating':
        return 'Light self-deprecation about being an AI or about the topic';
      case 'observational':
        return `Make a relatable observation about ${context}`;
      case 'dry_wit':
        return 'Use understated, subtle irony';
      case 'puns':
        return 'Slip in a clever wordplay naturally';
      case 'playful':
        return 'Light teasing or banter';
      case 'absurdist':
        return 'Unexpected or surreal comparison';
    }
  }

  /**
   * Format guidance for LLM context injection
   */
  formatGuidanceForPrompt(): string {
    const prefs = this.calculatePreferences();
    const lines: string[] = [];

    if (!prefs.shouldUseHumor) {
      lines.push('[HUMOR] User prefers minimal humor. Keep it professional.');
    } else {
      lines.push(`[HUMOR] User responds well to humor (score: ${(prefs.averageScore * 100).toFixed(0)}%).`);
      
      if (prefs.recommendedTypes.length > 0) {
        lines.push(`Best types: ${prefs.recommendedTypes.slice(0, 2).join(', ')}`);
      }

      if (prefs.badContexts.length > 0) {
        lines.push(`Avoid humor about: ${prefs.badContexts.slice(0, 2).join(', ')}`);
      }
    }

    return lines.join(' ');
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Reset for new session
   */
  reset(): void {
    this.sessionHumorCount = 0;
    this.pendingAttempt = null;
    // Keep historical attempts for learning
    getLogger().debug('HumorCalibrationEngine session reset');
  }

  /**
   * Get session stats
   */
  getSessionStats() {
    return {
      humorAttempts: this.sessionHumorCount,
      laughsDetected: this.userLaughsDetected,
      pendingReaction: this.pendingAttempt !== null,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, HumorCalibrationEngine>();

export function getHumorCalibration(userId: string): HumorCalibrationEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new HumorCalibrationEngine());
  }
  return engines.get(userId)!;
}

export function removeHumorCalibration(userId: string): void {
  engines.delete(userId);
}

export function resetAllHumorCalibration(): void {
  for (const engine of engines.values()) {
    engine.reset();
  }
}

