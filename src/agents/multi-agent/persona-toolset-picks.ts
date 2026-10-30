/**
 * PERSONA_TOOLSETS data: the tools each persona holds on top of the shared core
 * (persona-toolsets.ts), in priority order. When a caller's team leaves too few
 * slots, tools drop from the end of `head`, then of `beat`.
 *
 * - `beat`: the tools of the persona's beat (docs/plans/2026-10-29-specialist-beats.md),
 *   taken from its SPECIALIST_TOOL_SETS list, which also gives their domains.
 * - `head`: what callers most ask this persona for. Prod tool counts
 *   (TOOL_USAGE) are per session, not per persona, so v1 is hand-picked: Ferni's
 *   from prod calls 2026-10-04..18 (same-turn-tools-config.ts,
 *   scripts/tool-retrieval/eval-choice.ts HEAD), a specialist's from its own list.
 *   Rebuilding them monthly from each persona's calls is later work.
 *
 * Every name is a registered tool in the domain it resolves to
 * (persona-toolsets.test.ts). A persona without an entry gets Ferni's.
 *
 * @module agents/multi-agent/persona-toolset-picks
 */
import type { ToolDomain } from '../../tools/registry/index.js';

export interface PersonaToolPicks {
  readonly beat: readonly string[];
  readonly head: readonly string[];
}

/** Ferni's head tools that no other tool list names, with their domains. */
export const FERNI_HEAD_DOMAINS: Readonly<Record<string, ToolDomain>> = {
  getFunFact: 'simple-utilities',
  addRelationship: 'information',
};

/** Education and calculators, no securities picks (specialist-tool-sets.ts MONEY_EDUCATION). */
const MONEY_EDUCATION: PersonaToolPicks = {
  beat: ['financeEducation', 'explainConcept', 'investmentCalc', 'retirementReadiness'],
  head: [
    'savingsCalc',
    'debtPayoff',
    'budgetPlanner',
    'calculateFIRE',
    'getCrashPerspective',
    'emotionalSupport',
  ],
};

/** By canonical persona id. */
export const PERSONA_TOOL_PICKS: Readonly<Record<string, PersonaToolPicks>> = {
  // Friend and coordinator: the people in your life, plans, small delights. Beats go to teammates.
  ferni: {
    beat: [],
    head: [
      'getContactInfo',
      'manageContact',
      'getCalendarToday',
      'createCalendarEvent',
      'getReminders',
      'tellJoke',
      'getFunFact',
      'quickText',
      'addRelationship',
      'whatCanYouDo',
    ],
  },
  'maya-santos': {
    beat: ['createHabit', 'logHabitCompletion', 'getHabits', 'habitCheckIn'],
    head: [
      'habitSetback',
      'implementationIntention',
      'celebrateTinyWin',
      'logExercise',
      'analyzeSleepPattern',
      'budgetPlanner',
    ],
  },
  'alex-chen': {
    beat: ['addTask', 'getTasks', 'recordCommitment', 'getCommitments'],
    head: [
      'completeTask',
      'getCalendarToday',
      'createCalendarEvent',
      'getReminders',
      'draftMessage',
      'prepareHardConversation',
    ],
  },
  'jordan-taylor': {
    beat: ['manageMilestone', 'manageGoal', 'clarifyCareerGoals', 'planCareerTransition'],
    head: [
      'goalsSummary',
      'annualPlan',
      'practiceInterview',
      'researchSalary',
      'trackJobApplication',
      'planMove',
    ],
  },
  'nayan-patel': {
    beat: ['companionInGrief', 'processGrief', 'clarifyValues', 'explorePurpose'],
    head: [
      'sitWithBigQuestion',
      'noticeThisMoment',
      'anniversarySupport',
      'getDefusionTechnique',
      'holdParadox',
      'recordContemplativePractice',
    ],
  },
  'peter-john': {
    beat: ['discoverPattern', 'synthesizeResearch', 'verifyClaim', 'backgroundResearch'],
    head: [
      'explainConcept',
      'findCounterArguments',
      'getBaseRate',
      'crossDomainConnection',
      'budgetPlanner',
      'savingsCalc',
    ],
  },
  'peter-lynch': MONEY_EDUCATION,
  'john-bogle': MONEY_EDUCATION,
  'joel-dickson': MONEY_EDUCATION,
};
