/**
 * BuildPersonalityContext Use Case
 *
 * Orchestrates building the complete personality context for LLM injection.
 * This is the main entry point for getting personality intelligence.
 *
 * Features:
 * - Profile caching (reduces Firestore reads)
 * - Time decay applied per-session (not per-turn)
 * - Anticipation engine for superhuman prediction
 *
 * @module personality/application/build-personality-context
 */

import type { PersonalityRepository } from '../domain/interfaces/personality-repository.js';
import type { VoiceAnalyzer, VoiceFeatures, SilenceAnalysisResult } from '../domain/interfaces/voice-analyzer.js';
import type { EmotionDetector } from '../domain/interfaces/emotion-detector.js';
import type { PersonalityProfile, ConversationContext, PersonalMoment } from '../domain/model/personality-profile.js';
import type { EmotionalState } from '../domain/model/value-objects/emotional-state.js';
import type { AnticipatedEmotion } from '../domain/model/value-objects/anticipated-emotion.js';
import type { EmotionalPattern } from '../domain/model/emotional-pattern.js';
import type { VulnerabilityDeposit } from '../domain/model/vulnerability-deposit.js';
import type { GrowthMilestone } from '../domain/model/growth-milestone.js';
import { AnticipationEngine } from '../domain/services/anticipation-engine.js';
import { TimingCalculator, type TimingAnalysis } from '../domain/services/timing-calculator.js';

// ============================================================================
// PROFILE CACHE WITH RACE CONDITION PROTECTION
// ============================================================================

interface CachedProfile {
  profile: PersonalityProfile;
  loadedAt: number;
  decayApplied: boolean;
}

/** Cache TTL in ms (30 seconds) */
const CACHE_TTL_MS = 30_000;

/** Profile cache - keyed by "userId:personaId" */
const profileCache = new Map<string, CachedProfile>();

/** In-flight load promises to prevent duplicate DB reads */
const loadingPromises = new Map<string, Promise<PersonalityProfile | null>>();

/** Maximum cache entries before pruning */
const MAX_CACHE_SIZE = 100;

function getCacheKey(userId: string, personaId: string): string {
  return `${userId}:${personaId}`;
}

function getCachedProfile(userId: string, personaId: string): PersonalityProfile | null {
  const key = getCacheKey(userId, personaId);
  const cached = profileCache.get(key);
  
  if (!cached) return null;
  
  // Check TTL
  if (Date.now() - cached.loadedAt > CACHE_TTL_MS) {
    profileCache.delete(key);
    return null;
  }
  
  return cached.profile;
}

function setCachedProfile(userId: string, personaId: string, profile: PersonalityProfile, decayApplied = false): void {
  const key = getCacheKey(userId, personaId);
  
  // Prune cache if too large
  if (profileCache.size >= MAX_CACHE_SIZE) {
    // Delete oldest entries
    const entries = Array.from(profileCache.entries());
    entries.sort((a, b) => a[1].loadedAt - b[1].loadedAt);
    for (let i = 0; i < 10; i++) {
      profileCache.delete(entries[i][0]);
    }
  }
  
  profileCache.set(key, {
    profile,
    loadedAt: Date.now(),
    decayApplied,
  });
}

/**
 * Get or load profile with deduplication of concurrent loads.
 * Prevents race conditions where multiple concurrent requests
 * all try to load from Firestore at once.
 */
async function getOrLoadProfile(
  userId: string,
  personaId: string,
  repository: PersonalityRepository
): Promise<{ profile: PersonalityProfile; needsDecay: boolean; fromCache: boolean }> {
  const key = getCacheKey(userId, personaId);
  
  // 1. Check cache first
  const cached = getCachedProfile(userId, personaId);
  if (cached) {
    const cachedEntry = profileCache.get(key);
    return {
      profile: cached,
      needsDecay: !cachedEntry?.decayApplied,
      fromCache: true,
    };
  }
  
  // 2. Check if there's already a load in progress for this key
  const existingPromise = loadingPromises.get(key);
  if (existingPromise) {
    // Wait for the existing load to complete
    const profile = await existingPromise;
    if (profile) {
      return { profile, needsDecay: false, fromCache: true };
    }
  }
  
  // 3. Start a new load and track the promise
  const loadPromise = (async () => {
    const profile = await repository.loadProfile(userId, personaId, {
      withPatterns: true,
      withVulnerabilities: true,
      withMilestones: true,
    });
    return profile;
  })();
  
  loadingPromises.set(key, loadPromise);
  
  try {
    const profile = await loadPromise;
    
    if (!profile) {
      // Create new profile
      const { PersonalityProfile: ProfileClass } = await import('../domain/model/personality-profile.js');
      const newProfile = ProfileClass.create(userId, personaId);
      await repository.saveProfile(newProfile);
      setCachedProfile(userId, personaId, newProfile, false);
      return { profile: newProfile, needsDecay: true, fromCache: false };
    }
    
    setCachedProfile(userId, personaId, profile, false);
    return { profile, needsDecay: true, fromCache: false };
  } finally {
    // Clear the loading promise
    loadingPromises.delete(key);
  }
}

