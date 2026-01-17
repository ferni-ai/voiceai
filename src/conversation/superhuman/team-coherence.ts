/**
 * Cross-Persona Memory Coherence
 *
 * > "Peter told me you two got into the weeds on index funds."
 *
 * Makes the Ferni team feel like a real team that communicates.
 * Personas share observations, pass notes, and reference each
 * other's conversations naturally.
 *
 * Key capabilities:
 * - Handoff notes between personas
 * - Shared observations
 * - Team compliments about user
 * - Context from colleagues
 *
 * @module @ferni/superhuman/team-coherence
 */

import { seededChance, seededPick, seededIndex } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { TeamAwarenessResult, TeamCoherence, TeamHandoffNote } from './types.js';

const logger = createLogger({ module: 'TeamCoherence' });

// ============================================================================
// PERSONA NAMES
// ============================================================================

const PERSONA_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'peter-john': 'Peter',
  'alex-chen': 'Alex',
  'maya-santos': 'Maya',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
};

// ============================================================================
// TEAM PHRASES
// ============================================================================

const TEAM_PHRASES = {
  handoff_note: {
    observation: [
      '{fromName} mentioned you were thinking about {topic}.',
      '{fromName} said you two had a good conversation about {topic}.',
      '{fromName} passed me a note about your {topic} discussion.',
    ],
    impression: [
      '{fromName} was impressed by your questions about {topic}.',
      '{fromName} told me you really dug into {topic}.',
      '{fromName} said you have good instincts.',
    ],
    concern: [
      '{fromName} mentioned you seemed stressed last time.',
      '{fromName} wanted me to check in on you.',
      '{fromName} left me a note: "Be gentle with this one."',
    ],
    compliment: [
      '{fromName} said great things about you.',
      '{fromName} was bragging about you, actually.',
      "{fromName} told me you're one of the good ones.",
    ],
    context: [
      '{fromName} filled me in on your {topic} situation.',
      'I got the download from {fromName} about {topic}.',
      '{fromName} briefed me on what you two discussed.',
    ],
    warning: [
      '{fromName} said to make sure I really listen today.',
      '{fromName} gave me a heads up—this is important to you.',
    ],
    suggestion: [
      '{fromName} thought you might want to explore {topic} more.',
      '{fromName} suggested we dig deeper into {topic}.',
    ],
  },
  team_compliment: [
    'The team talks about you, you know. Good things.',
    "You've made an impression on all of us.",
    "Between us—you're one of our favorites.",
    'The whole team is rooting for you.',
  ],
  context_from_colleague: [
    'I talked to {personaName} about you.',
    '{personaName} and I compared notes.',
    'The team had a discussion about how to help you.',
  ],
};

// ============================================================================
// TEAM COHERENCE ENGINE
// ============================================================================

export class TeamCoherenceEngine {
  private userId: string;
  private coherence: TeamCoherence;
  private lastTeamMentionTurn = 0;

  constructor(userId: string, existing?: Partial<TeamCoherence>) {
    this.userId = userId;
    this.coherence = {
      handoffNotes: existing?.handoffNotes || [],
      sharedObservations: existing?.sharedObservations || [],
      sharedPreferences: new Map(existing?.sharedPreferences || []),
      personaTopicHistory: new Map(existing?.personaTopicHistory || []),
    };
  }

  // ==========================================================================
  // RECORDING INTERACTIONS
  // ==========================================================================

  /**
   * Record a handoff note from one persona to another
   */
  recordHandoffNote(
    fromPersona: string,
    toPersona: string,
    type: TeamHandoffNote['type'],
    content: string,
    topic?: string
  ): void {
    const note: TeamHandoffNote = {
      fromPersona,
      toPersona,
      timestamp: new Date(),
      type,
      content,
      topic,
    };

    this.coherence.handoffNotes.push(note);

    // Keep last 20 notes
    if (this.coherence.handoffNotes.length > 20) {
      this.coherence.handoffNotes = this.coherence.handoffNotes.slice(-20);
    }

    logger.debug(
      { userId: this.userId, from: fromPersona, to: toPersona, type },
      '📝 Team handoff note recorded'
    );
  }

