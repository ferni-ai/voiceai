/**
 * Relevance Engine
 *
 * Finds contextually relevant personal moments to share based on:
 * - User's current message (keywords, topics)
 * - User's emotional state
 * - Conversation context
 * - Relationship stage
 * - What's already been shared with this user
 *
 * This is the brain that makes personality feel RELEVANT, not random.
 *
 * @module personality/relevance-engine
 *
 * @deprecated MIGRATION GUIDE (2024-12):
 * This module uses keyword-based relevance matching. For new code, prefer:
 *
 * 1. **Semantic relevance**: Use `personality/memory-adapter.ts`
 *    ```typescript
 *    import { findRelevantMomentSemantic } from './memory-adapter.js';
 *    const match = await findRelevantMomentSemantic(personaId, userMessage, {
 *      relationshipStage: 'friend',
 *      minSimilarity: 0.5,
 *    });
 *    ```
 *
 * 2. **Timing decisions**: Use `personality/timing-intelligence.ts`
 *    to determine WHEN to share, not just WHAT.
 *    ```typescript
 *    import { analyzeMessageTiming } from './timing-intelligence.js';
 *    const timing = analyzeMessageTiming(message, metadata);
 *    if (timing.personalMomentAppropriate) { ... }
 *    ```
 *
 * The memory-adapter uses embedding-based semantic search which provides
 * higher quality matches than keyword patterns, especially for nuanced
 * emotional context.
 */

import { createLogger } from '../utils/safe-logger.js';
import { getMomentsForPersona, getMomentsForRelationshipStage } from './personal-moment-store.js';
import type {
  PersonalMoment,
  PersonalityRelationship,
  RelationshipStage,
  RelevanceMatch,
  RelevanceOptions,
  ShareDepth,
} from './types.js';

const log = createLogger({ module: 'RelevanceEngine' });

// ============================================================================
// RELATIONSHIP STAGE MAPPING
// ============================================================================

const STAGE_ORDER: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'trusted'];

function getStageIndex(stage: RelationshipStage): number {
  return STAGE_ORDER.indexOf(stage);
}

function canAccessDepth(stage: RelationshipStage, depth: ShareDepth): boolean {
  const stageIndex = getStageIndex(stage);

  switch (depth) {
    case 'surface':
      return true;
    case 'medium':
      return stageIndex >= 1; // acquaintance+
    case 'deep':
      return stageIndex >= 2; // friend+
    case 'sacred':
      return stageIndex >= 3; // trusted only
  }
}

// ============================================================================
// RELEVANCE SCORING
// ============================================================================

/**
 * Score how relevant a moment is to the current context
 */
