/**
 * Profile Personalizer - GAP 2.1: User Profile Underutilized
 *
 * Enhances prompts with user-specific context from their profile.
 * Makes Jack remember and personalize every interaction.
 */

import type { UserProfile, LifeStage } from '../../types/user-profile.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';

const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

export interface PersonalizationContext {
  hasGoals: boolean;
  hasAnxietyTriggers: boolean;
  hasPreferences: boolean;
  hasFinancialContext: boolean;
  hasLifeStage: boolean;
}

// ============================================================================
// PROFILE PERSONALIZER
// ============================================================================

export class ProfilePersonalizer {
  /**
   * Enhance a base prompt with personalization from user profile
   */
  enhancePromptWithPersonalization(basePrompt: string, profile: UserProfile): string {
    let enhanced = basePrompt;

    // 1. Inject user's active goals
    if (profile.goals.length > 0) {
      const activeGoals = profile.goals.filter(
        (g) => g.status === 'active' || g.status === 'on_track'
      );

      if (activeGoals.length > 0) {
        enhanced += "\n\n[USER'S ACTIVE GOALS]";
        for (const goal of activeGoals) {
          enhanced += `\n- ${goal.name}: ${goal.type} goal`;
          if (goal.targetAmount) {
            enhanced += ` (target: $${goal.targetAmount.toLocaleString()})`;
          }
          if (goal.progressPercent !== undefined) {
            enhanced += ` - ${goal.progressPercent}% complete`;
          }
          enhanced += ` [${goal.priority} priority]`;

          if (goal.jackNotes) {
            enhanced += `\n  Jack's notes: ${goal.jackNotes}`;
          }
        }

        enhanced +=
          '\n\nREMEMBER: Reference these goals naturally. Ask about progress. Celebrate milestones.';
      }
    }

    // 2. Inject anxiety triggers to AVOID
    if (profile.financialAnxietyTriggers && profile.financialAnxietyTriggers.length > 0) {
      enhanced += '\n\n[⚠️ ANXIETY TRIGGERS - BE EXTREMELY GENTLE]';
      enhanced += `\n${profile.financialAnxietyTriggers.join(', ')}`;
      enhanced += '\nAvoid these topics entirely unless the user brings them up first.';
      enhanced += '\nIf discussed, approach with maximum empathy and reassurance.';
    }

    // 3. Inject communication style preference
    if (profile.preferences.verbosity) {
      enhanced += '\n\n[COMMUNICATION STYLE]';
      enhanced += `\nUser prefers: ${profile.preferences.verbosity} responses`;

      if (profile.preferences.verbosity === 'concise') {
        enhanced += '\nKeep responses under 150 words. Be direct, clear, and to the point.';
        enhanced += '\nAvoid long stories unless specifically asked.';
      } else if (profile.preferences.verbosity === 'storytelling') {
        enhanced += '\nUser LOVES stories! Share more anecdotes and personal experiences.';
        enhanced += '\nTake time to paint pictures with words. Be conversational and warm.';
      } else {
        enhanced +=
          '\nBalance between brevity and depth. Stories are welcome but keep them relevant.';
      }
    }

    // 4. Inject topics to avoid
    if (profile.preferences.topicsToAvoid && profile.preferences.topicsToAvoid.length > 0) {
      enhanced += '\n\n[TOPICS TO AVOID]';
      enhanced += `\n${profile.preferences.topicsToAvoid.join(', ')}`;
      enhanced += '\nDo not bring up these topics unless the user initiates.';
    }

    // 5. Inject life stage context
    if (profile.lifeStage) {
      enhanced += '\n\n[LIFE CONTEXT]';
      enhanced += `\nUser is in ${profile.lifeStage.replace('_', ' ')} stage.`;

      const stageGuidance = this.getLifeStageGuidance(profile.lifeStage);
      if (stageGuidance) {
        enhanced += `\nTailor advice for: ${stageGuidance}`;
      }
    }

    // 6. Inject financial situation specifics
    if (profile.financialSituation) {
      enhanced += '\n\n[FINANCIAL CONTEXT]';

      if (profile.financialSituation.hasEmergencyFund) {
        enhanced += '\n✅ Has emergency fund';
      } else {
        enhanced += '\n⚠️ No emergency fund yet - gently encourage building one';
      }

      if (profile.financialSituation.hasDebt) {
        enhanced += '\n⚠️ Has debt';
        if (
          profile.financialSituation.debtTypes &&
          profile.financialSituation.debtTypes.length > 0
        ) {
          enhanced += ` (${profile.financialSituation.debtTypes.join(', ')})`;
        }
        enhanced += ' - be mindful when discussing investments vs debt payoff';
      }

      if (profile.financialSituation.investmentAccounts.length > 0) {
        const accounts = profile.financialSituation.investmentAccounts
          .filter((a) => a.hasAccount)
          .map((a) => a.type);

        if (accounts.length > 0) {
          enhanced += `\nCurrent accounts: ${accounts.join(', ')}`;
        }
      }
    }

    // 7. Inject privacy level
    if (profile.preferences.financialPrivacyLevel) {
      enhanced += '\n\n[PRIVACY LEVEL]';
      if (profile.preferences.financialPrivacyLevel === 'private') {
        enhanced += '\nUser values privacy - avoid asking for specific dollar amounts.';
        enhanced += '\nSpeak in percentages and ratios instead.';
      } else if (profile.preferences.financialPrivacyLevel === 'open') {
        enhanced += '\nUser is comfortable discussing specific numbers.';
      }
    }

    // 8. Inject primary concerns
    if (profile.primaryConcerns.length > 0) {
      const concerns = profile.primaryConcerns.filter((c) => c !== 'none' && c !== 'general');
      if (concerns.length > 0) {
        enhanced += '\n\n[PRIMARY CONCERNS]';
        enhanced += `\n${concerns.join(', ')}`;
        enhanced += '\nAddress these concerns proactively when relevant.';
      }
    }

    return enhanced;
  }

