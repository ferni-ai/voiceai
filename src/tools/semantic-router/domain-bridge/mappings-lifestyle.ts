/**
 * Lifestyle & Daily Living Mappings
 *
 * Shame, Job Loss, Procrastination, Perfectionism, Social Skills,
 * Difficult Conversations, Smart Home, Transport, Meals, Milestones,
 * Proactive, Routines, Automations, Social Media, Learning,
 * Human Transfer, Behavior, Awareness, Projects, Subscriptions,
 * Visual, Voice, Podcasts.
 *
 * @module tools/semantic-router/domain-bridge/mappings-lifestyle
 */

import type { ToolMapping } from './types.js';

export const LIFESTYLE_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // 😔 SHAME & RESENTMENT (8 tools)
  // ==========================================================================
  shame_explore: {
    domainToolId: 'exploreShame',
    transformArgs: (args) => ({ trigger: args.trigger }),
  },
  shame_triggers: { domainToolId: 'identifyShameTriggers' },
  shame_guilt: { domainToolId: 'distinguishShameFromGuilt' },
  shame_heal: { domainToolId: 'healCoreShame' },
  shame_process: {
    domainToolId: 'processShameExperience',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  resentment_inventory: { domainToolId: 'resentmentInventory' },
  resentment_family: {
    domainToolId: 'resentmentInFamily',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  resentment_release: {
    domainToolId: 'releaseResentment',
    transformArgs: (args) => ({ toward: args.toward }),
  },

  // ==========================================================================
  // 💼 JOB LOSS (4 tools)
  // ==========================================================================
  job_loss_grief: { domainToolId: 'jobLossGrief' },
  job_loss_identity: { domainToolId: 'identityAfterLayoff' },
  job_loss_mental: { domainToolId: 'jobSearchMentalHealth' },
  job_loss_search: { domainToolId: 'job-search' },

  // ==========================================================================
  // 🏃 PROCRASTINATION (4 tools)
  // ==========================================================================
  procrastination_patterns: { domainToolId: 'procrastinationPatterns' },
  procrastination_root: {
    domainToolId: 'procrastinationRootCause',
    transformArgs: (args) => ({ task: args.task }),
  },
  procrastination_emotional: {
    domainToolId: 'emotionalProcrastination',
    transformArgs: (args) => ({ emotion: args.emotion }),
  },
  procrastination_two_min: {
    domainToolId: 'twoMinuteRule',
    transformArgs: (args) => ({ task: args.task }),
  },

  // ==========================================================================
  // 🎯 PERFECTIONISM (3 tools)
  // ==========================================================================
  perfectionism_understand: { domainToolId: 'understandPerfectionism' },
  perfectionism_triggers: { domainToolId: 'perfectionismTriggers' },
  perfectionism_healthy: { domainToolId: 'healthyStriving' },

  // ==========================================================================
  // 🗣️ SOCIAL SKILLS (4 tools)
  // ==========================================================================
  social_small_talk: { domainToolId: 'smallTalkMastery' },
  social_anxiety: {
    domainToolId: 'navigateSocialAnxiety',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  social_rejection: {
    domainToolId: 'handleSocialRejection',
    transformArgs: (args) => ({ rejection: args.rejection }),
  },
  social_friendship: { domainToolId: 'socialFriendshipSkills' },

  // ==========================================================================
  // 🎤 DIFFICULT CONVERSATIONS (6 tools)
  // ==========================================================================
  difficult_prepare: {
    domainToolId: 'prepareForDifficultConversation',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  difficult_practice: {
    domainToolId: 'practiceConversation',
    transformArgs: (args) => ({ scenario: args.scenario }),
  },
  difficult_boundary: {
    domainToolId: 'setBoundaryConversation',
    transformArgs: (args) => ({ boundary: args.boundary }),
  },
  difficult_conflict: {
    domainToolId: 'conflictResolution',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  difficult_anticipate: {
    domainToolId: 'anticipateResponses',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  difficult_script: {
    domainToolId: 'buildScript',
    transformArgs: (args) => ({ situation: args.situation }),
  },

  // ==========================================================================
  // 🏠 SMART HOME (12 tools)
  // ==========================================================================
  smarthome_scene: {
    domainToolId: 'activateScene',
    transformArgs: (args) => ({ scene: args.scene }),
  },
  smarthome_light: {
    domainToolId: 'controlLight',
    transformArgs: (args) => ({ room: args.room, action: args.action }),
  },
  smarthome_lock: {
    domainToolId: 'controlLock',
    transformArgs: (args) => ({ lock: args.lock, action: args.action }),
  },
  smarthome_devices_list: { domainToolId: 'listDevices' },
  sonos_play: { domainToolId: 'playSonosMusic', transformArgs: (args) => ({ query: args.query }) },
  sonos_pause: { domainToolId: 'pauseSonos' },
  sonos_resume: { domainToolId: 'resumeSonos' },
  sonos_volume: {
    domainToolId: 'setSonosVolume',
    transformArgs: (args) => ({ volume: args.volume }),
  },
  sonos_room: { domainToolId: 'setSonosRoom', transformArgs: (args) => ({ room: args.room }) },
  sonos_rooms: { domainToolId: 'listSonosRooms' },
  sonos_playing: { domainToolId: 'whatsSonosPlaying' },

  // ==========================================================================
  // 🚗 TRANSPORTATION & RIDES (6 tools)
  // ==========================================================================
  ride_request: {
    domainToolId: 'requestRide',
    transformArgs: (args) => ({ destination: args.destination }),
  },
  ride_status: { domainToolId: 'getRideStatus' },
  ride_cancel: { domainToolId: 'cancelRide' },
  ride_schedule: {
    domainToolId: 'scheduleRide',
    transformArgs: (args) => ({ destination: args.destination, time: args.time }),
  },
  commute_time: {
    domainToolId: 'getCommuteTime',
    transformArgs: (args) => ({ destination: args.destination }),
  },
  food_delivery: {
    domainToolId: 'foodDelivery',
    transformArgs: (args) => ({ restaurant: args.restaurant }),
  },

  // ==========================================================================
  // 🍳 MEAL PLANNING & RECIPES (6 tools)
  // ==========================================================================
  meal_plan: { domainToolId: 'planWeeklyMeals' },
  meal_suggest: {
    domainToolId: 'suggestMeals',
    transformArgs: (args) => ({ preferences: args.preferences }),
  },
  recipe_add: {
    domainToolId: 'addRecipe',
    transformArgs: (args) => ({ name: args.name, ingredients: args.ingredients }),
  },
  recipe_cooked: {
    domainToolId: 'markRecipeCooked',
    transformArgs: (args) => ({ recipe: args.recipe }),
  },
  diet_track: {
    domainToolId: 'trackDietaryPreferences',
    transformArgs: (args) => ({ preference: args.preference }),
  },
  grocery_list: { domainToolId: 'generateShoppingList' },

  // ==========================================================================
  // 🎉 MILESTONES & CELEBRATIONS (8 tools)
  // ==========================================================================
  milestone_detect: { domainToolId: 'detectMilestones' },
  milestone_birthdays: { domainToolId: 'getUpcomingBirthdays' },
  milestone_anniversary: {
    domainToolId: 'anniversarySupport',
    transformArgs: (args) => ({ type: args.type }),
  },
  milestone_set_birthday: {
    domainToolId: 'setBirthday',
    transformArgs: (args) => ({ person: args.person, date: args.date }),
  },
  milestone_set_anniversary: {
    domainToolId: 'setAnniversary',
    transformArgs: (args) => ({ type: args.type, date: args.date }),
  },
  celebrate_win: { domainToolId: 'celebrateWin', transformArgs: (args) => ({ win: args.win }) },
  celebrate_progress: {
    domainToolId: 'celebrateProgress',
    transformArgs: (args) => ({ progress: args.progress }),
  },
  celebrate_completion: {
    domainToolId: 'celebrateCompletion',
    transformArgs: (args) => ({ task: args.task }),
  },

  // ==========================================================================
  // 📊 PROACTIVE & BACKGROUND (10 tools)
  // ==========================================================================
  proactive_message: {
    domainToolId: 'generateProactiveMessage',
    transformArgs: (args) => ({ context: args.context }),
  },
  proactive_insights: { domainToolId: 'getProactiveInsights' },
  background_call: {
    domainToolId: 'backgroundCall',
    transformArgs: (args) => ({ contact: args.contact, purpose: args.purpose }),
  },
  background_research: {
    domainToolId: 'backgroundResearch',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  background_reservation: {
    domainToolId: 'backgroundReservation',
    transformArgs: (args) => ({ restaurant: args.restaurant, time: args.time }),
  },
  background_followup: {
    domainToolId: 'backgroundFollowUp',
    transformArgs: (args) => ({ contact: args.contact }),
  },
  concierge_status: { domainToolId: 'checkConciergeStatus' },
  concierge_checkin: { domainToolId: 'proactiveConciergeCheckIn' },
  local_search_status: { domainToolId: 'checkLocalSearchStatus' },
  local_search: {
    domainToolId: 'searchLocalBusinesses',
    transformArgs: (args) => ({ query: args.query }),
  },

  // ==========================================================================
  // 📅 ROUTINES (6 tools)
  // ==========================================================================
  routine_create: {
    domainToolId: 'createRoutine',
    transformArgs: (args) => ({ name: args.name, steps: args.steps }),
  },
  routine_list: { domainToolId: 'listRoutines' },
  routine_run: { domainToolId: 'runRoutine', transformArgs: (args) => ({ routine: args.routine }) },
  routine_toggle: {
    domainToolId: 'toggleRoutine',
    transformArgs: (args) => ({ routine: args.routine }),
  },
  routine_remove: {
    domainToolId: 'removeRoutine',
    transformArgs: (args) => ({ routine: args.routine }),
  },
  routine_suggest: {
    domainToolId: 'suggestRoutines',
    transformArgs: (args) => ({ goal: args.goal }),
  },

  // ==========================================================================
  // 🤖 AUTOMATIONS & WEBHOOKS (8 tools)
  // ==========================================================================
  automation_create: {
    domainToolId: 'createAutomation',
    transformArgs: (args) => ({ trigger: args.trigger, action: args.action }),
  },
  automation_list: { domainToolId: 'listAutomations' },
  automation_pause: { domainToolId: 'pauseAutomation', transformArgs: (args) => ({ id: args.id }) },
  automation_resume: {
    domainToolId: 'resumeAutomation',
    transformArgs: (args) => ({ id: args.id }),
  },
  automation_delete: {
    domainToolId: 'deleteAutomation',
    transformArgs: (args) => ({ id: args.id }),
  },
  automation_trigger: {
    domainToolId: 'triggerAutomation',
    transformArgs: (args) => ({ id: args.id }),
  },
  webhook_list: { domainToolId: 'listWebhooks' },
  webhook_trigger: {
    domainToolId: 'triggerWebhook',
    transformArgs: (args) => ({ webhook: args.webhook }),
  },

  // ==========================================================================
  // 📱 SOCIAL MEDIA POSTING (4 tools)
  // ==========================================================================
  social_post_twitter: {
    domainToolId: 'postToTwitter',
    transformArgs: (args) => ({ content: args.content }),
  },
  social_post_linkedin: {
    domainToolId: 'postToLinkedIn',
    transformArgs: (args) => ({ content: args.content }),
  },
  social_schedule: { domainToolId: 'listScheduledPosts' },
  social_content: {
    domainToolId: 'generateSocialContent',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 🎓 LEARNING (8 tools)
  // ==========================================================================
  learning_path: {
    domainToolId: 'createLearningPath',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_get_path: {
    domainToolId: 'getLearningPath',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_progress: {
    domainToolId: 'trackLearningProgress',
    transformArgs: (args) => ({ skill: args.skill }),
  },
  learning_block: {
    domainToolId: 'overcomeLearningBlock',
    transformArgs: (args) => ({ block: args.block }),
  },
  learning_goal: {
    domainToolId: 'setLearningGoal',
    transformArgs: (args) => ({ goal: args.goal }),
  },
  learning_plan_study: {
    domainToolId: 'planStudySession',
    transformArgs: (args) => ({ subject: args.subject }),
  },
  learning_test: {
    domainToolId: 'testKnowledge',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  learning_spaced: {
    domainToolId: 'scheduleSpacedRepetition',
    transformArgs: (args) => ({ topic: args.topic }),
  },

  // ==========================================================================
  // 📞 HUMAN TRANSFER (3 tools)
  // ==========================================================================
  human_evaluate: {
    domainToolId: 'evaluateHumanTransfer',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  human_connect: {
    domainToolId: 'connectToHumanExpert',
    transformArgs: (args) => ({ expertise: args.expertise }),
  },
  human_crisis: { domainToolId: 'quickCrisisResources' },

  // ==========================================================================
  // 🧘 BEHAVIOR & PRESENCE (6 tools)
  // ==========================================================================
  behavior_shift: { domainToolId: 'shiftMode', transformArgs: (args) => ({ mode: args.mode }) },
  behavior_pacing: { domainToolId: 'adjustPacing', transformArgs: (args) => ({ pace: args.pace }) },
  behavior_processing: { domainToolId: 'processing' },
  behavior_hold_space: { domainToolId: 'holdSpace' },
  behavior_presence: { domainToolId: 'expressPresence' },
  behavior_breathe: { domainToolId: 'breatheWithMe' },

  // ==========================================================================
  // 🔍 AWARENESS & CONTEXT (6 tools)
  // ==========================================================================
  awareness_current: { domainToolId: 'getCurrentContext' },
  awareness_user: { domainToolId: 'getUserContext' },
  awareness_conversation: { domainToolId: 'getConversationAwareness' },
  awareness_today: { domainToolId: 'getTodaySignificance' },
  awareness_trigger: {
    domainToolId: 'triggerAwareness',
    transformArgs: (args) => ({ type: args.type }),
  },
  awareness_predict: { domainToolId: 'getPredictions' },

  // ==========================================================================
  // 🎯 PROJECTS (6 tools)
  // ==========================================================================
  project_create: { domainToolId: 'createProject', transformArgs: (args) => ({ name: args.name }) },
  project_status: {
    domainToolId: 'getProjectStatus',
    transformArgs: (args) => ({ project: args.project }),
  },
  project_task_add: {
    domainToolId: 'addProjectTask',
    transformArgs: (args) => ({ project: args.project, task: args.task }),
  },
  project_task_complete: {
    domainToolId: 'completeProjectTask',
    transformArgs: (args) => ({ taskId: args.taskId }),
  },
  project_templates: { domainToolId: 'listProjectTemplates' },
  project_track: {
    domainToolId: 'trackCreativeProject',
    transformArgs: (args) => ({ project: args.project }),
  },

  // ==========================================================================
  // 📊 SUBSCRIPTIONS & FINANCE TRACKING (4 tools)
  // ==========================================================================
  subscription_detect: { domainToolId: 'detectSubscriptions' },
  subscription_summary: { domainToolId: 'getSubscriptionSummary' },
  subscription_cancel: {
    domainToolId: 'cancelSubscription',
    transformArgs: (args) => ({ subscription: args.subscription }),
  },
  insurance_renewal: {
    domainToolId: 'setInsuranceRenewal',
    transformArgs: (args) => ({ type: args.type, date: args.date }),
  },

  // ==========================================================================
  // 📸 VISUAL MEMORY (4 tools)
  // ==========================================================================
  visual_list: { domainToolId: 'listRecentPhotos' },
  visual_describe: {
    domainToolId: 'describeSharedPhoto',
    transformArgs: (args) => ({ photoId: args.photoId }),
  },
  visual_recall: {
    domainToolId: 'recallVisualMemory',
    transformArgs: (args) => ({ query: args.query }),
  },
  visual_count: { domainToolId: 'countVisualMemories' },

  // ==========================================================================
  // 🎤 VOICE ENROLLMENT (3 tools)
  // ==========================================================================
  voice_enroll_start: { domainToolId: 'getStarted' },
  voice_enroll_friend: {
    domainToolId: 'inviteFriendByCall',
    transformArgs: (args) => ({ name: args.name, phone: args.phone }),
  },
  voice_enroll_support: {
    domainToolId: 'sendSupportCall',
    transformArgs: (args) => ({ contact: args.contact }),
  },

  // ==========================================================================
  // 🎙️ PODCASTS (4 tools)
  // ==========================================================================
  podcast_episodes: {
    domainToolId: 'getPodcastEpisodes',
    transformArgs: (args) => ({ podcast: args.podcast }),
  },
  podcast_recommend: {
    domainToolId: 'getPodcastRecommendations',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  podcast_top: {
    domainToolId: 'getTopPodcasts',
    transformArgs: (args) => ({ category: args.category }),
  },
  video_recommend: {
    domainToolId: 'getVideoRecommendations',
    transformArgs: (args) => ({ topic: args.topic }),
  },
};
