/**
 * Humanizing Context Builder
 *
 * The orchestrator that brings all humanizing systems together.
 * This is the single entry point for making personas feel ALIVE.
 *
 * Systems orchestrated:
 * 1. Voice Emotion Intelligence - Reading the real emotion behind words
 * 2. Inner World Injection - Sensory memories, contradictions, embodied experience
 * 3. Spontaneous Vulnerability - Micro-stories, hot takes, quirks
 * 4. Persona Mood States - Energy levels, "off days", varying states
 * 5. Relationship Behaviors - Stage-gated permissions and unlocked depth
 *
 * The result: An AI that doesn't just respond correctly,
 * but responds HUMANLY.
 */

import type { PersonaConfig } from '../../personas/types.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/runtime.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { EmotionResult } from '../emotion-detector.js';
// Import all humanizing systems
import {
  analyzeVoiceEmotionIntelligence,
  formatVoiceIntelligenceForPrompt,
  type VoiceEmotionIntelligence,
} from './voice-emotion-intelligence.js';

import {
  findInnerWorldInjections,
  formatInnerWorldForPrompt,
  shouldInject,
  type InnerWorldInjection,
} from './inner-world-injector.js';

import {
  selectSpontaneousShare,
  formatSpontaneousShareForPrompt,
  getShareTags,
  type SpontaneousShare,
} from './spontaneous-vulnerability.js';

import {
  selectPersonaMood,
  formatMoodForPrompt,
  getMoodContext,
  shouldMoodShift,
  getMoodShift,
  type PersonaMood,
  type MoodState,
  type MoodContext,
} from './persona-mood.js';

import {
  getRelationshipBehaviors,
  calculateRelationshipStage,
  getRelationshipTransitionAnnouncement,
  mapUserProfileStageToHumanizing,
  mapHumanizingStageToUserProfile,
  getRelationshipStageFromProfile,
  type RelationshipBehaviors,
  type RelationshipStage,
  type UserProfileRelationshipStage,
} from './relationship-behaviors.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ContextInjection {
  content: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  source: string;
}

export interface HumanizingContext {
  persona: PersonaConfig;
  bundleRuntime?: BundleRuntimeEngine;

  // Emotion inputs
  voiceEmotion?: VoiceEmotionResult | null;
  textEmotion?: EmotionResult | null;

  // Conversation state
  userMessage: string;
  currentTopic?: string;
  recentTopics: string[];
  turnCount: number;
  sessionCount: number;

  // User context
  userName?: string;
  isVulnerableMoment: boolean;
  userEmotionIntensity: number;

  // Relationship metrics (from profile)
  totalTurns?: number;
  sharedVulnerabilities?: number;
  celebratedTogether?: number;
  difficultConversations?: number;

  // UserProfile relationship stage (if available)
  userProfileRelationshipStage?: UserProfileRelationshipStage | string;

  // Previous relationship stage (for transition detection)
  previousRelationshipStage?: RelationshipStage;

  // Session state (for avoiding repetition)
  usedShareTags?: string[];
  spontaneousShareCount?: number;
  lastMood?: MoodState;
}

export interface HumanizingResult {
  /** All context injections to add to the prompt */
  injections: ContextInjection[];

  /** Voice emotion analysis */
  voiceIntelligence?: VoiceEmotionIntelligence;

  /** Selected inner world content */
  innerWorldContent?: InnerWorldInjection[];

  /** Spontaneous share if selected */
  spontaneousShare?: SpontaneousShare;

  /** Current persona mood */
  mood: PersonaMood;

  /** Relationship behaviors */
  relationship: RelationshipBehaviors;

  /** Whether there's a relationship transition to announce */
  relationshipTransition?: string;

  /** Tags used (for tracking) */
  usedTags: string[];

