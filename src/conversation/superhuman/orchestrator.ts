/**
 * Better Than Human - Main Orchestrator
 *
 * > "Better than human."
 *
 * This orchestrator coordinates all 12 superhuman capabilities to create
 * the "they truly understand me" experience that makes Ferni genuinely
 * better than human support.
 *
 * Capabilities:
 * 1. Emotional Memory Evolution
 * 2. Anticipatory Presence
 * 3. Linguistic Mirroring
 * 4. Visible Vulnerability
 * 5. Spontaneous Delight
 * 6. Protective Instincts
 * 7. Evolving Inside Jokes
 * 8. Cross-Persona Memory Coherence
 * 9. Temporal Emotional Intelligence
 * 10. Meta-Relationship Awareness
 * 11. Somatic Presence
 * 12. "Only I Would Notice" Observations
 *
 * @module @ferni/superhuman/orchestrator
 */

import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getBetterThanHumanContentSync,
  loadBetterThanHumanContent,
  type BetterThanHumanContent,
} from './content-loader.js';
import type {
  BetterThanHumanContext,
  BetterThanHumanInsight,
  PrioritizedAction,
  RelationshipStage,
} from './types.js';

// Import all engines
import { AnticipatoryPresenceEngine, getAnticipatoryPresence } from './anticipatory-presence.js';
import { EmotionalMemoryEngine, getEmotionalMemory } from './emotional-memory.js';
import { EvolvingJokesEngine, getEvolvingJokes } from './evolving-jokes.js';
import { getLinguisticMirroring, LinguisticMirroringEngine } from './linguistic-mirroring.js';
import {
  getMetaRelationship,
  getSomaticPresence,
  MetaRelationshipEngine,
  SomaticPresenceEngine,
} from './meta-relationship.js';
import {
  getProtectiveInstincts,
  getSpontaneousDelight,
  getVisibleVulnerability,
  ProtectiveInstinctsEngine,
  SpontaneousDelightEngine,
  VisibleVulnerabilityEngine,
} from './spontaneous-delight.js';
import {
  getSuperhumanObservations,
  SuperhumanObservationsEngine,
} from './superhuman-observations.js';
import { getTeamCoherence, TeamCoherenceEngine } from './team-coherence.js';
import { getTemporalEmotional, TemporalEmotionalEngine } from './temporal-emotional.js';

const logger = createLogger({ module: 'BetterThanHuman' });

// ============================================================================
// BETTER THAN HUMAN ORCHESTRATOR
// ============================================================================

export class BetterThanHumanOrchestrator {
  private userId: string;
  private sessionId: string;
  private personaId: string;

  // All 12 engines
  private emotionalMemory: EmotionalMemoryEngine;
  private anticipatoryPresence: AnticipatoryPresenceEngine;
  private linguisticMirroring: LinguisticMirroringEngine;
  private spontaneousDelight: SpontaneousDelightEngine;
  private visibleVulnerability: VisibleVulnerabilityEngine;
  private protectiveInstincts: ProtectiveInstinctsEngine;
  private evolvingJokes: EvolvingJokesEngine;
  private teamCoherence: TeamCoherenceEngine;
  private temporalEmotional: TemporalEmotionalEngine;
  private metaRelationship: MetaRelationshipEngine;
  private somaticPresence: SomaticPresenceEngine;
  private superhumanObservations: SuperhumanObservationsEngine;

  private turnCount = 0;
  private sessionCount = 0;
  private content: BetterThanHumanContent;

  // Session tracking for end-of-session summaries
  private sessionEnergySum = 0;
  private sessionEnergyCount = 0;
  private sessionConcernsDetected = false;

  constructor(userId: string, sessionId: string, personaId: string, sessionCount: number = 0) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.personaId = personaId;
    this.sessionCount = sessionCount;

    // Load content (async but we cache it)
    this.content = getBetterThanHumanContentSync(personaId);
    void this.loadContent(personaId);

