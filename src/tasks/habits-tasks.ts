/**
 * Habits & Routines Tasks - Maya Santos Domain
 *
 * Domain-specific tasks for habits coaching, routines, and behavior change.
 * Maya's specialty: building sustainable habits with kindness and accountability.
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { IntelligentTask } from './intelligent-task.js';

// ============================================================================
// HABIT TRACKING TASK
// ============================================================================

export interface HabitTrackingResult {
  habitName: string;
  streakLength: number;
  feelingAboutProgress: 'proud' | 'neutral' | 'struggling';
  nextMilestone?: string;
  supportNeeded: boolean;
}

/**
 * HabitTrackingTask - Check in on a specific habit
 *
 * Celebrate wins, be gentle with struggles, keep the momentum going.
 */
export class HabitTrackingTask extends IntelligentTask<HabitTrackingResult> {
  constructor(habitName: string) {
    super({
      instructions: {
        base: `
          Check in on their habit: "${habitName}"
          
          Approach:
          1. ASK how it's going - no judgment
          2. CELEBRATE any progress, even small
          3. UNDERSTAND if they've struggled - what got in the way?
          4. ADJUST if needed - habits should serve them, not the other way around
          
          Key principles:
          - Missing one day isn't failure
          - Consistency > perfection
          - Small habits compound
          - Environment matters more than willpower
          
          "How's [habit] going? I'm cheering for you!"
        `,
        ifDistressed: `
          They might be beating themselves up for missing days.
          Be extra gentle. Focus on getting back on track, not on what was missed.
        `,
        ifHappy: `
          They're probably proud of their progress! 
          Match their energy. Celebrate with them.
        `,
      },
      tools: {
        recordProgress: llm.tool({
          description: 'Record their habit progress update.',
          parameters: z.object({
            habitName: z.string().describe('Name of the habit'),
            streakLength: z.number().describe('Current streak in days'),
            feelingAboutProgress: z
              .enum(['proud', 'neutral', 'struggling'])
              .describe('How they feel about their progress'),
            whatHelped: z.string().optional().describe('What helped them stay on track'),
            whatBlocked: z.string().optional().describe('What got in their way'),
          }),
          execute: async ({ habitName, streakLength, feelingAboutProgress, whatHelped }) => {
            getLogger().info(`Habit tracking: ${habitName}, streak=${streakLength}`);
            
            if (feelingAboutProgress === 'proud') {
              return `${streakLength} days! That's amazing! ${whatHelped ? `And you figured out that ${whatHelped} helps - that's real self-awareness.` : ''}`;
            }
            if (feelingAboutProgress === 'struggling') {
              return "Hey, that's okay. Habits are hard. What matters is you're still thinking about it. That means you haven't given up.";
            }
            return `${streakLength} days is progress. Every day counts.`;
          },
        }),

        suggestAdjustment: llm.tool({
          description: 'Suggest an adjustment to make the habit easier.',
          parameters: z.object({
            suggestion: z.string().describe('The adjustment suggestion'),
            reason: z.string().describe('Why this might help'),
          }),
          execute: async ({ suggestion, reason }) => {
            return `Here's a thought: ${suggestion}. ${reason}`;
          },
        }),

        completeTracking: llm.tool({
          description: 'Complete the habit tracking check-in.',
          parameters: z.object({
            habitName: z.string(),
            streakLength: z.number(),
            feelingAboutProgress: z.enum(['proud', 'neutral', 'struggling']),
            nextMilestone: z.string().optional().describe('Next goal to aim for'),
            supportNeeded: z.boolean().describe('Whether they need more support'),
          }),
          execute: async ({ habitName, streakLength, feelingAboutProgress, nextMilestone, supportNeeded }) => {
            this.complete({ habitName, streakLength, feelingAboutProgress, nextMilestone, supportNeeded });
            return nextMilestone 
              ? `Next up: ${nextMilestone}. You've got this!`
              : "Keep going. I believe in you.";
          },
        }),
      },
    });
  }
}

