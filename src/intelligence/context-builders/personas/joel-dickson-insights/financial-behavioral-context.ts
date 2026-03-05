/**
 * Joel Dickson Insights - Financial Behavioral Context
 *
 * Behavioral finance insights: spending patterns, money anxiety signals.
 * Keeps people from making emotional decisions about money.
 *
 * @module intelligence/context-builders/personas/joel-dickson-insights/financial-behavioral-context
 */

import type { JoelInsightData, FinancialBehavioralContext } from './types.js';

// ============================================================================
// BUILD FINANCIAL BEHAVIORAL CONTEXT
// ============================================================================

export function buildFinancialBehavioralContext(data: JoelInsightData): FinancialBehavioralContext {
  const { financial } = data;
  const behavioralSignals: string[] = [];
  const moneyAnxietySignals: string[] = [];
  const prompts: string[] = [];

  if (financial.hasGoals && financial.savingsGoalsCount > 0) {
    behavioralSignals.push(
      `Active goals: ${financial.goalNames.slice(0, 5).join(', ')}. They're building something.`
    );
    prompts.push("Acknowledge progress. 'You've got clear goals. How's it feeling?'");
  }

  if (financial.lifeChapterFromMoney === 'foundation-building') {
    behavioralSignals.push('Foundation-building phase — emergency fund, debt, safety.');
    prompts.push("Normalize. 'Everyone starts somewhere. What's the next step?'");
  }

  if (financial.lifeChapterFromMoney === 'freedom-seeking') {
    behavioralSignals.push('Freedom-seeking — retirement, sabbatical, liberation.');
    prompts.push("'Enough' and 'what do I want my days to be for?' are the right questions.");
  }

  if (financial.primaryConcern) {
    moneyAnxietySignals.push(`Primary concern: ${financial.primaryConcern}.`);
    prompts.push("Address the concern without minimizing. 'That makes sense. What would help?'");
  }

  if (behavioralSignals.length > 0 || moneyAnxietySignals.length > 0) {
    prompts.push(
      "Single most valuable service: keeping them from making emotional decisions. When they're reactive, slow them down. Questions, not advice."
    );
  }

  return {
    behavioralSignals,
    moneyAnxietySignals,
    prompts,
  };
}
