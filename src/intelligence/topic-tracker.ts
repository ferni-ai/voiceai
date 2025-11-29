/**
 * Topic Tracker
 *
 * Tracks conversation topics for multi-threading and context awareness.
 * Enables Jack to circle back to topics and maintain conversation coherence.
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Topic categories
 */
export type TopicCategory =
  | 'financial'
  | 'personal'
  | 'emotional'
  | 'market'
  | 'planning'
  | 'education'
  | 'general';

/**
 * A tracked topic
 */
export interface Topic {
  id: string;
  name: string;
  category: TopicCategory;
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;
  resolved: boolean;
  priority: 'high' | 'medium' | 'low';
  relatedTopics: string[];
  context: string[]; // Key phrases/sentences about this topic
  needsFollowUp: boolean;
}

/**
 * Topic extraction result
 */
export interface TopicExtractionResult {
  detected: string[];
  category: TopicCategory;
  isNewTopic: boolean;
  isTopicShift: boolean;
  suggestedTransition?: string;
}

// ============================================================================
// TOPIC DEFINITIONS
// ============================================================================

interface TopicDefinition {
  name: string;
  category: TopicCategory;
  keywords: string[];
  patterns: RegExp[];
  priority: 'high' | 'medium' | 'low';
  relatedTopics: string[];
}

