/**
 * Tool Chain Definitions
 *
 * Predefined tool chains for common conversation patterns.
 * Each chain defines a primary tool and its logical successors,
 * enabling natural conversation flow between tools.
 */

import type { ToolChain } from './composer-types.js';

// ============================================================================
// TOOL CHAINS
// ============================================================================

/**
 * Predefined tool chains for common conversation patterns
 */
export const TOOL_CHAINS: Record<string, ToolChain> = {
  // ========================================================================
  // MEMORY DOMAIN
  // ========================================================================
  rememberAboutUser: {
    primary: 'rememberAboutUser',
    suggestedFollowers: ['checkIn', 'setGoal', 'suggestRelevantTopic'],
    contextKeys: ['fact', 'category'],
    typicalEmotion: 'empathetic',
  },
  recallFromMemory: {
    primary: 'recallFromMemory',
    suggestedFollowers: ['circleBack', 'shareStory', 'checkGoalProgress'],
    contextKeys: ['topic', 'recalledInfo'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // CAREER DOMAIN - Job Search Journey
  // ========================================================================
  clarifyCareerGoals: {
    primary: 'clarifyCareerGoals',
    suggestedFollowers: ['exploreGrowthAreas', 'createLearningPath', 'assessCareerSatisfaction'],
    contextKeys: ['timeHorizon', 'clarity', 'values'],
    typicalEmotion: 'empathetic',
  },
  exploreGrowthAreas: {
    primary: 'exploreGrowthAreas',
    suggestedFollowers: ['createLearningPath', 'trackJobApplication', 'expandNetwork'],
    contextKeys: ['currentRole', 'targetRole', 'gaps'],
    typicalEmotion: 'neutral',
  },
  trackJobApplication: {
    primary: 'trackJobApplication',
    suggestedFollowers: ['practiceInterview', 'prepareSTARStories', 'researchSalary'],
    contextKeys: ['company', 'role', 'status'],
    typicalEmotion: 'neutral',
  },
  practiceInterview: {
    primary: 'practiceInterview',
    suggestedFollowers: ['prepareSTARStories', 'trackJobApplication', 'rolePlayNegotiation'],
    contextKeys: ['interviewType', 'role', 'feedback'],
    typicalEmotion: 'empathetic',
  },
  // assessBurnout defined in BURNOUT RECOVERY DOMAIN section below
  researchSalary: {
    primary: 'researchSalary',
    suggestedFollowers: ['rolePlayNegotiation', 'trackJobApplication'],
    contextKeys: ['role', 'range', 'target'],
    typicalEmotion: 'neutral',
  },
  rolePlayNegotiation: {
    primary: 'rolePlayNegotiation',
    suggestedFollowers: ['trackJobApplication', 'celebrateMilestone'],
    contextKeys: ['scenario', 'offer', 'target'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // GRIEF DOMAIN - Support Journey
  // ========================================================================
  processGrief: {
    primary: 'processGrief',
    suggestedFollowers: ['navigateGriefWave', 'companionInGrief', 'rememberLoved'],
    contextKeys: ['lossType', 'whereTheyAre', 'whatWasLost'],
    typicalEmotion: 'empathetic',
  },
  navigateGriefWave: {
    primary: 'navigateGriefWave',
    suggestedFollowers: ['companionInGrief', 'validateGrief', 'processGrief'],
    contextKeys: ['intensity', 'trigger'],
    typicalEmotion: 'empathetic',
  },
  acknowledgeLoss: {
    primary: 'acknowledgeLoss',
    suggestedFollowers: ['validateGrief', 'companionInGrief', 'rememberLoved'],
    contextKeys: ['loss', 'recognized'],
    typicalEmotion: 'empathetic',
  },
  navigateTransition: {
    primary: 'navigateTransition',
    suggestedFollowers: ['processEnding', 'embraceNewIdentity', 'companionInGrief'],
    contextKeys: ['transition', 'stage'],
    typicalEmotion: 'empathetic',
  },
  anniversarySupport: {
    primary: 'anniversarySupport',
    suggestedFollowers: ['rememberLoved', 'companionInGrief', 'processGrief'],
    contextKeys: ['occasion', 'howLongAgo'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // CRISIS DOMAIN - Safety Journey
  // ========================================================================
  assessCrisis: {
    primary: 'assessCrisis',
    suggestedFollowers: ['groundingExercise', 'createSafetyPlan', 'findCrisisResources'],
    contextKeys: ['severity', 'type', 'immediate'],
    typicalEmotion: 'concerned',
  },
  groundingExercise: {
    primary: 'groundingExercise',
    suggestedFollowers: ['checkIn', 'companionInGrief', 'createSafetyPlan'],
    contextKeys: ['technique', 'effectiveness'],
    typicalEmotion: 'empathetic',
  },
  createSafetyPlan: {
    primary: 'createSafetyPlan',
    suggestedFollowers: ['findCrisisResources', 'scheduleFollowUp', 'rememberAboutUser'],
    contextKeys: ['triggers', 'copingStrategies', 'contacts'],
    typicalEmotion: 'concerned',
  },

  // ========================================================================
  // ENGAGEMENT DOMAIN - Daily Rituals
  // ========================================================================
  morningSkyCheck: {
    primary: 'morningSkyCheck',
    suggestedFollowers: ['questionOfTheWeek', 'streakTracker', 'teamHuddle'],
    contextKeys: ['mood', 'energy'],
    typicalEmotion: 'empathetic',
  },
  streakTracker: {
    primary: 'streakTracker',
    suggestedFollowers: ['celebrationMoment', 'quickChallenges', 'awardBadge'],
    contextKeys: ['streak', 'domain'],
    typicalEmotion: 'happy',
  },
  celebrationMoment: {
    primary: 'celebrationMoment',
    suggestedFollowers: ['streakTracker', 'reflectionPrompts', 'teamHuddle'],
    contextKeys: ['achievement', 'celebrationType'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // DECISIONS DOMAIN
  // ========================================================================
  helpMeDecide: {
    primary: 'helpMeDecide',
    suggestedFollowers: ['questionBeneath', 'clarifyCareerGoals', 'rememberAboutUser'],
    contextKeys: ['decision', 'options', 'choice'],
    typicalEmotion: 'neutral',
  },
  questionBeneath: {
    primary: 'questionBeneath',
    suggestedFollowers: ['helpMeDecide', 'clarifyCareerGoals', 'processGrief'],
    contextKeys: ['surfaceQuestion', 'deeperQuestion'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // SIMPLE UTILITIES - Quick Help
  // ========================================================================
  setTimer: {
    primary: 'setTimer',
    suggestedFollowers: ['quickNote', 'checkTimerStatus'],
    contextKeys: ['duration', 'label'],
    typicalEmotion: 'neutral',
  },
  calculateTip: {
    primary: 'calculateTip',
    suggestedFollowers: ['splitBill', 'quickNote'],
    contextKeys: ['amount', 'tip'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // HEALTH DOMAIN
  // ========================================================================
  trackExercise: {
    primary: 'trackExercise',
    suggestedFollowers: ['logHabit', 'streakTracker', 'celebrationMoment'],
    contextKeys: ['activity', 'duration', 'intensity'],
    typicalEmotion: 'happy',
  },
  assessSleepQuality: {
    primary: 'assessSleepQuality',
    suggestedFollowers: ['setGoal', 'logHabit', 'assessBurnout'],
    contextKeys: ['quality', 'hours', 'issues'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // RELATIONSHIPS DOMAIN
  // ========================================================================
  prepareConversation: {
    primary: 'prepareConversation',
    suggestedFollowers: ['practiceConversation', 'draftDifficultMessage', 'rememberAboutUser'],
    contextKeys: ['topic', 'person', 'goal'],
    typicalEmotion: 'empathetic',
  },
  navigateConflict: {
    primary: 'navigateConflict',
    suggestedFollowers: ['prepareConversation', 'validateGrief', 'companionInGrief'],
    contextKeys: ['conflict', 'parties', 'needs'],
    typicalEmotion: 'empathetic',
  },

  // Goal tools chain naturally
  setGoal: {
    primary: 'setGoal',
    suggestedFollowers: ['rememberAboutUser', 'scheduleFollowUp', 'awardXP'],
    contextKeys: ['goalName', 'targetAmount', 'targetDate'],
    typicalEmotion: 'excited',
  },
  checkGoalProgress: {
    primary: 'checkGoalProgress',
    suggestedFollowers: ['provideEncouragement', 'awardBadge', 'suggestCheckIn'],
    contextKeys: ['goalName', 'progress', 'isOnTrack'],
    typicalEmotion: 'happy',
  },

  // Emotional support flows
  noteEmotionalState: {
    primary: 'noteEmotionalState',
    suggestedFollowers: ['checkIn', 'practiceGratitude', 'addressFinancialAnxiety'],
    contextKeys: ['state', 'context'],
    typicalEmotion: 'empathetic',
  },
  addressFinancialAnxiety: {
    primary: 'addressFinancialAnxiety',
    suggestedFollowers: ['reframeMoneyBelief', 'shareStory', 'wrapUp'],
    contextKeys: ['anxietyType', 'severity'],
    typicalEmotion: 'concerned',
  },

  // Habit tracking flows
  logHabit: {
    primary: 'logHabit',
    suggestedFollowers: ['awardXP', 'checkStreakMilestone', 'suggestNextHabit'],
    contextKeys: ['habitName', 'streak', 'completed'],
    typicalEmotion: 'celebratory',
  },
  getHabitStats: {
    primary: 'getHabitStats',
    suggestedFollowers: ['provideEncouragement', 'setGoal', 'logHabit'],
    contextKeys: ['habitName', 'streak', 'completionRate'],
    typicalEmotion: 'neutral',
  },

  // Financial tools
  analyzeSpending: {
    primary: 'analyzeSpending',
    suggestedFollowers: ['findSpendingLeaks', 'rememberMerchant', 'setGoal'],
    contextKeys: ['topCategories', 'totalSpend', 'trends'],
    typicalEmotion: 'neutral',
  },
  checkFinancialHealth: {
    primary: 'checkFinancialHealth',
    suggestedFollowers: ['setGoal', 'addressFinancialAnxiety', 'celebrateMilestone'],
    contextKeys: ['healthScore', 'recommendations'],
    typicalEmotion: 'empathetic',
  },

  // Communication tools
  draftDifficultMessage: {
    primary: 'draftDifficultMessage',
    suggestedFollowers: ['practiceConversation', 'sendEmail', 'setReminder'],
    contextKeys: ['conversationType', 'recipient', 'draft'],
    typicalEmotion: 'concerned',
  },
  sendEmail: {
    primary: 'sendEmail',
    suggestedFollowers: ['scheduleFollowUp', 'noteInterest', 'checkIn'],
    contextKeys: ['to', 'subject', 'sent'],
    typicalEmotion: 'happy',
  },

  // Celebration & achievements
  celebrateMilestone: {
    primary: 'celebrateMilestone',
    suggestedFollowers: ['awardBadge', 'shareStory', 'setGoal'],
    contextKeys: ['milestone', 'achievement'],
    typicalEmotion: 'celebratory',
  },
  awardBadge: {
    primary: 'awardBadge',
    suggestedFollowers: ['viewBadgeCollection', 'setGoal', 'wrapUp'],
    contextKeys: ['badgeName', 'rarity'],
    typicalEmotion: 'celebratory',
  },

  // Wrap up
  wrapUp: {
    primary: 'wrapUp',
    suggestedFollowers: [],
    contextKeys: ['sentiment'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // BOUNDARIES DOMAIN - Healthy Limits Journey
  // ========================================================================
  identifyBoundaryNeeds: {
    primary: 'identifyBoundaryNeeds',
    suggestedFollowers: ['setBoundary', 'practiceBoundaryScript', 'maintainBoundary'],
    contextKeys: ['situation', 'personType', 'feelingDrained'],
    typicalEmotion: 'empathetic',
  },
  setBoundary: {
    primary: 'setBoundary',
    suggestedFollowers: ['practiceBoundaryScript', 'handleBoundaryPushback', 'maintainBoundary'],
    contextKeys: ['boundaryType', 'personType', 'boundary'],
    typicalEmotion: 'empathetic',
  },
  practiceBoundaryScript: {
    primary: 'practiceBoundaryScript',
    suggestedFollowers: ['handleBoundaryPushback', 'setBoundary', 'reflectOnBoundaryGrowth'],
    contextKeys: ['personType', 'script', 'practiced'],
    typicalEmotion: 'neutral',
  },
  handleBoundaryPushback: {
    primary: 'handleBoundaryPushback',
    suggestedFollowers: ['maintainBoundary', 'practiceBoundaryScript', 'setBoundary'],
    contextKeys: ['pushbackType', 'response'],
    typicalEmotion: 'concerned',
  },
  maintainBoundary: {
    primary: 'maintainBoundary',
    suggestedFollowers: ['reflectOnBoundaryGrowth', 'identifyBoundaryNeeds', 'celebrationMoment'],
    contextKeys: ['boundary', 'maintained', 'challenges'],
    typicalEmotion: 'empathetic',
  },
  reflectOnBoundaryGrowth: {
    primary: 'reflectOnBoundaryGrowth',
    suggestedFollowers: ['celebrationMoment', 'setBoundary', 'wrapUp'],
    contextKeys: ['progress', 'insights'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // SOCIAL SKILLS DOMAIN - Connection Building Journey
  // ========================================================================
  buildConversationSkills: {
    primary: 'buildConversationSkills',
    suggestedFollowers: ['practiceSmallTalk', 'developListeningSkills', 'navigateSocialAnxiety'],
    contextKeys: ['situation', 'challenge', 'goal'],
    typicalEmotion: 'empathetic',
  },
  practiceSmallTalk: {
    primary: 'practiceSmallTalk',
    suggestedFollowers: ['buildConversationSkills', 'developFriendships', 'networkEffectively'],
    contextKeys: ['scenario', 'practiced', 'confidence'],
    typicalEmotion: 'neutral',
  },
  navigateSocialAnxiety: {
    primary: 'navigateSocialAnxiety',
    suggestedFollowers: ['groundingExercise', 'buildConversationSkills', 'practiceSmallTalk'],
    contextKeys: ['anxietyLevel', 'trigger', 'strategy'],
    typicalEmotion: 'empathetic',
  },
  developListeningSkills: {
    primary: 'developListeningSkills',
    suggestedFollowers: ['buildConversationSkills', 'developFriendships', 'handleAwkwardMoments'],
    contextKeys: ['technique', 'practiced'],
    typicalEmotion: 'neutral',
  },
  developFriendships: {
    primary: 'developFriendships',
    suggestedFollowers: ['practiceSmallTalk', 'networkEffectively', 'celebrationMoment'],
    contextKeys: ['stage', 'approach', 'progress'],
    typicalEmotion: 'empathetic',
  },
  handleAwkwardMoments: {
    primary: 'handleAwkwardMoments',
    suggestedFollowers: ['buildConversationSkills', 'navigateSocialAnxiety', 'practiceSmallTalk'],
    contextKeys: ['situation', 'recovery', 'learned'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // ANGER DOMAIN - Emotional Regulation Journey
  // ========================================================================
  understandAnger: {
    primary: 'understandAnger',
    suggestedFollowers: ['identifyAngerTriggers', 'angerCoolingTechniques', 'transformAngerEnergy'],
    contextKeys: ['angerLevel', 'pattern', 'understanding'],
    typicalEmotion: 'empathetic',
  },
  identifyAngerTriggers: {
    primary: 'identifyAngerTriggers',
    suggestedFollowers: ['understandAnger', 'angerCoolingTechniques', 'preventAngerEscalation'],
    contextKeys: ['trigger', 'pattern', 'context'],
    typicalEmotion: 'empathetic',
  },
  angerCoolingTechniques: {
    primary: 'angerCoolingTechniques',
    suggestedFollowers: ['transformAngerEnergy', 'preventAngerEscalation', 'repairAfterAnger'],
    contextKeys: ['technique', 'effectiveness', 'angerLevel'],
    typicalEmotion: 'empathetic',
  },
  transformAngerEnergy: {
    primary: 'transformAngerEnergy',
    suggestedFollowers: ['angerCoolingTechniques', 'assertiveExpression', 'celebrationMoment'],
    contextKeys: ['activity', 'transformed', 'energy'],
    typicalEmotion: 'neutral',
  },
  preventAngerEscalation: {
    primary: 'preventAngerEscalation',
    suggestedFollowers: ['angerCoolingTechniques', 'identifyAngerTriggers', 'groundingExercise'],
    contextKeys: ['warning_signs', 'strategy', 'prevention'],
    typicalEmotion: 'concerned',
  },
  repairAfterAnger: {
    primary: 'repairAfterAnger',
    suggestedFollowers: ['understandAnger', 'prepareConversation', 'celebrationMoment'],
    contextKeys: ['situation', 'repair_steps', 'relationship'],
    typicalEmotion: 'empathetic',
  },
  assertiveExpression: {
    primary: 'assertiveExpression',
    suggestedFollowers: ['setBoundary', 'practiceConversation', 'repairAfterAnger'],
    contextKeys: ['feeling', 'need', 'request'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // PROCRASTINATION DOMAIN - Action Journey
  // ========================================================================
  understandProcrastination: {
    primary: 'understandProcrastination',
    suggestedFollowers: ['breakDownTask', 'overcomeProcrastinationBlock', 'buildMomentum'],
    contextKeys: ['task', 'reason', 'pattern'],
    typicalEmotion: 'empathetic',
  },
  breakDownTask: {
    primary: 'breakDownTask',
    suggestedFollowers: ['buildMomentum', 'setTimer', 'celebrationMoment'],
    contextKeys: ['task', 'steps', 'firstStep'],
    typicalEmotion: 'neutral',
  },
  overcomeProcrastinationBlock: {
    primary: 'overcomeProcrastinationBlock',
    suggestedFollowers: ['breakDownTask', 'buildMomentum', 'addressProcrastinationFear'],
    contextKeys: ['block', 'strategy', 'unblocked'],
    typicalEmotion: 'empathetic',
  },
  buildMomentum: {
    primary: 'buildMomentum',
    suggestedFollowers: ['celebrationMoment', 'streakTracker', 'breakDownTask'],
    contextKeys: ['wins', 'momentum', 'next_action'],
    typicalEmotion: 'excited',
  },
  addressProcrastinationFear: {
    primary: 'addressProcrastinationFear',
    suggestedFollowers: ['understandProcrastination', 'breakDownTask', 'groundingExercise'],
    contextKeys: ['fear', 'reframe', 'acceptance'],
    typicalEmotion: 'empathetic',
  },
  createProcrastinationPlan: {
    primary: 'createProcrastinationPlan',
    suggestedFollowers: ['breakDownTask', 'setReminder', 'buildMomentum'],
    contextKeys: ['task', 'plan', 'commitment'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // PERFECTIONISM DOMAIN - Self-Acceptance Journey
  // ========================================================================
  recognizePerfectionism: {
    primary: 'recognizePerfectionism',
    suggestedFollowers: [
      'challengePerfectionistThoughts',
      'embraceGoodEnough',
      'buildSelfCompassion',
    ],
    contextKeys: ['pattern', 'cost', 'awareness'],
    typicalEmotion: 'empathetic',
  },
  challengePerfectionistThoughts: {
    primary: 'challengePerfectionistThoughts',
    suggestedFollowers: ['embraceGoodEnough', 'buildSelfCompassion', 'celebrateProgress'],
    contextKeys: ['thought', 'challenge', 'reframe'],
    typicalEmotion: 'empathetic',
  },
  embraceGoodEnough: {
    primary: 'embraceGoodEnough',
    suggestedFollowers: ['celebrateProgress', 'practiceImperfection', 'buildSelfCompassion'],
    contextKeys: ['situation', 'goodEnough', 'acceptance'],
    typicalEmotion: 'empathetic',
  },
  practiceImperfection: {
    primary: 'practiceImperfection',
    suggestedFollowers: ['embraceGoodEnough', 'celebrateProgress', 'buildSelfCompassion'],
    contextKeys: ['experiment', 'outcome', 'learning'],
    typicalEmotion: 'celebratory',
  },
  buildSelfCompassion: {
    primary: 'buildSelfCompassion',
    suggestedFollowers: ['recognizePerfectionism', 'embraceGoodEnough', 'wrapUp'],
    contextKeys: ['situation', 'compassion', 'kindness'],
    typicalEmotion: 'empathetic',
  },
  celebrateProgress: {
    primary: 'celebrateProgress',
    suggestedFollowers: ['streakTracker', 'embraceGoodEnough', 'wrapUp'],
    contextKeys: ['progress', 'celebration', 'growth'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // DIGITAL WELLNESS DOMAIN - Tech Balance Journey
  // ========================================================================
  assessScreenTime: {
    primary: 'assessScreenTime',
    suggestedFollowers: ['createDigitalBoundaries', 'planDigitalDetox', 'buildHealthyTechHabits'],
    contextKeys: ['screenTime', 'patterns', 'concern'],
    typicalEmotion: 'neutral',
  },
  createDigitalBoundaries: {
    primary: 'createDigitalBoundaries',
    suggestedFollowers: ['buildHealthyTechHabits', 'planDigitalDetox', 'addressDoomscrolling'],
    contextKeys: ['boundary', 'app', 'commitment'],
    typicalEmotion: 'neutral',
  },
  planDigitalDetox: {
    primary: 'planDigitalDetox',
    suggestedFollowers: ['createDigitalBoundaries', 'buildHealthyTechHabits', 'celebrationMoment'],
    contextKeys: ['duration', 'plan', 'alternatives'],
    typicalEmotion: 'empathetic',
  },
  addressDoomscrolling: {
    primary: 'addressDoomscrolling',
    suggestedFollowers: ['createDigitalBoundaries', 'groundingExercise', 'buildHealthyTechHabits'],
    contextKeys: ['trigger', 'pattern', 'alternative'],
    typicalEmotion: 'empathetic',
  },
  buildHealthyTechHabits: {
    primary: 'buildHealthyTechHabits',
    suggestedFollowers: ['createDigitalBoundaries', 'assessScreenTime', 'celebrationMoment'],
    contextKeys: ['habit', 'progress', 'balance'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // BURNOUT RECOVERY DOMAIN - Energy Restoration Journey
  // ========================================================================
  assessBurnout: {
    primary: 'assessBurnout',
    suggestedFollowers: ['createRecoveryPlan', 'identifyEnergyDrains', 'restoreEnergy'],
    contextKeys: ['level', 'symptoms', 'duration'],
    typicalEmotion: 'concerned',
  },
  createRecoveryPlan: {
    primary: 'createRecoveryPlan',
    suggestedFollowers: ['restoreEnergy', 'setBoundary', 'celebrationMoment'],
    contextKeys: ['plan', 'priorities', 'timeline'],
    typicalEmotion: 'empathetic',
  },
  identifyEnergyDrains: {
    primary: 'identifyEnergyDrains',
    suggestedFollowers: ['setBoundary', 'restoreEnergy', 'createRecoveryPlan'],
    contextKeys: ['drains', 'patterns', 'changes'],
    typicalEmotion: 'empathetic',
  },
  restoreEnergy: {
    primary: 'restoreEnergy',
    suggestedFollowers: ['celebrationMoment', 'assessBurnout', 'buildHealthyTechHabits'],
    contextKeys: ['activity', 'energy', 'restoration'],
    typicalEmotion: 'empathetic',
  },
  rebuildAfterBurnout: {
    primary: 'rebuildAfterBurnout',
    suggestedFollowers: ['setBoundary', 'setGoal', 'celebrationMoment'],
    contextKeys: ['progress', 'newApproach', 'learning'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // BODY RELATIONSHIP DOMAIN - Self-Acceptance Journey
  // ========================================================================
  exploreBodyImage: {
    primary: 'exploreBodyImage',
    suggestedFollowers: ['challengeBodyThoughts', 'buildBodyGratitude', 'processBodyEmotions'],
    contextKeys: ['feelings', 'patterns', 'awareness'],
    typicalEmotion: 'empathetic',
  },
  challengeBodyThoughts: {
    primary: 'challengeBodyThoughts',
    suggestedFollowers: ['buildBodyGratitude', 'buildSelfCompassion', 'exploreBodyImage'],
    contextKeys: ['thought', 'challenge', 'reframe'],
    typicalEmotion: 'empathetic',
  },
  buildBodyGratitude: {
    primary: 'buildBodyGratitude',
    suggestedFollowers: ['exploreBodyImage', 'buildSelfCompassion', 'celebrationMoment'],
    contextKeys: ['gratitude', 'appreciation', 'function'],
    typicalEmotion: 'empathetic',
  },
  processBodyEmotions: {
    primary: 'processBodyEmotions',
    suggestedFollowers: ['exploreBodyImage', 'buildSelfCompassion', 'groundingExercise'],
    contextKeys: ['emotion', 'trigger', 'processing'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // DATING DOMAIN - Connection Journey
  // ========================================================================
  clarifyDatingGoals: {
    primary: 'clarifyDatingGoals',
    suggestedFollowers: ['buildDatingConfidence', 'navigateDatingAnxiety', 'processRejection'],
    contextKeys: ['goals', 'values', 'clarity'],
    typicalEmotion: 'empathetic',
  },
  buildDatingConfidence: {
    primary: 'buildDatingConfidence',
    suggestedFollowers: ['practiceSmallTalk', 'navigateDatingAnxiety', 'clarifyDatingGoals'],
    contextKeys: ['confidence', 'strengths', 'growth'],
    typicalEmotion: 'empathetic',
  },
  navigateDatingAnxiety: {
    primary: 'navigateDatingAnxiety',
    suggestedFollowers: ['groundingExercise', 'buildDatingConfidence', 'clarifyDatingGoals'],
    contextKeys: ['anxiety', 'trigger', 'strategy'],
    typicalEmotion: 'empathetic',
  },
  processRejection: {
    primary: 'processRejection',
    suggestedFollowers: ['buildSelfCompassion', 'buildDatingConfidence', 'clarifyDatingGoals'],
    contextKeys: ['rejection', 'feelings', 'reframe'],
    typicalEmotion: 'empathetic',
  },
  navigateEarlyDating: {
    primary: 'navigateEarlyDating',
    suggestedFollowers: ['setBoundary', 'clarifyDatingGoals', 'buildDatingConfidence'],
    contextKeys: ['stage', 'concerns', 'approach'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // NEURODIVERSITY DOMAIN - Self-Understanding Journey
  // ========================================================================
  understandNeurodivergence: {
    primary: 'understandNeurodivergence',
    suggestedFollowers: [
      'buildNeurodivergentStrategies',
      'navigateNeurodivergentChallenges',
      'celebrateNeurodivergentStrengths',
    ],
    contextKeys: ['type', 'understanding', 'experience'],
    typicalEmotion: 'empathetic',
  },
  buildNeurodivergentStrategies: {
    primary: 'buildNeurodivergentStrategies',
    suggestedFollowers: [
      'navigateNeurodivergentChallenges',
      'celebrateNeurodivergentStrengths',
      'understandNeurodivergence',
    ],
    contextKeys: ['challenge', 'strategy', 'adaptation'],
    typicalEmotion: 'neutral',
  },
  navigateNeurodivergentChallenges: {
    primary: 'navigateNeurodivergentChallenges',
    suggestedFollowers: [
      'buildNeurodivergentStrategies',
      'buildSelfCompassion',
      'understandNeurodivergence',
    ],
    contextKeys: ['challenge', 'support', 'approach'],
    typicalEmotion: 'empathetic',
  },
  celebrateNeurodivergentStrengths: {
    primary: 'celebrateNeurodivergentStrengths',
    suggestedFollowers: ['understandNeurodivergence', 'celebrationMoment', 'wrapUp'],
    contextKeys: ['strength', 'appreciation', 'application'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // TRAUMA SUPPORT DOMAIN - Healing Journey
  // ========================================================================
  assessTraumaReadiness: {
    primary: 'assessTraumaReadiness',
    suggestedFollowers: ['buildSafetyResources', 'groundingExercise', 'processTraumaGently'],
    contextKeys: ['readiness', 'safety', 'support'],
    typicalEmotion: 'empathetic',
  },
  buildSafetyResources: {
    primary: 'buildSafetyResources',
    suggestedFollowers: ['groundingExercise', 'assessTraumaReadiness', 'processTraumaGently'],
    contextKeys: ['resources', 'safety', 'support'],
    typicalEmotion: 'empathetic',
  },
  processTraumaGently: {
    primary: 'processTraumaGently',
    suggestedFollowers: ['groundingExercise', 'buildSafetyResources', 'buildSelfCompassion'],
    contextKeys: ['pacing', 'safety', 'processing'],
    typicalEmotion: 'empathetic',
  },
  navigateTraumaTriggers: {
    primary: 'navigateTraumaTriggers',
    suggestedFollowers: ['groundingExercise', 'buildSafetyResources', 'buildSelfCompassion'],
    contextKeys: ['trigger', 'response', 'safety'],
    typicalEmotion: 'concerned',
  },

  // ========================================================================
  // INTIMACY DOMAIN - Connection Journey
  // ========================================================================
  exploreIntimacyNeeds: {
    primary: 'exploreIntimacyNeeds',
    suggestedFollowers: [
      'communicateIntimacyNeeds',
      'buildEmotionalIntimacy',
      'navigateIntimacyFears',
    ],
    contextKeys: ['needs', 'desires', 'understanding'],
    typicalEmotion: 'empathetic',
  },
  communicateIntimacyNeeds: {
    primary: 'communicateIntimacyNeeds',
    suggestedFollowers: ['practiceConversation', 'setBoundary', 'buildEmotionalIntimacy'],
    contextKeys: ['need', 'communication', 'partner'],
    typicalEmotion: 'empathetic',
  },
  buildEmotionalIntimacy: {
    primary: 'buildEmotionalIntimacy',
    suggestedFollowers: ['exploreIntimacyNeeds', 'communicateIntimacyNeeds', 'celebrationMoment'],
    contextKeys: ['connection', 'vulnerability', 'growth'],
    typicalEmotion: 'empathetic',
  },
  navigateIntimacyFears: {
    primary: 'navigateIntimacyFears',
    suggestedFollowers: ['exploreIntimacyNeeds', 'buildSelfCompassion', 'communicateIntimacyNeeds'],
    contextKeys: ['fear', 'source', 'approach'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // CHRONIC CONDITIONS DOMAIN - Living Well Journey
  // ========================================================================
  manageChronicCondition: {
    primary: 'manageChronicCondition',
    suggestedFollowers: [
      'buildChronicConditionRoutine',
      'processChronicConditionEmotions',
      'navigateFlareUps',
    ],
    contextKeys: ['condition', 'management', 'support'],
    typicalEmotion: 'empathetic',
  },
  buildChronicConditionRoutine: {
    primary: 'buildChronicConditionRoutine',
    suggestedFollowers: ['manageChronicCondition', 'navigateFlareUps', 'celebrationMoment'],
    contextKeys: ['routine', 'adaptation', 'consistency'],
    typicalEmotion: 'neutral',
  },
  processChronicConditionEmotions: {
    primary: 'processChronicConditionEmotions',
    suggestedFollowers: ['buildSelfCompassion', 'manageChronicCondition', 'companionInGrief'],
    contextKeys: ['emotion', 'processing', 'acceptance'],
    typicalEmotion: 'empathetic',
  },
  navigateFlareUps: {
    primary: 'navigateFlareUps',
    suggestedFollowers: ['groundingExercise', 'manageChronicCondition', 'buildSelfCompassion'],
    contextKeys: ['flareUp', 'management', 'support'],
    typicalEmotion: 'concerned',
  },

  // ========================================================================
  // MIDLIFE DOMAIN - Transition Journey
  // ========================================================================
  exploreMidlifeQuestions: {
    primary: 'exploreMidlifeQuestions',
    suggestedFollowers: ['redefineSuccess', 'processLifeTransition', 'buildMidlifeMeaning'],
    contextKeys: ['questions', 'concerns', 'exploration'],
    typicalEmotion: 'empathetic',
  },
  redefineSuccess: {
    primary: 'redefineSuccess',
    suggestedFollowers: ['buildMidlifeMeaning', 'exploreMidlifeQuestions', 'celebrationMoment'],
    contextKeys: ['oldDefinition', 'newDefinition', 'values'],
    typicalEmotion: 'empathetic',
  },
  processLifeTransition: {
    primary: 'processLifeTransition',
    suggestedFollowers: ['exploreMidlifeQuestions', 'buildSelfCompassion', 'companionInGrief'],
    contextKeys: ['transition', 'feelings', 'processing'],
    typicalEmotion: 'empathetic',
  },
  buildMidlifeMeaning: {
    primary: 'buildMidlifeMeaning',
    suggestedFollowers: ['redefineSuccess', 'setGoal', 'celebrationMoment'],
    contextKeys: ['meaning', 'purpose', 'legacy'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // BREAKUP RECOVERY DOMAIN - Healing Journey
  // ========================================================================
  processBreakupPain: {
    primary: 'processBreakupPain',
    suggestedFollowers: ['navigateBreakupEmotions', 'buildPostBreakupIdentity', 'companionInGrief'],
    contextKeys: ['pain', 'stage', 'support'],
    typicalEmotion: 'empathetic',
  },
  navigateBreakupEmotions: {
    primary: 'navigateBreakupEmotions',
    suggestedFollowers: ['processBreakupPain', 'groundingExercise', 'buildSelfCompassion'],
    contextKeys: ['emotion', 'trigger', 'coping'],
    typicalEmotion: 'empathetic',
  },
  buildPostBreakupIdentity: {
    primary: 'buildPostBreakupIdentity',
    suggestedFollowers: ['setGoal', 'clarifyDatingGoals', 'celebrationMoment'],
    contextKeys: ['identity', 'growth', 'future'],
    typicalEmotion: 'empathetic',
  },
  moveForwardFromBreakup: {
    primary: 'moveForwardFromBreakup',
    suggestedFollowers: ['buildPostBreakupIdentity', 'clarifyDatingGoals', 'celebrationMoment'],
    contextKeys: ['readiness', 'steps', 'growth'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // COMMITMENT TRACKING DOMAIN - Accountability Journey
  // ========================================================================
  checkCommitments: {
    primary: 'checkCommitments',
    suggestedFollowers: ['commitmentFollowUp', 'updateCommitment', 'setGoal'],
    contextKeys: ['commitments', 'count', 'status'],
    typicalEmotion: 'neutral',
  },
  commitmentFollowUp: {
    primary: 'commitmentFollowUp',
    suggestedFollowers: ['updateCommitment', 'checkCommitments', 'celebrationMoment'],
    contextKeys: ['followUps', 'urgency', 'tone'],
    typicalEmotion: 'empathetic',
  },
  updateCommitment: {
    primary: 'updateCommitment',
    suggestedFollowers: ['checkCommitments', 'celebrationMoment', 'setGoal'],
    contextKeys: ['commitmentId', 'newStatus', 'reaction'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // CAPACITY MONITORING DOMAIN - Energy & Burnout Journey
  // ========================================================================
  checkBurnoutRisk: {
    primary: 'checkBurnoutRisk',
    suggestedFollowers: ['logEnergy', 'checkEnergyPatterns', 'assessBurnout'],
    contextKeys: ['risk', 'riskScore', 'factors'],
    typicalEmotion: 'concerned',
  },
  logEnergy: {
    primary: 'logEnergy',
    suggestedFollowers: ['checkEnergyPatterns', 'checkBurnoutRisk', 'restoreEnergy'],
    contextKeys: ['energyLevel', 'factors'],
    typicalEmotion: 'empathetic',
  },
  checkEnergyPatterns: {
    primary: 'checkEnergyPatterns',
    suggestedFollowers: ['logEnergy', 'checkBurnoutRisk', 'assessSleepQuality'],
    contextKeys: ['peakHours', 'lowDays', 'patterns'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // DREAM TRACKING DOMAIN - Aspiration Journey
  // ========================================================================
  checkDreams: {
    primary: 'checkDreams',
    suggestedFollowers: ['findDormantDreams', 'recordDream', 'setGoal'],
    contextKeys: ['dreams', 'filter', 'count'],
    typicalEmotion: 'empathetic',
  },
  findDormantDreams: {
    primary: 'findDormantDreams',
    suggestedFollowers: ['recordDream', 'checkDreams', 'celebrationMoment'],
    contextKeys: ['dormantDreams', 'daysDormant'],
    typicalEmotion: 'empathetic',
  },
  recordDream: {
    primary: 'recordDream',
    suggestedFollowers: ['checkDreams', 'setGoal', 'celebrationMoment'],
    contextKeys: ['statement', 'type'],
    typicalEmotion: 'excited',
  },

  // ========================================================================
  // CONTEMPLATIVE PRACTICE DOMAIN - Mindfulness Journey
  // ========================================================================
  assessMindfulness: {
    primary: 'assessMindfulness',
    suggestedFollowers: ['recordContemplativePractice', 'getDefusionTechnique', 'groundingExercise'],
    contextKeys: ['overallScore', 'primaryStrength', 'areaForGrowth'],
    typicalEmotion: 'empathetic',
  },
  getDefusionTechnique: {
    primary: 'getDefusionTechnique',
    suggestedFollowers: ['recordContemplativePractice', 'assessMindfulness', 'groundingExercise'],
    contextKeys: ['thoughtPattern', 'technique'],
    typicalEmotion: 'empathetic',
  },
  recordContemplativePractice: {
    primary: 'recordContemplativePractice',
    suggestedFollowers: ['assessMindfulness', 'streakTracker', 'celebrationMoment'],
    contextKeys: ['type', 'durationMinutes', 'quality'],
    typicalEmotion: 'celebratory',
  },

  // ========================================================================
  // LIFE SYNTHESIS DOMAIN - Big Picture Journey
  // ========================================================================
  synthesizeMyLife: {
    primary: 'synthesizeMyLife',
    suggestedFollowers: ['getLifeTrajectory', 'getLifeScore', 'setGoal'],
    contextKeys: ['domains', 'insights', 'risks'],
    typicalEmotion: 'empathetic',
  },
  getLifeTrajectory: {
    primary: 'getLifeTrajectory',
    suggestedFollowers: ['synthesizeMyLife', 'getLifeScore', 'checkDreams'],
    contextKeys: ['currentChapter', 'lifeScore', 'projections'],
    typicalEmotion: 'empathetic',
  },
  getLifeScore: {
    primary: 'getLifeScore',
    suggestedFollowers: ['synthesizeMyLife', 'getLifeTrajectory', 'setGoal'],
    contextKeys: ['overall', 'health', 'career', 'relationships'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // SEASONAL AWARENESS DOMAIN - Rhythm & Timing Journey
  // ========================================================================
  checkSeasonalPatterns: {
    primary: 'checkSeasonalPatterns',
    suggestedFollowers: ['upcomingDates', 'suggestEventTiming', 'checkEnergyPatterns'],
    contextKeys: ['patterns', 'season', 'mood'],
    typicalEmotion: 'neutral',
  },
  upcomingDates: {
    primary: 'upcomingDates',
    suggestedFollowers: ['checkSeasonalPatterns', 'suggestEventTiming', 'rememberAboutUser'],
    contextKeys: ['dates', 'daysAhead'],
    typicalEmotion: 'empathetic',
  },
  suggestEventTiming: {
    primary: 'suggestEventTiming',
    suggestedFollowers: ['checkSeasonalPatterns', 'upcomingDates', 'setGoal'],
    contextKeys: ['eventType', 'recommendations'],
    typicalEmotion: 'neutral',
  },

  // ========================================================================
  // END-TO-END JOURNEY: Crisis → Recovery
  // ========================================================================
  supportRecoveryJourney: {
    primary: 'supportRecoveryJourney',
    suggestedFollowers: ['trackSobrietyMilestone', 'groundingExercise', 'celebrationMoment'],
    contextKeys: ['stage', 'progress', 'support'],
    typicalEmotion: 'empathetic',
  },
  trackSobrietyMilestone: {
    primary: 'trackSobrietyMilestone',
    suggestedFollowers: ['supportRecoveryJourney', 'celebrationMoment', 'groundingExercise'],
    contextKeys: ['milestone', 'days', 'achievement'],
    typicalEmotion: 'celebratory',
  },
  deEscalateAnxiety: {
    primary: 'deEscalateAnxiety',
    suggestedFollowers: ['groundingExercise', 'breatheWithMe', 'assessBurnout'],
    contextKeys: ['anxietyLevel', 'trigger', 'technique'],
    typicalEmotion: 'concerned',
  },

  // ========================================================================
  // END-TO-END JOURNEY: Goal Setting → Celebration
  // ========================================================================
  // (setGoal and checkGoalProgress already defined above — these add the
  //  cross-domain links from life-planning into celebration)

  // ========================================================================
  // END-TO-END JOURNEY: Relationship Conflict → Repair
  // ========================================================================
  assessRelationshipHealth: {
    primary: 'assessRelationshipHealth',
    suggestedFollowers: ['navigateConflict', 'prepareHardConversation', 'deepenFriendship'],
    contextKeys: ['relationship', 'health', 'concerns'],
    typicalEmotion: 'empathetic',
  },
  prepareHardConversation: {
    primary: 'prepareHardConversation',
    suggestedFollowers: ['practiceConversation', 'anticipateResponses', 'buildScript'],
    contextKeys: ['topic', 'person', 'intention'],
    typicalEmotion: 'empathetic',
  },
  anticipateResponses: {
    primary: 'anticipateResponses',
    suggestedFollowers: ['practiceConversation', 'buildScript', 'prepareHardConversation'],
    contextKeys: ['scenario', 'responses', 'preparation'],
    typicalEmotion: 'neutral',
  },
  repairRelationshipRupture: {
    primary: 'repairRelationshipRupture',
    suggestedFollowers: ['makeAmends', 'assessRelationshipHealth', 'celebrationMoment'],
    contextKeys: ['rupture', 'repairSteps', 'relationship'],
    typicalEmotion: 'empathetic',
  },
  makeAmends: {
    primary: 'makeAmends',
    suggestedFollowers: ['repairRelationshipRupture', 'assessRelationshipHealth', 'celebrationMoment'],
    contextKeys: ['amends', 'sincerity', 'relationship'],
    typicalEmotion: 'empathetic',
  },

  // ========================================================================
  // END-TO-END JOURNEY: Burnout → Energy Restoration
  // ========================================================================
  // (assessBurnout already defined above — these add cross-domain links
  //  from capacity-monitoring into the burnout recovery chain)
  assessEnergyLevel: {
    primary: 'assessEnergyLevel',
    suggestedFollowers: ['suggestEnergyBoost', 'logEnergy', 'checkBurnoutRisk'],
    contextKeys: ['energyLevel', 'factors', 'time'],
    typicalEmotion: 'empathetic',
  },
  suggestEnergyBoost: {
    primary: 'suggestEnergyBoost',
    suggestedFollowers: ['assessEnergyLevel', 'restoreEnergy', 'logEnergy'],
    contextKeys: ['suggestion', 'activity', 'energy'],
    typicalEmotion: 'neutral',
  },
};
