/**
 * Proactive Surfacing
 *
 * Generates suggestions for proactively surfacing memories.
 * Handles time-based, topic-based, pattern-based, and opening suggestions.
 *
 * @module conversation/proactive-memory/surfacing
 */

import { seededPick } from '../utils/random-generator.js';

import type {
  PatternDetection,
  ProactiveMemorySuggestion,
  StoredMemory,
  SuggestionContext,
} from './types.js';

// ============================================================================
// SURFACING ENGINE
// ============================================================================

export class SurfacingEngine {
  private currentSessionId: string;

  constructor(sessionId: string) {
    this.currentSessionId = sessionId;
  }

  /**
   * Get opening suggestion for session start
   */
  getOpeningSuggestion(memories: StoredMemory[]): ProactiveMemorySuggestion | null {
    const now = new Date();

    // Priority 1: Events that should have just happened
    const recentEvents = memories.filter((m) => {
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
      const phrase =
        seededPick(`${this.currentSessionId}:opening:event:${event.id}`, phrases) ?? phrases[0];
      return {
        memory: event,
        triggerType: 'opening',
        phrase,
        ssml: `<break time="100ms"/>${phrase}`,
        priority: 0.95,
        reason: 'Event that just occurred',
      };
    }

    // Priority 2: Goals that haven't been checked on in a while
    const staleGoals = memories.filter((m) => {
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
      const phrase =
        seededPick(`${this.currentSessionId}:opening:goal:${goal.id}`, phrases) ?? phrases[0];
      return {
        memory: goal,
        triggerType: 'opening',
        phrase,
        ssml: `<break time="100ms"/>${phrase}`,
        priority: 0.7,
        reason: 'Goal check-in',
      };
    }

    // Priority 3: People mentioned who are important
    const importantPeople = memories.filter(
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
      const phrase =
        seededPick(`${this.currentSessionId}:opening:person:${person.id}`, phrases) ?? phrases[0];
      return {
        memory: person,
        triggerType: 'opening',
        phrase,
        ssml: `<break time="100ms"/>${phrase}`,
        priority: 0.5,
        reason: 'Person follow-up',
      };
    }

    return null;
  }

  /**
   * Get time-based suggestions
   */
  getTimeBasedSuggestions(memories: StoredMemory[], now: Date): ProactiveMemorySuggestion[] {
    const suggestions: ProactiveMemorySuggestion[] = [];

    for (const memory of memories) {
      if (memory.type !== 'event' || !memory.expectedFollowUpAt) continue;
      if (memory.surfaceCount > 1) continue;

      const hoursSinceExpected =
        (now.getTime() - memory.expectedFollowUpAt.getTime()) / (1000 * 60 * 60);

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

        const phrase =
          seededPick(`${this.currentSessionId}:time_based:${memory.id}`, phrases) ?? phrases[0];
        suggestions.push({
          memory,
          triggerType: 'time_based',
          phrase,
          ssml: `<break time="150ms"/>${phrase}`,
          priority: 0.8 - hoursSinceExpected / 100,
          reason: 'Time-triggered event follow-up',
        });
      }
    }

    return suggestions;
  }

  /**
   * Get topic-based suggestions
   */
  getTopicBasedSuggestions(
    memories: StoredMemory[],
    currentTopic: string
  ): ProactiveMemorySuggestion[] {
    const suggestions: ProactiveMemorySuggestion[] = [];
    const topicLower = currentTopic.toLowerCase();

    for (const memory of memories) {
      // Skip if recently surfaced
      if (memory.lastSurfacedAt && Date.now() - memory.lastSurfacedAt.getTime() < 5 * 60 * 1000) {
        continue;
      }

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
  getPatternBasedSuggestions(
    patterns: PatternDetection[],
    context: SuggestionContext
  ): ProactiveMemorySuggestion[] {
    const suggestions: ProactiveMemorySuggestion[] = [];
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    for (const pattern of patterns) {
      if (pattern.acknowledged) continue;

      if (pattern.type === 'temporal' && context.currentDayOfWeek !== undefined) {
        const dayMatches = pattern.evidence.some((e) =>
          e.toLowerCase().includes(dayNames[context.currentDayOfWeek!] || '')
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
}
