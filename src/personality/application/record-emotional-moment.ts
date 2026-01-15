/**
 * RecordEmotionalMoment Use Case
 *
 * Records emotional data and vulnerability from user messages.
 * Updates the personality profile with new insights.
 *
 * @module personality/application/record-emotional-moment
 */

import type { PersonalityRepository } from '../domain/interfaces/personality-repository.js';
import type { EmotionDetector } from '../domain/interfaces/emotion-detector.js';
import type { VoiceAnalyzer, VoiceFeatures } from '../domain/interfaces/voice-analyzer.js';
import type {
  PersonalityProfile,
  PersonalityDomainEvent,
} from '../domain/model/personality-profile.js';
import {
  EmotionalState,
  type PrimaryEmotion,
  type GranularEmotion,
} from '../domain/model/value-objects/emotional-state.js';
import { VulnerabilityScorer } from '../domain/services/vulnerability-scorer.js';
import { invalidateBuildContextCache } from './build-personality-context.js';

/**
 * Input for recording emotional moment
 */
export interface RecordEmotionalMomentInput {
  /** User ID */
  userId: string;
  /** Persona ID */
  personaId: string;
  /** User's message */
  message: string;
  /** Topics detected in message */
  topics?: string[];
  /** Voice features (for multimodal analysis) */
  voiceFeatures?: VoiceFeatures;
  /** Was this message acknowledged well? (for feedback) */
  acknowledgmentQuality?: 'positive' | 'neutral' | 'negative';
  /** Mentioned people */
  mentionedPeople?: string[];
}

/**
 * Output from recording emotional moment
 */
export interface RecordEmotionalMomentOutput {
  /** Updated profile */
  profile: PersonalityProfile;
  /** Detected emotional state */
  detectedState: EmotionalState;
  /** Was vulnerability detected? */
  vulnerabilityDetected: boolean;
  /** Was this a first-time share? */
  isFirstTimeVulnerability: boolean;
  /** Domain events emitted */
  domainEvents: PersonalityDomainEvent[];
  /** Pattern evidence recorded? */
  patternEvidenceRecorded: boolean;
}

/**
 * RecordEmotionalMoment Use Case
 *
 * Analyzes user messages for emotional content and vulnerability,
 * updates the personality profile, and tracks patterns.
 *
 * @example
 * ```typescript
 * const useCase = new RecordEmotionalMoment(repository, emotionDetector, voiceAnalyzer);
 *
 * const result = await useCase.execute({
 *   userId: 'user_123',
 *   personaId: 'ferni',
 *   message: "I've never told anyone this, but I struggle with anxiety",
 *   topics: ['mental_health', 'anxiety'],
 * });
 *
 * if (result.isFirstTimeVulnerability) {
 *   // Handle first-time vulnerability specially
 * }
 * ```
 */
export class RecordEmotionalMoment {
  private vulnerabilityScorer = new VulnerabilityScorer();

  constructor(
    private repository: PersonalityRepository,
    private emotionDetector?: EmotionDetector,
    private voiceAnalyzer?: VoiceAnalyzer
  ) {}

