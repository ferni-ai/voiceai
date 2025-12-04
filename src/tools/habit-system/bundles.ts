/**
 * Maya's Habit Coaching - Habit Bundles
 *
 * Pre-built habit bundles (recipes) for common goals.
 */

import type { LifeDomain, HabitBundleDefinition } from './types.js';

// ============================================================================
// HABIT BUNDLE TYPES
// ============================================================================

interface HabitBundleItem {
  name: string;
  minutes: number;
  tinyVersion: string;
  priority: 'core' | 'enhancement';
  order: number;
}

interface HabitBundle extends HabitBundleDefinition {
  totalMinutes: number;
  coreMinutes: number;
  stackFormula: string;
  science: string;
  habits: HabitBundleItem[];
}

// ============================================================================
// HABIT BUNDLES
// ============================================================================

export const HABIT_BUNDLES: Record<string, HabitBundle> = {
  morning_person: {
    name: 'Morning Person Bundle',
    description: 'A complete morning routine that energizes body and mind',
    domains: ['health', 'mind'],
    keystoneHabit: 'Immediate Rise',
    supportingHabits: ['Hydration', 'Movement', 'Mindset'],
    timeRequired: '15-45 minutes',
    bestTimeOfDay: 'Morning',
    synergy: 'Morning routines reduce decision fatigue and set the tone for the day',
    totalMinutes: 45,
    coreMinutes: 15,
    stackFormula: 'After alarm → Water → Movement → Mindset → Ready',
    science: 'Morning routines reduce decision fatigue and set the tone for the day',
    habits: [
      { name: 'Immediate Rise', minutes: 1, tinyVersion: 'Feet on floor within 5 seconds of alarm', priority: 'core', order: 1 },
      { name: 'Hydration', minutes: 2, tinyVersion: 'One sip of water', priority: 'core', order: 2 },
      { name: 'Movement', minutes: 10, tinyVersion: '30-second stretch', priority: 'core', order: 3 },
      { name: 'Mindset', minutes: 5, tinyVersion: 'One deep breath', priority: 'core', order: 4 },
      { name: 'Cold Exposure', minutes: 2, tinyVersion: '10-second cold water on face', priority: 'enhancement', order: 5 },
      { name: 'Journaling', minutes: 10, tinyVersion: 'Write 1 word for how you want to feel', priority: 'enhancement', order: 6 },
      { name: 'Learning', minutes: 15, tinyVersion: 'Read 1 page', priority: 'enhancement', order: 7 },
    ],
  },
  evening_wind_down: {
    name: 'Evening Wind Down Bundle',
    description: 'A calming routine that prepares body and mind for quality sleep',
    domains: ['health', 'selfCare'],
    keystoneHabit: 'Screens Off',
    supportingHabits: ['Kitchen Reset', 'Reflection', 'Tomorrow Prep'],
    timeRequired: '20-45 minutes',
    bestTimeOfDay: 'Evening',
    synergy: 'Evening routines signal the brain to produce melatonin and prepare for sleep',
    totalMinutes: 45,
    coreMinutes: 20,
    stackFormula: 'After dinner → Tidy → Screens off → Wind down → Bed ready',
    science: 'Evening routines signal the brain to produce melatonin and prepare for sleep',
    habits: [
      { name: 'Kitchen Reset', minutes: 5, tinyVersion: 'Put one dish away', priority: 'core', order: 1 },
      { name: 'Screens Off', minutes: 1, tinyVersion: 'Put phone in another room', priority: 'core', order: 2 },
      { name: 'Light Dimming', minutes: 1, tinyVersion: 'Turn off one bright light', priority: 'core', order: 3 },
      { name: 'Reflection', minutes: 10, tinyVersion: 'Think of one good thing from today', priority: 'core', order: 4 },
      { name: 'Tomorrow Prep', minutes: 5, tinyVersion: "Write tomorrow's one priority", priority: 'enhancement', order: 5 },
      { name: 'Relaxation', minutes: 15, tinyVersion: '3 slow breaths', priority: 'enhancement', order: 6 },
      { name: 'Sleep Prep', minutes: 8, tinyVersion: "Lay out tomorrow's clothes", priority: 'enhancement', order: 7 },
    ],
  },
  fitness_beginner: {
    name: 'Fitness Beginner Bundle',
    description: 'Start moving your body daily without overwhelm',
    domains: ['health'],
    keystoneHabit: 'Morning Movement',
    supportingHabits: ['Stretch', 'Hydration', 'Activity Log'],
    timeRequired: '10-30 minutes',
    bestTimeOfDay: 'Morning',
    synergy: 'Consistency beats intensity. Short daily movement builds the habit faster than occasional long workouts.',
    totalMinutes: 30,
    coreMinutes: 10,
    stackFormula: 'After wake → Movement → Stretch → Hydrate → Log',
    science: 'Consistency beats intensity. Short daily movement builds the habit faster than occasional long workouts.',
    habits: [
      { name: 'Morning Movement', minutes: 10, tinyVersion: '1 pushup or 30-second walk', priority: 'core', order: 1 },
      { name: 'Stretch', minutes: 5, tinyVersion: 'Touch toes once', priority: 'core', order: 2 },
      { name: 'Hydration', minutes: 1, tinyVersion: 'Drink water after movement', priority: 'core', order: 3 },
      { name: 'Midday Movement', minutes: 10, tinyVersion: 'Walk to end of block', priority: 'enhancement', order: 4 },
      { name: 'Evening Stretch', minutes: 5, tinyVersion: 'One stretch before bed', priority: 'enhancement', order: 5 },
    ],
  },
  stress_relief: {
    name: 'Stress Relief Bundle',
    description: 'Multiple touchpoints throughout the day to keep stress manageable',
    domains: ['mind', 'selfCare'],
    keystoneHabit: 'Morning Calm',
    supportingHabits: ['Midday Reset', 'Evening Release'],
    timeRequired: '10-25 minutes',
    bestTimeOfDay: 'Throughout day',
    synergy: 'Regular stress relief prevents cumulative buildup. Short practices multiple times beat one long session.',
    totalMinutes: 25,
    coreMinutes: 10,
    stackFormula: 'Morning calm → Midday reset → Evening release',
    science: 'Regular stress relief prevents cumulative buildup. Short practices multiple times beat one long session.',
    habits: [
      { name: 'Morning Calm', minutes: 5, tinyVersion: '3 deep breaths', priority: 'core', order: 1 },
      { name: 'Midday Reset', minutes: 5, tinyVersion: 'Close eyes for 30 seconds', priority: 'core', order: 2 },
      { name: 'Evening Release', minutes: 5, tinyVersion: 'Name one thing you can let go of', priority: 'core', order: 3 },
      { name: 'Nature Break', minutes: 5, tinyVersion: 'Look at something green', priority: 'enhancement', order: 4 },
      { name: 'Body Scan', minutes: 5, tinyVersion: 'Notice shoulders - drop them', priority: 'enhancement', order: 5 },
    ],
  },
  productivity_power: {
    name: 'Productivity Power Bundle',
    description: 'Focus-enhancing habits for getting things done',
    domains: ['career', 'learning'],
    keystoneHabit: 'Daily Planning',
    supportingHabits: ['Focus Blocks', 'Review', 'Deep Work'],
    timeRequired: '20-45 minutes',
    bestTimeOfDay: 'Morning + Throughout day',
    synergy: 'Planning and focused blocks create more output than reactive work.',
    totalMinutes: 45,
    coreMinutes: 20,
    stackFormula: 'Morning plan → Focus blocks → Midday review → End-of-day reflection',
    science: 'Planning and focused blocks create more output than reactive work.',
    habits: [
      { name: 'Morning Planning', minutes: 10, tinyVersion: 'Write 1 priority', priority: 'core', order: 1 },
      { name: 'Focus Block', minutes: 25, tinyVersion: '5 minutes on priority task', priority: 'core', order: 2 },
      { name: 'Midday Review', minutes: 5, tinyVersion: 'Check one item off list', priority: 'core', order: 3 },
      { name: 'Evening Review', minutes: 5, tinyVersion: 'Name one thing accomplished', priority: 'enhancement', order: 4 },
    ],
  },
  financial_wellness: {
    name: 'Financial Wellness Bundle',
    description: 'Daily money awareness and healthy financial habits',
    domains: ['finance'],
    keystoneHabit: 'Daily Check-In',
    supportingHabits: ['Spending Awareness', 'Savings Review'],
    timeRequired: '5-15 minutes',
    bestTimeOfDay: 'Evening',
    synergy: 'Daily awareness creates financial mindfulness that prevents overspending.',
    totalMinutes: 15,
    coreMinutes: 5,
    stackFormula: 'After dinner → Check balances → Review spending → Plan tomorrow',
    science: 'Daily awareness creates financial mindfulness that prevents overspending.',
    habits: [
      { name: 'Balance Check', minutes: 2, tinyVersion: 'Glance at one account', priority: 'core', order: 1 },
      { name: 'Spending Review', minutes: 3, tinyVersion: 'Recall one purchase', priority: 'core', order: 2 },
      { name: 'Savings Celebration', minutes: 2, tinyVersion: 'Note savings balance', priority: 'enhancement', order: 3 },
      { name: 'Tomorrow Planning', minutes: 3, tinyVersion: 'Set spending intention', priority: 'enhancement', order: 4 },
      { name: 'Learning', minutes: 5, tinyVersion: 'Read 1 financial tip', priority: 'enhancement', order: 5 },
    ],
  },
};

