/**
 * SPECIALIST_TOOLS: each teammate gets the tools of their own specialty.
 *
 * Handed the call, every specialist got the same ~61-67 tools: the first
 * agent's essential set (or the gateway's Tier 0) cut to 64 by a cap that
 * keeps ~59 generic must-keep tools first, so a specialty domain kept about
 * three tools, and the coaching domains (ceo-coaching, coaching-support,
 * career, health, commitment-tracking) never loaded on a call at all.
 *
 * With the flag on, a specialist's set is SPECIALIST_CORE_TOOLS (safety,
 * memory, the everyday basics) and the teammate tools, plus its own list
 * below, within the 64-tool cap. Ferni and any persona without a list keep
 * today's set. A cohort flag: read on each agent build, never at module load.
 *
 * The finance lists hold education and calculators only. Left out on purpose:
 * every tool that quotes, screens, analyses or tracks a specific security
 * (analyzeStock, findStocks, marketData, analyzeSECFiling, technicalIndicators,
 * riskAnalysis, analyzeOptionsFlow, trackInsiderTrading, the portfolio,
 * watchlist and thesis tools, getDailyFinancialBriefing, predictBehavior) and
 * bridgeMacroToPersonal ("what should YOU do"): personalized advice about
 * securities is investment-adviser territory, and being free is no exemption
 * (coaching research 2026-10-20, DOMAIN-COACHES.md section 3).
 *
 * @module agents/multi-agent/specialist-tool-sets
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { ToolDomain } from '../../tools/registry/types.js';

export function specialistToolsEnabled(env: Env = process.env): boolean {
  return flagOn('SPECIALIST_TOOLS', env);
}

type ToolsByName = Readonly<Record<string, ToolDomain>>;

/**
 * Kept for every specialist, before any specialty tool: crisis and human
 * transfer, grounding, memory, and the music, timers, alarms, reminders and
 * weather every teammate is told they can do (shared-capabilities.md).
 */
export const SPECIALIST_CORE_TOOLS: ToolsByName = {
  provideCrisisResources: 'crisis',
  quickCrisisResources: 'human-transfer',
  createSafetyPlan: 'crisis',
  deEscalateAnxiety: 'crisis',
  evaluateHumanTransfer: 'human-transfer',
  connectToHumanExpert: 'human-transfer',
  groundingExercise: 'presence',
  breatheWithMe: 'presence',
  groundingForTrauma: 'trauma-support',
  rememberAboutUser: 'memory',
  recallFromMemory: 'memory',
  recallPreviousConversation: 'memory',
  rememberImportantFact: 'memory',
  surfaceRelevantMemory: 'memory',
  getCurrentContext: 'awareness',
  playMusic: 'entertainment',
  musicControl: 'entertainment',
  quickTimer: 'simple-utilities',
  quickAlarm: 'simple-utilities',
  setReminder: 'productivity',
  getWeather: 'information',
};

/** Not built here, but kept when the call has them: hang-up, findTools, the call journal. */
export const SPECIALIST_KEEP_IF_PRESENT: readonly string[] = [
  'endCall',
  'findTools',
  'journal',
  'addGratitude',
];

/** Index-fund and money-education calculators, shared by the finance teammates. */
const MONEY_EDUCATION: ToolsByName = {
  financeEducation: 'finance',
  explainConcept: 'research',
  investmentCalc: 'finance',
  savingsCalc: 'finance',
  debtPayoff: 'finance',
  budgetPlanner: 'finance',
  housingCalc: 'finance',
  calculateFIRE: 'research',
  retirementReadiness: 'research',
  analyzeSavingsRate: 'research',
  getCrashPerspective: 'wisdom',
  getWisdomQuote: 'wisdom',
  emotionalSupport: 'wellness',
};

