/**
 * Habit Coaching Tools - LLM Tool Definitions
 *
 * This file contains the createHabitCoachingTools() function that creates
 * all the LLM-callable tools for habit coaching.
 *
 * @module habit-coaching/tools
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { z } from 'zod';
import { getProductivityStore } from '../../services/stores/productivity-store.js';

// Import from modular files
import {
  LIFE_DOMAINS,
  LIFE_STAGES,
  FOUR_TENDENCIES_STRATEGIES,
  GLIDEPATH_LEVELS,
  SELF_COMPASSION_MESSAGES,
  ACCOUNTABILITY_TIPS,
  ENVIRONMENT_BUILD_STRATEGIES,
  ENVIRONMENT_BREAK_STRATEGIES,
} from './constants.js';

import type {
  LifeDomain,
  LifeStage,
  FourTendency,
  IdentityShift,
  HabitBreakPlan,
  EnvironmentDesign,
  TemptationBundle,
  SetbackLog,
  AccountabilitySystem,
  MoodLog,
  ThirtyDayChallenge,
  GlidepathLevel,
  HabitLoop,
  HabitStack,
  KeystoneHabit,
  EnhancedHabit,
  HabitTemplate,
} from './types.js';

import { THIRTY_DAY_CHALLENGES } from './challenges.js';
import { HABIT_TEMPLATES } from './templates.js';
import { HABIT_BUNDLES } from './bundles.js';
import { LIFE_TRANSITION_SUPPORT } from './transitions.js';

import { getToolDescription } from '../utils/tool-descriptions.js';
import {
  generateFrictionTips,
  detectSetbackPattern,
  diagnoseHabitFailure,
  getMotivationalContent,
  analyzeMoodPatterns,
  getMoodBasedTip,
  getChallengeDayEncouragement,
  checkChallengeMilestones,
} from './helpers.js';

import {
  getUserCoachData,
  saveUserCoachProfile,
  saveEnhancedHabit,
  saveHabitStack,
  saveWeeklyReflection,
  type UserHabitCoachData,
} from './storage.js';

// ============================================================================
// TOOL CREATOR
// ============================================================================

/**
 * Create habit coaching tools
 * @returns Object containing all habit coaching LLM tools
 */
