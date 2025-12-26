/**
 * Anticipatory Presence
 *
 * > "I was actually hoping you'd call today."
 *
 * Detects patterns in when and why users reach out, enabling
 * proactive "I was thinking about you" moments that exceed
 * human pattern recognition.
 *
 * Key capabilities:
 * - Temporal patterns (Monday stress, late night calls)
 * - Topic associations (work → mom always follows)
 * - Emotional triggers (what makes them reach out)
 * - Energy patterns (time-based energy variations)
 *
 * @module @ferni/superhuman/anticipatory-presence
 */

import { seededChance, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  AnticipationResult,
  EnergyPattern,
  TemporalPattern,
  UserPatternProfile,
} from './types.js';

const logger = createLogger({ module: 'AnticipatoryPresence' });

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PROFILE: UserPatternProfile = {
  temporalPatterns: [],
  emotionalTriggers: [],
  topicAssociations: [],
  energyPatterns: [],
  lastUpdated: new Date(),
};

// Time pattern categories
const TIME_PATTERNS = {
  early_morning: { start: 5, end: 8 },
  morning: { start: 8, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 21 },
  night: { start: 21, end: 24 },
  late_night: { start: 0, end: 5 },
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ============================================================================
// ANTICIPATION PHRASES
// ============================================================================

const ANTICIPATION_PHRASES = {
  temporal_pattern: {
    monday_stress: [
      "I was actually hoping you'd call today. Mondays seem heavy for you.",
      'Monday again, huh? I figured you might reach out.',
      "I had a feeling I'd hear from you today.",
    ],
    late_night: [
      "Late night thoughts? I'm here.",
      'Something keeping you up? I had a feeling.',
      'The quiet hours. I know these are when you do your real thinking.',
    ],
    friday_reflective: [
      'End of week reflection time. I was thinking about you.',
      "Friday debrief? I wondered if you'd call.",
    ],
    weekend: [
      "Weekend check-in. I'm glad you reached out.",
      'Taking time for yourself this weekend. Good.',
    ],
  },
  topic_anticipation: [
    'I had a feeling {topic} would come up.',
    'You know, I was thinking about {topic} earlier.',
    "I wondered if we'd get back to {topic}.",
  ],
  mood_prediction: {
    stressed: [
      'I sensed something was weighing on you.',
      'I could tell you had something on your mind.',
    ],
    reflective: [
      'In a thoughtful mood today. I can tell.',
      'Deep thinking mode. I like these conversations.',
    ],
    energetic: ["You've got energy today! I can hear it.", 'Something good happened. I can tell.'],
  },
  need_anticipation: [
    "You need to talk this through, don't you?",
    'Sometimes you just need someone to listen.',
    'I know what you need right now.',
  ],
};

// ============================================================================
// ANTICIPATORY PRESENCE ENGINE
// ============================================================================

export class AnticipatoryPresenceEngine {
  private profile: UserPatternProfile;
  private userId: string;
  private sessionHistory: SessionRecord[] = [];

  constructor(userId: string, existingProfile?: UserPatternProfile) {
    this.userId = userId;
    this.profile = existingProfile ? { ...existingProfile } : { ...DEFAULT_PROFILE };
  }

  // ==========================================================================
  // PATTERN RECORDING
  // ==========================================================================

  /**
   * Record a session start for pattern detection
   */
  recordSessionStart(context: {
    hour: number;
    dayOfWeek: number;
    detectedMood?: string;
    topics?: string[];
    energyLevel?: number;
  }): void {
    const now = new Date();

    // Record to session history
    this.sessionHistory.push({
      timestamp: now,
      hour: context.hour,
      dayOfWeek: context.dayOfWeek,
      mood: context.detectedMood,
      topics: context.topics || [],
      energyLevel: context.energyLevel,
    });

    // Update temporal patterns
    this.updateTemporalPatterns(context.hour, context.dayOfWeek, context.detectedMood);

    // Update energy patterns
    if (context.energyLevel !== undefined) {
      this.updateEnergyPatterns(context.hour, context.energyLevel);
    }

    this.profile.lastUpdated = now;

    logger.debug(
      {
        userId: this.userId,
        hour: context.hour,
        day: DAYS[context.dayOfWeek],
        mood: context.detectedMood,
      },
      '🔮 Session recorded for pattern detection'
    );
  }

  /**
   * Record topic discussed (for association detection)
   */
  recordTopic(topic: string, previousTopic?: string): void {
    if (previousTopic && topic !== previousTopic) {
      this.updateTopicAssociation(previousTopic, topic);
    }
  }

  /**
   * Record emotional trigger (what made them reach out)
   */
  recordEmotionalTrigger(trigger: string, need: string): void {
    const existing = this.profile.emotionalTriggers.find((t) => t.trigger === trigger);

    if (existing) {
      existing.frequency++;
      existing.typicalNeed = need;
    } else {
      this.profile.emotionalTriggers.push({
        trigger,
        frequency: 1,
        typicalNeed: need,
      });
    }

    // Keep top 10 triggers
    this.profile.emotionalTriggers.sort((a, b) => b.frequency - a.frequency);
    this.profile.emotionalTriggers = this.profile.emotionalTriggers.slice(0, 10);
  }

  // ==========================================================================
  // ANTICIPATION GENERATION
  // ==========================================================================

  /**
   * Get anticipation result for session start
   */
  getAnticipation(context: {
    hour: number;
    dayOfWeek: number;
    isReturningUser: boolean;
    sessionCount: number;
    currentTopic?: string;
    detectedMood?: string;
  }): AnticipationResult {
    // Need enough data for anticipation
    if (context.sessionCount < 3) {
      return { shouldAnticipate: false, confidence: 0 };
    }

    // Check temporal patterns first (highest confidence)
    const temporalAnticipation = this.checkTemporalPatterns(
      context.hour,
      context.dayOfWeek,
      context.detectedMood
    );

    if (temporalAnticipation.shouldAnticipate) {
      return temporalAnticipation;
    }

    // Check topic anticipation
    if (context.currentTopic) {
      const topicAnticipation = this.checkTopicAnticipation(context.currentTopic);
      if (topicAnticipation.shouldAnticipate) {
        return topicAnticipation;
      }
    }

    // Check mood prediction
    if (context.detectedMood) {
      const moodAnticipation = this.checkMoodAnticipation(context.detectedMood);
      if (moodAnticipation.shouldAnticipate) {
        return moodAnticipation;
      }
    }

    return { shouldAnticipate: false, confidence: 0 };
  }

  /**
   * Get a "thinking of you" phrase if appropriate
   */
  getThinkingOfYouMoment(context: {
    turnCount: number;
    currentTopic?: string;
    sessionCount: number;
  }): string | null {
    // Not too early
    if (context.turnCount < 3 || context.sessionCount < 5) return null;

    // 10% chance
    if (!seededChance(`${Date.now()}:1`, 0.1)) return null;

    // Check if we have topic associations
    if (context.currentTopic) {
      const association = this.profile.topicAssociations.find(
        (a) => a.topic === context.currentTopic && a.strength > 0.5
      );

      if (association) {
        return `You know, when you mention ${context.currentTopic}, I always think of how it connects to ${association.associatedTopic} for you.`;
      }
    }

    // Generic thinking of you
    const generic = [
      'I was actually thinking about something you said before.',
      'You crossed my mind earlier, actually.',
      'I had a thought about you today.',
    ];

    return seededPick(`${Date.now()}:276`, generic) ?? generic[0];
  }

  // ==========================================================================
  // PATTERN CHECKING
  // ==========================================================================

  private checkTemporalPatterns(
    hour: number,
    dayOfWeek: number,
    mood?: string
  ): AnticipationResult {
    const timeOfDay = this.getTimeOfDay(hour);
    const day = DAYS[dayOfWeek];

    // Look for matching patterns
    for (const pattern of this.profile.temporalPatterns) {
      // Check for Monday + stressed pattern
      if (
        pattern.pattern.toLowerCase().includes('monday') &&
        dayOfWeek === 1 &&
        pattern.typicalMood === 'stressed' &&
        pattern.confidence > 0.6
      ) {
        return {
          shouldAnticipate: true,
          phrase: this.selectPhrase(ANTICIPATION_PHRASES.temporal_pattern.monday_stress),
          type: 'temporal_pattern',
          confidence: pattern.confidence,
        };
      }

      // Check for late night pattern
      if (
        pattern.pattern.toLowerCase().includes('late night') &&
        (hour >= 22 || hour <= 4) &&
        pattern.confidence > 0.5
      ) {
        return {
          shouldAnticipate: true,
          phrase: this.selectPhrase(ANTICIPATION_PHRASES.temporal_pattern.late_night),
          type: 'temporal_pattern',
          confidence: pattern.confidence,
        };
      }

      // Check for Friday reflective pattern
      if (
        pattern.pattern.toLowerCase().includes('friday') &&
        dayOfWeek === 5 &&
        pattern.typicalMood === 'reflective' &&
        pattern.confidence > 0.5
      ) {
        return {
          shouldAnticipate: true,
          phrase: this.selectPhrase(ANTICIPATION_PHRASES.temporal_pattern.friday_reflective),
          type: 'temporal_pattern',
          confidence: pattern.confidence,
        };
      }
    }

    return { shouldAnticipate: false, confidence: 0 };
  }

  private checkTopicAnticipation(topic: string): AnticipationResult {
    // Check if this topic commonly follows from a previous session topic
    const recentTopics = this.sessionHistory.slice(-5).flatMap((s) => s.topics);

    for (const association of this.profile.topicAssociations) {
      if (
        association.topic === topic &&
        association.strength > 0.6 &&
        recentTopics.includes(association.associatedTopic)
      ) {
        const phrase = this.selectPhrase(ANTICIPATION_PHRASES.topic_anticipation).replace(
          '{topic}',
          topic
        );

        return {
          shouldAnticipate: true,
          phrase,
          type: 'topic_anticipation',
          confidence: association.strength,
        };
      }
    }

    return { shouldAnticipate: false, confidence: 0 };
  }

  private checkMoodAnticipation(mood: string): AnticipationResult {
    // Check if we can predict needs based on mood patterns
    const trigger = this.profile.emotionalTriggers.find((t) =>
      t.trigger.toLowerCase().includes(mood.toLowerCase())
    );

    if (trigger && trigger.frequency >= 3) {
      const moodPhrases =
        ANTICIPATION_PHRASES.mood_prediction[
          mood.toLowerCase() as keyof typeof ANTICIPATION_PHRASES.mood_prediction
        ] || ANTICIPATION_PHRASES.mood_prediction.reflective;

      return {
        shouldAnticipate: true,
        phrase: this.selectPhrase(moodPhrases),
        type: 'mood_prediction',
        confidence: Math.min(0.9, trigger.frequency / 10 + 0.5),
      };
    }

    return { shouldAnticipate: false, confidence: 0 };
  }

  // ==========================================================================
  // PATTERN UPDATING
  // ==========================================================================

  private updateTemporalPatterns(hour: number, dayOfWeek: number, mood?: string): void {
    const timeOfDay = this.getTimeOfDay(hour);
    const day = DAYS[dayOfWeek];
    const patternKey = `${day} ${timeOfDay}`;

    // Find or create pattern
    let pattern = this.profile.temporalPatterns.find((p) => p.pattern === patternKey);

    if (pattern) {
      pattern.occurrences++;
      if (mood) pattern.typicalMood = mood as TemporalPattern['typicalMood'];
      // Recalculate confidence based on occurrences
      pattern.confidence = Math.min(0.95, pattern.occurrences / 10 + 0.3);
    } else {
      pattern = {
        pattern: patternKey,
        occurrences: 1,
        typicalMood: mood as TemporalPattern['typicalMood'],
        confidence: 0.3,
      };
      this.profile.temporalPatterns.push(pattern);
    }

    // Also check for day-only patterns (e.g., "Mondays are heavy")
    const dayPattern = this.profile.temporalPatterns.find((p) => p.pattern === day);
    if (dayPattern) {
      dayPattern.occurrences++;
      dayPattern.confidence = Math.min(0.9, dayPattern.occurrences / 15 + 0.2);
    } else if (this.sessionHistory.filter((s) => s.dayOfWeek === dayOfWeek).length >= 2) {
      // Only create day-only pattern after seeing it twice
      this.profile.temporalPatterns.push({
        pattern: day,
        occurrences: this.sessionHistory.filter((s) => s.dayOfWeek === dayOfWeek).length,
        typicalMood: mood as TemporalPattern['typicalMood'],
        confidence: 0.3,
      });
    }

    // Keep top 10 patterns
    this.profile.temporalPatterns.sort((a, b) => b.confidence - a.confidence);
    this.profile.temporalPatterns = this.profile.temporalPatterns.slice(0, 10);
  }

  private updateTopicAssociation(fromTopic: string, toTopic: string): void {
    const existing = this.profile.topicAssociations.find(
      (a) => a.topic === fromTopic && a.associatedTopic === toTopic
    );

    if (existing) {
      existing.strength = Math.min(1, existing.strength + 0.1);
    } else {
      this.profile.topicAssociations.push({
        topic: fromTopic,
        associatedTopic: toTopic,
        strength: 0.3,
      });
    }

    // Keep top 15 associations
    this.profile.topicAssociations.sort((a, b) => b.strength - a.strength);
    this.profile.topicAssociations = this.profile.topicAssociations.slice(0, 15);
  }

  private updateEnergyPatterns(hour: number, energyLevel: number): void {
    const timeOfDay = this.getTimeOfDay(hour);

    const existing = this.profile.energyPatterns.find((p) => p.timeOfDay === timeOfDay);

    if (existing) {
      // Running average
      existing.typicalEnergy =
        (existing.typicalEnergy * existing.samples + energyLevel) / (existing.samples + 1);
      existing.samples++;
    } else {
      this.profile.energyPatterns.push({
        timeOfDay: timeOfDay as EnergyPattern['timeOfDay'],
        typicalEnergy: energyLevel,
        samples: 1,
      });
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getTimeOfDay(hour: number): string {
    for (const [name, range] of Object.entries(TIME_PATTERNS)) {
      if (name === 'late_night') {
        if (hour >= 0 && hour < 5) return name;
      } else if (hour >= range.start && hour < range.end) {
        return name;
      }
    }
    return 'evening';
  }

  private selectPhrase(phrases: string[]): string {
    return seededPick(`${Date.now()}:493`, phrases) ?? phrases[0];
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get expected energy level for current time
   */
  getExpectedEnergy(hour: number): number | null {
    const timeOfDay = this.getTimeOfDay(hour);
    const pattern = this.profile.energyPatterns.find((p) => p.timeOfDay === timeOfDay);
    return pattern?.typicalEnergy ?? null;
  }

  /**
   * Export profile for persistence
   */
  export(): UserPatternProfile {
    return JSON.parse(JSON.stringify(this.profile));
  }

  /**
   * Import profile from persistence
   */
  import(profile: UserPatternProfile): void {
    this.profile = { ...profile };
    this.profile.lastUpdated = new Date(profile.lastUpdated);
  }

  /**
   * Reset
   */
  reset(): void {
    this.profile = { ...DEFAULT_PROFILE, lastUpdated: new Date() };
    this.sessionHistory = [];
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface SessionRecord {
  timestamp: Date;
  hour: number;
  dayOfWeek: number;
  mood?: string;
  topics: string[];
  energyLevel?: number;
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, AnticipatoryPresenceEngine>();

export function getAnticipatoryPresence(
  userId: string,
  existingProfile?: UserPatternProfile
): AnticipatoryPresenceEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new AnticipatoryPresenceEngine(userId, existingProfile));
  }
  return engines.get(userId)!;
}

export function clearAnticipatoryPresence(userId: string): void {
  engines.delete(userId);
}

export default AnticipatoryPresenceEngine;