function scoreMomentRelevance(
  moment: PersonalMoment,
  options: RelevanceOptions,
  relationship?: PersonalityRelationship
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const userMessageLower = options.userMessage.toLowerCase();

  // 1. Direct question match (highest score)
  if (moment.triggers.directQuestions) {
    for (const pattern of moment.triggers.directQuestions) {
      if (pattern.test(options.userMessage)) {
        score += 0.5;
        reasons.push('Direct question match');
        break;
      }
    }
  }

  // 2. Keyword matches
  let keywordMatches = 0;
  for (const keyword of moment.triggers.keywords) {
    if (userMessageLower.includes(keyword.toLowerCase())) {
      keywordMatches++;
    }
  }
  if (keywordMatches > 0) {
    score += Math.min(0.3, keywordMatches * 0.1);
    reasons.push(`${keywordMatches} keyword match(es)`);
  }

  // 3. Emotion match
  if (options.userEmotion && moment.triggers.emotions?.length) {
    if (moment.triggers.emotions.includes(options.userEmotion)) {
      score += 0.2;
      reasons.push('Emotion match');
    }
  }

  // 4. Topic match
  if (options.recentTopics?.length && moment.triggers.topics?.length) {
    const topicMatches = moment.triggers.topics.filter((t) =>
      options.recentTopics!.some((rt) => rt.toLowerCase().includes(t.toLowerCase()))
    ).length;
    if (topicMatches > 0) {
      score += Math.min(0.15, topicMatches * 0.075);
      reasons.push(`${topicMatches} topic match(es)`);
    }
  }

  // 5. Apply weight modifier
  if (moment.weight && moment.weight !== 1.0) {
    score *= moment.weight;
  }

  // 6. Check if already shared (reduce score significantly)
  if (relationship) {
    const alreadyShared = relationship.sharedMoments.some((sm) => sm.momentId === moment.id);
    if (alreadyShared) {
      // Check if within cooldown
      const lastShare = relationship.sharedMoments.find((sm) => sm.momentId === moment.id);
      if (lastShare) {
        const daysSinceShare = Math.floor(
          (Date.now() - new Date(lastShare.sharedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceShare < moment.cooldownDays) {
          score = 0; // Within cooldown, don't show
          reasons.push('Within cooldown period');
        } else {
          score *= 0.3; // After cooldown, can show again but with lower priority
          reasons.push('Previously shared (after cooldown)');
        }

        // Check max shares limit
        const shareCount = relationship.sharedMoments.filter(
          (sm) => sm.momentId === moment.id
        ).length;
        if (shareCount >= moment.maxSharesPerUser) {
          score = 0;
          reasons.push('Max shares reached');
        }
      }
    }
  }

  return {
    score: Math.min(1, score), // Cap at 1.0
    reason: reasons.join('; ') || 'No specific match',
  };
}

// ============================================================================
// MAIN RELEVANCE FINDER
// ============================================================================

/**
 * Find the most relevant moment to share based on context
 */
export function findRelevantMoment(
  personaId: string,
  options: RelevanceOptions
): RelevanceMatch | null {
  const minScore = options.minRelevanceScore ?? 0.2;
  const maxMatches = options.maxMatches ?? 1;

  // Get moments accessible at this relationship stage
  const accessibleMoments = getMomentsForRelationshipStage(personaId, options.relationshipStage);

  if (accessibleMoments.length === 0) {
    log.debug({ personaId, stage: options.relationshipStage }, 'No accessible moments');
    return null;
  }

  // Score all moments
  const scoredMoments: Array<{ moment: PersonalMoment; score: number; reason: string }> = [];

  for (const moment of accessibleMoments) {
    // Check relationship stage access
    if (!canAccessDepth(options.relationshipStage, moment.depth)) {
      continue;
    }

    const { score, reason } = scoreMomentRelevance(moment, options, options.relationship);

    if (score >= minScore) {
      scoredMoments.push({ moment, score, reason });
    }
  }

  if (scoredMoments.length === 0) {
    log.debug({ personaId, minScore }, 'No moments above threshold');
    return null;
  }

  // Sort by score descending
  scoredMoments.sort((a, b) => b.score - a.score);

  // Take top match
  const best = scoredMoments[0];

  // Pick a random transition phrase
  const transition =
    best.moment.transitions[Math.floor(Math.random() * best.moment.transitions.length)];

  // Check if previously shared
  const previouslyShared =
    options.relationship?.sharedMoments.some((sm) => sm.momentId === best.moment.id) ?? false;
  const lastShared = previouslyShared
    ? options.relationship?.sharedMoments.find((sm) => sm.momentId === best.moment.id)?.sharedAt
    : undefined;

  const result: RelevanceMatch = {
    moment: best.moment,
    relevanceScore: best.score,
    reason: best.reason,
    suggestedTransition: transition,
    previouslyShared,
    lastSharedAt: lastShared,
  };

  log.debug(
    {
      personaId,
      momentId: best.moment.id,
      score: best.score,
      reason: best.reason,
    },
    '✨ Found relevant moment'
  );

  return result;
}

/**
 * Find multiple relevant moments (for variety or fallbacks)
 */
export function findRelevantMoments(
  personaId: string,
  options: RelevanceOptions
): RelevanceMatch[] {
  const minScore = options.minRelevanceScore ?? 0.15;
  const maxMatches = options.maxMatches ?? 3;

  const accessibleMoments = getMomentsForRelationshipStage(personaId, options.relationshipStage);

  const scoredMoments: Array<{ moment: PersonalMoment; score: number; reason: string }> = [];

  for (const moment of accessibleMoments) {
    if (!canAccessDepth(options.relationshipStage, moment.depth)) {
      continue;
    }

    const { score, reason } = scoreMomentRelevance(moment, options, options.relationship);

    if (score >= minScore) {
      scoredMoments.push({ moment, score, reason });
    }
  }

  // Sort and take top N
  scoredMoments.sort((a, b) => b.score - a.score);
  const topMoments = scoredMoments.slice(0, maxMatches);

  return topMoments.map((sm) => ({
    moment: sm.moment,
    relevanceScore: sm.score,
    reason: sm.reason,
    suggestedTransition:
      sm.moment.transitions[Math.floor(Math.random() * sm.moment.transitions.length)],
    previouslyShared:
      options.relationship?.sharedMoments.some((r) => r.momentId === sm.moment.id) ?? false,
  }));
}

// ============================================================================
// QUESTION DETECTION
// ============================================================================

/**
 * Check if user is asking about something Ferni previously shared
 */
export function detectFollowUpQuestion(
  personaId: string,
  userMessage: string,
  relationship: PersonalityRelationship
): PersonalMoment | null {
  if (!relationship || relationship.sharedMoments.length === 0) {
    return null;
  }

  const messageLower = userMessage.toLowerCase();
  const allMoments = getMomentsForPersona(personaId);

  // Check moments that were shared and can be asked about
  for (const sharedRecord of relationship.sharedMoments) {
    const moment = allMoments.find((m) => m.id === sharedRecord.momentId);

    if (!moment || !moment.canAskAbout) {
      continue;
    }

    // Check follow-up prompts
    if (moment.followUpPrompts) {
      for (const prompt of moment.followUpPrompts) {
        // Simple match - check if user message contains key words from prompt
        const promptKeywords = prompt.toLowerCase().split(/\s+/);
        const matches = promptKeywords.filter((kw) => kw.length > 3 && messageLower.includes(kw));
        if (matches.length >= 2) {
          log.debug({ momentId: moment.id, matches }, 'Follow-up question detected');
          return moment;
        }
      }
    }

    // Check if asking about the topic directly
    if (moment.triggers.directQuestions) {
      for (const pattern of moment.triggers.directQuestions) {
        if (pattern.test(userMessage)) {
          log.debug({ momentId: moment.id }, 'Direct follow-up question detected');
          return moment;
        }
      }
    }
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  findRelevantMoment,
  findRelevantMoments,
  detectFollowUpQuestion,
};