// ============================================================================
// HABIT BUILDING TASK
// ============================================================================

export interface HabitBuildingResult {
  habitName: string;
  trigger: string;
  routine: string;
  reward?: string;
  startDate?: string;
  commitmentLevel: 'tentative' | 'moderate' | 'strong';
}

/**
 * HabitBuildingTask - Help design a new habit
 *
 * Use the habit loop: Cue → Routine → Reward
 */
export class HabitBuildingTask extends IntelligentTask<HabitBuildingResult> {
  constructor() {
    super({
      instructions: {
        base: `
          Help them build a new habit using the habit loop:
          
          1. CUE (Trigger): What will remind them? When/where?
          2. ROUTINE: What's the smallest version of this habit?
          3. REWARD: What makes it satisfying?
          
          Key principles:
          - START TINY: "Read one page" not "Read 30 minutes"
          - STACK HABITS: Attach new habits to existing ones
          - ENVIRONMENT: Make the cue obvious, the habit easy
          - IDENTITY: "I'm a person who..." vs "I should..."
          
          Questions to ask:
          - "When would be the natural time for this?"
          - "What's already part of your routine that we can stack this on?"
          - "What's the tiniest version of this habit?"
        `,
        ifAnxious: `
          They might be setting the bar too high out of anxiety.
          Encourage them to start even smaller than they think.
        `,
      },
      tools: {
        identifyTrigger: llm.tool({
          description: 'Help identify when/where the habit will happen.',
          parameters: z.object({
            triggerType: z.enum(['time', 'location', 'preceding_habit', 'emotion', 'event']),
            triggerDescription: z.string().describe('The specific trigger'),
            stackedOn: z.string().optional().describe('Existing habit to stack on'),
          }),
          execute: async ({ triggerType, triggerDescription, stackedOn }) => {
            if (stackedOn) {
              return `Perfect - "After ${stackedOn}, I will..." That's habit stacking. Powerful stuff.`;
            }
            return `So ${triggerType === 'time' ? 'at' : 'when'} ${triggerDescription}. Good - specific triggers work better than vague intentions.`;
          },
        }),

        designRoutine: llm.tool({
          description: 'Design the actual habit routine.',
          parameters: z.object({
            fullVersion: z.string().describe('What they ultimately want to do'),
            tinyVersion: z.string().describe('The smallest possible version'),
            suggestion: z.string().describe('Your suggestion for starting small'),
          }),
          execute: async ({ tinyVersion, suggestion }) => {
            return `Start with just: ${tinyVersion}. ${suggestion} You can always do more, but you can never do less than showing up.`;
          },
        }),

        addReward: llm.tool({
          description: 'Add a reward to make the habit satisfying.',
          parameters: z.object({
            reward: z.string().describe('The reward'),
            isIntrinsic: z.boolean().describe('Is this an internal reward (satisfaction) or external?'),
          }),
          execute: async ({ reward, isIntrinsic }) => {
            if (isIntrinsic) {
              return `And notice how it feels after - ${reward}. That feeling is your real reward.`;
            }
            return `And then ${reward}. Nice! External rewards help in the beginning.`;
          },
        }),

        completeHabitDesign: llm.tool({
          description: 'Complete the habit design.',
          parameters: z.object({
            habitName: z.string().describe('Name of the habit'),
            trigger: z.string().describe('When/where it happens'),
            routine: z.string().describe('The tiny version to start'),
            reward: z.string().optional().describe('The reward'),
            startDate: z.string().optional().describe('When they\'ll start'),
            commitmentLevel: z.enum(['tentative', 'moderate', 'strong']),
          }),
          execute: async ({ habitName, trigger, routine, reward, startDate, commitmentLevel }) => {
            this.complete({ habitName, trigger, routine, reward, startDate, commitmentLevel });
            
            const summary = `So here's your habit: "${trigger} → ${routine}${reward ? ` → ${reward}` : ''}"`;
            if (startDate) {
              return `${summary}. Starting ${startDate}. I'll be here to cheer you on!`;
            }
            return `${summary}. When do you want to start?`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// HABIT STRUGGLE TASK
// ============================================================================

export interface HabitStruggleResult {
  habitName: string;
  barrier: string;
  barrierType: 'motivation' | 'environment' | 'time' | 'energy' | 'identity' | 'other';
  solutionExplored: boolean;
  newApproach?: string;
  stillWantsHabit: boolean;
}

/**
 * HabitStruggleTask - Help when a habit isn't sticking
 *
 * No judgment. Just problem-solving with compassion.
 */
export class HabitStruggleTask extends IntelligentTask<HabitStruggleResult> {
  constructor(habitName: string) {
    super({
      instructions: {
        base: `
          They're struggling with: "${habitName}"
          
          First: VALIDATE. Habits are hard. Everyone struggles.
          
          Then: DIAGNOSE. Common barriers:
          - Too big (not tiny enough)
          - Wrong trigger (cue isn't obvious)
          - No reward (not satisfying)
          - Environment fights them
          - Identity mismatch ("I'm not a X person")
          - Life got in the way (temporary or permanent?)
          
          Then: ADJUST or RELEASE
          - Sometimes habits need to be redesigned
          - Sometimes they need to be let go
          - Both are okay
          
          "What's getting in the way? No judgment - I just want to help."
        `,
        ifDistressed: `
          They might be feeling like a failure. Normalize the struggle.
          "Most habits fail the first few times. It's not you - it's the design."
        `,
      },
      tools: {
        identifyBarrier: llm.tool({
          description: 'Identify what\'s blocking the habit.',
          parameters: z.object({
            barrier: z.string().describe('The specific barrier'),
            barrierType: z.enum(['motivation', 'environment', 'time', 'energy', 'identity', 'other']),
            isTemporary: z.boolean().describe('Is this a temporary or ongoing barrier?'),
          }),
          execute: async ({ barrier, barrierType, isTemporary }) => {
            if (barrierType === 'identity') {
              return `Ah, that's an identity thing. Sometimes we need to work on believing we're "the kind of person who..." before the habit sticks.`;
            }
            if (isTemporary) {
              return `Okay, so ${barrier}. That sounds temporary. Sometimes pausing a habit is smart, not failure.`;
            }
            return `So ${barrier} is getting in the way. Let's figure out how to work with that, not against it.`;
          },
        }),

        suggestRedesign: llm.tool({
          description: 'Suggest a redesign of the habit.',
          parameters: z.object({
            newApproach: z.string().describe('The redesigned habit'),
            whyItMightWork: z.string().describe('Why this version might work better'),
          }),
          execute: async ({ newApproach, whyItMightWork }) => {
            return `What if we tried: ${newApproach}? ${whyItMightWork}`;
          },
        }),

        suggestRelease: llm.tool({
          description: 'Suggest letting go of the habit - sometimes that\'s the right answer.',
          parameters: z.object({
            reason: z.string().describe('Why letting go might be right'),
            alternative: z.string().optional().describe('Alternative focus'),
          }),
          execute: async ({ reason, alternative }) => {
            let response = `You know what? Maybe this habit isn't right for you right now. ${reason}`;
            if (alternative) {
              response += ` What if we focused on ${alternative} instead?`;
            }
            return response + " That's not giving up - that's wisdom.";
          },
        }),

        completeStruggle: llm.tool({
          description: 'Complete the struggle conversation.',
          parameters: z.object({
            habitName: z.string(),
            barrier: z.string(),
            barrierType: z.enum(['motivation', 'environment', 'time', 'energy', 'identity', 'other']),
            solutionExplored: z.boolean(),
            newApproach: z.string().optional(),
            stillWantsHabit: z.boolean(),
          }),
          execute: async ({ habitName, barrier, barrierType, solutionExplored, newApproach, stillWantsHabit }) => {
            this.complete({ habitName, barrier, barrierType, solutionExplored, newApproach, stillWantsHabit });
            
            if (!stillWantsHabit) {
              return "That took courage to admit. Focus on what matters most to you right now.";
            }
            if (newApproach) {
              return `Okay, let's try this new approach. I believe in you - and I'll check in on how it's going.`;
            }
            return "We'll figure this out together. Habits take time.";
          },
        }),
      },
    });
  }
}

// ============================================================================
// ROUTINE DESIGN TASK
// ============================================================================

export interface RoutineDesignResult {
  routineName: string;
  routineType: 'morning' | 'evening' | 'work' | 'custom';
  steps: string[];
  totalTime: number;
  anchors: string[];
  confidence: 'low' | 'medium' | 'high';
}

/**
 * RoutineDesignTask - Help design a daily routine
 *
 * Morning routines, evening routines, work routines - structure that supports life.
 */
export class RoutineDesignTask extends IntelligentTask<RoutineDesignResult> {
  constructor(routineType: 'morning' | 'evening' | 'work' | 'custom') {
    super({
      instructions: {
        base: `
          Help them design a ${routineType} routine.
          
          Key principles:
          - REALISTIC: Based on their actual life, not an Instagram ideal
          - FLEXIBLE: Some structure, room to breathe
          - ANCHORED: Built around fixed points (wake time, work start, etc.)
          - MEANINGFUL: Include what matters to them
          
          Questions to ask:
          - "What time do you need to start/end?"
          - "What's non-negotiable for you?"
          - "What do you wish you had time for?"
          - "What's the first thing you want to feel in the morning?"
          
          Don't prescribe - discover what works for THEM.
        `,
        ifAnxious: `
          They might be overwhelmed by the idea of a routine.
          Start small. A routine can be 3 things, not 20.
        `,
      },
      tools: {
        identifyAnchor: llm.tool({
          description: 'Identify a fixed point to anchor the routine.',
          parameters: z.object({
            anchor: z.string().describe('The anchor point (e.g., "7am alarm", "9am work start")'),
            isFlexible: z.boolean().describe('Can this anchor move?'),
          }),
          execute: async ({ anchor, isFlexible }) => {
            if (isFlexible) {
              return `Okay, ${anchor} is a soft anchor - we'll build around it but keep it flexible.`;
            }
            return `Got it - ${anchor} is fixed. We'll build the routine around that.`;
          },
        }),

        addStep: llm.tool({
          description: 'Add a step to the routine.',
          parameters: z.object({
            step: z.string().describe('What they\'ll do'),
            duration: z.number().describe('How long in minutes'),
            purpose: z.string().describe('Why this matters to them'),
            isNonNegotiable: z.boolean().describe('Is this essential?'),
          }),
          execute: async ({ step, duration, purpose, isNonNegotiable }) => {
            if (isNonNegotiable) {
              return `${step} (${duration} min) - non-negotiable because ${purpose}. Got it.`;
            }
            return `${step} (${duration} min) - for ${purpose}. Nice addition.`;
          },
        }),

        completeRoutine: llm.tool({
          description: 'Complete the routine design.',
          parameters: z.object({
            routineName: z.string().describe('Name for this routine'),
            routineType: z.enum(['morning', 'evening', 'work', 'custom']),
            steps: z.array(z.string()).describe('The steps in order'),
            totalTime: z.number().describe('Total time in minutes'),
            anchors: z.array(z.string()).describe('The anchor points'),
            confidence: z.enum(['low', 'medium', 'high']).describe('Their confidence in sticking to it'),
          }),
          execute: async ({ routineName, routineType, steps, totalTime, anchors, confidence }) => {
            this.complete({ routineName, routineType, steps, totalTime, anchors, confidence });
            
            const summary = `Your ${routineType} routine: ${steps.join(' → ')} (${totalTime} min total)`;
            if (confidence === 'low') {
              return `${summary}\n\nRemember: Start with just one or two of these. Build up gradually.`;
            }
            return `${summary}\n\nThis looks doable. Let's try it and adjust as we learn what works.`;
          },
        }),
      },
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  HabitTrackingTask,
  HabitBuildingTask,
  HabitStruggleTask,
  RoutineDesignTask,
};

