/**
 * Feedback Collection System
 *
 * Collects both explicit and implicit user feedback on tool usage to power
 * automated recommendations and experimentation.
 *
 * Explicit Feedback:
 * - Direct ratings (1-5 stars, thumbs up/down)
 * - Verbal feedback ("that was helpful", "that didn't work")
 * - Feature requests ("I wish I could...")
 *
 * Implicit Feedback:
 * - Tool success/failure rates
 * - Retry patterns (user asks same thing again)
 * - Abandonment (user changes topic after tool use)
 * - Follow-up questions (indicates incomplete result)
 * - Time to next turn (long pause = confusion?)
 * - Tool sequences (what tools are used together)
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type FeedbackType =
  | 'explicit_positive' // User said something positive
  | 'explicit_negative' // User said something negative
  | 'explicit_rating' // User gave a rating
  | 'implicit_success' // Tool worked (inferred from behavior)
  | 'implicit_failure' // Tool didn't work (inferred)
  | 'implicit_retry' // User tried again
  | 'implicit_abandon' // User gave up
  | 'implicit_followup' // User needed clarification
  | 'feature_request'; // User asked for something we don't have

export interface FeedbackRecord {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  agentId: string;

  // What was the feedback about?
  toolId: string | null;
  domain: string | null;

  // Feedback details
  type: FeedbackType;
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number; // -1 to 1 normalized

  // Context
  userMessage: string;
  toolResult?: string;

  // For feature requests
  requestedCapability?: string;

  // Metadata
  turnNumber: number;
  conversationLength: number;
}

export interface FeedbackSummary {
  toolId: string;
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  averageScore: number;
  retryRate: number;
  abandonRate: number;
  featureRequests: string[];
}

export interface ConversationContext {
  userId: string;
  sessionId: string;
  agentId: string;
  turnNumber: number;
  recentTools: string[];
  lastToolResult?: string;
}

// ============================================================================
// SENTIMENT DETECTION
// ============================================================================

/**
 * Detect sentiment from user message
 */
