/**
 * Specialized Domain Mappings
 *
 * Ambient, CEO, Digital Wellness, Habit Intelligence/Persistence,
 * Breakup/Divorce, Blended Family, Body, Caregiver, Faith, Envy,
 * Infidelity, Email, Empty Nest, Chronic, Coming Out, Dev, Docs,
 * Vehicle, Cameo, Games, Neurodiversity, Parent, Intimacy, Sobriety.
 *
 * @module tools/semantic-router/domain-bridge/mappings-specialized
 */

import type { ToolMapping } from './types.js';

export const SPECIALIZED_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // 🌅 AMBIENT MODE & AWARENESS (8 tools)
  // ==========================================================================
  ambient_context: { domainToolId: 'getAmbientContext' },
  ambient_nudge: {
    domainToolId: 'suggestNudge',
    transformArgs: (args) => ({ nudgeType: args.type }),
  },
  ambient_quiet_hours: {
    domainToolId: 'setQuietHours',
    transformArgs: (args) => ({ startTime: args.start, endTime: args.end }),
  },
  ambient_preferences: { domainToolId: 'getAmbientPreferences' },
  ambient_toggle: {
    domainToolId: 'toggleAmbientMode',
    transformArgs: (args) => ({ enabled: args.enabled }),
  },
  ambient_seasonal: { domainToolId: 'getSeasonalAwareness' },
  ambient_energy: { domainToolId: 'getEnergyWaveAwareness' },
  ambient_full: { domainToolId: 'getFullAmbientIntelligence' },

  // ==========================================================================
  // 📊 CEO COACHING (12 tools)
  // ==========================================================================
  ceo_briefing: { domainToolId: 'getMorningBriefing' },
  ceo_weekly: { domainToolId: 'weeklyReview' },
  ceo_win: { domainToolId: 'trackWin', transformArgs: (args) => ({ description: args.win }) },
  ceo_energy: { domainToolId: 'trackEnergy', transformArgs: (args) => ({ level: args.level }) },
  ceo_gratitude: {
    domainToolId: 'logGratitude',
    transformArgs: (args) => ({ entry: args.gratitude }),
  },
  ceo_journal: { domainToolId: 'quickJournal', transformArgs: (args) => ({ entry: args.entry }) },
  ceo_priorities: {
    domainToolId: 'managePriorities',
    transformArgs: (args) => ({ action: args.action, priority: args.priority }),
  },
  ceo_blocker: {
    domainToolId: 'trackBlocker',
    transformArgs: (args) => ({ blocker: args.blocker, action: args.action }),
  },
  ceo_decision: {
    domainToolId: 'trackDecision',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  ceo_idea: {
    domainToolId: 'captureIdea',
    transformArgs: (args) => ({ idea: args.idea, tags: args.tags }),
  },
  ceo_focus: {
    domainToolId: 'focusSession',
    transformArgs: (args) => ({ action: args.action, duration: args.duration }),
  },
  ceo_reflection: { domainToolId: 'dailyReflection' },

  // ==========================================================================
  // 📱 DIGITAL WELLNESS (8 tools)
  // ==========================================================================
  digital_audit: {
    domainToolId: 'digitalAudit',
    transformArgs: (args) => ({ concern: args.concern }),
  },
  digital_boundaries: {
    domainToolId: 'digitalBoundaries',
    transformArgs: (args) => ({ boundaryArea: args.area }),
  },
  digital_social_media: {
    domainToolId: 'socialMediaRelationship',
    transformArgs: (args) => ({ platform: args.platform, impact: args.impact }),
  },
  digital_mindful: { domainToolId: 'mindfulTechUse' },
  digital_phone_free: {
    domainToolId: 'phoneFreeTime',
    transformArgs: (args) => ({ resistanceReason: args.reason }),
  },
  digital_notifications: { domainToolId: 'notificationDetox' },
  digital_comparison: {
    domainToolId: 'comparisonTrap',
    transformArgs: (args) => ({ comparingTo: args.comparingTo }),
  },
  digital_screen_time: {
    domainToolId: 'screenTimeInsights',
    transformArgs: (args) => ({ mostUsedApps: args.apps }),
  },

  // ==========================================================================
  // 🏋️ HABIT INTELLIGENCE (8 tools)
  // ==========================================================================
  habit_dna: { domainToolId: 'trackHabitDNA', transformArgs: (args) => ({ habit: args.habit }) },
  habit_friction: { domainToolId: 'mapFriction', transformArgs: (args) => ({ habit: args.habit }) },
  habit_tendency: { domainToolId: 'assessTendency' },
  habit_keystone: { domainToolId: 'detectKeystone' },
  habit_identity: {
    domainToolId: 'trackIdentityShift',
    transformArgs: (args) => ({ identity: args.identity }),
  },
  habit_setback: {
    domainToolId: 'analyzeSetbackPattern',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_autopsy: {
    domainToolId: 'conductHabitAutopsy',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_reminder: {
    domainToolId: 'backgroundHabitReminder',
    transformArgs: (args) => ({ habit: args.habit }),
  },

  // ==========================================================================
  // 💪 HABIT PERSISTENCE (10 tools)
  // ==========================================================================
  habit_accountability: {
    domainToolId: 'gentleAccountability',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_reset: {
    domainToolId: 'compassionateReset',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_tiny_win: {
    domainToolId: 'celebrateTinyWin',
    transformArgs: (args) => ({ win: args.win }),
  },
  habit_resistance: {
    domainToolId: 'identifyResistance',
    transformArgs: (args) => ({ habit: args.habit }),
  },
  habit_pace: {
    domainToolId: 'findSustainablePace',
    transformArgs: (args) => ({ context: args.context }),
  },
  habit_architecture: {
    domainToolId: 'behaviorArchitecture',
    transformArgs: (args) => ({ behavior: args.behavior }),
  },
  habit_pattern: {
    domainToolId: 'surfacePatternInsight',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  habit_team_maya: { domainToolId: 'getTeamInsightsForMaya' },
  habit_flag_jordan: {
    domainToolId: 'flagMilestoneForJordan',
    transformArgs: (args) => ({ milestone: args.milestone }),
  },
  habit_request_peter: {
    domainToolId: 'requestPeterAnalysis',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 💔 BREAKUP & DIVORCE (10 tools)
  // ==========================================================================
  breakup_process: {
    domainToolId: 'processBreakup',
    transformArgs: (args) => ({ stage: args.stage }),
  },
  breakup_grief: {
    domainToolId: 'grievingRelationship',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  breakup_no_contact: {
    domainToolId: 'noContact',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  breakup_rebuild: { domainToolId: 'rebuildIdentity' },
  breakup_rediscover: { domainToolId: 'rediscoverSelf' },
  divorce_grief: { domainToolId: 'divorceGrief' },
  divorce_coparenting: {
    domainToolId: 'coParentingAfterDivorce',
    transformArgs: (args) => ({ challenge: args.challenge }),
  },
  divorce_identity: { domainToolId: 'divorceIdentityShift' },
  divorce_life_after: { domainToolId: 'lifeAfterDivorce' },
  divorce_faq: { domainToolId: 'divorceFAQ' },

  // ==========================================================================
  // 👨‍👩‍👧 BLENDED FAMILY (3 tools)
  // ==========================================================================
  blended_stepparent: {
    domainToolId: 'stepParentStruggle',
    transformArgs: (args) => ({ struggle: args.struggle }),
  },
  blended_conflict: {
    domainToolId: 'blendedFamilyConflict',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  blended_holidays: {
    domainToolId: 'holidaysBlended',
    transformArgs: (args) => ({ situation: args.situation }),
  },

  // ==========================================================================
  // 🧘 BODY RELATIONSHIP (8 tools)
  // ==========================================================================
  body_image: {
    domainToolId: 'bodyImageExplore',
    transformArgs: (args) => ({ concern: args.concern }),
  },
  body_neutrality: { domainToolId: 'bodyNeutrality' },
  body_gratitude: { domainToolId: 'bodyGratitude' },
  body_movement: {
    domainToolId: 'joyfulMovement',
    transformArgs: (args) => ({ preference: args.preference }),
  },
  body_inner_critic: {
    domainToolId: 'innerCriticBody',
    transformArgs: (args) => ({ criticism: args.criticism }),
  },
  body_eating: {
    domainToolId: 'emotionalEating',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  body_mirror: { domainToolId: 'mirrorWork' },
  body_checking: { domainToolId: 'bodyCheckingAwareness' },

  // ==========================================================================
  // 👴 CAREGIVER (5 tools)
  // ==========================================================================
  caregiver_burnout: { domainToolId: 'caregiverBurnout' },
  caregiver_guilt: {
    domainToolId: 'caregiverGuilt',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  caregiver_anticipatory: { domainToolId: 'anticipatoryGrief' },
  caregiver_respite: { domainToolId: 'respiteNeed' },
  caregiver_identity: { domainToolId: 'caregiverIdentityLoss' },

  // ==========================================================================
  // ⛪ FAITH & SPIRITUALITY (4 tools)
  // ==========================================================================
  faith_deconstruction: { domainToolId: 'faithDeconstruction' },
  faith_grief: { domainToolId: 'spiritualGrief' },
  faith_family: {
    domainToolId: 'faithAndFamily',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  faith_rebuilding: { domainToolId: 'beliefRebuilding' },

  // ==========================================================================
  // 😤 ENVY (4 tools)
  // ==========================================================================
  envy_understand: {
    domainToolId: 'understandEnvy',
    transformArgs: (args) => ({ target: args.target }),
  },
  envy_transform: { domainToolId: 'transformEnvy', transformArgs: (args) => ({ envy: args.envy }) },
  envy_detox: { domainToolId: 'comparisonDetox' },
  envy_celebrate: {
    domainToolId: 'celebrateOthers',
    transformArgs: (args) => ({ person: args.person }),
  },

  // ==========================================================================
  // 💞 INFIDELITY (4 tools)
  // ==========================================================================
  infidelity_betrayal: { domainToolId: 'betrayalTrauma' },
  infidelity_stay: {
    domainToolId: 'shouldWeStay',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  infidelity_understanding: { domainToolId: 'understandingWhyICheated' },
  infidelity_trust: {
    domainToolId: 'trustRecovery',
    transformArgs: (args) => ({ stage: args.stage }),
  },

  // ==========================================================================
  // 📧 EMAIL INTELLIGENCE (8 tools)
  // ==========================================================================
  email_priority: { domainToolId: 'analyzeInboxPriority' },
  email_followup: { domainToolId: 'getFollowUpNeeded' },
  email_unsubscribe: { domainToolId: 'bulkUnsubscribe' },
  email_summarize: {
    domainToolId: 'summarizeThread',
    transformArgs: (args) => ({ threadId: args.threadId }),
  },
  email_vip: { domainToolId: 'markVipSender', transformArgs: (args) => ({ sender: args.sender }) },
  email_block: { domainToolId: 'blockSender', transformArgs: (args) => ({ sender: args.sender }) },
  email_track: { domainToolId: 'trackFollowUp', transformArgs: (args) => ({ email: args.email }) },
  email_close: { domainToolId: 'closeFollowUp', transformArgs: (args) => ({ id: args.id }) },

  // ==========================================================================
  // 🏠 EMPTY NEST (4 tools)
  // ==========================================================================
  empty_nest_grief: { domainToolId: 'emptyNestGrief' },
  empty_nest_rediscover: { domainToolId: 'rediscoverYourself' },
  empty_nest_couples: { domainToolId: 'couplesRediscovery' },
  empty_nest_freedom: { domainToolId: 'freedomAfterKids' },

  // ==========================================================================
  // 🏥 CHRONIC CONDITIONS (3 tools)
  // ==========================================================================
  chronic_illness: {
    domainToolId: 'chronicIllnessLife',
    transformArgs: (args) => ({ condition: args.condition }),
  },
  chronic_grief: { domainToolId: 'griefOfChronicIllness' },
  chronic_invisible: { domainToolId: 'invisibleIllness' },

  // ==========================================================================
  // 🌈 COMING OUT (2 tools)
  // ==========================================================================
  coming_out_self: { domainToolId: 'comingOutToSelf' },
  coming_out_planning: {
    domainToolId: 'comingOutPlanning',
    transformArgs: (args) => ({ who: args.who }),
  },

  // ==========================================================================
  // 🎯 DEVELOPER TOOLS (10 tools)
  // ==========================================================================
  dev_git_status: { domainToolId: 'gitStatus' },
  dev_git_diff: { domainToolId: 'gitDiff' },
  dev_git_commit: {
    domainToolId: 'gitCommit',
    transformArgs: (args) => ({ message: args.message }),
  },
  dev_git_log: { domainToolId: 'gitLog' },
  dev_ferni_cli: {
    domainToolId: 'runFerniCommand',
    transformArgs: (args) => ({ command: args.command }),
  },
  dev_job_check: {
    domainToolId: 'checkBackgroundJob',
    transformArgs: (args) => ({ jobId: args.jobId }),
  },
  dev_read_file: { domainToolId: 'readFile', transformArgs: (args) => ({ path: args.path }) },
  dev_edit_file: {
    domainToolId: 'editFile',
    transformArgs: (args) => ({ path: args.path, content: args.content }),
  },
  dev_bash: { domainToolId: 'runBash', transformArgs: (args) => ({ command: args.command }) },
  dev_search: { domainToolId: 'searchFiles', transformArgs: (args) => ({ query: args.query }) },

  // ==========================================================================
  // 📄 DOCUMENTS (5 tools)
  // ==========================================================================
  doc_save: {
    domainToolId: 'saveDocument',
    transformArgs: (args) => ({ name: args.name, content: args.content }),
  },
  doc_find: { domainToolId: 'locateDocument', transformArgs: (args) => ({ name: args.name }) },
  doc_expiration: {
    domainToolId: 'trackExpiration',
    transformArgs: (args) => ({ document: args.document, date: args.date }),
  },
  doc_warranty: {
    domainToolId: 'getWarrantyStatus',
    transformArgs: (args) => ({ item: args.item }),
  },
  doc_receipts: { domainToolId: 'organizeReceipts' },

  // ==========================================================================
  // 🚗 VEHICLE (4 tools)
  // ==========================================================================
  vehicle_add: {
    domainToolId: 'addVehicle',
    transformArgs: (args) => ({ make: args.make, model: args.model }),
  },
  vehicle_mileage: {
    domainToolId: 'logMileage',
    transformArgs: (args) => ({ mileage: args.mileage }),
  },
  vehicle_service: {
    domainToolId: 'trackServiceHistory',
    transformArgs: (args) => ({ service: args.service }),
  },
  vehicle_maintenance: { domainToolId: 'getMaintenanceSchedule' },

  // ==========================================================================
  // 🎭 CAMEO (4 tools)
  // ==========================================================================
  cameo_check: { domainToolId: 'checkCameoOpportunity' },
  cameo_invite: {
    domainToolId: 'inviteCameo',
    transformArgs: (args) => ({ persona: args.persona, topic: args.topic }),
  },
  cameo_complete: {
    domainToolId: 'completeCameo',
    transformArgs: (args) => ({ cameoId: args.cameoId }),
  },
  cameo_context: { domainToolId: 'getCameoContext' },

  // ==========================================================================
  // 🎮 GAMES (10 tools)
  // ==========================================================================
  game_suggest: { domainToolId: 'suggestGame', transformArgs: (args) => ({ mood: args.mood }) },
  game_status: { domainToolId: 'getGameStatus' },
  game_hint: { domainToolId: 'getGameHint' },
  game_history: { domainToolId: 'getGameHistory' },
  game_end: { domainToolId: 'endGame' },
  game_skip: { domainToolId: 'skipGameRound' },
  game_submit: {
    domainToolId: 'submitGameAnswer',
    transformArgs: (args) => ({ answer: args.answer }),
  },
  game_text_start: {
    domainToolId: 'startTextGame',
    transformArgs: (args) => ({ gameType: args.gameType }),
  },
  game_text_move: {
    domainToolId: 'makeTextGameMove',
    transformArgs: (args) => ({ move: args.move }),
  },
  game_text_board: { domainToolId: 'getTextGameBoard' },

  // ==========================================================================
  // 🧠 NEURODIVERSITY (6 tools)
  // ==========================================================================
  adhd_body_doubling: { domainToolId: 'adhdBodyDoubling' },
  adhd_task_start: {
    domainToolId: 'adhdTaskStart',
    transformArgs: (args) => ({ task: args.task }),
  },
  adhd_time_blindness: { domainToolId: 'adhdTimeBlindness' },
  autism_sensory: {
    domainToolId: 'autismSensoryRegulation',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  autism_social: {
    domainToolId: 'autismSocialEnergy',
    transformArgs: (args) => ({ context: args.context }),
  },
  executive_function: {
    domainToolId: 'executiveFunctionSupport',
    transformArgs: (args) => ({ challenge: args.challenge }),
  },

  // ==========================================================================
  // 👶 NEW PARENT (3 tools)
  // ==========================================================================
  new_parent_survival: { domainToolId: 'newParentSurvival' },
  postpartum_checkin: { domainToolId: 'postpartumCheckin' },
  parent_identity: { domainToolId: 'parentIdentityShift' },

  // ==========================================================================
  // 💑 INTIMACY (4 tools)
  // ==========================================================================
  intimacy_barriers: {
    domainToolId: 'intimacyBarriers',
    transformArgs: (args) => ({ barrier: args.barrier }),
  },
  intimacy_types: { domainToolId: 'intimacyTypes' },
  intimacy_emotional: {
    domainToolId: 'emotionalIntimacy',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  intimacy_desires: { domainToolId: 'communicatingDesires' },

  // ==========================================================================
  // 🍺 SOBRIETY (4 tools)
  // ==========================================================================
  sobriety_checkin: { domainToolId: 'sobrietyCheckin' },
  sobriety_grief: { domainToolId: 'sobrietyGrief' },
  sobriety_social: {
    domainToolId: 'soberSocializing',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  sobriety_milestone: {
    domainToolId: 'trackSobrietyMilestone',
    transformArgs: (args) => ({ days: args.days }),
  },
};
