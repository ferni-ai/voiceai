/**
 * Team Package Types
 *
 * Types for the team package system that enables persona teams
 * to be packaged, purchased, and deployed together.
 */
// ============================================================================
// PACKAGE DEFINITIONS
// ============================================================================
/**
 * Financial Wellness Team Package
 */
export const FINANCIAL_WELLNESS_TEAM = {
    id: 'financial-wellness-team',
    version: '1.0.0',
    name: 'Financial Wellness Team',
    description: 'Complete team for personal finance management, investing guidance, and financial habit building.',
    members: [
        {
            personaId: 'ferni',
            characterId: 'ferni',
            roleId: 'coordinator',
            displayName: 'Ferni',
            required: true,
        },
        {
            personaId: 'nayan-patel',
            characterId: 'nayan-patel',
            roleId: 'lifetime-advisor',
            displayName: 'Nayan Patel',
            required: true,
        },
        {
            personaId: 'peter-john',
            characterId: 'peter-john',
            roleId: 'researcher',
            displayName: 'Peter John',
            required: true,
        },
        {
            personaId: 'maya-santos',
            characterId: 'maya-santos',
            roleId: 'habits-coach',
            displayName: 'Maya Santos',
            required: true,
        },
        {
            personaId: 'alex-chen',
            characterId: 'alex-chen',
            roleId: 'communicator',
            displayName: 'Alex Chen',
            required: false,
        },
        {
            personaId: 'jordan-taylor',
            characterId: 'jordan-taylor',
            roleId: 'event-planner',
            displayName: 'Jordan Taylor',
            required: false,
        },
    ],
    coordinator: 'ferni',
    routing: {
        topicRouting: [
            {
                topics: ['budget', 'spending', 'savings', 'debt', 'habits'],
                targetRole: 'habits-coach',
                priority: 10,
            },
            {
                topics: ['investing', 'portfolio', 'index funds', 'retirement'],
                targetRole: 'lifetime-advisor',
                priority: 10,
            },
            {
                topics: ['stocks', 'analysis', 'research', 'earnings'],
                targetRole: 'researcher',
                priority: 10,
            },
            {
                topics: ['schedule', 'meeting', 'email', 'calendar'],
                targetRole: 'communicator',
                priority: 10,
            },
            {
                topics: ['milestone', 'event', 'wedding', 'baby', 'goals'],
                targetRole: 'event-planner',
                priority: 10,
            },
        ],
        intentRouting: [
            { intents: ['analyze_spending', 'create_budget'], targetRole: 'habits-coach', priority: 5 },
            {
                intents: ['invest_advice', 'portfolio_review'],
                targetRole: 'lifetime-advisor',
                priority: 5,
            },
            { intents: ['stock_analysis', 'research_company'], targetRole: 'researcher', priority: 5 },
        ],
        emotionRouting: [
            {
                emotions: ['anxious', 'worried', 'stressed'],
                minIntensity: 0.6,
                targetRole: 'lifetime-advisor',
            },
            { emotions: ['excited', 'hopeful'], minIntensity: 0.7, targetRole: 'coordinator' },
        ],
        defaultMember: 'ferni',
        autoHandoff: true,
    },
    pricing: {
        model: 'subscription',
        basePrice: 2999, // $29.99
        currency: 'USD',
        billingPeriod: 'monthly',
        tiers: [
            {
                id: 'basic',
                name: 'Basic',
                price: 1999,
                features: ['Core team (Ferni, Jack, Maya)', 'Unlimited conversations', 'Basic analytics'],
                includedMembers: ['ferni', 'nayan-patel', 'maya-santos'],
            },
            {
                id: 'pro',
                name: 'Professional',
                price: 2999,
                features: ['Full team', 'Advanced insights', 'Priority support', 'API access'],
                includedMembers: [
                    'ferni',
                    'nayan-patel',
                    'peter-john',
                    'maya-santos',
                    'alex-chen',
                    'jordan-taylor',
                ],
            },
        ],
        trial: {
            durationDays: 14,
            features: ['Full team access', 'Limited to 10 conversations'],
            requiresPayment: false,
        },
    },
    metadata: {
        author: 'VoiceAI Team',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(),
        category: 'financial-wellness',
        tags: ['finance', 'investing', 'budgeting', 'habits', 'coaching'],
        featured: true,
    },
};
//# sourceMappingURL=package-types.js.map