const POSITIVE_PATTERNS = [
  /\b(thanks?|thank you|great|perfect|awesome|excellent|wonderful|love it|helpful|worked|nice)\b/i,
  /\b(exactly what i (needed|wanted)|that's (it|perfect|great))\b/i,
  /\b(good job|well done|brilliant|amazing)\b/i,
  /👍|🎉|❤️|😊|🙏/,
];

const NEGATIVE_PATTERNS = [
  /\b(no|wrong|incorrect|didn't work|doesn't work|not what i|that's not)\b/i,
  /\b(confused|frustrat|annoyed|useless|terrible|awful|bad)\b/i,
  /\b(try again|one more time|let me rephrase)\b/i,
  /\b(i (said|meant|asked for)|you (misunderstood|got it wrong))\b/i,
  /👎|😤|😡|🙄/,
];

const RETRY_PATTERNS = [
  /\b(again|retry|try again|one more time|let's try)\b/i,
  /\b(no,? i (meant|said|want))\b/i,
  /\b(that's not (right|what i))\b/i,
];

const ABANDON_PATTERNS = [
  /\b(never ?mind|forget it|skip|move on|different|something else)\b/i,
  /\b(let's (talk about|do) something else)\b/i,
  /\b(change (topic|subject))\b/i,
];

const FOLLOWUP_PATTERNS = [
  /\b(what do you mean|can you explain|i don't understand)\b/i,
  /\b(more (details?|info|information))\b/i,
  /\b(how (do i|does|can i)|what (about|if))\b/i,
  /\?.*\?/, // Multiple questions
];

const FEATURE_REQUEST_PATTERNS = [
  /\b(i wish|it would be nice|can you|could you|is there a way)\b/i,
  /\b(do you (have|support)|are you able to)\b/i,
  /\b(feature|capability|function)\b/i,
];

function detectSentiment(message: string): {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
} {
  const lowerMessage = message.toLowerCase();

  let positiveMatches = 0;
  let negativeMatches = 0;

  for (const pattern of POSITIVE_PATTERNS) {
    if (pattern.test(message)) positiveMatches++;
  }

  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(message)) negativeMatches++;
  }

  if (positiveMatches > negativeMatches) {
    return { sentiment: 'positive', score: Math.min(positiveMatches * 0.3, 1) };
  } else if (negativeMatches > positiveMatches) {
    return { sentiment: 'negative', score: -Math.min(negativeMatches * 0.3, 1) };
  }

  return { sentiment: 'neutral', score: 0 };
}

function detectFeedbackType(message: string, context: ConversationContext): FeedbackType {
  // Check for feature requests first
  for (const pattern of FEATURE_REQUEST_PATTERNS) {
    if (pattern.test(message)) return 'feature_request';
  }

  // Check for retry patterns
  for (const pattern of RETRY_PATTERNS) {
    if (pattern.test(message)) return 'implicit_retry';
  }

  // Check for abandon patterns
  for (const pattern of ABANDON_PATTERNS) {
    if (pattern.test(message)) return 'implicit_abandon';
  }

  // Check for followup patterns
  for (const pattern of FOLLOWUP_PATTERNS) {
    if (pattern.test(message)) return 'implicit_followup';
  }

  // Check for explicit feedback
  const { sentiment, score } = detectSentiment(message);
  if (sentiment === 'positive' && score > 0.5) return 'explicit_positive';
  if (sentiment === 'negative' && score < -0.5) return 'explicit_negative';

  // Default based on whether a tool was just used
  if (context.recentTools.length > 0) {
    return sentiment === 'negative' ? 'implicit_failure' : 'implicit_success';
  }

  return 'implicit_success';
}

// ============================================================================
// CAPABILITY EXTRACTION
// ============================================================================

/**
 * Extract requested capability from feature request messages
 */
function extractRequestedCapability(message: string): string | undefined {
  // Common patterns for feature requests
  const patterns = [
    /i wish (?:you could|i could|there was a way to) (.+?)(?:\.|$)/i,
    /can you (.+?)(?:\?|$)/i,
    /is there a way to (.+?)(?:\?|$)/i,
    /do you (?:have|support) (.+?)(?:\?|$)/i,
    /i (?:want|need) (?:to|you to) (.+?)(?:\.|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

// ============================================================================
// FEEDBACK COLLECTOR SERVICE
// ============================================================================

export class FeedbackCollector {
  private feedbackBuffer: FeedbackRecord[] = [];
  private readonly BUFFER_SIZE = 100;
  private lastFeedbackByTool = new Map<string, FeedbackRecord>();

  // Aggregated stats
  private toolStats = new Map<
    string,
    {
      positive: number;
      negative: number;
      neutral: number;
      retries: number;
      abandons: number;
      total: number;
    }
  >();

  private featureRequests: Array<{
    capability: string;
    count: number;
    examples: string[];
  }> = [];

  // ==========================================================================
  // FEEDBACK COLLECTION
  // ==========================================================================

  /**
   * Process a user message and extract feedback
   */
  processFeedback(
    message: string,
    context: ConversationContext,
    lastToolId?: string
  ): FeedbackRecord | null {
    const feedbackType = detectFeedbackType(message, context);
    const { sentiment, score } = detectSentiment(message);

    // Skip if this doesn't seem like feedback
    if (feedbackType === 'implicit_success' && sentiment === 'neutral' && !lastToolId) {
      return null;
    }

    const record: FeedbackRecord = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      userId: context.userId,
      sessionId: context.sessionId,
      agentId: context.agentId,
      toolId: lastToolId || context.recentTools[0] || null,
      domain: null, // Would be filled from tool registry
      type: feedbackType,
      sentiment,
      score,
      userMessage: message,
      toolResult: context.lastToolResult,
      turnNumber: context.turnNumber,
      conversationLength: 0, // Would be updated
    };

    // Extract capability for feature requests
    if (feedbackType === 'feature_request') {
      record.requestedCapability = extractRequestedCapability(message);
      this.trackFeatureRequest(record.requestedCapability, message);
    }

    // Update stats
    this.updateStats(record);

    // Buffer the feedback
    this.feedbackBuffer.push(record);
    if (this.feedbackBuffer.length > this.BUFFER_SIZE) {
      void this.flush();
    }

    // Track last feedback per tool
    if (record.toolId) {
      this.lastFeedbackByTool.set(record.toolId, record);
    }

    getLogger().debug(
      {
        type: record.type,
        sentiment: record.sentiment,
        toolId: record.toolId,
        score: record.score,
      },
      '📝 Feedback collected'
    );

    return record;
  }

  /**
   * Record explicit rating (e.g., from UI thumbs up/down)
   */
  recordRating(
    toolId: string,
    rating: number, // 1-5 or -1/1 for thumbs
    context: ConversationContext
  ): void {
    // Normalize to -1 to 1
    const normalizedScore = rating <= 1 ? rating : (rating - 3) / 2;

    const record: FeedbackRecord = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      userId: context.userId,
      sessionId: context.sessionId,
      agentId: context.agentId,
      toolId,
      domain: null,
      type: 'explicit_rating',
      sentiment: normalizedScore > 0 ? 'positive' : normalizedScore < 0 ? 'negative' : 'neutral',
      score: normalizedScore,
      userMessage: '',
      turnNumber: context.turnNumber,
      conversationLength: 0,
    };

    this.updateStats(record);
    this.feedbackBuffer.push(record);

    getLogger().info({ toolId, rating, normalizedScore }, '⭐ Rating recorded');
  }

  // ==========================================================================
  // STATS & ANALYSIS
  // ==========================================================================

  /**
   * Update aggregated statistics
   */
  private updateStats(record: FeedbackRecord): void {
    if (!record.toolId) return;

    let stats = this.toolStats.get(record.toolId);
    if (!stats) {
      stats = { positive: 0, negative: 0, neutral: 0, retries: 0, abandons: 0, total: 0 };
      this.toolStats.set(record.toolId, stats);
    }

    stats.total++;

    if (record.sentiment === 'positive') stats.positive++;
    else if (record.sentiment === 'negative') stats.negative++;
    else stats.neutral++;

    if (record.type === 'implicit_retry') stats.retries++;
    if (record.type === 'implicit_abandon') stats.abandons++;
  }

  /**
   * Track feature requests
   */
  private trackFeatureRequest(capability: string | undefined, message: string): void {
    if (!capability) return;

    // Normalize capability
    const normalizedCapability = capability.toLowerCase().trim();

    // Find existing or create new
    const existing = this.featureRequests.find(
      (fr) =>
        fr.capability.toLowerCase().includes(normalizedCapability) ||
        normalizedCapability.includes(fr.capability.toLowerCase())
    );

    if (existing) {
      existing.count++;
      if (existing.examples.length < 5) {
        existing.examples.push(message.slice(0, 100));
      }
    } else {
      this.featureRequests.push({
        capability: normalizedCapability,
        count: 1,
        examples: [message.slice(0, 100)],
      });
    }
  }

  /**
   * Get feedback summary for a tool
   */
  getToolFeedback(toolId: string): FeedbackSummary | null {
    const stats = this.toolStats.get(toolId);
    if (!stats) return null;

    const { total } = stats;
    const avgScore = (stats.positive - stats.negative) / Math.max(total, 1);

    return {
      toolId,
      totalFeedback: total,
      positiveCount: stats.positive,
      negativeCount: stats.negative,
      neutralCount: stats.neutral,
      averageScore: avgScore,
      retryRate: stats.retries / Math.max(total, 1),
      abandonRate: stats.abandons / Math.max(total, 1),
      featureRequests: [],
    };
  }

  /**
   * Get all tool feedback summaries
   */
  getAllFeedback(): FeedbackSummary[] {
    const summaries: FeedbackSummary[] = [];

    for (const [toolId] of this.toolStats) {
      const summary = this.getToolFeedback(toolId);
      if (summary) summaries.push(summary);
    }

    return summaries.sort((a, b) => b.totalFeedback - a.totalFeedback);
  }

  /**
   * Get top feature requests
   */
  getTopFeatureRequests(
    limit = 10
  ): Array<{ capability: string; count: number; examples: string[] }> {
    return [...this.featureRequests].sort((a, b) => b.count - a.count).slice(0, limit);
  }

  /**
   * Get problematic tools (high negative feedback or retry rate)
   */
  getProblematicTools(): FeedbackSummary[] {
    return this.getAllFeedback().filter(
      (summary) =>
        summary.averageScore < -0.2 || summary.retryRate > 0.3 || summary.abandonRate > 0.2
    );
  }

  /**
   * Get highly rated tools
   */
  getTopRatedTools(limit = 10): FeedbackSummary[] {
    return this.getAllFeedback()
      .filter((s) => s.totalFeedback >= 5) // Minimum feedback threshold
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, limit);
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Flush feedback buffer to storage (Firestore)
   */
  async flush(): Promise<void> {
    if (this.feedbackBuffer.length === 0) return;

    // Import persistence service dynamically to avoid circular deps
    const { optimizationPersistence } = await import('../services/optimization-persistence.js');

    // Buffer all feedback for batch write
    for (const feedback of this.feedbackBuffer) {
      optimizationPersistence.bufferFeedback(feedback);
    }

    // Clear local buffer
    const count = this.feedbackBuffer.length;
    this.feedbackBuffer = [];

    // Trigger Firestore flush
    await optimizationPersistence.flushAll();

    // Also save aggregated summaries
    for (const [toolId] of this.toolStats) {
      const summary = this.getToolFeedback(toolId);
      if (summary) {
        await optimizationPersistence.saveFeedbackSummary(toolId, summary);
      }
    }

    getLogger().debug({ count }, '📝 Flushed feedback to Firestore');
  }

  /**
   * Get all buffered feedback
   */
  getBufferedFeedback(): FeedbackRecord[] {
    return [...this.feedbackBuffer];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const feedbackCollector = new FeedbackCollector();

export default feedbackCollector;
