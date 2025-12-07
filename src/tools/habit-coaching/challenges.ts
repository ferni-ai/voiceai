/**
 * 30-Day Challenge Definitions
 *
 * Pre-built challenge programs for common habit goals.
 *
 * @module habit-coaching/challenges
 */

import type { ChallengeDefinition } from './types.js';

// ============================================================================
// 30-DAY CHALLENGES
// ============================================================================

export const THIRTY_DAY_CHALLENGES: Record<string, ChallengeDefinition> = {
  morning_person: {
    name: 'Become a Morning Person',
    description: 'Transform your mornings from chaotic to intentional, one day at a time',
    commitment: 'Wake up 15 minutes earlier each week',
    weeks: [
      {
        theme: 'Foundation Week - Just Wake Up',
        days: [
          'Set alarm 15 min earlier. Get out of bed immediately when it rings.',
          'Same alarm. Drink a glass of water within 5 minutes of waking.',
          'Add 30 seconds of stretching after water.',
          'Open curtains/turn on lights immediately. Let light in.',
          'No phone for first 10 minutes. Just exist.',
          'Review: How did you feel this week?',
          'Rest day - sleep in if needed, but wake by regular time.',
        ],
        intensityNote: 'This week is about the wake-up moment. Nothing else.',
      },
      {
        theme: 'Movement Week - Wake Your Body',
        days: [
          'Set alarm another 15 min earlier. Water + 2 min movement.',
          '3 minutes of gentle movement. Stretching, walking, whatever.',
          'Try 5 minutes of movement. Notice how you feel after.',
          'Experiment with the type of movement you enjoy.',
          'Make movement environment ready the night before.',
          'Week reflection: Energy levels improving?',
          'Flexible day - shorter movement is fine.',
        ],
        intensityNote: 'Movement wakes up your brain. Keep it gentle.',
      },
      {
        theme: 'Intention Week - Mind Activation',
        days: [
          'Another 15 min earlier. Add 2 min of quiet sitting after movement.',
          "Write down 1 thing you're grateful for.",
          'Write 1-3 intentions for the day.',
          'Spend 3-5 minutes in quiet reflection or meditation.',
          'Visualize your ideal morning routine.',
          "Week reflection: What's your favorite part?",
          'Flexible day - do your favorite elements.',
        ],
        intensityNote: 'Starting the day with intention changes everything.',
      },
      {
        theme: 'Mastery Week - Own Your Morning',
        days: [
          'Full routine at your target wake time. You designed it.',
          'Notice what you want to add or remove.',
          "Refine your routine. What's essential? What's optional?",
          'Create your "minimum viable morning" for busy days.',
          'Plan for how to maintain this long-term.',
          'Celebrate! You transformed your mornings!',
          'Rest and reflect on your journey.',
        ],
        intensityNote: "You're now a morning person. Protect this.",
      },
    ],
  },

  fitness_starter: {
    name: 'Fitness Starter',
    description: 'Build a sustainable exercise habit from zero',
    commitment: '5 minutes of movement daily, building to 20+',
    weeks: [
      {
        theme: 'Just Move Week',
        days: [
          "5 minute walk. That's it. Just walk.",
          '5 minute walk. Same route is fine.',
          '5 minutes of any movement you want.',
          'Walk or move for 5-7 minutes.',
          'Try a different type of movement.',
          'Reflection: How does your body feel?',
          'Active rest - gentle stretching only.',
        ],
        intensityNote: 'Building the habit of moving is more important than the workout.',
      },
      {
        theme: 'Building Week',
        days: [
          '10 minute walk or movement.',
          'Try adding one bodyweight exercise (squats, pushups).',
          '10-12 minutes of mixed movement.',
          'Walk faster for part of your walk.',
          'Find a movement you actually enjoy.',
          'Week reflection: What did you like most?',
          'Gentle movement or rest.',
        ],
        intensityNote: 'Finding enjoyment is key to long-term success.',
      },
      {
        theme: 'Challenge Week',
        days: [
          '15 minutes of intentional exercise.',
          'Try something new (yoga video, dance, bike).',
          'Push slightly harder than comfortable.',
          'Do your favorite activity from this month.',
          'Try exercising with someone or in a class.',
          'Week reflection: Feeling stronger?',
          'Active recovery - stretching and walking.',
        ],
        intensityNote: "You're building real fitness now.",
      },
      {
        theme: 'Ownership Week',
        days: [
          '20+ minutes of exercise you enjoy.',
          'Design your weekly workout schedule.',
          'Include variety in your routine.',
          'Plan for obstacles (weather, busy days).',
          'Set your next fitness goal.',
          "Celebrate! You're now someone who exercises!",
          'Rest and plan for month 2.',
        ],
        intensityNote: "You've built a foundation for life.",
      },
    ],
  },

  mindfulness: {
    name: 'Mindfulness Starter',
    description: 'Develop a sustainable meditation and presence practice',
    commitment: 'Daily moments of intentional presence',
    weeks: [
      {
        theme: 'Breathing Week',
        days: [
          'Take 3 conscious breaths. Feel them.',
          '5 conscious breaths. Notice your body.',
          '1 minute of focused breathing.',
          'Practice 3 breaths before each meal.',
          '2 minutes of sitting quietly.',
          'Reflection: Where do you notice tension?',
          'Breathing practice whenever you remember.',
        ],
        intensityNote: "Breath is always with you. It's the simplest anchor.",
      },
      {
        theme: 'Awareness Week',
        days: [
          '3 minutes of sitting with eyes closed.',
          'Practice mindful eating for one meal.',
          '4 minutes sitting. Notice thoughts passing.',
          'Take a mindful walk - notice sensations.',
          '5 minutes sitting. Return to breath when distracted.',
          'Weekly reflection: What did you notice?',
          'Informal mindfulness throughout the day.',
        ],
        intensityNote: 'Noticing is the practice. Not controlling.',
      },
      {
        theme: 'Deepening Week',
        days: [
          '7-10 minutes of meditation.',
          'Try a guided meditation.',
          'Practice during a stressful moment.',
          'Body scan meditation.',
          '10 minutes sitting.',
          'Reflection: How has your relationship to thoughts changed?',
          'Gentle practice day.',
        ],
        intensityNote: 'Longer sits reveal patterns.',
      },
      {
        theme: 'Integration Week',
        days: [
          '10-15 minutes meditation.',
          'Mindfulness during everyday activities.',
          'Practice responding vs. reacting.',
          'Loving-kindness meditation.',
          'Design your ongoing practice.',
          'Celebrate your new relationship with your mind!',
          'Reflection and planning.',
        ],
        intensityNote: 'The real practice is in daily life.',
      },
    ],
  },

  financial_reset: {
    name: 'Financial Reset',
    description: 'Build daily money awareness and healthy financial habits',
    commitment: 'Daily financial check-in, building awareness',
    weeks: [
      {
        theme: 'Awareness Week',
        days: [
          'Check your account balance. Just look.',
          'Track every purchase today. No judgment.',
          "Review yesterday's spending. Categorize.",
          'Check all account balances.',
          'List your recurring subscriptions.',
          'Weekly spending review.',
          'Reflection: What surprised you?',
        ],
        intensityNote: 'Awareness before change. No judgment this week.',
      },
      {
        theme: 'Understanding Week',
        days: [
          'Calculate your monthly income.',
          'List your fixed monthly expenses.',
          'Track variable spending categories.',
          'Identify your spending triggers.',
          'Find one subscription to cancel.',
          'Create a simple spending plan.',
          'Review and adjust.',
        ],
        intensityNote: 'Understanding your money flow.',
      },
      {
        theme: 'Action Week',
        days: [
          'Set up automatic savings (even $5).',
          'Create a "spending limit" for one category.',
          'No-spend challenge today.',
          'Find one area to reduce spending.',
          'Review and celebrate savings.',
          'Adjust your spending plan.',
          'Plan for next month.',
        ],
        intensityNote: 'Small actions, big changes.',
      },
      {
        theme: 'Habit Week',
        days: [
          'Full daily financial check-in routine.',
          'Review your financial goals.',
          'Increase automatic savings if possible.',
          'Create your "money date" routine.',
          'Plan for upcoming expenses.',
          'Celebrate your financial awareness!',
          'Design your ongoing money habits.',
        ],
        intensityNote: 'Financial wellness is a habit, not an event.',
      },
    ],
  },

  digital_detox: {
    name: 'Digital Detox',
    description: 'Reclaim your attention from screens',
    commitment: 'Gradually reduce screen time and build boundaries',
    weeks: [
      {
        theme: 'Awareness Week',
        days: [
          'Check your screen time stats. Just notice.',
          'Identify your top 3 time-wasting apps.',
          'Log every time you pick up your phone.',
          'Notice your phone habits without changing.',
          'Identify your trigger moments.',
          'Weekly review: When do you reach for screens?',
          'Rest day - use phone as normal, but aware.',
        ],
        intensityNote: 'Awareness first. See your patterns.',
      },
      {
        theme: 'Boundaries Week',
        days: [
          'No phone for first 30 min after waking.',
          'Set app time limits on top time-wasters.',
          'Create a phone-free zone (bedroom or dining).',
          'No phone for last 30 min before bed.',
          'Delete one distracting app.',
          'Weekly review: How does it feel?',
          'Practice your new boundaries.',
        ],
        intensityNote: 'Building boundaries is freedom.',
      },
      {
        theme: 'Replacement Week',
        days: [
          'Replace morning scrolling with something else.',
          'Find analog alternatives (book, journal, music).',
          'Practice being bored without phone.',
          'Have a phone-free meal with someone.',
          'Replace evening scrolling with wind-down.',
          'Weekly review: What do you enjoy instead?',
          'Experiment with what you like.',
        ],
        intensityNote: 'You need to fill the void with something better.',
      },
      {
        theme: 'New Normal Week',
        days: [
          'Full day with your new phone boundaries.',
          'Notice how your attention feels.',
          'Refine your system.',
          'Plan for challenging situations.',
          'Create your "intentional phone use" guidelines.',
          'Celebrate your reclaimed attention!',
          'Plan for long-term success.',
        ],
        intensityNote: 'Your attention is yours again.',
      },
    ],
  },

  sleep_optimization: {
    name: 'Sleep Optimization',
    description: 'Build habits for better, more restorative sleep',
    commitment: 'Consistent sleep and wake times, wind-down routine',
    weeks: [
      {
        theme: 'Baseline Week',
        days: [
          'Track when you go to bed and wake up.',
          'Note how you feel each morning (1-10).',
          'Track caffeine intake and timing.',
          'Note screen time before bed.',
          'Track how long to fall asleep.',
          'Weekly review: What patterns emerge?',
          'Rest and reflect.',
        ],
        intensityNote: 'Understanding your sleep is step one.',
      },
      {
        theme: 'Consistency Week',
        days: [
          'Set a target wake time. Stick to it.',
          'Set a target bedtime. Aim for it.',
          'Same times on weekend too.',
          'No caffeine after 2pm.',
          'Create a 15-min wind-down routine.',
          'Weekly review: Sleep quality improving?',
          'Maintain consistency.',
        ],
        intensityNote: 'Consistency is the #1 sleep improvement.',
      },
      {
        theme: 'Environment Week',
        days: [
          'Make bedroom dark (blackout or eye mask).',
          'Make bedroom cool (65-68°F ideal).',
          'No screens in bedroom.',
          'Try white noise or quiet.',
          'Reserve bed for sleep only.',
          'Weekly review: Environment optimized?',
          'Fine-tune your space.',
        ],
        intensityNote: 'Your environment shapes your sleep.',
      },
      {
        theme: 'Mastery Week',
        days: [
          'Full wind-down routine each night.',
          'Morning light exposure within 30 min of waking.',
          'Manage stress before bed (journal, breathe).',
          'Exercise earlier in day if sleep is affected.',
          'Create your "sleep emergency" protocol.',
          'Celebrate your improved sleep!',
          'Plan for long-term sleep health.',
        ],
        intensityNote: 'Good sleep changes everything else.',
      },
    ],
  },

  hydration: {
    name: 'Hydration Challenge',
    description: 'Build a consistent water drinking habit',
    commitment: 'Drink more water, track intake, build the habit',
    weeks: [
      {
        theme: 'Baseline Week',
        days: [
          'Track how much water you drink naturally.',
          'Drink one extra glass today.',
          'Drink water first thing in morning.',
          'Add a glass before each meal.',
          'Track your bathroom visits (sign of hydration).',
          'Weekly review: Current average?',
          'Rest day - drink intuitively.',
        ],
        intensityNote: "See where you're starting from.",
      },
      {
        theme: 'Building Week',
        days: [
          'Aim for 6 glasses today.',
          'Get a water bottle you love using.',
          'Set 3 reminders throughout day.',
          'Drink before you feel thirsty.',
          'Replace one other drink with water.',
          'Weekly review: Getting easier?',
          'Practice your system.',
        ],
        intensityNote: 'Make water accessible and visible.',
      },
      {
        theme: 'Optimization Week',
        days: [
          'Aim for 8 glasses.',
          'Connect water to existing habits.',
          'Track energy levels with hydration.',
          'Try adding lemon or other flavoring.',
          'Find your optimal intake level.',
          'Weekly review: How do you feel?',
          'Maintain and adjust.',
        ],
        intensityNote: 'Find what works for your body.',
      },
      {
        theme: 'Mastery Week',
        days: [
          'Full hydration routine established.',
          'Notice how dehydration feels now.',
          'Adjust for activity level.',
          'Create your portable hydration system.',
          'Plan for different situations.',
          'Celebrate your hydration habit!',
          'Plan for maintaining long-term.',
        ],
        intensityNote: 'Hydration is now second nature.',
      },
    ],
  },

  gratitude: {
    name: 'Gratitude Practice',
    description: 'Build a daily gratitude habit to shift your perspective',
    commitment: 'Daily gratitude reflection',
    weeks: [
      {
        theme: 'Simple Start Week',
        days: [
          'Name 1 thing you\'re grateful for.',
          'Name 1 different thing.',
          'Write it down this time.',
          'Share gratitude with someone.',
          'Notice something small you usually overlook.',
          'Weekly reflection on what you noticed.',
          'Rest day - gratitude when it comes naturally.',
        ],
        intensityNote: 'Start simple. One thing is enough.',
      },
      {
        theme: 'Deepening Week',
        days: [
          'Name 3 things you\'re grateful for.',
          'Add WHY you\'re grateful for each.',
          'Include a person and tell them.',
          'Notice gratitude in difficult moments.',
          'Write a short gratitude letter.',
          'Weekly review: How does gratitude feel?',
          'Practice when you remember.',
        ],
        intensityNote: 'Going deeper than surface gratitude.',
      },
      {
        theme: 'Expansion Week',
        days: [
          'Gratitude for challenges/growth.',
          'Gratitude for your body.',
          'Gratitude for relationships.',
          'Gratitude for opportunities.',
          'Gratitude for simple pleasures.',
          'Weekly reflection: Perspective shifting?',
          'Flexible practice day.',
        ],
        intensityNote: 'Expanding what you can appreciate.',
      },
      {
        theme: 'Integration Week',
        days: [
          'Full gratitude journaling routine.',
          'Share appreciation with others.',
          'Notice gratitude throughout day.',
          'Design your ongoing practice.',
          'Create gratitude rituals (meals, bedtime).',
          'Celebrate your shifted perspective!',
          'Plan for maintaining the habit.',
        ],
        intensityNote: 'Gratitude is now your lens.',
      },
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get challenge by type
 */
export function getChallenge(type: string): ChallengeDefinition | undefined {
  return THIRTY_DAY_CHALLENGES[type];
}

/**
 * Get all available challenge types
 */
export function getChallengeTypes(): string[] {
  return Object.keys(THIRTY_DAY_CHALLENGES);
}

/**
 * Get challenge day content
 */
export function getChallengeDay(
  type: string,
  day: number
): { weekTheme: string; dayTask: string; intensityNote: string } | null {
  const challenge = THIRTY_DAY_CHALLENGES[type];
  if (!challenge) return null;

  const weekIndex = Math.floor((day - 1) / 7);
  const dayIndex = (day - 1) % 7;

  if (weekIndex >= challenge.weeks.length) return null;

  const week = challenge.weeks[weekIndex];
  return {
    weekTheme: week.theme,
    dayTask: week.days[dayIndex] || 'Rest and reflect',
    intensityNote: week.intensityNote,
  };
}

