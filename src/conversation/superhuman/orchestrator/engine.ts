/**
 * Better Than Human - Main Orchestrator Engine
 *
 * @module @ferni/superhuman/orchestrator/engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getBetterThanHumanContentSync,
  loadBetterThanHumanContent,
  type BetterThanHumanContent,
} from '../content-loader.js';
import type {
  BetterThanHumanContext,
  BetterThanHumanInsight,
  PrioritizedAction,
  RelationshipStage,
} from '../types.js';

// Import all engines
import {
  type AnticipatoryPresenceEngine,
  getAnticipatoryPresence,
} from '../anticipatory-presence.js';
import { type EmotionalMemoryEngine, getEmotionalMemory } from '../emotional-memory.js';
import { type EvolvingJokesEngine, getEvolvingJokes } from '../evolving-jokes.js';
import { type LinguisticMirroringEngine, getLinguisticMirroring } from '../linguistic-mirroring.js';
import {
  type MetaRelationshipEngine,
  type SomaticPresenceEngine,
  getMetaRelationship,
  getSomaticPresence,
} from '../meta-relationship.js';
import {
  type ProtectiveInstinctsEngine,
  type SpontaneousDelightEngine,
  type VisibleVulnerabilityEngine,
  getProtectiveInstincts,
  getSpontaneousDelight,
  getVisibleVulnerability,
} from '../spontaneous-delight.js';
import {
  type SuperhumanObservationsEngine,
  getSuperhumanObservations,
} from '../superhuman-observations.js';
import { type TeamCoherenceEngine, getTeamCoherence } from '../team-coherence.js';
import { type TemporalEmotionalEngine, getTemporalEmotional } from '../temporal-emotional.js';

import * as helpers from './helpers.js';
import { emitSignals } from './signal-emitter.js';

const logger = createLogger({ module: 'BetterThanHuman' });

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

  private sessionEnergySum = 0;
  private sessionEnergyCount = 0;
  private sessionConcernsDetected = false;

  constructor(userId: string, sessionId: string, personaId: string, sessionCount = 0) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.personaId = personaId;
    this.sessionCount = sessionCount;

    this.content = getBetterThanHumanContentSync(personaId);
    void this.loadContent(personaId);

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

  private async loadContent(personaId: string): Promise<void> {
    try {
      this.content = await loadBetterThanHumanContent(personaId);
      logger.debug({ personaId }, 'Loaded Better Than Human content');
    } catch (error) {
      logger.warn({ error, personaId }, 'Failed to load Better Than Human content');
    }
  }

  getContent(): BetterThanHumanContent {
    return this.content;
  }

  /**
   * Analyze a turn and get all superhuman insights
   */
  analyze(context: BetterThanHumanContext): BetterThanHumanInsight {
    this.turnCount = context.turnCount;

    const turnEnergy = helpers.calculateEnergyLevel(context.userMessage);
    this.sessionEnergySum += turnEnergy;
    this.sessionEnergyCount++;
    if (helpers.detectConcerns(context.userMessage)) {
      this.sessionConcernsDetected = true;
    }

    this.learnFromMessage(context);

    const selfCriticism = this.protectiveInstincts.detectSelfCriticism(context.userMessage);
    const actions: PrioritizedAction[] = [];

    // --- PROTECTIVE RESPONSE ---
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
        topicWeight: helpers.assessTopicWeight(context),
        turnCount: context.turnCount,
        isSessionStart: context.isSessionStart,
        userEnergy: helpers.assessUserEnergy(context.userMessage),
        emotionalContent: helpers.hasEmotionalContent(context),
        wasResolved: helpers.detectResolution(context.userMessage),
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

    // --- ANTICIPATORY PRESENCE ---
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

    // --- TEAM AWARENESS ---
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
      wasVulnerable: helpers.hasEmotionalContent(context),
      showedGrowth: helpers.detectGrowth(context.userMessage),
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
      recentTone: helpers.assessRecentTone(context),
      recentVulnerability: helpers.hasEmotionalContent(context),
      recentGrowth: helpers.detectGrowth(context.userMessage),
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
      currentEnergy: helpers.calculateEnergyLevel(context.userMessage),
      currentPositivity: helpers.assessRecentTone(context) === 'light' ? 0.7 : 0.5,
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
      wasVulnerable: helpers.hasEmotionalContent(context),
      wasLaughter: helpers.hasLaughter(context.userMessage),
      wasBreakthrough: helpers.detectBreakthrough(context.userMessage),
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
      recentTone: helpers.assessRecentTone(context),
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

    const prioritizedActions = actions.sort((a, b) => b.priority - a.priority);

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

    emitSignals(insight);

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

  applyMirroring(response: string): string {
    const result = this.linguisticMirroring.applyMirroring(response);
    return result.mirroredResponse;
  }

  applyInsights(response: string, insight: BetterThanHumanInsight, maxActions = 2): string {
    let result = response;
    const applied: string[] = [];

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
        case 'inline': {
          const firstSentence = result.match(/^[^.!?]+[.!?]/);
          if (firstSentence) {
            result = `${firstSentence[0]} ${action.content} ${result.slice(firstSentence[0].length)}`;
          } else {
            result = `${action.content} ${result}`;
          }
          break;
        }
        case 'standalone':
          result = action.content;
          break;
      }
      applied.push(action.type);
    }

    result = this.applyMirroring(result);
    logger.debug({ applied }, '🌟 Insights applied to response');
    return result;
  }

  private learnFromMessage(context: BetterThanHumanContext): void {
    this.linguisticMirroring.analyzeMessage(context.userMessage);
    this.superhumanObservations.analyzeMessage(context.userMessage);

    const jokeSeed = this.evolvingJokes.detectJokeSeed(context.userMessage, {
      topic: context.topic,
      wasHumorous: helpers.hasLaughter(context.userMessage),
    });
    if (jokeSeed.detected && jokeSeed.seed && jokeSeed.type) {
      this.evolvingJokes.createJoke(jokeSeed.seed, jokeSeed.type, context.topic);
    }

    if (context.topic) {
      this.teamCoherence.recordTopicDiscussion(this.personaId, context.topic);
    }

    if (helpers.hasEmotionalContent(context)) {
      this.emotionalMemory.recordEvent('vulnerability_shared', {
        topic: context.topic,
        description: 'User shared something emotional',
      });
    }

    if (helpers.hasLaughter(context.userMessage)) {
      this.emotionalMemory.recordEvent('laughter_shared');
    }
  }

  recordSessionStart(): void {
    const now = new Date();
    this.anticipatoryPresence.recordSessionStart({
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
    });
    this.sessionEnergySum = 0;
    this.sessionEnergyCount = 0;
    this.sessionConcernsDetected = false;
  }

  recordSessionEnd(context: {
    topics: string[];
    emotionalTone: string;
    keyMoments?: string[];
  }): void {
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

    this.emotionalMemory.recordSessionEnd();
    this.metaRelationship.recordSession();
    this.somaticPresence.reset();
    this.spontaneousDelight.reset();
    this.visibleVulnerability.reset();
    this.sessionCount++;

    logger.info(
      { sessionCount: this.sessionCount, topics: context.topics.length },
      '🌟 Session ended'
    );
  }

  private calculateOverallConfidence(actions: PrioritizedAction[]): number {
    if (actions.length === 0) return 0.5;
    const topPriorities = actions.slice(0, 3).map((a) => a.priority);
    return topPriorities.reduce((sum, p) => sum + p, 0) / topPriorities.length;
  }

  getRelationshipStage(): RelationshipStage {
    return this.emotionalMemory.getRelationshipStage();
  }

  getBondMetrics() {
    return this.emotionalMemory.getBondMetrics();
  }

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

export default BetterThanHumanOrchestrator;
