/**
 * Proactive Memory Surfacing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: surfacing memories BEFORE the user mentions them.
 * A human friend might eventually remember "oh right, you had that interview!"
 * Ferni proactively brings it up, creating the "they actually care" feeling.
 *
 * Types of proactive memory surfacing:
 *
 * 1. **Event Follow-ups**: "How did that job interview go?"
 * 2. **Goal Check-ins**: "How's the marathon training coming along?"
 * 3. **People Updates**: "How's your sister doing after the move?"
 * 4. **Pattern Acknowledgment**: "I've noticed Mondays are tough for you"
 * 5. **Anniversary Awareness**: "It's been a month since you mentioned wanting to..."
 * 6. **Contextual Triggers**: Topic X reminds us they mentioned Y
 *
 * The key: Surface at the RIGHT moment, not randomly. This requires:
 * - Time-based triggers (checking in after expected events)
 * - Topic-based triggers (current topic relates to stored memory)
 * - Pattern-based triggers (recognizing recurring themes)
 *
 * @module @ferni/proactive-memory
 */

import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'ProactiveMemory' });

// ============================================================================
// TYPES
// ============================================================================

export type MemoryType =
  | 'event' // Scheduled event (interview, meeting, trip)
  | 'goal' // Ongoing goal (fitness, career, relationship)
  | 'person' // Person mentioned (family, friend, colleague)
  | 'pattern' // Recurring pattern (Monday stress, late-night anxiety)
  | 'struggle' // Ongoing struggle (health issue, work problem)
  | 'milestone' // Important date (anniversary, birthday, deadline)
  | 'preference' // User preference (communication style, topics)
  | 'achievement'; // Something they accomplished

export interface StoredMemory {
  /** Unique ID */
  id: string;

  /** Type of memory */
  type: MemoryType;

  /** What was mentioned */
  content: string;

  /** More detailed context */
  context?: string;

  /** Related topic keywords */
  topics: string[];

  /** Related person names */
  people: string[];

  /** When this was mentioned */
  mentionedAt: Date;

  /** Expected follow-up time (if applicable) */
  expectedFollowUpAt?: Date;

  /** Has this been proactively surfaced? */
  surfaced: boolean;

  /** How many times surfaced */
  surfaceCount: number;

  /** Emotional weight when mentioned */
  emotionalWeight: 'light' | 'medium' | 'heavy';

  /** Was this a vulnerable share? */
  wasVulnerable: boolean;

  /** Session ID where this was captured */
  sessionId: string;

  /** Last surfaced at */
  lastSurfacedAt?: Date;
}

export interface ProactiveMemorySuggestion {
  /** The memory being surfaced */
  memory: StoredMemory;

  /** Type of surfacing */
  triggerType: 'time_based' | 'topic_based' | 'pattern_based' | 'opening' | 'contextual';

  /** Suggested phrase to use */
  phrase: string;

  /** SSML version */
  ssml: string;

  /** Priority (higher = more important to surface) */
  priority: number;

  /** Why we're suggesting this */
  reason: string;
}

export interface PatternDetection {
  /** Pattern type */
  type: 'temporal' | 'topic_recurring' | 'emotional_cycle' | 'relationship';

  /** Description */
  description: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Evidence (what triggered detection) */
  evidence: string[];

  /** When first detected */
  detectedAt: Date;

  /** Has this been acknowledged? */
  acknowledged: boolean;
}

// ============================================================================
// TIME EXTRACTION HELPERS
// ============================================================================

interface ExtractedTimeReference {
  type: 'specific_date' | 'relative' | 'recurring' | 'none';
  date?: Date;
  description: string;
}

function extractTimeReference(text: string): ExtractedTimeReference {
  const lowered = text.toLowerCase();

  // Specific day references
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = new Date();
  const currentDay = today.getDay();

  for (let i = 0; i < dayOfWeek.length; i++) {
    if (lowered.includes(dayOfWeek[i])) {
      // Calculate next occurrence of this day
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntil);
      return {
        type: 'specific_date',
        date: targetDate,
        description: dayOfWeek[i],
      };
    }
  }

  // Relative references
  const relativePatterns: Array<{ pattern: RegExp; daysFromNow: number; desc: string }> = [
    { pattern: /\btomorrow\b/, daysFromNow: 1, desc: 'tomorrow' },
    { pattern: /\btonight\b/, daysFromNow: 0, desc: 'tonight' },
    { pattern: /\btoday\b/, daysFromNow: 0, desc: 'today' },
    { pattern: /\bnext week\b/, daysFromNow: 7, desc: 'next week' },
    { pattern: /\bin a (few )?days?\b/, daysFromNow: 3, desc: 'in a few days' },
    { pattern: /\bthis weekend\b/, daysFromNow: 6 - currentDay, desc: 'this weekend' },
    { pattern: /\bnext month\b/, daysFromNow: 30, desc: 'next month' },
    { pattern: /\bsoon\b/, daysFromNow: 5, desc: 'soon' },
  ];

  for (const { pattern, daysFromNow, desc } of relativePatterns) {
    if (pattern.test(lowered)) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysFromNow);
      return {
        type: 'relative',
        date: targetDate,
        description: desc,
      };
    }
  }

  return { type: 'none', description: '' };
}

