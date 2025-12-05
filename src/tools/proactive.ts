/**
 * @deprecated Use the registry-based proactive tools from `domains/proactive/index.ts` instead.
 * This file is being phased out to consolidate proactive functionality.
 *
 * Proactive Tools
 *
 * Tools for proactive actions like scheduling follow-ups, tracking goals,
 * and triggering time-based behaviors.
 *
 * IMPORTANT: Goals are persisted to the user's profile in storage,
 * enabling cross-session memory and personalized advice.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import type { SessionServices } from '../services/index.js';
import type { FinancialGoal } from '../types/user-profile.js';
import { getDefaultStore } from '../memory/index.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UserData {
  name?: string;
  userId?: string;
  services?: SessionServices;
  topics?: string[];
  shortTermGoal?: string;
  longTermGoal?: string;
  timeHorizon?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique goal ID
 */
function generateGoalId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Determine goal type from name
 */
function determineGoalType(name: string): FinancialGoal['type'] {
  const n = name.toLowerCase();
  if (n.includes('retire') || n.includes('401k') || n.includes('ira')) return 'retirement';
  if (n.includes('college') || n.includes('education') || n.includes('tuition')) return 'education';
  if (n.includes('house') || n.includes('home') || n.includes('down payment')) return 'home';
  if (n.includes('emergency') || n.includes('rainy day') || n.includes('safety'))
    return 'emergency';
  if (n.includes('vacation') || n.includes('travel') || n.includes('trip')) return 'travel';
  return 'other';
}

/**
 * Determine time horizon from target date or description
 */
function determineTimeHorizon(targetDate?: string): FinancialGoal['timeHorizon'] {
  if (!targetDate) return 'unknown';

  const now = new Date();
  const target = new Date(targetDate);
  const yearsAway = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365);

  if (isNaN(yearsAway)) {
    // Try to parse text like "5 years", "in 10 years", etc.
    const yearMatch = targetDate.match(/(\d+)\s*year/i);
    if (yearMatch) {
      const years = parseInt(yearMatch[1], 10);
      if (years < 5) return 'short';
      if (years <= 15) return 'medium';
      return 'long';
    }
    return 'unknown';
  }

  if (yearsAway < 5) return 'short';
  if (yearsAway <= 15) return 'medium';
  return 'long';
}

// ============================================================================
// PROACTIVE TOOLS
// ============================================================================

/**
 * Create all proactive action tools
 */
