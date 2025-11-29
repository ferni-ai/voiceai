/**
 * Tools Module - Clean Architecture
 *
 * Organized collection of all LLM tools for the John Bogle Voice AI Agent.
 * Each domain has its own module following single responsibility principle.
 *
 * DOMAINS:
 *
 * Financial:
 * - Market Data: Stock quotes, indices, market status
 * - Economic: Fed rates, inflation, unemployment, FRED data
 * - Calculators: Compound growth, fees, retirement, mortgage
 * - Personal Finance: Banking, loans, budgeting, retirement accounts
 *
 * Information:
 * - News: Financial news, general news, tech news
 * - Sports: Live scores for any sport/team
 * - Weather: Current conditions and forecasts
 * - Search: Web search, Wikipedia
 * - Wisdom: Jack's quotes, financial history
 *
 * Human Connection:
 * - Life Events: Major life transitions and support
 * - Wellness: Financial & mental wellness
 * - Small Talk: Holidays, Philly knowledge, personality
 *
 * Conversation:
 * - Conversation: Memory, stories, check-ins
 * - Awareness: Context, drift detection, emotional state
 * - Proactive: Reminders, goals
 * - Memory: Persistent memory tools
 */

import { log } from '@livekit/agents';

// Financial domain
import { createMarketDataTools } from './market-data.js';
import { createEconomicTools } from './economic.js';
import { createCalculatorTools } from './calculators.js';
import { createPersonalFinanceTools } from './personal-finance.js';

// Information domain
import { createNewsTools } from './news.js';
import { createSportsTools } from './sports.js';
import { createWeatherTools } from './weather.js';
import { createSearchTools } from './search.js';
import { createWisdomTools } from './wisdom.js';

// Human connection domain
import { createLifeEventsTools } from './life-events.js';
import { createWellnessTools } from './wellness.js';
import { createSmallTalkTools } from './small-talk.js';

// Conversation domain
import { createConversationTools } from './conversation.js';
import { createMemoryTools } from './memory-tools.js';
import { createProactiveTools } from './proactive.js';
import { createAwarenessTools } from './awareness.js';

const getLogger = () => log();

// ============================================================================
// EXPORTS
// ============================================================================

// Financial domain
export { createMarketDataTools } from './market-data.js';
export { createEconomicTools } from './economic.js';
export { createCalculatorTools } from './calculators.js';
export { createPersonalFinanceTools } from './personal-finance.js';

// Information domain
export { createNewsTools } from './news.js';
export { createSportsTools } from './sports.js';
export { createWeatherTools } from './weather.js';
export { createSearchTools } from './search.js';
export { createWisdomTools } from './wisdom.js';

// Human connection domain
export { createLifeEventsTools } from './life-events.js';
export { createWellnessTools } from './wellness.js';
export { createSmallTalkTools } from './small-talk.js';

// Conversation domain
export { createConversationTools } from './conversation.js';
export { createMemoryTools } from './memory-tools.js';
export { createProactiveTools } from './proactive.js';
export { createAwarenessTools } from './awareness.js';

// ============================================================================
// COMBINED TOOLS
// ============================================================================

/**
 * Create all tools combined - clean architecture
 */
export function createAllTools() {
  getLogger().info('Creating all tools (clean architecture)...');

  // Financial domain
  const marketData = createMarketDataTools();
  const economic = createEconomicTools();
  const calculators = createCalculatorTools();
  const personalFinance = createPersonalFinanceTools();

  // Information domain
  const news = createNewsTools();
  const sports = createSportsTools();
  const weather = createWeatherTools();
  const search = createSearchTools();
  const wisdom = createWisdomTools();

  // Human connection domain
  const lifeEvents = createLifeEventsTools();
  const wellness = createWellnessTools();
  const smallTalk = createSmallTalkTools();

  // Conversation domain
  const conversation = createConversationTools();
  const memory = createMemoryTools();
  const proactive = createProactiveTools();
  const awareness = createAwarenessTools();

  const allTools = {
    // === FINANCIAL ===
    ...marketData, // getStockQuote, getMarketSummary, getCurrentDateTime
    ...economic, // getFedFundsRate, getInflationRate, getUnemploymentRate, getTreasuryYield, getMortgageRate, getGDPGrowth, getEconomicSummary
    ...calculators, // calculateCompoundGrowth, calculateFeeImpact, calculateRetirementProjection, calculateMortgage, calculateEmergencyFund, calculateSavingsRate, calculateYearsToDouble, explainPrinciple
    ...personalFinance, // calculateDebtPayoff, calculateHomeAffordability, calculate5030Budget, calculateFIRENumber, explainBankingConcepts, explainMortgageConcepts, explainRetirementAccounts

    // === INFORMATION ===
    ...news, // getFinancialNews, getStockNews, getGeneralNews, getTechNews
    ...sports, // getTeamScore, getSportScores, getPhilliesScore, getEaglesScore
    ...weather, // getWeather, getWeatherForecast
    ...search, // searchWeb, searchWikipedia, defineTerm
    ...wisdom, // getWisdomQuote, getBogleQuote, getThisDayInHistory, getCrashPerspective

    // === HUMAN CONNECTION ===
    ...lifeEvents, // respondToLifeEvent, getLifeEventAdvice, celebrateMilestone
    ...wellness, // addressFinancialAnxiety, provideEncouragement, reframeMoneyBelief, checkInOnWellbeing, practiceGratitude
    ...smallTalk, // acknowledgeHoliday, sharePhillyFact, recommendPhilly, expressJackMood, askFollowUp, sharePersonalReflection

    // === CONVERSATION ===
    ...conversation, // rememberName, noteEmotionalState, shareStory, thinkOutLoud, circleBack, checkIn, wrapUp, expressOpinion, setReminder, noteInterest
    ...memory, // rememberAboutUser, recallFromMemory, recallPreviousConversation, rememberImportantFact, getRelationshipSummary
    ...proactive, // scheduleFollowUp, setGoal, checkGoalProgress, updateGoalProgress, suggestCheckIn, triggerCircleBack
    ...awareness, // detectConversationDrift, suggestRelevantTopic, assessEmotionalState, suggestCircleBack, getConversationSummary, identifyUserNeeds
  };

  const toolCount = Object.keys(allTools).length;
  getLogger().info(`Created ${toolCount} tools across 16 domains`);

  return allTools;
}