// ============================================================================
// CONTENT EXTRACTION HELPERS
// ============================================================================

interface ExtractedContent {
  events: Array<{ event: string; timeRef?: ExtractedTimeReference }>;
  goals: string[];
  people: Array<{ name: string; relationship?: string }>;
  struggles: string[];
}

function extractContent(text: string): ExtractedContent {
  const result: ExtractedContent = {
    events: [],
    goals: [],
    people: [],
    struggles: [],
  };

  const lowered = text.toLowerCase();

  // Event patterns
  const eventPatterns = [
    /(?:have|got|there's|have a|got a|going to a) (interview|meeting|appointment|exam|test|presentation|wedding|funeral|party|trip|vacation|date|surgery|procedure)/gi,
    /(?:my|the) (interview|meeting|appointment) (?:is|was)/gi,
    /(interview|meeting) (?:with|at|for)/gi,
  ];

  for (const pattern of eventPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const timeRef = extractTimeReference(text);
      result.events.push({
        event: match[1] || match[0],
        timeRef: timeRef.type !== 'none' ? timeRef : undefined,
      });
    }
  }

  // Goal patterns
  const goalPatterns = [
    /(?:trying to|want to|working on|training for|preparing for) ([a-z ]{5,40})/gi,
    /my goal is to ([a-z ]{5,40})/gi,
    /i('m| am) (learning|studying|practicing) ([a-z ]{3,30})/gi,
  ];

  for (const pattern of goalPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const goal = match[1] || match[3] || match[0];
      if (goal && goal.length > 5) {
        result.goals.push(goal.trim());
      }
    }
  }

  // People patterns
  const peoplePatterns = [
    /my (mom|mother|dad|father|brother|sister|wife|husband|partner|boss|friend|colleague|son|daughter|child|grandma|grandpa) ([A-Z][a-z]+)?/gi,
    /([A-Z][a-z]+),? my (mom|mother|dad|father|brother|sister|wife|husband|partner|boss|friend|colleague)/gi,
  ];

  for (const pattern of peoplePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const relationship = match[1] || match[2];
      const name = match[2] || match[1];
      if (name && /^[A-Z]/.test(name)) {
        result.people.push({ name, relationship });
      } else if (relationship) {
        result.people.push({ name: relationship, relationship });
      }
    }
  }

  // Struggle patterns
  const strugglePatterns = [
    /(?:struggling with|dealing with|worried about|stressed about) ([a-z ]{5,50})/gi,
    /(?:it's been hard|having trouble) ([a-z ]{3,40})/gi,
    /can('t|not) seem to ([a-z ]{3,30})/gi,
  ];

  for (const pattern of strugglePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const struggle = match[1] || match[2] || match[0];
      if (struggle && struggle.length > 5) {
        result.struggles.push(struggle.trim());
      }
    }
  }

  return result;
}

// ============================================================================
// PROACTIVE MEMORY ENGINE
// ============================================================================

export class ProactiveMemoryEngine {
  private memories: StoredMemory[] = [];
  private patterns: PatternDetection[] = [];
  private turnCount = 0;
  private sessionStartTime: Date;
  private currentSessionId: string;

  // Track topics by time for pattern detection
  private topicsByDay = new Map<number, string[]>(); // day of week -> topics
  private topicsByHour = new Map<number, string[]>(); // hour -> topics

  // 🧠 Enhanced pattern tracking for "Better Than Human" insights
  private topicsByMonth = new Map<number, string[]>(); // month -> topics (seasonal)
  private emotionsByDay = new Map<number, string[]>(); // day of week -> emotions
  private peopleByTopic = new Map<string, string[]>(); // topic -> people mentioned
  private emotionHistory: Array<{ emotion: string; timestamp: Date }> = [];

  constructor(sessionId: string) {
    this.currentSessionId = sessionId;
    this.sessionStartTime = new Date();
    logger.debug({ sessionId }, 'ProactiveMemoryEngine initialized');
  }

  // ==========================================================================
  // MEMORY CAPTURE
  // ==========================================================================