/** Invalidate a specific user's cached profile */
export function invalidateBuildContextCache(userId: string, personaId: string): void {
  const key = getCacheKey(userId, personaId);
  profileCache.delete(key);
  // Also clear any in-flight loading promise
  loadingPromises.delete(key);
}

/** Export for testing */
export function clearProfileCache(): void {
  profileCache.clear();
  loadingPromises.clear();
}

/** Get cache stats for monitoring */
export function getProfileCacheStats(): { 
  cacheSize: number; 
  loadingCount: number;
  maxSize: number;
  ttlMs: number;
} {
  return {
    cacheSize: profileCache.size,
    loadingCount: loadingPromises.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}

/**
 * Input for building personality context
 */
export interface BuildPersonalityContextInput {
  /** User ID */
  userId: string;
  /** Persona ID */
  personaId: string;
  /** Current user message */
  currentMessage?: string;
  /** Partial transcript (for anticipation) */
  partialTranscript?: string;
  /** Voice features (if available) */
  voiceFeatures?: VoiceFeatures;
  /** Silence duration (if applicable) */
  silenceDurationMs?: number;
  /** Current topics */
  topics?: string[];
  /** Mentioned people */
  mentionedPeople?: string[];
  /** Session turn count */
  turnCount?: number;
  /** Available personal moments (for sharing decisions) */
  availableMoments?: PersonalMoment[];
}

/**
 * Complete personality context output
 */
export interface PersonalityContextOutput {
  /** User's personality profile */
  profile: PersonalityProfile;
  /** Current relationship stage */
  relationshipStage: string;
  /** Timing analysis */
  timing: TimingAnalysis | null;
  /** Anticipated emotion (SUPERHUMAN) */
  anticipatedEmotion: AnticipatedEmotion | null;
  /** Silence analysis (if applicable) */
  silenceAnalysis: SilenceAnalysisResult | null;
  /** Vulnerabilities needing follow-up */
  pendingVulnerabilities: VulnerabilityDeposit[];
  /** Patterns ready to surface */
  surfaceablePatterns: EmotionalPattern[];
  /** Milestones ready to celebrate */
  celebratableMilestones: GrowthMilestone[];
  /** Should we share a moment? */
  momentToShare: {
    should: boolean;
    moment?: PersonalMoment;
    transition?: string;
    reason: string;
  } | null;
  /** Should hold space (be silent)? */
  shouldHoldSpace: boolean;
  /** Caution level (0-1) */
  cautionLevel: number;
  /** Formatted context for LLM injection */
  formattedContext: string;
}

/**
 * BuildPersonalityContext Use Case
 *
 * Orchestrates all personality intelligence for a conversation turn.
 *
 * @example
 * ```typescript
 * const useCase = new BuildPersonalityContext(repository, voiceAnalyzer, emotionDetector);
 *
 * const context = await useCase.execute({
 *   userId: 'user_123',
 *   personaId: 'ferni',
 *   currentMessage: "I've been feeling overwhelmed lately",
 *   topics: ['stress', 'work'],
 * });
 *
 * // Inject into LLM
 * const prompt = basePrompt + context.formattedContext;
 * ```
 */
export class BuildPersonalityContext {
  private anticipationEngine = new AnticipationEngine();
  private timingCalculator = new TimingCalculator();

  constructor(
    private repository: PersonalityRepository,
    private voiceAnalyzer?: VoiceAnalyzer,
    private emotionDetector?: EmotionDetector
  ) {}

  /**
   * Execute the use case
   */
  async execute(input: BuildPersonalityContextInput): Promise<PersonalityContextOutput> {
    // 1. Get or load profile (with race condition protection)
    const { profile, needsDecay, fromCache } = await getOrLoadProfile(
      input.userId,
      input.personaId,
      this.repository
    );

    // 2. Apply time decay (only once per session)
    if (needsDecay) {
      profile.applyTimeDecay();
      // Update cache with decay applied
      setCachedProfile(input.userId, input.personaId, profile, true);
    }

    // 3. Build conversation context
    const conversationContext: ConversationContext = {
      message: input.currentMessage,
      partialTranscript: input.partialTranscript,
      topics: input.topics,
      currentTime: new Date(),
      mentionedPeople: input.mentionedPeople,
      turnCount: input.turnCount,
    };

    // 4. Analyze timing (if message provided)
    let timing: TimingAnalysis | null = null;
    if (input.currentMessage) {
      timing = this.timingCalculator.analyzeMessageTiming(input.currentMessage, {
        topics: input.topics,
      });
    }

    // 5. Anticipate emotion (SUPERHUMAN)
    let anticipatedEmotion: AnticipatedEmotion | null = null;
    if (input.partialTranscript || input.voiceFeatures) {
      const voiceTone = input.voiceFeatures
        ? await this.detectVoiceTone(input.voiceFeatures)
        : undefined;

      anticipatedEmotion = this.anticipationEngine.anticipateFromContext(
        {
          partialTranscript: input.partialTranscript,
          voiceTone,
          topics: input.topics,
          currentTime: new Date(),
          mentionedPeople: input.mentionedPeople,
        },
        [...profile.emotionalPatterns]
      );
    }

    // 6. Analyze silence (if applicable)
    let silenceAnalysis: SilenceAnalysisResult | null = null;
    if (input.silenceDurationMs && this.voiceAnalyzer) {
      silenceAnalysis = await this.voiceAnalyzer.classifySilence(input.silenceDurationMs, {
        precedingEmotion: profile.currentEmotionalState.primary,
        conversationPhase: this.inferConversationPhase(input.turnCount),
        voiceFeaturesBefore: input.voiceFeatures,
      });
    }

    // 7. Get pending items
    const pendingVulnerabilities = [...profile.openVulnerabilities];
    const surfaceablePatterns = [...profile.surfaceablePatterns];
    const celebratableMilestones = [...profile.celebratableMilestones];

    // 8. Decide on moment sharing
    let momentToShare: PersonalityContextOutput['momentToShare'] = null;
    if (input.availableMoments && input.availableMoments.length > 0 && input.currentMessage) {
      momentToShare = this.decideMomentSharing(
        profile,
        input.availableMoments,
        conversationContext,
        timing
      );
    }

    // 9. Calculate should hold space
    const shouldHoldSpace =
      profile.shouldHoldSpace ||
      silenceAnalysis?.type === 'emotional' ||
      timing?.suggestedResponse === 'hold_space';

    // 10. Calculate caution level
    const cautionLevel = profile.relationshipDepth.getCautionLevel();

    // 11. Format context for LLM
    const formattedContext = this.formatContext({
      profile,
      timing,
      anticipatedEmotion,
      silenceAnalysis,
      pendingVulnerabilities,
      surfaceablePatterns,
      celebratableMilestones,
      momentToShare,
      shouldHoldSpace,
      cautionLevel,
    });

    return {
      profile,
      relationshipStage: profile.relationshipStage,
      timing,
      anticipatedEmotion,
      silenceAnalysis,
      pendingVulnerabilities,
      surfaceablePatterns,
      celebratableMilestones,
      momentToShare,
      shouldHoldSpace,
      cautionLevel,
      formattedContext,
    };
  }

  /**
   * Detect voice tone from features
   */
  private async detectVoiceTone(
    features: VoiceFeatures
  ): Promise<'rising' | 'falling' | 'flat' | 'breaking' | undefined> {
    if (!this.voiceAnalyzer) return undefined;

    const tone = await this.voiceAnalyzer.classifyTone(features);
    if (['rising', 'falling', 'flat', 'breaking'].includes(tone)) {
      return tone as 'rising' | 'falling' | 'flat' | 'breaking';
    }
    return undefined;
  }

  /**
   * Infer conversation phase from turn count
   */
  private inferConversationPhase(
    turnCount?: number
  ): 'opening' | 'middle' | 'deep' | 'closing' {
    if (!turnCount) return 'middle';
    if (turnCount <= 2) return 'opening';
    if (turnCount <= 6) return 'middle';
    return 'deep';
  }

  /**
   * Decide on moment sharing
   */
  private decideMomentSharing(
    profile: PersonalityProfile,
    moments: PersonalMoment[],
    context: ConversationContext,
    timing: TimingAnalysis | null
  ): PersonalityContextOutput['momentToShare'] {
    // Don't share if timing is wrong
    if (timing && !timing.personalMomentAppropriate) {
      return {
        should: false,
        reason: `Timing not appropriate: ${timing.reasoningNotes}`,
      };
    }

    // Try to find a shareable moment
    for (const moment of moments) {
      const decision = profile.decideSharingMoment(moment, context);
      if (decision.shouldShare) {
        return {
          should: true,
          moment: decision.moment,
          transition: decision.suggestedTransition,
          reason: decision.reason,
        };
      }
    }

    return {
      should: false,
      reason: 'No appropriate moment found',
    };
  }

  /**
   * Format context for LLM injection
   */
  private formatContext(data: {
    profile: PersonalityProfile;
    timing: TimingAnalysis | null;
    anticipatedEmotion: AnticipatedEmotion | null;
    silenceAnalysis: SilenceAnalysisResult | null;
    pendingVulnerabilities: VulnerabilityDeposit[];
    surfaceablePatterns: EmotionalPattern[];
    celebratableMilestones: GrowthMilestone[];
    momentToShare: PersonalityContextOutput['momentToShare'];
    shouldHoldSpace: boolean;
    cautionLevel: number;
  }): string {
    const sections: string[] = [];

    // Header
    sections.push('[🧠 SUPERHUMAN PERSONALITY INTELLIGENCE]');
    sections.push('');

    // Relationship context
    sections.push(`Relationship Stage: ${data.profile.relationshipStage}`);
    sections.push(`Trust Health: ${data.profile.relationshipDepth.overallHealthScore}%`);
    if (data.profile.relationshipDepth.isTrustDeclining) {
      sections.push('⚠️ TRUST DECLINING - Be extra careful');
    }
    sections.push('');

    // Should hold space warning
    if (data.shouldHoldSpace) {
      sections.push('🤫 HOLD SPACE - This is a moment for presence, not words.');
      sections.push('');
    }

    // Timing guidance
    if (data.timing) {
      sections.push(this.timingCalculator.formatTimingGuidance(data.timing));
      sections.push('');
    }

    // Anticipated emotion (SUPERHUMAN)
    if (data.anticipatedEmotion?.isActionable) {
      sections.push(data.anticipatedEmotion.formatForPrompt());
      sections.push('');
    }

    // Silence guidance
    if (data.silenceAnalysis) {
      sections.push(`[🤫 SILENCE DETECTED: ${data.silenceAnalysis.type}]`);
      sections.push(`Response: ${data.silenceAnalysis.recommendedResponse}`);
      if (data.silenceAnalysis.suggestedPhrase) {
        sections.push(`Suggested: "${data.silenceAnalysis.suggestedPhrase}"`);
      }
      sections.push('');
    }

    // Vulnerability callbacks (limit to 2)
    const urgentVulns = data.pendingVulnerabilities.filter((v) => v.isUrgentForFollowUp);
    const vulnsToShow = urgentVulns.length > 0 ? urgentVulns : data.pendingVulnerabilities;
    for (const vuln of vulnsToShow.slice(0, 2)) {
      sections.push(vuln.formatForPrompt());
      sections.push('');
    }

    // Pattern insights (limit to 1)
    for (const pattern of data.surfaceablePatterns.slice(0, 1)) {
      sections.push(pattern.formatForPrompt());
      sections.push('');
    }

    // Growth celebrations (limit to 1)
    for (const milestone of data.celebratableMilestones.slice(0, 1)) {
      sections.push(milestone.formatForPrompt());
      sections.push('');
    }

    // Moment sharing decision
    if (data.momentToShare?.should && data.momentToShare.moment) {
      sections.push('[💫 PERSONAL MOMENT OPPORTUNITY]');
      sections.push('');
      sections.push(`Topic: ${data.momentToShare.moment.topic}`);
      sections.push(`Transition: "${data.momentToShare.transition}"`);
      sections.push(`Content: "${data.momentToShare.moment.content}"`);
      sections.push('');
      sections.push('Share this IF it serves them. If in doubt, listen.');
      sections.push('');
    }

    // Caution level
    if (data.cautionLevel > 0.3) {
      sections.push(`[⚠️ CAUTION LEVEL: ${Math.round(data.cautionLevel * 100)}%]`);
      sections.push('Be more careful with deep sharing and insights.');
      sections.push('');
    }

    return sections.join('\n');
  }
}
