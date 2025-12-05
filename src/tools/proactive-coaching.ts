/**
 * @deprecated Use the registry-based proactive tools from `domains/proactive/index.ts` instead.
 * This file is being phased out to consolidate proactive functionality.
 *
 * Maya's Proactive Coaching System
 * 
 * Makes Maya a REAL coach who:
 * - Notices when you haven't shown up
 * - Celebrates your milestones before you forget
 * - Spots patterns and offers help
 * - Checks in during life transitions
 * - Knows when to push and when to give space
 * 
 * This transforms Maya from reactive tool to proactive partner.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { getProductivityStore } from '../services/productivity-store.js';

// ============================================================================
// PROACTIVE TRIGGER TYPES
// ============================================================================

export type ProactiveTriggerType = 
  | 'silence_check_in'           // Haven't heard from them
  | 'streak_at_risk'             // Streak might break today
  | 'streak_milestone'           // Hit 7, 14, 21, 30, 66 days
  | 'challenge_reminder'         // Active challenge needs attention
  | 'challenge_milestone'        // Week complete, halfway, etc.
  | 'pattern_detected'           // Noticed a pattern (good or bad)
  | 'mood_trend'                 // Declining mood/energy trend
  | 'level_up_ready'             // Ready to advance to next level
  | 'life_transition_check'      // Check in on major life change
  | 'celebration_due'            // Achievement deserves recognition
  | 'encouragement_needed'       // Multiple struggles detected
  | 'accountability_reminder'    // For Obligers especially
  | 'weekly_reflection_due'      // Time for weekly review
  | 'habit_anniversary'          // 30, 90, 180, 365 days of a habit
  | 'comeback_opportunity';      // Good time to restart after break

export interface ProactiveTrigger {
  id: string;
  type: ProactiveTriggerType;
  userId: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  habitId?: string;
  challengeId?: string;
  data: Record<string, unknown>;
  detectedAt: Date;
  message: ProactiveMessage;
  dismissed: boolean;
  actedOn: boolean;
}

export interface ProactiveMessage {
  opener: string;           // The hook/opening line
  body: string;             // Main message
  question?: string;        // Engaging question
  actionSuggestion?: string; // What they could do
  tone: 'warm' | 'celebratory' | 'gentle' | 'encouraging' | 'curious';
}

// ============================================================================
// PROACTIVE DETECTION ENGINE
// ============================================================================

interface DetectionContext {
  userId: string;
  tendency?: string;  // Four Tendencies
  lifeStage?: string;
  lastActivity?: Date;
  activeHabits: Array<{
    id: string;
    name: string;
    currentStreak: number;
    lastCompletion?: Date;
    level: number;
    successRate: number;
  }>;
  activeChallenge?: {
    id: string;
    type: string;
    currentDay: number;
    completedDays: number;
  };
  recentMoods: Array<{
    mood: string;
    energy: string;
    date: Date;
  }>;
  weeklyReflectionsDue: boolean;
}

/**
 * Detect all proactive triggers for a user
 */
