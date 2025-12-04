/**
 * Conversational Memory
 *
 * Tracks and references things said during the conversation:
 * - Callback to earlier statements ("Earlier you mentioned...")
 * - Thread tracking (topics to return to)
 * - Commitments & promises ("You said you'd...")
 * - Notable quotes from the user
 * - Key facts shared during conversation
 *
 * This makes the AI feel like it's truly listening and remembering,
 * not just responding to the immediate message.
 */

import { log } from '@livekit/agents';
import { getTopicTracker } from '../intelligence/topic-tracker.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationThread {
  id: string;
  topic: string;
  startedAtTurn: number;
  lastMentionedTurn: number;
  importance: 'high' | 'medium' | 'low';
  resolved: boolean;
  userInitiated: boolean;
  relatedQuotes: string[];
}

export interface UserStatement {
  text: string;
  turn: number;
  timestamp: number;
  type: 'fact' | 'feeling' | 'question' | 'commitment' | 'notable';
  topic?: string;
  emotion?: string;
  importance: number; // 0-1
}

export interface MemoryCallback {
  phrase: string;
  ssml: string;
  referenceType: 'earlier_this_convo' | 'returning_topic' | 'commitment' | 'contradiction';
  originalStatement?: UserStatement;
}

export interface ConversationCommitment {
  what: string;
  who: 'user' | 'agent';
  turn: number;
  fulfilled: boolean;
  followedUpAt?: number;
}

export interface TopicChange {
  detected: boolean;
  previousTopic?: string;
  newTopic?: string;
  confidence: number;
  transitionPhrase?: string;
}

// ============================================================================
// CONVERSATIONAL MEMORY ENGINE
// ============================================================================

export class ConversationalMemoryEngine {
  private threads: ConversationThread[] = [];
  private userStatements: UserStatement[] = [];
  private commitments: ConversationCommitment[] = [];
  private currentTurn: number = 0;
  private notableQuotes: string[] = [];
  private currentTopic: string | null = null;
  private topicHistory: string[] = [];

  // Callback frequency tuning
  private callbacksGiven = 0;
  private positiveCallbackReactions = 0;
  private lastCallbackTurn = 0;
  private callbackMultiplier = 1.0; // Adjusts callback probability

  // Note: Topic keywords are now managed by the canonical TopicTracker
  // in intelligence/topic-tracker.ts

  constructor() {
    getLogger().debug('ConversationalMemoryEngine initialized');
  }

  /**
   * Record user reaction to a memory callback
   * Used to tune callback frequency for this user
   */
  recordCallbackReaction(wasPositive: boolean): void {
    this.callbacksGiven++;
    if (wasPositive) {
      this.positiveCallbackReactions++;
    }

    // After 3+ callbacks, tune frequency based on reaction rate
    if (this.callbacksGiven >= 3) {
      const positiveRate = this.positiveCallbackReactions / this.callbacksGiven;
      
      if (positiveRate > 0.7) {
        // User loves callbacks - increase frequency
        this.callbackMultiplier = 1.5;
      } else if (positiveRate < 0.3) {
        // User doesn't engage with callbacks - reduce frequency  
        this.callbackMultiplier = 0.5;
      } else {
        this.callbackMultiplier = 1.0;
      }

      getLogger().debug({
        callbackMultiplier: this.callbackMultiplier,
        positiveRate,
        totalCallbacks: this.callbacksGiven,
      }, 'Updated memory callback frequency');
    }
  }

  /**
   * Get current callback multiplier for external use
   */
  getCallbackMultiplier(): number {
    return this.callbackMultiplier;
  }

  /**
   * Check if we just gave a callback (for reaction tracking)
   */
  wasLastTurnCallback(): boolean {
    return this.currentTurn - this.lastCallbackTurn <= 1;
  }

  /**
   * Record a user message and extract memorable elements
   */
  recordUserMessage(
    text: string,
    context: {
      topic?: string;
      emotion?: string;
      isQuestion?: boolean;
      wasPersonal?: boolean;
    } = {}
  ): void {
    this.currentTurn++;

    // Detect statement types
    const type = this.classifyStatement(text, context);
    const importance = this.assessImportance(text, context);

    // Store if important enough
    if (importance > 0.3 || type !== 'fact') {
      this.userStatements.push({
        text: this.extractKey(text),
        turn: this.currentTurn,
        timestamp: Date.now(),
        type,
        topic: context.topic,
        emotion: context.emotion,
        importance,
      });

      // Trim old statements (keep last 20)
      if (this.userStatements.length > 20) {
        this.userStatements = this.userStatements
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 20);
      }
    }

