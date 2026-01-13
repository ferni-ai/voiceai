/**
 * Tool Categories and Documentation
 *
 * Provides categorization and documentation for all available tools.
 * Useful for debugging, documentation, and tool discovery.
 */
// ============================================================================
// TOOL CATEGORIES
// ============================================================================
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
        // search: removed - using Gemini's built-in Google Search instead
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
        communication: ['sendEmail', 'sendSMS', 'scheduleReminder', 'scheduleEvent'],
        // Agent
        handoff: ['handoffToPeter', 'handoffToJack'],
        telephony: ['callUser', 'scheduleCallback'],
        peterLynch: [
            'analyzeStock',
            'findStockCategory',
            'calculatePEGRatio',
            'findTenBaggers',
            'explainStockCategory',
        ],
        peterInsights: [
            'synthesizeInsights',
            'spotAnomalies',
            'findCorrelation',
            'projectTrends',
            'detectBehavioralBias',
            'generateInsightsDashboard',
            'runProactiveInsightScan',
            'logPatternObservation',
            'findTheLever',
            'createInsightBriefing',
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
            'transferMusic',
            'tellMeAboutThisMusic',
            'playPreview',
            'pauseCallMusic',
            'resumeCallMusic',
            'stopCallMusic',
            'setCallMusicVolume',
            'getMusicStatus',
        ],
        // Daily Productivity
        tasks: [
            'addTask',
            'completeTask',
            'getTasks',
            'updateTaskPriority',
            'rescheduleTask',
            'deleteTask',
            'getTaskSummary',
        ],
        bills: [
            'addBill',
            'payBill',
            'getUpcomingBills',
            'getAllBills',
            'updateBill',
            'removeBill',
            'getBillSummary',
        ],
        routines: [
            'createRoutine',
            'startRoutine',
            'routineStepDone',
            'skipRoutineStep',
            'getRoutineProgress',
            'listRoutines',
        ],
        notes: [
            'saveNote',
            'getRecentNotes',
            'searchNotes',
            'startJournal',
            'addGratitude',
            'recordMood',
            'completeJournal',
            'getJournalHistory',
            'getJournalPrompt',
        ],
        habits: [
            'addHabit',
            'logHabit',
            'getDueHabits',
            'getHabitStats',
            'getAllHabits',
            'removeHabit',
            'habitCheckIn',
        ],
        shopping: [
            'addToShoppingList',
            'getShoppingList',
            'checkOffItem',
            'removeFromList',
            'clearCheckedItems',
            'clearShoppingList',
            'getListSummary',
            'quickAdd',
        ],
        medications: [
            'addMedication',
            'takeMedication',
            'skipMedication',
            'getMedicationSchedule',
            'getAllMedications',
            'updatePillCount',
            'stopMedication',
            'medicationCheckIn',
        ],
        dailyBriefing: [
            'getMorningBriefing',
            'getEveningReflection',
            'getQuickStatus',
            'getWeeklyReview',
            'getMotivation',
        ],
        packages: [
            'trackPackage',
            'getPackages',
            'checkPackageStatus',
            'markPackageDelivered',
            'removePackage',
            'getDeliveryExpectations',
        ],
        travel: [
            'searchFlights',
            'searchHotels',
            'planTrip',
            'getSavedTrips',
            'getTripSuggestions',
            'getFlightPrice',
        ],
    };
}
// ============================================================================
// TOOL DOCUMENTATION
// ============================================================================
/**
 * Get tool documentation
 */
export function getToolDocumentation() {
    const categories = getToolCategories();
    const sections = ['# John Bogle Voice AI - Tool Reference', '', '## Financial Domain', ''];
    // Financial
    const financialCategories = ['marketData', 'economic', 'calculators', 'personalFinance'];
    for (const cat of financialCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Information Domain', '');
    // Information
    const infoCategories = ['news', 'sports', 'weather', 'search', 'wisdom'];
    for (const cat of infoCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Human Connection Domain', '');
    // Human Connection
    const humanCategories = ['lifeEvents', 'wellness', 'smallTalk'];
    for (const cat of humanCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Conversation Domain', '');
    // Conversation
    const convCategories = ['conversation', 'memory', 'proactive', 'awareness'];
    for (const cat of convCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Banking Domain', '');
    // Banking (Plaid)
    const bankingCategories = ['plaid'];
    for (const cat of bankingCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Communication Domain', '');
    // Communication
    const commCategories = ['communication'];
    for (const cat of commCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Agent Domain', '');
    // Agent
    const agentCategories = ['handoff', 'telephony', 'peterLynch'];
    for (const cat of agentCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Entertainment Domain', '');
    // Entertainment
    const entertainmentCategories = ['spotify'];
    for (const cat of entertainmentCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    sections.push('## Daily Productivity Domain', '');
    // Daily Productivity
    const productivityCategories = [
        'tasks',
        'bills',
        'routines',
        'notes',
        'habits',
        'shopping',
        'medications',
        'dailyBriefing',
        'packages',
        'travel',
    ];
    for (const cat of productivityCategories) {
        const tools = categories[cat];
        sections.push(`### ${cat} (${tools.length})`);
        sections.push(tools.map((t) => `- ${t}`).join('\n'));
        sections.push('');
    }
    const totalTools = Object.values(categories).flat().length;
    sections.push(`---`);
    sections.push(`Total: ${totalTools} tools across ${Object.keys(categories).length} domains`);
    return sections.join('\n');
}
//# sourceMappingURL=categories.js.map