export function detectProactiveTriggers(context: DetectionContext): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];
  const now = new Date();

  // 1. SILENCE CHECK-IN
  if (context.lastActivity) {
    const daysSinceActivity = Math.floor(
      (now.getTime() - context.lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceActivity >= 3 && daysSinceActivity < 7) {
      triggers.push(createTrigger('silence_check_in', context.userId, 'medium', {
        daysSince: daysSinceActivity,
        message: generateSilenceMessage(daysSinceActivity, context.tendency),
      }));
    } else if (daysSinceActivity >= 7) {
      triggers.push(createTrigger('comeback_opportunity', context.userId, 'high', {
        daysSince: daysSinceActivity,
        message: generateComebackMessage(daysSinceActivity, context.tendency),
      }));
    }
  }

  // 2. STREAK AT RISK
  for (const habit of context.activeHabits) {
    if (habit.lastCompletion) {
      const hoursSinceCompletion = (now.getTime() - habit.lastCompletion.getTime()) / (1000 * 60 * 60);
      
      // If it's been 20+ hours and they have a streak worth protecting
      if (hoursSinceCompletion >= 20 && hoursSinceCompletion < 28 && habit.currentStreak >= 3) {
        triggers.push(createTrigger('streak_at_risk', context.userId, 'high', {
          habitId: habit.id,
          habitName: habit.name,
          currentStreak: habit.currentStreak,
          hoursLeft: Math.round(28 - hoursSinceCompletion),
          message: generateStreakAtRiskMessage(habit.name, habit.currentStreak, context.tendency),
        }));
      }
    }
  }

  // 3. STREAK MILESTONES
  for (const habit of context.activeHabits) {
    const milestones = [7, 14, 21, 30, 66, 100, 365];
    if (milestones.includes(habit.currentStreak)) {
      triggers.push(createTrigger('streak_milestone', context.userId, 'high', {
        habitId: habit.id,
        habitName: habit.name,
        streak: habit.currentStreak,
        message: generateStreakMilestoneMessage(habit.name, habit.currentStreak),
      }));
    }
  }

  // 4. CHALLENGE REMINDERS
  if (context.activeChallenge) {
    const { currentDay, completedDays } = context.activeChallenge;
    
    // Check if today's action hasn't been done
    // (This would need to check against today specifically)
    
    // Milestone checks
    if (currentDay === 7 || currentDay === 14 || currentDay === 21 || currentDay === 30) {
      triggers.push(createTrigger('challenge_milestone', context.userId, 'high', {
        challengeId: context.activeChallenge.id,
        day: currentDay,
        completed: completedDays,
        message: generateChallengeMilestoneMessage(currentDay, completedDays, context.activeChallenge.type),
      }));
    }
  }

  // 5. LEVEL UP READY
  for (const habit of context.activeHabits) {
    // If they've been at this level with high success for 2+ weeks
    if (habit.successRate >= 85 && habit.currentStreak >= 14 && habit.level < 5) {
      triggers.push(createTrigger('level_up_ready', context.userId, 'medium', {
        habitId: habit.id,
        habitName: habit.name,
        currentLevel: habit.level,
        message: generateLevelUpReadyMessage(habit.name, habit.level),
      }));
    }
  }

  // 6. MOOD TREND
  if (context.recentMoods.length >= 3) {
    const recentMoodValues = context.recentMoods.slice(-3).map(m => 
      m.mood === 'great' ? 5 : m.mood === 'good' ? 4 : m.mood === 'okay' ? 3 : m.mood === 'low' ? 2 : 1
    );
    const avgMood = recentMoodValues.reduce((a, b) => a + b, 0) / recentMoodValues.length;
    
    if (avgMood < 2.5) {
      triggers.push(createTrigger('encouragement_needed', context.userId, 'high', {
        avgMood,
        message: generateEncouragementMessage(context.tendency),
      }));
    }
  }

  // 7. WEEKLY REFLECTION DUE
  if (context.weeklyReflectionsDue) {
    triggers.push(createTrigger('weekly_reflection_due', context.userId, 'medium', {
      message: generateWeeklyReflectionMessage(),
    }));
  }

  // 8. ACCOUNTABILITY REMINDER (especially for Obligers)
  if (context.tendency === 'obliger') {
    // Obligers need more check-ins
    if (context.lastActivity) {
      const daysSince = Math.floor(
        (now.getTime() - context.lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince >= 2) {
        triggers.push(createTrigger('accountability_reminder', context.userId, 'high', {
          daysSince,
          message: generateAccountabilityMessage(daysSince),
        }));
      }
    }
  }

  return triggers;
}

// ============================================================================
// MESSAGE GENERATORS
// ============================================================================

function generateSilenceMessage(days: number, tendency?: string): ProactiveMessage {
  const messages: ProactiveMessage[] = [
    {
      opener: `Hey! It's been ${days} days since we talked.`,
      body: "No judgment - life happens. I just wanted to check in and see how you're doing.",
      question: "What's been going on?",
      actionSuggestion: "Even if habits slipped, you can always start fresh right now.",
      tone: 'warm',
    },
    {
      opener: "Been thinking about you!",
      body: `It's been ${days} days and I wanted to see how things are going. Sometimes silence means life got busy, sometimes it means we're struggling.`,
      question: "Which is it for you?",
      tone: 'curious',
    },
    {
      opener: "Quick check-in time!",
      body: "I noticed you've been quiet. That's totally okay - but I'm here when you're ready.",
      question: "Want to catch up on where things stand?",
      tone: 'gentle',
    },
  ];

  // Adjust for Obligers
  if (tendency === 'obliger') {
    return {
      opener: `Hey! It's day ${days} of radio silence.`,
      body: "I know you do better with accountability, so I'm showing up. That's my job. Your job is just to respond.",
      question: "What's one tiny thing you could do today?",
      actionSuggestion: "Just check in with me. That counts as showing up.",
      tone: 'encouraging',
    };
  }

  return messages[Math.floor(Math.random() * messages.length)];
}

function generateComebackMessage(days: number, tendency?: string): ProactiveMessage {
  return {
    opener: `It's been ${days} days. That's okay.`,
    body: "I'm not here to make you feel guilty. Life is messy sometimes. But I want you to know: everything you built before isn't gone. Those neural pathways are still there, just a bit rusty.",
    question: "Want to start fresh today? We can go even smaller than before.",
    actionSuggestion: "One tiny action. That's all it takes to come back.",
    tone: 'warm',
  };
}

function generateStreakAtRiskMessage(habitName: string, streak: number, tendency?: string): ProactiveMessage {
  const urgentMessages: ProactiveMessage[] = [
    {
      opener: `🔥 ${streak}-day streak alert!`,
      body: `Your "${habitName}" streak is at risk! You've built ${streak} days of momentum.`,
      question: "Can you do even the tiniest version today?",
      actionSuggestion: "Remember: the 2-minute version still counts. Just show up.",
      tone: 'encouraging',
    },
    {
      opener: "Streak protection time!",
      body: `${streak} days of "${habitName}" - that's real progress. Don't let today break it.`,
      question: "What's the absolute minimum you could do?",
      tone: 'encouraging',
    },
  ];

  // Rebels don't respond well to "protect your streak" messaging
  if (tendency === 'rebel') {
    return {
      opener: "Your choice today:",
      body: `You could do "${habitName}" or not. ${streak} days in, you've proven you CAN do it. The question is: who do you want to be today?`,
      question: "What does the person you're becoming do?",
      tone: 'curious',
    };
  }

  return urgentMessages[Math.floor(Math.random() * urgentMessages.length)];
}

function generateStreakMilestoneMessage(habitName: string, streak: number): ProactiveMessage {
  const milestoneMessages: Record<number, ProactiveMessage> = {
    7: {
      opener: "🎉 ONE WEEK!",
      body: `Seven days of "${habitName}"! Most people don't make it past day 3. You're different.`,
      question: "How does it feel?",
      tone: 'celebratory',
    },
    14: {
      opener: "⭐ TWO WEEKS!",
      body: `14 days straight! "${habitName}" is becoming part of who you are. The neural pathway is strengthening.`,
      question: "Do you notice it getting easier?",
      tone: 'celebratory',
    },
    21: {
      opener: "🏆 THREE WEEKS!",
      body: `21 days of "${habitName}"! This is legendary. Research says this is when habits really start to stick.`,
      question: "You're building something real. Feel it?",
      tone: 'celebratory',
    },
    30: {
      opener: "🎊 ONE MONTH!",
      body: `30 DAYS! "${habitName}" is no longer something you do - it's something you ARE. You showed up every single day for a month.`,
      question: "What did you learn about yourself?",
      tone: 'celebratory',
    },
    66: {
      opener: "🌟 66 DAYS - AUTOMATICITY!",
      body: `This is the magic number. Research shows 66 days is when habits become truly automatic. "${habitName}" is now part of you.`,
      question: "Does it feel weird when you DON'T do it?",
      tone: 'celebratory',
    },
    100: {
      opener: "💯 ONE HUNDRED DAYS!",
      body: `100 days of "${habitName}". This is extraordinary. You've proven something about yourself that can never be taken away.`,
      question: "What's next?",
      tone: 'celebratory',
    },
    365: {
      opener: "🏅 ONE YEAR!",
      body: `365 days. One full year of "${habitName}". You are literally a different person than when you started. This is who you are now.`,
      question: "How do you want to celebrate?",
      tone: 'celebratory',
    },
  };

  return milestoneMessages[streak] || {
    opener: `🔥 ${streak} day streak!`,
    body: `"${habitName}" - you're on fire!`,
    tone: 'celebratory',
  };
}

function generateChallengeMilestoneMessage(day: number, completed: number, challengeType: string): ProactiveMessage {
  if (day === 7) {
    return {
      opener: "🌟 Week 1 Complete!",
      body: `You made it through the first week! ${completed}/7 days completed. The hardest part is starting - and you did it.`,
      question: "What was your biggest win this week?",
      tone: 'celebratory',
    };
  }
  if (day === 14) {
    return {
      opener: "⭐ Halfway there!",
      body: `Day 14 - you're halfway through your challenge! ${completed} days completed. You've built real momentum.`,
      question: "What's feeling different?",
      tone: 'celebratory',
    };
  }
  if (day === 21) {
    return {
      opener: "🏆 3 Weeks Down!",
      body: "21 days! This is when habits really start to stick. One more week to lock it in.",
      question: "Can you feel the transformation?",
      tone: 'celebratory',
    };
  }
  if (day === 30) {
    return {
      opener: "🎉 CHALLENGE COMPLETE!",
      body: `YOU DID IT! 30 days of transformation. ${completed}/30 days completed. You're not the same person who started.`,
      question: "How do you want to continue?",
      actionSuggestion: "Consider making this a permanent habit or starting a new challenge.",
      tone: 'celebratory',
    };
  }

  return {
    opener: `Day ${day} checkpoint!`,
    body: `You're ${Math.round((day/30)*100)}% through your challenge.`,
    tone: 'encouraging',
  };
}

function generateLevelUpReadyMessage(habitName: string, currentLevel: number): ProactiveMessage {
  const levelNames = ['Tiny Start', 'Mini Habit', 'Emerging Practice', 'Established Habit', 'Lifestyle Integration'];
  const nextLevel = levelNames[currentLevel] || 'next level';
  
  return {
    opener: "📈 Level up available!",
    body: `You've been crushing "${habitName}" at this level. Your success rate is high and consistent. You might be ready for "${nextLevel}".`,
    question: "Does the current version feel easy now?",
    actionSuggestion: "Only level up when it feels EASY, not just doable.",
    tone: 'encouraging',
  };
}

function generateEncouragementMessage(tendency?: string): ProactiveMessage {
  return {
    opener: "I see you.",
    body: "Your recent check-ins show things have been tough. I want you to know that's okay. Hard seasons don't erase your progress - they test it.",
    question: "What's one small thing that might help today?",
    actionSuggestion: "Sometimes the habit isn't the priority. Self-compassion is.",
    tone: 'gentle',
  };
}

function generateWeeklyReflectionMessage(): ProactiveMessage {
  return {
    opener: "Weekly reflection time! 📝",
    body: "It's been a week. Taking a few minutes to reflect can multiply your progress.",
    question: "What went well? What was hard? What did you learn?",
    tone: 'curious',
  };
}

function generateAccountabilityMessage(days: number): ProactiveMessage {
  return {
    opener: "Accountability check-in!",
    body: `Hey, I know you do best with external accountability, so here I am. It's been ${days} days since you checked in.`,
    question: "What's one habit you can commit to today?",
    actionSuggestion: "Just reply and tell me what you'll do. That's all.",
    tone: 'encouraging',
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createTrigger(
  type: ProactiveTriggerType,
  userId: string,
  priority: 'low' | 'medium' | 'high' | 'urgent',
  data: Record<string, unknown>
): ProactiveTrigger {
  return {
    id: `trigger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    userId,
    priority,
    habitId: data.habitId as string | undefined,
    challengeId: data.challengeId as string | undefined,
    data,
    detectedAt: new Date(),
    message: data.message as ProactiveMessage,
    dismissed: false,
    actedOn: false,
  };
}

// ============================================================================
// MAYA'S PROACTIVE COACHING TOOLS
// ============================================================================

export function createProactiveCoachingTools() {
  return {
    /**
     * Check for proactive coaching opportunities
     */
    checkForProactiveOpportunities: llm.tool({
      description: `Check if there are any proactive coaching opportunities for the user.
This analyzes their habits, challenges, moods, and activity to find moments
where Maya should reach out proactively.

Use when:
- Starting a conversation (check if there's something to celebrate/address)
- User hasn't mentioned anything specific
- Periodic check-in time`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Gather context
        const habits = store.getUserEnhancedHabits(userId);
        const profile = store.getHabitCoachProfile(userId);
        const tendency = store.getUserPreference(userId, 'fourTendency') as string | undefined;
        const moodLogs = store.getUserPreference(userId, 'moodLogs') as Array<{mood: string; energy: string; date: string}> || [];
        const lastReflection = store.getUserWeeklyReflections(userId)[0];
        
        // Build context
        const context: DetectionContext = {
          userId,
          tendency,
          lifeStage: profile?.lifeStage,
          lastActivity: habits.length > 0 
            ? new Date(Math.max(...habits.map(h => new Date(h.updatedAt).getTime())))
            : undefined,
          activeHabits: habits.filter(h => h.isActive).map(h => ({
            id: h.id,
            name: h.name,
            currentStreak: h.currentStreak,
            lastCompletion: h.updatedAt ? new Date(h.updatedAt) : undefined,
            level: h.currentLevel,
            successRate: h.successRate,
          })),
          activeChallenge: undefined, // Would need to check challenge data
          recentMoods: moodLogs.slice(-5).map(m => ({
            mood: m.mood,
            energy: m.energy,
            date: new Date(m.date),
          })),
          weeklyReflectionsDue: !lastReflection || 
            (Date.now() - new Date(lastReflection.date).getTime() > 7 * 24 * 60 * 60 * 1000),
        };
        
        // Detect triggers
        const triggers = detectProactiveTriggers(context);
        
        // Sort by priority
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        triggers.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        getLogger().info({ userId, triggers: triggers.length }, '🎯 Proactive opportunities detected');

        if (triggers.length === 0) {
          return {
            hasOpportunities: false,
            message: "No specific proactive moments right now. User is on track!",
          };
        }

        const topTrigger = triggers[0];
        
        return {
          hasOpportunities: true,
          topPriority: {
            type: topTrigger.type,
            priority: topTrigger.priority,
            message: topTrigger.message,
          },
          otherTriggers: triggers.slice(1, 4).map(t => ({
            type: t.type,
            priority: t.priority,
          })),
          suggestion: `Lead with: "${topTrigger.message.opener}"`,
        };
      },
    }),

    /**
     * Generate personalized proactive message
     */
    generateProactiveMessage: llm.tool({
      description: `Generate a personalized proactive coaching message for a specific trigger.
Use this to craft the perfect outreach based on the user's personality and situation.

Use when:
- A proactive opportunity was detected
- You want to reach out with intention`,
      parameters: z.object({
        triggerType: z.enum([
          'silence_check_in',
          'streak_at_risk',
          'streak_milestone',
          'challenge_reminder',
          'challenge_milestone',
          'pattern_detected',
          'mood_trend',
          'level_up_ready',
          'life_transition_check',
          'celebration_due',
          'encouragement_needed',
          'accountability_reminder',
          'weekly_reflection_due',
          'habit_anniversary',
          'comeback_opportunity'
        ]).describe('Type of proactive trigger'),
        context: z.string().optional().describe('Additional context about the situation'),
      }),
      execute: async ({ triggerType, context }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        const tendency = store.getUserPreference(userId, 'fourTendency') as string | undefined;
        
        let message: ProactiveMessage;
        
        switch (triggerType) {
          case 'silence_check_in':
            message = generateSilenceMessage(3, tendency);
            break;
          case 'streak_at_risk':
            message = generateStreakAtRiskMessage(context || 'habit', 7, tendency);
            break;
          case 'encouragement_needed':
            message = generateEncouragementMessage(tendency);
            break;
          case 'weekly_reflection_due':
            message = generateWeeklyReflectionMessage();
            break;
          case 'comeback_opportunity':
            message = generateComebackMessage(7, tendency);
            break;
          default:
            message = {
              opener: "Hey there!",
              body: "Just checking in to see how things are going with your habits.",
              question: "What's on your mind?",
              tone: 'warm',
            };
        }

        getLogger().info({ userId, triggerType }, '💬 Proactive message generated');

        return {
          message,
          tendencyAdjusted: !!tendency,
          tip: tendency === 'obliger' 
            ? 'This user needs external accountability. Be direct about check-ins.'
            : tendency === 'rebel'
            ? 'Frame as choice and identity, not obligation.'
            : tendency === 'questioner'
            ? 'Include reasoning and evidence.'
            : 'Standard warm approach.',
        };
      },
    }),

    /**
     * Schedule a follow-up check-in
     */
    scheduleFollowUp: llm.tool({
      description: `Schedule a proactive follow-up with the user.
Use this to set a reminder to check in at a specific time.

Use when:
- User is working on something and you want to check back
- User is struggling and needs future support
- User completed something and deserves follow-up celebration`,
      parameters: z.object({
        reason: z.string().describe('Why we\'re following up'),
        timing: z.enum(['tomorrow', 'in_3_days', 'next_week', 'in_2_weeks', 'next_month'])
          .describe('When to follow up'),
        habitId: z.string().optional().describe('Related habit if applicable'),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      }),
      execute: async ({ reason, timing, habitId, priority = 'medium' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        const timingMap: Record<string, number> = {
          tomorrow: 1,
          in_3_days: 3,
          next_week: 7,
          in_2_weeks: 14,
          next_month: 30,
        };
        
        const daysUntil = timingMap[timing];
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + daysUntil);
        
        // Store scheduled follow-up
        const followUps = store.getUserPreference(userId, 'scheduledFollowUps') as Array<{
          id: string;
          reason: string;
          date: string;
          habitId?: string;
          priority: string;
          completed: boolean;
        }> || [];
        
        const newFollowUp = {
          id: `followup_${Date.now()}`,
          reason,
          date: followUpDate.toISOString(),
          habitId,
          priority,
          completed: false,
        };
        
        followUps.push(newFollowUp);
        store.setUserPreference(userId, 'scheduledFollowUps', followUps);

        getLogger().info({ userId, reason, timing, date: followUpDate.toISOString() }, '📅 Follow-up scheduled');

        return {
          scheduled: true,
          date: followUpDate.toISOString().split('T')[0],
          daysUntil,
          reason,
          message: `I'll check in ${timing.replace('_', ' ')} about: ${reason}`,
        };
      },
    }),

    /**
     * Get pending follow-ups
     */
    getPendingFollowUps: llm.tool({
      description: `Get any scheduled follow-ups that are due.
Use at the start of conversations to see if there's something to follow up on.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        const followUps = store.getUserPreference(userId, 'scheduledFollowUps') as Array<{
          id: string;
          reason: string;
          date: string;
          habitId?: string;
          priority: string;
          completed: boolean;
        }> || [];
        
        const now = new Date();
        const due = followUps.filter(f => !f.completed && new Date(f.date) <= now);
        const upcoming = followUps.filter(f => !f.completed && new Date(f.date) > now);

        getLogger().info({ userId, due: due.length, upcoming: upcoming.length }, '📋 Follow-ups checked');

        return {
          dueNow: due.map(f => ({
            id: f.id,
            reason: f.reason,
            scheduledFor: f.date,
            priority: f.priority,
          })),
          upcomingCount: upcoming.length,
          suggestion: due.length > 0 
            ? `Follow up on: "${due[0].reason}"`
            : 'No follow-ups due right now.',
        };
      },
    }),

    /**
     * Mark follow-up as complete
     */
    completeFollowUp: llm.tool({
      description: `Mark a scheduled follow-up as complete.
Use after you've followed up with the user.`,
      parameters: z.object({
        followUpId: z.string().describe('ID of the follow-up to complete'),
        outcome: z.string().optional().describe('What happened when you followed up'),
      }),
      execute: async ({ followUpId, outcome }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        const followUps = store.getUserPreference(userId, 'scheduledFollowUps') as Array<{
          id: string;
          reason: string;
          date: string;
          habitId?: string;
          priority: string;
          completed: boolean;
          outcome?: string;
        }> || [];
        
        const index = followUps.findIndex(f => f.id === followUpId);
        if (index >= 0) {
          followUps[index].completed = true;
          if (outcome) {
            followUps[index].outcome = outcome;
          }
          store.setUserPreference(userId, 'scheduledFollowUps', followUps);
        }

        getLogger().info({ userId, followUpId }, '✅ Follow-up completed');

        return {
          completed: index >= 0,
          message: index >= 0 ? 'Follow-up marked as complete.' : 'Follow-up not found.',
        };
      },
    }),

    /**
     * Celebrate an achievement proactively
     */
    celebrateAchievement: llm.tool({
      description: `Generate a celebration for a user achievement.
Use this when you detect or are told about an achievement that deserves recognition.

Use when:
- Streak milestone reached
- Challenge completed
- Level up achieved
- Comeback after break
- Any win worth celebrating`,
      parameters: z.object({
        achievementType: z.enum([
          'streak_milestone',
          'challenge_complete',
          'level_up',
          'comeback',
          'first_habit',
          'consistency',
          'breakthrough',
          'life_win'
        ]).describe('Type of achievement'),
        details: z.string().describe('Specific details about the achievement'),
      }),
      execute: async ({ achievementType, details }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const celebrations: Record<string, string[]> = {
          streak_milestone: [
            "🎉 STOP EVERYTHING! This deserves a celebration!",
            "🌟 Do you hear that? That's the sound of progress!",
            "🔥 This streak is ON FIRE!",
          ],
          challenge_complete: [
            "🏆 YOU DID IT! The whole challenge!",
            "🎊 30 days. Done. You're incredible!",
            "✨ Challenge: CRUSHED!",
          ],
          level_up: [
            "📈 LEVEL UP! You've evolved!",
            "⬆️ New level unlocked!",
            "🌱➡️🌳 Growth achieved!",
          ],
          comeback: [
            "🦋 THE COMEBACK IS REAL!",
            "💪 You're back! That takes courage!",
            "🌅 New chapter, same champion!",
          ],
          first_habit: [
            "🌱 Your first habit! Everything starts here!",
            "✨ You just planted a seed!",
            "🚀 And so it begins!",
          ],
          consistency: [
            "📊 Consistency is your superpower!",
            "🎯 Showing up is everything!",
            "💎 Reliability unlocked!",
          ],
          breakthrough: [
            "💡 BREAKTHROUGH MOMENT!",
            "🔓 Something just clicked!",
            "⚡ That's a game-changer!",
          ],
          life_win: [
            "🌟 Life win! This matters!",
            "❤️ I'm so proud of you!",
            "🙌 YES! This is what it's all about!",
          ],
        };
        
        const options = celebrations[achievementType] || celebrations.life_win;
        const celebration = options[Math.floor(Math.random() * options.length)];

        getLogger().info({ userId, achievementType, details }, '🎉 Achievement celebrated');

        return {
          celebration,
          details,
          followUp: "Let's capture this moment. What does this mean to you?",
          suggestion: "Consider scheduling a follow-up to keep this momentum going.",
        };
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Legacy alias for backward compatibility
export const createMayaProactiveTools = createProactiveCoachingTools;

export default createProactiveCoachingTools;

