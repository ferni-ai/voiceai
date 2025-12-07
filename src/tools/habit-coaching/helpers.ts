/**
 * Helper Functions for Habit Coaching
 *
 * Utility functions for habit diagnosis, motivation, and analysis.
 *
 * @module habit-coaching/helpers
 */

import type {
  HabitDiagnosis,
  MotivationalContent,
  MoodLog,
  MoodPatterns,
  SetbackLog,
} from './types.js';

// ============================================================================
// FRICTION GENERATION
// ============================================================================

/**
 * Generate friction tips for breaking bad habits
 */
export function generateFrictionTips(badHabit: string): string[] {
  const lowerHabit = badHabit.toLowerCase();

  if (
    lowerHabit.includes('phone') ||
    lowerHabit.includes('scroll') ||
    lowerHabit.includes('social media')
  ) {
    return [
      'Delete apps from home screen (keep only in folders)',
      'Enable grayscale mode on phone',
      'Set up app time limits',
      'Charge phone in another room',
      'Use a real alarm clock instead of phone',
    ];
  }
  if (lowerHabit.includes('snack') || lowerHabit.includes('eat') || lowerHabit.includes('junk')) {
    return [
      "Don't buy it - if it's not in the house, you can't eat it",
      'Put snacks in hard-to-reach places',
      'Use smaller plates and containers',
      'Drink water first when you feel hungry',
      'Keep healthy alternatives visible and easy',
    ];
  }
  if (lowerHabit.includes('procrastin') || lowerHabit.includes('distract')) {
    return [
      'Use website blockers during focus time',
      'Work in a different location',
      'Put phone in another room',
      'Use the 2-minute rule - if it takes less than 2 min, do it now',
      'Break tasks into tiny steps',
    ];
  }
  // Generic friction tips
  return [
    'Add steps between you and the bad habit',
    'Remove cues from your environment',
    'Make the habit socially costly (tell others)',
    'Add a delay before indulging',
    'Replace the routine with something else',
  ];
}

// ============================================================================
// SETBACK PATTERN DETECTION
// ============================================================================

/**
 * Detect patterns in setback logs
 */
export function detectSetbackPattern(setbacks: SetbackLog[]): string | null {
  if (setbacks.length < 2) return null;

  const triggers = setbacks.map((s) => s.trigger.toLowerCase());

  // Check for common patterns
  if (
    triggers.filter((t) => t.includes('stress') || t.includes('tired')).length >
    triggers.length / 2
  ) {
    return 'stress or tiredness';
  }
  if (
    triggers.filter((t) => t.includes('weekend') || t.includes('saturday') || t.includes('sunday'))
      .length >
    triggers.length / 2
  ) {
    return 'weekends (less structure)';
  }
  if (
    triggers.filter((t) => t.includes('evening') || t.includes('night')).length >
    triggers.length / 2
  ) {
    return 'evenings (willpower depletion)';
  }
  if (
    triggers.filter((t) => t.includes('alone') || t.includes('bored')).length >
    triggers.length / 2
  ) {
    return 'boredom or being alone';
  }

  return null;
}

// ============================================================================
// HABIT DIAGNOSIS
// ============================================================================

/**
 * Diagnose why a habit isn't working
 */