    // Check for commitments
    this.detectCommitments(text, 'user');

    // Check for notable quotes
    if (this.isNotableQuote(text)) {
      this.notableQuotes.push(this.extractKey(text));
      if (this.notableQuotes.length > 5) {
        this.notableQuotes.shift();
      }
    }

    // Update/create threads
    if (context.topic) {
      this.updateThread(context.topic, context.isQuestion || false);
    }
  }

  /**
   * Record agent message (for commitment tracking)
   */
  recordAgentMessage(text: string): void {
    this.detectCommitments(text, 'agent');
  }

  /**
   * Get a callback to something said earlier
   * Returns null if nothing appropriate to reference
   * Uses dynamic frequency based on user preference
   */
  getMemoryCallback(
    currentTopic: string,
    currentTurn: number
  ): MemoryCallback | null {
    // Don't callback too early
    if (currentTurn < 4) return null;
    
    // Minimum turns between callbacks (adjusted by multiplier)
    const minTurnsBetweenCallbacks = Math.max(2, Math.floor(4 / this.callbackMultiplier));
    if (currentTurn - this.lastCallbackTurn < minTurnsBetweenCallbacks) return null;

    // Apply callback multiplier to all probabilities
    const m = this.callbackMultiplier;

    // Strategy 1: Return to an unresolved thread
    const unresolvedThread = this.threads.find(
      t => !t.resolved &&
           t.userInitiated &&
           t.topic !== currentTopic &&
           currentTurn - t.lastMentionedTurn > 3
    );

    if (unresolvedThread && Math.random() < 0.3 * m) {
      unresolvedThread.lastMentionedTurn = currentTurn;
      this.lastCallbackTurn = currentTurn;
      return this.createThreadCallback(unresolvedThread);
    }

    // Strategy 2: Reference a related statement
    const relatedStatement = this.userStatements.find(
      s => s.topic === currentTopic &&
           currentTurn - s.turn > 2 &&
           s.importance > 0.5
    );

    if (relatedStatement && Math.random() < 0.25 * m) {
      this.lastCallbackTurn = currentTurn;
      return this.createStatementCallback(relatedStatement);
    }

    // Strategy 3: Follow up on commitments
    const unfulfilledCommitment = this.commitments.find(
      c => !c.fulfilled && currentTurn - c.turn > 4
    );

    if (unfulfilledCommitment && Math.random() < 0.2 * m) {
      this.lastCallbackTurn = currentTurn;
      return this.createCommitmentCallback(unfulfilledCommitment);
    }

    // Strategy 4: Echo a notable quote
    if (this.notableQuotes.length > 0 && Math.random() < 0.1 * m) {
      const quote = this.notableQuotes[Math.floor(Math.random() * this.notableQuotes.length)];
      this.lastCallbackTurn = currentTurn;
      return {
        phrase: `You said something earlier that stuck with me—"${quote}"`,
        ssml: `<break time="200ms"/>You said something earlier that stuck with me—<break time="100ms"/>"${quote}"`,
        referenceType: 'earlier_this_convo',
      };
    }

    return null;
  }

  /**
   * Get unresolved threads that could be revisited
   */
  getUnresolvedThreads(): ConversationThread[] {
    return this.threads.filter(t => !t.resolved);
  }

  /**
   * Get unfulfilled commitments
   */
  getUnfulfilledCommitments(): ConversationCommitment[] {
    return this.commitments.filter(c => !c.fulfilled);
  }

  /**
   * Generate a "circling back" phrase for a topic
   */
  generateCircleBack(topic: string): string {
    const phrases = [
      `Going back to ${topic} for a moment...`,
      `I wanted to return to something you mentioned about ${topic}...`,
      `You know, I keep thinking about what you said about ${topic}...`,
      `Earlier you brought up ${topic}—can we revisit that?`,
      `Before we move on, I want to circle back to ${topic}...`,
      `That reminds me—we were talking about ${topic}...`,
    ];

    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Mark a thread as resolved
   */
  resolveThread(topic: string): void {
    const thread = this.threads.find(t => t.topic === topic);
    if (thread) {
      thread.resolved = true;
    }
  }

  /**
   * Mark a commitment as fulfilled
   */
  fulfillCommitment(what: string): void {
    const commitment = this.commitments.find(c =>
      c.what.toLowerCase().includes(what.toLowerCase()) ||
      what.toLowerCase().includes(c.what.toLowerCase())
    );
    if (commitment) {
      commitment.fulfilled = true;
      commitment.followedUpAt = this.currentTurn;
    }
  }

  /**
   * Check if user contradicted something they said earlier (this session)
   */
  checkForContradiction(newStatement: string, topic: string): UserStatement | null {
    // Simplified contradiction detection
    // In production, would use NLP/LLM for semantic comparison

    const relatedStatements = this.userStatements.filter(
      s => s.topic === topic && s.type === 'fact'
    );

    // Look for opposite sentiment indicators
    const negativeIndicators = ['not', "don't", "won't", 'never', 'hate', 'dislike'];
    const positiveIndicators = ['love', 'like', 'always', 'want', 'need', 'should'];

    const newHasNegative = negativeIndicators.some(w => newStatement.toLowerCase().includes(w));
    const newHasPositive = positiveIndicators.some(w => newStatement.toLowerCase().includes(w));

    for (const statement of relatedStatements) {
      const oldHasNegative = negativeIndicators.some(w => statement.text.toLowerCase().includes(w));
      const oldHasPositive = positiveIndicators.some(w => statement.text.toLowerCase().includes(w));

      // Detect polarity flip
      if ((newHasNegative && oldHasPositive) || (newHasPositive && oldHasNegative)) {
        return statement;
      }
    }

    return null;
  }

  /**
   * Enhanced contradiction detection using profile memory
   * Checks against both current session AND historical profile data
   */
  checkForContradictionWithProfile(
    newStatement: string,
    topic: string,
    profile?: {
      preferences?: { [key: string]: unknown };
      goals?: Array<{ name: string; type: string }>;
      primaryConcerns?: string[];
      smallDetails?: Array<{ type: string; value: string }>;
      keyMoments?: Array<{ type: string; description: string }>;
    }
  ): { 
    contradiction: UserStatement | null; 
    profileContradiction?: { 
      field: string; 
      storedValue: string; 
      newClaim: string;
      confidence: number;
    } 
  } {
    // First check current session
    const sessionContradiction = this.checkForContradiction(newStatement, topic);
    if (sessionContradiction) {
      return { contradiction: sessionContradiction };
    }

    // If no profile, return no contradiction
    if (!profile) {
      return { contradiction: null };
    }

    const newLower = newStatement.toLowerCase();
    const result: { contradiction: null; profileContradiction?: { field: string; storedValue: string; newClaim: string; confidence: number } } = { 
      contradiction: null 
    };

    // Check against stored preferences
    if (profile.preferences) {
      // Risk tolerance contradiction
      if (profile.preferences.riskTolerance) {
        const storedRisk = String(profile.preferences.riskTolerance).toLowerCase();
        if (storedRisk === 'conservative' && 
            (newLower.includes('aggressive') || newLower.includes('take more risk'))) {
          result.profileContradiction = {
            field: 'riskTolerance',
            storedValue: storedRisk,
            newClaim: 'aggressive/more risk',
            confidence: 0.7,
          };
        } else if (storedRisk === 'aggressive' && 
            (newLower.includes('conservative') || newLower.includes('play it safe'))) {
          result.profileContradiction = {
            field: 'riskTolerance',
            storedValue: storedRisk,
            newClaim: 'conservative/safe',
            confidence: 0.7,
          };
        }
      }

      // Verbosity contradiction
      if (profile.preferences.verbosity) {
        const storedVerbosity = String(profile.preferences.verbosity).toLowerCase();
        if (storedVerbosity === 'concise' && 
            (newLower.includes('more detail') || newLower.includes('explain more'))) {
          result.profileContradiction = {
            field: 'verbosity',
            storedValue: storedVerbosity,
            newClaim: 'wants more detail',
            confidence: 0.6,
          };
        }
      }
    }

    // Check against stored goals
    if (profile.goals && profile.goals.length > 0) {
      for (const goal of profile.goals) {
        const goalLower = goal.name.toLowerCase();
        // Check if they're now saying they don't want this goal
        if (newLower.includes(goalLower) && 
            (newLower.includes("don't want") || 
             newLower.includes('not interested') ||
             newLower.includes('changed my mind'))) {
          result.profileContradiction = {
            field: 'goal',
            storedValue: goal.name,
            newClaim: 'no longer wants this',
            confidence: 0.8,
          };
          break;
        }
      }
    }

    // Check against small details (names, facts)
    if (profile.smallDetails && profile.smallDetails.length > 0) {
      for (const detail of profile.smallDetails) {
        if (detail.type === 'person_name' || detail.type === 'pet_name') {
          const storedName = detail.value.toLowerCase();
          // Check if they're correcting a name
          if (newLower.includes(`not ${storedName}`) || 
              newLower.includes(`isn't ${storedName}`) ||
              (newLower.includes('name is') && !newLower.includes(storedName))) {
            result.profileContradiction = {
              field: detail.type,
              storedValue: detail.value,
              newClaim: 'different name',
              confidence: 0.9,
            };
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Generate a gentle clarification for a profile contradiction
   * The agent should NOT be accusatory - just curious
   */
  generateContradictionClarification(
    profileContradiction: { field: string; storedValue: string; newClaim: string }
  ): string {
    const phrases: Record<string, string[]> = {
      riskTolerance: [
        `Hmm, I remember you mentioning you were more ${profileContradiction.storedValue}—has something changed?`,
        `That's interesting—I had you pegged as more ${profileContradiction.storedValue}. What's shifted?`,
        `Wait, didn't you say you preferred a ${profileContradiction.storedValue} approach? I want to make sure I understand correctly.`,
      ],
      verbosity: [
        `I thought you preferred more ${profileContradiction.storedValue} explanations. Want me to adjust?`,
        `Just checking—you mentioned liking ${profileContradiction.storedValue} answers before. Should I change that?`,
      ],
      goal: [
        `I remember ${profileContradiction.storedValue} being important to you. Has your thinking changed?`,
        `That's a shift from what we discussed before about ${profileContradiction.storedValue}. What's different now?`,
      ],
      person_name: [
        `Oh! I thought you said their name was ${profileContradiction.storedValue}. Did I mishear?`,
        `Let me update my notes—I had ${profileContradiction.storedValue} written down. What's the correct name?`,
      ],
      pet_name: [
        `Wait, isn't your pet named ${profileContradiction.storedValue}? Or am I mixing things up?`,
      ],
    };

    const fieldPhrases = phrases[profileContradiction.field] || [
      `I want to make sure I have this right—I thought you said ${profileContradiction.storedValue}?`,
    ];

    return fieldPhrases[Math.floor(Math.random() * fieldPhrases.length)];
  }

  /**
   * Generate a gentle contradiction acknowledgment
   */
  generateContradictionAcknowledgment(original: UserStatement): string {
    const phrases = [
      `Hmm, earlier you mentioned "${original.text}"—has something changed?`,
      `That's interesting—I thought you said "${original.text}" before. What shifted?`,
      `Wait, didn't you mention "${original.text}" earlier? I want to make sure I understand.`,
      `Help me connect the dots—earlier you said "${original.text}"...`,
    ];

    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Get conversation summary for handoff/persistence
   */
  getConversationSummary(): {
    keyTopics: string[];
    userStatements: UserStatement[];
    unresolvedThreads: string[];
    commitments: ConversationCommitment[];
  } {
    return {
      keyTopics: [...new Set(this.threads.map(t => t.topic))],
      userStatements: this.userStatements.filter(s => s.importance > 0.5),
      unresolvedThreads: this.threads.filter(t => !t.resolved).map(t => t.topic),
      commitments: this.commitments.filter(c => !c.fulfilled),
    };
  }

  // ============================================================================
  // TOPIC DETECTION & CHANGE TRACKING
  // Uses canonical TopicTracker from intelligence module
  // ============================================================================

  /**
   * Detect topic from text
   * Delegates to the canonical TopicTracker for consistent topic detection
   */
  detectTopic(text: string): string | null {
    const tracker = getTopicTracker();
    const result = tracker.extract(text);
    return result.detected[0] || null;
  }

  /**
   * Analyze message for topic change
   */
  analyzeTopicChange(userMessage: string): TopicChange {
    // Delegate to canonical TopicTracker
    const tracker = getTopicTracker();
    const result = tracker.detectTopicChange(userMessage);

    // Update local state for this module's tracking
    if (result.newTopic && result.newTopic !== this.currentTopic) {
      if (this.currentTopic) {
        this.topicHistory.push(this.currentTopic);
      }
      this.currentTopic = result.newTopic;
    }

    // Augment with our own transition phrases if not provided
    const transitionPhrase = result.transitionPhrase || 
      (result.detected && result.previousTopic && result.newTopic
        ? this.getTopicTransitionPhrase(result.previousTopic, result.newTopic)
        : undefined);

    return {
      detected: result.detected,
      previousTopic: result.previousTopic,
      newTopic: result.newTopic,
      confidence: result.confidence,
      transitionPhrase,
    };
  }

  /**
   * Get natural transition phrase for topic change
   */
  getTopicTransitionPhrase(fromTopic: string, toTopic: string): string {
    const specificTransitions: Record<string, string[]> = {
      emotions: [
        "I hear the emotion in your voice. Let's talk about how you're feeling.",
        'It sounds like this is weighing on you. Tell me more about that.',
      ],
      family: [
        "Family dynamics matter a lot here. Let's talk about that.",
        "This is about more than money—it's about your family.",
      ],
      debt: [
        "Okay, let's tackle the debt situation.",
        "Debt can be stressful. Let's work through this together.",
      ],
      retirement: [
        "Retirement planning is crucial. Let's focus on that.",
        "Your retirement security matters most. Let's talk about that.",
      ],
    };

    if (specificTransitions[toTopic]) {
      const options = specificTransitions[toTopic];
      return options[Math.floor(Math.random() * options.length)];
    }

    const generic = [
      "Oh, okay—let's talk about that.",
      "Right, I hear you.",
      "Yes, that's important too.",
      "Okay, I'm with you.",
    ];
    return generic[Math.floor(Math.random() * generic.length)];
  }

  /**
   * Get current detected topic
   */
  getCurrentTopic(): string | null {
    return this.currentTopic;
  }

  /**
   * Get topic history
   */
  getTopicHistory(): string[] {
    return [...this.topicHistory];
  }

  /**
   * Check if returning to a previous topic
   */
  isReturningToTopic(topic: string): boolean {
    return this.topicHistory.includes(topic) && this.currentTopic !== topic;
  }

  /**
   * Reset for new conversation
   */
  reset(): void {
    this.threads = [];
    this.userStatements = [];
    this.commitments = [];
    this.currentTurn = 0;
    this.notableQuotes = [];
    this.currentTopic = null;
    this.topicHistory = [];
    getLogger().debug('ConversationalMemoryEngine reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private classifyStatement(
    text: string,
    context: { isQuestion?: boolean; wasPersonal?: boolean; emotion?: string }
  ): UserStatement['type'] {
    if (context.isQuestion) return 'question';

    // Commitment patterns
    const commitmentPatterns = [
      /i('ll| will| am going to| plan to| promise to)/i,
      /i('m gonna| wanna| gotta)/i,
      /let me think about/i,
      /i need to/i,
    ];
    if (commitmentPatterns.some(p => p.test(text))) return 'commitment';

    // Feeling patterns
    const feelingPatterns = [
      /i feel/i,
      /i('m| am) (worried|scared|excited|happy|sad|anxious|frustrated)/i,
      /makes me feel/i,
      /i('ve| have) been feeling/i,
    ];
    if (feelingPatterns.some(p => p.test(text)) || context.emotion) return 'feeling';

    // Notable patterns (strong opinions, revelations)
    const notablePatterns = [
      /i('ve| have) never/i,
      /i always/i,
      /the truth is/i,
      /honestly/i,
      /i realized/i,
      /it hit me/i,
    ];
    if (notablePatterns.some(p => p.test(text))) return 'notable';

    return 'fact';
  }

  private assessImportance(
    text: string,
    context: { wasPersonal?: boolean; emotion?: string }
  ): number {
    let importance = 0.3; // Base importance

    // Personal = more important
    if (context.wasPersonal) importance += 0.3;

    // Emotional = more important
    if (context.emotion) importance += 0.2;

    // Length suggests thoughtfulness
    if (text.length > 100) importance += 0.1;
    if (text.length > 200) importance += 0.1;

    // Contains numbers (specific) = more important
    if (/\d+/.test(text)) importance += 0.1;

    // Contains "I" statements
    if (/\bI\b/.test(text)) importance += 0.1;

    return Math.min(1, importance);
  }

  private extractKey(text: string): string {
    // Extract the most meaningful part of a statement
    // Remove filler, keep substance
    const cleaned = text
      .replace(/^(well|so|um|uh|like|you know|i mean|basically|honestly),?\s*/i, '')
      .replace(/\s*(you know|right|i guess|kind of|sort of)\s*$/i, '')
      .trim();

    // Truncate if too long
    if (cleaned.length > 100) {
      const sentences = cleaned.split(/[.!?]+/);
      return sentences[0].trim();
    }

    return cleaned;
  }

  private detectCommitments(text: string, who: 'user' | 'agent'): void {
    const patterns = [
      { pattern: /i('ll| will) (\w+ )?(\w+)/i, extract: (m: RegExpMatchArray) => m[0] },
      { pattern: /let me (\w+ )?(\w+)/i, extract: (m: RegExpMatchArray) => m[0] },
      { pattern: /i('m going to| am going to) (\w+)/i, extract: (m: RegExpMatchArray) => m[0] },
      { pattern: /i promise (to )?(\w+)/i, extract: (m: RegExpMatchArray) => m[0] },
    ];

    for (const { pattern, extract } of patterns) {
      const match = text.match(pattern);
      if (match) {
        const what = extract(match);
        // Avoid duplicate commitments
        if (!this.commitments.some(c => c.what === what)) {
          this.commitments.push({
            what,
            who,
            turn: this.currentTurn,
            fulfilled: false,
          });
        }
      }
    }
  }

  private isNotableQuote(text: string): boolean {
    // Detect if this is something worth remembering verbatim
    const quotePatterns = [
      /^["'].*["']$/, // Actual quote
      /^i (always|never|truly|really) believe/i,
      /^the thing is/i,
      /^what matters (to me )?is/i,
      /^my (philosophy|motto|rule) is/i,
      /^if there's one thing/i,
    ];

    return quotePatterns.some(p => p.test(text.trim()));
  }

  private updateThread(topic: string, userInitiated: boolean): void {
    const existing = this.threads.find(t => t.topic.toLowerCase() === topic.toLowerCase());

    if (existing) {
      existing.lastMentionedTurn = this.currentTurn;
    } else {
      this.threads.push({
        id: `thread_${Date.now()}`,
        topic,
        startedAtTurn: this.currentTurn,
        lastMentionedTurn: this.currentTurn,
        importance: 'medium',
        resolved: false,
        userInitiated,
        relatedQuotes: [],
      });
    }

    // Trim old threads
    if (this.threads.length > 10) {
      this.threads = this.threads
        .filter(t => !t.resolved || this.currentTurn - t.lastMentionedTurn < 10)
        .slice(-10);
    }
  }

  private createThreadCallback(thread: ConversationThread): MemoryCallback {
    const phrases = [
      `You mentioned ${thread.topic} earlier—I'd like to come back to that.`,
      `Can we circle back to ${thread.topic}?`,
      `I've been thinking about what you said about ${thread.topic}...`,
      `Before we go further, let's revisit ${thread.topic}.`,
    ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    return {
      phrase,
      ssml: `<break time="200ms"/>${phrase}`,
      referenceType: 'returning_topic',
    };
  }

  private createStatementCallback(statement: UserStatement): MemoryCallback {
    const phrases = [
      `Earlier you said "${statement.text}"—that's relevant here.`,
      `This connects to what you mentioned: "${statement.text}"`,
      `Remember when you said "${statement.text}"? That applies here.`,
      `Going back to something you shared—"${statement.text}"`,
    ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    return {
      phrase,
      ssml: `<break time="150ms"/>${phrase}`,
      referenceType: 'earlier_this_convo',
      originalStatement: statement,
    };
  }

  private createCommitmentCallback(commitment: ConversationCommitment): MemoryCallback {
    const who = commitment.who === 'user' ? 'you' : 'I';
    const phrases = commitment.who === 'user'
      ? [
          `By the way, you mentioned "${commitment.what}"—did you get a chance to do that?`,
          `How did it go with "${commitment.what}"?`,
          `I remember you said "${commitment.what}"—any update?`,
        ]
      : [
          `I said "${commitment.what}"—let me follow through on that.`,
          `I promised "${commitment.what}"—here's what I found.`,
        ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    return {
      phrase,
      ssml: `<break time="200ms"/>${phrase}`,
      referenceType: 'commitment',
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ConversationalMemoryEngine | null = null;

export function getConversationalMemory(): ConversationalMemoryEngine {
  if (!instance) {
    instance = new ConversationalMemoryEngine();
  }
  return instance;
}

export function resetConversationalMemory(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default ConversationalMemoryEngine;

