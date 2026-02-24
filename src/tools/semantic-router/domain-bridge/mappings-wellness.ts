/**
 * Wellness & Lifestyle Mappings
 *
 * Connection/Loneliness, Anger, Dating, Books, Video, Health, Home,
 * Learning, Legal, Self-Compassion, Meaning/Purpose, Trauma, Relationships,
 * Recommendations, Travel, Smart Home, Group Conversations, Coaching.
 *
 * @module tools/semantic-router/domain-bridge/mappings-wellness
 */

import type { ToolMapping } from './types.js';

export const WELLNESS_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // 🤗 CONNECTION & LONELINESS (7 tools)
  // ==========================================================================
  connection_loneliness: { domainToolId: 'acknowledgeLoneliness' },
  connection_presence: { domainToolId: 'offerPresence' },
  connection_make_friends: {
    domainToolId: 'makeFriends',
    transformArgs: (args) => ({ context: args.context }),
  },
  connection_maintain: {
    domainToolId: 'maintainConnections',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  connection_belonging: {
    domainToolId: 'findBelonging',
    transformArgs: (args) => ({ interests: args.interests }),
  },
  connection_health: { domainToolId: 'assessConnectionHealth' },
  connection_small_acts: { domainToolId: 'smallActsOfConnection' },

  // ==========================================================================
  // 😠 ANGER MANAGEMENT (8 tools)
  // ==========================================================================
  anger_validate: {
    domainToolId: 'understandAnger',
    transformArgs: (args) => ({ situation: args.situation, context: 'validate' }),
  },
  anger_physical_release: {
    domainToolId: 'angerCoolDown',
    transformArgs: () => ({ method: 'physical' }),
  },
  anger_cool_down: {
    domainToolId: 'angerCoolDown',
    transformArgs: (args) => ({ intensity: args.intensity }),
  },
  anger_to_action: {
    domainToolId: 'expressAngerHealthily',
    transformArgs: (args) => ({ situation: args.situation, mode: 'constructive' }),
  },
  anger_journaling: {
    domainToolId: 'expressAngerHealthily',
    transformArgs: (args) => ({ trigger: args.trigger, method: 'journaling' }),
  },
  anger_identify_triggers: { domainToolId: 'identifyAngerTriggers' },
  anger_assertive_communication: {
    domainToolId: 'assertNotAggressive',
    transformArgs: (args) => ({ message: args.message }),
  },
  anger_history: {
    domainToolId: 'chronicAnger',
    transformArgs: () => ({ mode: 'history_exploration' }),
  },

  // ==========================================================================
  // 💕 DATING (4 tools)
  // ==========================================================================
  dating_advice: {
    domainToolId: 'datingAdvice',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  dating_apps: {
    domainToolId: 'datingAppStrategy',
    transformArgs: (args) => ({ platform: args.platform }),
  },
  dating_first_date: {
    domainToolId: 'firstDatePrep',
    transformArgs: (args) => ({ context: args.context }),
  },
  dating_breakup: {
    domainToolId: 'breakupSupport',
    transformArgs: (args) => ({ stage: args.stage }),
  },

  // ==========================================================================
  // 📚 BOOKS (8 tools)
  // ==========================================================================
  books_search: {
    domainToolId: 'searchBooks',
    transformArgs: (args) => ({ query: args.query, genre: args.genre }),
  },
  books_what_to_read: {
    domainToolId: 'recommendBook',
    transformArgs: (args) => ({ mood: args.mood, genre: args.genre }),
  },
  books_popular: {
    domainToolId: 'getPopularBooks',
    transformArgs: (args) => ({ genre: args.genre }),
  },
  books_add_to_list: {
    domainToolId: 'addToReadingList',
    transformArgs: (args) => ({ title: args.title, author: args.author }),
  },
  books_get_list: { domainToolId: 'getReadingList' },
  books_mark_read: {
    domainToolId: 'markBookRead',
    transformArgs: (args) => ({ title: args.title, rating: args.rating }),
  },
  books_remove: {
    domainToolId: 'removeFromReadingList',
    transformArgs: (args) => ({ title: args.title }),
  },
  books_stats: { domainToolId: 'getReadingStats' },

  // ==========================================================================
  // 🎬 VIDEO (4 tools)
  // ==========================================================================
  video_search_youtube: {
    domainToolId: 'searchYouTube',
    transformArgs: (args) => ({ query: args.query }),
  },
  video_recommendations: {
    domainToolId: 'recommendVideos',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  video_trending: {
    domainToolId: 'getTrendingVideos',
    transformArgs: (args) => ({ category: args.category }),
  },
  video_details: {
    domainToolId: 'getVideoDetails',
    transformArgs: (args) => ({ videoId: args.videoId }),
  },

  // ==========================================================================
  // 🏥 HEALTH & WELLNESS (12 tools)
  // ==========================================================================
  health_energy: { domainToolId: 'assessEnergyLevel' },
  health_energy_boost: {
    domainToolId: 'suggestEnergyBoost',
    transformArgs: (args) => ({ currentEnergy: args.currentEnergy }),
  },
  health_hydration: {
    domainToolId: 'trackHydration',
    transformArgs: (args) => ({ glasses: args.glasses }),
  },
  health_sleep: {
    domainToolId: 'analyzeSleepPattern',
    transformArgs: (args) => ({ hours: args.hours, quality: args.quality }),
  },
  health_sleep_tips: {
    domainToolId: 'suggestSleepHygiene',
    transformArgs: (args) => ({ issue: args.issue }),
  },
  health_nutrition: {
    domainToolId: 'nutritionAdvice',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  health_log_exercise: {
    domainToolId: 'logExercise',
    transformArgs: (args) => ({ type: args.type, duration: args.duration }),
  },
  health_suggest_workout: {
    domainToolId: 'suggestWorkout',
    transformArgs: (args) => ({ fitness: args.fitness, time: args.time }),
  },
  sleep_help: {
    domainToolId: 'sleepSupport',
    transformArgs: (args) => ({ issue: args.issue }),
  },
  wellness_checkin: { domainToolId: 'wellnessCheckin' },

  // ==========================================================================
  // 🏠 HOME (7 tools)
  // ==========================================================================
  home_maintenance: {
    domainToolId: 'homeMaintenanceReminder',
    transformArgs: (args) => ({ area: args.area }),
  },
  home_repair: {
    domainToolId: 'homeRepairAdvice',
    transformArgs: (args) => ({ issue: args.issue }),
  },
  home_contractor: {
    domainToolId: 'findContractor',
    transformArgs: (args) => ({ service: args.service }),
  },
  home_organize: {
    domainToolId: 'organizeSpace',
    transformArgs: (args) => ({ space: args.space }),
  },
  home_declutter: {
    domainToolId: 'declutterHelp',
    transformArgs: (args) => ({ area: args.area }),
  },
  home_move: {
    domainToolId: 'movingChecklist',
    transformArgs: (args) => ({ timeline: args.timeline }),
  },
  home_project: {
    domainToolId: 'homeProjectPlanner',
    transformArgs: (args) => ({ project: args.project }),
  },
  home_emergency: { domainToolId: 'assessEmergencyPreparedness' },

  // ==========================================================================
  // 📖 LEARNING (4 tools)
  // ==========================================================================
  learning_skills: {
    domainToolId: 'learnNewSkill',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_study: {
    domainToolId: 'studyTechniques',
    transformArgs: (args) => ({ subject: args.subject }),
  },
  learning_language: {
    domainToolId: 'languageLearning',
    transformArgs: (args) => ({ language: args.language, level: args.level }),
  },
  learning_explain: {
    domainToolId: 'explainConcept',
    transformArgs: (args) => ({ concept: args.topic || args.concept, level: args.level }),
  },

  // ==========================================================================
  // ⚖️ LEGAL & ADMIN (7 tools)
  // ==========================================================================
  legal_organize_docs: {
    domainToolId: 'organizeDocuments',
    transformArgs: (args) => ({ category: args.category }),
  },
  legal_locate_doc: {
    domainToolId: 'findDocument',
    transformArgs: (args) => ({ docType: args.docType }),
  },
  legal_estate_planning: { domainToolId: 'estatePlanningChecklist' },
  legal_insurance: {
    domainToolId: 'insuranceReview',
    transformArgs: (args) => ({ type: args.type }),
  },
  legal_beneficiaries: { domainToolId: 'reviewBeneficiaries' },
  legal_tax_prep: {
    domainToolId: 'taxPrepChecklist',
    transformArgs: (args) => ({ year: args.year }),
  },
  legal_annual_tasks: { domainToolId: 'reminderAnnualTasks' },

  // ==========================================================================
  // 🧘 SELF-COMPASSION (12 tools)
  // ==========================================================================
  self_compassion_inner_critic: {
    domainToolId: 'innerCriticWork',
    transformArgs: (args) => ({ criticism: args.criticism }),
  },
  self_compassion_self_talk: {
    domainToolId: 'reframeSelfTalk',
    transformArgs: (args) => ({ thought: args.thought }),
  },
  self_compassion_forgiveness: {
    domainToolId: 'selfForgiveness',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  self_compassion_perfectionism: {
    domainToolId: 'addressPerfectionism',
    transformArgs: (args) => ({ area: args.area }),
  },
  self_compassion_imposter: {
    domainToolId: 'addressImposter',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  self_compassion_comparison: {
    domainToolId: 'stopComparing',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  self_compassion_shame: {
    domainToolId: 'processShame',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  self_compassion_worth: { domainToolId: 'affirmWorth' },
  self_compassion_break: { domainToolId: 'selfCompassionBreak' },
  self_compassion_self_care: {
    domainToolId: 'suggestSelfCare',
    transformArgs: (args) => ({ need: args.need }),
  },
  self_compassion_boundaries: { domainToolId: 'boundaryInventory' },
  self_compassion_body_image: {
    domainToolId: 'bodyImageCompassion',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },

  // ==========================================================================
  // 🧠 MEANING & PURPOSE (12 tools)
  // ==========================================================================
  meaning_clarify_values: { domainToolId: 'clarifyValues' },
  meaning_purpose: {
    domainToolId: 'explorePurpose',
    transformArgs: (args) => ({ area: args.area }),
  },
  meaning_purpose_statement: { domainToolId: 'createPurposeStatement' },
  meaning_legacy: { domainToolId: 'exploreLegacy' },
  meaning_existential: {
    domainToolId: 'existentialExploration',
    transformArgs: (args) => ({ question: args.question }),
  },
  meaning_philosophical: {
    domainToolId: 'philosophicalInquiry',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  meaning_spiritual: {
    domainToolId: 'spiritualExploration',
    transformArgs: (args) => ({ tradition: args.tradition }),
  },
  meaning_value_conflict: {
    domainToolId: 'valueConflict',
    transformArgs: (args) => ({ values: args.values }),
  },
  meaning_moral_dilemma: {
    domainToolId: 'moralDilemma',
    transformArgs: (args) => ({ dilemma: args.dilemma }),
  },
  meaning_authentic: {
    domainToolId: 'authenticLiving',
    transformArgs: (args) => ({ area: args.area }),
  },
  meaning_making: {
    domainToolId: 'meaningMaking',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  meaning_work: {
    domainToolId: 'meaningfulWork',
    transformArgs: (args) => ({ currentSituation: args.currentSituation }),
  },

  // ==========================================================================
  // 🛡️ TRAUMA SUPPORT (7 tools)
  // ==========================================================================
  trauma_aware_support: {
    domainToolId: 'traumaAwareSupport',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  trauma_grounding: {
    domainToolId: 'groundingForTrauma',
    transformArgs: (args) => ({ intensity: args.intensity }),
  },
  trauma_education: {
    domainToolId: 'traumaEducation',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  trauma_window_of_tolerance: {
    domainToolId: 'windowOfTolerance',
    transformArgs: (args) => ({ state: args.state }),
  },
  trauma_support_system: { domainToolId: 'buildSupportSystem' },
  trauma_professional_resources: {
    domainToolId: 'professionalResources',
    transformArgs: (args) => ({ need: args.need }),
  },
  trauma_timeline: {
    domainToolId: 'processTraumaTimeline',
    transformArgs: (args) => ({ ready: args.ready }),
  },

  // ==========================================================================
  // 💑 RELATIONSHIPS (3 tools)
  // ==========================================================================
  relationship_advice: {
    domainToolId: 'assessRelationshipHealth',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  relationship_conflict: {
    domainToolId: 'navigateConflict',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  relationship_family: {
    domainToolId: 'supportFamilyTransition',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  relationship_friendship: {
    domainToolId: 'checkInOnSomeone',
    transformArgs: (args) => ({ situation: args.situation }),
  },

  // ==========================================================================
  // 🎁 RECOMMENDATIONS (4 tools)
  // ==========================================================================
  recommend_books: {
    domainToolId: 'recommendBook',
    transformArgs: (args) => ({ mood: args.mood, genre: args.genre }),
  },
  recommend_podcasts: {
    domainToolId: 'recommendPodcast',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  recommend_restaurants: {
    domainToolId: 'recommendRestaurant',
    transformArgs: (args) => ({ cuisine: args.cuisine, occasion: args.occasion }),
  },
  recommend_gifts: {
    domainToolId: 'recommendGift',
    transformArgs: (args) => ({ person: args.person, occasion: args.occasion }),
  },

  // ==========================================================================
  // ✈️ TRAVEL (6 tools)
  // ==========================================================================
  travel_search_flights: {
    domainToolId: 'searchFlights',
    transformArgs: (args) => ({
      from: args.from, to: args.to, date: args.date, returnDate: args.returnDate,
    }),
  },
  travel_search_hotels: {
    domainToolId: 'searchHotels',
    transformArgs: (args) => ({
      location: args.location, checkIn: args.checkIn, checkOut: args.checkOut,
    }),
  },
  travel_flight_price: {
    domainToolId: 'getFlightPrice',
    transformArgs: (args) => ({ from: args.from, to: args.to, date: args.date }),
  },
  travel_plan_trip: {
    domainToolId: 'planTrip',
    transformArgs: (args) => ({ destination: args.destination, duration: args.duration }),
  },
  travel_suggestions: {
    domainToolId: 'suggestDestination',
    transformArgs: (args) => ({ preferences: args.preferences }),
  },
  travel_saved_trips: { domainToolId: 'getSavedTrips' },

  // ==========================================================================
  // 🏠 SMART HOME & VIBE (8 tools)
  // ==========================================================================
  smarthome_lights: {
    domainToolId: 'controlLights',
    transformArgs: (args) => ({ room: args.room, action: args.action, brightness: args.brightness }),
  },
  smarthome_thermostat: {
    domainToolId: 'setThermostatTemperature',
    transformArgs: (args) => ({ temperature: args.temperature }),
  },
  smarthome_locks: {
    domainToolId: 'controlLocks',
    transformArgs: (args) => ({ lock: args.lock, action: args.action }),
  },
  smarthome_devices: { domainToolId: 'listSmartDevices' },
  setVibe: {
    domainToolId: 'setVibe',
    transformArgs: (args) => ({ vibe: args.vibe, room: args.room }),
  },
  listVibes: { domainToolId: 'listVibes' },
  adjustLights: {
    domainToolId: 'adjustLights',
    transformArgs: (args) => ({ room: args.room, level: args.level, color: args.color }),
  },
  getEnvironmentStatus: { domainToolId: 'getEnvironmentStatus' },

  // ==========================================================================
  // 👥 GROUP CONVERSATIONS (3 tools)
  // ==========================================================================
  startRoundtable: {
    domainToolId: 'startRoundtable',
    transformArgs: (args) => ({ topic: args.topic, participants: args.participants }),
  },
  inviteParticipant: {
    domainToolId: 'inviteToConversation',
    transformArgs: (args) => ({ participant: args.participant }),
  },
  endGroupConversation: { domainToolId: 'endGroupConversation' },

  // ==========================================================================
  // 🧠 COACHING SPECIALTIES (7 tools)
  // ==========================================================================
  coaching_motivation: {
    domainToolId: 'motivationCoaching',
    transformArgs: (args) => ({ area: args.area }),
  },
  coaching_procrastination: {
    domainToolId: 'procrastinationSupport',
    transformArgs: (args) => ({ task: args.task }),
  },
  coaching_perfectionism: {
    domainToolId: 'addressPerfectionism',
    transformArgs: (args) => ({ area: args.area }),
  },
  coaching_boundaries: {
    domainToolId: 'boundaryCoaching',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  coaching_self_compassion: { domainToolId: 'selfCompassionCoaching' },
  coaching_burnout: {
    domainToolId: 'burnoutCoaching',
    transformArgs: (args) => ({ severity: args.severity }),
  },
  coaching_anger: {
    domainToolId: 'angerCoaching',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
};
