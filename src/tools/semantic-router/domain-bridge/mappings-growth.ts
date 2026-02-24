/**
 * Growth & Deep Human Engagement Mappings
 *
 * Life Transitions, Life Planning, Life Thesis, Timeless Perspective,
 * Meaning/Purpose, Presence/Mindfulness, Vulnerability/Growth,
 * Play/Creativity, Quiet Growth, Second Chances, Connection, Dating.
 *
 * @module tools/semantic-router/domain-bridge/mappings-growth
 */

import type { ToolMapping } from './types.js';

export const GROWTH_MAPPINGS: Record<string, ToolMapping> = {
  // ==========================================================================
  // 🧭 LIFE TRANSITIONS (12 tools)
  // ==========================================================================
  transition_acknowledge: {
    domainToolId: 'acknowledgeTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_stage: {
    domainToolId: 'transitionStage',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_navigate: {
    domainToolId: 'navigateTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_anticipate: {
    domainToolId: 'anticipateTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_new_normal: { domainToolId: 'adaptToNewNormal' },
  transition_ritual: {
    domainToolId: 'createTransitionRitual',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_meaning: {
    domainToolId: 'findMeaningInTransition',
    transformArgs: (args) => ({ transition: args.transition }),
  },
  transition_identity: {
    domainToolId: 'exploreIdentityShift',
    transformArgs: (args) => ({ from: args.from, to: args.to }),
  },
  transition_first_time: {
    domainToolId: 'navigateFirstTime',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  transition_what_was: { domainToolId: 'acknowledgeWhatWas' },
  transition_grieve: {
    domainToolId: 'grieveWhatWas',
    transformArgs: (args) => ({ loss: args.loss }),
  },
  transition_keep: { domainToolId: 'identifyWhatToKeep' },

  // ==========================================================================
  // 🌟 LIFE PLANNING (10 tools)
  // ==========================================================================
  life_dream: { domainToolId: 'captureDream', transformArgs: (args) => ({ dream: args.dream }) },
  life_explore: { domainToolId: 'exploreDream', transformArgs: (args) => ({ dream: args.dream }) },
  life_mission: { domainToolId: 'createPersonalMission' },
  life_legacy: { domainToolId: 'defineLegacy' },
  life_chapter: {
    domainToolId: 'exploreLifeChapter',
    transformArgs: (args) => ({ chapter: args.chapter }),
  },
  life_philosophy: { domainToolId: 'exploreLifePhilosophy' },
  life_story: {
    domainToolId: 'captureLifeStory',
    transformArgs: (args) => ({ prompt: args.prompt }),
  },
  life_question: {
    domainToolId: 'captureQuestion',
    transformArgs: (args) => ({ question: args.question }),
  },
  life_explore_question: {
    domainToolId: 'exploreQuestion',
    transformArgs: (args) => ({ question: args.question }),
  },
  life_readiness: { domainToolId: 'assessReadinessForChange' },

  // ==========================================================================
  // 🎯 LIFE THESIS (4 tools)
  // ==========================================================================
  thesis_incubate: {
    domainToolId: 'trackWisdomIncubation',
    transformArgs: (args) => ({ topic: args.topic }),
  },
  thesis_koan: { domainToolId: 'generatePersonalKoan' },
  thesis_sit: {
    domainToolId: 'sitWithBigQuestion',
    transformArgs: (args) => ({ question: args.question }),
  },
  thesis_archive: {
    domainToolId: 'archiveInsight',
    transformArgs: (args) => ({ insight: args.insight }),
  },

  // ==========================================================================
  // 🔮 TIMELESS PERSPECTIVE (8 tools)
  // ==========================================================================
  timeless_future_self: {
    domainToolId: 'futureSelf',
    transformArgs: (args) => ({ years: args.years }),
  },
  timeless_mortality: { domainToolId: 'exploreMortality' },
  timeless_decade: { domainToolId: 'decadeView' },
  timeless_what_matters: { domainToolId: 'whatWillMatter' },
  timeless_zoom_out: { domainToolId: 'zoomOut' },
  timeless_this_passes: { domainToolId: 'thisTooPasses' },
  timeless_enough: { domainToolId: 'enoughForToday' },
  timeless_ethical_will: { domainToolId: 'writeEthicalWill' },

  // ==========================================================================
  // 💫 MEANING & PURPOSE (12 tools)
  // ==========================================================================
  meaning_daily: { domainToolId: 'dailyMeaningPractice' },
  meaning_suffering: {
    domainToolId: 'findMeaningInSuffering',
    transformArgs: (args) => ({ suffering: args.suffering }),
  },
  meaning_find_work: { domainToolId: 'findMeaningInWork' },
  meaning_align_actions: { domainToolId: 'alignActionsWithPurpose' },
  meaning_values_check: { domainToolId: 'checkValuesAlignment' },
  meaning_values_sort: { domainToolId: 'valuesCardSort' },
  meaning_value_resolution: {
    domainToolId: 'valueConflictResolution',
    transformArgs: (args) => ({ conflict: args.conflict }),
  },
  meaning_becoming: { domainToolId: 'whoAmIBecoming' },
  meaning_live_authentic: { domainToolId: 'livingAuthentically' },
  meaning_contribution: { domainToolId: 'reflectOnContribution' },
  meaning_enoughness: { domainToolId: 'enoughness' },
  meaning_track_enough: { domainToolId: 'trackEnough' },

  // ==========================================================================
  // 🧘 PRESENCE & MINDFULNESS (10 tools)
  // ==========================================================================
  presence_moment: { domainToolId: 'noticeThisMoment' },
  presence_protect: { domainToolId: 'protectPresence' },
  presence_joy: { domainToolId: 'noticeJoy' },
  presence_schedule_joy: {
    domainToolId: 'scheduleJoy',
    transformArgs: (args) => ({ activity: args.activity }),
  },
  presence_map_joy: { domainToolId: 'mapJoy' },
  presence_savor: {
    domainToolId: 'savorExperience',
    transformArgs: (args) => ({ experience: args.experience }),
  },
  presence_return: { domainToolId: 'returnToPresent' },
  presence_ground: { domainToolId: 'groundInBody' },
  presence_walking: { domainToolId: 'walkingMeditation' },
  presence_slow: { domainToolId: 'slowDown' },

  // ==========================================================================
  // 💪 VULNERABILITY & GROWTH (8 tools)
  // ==========================================================================
  vulnerability_relationship: {
    domainToolId: 'vulnerabilityInRelationship',
    transformArgs: (args) => ({ relationship: args.relationship }),
  },
  vulnerability_hidden: { domainToolId: 'revealHiddenSelf' },
  vulnerability_blind_spot: { domainToolId: 'revealBlindSpot' },
  vulnerability_safe_space: { domainToolId: 'createSafeSpace' },
  vulnerability_secret: {
    domainToolId: 'holdSecret',
    transformArgs: (args) => ({ context: args.context }),
  },
  growth_areas: { domainToolId: 'exploreGrowthAreas' },
  growth_plateau: { domainToolId: 'embracePlateau' },
  growth_comeback: {
    domainToolId: 'createComebackPlan',
    transformArgs: (args) => ({ setback: args.setback }),
  },

  // ==========================================================================
  // 🎭 PLAY & CREATIVITY (10 tools)
  // ==========================================================================
  play_permission: { domainToolId: 'givePermissionToPlay' },
  play_silly: { domainToolId: 'becomeSilly' },
  play_cultivate: { domainToolId: 'cultivatePlayfulness' },
  play_hobby: {
    domainToolId: 'suggestHobbyBasedOnInterests',
    transformArgs: (args) => ({ interests: args.interests }),
  },
  play_reclaim: {
    domainToolId: 'reclaimLostHobby',
    transformArgs: (args) => ({ hobby: args.hobby }),
  },
  play_spontaneity: { domainToolId: 'spontaneityChallenge' },
  play_possibility: { domainToolId: 'playWithPossibility' },
  creativity_block: {
    domainToolId: 'navigateCreativeBlock',
    transformArgs: (args) => ({ block: args.block }),
  },
  creativity_habit: { domainToolId: 'buildCreativeHabit' },
  creativity_goal: {
    domainToolId: 'setCreativeGoal',
    transformArgs: (args) => ({ goal: args.goal }),
  },

  // ==========================================================================
  // 🌊 QUIET GROWTH (6 tools)
  // ==========================================================================
  quiet_mystery: { domainToolId: 'embraceMystery' },
  quiet_uncertainty: { domainToolId: 'embraceUncertainty' },
  quiet_imperfection: { domainToolId: 'embraceImperfection' },
  quiet_beginners: { domainToolId: 'cultivateBeginnersMind' },
  quiet_wonder: { domainToolId: 'experienceWonder' },
  quiet_paradox: {
    domainToolId: 'holdParadox',
    transformArgs: (args) => ({ paradox: args.paradox }),
  },

  // ==========================================================================
  // 🌱 SECOND CHANCES (4 tools)
  // ==========================================================================
  second_amends: { domainToolId: 'makeAmends', transformArgs: (args) => ({ to: args.to }) },
  second_alternative: {
    domainToolId: 'alternativeLife',
    transformArgs: (args) => ({ choice: args.choice }),
  },
  second_counterfactual: {
    domainToolId: 'simulateCounterfactual',
    transformArgs: (args) => ({ decision: args.decision }),
  },
  second_wisdom: { domainToolId: 'shareSecondChanceWisdom' },

  // ==========================================================================
  // 🤝 CONNECTION & FRIENDSHIP (12 tools)
  // ==========================================================================
  connection_loneliness_type: { domainToolId: 'exploreLonelinessType' },
  connection_sit: { domainToolId: 'sitWithLoneliness' },
  connection_adult_friends: { domainToolId: 'makeAdultFriends' },
  connection_deepen: {
    domainToolId: 'deepenFriendship',
    transformArgs: (args) => ({ friend: args.friend }),
  },
  connection_acquaintance: {
    domainToolId: 'deepenAcquaintance',
    transformArgs: (args) => ({ person: args.person }),
  },
  connection_move: {
    domainToolId: 'moveFromAcquaintanceToFriend',
    transformArgs: (args) => ({ person: args.person }),
  },
  connection_maintain_friendships: { domainToolId: 'maintainFriendships' },
  connection_toxic: {
    domainToolId: 'recognizeToxicFriendship',
    transformArgs: (args) => ({ friend: args.friend }),
  },
  connection_find_people: { domainToolId: 'findYourPeople' },
  connection_network: { domainToolId: 'networkAuthentically' },
  connection_expand: { domainToolId: 'expandNetwork' },
  connection_join: { domainToolId: 'joinNewGroups' },

  // ==========================================================================
  // 💬 DATING (10 tools)
  // ==========================================================================
  dating_readiness: { domainToolId: 'datingReadiness' },
  dating_values: { domainToolId: 'datingValues' },
  dating_intentions: { domainToolId: 'datingIntentions' },
  dating_dealbreakers: { domainToolId: 'dealbreakers' },
  dating_app_fatigue: { domainToolId: 'datingAppFatigue' },
  dating_red_flags: { domainToolId: 'datingRedFlags' },
  dating_rejection: {
    domainToolId: 'datingRejection',
    transformArgs: (args) => ({ situation: args.situation }),
  },
  dating_after_date: {
    domainToolId: 'afterDateReflection',
    transformArgs: (args) => ({ date: args.date }),
  },
  dating_relationship_baby: { domainToolId: 'relationshipAfterBaby' },
  dating_alone_together: { domainToolId: 'balanceAloneAndTogether' },
};
