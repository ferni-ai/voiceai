/**
 * Retrieval Explanations
 *
 * Generates natural language explanations for why memories are surfaced.
 * Makes the AI's memory feel transparent and trustworthy.
 *
 * Philosophy: When Ferni references something from the past, the user
 * should feel understood, not surveilled. The explanation should feel
 * like a caring friend connecting the dots, not an algorithm outputting
 * a match score.
 *
 * "I remember you mentioned this last month when we talked about your
 * daughter's college plans" feels human. "Retrieved memory ID 4523 with
 * 0.87 similarity score" does not.
 */

import type { MemoryItem, RetrievalContext, RetrievedMemory } from './advanced-retrieval.js';
import type { ConsolidatedMemory } from './memory-consolidator.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * An explained memory with natural language reasoning
 */
export interface ExplainedMemory extends RetrievedMemory {
  /** Natural language explanation of why this memory surfaced */
  naturalExplanation: string;

  /** How strongly this memory connects to the current context */
  connectionStrength: 'strong' | 'moderate' | 'subtle';

  /** What type of connection this is */
  connectionType: ConnectionType;

  /** Suggested natural reference for the AI to use */
  suggestedReference: string;
}

/**
 * Types of memory connections
 */
export type ConnectionType =
  | 'topic_match' // Same topic being discussed
  | 'emotional_echo' // Similar emotional context
  | 'person_related' // Mentions same person
  | 'commitment' // A promise or follow-up
  | 'continuation' // Continuing an open thread
  | 'pattern' // A recurring theme
  | 'milestone' // A significant moment
  | 'time_based'; // Anniversary, recent event, etc.

/**
 * Templates for natural explanations
 */
interface ExplanationTemplate {
  template: string;
  connectionType: ConnectionType;
  conditions: (memory: MemoryItem, context: RetrievalContext) => boolean;
}

// ============================================================================
// EXPLANATION TEMPLATES
// ============================================================================

