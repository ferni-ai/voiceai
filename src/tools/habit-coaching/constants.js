/**
 * Habit Coaching Constants
 *
 * All constant data for the habit coaching system.
 * Split from habit-coaching.ts for maintainability.
 *
 * NOTE: This file contains the core reference data.
 * The larger THIRTY_DAY_CHALLENGES and HABIT_TEMPLATES
 * are in separate files: challenges.ts and templates.ts
 */
// ============================================================================
// LIFE DOMAINS - All areas Maya can help with
// ============================================================================
export const LIFE_DOMAINS = {
    health: {
        name: 'Health & Wellness',
        icon: '💪',
        description: 'Physical health, fitness, nutrition, sleep',
        subdomains: ['exercise', 'nutrition', 'sleep', 'hydration', 'medical', 'energy'],
    },
    mind: {
        name: 'Mental & Emotional',
        icon: '🧠',
        description: 'Mental health, stress, mindfulness, emotional wellbeing',
        subdomains: ['mindfulness', 'stress', 'therapy', 'journaling', 'gratitude', 'meditation'],
    },
    relationships: {
        name: 'Relationships',
        icon: '❤️',
        description: 'Family, friends, romantic, community connections',
        subdomains: ['family', 'friends', 'romantic', 'community', 'networking', 'communication'],
    },
    career: {
        name: 'Career & Purpose',
        icon: '💼',
        description: 'Work, professional development, purpose',
        subdomains: [
            'skills',
            'productivity',
            'leadership',
            'side_projects',
            'job_search',
            'mentorship',
        ],
    },
    learning: {
        name: 'Learning & Growth',
        icon: '📚',
        description: 'Education, skills, personal development',
        subdomains: ['reading', 'courses', 'languages', 'certifications', 'hobbies', 'creativity'],
    },
    finance: {
        name: 'Financial Wellness',
        icon: '💰',
        description: 'Money habits, saving, investing, spending',
        subdomains: ['saving', 'budgeting', 'investing', 'debt', 'income', 'generosity'],
    },
    home: {
        name: 'Home & Environment',
        icon: '🏠',
        description: 'Living space, organization, sustainability',
        subdomains: ['cleaning', 'organization', 'maintenance', 'sustainability', 'cooking', 'garden'],
    },
    selfCare: {
        name: 'Self Care & Joy',
        icon: '✨',
        description: 'Rest, hobbies, fun, personal time',
        subdomains: ['rest', 'hobbies', 'entertainment', 'boundaries', 'self_compassion', 'adventure'],
    },
};
// ============================================================================
// LIFE STAGES - Different needs at different times
// ============================================================================
export const LIFE_STAGES = {
    student: {
        name: 'Student',
        priorities: ['learning', 'career', 'finance', 'relationships'],
        challenges: ['time_management', 'focus', 'budget_constraints', 'stress'],
        opportunities: ['habit_foundation', 'learning_capacity', 'flexibility'],
    },
    early_career: {
        name: 'Early Career',
        priorities: ['career', 'finance', 'relationships', 'health'],
        challenges: ['work_life_balance', 'financial_foundation', 'identity'],
        opportunities: ['income_growth', 'skill_building', 'networking'],
    },
    new_parent: {
        name: 'New Parent',
        priorities: ['relationships', 'health', 'selfCare', 'home'],
        challenges: ['sleep_deprivation', 'time_scarcity', 'identity_shift'],
        opportunities: ['family_bonding', 'perspective_shift', 'resilience'],
    },
    mid_career: {
        name: 'Mid Career',
        priorities: ['career', 'finance', 'health', 'relationships'],
        challenges: ['burnout', 'stagnation', 'sandwich_generation'],
        opportunities: ['peak_earning', 'leadership', 'mentoring'],
    },
    empty_nester: {
        name: 'Empty Nester',
        priorities: ['relationships', 'health', 'selfCare', 'learning'],
        challenges: ['identity_redefinition', 'relationship_renewal', 'health_focus'],
        opportunities: ['freedom', 'rediscovery', 'travel', 'purpose'],
    },
    pre_retirement: {
        name: 'Pre-Retirement',
        priorities: ['finance', 'health', 'relationships', 'selfCare'],
        challenges: ['retirement_planning', 'health_optimization', 'meaning'],
        opportunities: ['wealth_building', 'legacy', 'bucket_list'],
    },
    retirement: {
        name: 'Retirement',
        priorities: ['health', 'relationships', 'selfCare', 'learning'],
        challenges: ['structure', 'purpose', 'health_management', 'social'],
        opportunities: ['freedom', 'grandparenting', 'giving_back', 'travel'],
    },
    transition: {
        name: 'Life Transition',
        priorities: ['mind', 'selfCare', 'relationships', 'career'],
        challenges: ['uncertainty', 'stress', 'identity', 'planning'],
        opportunities: ['reinvention', 'fresh_start', 'clarity'],
    },
};
// ============================================================================
// FOUR TENDENCIES - Gretchen Rubin's personality framework
// ============================================================================
export const FOUR_TENDENCIES_STRATEGIES = {
    upholder: {
        name: 'Upholder',
        description: 'You meet both outer expectations (from others) and inner expectations (from yourself). You love schedules, to-do lists, and clear rules.',
        habitStrategies: [
            'Set clear rules and schedules for yourself',
            'Create detailed to-do lists and check them off',
            'Use habit tracking apps religiously',
            'Set personal deadlines and honor them',
            'Create routines and stick to them',
        ],
        avoid: [
            "Don't be too rigid - allow for flexibility",
            'Watch out for "tightening" - making rules stricter over time',
            'Remember that rest and fun are also "productive"',
        ],
        motivationTip: 'You respond to clear expectations. Put your habits on your calendar and treat them as non-negotiable appointments.',
    },
    questioner: {
        name: 'Questioner',
        description: 'You question all expectations and only follow through if you have good reasons. You need to understand WHY before you commit.',
        habitStrategies: [
            'Research the science behind habits before starting',
            'Understand exactly WHY this habit matters',
            'Set your own goals based on your reasoning',
            'Question advice and customize to fit your logic',
            'Track data to prove the habit is working',
        ],
        avoid: [
            'Analysis paralysis - at some point, just start',
            'Questioning to the point of decision fatigue',
            "Rejecting good advice just because you didn't come up with it",
        ],
        motivationTip: "You need to buy into the WHY. Once you truly believe a habit serves your goals, you'll follow through. Do the research first.",
    },
    obliger: {
        name: 'Obliger',
        description: 'You meet outer expectations (for others) but struggle with inner expectations (for yourself). You need external accountability.',
        habitStrategies: [
            'Get an accountability partner or coach',
            'Join a group or class with attendance expectations',
            "Make appointments you can't cancel",
            'Tell others about your goals publicly',
            'Set up external consequences (like charitable donations if you miss)',
        ],
        avoid: [
            'Obliger rebellion - pushing yourself too hard until you snap',
            "Saying yes to everyone else's needs before your own",
            'Feeling guilty for needing external accountability',
        ],
        motivationTip: "Your superpower is following through for others. Harness this by creating external accountability structures. This isn't weakness - it's self-knowledge.",
    },
    rebel: {
        name: 'Rebel',
        description: 'You resist ALL expectations, both outer and inner. You want to act from freedom and choice, doing things your way.',
        habitStrategies: [
            'Frame habits as choices, not rules ("I can" not "I must")',
            'Connect habits to your identity ("I\'m someone who...")',
            'Maintain freedom and options within the habit',
            'Challenge yourself to prove you CAN do it',
            'Make the habit feel like defiance of limitation',
        ],
        avoid: [
            "Don't set rigid rules - they'll trigger resistance",
            'Avoid tracking streaks - they feel like obligations',
            "Don't let others tell you what to do",
        ],
        motivationTip: 'Frame every habit as YOUR choice that expresses who you are. "I\'m the kind of person who..." works better than any rule. You do things because you WANT to, not because you should.',
    },
};
// ============================================================================
// GLIDEPATH LEVELS - Progression system for habits
// ============================================================================
export const GLIDEPATH_LEVELS = [
    {
        level: 1,
        name: 'Tiny Start',
        description: "So small you can't say no. 2 minutes or less.",
        duration: '1-2 weeks',
        criteria: '80% completion rate',
        intensity: 10,
        focus: 'Just showing up. Building the neural pathway.',
    },
    {
        level: 2,
        name: 'Mini Habit',
        description: 'Slightly expanded. 5-10 minutes.',
        duration: '2-3 weeks',
        criteria: '70% completion rate at level 1',
        intensity: 25,
        focus: 'Consistency over intensity. Chain building.',
    },
    {
        level: 3,
        name: 'Emerging Practice',
        description: 'Building momentum. 15-20 minutes.',
        duration: '3-4 weeks',
        criteria: '70% completion rate at level 2',
        intensity: 50,
        focus: 'Starting to feel natural. Identity shift beginning.',
    },
    {
        level: 4,
        name: 'Established Habit',
        description: 'Part of your routine. 20-30 minutes.',
        duration: '4-6 weeks',
        criteria: '70% completion rate at level 3',
        intensity: 75,
        focus: 'Automatic. Missing it feels wrong.',
    },
    {
        level: 5,
        name: 'Lifestyle Integration',
        description: 'Fully integrated. Flexible duration.',
        duration: 'Ongoing',
        criteria: '3 months at level 4',
        intensity: 100,
        focus: 'Part of who you are. Teaching others.',
    },
];
// ============================================================================
// SELF-COMPASSION MESSAGES
// ============================================================================
export const SELF_COMPASSION_MESSAGES = {
    ashamed: "Hey, shame is the enemy of change. What happened doesn't define you - what you do next does. Everyone stumbles. EVERYONE. Let's focus on the next step, not the last one.",
    frustrated: "I hear you. Frustration means you care, and caring is step one. The path to any goal has setbacks built in. This isn't a detour - it's part of the journey.",
    disappointed: "Disappointment shows you had expectations of yourself - that's actually good! Now let's channel that into curiosity: what can we learn from this?",
    hopeless: "I know it feels like you can't do this. But that feeling is temporary, and it's lying to you. You've overcome hard things before. We'll take the tiniest step forward together.",
    angry: "Anger can be fuel if we channel it right. You're mad because you want better for yourself. Let's turn that energy into your next small action.",
};
// ============================================================================
// ACCOUNTABILITY TIPS
// ============================================================================
export const ACCOUNTABILITY_TIPS = {
    partner: [
        'Check in at the same time each day/week',
        'Share both wins AND struggles honestly',
        "Celebrate each other's progress",
        "Be specific about what you're committing to",
    ],
    group: [
        'Regular meeting times increase accountability',
        'Share specific goals with the group',
        'Celebrate group milestones together',
        'Support others - it reinforces your own commitment',
    ],
    public: [
        'Share your commitment on social media',
        'Regular progress updates increase follow-through',
        "Be specific about what you're doing",
        'Update even when you struggle - vulnerability builds connection',
    ],
    coach: [
        'Be completely honest with your coach',
        'Prepare for sessions with updates',
        'Implement suggestions before next session',
        'Track between sessions for data',
    ],
    app: [
        "Enable notifications and don't ignore them",
        'Use apps that share progress with others',
        'Review your stats regularly',
        'Combine app tracking with human accountability for best results',
    ],
};
// ============================================================================
// ENVIRONMENT DESIGN STRATEGIES
// ============================================================================
export const ENVIRONMENT_BUILD_STRATEGIES = [
    "Make cues obvious: Put visual reminders where you'll see them",
    'Reduce friction: Remove steps between you and the habit',
    'Prime your environment: Set up the night before',
    'Use habit stacking: Link to existing behaviors',
    'Create a dedicated space: Associate a location with the habit',
];
export const ENVIRONMENT_BREAK_STRATEGIES = [
    'Make cues invisible: Remove triggers from sight',
    'Add friction: Put obstacles between you and the habit',
    'Change your environment: Break associations',
    'Avoid trigger situations: Know your weak moments',
    "Replace, don't remove: Fill the gap with something better",
];
//# sourceMappingURL=constants.js.map