/**
 * Curiosity Engine
 *
 * > "I've been wondering about that thing you mentioned..."
 *
 * Creates genuine, invested interest in the user's life:
 *
 * - **Thread Tracking**: Remember unresolved conversation threads
 * - **Follow-Up Questions**: Ask about things they mentioned
 * - **Detail Remembering**: "You said your sister's name was Sarah, right?"
 * - **Life Investment**: Show we're paying attention across conversations
 * - **Curious Probing**: Go deeper without being intrusive
 *
 * This is what makes someone feel truly known and cared about.
 *
 * @module @ferni/curiosity-engine
 */

import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'CuriosityEngine' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationThread {
  /** Unique ID */
  id: string;

  /** What was mentioned */
  content: string;

  /** Category of thread */
  category:
    | 'person'
    | 'event'
    | 'situation'
    | 'feeling'
    | 'goal'
    | 'problem'
    | 'story'
    | 'decision'
    | 'question';

  /** When first mentioned */
  introducedTurn: number;

  /** When last referenced */
  lastReferencedTurn: number;

  /** Is this resolved? */
  resolved: boolean;

  /** Context around the mention */
  context?: string;

  /** Importance level */
  importance: 'low' | 'medium' | 'high';

  /** Related details */
  details: string[];

  /** Times we've asked about it */
  followUpCount: number;
}

export interface LifeDetail {
  /** Category */
  category: 'person' | 'place' | 'job' | 'hobby' | 'pet' | 'relationship' | 'other';

  /** The detail */
  content: string;

  /** Name if applicable */
  name?: string;

  /** When learned */
  learnedTurn: number;

  /** Related threads */
  relatedThreads: string[];
}

export interface CuriosityPrompt {
  /** The question or prompt */
  question: string;

  /** Type of curiosity */
  type: 'follow_up' | 'detail_check' | 'life_investment' | 'deepening' | 'callback';

  /** Related thread ID */
  threadId?: string;

  /** Confidence this is appropriate */
  confidence: number;

  /** Is this time-sensitive? */
  timeSensitive: boolean;
}

export interface CuriosityState {
  /** Unresolved threads */
  unresolvedThreads: ConversationThread[];

  /** Life details we've learned */
  lifeDetails: LifeDetail[];

  /** Things we've been curious about */
  curiosityHistory: Array<{ question: string; turn: number; wasWellReceived?: boolean }>;

  /** Current turn */
  turnCount: number;
}

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

/** Patterns to extract people */
const PERSON_PATTERNS = [
  {
    pattern:
      /my (mom|mother|dad|father|brother|sister|wife|husband|partner|friend|boss|coworker|colleague)/i,
    relationship: true,
  },
  { pattern: /(?:named?|called?) (\w+)/i, extractName: true },
  { pattern: /(\w+),? my (mom|mother|dad|father|brother|sister|friend)/i, extractName: true },
  { pattern: /my (therapist|doctor|coach)/i, relationship: true },
];

