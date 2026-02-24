/**
 * Miscellaneous & Extended Domain Mappings
 *
 * Career ext, Health ext, Home ext, Finance ext, Stories, Reflection,
 * Midlife, Grief ext, Anger ext, Boundaries, Inner Critic, Imposter,
 * Team, Wisdom, Marketing, Forgiveness, Local Search, Events,
 * Community, Patterns, Decisions ext, Celebration, and remaining tools.
 *
 * @module tools/semantic-router/domain-bridge/mappings-misc
 */

import type { ToolMapping } from './types.js';

export const MISC_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // 💼 CAREER EXTENDED (8 tools)
  // ==========================================================================
  career_satisfaction: { domainToolId: 'assessCareerSatisfaction' },
  career_goals: { domainToolId: 'clarifyCareerGoals' },
  career_transition: { domainToolId: 'planCareerTransition' },
  career_burnout: { domainToolId: 'assessWorkBurnout' },
  career_boundary: {
    domainToolId: 'setWorkBoundary',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  career_star: { domainToolId: 'prepareSTARStories' },
  career_salary: { domainToolId: 'researchSalary', transformArgs: (args) => ({ role: args.role }) },
  career_negotiate: {
    domainToolId: 'rolePlayNegotiation',
    transformArgs: (args) => ({ scenario: args.scenario }),
  },

  // ==========================================================================
  // 🏥 HEALTH EXTENDED (8 tools)
  // ==========================================================================
  health_symptom: {
    domainToolId: 'logSymptom',
    transformArgs: (args) => ({ symptom: args.symptom }),
  },
  health_tracking: { domainToolId: 'symptomTracking' },
  health_doctor: {
    domainToolId: 'prepareForDoctorVisit',
    transformArgs: (args) => ({ reason: args.reason }),
  },
  health_second_opinion: { domainToolId: 'prepareSecondOpinionQuestions' },
  health_appointment: {
    domainToolId: 'scheduleHealthcareAppointment',
    transformArgs: (args) => ({ type: args.type }),
  },
  health_preventive: { domainToolId: 'remindPreventiveCare' },
  health_fitness: {
    domainToolId: 'trackFitnessGoal',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  health_nutrition_coach: {
    domainToolId: 'coachOnNutrition',
    transformArgs: (args) => ({ goal: args.goal }),
  },

  // ==========================================================================
  // 🏠 HOME EXTENDED (8 tools)
  // ==========================================================================
  home_project_plan: {
    domainToolId: 'planHomeProject',
    transformArgs: (args) => ({ project: args.project }),
  },
  home_contractor_manage: {
    domainToolId: 'manageContractor',
    transformArgs: (args) => ({ contractor: args.contractor }),
  },
  home_quotes: {
    domainToolId: 'getServiceQuotes',
    transformArgs: (args) => ({ service: args.service }),
  },
  home_repair_track: {
    domainToolId: 'trackRepair',
    transformArgs: (args) => ({ repair: args.repair }),
  },
  home_maintenance_remind: { domainToolId: 'remindHomeMaintenance' },
  home_move_plan: { domainToolId: 'planMove' },
  home_moving: { domainToolId: 'moving' },
  home_declutter_coach: {
    domainToolId: 'coachDecluttering',
    transformArgs: (args) => ({ area: args.area }),
  },

  // ==========================================================================
  // 💰 FINANCE EXTENDED (6 tools)
  // ==========================================================================
  finance_charitable: { domainToolId: 'planCharitableGiving' },
  finance_align_giving: { domainToolId: 'alignGivingWithValues' },
  finance_tax: { domainToolId: 'prepareForTaxSeason' },
  finance_assistance: { domainToolId: 'findFinancialAssistance' },
  finance_insurance: { domainToolId: 'reviewInsuranceCoverage' },
  finance_compare: {
    domainToolId: 'comparePrices',
    transformArgs: (args) => ({ item: args.item }),
  },

  // ==========================================================================
  // 📖 STORIES & REFLECTION (8 tools)
  // ==========================================================================
  story_oral: {
    domainToolId: 'recordOralHistory',
    transformArgs: (args) => ({ prompt: args.prompt }),
  },
  story_family: { domainToolId: 'familyStoryPrompts' },
  story_remember: {
    domainToolId: 'rememberWhen',
    transformArgs: (args) => ({ prompt: args.prompt }),
  },
  story_loved: {
    domainToolId: 'rememberLoved',
    transformArgs: (args) => ({ person: args.person }),
  },
  story_rewrite: { domainToolId: 'rewriteStory', transformArgs: (args) => ({ story: args.story }) },
  story_narrative: { domainToolId: 'findNarrativeThread' },
  story_reframe: {
    domainToolId: 'reframeNarrative',
    transformArgs: (args) => ({ narrative: args.narrative }),
  },
  story_journey: { domainToolId: 'reflectOnJourney' },

  // ==========================================================================
  // 🎯 REFLECTION GAMES (4 tools)
  // ==========================================================================
  reflection_start: {
    domainToolId: 'startReflectionGame',
    transformArgs: (args) => ({ type: args.type }),
  },
  reflection_three_word: { domainToolId: 'threeWordDay' },
  reflection_headline: { domainToolId: 'headlineWriter' },
  reflection_conversation: { domainToolId: 'conversationDeepener' },

  // ==========================================================================
  // 🧓 MIDLIFE & AGING (6 tools)
  // ==========================================================================
  midlife_reckoning: { domainToolId: 'midlifeReckoning' },
  midlife_reinvention: { domainToolId: 'reinventionMidlife' },
  midlife_second_half: { domainToolId: 'secondHalfPurpose' },
  midlife_legacy: { domainToolId: 'legacyBuilding' },
  midlife_end_of_life: { domainToolId: 'endOfLifeConversation' },
  midlife_estate: { domainToolId: 'promptEstatePlanning' },

  // ==========================================================================
  // 🌊 GRIEF EXTENDED (8 tools)
  // ==========================================================================
  grief_companion: { domainToolId: 'companionInGrief' },
  grief_team: { domainToolId: 'getTeamGriefContext' },
  grief_validate: { domainToolId: 'validateGrief', transformArgs: (args) => ({ loss: args.loss }) },
  grief_process: { domainToolId: 'processGrief', transformArgs: (args) => ({ loss: args.loss }) },
  grief_ambiguous: {
    domainToolId: 'navigateAmbiguousLoss',
    transformArgs: (args) => ({ loss: args.loss }),
  },
  grief_dual: {
    domainToolId: 'holdDualEmotions',
    transformArgs: (args) => ({ emotions: args.emotions }),
  },
  grief_hope: { domainToolId: 'holdHopeWhenCant' },
  grief_joy: { domainToolId: 'findMomentsOfJoy' },

  // ==========================================================================
  // 😠 ANGER EXTENDED (6 tools)
  // ==========================================================================
  anger_moment: {
    domainToolId: 'angerInTheMoment',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  anger_repair: {
    domainToolId: 'repairAfterAnger',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  anger_flag_maya: { domainToolId: 'flagAngerPatternForMaya' },
  anger_share_nayan: { domainToolId: 'shareAngerInsightWithNayan' },
  anger_dopamine: { domainToolId: 'dopamineManagement' },
  anger_craving: {
    domainToolId: 'cravingSupport',
    transformArgs: (args) => ({ craving: args.craving }),
  },

  // ==========================================================================
  // 🛡️ BOUNDARIES EXTENDED (6 tools)
  // ==========================================================================
  boundary_identify: { domainToolId: 'identifyBoundaryNeeds' },
  boundary_set: {
    domainToolId: 'setBoundary',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  boundary_maintain: {
    domainToolId: 'maintainBoundary',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  boundary_heal: {
    domainToolId: 'healFromBoundaryViolation',
    transformArgs: (args) => ({ violation: args.violation }),
  },
  boundary_recovery: { domainToolId: 'boundariesForRecovery' },
  boundary_decline: {
    domainToolId: 'practiceDecline',
    transformArgs: (args) => ({ request: args.request }),
  },

  // ==========================================================================
  // 🧠 INNER CRITIC (6 tools)
  // ==========================================================================
  critic_notice: { domainToolId: 'noticeInnerCritic' },
  critic_inner: {
    domainToolId: 'innerCritic',
    transformArgs: (args) => ({ criticism: args.criticism }),
  },
  critic_reframe: {
    domainToolId: 'reframeInnerCritic',
    transformArgs: (args) => ({ thought: args.thought }),
  },
  critic_self_kind: { domainToolId: 'practiceSelfKindness' },
  critic_self_accept: { domainToolId: 'practiceSelfAcceptance' },
  critic_friend: { domainToolId: 'speakToYourselfAsAFriend' },

  // ==========================================================================
  // 🎯 IMPOSTER & CONFIDENCE (4 tools)
  // ==========================================================================
  imposter_syndrome: {
    domainToolId: 'imposterSyndrome',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  imposter_credit: {
    domainToolId: 'giveYourselfCredit',
    transformArgs: (args) => ({ accomplishment: args.accomplishment }),
  },
  imposter_rebuild: { domainToolId: 'rebuildingConfidence' },
  imposter_good_enough: { domainToolId: 'goodEnough' },

  // ==========================================================================
  // 🔗 TEAM COLLABORATION (8 tools)
  // ==========================================================================
  team_insights: { domainToolId: 'getTeamInsights' },
  team_share_pattern: {
    domainToolId: 'sharePatternWithTeam',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  team_flag_perfectionism: { domainToolId: 'flagPerfectionismPatternForMaya' },
  team_flag_procrastination: { domainToolId: 'flagProcrastinationPatternForMaya' },
  team_flag_transition: { domainToolId: 'flagTransitionForJordan' },
  team_connection_concern: { domainToolId: 'flagConnectionConcernForMaya' },
  team_request_maya: { domainToolId: 'requestMayaHabitIntervention' },
  team_request_alex: { domainToolId: 'requestAlexProductivitySupport' },

  // ==========================================================================
  // 🎭 WISDOM & PHILOSOPHY (10 tools)
  // ==========================================================================
  wisdom_seasonal: { domainToolId: 'seasonalWisdom' },
  wisdom_apply: {
    domainToolId: 'applySeasonalWisdom',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  wisdom_winter: { domainToolId: 'winterSeason' },
  wisdom_ancestral: { domainToolId: 'ancestralWisdom' },
  wisdom_ancient: {
    domainToolId: 'ancientParallel',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  wisdom_historical: {
    domainToolId: 'historicalParallel',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  wisdom_counter: { domainToolId: 'counterIntuitiveInsight' },
  wisdom_intellectual: {
    domainToolId: 'intellectualExploration',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  wisdom_share_grief: { domainToolId: 'shareGriefInsight' },
  wisdom_share_critic: { domainToolId: 'shareInnerCriticWithNayan' },

  // ==========================================================================
  // 📱 MARKETING & ANALYTICS (4 tools)
  // ==========================================================================
  marketing_analytics: { domainToolId: 'getMarketingAnalytics' },
  marketing_optimal_time: { domainToolId: 'getOptimalSendTime' },
  marketing_data_story: {
    domainToolId: 'dataStorytelling',
    transformArgs: (args) => ({ data: args.data }),
  },
  marketing_headline: {
    domainToolId: 'headlineWriterRespond',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 🔄 FORGIVENESS & HEALING (6 tools)
  // ==========================================================================
  forgiveness_journey: {
    domainToolId: 'forgivenessJourney',
    transformArgs: (args) => ({ toward: args.toward }),
  },
  forgiveness_self: {
    domainToolId: 'practiceSelfForgiveness',
    transformArgs: (args) => ({ for: args.for }),
  },
  forgiveness_compassion: {
    domainToolId: 'compassionateLetter',
    transformArgs: (args) => ({ to: args.to }),
  },
  healing_trauma: { domainToolId: 'selfCompassionTrauma' },
  healing_ptg: { domainToolId: 'postTraumaticGrowth' },
  healing_recovery: {
    domainToolId: 'supportRecoveryJourney',
    transformArgs: (args) => ({ recovery: args.recovery }),
  },

  // ==========================================================================
  // 📍 LOCAL SEARCH & BUSINESS (8 tools)
  // ==========================================================================
  local_business: { domainToolId: 'findBusiness', transformArgs: (args) => ({ type: args.type }) },
  local_restaurant: {
    domainToolId: 'findRestaurants',
    transformArgs: (args) => ({ cuisine: args.cuisine }),
  },
  local_reviews: {
    domainToolId: 'getBusinessReviews',
    transformArgs: (args) => ({ business: args.business }),
  },
  local_info: {
    domainToolId: 'getBusinessInfo',
    transformArgs: (args) => ({ business: args.business }),
  },
  local_phone_lookup: {
    domainToolId: 'lookupBusinessByPhone',
    transformArgs: (args) => ({ phone: args.phone }),
  },
  local_reservation: {
    domainToolId: 'makeRestaurantReservation',
    transformArgs: (args) => ({ restaurant: args.restaurant, time: args.time }),
  },
  local_hotel: {
    domainToolId: 'requestHotelQuotes',
    transformArgs: (args) => ({ location: args.location }),
  },
  local_community: {
    domainToolId: 'findCommunityGroup',
    transformArgs: (args) => ({ interest: args.interest }),
  },

  // ==========================================================================
  // 🎪 EVENTS & CELEBRATIONS (6 tools)
  // ==========================================================================
  event_prepare: {
    domainToolId: 'prepareForUpcomingEvent',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_meaning: {
    domainToolId: 'captureEventMeaning',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_guest: {
    domainToolId: 'getGuestInsights',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_countdown: {
    domainToolId: 'buildCountdown',
    transformArgs: (args) => ({ event: args.event }),
  },
  event_mark: { domainToolId: 'markTheMoment', transformArgs: (args) => ({ moment: args.moment }) },
  event_time_capsule: {
    domainToolId: 'createTimeCapsule',
    transformArgs: (args) => ({ occasion: args.occasion }),
  },

  // ==========================================================================
  // 🌐 COMMUNITY & VOLUNTEERING (4 tools)
  // ==========================================================================
  community_volunteer: {
    domainToolId: 'findVolunteerOpportunity',
    transformArgs: (args) => ({ cause: args.cause }),
  },
  community_track_hours: {
    domainToolId: 'trackVolunteerHours',
    transformArgs: (args) => ({ hours: args.hours }),
  },
  community_civic: { domainToolId: 'engageCivically' },
  community_belonging: { domainToolId: 'createBelonging' },

  // ==========================================================================
  // 📊 PATTERN & INSIGHTS (8 tools)
  // ==========================================================================
  pattern_discover: {
    domainToolId: 'discoverPattern',
    transformArgs: (args) => ({ area: args.area }),
  },
  pattern_record: {
    domainToolId: 'recordPattern',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  pattern_predict: {
    domainToolId: 'predictPattern',
    transformArgs: (args) => ({ pattern: args.pattern }),
  },
  pattern_cross_domain: { domainToolId: 'crossDomainConnection' },
  pattern_anomaly: { domainToolId: 'detectAnomaly' },
  pattern_correlation: {
    domainToolId: 'findCorrelation',
    transformArgs: (args) => ({ variables: args.variables }),
  },
  pattern_compare: { domainToolId: 'compareToYesterday' },
  pattern_mirror: { domainToolId: 'surfacePatternMirrorInsight' },

  // ==========================================================================
  // 🎯 DECISIONS EXTENDED (6 tools)
  // ==========================================================================
  decision_frame: {
    domainToolId: 'frameMajorDecision',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_walk: {
    domainToolId: 'walkThroughDecisionFramework',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_risk: {
    domainToolId: 'assessRisk',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_score: {
    domainToolId: 'scoreDecision',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  decision_options: {
    domainToolId: 'scoreOptions',
    transformArgs: (args) => ({ options: args.options }),
  },
  decision_reflect: { domainToolId: 'reflectOnPastDecisions' },

  // ==========================================================================
  // 🌟 CELEBRATION & GRATITUDE (6 tools)
  // ==========================================================================
  celebrate_yourself: { domainToolId: 'celebrateYourself' },
  celebrate_creation: {
    domainToolId: 'celebrateCreation',
    transformArgs: (args) => ({ creation: args.creation }),
  },
  celebrate_maintenance: { domainToolId: 'celebrateMaintenance' },
  celebrate_health: { domainToolId: 'checkCelebrationHealth' },
  note_fun: {
    domainToolId: 'noteThatWasFun',
    transformArgs: (args) => ({ activity: args.activity }),
  },
  recognize_flow: { domainToolId: 'recognizeFlow' },

  // ==========================================================================
  // 🎯 MISC REMAINING TOOLS
  // ==========================================================================
  task_break_down: {
    domainToolId: 'breakDownTask',
    transformArgs: (args) => ({ task: args.task }),
  },
  task_first_step: {
    domainToolId: 'defineFirstStep',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  task_chaos: { domainToolId: 'chaosToOrder' },
  commitment_track: {
    domainToolId: 'trackCommitment',
    transformArgs: (args) => ({ commitment: args.commitment }),
  },
  commitment_review: { domainToolId: 'reviewCommitments' },
  progress_remind: { domainToolId: 'remindOfProgress' },
  progress_check_in: { domainToolId: 'checkInOnJourney' },
  intention_clarify: {
    domainToolId: 'clarifyIntention',
    transformArgs: (args) => ({ intention: args.intention }),
  },
  learning_reflect: { domainToolId: 'reflectOnLearning' },
  lessons_find: {
    domainToolId: 'findTheLessons',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  inspiration_find: {
    domainToolId: 'findInspiration',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  resource_recommend: {
    domainToolId: 'recommendResource',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  anticipation_build: {
    domainToolId: 'anticipationBuilder',
    transformArgs: (args) => ({ event: args.event }),
  },
  safe_resources: {
    domainToolId: 'findSafeResources',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  supports_identify: { domainToolId: 'identifySupports' },
  de_escalate: {
    domainToolId: 'deEscalateAnxiety',
    transformArgs: (args) => ({ anxiety: args.anxiety }),
  },
  somatic_support: { domainToolId: 'somaticSupport' },
  grounding: { domainToolId: 'groundingExercise', transformArgs: (args) => ({ type: args.type }) },
  fear_failure: { domainToolId: 'fearOfFailure' },
  release_urgency: { domainToolId: 'releaseUrgency' },
  rest_as_skill: { domainToolId: 'restAsSkill' },
  honor_rest: { domainToolId: 'honorTheRest' },
  sleep_deprivation: { domainToolId: 'sleepDeprivation' },
  mindful_eating: { domainToolId: 'mindfulEating' },
  nature_prescription: { domainToolId: 'naturePrescription' },
  what_if: { domainToolId: 'whatIf', transformArgs: (args) => ({ scenario: args.scenario }) },
  good_start: { domainToolId: 'goodEnough' },
  energy_budget: { domainToolId: 'energyBudgeting' },
  pacing_plan: { domainToolId: 'pacingPlan' },
  say_no: { domainToolId: 'sayNoWithGrace', transformArgs: (args) => ({ request: args.request }) },
  advocate: {
    domainToolId: 'advocatingForSelf',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  truth_practice: { domainToolId: 'practiceTruth' },
  masking_recovery: { domainToolId: 'maskingRecovery' },
  trauma_responses: { domainToolId: 'traumaResponses' },
  people_pleasing: { domainToolId: 'recoverFromPeoplePleasing' },
  relationship_circles: { domainToolId: 'mapRelationshipCircles' },
  relationship_network: { domainToolId: 'getRelationshipNetworkContext' },
  connection_action: { domainToolId: 'suggestConnectionAction' },
  connection_insight: { domainToolId: 'shareConnectionInsight' },
  connection_wisdom: { domainToolId: 'shareConnectionWisdom' },
  conversation_wisdom: { domainToolId: 'shareConversationWisdom' },
  conversation_start: {
    domainToolId: 'startConversation',
    transformArgs: (args) => ({ with: args.with }),
  },
  message_craft: {
    domainToolId: 'messageCrafting',
    transformArgs: (args) => ({ context: args.context }),
  },
  difficult_email: {
    domainToolId: 'difficultEmailDraft',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  message_schedule: {
    domainToolId: 'scheduleMessage',
    transformArgs: (args) => ({ to: args.to, message: args.message, time: args.time }),
  },
  message_send: {
    domainToolId: 'sendMessageNow',
    transformArgs: (args) => ({ to: args.to, message: args.message }),
  },
  message_broadcast: {
    domainToolId: 'broadcastMessage',
    transformArgs: (args) => ({ message: args.message, to: args.to }),
  },
  contact_save_info: {
    domainToolId: 'saveContactInfo',
    transformArgs: (args) => ({ name: args.name, info: args.info }),
  },
  contact_manage: {
    domainToolId: 'manageContact',
    transformArgs: (args) => ({ contact: args.contact, action: args.action }),
  },
  appointment_manage: {
    domainToolId: 'manageAppointment',
    transformArgs: (args) => ({ appointment: args.appointment }),
  },
  gift_track: {
    domainToolId: 'trackGift',
    transformArgs: (args) => ({ person: args.person, gift: args.gift }),
  },
  gift_suggest: {
    domainToolId: 'suggestGift',
    transformArgs: (args) => ({ person: args.person, occasion: args.occasion }),
  },
  renewal_track: {
    domainToolId: 'trackRenewal',
    transformArgs: (args) => ({ item: args.item, date: args.date }),
  },
  registration_expiry: {
    domainToolId: 'setRegistrationExpiry',
    transformArgs: (args) => ({ vehicle: args.vehicle, date: args.date }),
  },
  impact_track: { domainToolId: 'trackImpact', transformArgs: (args) => ({ action: args.action }) },
  job_application: {
    domainToolId: 'trackJobApplication',
    transformArgs: (args) => ({ company: args.company, role: args.role }),
  },
  books_read: { domainToolId: 'trackBooksRead', transformArgs: (args) => ({ book: args.book }) },
  reading_progress: {
    domainToolId: 'updateReadingProgress',
    transformArgs: (args) => ({ book: args.book, progress: args.progress }),
  },
  book_details: { domainToolId: 'getBookDetails', transformArgs: (args) => ({ book: args.book }) },
  book_recommend: {
    domainToolId: 'getBookRecommendations',
    transformArgs: (args) => ({ genre: args.genre }),
  },
  sports_info: { domainToolId: 'getSports', transformArgs: (args) => ({ query: args.query }) },
  // music_info already mapped in core mappings
  trip_suggestions: {
    domainToolId: 'getTripSuggestions',
    transformArgs: (args) => ({ preferences: args.preferences }),
  },
  dinner_announce: { domainToolId: 'announceDinner' },
  major_announcement: {
    domainToolId: 'majorAnnouncement',
    transformArgs: (args) => ({ announcement: args.announcement }),
  },
  intercom_call: { domainToolId: 'intercomCall', transformArgs: (args) => ({ room: args.room }) },
  wedding_plan: { domainToolId: 'wedding', transformArgs: (args) => ({ aspect: args.aspect }) },
  renovation_plan: {
    domainToolId: 'renovation',
    transformArgs: (args) => ({ project: args.project }),
  },
  restaurant_search: {
    domainToolId: 'restaurant',
    transformArgs: (args) => ({ query: args.query }),
  },
  order_groceries: {
    domainToolId: 'orderGroceries',
    transformArgs: (args) => ({ items: args.items }),
  },
  workflow_templates: { domainToolId: 'listWorkflowTemplates' },
  system_design: {
    domainToolId: 'systemDesign',
    transformArgs: (args) => ({ system: args.system }),
  },
};
