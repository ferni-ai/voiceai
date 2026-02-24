/**
 * Turn Processor - Team Huddle Observation Recording
 *
 * Records cross-persona observations from conversation turns.
 * This enables cross-persona coordination - what Maya notices about habits
 * can inform Peter's research suggestions or Jordan's milestone planning.
 */

import type { ContextUserData } from '../../../intelligence/context-builders/index.js';
import type { TurnAnalysisResult } from '../types.js';
import { diag } from '../../../services/diagnostic-logger.js';
import {
  analyzeTextForPersona,
  detectHandoffCues,
} from '../../../services/cross-persona/persona-observation-patterns.js';
import {
  recordObservation as recordTeamObservation,
  type PersonaId,
} from '../../../services/cross-persona/team-huddle.js';
import { PERSONA_DOMAINS } from './constants.js';

/**
 * Record Team Huddle observations from conversation turns.
 *
 * Uses persona-specific observation patterns for intelligent detection.
 */
export async function recordTeamHuddleObservation(
  userId: string,
  personaId: string,
  userText: string,
  analysisResult: TurnAnalysisResult,
  userData: ContextUserData
): Promise<void> {
  try {
    const canonicalPersonaId = personaId.replace('-john', '') as PersonaId;
    const emotionIntensity = analysisResult.analysis.emotion.intensity || 0;

    // =========================================================================
    // 1. USE PERSONA-SPECIFIC PATTERNS FOR INTELLIGENT OBSERVATION
    // =========================================================================
    const patternMatches = analyzeTextForPersona(canonicalPersonaId, userText, emotionIntensity);

    // Record top 2 pattern matches (avoid noise)
    for (const match of patternMatches.slice(0, 2)) {
      // Only record if confidence is high enough
      if (match.adjustedConfidence < 0.5) continue;

      recordTeamObservation(userId, {
        personaId: canonicalPersonaId,
        observationType: match.pattern.observationType,
        content: match.pattern.contentTemplate,
        confidence: match.adjustedConfidence,
        domain: match.pattern.domain,
        relatedTopics: [
          ...match.matchedKeywords,
          ...(analysisResult.analysis.topics?.detected || []),
        ],
        suggestedAction: match.pattern.suggestedActionTemplate,
      });

      diag.debug('🤝 Team Huddle observation (pattern)', {
        personaId: canonicalPersonaId,
        observationType: match.pattern.observationType,
        domain: match.pattern.domain,
        confidence: match.adjustedConfidence,
        matchedKeywords: match.matchedKeywords,
      });
    }

    // =========================================================================
    // 2. RECORD EMOTION-BASED OBSERVATIONS FOR HIGH-INTENSITY MOMENTS
    // =========================================================================
    const isHighIntensity = emotionIntensity > 0.6;
    const isNegativeEmotion = analysisResult.analysis.emotion.valence === 'negative';
    const isPositiveEmotion = analysisResult.analysis.emotion.valence === 'positive';

    if (isHighIntensity && patternMatches.length === 0) {
      // High emotion but no pattern match - record generic observation
      const domain = PERSONA_DOMAINS[personaId] || 'general';
      const observationType = isNegativeEmotion
        ? 'concern'
        : isPositiveEmotion
          ? 'opportunity'
          : 'insight';
      const content = isNegativeEmotion
        ? buildConcernObservation(domain, analysisResult, userText)
        : buildOpportunityObservation(domain, analysisResult, userText);

      if (content) {
        recordTeamObservation(userId, {
          personaId: canonicalPersonaId,
          observationType,
          content,
          confidence: Math.min(0.9, emotionIntensity + 0.2),
          domain,
          relatedTopics: analysisResult.analysis.topics?.detected || [],
          suggestedAction: isNegativeEmotion
            ? `Consider checking in about ${analysisResult.currentTopic || 'this'} soon`
            : undefined,
        });

        diag.debug('🤝 Team Huddle observation (emotion)', {
          personaId: canonicalPersonaId,
          observationType,
          domain,
          emotionIntensity,
        });
      }
    }

    // =========================================================================
    // 3. DETECT HANDOFF CUES FOR TEAM COORDINATION
    // =========================================================================
    const handoffCues = detectHandoffCues(canonicalPersonaId, userText);
    if (handoffCues.length > 0) {
      // Record as insight for Ferni's coordination
      for (const cue of handoffCues.slice(0, 1)) {
        // Top 1 cue only
        recordTeamObservation(userId, {
          personaId: canonicalPersonaId,
          observationType: 'insight',
          content: `Handoff opportunity detected: ${cue.reason}`,
          confidence: 0.7,
          domain: 'handoff_coordination',
          relatedTopics: cue.matchedKeywords,
          suggestedAction: `Consider involving ${cue.targetPersona}`,
        });

        diag.debug('🤝 Team Huddle observation (handoff cue)', {
          fromPersona: canonicalPersonaId,
          toPersona: cue.targetPersona,
          reason: cue.reason,
        });
      }
    }
  } catch (err) {
    // Non-blocking - don't fail the turn
    diag.debug('Team Huddle observation failed', { error: String(err) });
  }
}

