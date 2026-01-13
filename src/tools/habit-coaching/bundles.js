/**
 * Habit Bundles - Pre-built habit recipes
 *
 * Curated bundles of habits that work well together,
 * each with a "stack formula" for optimal sequencing.
 *
 * @module habit-coaching/bundles
 */
// ============================================================================
// HABIT BUNDLES
// ============================================================================
export const HABIT_BUNDLES = {
    morning_person: {
        name: 'Morning Person Bundle',
        goal: 'Wake up earlier and own your mornings',
        description: 'A complete morning routine that energizes body and mind',
        totalMinutes: 45,
        coreMinutes: 15,
        stackFormula: 'After alarm → Water → Movement → Mindset → Ready',
        science: 'Morning routines reduce decision fatigue and set the tone for the day',
        synergies: [
            'Hydration prepares body for movement',
            'Movement wakes up the mind for mindset work',
            'Each habit creates momentum for the next',
        ],
        startTiny: 'Just do Immediate Rise + one sip of water for week one',
        habits: [
            {
                name: 'Immediate Rise',
                minutes: 1,
                tinyVersion: 'Feet on floor within 5 seconds of alarm',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Hydration',
                minutes: 2,
                tinyVersion: 'One sip of water',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Movement',
                minutes: 10,
                tinyVersion: '30-second stretch',
                priority: 'core',
                order: 3,
            },
            { name: 'Mindset', minutes: 5, tinyVersion: 'One deep breath', priority: 'core', order: 4 },
            {
                name: 'Cold Exposure',
                minutes: 2,
                tinyVersion: '10-second cold water on face',
                priority: 'enhancement',
                order: 5,
            },
            {
                name: 'Journaling',
                minutes: 10,
                tinyVersion: 'Write 1 word for how you want to feel',
                priority: 'enhancement',
                order: 6,
            },
            {
                name: 'Learning',
                minutes: 15,
                tinyVersion: 'Read 1 page',
                priority: 'enhancement',
                order: 7,
            },
        ],
    },
    evening_wind_down: {
        name: 'Evening Wind Down Bundle',
        goal: 'Transition from day to restful sleep',
        description: 'A calming routine that prepares body and mind for quality sleep',
        totalMinutes: 45,
        coreMinutes: 20,
        stackFormula: 'After dinner → Tidy → Screens off → Wind down → Bed ready',
        science: 'Evening routines signal the brain to produce melatonin and prepare for sleep',
        synergies: [
            'Clean space reduces mental clutter',
            'Screens off allows melatonin production',
            'Reflection creates mental closure',
        ],
        startTiny: 'Just put phone in another room 10 min before bed',
        habits: [
            {
                name: 'Kitchen Reset',
                minutes: 5,
                tinyVersion: 'Put one dish away',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Screens Off',
                minutes: 1,
                tinyVersion: 'Put phone in another room',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Light Dimming',
                minutes: 1,
                tinyVersion: 'Turn off one bright light',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Reflection',
                minutes: 10,
                tinyVersion: 'Think of one good thing from today',
                priority: 'core',
                order: 4,
            },
            {
                name: 'Tomorrow Prep',
                minutes: 5,
                tinyVersion: "Write tomorrow's one priority",
                priority: 'enhancement',
                order: 5,
            },
            {
                name: 'Relaxation',
                minutes: 15,
                tinyVersion: '3 slow breaths',
                priority: 'enhancement',
                order: 6,
            },
            {
                name: 'Sleep Prep',
                minutes: 8,
                tinyVersion: "Lay out tomorrow's clothes",
                priority: 'enhancement',
                order: 7,
            },
        ],
    },
    fitness_beginner: {
        name: 'Fitness Beginner Bundle',
        goal: 'Build a sustainable exercise habit from zero',
        description: 'Start moving your body daily without overwhelm',
        totalMinutes: 30,
        coreMinutes: 10,
        stackFormula: 'After wake → Movement → Stretch → Hydrate → Log',
        science: 'Consistency beats intensity. Short daily movement builds the habit faster than occasional long workouts.',
        synergies: [
            'Movement warms muscles for stretching',
            'Stretching prevents next-day soreness',
            'Hydration supports recovery',
        ],
        startTiny: 'Do 1 pushup or 30-second walk immediately after waking',
        habits: [
            {
                name: 'Morning Movement',
                minutes: 10,
                tinyVersion: '1 pushup or 30-second walk',
                priority: 'core',
                order: 1,
            },
            { name: 'Stretch', minutes: 5, tinyVersion: 'Touch toes once', priority: 'core', order: 2 },
            {
                name: 'Hydration',
                minutes: 1,
                tinyVersion: 'Drink water after movement',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Midday Movement',
                minutes: 10,
                tinyVersion: 'Walk to end of block',
                priority: 'enhancement',
                order: 4,
            },
            {
                name: 'Evening Stretch',
                minutes: 5,
                tinyVersion: 'One stretch before bed',
                priority: 'enhancement',
                order: 5,
            },
        ],
    },
    stress_relief: {
        name: 'Stress Relief Bundle',
        goal: 'Build daily stress management practices',
        description: 'Multiple touchpoints throughout the day to keep stress manageable',
        totalMinutes: 25,
        coreMinutes: 10,
        stackFormula: 'Morning calm → Midday reset → Evening release',
        science: 'Regular stress relief prevents cumulative buildup. Short practices multiple times beat one long session.',
        synergies: [
            'Morning calm sets a peaceful baseline',
            'Midday reset prevents afternoon stress accumulation',
            'Evening release processes the day before sleep',
        ],
        startTiny: 'Take 3 deep breaths before looking at your phone in the morning',
        habits: [
            {
                name: 'Morning Calm',
                minutes: 5,
                tinyVersion: '3 deep breaths before phone',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Midday Reset',
                minutes: 5,
                tinyVersion: 'Step outside for 1 minute',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Evening Release',
                minutes: 5,
                tinyVersion: 'Name one thing to let go of',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Movement Break',
                minutes: 5,
                tinyVersion: 'Shake out your body',
                priority: 'enhancement',
                order: 4,
            },
            {
                name: 'Gratitude',
                minutes: 5,
                tinyVersion: "One thing you're grateful for",
                priority: 'enhancement',
                order: 5,
            },
        ],
    },
    productivity_boost: {
        name: 'Productivity Boost Bundle',
        goal: 'Get more done with less stress',
        description: 'Habits that increase focus and reduce time waste',
        totalMinutes: 30,
        coreMinutes: 15,
        stackFormula: 'Plan → Focus block → Review',
        science: 'Planning and intentional focus dramatically outperform reactive work.',
        synergies: [
            'Planning directs focus toward highest value work',
            'Phone boundary eliminates biggest distraction',
            'Review informs better planning tomorrow',
        ],
        startTiny: 'Write your ONE top priority before starting work',
        habits: [
            {
                name: 'Daily Planning',
                minutes: 5,
                tinyVersion: 'Write top 1 priority',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Focus Block',
                minutes: 25,
                tinyVersion: '5 minutes of uninterrupted work',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Phone Boundary',
                minutes: 1,
                tinyVersion: 'Phone face-down while working',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Weekly Review',
                minutes: 15,
                tinyVersion: 'What worked this week?',
                priority: 'enhancement',
                order: 4,
            },
            {
                name: 'Learning Time',
                minutes: 15,
                tinyVersion: 'Read one article',
                priority: 'enhancement',
                order: 5,
            },
        ],
    },
    mindfulness_starter: {
        name: 'Mindfulness Starter Bundle',
        goal: 'Develop present-moment awareness',
        description: 'Build a meditation practice and mindful living habits',
        totalMinutes: 20,
        coreMinutes: 8,
        stackFormula: 'Morning stillness → Mindful moments → Evening reflection',
        science: 'Regular mindfulness practice physically changes the brain, increasing gray matter in areas for focus and emotional regulation.',
        synergies: [
            'Morning stillness sets awareness baseline',
            'Mindful eating creates daily touchpoint',
            'Gratitude shifts perspective positively',
        ],
        startTiny: 'Take 3 conscious breaths before getting out of bed',
        habits: [
            {
                name: 'Morning Stillness',
                minutes: 5,
                tinyVersion: '3 conscious breaths',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Mindful Eating',
                minutes: 5,
                tinyVersion: 'First bite eaten with attention',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Gratitude',
                minutes: 3,
                tinyVersion: 'Think of 1 thing you appreciate',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Body Awareness',
                minutes: 5,
                tinyVersion: 'Notice 3 physical sensations',
                priority: 'enhancement',
                order: 4,
            },
            {
                name: 'Evening Meditation',
                minutes: 5,
                tinyVersion: 'Sit quietly for 1 minute',
                priority: 'enhancement',
                order: 5,
            },
        ],
    },
    financial_wellness: {
        name: 'Financial Wellness Bundle',
        goal: 'Build daily money awareness and healthy habits',
        description: 'Simple daily practices that transform your relationship with money',
        totalMinutes: 15,
        coreMinutes: 8,
        stackFormula: 'Morning check → Mindful spending → Evening review',
        science: 'Daily financial awareness reduces overspending by 20-30% without needing willpower.',
        synergies: [
            'Morning check creates awareness for the day',
            'Spending pause activates at point of purchase',
            'Evening review connects spending to outcomes',
        ],
        startTiny: 'Glance at your account balance while having morning coffee',
        habits: [
            {
                name: 'Morning Money Check',
                minutes: 3,
                tinyVersion: 'Glance at account balance',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Spending Pause',
                minutes: 1,
                tinyVersion: 'Wait 10 seconds before non-essential purchase',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Evening Review',
                minutes: 5,
                tinyVersion: 'Did I spend today? On what?',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Weekly Planning',
                minutes: 10,
                tinyVersion: 'What big expenses this week?',
                priority: 'enhancement',
                order: 4,
            },
        ],
    },
    better_sleep: {
        name: 'Better Sleep Bundle',
        goal: 'Improve sleep quality and duration',
        description: 'Evening and morning habits that optimize your sleep',
        totalMinutes: 30,
        coreMinutes: 15,
        stackFormula: 'Consistent bedtime → Wind down → Sleep environment → Wake routine',
        science: 'Sleep consistency is more important than duration. Same bed/wake times train your circadian rhythm.',
        synergies: [
            'Consistent timing trains circadian rhythm',
            'Screens off allows melatonin production',
            'Dark and cool optimize sleep cycles',
            'Morning light resets the clock',
        ],
        startTiny: 'Set a bedtime alarm and put phone away when it rings',
        habits: [
            {
                name: 'Consistent Bedtime',
                minutes: 1,
                tinyVersion: 'Set bedtime alarm',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Screens Off',
                minutes: 1,
                tinyVersion: 'Phone away 10 min before bed',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Dark Room',
                minutes: 1,
                tinyVersion: 'Close one curtain',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Cool Room',
                minutes: 1,
                tinyVersion: 'Adjust thermostat down',
                priority: 'core',
                order: 4,
            },
            {
                name: 'Morning Light',
                minutes: 5,
                tinyVersion: 'Open curtains immediately',
                priority: 'core',
                order: 5,
            },
            {
                name: 'Caffeine Cutoff',
                minutes: 1,
                tinyVersion: 'No caffeine after 2pm',
                priority: 'enhancement',
                order: 6,
            },
            {
                name: 'Wind Down Ritual',
                minutes: 15,
                tinyVersion: 'Read 1 page before bed',
                priority: 'enhancement',
                order: 7,
            },
        ],
    },
    energy_boost: {
        name: 'Energy Boost Bundle',
        goal: 'Increase natural energy throughout the day',
        description: 'Habits that create sustainable energy without caffeine dependency',
        totalMinutes: 25,
        coreMinutes: 12,
        stackFormula: 'Morning activation → Midday recharge → Energy protection',
        science: 'Energy comes from sleep, movement, nutrition, and stress management - not just caffeine.',
        synergies: [
            'Movement increases blood flow and alertness',
            'Hydration prevents fatigue-causing dehydration',
            'Light exposure regulates energy hormones',
        ],
        startTiny: 'Drink a glass of water before your first coffee',
        habits: [
            {
                name: 'Morning Movement',
                minutes: 5,
                tinyVersion: '30-second stretch',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Hydration',
                minutes: 2,
                tinyVersion: 'Glass of water before coffee',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Light Exposure',
                minutes: 5,
                tinyVersion: 'Look at sky for 30 seconds',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Midday Walk',
                minutes: 10,
                tinyVersion: 'Walk to window and back',
                priority: 'enhancement',
                order: 4,
            },
            {
                name: 'Power Nap',
                minutes: 20,
                tinyVersion: 'Close eyes for 5 minutes',
                priority: 'enhancement',
                order: 5,
            },
        ],
    },
    relationship_nurturing: {
        name: 'Relationship Nurturing Bundle',
        goal: 'Strengthen important relationships daily',
        description: 'Simple daily actions that maintain and deepen connections',
        totalMinutes: 20,
        coreMinutes: 10,
        stackFormula: 'Daily reach out → Quality presence → Appreciation expression',
        science: 'Relationships are the #1 predictor of happiness and longevity. Small daily investments compound.',
        synergies: [
            'Daily texts maintain connection even when busy',
            'Presence deepens quality of interactions',
            'Appreciation strengthens bonds over time',
        ],
        startTiny: 'Send one "thinking of you" text each day',
        habits: [
            {
                name: 'Daily Text',
                minutes: 2,
                tinyVersion: 'Send "thinking of you" to someone',
                priority: 'core',
                order: 1,
            },
            {
                name: 'Present Presence',
                minutes: 5,
                tinyVersion: 'Phone away during one conversation',
                priority: 'core',
                order: 2,
            },
            {
                name: 'Appreciation',
                minutes: 3,
                tinyVersion: 'Tell someone one thing you appreciate',
                priority: 'core',
                order: 3,
            },
            {
                name: 'Deep Question',
                minutes: 5,
                tinyVersion: 'Ask "How are you really doing?"',
                priority: 'enhancement',
                order: 4,
            },
            {
                name: 'Weekly Date',
                minutes: 60,
                tinyVersion: 'Put it on calendar',
                priority: 'enhancement',
                order: 5,
            },
        ],
    },
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Get a bundle by key
 */
export function getBundle(key) {
    return HABIT_BUNDLES[key];
}
/**
 * Get all bundle keys
 */
export function getBundleKeys() {
    return Object.keys(HABIT_BUNDLES);
}
/**
 * Get core habits from a bundle
 */
export function getBundleCoreHabits(key) {
    const bundle = HABIT_BUNDLES[key];
    if (!bundle)
        return [];
    return bundle.habits.filter((h) => h.priority === 'core').sort((a, b) => a.order - b.order);
}
/**
 * Get enhancement habits from a bundle
 */
export function getBundleEnhancements(key) {
    const bundle = HABIT_BUNDLES[key];
    if (!bundle)
        return [];
    return bundle.habits
        .filter((h) => h.priority === 'enhancement')
        .sort((a, b) => a.order - b.order);
}
//# sourceMappingURL=bundles.js.map