    // Initialize all engines
    this.emotionalMemory = getEmotionalMemory(userId);
    this.anticipatoryPresence = getAnticipatoryPresence(userId);
    this.linguisticMirroring = getLinguisticMirroring(userId);
    this.spontaneousDelight = getSpontaneousDelight(userId);
    this.visibleVulnerability = getVisibleVulnerability(userId);
    this.protectiveInstincts = getProtectiveInstincts(userId);
    this.evolvingJokes = getEvolvingJokes(userId);
    this.teamCoherence = getTeamCoherence(userId);
    this.temporalEmotional = getTemporalEmotional(userId);
    this.metaRelationship = getMetaRelationship(userId);
    this.somaticPresence = getSomaticPresence(userId);
    this.superhumanObservations = getSuperhumanObservations(userId);

    logger.info(
      { userId, sessionId, personaId, sessionCount },
      '🌟 BetterThanHuman orchestrator initialized'
    );
  }

  /**
   * Load persona-specific content asynchronously
   */
  private async loadContent(personaId: string): Promise<void> {
    try {
      this.content = await loadBetterThanHumanContent(personaId);
      logger.debug({ personaId }, 'Loaded Better Than Human content');
    } catch (error) {
      logger.warn({ error, personaId }, 'Failed to load Better Than Human content');
    }
  }

  /**
   * Get loaded content for external access
   */
  getContent(): BetterThanHumanContent {
    return this.content;
  }

  // ==========================================================================
  // MAIN ANALYSIS
  // ==========================================================================

  /**
   * Analyze a turn and get all superhuman insights
   */
  analyze(context: BetterThanHumanContext): BetterThanHumanInsight {
    this.turnCount = context.turnCount;

    // Track session-wide metrics for end-of-session summaries
    const turnEnergy = this.calculateEnergyLevel(context.userMessage);
    this.sessionEnergySum += turnEnergy;
    this.sessionEnergyCount++;
    if (this.detectConcerns(context.userMessage)) {
      this.sessionConcernsDetected = true;
    }

    // 1. Learn from user message (all engines that learn)
    this.learnFromMessage(context);

    // 2. Detect patterns and states
    const selfCriticism = this.protectiveInstincts.detectSelfCriticism(context.userMessage);

    // 3. Gather all potential insights
    const actions: PrioritizedAction[] = [];

    // --- PROTECTIVE RESPONSE (highest priority) ---
    if (selfCriticism.detected && selfCriticism.type) {
      const protection = this.protectiveInstincts.getProtectiveResponse(
        selfCriticism.type,
        selfCriticism.severity,
        context.relationshipStage
      );
      actions.push({
        type: 'protection',
        content: protection.phrase,
        placement: protection.placement,
        priority: 0.95,
        reason: `Self-criticism detected: ${selfCriticism.type}`,
      });
    }

    // --- SOMATIC PRESENCE ---
    const somatic = this.somaticPresence.checkForSomaticCue(
      {
        topicWeight: this.assessTopicWeight(context),
        turnCount: context.turnCount,
        isSessionStart: context.isSessionStart,
        userEnergy: this.assessUserEnergy(context.userMessage),
        emotionalContent: this.hasEmotionalContent(context),
        wasResolved: this.detectResolution(context.userMessage),
      },
      context.turnCount
    );
    if (somatic.shouldEmit && somatic.content) {
      actions.push({
        type: 'somatic',
        content: somatic.content,
        placement: somatic.placement || 'prefix',
        priority: 0.85,
        reason: `Somatic cue: ${somatic.type}`,
      });
    }

    // --- ANTICIPATORY PRESENCE (session start) ---
    if (context.isSessionStart) {
      const anticipation = this.anticipatoryPresence.getAnticipation({
        hour: new Date().getHours(),
        dayOfWeek: context.dayOfWeek,
        isReturningUser: this.sessionCount > 0,
        sessionCount: this.sessionCount,
        currentTopic: context.topic,
        detectedMood: context.emotion,
      });
      if (anticipation.shouldAnticipate && anticipation.phrase) {
        actions.push({
          type: 'anticipation',
          content: anticipation.phrase,
          placement: 'prefix',
          priority: 0.8,
          reason: `Anticipated: ${anticipation.type}`,
        });
      }
    }

    // --- TEAM AWARENESS (session start) ---
    const teamAwareness = this.teamCoherence.checkForTeamAwareness(this.personaId, {
      turnCount: context.turnCount,
      isSessionStart: context.isSessionStart,
      currentTopic: context.topic,
      sessionCount: this.sessionCount,
    });
    if (teamAwareness.shouldMention && teamAwareness.phrase) {
      actions.push({
        type: 'team_awareness',
        content: teamAwareness.phrase,
        placement: 'prefix',
        priority: 0.7,
        reason: `Team awareness: ${teamAwareness.type}`,
      });
    }

    // --- EMOTIONAL BOND PHRASE ---
    const bondPhrase = this.emotionalMemory.getBondPhrase({
      turnCount: context.turnCount,
      topic: context.topic,
      wasVulnerable: this.hasEmotionalContent(context),
      showedGrowth: this.detectGrowth(context.userMessage),
    });
    if (bondPhrase) {
      actions.push({
        type: 'bond_phrase',
        content: bondPhrase.phrase,
        placement: 'suffix',
        priority: 0.6,
        reason: `Bond phrase: ${bondPhrase.type}`,
      });
    }

    // --- SPONTANEOUS DELIGHT ---
    const delight = this.spontaneousDelight.checkForDelight({
      turnCount: context.turnCount,
      sessionCount: this.sessionCount,
      recentTone: this.assessRecentTone(context),
      recentVulnerability: this.hasEmotionalContent(context),
      recentGrowth: this.detectGrowth(context.userMessage),
      relationshipStage: context.relationshipStage,
      lastDelightTurn: 0,
    });
    if (delight.shouldEmit && delight.phrase) {
      actions.push({
        type: 'delight',
        content: delight.phrase,
        placement: delight.placement || 'suffix',
        priority: 0.55,
        reason: `Spontaneous delight: ${delight.type}`,
      });
    }

    // --- TEMPORAL INSIGHT ---
    const temporalInsight = this.temporalEmotional.getTemporalInsight({
      turnCount: context.turnCount,
      currentEnergy: this.calculateEnergyLevel(context.userMessage),
      currentPositivity: this.assessRecentTone(context) === 'light' ? 0.7 : 0.5,
      sessionCount: this.sessionCount,
    });
    if (temporalInsight.shouldMention && temporalInsight.phrase) {
      actions.push({
        type: 'temporal_insight',
        content: temporalInsight.phrase,
        placement: 'prefix',
        priority: 0.5,
        reason: `Temporal insight: ${temporalInsight.type}`,
      });
    }

    // --- META-RELATIONSHIP ---
    const metaComment = this.metaRelationship.checkForMetaComment({
      turnCount: context.turnCount,
      wasVulnerable: this.hasEmotionalContent(context),
      wasLaughter: this.hasLaughter(context.userMessage),
      wasBreakthrough: this.detectBreakthrough(context.userMessage),
    });
    if (metaComment.shouldComment && metaComment.phrase) {
      actions.push({
        type: 'meta_relationship',
        content: metaComment.phrase,
        placement: 'suffix',
        priority: 0.45,
        reason: `Meta-relationship: ${metaComment.type}`,
      });
    }

    // --- INSIDE JOKE CALLBACK ---
    const jokeCallback = this.evolvingJokes.checkForCallback({
      turnCount: context.turnCount,
      topic: context.topic,
      recentTone: this.assessRecentTone(context),
      sessionCount: this.sessionCount,
    });
    if (jokeCallback.shouldCallback && jokeCallback.phrase) {
      actions.push({
        type: 'joke_callback',
        content: jokeCallback.phrase,
        placement: 'suffix',
        priority: 0.4,
        reason: 'Inside joke callback',
      });
    }

    // --- SUPERHUMAN OBSERVATION ---
    const observation = this.superhumanObservations.checkForSurfacing({
      turnCount: context.turnCount,
      sessionCount: this.sessionCount,
      relationshipStage: context.relationshipStage,
      currentTopic: context.topic,
    });
    if (observation.shouldSurface && observation.phrase) {
      actions.push({
        type: 'observation',
        content: observation.phrase,
        placement: 'suffix',
        priority: 0.35,
        reason: `Superhuman observation: ${observation.observation?.type}`,
      });
    }

    // Sort by priority
    const prioritizedActions = actions.sort((a, b) => b.priority - a.priority);

    // Build insight
    const insight: BetterThanHumanInsight = {
      emotionalBond: this.emotionalMemory.getBond(),
      anticipation: context.isSessionStart
        ? this.anticipatoryPresence.getAnticipation({
            hour: new Date().getHours(),
            dayOfWeek: context.dayOfWeek,
            isReturningUser: this.sessionCount > 0,
            sessionCount: this.sessionCount,
            currentTopic: context.topic,
            detectedMood: context.emotion,
          })
        : undefined,
      delight: delight.shouldEmit ? delight : undefined,
      protection: selfCriticism.detected
        ? {
            shouldIntervene: true,
            interventionType: 'gentle_pushback',
            phrase: actions.find((a) => a.type === 'protection')?.content,
            placement: 'prefix',
          }
        : undefined,
      somatic: somatic.shouldEmit ? somatic : undefined,
      temporalInsight: temporalInsight.shouldMention ? temporalInsight : undefined,
      metaRelationship: metaComment.shouldComment ? metaComment : undefined,
      jokeCallback: jokeCallback.shouldCallback ? jokeCallback : undefined,
      teamAwareness: teamAwareness.shouldMention ? teamAwareness : undefined,
      observation: observation.shouldSurface ? observation : undefined,
      confidence: this.calculateOverallConfidence(actions),
      prioritizedActions,
    };

    // Emit signals to frontend for avatar EQ
    this.emitSignals(insight);

    logger.debug(
      {
        turn: context.turnCount,
        actionCount: prioritizedActions.length,
        topAction: prioritizedActions[0]?.type,
      },
      '🌟 BetterThanHuman analysis complete'
    );

    return insight;
  }

  /**
   * Apply linguistic mirroring to a response
   */
  applyMirroring(response: string): string {
    const result = this.linguisticMirroring.applyMirroring(response);
    return result.mirroredResponse;
  }

  /**
   * Apply insights to a response
   */
  applyInsights(response: string, insight: BetterThanHumanInsight, maxActions: number = 2): string {
    let result = response;
    const applied: string[] = [];

    // Apply top N actions
    for (const action of insight.prioritizedActions.slice(0, maxActions)) {
      switch (action.placement) {
        case 'prefix':
          result = `${action.content} ${result}`;
          break;
        case 'suffix':
          result = `${result} ${action.content}`;
          break;
        case 'interrupt':
          result = `${action.content} <break time="300ms"/> ${result}`;
          break;
        case 'inline':
          // Insert after first sentence
          const firstSentence = result.match(/^[^.!?]+[.!?]/);
          if (firstSentence) {
            result = `${firstSentence[0]} ${action.content} ${result.slice(firstSentence[0].length)}`;
          } else {
            result = `${action.content} ${result}`;
          }
          break;
        case 'standalone':
          result = action.content;
          break;
      }
      applied.push(action.type);
    }

    // Apply mirroring last
    result = this.applyMirroring(result);

    logger.debug({ applied }, '🌟 Insights applied to response');

    return result;
  }

  /**
   * Emit signals to frontend for avatar EQ response
   */
  emitSignals(insight: BetterThanHumanInsight): void {
    // Emit signals based on what was detected
    const actions = insight.prioritizedActions.slice(0, 3);

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'protection':
            void humanizationSignalEmitter.protectiveInstinct(action.reason, action.priority);
            break;
          case 'spontaneous_delight':
            void humanizationSignalEmitter.spontaneousDelight(action.reason, action.priority);
            break;
          case 'bond_phrase':
            // Extract bond type from reason
            const bondMatch = action.reason.match(/Bond phrase: (\w+)/);
            if (bondMatch) {
              void humanizationSignalEmitter.emotionalBondDeepen(
                bondMatch[1] as 'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern',
                insight.emotionalBond.warmth
              );
            }
            break;
          case 'inside_joke':
            void humanizationSignalEmitter.insideJokeCallback(
              (insight.jokeCallback?.joke?.phase as 'new' | 'established' | 'legacy') ||
                'established',
              action.content
            );
            break;
          case 'superhuman_observation':
            void humanizationSignalEmitter.superhumanObservation(
              (insight.observation?.observation?.type as
                | 'linguistic'
                | 'behavioral'
                | 'emotional'
                | 'relationship') || 'behavioral',
              action.content
            );
            break;
          case 'visible_vulnerability':
            void humanizationSignalEmitter.visibleVulnerability(action.reason, action.priority);
            break;
          case 'temporal_insight':
            void humanizationSignalEmitter.temporalInsight(action.content, action.priority);
            break;
          case 'meta_relationship':
            void humanizationSignalEmitter.metaRelationshipMoment(action.reason, action.priority);
            break;
          case 'somatic':
            void humanizationSignalEmitter.somaticPresence(action.reason, action.priority);
            break;
          case 'anticipation':
            void humanizationSignalEmitter.anticipatoryPresence(action.priority);
            break;
        }
      } catch (err) {
        logger.warn({ error: err, actionType: action.type }, 'Failed to emit signal');
      }
    }

    // Always emit emotional bond state if bond is strong
    if (insight.emotionalBond.warmth > 0.7) {
      void humanizationSignalEmitter.emotionalBondDeepen('warmth', insight.emotionalBond.warmth);
    }
  }

  // ==========================================================================
  // LEARNING
  // ==========================================================================

  private learnFromMessage(context: BetterThanHumanContext): void {
    // Linguistic mirroring
    this.linguisticMirroring.analyzeMessage(context.userMessage);

    // Superhuman observations
    this.superhumanObservations.analyzeMessage(context.userMessage);

    // Joke seed detection
    const jokeSeed = this.evolvingJokes.detectJokeSeed(context.userMessage, {
      topic: context.topic,
      wasHumorous: this.hasLaughter(context.userMessage),
    });
    if (jokeSeed.detected && jokeSeed.seed && jokeSeed.type) {
      this.evolvingJokes.createJoke(jokeSeed.seed, jokeSeed.type, context.topic);
    }

    // Record topic for team coherence
    if (context.topic) {
      this.teamCoherence.recordTopicDiscussion(this.personaId, context.topic);
    }

    // Update emotional bond based on context
    if (this.hasEmotionalContent(context)) {
      this.emotionalMemory.recordEvent('vulnerability_shared', {
        topic: context.topic,
        description: 'User shared something emotional',
      });
    }

    if (this.hasLaughter(context.userMessage)) {
      this.emotionalMemory.recordEvent('laughter_shared');
    }
  }

  // ==========================================================================
  // SESSION LIFECYCLE
  // ==========================================================================

  /**
   * Record session start
   */
  recordSessionStart(): void {
    const now = new Date();
    this.anticipatoryPresence.recordSessionStart({
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
    });

    // Reset session tracking metrics
    this.sessionEnergySum = 0;
    this.sessionEnergyCount = 0;
    this.sessionConcernsDetected = false;
  }

  /**
   * Record session end
   */
  recordSessionEnd(context: {
    topics: string[];
    emotionalTone: string;
    keyMoments?: string[];
  }): void {
    // Record session emotion snapshot
    const avgEnergy =
      this.sessionEnergyCount > 0 ? this.sessionEnergySum / this.sessionEnergyCount : 0.5;
    this.temporalEmotional.recordSessionEmotion({
      dominantEmotion: context.emotionalTone,
      energyLevel: avgEnergy,
      positivity:
        context.emotionalTone === 'light' ? 0.7 : context.emotionalTone === 'heavy' ? 0.3 : 0.5,
      topics: context.topics,
      concernsDetected: this.sessionConcernsDetected,
    });

    // Record emotional bond session
    this.emotionalMemory.recordSessionEnd();

    // Record meta-relationship session
    this.metaRelationship.recordSession();

    // Record team handoff
    // (In a real implementation, this would go to the next persona)

    // Reset session-specific engines
    this.somaticPresence.reset();
    this.spontaneousDelight.reset();
    this.visibleVulnerability.reset();

    this.sessionCount++;

    logger.info(
      { sessionCount: this.sessionCount, topics: context.topics.length },
      '🌟 Session ended'
    );
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private assessTopicWeight(context: BetterThanHumanContext): 'light' | 'medium' | 'heavy' {
    const heavyPatterns = [
      /\b(death|died|cancer|terminal|divorce|abuse|trauma|suicide|depression|anxiety)\b/i,
      /\b(lost|fired|bankruptcy|foreclosure)\b/i,
    ];
    const lightPatterns = [
      /\b(haha|lol|fun|excited|happy|great|awesome)\b/i,
      /\b(vacation|weekend|party|celebrate)\b/i,
    ];

    if (heavyPatterns.some((p) => p.test(context.userMessage))) return 'heavy';
    if (lightPatterns.some((p) => p.test(context.userMessage))) return 'light';
    if (context.emotion === 'sadness' || context.emotion === 'fear') return 'heavy';
    if (context.emotion === 'joy') return 'light';

    return 'medium';
  }

  private assessUserEnergy(message: string): 'high' | 'medium' | 'low' {
    const highEnergy = /[!]{2,}|[A-Z]{3,}|\b(excited|amazing|awesome|incredible|YES)\b/i;
    const lowEnergy = /\b(tired|exhausted|drained|meh|whatever|fine)\b/i;

    if (highEnergy.test(message)) return 'high';
    if (lowEnergy.test(message)) return 'low';

    // Also check message length
    if (message.split(/\s+/).length < 5) return 'low';
    if (message.split(/\s+/).length > 50) return 'high';

    return 'medium';
  }

  private assessRecentTone(context: BetterThanHumanContext): 'heavy' | 'light' | 'neutral' {
    const weight = this.assessTopicWeight(context);
    if (weight === 'heavy') return 'heavy';
    if (weight === 'light') return 'light';
    return 'neutral';
  }

  private hasEmotionalContent(context: BetterThanHumanContext): boolean {
    const emotionalPatterns = [
      /\bi feel\b/i,
      /\b(scared|worried|anxious|stressed|sad|hurt|angry|frustrated|overwhelmed)\b/i,
      /\bhonestly\b/i,
      /\bthe truth is\b/i,
      /\bi('ve| have) never told anyone\b/i,
    ];
    return emotionalPatterns.some((p) => p.test(context.userMessage));
  }

  private hasLaughter(message: string): boolean {
    return /\b(haha|lol|lmao|rofl)\b/i.test(message) || message.includes('😂');
  }

  // ==========================================================================
  // DETECTION HELPERS
  // ==========================================================================

  /**
   * Detect if user message shows personal growth or progress
   */
  private detectGrowth(message: string): boolean {
    const growthPatterns = [
      /\bi (finally|actually) (did|made|started|finished)/i,
      /\bi('?ve| have) (been|started|made progress)/i,
      /\bit('?s| is) getting (better|easier)/i,
      /\bi('?m| am) (proud|happy|excited) (of|about|that)/i,
      /\b(breakthrough|realized|figured out|understand now)/i,
      /\bi (overcame|conquered|beat|handled)/i,
      /\bused to .* but now/i,
      /\bfor the first time/i,
    ];
    return growthPatterns.some((p) => p.test(message));
  }

  /**
   * Detect if user message indicates a breakthrough moment
   */
  private detectBreakthrough(message: string): boolean {
    const breakthroughPatterns = [
      /\b(oh|wow|wait)[\s,!]+i (just|never|finally)/i,
      /\b(everything|it all) (makes sense|clicked)/i,
      /\bi (never|didn('?t| not)) (realized|thought|knew)/i,
      /\bthat('?s| is) (it|exactly|what)/i,
      /\bwow,? (i|that|you)/i,
      /\bi get it now/i,
      /\bthis changes everything/i,
      /\blightbulb moment/i,
    ];
    return breakthroughPatterns.some((p) => p.test(message));
  }

  /**
   * Detect if an issue/concern was resolved
   */
  private detectResolution(message: string): boolean {
    const resolutionPatterns = [
      /\b(solved|fixed|resolved|handled|done|figured out)/i,
      /\bno longer (worried|stressed|anxious)/i,
      /\b(feel|feeling) (better|relieved|good) (about|now)/i,
      /\bthat('?s| is) (sorted|taken care of)/i,
      /\bworked out/i,
      /\bproblem solved/i,
    ];
    return resolutionPatterns.some((p) => p.test(message));
  }

  /**
   * Detect if user is expressing concerns
   */
  private detectConcerns(message: string): boolean {
    const concernPatterns = [
      /\bi('?m| am) (worried|concerned|anxious|scared|stressed) (about|that)/i,
      /\bwhat if/i,
      /\bi('?m| am) afraid/i,
      /\bkeeps me (up|awake)/i,
      /\bcan('?t| not) stop (thinking|worrying)/i,
      /\bit('?s| is) (stressing|worrying|bothering) me/i,
    ];
    return concernPatterns.some((p) => p.test(message));
  }

  /**
   * Calculate energy level (0-1 scale) from message
   */
  private calculateEnergyLevel(message: string): number {
    const energy = this.assessUserEnergy(message);
    switch (energy) {
      case 'high':
        return 0.8;
      case 'low':
        return 0.3;
      default:
        return 0.5;
    }
  }

  private calculateOverallConfidence(actions: PrioritizedAction[]): number {
    if (actions.length === 0) return 0.5;

    const topPriorities = actions.slice(0, 3).map((a) => a.priority);
    return topPriorities.reduce((sum, p) => sum + p, 0) / topPriorities.length;
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get relationship stage
   */
  getRelationshipStage(): RelationshipStage {
    return this.emotionalMemory.getRelationshipStage();
  }

  /**
   * Get emotional bond metrics
   */
  getBondMetrics() {
    return this.emotionalMemory.getBondMetrics();
  }

  /**
   * Export all state for persistence
   */
  export() {
    return {
      emotionalBond: this.emotionalMemory.export(),
      anticipation: this.anticipatoryPresence.export(),
      linguistic: this.linguisticMirroring.export(),
      jokes: this.evolvingJokes.export(),
      team: this.teamCoherence.export(),
      temporal: this.temporalEmotional.export(),
      metaRelationship: this.metaRelationship.export(),
      observations: this.superhumanObservations.export(),
      sessionCount: this.sessionCount,
    };
  }

  /**
   * Import state from persistence
   */
  import(data: ReturnType<BetterThanHumanOrchestrator['export']>): void {
    if (data.emotionalBond) this.emotionalMemory.import(data.emotionalBond);
    if (data.anticipation) this.anticipatoryPresence.import(data.anticipation);
    if (data.linguistic) this.linguisticMirroring.import(data.linguistic);
    if (data.jokes) this.evolvingJokes.import(data.jokes);
    if (data.team) this.teamCoherence.import(data.team);
    if (data.temporal) this.temporalEmotional.import(data.temporal);
    if (data.metaRelationship) this.metaRelationship.import(data.metaRelationship);
    if (data.observations) this.superhumanObservations.import(data.observations);
    if (data.sessionCount) this.sessionCount = data.sessionCount;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.emotionalMemory.reset();
    this.anticipatoryPresence.reset();
    this.linguisticMirroring.reset();
    this.evolvingJokes.reset();
    this.teamCoherence.reset();
    this.temporalEmotional.reset();
    this.metaRelationship.reset();
    this.superhumanObservations.reset();
    this.somaticPresence.reset();
    this.turnCount = 0;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';

/**
 * Session registry for Better Than Human orchestrators.
 *
 * 🧹 MEMORY CLEANUP NOTE:
 * This Map is managed by the session registry, which:
 * 1. Automatically calls reset() when a session is reset
 * 2. Deletes the Map entry after cleanup
 * 3. Registers with the global registry for coordinated cleanup
 *
 * The key format is `${userId}:${sessionId}` to support multiple sessions.
 */
const orchestratorRegistry = createSessionRegistry<BetterThanHumanOrchestrator>(
  (key: string) => {
    // Key is pre-formatted as `${userId}:${sessionId}` - extract parts
    const [userId, sessionId] = key.split(':');
    return new BetterThanHumanOrchestrator(userId, sessionId, 'ferni', 0);
  },
  {
    name: 'BetterThanHumanOrchestrator',
    cleanup: (orchestrator: BetterThanHumanOrchestrator) => orchestrator.reset(),
    verbose: false,
  }
);

// Register for global session cleanup
registerGlobalRegistry(orchestratorRegistry);

/**
 * Get or create the Better Than Human orchestrator
 */
export function getBetterThanHuman(
  userId: string,
  sessionId: string,
  personaId: string,
  sessionCount: number = 0
): BetterThanHumanOrchestrator {
  const key = `${userId}:${sessionId}`;
  if (!orchestratorRegistry.has(key)) {
    // Create with full params by bypassing registry factory
    const orchestrator = new BetterThanHumanOrchestrator(
      userId,
      sessionId,
      personaId,
      sessionCount
    );
    return orchestrator;
  }
  return orchestratorRegistry.get(key);
}

/**
 * Clear orchestrator
 */
export function clearBetterThanHuman(userId: string, sessionId: string): void {
  orchestratorRegistry.reset(`${userId}:${sessionId}`);
}

/**
 * Get an existing orchestrator for a user without creating a new one.
 * Used for exporting state without causing memory leaks from orphaned orchestrators.
 *
 * @returns The most recent orchestrator for this user, or undefined if none exists
 */
export function getExistingBetterThanHumanForUser(
  userId: string
): BetterThanHumanOrchestrator | undefined {
  // Find any orchestrator for this user (they all share the same underlying engine data)
  for (const sessionId of orchestratorRegistry.getActiveSessionIds()) {
    if (sessionId.startsWith(`${userId}:`)) {
      return orchestratorRegistry.get(sessionId);
    }
  }
  return undefined;
}

/**
 * Get count of active orchestrators (for debugging memory leaks)
 */
export function getOrchestratorCount(): number {
  return orchestratorRegistry.getActiveCount();
}

/**
 * Clear all orchestrators for a user (cleanup on session end)
 */
export function clearAllBetterThanHumanForUser(userId: string): void {
  const keysToDelete: string[] = [];
  for (const key of orchestratorRegistry.getActiveSessionIds()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    orchestratorRegistry.reset(key);
  }
  if (keysToDelete.length > 0) {
    logger.debug({ userId, clearedCount: keysToDelete.length }, '🧹 Cleared user orchestrators');
  }
}

export default BetterThanHumanOrchestrator;