  /**
   * Record topic discussed by a persona
   */
  recordTopicDiscussion(personaId: string, topic: string): void {
    const history = this.coherence.personaTopicHistory.get(personaId) || [];
    if (!history.includes(topic)) {
      history.push(topic);
      this.coherence.personaTopicHistory.set(personaId, history);
    }
  }

  /**
   * Add a shared observation about the user
   */
  addSharedObservation(observation: string): void {
    if (!this.coherence.sharedObservations.includes(observation)) {
      this.coherence.sharedObservations.push(observation);

      // Keep last 15 observations
      if (this.coherence.sharedObservations.length > 15) {
        this.coherence.sharedObservations = this.coherence.sharedObservations.slice(-15);
      }
    }
  }

  /**
   * Record a shared preference
   */
  recordPreference(key: string, value: string): void {
    this.coherence.sharedPreferences.set(key, value);
  }

  // ==========================================================================
  // TEAM AWARENESS GENERATION
  // ==========================================================================

  /**
   * Check if we should mention team awareness
   */
  checkForTeamAwareness(
    currentPersona: string,
    context: {
      turnCount: number;
      isSessionStart: boolean;
      currentTopic?: string;
      sessionCount: number;
    }
  ): TeamAwarenessResult {
    // Cooldown - at least 30 turns between team mentions
    if (context.turnCount - this.lastTeamMentionTurn < 30 && !context.isSessionStart) {
      return { shouldMention: false };
    }

    // More likely at session start
    if (context.isSessionStart && context.sessionCount > 3) {
      const note = this.getRelevantHandoffNote(currentPersona, context.currentTopic);
      if (note) {
        this.lastTeamMentionTurn = context.turnCount;
        return {
          shouldMention: true,
          type: 'handoff_note',
          phrase: this.generateHandoffPhrase(note),
        };
      }
    }

    // Team compliment (rare)
    if (context.sessionCount > 10 && seededChance(`${Date.now()}:213`, 0.03)) {
      this.lastTeamMentionTurn = context.turnCount;
      return {
        shouldMention: true,
        type: 'team_compliment',
        phrase: this.selectRandom(TEAM_PHRASES.team_compliment),
      };
    }

    // Context from colleague during topic
    if (context.currentTopic && seededChance(`${Date.now()}:223`, 0.05)) {
      const otherPersona = this.findPersonaWhoDiscussedTopic(currentPersona, context.currentTopic);
      if (otherPersona) {
        this.lastTeamMentionTurn = context.turnCount;
        return {
          shouldMention: true,
          type: 'context_from_colleague',
          phrase: this.generateColleagueContextPhrase(otherPersona, context.currentTopic),
        };
      }
    }

    return { shouldMention: false };
  }

