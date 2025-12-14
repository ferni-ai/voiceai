/**
 * Persona Intelligence - Unified Integration Layer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module integrates all the advanced persona systems:
 * - Relationship Memory Engine (tracking relationship depth and history)
 * - Cognitive Differentiation (how each persona thinks differently)
 * - Team Chemistry (natural team dynamics and references)
 * - Predictive Intelligence (anticipating user needs)
 *
 * Together, these systems make Ferni "Better than Human" - a team that
 * truly knows you, thinks in distinct ways, and anticipates your needs.
 */

import { getLogger } from '../utils/safe-logger.js';

// Relationship Memory
import {
  getRelationshipEngine,
  type RelationshipContext,
  type RelationshipMemory,
  type RelationshipMemoryEngine,
  type RelationshipStage,
  type SharedMomentType,
} from './relationship-memory/index.js';

// Cognitive Differentiation
import {
  getCognitiveDifferentiation,
  getDisagreementPhrase,
  getInsightLeadIn,
  getPersonaQuestion,
  type CognitiveDifferentiation,
} from './cognitive-differentiation.js';

// Team Chemistry
import {
  checkTeamInsideJoke,
  generateHandoffNote,
  getTeamCompliment,
  getTeamReference,
  shouldIncludeTeamReference,
  type HandoffContext,
} from './shared/team-chemistry.js';

// Cognitive Profiles (existing system)
import { getCognitiveEngine, type CognitiveIntelligenceEngine } from './cognitive-intelligence.js';
import { getCognitiveProfile } from './cognitive-profiles.js';
import type { CognitiveProfile } from './cognitive-types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complete intelligence context for a persona-user pair
 */
export interface PersonaIntelligenceContext {
  personaId: string;
  userId: string;

  // Relationship state
  relationship: RelationshipContext;

  // Cognitive style
  cognitive: {
    profile: CognitiveProfile;
    differentiation: CognitiveDifferentiation;
  };

  // Predictive insights
  predictive: {
    patternsDetected: string[];
    proactiveFollowUps: string[];
    concerns: string[];
  };

  // Team context
  team: {
    referencesAvailable: boolean;
    pendingHandoffContext?: HandoffContext;
  };
}

/**
 * Prompt injection combining all intelligence systems
 */
export interface UnifiedPromptInjection {
  // Relationship context
  relationshipSection: string;

  // Cognitive guidance
  cognitiveSection: string;

  // Predictive insights
  predictiveSection: string;

  // Team dynamics
  teamSection: string;

  // Combined (ready for LLM)
  combined: string;
}

/**
 * Configuration for the intelligence engine
 */
export interface PersonaIntelligenceConfig {
  enableRelationshipMemory: boolean;
  enableCognitiveDifferentiation: boolean;
  enableTeamChemistry: boolean;
  enablePredictiveIntelligence: boolean;
  teamReferenceFrequency: number;
  maxPredictiveInsightsPerSession: number;
}

// ============================================================================
// PERSONA INTELLIGENCE ENGINE
// ============================================================================

/**
 * Unified intelligence engine for a persona-user pair.
 * Coordinates all four intelligence systems.
 */
export class PersonaIntelligenceEngine {
  private personaId: string;
  private userId: string;
  private config: PersonaIntelligenceConfig;

  // Sub-engines
  private relationshipEngine: RelationshipMemoryEngine;
  private cognitiveEngine: CognitiveIntelligenceEngine | null = null;

  // Cached data
  private cognitiveDiff: CognitiveDifferentiation | undefined;
  private cognitiveProfile: CognitiveProfile | undefined;

  // Session state
  private sessionNumber = 0;
  private lastTeamReferenceSession = 0;
  private predictiveInsightsUsed = 0;

