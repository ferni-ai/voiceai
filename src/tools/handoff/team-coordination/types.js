/**
 * Team Coordination Types and Capabilities
 *
 * Defines team member capabilities and constants for
 * Jordan, Maya, and Alex partnership coordination.
 */
export const TEAM_CAPABILITIES = {
    jordan: {
        name: 'Jordan',
        expertise: [
            'Life planning',
            'Goal setting',
            'Event coordination',
            'Milestone tracking',
            'Retirement planning',
        ],
        canHelpWith: [
            'Setting goals',
            'Planning milestones',
            'Creating timelines',
            'Tracking progress',
            'Life portfolio review',
        ],
    },
    maya: {
        name: 'Maya',
        expertise: [
            'Budgeting',
            'Savings goals',
            'Spending analysis',
            'Debt payoff',
            'Financial planning',
        ],
        canHelpWith: [
            'Creating budgets',
            'Finding savings',
            'Tracking spending',
            'Setting savings goals',
            'Audit subscriptions',
        ],
    },
    alex: {
        name: 'Alex',
        expertise: ['Scheduling', 'Communication', 'Reminders', 'Follow-ups', 'Email drafting'],
        canHelpWith: [
            'Scheduling events',
            'Setting reminders',
            'Drafting emails',
            'Managing calendar',
            'Following up',
        ],
    },
    'nayan-patel': {
        name: 'Nayan',
        expertise: [
            'Wisdom & philosophy',
            'Life perspective',
            'Meaning & purpose',
            'Reflective practices',
            'Inner peace',
        ],
        canHelpWith: [
            'Finding meaning',
            'Life perspective',
            'Philosophical guidance',
            'Reflective conversation',
            'Inner wisdom',
        ],
    },
    'peter-john': {
        name: 'Peter',
        expertise: [
            'Stock picking',
            'Company research',
            'Growth investing',
            'Market analysis',
            'Investment opportunities',
        ],
        canHelpWith: ['Stock research', 'Company analysis', 'Investment ideas', 'Market insights'],
    },
};
// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================
export const MAX_NAME_LENGTH = 200;
export const MAX_NOTES_LENGTH = 5000;
export const MAX_AMOUNT = 10_000_000;
//# sourceMappingURL=types.js.map