  /**
   * Generate a handoff summary for persona transition
   */
  generateHandoffSummary(
    fromPersona: string,
    toPersona: string,
    conversationContext: {
      topics: string[];
      emotionalTone: string;
      keyMoments?: string[];
    }
  ): string {
    const fromName = PERSONA_NAMES[fromPersona] || fromPersona;
    const toName = PERSONA_NAMES[toPersona] || toPersona;

    const parts: string[] = [];

    // Topic summary
    if (conversationContext.topics.length > 0) {
      parts.push(`We talked about ${conversationContext.topics.slice(0, 2).join(' and ')}.`);
    }

    // Emotional tone
    if (conversationContext.emotionalTone === 'heavy') {
      parts.push('It got pretty deep.');
    } else if (conversationContext.emotionalTone === 'light') {
      parts.push('Good energy today.');
    }

    // Key moments
    if (conversationContext.keyMoments && conversationContext.keyMoments.length > 0) {
      parts.push(`Key moment: ${conversationContext.keyMoments[0]}.`);
    }

    // Record the handoff
    this.recordHandoffNote(
      fromPersona,
      toPersona,
      'context',
      parts.join(' '),
      conversationContext.topics[0]
    );

    return parts.join(' ');
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getRelevantHandoffNote(currentPersona: string, topic?: string): TeamHandoffNote | null {
    // Find notes addressed to current persona
    const relevantNotes = this.coherence.handoffNotes.filter(
      (n) => n.toPersona === currentPersona || n.toPersona === 'all'
    );

    if (relevantNotes.length === 0) return null;

    // Prefer topic-relevant notes
    if (topic) {
      const topicNote = relevantNotes.find((n) => n.topic === topic);
      if (topicNote) return topicNote;
    }

    // Return most recent
    return relevantNotes[relevantNotes.length - 1];
  }

  private generateHandoffPhrase(note: TeamHandoffNote): string {
    const fromName = PERSONA_NAMES[note.fromPersona] || note.fromPersona;
    const templates = TEAM_PHRASES.handoff_note[note.type] || TEAM_PHRASES.handoff_note.context;

    const template = this.selectRandom(templates);
    return template.replace('{fromName}', fromName).replace('{topic}', note.topic || 'things');
  }

  private findPersonaWhoDiscussedTopic(currentPersona: string, topic: string): string | null {
    for (const entry of Array.from(this.coherence.personaTopicHistory.entries())) {
      const [personaId, topics] = entry;
      if (personaId !== currentPersona && topics.includes(topic)) {
        return personaId;
      }
    }
    return null;
  }

  private generateColleagueContextPhrase(personaId: string, topic: string): string {
    const personaName = PERSONA_NAMES[personaId] || personaId;
    const templates = TEAM_PHRASES.context_from_colleague;

    const template = this.selectRandom(templates);
    return `${template.replace('{personaName}', personaName)} They mentioned ${topic} is important to you.`;
  }

  private selectRandom<T>(arr: T[]): T {
    return seededPick(`${Date.now()}:333`, arr) ?? arr[0];
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get coherence state
   */
  getCoherence(): TeamCoherence {
    return {
      ...this.coherence,
      sharedPreferences: new Map(this.coherence.sharedPreferences),
      personaTopicHistory: new Map(this.coherence.personaTopicHistory),
    };
  }

  /**
   * Export for persistence
   */
  export(): {
    handoffNotes: TeamHandoffNote[];
    sharedObservations: string[];
    sharedPreferences: [string, string][];
    personaTopicHistory: [string, string[]][];
  } {
    return {
      handoffNotes: structuredClone(this.coherence.handoffNotes),
      sharedObservations: [...this.coherence.sharedObservations],
      sharedPreferences: Array.from(this.coherence.sharedPreferences.entries()),
      personaTopicHistory: Array.from(this.coherence.personaTopicHistory.entries()),
    };
  }

  /**
   * Import from persistence
   */
  import(data: ReturnType<TeamCoherenceEngine['export']>): void {
    this.coherence = {
      handoffNotes: data.handoffNotes.map((n) => ({
        ...n,
        timestamp: new Date(n.timestamp),
      })),
      sharedObservations: data.sharedObservations,
      sharedPreferences: new Map(data.sharedPreferences),
      personaTopicHistory: new Map(data.personaTopicHistory),
    };
  }

  /**
   * Reset
   */
  reset(): void {
    this.coherence = {
      handoffNotes: [],
      sharedObservations: [],
      sharedPreferences: new Map(),
      personaTopicHistory: new Map(),
    };
    this.lastTeamMentionTurn = 0;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, TeamCoherenceEngine>();

export function getTeamCoherence(
  userId: string,
  existing?: Partial<TeamCoherence>
): TeamCoherenceEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new TeamCoherenceEngine(userId, existing));
  }
  return engines.get(userId)!;
}

export function clearTeamCoherence(userId: string): void {
  engines.delete(userId);
}

export default TeamCoherenceEngine;