  /**
   * Process user message and extract memorable content
   */
  captureFromMessage(
    text: string,
    context: {
      topic?: string;
      emotion?: string;
      wasVulnerable?: boolean;
      turnCount: number;
    }
  ): void {
    this.turnCount = context.turnCount;

    const extracted = extractContent(text);
    const now = new Date();

    // Capture events
    for (const { event, timeRef } of extracted.events) {
      this.addMemory({
        type: 'event',
        content: event,
        context: timeRef?.description,
        topics: context.topic ? [context.topic] : [],
        people: [],
        expectedFollowUpAt: timeRef?.date,
        emotionalWeight: context.wasVulnerable ? 'heavy' : 'medium',
        wasVulnerable: context.wasVulnerable || false,
      });
    }

    // Capture goals
    for (const goal of extracted.goals) {
      this.addMemory({
        type: 'goal',
        content: goal,
        topics: context.topic ? [context.topic] : [],
        people: [],
        emotionalWeight: 'medium',
        wasVulnerable: false,
      });
    }

    // Capture people
    for (const { name, relationship } of extracted.people) {
      // Check if we already have this person
      const existing = this.memories.find(
        (m) => m.type === 'person' && m.content.toLowerCase() === name.toLowerCase()
      );
      if (!existing) {
        this.addMemory({
          type: 'person',
          content: name,
          context: relationship,
          topics: context.topic ? [context.topic] : [],
          people: [name],
          emotionalWeight: 'light',
          wasVulnerable: false,
        });
      }
    }

    // Capture struggles
    for (const struggle of extracted.struggles) {
      this.addMemory({
        type: 'struggle',
        content: struggle,
        topics: context.topic ? [context.topic] : [],
        people: [],
        emotionalWeight: context.wasVulnerable ? 'heavy' : 'medium',
        wasVulnerable: context.wasVulnerable || false,
      });
    }

    // Track for pattern detection
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    const month = now.getMonth();

    if (context.topic) {
      const dayTopics = this.topicsByDay.get(dayOfWeek) || [];
      dayTopics.push(context.topic);
      this.topicsByDay.set(dayOfWeek, dayTopics.slice(-20)); // Keep last 20

      const hourTopics = this.topicsByHour.get(hour) || [];
      hourTopics.push(context.topic);
      this.topicsByHour.set(hour, hourTopics.slice(-20));

      // 🧠 Seasonal pattern tracking
      const monthTopics = this.topicsByMonth.get(month) || [];
      monthTopics.push(context.topic);
      this.topicsByMonth.set(month, monthTopics.slice(-30));

      // 🧠 Relationship pattern tracking - who do they mention with what topic
      const mentionedPeople = extracted.people.map((p) => p.name);
      if (mentionedPeople.length > 0) {
        const topicPeople = this.peopleByTopic.get(context.topic) || [];
        topicPeople.push(...mentionedPeople);
        this.peopleByTopic.set(context.topic, topicPeople.slice(-20));
      }
    }

    // 🧠 Emotional pattern tracking by day
    if (context.emotion) {
      const dayEmotions = this.emotionsByDay.get(dayOfWeek) || [];
      dayEmotions.push(context.emotion);
      this.emotionsByDay.set(dayOfWeek, dayEmotions.slice(-20));

      // Track emotion history for cycle detection
      this.emotionHistory.push({ emotion: context.emotion, timestamp: now });
      if (this.emotionHistory.length > 50) {
        this.emotionHistory = this.emotionHistory.slice(-50);
      }
    }

    // Run pattern detection periodically
    if (this.turnCount % 5 === 0) {
      this.detectPatterns();
      this.detectEnhancedPatterns(); // 🧠 New enhanced patterns
    }
  }

  /**
   * Add a memory directly (from profile import, etc.)
   */
  addMemory(
    memory: Omit<StoredMemory, 'id' | 'mentionedAt' | 'surfaced' | 'surfaceCount' | 'sessionId'>
  ): void {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.memories.push({
      ...memory,
      id,
      mentionedAt: new Date(),
      surfaced: false,
      surfaceCount: 0,
      sessionId: this.currentSessionId,
    });

    logger.debug({ type: memory.type, content: memory.content.slice(0, 30) }, '💾 Memory captured');

    // Keep max 50 memories
    if (this.memories.length > 50) {
      // Remove oldest, lowest-weight, already-surfaced memories first
      this.memories.sort((a, b) => {
        const weightScore = { heavy: 3, medium: 2, light: 1 };
        if (a.surfaced !== b.surfaced) return a.surfaced ? 1 : -1;
        if (weightScore[a.emotionalWeight] !== weightScore[b.emotionalWeight]) {
          return weightScore[b.emotionalWeight] - weightScore[a.emotionalWeight];
        }
        return b.mentionedAt.getTime() - a.mentionedAt.getTime();
      });
      this.memories = this.memories.slice(0, 50);
    }
  }

