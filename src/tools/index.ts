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

import { llm, log } from '@livekit/agents';
import { z } from 'zod';

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

// Communication domain
import { createCommunicationTools } from './communication.js';

// Banking domain (Plaid)
import { createPlaidTools } from './plaid.js';

// Agent handoff (Jack ↔ Peter Lynch)
import { createHandoffTools } from './handoff.js';

// Telephony - Jack calls YOU!
import { createTelephonyTools } from './telephony.js';

// Peter Lynch's stock picking tools
import { createPeterLynchTools } from './peter-lynch-tools.js';

// Spotify music integration
import { createSpotifyTools } from './spotify.js';

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

// Communication domain
export { createCommunicationTools } from './communication.js';

// Banking domain (Plaid)
export { createPlaidTools } from './plaid.js';
export { 
  storeAccessToken, 
  getStoredAccessToken, 
  hasLinkedAccounts, 
  getTokenData, 
  removeAccessToken 
} from './plaid-store.js';

// Agent domain
export { createHandoffTools } from './handoff.js';
export { createTelephonyTools } from './telephony.js';
export { createPeterLynchTools } from './peter-lynch-tools.js';

// Entertainment domain
export { createSpotifyTools } from './spotify.js';

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

  // Banking domain (Plaid)
  const plaid = createPlaidTools();

  // Communication domain
  const communication = createCommunicationTools();

  // Agent domain
  const handoff = createHandoffTools();
  const telephony = createTelephonyTools();
  const peterLynch = createPeterLynchTools();

  // Entertainment domain
  const spotify = createSpotifyTools();

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

    // === BANKING (PLAID) ===
    ...plaid, // checkBankLinkStatus, linkBankAccount, unlinkBankAccount, getAccountBalances, getSpendingAnalysis, getRecentTransactions, checkFinancialHealth

    // === COMMUNICATION ===
    ...communication, // sendEmail, sendSMS, scheduleReminder, scheduleEvent

    // === AGENT ===
    ...handoff, // handoffToPeter, handoffToJack
    ...telephony, // callUser, scheduleCallback
    ...peterLynch, // analyzeStock, findStockCategory, calculatePEGRatio, findTenBaggers, explainStockCategory

    // === ENTERTAINMENT ===
    ...spotify, // playMusic, searchMusic, pauseMusic, resumeMusic, skipSong, whatsPlaying, setMusicVolume, suggestMusic
  };

  const toolCount = Object.keys(allTools).length;
  getLogger().info(`Created ${toolCount} tools across 21 domains`);

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

    // Banking
    plaid: [
      'checkBankLinkStatus',
      'linkBankAccount',
      'unlinkBankAccount',
      'getAccountBalances',
      'getSpendingAnalysis',
      'getRecentTransactions',
      'checkFinancialHealth',
    ],

    // Communication
    communication: [
      'sendEmail',
      'sendSMS',
      'scheduleReminder',
      'scheduleEvent',
    ],

    // Agent
    handoff: [
      'handoffToPeter',
      'handoffToJack',
    ],
    telephony: [
      'callUser',
      'scheduleCallback',
    ],
    peterLynch: [
      'analyzeStock',
      'findStockCategory',
      'calculatePEGRatio',
      'findTenBaggers',
      'explainStockCategory',
    ],

    // Entertainment
    spotify: [
      'playMusic',
      'searchMusic',
      'pauseMusic',
      'resumeMusic',
      'skipSong',
      'whatsPlaying',
      'setMusicVolume',
      'suggestMusic',
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

  sections.push('## Banking Domain', '');

  // Banking (Plaid)
  const bankingCategories = ['plaid'];
  for (const cat of bankingCategories) {
    const tools = categories[cat as keyof typeof categories];
    sections.push(`### ${cat} (${tools.length})`);
    sections.push(tools.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  sections.push('## Communication Domain', '');

  // Communication
  const commCategories = ['communication'];
  for (const cat of commCategories) {
    const tools = categories[cat as keyof typeof categories];
    sections.push(`### ${cat} (${tools.length})`);
    sections.push(tools.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  sections.push('## Agent Domain', '');

  // Agent (Handoff, Telephony, Peter Lynch)
  const agentCategories = ['handoff', 'telephony', 'peterLynch'];
  for (const cat of agentCategories) {
    const tools = categories[cat as keyof typeof categories];
    sections.push(`### ${cat} (${tools.length})`);
    sections.push(tools.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  sections.push('## Entertainment Domain', '');

  // Entertainment (Spotify)
  const entertainmentCategories = ['spotify'];
  for (const cat of entertainmentCategories) {
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

// ============================================================================
// ESSENTIAL TOOLS (Optimized for Gemini Realtime - ~25 tools max)
// ============================================================================

/**
 * Create essential tools only - optimized for LLM performance
 * 
 * PHILOSOPHY: The LLM should only see tools for USER-FACING actions.
 * Internal operations (memory, awareness, conversation management)
 * are handled by the intelligence layer programmatically.
 * 
 * TARGET: ~15-20 tools max for optimal Gemini Realtime performance
 */
export function createEssentialTools() {
  getLogger().info('Creating essential tools (optimized for Gemini)...');

  // Financial domain
  const marketData = createMarketDataTools();
  const calculators = createCalculatorTools();
  const wisdom = createWisdomTools();

  // Communication domain
  const communication = createCommunicationTools();

  // Banking domain (Plaid)
  const plaid = createPlaidTools();

  // Agent handoff (Jack ↔ Peter Lynch)
  const handoff = createHandoffTools();

  // Telephony - Jack calls YOU!
  const telephony = createTelephonyTools();

  // Peter Lynch's stock picking tools (for when Peter takes over!)
  const peterLynch = createPeterLynchTools();

  // Spotify music integration
  const spotify = createSpotifyTools();

  // Consolidated information tools (created inline for simplicity)
  const consolidatedNews = createConsolidatedNewseTool();
  const consolidatedSports = createConsolidatedSportsTool();
  const consolidatedWeather = createConsolidatedWeatherTool();
  const consolidatedSearch = createConsolidatedSearchTool();

  const essentialTools = {
    // === MARKET DATA (3 tools) ===
    getStockQuote: marketData.getStockQuote,
    getMarketSummary: marketData.getMarketSummary,
    getCurrentDateTime: marketData.getCurrentDateTime,

    // === CALCULATORS (5 tools - core financial calculations) ===
    calculateCompoundGrowth: calculators.calculateCompoundGrowth,
    calculateFeeImpact: calculators.calculateFeeImpact,
    calculateRetirementProjection: calculators.calculateRetirementProjection,
    calculateMortgage: calculators.calculateMortgage,
    explainPrinciple: calculators.explainPrinciple,

    // === INFORMATION (4 consolidated tools) ===
    getNews: consolidatedNews, // All news types in one
    getSportsScore: consolidatedSports, // All sports in one
    getWeather: consolidatedWeather, // Weather + forecast in one
    search: consolidatedSearch, // Web + Wikipedia in one

    // === COMMUNICATION (4 tools) ===
    sendEmail: communication.sendEmail,
    sendSMS: communication.sendSMS,
    scheduleReminder: communication.scheduleReminder,
    scheduleEvent: communication.scheduleEvent,

    // === BANKING / PLAID (7 tools) ===
    checkBankLinkStatus: plaid.checkBankLinkStatus,
    linkBankAccount: plaid.linkBankAccount,
    unlinkBankAccount: plaid.unlinkBankAccount,
    getAccountBalances: plaid.getAccountBalances,
    getSpendingAnalysis: plaid.getSpendingAnalysis,
    getRecentTransactions: plaid.getRecentTransactions,
    checkFinancialHealth: plaid.checkFinancialHealth,

    // === WISDOM (2 tools) ===
    getWisdomQuote: wisdom.getWisdomQuote,
    getCrashPerspective: wisdom.getCrashPerspective,

    // === AGENT HANDOFF (2 tools) - Jack ↔ Peter Lynch ===
    ...handoff,

    // === TELEPHONY (2 tools) - Jack calls YOU! ===
    ...telephony,

    // === PETER LYNCH (5 tools) - Stock picking when Peter takes over ===
    ...peterLynch,

    // === SPOTIFY (8 tools) - Music playback and control ===
    ...spotify,
  };

  const toolCount = Object.keys(essentialTools).length;
  getLogger().info(`Created ${toolCount} essential tools (optimized for Gemini)`);

  return essentialTools;
}

// ============================================================================
// CONSOLIDATED TOOLS (Single tool per domain)
// ============================================================================

// Import the underlying functions directly
import { getFinancialNews, getStockNews, getGeneralNews, getTechNews } from './news.js';
import { getTeamScore } from './sports.js';
import { getCurrentWeather, getWeatherForecast } from './weather.js';
import { searchWeb, searchWikipedia } from './search.js';

/**
 * Consolidated News Tool - handles financial, general, tech, stock news
 */
/**
 * Helper: Wrap async function with timeout to prevent hangs
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.log(`⏰ [TIMEOUT] Operation timed out after ${timeoutMs}ms`);
      resolve(fallback);
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

function createConsolidatedNewseTool() {
  return llm.tool({
    description: `Get news headlines. Handles ALL news types:
- "financial" or "market": Market and investing news
- "stock SYMBOL": News about a specific stock (e.g., "stock AAPL")  
- "general" or "world": Top world news
- "tech": Technology news
Just ask naturally: "What's in the news?", "Any news about Apple?", "Market news today?"`,
    parameters: z.object({
      query: z.string().describe('What kind of news: "financial", "stock AAPL", "general", "tech", or a topic'),
    }),
    execute: async ({ query }: { query: string }) => {
      const startTime = Date.now();
      console.log(`\n🔧 [TOOL START] getNews("${query}") at ${new Date().toISOString()}`);
      getLogger().info({ query, startTime }, '>>> TOOL: getNews STARTED');
      
      const q = query.toLowerCase();
      const TOOL_TIMEOUT = 12000; // 12 second max for news tools
      const TIMEOUT_FALLBACK = "I'm having a bit of trouble reaching my news sources right now. You know, the internet can be like that sometimes. What else can I help you with?";
      
      try {
        let resultPromise: Promise<string>;
        let newsType: string;
        
        // Route to appropriate news function
        if (q.includes('stock ') || /^[A-Z]{1,5}$/.test(query)) {
          const symbol = q.replace('stock ', '').toUpperCase();
          newsType = `stock:${symbol}`;
          resultPromise = getStockNews(symbol);
        } else if (q.includes('financial') || q.includes('market') || q.includes('investing')) {
          newsType = 'financial';
          resultPromise = getFinancialNews('general');
        } else if (q.includes('tech') || q.includes('technology')) {
          newsType = 'tech';
          resultPromise = getTechNews();
        } else {
          newsType = 'general';
          resultPromise = getGeneralNews();
        }
        
        // Wrap with timeout to prevent hangs
        const result = await withTimeout(resultPromise, TOOL_TIMEOUT, TIMEOUT_FALLBACK);
        
        const elapsed = Date.now() - startTime;
        console.log(`✅ [TOOL DONE] getNews("${query}") completed in ${elapsed}ms - ${result.slice(0, 100)}...`);
        getLogger().info({ query, newsType, elapsed, resultLength: result.length }, '<<< TOOL: getNews COMPLETED');
        return result;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ [TOOL ERROR] getNews("${query}") failed after ${elapsed}ms: ${error}`);
        getLogger().error({ query, elapsed, error }, '<<< TOOL: getNews FAILED');
        // Return graceful error instead of throwing
        return "I had some trouble getting the news just now. Maybe we can try again in a moment, or I can help you with something else?";
      }
    },
  });
}

/**
 * Consolidated Sports Tool - handles any team/sport
 */
function createConsolidatedSportsTool() {
  return llm.tool({
    description: `Get live sports scores and results. Works for ANY team or sport:
- NFL: "Eagles score", "Chiefs game"
- MLB: "Phillies score", "Yankees game"  
- NBA: "76ers score", "Lakers game"
- NHL: "Flyers score", "Rangers game"
- Soccer: "Liverpool score", "Barcelona game"
Just ask naturally: "How did the Eagles do?", "Phillies score?", "Did the Sixers win?"`,
    parameters: z.object({
      team: z.string().describe('Team name (e.g., "Eagles", "Phillies", "Lakers", "Liverpool")'),
    }),
    execute: async ({ team }: { team: string }) => {
      const startTime = Date.now();
      console.log(`\n🔧 [TOOL START] getSportsScore("${team}") at ${new Date().toISOString()}`);
      getLogger().info({ team, startTime }, '>>> TOOL: getSportsScore STARTED');
      
      const TIMEOUT_FALLBACK = `I'm having trouble getting the score for the ${team} right now. The sports data might be slow. Want me to try something else?`;
      
      try {
        const result = await withTimeout(getTeamScore(team), 10000, TIMEOUT_FALLBACK);
        const elapsed = Date.now() - startTime;
        console.log(`✅ [TOOL DONE] getSportsScore("${team}") completed in ${elapsed}ms`);
        getLogger().info({ team, elapsed }, '<<< TOOL: getSportsScore COMPLETED');
        return result;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ [TOOL ERROR] getSportsScore("${team}") failed after ${elapsed}ms: ${error}`);
        getLogger().error({ team, elapsed, error }, '<<< TOOL: getSportsScore FAILED');
        return `I had trouble getting scores for the ${team}. Maybe we can try again in a moment?`;
      }
    },
  });
}

/**
 * Consolidated Weather Tool - handles current weather and forecasts
 */
function createConsolidatedWeatherTool() {
  return llm.tool({
    description: `Get weather for any location. Handles:
- Current conditions: "weather in Philadelphia"
- Forecasts: "forecast for Denver", "weekend weather NYC"
- Any city worldwide: "weather Tokyo", "Paris weather"
Just ask naturally: "What's the weather?", "Will it rain tomorrow?", "Weather in Boston?"`,
    parameters: z.object({
      location: z.string().describe('City name (e.g., "Philadelphia", "New York", "London")'),
      forecast: z.boolean().optional().describe('If true, include 5-day forecast'),
    }),
    execute: async ({ location, forecast }: { location: string; forecast?: boolean }) => {
      const startTime = Date.now();
      console.log(`\n🔧 [TOOL START] getWeather("${location}", forecast=${forecast}) at ${new Date().toISOString()}`);
      getLogger().info({ location, forecast, startTime }, '>>> TOOL: getWeather STARTED');
      
      const TIMEOUT_FALLBACK = `I'm having trouble reaching the weather service right now. Give me a moment and I can try again, or we can talk about something else.`;
      
      try {
        let resultPromise: Promise<string>;
        if (forecast) {
          resultPromise = Promise.all([
            getCurrentWeather(location),
            getWeatherForecast(location, 5),
          ]).then(([current, forecastData]) => `${current}\n\n${forecastData}`);
        } else {
          resultPromise = getCurrentWeather(location);
        }
        
        const result = await withTimeout(resultPromise, 10000, TIMEOUT_FALLBACK);
        
        const elapsed = Date.now() - startTime;
        console.log(`✅ [TOOL DONE] getWeather("${location}") completed in ${elapsed}ms`);
        getLogger().info({ location, elapsed }, '<<< TOOL: getWeather COMPLETED');
        return result;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ [TOOL ERROR] getWeather("${location}") failed after ${elapsed}ms: ${error}`);
        getLogger().error({ location, elapsed, error }, '<<< TOOL: getWeather FAILED');
        return `I had trouble getting the weather for ${location}. Want to try again in a moment?`;
      }
    },
  });
}

/**
 * Consolidated Search Tool - handles web search, Wikipedia, definitions
 */
function createConsolidatedSearchTool() {
  return llm.tool({
    description: `Search for information. Handles:
- General questions: "Who is Warren Buffett?"
- Definitions: "What is a 401k?"
- Facts: "When was Vanguard founded?"
- Current info: "What's the S&P 500 all-time high?"
Just ask anything you're curious about.`,
    parameters: z.object({
      query: z.string().describe('What to search for'),
    }),
    execute: async ({ query }: { query: string }) => {
      const startTime = Date.now();
      console.log(`\n🔧 [TOOL START] search("${query}") at ${new Date().toISOString()}`);
      getLogger().info({ query, startTime }, '>>> TOOL: search STARTED');
      
      const TIMEOUT_FALLBACK = `I'm having trouble searching for that right now. Let me share what I know from my own experience instead, or we can try again in a moment.`;
      
      try {
        // Try Wikipedia first for factual questions
        const q = query.toLowerCase();
        let resultPromise: Promise<string>;
        
        if (q.startsWith('who is') || q.startsWith('what is') || q.startsWith('when was') || q.startsWith('define')) {
          resultPromise = searchWikipedia(query).then(wikiResult => {
            if (wikiResult && !wikiResult.includes("couldn't find")) {
              return wikiResult;
            }
            return searchWeb(query);
          }).catch(() => searchWeb(query));
        } else {
          resultPromise = searchWeb(query);
        }
        
        const result = await withTimeout(resultPromise, 10000, TIMEOUT_FALLBACK);
        
        const elapsed = Date.now() - startTime;
        console.log(`✅ [TOOL DONE] search("${query}") completed in ${elapsed}ms`);
        getLogger().info({ query, elapsed }, '<<< TOOL: search COMPLETED');
        return result;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ [TOOL ERROR] search("${query}") failed after ${elapsed}ms: ${error}`);
        getLogger().error({ query, elapsed, error }, '<<< TOOL: search FAILED');
        return `I had trouble searching for that. Want me to share what I know from experience instead?`;
      }
    },
  });
}

export default {
  createAllTools,
  createEssentialTools,
  getToolCategories,
  getToolDocumentation,
};