  /** Debug summary */
  summary: string;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build all humanizing context for a conversation turn
 */
export function buildHumanizingContext(ctx: HumanizingContext): HumanizingResult {
  const injections: ContextInjection[] = [];
  const usedTags: string[] = ctx.usedShareTags || [];
  const summaryParts: string[] = [];

  // 1. RELATIONSHIP STAGE
  // Use UserProfile stage if available, otherwise calculate from metrics
  let relationshipStage: RelationshipStage;

  if (ctx.userProfileRelationshipStage) {
    relationshipStage = mapUserProfileStageToHumanizing(ctx.userProfileRelationshipStage);
  } else {
    relationshipStage = calculateRelationshipStage(
      ctx.totalTurns || ctx.turnCount,
      ctx.sessionCount,
      ctx.sharedVulnerabilities,
      ctx.celebratedTogether,
      ctx.difficultConversations
    );
  }

  const relationshipContext = {
    stage: relationshipStage,
    turnCount: ctx.totalTurns || ctx.turnCount,
    sessionCount: ctx.sessionCount,
    userName: ctx.userName,
    sharedVulnerabilities: ctx.sharedVulnerabilities || 0,
    celebratedTogether: ctx.celebratedTogether || 0,
    difficultConversations: ctx.difficultConversations || 0,
  };

  const relationship = getRelationshipBehaviors(relationshipContext);

  // Always inject relationship guidance (highest priority)
  injections.push({
    content: relationship.promptInjection,
    priority: 'high',
    source: 'relationship_behaviors',
  });
  summaryParts.push(`Relationship: ${relationshipStage}`);

  // Check for relationship transition announcement
  let relationshipTransition: string | undefined;

  if (ctx.previousRelationshipStage && ctx.previousRelationshipStage !== relationshipStage) {
    // Relationship has deepened! Get the transition announcement
    const announcement = getRelationshipTransitionAnnouncement(
      ctx.previousRelationshipStage,
      relationshipStage,
      ctx.userName
    );

    if (announcement) {
      relationshipTransition = announcement;

      // Inject transition guidance
      injections.push({
        content: `[RELATIONSHIP MILESTONE]
Your relationship with ${ctx.userName || 'this user'} has deepened from ${ctx.previousRelationshipStage} to ${relationshipStage}.
Consider naturally acknowledging this: "${announcement}"
This should feel organic, not announced.`,
        priority: 'medium',
        source: 'relationship_transition',
      });

      summaryParts.push(`Transition: ${ctx.previousRelationshipStage}→${relationshipStage}`);
    }
  }

  // 2. PERSONA MOOD
  const moodContext = getMoodContext(ctx.sessionCount, ctx.lastMood);

  const mood = selectPersonaMood(ctx.persona, moodContext);

  // Check if mood should shift based on user emotion
  const topicWeight = ctx.isVulnerableMoment ? 'heavy' : 'medium';
  if (shouldMoodShift(mood, ctx.textEmotion?.primary || '', topicWeight)) {
    const newMoodState = getMoodShift(
      mood.state,
      `${ctx.textEmotion?.primary || ''}_${topicWeight}`
    );
    // Could update mood here if we want dynamic shifting
    summaryParts.push(`Mood: ${mood.state} (could shift to ${newMoodState})`);
  } else {
    summaryParts.push(`Mood: ${mood.state}`);
  }

  // Inject mood guidance
  injections.push({
    content: formatMoodForPrompt(mood),
    priority: 'medium',
    source: 'persona_mood',
  });

  // 3. VOICE EMOTION INTELLIGENCE
  let voiceIntelligence: VoiceEmotionIntelligence | undefined;

  if (ctx.voiceEmotion && ctx.voiceEmotion.confidence > 0.4) {
    voiceIntelligence = analyzeVoiceEmotionIntelligence(
      ctx.voiceEmotion,
      ctx.textEmotion || null,
      ctx.turnCount
    );

    if (voiceIntelligence.shouldAddressDiscrepancy || voiceIntelligence.guidance) {
      const voiceGuidance = formatVoiceIntelligenceForPrompt(voiceIntelligence);

      if (voiceGuidance) {
        // Voice emotion override is HIGH priority
        injections.push({
          content: voiceGuidance,
          priority: voiceIntelligence.shouldAddressDiscrepancy ? 'critical' : 'high',
          source: 'voice_emotion',
        });
        summaryParts.push(
          `Voice: ${voiceIntelligence.shouldAddressDiscrepancy ? 'MISMATCH' : 'aligned'}`
        );
      }
    }
  }

  // 4. INNER WORLD INJECTION
  let innerWorldContent: InnerWorldInjection[] | undefined;

  if (ctx.bundleRuntime && relationshipStage !== 'stranger') {
    const innerWorldContext = {
      currentTopic: ctx.currentTopic,
      recentTopics: ctx.recentTopics,
      userMessage: ctx.userMessage,
      emotionalIntensity: ctx.userEmotionIntensity,
      relationshipStage,
      turnCount: ctx.turnCount,
      isVulnerableMoment: ctx.isVulnerableMoment,
    };

    const injectionCandidates = findInnerWorldInjections(innerWorldContext, ctx.bundleRuntime);

    // Filter by probability
    innerWorldContent = injectionCandidates.filter(shouldInject);

    if (innerWorldContent.length > 0) {
      const innerWorldPrompt = formatInnerWorldForPrompt(innerWorldContent, relationshipStage);

      if (innerWorldPrompt) {
        injections.push({
          content: innerWorldPrompt,
          priority: 'medium',
          source: 'inner_world',
        });
        summaryParts.push(`Inner world: ${innerWorldContent.length} potential shares`);
      }
    }
  }

  // 5. SPONTANEOUS VULNERABILITY
  let spontaneousShare: SpontaneousShare | undefined;

  const shareContext = {
    turnCount: ctx.turnCount,
    relationshipStage,
    currentTopic: ctx.currentTopic,
    userEmotion: ctx.textEmotion?.primary || 'neutral',
    userEmotionIntensity: ctx.userEmotionIntensity,
    recentShareCount: ctx.spontaneousShareCount || 0,
    conversationFlow: ctx.isVulnerableMoment ? ('deep' as const) : ('flowing' as const),
    timeOfDay: moodContext.timeOfDay,
  };

  // Only try spontaneous share if we haven't shared too much
  if ((ctx.spontaneousShareCount || 0) < 3) {
    const share = selectSpontaneousShare(ctx.persona.id, shareContext, usedTags);

    if (share) {
      spontaneousShare = share;
      usedTags.push(...getShareTags(share));

      injections.push({
        content: formatSpontaneousShareForPrompt(share),
        priority: 'low',
        source: 'spontaneous_share',
      });
      summaryParts.push(`Spontaneous: ${share.type}`);
    }
  }

  // Sort injections by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  injections.sort((a, b) => {
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
    return aPriority - bPriority;
  });

  return {
    injections,
    voiceIntelligence,
    innerWorldContent,
    spontaneousShare,
    mood,
    relationship,
    relationshipTransition,
    usedTags,
    summary: summaryParts.join(' | '),
  };
}