  constructor(
    personaId: string,
    userId: string,
    existingRelationshipMemory?: RelationshipMemory,
    config?: Partial<PersonaIntelligenceConfig>
  ) {
    this.personaId = personaId;
    this.userId = userId;

    // Default config
    this.config = {
      enableRelationshipMemory: true,
      enableCognitiveDifferentiation: true,
      enableTeamChemistry: true,
      enablePredictiveIntelligence: true,
      teamReferenceFrequency: 0.15,
      maxPredictiveInsightsPerSession: 2,
      ...config,
    };

    // Initialize relationship engine
    this.relationshipEngine = getRelationshipEngine(userId, personaId, existingRelationshipMemory);

    // Initialize cognitive systems
    this.cognitiveDiff = getCognitiveDifferentiation(personaId);
    this.cognitiveProfile = getCognitiveProfile(personaId);

    if (this.cognitiveProfile) {
      this.cognitiveEngine = getCognitiveEngine(personaId, this.cognitiveProfile);
    }

    log.debug({ personaId, userId }, 'PersonaIntelligenceEngine initialized');
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Start a new session
   */
  startSession(): void {
    this.sessionNumber = this.relationshipEngine.getMemory().totalSessions + 1;
    this.predictiveInsightsUsed = 0;
    this.relationshipEngine.startSession();

    log.debug(
      { personaId: this.personaId, userId: this.userId, sessionNumber: this.sessionNumber },
      'Intelligence session started'
    );
  }

  /**
   * End session with summary
   */
  endSession(
    sessionMood: 'positive' | 'neutral' | 'struggling' | 'crisis',
    sessionEnergy: 'high' | 'medium' | 'low',
    topics: string[]
  ): void {
    this.relationshipEngine.endSession(sessionMood, sessionEnergy, topics);

    log.debug(
      { personaId: this.personaId, userId: this.userId, sessionMood, topics },
      'Intelligence session ended'
    );
  }

  // ============================================================================
  // CONTEXT GENERATION
  // ============================================================================

  /**
   * Get complete intelligence context
   */
  getContext(): PersonaIntelligenceContext {
    const relationshipContext = this.relationshipEngine.getRelationshipContext();

    return {
      personaId: this.personaId,
      userId: this.userId,

      relationship: relationshipContext,

      cognitive: {
        profile: this.cognitiveProfile!,
        differentiation: this.cognitiveDiff!,
      },

      predictive: {
        patternsDetected: [], // Populated from predictive-intelligence.json
        proactiveFollowUps: [],
        concerns: relationshipContext.trajectory === 'declining' ? ['User may be struggling'] : [],
      },

      team: {
        referencesAvailable: shouldIncludeTeamReference(
          this.sessionNumber,
          this.lastTeamReferenceSession,
          { ...this.config, teamReferenceFrequency: this.config.teamReferenceFrequency } as any
        ),
      },
    };
  }

  // ============================================================================
  // PROMPT INJECTION
  // ============================================================================

  /**
   * Build unified prompt injection for LLM
   */
  buildPromptInjection(currentTopic?: string, userMessage?: string): UnifiedPromptInjection {
    const sections: string[] = [];

    // === RELATIONSHIP SECTION ===
    let relationshipSection = '';
    if (this.config.enableRelationshipMemory) {
      const relInjection = this.relationshipEngine.buildPromptInjection();

      relationshipSection = relInjection.relationshipPreamble;

      // Add callback suggestions
      if (relInjection.callbackSuggestions.length > 0) {
        relationshipSection += '\n\n[CALLBACK OPPORTUNITIES]\n';
        relationshipSection += relInjection.callbackSuggestions.slice(0, 2).join('\n');
      }

      // Add inside jokes
      if (relInjection.insideJokeOptions.length > 0) {
        relationshipSection += '\n\n[INSIDE JOKES AVAILABLE]\n';
        relationshipSection += relInjection.insideJokeOptions.slice(0, 2).join('\n');
      }

      // Add pending acknowledgments
      if (relInjection.pendingAcknowledgments.length > 0) {
        relationshipSection += '\n\n[MILESTONES TO ACKNOWLEDGE]\n';
        relationshipSection += relInjection.pendingAcknowledgments[0];
      }

      // Add stage guidance
      relationshipSection += `\n\n${relInjection.stageGuidance}`;

      sections.push(relationshipSection);
    }

    // === COGNITIVE SECTION ===
    let cognitiveSection = '';
    if (this.config.enableCognitiveDifferentiation && this.cognitiveDiff) {
      cognitiveSection = '[COGNITIVE STYLE]\n';
      cognitiveSection += `Questioning: ${this.cognitiveDiff.questioning.whyVsHow > 0.5 ? 'Why-focused' : 'How-focused'}, `;
      cognitiveSection += `${this.cognitiveDiff.questioning.feelingVsData > 0.5 ? 'feeling-oriented' : 'data-oriented'}\n`;
      cognitiveSection += `Silence: Interpret as ${this.cognitiveDiff.silence.primaryInterpretation}. Comfortable for ${this.cognitiveDiff.silence.comfortWithSilence}ms.\n`;
      cognitiveSection += `Disagreement: ${this.cognitiveDiff.disagreement.primaryStyle} style. `;
      cognitiveSection += `Strong opinions on: ${this.cognitiveDiff.disagreement.strongOpinionTopics.slice(0, 2).join(', ')}\n`;
      cognitiveSection += `Insights: Frame as ${this.cognitiveDiff.insight.primaryFraming}.\n`;
      cognitiveSection += `Pacing: Base thinking ${this.cognitiveDiff.pacing.baseThinkingTime}ms, emotional topics ${this.cognitiveDiff.pacing.emotionalMultiplier}x slower.`;

      sections.push(cognitiveSection);
    }

    // === PREDICTIVE SECTION ===
    let predictiveSection = '';
    if (this.config.enablePredictiveIntelligence) {
      const context = this.relationshipEngine.getRelationshipContext();

      if (context.trajectory === 'declining') {
        predictiveSection = '[PROACTIVE AWARENESS]\n';
        predictiveSection +=
          'User has been struggling lately. Lead with presence, not solutions. Check in on their wellbeing.';
        sections.push(predictiveSection);
      } else if (context.trajectory === 'improving') {
        predictiveSection = '[PROACTIVE AWARENESS]\n';
        predictiveSection +=
          'User has been doing better lately. Acknowledge their growth when appropriate.';
        sections.push(predictiveSection);
      }

      // Add time-based patterns
      const hour = new Date().getHours();
      const dayOfWeek = new Date().getDay();

      if (hour >= 22 || hour < 5) {
        predictiveSection += '\n[TIME CONTEXT] Late night - user may be processing something.';
        sections.push(predictiveSection);
      } else if (dayOfWeek === 0 && hour >= 17) {
        predictiveSection += '\n[TIME CONTEXT] Sunday evening - may have week-ahead anxiety.';
        sections.push(predictiveSection);
      }
    }

    // === TEAM SECTION ===
    let teamSection = '';
    if (this.config.enableTeamChemistry) {
      if (
        shouldIncludeTeamReference(this.sessionNumber, this.lastTeamReferenceSession, {
          teamReferenceFrequency: this.config.teamReferenceFrequency,
          teamReferenceMinSessions: 3,
        } as any)
      ) {
        teamSection = '[TEAM AWARENESS]\n';
        teamSection +=
          'You can naturally reference teammates when relevant. E.g., "Peter would love this data" or "Maya would remind you to celebrate small wins."';
        sections.push(teamSection);
      }
    }

    // Combine all sections
    const combined = sections.join('\n\n---\n\n');

    return {
      relationshipSection,
      cognitiveSection,
      predictiveSection,
      teamSection,
      combined,
    };
  }

  // ============================================================================
  // RELATIONSHIP EVENTS
  // ============================================================================

  /**
   * Record a shared moment
   */
  recordMoment(
    type: SharedMomentType,
    summary: string,
    options?: {
      topic?: string;
      userPhrase?: string;
      ourResponse?: string;
      significance?: number;
      tags?: string[];
    }
  ) {
    return this.relationshipEngine.recordMoment(type, summary, options);
  }

  /**
   * Record a callback attempt
   */
  recordCallbackAttempt(
    reference: string,
    type: 'moment' | 'topic' | 'joke' | 'goal' | 'person' | 'story',
    userResponse: 'positive' | 'engaged' | 'neutral' | 'confused' | 'ignored',
    threadContinued: boolean,
    context: string
  ) {
    this.relationshipEngine.recordCallbackAttempt(
      reference,
      type,
      userResponse,
      threadContinued,
      context
    );
  }

  /**
   * Record inside joke seed
   */
  recordInsideJokeSeed(phrase: string, context: string, engagement: 'high' | 'medium' | 'low') {
    this.relationshipEngine.recordInsideJokeSeed(phrase, context, engagement);
  }

  // ============================================================================
  // COGNITIVE HELPERS
  // ============================================================================

  /**
   * Get a persona-appropriate question
   */
  getQuestion(type: 'starter' | 'deep_dive' = 'starter'): string | undefined {
    return getPersonaQuestion(this.personaId, type);
  }

  /**
   * Get a disagreement phrase based on intensity
   */
  getDisagreement(intensity: 'mild' | 'moderate' | 'strong' = 'mild'): string | undefined {
    return getDisagreementPhrase(this.personaId, intensity);
  }

  /**
   * Get an insight lead-in
   */
  getInsightIntro(): string | undefined {
    return getInsightLeadIn(this.personaId);
  }

  /**
   * Get silence response based on duration
   */
  getSilenceResponse(durationMs: number): string | undefined {
    if (!this.cognitiveDiff) return undefined;

    const { silenceResponses } = this.cognitiveDiff.silence;

    if (durationMs < 3000) {
      return silenceResponses.short[Math.floor(Math.random() * silenceResponses.short.length)];
    } else if (durationMs < 7000) {
      return silenceResponses.medium[Math.floor(Math.random() * silenceResponses.medium.length)];
    } else {
      return silenceResponses.long[Math.floor(Math.random() * silenceResponses.long.length)];
    }
  }

  // ============================================================================
  // TEAM HELPERS
  // ============================================================================

  /**
   * Get a team reference for another persona
   */
  getTeamRef(
    aboutPersona: string,
    type: 'admiration' | 'playful_teasing' = 'admiration'
  ): string | undefined {
    const ref = getTeamReference(this.personaId, aboutPersona, type);
    if (ref) {
      this.lastTeamReferenceSession = this.sessionNumber;
    }
    return ref || undefined;
  }

  /**
   * Check for team inside joke
   */
  checkTeamJoke(trigger: string): { reference: string } | null {
    return checkTeamInsideJoke(trigger, this.personaId);
  }

  /**
   * Get team compliment for user
   */
  getCompliment(trait?: 'persistence' | 'growth' | 'vulnerability' | 'humor'): string {
    return getTeamCompliment(trait);
  }

  /**
   * Generate handoff note for another persona
   */
  generateHandoff(
    toPersona: string,
    topic: string,
    emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral'
  ): string {
    const trustLevel = this.relationshipEngine.getStage();
    return generateHandoffNote(this.personaId, toPersona, topic, emotionalState, trustLevel);
  }

  // ============================================================================
  // STATE ACCESS
  // ============================================================================

  /**
   * Get current relationship stage
   */
  getRelationshipStage(): RelationshipStage {
    return this.relationshipEngine.getStage();
  }

  /**
   * Get trust score
   */
  getTrustScore(): number {
    return this.relationshipEngine.getTrustScore();
  }

  /**
   * Get full relationship memory
   */
  getRelationshipMemory(): RelationshipMemory {
    return this.relationshipEngine.getMemory();
  }

  /**
   * Get cognitive differentiation profile
   */
  getCognitiveDifferentiation(): CognitiveDifferentiation | undefined {
    return this.cognitiveDiff;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

const engines = new Map<string, PersonaIntelligenceEngine>();

/**
 * Get or create a persona intelligence engine
 */
export function getPersonaIntelligence(
  personaId: string,
  userId: string,
  existingMemory?: RelationshipMemory,
  config?: Partial<PersonaIntelligenceConfig>
): PersonaIntelligenceEngine {
  const key = `${personaId}:${userId}`;
  let engine = engines.get(key);

  if (!engine) {
    engine = new PersonaIntelligenceEngine(personaId, userId, existingMemory, config);
    engines.set(key, engine);
  }

  return engine;
}

/**
 * Clear an intelligence engine
 */
export function clearPersonaIntelligence(personaId: string, userId: string): void {
  const key = `${personaId}:${userId}`;
  engines.delete(key);
}

/**
 * Reset all intelligence engines
 */
export function resetAllPersonaIntelligence(): void {
  engines.clear();
}

export default PersonaIntelligenceEngine;