const EXPLANATION_TEMPLATES: ExplanationTemplate[] = [
  // Topic matches
  {
    template: 'I remember we talked about {topic} {timeAgo}',
    connectionType: 'topic_match',
    conditions: (memory, context) =>
      !!context.currentTopic && (memory.topics?.includes(context.currentTopic) ?? false),
  },

  // Person-related
  {
    template: 'This reminds me of what you shared about {person}',
    connectionType: 'person_related',
    conditions: (memory) => !!memory.personMentioned,
  },

  // Commitments
  {
    template: 'I wanted to follow up on something you mentioned',
    connectionType: 'commitment',
    conditions: (memory) => !!memory.commitment,
  },

  // Emotional echoes
  {
    template: "You sound like you're feeling something similar to {timeAgo}",
    connectionType: 'emotional_echo',
    conditions: (memory, context) => memory.emotionalWeight > 0.6 && !!context.currentEmotion,
  },

  // Recent conversations
  {
    template: 'Just {timeAgo}, you mentioned something that connects to this',
    connectionType: 'continuation',
    conditions: (memory) => {
      const daysSince = (Date.now() - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince < 7;
    },
  },

  // Recurring patterns
  {
    template: "This is something that comes up for you - I've noticed it a few times",
    connectionType: 'pattern',
    conditions: () => false, // Handled separately for consolidated memories
  },

  // Milestones
  {
    template: 'I remember this was a significant moment for you',
    connectionType: 'milestone',
    conditions: (memory) => memory.type === 'moment' && memory.emotionalWeight > 0.7,
  },
];

// ============================================================================
// REFERENCE TEMPLATES
// ============================================================================

const REFERENCE_TEMPLATES: Record<ConnectionType, string[]> = {
  topic_match: [
    "You mentioned {topic} {timeAgo}. How's that been going?",
    'I remember {timeAgo} we talked about {topic}.',
    'This connects to what you shared about {topic}.',
  ],
  emotional_echo: [
    'I hear something similar to what you were feeling {timeAgo}.',
    'This reminds me of {timeAgo} when you were going through something similar.',
    "You've felt this way before, {timeAgo}.",
  ],
  person_related: [
    "You've talked about {person} before - {timeAgo}.",
    'I remember what you shared about {person}.',
    'This reminds me of what you said about {person}.',
  ],
  commitment: [
    'I wanted to check in about something you mentioned.',
    "You'd mentioned wanting to {action} - how's that going?",
    'Last time, you said you were going to {action}.',
  ],
  continuation: [
    'Picking up from where we left off...',
    "I've been thinking about what you shared {timeAgo}.",
    'Tell me more about {topic}.',
  ],
  pattern: [
    "I've noticed this comes up for you.",
    'This seems like an important theme in your life.',
    "You've mentioned this a few times now.",
  ],
  milestone: [
    'I remember when you {summary} - that was significant.',
    'This connects to that important moment when {summary}.',
    'You shared something meaningful about this {timeAgo}.',
  ],
  time_based: [
    "It's been about {duration} since you mentioned this.",
    'A while back, you talked about {topic}.',
    '{timeAgo}, this came up in our conversation.',
  ],
};

// ============================================================================
// EXPLANATION GENERATOR
// ============================================================================

export class RetrievalExplainer {
  /**
   * Generate a natural explanation for why a memory was retrieved
   */
  explain(memory: RetrievedMemory, context: RetrievalContext): ExplainedMemory {
    const connectionType = this.determineConnectionType(memory, context);
    const connectionStrength = this.determineConnectionStrength(memory);
    const naturalExplanation = this.generateExplanation(memory, context, connectionType);
    const suggestedReference = this.generateReference(memory, context, connectionType);

    return {
      ...memory,
      naturalExplanation,
      connectionStrength,
      connectionType,
      suggestedReference,
    };
  }

  /**
   * Explain multiple memories
   */
  explainAll(memories: RetrievedMemory[], context: RetrievalContext): ExplainedMemory[] {
    return memories.map((m) => this.explain(m, context));
  }

  /**
   * Generate explanation for a consolidated memory
   */
  explainConsolidated(
    consolidated: ConsolidatedMemory,
    context: RetrievalContext
  ): {
    explanation: string;
    reference: string;
  } {
    const timeSpan = this.getTimeSpan(consolidated.evolution);

    const explanation =
      `This is something you've discussed ${consolidated.frequency} times ` +
      `over ${timeSpan}. The main themes are: ${consolidated.themes.join(', ')}.`;

    const reference = this.selectTemplate(REFERENCE_TEMPLATES.pattern).replace(
      '{topic}',
      consolidated.topic
    );

    return { explanation, reference };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Determine the type of connection
   */
  private determineConnectionType(
    memory: RetrievedMemory,
    context: RetrievalContext
  ): ConnectionType {
    const { item, scoreBreakdown } = memory;

    // Check each template's conditions
    for (const template of EXPLANATION_TEMPLATES) {
      if (template.conditions(item, context)) {
        return template.connectionType;
      }
    }

    // Default based on score breakdown
    if (scoreBreakdown.semantic > 0.6) return 'topic_match';
    if (scoreBreakdown.emotional > 0.6) return 'emotional_echo';
    if (scoreBreakdown.temporal > 0.7) return 'time_based';
    if (scoreBreakdown.contextual > 0.5) return 'continuation';

    return 'topic_match';
  }

  /**
   * Determine how strong the connection is
   */
  private determineConnectionStrength(
    memory: RetrievedMemory
  ): ExplainedMemory['connectionStrength'] {
    if (memory.score > 0.7) return 'strong';
    if (memory.score > 0.5) return 'moderate';
    return 'subtle';
  }

  /**
   * Generate natural explanation
   */
  private generateExplanation(
    memory: RetrievedMemory,
    context: RetrievalContext,
    connectionType: ConnectionType
  ): string {
    const { item, scoreBreakdown } = memory;
    const timeAgo = this.getTimeAgo(item.timestamp);

    // Find matching template
    const template = EXPLANATION_TEMPLATES.find((t) => t.connectionType === connectionType);

    if (!template) {
      return `This relates to something from ${timeAgo}.`;
    }

    // Fill in template
    let explanation = template.template
      .replace('{timeAgo}', timeAgo)
      .replace('{topic}', item.topics?.[0] || 'this topic')
      .replace('{person}', item.personMentioned || 'someone');

    // Add score-based details
    const reasons: string[] = [];

    if (scoreBreakdown.semantic > 0.5) {
      reasons.push('the topic is closely related');
    }
    if (scoreBreakdown.emotional > 0.5) {
      reasons.push('the emotional tone is similar');
    }
    if (scoreBreakdown.temporal > 0.5) {
      reasons.push("it's recent");
    }

    if (reasons.length > 0 && scoreBreakdown.semantic < 0.8) {
      explanation += ` (${reasons.join(', ')})`;
    }

    return explanation;
  }

  /**
   * Generate a natural reference for the AI to use
   */
  private generateReference(
    memory: RetrievedMemory,
    context: RetrievalContext,
    connectionType: ConnectionType
  ): string {
    const { item } = memory;
    const timeAgo = this.getTimeAgo(item.timestamp);
    const templates = REFERENCE_TEMPLATES[connectionType];

    let reference = this.selectTemplate(templates);

    // Fill in placeholders
    reference = reference
      .replace('{timeAgo}', timeAgo)
      .replace('{topic}', item.topics?.[0] || 'this')
      .replace('{person}', item.personMentioned || 'them')
      .replace('{summary}', this.extractSummary(item.content))
      .replace('{action}', this.extractAction(item.content))
      .replace('{duration}', this.getDuration(item.timestamp));

    return reference;
  }

  /**
   * Get human-readable time ago
   */
  private getTimeAgo(timestamp: Date): string {
    const now = Date.now();
    const then = timestamp.getTime();
    const diffMs = now - then;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'earlier today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return 'last week';
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 60) return 'last month';
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return 'over a year ago';
  }

  /**
   * Get duration description
   */
  private getDuration(timestamp: Date): string {
    const diffDays = Math.floor((Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 7) return 'a few days';
    if (diffDays < 30) return 'a few weeks';
    if (diffDays < 90) return 'a few months';
    if (diffDays < 180) return 'several months';
    return 'a while';
  }

  /**
   * Get time span for consolidated memory
   */
  private getTimeSpan(evolution: ConsolidatedMemory['evolution']): string {
    if (evolution.length < 2) return 'recently';

    const first = evolution[0].date;
    const last = evolution[evolution.length - 1].date;
    const diffDays = Math.floor((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 7) return 'the past week';
    if (diffDays < 30) return 'the past month';
    if (diffDays < 90) return 'the past few months';
    return 'several months';
  }

  /**
   * Extract summary from content
   */
  private extractSummary(content: string): string {
    const firstSentence = content.split(/[.!?]/)[0];
    return firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;
  }

  /**
   * Extract action from content (for commitments)
   */
  private extractAction(content: string): string {
    // Look for action verbs
    const actionPatterns = [
      /(?:going to|want to|will|planning to)\s+(\w+\s+\w+\s?\w*)/i,
      /(?:try|start|work on)\s+(\w+\s+\w+\s?\w*)/i,
    ];

    for (const pattern of actionPatterns) {
      const match = content.match(pattern);
      if (match) return match[1];
    }

    return 'follow through';
  }

  /**
   * Select a random template from array
   */
  private selectTemplate(templates: string[]): string {
    return templates[Math.floor(Math.random() * templates.length)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultExplainer: RetrievalExplainer | null = null;

/**
 * Get the default explainer
 */
export function getRetrievalExplainer(): RetrievalExplainer {
  if (!defaultExplainer) {
    defaultExplainer = new RetrievalExplainer();
  }
  return defaultExplainer;
}

/**
 * Reset the explainer (for testing)
 */
export function resetRetrievalExplainer(): void {
  defaultExplainer = null;
}

export default {
  RetrievalExplainer,
  getRetrievalExplainer,
  resetRetrievalExplainer,
};