const TOPIC_DEFINITIONS: TopicDefinition[] = [
  // Financial topics
  {
    name: 'retirement',
    category: 'financial',
    keywords: ['retire', 'retirement', 'pension', 'social security', '401k', 'ira', 'roth'],
    patterns: [/when (can I|should I|will I) retire/i, /retirement (plan|account|savings)/i],
    priority: 'high',
    relatedTopics: ['savings', 'investments', 'goals'],
  },
  {
    name: 'investments',
    category: 'financial',
    keywords: ['invest', 'investment', 'portfolio', 'asset', 'allocation', 'diversif'],
    patterns: [/how (should I|do I) invest/i, /investment (strategy|portfolio|options)/i],
    priority: 'high',
    relatedTopics: ['stocks', 'bonds', 'funds', 'risk'],
  },
  {
    name: 'stocks',
    category: 'market',
    keywords: ['stock', 'shares', 'equity', 'equities', 'company stock'],
    patterns: [/stock (market|price|pick)/i, /buy(ing)? stocks?/i],
    priority: 'medium',
    relatedTopics: ['investments', 'market', 'risk'],
  },
  {
    name: 'bonds',
    category: 'market',
    keywords: ['bond', 'treasury', 'fixed income', 'yield'],
    patterns: [/bond (fund|market|yield)/i],
    priority: 'medium',
    relatedTopics: ['investments', 'risk', 'income'],
  },
  {
    name: 'funds',
    category: 'financial',
    keywords: ['fund', 'mutual fund', 'etf', 'index fund', 'vanguard'],
    patterns: [/index fund/i, /(mutual|exchange.?traded) fund/i],
    priority: 'high',
    relatedTopics: ['investments', 'fees', 'diversification'],
  },
  {
    name: 'fees',
    category: 'financial',
    keywords: ['fee', 'cost', 'expense ratio', 'charges', 'commission'],
    patterns: [/how much (does it|do they) cost/i, /expense ratio/i],
    priority: 'high',
    relatedTopics: ['funds', 'investments'],
  },
  {
    name: 'savings',
    category: 'financial',
    keywords: ['save', 'saving', 'savings account', 'emergency fund'],
    patterns: [/how much should I save/i, /savings (rate|goal)/i],
    priority: 'high',
    relatedTopics: ['goals', 'retirement', 'budget'],
  },
  {
    name: 'debt',
    category: 'financial',
    keywords: ['debt', 'loan', 'mortgage', 'credit card', 'owe', 'pay off'],
    patterns: [/pay(ing)? off (debt|loan|mortgage)/i, /in debt/i],
    priority: 'high',
    relatedTopics: ['budget', 'savings'],
  },
  {
    name: 'goals',
    category: 'planning',
    keywords: ['goal', 'target', 'objective', 'plan for', 'saving for'],
    patterns: [/my goal is/i, /I want to (save for|achieve)/i],
    priority: 'high',
    relatedTopics: ['retirement', 'savings', 'education'],
  },
  {
    name: 'risk',
    category: 'financial',
    keywords: ['risk', 'risky', 'volatile', 'volatility', 'conservative', 'aggressive'],
    patterns: [/risk (tolerance|level|appetite)/i, /how (risky|safe)/i],
    priority: 'medium',
    relatedTopics: ['investments', 'stocks', 'bonds'],
  },
  {
    name: 'market',
    category: 'market',
    keywords: ['market', 'dow', 's&p', 'nasdaq', 'index', 'crash', 'correction'],
    patterns: [
      /market (is|seems|looks)/i,
      /what('s| is) (happening|going on) (in|with) the market/i,
    ],
    priority: 'high',
    relatedTopics: ['stocks', 'investments', 'risk'],
  },

  // Personal topics
  {
    name: 'family',
    category: 'personal',
    keywords: [
      'family',
      'wife',
      'husband',
      'spouse',
      'kids',
      'children',
      'daughter',
      'son',
      'parent',
    ],
    patterns: [/my (wife|husband|kids|children|family)/i],
    priority: 'high',
    relatedTopics: ['education', 'legacy', 'health'],
  },
  {
    name: 'health',
    category: 'personal',
    keywords: ['health', 'medical', 'doctor', 'hospital', 'sick', 'illness'],
    patterns: [/health (insurance|care|costs)/i],
    priority: 'high',
    relatedTopics: ['family', 'goals'],
  },
  {
    name: 'work',
    category: 'personal',
    keywords: ['job', 'work', 'career', 'employer', 'salary', 'income', 'boss'],
    patterns: [/my (job|work|career)/i, /at work/i],
    priority: 'medium',
    relatedTopics: ['income', 'retirement', 'savings'],
  },

  // Emotional topics
  {
    name: 'anxiety',
    category: 'emotional',
    keywords: ['worried', 'anxious', 'nervous', 'scared', 'afraid', 'stressed'],
    patterns: [/I('m| am) (worried|anxious|scared)/i],
    priority: 'high',
    relatedTopics: ['market', 'risk', 'goals'],
  },
  {
    name: 'uncertainty',
    category: 'emotional',
    keywords: ['uncertain', 'unsure', "don't know", 'confused', 'lost'],
    patterns: [/I('m| am) (not sure|uncertain|confused)/i, /don't know (what|how|if)/i],
    priority: 'medium',
    relatedTopics: ['goals', 'planning'],
  },

  // Education topics
  {
    name: 'college',
    category: 'education',
    keywords: ['college', 'university', 'tuition', '529', 'education fund'],
    patterns: [/college (fund|savings|costs)/i, /pay for (college|school)/i],
    priority: 'high',
    relatedTopics: ['savings', 'goals', 'family'],
  },
];

// ============================================================================
// TOPIC TRACKER
// ============================================================================

/**
 * Topic Tracker class
 */
export class TopicTracker {
  private topics: Map<string, Topic> = new Map();
  private topicStack: string[] = []; // Stack of active topic IDs
  private lastTopic: string | null = null;

  /**
   * Extract and track topics from text
   */
  extract(text: string): TopicExtractionResult {
    const lowerText = text.toLowerCase();
    const detected: string[] = [];
    let primaryCategory: TopicCategory = 'general';

    // Check each topic definition
    for (const def of TOPIC_DEFINITIONS) {
      let matched = false;

      // Check keywords
      for (const keyword of def.keywords) {
        if (lowerText.includes(keyword)) {
          matched = true;
          break;
        }
      }

      // Check patterns
      if (!matched) {
        for (const pattern of def.patterns) {
          if (pattern.test(text)) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        detected.push(def.name);
        this.trackTopic(def.name, def, text);

        // Use category of first high-priority topic found
        if (def.priority === 'high' && primaryCategory === 'general') {
          primaryCategory = def.category;
        }
      }
    }

    // Determine if this is a new topic or topic shift
    const isNewTopic = detected.some((t) => !this.topics.has(t));
    const isTopicShift =
      detected.length > 0 && this.lastTopic !== null && !detected.includes(this.lastTopic);

    // Update last topic
    if (detected.length > 0) {
      this.lastTopic = detected[0];

      // Update stack
      for (const topic of detected) {
        if (!this.topicStack.includes(topic)) {
          this.topicStack.push(topic);
        }
      }
    }

    // Suggest transition if topic shift
    let suggestedTransition: string | undefined;
    if (isTopicShift && this.lastTopic) {
      suggestedTransition = `Shifting from ${this.lastTopic} to ${detected[0]}`;
    }

    const result: TopicExtractionResult = {
      detected,
      category: primaryCategory,
      isNewTopic,
      isTopicShift,
      suggestedTransition,
    };

    if (detected.length > 0) {
      getLogger().debug(`Topics detected: ${detected.join(', ')} (category: ${primaryCategory})`);
    }

    return result;
  }

  /**
   * Track a topic
   */
  private trackTopic(name: string, def: TopicDefinition, context: string): void {
    const existing = this.topics.get(name);

    if (existing) {
      existing.lastMentioned = new Date();
      existing.mentionCount += 1;
      existing.context.push(context.slice(0, 200));
      if (existing.context.length > 5) {
        existing.context.shift();
      }
    } else {
      const newTopic: Topic = {
        id: name,
        name,
        category: def.category,
        firstMentioned: new Date(),
        lastMentioned: new Date(),
        mentionCount: 1,
        resolved: false,
        priority: def.priority,
        relatedTopics: def.relatedTopics,
        context: [context.slice(0, 200)],
        needsFollowUp: false,
      };
      this.topics.set(name, newTopic);
    }
  }

  /**
   * Get current topic
   */
  getCurrentTopic(): Topic | null {
    if (this.topicStack.length === 0) return null;
    const current = this.topicStack[this.topicStack.length - 1];
    return this.topics.get(current) || null;
  }

  /**
   * Get all active topics (not resolved)
   */
  getActiveTopics(): Topic[] {
    return Array.from(this.topics.values())
      .filter((t) => !t.resolved)
      .sort((a, b) => b.lastMentioned.getTime() - a.lastMentioned.getTime());
  }

  /**
   * Get topics needing follow-up
   */
  getTopicsNeedingFollowUp(): Topic[] {
    return Array.from(this.topics.values()).filter((t) => t.needsFollowUp && !t.resolved);
  }

  /**
   * Get topics that haven't been discussed recently
   */
  getNeglectedTopics(thresholdMinutes: number = 10): Topic[] {
    const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    return Array.from(this.topics.values())
      .filter((t) => !t.resolved && t.lastMentioned < threshold)
      .sort((a, b) => a.lastMentioned.getTime() - b.lastMentioned.getTime());
  }

  /**
   * Mark a topic as resolved
   */
  resolveTopic(name: string): boolean {
    const topic = this.topics.get(name);
    if (topic) {
      topic.resolved = true;
      // Remove from stack
      this.topicStack = this.topicStack.filter((t) => t !== name);
      getLogger().debug(`Resolved topic: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Mark a topic as needing follow-up
   */
  markForFollowUp(name: string): boolean {
    const topic = this.topics.get(name);
    if (topic) {
      topic.needsFollowUp = true;
      return true;
    }
    return false;
  }

  /**
   * Pop topic from stack (go back to previous topic)
   */
  popTopic(): Topic | null {
    if (this.topicStack.length === 0) return null;
    const popped = this.topicStack.pop();
    if (popped) {
      return this.topics.get(popped) || null;
    }
    return null;
  }

  /**
   * Get topic stack for context
   */
  getTopicStack(): string[] {
    return [...this.topicStack];
  }

  /**
   * Get related topics for current conversation
   */
  getSuggestedTopics(): string[] {
    const current = this.getCurrentTopic();
    if (!current) return [];

    // Get related topics that haven't been discussed
    const discussed = new Set(this.topics.keys());
    return current.relatedTopics.filter((t) => !discussed.has(t));
  }

  /**
   * Generate circle-back suggestions
   */
  getCircleBackSuggestions(): { topic: Topic; suggestion: string }[] {
    const neglected = this.getNeglectedTopics(5);
    return neglected.map((topic) => ({
      topic,
      suggestion: `You mentioned ${topic.name} earlier. Would you like to discuss that more?`,
    }));
  }

  /**
   * Get conversation summary by topics
   */
  getTopicSummary(): string {
    const topics = this.getActiveTopics();
    if (topics.length === 0) return 'No specific topics discussed yet.';

    const topicNames = topics.map((t) => t.name);
    const highPriority = topics.filter((t) => t.priority === 'high').map((t) => t.name);

    let summary = `Topics discussed: ${topicNames.join(', ')}.`;
    if (highPriority.length > 0) {
      summary += ` Key topics: ${highPriority.join(', ')}.`;
    }

    return summary;
  }

  /**
   * Clear all tracked topics
   */
  clear(): void {
    this.topics.clear();
    this.topicStack = [];
    this.lastTopic = null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultTracker: TopicTracker | null = null;

/**
 * Get the default topic tracker
 */
export function getTopicTracker(): TopicTracker {
  if (!defaultTracker) {
    defaultTracker = new TopicTracker();
  }
  return defaultTracker;
}

/**
 * Quick extract function
 */
export function extractTopics(text: string): TopicExtractionResult {
  return getTopicTracker().extract(text);
}

export default TopicTracker;
