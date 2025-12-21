/**
 * Proactive Coaching System
 *
 * Makes coaches REAL partners who:
 * - Notice when you haven't shown up
 * - Celebrate your milestones before you forget
 * - Spot patterns and offer help
 * - Check in during life transitions
 * - Know when to push and when to give space
 *
 * NOTE: For new code, use `tools/domains/proactive/index.ts` instead.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { getProductivityStore } from '../services/stores/productivity-store.js';

import { getToolDescription } from './utils/tool-descriptions.js';
// ============================================================================
// PROACTIVE TRIGGER TYPES
// ============================================================================

export type ProactiveTriggerType =
  | 'silence_check_in' // Haven't heard from them
  | 'streak_at_risk' // Streak might break today
  | 'streak_milestone' // Hit 7, 14, 21, 30, 66 days
  | 'challenge_reminder' // Active challenge needs attention
  | 'challenge_milestone' // Week complete, halfway, etc.
  | 'pattern_detected' // Noticed a pattern (good or bad)
  | 'mood_trend' // Declining mood/energy trend
  | 'level_up_ready' // Ready to advance to next level
  | 'life_transition_check' // Check in on major life change
  | 'celebration_due' // Achievement deserves recognition
  | 'encouragement_needed' // Multiple struggles detected
  | 'accountability_reminder' // For Obligers especially
  | 'weekly_reflection_due' // Time for weekly review
  | 'habit_anniversary' // 30, 90, 180, 365 days of a habit
  | 'comeback_opportunity' // Good time to restart after break
  // Life Coaching Domain Triggers
  | 'loneliness_check_in' // Check in when signs of isolation detected
  | 'social_win_celebration' // Celebrate social connection wins
  | 'belonging_milestone' // Progress in finding community
  | 'conversation_follow_up' // Check how a difficult conversation went
  | 'boundary_check_in' // Check how a set boundary is holding
  | 'rebuilding_milestone' // Celebrate progress on second chance journey
  | 'fresh_start_anniversary' // Anniversary of a fresh start
  | 'transition_stage_shift' // Moving to new stage of life transition
  // Quiet Growth Domain Triggers
  | 'rest_permission_needed' // Detect signs of burnout or pushing too hard
  | 'plateau_celebration' // Celebrate maintaining gains (anti-hustle)
  | 'seasonal_transition' // Seasonal wisdom during equinoxes/solstices
  | 'enough_for_today' // Remind them they've done enough
  | 'gentle_pace_check'; // Check if they're rushing unnecessarily

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
  opener: string; // The hook/opening line
  body: string; // Main message
  question?: string; // Engaging question
  actionSuggestion?: string; // What they could do
  tone: 'warm' | 'celebratory' | 'gentle' | 'encouraging' | 'curious';
}

// ============================================================================
// PROACTIVE DETECTION ENGINE
// ============================================================================

interface DetectionContext {
  userId: string;
  tendency?: string; // Four Tendencies
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
      triggers.push(
        createTrigger('silence_check_in', context.userId, 'medium', {
          daysSince: daysSinceActivity,
          message: generateSilenceMessage(daysSinceActivity, context.tendency),
        })
      );
    } else if (daysSinceActivity >= 7) {
      triggers.push(
        createTrigger('comeback_opportunity', context.userId, 'high', {
          daysSince: daysSinceActivity,
          message: generateComebackMessage(daysSinceActivity, context.tendency),
        })
      );
    }
  }

  // 2. STREAK AT RISK
  for (const habit of context.activeHabits) {
    if (habit.lastCompletion) {
      const hoursSinceCompletion =
        (now.getTime() - habit.lastCompletion.getTime()) / (1000 * 60 * 60);

      // If it's been 20+ hours and they have a streak worth protecting
      if (hoursSinceCompletion >= 20 && hoursSinceCompletion < 28 && habit.currentStreak >= 3) {
        triggers.push(
          createTrigger('streak_at_risk', context.userId, 'high', {
            habitId: habit.id,
            habitName: habit.name,
            currentStreak: habit.currentStreak,
            hoursLeft: Math.round(28 - hoursSinceCompletion),
            message: generateStreakAtRiskMessage(habit.name, habit.currentStreak, context.tendency),
          })
        );
      }
    }
  }

  // 3. STREAK MILESTONES
  for (const habit of context.activeHabits) {
    const milestones = [7, 14, 21, 30, 66, 100, 365];
    if (milestones.includes(habit.currentStreak)) {
      triggers.push(
        createTrigger('streak_milestone', context.userId, 'high', {
          habitId: habit.id,
          habitName: habit.name,
          streak: habit.currentStreak,
          message: generateStreakMilestoneMessage(habit.name, habit.currentStreak),
        })
      );
    }
  }

  // 4. CHALLENGE REMINDERS
  if (context.activeChallenge) {
    const { currentDay, completedDays } = context.activeChallenge;

    // Check if today's action hasn't been done
    // (This would need to check against today specifically)

    // Milestone checks
    if (currentDay === 7 || currentDay === 14 || currentDay === 21 || currentDay === 30) {
      triggers.push(
        createTrigger('challenge_milestone', context.userId, 'high', {
          challengeId: context.activeChallenge.id,
          day: currentDay,
          completed: completedDays,
          message: generateChallengeMilestoneMessage(
            currentDay,
            completedDays,
            context.activeChallenge.type
          ),
        })
      );
    }
  }

  // 5. LEVEL UP READY
  for (const habit of context.activeHabits) {
    // If they've been at this level with high success for 2+ weeks
    if (habit.successRate >= 85 && habit.currentStreak >= 14 && habit.level < 5) {
      triggers.push(
        createTrigger('level_up_ready', context.userId, 'medium', {
          habitId: habit.id,
          habitName: habit.name,
          currentLevel: habit.level,
          message: generateLevelUpReadyMessage(habit.name, habit.level),
        })
      );
    }
  }

  // 6. MOOD TREND
  if (context.recentMoods.length >= 3) {
    const recentMoodValues = context.recentMoods
      .slice(-3)
      .map((m) =>
        m.mood === 'great'
          ? 5
          : m.mood === 'good'
            ? 4
            : m.mood === 'okay'
              ? 3
              : m.mood === 'low'
                ? 2
                : 1
      );
    const avgMood = recentMoodValues.reduce((a, b) => a + b, 0) / recentMoodValues.length;

    if (avgMood < 2.5) {
      triggers.push(
        createTrigger('encouragement_needed', context.userId, 'high', {
          avgMood,
          message: generateEncouragementMessage(context.tendency),
        })
      );
    }
  }

  // 7. WEEKLY REFLECTION DUE
  if (context.weeklyReflectionsDue) {
    triggers.push(
      createTrigger('weekly_reflection_due', context.userId, 'medium', {
        message: generateWeeklyReflectionMessage(),
      })
    );
  }

  // 8. ACCOUNTABILITY REMINDER (especially for Obligers)
  if (context.tendency === 'obliger') {
    // Obligers need more check-ins
    if (context.lastActivity) {
      const daysSince = Math.floor(
        (now.getTime() - context.lastActivity.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince >= 2) {
        triggers.push(
          createTrigger('accountability_reminder', context.userId, 'high', {
            daysSince,
            message: generateAccountabilityMessage(daysSince),
          })
        );
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
      actionSuggestion: 'Even if habits slipped, you can always start fresh right now.',
      tone: 'warm',
    },
    {
      opener: 'Been thinking about you!',
      body: `It's been ${days} days and I wanted to see how things are going. Sometimes silence means life got busy, sometimes it means we're struggling.`,
      question: 'Which is it for you?',
      tone: 'curious',
    },
    {
      opener: 'Quick check-in time!',
      body: "I noticed you've been quiet. That's totally okay - but I'm here when you're ready.",
      question: 'Want to catch up on where things stand?',
      tone: 'gentle',
    },
  ];

  // Adjust for Obligers
  if (tendency === 'obliger') {
    return {
      opener: `Hey! It's day ${days} of radio silence.`,
      body: "I know you do better with accountability, so I'm showing up. That's my job. Your job is just to respond.",
      question: "What's one tiny thing you could do today?",
      actionSuggestion: 'Just check in with me. That counts as showing up.',
      tone: 'encouraging',
    };
  }

  return messages[Math.floor(Math.random() * messages.length)];
}

function generateComebackMessage(days: number, tendency?: string): ProactiveMessage {
  return {
    opener: `It's been ${days} days. That's okay.`,
    body: "I'm not here to make you feel guilty. Life is messy sometimes. But I want you to know: everything you built before isn't gone. Those neural pathways are still there, just a bit rusty.",
    question: 'Want to start fresh today? We can go even smaller than before.',
    actionSuggestion: "One tiny action. That's all it takes to come back.",
    tone: 'warm',
  };
}

function generateStreakAtRiskMessage(
  habitName: string,
  streak: number,
  tendency?: string
): ProactiveMessage {
  const urgentMessages: ProactiveMessage[] = [
    {
      opener: `🔥 ${streak}-day streak alert!`,
      body: `Your "${habitName}" streak is at risk! You've built ${streak} days of momentum.`,
      question: 'Can you do even the tiniest version today?',
      actionSuggestion: 'Remember: the 2-minute version still counts. Just show up.',
      tone: 'encouraging',
    },
    {
      opener: 'Streak protection time!',
      body: `${streak} days of "${habitName}" - that's real progress. Don't let today break it.`,
      question: "What's the absolute minimum you could do?",
      tone: 'encouraging',
    },
  ];

  // Rebels don't respond well to "protect your streak" messaging
  if (tendency === 'rebel') {
    return {
      opener: 'Your choice today:',
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
      opener: '🎉 ONE WEEK!',
      body: `Seven days of "${habitName}"! Most people don't make it past day 3. You're different.`,
      question: 'How does it feel?',
      tone: 'celebratory',
    },
    14: {
      opener: '⭐ TWO WEEKS!',
      body: `14 days straight! "${habitName}" is becoming part of who you are. The neural pathway is strengthening.`,
      question: 'Do you notice it getting easier?',
      tone: 'celebratory',
    },
    21: {
      opener: '🏆 THREE WEEKS!',
      body: `21 days of "${habitName}"! This is legendary. Research says this is when habits really start to stick.`,
      question: "You're building something real. Feel it?",
      tone: 'celebratory',
    },
    30: {
      opener: '🎊 ONE MONTH!',
      body: `30 DAYS! "${habitName}" is no longer something you do - it's something you ARE. You showed up every single day for a month.`,
      question: 'What did you learn about yourself?',
      tone: 'celebratory',
    },
    66: {
      opener: '🌟 66 DAYS - AUTOMATICITY!',
      body: `This is the magic number. Research shows 66 days is when habits become truly automatic. "${habitName}" is now part of you.`,
      question: "Does it feel weird when you DON'T do it?",
      tone: 'celebratory',
    },
    100: {
      opener: '💯 ONE HUNDRED DAYS!',
      body: `100 days of "${habitName}". This is extraordinary. You've proven something about yourself that can never be taken away.`,
      question: "What's next?",
      tone: 'celebratory',
    },
    365: {
      opener: '🏅 ONE YEAR!',
      body: `365 days. One full year of "${habitName}". You are literally a different person than when you started. This is who you are now.`,
      question: 'How do you want to celebrate?',
      tone: 'celebratory',
    },
  };

  return (
    milestoneMessages[streak] || {
      opener: `🔥 ${streak} day streak!`,
      body: `"${habitName}" - you're on fire!`,
      tone: 'celebratory',
    }
  );
}

function generateChallengeMilestoneMessage(
  day: number,
  completed: number,
  challengeType: string
): ProactiveMessage {
  if (day === 7) {
    return {
      opener: '🌟 Week 1 Complete!',
      body: `You made it through the first week! ${completed}/7 days completed. The hardest part is starting - and you did it.`,
      question: 'What was your biggest win this week?',
      tone: 'celebratory',
    };
  }
  if (day === 14) {
    return {
      opener: '⭐ Halfway there!',
      body: `Day 14 - you're halfway through your challenge! ${completed} days completed. You've built real momentum.`,
      question: "What's feeling different?",
      tone: 'celebratory',
    };
  }
  if (day === 21) {
    return {
      opener: '🏆 3 Weeks Down!',
      body: '21 days! This is when habits really start to stick. One more week to lock it in.',
      question: 'Can you feel the transformation?',
      tone: 'celebratory',
    };
  }
  if (day === 30) {
    return {
      opener: '🎉 CHALLENGE COMPLETE!',
      body: `YOU DID IT! 30 days of transformation. ${completed}/30 days completed. You're not the same person who started.`,
      question: 'How do you want to continue?',
      actionSuggestion: 'Consider making this a permanent habit or starting a new challenge.',
      tone: 'celebratory',
    };
  }

  return {
    opener: `Day ${day} checkpoint!`,
    body: `You're ${Math.round((day / 30) * 100)}% through your challenge.`,
    tone: 'encouraging',
  };
}

function generateLevelUpReadyMessage(habitName: string, currentLevel: number): ProactiveMessage {
  const levelNames = [
    'Tiny Start',
    'Mini Habit',
    'Emerging Practice',
    'Established Habit',
    'Lifestyle Integration',
  ];
  const nextLevel = levelNames[currentLevel] || 'next level';

  return {
    opener: '📈 Level up available!',
    body: `You've been crushing "${habitName}" at this level. Your success rate is high and consistent. You might be ready for "${nextLevel}".`,
    question: 'Does the current version feel easy now?',
    actionSuggestion: 'Only level up when it feels EASY, not just doable.',
    tone: 'encouraging',
  };
}

function generateEncouragementMessage(tendency?: string): ProactiveMessage {
  return {
    opener: 'I see you.',
    body: "Your recent check-ins show things have been tough. I want you to know that's okay. Hard seasons don't erase your progress - they test it.",
    question: "What's one small thing that might help today?",
    actionSuggestion: "Sometimes the habit isn't the priority. Self-compassion is.",
    tone: 'gentle',
  };
}

function generateWeeklyReflectionMessage(): ProactiveMessage {
  return {
    opener: 'Weekly reflection time! 📝',
    body: "It's been a week. Taking a few minutes to reflect can multiply your progress.",
    question: 'What went well? What was hard? What did you learn?',
    tone: 'curious',
  };
}

function generateAccountabilityMessage(days: number): ProactiveMessage {
  return {
    opener: 'Accountability check-in!',
    body: `Hey, I know you do best with external accountability, so here I am. It's been ${days} days since you checked in.`,
    question: "What's one habit you can commit to today?",
    actionSuggestion: "Just reply and tell me what you'll do. That's all.",
    tone: 'encouraging',
  };
}

// ============================================================================
// LIFE COACHING DOMAIN MESSAGE GENERATORS
// ============================================================================

/**
 * Connection domain: Loneliness check-in
 */