export function diagnoseHabitFailure(
  failurePoint: 'never_start' | 'start_then_stop' | 'inconsistent' | 'hate_it' | 'forget',
  currentCue?: string,
  currentReward?: string
): HabitDiagnosis {
  const diagnoses: Record<string, HabitDiagnosis> = {
    never_start: {
      issue: 'The habit is too big or intimidating',
      explanation:
        "When we can't even start, it usually means the habit feels overwhelming. Your brain is protecting you from perceived effort.",
      science:
        'The brain resists tasks that seem effortful. Making the habit tiny bypasses this resistance.',
      fixes: [
        'Make it ridiculously small (2 min or less)',
        "Focus ONLY on starting, not completing",
        "Remove all friction before the habit",
        "Stack it onto something you already do",
      ],
      reframe: 'Your only job is to START. Even 30 seconds counts.',
      nextStep: 'What would a 2-minute version of this habit look like?',
    },
    start_then_stop: {
      issue: 'The habit lacks a strong enough reward',
      explanation:
        "You can start but can't sustain because the reward isn't immediate or satisfying enough.",
      science:
        'Habits need immediate rewards to stick. Delayed benefits (health, success) don\'t motivate the habit-forming part of your brain.',
      fixes: [
        'Add an immediate reward after the habit',
        'Create a tiny celebration (fist pump, "yes!")',
        'Track progress visually',
        'Pair with something enjoyable',
      ],
      reframe: 'How can you make this habit feel good RIGHT AFTER you do it?',
      nextStep: "What's a tiny celebration you could do after the habit?",
    },
    inconsistent: {
      issue: 'The cue/trigger is weak or inconsistent',
      explanation:
        "You can do the habit but don't do it reliably because there's no strong trigger.",
      science:
        'Habits are cue-dependent. Without a consistent trigger, the behavior stays in conscious effort territory.',
      fixes: [
        "Attach to an existing habit (habit stacking)",
        "Make the cue obvious and unavoidable",
        'Same time, same place every day',
        'Use implementation intentions: "When X happens, I will Y"',
      ],
      reframe: 'The habit needs a home in your day. Where does it live?',
      nextStep: currentCue
        ? `How can you make "${currentCue}" more obvious?`
        : 'What existing habit could you stack this onto?',
    },
    hate_it: {
      issue: 'The habit doesn\'t match your values or personality',
      explanation:
        "You're forcing yourself to do something that doesn't align with who you are or how you work.",
      science:
        "Habits that conflict with identity are unsustainable. We need to feel like 'the kind of person who...'",
      fixes: [
        'Find a version that matches your personality',
        'Connect to your deeper WHY',
        'Make it feel like YOUR choice',
        'Find a way to make it enjoyable',
      ],
      reframe: 'Maybe you need a different version of this habit that actually fits YOU.',
      nextStep: 'What would a version of this habit look like that you might actually enjoy?',
    },
    forget: {
      issue: 'The habit has no environmental support',
      explanation:
        "You want to do the habit but it's not on your mental radar. Out of sight, out of mind.",
      science: 'Our environment shapes our behavior more than willpower. Design your space for success.',
      fixes: [
        'Put visual reminders where you\'ll see them',
        'Set up the environment the night before',
        'Use phone reminders strategically',
        'Make the habit visible and obvious',
      ],
      reframe: "Your environment should make the habit easy to remember.",
      nextStep: "What visual reminder could you put where you'll see it?",
    },
  };

  return diagnoses[failurePoint] || diagnoses.inconsistent;
}

// ============================================================================
// MOTIVATION CONTENT
// ============================================================================

/**
 * Get motivational content based on type
 */
export function getMotivationalContent(
  type: string,
  context?: string,
  _struggle?: string
): MotivationalContent {
  const content: Record<string, MotivationalContent[]> = {
    science_fact: [
      {
        message:
          'Your brain physically changes when you build habits. Every time you do the habit, you strengthen the neural pathway. After about 66 days, the pathway is so strong the habit becomes automatic.',
        source: 'Phillippa Lally, University College London',
        action: "You're literally building your brain right now.",
        followUp: "What's the tiniest version of your habit you could do right now?",
      },
      {
        message:
          'Studies show that people who write down their goals are 42% more likely to achieve them. And people who share their goals with someone are even more successful.',
        source: 'Dr. Gail Matthews, Dominican University',
        action: "Write down what you're working on. Tell me about it.",
        followUp: 'Would you like to share your goal with me?',
      },
      {
        message:
          'The "fresh start effect" is real: people are more successful at habit change after temporal landmarks (Monday, the 1st, birthdays). But here\'s the secret - you can create your own fresh start any moment.',
        source: 'Katherine Milkman, Wharton',
        action: 'Right now can be your fresh start.',
        followUp: 'What if this moment was your new beginning?',
      },
    ],
    success_story: [
      {
        message:
          "There's a guy who started with 1 pushup a day. Just one. He said it felt ridiculous. A year later, he could do 100. He didn't get there through heroic willpower - he got there by making the habit so small he couldn't say no.",
        source: 'Tiny Habits approach',
        action: "What's your one pushup?",
        followUp: "What's a version of your habit so small it feels almost silly?",
      },
      {
        message:
          'A woman I know wanted to read more. She committed to one page a day. ONE PAGE. Most days she read more, but the commitment was just one. She read 30 books that year.',
        source: 'Real story',
        action: 'The tiny version unlocks the bigger version.',
        followUp: 'What if you only had to do the smallest possible version?',
      },
    ],
    pep_talk: [
      {
        message:
          "Listen to me. You showing up, even on the hard days? That's not common. Most people quit. Most people don't even try. You're here, thinking about your habits, wanting to be better. That makes you exceptional.",
        action: "You're already ahead of most people.",
        followUp:
          "What's one tiny thing you could do right now to prove to yourself you're serious?",
      },
      {
        message:
          "I know it feels like you're not making progress. But change is like bamboo - it grows underground for years, invisible, building roots. Then it shoots up 90 feet in 6 weeks. You're in the root-building phase. Don't stop.",
        action: "Your progress is happening, even if you can't see it yet.",
        followUp: 'Can you think of one small sign that things are shifting?',
      },
    ],
    reframe: [
      {
        message:
          "You didn't \"fail at your habit.\" You gathered data about what doesn't work. Edison didn't fail 10,000 times - he found 10,000 ways that didn't work. Each attempt teaches you something.",
        action: "This isn't failure. This is research.",
        followUp: 'What did this attempt teach you?',
      },
      {
        message:
          "You're not \"starting over.\" Your brain still has all the neural pathways from before. They're just a bit rusty. You're not at zero - you're at a head start.",
        action: 'Starting again is faster than starting fresh.',
        followUp: 'What did you learn from your previous attempts?',
      },
    ],
    why_reminder: [
      {
        message:
          "Remember why you started this. Not the surface reason - the REAL reason. The deeper thing you're trying to prove, become, or create. That reason is still valid.",
        action: 'Connect to your deeper why.',
        followUp: 'Why did you want to change this in the first place?',
      },
    ],
    future_self: [
      {
        message:
          "Close your eyes. Picture yourself one year from now, having stuck with this habit. How do you feel? What's different? That person is possible. Every small action today votes for that future.",
        action: 'Your future self is counting on today.',
        followUp: 'What would your future self thank you for doing today?',
      },
      {
        message:
          "Every action is a vote for the type of person you want to become. One pushup isn't much exercise. But it's a vote for \"I'm someone who exercises.\" Those votes add up to identity.",
        source: 'James Clear, Atomic Habits',
        action: 'Cast one vote right now.',
        followUp: 'What identity are you voting for?',
      },
    ],
  };

  const options = content[type] || content.pep_talk;
  const selected = { ...options[Math.floor(Math.random() * options.length)] };

  // Personalize if context provided
  if (context) {
    selected.followUp = `When it comes to ${context}, ${selected.followUp.toLowerCase()}`;
  }

  return selected;
}