  /**
   * Execute the use case
   */
  async execute(input: RecordEmotionalMomentInput): Promise<RecordEmotionalMomentOutput> {
    // 1. Load or create profile
    let profile = await this.repository.loadProfile(input.userId, input.personaId);
    if (!profile) {
      const { PersonalityProfile } = await import('../domain/model/personality-profile.js');
      profile = PersonalityProfile.create(input.userId, input.personaId);
    }

    // 2. Detect emotion from text
    let detectedState = await this.detectEmotion(input.message, input.topics);

    // 3. Merge with voice emotion if available
    if (input.voiceFeatures && this.voiceAnalyzer) {
      const voiceEmotion = await this.voiceAnalyzer.analyzeEmotion(input.voiceFeatures);
      const voiceState = EmotionalState.fromVoiceAnalysis(
        voiceEmotion.emotion,
        voiceEmotion.granular,
        voiceEmotion.confidence,
        voiceEmotion.confidence
      );
      detectedState = detectedState.mergeWith(voiceState);
    }

    // 4. Add topics
    if (input.topics) {
      detectedState = detectedState.withTopics(input.topics);
    }

    // 5. Update profile emotional state
    profile.updateEmotionalState(detectedState);

    // 6. Detect and record vulnerability
    const vulnerabilityResult = this.vulnerabilityScorer.detectVulnerability(input.message);
    let vulnerabilityDetected = false;
    let isFirstTimeVulnerability = false;

    if (vulnerabilityResult.isVulnerable) {
      vulnerabilityDetected = true;
      isFirstTimeVulnerability = vulnerabilityResult.isFirstTime;

      profile.recordVulnerability({
        level: vulnerabilityResult.level,
        category: vulnerabilityResult.category,
        summary: this.generateSummary(input.message, vulnerabilityResult.category),
        content: input.message,
        keywords: vulnerabilityResult.keywords,
        isFirstTime: vulnerabilityResult.isFirstTime,
        firstTimeMarkers: vulnerabilityResult.firstTimeMarkers,
        acknowledgment: vulnerabilityResult.suggestedAcknowledgment,
      });
    }

    // 7. Record pattern evidence
    let patternEvidenceRecorded = false;
    if (input.topics && input.topics.length > 0) {
      const patternEvidence = {
        timestamp: new Date(),
        context: input.message,
        emotion: detectedState.primary,
        granular: detectedState.granular ?? undefined,
        intensity: detectedState.intensity,
        topics: input.topics,
      };

      // Record topic-emotion correlation
      profile.recordPatternEvidence(
        'topic_emotion',
        `${input.topics[0]} → ${detectedState.primary}`,
        input.topics,
        patternEvidence
      );

      // Check for person-related patterns
      if (input.mentionedPeople && input.mentionedPeople.length > 0) {
        profile.recordPatternEvidence(
          'person_related',
          `${input.mentionedPeople[0]} → ${detectedState.primary}`,
          input.mentionedPeople,
          patternEvidence
        );
      }

      // Check for temporal patterns (day of week, time of day)
      const now = new Date();
      const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ];
      const currentDay = dayNames[now.getDay()];
      const timeOfDay =
        now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';

      if (detectedState.isNegative && detectedState.intensity > 0.5) {
        profile.recordPatternEvidence(
          'temporal',
          `${currentDay} ${timeOfDay} → ${detectedState.primary}`,
          [`${currentDay} ${timeOfDay}`, currentDay ?? '', timeOfDay],
          patternEvidence
        );
      }

      patternEvidenceRecorded = true;
    }

    // 8. Update trust signal based on acknowledgment quality
    if (input.acknowledgmentQuality) {
      const trustDelta =
        input.acknowledgmentQuality === 'positive'
          ? 1
          : input.acknowledgmentQuality === 'negative'
            ? -2
            : 0;
      profile.recordTrustSignal(trustDelta);
    }

    // 9. Mark interaction
    profile.markInteraction();

    // 10. Get domain events before clearing
    const domainEvents = [...profile.domainEvents];
    profile.clearDomainEvents();

    // 11. Save profile
    await this.repository.saveProfile(profile);

    // 12. Invalidate cache so next context build gets fresh data
    invalidateBuildContextCache(input.userId, input.personaId);