/**
 * Get tool categories for documentation
 */
export function getToolCategories() {
  return {
    // Financial
    marketData: ['getStockQuote', 'getMarketSummary', 'getCurrentDateTime'],
    economic: [
      'getFedFundsRate',
      'getInflationRate',
      'getUnemploymentRate',
      'getTreasuryYield',
      'getMortgageRate',
      'getGDPGrowth',
      'getEconomicSummary',
    ],
    calculators: [
      'calculateCompoundGrowth',
      'calculateFeeImpact',
      'calculateRetirementProjection',
      'calculateMortgage',
      'calculateEmergencyFund',
      'calculateSavingsRate',
      'calculateYearsToDouble',
      'explainPrinciple',
    ],
    personalFinance: [
      'calculateDebtPayoff',
      'calculateHomeAffordability',
      'calculate5030Budget',
      'calculateFIRENumber',
      'explainBankingConcepts',
      'explainMortgageConcepts',
      'explainRetirementAccounts',
    ],

    // Information
    news: ['getFinancialNews', 'getStockNews', 'getGeneralNews', 'getTechNews'],
    sports: ['getTeamScore', 'getSportScores', 'getPhilliesScore', 'getEaglesScore'],
    weather: ['getWeather', 'getWeatherForecast'],
    search: ['searchWeb', 'searchWikipedia', 'defineTerm'],
    wisdom: ['getWisdomQuote', 'getBogleQuote', 'getThisDayInHistory', 'getCrashPerspective'],

    // Human Connection
    lifeEvents: ['respondToLifeEvent', 'getLifeEventAdvice', 'celebrateMilestone'],
    wellness: [
      'addressFinancialAnxiety',
      'provideEncouragement',
      'reframeMoneyBelief',
      'checkInOnWellbeing',
      'practiceGratitude',
    ],
    smallTalk: [
      'acknowledgeHoliday',
      'sharePhillyFact',
      'recommendPhilly',
      'expressJackMood',
      'askFollowUp',
      'sharePersonalReflection',
    ],

    // Conversation
    conversation: [
      'rememberName',
      'noteEmotionalState',
      'shareStory',
      'thinkOutLoud',
      'circleBack',
      'checkIn',
      'wrapUp',
      'expressOpinion',
      'setReminder',
      'noteInterest',
    ],
    memory: [
      'rememberAboutUser',
      'recallFromMemory',
      'recallPreviousConversation',
      'rememberImportantFact',
      'getRelationshipSummary',
    ],
    proactive: [
      'scheduleFollowUp',
      'setGoal',
      'checkGoalProgress',
      'updateGoalProgress',
      'suggestCheckIn',
      'triggerCircleBack',
    ],
    awareness: [
      'detectConversationDrift',
      'suggestRelevantTopic',
      'assessEmotionalState',
      'suggestCircleBack',
      'getConversationSummary',
      'identifyUserNeeds',
    ],
  };
}

/**
 * Get tool documentation
 */
export function getToolDocumentation(): string {
  const categories = getToolCategories();
  const sections = ['# John Bogle Voice AI - Tool Reference', '', '## Financial Domain', ''];

  // Financial
  const financialCategories = ['marketData', 'economic', 'calculators', 'personalFinance'];
  for (const cat of financialCategories) {
    const tools = categories[cat as keyof typeof categories];
    sections.push(`### ${cat} (${tools.length})`);
    sections.push(tools.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  sections.push('## Information Domain', '');

  // Information
  const infoCategories = ['news', 'sports', 'weather', 'search', 'wisdom'];
  for (const cat of infoCategories) {
    const tools = categories[cat as keyof typeof categories];
    sections.push(`### ${cat} (${tools.length})`);
    sections.push(tools.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  sections.push('## Human Connection Domain', '');

  // Human Connection
  const humanCategories = ['lifeEvents', 'wellness', 'smallTalk'];
  for (const cat of humanCategories) {
    const tools = categories[cat as keyof typeof categories];
    sections.push(`### ${cat} (${tools.length})`);
    sections.push(tools.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  sections.push('## Conversation Domain', '');

  // Conversation
  const convCategories = ['conversation', 'memory', 'proactive', 'awareness'];
  for (const cat of convCategories) {
    const tools = categories[cat as keyof typeof categories];
    sections.push(`### ${cat} (${tools.length})`);
    sections.push(tools.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  const totalTools = Object.values(categories).flat().length;
  sections.push(`---`);
  sections.push(`Total: ${totalTools} tools across ${Object.keys(categories).length} domains`);

  return sections.join('\n');
}

export default {
  createAllTools,
  getToolCategories,
  getToolDocumentation,
};