export function createProactiveTools() {
  return {
    // Schedule a follow-up
    scheduleFollowUp: llm.tool({
      description:
        'Schedule a follow-up on a topic for a future conversation. Use when the user mentions wanting to revisit something later.',
      parameters: z.object({
        topic: z.string().describe('What to follow up on'),
        reason: z.string().describe('Why this needs follow-up'),
        urgency: z.enum(['low', 'medium', 'high']).describe('How urgent is the follow-up'),
        suggestedTimeframe: z
          .string()
          .optional()
          .describe('When to follow up (e.g., "next week", "in a month")'),
      }),
      execute: async ({ topic, reason, urgency, suggestedTimeframe }, { ctx }) => {
        getLogger().info(`Scheduling follow-up: ${topic} (${urgency})`);

        const userData = ctx.userData as UserData;
        const { services } = userData;

        // Persist follow-up to user profile
        if (services?.userProfile && userData.userId) {
          const profile = services.userProfile;

          // Calculate target date based on timeframe
          const targetDate = new Date();
          if (suggestedTimeframe?.includes('week')) {
            targetDate.setDate(targetDate.getDate() + 7);
          } else if (suggestedTimeframe?.includes('month')) {
            targetDate.setMonth(targetDate.getMonth() + 1);
          } else {
            targetDate.setDate(targetDate.getDate() + 7); // Default to a week
          }

          // Add to pending follow-ups
          profile.pendingFollowUps.push({
            topic,
            targetDate,
            reason,
          });

          // Save profile
          const store = getDefaultStore();
          await store.saveProfile(profile);

          getLogger().info(`Follow-up saved to profile: ${topic}`);
        }

        const responses = [
          `I've noted that we should follow up on ${topic}. I'll remember that for next time.`,
          `Good point about ${topic}. I'll make sure we circle back to it.`,
          `I'll keep ${topic} in mind for our future conversations.`,
        ];

        return responses[Math.floor(Math.random() * responses.length)];
      },
    }),

    // Set a financial goal - PERSISTS TO STORAGE
    setGoal: llm.tool({
      description:
        'Record a financial goal the user wants to achieve. This persists across sessions so Jack can follow up and provide personalized advice. Use when they mention specific savings targets, retirement plans, or financial objectives.',
      parameters: z.object({
        name: z
          .string()
          .describe(
            'Name of the goal (e.g., "Retirement Fund", "Emergency Savings", "College Fund")'
          ),
        targetAmount: z.number().optional().describe('Target amount in dollars'),
        targetDate: z
          .string()
          .optional()
          .describe('Target date or timeframe (e.g., "2030", "in 5 years")'),
        currentProgress: z.number().optional().describe('Current amount saved toward goal'),
        notes: z.string().optional().describe('Additional context about the goal'),
      }),
      execute: async ({ name, targetAmount, targetDate, currentProgress, notes }, { ctx }) => {
        getLogger().info(`Setting goal: ${name}`);

        const userData = ctx.userData as UserData;
        const { services } = userData;
        const now = new Date();

        // Create a proper FinancialGoal object
        const goal: FinancialGoal = {
          id: generateGoalId(),
          name,
          type: determineGoalType(name),
          targetAmount,
          targetDate: targetDate ? new Date(targetDate) : undefined,
          timeHorizon: determineTimeHorizon(targetDate),
          currentProgress: currentProgress || 0,
          progressPercent:
            targetAmount && currentProgress
              ? Math.round((currentProgress / targetAmount) * 100)
              : 0,
          status: 'active',
          priority: 'medium',
          createdAt: now,
          updatedAt: now,
        };

        // PERSIST TO STORAGE
        if (userData.userId) {
          const store = getDefaultStore();
          await store.saveGoal(userData.userId, goal);
          getLogger().info(`Goal persisted to storage: ${name} for user ${userData.userId}`);

          // Also add to profile's goals array if available
          if (services?.userProfile) {
            services.userProfile.goals.push(goal);
          }
        }

        // Build response
        let response = `I've saved your goal: ${name}.`;
        if (targetAmount) {
          response += ` You're aiming for $${targetAmount.toLocaleString()}.`;
        }
        if (currentProgress && targetAmount) {
          const percent = Math.round((currentProgress / targetAmount) * 100);
          response += ` You're ${percent}% of the way there - great start!`;
        } else if (currentProgress) {
          response += ` You've already saved $${currentProgress.toLocaleString()}.`;
        }
        if (targetDate) {
          response += ` Target: ${targetDate}.`;
        }
        response += ` I'll remember this and check in on your progress in future conversations.`;

        return response;
      },
    }),

    // Check goal progress
    checkGoalProgress: llm.tool({
      description:
        'Review progress on a previously set goal. Use to celebrate wins or discuss adjustments.',
      parameters: z.object({
        goalName: z
          .string()
          .optional()
          .describe('Name of specific goal to check, or leave empty for all goals'),
      }),
      execute: async ({ goalName }, { ctx }) => {
        getLogger().info(`Checking goal progress: ${goalName || 'all'}`);

        const userData = ctx.userData as UserData;
        const { userId } = userData;

        // Try to load goals from storage
        let goals: FinancialGoal[] = [];

        if (userId) {
          const store = getDefaultStore();
          goals = await store.getGoals(userId);
        } else if (userData.services?.userProfile) {
          goals = userData.services.userProfile.goals || [];
        }

        if (goals.length === 0) {
          return `I don't have any goals recorded for you yet. Would you like to set some financial goals together? For example, retirement savings, emergency fund, or a specific purchase?`;
        }

        if (goalName) {
          const goal = goals.find((g) => g.name.toLowerCase().includes(goalName.toLowerCase()));
          if (goal) {
            let response = `Your "${goal.name}" goal:`;
            if (goal.targetAmount) response += ` Target: $${goal.targetAmount.toLocaleString()}`;
            if (goal.currentProgress)
              response += `, Current: $${goal.currentProgress.toLocaleString()}`;
            if (goal.progressPercent) response += ` (${goal.progressPercent}% complete)`;
            response += `. Status: ${goal.status.replace('_', ' ')}.`;

            // Add encouragement based on status
            if (goal.status === 'on_track') {
              response += ` You're doing great - keep it up!`;
            } else if (goal.status === 'behind') {
              response += ` Let's talk about what's getting in the way and how to get back on track.`;
            }

            return response;
          }
          return `I couldn't find a goal matching "${goalName}". Let me know if you'd like to set a new one or if I should check all your goals.`;
        }

        // Return summary of all goals
        const goalSummaries = goals.map((g) => {
          const progress = g.progressPercent ? ` (${g.progressPercent}%)` : '';
          return `• ${g.name}${progress}: ${g.status.replace('_', ' ')}`;
        });

        return `Here are your financial goals:\n${goalSummaries.join('\n')}\n\nWould you like to discuss any of them or update your progress?`;
      },
    }),

    // Update goal progress - PERSISTS TO STORAGE
    updateGoalProgress: llm.tool({
      description:
        'Update the progress on a financial goal. Use when user shares new savings amounts or milestone achievements. This persists across sessions.',
      parameters: z.object({
        goalName: z.string().describe('Name of the goal to update'),
        newAmount: z.number().optional().describe('New current amount saved'),
        status: z
          .enum(['planning', 'active', 'on_track', 'behind', 'achieved', 'abandoned'])
          .optional()
          .describe('Updated status'),
        notes: z.string().optional().describe('Any notes about the update'),
      }),
      execute: async ({ goalName, newAmount, status, notes }, { ctx }) => {
        getLogger().info(`Updating goal: ${goalName}`);

        const userData = ctx.userData as UserData;
        const { userId } = userData;

        if (!userId) {
          return `I'd love to update your ${goalName} goal, but I need you to be logged in to track progress across sessions.`;
        }

        const store = getDefaultStore();
        const goals = await store.getGoals(userId);

        const goal = goals.find((g) => g.name.toLowerCase().includes(goalName.toLowerCase()));

        if (!goal) {
          return `I couldn't find a goal matching "${goalName}". Would you like to set it as a new goal?`;
        }

        // Update the goal
        if (newAmount !== undefined) {
          goal.currentProgress = newAmount;
          if (goal.targetAmount) {
            goal.progressPercent = Math.round((newAmount / goal.targetAmount) * 100);
            // Auto-update status based on progress
            if (goal.progressPercent >= 100 && !status) {
              goal.status = 'achieved';
            } else if (goal.progressPercent >= 75 && goal.status !== 'achieved') {
              goal.status = 'on_track';
            }
          }
        }

        if (status) {
          goal.status = status;
        }

        goal.updatedAt = new Date();

        // PERSIST TO STORAGE
        await store.saveGoal(userId, goal);
        getLogger().info(`Goal updated and persisted: ${goalName}`);

        // Update in-memory profile too
        if (userData.services?.userProfile) {
          const profileGoal = userData.services.userProfile.goals.find((g) => g.id === goal.id);
          if (profileGoal) {
            Object.assign(profileGoal, goal);
          }
        }

        // Build celebratory or supportive response based on status
        if (goal.status === 'achieved') {
          return `🎉 Congratulations! You've achieved your "${goal.name}" goal! That took real discipline. What's next on your financial journey?`;
        }
        if (goal.progressPercent && goal.progressPercent >= 75) {
          return `Fantastic progress on "${goal.name}"! You're at ${goal.progressPercent}% - the finish line is in sight! Keep going!`;
        }
        if (goal.status === 'on_track') {
          return `Great update on "${goal.name}"! You're on track. ${goal.progressPercent ? `${goal.progressPercent}% complete.` : ''} Consistency is key!`;
        }
        if (goal.status === 'behind') {
          return `I understand "${goal.name}" is a bit behind schedule. That's okay - life happens. Let's talk about what's getting in the way and how to adjust.`;
        }

        return `I've updated your "${goal.name}" goal. ${newAmount ? `New balance: $${newAmount.toLocaleString()}.` : ''} Keep up the good work!`;
      },
    }),

    // Suggest a check-in based on time
    suggestCheckIn: llm.tool({
      description: 'Suggest checking in on something based on conversation length or topic weight.',
      parameters: z.object({
        reason: z.enum([
          'long_conversation',
          'heavy_topic',
          'multiple_topics',
          'emotional_content',
          'natural_pause',
        ]),
      }),
      execute: async ({ reason }) => {
        getLogger().info(`Suggesting check-in: ${reason}`);

        const checkIns: Record<string, string[]> = {
          long_conversation: [
            "We've been talking a while. How are you doing? Need a break?",
            "Let me pause here. We've covered a lot. How are you feeling about all this?",
          ],
          heavy_topic: [
            "That's a lot to process. Take a moment. How are you feeling?",
            "We've touched on some heavy stuff. Are you doing okay?",
          ],
          multiple_topics: [
            "We've jumped around a bit. Want to focus on any particular area?",
            "We've covered several things. What feels most important right now?",
          ],
          emotional_content: [
            "I can tell this is emotional. It's okay. Take your time.",
            "That clearly means a lot to you. I'm here. No rush.",
          ],
          natural_pause: [
            'Is there anything else on your mind?',
            'What else would you like to explore?',
          ],
        };

        const options = checkIns[reason] || checkIns.natural_pause;
        return options[Math.floor(Math.random() * options.length)];
      },
    }),

    // Trigger automatic circle-back (called by system, not user)
    triggerCircleBack: llm.tool({
      description:
        'System tool to trigger circling back to an open topic. Use every 5-7 turns to maintain conversation threads.',
      parameters: z.object({
        turnCount: z.number().describe('Current turn count'),
      }),
      execute: async ({ turnCount }, { ctx }) => {
        getLogger().info(`Checking circle-back trigger at turn ${turnCount}`);

        // Only trigger every 5-7 turns
        if (turnCount < 5 || turnCount % 5 !== 0) {
          return null;
        }

        const userData = ctx.userData as UserData;
        const { services } = userData;

        if (services) {
          const context = services.getPromptContext();
          if (context.topicsToCircleBack && context.topicsToCircleBack.length > 0) {
            const topic = context.topicsToCircleBack[0];
            return `By the way, you mentioned ${topic} earlier. Did you want to come back to that?`;
          }
        }

        return null;
      },
    }),
  };
}

export default createProactiveTools;