  /**
   * Get life stage specific guidance
   */
  private getLifeStageGuidance(stage: LifeStage): string {
    const stageGuidance: Record<LifeStage, string> = {
      young_adult: 'Emergency fund first, start retirement early, manage student loans wisely',
      early_career:
        '401k matching is free money, build index fund portfolio, increase savings rate',
      mid_career: 'Maximize retirement contributions, consider 529 plans, review estate planning',
      pre_retirement: 'Retirement readiness assessment, portfolio rebalancing, healthcare planning',
      retirement: 'Sustainable withdrawal strategies, legacy planning, healthcare cost management',
    };

    return stageGuidance[stage] || '';
  }

  /**
   * Tailor generic advice to user's specific financial situation
   */
  tailorAdviceToFinancialSituation(genericAdvice: string, profile: UserProfile): string {
    let tailored = genericAdvice;
    const { financialSituation } = profile;

    if (!financialSituation) return tailored;

    // Replace generic "build emergency fund" with specific guidance
    if (financialSituation.hasEmergencyFund) {
      tailored = tailored.replace(
        /build an emergency fund/gi,
        'keep maintaining that emergency fund you have'
      );
      tailored = tailored.replace(
        /start saving for emergencies/gi,
        'continue building on that emergency fund'
      );
    } else {
      // Emphasize emergency fund if they don't have one
      if (!tailored.toLowerCase().includes('emergency')) {
        tailored +=
          ' And remember - before aggressive investing, having 3-6 months of expenses saved is your foundation.';
      }
    }

    // Be specific about their accounts
    if (financialSituation.investmentAccounts.length > 0) {
      const accountTypes = financialSituation.investmentAccounts
        .filter((a) => a.hasAccount)
        .map((a) => a.type);

      if (accountTypes.length > 0) {
        // Replace generic "open an account" with specific guidance
        tailored = tailored.replace(
          /open (a|an) (retirement |investment )?account/gi,
          `maximize your ${accountTypes[0]}`
        );

        // Add specific context about their accounts
        if (/\b(accounts|investments|portfolio)\b/i.test(tailored)) {
          tailored += ` Thinking specifically about your ${accountTypes.join(' and ')}...`;
        }
      }
    }

    // Debt-aware advice
    if (financialSituation.hasDebt) {
      // Add debt consideration to investment advice
      if (/\b(invest|investing|investments)\b/i.test(tailored) && !/\bdebt\b/i.test(tailored)) {
        tailored +=
          ' Of course, balance this with paying down that debt - high-interest debt first.';
      }
    }

    return tailored;
  }

  /**
   * Apply preference filters to response
   */
  applyPreferenceFilters(response: string, profile: UserProfile): string {
    let filtered = response;

    // Enforce verbosity preference
    if (profile.preferences.verbosity === 'concise') {
      // If response is too long, suggest summarizing
      // 🦀 Rust-accelerated word counting
      const wordCount = RUST_COUNTING_AVAILABLE
        ? countWordsRust(filtered)
        : filtered.split(/\s+/).length;
      if (wordCount > 200) {
        // This is a signal to the LLM - in practice, we'd want to truncate or regenerate
        filtered = `[REMINDER: User prefers concise responses - keep under 150 words]\n\n${filtered}`;
      }
    }

    return filtered;
  }

  /**
   * Get personalization context summary (for debugging/logging)
   */
  getPersonalizationContext(profile: UserProfile): PersonalizationContext {
    return {
      hasGoals: profile.goals.length > 0,
      hasAnxietyTriggers: (profile.financialAnxietyTriggers?.length || 0) > 0,
      hasPreferences: true, // Always has default preferences
      hasFinancialContext: profile.financialSituation !== undefined,
      hasLifeStage: profile.lifeStage !== undefined,
    };
  }

  /**
   * Check if profile has enough data for personalization
   */
  hasMinimalPersonalizationData(profile: UserProfile): boolean {
    return (
      profile.name !== undefined ||
      profile.goals.length > 0 ||
      profile.lifeStage !== undefined ||
      profile.financialSituation !== undefined
    );
  }

  /**
   * Build a greeting personalized to the user
   */
  buildPersonalizedGreeting(profile: UserProfile, isReturning: boolean): string {
    // Use preferred greeting if set
    if (profile.preferences.preferredGreeting) {
      return profile.preferences.preferredGreeting;
    }

    // Default greeting logic
    const name = profile.preferredName || profile.name;

    if (!isReturning) {
      return name ? `Hey there, ${name}!` : 'Hey there!';
    }

    // Returning user - reference last interaction
    if (profile.lastConversationSummary) {
      const daysSince = Math.floor(
        (Date.now() - new Date(profile.lastContact).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince < 1) {
        return name ? `Welcome back, ${name}!` : 'Welcome back!';
      } else if (daysSince < 7) {
        return name ? `Good to hear from you again, ${name}!` : 'Good to hear from you again!';
      } else {
        return name ? `Hey ${name}, it's been a while!` : "Hey there, it's been a while!";
      }
    }

    return name ? `Hey ${name}!` : 'Hey there!';
  }
}

/**
 * Singleton instance
 */
let personalizer: ProfilePersonalizer | null = null;

/**
 * Get the singleton personalizer
 */
export function getPersonalizer(): ProfilePersonalizer {
  if (!personalizer) {
    personalizer = new ProfilePersonalizer();
  }
  return personalizer;
}

/**
 * Reset for testing
 */
export function resetPersonalizer(): void {
  personalizer = null;
}

export default ProfilePersonalizer;