  // ==========================================================================
  // PROACTIVE SURFACING
  // ==========================================================================

  /**
   * Get suggestions for what to proactively surface
   * Call this at the start of a response to get relevant memories
   */
  getSuggestions(context: {
    turnCount: number;
    currentTopic?: string;
    isSessionStart?: boolean;
    currentHour?: number;
    currentDayOfWeek?: number;
  }): ProactiveMemorySuggestion[] {
    this.turnCount = context.turnCount;
    const suggestions: ProactiveMemorySuggestion[] = [];
    const now = new Date();

    // 1. Session-start surfacing (highest priority)
    if (context.isSessionStart && this.turnCount <= 2) {
      const openingSuggestion = this.getOpeningSuggestion();
      if (openingSuggestion) {
        suggestions.push(openingSuggestion);
      }
    }

    // 2. Time-based surfacing (events that should have happened)
    const timeBased = this.getTimeBasedSuggestions(now);
    suggestions.push(...timeBased);

    // 3. Topic-based surfacing (current topic relates to memory)
    if (context.currentTopic) {
      const topicBased = this.getTopicBasedSuggestions(context.currentTopic);
      suggestions.push(...topicBased);
    }

    // 4. Pattern-based surfacing
    const patternBased = this.getPatternBasedSuggestions(context);
    suggestions.push(...patternBased);

    // Sort by priority and limit
    suggestions.sort((a, b) => b.priority - a.priority);

    // Don't overwhelm - max 2 suggestions
    return suggestions.slice(0, 2);
  }

  /**
   * Mark a memory as surfaced
   */
  markSurfaced(memoryId: string): void {
    const memory = this.memories.find((m) => m.id === memoryId);
    if (memory) {
      memory.surfaced = true;
      memory.surfaceCount++;
      memory.lastSurfacedAt = new Date();
      logger.debug({ memoryId, content: memory.content.slice(0, 30) }, 'Memory surfaced');
    }
  }

