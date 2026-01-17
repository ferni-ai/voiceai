/**
 * Contradiction Detection
 *
 * Detects when users contradict their earlier statements or profile data.
 * Generates gentle, non-accusatory clarification phrases.
 *
 * @module conversation/conversational-memory/contradiction-detection
 */

import { seededChance, seededPick, seededIndex } from '../utils/random-generator.js';
import type { ProfileContradiction, UserProfile, UserStatement } from './types.js';

// ============================================================================
// CONTRADICTION DETECTOR
// ============================================================================

export class ContradictionDetector {
  /**
   * Check if user contradicted something they said earlier (this session)
   */
  checkForContradiction(
    newStatement: string,
    topic: string,
    relatedStatements: UserStatement[]
  ): UserStatement | null {
    // Look for opposite sentiment indicators
    const negativeIndicators = ['not', "don't", "won't", 'never', 'hate', 'dislike'];
    const positiveIndicators = ['love', 'like', 'always', 'want', 'need', 'should'];

    const newHasNegative = negativeIndicators.some((w) => newStatement.toLowerCase().includes(w));
    const newHasPositive = positiveIndicators.some((w) => newStatement.toLowerCase().includes(w));

    for (const statement of relatedStatements) {
      if (statement.topic !== topic || statement.type !== 'fact') continue;

      const oldHasNegative = negativeIndicators.some((w) =>
        statement.text.toLowerCase().includes(w)
      );
      const oldHasPositive = positiveIndicators.some((w) =>
        statement.text.toLowerCase().includes(w)
      );

      // Detect polarity flip
      if ((newHasNegative && oldHasPositive) || (newHasPositive && oldHasNegative)) {
        return statement;
      }
    }

    return null;
  }

  /**
   * Enhanced contradiction detection using profile memory
   * Checks against both current session AND historical profile data
   */
  checkForProfileContradiction(
    newStatement: string,
    profile?: UserProfile
  ): ProfileContradiction | null {
    if (!profile) return null;

    const newLower = newStatement.toLowerCase();

    // Check against stored preferences
    if (profile.preferences) {
      // Risk tolerance contradiction
      if (profile.preferences.riskTolerance) {
        const storedRisk = String(profile.preferences.riskTolerance).toLowerCase();
        if (
          storedRisk === 'conservative' &&
          (newLower.includes('aggressive') || newLower.includes('take more risk'))
        ) {
          return {
            field: 'riskTolerance',
            storedValue: storedRisk,
            newClaim: 'aggressive/more risk',
            confidence: 0.7,
          };
        } else if (
          storedRisk === 'aggressive' &&
          (newLower.includes('conservative') || newLower.includes('play it safe'))
        ) {
          return {
            field: 'riskTolerance',
            storedValue: storedRisk,
            newClaim: 'conservative/safe',
            confidence: 0.7,
          };
        }
      }

      // Verbosity contradiction
      if (profile.preferences.verbosity) {
        const storedVerbosity = String(profile.preferences.verbosity).toLowerCase();
        if (
          storedVerbosity === 'concise' &&
          (newLower.includes('more detail') || newLower.includes('explain more'))
        ) {
          return {
            field: 'verbosity',
            storedValue: storedVerbosity,
            newClaim: 'wants more detail',
            confidence: 0.6,
          };
        }
      }
    }

    // Check against stored goals
    if (profile.goals && profile.goals.length > 0) {
      for (const goal of profile.goals) {
        const goalLower = goal.name.toLowerCase();
        if (
          newLower.includes(goalLower) &&
          (newLower.includes("don't want") ||
            newLower.includes('not interested') ||
            newLower.includes('changed my mind'))
        ) {
          return {
            field: 'goal',
            storedValue: goal.name,
            newClaim: 'no longer wants this',
            confidence: 0.8,
          };
        }
      }
    }

    // Check against small details (names, facts)
    if (profile.smallDetails && profile.smallDetails.length > 0) {
      for (const detail of profile.smallDetails) {
        if (detail.type === 'person_name' || detail.type === 'pet_name') {
          const storedName = detail.value.toLowerCase();
          if (
            newLower.includes(`not ${storedName}`) ||
            newLower.includes(`isn't ${storedName}`) ||
            (newLower.includes('name is') && !newLower.includes(storedName))
          ) {
            return {
              field: detail.type,
              storedValue: detail.value,
              newClaim: 'different name',
              confidence: 0.9,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Generate a gentle contradiction acknowledgment for session contradiction
   */
  generateAcknowledgment(original: UserStatement): string {
    const phrases = [
      `Hmm, earlier you mentioned "${original.text}"—has something changed?`,
      `That's interesting—I thought you said "${original.text}" before. What shifted?`,
      `Wait, didn't you mention "${original.text}" earlier? I want to make sure I understand.`,
      `Help me connect the dots—earlier you said "${original.text}"...`,
    ];

    return seededPick(`${Date.now()}:164`, phrases) ?? phrases[0];
  }

  /**
   * Generate a gentle clarification for a profile contradiction
   * The agent should NOT be accusatory - just curious
   */
  generateProfileClarification(contradiction: ProfileContradiction): string {
    const phrases: Record<string, string[]> = {
      riskTolerance: [
        `Hmm, I remember you mentioning you were more ${contradiction.storedValue}—has something changed?`,
        `That's interesting—I had you pegged as more ${contradiction.storedValue}. What's shifted?`,
        `Wait, didn't you say you preferred a ${contradiction.storedValue} approach? I want to make sure I understand correctly.`,
      ],
      verbosity: [
        `I thought you preferred more ${contradiction.storedValue} explanations. Want me to adjust?`,
        `Just checking—you mentioned liking ${contradiction.storedValue} answers before. Should I change that?`,
      ],
      goal: [
        `I remember ${contradiction.storedValue} being important to you. Has your thinking changed?`,
        `That's a shift from what we discussed before about ${contradiction.storedValue}. What's different now?`,
      ],
      person_name: [
        `Oh! I thought you said their name was ${contradiction.storedValue}. Did I mishear?`,
        `Let me update my notes—I had ${contradiction.storedValue} written down. What's the correct name?`,
      ],
      pet_name: [
        `Wait, isn't your pet named ${contradiction.storedValue}? Or am I mixing things up?`,
      ],
    };

    const fieldPhrases = phrases[contradiction.field] || [
      `I want to make sure I have this right—I thought you said ${contradiction.storedValue}?`,
    ];

    return seededPick(`${Date.now()}:199`, fieldPhrases) ?? fieldPhrases[0];
  }
}