    return {
      profile,
      detectedState,
      vulnerabilityDetected,
      isFirstTimeVulnerability,
      domainEvents,
      patternEvidenceRecorded,
    };
  }

  /**
   * Detect emotion from message
   */
  private async detectEmotion(message: string, topics?: string[]): Promise<EmotionalState> {
    // Use emotion detector if available
    if (this.emotionDetector) {
      const result = await this.emotionDetector.detectEmotion({ text: message });
      return EmotionalState.create({
        primary: result.primary,
        granular: result.granular ?? undefined,
        intensity: result.intensity,
        confidence: result.confidence,
        sources: ['text'],
        associatedTopics: result.associatedTopics,
      });
    }

    // Fallback to simple keyword detection
    return this.simpleEmotionDetection(message, topics);
  }

  /**
   * Simple emotion detection fallback
   */
  private simpleEmotionDetection(message: string, topics?: string[]): EmotionalState {
    const lower = message.toLowerCase();

    const emotionPatterns: Array<{
      patterns: RegExp[];
      emotion: PrimaryEmotion;
      granular?: GranularEmotion;
      intensity: number;
    }> = [
      // Joy
      {
        patterns: [/\b(so happy|ecstatic|thrilled|amazing)\b/],
        emotion: 'joy',
        granular: 'ecstatic',
        intensity: 0.9,
      },
      {
        patterns: [/\b(happy|glad|pleased|excited)\b/],
        emotion: 'joy',
        granular: 'happy',
        intensity: 0.7,
      },
      {
        patterns: [/\b(relieved|finally|phew)\b/],
        emotion: 'joy',
        granular: 'relieved',
        intensity: 0.6,
      },

      // Sadness
      {
        patterns: [/\b(devastated|heartbroken|crushed)\b/],
        emotion: 'sadness',
        granular: 'devastated',
        intensity: 0.9,
      },
      {
        patterns: [/\b(sad|down|blue|unhappy)\b/],
        emotion: 'sadness',
        granular: 'sad',
        intensity: 0.6,
      },
      {
        patterns: [/\b(lonely|alone|isolated)\b/],
        emotion: 'sadness',
        granular: 'lonely',
        intensity: 0.7,
      },
      {
        patterns: [/\b(grief|mourning|loss|died|passed)\b/],
        emotion: 'sadness',
        granular: 'grief',
        intensity: 0.85,
      },

      // Fear
      {
        patterns: [/\b(terrified|petrified|scared to death)\b/],
        emotion: 'fear',
        granular: 'terrified',
        intensity: 0.9,
      },
      {
        patterns: [/\b(anxious|anxiety|worried|nervous)\b/],
        emotion: 'fear',
        granular: 'anxious',
        intensity: 0.7,
      },
      {
        patterns: [/\b(overwhelmed|too much|can't cope)\b/],
        emotion: 'fear',
        granular: 'overwhelmed',
        intensity: 0.8,
      },
      {
        patterns: [/\b(scared|afraid|frightened)\b/],
        emotion: 'fear',
        granular: 'nervous',
        intensity: 0.6,
      },

      // Anger
      {
        patterns: [/\b(furious|enraged|livid)\b/],
        emotion: 'anger',
        granular: 'furious',
        intensity: 0.9,
      },
      {
        patterns: [/\b(angry|mad|pissed)\b/],
        emotion: 'anger',
        granular: 'angry',
        intensity: 0.7,
      },
      {
        patterns: [/\b(frustrated|annoyed|irritated)\b/],
        emotion: 'anger',
        granular: 'frustrated',
        intensity: 0.5,
      },
    ];

    // Find matching emotion
    for (const { patterns, emotion, granular, intensity } of emotionPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(lower)) {
          return EmotionalState.create({
            primary: emotion,
            granular,
            intensity,
            confidence: 0.6,
            sources: ['text'],
            associatedTopics: topics,
          });
        }
      }
    }

    // Default to neutral
    return EmotionalState.neutral();
  }

  /**
   * Generate summary from message and category
   */
  private generateSummary(message: string, category: string): string {
    // Take first sentence or first 100 chars
    const firstSentence = message.split(/[.!?]/)[0];
    if (firstSentence && firstSentence.length <= 100) {
      return firstSentence.trim();
    }

    // Truncate to 100 chars
    if (message.length <= 100) {
      return message;
    }

    return message.substring(0, 97) + '...';
  }
}