/**
 * Format all humanizing injections for the prompt
 */
export function formatHumanizingForPrompt(result: HumanizingResult): string {
  if (result.injections.length === 0) {
    return '';
  }

  const sections: string[] = [];

  sections.push('═══════════════════════════════════════');
  sections.push('         HUMANIZING CONTEXT');
  sections.push('═══════════════════════════════════════');
  sections.push('');

  for (const injection of result.injections) {
    sections.push(injection.content);
    sections.push('');
  }

  sections.push('═══════════════════════════════════════');
  sections.push('Remember: Be HUMAN, not helpful.');
  sections.push('═══════════════════════════════════════');

  return sections.join('\n');
}

/**
 * Get a quick summary of the humanizing state
 */
export function getHumanizingSummary(result: HumanizingResult): string {
  return result.summary;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export {
  analyzeVoiceEmotionIntelligence,
  findInnerWorldInjections,
  selectSpontaneousShare,
  selectPersonaMood,
  getRelationshipBehaviors,
  calculateRelationshipStage,
  mapUserProfileStageToHumanizing,
  mapHumanizingStageToUserProfile,
  getRelationshipStageFromProfile,
  shouldMoodShift,
  getMoodShift,
};

export type {
  VoiceEmotionIntelligence,
  InnerWorldInjection,
  SpontaneousShare,
  PersonaMood,
  RelationshipBehaviors,
  RelationshipStage,
  UserProfileRelationshipStage,
  MoodState,
};

export default buildHumanizingContext;