  /**
   * Get opening suggestion for session start
   */
  private getOpeningSuggestion(): ProactiveMemorySuggestion | null {
    const now = new Date();

    // Priority 1: Events that should have just happened
    const recentEvents = this.memories.filter((m) => {
      if (m.type !== 'event' || !m.expectedFollowUpAt) return false;
      const hoursSinceExpected =
        (now.getTime() - m.expectedFollowUpAt.getTime()) / (1000 * 60 * 60);
      return hoursSinceExpected > 0 && hoursSinceExpected < 48 && m.surfaceCount === 0;
    });

    if (recentEvents.length > 0) {
      const event = recentEvents[0];
      const phrases = [
        `I've been thinking about you—how did ${event.content} go?`,
        `Before anything else—how did ${event.content} turn out?`,
        `You were on my mind. How did ${event.content} go?`,
        `First things first—how was ${event.content}?`,
      ];
      return {
        memory: event,
        triggerType: 'opening',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        ssml: `<break time="100ms"/>${phrases[Math.floor(Math.random() * phrases.length)]}`,
        priority: 0.95,
        reason: 'Event that just occurred',
      };
    }

    // Priority 2: Goals that haven't been checked on in a while
    const staleGoals = this.memories.filter((m) => {
      if (m.type !== 'goal') return false;
      const daysSinceMentioned = (now.getTime() - m.mentionedAt.getTime()) / (1000 * 60 * 60 * 24);
      const daysSinceSurfaced = m.lastSurfacedAt
        ? (now.getTime() - m.lastSurfacedAt.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;
      return daysSinceMentioned > 7 && daysSinceSurfaced > 7 && m.surfaceCount < 2;
    });

    if (staleGoals.length > 0) {
      const goal = staleGoals[0];
      const phrases = [
        `Hey—how's ${goal.content} coming along?`,
        `I wanted to check in—any progress on ${goal.content}?`,
        `Been curious about ${goal.content}. How's that going?`,
      ];
      return {
        memory: goal,
        triggerType: 'opening',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        ssml: `<break time="100ms"/>${phrases[Math.floor(Math.random() * phrases.length)]}`,
        priority: 0.7,
        reason: 'Goal check-in',
      };
    }

    // Priority 3: People mentioned who are important
    const importantPeople = this.memories.filter(
      (m) => m.type === 'person' && m.emotionalWeight !== 'light' && m.surfaceCount === 0
    );

    if (importantPeople.length > 0) {
      const person = importantPeople[0];
      const relationship = person.context || '';
      const phrases = [
        `How's ${person.content} doing?`,
        `Any updates on ${person.content}?`,
        relationship ? `How's your ${relationship} ${person.content}?` : `How's ${person.content}?`,
      ];
      return {
        memory: person,
        triggerType: 'opening',
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        ssml: `<break time="100ms"/>${phrases[Math.floor(Math.random() * phrases.length)]}`,
        priority: 0.5,
        reason: 'Person follow-up',
      };
    }

    return null;
  }

  /**
   * Get time-based suggestions
   */
  private getTimeBasedSuggestions(now: Date): ProactiveMemorySuggestion[] {
    const suggestions: ProactiveMemorySuggestion[] = [];

    // Find events whose follow-up time has passed
    for (const memory of this.memories) {
      if (memory.type !== 'event' || !memory.expectedFollowUpAt) continue;
      if (memory.surfaceCount > 1) continue; // Don't keep asking

      const hoursSinceExpected =
        (now.getTime() - memory.expectedFollowUpAt.getTime()) / (1000 * 60 * 60);

      // Sweet spot: 1-72 hours after expected
      if (hoursSinceExpected > 1 && hoursSinceExpected < 72) {
        const phrases =
          hoursSinceExpected < 24
            ? [
                `By the way, how did ${memory.content} go?`,
                `I remembered you had ${memory.content}—how was it?`,
              ]
            : [
                `I keep thinking about your ${memory.content}—did it go okay?`,
                `How did that ${memory.content} end up going?`,
              ];

        suggestions.push({
          memory,
          triggerType: 'time_based',
          phrase: phrases[Math.floor(Math.random() * phrases.length)],
          ssml: `<break time="150ms"/>${phrases[Math.floor(Math.random() * phrases.length)]}`,
          priority: 0.8 - hoursSinceExpected / 100, // Priority decreases over time
          reason: 'Time-triggered event follow-up',
        });
      }
    }

    return suggestions;
  }

  /**
   * Get topic-based suggestions
   */
  private getTopicBasedSuggestions(currentTopic: string): ProactiveMemorySuggestion[] {
    const suggestions: ProactiveMemorySuggestion[] = [];
    const topicLower = currentTopic.toLowerCase();

    for (const memory of this.memories) {
      // Skip if recently surfaced
      if (memory.lastSurfacedAt && Date.now() - memory.lastSurfacedAt.getTime() < 5 * 60 * 1000) {
        continue;
      }

      // Check topic match
      const topicMatch = memory.topics.some((t) => t.toLowerCase().includes(topicLower));
      const contentMatch =
        memory.content.toLowerCase().includes(topicLower) ||
        topicLower.includes(memory.content.toLowerCase().split(' ')[0]);

      if (topicMatch || contentMatch) {
        let phrase: string;
        let reason: string;

        switch (memory.type) {
          case 'struggle':
            phrase = `This reminds me—you mentioned ${memory.content}. Is that still weighing on you?`;
            reason = 'Related struggle';
            break;
          case 'goal':
            phrase = `Speaking of which, how's ${memory.content} going?`;
            reason = 'Related goal';
            break;
          case 'person':
            phrase = `This makes me think of ${memory.content}. How are things there?`;
            reason = 'Related person';
            break;
          default:
            phrase = `That reminds me of what you said about ${memory.content}.`;
            reason = 'Related memory';
        }

        suggestions.push({
          memory,
          triggerType: 'topic_based',
          phrase,
          ssml: `<break time="100ms"/>${phrase}`,
          priority: memory.emotionalWeight === 'heavy' ? 0.7 : 0.5,
          reason,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get pattern-based suggestions
   */
  private getPatternBasedSuggestions(context: {
    currentHour?: number;
    currentDayOfWeek?: number;
  }): ProactiveMemorySuggestion[] {
    const suggestions: ProactiveMemorySuggestion[] = [];

    for (const pattern of this.patterns) {
      if (pattern.acknowledged) continue;

      // Check if pattern is relevant now
      if (pattern.type === 'temporal' && context.currentDayOfWeek !== undefined) {
        // Only surface if we're in the temporal window
        const dayMatches = pattern.evidence.some((e) =>
          e
            .toLowerCase()
            .includes(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][context.currentDayOfWeek!])
        );

        if (dayMatches && pattern.confidence > 0.6) {
          const phrase = `I've noticed ${pattern.description}. How are you feeling about it today?`;
          suggestions.push({
            memory: {
              id: `pattern_${pattern.type}`,
              type: 'pattern',
              content: pattern.description,
              topics: [],
              people: [],
              mentionedAt: pattern.detectedAt,
              surfaced: false,
              surfaceCount: 0,
              emotionalWeight: 'medium',
              wasVulnerable: false,
              sessionId: this.currentSessionId,
            },
            triggerType: 'pattern_based',
            phrase,
            ssml: `<break time="150ms"/>${phrase}`,
            priority: pattern.confidence * 0.6,
            reason: 'Temporal pattern',
          });
        }
      }
    }

    return suggestions;
  }

  // ==========================================================================
  // PATTERN DETECTION
  // ==========================================================================

  private detectPatterns(): void {
    // Detect day-of-week patterns
    for (const [day, topics] of this.topicsByDay.entries()) {
      if (topics.length < 3) continue;

      // Count topic occurrences
      const counts = new Map<string, number>();
      for (const topic of topics) {
        counts.set(topic, (counts.get(topic) || 0) + 1);
      }

      // Check for recurring topics
      for (const [topic, count] of counts.entries()) {
        if (count >= 3) {
          const confidence = count / topics.length;
          const dayName = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
          ][day];

          // Check if we already have this pattern
          const existing = this.patterns.find(
            (p) => p.type === 'temporal' && p.description.includes(dayName)
          );

          if (!existing && confidence > 0.5) {
            this.patterns.push({
              type: 'temporal',
              description: `${dayName}s often bring up ${topic} for you`,
              confidence,
              evidence: [`${count} mentions on ${dayName}s`],
              detectedAt: new Date(),
              acknowledged: false,
            });
            logger.debug({ day: dayName, topic, confidence }, '📊 Pattern detected');
          }
        }
      }
    }

    // Keep max 10 patterns
    if (this.patterns.length > 10) {
      this.patterns.sort((a, b) => b.confidence - a.confidence);
      this.patterns = this.patterns.slice(0, 10);
    }
  }

  /**
   * Mark a pattern as acknowledged
   */
  acknowledgePattern(type: PatternDetection['type']): void {
    const pattern = this.patterns.find((p) => p.type === type);
    if (pattern) {
      pattern.acknowledged = true;
    }
  }

  // ==========================================================================
  // 🧠 ENHANCED PATTERN DETECTION - "Better Than Human" Insights
  // ==========================================================================

  /**
   * Detect enhanced patterns that humans would miss:
   * - Weekly emotional patterns ("Mondays are hard for you")
   * - Relationship patterns ("You often mention your mom when stressed")
   * - Seasonal patterns ("Winter seems to affect your mood")
   * - Emotional cycles ("You have highs and lows roughly every 2 weeks")
   */
  private detectEnhancedPatterns(): void {
    this.detectWeeklyEmotionalPatterns();
    this.detectRelationshipPatterns();
    this.detectSeasonalPatterns();
    this.detectEmotionalCycles();
  }

  /**
   * Detect weekly emotional patterns
   * "Mondays are hard for you" / "You're usually more upbeat on Fridays"
   */
  private detectWeeklyEmotionalPatterns(): void {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const negativeEmotions = ['sad', 'anxious', 'stressed', 'frustrated', 'overwhelmed', 'tired'];
    const positiveEmotions = ['happy', 'excited', 'hopeful', 'calm', 'energetic', 'grateful'];

    for (const [day, emotions] of this.emotionsByDay.entries()) {
      if (emotions.length < 3) continue;

      // Count negative vs positive emotions for this day
      let negative = 0;
      let positive = 0;

      for (const emotion of emotions) {
        if (negativeEmotions.some((e) => emotion.toLowerCase().includes(e))) negative++;
        if (positiveEmotions.some((e) => emotion.toLowerCase().includes(e))) positive++;
      }

      const total = negative + positive;
      if (total < 3) continue;

      const negativeRatio = negative / total;
      const positiveRatio = positive / total;
      const dayName = dayNames[day];

      // Check if we already have this pattern
      const existing = this.patterns.find(
        (p) =>
          p.type === 'temporal' &&
          p.description.toLowerCase().includes(dayName?.toLowerCase() || '') &&
          p.description.includes('emotionally')
      );

      if (!existing && dayName) {
        if (negativeRatio > 0.6) {
          this.patterns.push({
            type: 'temporal',
            description: `${dayName}s tend to be emotionally harder for you`,
            confidence: negativeRatio,
            evidence: [`${negative}/${total} negative emotions on ${dayName}s`],
            detectedAt: new Date(),
            acknowledged: false,
          });
          logger.debug(
            { day: dayName, ratio: negativeRatio },
            '📊 Weekly negative pattern detected'
          );
        } else if (positiveRatio > 0.6) {
          this.patterns.push({
            type: 'temporal',
            description: `${dayName}s tend to be your better days`,
            confidence: positiveRatio,
            evidence: [`${positive}/${total} positive emotions on ${dayName}s`],
            detectedAt: new Date(),
            acknowledged: false,
          });
          logger.debug(
            { day: dayName, ratio: positiveRatio },
            '📊 Weekly positive pattern detected'
          );
        }
      }
    }
  }

  /**
   * Detect relationship patterns
   * "You often mention your mom when you're stressed about work"
   */
  private detectRelationshipPatterns(): void {
    const stressTopics = ['work', 'job', 'career', 'money', 'finances', 'health'];
    const supportTopics = ['decision', 'advice', 'help', 'support'];

    for (const [topic, people] of this.peopleByTopic.entries()) {
      if (people.length < 3) continue;

      // Count person frequency
      const personCounts = new Map<string, number>();
      for (const person of people) {
        const normalized = person.toLowerCase();
        personCounts.set(normalized, (personCounts.get(normalized) || 0) + 1);
      }

      // Find dominant person for this topic
      for (const [person, count] of personCounts.entries()) {
        const confidence = count / people.length;
        if (confidence > 0.4 && count >= 3) {
          // Check if we already have this pattern
          const existing = this.patterns.find(
            (p) =>
              p.type === 'relationship' &&
              p.description.toLowerCase().includes(person) &&
              p.description.toLowerCase().includes(topic)
          );

          if (!existing) {
            let context = '';
            if (stressTopics.some((t) => topic.includes(t))) {
              context = 'when stressed about';
            } else if (supportTopics.some((t) => topic.includes(t))) {
              context = 'when seeking advice about';
            } else {
              context = 'when talking about';
            }

            this.patterns.push({
              type: 'relationship',
              description: `You often mention ${person} ${context} ${topic}`,
              confidence,
              evidence: [`${count} mentions with ${topic} topic`],
              detectedAt: new Date(),
              acknowledged: false,
            });
            logger.debug({ person, topic, confidence }, '📊 Relationship pattern detected');
          }
        }
      }
    }
  }

  /**
   * Detect seasonal patterns
   * "Winter months seem to affect your mood"
   */
  private detectSeasonalPatterns(): void {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const winterMonths = [11, 0, 1]; // Dec, Jan, Feb
    const summerMonths = [5, 6, 7]; // Jun, Jul, Aug

    const heavyTopics = ['depression', 'lonely', 'isolated', 'unmotivated', 'tired'];
    const lightTopics = ['excited', 'energy', 'motivation', 'happy', 'active'];

    // Check winter months
    let winterHeavy = 0;
    let winterTotal = 0;
    for (const month of winterMonths) {
      const topics = this.topicsByMonth.get(month) || [];
      winterTotal += topics.length;
      winterHeavy += topics.filter((t) =>
        heavyTopics.some((h) => t.toLowerCase().includes(h))
      ).length;
    }

    if (winterTotal > 5 && winterHeavy / winterTotal > 0.3) {
      const existing = this.patterns.find(
        (p) => p.type === 'temporal' && p.description.includes('winter')
      );
      if (!existing) {
        this.patterns.push({
          type: 'temporal',
          description: 'Winter months seem to be more challenging for you emotionally',
          confidence: winterHeavy / winterTotal,
          evidence: [`${winterHeavy}/${winterTotal} heavy topics in winter`],
          detectedAt: new Date(),
          acknowledged: false,
        });
        logger.debug('📊 Seasonal winter pattern detected');
      }
    }

    // Check summer months for positive pattern
    let summerLight = 0;
    let summerTotal = 0;
    for (const month of summerMonths) {
      const topics = this.topicsByMonth.get(month) || [];
      summerTotal += topics.length;
      summerLight += topics.filter((t) =>
        lightTopics.some((l) => t.toLowerCase().includes(l))
      ).length;
    }

    if (summerTotal > 5 && summerLight / summerTotal > 0.3) {
      const existing = this.patterns.find(
        (p) => p.type === 'temporal' && p.description.includes('summer')
      );
      if (!existing) {
        this.patterns.push({
          type: 'temporal',
          description: 'Summer tends to be a better time for you emotionally',
          confidence: summerLight / summerTotal,
          evidence: [`${summerLight}/${summerTotal} positive topics in summer`],
          detectedAt: new Date(),
          acknowledged: false,
        });
        logger.debug('📊 Seasonal summer pattern detected');
      }
    }
  }

  /**
   * Detect emotional cycles
   * "You seem to have highs and lows roughly every 2 weeks"
   */
  private detectEmotionalCycles(): void {
    if (this.emotionHistory.length < 10) return;

    const negativeEmotions = ['sad', 'anxious', 'stressed', 'frustrated', 'down'];

    // Look for recurring negative periods
    const negativePeriods: Date[] = [];

    for (const { emotion, timestamp } of this.emotionHistory) {
      if (negativeEmotions.some((e) => emotion.toLowerCase().includes(e))) {
        negativePeriods.push(timestamp);
      }
    }

    if (negativePeriods.length < 3) return;

    // Calculate intervals between negative periods
    const intervals: number[] = [];
    for (let i = 1; i < negativePeriods.length; i++) {
      const prev = negativePeriods[i - 1];
      const curr = negativePeriods[i];
      if (prev && curr) {
        const daysBetween = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (daysBetween > 3) {
          // Ignore same-day or close-together periods
          intervals.push(daysBetween);
        }
      }
    }

    if (intervals.length < 2) return;

    // Check for consistency (standard deviation)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // If intervals are somewhat consistent (low variance relative to mean)
    const consistency = 1 - stdDev / avgInterval;
    if (consistency > 0.5 && avgInterval > 7 && avgInterval < 60) {
      const existing = this.patterns.find(
        (p) => p.type === 'emotional_cycle' && p.description.includes('cycle')
      );

      if (!existing) {
        const cycleDays = Math.round(avgInterval);
        const cycleWeeks = Math.round(avgInterval / 7);

        this.patterns.push({
          type: 'emotional_cycle',
          description: `You seem to have emotional ups and downs roughly every ${cycleWeeks > 1 ? `${cycleWeeks} weeks` : `${cycleDays} days`}`,
          confidence: consistency,
          evidence: [`Average ${cycleDays} days between harder periods`],
          detectedAt: new Date(),
          acknowledged: false,
        });
        logger.debug({ avgInterval, consistency }, '📊 Emotional cycle pattern detected');
      }
    }
  }

  // ==========================================================================
  // IMPORT/EXPORT
  // ==========================================================================

  /**
   * Import memories from profile persistence
   */
  importMemories(memories: StoredMemory[]): void {
    for (const memory of memories) {
      // Don't duplicate
      const existing = this.memories.find(
        (m) => m.content === memory.content && m.type === memory.type
      );
      if (!existing) {
        this.memories.push({
          ...memory,
          surfaced: false, // Reset surfaced state for new session
          lastSurfacedAt: undefined,
        });
      }
    }
    logger.debug({ count: memories.length }, 'Imported memories');
  }

  /**
   * Export memories for profile persistence
   */
  exportMemories(): StoredMemory[] {
    // Only export significant memories
    return this.memories.filter(
      (m) => m.emotionalWeight !== 'light' || m.type === 'goal' || m.type === 'event'
    );
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns(): PatternDetection[] {
    return this.patterns.filter((p) => p.confidence > 0.6);
  }

  /**
   * Import patterns from persistence
   */
  importPatterns(patterns: PatternDetection[]): void {
    for (const pattern of patterns) {
      const existing = this.patterns.find((p) => p.description === pattern.description);
      if (!existing) {
        this.patterns.push({ ...pattern, acknowledged: false });
      }
    }
    logger.debug({ count: patterns.length }, 'Imported patterns');
  }

  /**
   * Reset for new session
   */
  reset(): void {
    // Don't clear memories - they persist across sessions
    // Just reset session-specific state
    this.turnCount = 0;
    this.sessionStartTime = new Date();
    logger.debug('ProactiveMemoryEngine reset');
  }

  /**
   * Clear all data (for testing or user request)
   */
  clearAll(): void {
    this.memories = [];
    this.patterns = [];
    this.topicsByDay.clear();
    this.topicsByHour.clear();
    this.turnCount = 0;
    logger.debug('ProactiveMemoryEngine cleared');
  }

  /**
   * Get all memories for debugging
   */
  getAllMemories(): StoredMemory[] {
    return [...this.memories];
  }

  /**
   * Get all patterns for debugging
   */
  getAllPatterns(): PatternDetection[] {
    return [...this.patterns];
  }
}

// ============================================================================
// SESSION REGISTRY
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

/**
 * Session registry for proactive memory engines.
 * Provides automatic cleanup and lifecycle management.
 */
const proactiveMemoryRegistry = createSessionRegistry(
  (sessionId: string) => new ProactiveMemoryEngine(sessionId),
  {
    name: 'ProactiveMemory',
    cleanup: (engine) => engine.clearAll(),
    verbose: false,
  }
);

// Register globally for coordinated session cleanup
registerGlobalRegistry(proactiveMemoryRegistry);

export function getProactiveMemoryEngine(sessionId: string): ProactiveMemoryEngine {
  return proactiveMemoryRegistry.get(sessionId);
}

export function resetProactiveMemoryEngine(sessionId: string): void {
  const engine = proactiveMemoryRegistry.get(sessionId);
  engine.reset();
}

export function clearProactiveMemoryEngine(sessionId: string): void {
  proactiveMemoryRegistry.reset(sessionId);
}

export function hasProactiveMemoryEngine(sessionId: string): boolean {
  return proactiveMemoryRegistry.has(sessionId);
}

export function getActiveProactiveMemoryCount(): number {
  return proactiveMemoryRegistry.getActiveCount();
}

export default ProactiveMemoryEngine;