/** Each specialist's own tools, by canonical persona id. */
export const SPECIALIST_TOOL_SETS: Readonly<Record<string, ToolsByName>> = {
  // Behaviour-change and habit coach, health and wellness, everyday money habits
  'maya-santos': {
    implementationIntention: 'habits',
    createHabit: 'habits',
    logHabitCompletion: 'habits',
    getHabits: 'habits',
    habitCheckIn: 'habits',
    gentleAccountability: 'habits',
    mapFriction: 'habits',
    compassionateReset: 'habits',
    celebrateTinyWin: 'habits',
    weeklyHabitReview: 'habits',
    habitStrategy: 'habits',
    habitSetback: 'habits',
    behaviorArchitecture: 'habits',
    logExercise: 'health',
    analyzeSleepPattern: 'health',
    suggestSleepHygiene: 'health',
    coachOnNutrition: 'health',
    budgetPlanner: 'finance',
    debtPayoff: 'finance',
    savingsCalc: 'finance',
    bankData: 'finance',
  },
  // Chief of staff, executive coach and communication coach
  'alex-chen': {
    addTask: 'productivity',
    getTasks: 'productivity',
    completeTask: 'productivity',
    recordCommitment: 'productivity',
    getCommitments: 'productivity',
    completeCommitment: 'productivity',
    getReminders: 'productivity',
    getCalendarToday: 'calendar',
    getCalendarWeek: 'calendar',
    createCalendarEvent: 'calendar',
    getPreMeetingBriefing: 'calendar',
    detectCalendarIssues: 'calendar',
    getNotes: 'productivity',
    manageGoal: 'life-planning',
    goalsSummary: 'life-planning',
    managePriorities: 'ceo-coaching',
    getMorningBriefing: 'ceo-coaching',
    focusSession: 'ceo-coaching',
    trackWin: 'ceo-coaching',
    draftMessage: 'communication',
    prepareHardConversation: 'difficult-conversations',
  },
  // Career coach and life planning
  'jordan-taylor': {
    clarifyCareerGoals: 'career',
    practiceInterview: 'career',
    prepareSTARStories: 'career',
    researchSalary: 'career',
    rolePlayNegotiation: 'career',
    planCareerTransition: 'career',
    suggestJobSearchStrategy: 'career',
    trackJobApplication: 'career',
    assessCareerSatisfaction: 'career',
    exploreGrowthAreas: 'career',
    createLearningPath: 'career',
    manageGoal: 'life-planning',
    goalsSummary: 'life-planning',
    annualPlan: 'life-planning',
    manageMilestone: 'life-planning',
    planMove: 'home',
    planFamilyMeeting: 'family',
    organizeDocuments: 'legal-admin',
    reminderAnnualTasks: 'legal-admin',
  },
  // Meaning, grief, presence and wisdom
  'nayan-patel': {
    clarifyValues: 'meaning',
    explorePurpose: 'meaning',
    sitWithBigQuestion: 'meaning',
    createPersonalMission: 'meaning',
    spiritualPracticeSupport: 'meaning',
    companionInGrief: 'grief',
    processGrief: 'grief',
    validateGrief: 'grief',
    navigateGriefWave: 'grief',
    anniversarySupport: 'grief',
    noticeThisMoment: 'presence',
    protectPresence: 'presence',
    assessMindfulness: 'contemplative-practice',
    recordContemplativePractice: 'contemplative-practice',
    getDefusionTechnique: 'contemplative-practice',
    holdParadox: 'wisdom',
    mortalityPerspective: 'wisdom',
    trackEnough: 'wisdom',
  },
  // Research and pattern analysis; money education without picks
  'peter-john': {
    synthesizeResearch: 'research',
    verifyClaim: 'research',
    scoreEvidenceQuality: 'research',
    getBaseRate: 'research',
    findCounterArguments: 'research',
    detectConfounds: 'research',
    designExperiment: 'research',
    analyzeExperiment: 'research',
    analyzeSleepCorrelations: 'research',
    analyzeDecisionQuality: 'research',
    backgroundResearch: 'research',
    trackHypothesis: 'research',
    discoverPattern: 'pattern-mastery',
    crossDomainConnection: 'pattern-mastery',
    explainConcept: 'research',
    analyzeSavingsRate: 'research',
    investmentCalc: 'finance',
    savingsCalc: 'finance',
    debtPayoff: 'finance',
    budgetPlanner: 'finance',
  },
  'peter-lynch': MONEY_EDUCATION,
  'john-bogle': MONEY_EDUCATION,
  'joel-dickson': MONEY_EDUCATION,
};