/**
 * Detect patterns relevant to each domain.
 */
export function detectDomainRelevantPattern(text: string, domain: string): boolean {
  const lowerText = text.toLowerCase();

  const domainPatterns: Record<string, string[]> = {
    habits: ['sleep', 'exercise', 'routine', 'habit', 'morning', 'night', 'tired', 'energy'],
    research: ['stress', 'work', 'career', 'money', 'finance', 'market', 'research', 'learn'],
    milestones: [
      'goal',
      'achieve',
      'celebrate',
      'birthday',
      'anniversary',
      'milestone',
      'deadline',
    ],
    communication: ['meeting', 'calendar', 'schedule', 'email', 'call', 'busy', 'overwhelm'],
    wisdom: ['meaning', 'purpose', 'values', 'life', 'important', 'legacy', 'death', 'reflect'],
    life_coaching: ['change', 'stuck', 'help', 'support', 'growth', 'better', 'improve'],
  };

  const patterns = domainPatterns[domain] || [];
  return patterns.some((p) => lowerText.includes(p));
}

/**
 * Build concern observation content.
 */
export function buildConcernObservation(
  domain: string,
  analysisResult: TurnAnalysisResult,
  userText: string
): string {
  const emotion = analysisResult.analysis.emotion.primary;
  const topic = analysisResult.currentTopic || 'something';

  // Domain-specific framing
  switch (domain) {
    case 'habits':
      return `User expressed ${emotion} about ${topic}. May need habit/routine support.`;
    case 'research':
      return `User showed ${emotion} regarding ${topic}. Potential stress/information need.`;
    case 'milestones':
      return `User feeling ${emotion} about ${topic}. Goal progress may need attention.`;
    case 'communication':
      return `User ${emotion} about ${topic}. Calendar/boundary support may help.`;
    case 'wisdom':
      return `User exploring ${emotion} feelings about ${topic}. Deeper reflection opportunity.`;
    default:
      return `User expressed ${emotion} about ${topic}.`;
  }
}

/**
 * Build opportunity observation content.
 */
export function buildOpportunityObservation(
  domain: string,
  analysisResult: TurnAnalysisResult,
  userText: string
): string {
  const emotion = analysisResult.analysis.emotion.primary;
  const topic = analysisResult.currentTopic || 'their progress';

  switch (domain) {
    case 'habits':
      return `User ${emotion} about ${topic}. Good moment to reinforce positive habits.`;
    case 'research':
      return `User excited about ${topic}. Opportunity to deepen learning.`;
    case 'milestones':
      return `User ${emotion} about ${topic}. Potential celebration moment!`;
    case 'communication':
      return `User positive about ${topic}. Good time to optimize schedule.`;
    case 'wisdom':
      return `User in reflective mood about ${topic}. Wisdom-building opportunity.`;
    default:
      return `User ${emotion} about ${topic}. Positive momentum to leverage.`;
  }
}

/**
 * Build pattern observation content.
 */
export function buildPatternObservation(
  domain: string,
  analysisResult: TurnAnalysisResult,
  userText: string
): string {
  const topic = analysisResult.currentTopic || 'patterns';
  return `Repeated mentions related to ${domain}: ${topic}. Worth monitoring.`;
}
