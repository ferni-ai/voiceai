/**
 * Productivity & Life Management Mappings
 *
 * Productivity/Lists, Communication/Contacts, SMS, Memory/Voice Memos,
 * Handoff/Navigation, Telephony, Habits/Routines, Crisis/Safety,
 * Grief, Dreams, Decisions, Burnout, Career, Finance, Family.
 *
 * @module tools/semantic-router/domain-bridge/mappings-productivity
 */

import type { ToolMapping } from './types.js';

export const PRODUCTIVITY_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // 📋 PRODUCTIVITY & LISTS (15 tools)
  // ==========================================================================
  productivity_create_task: {
    domainToolId: 'createTask',
    transformArgs: (args) => ({
      title: args.title || args.task,
      dueDate: args.dueDate,
      priority: args.priority,
    }),
  },
  productivity_list_tasks: { domainToolId: 'getTasks' },
  productivity_complete_task: {
    domainToolId: 'completeTask',
    transformArgs: (args) => ({ taskId: args.taskId || args.id }),
  },
  productivity_notes: {
    domainToolId: 'createNote',
    transformArgs: (args) => ({ title: args.title, content: args.content }),
  },
  productivity_get_notes: { domainToolId: 'getNotes' },
  productivity_shopping_list: {
    domainToolId: 'addToShoppingList',
    transformArgs: (args) => ({ items: args.items || [args.item] }),
  },
  productivity_get_shopping: { domainToolId: 'getShoppingList' },
  productivity_focus: {
    domainToolId: 'startFocusSession',
    transformArgs: (args) => ({ duration: args.duration ?? 25, mode: args.mode }),
  },
  productivity_pomodoro: {
    domainToolId: 'startPomodoro',
    transformArgs: (args) => ({ taskName: args.task }),
  },
  productivity_daily: { domainToolId: 'getDailyBriefing' },
  productivity_plan_day: { domainToolId: 'planDay' },
  productivity_morning_routine: {
    domainToolId: 'startMorningRoutine',
    transformArgs: (args) => ({ routineId: args.routineId }),
  },
  productivity_evening_routine: {
    domainToolId: 'startEveningRoutine',
    transformArgs: (args) => ({ routineId: args.routineId }),
  },
  productivity_habit_check: {
    domainToolId: 'checkHabit',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  productivity_habit_streak: {
    domainToolId: 'getHabitStreak',
    transformArgs: (args) => ({ habit: args.habit }),
  },

  // ==========================================================================
  // 💬 COMMUNICATION & CONTACTS (10 tools)
  // ==========================================================================
  communication_send_text: {
    domainToolId: 'sendText',
    transformArgs: (args) => ({ to: args.to, message: args.message }),
  },
  communication_read_texts: { domainToolId: 'getRecentTexts' },
  communication_send_email: {
    domainToolId: 'sendEmail',
    transformArgs: (args) => ({ to: args.to, subject: args.subject, body: args.body }),
  },
  communication_read_email: {
    domainToolId: 'getEmails',
    transformArgs: (args) => ({ filter: args.filter }),
  },
  communication_contacts: {
    domainToolId: 'searchContacts',
    transformArgs: (args) => ({ query: args.query }),
  },
  communication_add_contact: {
    domainToolId: 'addContact',
    transformArgs: (args) => ({ name: args.name, phone: args.phone, email: args.email }),
  },
  communication_voicemail: { domainToolId: 'getVoicemail' },
  communication_check_in: {
    domainToolId: 'checkInOnSomeone',
    transformArgs: (args) => ({ contact: args.contact }),
  },
  communication_group_text: {
    domainToolId: 'sendGroupText',
    transformArgs: (args) => ({ group: args.group, message: args.message }),
  },
  communication_social: { domainToolId: 'getSocialNotifications' },

  // ==========================================================================
  // 📱 SMS & MESSAGING (4 tools)
  // ==========================================================================
  sms_send: {
    domainToolId: 'sendSMS',
    transformArgs: (args) => ({ to: args.to, body: args.body }),
  },
  sms_read: { domainToolId: 'readSMS', transformArgs: (args) => ({ from: args.from }) },
  sms_reply: {
    domainToolId: 'replySMS',
    transformArgs: (args) => ({ threadId: args.threadId, body: args.body }),
  },
  sms_summary: { domainToolId: 'summarizeSMS' },

  // ==========================================================================
  // 🧠 MEMORY & VOICE MEMOS (6 tools)
  // ==========================================================================
  memory_save: {
    domainToolId: 'saveMemory',
    transformArgs: (args) => ({ content: args.content, tags: args.tags }),
  },
  memory_recall: {
    domainToolId: 'recallMemory',
    transformArgs: (args) => ({ query: args.query }),
  },
  memory_voice_memo: {
    domainToolId: 'createVoiceMemo',
    transformArgs: (args) => ({ content: args.content }),
  },
  memory_get_memos: { domainToolId: 'getVoiceMemos' },
  memory_remember_person: {
    domainToolId: 'rememberAboutPerson',
    transformArgs: (args) => ({ person: args.person, fact: args.fact }),
  },
  memory_recall_person: {
    domainToolId: 'recallAboutPerson',
    transformArgs: (args) => ({ person: args.person }),
  },

  // ==========================================================================
  // 🔄 HANDOFF & NAVIGATION (4 tools)
  // ==========================================================================
  handoff_to_persona: {
    domainToolId: 'handoff',
    transformArgs: (args) => ({ targetPersona: args.persona, reason: args.reason }),
  },
  navigation_home: { domainToolId: 'goHome' },
  navigation_settings: { domainToolId: 'openSettings' },
  navigation_help: { domainToolId: 'showHelp' },

  // ==========================================================================
  // 📞 TELEPHONY (6 tools)
  // ==========================================================================
  telephony_call: {
    domainToolId: 'makeCall',
    transformArgs: (args) => ({ contact: args.contact || args.number }),
  },
  telephony_end_call: { domainToolId: 'endCall' },
  telephony_hold: { domainToolId: 'holdCall' },
  telephony_transfer: {
    domainToolId: 'transferCall',
    transformArgs: (args) => ({ to: args.to }),
  },
  telephony_callback: {
    domainToolId: 'scheduleCallback',
    transformArgs: (args) => ({ contact: args.contact, time: args.time }),
  },
  telephony_volume: {
    domainToolId: 'adjustCallVolume',
    transformArgs: (args) => ({ volume: args.volume }),
  },

  // ==========================================================================
  // 🔄 HABITS & ROUTINES (8 tools)
  // ==========================================================================
  habits_create: {
    domainToolId: 'createHabit',
    transformArgs: (args) => ({ name: args.name, frequency: args.frequency }),
  },
  habits_list: { domainToolId: 'getHabits' },
  habits_check: {
    domainToolId: 'checkHabit',
    transformArgs: (args) => ({ habitId: args.habitId || args.habit }),
  },
  habits_stats: {
    domainToolId: 'getHabitStats',
    transformArgs: (args) => ({ habitId: args.habitId }),
  },
  habits_streak: {
    domainToolId: 'getHabitStreak',
    transformArgs: (args) => ({ habitId: args.habitId }),
  },
  habits_coaching: {
    domainToolId: 'habitCoaching',
    transformArgs: (args) => ({ area: args.area }),
  },
  habits_gamification: { domainToolId: 'getGamificationStatus' },
  habits_delete: {
    domainToolId: 'deleteHabit',
    transformArgs: (args) => ({ habitId: args.habitId }),
  },

  // ==========================================================================
  // 🆘 CRISIS & SAFETY (6 tools)
  // ==========================================================================
  crisis_detect: {
    domainToolId: 'detectCrisis',
    transformArgs: (args) => ({ text: args.text }),
  },
  crisis_resources: { domainToolId: 'getCrisisResources' },
  crisis_safety_plan: { domainToolId: 'getSafetyPlan' },
  crisis_grounding: {
    domainToolId: 'crisisGrounding',
    transformArgs: (args) => ({ intensity: args.intensity }),
  },
  crisis_check_in: { domainToolId: 'crisisCheckIn' },
  crisis_professional: {
    domainToolId: 'findProfessionalHelp',
    transformArgs: (args) => ({ need: args.need, location: args.location }),
  },

  // ==========================================================================
  // 💐 GRIEF (7 tools)
  // ==========================================================================
  grief_support: {
    domainToolId: 'griefSupport',
    transformArgs: (args) => ({ lossType: args.lossType }),
  },
  grief_wave: {
    domainToolId: 'navigateGriefWave',
    transformArgs: (args) => ({ intensity: args.intensity }),
  },
  grief_memorial: {
    domainToolId: 'createMemorial',
    transformArgs: (args) => ({ person: args.person }),
  },
  grief_dates: {
    domainToolId: 'trackSignificantDates',
    transformArgs: (args) => ({ date: args.date, significance: args.significance }),
  },
  grief_continuing_bonds: {
    domainToolId: 'continuingBonds',
    transformArgs: (args) => ({ person: args.person }),
  },
  grief_rituals: {
    domainToolId: 'suggestGriefRituals',
    transformArgs: (args) => ({ lossType: args.lossType }),
  },
  grief_types: {
    domainToolId: 'exploreGriefTypes',
    transformArgs: (args) => ({ type: args.type }),
  },

  // ==========================================================================
  // 💭 DREAMS & ASPIRATIONS (4 tools)
  // ==========================================================================
  dreams_capture: {
    domainToolId: 'captureDream',
    transformArgs: (args) => ({ dream: args.dream }),
  },
  dreams_explore: {
    domainToolId: 'exploreDream',
    transformArgs: (args) => ({ dream: args.dream }),
  },
  dreams_bucket_list: {
    domainToolId: 'manageBucketList',
    transformArgs: (args) => ({ action: args.action, item: args.item }),
  },
  dreams_vision_board: {
    domainToolId: 'createVisionBoard',
    transformArgs: (args) => ({ theme: args.theme }),
  },

  // ==========================================================================
  // ⚖️ DECISIONS (6 tools)
  // ==========================================================================
  decisions_framework: {
    domainToolId: 'getDecisionFramework',
    transformArgs: (args) => ({ type: args.type }),
  },
  decisions_pros_cons: {
    domainToolId: 'createProsCons',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decisions_values_align: {
    domainToolId: 'alignDecisionWithValues',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decisions_gut_check: {
    domainToolId: 'decisionGutCheck',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decisions_regret_minimize: {
    domainToolId: 'regretMinimization',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decisions_10_10_10: {
    domainToolId: 'tenTenTen',
    transformArgs: (args) => ({ decision: args.decision }),
  },

  // ==========================================================================
  // 🔥 BURNOUT (4 tools)
  // ==========================================================================
  burnout_assess: { domainToolId: 'assessBurnout' },
  burnout_recover: {
    domainToolId: 'burnoutRecovery',
    transformArgs: (args) => ({ severity: args.severity }),
  },
  burnout_boundaries: {
    domainToolId: 'setBurnoutBoundaries',
    transformArgs: (args) => ({ area: args.area }),
  },
  burnout_energy: { domainToolId: 'energyManagement' },

  // ==========================================================================
  // 💼 CAREER (6 tools)
  // ==========================================================================
  career_explore: {
    domainToolId: 'exploreCareerPath',
    transformArgs: (args) => ({ interests: args.interests }),
  },
  career_resume: {
    domainToolId: 'reviewResume',
    transformArgs: (args) => ({ resume: args.resume }),
  },
  career_interview: {
    domainToolId: 'practiceInterview',
    transformArgs: (args) => ({ role: args.role, type: args.type }),
  },
  career_skills: {
    domainToolId: 'assessSkillGaps',
    transformArgs: (args) => ({ targetRole: args.targetRole }),
  },
  career_networking: {
    domainToolId: 'networkingAdvice',
    transformArgs: (args) => ({ context: args.context }),
  },
  career_growth: {
    domainToolId: 'exploreGrowthAreas',
    transformArgs: (args) => ({ currentRole: args.currentRole }),
  },

  // ==========================================================================
  // 💰 FINANCE (8 tools)
  // ==========================================================================
  finance_budget: {
    domainToolId: 'createBudget',
    transformArgs: (args) => ({ income: args.income }),
  },
  finance_bills: { domainToolId: 'getUpcomingBills' },
  finance_savings: {
    domainToolId: 'savingsGoal',
    transformArgs: (args) => ({ goal: args.goal, amount: args.amount }),
  },
  finance_spending: {
    domainToolId: 'analyzeSpending',
    transformArgs: (args) => ({ period: args.period }),
  },
  finance_debt: {
    domainToolId: 'debtPayoffPlan',
    transformArgs: (args) => ({ debts: args.debts }),
  },
  finance_investing: {
    domainToolId: 'investingBasics',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  finance_retirement: {
    domainToolId: 'retirementPlanning',
    transformArgs: (args) => ({ age: args.age }),
  },
  finance_emergency: {
    domainToolId: 'emergencyFundPlan',
    transformArgs: (args) => ({ monthlyExpenses: args.monthlyExpenses }),
  },

  // ==========================================================================
  // 👨‍👩‍👧‍👦 FAMILY (6 tools)
  // ==========================================================================
  family_parenting: {
    domainToolId: 'parentingAdvice',
    transformArgs: (args) => ({ topic: args.topic, childAge: args.childAge }),
  },
  family_date_night: {
    domainToolId: 'suggestDateNight',
    transformArgs: (args) => ({ budget: args.budget, interests: args.interests }),
  },
  family_activity: {
    domainToolId: 'suggestFamilyActivity',
    transformArgs: (args) => ({ ages: args.ages }),
  },
  family_conversation: {
    domainToolId: 'familyConversationStarter',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  family_transition: {
    domainToolId: 'supportFamilyTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  family_conflict: {
    domainToolId: 'navigateFamilyConflict',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
};
