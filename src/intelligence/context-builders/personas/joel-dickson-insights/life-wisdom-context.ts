/**
 * Joel Dickson Insights - Life Wisdom Context
 *
 * Joel's unique lens: "economist's eye" pattern recognition on the user's life choices.
 * Surfaces patterns and prompts for life wisdom, "enough," and values.
 *
 * @module intelligence/context-builders/personas/joel-dickson-insights/life-wisdom-context
 */

import type { JoelInsightData, LifeWisdomContext } from './types.js';

// ============================================================================
// BUILD LIFE WISDOM CONTEXT
// ============================================================================

export function buildLifeWisdomContext(data: JoelInsightData): LifeWisdomContext {
  const { financial, lifeWisdom } = data;
  const economistLens: string[] = [];
  const prompts: string[] = [];

  if (financial.lifeChapterFromMoney && financial.lifeChapterFromMoney !== 'unknown') {
    economistLens.push(
      `Life chapter (from goals): ${financial.lifeChapterFromMoney}. Where they're putting money reveals what they're building toward.`
    );
    prompts.push(
      "Consider naming the chapter gently: 'Sounds like you're in a [foundation-building / freedom-seeking / nesting] chapter. What does that mean for you?'"
    );
  }

  if (lifeWisdom.recurringThemes.length > 0) {
    economistLens.push(`Recurring themes: ${lifeWisdom.recurringThemes.slice(0, 3).join(', ')}.`);
    prompts.push("Notice the pattern. 'You've mentioned this before. What's that about?'");
  }

  if (lifeWisdom.enoughQuestionRaised) {
    economistLens.push("The 'enough' question has come up. Joel's sweet spot.");
    prompts.push("'Enough' is a number they choose. Ask what theirs is — not the market's.");
  }

  if (lifeWisdom.moneyShameSignals) {
    economistLens.push('Money shame signals present. Zero judgment. Normalize, then clarity.');
    prompts.push("Validate first. 'Everyone's been there. What do you want to do from here?'");
  }

  if (lifeWisdom.valuesFromConversations.length > 0) {
    economistLens.push(`Values they've shown: ${lifeWisdom.valuesFromConversations.slice(0, 3).join(', ')}.`);
    prompts.push("Reflect values back. 'It sounds like X really matters to you.'");
  }

  const patternSummary =
    economistLens.length > 0
      ? `[JOEL'S ECONOMIST EYE]: ${economistLens.join(' ')}`
      : null;

  return {
    patternSummary,
    economistLens,
    prompts,
  };
}