/** Patterns indicating unresolved situations */
const UNRESOLVED_PATTERNS = [
  {
    pattern: /i'?m (trying to|working on|figuring out|dealing with) (.+)/i,
    category: 'situation' as const,
  },
  { pattern: /i (need|have|want) to (.+)/i, category: 'goal' as const },
  { pattern: /i'?m (not sure|deciding|thinking about) (.+)/i, category: 'decision' as const },
  { pattern: /i (don'?t know|wonder) (if|whether|what|how) (.+)/i, category: 'question' as const },
  { pattern: /(this|that|it) (is|has been) (.+)/i, category: 'situation' as const },
  { pattern: /i'?ve been (struggling|dealing) with (.+)/i, category: 'problem' as const },
];

/** Patterns indicating something happened */
const EVENT_PATTERNS = [
  { pattern: /i (have|had|'?ve got) (.+) (coming up|tomorrow|next|this)/i, timeframe: true },
  { pattern: /(yesterday|today|last week|recently) i (.+)/i, past: true },
  { pattern: /i'?m (going to|about to|planning to) (.+)/i, future: true },
  { pattern: /(interview|meeting|date|trip|appointment|test|exam|deadline)/i, event: true },
];

/** Patterns that suggest story continuation */
const STORY_INDICATORS = [
  /so (anyway|then|after that)/i,
  /long story (short|but)/i,
  /i'?ll (tell you|explain) (later|another time)/i,
  /that'?s a (whole |long )?(other )?story/i,
  /there'?s more (to it|but)/i,
];

/** Resolution indicators */
const RESOLUTION_PATTERNS = [
  /it (worked out|turned out|ended up)/i,
  /i (decided|figured out|resolved|fixed)/i,
  /we (worked it out|figured it out|resolved)/i,
  /(finally|eventually) (.+) (happened|worked|came)/i,
  /that'?s (done|over|resolved|behind me)/i,
];

// ============================================================================
// CURIOSITY PROMPTS
// ============================================================================

const FOLLOW_UP_TEMPLATES = {
  person: [
    "How's {detail} doing, by the way?",
    'You mentioned {detail} before—how are things going there?',
    'Speaking of {detail}—any updates?',
    "What's the latest with {detail}?",
  ],
  event: [
    'Did that {detail} happen yet?',
    'How did {detail} go?',
    "I've been curious—what happened with {detail}?",
    "You had that {detail} coming up, right? How'd it go?",
  ],
  situation: [
    'How are things going with {detail}?',
    'You were dealing with {detail}—any progress?',
    "I've been wondering how {detail} is going.",
    "What's happening with {detail} these days?",
  ],
  decision: [
    'Have you figured out {detail}?',
    'Where are you at with {detail}?',
    'Any clarity on {detail}?',
    'You were thinking about {detail}—what did you decide?',
  ],
  goal: [
    "How's {detail} coming along?",
    'Any progress on {detail}?',
    "You wanted to {detail}—how's that going?",
  ],
  problem: [
    'How are you doing with {detail}?',
    'Is {detail} any better?',
    "You were struggling with {detail}—how's that now?",
  ],
  story: [
    "I'm curious—what happened with {detail}?",
    'You started telling me about {detail}—I want to hear the rest.',
    'Wait, what happened with {detail}? You never finished.',
  ],
  question: [
    'Did you ever figure out {detail}?',
    'You were wondering {detail}—did you find an answer?',
  ],
  feeling: ['How are you feeling about {detail} now?', 'Has anything shifted with {detail}?'],
};

const DEEPENING_QUESTIONS = [
  "What's that like for you?",
  'How does that sit with you?',
  'Tell me more about that.',
  'What do you mean by that?',
  "What's underneath that?",
  'How long has that been going on?',
  'What does that bring up for you?',
  'When did you first notice that?',
  "What do you think that's about?",
];

const DETAIL_CHECK_TEMPLATES = [
  "Your {category}'s name was {name}, right?",
  'That was {name} you were talking about?',
  'Is this the {name} situation?',
  'Wait, is this about {name}?',
];

// ============================================================================
// CURIOSITY ENGINE
// ============================================================================

export class CuriosityEngine {
  private threads = new Map<string, ConversationThread>();
  private lifeDetails: LifeDetail[] = [];
  private curiosityHistory: Array<{ question: string; turn: number; wasWellReceived?: boolean }> =
    [];
  private turnCount = 0;
  private lastCuriosityTurn = -10;

  // Config
  private readonly MIN_CURIOSITY_INTERVAL = 5;
  private readonly MAX_FOLLOW_UPS_PER_THREAD = 3;
  private readonly MAX_CURIOSITY_PER_SESSION = 6;

  constructor() {
    logger.debug('CuriosityEngine initialized');
  }

  /**
   * Process a user message to extract threads and details
   */
  processMessage(message: string, turnCount: number): void {
    this.turnCount = turnCount;

    // Extract life details (people, etc.)
    this.extractLifeDetails(message, turnCount);

    // Extract/update threads
    this.extractThreads(message, turnCount);

    // Check for resolutions
    this.checkForResolutions(message);
  }

  /**
   * Get a curiosity prompt if appropriate
   *
   * @param turnCount - Current turn
   * @param recentTopics - Recent conversation topics
   * @returns Curiosity prompt or null
   */
  getCuriosityPrompt(turnCount: number, recentTopics?: string[]): CuriosityPrompt | null {
    this.turnCount = turnCount;

    // Don't be curious too frequently
    if (turnCount - this.lastCuriosityTurn < this.MIN_CURIOSITY_INTERVAL) {
      return null;
    }

    // Session limit
    if (this.curiosityHistory.length >= this.MAX_CURIOSITY_PER_SESSION) {
      return null;
    }

    // Find best candidate
    const prompt = this.findBestCuriosityPrompt(recentTopics);
    if (!prompt) return null;

    // Record
    this.lastCuriosityTurn = turnCount;
    this.curiosityHistory.push({ question: prompt.question, turn: turnCount });

    // Update thread if applicable
    if (prompt.threadId) {
      const thread = this.threads.get(prompt.threadId);
      if (thread) {
        thread.followUpCount++;
        thread.lastReferencedTurn = turnCount;
      }
    }

    logger.debug(
      {
        type: prompt.type,
        confidence: prompt.confidence.toFixed(2),
        threadId: prompt.threadId,
      },
      '🔍 Curiosity prompt generated'
    );

    return prompt;
  }

  /**
   * Get a deepening question for current topic
   */
  getDeepeningQuestion(): string {
    return DEEPENING_QUESTIONS[Math.floor(Math.random() * DEEPENING_QUESTIONS.length)];
  }

  /**
   * Record whether a curiosity prompt was well-received
   */
  recordCuriosityOutcome(wasWellReceived: boolean): void {
    const last = this.curiosityHistory[this.curiosityHistory.length - 1];
    if (last) {
      last.wasWellReceived = wasWellReceived;
    }
  }

  /**
   * Get unresolved threads
   */
  getUnresolvedThreads(): ConversationThread[] {
    return Array.from(this.threads.values()).filter((t) => !t.resolved);
  }

  /**
   * Get life details
   */
  getLifeDetails(): LifeDetail[] {
    return [...this.lifeDetails];
  }

  /**
   * Get state for persistence
   */
  getState(): CuriosityState {
    return {
      unresolvedThreads: Array.from(this.threads.values()).filter((t) => !t.resolved),
      lifeDetails: [...this.lifeDetails],
      curiosityHistory: [...this.curiosityHistory],
      turnCount: this.turnCount,
    };
  }

  /**
   * Load state from persistence
   */
  loadState(state: Partial<CuriosityState>): void {
    if (state.unresolvedThreads) {
      for (const thread of state.unresolvedThreads) {
        this.threads.set(thread.id, thread);
      }
    }
    if (state.lifeDetails) {
      this.lifeDetails = state.lifeDetails;
    }
    if (state.curiosityHistory) {
      this.curiosityHistory = state.curiosityHistory;
    }
    logger.debug('CuriosityEngine state loaded');
  }

  /**
   * Reset for new conversation (keeps cross-session data)
   */
  resetSession(): void {
    this.curiosityHistory = [];
    this.lastCuriosityTurn = -10;
    this.turnCount = 0;
    // Keep threads and life details
    logger.debug('CuriosityEngine session reset');
  }

  /**
   * Full reset
   */
  reset(): void {
    this.threads.clear();
    this.lifeDetails = [];
    this.curiosityHistory = [];
    this.turnCount = 0;
    this.lastCuriosityTurn = -10;
    logger.debug('CuriosityEngine fully reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private extractLifeDetails(message: string, turn: number): void {
    // Extract people
    for (const { pattern, relationship, extractName } of PERSON_PATTERNS) {
      const match = pattern.exec(message);
      if (match) {
        const detail: LifeDetail = {
          category: 'person',
          content: match[0],
          learnedTurn: turn,
          relatedThreads: [],
        };

        if (relationship && match[1]) {
          detail.content = match[1];
        }

        if (extractName && match[1]) {
          detail.name = match[1];
        }

        // Don't duplicate
        const exists = this.lifeDetails.find(
          (d) => d.category === 'person' && d.content.toLowerCase() === detail.content.toLowerCase()
        );

        if (!exists) {
          this.lifeDetails.push(detail);
          logger.debug({ detail: detail.content }, 'Life detail learned');
        }
      }
    }
  }

  private extractThreads(message: string, turn: number): void {
    // Check for unresolved situations
    for (const { pattern, category } of UNRESOLVED_PATTERNS) {
      const match = pattern.exec(message);
      if (match) {
        const content = match[2] || match[3] || match[1];
        if (content && content.length > 5 && content.length < 100) {
          const id = `${category}-${turn}-${content.slice(0, 20)}`;

          // Check if similar thread exists
          const existing = this.findSimilarThread(content);
          if (existing) {
            existing.lastReferencedTurn = turn;
          } else {
            this.threads.set(id, {
              id,
              content: content.trim(),
              category,
              introducedTurn: turn,
              lastReferencedTurn: turn,
              resolved: false,
              importance: 'medium',
              details: [],
              followUpCount: 0,
            });
          }
        }
      }
    }

    // Check for events
    for (const { pattern, timeframe, past, future, event } of EVENT_PATTERNS) {
      const match = pattern.exec(message);
      if (match && (timeframe || future || event)) {
        const content = match[2] || match[0];
        if (content && content.length > 3) {
          const id = `event-${turn}-${content.slice(0, 20)}`;

          const existing = this.findSimilarThread(content);
          if (!existing) {
            this.threads.set(id, {
              id,
              content: content.trim(),
              category: 'event',
              introducedTurn: turn,
              lastReferencedTurn: turn,
              resolved: !!past,
              importance: timeframe || future ? 'high' : 'medium',
              details: [],
              followUpCount: 0,
            });
          }
        }
      }
    }

    // Check for stories to continue
    if (STORY_INDICATORS.some((p) => p.test(message))) {
      const id = `story-${turn}`;
      this.threads.set(id, {
        id,
        content: 'unfinished story',
        category: 'story',
        introducedTurn: turn,
        lastReferencedTurn: turn,
        resolved: false,
        importance: 'low',
        details: [message.slice(0, 50)],
        followUpCount: 0,
      });
    }
  }

  private checkForResolutions(message: string): void {
    if (!RESOLUTION_PATTERNS.some((p) => p.test(message))) {
      return;
    }

    // Mark recent threads as potentially resolved
    for (const thread of this.threads.values()) {
      if (!thread.resolved && this.turnCount - thread.lastReferencedTurn < 3) {
        thread.resolved = true;
        logger.debug({ threadId: thread.id }, 'Thread marked resolved');
      }
    }
  }

  private findSimilarThread(content: string): ConversationThread | undefined {
    const words = content.toLowerCase().split(/\s+/);
    const significantWords = words.filter((w) => w.length > 4);

    for (const thread of this.threads.values()) {
      const threadWords = thread.content.toLowerCase().split(/\s+/);
      const overlap = significantWords.filter((w) => threadWords.includes(w));

      if (overlap.length >= 2 || overlap.length / significantWords.length > 0.5) {
        return thread;
      }
    }

    return undefined;
  }

  private findBestCuriosityPrompt(recentTopics?: string[]): CuriosityPrompt | null {
    const candidates: CuriosityPrompt[] = [];

    // Check unresolved threads
    for (const thread of this.threads.values()) {
      if (thread.resolved) continue;
      if (thread.followUpCount >= this.MAX_FOLLOW_UPS_PER_THREAD) continue;

      // Don't ask about very recent threads
      if (this.turnCount - thread.lastReferencedTurn < 3) continue;

      // Time-sensitive events get priority
      const timeSensitive = thread.category === 'event' && thread.importance === 'high';

      // Generate prompt
      const templates = FOLLOW_UP_TEMPLATES[thread.category] || FOLLOW_UP_TEMPLATES.situation;
      const template = templates[Math.floor(Math.random() * templates.length)];
      const question = template.replace('{detail}', thread.content);

      // Calculate confidence
      let confidence = 0.5;
      if (timeSensitive) confidence += 0.2;
      if (thread.importance === 'high') confidence += 0.15;
      if (this.turnCount - thread.introducedTurn > 10) confidence += 0.1; // Older = more natural
      if (thread.followUpCount === 0) confidence += 0.1; // Never asked

      candidates.push({
        question,
        type: 'follow_up',
        threadId: thread.id,
        confidence,
        timeSensitive,
      });
    }

    // Check for detail confirmation opportunity
    const namedDetails = this.lifeDetails.filter((d) => d.name);
    if (namedDetails.length > 0 && Math.random() < 0.3) {
      const detail = namedDetails[Math.floor(Math.random() * namedDetails.length)];
      const templates = DETAIL_CHECK_TEMPLATES;
      const template = templates[Math.floor(Math.random() * templates.length)];
      const question = template
        .replace('{name}', detail.name!)
        .replace('{category}', detail.category);

      candidates.push({
        question,
        type: 'detail_check',
        confidence: 0.5,
        timeSensitive: false,
      });
    }

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Return top candidate if above threshold
    if (candidates.length > 0 && candidates[0].confidence > 0.45) {
      return candidates[0];
    }

    return null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const instances = new Map<string, CuriosityEngine>();

export function getCuriosityEngine(userId: string): CuriosityEngine {
  if (!instances.has(userId)) {
    instances.set(userId, new CuriosityEngine());
  }
  return instances.get(userId)!;
}

export function resetCuriosityEngine(userId: string): void {
  const instance = instances.get(userId);
  if (instance) {
    instance.reset();
  }
}

export function clearCuriosityEngine(userId: string): void {
  instances.delete(userId);
}

export default CuriosityEngine;