export function createHabitCoachingTools() {
  return {
    /**
     * Life assessment - understand where user is
     */
    assessLifeDomains: llm.tool({
      description: getToolDescription('assessLifeDomains'),
      parameters: z.object({
        lifeStage: z
          .enum([
            'student',
            'early_career',
            'new_parent',
            'mid_career',
            'empty_nester',
            'pre_retirement',
            'retirement',
            'transition',
          ])
          .optional()
          .describe("User's current life stage"),
        domainScores: z
          .record(z.string(), z.number().min(0).max(10))
          .optional()
          .describe('Satisfaction scores (0-10) for each domain discussed'),
        notes: z.string().optional().describe('Key observations from the conversation'),
      }),
      execute: async ({ lifeStage, domainScores, notes }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        if (lifeStage) {
          data.lifeStage = lifeStage;
        }

        if (domainScores) {
          // Update priorities based on lowest scores
          const sorted = Object.entries(domainScores)
            .sort(([, a], [, b]) => a - b)
            .map(([domain]) => domain as LifeDomain);
          data.domainPriorities = sorted.slice(0, 4);

          // Save assessment as a weekly reflection for tracking
          saveWeeklyReflection(userId, {
            wins: [],
            challenges: [],
            insights: [
              `Domain scores assessed: ${Object.entries(domainScores)
                .map(([d, s]) => `${d}: ${s}`)
                .join(', ')}`,
            ],
            adjustments: notes ? [notes] : [],
          });
        }

        // Persist profile changes
        saveUserCoachProfile(userId, data);

        const stage = LIFE_STAGES[data.lifeStage];
        const lowDomains = data.domainPriorities.slice(0, 2);

        getLogger().info(
          { userId, lifeStage: data.lifeStage, priorities: data.domainPriorities },
          '🎯 Life assessment completed'
        );

        return {
          summary: `Life stage: ${stage.name}. Priority areas: ${lowDomains.map((d) => LIFE_DOMAINS[d].name).join(', ')}.`,
          recommendations: stage.priorities
            .slice(0, 3)
            .map((p) => LIFE_DOMAINS[p as LifeDomain].name),
          challenges: stage.challenges,
          opportunities: stage.opportunities,
          suggestedFocus: lowDomains[0],
        };
      },
    }),

    /**
     * Recommend habits based on goals and life stage
     */
    recommendHabits: llm.tool({
      description: getToolDescription('recommendHabits'),
      parameters: z.object({
        domain: z
          .enum([
            'health',
            'mind',
            'relationships',
            'career',
            'learning',
            'finance',
            'home',
            'selfCare',
          ])
          .describe('Life domain to get recommendations for'),
        goal: z.string().optional().describe('Specific goal within the domain'),
        difficulty: z
          .enum(['beginner', 'intermediate', 'advanced'])
          .optional()
          .describe("User's experience level"),
      }),
      execute: async ({ domain, goal: _goal, difficulty = 'beginner' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        // Filter templates by domain and difficulty
        const relevant = HABIT_TEMPLATES.filter(
          (t) =>
            t.domain === domain && t.difficulty === difficulty && t.goodFor.includes(data.lifeStage)
        );

        // Prioritize keystone habits
        const sorted = relevant.sort((a, b) => (b.isKeystone ? 1 : 0) - (a.isKeystone ? 1 : 0));

        const recommendations = sorted.slice(0, 3).map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          tinyVersion: t.tinyVersion,
          benefits: t.benefits.slice(0, 3),
          isKeystone: t.isKeystone,
          timeRequired: `${t.timeRequired} min at full level, just ${t.habitLoop.routine.duration} min to start`,
        }));

        getLogger().info(
          { userId, domain, recommendations: recommendations.length },
          '💡 Habit recommendations generated'
        );

        return {
          domain: LIFE_DOMAINS[domain].name,
          recommendations,
          tip: 'Start with the tiny version! Success builds momentum.',
        };
      },
    }),

    /**
     * Create a new enhanced habit with glidepath
     */
    createEnhancedHabit: llm.tool({
      description: getToolDescription('createEnhancedHabit'),
      parameters: z.object({
        templateId: z.string().optional().describe('ID of habit template to use'),
        name: z.string().describe('Name of the habit'),
        domain: z
          .enum([
            'health',
            'mind',
            'relationships',
            'career',
            'learning',
            'finance',
            'home',
            'selfCare',
          ])
          .describe('Life domain'),
        tinyVersion: z.string().describe('The smallest possible version (2 min or less)'),
        cue: z.string().describe('When/where this habit happens'),
        celebration: z.string().describe('How to celebrate after (tiny celebration)'),
        frequency: z.enum(['daily', 'weekly', 'monthly', 'custom']).optional(),
      }),
      execute: async (
        { templateId, name, domain, tinyVersion, cue, celebration, frequency = 'daily' },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        // Get template if provided
        const template = templateId ? HABIT_TEMPLATES.find((t) => t.id === templateId) : null;

        const habit: EnhancedHabit = {
          id: `habit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          name,
          description: template?.description,
          domain,
          currentLevel: 1, // Start at tiny
          targetLevel: 5,
          levelStartDate: new Date(),
          levelHistory: [{ level: 1, achievedAt: new Date() }],
          habitLoop: {
            cue: { type: 'preceding_action', description: cue, specificity: cue },
            routine: { behavior: tinyVersion, duration: 2, difficulty: 'tiny' },
            reward: { intrinsic: 'Sense of accomplishment', celebration },
          },
          isKeystone: template?.isKeystone || false,
          keystoneScore: template?.isKeystone ? 7 : undefined,
          cascadeEffects: template?.cascadeEffects,
          frequency,
          targetPerDay: 1,
          currentStreak: 0,
          longestStreak: 0,
          totalCompletions: 0,
          successRate: 0,
          isActive: true,
          isPaused: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: [domain],
        };

        data.enhancedHabits.push(habit);

        if (habit.isKeystone) {
          data.keystoneHabits.push(habit.id);
        }

        // Persist to database
        saveEnhancedHabit(userId, habit);
        saveUserCoachProfile(userId, data);

        getLogger().info(
          { userId, habitId: habit.id, name, level: 1 },
          '✨ Enhanced habit created'
        );

        const level = GLIDEPATH_LEVELS[0];
        return {
          habitId: habit.id,
          name,
          level: level.name,
          instruction: level.description,
          yourVersion: tinyVersion,
          cue,
          celebration,
          nextStep: `Just do this for ${level.duration}. The goal is showing up, not perfection.`,
          tip: 'Remember: the habit is the practice, not the result. Even 30 seconds counts!',
        };
      },
    }),

    /**
     * Log habit completion
     */
    logHabitCompletion: llm.tool({
      description: getToolDescription('logHabitCompletion'),
      parameters: z.object({
        habitId: z.string().describe('ID of the habit'),
        completed: z.boolean().describe('Whether habit was completed'),
        notes: z.string().optional().describe('Any notes about the completion'),
        feelingAfter: z.enum(['great', 'good', 'neutral', 'struggled']).optional(),
      }),
      execute: async (
        { habitId, completed, notes: _notes, feelingAfter: _feelingAfter },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        const habit = data.enhancedHabits.find((h) => h.id === habitId);
        if (!habit) {
          return { error: 'Habit not found' };
        }

        habit.totalCompletions += completed ? 1 : 0;
        habit.currentStreak = completed ? habit.currentStreak + 1 : 0;
        habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
        habit.updatedAt = new Date();

        // Check for level up
        let leveledUp = false;
        const currentLevel = GLIDEPATH_LEVELS[habit.currentLevel - 1];
        const daysAtLevel = Math.floor(
          (Date.now() - habit.levelStartDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const minDaysForLevel = parseInt(currentLevel.duration.split('-')[0]) * 7;

        if (habit.currentStreak >= 14 && daysAtLevel >= minDaysForLevel && habit.currentLevel < 5) {
          habit.currentLevel++;
          habit.levelStartDate = new Date();
          habit.levelHistory.push({ level: habit.currentLevel, achievedAt: new Date() });
          leveledUp = true;
        }

        // Persist updated habit to database
        saveEnhancedHabit(userId, habit);

        getLogger().info(
          { userId, habitId, completed, streak: habit.currentStreak, leveledUp },
          '📊 Habit logged'
        );

        const response: Record<string, unknown> = {
          streak: habit.currentStreak,
          longestStreak: habit.longestStreak,
          level: habit.currentLevel,
          levelName: GLIDEPATH_LEVELS[habit.currentLevel - 1].name,
        };

        if (leveledUp) {
          const newLevel = GLIDEPATH_LEVELS[habit.currentLevel - 1];
          response.levelUp = {
            newLevel: newLevel.name,
            message: `🎉 You've leveled up to ${newLevel.name}! ${newLevel.description}`,
            newFocus: newLevel.focus,
          };
        }

        if (habit.currentStreak === 7) {
          response.milestone = "🔥 One week streak! You're building something real.";
        } else if (habit.currentStreak === 21) {
          response.milestone = '⭐ Three weeks! This is becoming who you are.';
        } else if (habit.currentStreak === 66) {
          response.milestone = '🏆 66 days! Research says this is when habits become automatic.';
        }

        return response;
      },
    }),

    /**
     * Create a habit stack
     */
    createHabitStack: llm.tool({
      description: getToolDescription('createHabitStack'),
      parameters: z.object({
        name: z.string().describe('Name for this habit stack'),
        anchorHabit: z.string().describe('Existing habit or action to build on'),
        newHabits: z.array(z.string()).describe('New habits to stack (in order)'),
        timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'anytime']),
      }),
      execute: async ({ name, anchorHabit, newHabits, timeOfDay }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        const stack: HabitStack = {
          id: `stack_${Date.now()}`,
          name,
          description: `After ${anchorHabit}, I will ${newHabits.join(', then ')}`,
          anchorHabit,
          newHabits,
          totalDuration: newHabits.length * 5, // Estimate
          bestTimeOfDay: timeOfDay,
        };

        data.habitStacks.push(stack);

        // Persist to database
        saveHabitStack(userId, stack);

        getLogger().info(
          { userId, stackId: stack.id, habits: newHabits.length },
          '📚 Habit stack created'
        );

        return {
          stackId: stack.id,
          name,
          formula: stack.description,
          tip: 'Start with just the first habit in the stack. Add one at a time.',
          science: 'Habit stacking uses existing neural pathways to build new behaviors.',
        };
      },
    }),

    /**
     * Weekly reflection
     */
    weeklyReflection: llm.tool({
      description: getToolDescription('weeklyReflection'),
      parameters: z.object({
        wins: z.array(z.string()).describe('What went well this week'),
        challenges: z.array(z.string()).describe('What was difficult'),
        insights: z.array(z.string()).describe('What user learned'),
        adjustments: z.array(z.string()).optional().describe('Changes to make next week'),
      }),
      execute: async ({ wins, challenges, insights, adjustments = [] }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        // Persist to database
        saveWeeklyReflection(userId, { wins, challenges, insights, adjustments });

        // Calculate stats
        const activeHabits = data.enhancedHabits.filter((h) => h.isActive);
        const avgStreak =
          activeHabits.reduce((sum, h) => sum + h.currentStreak, 0) / (activeHabits.length || 1);
        const keystoneProgress =
          data.keystoneHabits.length > 0
            ? data.enhancedHabits.filter(
                (h) => data.keystoneHabits.includes(h.id) && h.currentStreak > 0
              ).length / data.keystoneHabits.length
            : 0;

        getLogger().info({ userId, wins: wins.length, avgStreak }, '📝 Weekly reflection saved');

        return {
          summary: {
            activeHabits: activeHabits.length,
            avgStreak: Math.round(avgStreak),
            keystoneProgress: `${Math.round(keystoneProgress * 100)}%`,
          },
          wins,
          topChallenge: challenges[0],
          keyInsight: insights[0],
          nextWeekFocus: adjustments[0] || 'Keep building on your wins!',
          encouragement: getEncouragement(avgStreak, wins.length),
        };
      },
    }),

    /**
     * Get personalized encouragement
     */
    getEncouragement: llm.tool({
      description: getToolDescription('getEncouragement'),
      parameters: z.object({
        situation: z
          .enum(['struggling', 'doing_well', 'broke_streak', 'milestone', 'starting_fresh'])
          .describe("User's current situation"),
      }),
      execute: async ({ situation }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const _data = getUserCoachData(userId); // Reserved for future data-driven motivation

        const messages: Record<string, string[]> = {
          struggling: [
            "Remember: every expert was once a beginner. The fact that you're trying matters.",
            "Habits aren't about perfection—they're about direction. You're pointed the right way.",
            "A bad day doesn't erase your progress. Rest if you need to, then begin again.",
            "The two-minute version still counts. What's the smallest step you can take today?",
          ],
          doing_well: [
            "You're building something real here. Your future self is going to thank you.",
            "This consistency is shaping who you're becoming. Keep going!",
            "You're proving to yourself what's possible. That's powerful.",
            'These small daily choices are adding up to big changes.',
          ],
          broke_streak: [
            'Streaks are tools, not goals. What matters is starting again right now.',
            'Missing once is an accident. Missing twice starts a new pattern. Get back today.',
            "Your streak ended, but your identity as someone who does this didn't.",
            'The best time to start was yesterday. The second best time is now.',
          ],
          milestone: [
            'You did it! This milestone is proof that you can do hard things.',
            "Look how far you've come. Remember when this felt impossible?",
            'This is what showing up every day creates. Celebrate this!',
            "You've just proven something to yourself that no one can take away.",
          ],
          starting_fresh: [
            'Every journey starts with a single step. Today is day one of something amazing.',
            "You don't have to be great to start. But you have to start to be great.",
            "Start so small it feels ridiculous. That's the secret.",
            "The you of tomorrow is being built by what you do today. Let's begin.",
          ],
        };

        const options = messages[situation];
        const message = options[Math.floor(Math.random() * options.length)];

        getLogger().info({ userId, situation }, '💬 Encouragement provided');

        return {
          message,
          tip:
            situation === 'struggling'
              ? 'Focus on just today. Can you do the 2-minute version?'
              : 'Keep building! Small actions compound into extraordinary results.',
        };
      },
    }),

    /**
     * Set life stage and update recommendations
     */
    setLifeStage: llm.tool({
      description: getToolDescription('setLifeStage'),
      parameters: z.object({
        stage: z
          .enum([
            'student',
            'early_career',
            'new_parent',
            'mid_career',
            'empty_nester',
            'pre_retirement',
            'retirement',
            'transition',
          ])
          .describe("User's current life stage"),
      }),
      execute: async ({ stage }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        data.lifeStage = stage;
        const stageInfo = LIFE_STAGES[stage];

        // Persist to database
        saveUserCoachProfile(userId, data);

        getLogger().info({ userId, stage }, '🎯 Life stage set');

        return {
          stage: stageInfo.name,
          priorities: stageInfo.priorities.map((p) => LIFE_DOMAINS[p as LifeDomain].name),
          challenges: stageInfo.challenges,
          opportunities: stageInfo.opportunities,
          message: `Got it! As someone in the ${stageInfo.name} stage, I'll focus on what matters most to you right now.`,
        };
      },
    }),

    // ========================================================================
    // FOUR TENDENCIES - Gretchen Rubin's personality framework
    // ========================================================================

    /**
     * Assess user's tendency type for personalized habit strategies
     */
    assessFourTendencies: llm.tool({
      description: getToolDescription('assessFourTendencies'),
      parameters: z.object({
        tendency: z
          .enum(['upholder', 'questioner', 'obliger', 'rebel'])
          .describe("User's identified tendency based on conversation"),
        evidence: z.string().optional().describe('What in the conversation revealed this tendency'),
      }),
      execute: async ({ tendency, evidence }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const _data = getUserCoachData(userId); // Reserved for tendency tracking

        // Store tendency in user profile
        const store = getProductivityStore();
        store.setUserPreference(userId, 'fourTendency', tendency);
        if (evidence) {
          store.setUserPreference(userId, 'fourTendencyEvidence', evidence);
        }

        const strategies = FOUR_TENDENCIES_STRATEGIES[tendency];

        getLogger().info({ userId, tendency }, '🎭 Four Tendencies assessed');

        return {
          tendency: strategies.name,
          description: strategies.description,
          habitStrategies: strategies.habitStrategies,
          avoidances: strategies.avoid,
          motivationTip: strategies.motivationTip,
          message: `Understanding that you're a ${strategies.name} is huge! This tells me exactly how to help you build habits that stick.`,
        };
      },
    }),

    // ========================================================================
    // IDENTITY-BASED HABITS - James Clear's identity transformation
    // ========================================================================

    /**
     * Transform habits through identity shift
     */
    createIdentityShift: llm.tool({
      description: getToolDescription('createIdentityShift'),
      parameters: z.object({
        currentBelief: z
          .string()
          .describe('User\'s current identity belief (e.g., "I\'m not a morning person")'),
        desiredIdentity: z
          .string()
          .describe('New identity to adopt (e.g., "I am someone who honors my mornings")'),
        domain: z
          .enum([
            'health',
            'mind',
            'relationships',
            'career',
            'learning',
            'finance',
            'home',
            'selfCare',
          ])
          .describe('Life domain this identity relates to'),
        smallProofs: z
          .array(z.string())
          .describe('Tiny actions that prove this new identity (even once counts)'),
      }),
      execute: async ({ currentBelief, desiredIdentity, domain, smallProofs }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Store identity shift for tracking
        const identityShifts =
          (store.getUserPreference(userId, 'identityShifts') as IdentityShift[]) || [];
        const newShift: IdentityShift = {
          id: `identity_${Date.now()}`,
          from: currentBelief,
          to: desiredIdentity,
          domain,
          proofs: smallProofs,
          createdAt: new Date().toISOString(),
          evidenceLog: [],
        };
        identityShifts.push(newShift);
        store.setUserPreference(userId, 'identityShifts', identityShifts);

        getLogger().info(
          { userId, from: currentBelief, to: desiredIdentity },
          '🦋 Identity shift created'
        );

        return {
          transformation: {
            from: currentBelief,
            to: desiredIdentity,
          },
          mantra: `Every time you ${smallProofs[0]}, you cast a vote for being "${desiredIdentity}"`,
          proofActions: smallProofs,
          science:
            "Identity change works because every action is a vote for the type of person you want to become. Habits are not about HAVING something, they're about BECOMING someone.",
          nextStep: `This week, try to do "${smallProofs[0]}" just once. That one action is evidence for your new identity.`,
        };
      },
    }),

    // ========================================================================
    // BAD HABIT BREAKING - The Golden Rule of Habit Change
    // ========================================================================

    /**
     * Break bad habits using substitution
     */
    breakBadHabit: llm.tool({
      description: getToolDescription('breakBadHabit'),
      parameters: z.object({
        badHabit: z.string().describe('The bad habit to break'),
        currentCue: z
          .string()
          .describe('What triggers this habit (stress, boredom, specific time, etc.)'),
        actualReward: z
          .string()
          .describe(
            'The REAL reward they get (not the surface behavior) - e.g., stress relief, connection, stimulation'
          ),
        replacementRoutine: z
          .string()
          .describe('New healthy routine that provides the same reward'),
        frictionStrategies: z
          .array(z.string())
          .optional()
          .describe('Ways to add friction to the bad habit'),
      }),
      execute: async (
        { badHabit, currentCue, actualReward, replacementRoutine, frictionStrategies = [] },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Store habit break attempt
        const habitBreaks =
          (store.getUserPreference(userId, 'habitBreaks') as HabitBreakPlan[]) || [];
        const plan: HabitBreakPlan = {
          id: `break_${Date.now()}`,
          badHabit,
          cue: currentCue,
          actualReward,
          replacement: replacementRoutine,
          frictionAdded: frictionStrategies,
          startDate: new Date().toISOString(),
          relapseLog: [],
          successStreak: 0,
        };
        habitBreaks.push(plan);
        store.setUserPreference(userId, 'habitBreaks', habitBreaks);

        getLogger().info(
          { userId, badHabit, replacement: replacementRoutine },
          '🔄 Bad habit break plan created'
        );

        return {
          plan: {
            habit: badHabit,
            trigger: currentCue,
            realNeed: actualReward,
            newResponse: replacementRoutine,
          },
          goldenRule: `When ${currentCue}, instead of ${badHabit}, I will ${replacementRoutine} because I really need ${actualReward}.`,
          frictionTips:
            frictionStrategies.length > 0 ? frictionStrategies : generateFrictionTips(badHabit),
          science:
            'Bad habits are hard to break because they serve a real purpose. The secret is finding a healthier way to meet the same need.',
          compassionReminder:
            'If you slip, that\'s data not failure. Ask: "What was I really needing in that moment?"',
        };
      },
    }),

    // ========================================================================
    // ENVIRONMENT DESIGN - Setting up for success
    // ========================================================================

    /**
     * Design environment to support habits
     */
    designEnvironment: llm.tool({
      description: getToolDescription('designEnvironment'),
      parameters: z.object({
        habit: z.string().describe('The habit to support'),
        habitType: z
          .enum(['build', 'break'])
          .describe('Whether building a good habit or breaking a bad one'),
        currentEnvironment: z.string().describe('Current environment/setup'),
        suggestedChanges: z.array(z.string()).describe('Environmental changes to make'),
      }),
      execute: async ({ habit, habitType, currentEnvironment, suggestedChanges }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Store environment design
        const envDesigns =
          (store.getUserPreference(userId, 'environmentDesigns') as EnvironmentDesign[]) || [];
        const design: EnvironmentDesign = {
          id: `env_${Date.now()}`,
          habit,
          type: habitType,
          currentSetup: currentEnvironment,
          changes: suggestedChanges,
          implemented: [],
          createdAt: new Date().toISOString(),
        };
        envDesigns.push(design);
        store.setUserPreference(userId, 'environmentDesigns', envDesigns);

        const strategies =
          habitType === 'build' ? ENVIRONMENT_BUILD_STRATEGIES : ENVIRONMENT_BREAK_STRATEGIES;

        getLogger().info({ userId, habit, type: habitType }, '🏠 Environment design created');

        return {
          habit,
          designType: habitType === 'build' ? 'Make it easy' : 'Make it hard',
          changes: suggestedChanges,
          principles: strategies,
          science:
            "We don't rise to the level of our goals, we fall to the level of our systems. Your environment IS your system.",
          oneThingToday: suggestedChanges[0],
        };
      },
    }),

    // ========================================================================
    // TEMPTATION BUNDLING - Pair pleasure with purpose
    // ========================================================================

    /**
     * Create temptation bundles
     */
    createTemptationBundle: llm.tool({
      description: getToolDescription('createTemptationBundle'),
      parameters: z.object({
        needToDo: z.string().describe('The habit or task user needs to do but struggles with'),
        wantToDo: z.string().describe('The pleasurable activity user enjoys'),
        bundleRule: z.string().describe('The rule linking them (e.g., "Only X while doing Y")'),
      }),
      execute: async ({ needToDo, wantToDo, bundleRule }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Store temptation bundle
        const bundles =
          (store.getUserPreference(userId, 'temptationBundles') as TemptationBundle[]) || [];
        const bundle: TemptationBundle = {
          id: `bundle_${Date.now()}`,
          needToDo,
          wantToDo,
          rule: bundleRule,
          createdAt: new Date().toISOString(),
          usageLog: [],
        };
        bundles.push(bundle);
        store.setUserPreference(userId, 'temptationBundles', bundles);

        getLogger().info({ userId, needToDo, wantToDo }, '🎁 Temptation bundle created');

        return {
          bundle: {
            task: needToDo,
            reward: wantToDo,
            rule: bundleRule,
          },
          formula: `"I will only [${wantToDo}] while [${needToDo}]"`,
          science:
            'Temptation bundling works by creating a real-time reward for behaviors with delayed benefits. Your brain starts associating the hard thing with pleasure.',
          tip: 'The key is being strict about the rule. The guilty pleasure ONLY happens with the habit.',
        };
      },
    }),

    // ========================================================================
    // SELF-COMPASSION RECOVERY - Handling setbacks
    // ========================================================================

    /**
     * Process setbacks with self-compassion
     */
    processSetback: llm.tool({
      description: getToolDescription('processSetback'),
      parameters: z.object({
        habit: z.string().describe('The habit they struggled with'),
        whatHappened: z.string().describe('What triggered the setback'),
        currentFeeling: z
          .enum(['ashamed', 'frustrated', 'disappointed', 'hopeless', 'angry'])
          .describe('How user is feeling'),
        lessonsLearned: z.string().optional().describe('What user can learn from this'),
      }),
      execute: async ({ habit, whatHappened, currentFeeling, lessonsLearned }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Log setback for pattern recognition
        const setbacks = (store.getUserPreference(userId, 'setbackLog') as SetbackLog[]) || [];
        const setback: SetbackLog = {
          id: `setback_${Date.now()}`,
          habit,
          trigger: whatHappened,
          feeling: currentFeeling,
          lesson: lessonsLearned,
          date: new Date().toISOString(),
        };
        setbacks.push(setback);
        store.setUserPreference(userId, 'setbackLog', setbacks);

        // Detect patterns
        const recentSetbacks = setbacks.filter(
          (s) =>
            s.habit === habit && Date.now() - new Date(s.date).getTime() < 30 * 24 * 60 * 60 * 1000
        );
        const pattern = detectSetbackPattern(recentSetbacks);

        getLogger().info(
          { userId, habit, feeling: currentFeeling },
          '💝 Setback processed with compassion'
        );

        return {
          compassionMessage: SELF_COMPASSION_MESSAGES[currentFeeling],
          reframe: {
            from: 'I failed',
            to: "I gathered data about what doesn't work for me",
          },
          science:
            'Research shows self-compassion leads to faster behavior change than self-criticism. Shame spirals into more unwanted behavior.',
          lesson: lessonsLearned || 'Every setback reveals something about our triggers and needs.',
          pattern: pattern ? `I notice this tends to happen when: ${pattern}` : null,
          nextStep:
            "The most important thing now is the NEXT action, not the last one. What's one tiny step forward?",
          reminder:
            'Missing once is an accident. Missing twice starts a new pattern. Focus on getting back TODAY.',
        };
      },
    }),

    // ========================================================================
    // CIRCLE OF INFLUENCE - Seven Habits of Highly Effective People
    // ========================================================================

    /**
     * Assess circle of influence vs. concern
     */
    assessCircleOfInfluence: llm.tool({
      description: getToolDescription('assessCircleOfInfluence'),
      parameters: z.object({
        concern: z.string().describe('What the user is worried or stressed about'),
        influenceAspects: z
          .array(z.string())
          .describe("Aspects within user's control or influence"),
        outsideControl: z.array(z.string()).describe("Aspects outside user's control"),
        actionableSteps: z.array(z.string()).describe('Specific actions user CAN take'),
      }),
      execute: async ({ concern, influenceAspects, outsideControl, actionableSteps }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        getLogger().info({ userId, concern }, '🎯 Circle of influence assessed');

        return {
          concern,
          analysis: {
            withinInfluence: influenceAspects,
            outsideControl: outsideControl,
          },
          recommendation: `Focus your energy on: ${influenceAspects.slice(0, 2).join(' and ')}`,
          letGo: `Release worry about: ${outsideControl.slice(0, 2).join(' and ')}`,
          actions: actionableSteps,
          coveyWisdom:
            '"I am not a product of my circumstances. I am a product of my decisions." - Stephen Covey',
          energyTip:
            "Every hour spent worrying about things you can't change is an hour stolen from things you CAN change.",
        };
      },
    }),

    // ========================================================================
    // ACCOUNTABILITY PARTNER - Social support for habits
    // ========================================================================

    /**
     * Set up accountability system
     */
    setupAccountability: llm.tool({
      description: getToolDescription('setupAccountability'),
      parameters: z.object({
        habit: z.string().describe('The habit to be accountable for'),
        accountabilityType: z
          .enum(['partner', 'group', 'public', 'coach', 'app'])
          .describe('Type of accountability system'),
        partnerName: z.string().optional().describe('Name of accountability partner if applicable'),
        checkInSchedule: z.string().describe('How often to check in (daily, weekly, etc.)'),
        consequences: z.string().optional().describe('Stakes or consequences if applicable'),
      }),
      execute: async (
        { habit, accountabilityType, partnerName, checkInSchedule, consequences },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Store accountability setup
        const accountability =
          (store.getUserPreference(userId, 'accountabilitySystems') as AccountabilitySystem[]) ||
          [];
        const system: AccountabilitySystem = {
          id: `accountability_${Date.now()}`,
          habit,
          type: accountabilityType,
          partner: partnerName,
          schedule: checkInSchedule,
          consequences,
          createdAt: new Date().toISOString(),
        };
        accountability.push(system);
        store.setUserPreference(userId, 'accountabilitySystems', accountability);

        getLogger().info(
          { userId, habit, type: accountabilityType },
          '🤝 Accountability system created'
        );

        return {
          system: {
            habit,
            type: accountabilityType,
            partner: partnerName,
            checkIn: checkInSchedule,
          },
          tips: ACCOUNTABILITY_TIPS[accountabilityType],
          science:
            "Public commitment increases follow-through by 65%. We're wired to keep promises to others even when we break them to ourselves.",
          messageTemplate: partnerName
            ? `"Hey ${partnerName}, I'm working on ${habit}. Can you check in with me ${checkInSchedule}? It would really help me stay on track."`
            : null,
        };
      },
    }),

    // ========================================================================
    // HABIT AUDIT - Comprehensive habit inventory
    // ========================================================================

    /**
     * Conduct a habit audit
     */
    conductHabitAudit: llm.tool({
      description: getToolDescription('conductHabitAudit'),
      parameters: z.object({
        currentHabits: z
          .array(
            z.object({
              name: z.string(),
              category: z.enum(['good', 'bad', 'neutral']),
              frequency: z.string(),
              impact: z.enum(['high', 'medium', 'low']),
            })
          )
          .describe("List of user's current habits"),
        morningRoutine: z.string().optional().describe('Current morning routine'),
        eveningRoutine: z.string().optional().describe('Current evening routine'),
      }),
      execute: async ({ currentHabits, morningRoutine, eveningRoutine }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Store audit
        store.setUserPreference(userId, 'lastHabitAudit', {
          date: new Date().toISOString(),
          habits: currentHabits,
          morningRoutine,
          eveningRoutine,
        });

        // Analyze
        const goodHabits = currentHabits.filter((h) => h.category === 'good');
        const badHabits = currentHabits.filter((h) => h.category === 'bad');
        const keystoneCandidates = goodHabits.filter((h) => h.impact === 'high');

        getLogger().info(
          { userId, total: currentHabits.length, good: goodHabits.length, bad: badHabits.length },
          '📋 Habit audit completed'
        );

        return {
          summary: {
            totalHabits: currentHabits.length,
            goodHabits: goodHabits.length,
            badHabits: badHabits.length,
            neutralHabits: currentHabits.length - goodHabits.length - badHabits.length,
          },
          keystoneCandidates: keystoneCandidates.map((h) => h.name),
          priorities: {
            protect: goodHabits.filter((h) => h.impact === 'high').map((h) => h.name),
            eliminate: badHabits.filter((h) => h.impact === 'high').map((h) => h.name),
            upgrade: currentHabits
              .filter((h) => h.category === 'neutral' && h.impact === 'medium')
              .map((h) => h.name),
          },
          routineAnalysis: {
            morning: morningRoutine ? 'Has morning routine' : 'No set morning routine',
            evening: eveningRoutine ? 'Has evening routine' : 'No set evening routine',
            recommendation: !morningRoutine
              ? 'Start with a simple morning routine - it sets the tone for the day'
              : !eveningRoutine
                ? 'Add an evening wind-down routine to protect sleep'
                : 'Great! Both bookend routines in place',
          },
          nextStep:
            badHabits.length > 0 && badHabits[0].impact === 'high'
              ? `Let's work on replacing "${badHabits[0].name}" - it's having the biggest negative impact`
              : goodHabits.length > 0
                ? `Let's strengthen "${keystoneCandidates[0]?.name || goodHabits[0].name}" - it will cascade to other areas`
                : "Let's pick one tiny habit to start building your foundation",
        };
      },
    }),

    // ========================================================================
    // 30-DAY CHALLENGES - Structured transformation programs
    // ========================================================================

    /**
     * Start a 30-day challenge
     */
    start30DayChallenge: llm.tool({
      description: getToolDescription('start30DayChallenge'),
      parameters: z.object({
        challengeType: z
          .enum([
            'morning_person',
            'fitness_starter',
            'mindfulness',
            'financial_reset',
            'digital_detox',
            'sleep_optimization',
            'hydration',
            'gratitude',
            'declutter',
            'connection',
          ])
          .describe('Type of 30-day challenge'),
        startDate: z.string().optional().describe('When to start (defaults to tomorrow)'),
        intensity: z
          .enum(['gentle', 'moderate', 'intensive'])
          .optional()
          .describe('How aggressive the challenge should be'),
      }),
      execute: async ({ challengeType, startDate, intensity = 'moderate' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        const challenge = THIRTY_DAY_CHALLENGES[challengeType];

        const challengeData: ThirtyDayChallenge = {
          id: `challenge_${Date.now()}`,
          type: challengeType,
          name: challenge.name,
          startDate:
            startDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          currentDay: 0,
          intensity,
          completedDays: [],
          missedDays: [],
          notes: {},
        };

        store.setUserPreference(userId, `challenge_${challengeType}`, challengeData);
        store.setUserPreference(userId, 'activeChallenge', challengeData.id);

        getLogger().info({ userId, challengeType, intensity }, '🎯 30-day challenge started');

        return {
          challenge: challenge.name,
          description: challenge.description,
          startDate: challengeData.startDate,
          duration: '30 days',
          intensity,
          week1Preview: challenge.weeks[0].theme,
          day1Action: challenge.weeks[0].days[0],
          commitment: challenge.commitment,
          tip: "The first week is about showing up. Don't worry about intensity yet.",
        };
      },
    }),

    /**
     * Get today's challenge action
     */
    getTodaysChallengeAction: llm.tool({
      description: getToolDescription('getTodaysChallengeAction'),
      parameters: z.object({
        challengeId: z
          .string()
          .optional()
          .describe('Specific challenge ID (uses active if not provided)'),
      }),
      execute: async ({ challengeId }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        const activeId =
          challengeId || (store.getUserPreference(userId, 'activeChallenge') as string);

        if (!activeId) {
          return { error: 'No active challenge. Want to start one?' };
        }

        // Find the challenge
        const challenges = Object.keys(THIRTY_DAY_CHALLENGES);
        let challengeData: ThirtyDayChallenge | null = null;

        for (const type of challenges) {
          const data = store.getUserPreference(userId, `challenge_${type}`) as ThirtyDayChallenge;
          if (data && data.id === activeId) {
            challengeData = data;
            break;
          }
        }

        if (!challengeData) {
          return { error: 'Challenge not found' };
        }

        // Calculate current day
        const startDate = new Date(challengeData.startDate);
        const today = new Date();
        const dayNumber =
          Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        if (dayNumber < 1) {
          return {
            message: `Your challenge starts ${challengeData.startDate}. Get excited!`,
            daysUntilStart: Math.abs(dayNumber) + 1,
          };
        }

        if (dayNumber > 30) {
          return {
            message: 'Challenge complete! 🎉 How do you feel?',
            completedDays: challengeData.completedDays.length,
            successRate: `${Math.round((challengeData.completedDays.length / 30) * 100)}%`,
          };
        }

        const challenge =
          THIRTY_DAY_CHALLENGES[challengeData.type as keyof typeof THIRTY_DAY_CHALLENGES];
        const weekIndex = Math.floor((dayNumber - 1) / 7);
        const dayIndex = (dayNumber - 1) % 7;
        const week = challenge.weeks[Math.min(weekIndex, 3)];
        const todayAction = week.days[Math.min(dayIndex, week.days.length - 1)];

        return {
          day: dayNumber,
          week: weekIndex + 1,
          weekTheme: week.theme,
          todayAction,
          intensityNote: week.intensityNote,
          encouragement: getChallengeDayEncouragement(dayNumber),
          completedSoFar: challengeData.completedDays.length,
        };
      },
    }),

    /**
     * Log challenge day completion
     */
    logChallengeDay: llm.tool({
      description: getToolDescription('logChallengeDay'),
      parameters: z.object({
        completed: z.boolean().describe('Whether the challenge action was completed'),
        notes: z.string().optional().describe('How it went, observations'),
        difficulty: z.enum(['easy', 'moderate', 'hard', 'struggled']).optional(),
      }),
      execute: async ({ completed, notes, difficulty }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        const activeId = store.getUserPreference(userId, 'activeChallenge') as string;

        if (!activeId) {
          return { error: 'No active challenge' };
        }

        // Find and update the challenge
        const challenges = Object.keys(THIRTY_DAY_CHALLENGES);
        for (const type of challenges) {
          const data = store.getUserPreference(userId, `challenge_${type}`) as ThirtyDayChallenge;
          if (data && data.id === activeId) {
            const startDate = new Date(data.startDate);
            const today = new Date();
            const dayNumber =
              Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            if (completed) {
              data.completedDays.push(dayNumber);
            } else {
              data.missedDays.push(dayNumber);
            }

            if (notes) {
              data.notes[dayNumber] = { notes, difficulty, completed };
            }

            data.currentDay = dayNumber;
            store.setUserPreference(userId, `challenge_${type}`, data);

            getLogger().info({ userId, day: dayNumber, completed }, '📅 Challenge day logged');

            // Check for milestones
            const milestones = checkChallengeMilestones(dayNumber, data.completedDays.length);

            return {
              day: dayNumber,
              completed,
              totalCompleted: data.completedDays.length,
              successRate: `${Math.round((data.completedDays.length / dayNumber) * 100)}%`,
              milestone: milestones,
              encouragement: completed
                ? getChallengeDayEncouragement(dayNumber)
                : 'Tomorrow is a new day. The streak matters less than showing up again.',
            };
          }
        }

        return { error: 'Challenge not found' };
      },
    }),

    // ========================================================================
    // HABIT BUNDLES/RECIPES - Pre-built habit stacks for common goals
    // ========================================================================

    /**
     * Get habit bundle recommendations
     */
    getHabitBundle: llm.tool({
      description: getToolDescription('getHabitBundle'),
      parameters: z.object({
        bundleType: z
          .enum([
            'morning_person',
            'evening_wind_down',
            'fitness_beginner',
            'stress_relief',
            'productivity_boost',
            'mindfulness_starter',
            'financial_wellness',
            'better_sleep',
            'energy_boost',
            'relationship_nurturing',
          ])
          .describe('Type of habit bundle'),
        currentWakeTime: z.string().optional().describe('Current wake time for morning bundles'),
        availableMinutes: z.number().optional().describe('Minutes available for the bundle'),
      }),
      execute: async (
        { bundleType, currentWakeTime: _currentWakeTime, availableMinutes },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const bundle = HABIT_BUNDLES[bundleType];

        // Adjust based on available time
        let selectedHabits = bundle.habits;
        if (availableMinutes && availableMinutes < bundle.totalMinutes) {
          selectedHabits = bundle.habits.filter((h) => h.priority === 'core');
        }

        getLogger().info(
          { userId, bundleType, habits: selectedHabits.length },
          '📦 Habit bundle retrieved'
        );

        return {
          bundle: bundle.name,
          goal: bundle.goal,
          description: bundle.description,
          totalTime: `${bundle.totalMinutes} minutes (full) / ${bundle.coreMinutes} minutes (core only)`,
          habits: selectedHabits.map((h) => ({
            name: h.name,
            duration: `${h.minutes} min`,
            tinyVersion: h.tinyVersion,
            priority: h.priority,
            order: h.order,
          })),
          stackFormula: bundle.stackFormula,
          scienceNote: bundle.science,
          startTip:
            'Start with just the CORE habits at their TINY version. Add more only when those feel easy.',
          firstWeek: `Week 1: Just do "${selectedHabits.find((h) => h.priority === 'core')?.tinyVersion || selectedHabits[0].tinyVersion}"`,
        };
      },
    }),

    // ========================================================================
    // HABIT TROUBLESHOOTING - Diagnose why habits aren't working
    // ========================================================================

    /**
     * Diagnose why a habit isn't sticking
     */
    troubleshootHabit: llm.tool({
      description: getToolDescription('troubleshootHabit'),
      parameters: z.object({
        habit: z.string().describe("The habit that isn't working"),
        attempts: z.number().optional().describe("How many times they've tried"),
        failurePoint: z
          .enum(['never_start', 'start_then_stop', 'inconsistent', 'hate_it', 'forget'])
          .describe('Where the habit breaks down'),
        currentCue: z.string().optional().describe('What triggers (or should trigger) the habit'),
        currentReward: z.string().optional().describe('What reward exists (if any)'),
        timeOfDay: z.string().optional().describe('When they try to do the habit'),
      }),
      execute: async (
        { habit, attempts, failurePoint, currentCue, currentReward, timeOfDay: _timeOfDay },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const diagnosis = diagnoseHabitFailure(failurePoint, currentCue, currentReward);

        getLogger().info(
          { userId, habit, failurePoint, diagnosis: diagnosis.issue },
          '🔍 Habit troubleshooting'
        );

        return {
          habit,
          diagnosis: {
            likelyIssue: diagnosis.issue,
            explanation: diagnosis.explanation,
            behaviorScienceInsight: diagnosis.science,
          },
          fixes: diagnosis.fixes,
          reframedHabit: diagnosis.reframe,
          nextStep: diagnosis.nextStep,
          encouragement:
            attempts && attempts > 2
              ? `You've tried ${attempts} times - that's not failure, that's data. Now we know what doesn't work.`
              : "The fact that you're troubleshooting shows you're serious about this. Let's figure it out.",
        };
      },
    }),

    // ========================================================================
    // MOOD/ENERGY TRACKING - Connect habits to feelings
    // ========================================================================

    /**
     * Log mood and energy with habit context
     */
    logMoodEnergy: llm.tool({
      description: getToolDescription('logMoodEnergy'),
      parameters: z.object({
        mood: z.enum(['great', 'good', 'okay', 'low', 'struggling']).describe('Current mood'),
        energy: z.enum(['high', 'moderate', 'low', 'depleted']).describe('Current energy level'),
        timeOfDay: z
          .enum(['morning', 'midday', 'afternoon', 'evening', 'night'])
          .describe('Time of day'),
        habitsCompletedToday: z
          .array(z.string())
          .optional()
          .describe('Which habits were done today'),
        notes: z.string().optional().describe('Any context (sleep, stress, events)'),
      }),
      execute: async ({ mood, energy, timeOfDay, habitsCompletedToday, notes }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Store mood log
        const moodLogs = (store.getUserPreference(userId, 'moodLogs') as MoodLog[]) || [];
        const log: MoodLog = {
          id: `mood_${Date.now()}`,
          date: new Date().toISOString(),
          mood,
          energy,
          timeOfDay,
          habitsCompleted: habitsCompletedToday || [],
          notes,
        };
        moodLogs.push(log);
        store.setUserPreference(userId, 'moodLogs', moodLogs);

        // Analyze patterns (last 14 days)
        const recentLogs = moodLogs.filter((l) => {
          const logDate = l.timestamp || l.date || '';
          return Date.now() - new Date(logDate).getTime() < 14 * 24 * 60 * 60 * 1000;
        });
        const patterns = analyzeMoodPatterns(recentLogs);

        getLogger().info({ userId, mood, energy }, '😊 Mood/energy logged');

        return {
          logged: { mood, energy, time: timeOfDay },
          patterns: patterns.insights.length > 0 ? patterns : null,
          correlations: patterns.habitCorrelations,
          tip: getMoodBasedTip(mood, energy, timeOfDay),
        };
      },
    }),

    // ========================================================================
    // LIFE TRANSITION SUPPORT - Coaching through major changes
    // ========================================================================

    /**
     * Get support for a life transition
     */
    supportLifeTransition: llm.tool({
      description: getToolDescription('supportLifeTransition'),
      parameters: z.object({
        transition: z
          .enum([
            'new_job',
            'job_loss',
            'new_baby',
            'new_relationship',
            'breakup',
            'moving',
            'empty_nest',
            'retirement',
            'health_diagnosis',
            'loss_grief',
            'graduation',
            'promotion',
          ])
          .describe('Type of life transition'),
        currentHabitStatus: z
          .enum(['maintaining', 'struggling', 'abandoned'])
          .describe('How their habits are doing during this transition'),
        biggestChallenge: z.string().optional().describe("Main challenge they're facing"),
      }),
      execute: async (
        { transition, currentHabitStatus, biggestChallenge: _biggestChallenge },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const support = LIFE_TRANSITION_SUPPORT[transition];

        getLogger().info(
          { userId, transition, status: currentHabitStatus },
          '🔄 Life transition support'
        );

        return {
          transition: support.name,
          validation: support.validation,
          whatToExpect: support.expectations,
          habitAdvice: {
            protect: support.habitsToProtect,
            pause: support.habitsToPause,
            add: support.habitsToAdd,
          },
          priorityOrder: support.priorityOrder,
          timeframe: support.adjustmentPeriod,
          selfCareReminder: support.selfCareNote,
          encouragement:
            currentHabitStatus === 'abandoned'
              ? "Your habits aren't gone - they're on pause. When you're ready, we'll rebuild. No shame."
              : currentHabitStatus === 'struggling'
                ? "The fact that you're even thinking about habits during this shows incredible self-awareness."
                : "You're maintaining habits through a major change. That's extraordinary.",
        };
      },
    }),

    // ========================================================================
    // MOTIVATION ON DEMAND - Instant encouragement
    // ========================================================================

    /**
     * Get instant motivation/inspiration
     */
    getMotivation: llm.tool({
      description: getToolDescription('getMotivation'),
      parameters: z.object({
        motivationType: z
          .enum([
            'science_fact',
            'success_story',
            'pep_talk',
            'reframe',
            'why_reminder',
            'future_self',
          ])
          .describe('Type of motivation needed'),
        context: z.string().optional().describe('What they need motivation for'),
        currentStruggle: z.string().optional().describe("What's making it hard"),
      }),
      execute: async ({ motivationType, context, currentStruggle }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const motivation = getMotivationalContent(motivationType, context, currentStruggle);

        getLogger().info({ userId, type: motivationType }, '💪 Motivation delivered');

        return {
          type: motivationType,
          message: motivation.message,
          source: motivation.source,
          actionPrompt: motivation.action,
          followUp: motivation.followUp,
        };
      },
    }),
  };
}

// ============================================================================
// HELPER
// ============================================================================

function getEncouragement(avgStreak: number, wins: number): string {
  if (avgStreak > 30 && wins > 5)
    return "You're absolutely crushing it! Your consistency is inspiring.";
  if (avgStreak > 14) return "Incredible momentum! You're building real staying power.";
  if (avgStreak > 7) return "You're on a roll! Each day is strengthening these habits.";
  if (wins > 0) return 'Love seeing those wins! Every small victory matters.';
  return 'Every journey starts with a single step. Keep going!';
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getUserCoachData };
export default createHabitCoachingTools;
