/**
 * Habit Coaching Tools - LLM Tool Definitions
 *
 * This file contains the createHabitCoachingTools() function that creates
 * all the LLM-callable tools for habit coaching.
 *
 * @module habit-coaching/tools
 */
import { llm } from '@livekit/agents';
import type { LifeDomain } from './types.js';
import { getUserCoachData } from './storage.js';
/**
 * Create habit coaching tools
 * @returns Object containing all habit coaching LLM tools
 */
export declare function createHabitCoachingTools(): {
    /**
     * Life assessment - understand where user is
     */
    assessLifeDomains: llm.FunctionTool<{
        lifeStage?: "transition" | "retirement" | "early_career" | "mid_career" | "pre_retirement" | "student" | "new_parent" | "empty_nester" | undefined;
        domainScores?: Record<string, number> | undefined;
        notes?: string | undefined;
    }, unknown, {
        summary: string;
        recommendations: ("Health & Wellness" | "Mental & Emotional" | "Relationships" | "Career & Purpose" | "Learning & Growth" | "Financial Wellness" | "Home & Environment" | "Self Care & Joy")[];
        challenges: readonly ["time_management", "focus", "budget_constraints", "stress"] | readonly ["work_life_balance", "financial_foundation", "identity"] | readonly ["sleep_deprivation", "time_scarcity", "identity_shift"] | readonly ["burnout", "stagnation", "sandwich_generation"] | readonly ["identity_redefinition", "relationship_renewal", "health_focus"] | readonly ["retirement_planning", "health_optimization", "meaning"] | readonly ["structure", "purpose", "health_management", "social"] | readonly ["uncertainty", "stress", "identity", "planning"];
        opportunities: readonly ["habit_foundation", "learning_capacity", "flexibility"] | readonly ["income_growth", "skill_building", "networking"] | readonly ["family_bonding", "perspective_shift", "resilience"] | readonly ["peak_earning", "leadership", "mentoring"] | readonly ["freedom", "rediscovery", "travel", "purpose"] | readonly ["wealth_building", "legacy", "bucket_list"] | readonly ["freedom", "grandparenting", "giving_back", "travel"] | readonly ["reinvention", "fresh_start", "clarity"];
        suggestedFocus: LifeDomain;
    }>;
    /**
     * Recommend habits based on goals and life stage
     */
    recommendHabits: llm.FunctionTool<{
        domain: "finance" | "relationships" | "health" | "learning" | "home" | "career" | "mind" | "selfCare";
        goal?: string | undefined;
        difficulty?: "intermediate" | "beginner" | "advanced" | undefined;
    }, unknown, {
        domain: "Health & Wellness" | "Mental & Emotional" | "Relationships" | "Career & Purpose" | "Learning & Growth" | "Financial Wellness" | "Home & Environment" | "Self Care & Joy";
        recommendations: {
            id: string;
            name: string;
            description: string;
            tinyVersion: string;
            benefits: string[];
            isKeystone: boolean;
            timeRequired: string;
        }[];
        tip: string;
    }>;
    /**
     * Create a new enhanced habit with glidepath
     */
    createEnhancedHabit: llm.FunctionTool<{
        name: string;
        domain: "finance" | "relationships" | "health" | "learning" | "home" | "career" | "mind" | "selfCare";
        tinyVersion: string;
        cue: string;
        celebration: string;
        templateId?: string | undefined;
        frequency?: "custom" | "monthly" | "weekly" | "daily" | undefined;
    }, unknown, {
        habitId: string;
        name: string;
        level: string;
        instruction: string;
        yourVersion: string;
        cue: string;
        celebration: string;
        nextStep: string;
        tip: string;
    }>;
    /**
     * Log habit completion
     */
    logHabitCompletion: llm.FunctionTool<{
        habitId: string;
        completed: boolean;
        notes?: string | undefined;
        feelingAfter?: "neutral" | "great" | "good" | "struggled" | undefined;
    }, unknown, Record<string, unknown>>;
    /**
     * Create a habit stack
     */
    createHabitStack: llm.FunctionTool<{
        name: string;
        anchorHabit: string;
        newHabits: string[];
        timeOfDay: "morning" | "afternoon" | "evening" | "anytime";
    }, unknown, {
        stackId: string;
        name: string;
        formula: string;
        tip: string;
        science: string;
    }>;
    /**
     * Weekly reflection
     */
    weeklyReflection: llm.FunctionTool<{
        wins: string[];
        challenges: string[];
        insights: string[];
        adjustments?: string[] | undefined;
    }, unknown, {
        summary: {
            activeHabits: number;
            avgStreak: number;
            keystoneProgress: string;
        };
        wins: string[];
        topChallenge: string;
        keyInsight: string;
        nextWeekFocus: string;
        encouragement: string;
    }>;
    /**
     * Get personalized encouragement
     */
    getEncouragement: llm.FunctionTool<{
        situation: "struggling" | "milestone" | "doing_well" | "broke_streak" | "starting_fresh";
    }, unknown, {
        message: string;
        tip: string;
    }>;
    /**
     * Set life stage and update recommendations
     */
    setLifeStage: llm.FunctionTool<{
        stage: "transition" | "retirement" | "early_career" | "mid_career" | "pre_retirement" | "student" | "new_parent" | "empty_nester";
    }, unknown, {
        stage: "Retirement" | "Student" | "Early Career" | "New Parent" | "Mid Career" | "Empty Nester" | "Pre-Retirement" | "Life Transition";
        priorities: ("Health & Wellness" | "Mental & Emotional" | "Relationships" | "Career & Purpose" | "Learning & Growth" | "Financial Wellness" | "Home & Environment" | "Self Care & Joy")[];
        challenges: readonly ["time_management", "focus", "budget_constraints", "stress"] | readonly ["work_life_balance", "financial_foundation", "identity"] | readonly ["sleep_deprivation", "time_scarcity", "identity_shift"] | readonly ["burnout", "stagnation", "sandwich_generation"] | readonly ["identity_redefinition", "relationship_renewal", "health_focus"] | readonly ["retirement_planning", "health_optimization", "meaning"] | readonly ["structure", "purpose", "health_management", "social"] | readonly ["uncertainty", "stress", "identity", "planning"];
        opportunities: readonly ["habit_foundation", "learning_capacity", "flexibility"] | readonly ["income_growth", "skill_building", "networking"] | readonly ["family_bonding", "perspective_shift", "resilience"] | readonly ["peak_earning", "leadership", "mentoring"] | readonly ["freedom", "rediscovery", "travel", "purpose"] | readonly ["wealth_building", "legacy", "bucket_list"] | readonly ["freedom", "grandparenting", "giving_back", "travel"] | readonly ["reinvention", "fresh_start", "clarity"];
        message: string;
    }>;
    /**
     * Assess user's tendency type for personalized habit strategies
     */
    assessFourTendencies: llm.FunctionTool<{
        tendency: "upholder" | "questioner" | "obliger" | "rebel";
        evidence?: string | undefined;
    }, unknown, {
        tendency: "Upholder" | "Questioner" | "Obliger" | "Rebel";
        description: "You meet both outer expectations (from others) and inner expectations (from yourself). You love schedules, to-do lists, and clear rules." | "You question all expectations and only follow through if you have good reasons. You need to understand WHY before you commit." | "You meet outer expectations (for others) but struggle with inner expectations (for yourself). You need external accountability." | "You resist ALL expectations, both outer and inner. You want to act from freedom and choice, doing things your way.";
        habitStrategies: readonly ["Set clear rules and schedules for yourself", "Create detailed to-do lists and check them off", "Use habit tracking apps religiously", "Set personal deadlines and honor them", "Create routines and stick to them"] | readonly ["Research the science behind habits before starting", "Understand exactly WHY this habit matters", "Set your own goals based on your reasoning", "Question advice and customize to fit your logic", "Track data to prove the habit is working"] | readonly ["Get an accountability partner or coach", "Join a group or class with attendance expectations", "Make appointments you can't cancel", "Tell others about your goals publicly", "Set up external consequences (like charitable donations if you miss)"] | readonly ["Frame habits as choices, not rules (\"I can\" not \"I must\")", "Connect habits to your identity (\"I'm someone who...\")", "Maintain freedom and options within the habit", "Challenge yourself to prove you CAN do it", "Make the habit feel like defiance of limitation"];
        avoidances: readonly ["Don't be too rigid - allow for flexibility", "Watch out for \"tightening\" - making rules stricter over time", "Remember that rest and fun are also \"productive\""] | readonly ["Analysis paralysis - at some point, just start", "Questioning to the point of decision fatigue", "Rejecting good advice just because you didn't come up with it"] | readonly ["Obliger rebellion - pushing yourself too hard until you snap", "Saying yes to everyone else's needs before your own", "Feeling guilty for needing external accountability"] | readonly ["Don't set rigid rules - they'll trigger resistance", "Avoid tracking streaks - they feel like obligations", "Don't let others tell you what to do"];
        motivationTip: "You respond to clear expectations. Put your habits on your calendar and treat them as non-negotiable appointments." | "You need to buy into the WHY. Once you truly believe a habit serves your goals, you'll follow through. Do the research first." | "Your superpower is following through for others. Harness this by creating external accountability structures. This isn't weakness - it's self-knowledge." | "Frame every habit as YOUR choice that expresses who you are. \"I'm the kind of person who...\" works better than any rule. You do things because you WANT to, not because you should.";
        message: string;
    }>;
    /**
     * Transform habits through identity shift
     */
    createIdentityShift: llm.FunctionTool<{
        currentBelief: string;
        desiredIdentity: string;
        domain: "finance" | "relationships" | "health" | "learning" | "home" | "career" | "mind" | "selfCare";
        smallProofs: string[];
    }, unknown, {
        transformation: {
            from: string;
            to: string;
        };
        mantra: string;
        proofActions: string[];
        science: string;
        nextStep: string;
    }>;
    /**
     * Break bad habits using substitution
     */
    breakBadHabit: llm.FunctionTool<{
        badHabit: string;
        currentCue: string;
        actualReward: string;
        replacementRoutine: string;
        frictionStrategies?: string[] | undefined;
    }, unknown, {
        plan: {
            habit: string;
            trigger: string;
            realNeed: string;
            newResponse: string;
        };
        goldenRule: string;
        frictionTips: string[];
        science: string;
        compassionReminder: string;
    }>;
    /**
     * Design environment to support habits
     */
    designEnvironment: llm.FunctionTool<{
        habit: string;
        habitType: "break" | "build";
        currentEnvironment: string;
        suggestedChanges: string[];
    }, unknown, {
        habit: string;
        designType: string;
        changes: string[];
        principles: string[];
        science: string;
        oneThingToday: string;
    }>;
    /**
     * Create temptation bundles
     */
    createTemptationBundle: llm.FunctionTool<{
        needToDo: string;
        wantToDo: string;
        bundleRule: string;
    }, unknown, {
        bundle: {
            task: string;
            reward: string;
            rule: string;
        };
        formula: string;
        science: string;
        tip: string;
    }>;
    /**
     * Process setbacks with self-compassion
     */
    processSetback: llm.FunctionTool<{
        habit: string;
        whatHappened: string;
        currentFeeling: "hopeless" | "frustrated" | "angry" | "ashamed" | "disappointed";
        lessonsLearned?: string | undefined;
    }, unknown, {
        compassionMessage: string;
        reframe: {
            from: string;
            to: string;
        };
        science: string;
        lesson: string;
        pattern: string | null;
        nextStep: string;
        reminder: string;
    }>;
    /**
     * Assess circle of influence vs. concern
     */
    assessCircleOfInfluence: llm.FunctionTool<{
        concern: string;
        influenceAspects: string[];
        outsideControl: string[];
        actionableSteps: string[];
    }, unknown, {
        concern: string;
        analysis: {
            withinInfluence: string[];
            outsideControl: string[];
        };
        recommendation: string;
        letGo: string;
        actions: string[];
        coveyWisdom: string;
        energyTip: string;
    }>;
    /**
     * Set up accountability system
     */
    setupAccountability: llm.FunctionTool<{
        habit: string;
        accountabilityType: "group" | "public" | "partner" | "coach" | "app";
        checkInSchedule: string;
        partnerName?: string | undefined;
        consequences?: string | undefined;
    }, unknown, {
        system: {
            habit: string;
            type: "group" | "public" | "partner" | "coach" | "app";
            partner: string | undefined;
            checkIn: string;
        };
        tips: string[];
        science: string;
        messageTemplate: string | null;
    }>;
    /**
     * Conduct a habit audit
     */
    conductHabitAudit: llm.FunctionTool<{
        currentHabits: {
            name: string;
            category: "neutral" | "good" | "bad";
            frequency: string;
            impact: "medium" | "low" | "high";
        }[];
        morningRoutine?: string | undefined;
        eveningRoutine?: string | undefined;
    }, unknown, {
        summary: {
            totalHabits: number;
            goodHabits: number;
            badHabits: number;
            neutralHabits: number;
        };
        keystoneCandidates: string[];
        priorities: {
            protect: string[];
            eliminate: string[];
            upgrade: string[];
        };
        routineAnalysis: {
            morning: string;
            evening: string;
            recommendation: string;
        };
        nextStep: string;
    }>;
    /**
     * Start a 30-day challenge
     */
    start30DayChallenge: llm.FunctionTool<{
        challengeType: "connection" | "gratitude" | "hydration" | "declutter" | "mindfulness" | "morning_person" | "fitness_starter" | "financial_reset" | "digital_detox" | "sleep_optimization";
        startDate?: string | undefined;
        intensity?: "moderate" | "gentle" | "intensive" | undefined;
    }, unknown, {
        challenge: string;
        description: string;
        startDate: string;
        duration: string;
        intensity: "moderate" | "gentle" | "intensive";
        week1Preview: string;
        day1Action: string;
        commitment: string;
        tip: string;
    }>;
    /**
     * Get today's challenge action
     */
    getTodaysChallengeAction: llm.FunctionTool<{
        challengeId?: string | undefined;
    }, unknown, {
        error: string;
        message?: undefined;
        daysUntilStart?: undefined;
        completedDays?: undefined;
        successRate?: undefined;
        day?: undefined;
        week?: undefined;
        weekTheme?: undefined;
        todayAction?: undefined;
        intensityNote?: undefined;
        encouragement?: undefined;
        completedSoFar?: undefined;
    } | {
        message: string;
        daysUntilStart: number;
        error?: undefined;
        completedDays?: undefined;
        successRate?: undefined;
        day?: undefined;
        week?: undefined;
        weekTheme?: undefined;
        todayAction?: undefined;
        intensityNote?: undefined;
        encouragement?: undefined;
        completedSoFar?: undefined;
    } | {
        message: string;
        completedDays: number;
        successRate: string;
        error?: undefined;
        daysUntilStart?: undefined;
        day?: undefined;
        week?: undefined;
        weekTheme?: undefined;
        todayAction?: undefined;
        intensityNote?: undefined;
        encouragement?: undefined;
        completedSoFar?: undefined;
    } | {
        day: number;
        week: number;
        weekTheme: string;
        todayAction: string;
        intensityNote: string;
        encouragement: string;
        completedSoFar: number;
        error?: undefined;
        message?: undefined;
        daysUntilStart?: undefined;
        completedDays?: undefined;
        successRate?: undefined;
    }>;
    /**
     * Log challenge day completion
     */
    logChallengeDay: llm.FunctionTool<{
        completed: boolean;
        notes?: string | undefined;
        difficulty?: "moderate" | "hard" | "easy" | "struggled" | undefined;
    }, unknown, {
        error: string;
        day?: undefined;
        completed?: undefined;
        totalCompleted?: undefined;
        successRate?: undefined;
        milestone?: undefined;
        encouragement?: undefined;
    } | {
        day: number;
        completed: boolean;
        totalCompleted: number;
        successRate: string;
        milestone: string | null;
        encouragement: string;
        error?: undefined;
    }>;
    /**
     * Get habit bundle recommendations
     */
    getHabitBundle: llm.FunctionTool<{
        bundleType: "energy_boost" | "evening_wind_down" | "morning_person" | "fitness_beginner" | "stress_relief" | "productivity_boost" | "mindfulness_starter" | "financial_wellness" | "better_sleep" | "relationship_nurturing";
        currentWakeTime?: string | undefined;
        availableMinutes?: number | undefined;
    }, unknown, {
        bundle: string;
        goal: string;
        description: string;
        totalTime: string;
        habits: {
            name: string;
            duration: string;
            tinyVersion: string;
            priority: "core" | "enhancement";
            order: number;
        }[];
        stackFormula: string;
        scienceNote: string;
        startTip: string;
        firstWeek: string;
    }>;
    /**
     * Diagnose why a habit isn't sticking
     */
    troubleshootHabit: llm.FunctionTool<{
        habit: string;
        failurePoint: "never_start" | "start_then_stop" | "inconsistent" | "hate_it" | "forget";
        attempts?: number | undefined;
        currentCue?: string | undefined;
        currentReward?: string | undefined;
        timeOfDay?: string | undefined;
    }, unknown, {
        habit: string;
        diagnosis: {
            likelyIssue: string;
            explanation: string;
            behaviorScienceInsight: string | undefined;
        };
        fixes: string[];
        reframedHabit: string;
        nextStep: string;
        encouragement: string;
    }>;
    /**
     * Log mood and energy with habit context
     */
    logMoodEnergy: llm.FunctionTool<{
        mood: "low" | "struggling" | "okay" | "great" | "good";
        energy: "moderate" | "low" | "high" | "depleted";
        timeOfDay: "morning" | "midday" | "afternoon" | "evening" | "night";
        habitsCompletedToday?: string[] | undefined;
        notes?: string | undefined;
    }, unknown, {
        logged: {
            mood: "low" | "struggling" | "okay" | "great" | "good";
            energy: "moderate" | "low" | "high" | "depleted";
            time: "morning" | "midday" | "afternoon" | "evening" | "night";
        };
        patterns: import("./types.js").MoodPatterns | null;
        correlations: Record<string, string>;
        tip: string;
    }>;
    /**
     * Get support for a life transition
     */
    supportLifeTransition: llm.FunctionTool<{
        transition: "retirement" | "breakup" | "graduation" | "empty_nest" | "health_diagnosis" | "job_loss" | "promotion" | "moving" | "new_baby" | "loss_grief" | "new_job" | "new_relationship";
        currentHabitStatus: "struggling" | "maintaining" | "abandoned";
        biggestChallenge?: string | undefined;
    }, unknown, {
        transition: string;
        validation: string;
        whatToExpect: string[];
        habitAdvice: {
            protect: string[];
            pause: string[];
            add: string[];
        };
        priorityOrder: string[];
        timeframe: string;
        selfCareReminder: string;
        encouragement: string;
    }>;
    /**
     * Get instant motivation/inspiration
     */
    getMotivation: llm.FunctionTool<{
        motivationType: "reframe" | "science_fact" | "success_story" | "pep_talk" | "why_reminder" | "future_self";
        context?: string | undefined;
        currentStruggle?: string | undefined;
    }, unknown, {
        type: "reframe" | "science_fact" | "success_story" | "pep_talk" | "why_reminder" | "future_self";
        message: string;
        source: string | undefined;
        actionPrompt: string;
        followUp: string;
    }>;
};
export { getUserCoachData };
export default createHabitCoachingTools;
//# sourceMappingURL=tools.d.ts.map