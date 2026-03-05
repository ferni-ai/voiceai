/**
 * Joel Dickson Insights - Data Fetchers
 *
 * Fetches user data from financial store, productivity store, and profile
 * for Joel's life-mentorship context. Graceful degradation when data is missing.
 *
 * @module intelligence/context-builders/personas/joel-dickson-insights/data-fetchers
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getFinancialStore } from '../../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../../services/stores/productivity-store.js';
import type {
  JoelFinancialData,
  JoelCareerData,
  JoelLifeWisdomData,
  JoelInsightData,
} from './types.js';

const log = createLogger({ module: 'joel:data-fetchers' });

// ============================================================================
// FINANCIAL DATA
// ============================================================================

export async function fetchFinancialData(userId: string): Promise<JoelFinancialData> {
  const defaultData: JoelFinancialData = {
    hasGoals: false,
    goalNames: [],
    hasBudget: false,
    lifeChapterFromMoney: 'unknown',
    primaryConcern: null,
    savingsGoalsCount: 0,
  };

  try {
    const financialStore = getFinancialStore();
    await financialStore.loadUserData(userId);
    const goals = financialStore.getActiveSavingsGoals(userId);
    const budget = financialStore.getMainBudget(userId);

    const goalNames = goals.map((g) => g.name);
    const goalNamesLower = goalNames.map((n) => n.toLowerCase());

    let lifeChapterFromMoney: JoelFinancialData['lifeChapterFromMoney'] = 'unknown';
    if (
      goalNamesLower.some((n) => n.includes('retire') || n.includes('freedom') || n.includes('sabbatical'))
    ) {
      lifeChapterFromMoney = 'freedom-seeking';
    } else if (goalNamesLower.some((n) => n.includes('house') || n.includes('home'))) {
      lifeChapterFromMoney = 'nesting';
    } else if (
      goalNamesLower.some((n) => n.includes('emergency') || n.includes('safety') || n.includes('debt'))
    ) {
      lifeChapterFromMoney = 'foundation-building';
    } else if (goalNames.length > 0) {
      lifeChapterFromMoney = 'active-growth';
    }

    return {
      hasGoals: goals.length > 0,
      goalNames,
      hasBudget: !!budget,
      lifeChapterFromMoney,
      primaryConcern: null,
      savingsGoalsCount: goals.length,
    };
  } catch (e) {
    log.debug({ error: String(e), userId }, 'Failed to fetch financial data for Joel');
    return defaultData;
  }
}

// ============================================================================
// CAREER DATA (from productivity / profile when available)
// ============================================================================

export async function fetchCareerData(userId: string): Promise<JoelCareerData> {
  const defaultData: JoelCareerData = {
    careerSignals: [],
    transitionLikely: false,
    optimizingFor: null,
    stressSignals: false,
  };

  try {
    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);
    const tasks = (userData?.tasks ?? []) as Array<{ title?: string; category?: string }>;
    const careerSignals: string[] = [];

    tasks.forEach((t) => {
      const title = t.title ?? '';
      const category = t.category ?? '';
      if (
        /career|job|work|promotion|quit|change|transition|role|boss|colleague/i.test(title) ||
        /career|job|work|promotion|quit|change|transition|role|boss|colleague/i.test(category)
      ) {
        careerSignals.push(title || category);
      }
    });

    return {
      careerSignals,
      transitionLikely: careerSignals.length > 0,
      optimizingFor: null,
      stressSignals: false,
    };
  } catch (e) {
    log.debug({ error: String(e), userId }, 'Failed to fetch career data for Joel');
    return defaultData;
  }
}

// ============================================================================
// LIFE WISDOM DATA (inferred from profile / dynamic memory when wired)
// ============================================================================

export async function fetchLifeWisdomData(_userId: string): Promise<JoelLifeWisdomData> {
  return {
    recurringThemes: [],
    valuesFromConversations: [],
    enoughQuestionRaised: false,
    moneyShameSignals: false,
  };
}

// ============================================================================
// AGGREGATE FETCH
// ============================================================================

export async function fetchJoelInsightData(userId: string): Promise<JoelInsightData> {
  const [financial, career, lifeWisdom] = await Promise.all([
    fetchFinancialData(userId),
    fetchCareerData(userId),
    fetchLifeWisdomData(userId),
  ]);

  return { financial, career, lifeWisdom };
}