// ============================================================================
// BUNDLE HELPER FUNCTIONS
// ============================================================================

export function getBundleForGoal(goal: string): string | null {
  const goalLower = goal.toLowerCase();
  
  if (goalLower.includes('morning') || goalLower.includes('wake')) {
    return 'morning_person';
  }
  if (goalLower.includes('sleep') || goalLower.includes('evening') || goalLower.includes('night')) {
    return 'evening_wind_down';
  }
  if (goalLower.includes('exercise') || goalLower.includes('fitness') || goalLower.includes('workout')) {
    return 'fitness_beginner';
  }
  if (goalLower.includes('stress') || goalLower.includes('anxiety') || goalLower.includes('calm')) {
    return 'stress_relief';
  }
  if (goalLower.includes('productive') || goalLower.includes('focus') || goalLower.includes('work')) {
    return 'productivity_power';
  }
  if (goalLower.includes('money') || goalLower.includes('finance') || goalLower.includes('saving')) {
    return 'financial_wellness';
  }
  
  return null;
}

export function formatBundleDescription(bundleId: string): string {
  const bundle = HABIT_BUNDLES[bundleId];
  if (!bundle) return 'Bundle not found.';

  const coreHabits = bundle.habits.filter(h => h.priority === 'core');
  const enhancementHabits = bundle.habits.filter(h => h.priority === 'enhancement');

  return `
📦 **${bundle.name}**

${bundle.description}

**Formula:** ${bundle.stackFormula}

**Core Habits (${bundle.coreMinutes} min):**
${coreHabits.map(h => `  • ${h.name} (${h.minutes} min) - Tiny: "${h.tinyVersion}"`).join('\n')}

**Enhancement Habits (optional):**
${enhancementHabits.map(h => `  • ${h.name} (${h.minutes} min)`).join('\n')}

**Science:** ${bundle.science}

💡 Start with JUST the tiny versions. Add more only after those are automatic.
  `.trim();
}