export function generateLonelinessCheckInMessage(): ProactiveMessage {
  const messages: ProactiveMessage[] = [
    {
      opener: 'Hey, checking in on you.',
      body: "I noticed it's been a while since you mentioned spending time with anyone. That's not a criticism - just noticing. Loneliness is real and it matters.",
      question: 'How are you feeling about your social world right now?',
      actionSuggestion: "Even a text to someone you've been thinking about counts as connection.",
      tone: 'warm',
    },
    {
      opener: 'Thinking of you today.',
      body: "Connection has been quiet lately. I want you to know that's normal, especially during hard seasons. But you don't have to go through this alone.",
      question: 'What kind of connection would feel good right now?',
      tone: 'gentle',
    },
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Connection domain: Social win celebration
 */
export function generateSocialWinCelebrationMessage(winType: string): ProactiveMessage {
  const messages: Record<string, ProactiveMessage> = {
    reached_out: {
      opener: '🎉 You reached out!',
      body: 'You took the brave step of initiating connection. That takes courage. Most people wait for others to reach out first.',
      question: 'How did it feel?',
      tone: 'celebratory',
    },
    made_plans: {
      opener: '📅 Plans on the calendar!',
      body: 'Having something social to look forward to is powerful. You made that happen.',
      question: 'Excited?',
      tone: 'celebratory',
    },
    had_conversation: {
      opener: '💬 Real conversation happened!',
      body: "You had a meaningful exchange with another human. In our disconnected world, that's not nothing - that's everything.",
      question: 'What was the best part?',
      tone: 'celebratory',
    },
    felt_belonging: {
      opener: '✨ A moment of belonging!',
      body: 'You felt like you belonged somewhere. That feeling is precious. Notice it. Let it soak in.',
      question: 'What made you feel seen?',
      tone: 'warm',
    },
  };
  return messages[winType] || messages.reached_out;
}

/**
 * Difficult Conversations domain: Follow-up on conversation
 */
export function generateConversationFollowUpMessage(conversationType: string): ProactiveMessage {
  return {
    opener: 'How did the conversation go?',
    body: "You were preparing for a difficult conversation. I've been thinking about you. However it went - even if it didn't go perfectly - you showed up for something hard.",
    question: 'Want to process what happened?',
    actionSuggestion: "Whether it went well or not, there's learning here. Let's talk about it.",
    tone: 'warm',
  };
}

/**
 * Difficult Conversations domain: Boundary check-in
 */
export function generateBoundaryCheckInMessage(boundaryName: string): ProactiveMessage {
  return {
    opener: 'Checking in on your boundary.',
    body: `You set a boundary${boundaryName ? ` about ${boundaryName}` : ''} a while back. Boundaries need tending. Sometimes they hold strong, sometimes they need reinforcement, sometimes they need adjustment.`,
    question: "How's it going? Is the boundary holding?",
    actionSuggestion: "If it's slipping, that's normal. We can practice reinforcing it together.",
    tone: 'gentle',
  };
}

/**
 * Second Chances domain: Rebuilding milestone
 */
export function generateRebuildingMilestoneMessage(
  milestone: string,
  journeyType: string
): ProactiveMessage {
  const milestoneMessages: Record<string, ProactiveMessage> = {
    first_step: {
      opener: '🌱 You took the first step!',
      body: 'The hardest part of any comeback is starting. You started. That takes more courage than people realize.',
      question: 'How does it feel to be moving forward?',
      tone: 'celebratory',
    },
    one_week: {
      opener: '⭐ One week into your fresh start!',
      body: 'Seven days of rebuilding. A week ago you made a choice to begin again. Look at you now - still going.',
      question: "What's different from a week ago?",
      tone: 'celebratory',
    },
    one_month: {
      opener: '🎉 One month of rebuilding!',
      body: "30 days into your second chance. You're not where you started. You're not where you're going. But you're on your way.",
      question: 'What would you tell yourself 30 days ago?',
      tone: 'celebratory',
    },
    setback_recovery: {
      opener: 'You bounced back. 💪',
      body: "You had a setback within your comeback - and you kept going anyway. That's what resilience looks like. Not perfection, but persistence.",
      question: 'What helped you get back up?',
      tone: 'warm',
    },
  };
  return milestoneMessages[milestone] || milestoneMessages.first_step;
}

/**
 * Second Chances domain: Fresh start anniversary
 */
export function generateFreshStartAnniversaryMessage(duration: string): ProactiveMessage {
  const durationMessages: Record<string, ProactiveMessage> = {
    '1-month': {
      opener: '🌟 One month since your fresh start!',
      body: "30 days ago, you chose to begin again. That choice took courage. And you've been living it ever since.",
      question: 'How does this version of your life compare to before?',
      tone: 'celebratory',
    },
    '3-months': {
      opener: '🎊 Three months of your new chapter!',
      body: "A whole season of rebuilding. You're past the hardest part - the starting. Now you're in the doing.",
      question: "What's become easier? What's still hard?",
      tone: 'celebratory',
    },
    '6-months': {
      opener: '🏆 Half a year of your second chance!',
      body: "Six months. Half a year of showing up for your new life. The person who started this journey would be proud of who you're becoming.",
      question: "What do you know now that you didn't know then?",
      tone: 'celebratory',
    },
    '1-year': {
      opener: '🌈 ONE YEAR of your fresh start!',
      body: "365 days since you chose to begin again. You've lived a whole year of your second chance. The setback that brought you here is now part of your story - not the ending, but a turning point.",
      question: 'What would you say to someone just starting their second chance journey?',
      tone: 'celebratory',
    },
  };
  return durationMessages[duration] || durationMessages['1-month'];
}

/**
 * Life Transitions domain: Transition stage shift
 */
export function generateTransitionStageShiftMessage(
  fromStage: string,
  toStage: string,
  transitionType: string
): ProactiveMessage {
  if (toStage === 'neutral_zone') {
    return {
      opener: "You're in the in-between now.",
      body: "The ending has ended. The new beginning hasn't begun. You're in what's called the 'neutral zone' - that foggy, uncertain middle. This is where transformation happens, even though it feels like nothing is happening.",
      question: 'How does the uncertainty feel?',
      actionSuggestion: "This is normal. Don't rush through it. The fog will lift.",
      tone: 'gentle',
    };
  }

  if (toStage === 'new_beginning') {
    return {
      opener: '✨ Something new is emerging.',
      body: "You're moving out of the in-between and into something new. The fog is lifting. You can see, even faintly, who you're becoming.",
      question: 'What glimpses of the new you are you seeing?',
      actionSuggestion: "Protect this new growth. It's still tender.",
      tone: 'warm',
    };
  }

  return {
    opener: 'The transition is shifting.',
    body: `Something is changing in your ${transitionType || 'journey'}. You're not where you were. Trust the process.`,
    question: 'What do you notice is different?',
    tone: 'curious',
  };
}

/**
 * Life Transitions domain: General check-in
 */
export function generateLifeTransitionCheckInMessage(transitionType: string): ProactiveMessage {
  return {
    opener: 'Checking in on you.',
    body: `You're going through a major transition${transitionType ? ` - ${transitionType}` : ''}. That takes energy, even when it doesn't show. I'm here to hold space for however this is going.`,
    question: 'How are you really doing with all of this?',
    actionSuggestion: 'No need to be okay. Just be honest.',
    tone: 'gentle',
  };
}

/**
 * Connection domain: Belonging milestone
 */
export function generateBelongingMilestoneMessage(milestone: string): ProactiveMessage {
  const milestoneMessages: Record<string, ProactiveMessage> = {
    found_community: {
      opener: '🎉 You found your people!',
      body: "You've found a community where you belong. That's one of the most important human needs, and you made it happen.",
      question: 'What made this group feel like home?',
      tone: 'celebratory',
    },
    deepened_friendship: {
      opener: '💙 A friendship deepened!',
      body: 'A friendship moved to a new level. You let someone in a little more. That vulnerability is how real connection happens.',
      question: 'What changed between you?',
      tone: 'warm',
    },
    regular_connection: {
      opener: '⭐ Consistent connection!',
      body: "You've been showing up for your relationships regularly. That consistency is what turns acquaintances into friends and friends into community.",
      question: 'How does having regular connection feel?',
      tone: 'celebratory',
    },
  };
  return milestoneMessages[milestone] || milestoneMessages.found_community;
}

// ============================================================================
// QUIET GROWTH DOMAIN MESSAGE GENERATORS
// ============================================================================

/**
 * Quiet Growth: Rest permission needed
 */
export function generateRestPermissionMessage(
  signType: 'overwork' | 'burnout' | 'relentless' | 'no_breaks'
): ProactiveMessage {
  const messages: Record<string, ProactiveMessage> = {
    overwork: {
      opener: '🌙 Hey, can we talk about pace?',
      body: "I've noticed you've been pushing pretty hard lately. Rest isn't the opposite of growth - it's where growth actually happens.",
      question: 'When was the last time you took a real break?',
      actionSuggestion: 'What if today was just... enough?',
      tone: 'gentle',
    },
    burnout: {
      opener: '💚 Checking in on you...',
      body: "There's a difference between productive and depleted. I want to make sure you're not running on empty.",
      question: 'How full is your cup right now, honestly?',
      actionSuggestion: 'Permission to rest is always available.',
      tone: 'warm',
    },
    relentless: {
      opener: '🌿 A word about fallow seasons...',
      body: "The field that's always planted eventually becomes barren. Even soil needs rest. Even you need rest.",
      question: 'What would it look like to do less today, on purpose?',
      tone: 'gentle',
    },
    no_breaks: {
      opener: '☕ Recovery is doing something',
      body: "Recovery isn't nothing - it's essential work. The tree doesn't apologize for winter, and neither should you.",
      question: 'What does real rest look like for you?',
      tone: 'warm',
    },
  };
  return messages[signType] || messages.overwork;
}

/**
 * Quiet Growth: Plateau celebration
 */
export function generatePlateauCelebrationMessage(
  plateauType: 'maintaining' | 'integration' | 'holding_gains'
): ProactiveMessage {
  const messages: Record<string, ProactiveMessage> = {
    maintaining: {
      opener: '🏔️ Celebrating your plateau!',
      body: "Maintaining is not failing to grow. It's succeeding at sustaining. That's actually harder than people think.",
      question: 'How does it feel to hold steady instead of constantly climbing?',
      tone: 'celebratory',
    },
    integration: {
      opener: '🌱 Integration in progress...',
      body: 'What feels like standing still is actually settling into a new normal. Your body and mind are catching up to your progress.',
      question: "What's becoming more automatic for you?",
      tone: 'warm',
    },
    holding_gains: {
      opener: "⭐ You're holding onto what matters",
      body: "You're holding onto gains that most people lose. The goal isn't always more. Sometimes the goal is... keep.",
      question: 'What have you protected that you used to struggle with?',
      tone: 'celebratory',
    },
  };
  return messages[plateauType] || messages.maintaining;
}

/**
 * Quiet Growth: Seasonal transition wisdom
 */
export function generateSeasonalTransitionMessage(
  season: 'spring' | 'summer' | 'autumn' | 'winter'
): ProactiveMessage {
  const messages: Record<string, ProactiveMessage> = {
    spring: {
      opener: '🌸 Spring energy is arriving...',
      body: "Spring is for planting, not harvesting. Don't expect fruit yet. Just show up and plant. New beginnings don't need perfection.",
      question: 'What seeds are you planting this season?',
      tone: 'encouraging',
    },
    summer: {
      opener: '☀️ Summer tending time...',
      body: "Summer is for tending. Show up consistently. That's all. The work feels invisible right now, but roots are growing.",
      question: 'What are you tending that needs your patience?',
      tone: 'warm',
    },
    autumn: {
      opener: '🍂 Autumn wisdom...',
      body: "Autumn is for harvesting AND releasing. Take what you've grown. Let go of what didn't work. That's not failure - that's gardening.",
      question: "What's ready to be harvested? What's ready to be released?",
      tone: 'gentle',
    },
    winter: {
      opener: '❄️ Winter depth arriving...',
      body: "Winter is not failure. It's when roots grow deep. The work is just invisible. Some seasons are for going inward, for rest, for gathering strength.",
      question: "What's composting in you right now, turning into future growth?",
      tone: 'gentle',
    },
  };
  return messages[season] || messages.winter;
}

/**
 * Quiet Growth: Enough for today reminder
 */
export function generateEnoughForTodayMessage(): ProactiveMessage {
  const variations: ProactiveMessage[] = [
    {
      opener: "✅ That's enough for today.",
      body: "You did the thing. Tomorrow is tomorrow's problem. Today is done. You can stop now. Really.",
      question: 'How does it feel to be done?',
      tone: 'warm',
    },
    {
      opener: '🌙 Permission to close the laptop.',
      body: 'To walk away. To be done. Granted. What you did today was enough. You were enough.',
      tone: 'gentle',
    },
    {
      opener: '💚 Done imperfectly is done.',
      body: 'And done imperfectly is better than perfect never done. Every time. What you accomplished today counts.',
      tone: 'warm',
    },
  ];
  return variations[Math.floor(Math.random() * variations.length)];
}

/**
 * Quiet Growth: Gentle pace check
 */
export function generateGentlePaceCheckMessage(
  paceType: 'rushing' | 'comparing' | 'urgency'
): ProactiveMessage {
  const messages: Record<string, ProactiveMessage> = {
    rushing: {
      opener: '🐢 A word about pace...',
      body: 'The rush to arrive makes you miss the journey. And the journey IS the point. What if you have more time than you think?',
      question: "What's the real deadline here? Is there one?",
      tone: 'curious',
    },
    comparing: {
      opener: "🪞 About that comparison you're making...",
      body: 'The only fair comparison is you yesterday. Not them. Not their highlight reel. Their journey started in a different place with different everything.',
      question: 'How would you feel about your pace if no one else existed?',
      tone: 'gentle',
    },
    urgency: {
      opener: '⏰ Checking in on the urgency...',
      body: "Urgency is sometimes real. But often it's manufactured - by comparison, by fear. Fast is not better. It's just faster.",
      question: 'What would a gentler timeline look like?',
      tone: 'warm',
    },
  };
  return messages[paceType] || messages.rushing;
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
      description: getToolDescription('checkForProactiveOpportunities'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();

        // Gather context
        const habits = store.getUserEnhancedHabits(userId);
        const profile = store.getHabitCoachProfile(userId);
        const tendency = store.getUserPreference(userId, 'fourTendency') as string | undefined;
        const moodLogs =
          (store.getUserPreference(userId, 'moodLogs') as Array<{
            mood: string;
            energy: string;
            date: string;
          }>) || [];
        const lastReflection = store.getUserWeeklyReflections(userId)[0];

        // Build context
        const context: DetectionContext = {
          userId,
          tendency,
          lifeStage: profile?.lifeStage,
          lastActivity:
            habits.length > 0
              ? new Date(Math.max(...habits.map((h) => new Date(h.updatedAt).getTime())))
              : undefined,
          activeHabits: habits
            .filter((h) => h.isActive)
            .map((h) => ({
              id: h.id,
              name: h.name,
              currentStreak: h.currentStreak,
              lastCompletion: h.updatedAt ? new Date(h.updatedAt) : undefined,
              level: h.currentLevel,
              successRate: h.successRate,
            })),
          activeChallenge: undefined, // Would need to check challenge data
          recentMoods: moodLogs.slice(-5).map((m) => ({
            mood: m.mood,
            energy: m.energy,
            date: new Date(m.date),
          })),
          weeklyReflectionsDue:
            !lastReflection ||
            Date.now() - new Date(lastReflection.date).getTime() > 7 * 24 * 60 * 60 * 1000,
        };

        // Detect triggers
        const triggers = detectProactiveTriggers(context);

        // Sort by priority
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        triggers.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        getLogger().info(
          { userId, triggers: triggers.length },
          '🎯 Proactive opportunities detected'
        );

        if (triggers.length === 0) {
          return {
            hasOpportunities: false,
            message: 'No specific proactive moments right now. User is on track!',
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
          otherTriggers: triggers.slice(1, 4).map((t) => ({
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
      description: getToolDescription('generateProactiveMessage'),
      parameters: z.object({
        triggerType: z
          .enum([
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
            'comeback_opportunity',
          ])
          .describe('Type of proactive trigger'),
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
              opener: 'Hey there!',
              body: 'Just checking in to see how things are going with your habits.',
              question: "What's on your mind?",
              tone: 'warm',
            };
        }

        getLogger().info({ userId, triggerType }, '💬 Proactive message generated');

        return {
          message,
          tendencyAdjusted: !!tendency,
          tip:
            tendency === 'obliger'
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
      description: getToolDescription('scheduleFollowUp'),
      parameters: z.object({
        reason: z.string().describe("Why we're following up"),
        timing: z
          .enum(['tomorrow', 'in_3_days', 'next_week', 'in_2_weeks', 'next_month'])
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
        const followUps =
          (store.getUserPreference(userId, 'scheduledFollowUps') as Array<{
            id: string;
            reason: string;
            date: string;
            habitId?: string;
            priority: string;
            completed: boolean;
          }>) || [];

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

        getLogger().info(
          { userId, reason, timing, date: followUpDate.toISOString() },
          '📅 Follow-up scheduled'
        );

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
      description: getToolDescription('getPendingFollowUps'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        const followUps =
          (store.getUserPreference(userId, 'scheduledFollowUps') as Array<{
            id: string;
            reason: string;
            date: string;
            habitId?: string;
            priority: string;
            completed: boolean;
          }>) || [];

        const now = new Date();
        const due = followUps.filter((f) => !f.completed && new Date(f.date) <= now);
        const upcoming = followUps.filter((f) => !f.completed && new Date(f.date) > now);

        getLogger().info(
          { userId, due: due.length, upcoming: upcoming.length },
          '📋 Follow-ups checked'
        );

        return {
          dueNow: due.map((f) => ({
            id: f.id,
            reason: f.reason,
            scheduledFor: f.date,
            priority: f.priority,
          })),
          upcomingCount: upcoming.length,
          suggestion:
            due.length > 0 ? `Follow up on: "${due[0].reason}"` : 'No follow-ups due right now.',
        };
      },
    }),

    /**
     * Mark follow-up as complete
     */
    completeFollowUp: llm.tool({
      description: getToolDescription('completeFollowUp'),
      parameters: z.object({
        followUpId: z.string().describe('ID of the follow-up to complete'),
        outcome: z.string().optional().describe('What happened when you followed up'),
      }),
      execute: async ({ followUpId, outcome }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        const followUps =
          (store.getUserPreference(userId, 'scheduledFollowUps') as Array<{
            id: string;
            reason: string;
            date: string;
            habitId?: string;
            priority: string;
            completed: boolean;
            outcome?: string;
          }>) || [];

        const index = followUps.findIndex((f) => f.id === followUpId);
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
      description: getToolDescription('celebrateAchievement'),
      parameters: z.object({
        achievementType: z
          .enum([
            'streak_milestone',
            'challenge_complete',
            'level_up',
            'comeback',
            'first_habit',
            'consistency',
            'breakthrough',
            'life_win',
          ])
          .describe('Type of achievement'),
        details: z.string().describe('Specific details about the achievement'),
      }),
      execute: async ({ achievementType, details }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const celebrations: Record<string, string[]> = {
          streak_milestone: [
            '🎉 STOP EVERYTHING! This deserves a celebration!',
            "🌟 Do you hear that? That's the sound of progress!",
            '🔥 This streak is ON FIRE!',
          ],
          challenge_complete: [
            '🏆 YOU DID IT! The whole challenge!',
            "🎊 30 days. Done. You're incredible!",
            '✨ Challenge: CRUSHED!',
          ],
          level_up: [
            "📈 LEVEL UP! You've evolved!",
            '⬆️ New level unlocked!',
            '🌱➡️🌳 Growth achieved!',
          ],
          comeback: [
            '🦋 THE COMEBACK IS REAL!',
            "💪 You're back! That takes courage!",
            '🌅 New chapter, same champion!',
          ],
          first_habit: [
            '🌱 Your first habit! Everything starts here!',
            '✨ You just planted a seed!',
            '🚀 And so it begins!',
          ],
          consistency: [
            '📊 Consistency is your superpower!',
            '🎯 Showing up is everything!',
            '💎 Reliability unlocked!',
          ],
          breakthrough: [
            '💡 BREAKTHROUGH MOMENT!',
            '🔓 Something just clicked!',
            "⚡ That's a game-changer!",
          ],
          life_win: [
            '🌟 Life win! This matters!',
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
          suggestion: 'Consider scheduling a follow-up to keep this momentum going.',
        };
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createProactiveCoachingTools;
