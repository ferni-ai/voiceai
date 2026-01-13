/**
 * Content Databases for Life Coaching
 *
 * Evidence-based scripts, frameworks, and techniques
 * sourced from psychological research and clinical practice.
 *
 * Sources:
 * - Gretchen Rubin (Four Tendencies, habits)
 * - Brené Brown (vulnerability, shame, boundaries)
 * - John Gottman (relationships, conflict)
 * - Kristin Neff (self-compassion)
 * - Evelyn Tribole (Intuitive Eating)
 * - Harriet Lerner (anger, communication)
 * - Dan Siegel (window of tolerance, regulation)
 */
// ============================================================================
// BOUNDARY SCRIPTS DATABASE
// ============================================================================
export const BOUNDARY_SCRIPTS = [
    {
        id: 'declining-request',
        category: 'saying-no',
        situation: 'Declining a request without over-explaining',
        variations: {
            soft: [
                "I appreciate you thinking of me, but I can't this time.",
                "That doesn't work for me, but thank you for asking.",
                "I'm not able to take that on right now.",
                'I wish I could help, but I need to say no.',
            ],
            firm: [
                "No, I'm not available for that.",
                "I've decided not to do that.",
                "That's not something I can commit to.",
                'No. (No is a complete sentence.)',
            ],
            assertive: [
                "I need to decline. My schedule/energy/bandwidth doesn't allow for this.",
                "I've thought about it, and the answer is no.",
                "I'm protecting my time/energy right now.",
            ],
        },
        adaptations: {
            rebel: "I choose not to take that on - it's not aligned with who I am.",
            obliger: "I have other commitments I've made that need my attention.",
            questioner: "I've evaluated this and it doesn't make sense for me right now.",
            upholder: 'I have prior commitments to honor, including to myself.',
        },
    },
    {
        id: 'setting-time-boundary',
        category: 'time',
        situation: 'Protecting your time from demands',
        variations: {
            soft: [
                'I can chat until [time], then I need to go.',
                "I have [X] minutes - what's most important to cover?",
                "I'm available between [time] and [time].",
            ],
            firm: [
                "I don't take calls/meetings after [time].",
                'I need advance notice to schedule my time.',
                'My calendar is how I protect my time - please book through it.',
            ],
            assertive: [
                "I've set this boundary to be more effective and present.",
                'This time limit helps me show up better for everyone.',
            ],
        },
    },
    {
        id: 'emotional-boundary',
        category: 'emotional',
        situation: 'Protecting your emotional energy',
        variations: {
            soft: [
                "I care about you, and I'm not able to process this with you right now.",
                "I need some space to think about what you've shared.",
                "I'm feeling overwhelmed and need to pause this conversation.",
            ],
            firm: [
                "I'm not in a place to discuss this topic.",
                "This conversation isn't working for me. I need to step away.",
                'I need to protect my peace right now.',
            ],
            assertive: [
                "I'm setting this limit because I matter too.",
                'My emotional wellbeing requires me to step back from this.',
            ],
        },
    },
    {
        id: 'boundary-with-family',
        category: 'family',
        situation: 'Setting boundaries with family members',
        variations: {
            soft: [
                'I love you, and I need things to be different.',
                'Our relationship matters to me, which is why I need to be honest.',
                'I know this might be hard to hear, but I need [X].',
            ],
            firm: [
                'I need you to respect my decision, even if you disagree.',
                'This is what I need to stay healthy in our relationship.',
                "I'm not asking for permission - I'm letting you know.",
            ],
            assertive: [
                'I can love you and also have limits.',
                "My boundary isn't about not loving you - it's about loving us both.",
            ],
        },
    },
    {
        id: 'boundary-at-work',
        category: 'work',
        situation: 'Professional boundaries without career damage',
        variations: {
            soft: [
                'I want to do my best work, so I need to manage my commitments carefully.',
                'Let me check my current priorities and get back to you.',
                "I'm honored you thought of me - let me see what's realistic.",
            ],
            firm: [
                'My plate is full. If this is a priority, what should come off?',
                "I'm at capacity. Adding this would compromise quality elsewhere.",
                "I'm not available for this project at this time.",
            ],
            assertive: [
                'I do my best work when I can focus. This would dilute my effectiveness.',
                'Part of my professionalism is knowing my limits.',
            ],
        },
    },
];
// ============================================================================
// ANGER MANAGEMENT FRAMEWORKS
// ============================================================================
export const ANGER_FRAMEWORKS = [
    {
        id: 'anger-escalation-ladder',
        name: 'Anger Escalation Ladder',
        description: 'Recognize where you are on the anger escalation ladder',
        source: 'Adapted from anger management therapy',
        steps: [
            'Level 1 (Annoyance): Slight tension, can still think clearly',
            'Level 2 (Frustration): Warming face, thoughts speeding up',
            'Level 3 (Anger): Heart pounding, black/white thinking',
            'Level 4 (Rage): Flooded, logical brain offline',
        ],
        questions: [
            'What level are you at right now?',
            'What physical signs tell you?',
            'What thought patterns are present?',
        ],
    },
    {
        id: 'anger-as-secondary',
        name: 'Anger as Secondary Emotion',
        description: 'Anger often masks a primary emotion underneath',
        source: 'Harriet Lerner, "The Dance of Anger"',
        questions: [
            'What happened right before you felt angry?',
            'Under the anger, do you feel hurt? Scared? Embarrassed? Powerless?',
            'What need is not being met?',
        ],
    },
    {
        id: 'time-out-technique',
        name: 'Healthy Time-Out',
        description: 'How to exit a heated situation without abandoning',
        steps: [
            'Signal: "I need to take a break. I\'m not leaving the conversation, I\'m pausing it."',
            'Specify: "I\'ll be back in [time, usually 20-30 min]."',
            'Self-soothe: Move, breathe, cool down (no ruminating)',
            'Return: Come back as promised and re-engage.',
        ],
    },
];
// ============================================================================
// SOCIAL SKILLS FRAMEWORKS
// ============================================================================
export const SOCIAL_FRAMEWORKS = [
    {
        id: 'friendship-development',
        name: 'Adult Friendship Development Stages',
        description: 'How friendships naturally progress',
        steps: [
            'Stranger → Contact (smile, brief hello)',
            'Acquaintance → Positive associations (3-5 interactions)',
            'Casual Friend → Reliability (2-3 months)',
            'Friend → Trust & reciprocity (6-12 months)',
            'Close Friend → Deep mutual investment (years)',
        ],
    },
    {
        id: 'conversation-deepening',
        name: 'Conversation Deepening Questions',
        description: 'Move past small talk to meaningful connection',
        questions: [
            "What's keeping you busy these days?",
            'What are you excited about lately?',
            'What made you get into [their field/hobby]?',
            "What's something you're working on that excites you?",
            "What's been on your mind lately?",
        ],
    },
    {
        id: 'social-anxiety-prep',
        name: 'Social Event Preparation',
        description: 'Reduce anxiety before social situations',
        steps: [
            'Set realistic goal (one meaningful conversation)',
            'Prepare 2-3 conversation topics',
            'Remember: most people are also nervous',
            'Plan exit strategy (reduces trapped feeling)',
            'Plan recovery time afterward',
        ],
    },
];
// ============================================================================
// BODY IMAGE FRAMEWORKS
// ============================================================================
export const BODY_FRAMEWORKS = [
    {
        id: 'body-image-spectrum',
        name: 'Body Image Spectrum',
        description: 'Where you are in your body relationship',
        steps: [
            'Body Hatred: Constant negative self-talk, avoidance',
            'Body Dissatisfaction: Frequent comparison, conditional acceptance',
            'Body Neutrality: Body as tool, less emotional',
            'Body Acceptance: Accept body as is, reduced comparison',
            'Body Appreciation: Gratitude for body, joyful movement',
        ],
        questions: [
            'Where do you think you are on this spectrum?',
            'Where would you like to be?',
            "What's one small step toward that?",
        ],
    },
    {
        id: 'intuitive-eating',
        name: 'Intuitive Eating Principles',
        description: '10 principles for healing your relationship with food',
        source: 'Evelyn Tribole & Elyse Resch',
        steps: [
            'Reject the diet mentality',
            'Honor your hunger',
            'Make peace with food',
            'Challenge the food police',
            'Discover satisfaction',
            'Feel your fullness',
            'Cope with emotions with kindness',
            'Respect your body',
            'Movement - feel the difference',
            'Honor your health with gentle nutrition',
        ],
    },
];
// ============================================================================
// COPING TECHNIQUES DATABASE
// ============================================================================
export const COPING_TECHNIQUES = [
    {
        id: '5-4-3-2-1-grounding',
        name: '5-4-3-2-1 Grounding',
        domain: 'anxiety',
        duration: '2-5 minutes',
        steps: [
            'Name 5 things you can SEE',
            'Name 4 things you can TOUCH',
            'Name 3 things you can HEAR',
            'Name 2 things you can SMELL',
            'Name 1 thing you can TASTE',
        ],
        bestFor: ['anxiety', 'panic', 'dissociation', 'overwhelm'],
    },
    {
        id: 'physiological-sigh',
        name: 'Physiological Sigh',
        domain: 'stress',
        duration: '30 seconds',
        steps: [
            'Take a deep breath in through your nose',
            'At the top, take a second smaller breath in',
            'Long, slow exhale through your mouth',
            'Repeat 2-3 times',
        ],
        bestFor: ['acute stress', 'anger', 'anxiety'],
    },
    {
        id: 'cold-water-reset',
        name: 'Cold Water Reset',
        domain: 'emotional regulation',
        duration: '30 seconds',
        steps: [
            'Run cold water over your wrists',
            'Or splash cold water on your face',
            'Or hold ice cubes',
            'The cold activates your dive reflex and calms your nervous system',
        ],
        bestFor: ['anger', 'panic', 'intense emotion'],
    },
    {
        id: 'self-compassion-break',
        name: 'Self-Compassion Break',
        domain: 'self-criticism',
        duration: '3-5 minutes',
        steps: [
            'Acknowledge: "This is a moment of suffering" (mindfulness)',
            'Normalize: "Suffering is part of being human" (common humanity)',
            'Offer kindness: "May I be kind to myself" (self-kindness)',
            'Place hand on heart and breathe',
        ],
        bestFor: ['self-criticism', 'shame', 'failure'],
    },
    {
        id: 'body-scan',
        name: 'Quick Body Scan',
        domain: 'awareness',
        duration: '2-3 minutes',
        steps: [
            'Close your eyes or soften your gaze',
            'Notice your feet on the ground',
            'Scan up through legs, hips, belly',
            'Notice your chest, shoulders, arms, hands',
            'Relax your face, jaw, forehead',
            'Take one full breath',
        ],
        bestFor: ['tension', 'disconnection', 'overwhelm'],
    },
];
// ============================================================================
// TENDENCY-SPECIFIC STRATEGIES
// ============================================================================
export const TENDENCY_STRATEGIES = {
    upholder: {
        boundaries: [
            'You can set boundaries that honor BOTH external and internal expectations',
            'Think of boundary-setting as keeping your commitment to yourself',
            'Schedule boundary-setting like any other important commitment',
        ],
        motivation: [
            'Set clear rules for yourself that you can follow',
            'Use schedules and routines - they work for you',
            'Define expectations clearly so you can meet them',
        ],
        pitfalls: [
            'Watch for tightening rules in times of stress',
            "Be gentle when you can't meet all expectations",
            'Sometimes rules can conflict - prioritize',
        ],
    },
    questioner: {
        boundaries: [
            'Research shows boundary-setters have less burnout and better relationships',
            'The reason this boundary makes sense: [explain logic]',
            "You'll find that people often respect clear, explained limits",
        ],
        motivation: [
            'You work best when you understand WHY',
            'Do your own research to find what works',
            'Question arbitrary expectations - not all deserve your effort',
        ],
        pitfalls: [
            'Analysis paralysis can be a form of avoidance',
            "Sometimes you won't have perfect information - decide anyway",
            'Not everyone will give you satisfying reasons',
        ],
    },
    obliger: {
        boundaries: [
            "Set boundaries FOR others - you're no good to anyone burned out",
            'Find an accountability partner for your boundary work',
            'Frame it as meeting your commitment to your health/family',
        ],
        motivation: [
            'External accountability is your superpower - use it',
            'Join groups, get coaches, find accountability partners',
            'Set up systems where others expect things from you',
        ],
        pitfalls: [
            'Watch for obliger rebellion - resentment that explodes',
            "You can't pour from an empty cup",
            'Your needs matter too - others need you to meet them',
        ],
    },
    rebel: {
        boundaries: [
            'This boundary is YOUR choice, expressing YOUR values',
            "Set boundaries because that's who you are, not because you should",
            'You can choose to let go of expectations that drain you',
        ],
        motivation: [
            'Frame everything as identity and choice',
            "You're the kind of person who [desired behavior]",
            "Resist others' expectations by choosing your own path",
        ],
        pitfalls: [
            "Sometimes resisting just because you 'should' is still being controlled",
            'You can rebel against self-destructive patterns too',
            'Choice is always yours - even when it feels like obligation',
        ],
    },
};
// ============================================================================
// REFLECTION QUESTIONS
// ============================================================================
export const REFLECTION_QUESTIONS = {
    boundaries: [
        'Where do you feel most drained in your life right now?',
        'Who in your life consistently crosses your limits?',
        'What would you do differently if you had full permission?',
        "What's the worst that could happen if you said no?",
        'What are you afraid people will think if you set limits?',
    ],
    anger: [
        'What happened right before you felt angry?',
        'Under the anger, is there hurt? Fear? Powerlessness?',
        'What boundary was crossed?',
        'What do you need right now?',
        'How would the wisest version of you respond?',
    ],
    socialSkills: [
        'What makes connection feel risky for you?',
        'What do you wish people knew about you?',
        'What kind of friend do you want to be?',
        'What held you back the last time you wanted to reach out?',
        'What would change if you had deeper friendships?',
    ],
    bodyImage: [
        'When did you first learn to judge your body?',
        'Whose voice do you hear when you criticize yourself?',
        'What has your body done for you lately?',
        'How would you treat a friend who spoke about their body like you speak about yours?',
        'What would freedom from body thoughts feel like?',
    ],
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Get a random script template for a category
 */
export function getScriptForCategory(category, firmness) {
    const scripts = BOUNDARY_SCRIPTS.filter((s) => s.category === category);
    if (scripts.length === 0)
        return [];
    const script = scripts[Math.floor(Math.random() * scripts.length)];
    return script.variations[firmness];
}
/**
 * Get tendency-adapted script
 */
export function getAdaptedScript(category, tendency) {
    const scripts = BOUNDARY_SCRIPTS.filter((s) => s.category === category);
    if (scripts.length === 0)
        return null;
    const script = scripts[Math.floor(Math.random() * scripts.length)];
    if (tendency && script.adaptations?.[tendency]) {
        return script.adaptations[tendency];
    }
    return script.variations.firm[0];
}
/**
 * Get coping technique for situation
 */
export function getCopingTechnique(situation) {
    const lower = situation.toLowerCase();
    for (const technique of COPING_TECHNIQUES) {
        if (technique.bestFor?.some((b) => lower.includes(b))) {
            return technique;
        }
    }
    // Default to grounding
    return COPING_TECHNIQUES.find((t) => t.id === '5-4-3-2-1-grounding') ?? null;
}
//# sourceMappingURL=content-databases.js.map