// ============================================================================
// MOOD ANALYSIS
// ============================================================================

/**
 * Analyze mood patterns over time
 */
export function analyzeMoodPatterns(moodLogs: MoodLog[]): MoodPatterns {
  const insights: string[] = [];
  const habitCorrelations: Record<string, string> = {};

  if (moodLogs.length < 3) {
    return { insights: [], habitCorrelations: {} };
  }

  // Analyze by time of day
  const morningMoods = moodLogs.filter((l) => l.timeOfDay === 'morning');
  const eveningMoods = moodLogs.filter((l) => l.timeOfDay === 'evening');

  if (morningMoods.length >= 2 && eveningMoods.length >= 2) {
    const morningAvg = calculateMoodScore(morningMoods);
    const eveningAvg = calculateMoodScore(eveningMoods);

    if (morningAvg > eveningAvg + 0.5) {
      insights.push("You tend to feel better in the mornings - schedule important tasks then.");
    } else if (eveningAvg > morningAvg + 0.5) {
      insights.push('Your mood improves as the day goes on - build momentum with easy morning tasks.');
    }
  }

  // Analyze habit correlations
  const habitsSet = new Set<string>();
  moodLogs.forEach((log) => {
    log.habitsCompleted.forEach((h) => habitsSet.add(h));
  });

  habitsSet.forEach((habit) => {
    const withHabit = moodLogs.filter((l) => l.habitsCompleted.includes(habit));
    const withoutHabit = moodLogs.filter((l) => !l.habitsCompleted.includes(habit));

    if (withHabit.length >= 2 && withoutHabit.length >= 2) {
      const withScore = calculateMoodScore(withHabit);
      const withoutScore = calculateMoodScore(withoutHabit);

      if (withScore > withoutScore + 0.3) {
        habitCorrelations[habit] = 'positive';
        insights.push(`You tend to feel better on days you do "${habit}".`);
      }
    }
  });

  return { insights, habitCorrelations };
}

function calculateMoodScore(logs: MoodLog[]): number {
  const moodScores: Record<string, number> = {
    great: 5,
    good: 4,
    okay: 3,
    low: 2,
    struggling: 1,
  };

  const total = logs.reduce((sum, log) => sum + (moodScores[log.mood] || 3), 0);
  return total / logs.length;
}

// ============================================================================
// ENCOURAGEMENT GENERATION
// ============================================================================

/**
 * Get encouragement based on progress
 */
export function getEncouragement(avgStreak: number, wins: number): string {
  if (avgStreak > 14 && wins >= 3) {
    return "You're on fire! This kind of consistency changes lives.";
  } else if (avgStreak > 7) {
    return "You're building real momentum. Keep showing up!";
  } else if (avgStreak > 0) {
    return 'Every streak starts at one. You\'re on your way!';
  } else {
    return 'This is where change begins. One day at a time.';
  }
}

// ============================================================================
// MOOD-BASED TIPS
// ============================================================================

/**
 * Get tips based on current mood and energy
 */
export function getMoodBasedTip(
  mood: string,
  energy: string,
  _timeOfDay: string
): string {
  if (energy === 'depleted' || mood === 'struggling') {
    return 'Low energy day - do only essential habits at their tiniest version. Rest is productive too.';
  }
  if (energy === 'high' && mood === 'great') {
    return 'High energy! Great time to tackle challenging habits or try expanding existing ones.';
  }
  if (energy === 'low') {
    return 'Low energy - focus on habits that give you energy rather than drain it.';
  }
  return 'Steady state - maintain your normal routine and celebrate consistency.';
}

