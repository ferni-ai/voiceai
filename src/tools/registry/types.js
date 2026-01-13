/**
 * Tool Registry Types
 *
 * Core types for the domain-based tool registry system.
 * This enables agent-agnostic tool organization where tools are
 * registered by capability/domain rather than by persona.
 *
 * DESIGN PRINCIPLES:
 * 1. Tools are registered by WHAT they do, not WHO uses them
 * 2. Agents select tools by domain in their manifest
 * 3. No agent-specific code in tool implementations
 * 4. Tools are composable and reusable across agents
 */
/**
 * All available tool domains
 */
export const ALL_TOOL_DOMAINS = [
    'memory',
    'calendar',
    'communication',
    'habits',
    'finance',
    'research',
    'productivity',
    'life-planning',
    'wellness',
    'entertainment',
    'vibe',
    'information',
    'wisdom',
    'handoff',
    'telephony',
    'voice-enrollment',
    'grief',
    'meaning',
    'relationships',
    'stories',
    'curiosity',
    'vulnerability',
    'dreams',
    'play',
    'self-compassion',
    'presence',
    'proactive',
    'awareness',
    'engagement',
    'simple-utilities',
    // Life Coaching Domains
    'crisis',
    'health',
    'career',
    'decisions',
    'family',
    'home',
    'learning',
    'creativity',
    'community',
    'legal-admin',
    'games',
    'cameo',
    'group-conversation',
    'second-chances',
    'connection',
    'difficult-conversations',
    'life-transitions',
    'reflection-games',
    'quiet-growth',
    'pattern-mastery',
    'timeless-perspective',
    'workflow-mastery',
    'life-thesis',
    'habit-persistence',
    'milestone-mastery',
    'developer',
    'behavior',
    'marketing',
    'referral',
    'smart-home',
    'webhooks',
    'books',
    'podcasts',
    'video',
    // New Life Coaching Domains (Expansion)
    'boundaries',
    'social-skills',
    'body-relationship',
    'anger',
    'shame',
    'envy',
    'resentment',
    'caregiver',
    'divorce',
    'new-parent',
    'empty-nest',
    'infidelity',
    'health-diagnosis',
    'job-loss',
    'sobriety',
    'sandwich-generation',
    'blended-family',
    'coming-out',
    'faith-transition',
    'dating',
    'neurodiversity',
    'trauma-support',
    'procrastination',
    'digital-wellness',
    'perfectionism',
    'intimacy',
    'burnout-recovery',
    'chronic-conditions',
    'midlife',
    'breakup-recovery',
    'scheduling',
    'concierge',
    'travel',
    'settings',
    'insights',
    // Nayan's Superhuman Wisdom
    'nayan-wisdom',
    // Maya's Superhuman Coaching
    'maya-coaching',
    // Alex's Superhuman Communication
    'superhuman-communication',
    // Jordan's Superhuman Planning
    'jordan-planning',
    // Peter's Superhuman Analytics
    'peter-analytics',
    // Local Search
    'local-search',
    // Developer Platform
    'developer-custom',
    // Life Automation Domains
    'commerce',
    'documents',
    'email-intelligence',
    'meal-planning',
    'projects',
    'social-events',
    'transportation',
    'vehicle',
    'workflows',
];
/**
 * Mapping from domains to categories
 */
export const DOMAIN_TO_CATEGORY = {
    memory: 'core',
    handoff: 'core',
    calendar: 'productivity',
    productivity: 'productivity',
    communication: 'communication',
    telephony: 'communication',
    'voice-enrollment': 'core', // Voice enrollment for phone callers
    habits: 'lifestyle',
    wellness: 'lifestyle',
    'life-planning': 'lifestyle',
    finance: 'financial',
    research: 'financial',
    information: 'information',
    wisdom: 'information',
    entertainment: 'entertainment',
    vibe: 'entertainment', // Unified environment control
    // Emotional/wisdom domains
    grief: 'lifestyle',
    meaning: 'lifestyle',
    relationships: 'lifestyle',
    stories: 'information',
    curiosity: 'information',
    vulnerability: 'lifestyle',
    dreams: 'lifestyle',
    play: 'entertainment',
    'self-compassion': 'lifestyle',
    presence: 'lifestyle',
    proactive: 'core',
    awareness: 'core',
    engagement: 'core',
    'simple-utilities': 'core', // Everyday helpers should be available to all
    // Life Coaching domains
    crisis: 'core', // Safety-critical, should be available to all
    health: 'lifestyle',
    career: 'productivity',
    decisions: 'core', // Foundational decision-making support
    family: 'lifestyle',
    home: 'productivity',
    learning: 'productivity',
    creativity: 'entertainment',
    community: 'lifestyle',
    'legal-admin': 'productivity',
    games: 'entertainment',
    cameo: 'core', // Team cameos should be available to coordinators
    'group-conversation': 'core', // Team roundtables and conference calls
    'second-chances': 'lifestyle', // Core to Ferni's identity - fresh starts and rebuilding
    connection: 'lifestyle', // Loneliness, friendship, belonging - epidemic-level need
    'difficult-conversations': 'lifestyle', // Preparing for and having hard conversations with grace
    'life-transitions': 'lifestyle', // Emotional journey through major life changes
    'reflection-games': 'lifestyle', // Deep coaching games for self-discovery
    'quiet-growth': 'lifestyle', // Anti-hustle growth: rest, seasons, plateaus, sufficiency
    'pattern-mastery': 'information', // Pattern recognition and insights
    'timeless-perspective': 'information', // Wisdom and philosophy
    'workflow-mastery': 'productivity', // Process optimization
    'habit-persistence': 'lifestyle', // Habit tracking persistence
    'milestone-mastery': 'lifestyle', // Achievement tracking
    developer: 'productivity', // Developer tools for coding and CLI
    behavior: 'core', // Behavior control - core to how Ferni speaks
    'life-thesis': 'lifestyle', // Life thesis - cross-persona motivation capture
    marketing: 'communication', // Social media management and content publishing
    referral: 'communication', // Voice referral calls for viral growth
    'smart-home': 'productivity', // Home Assistant integration for smart home control
    webhooks: 'productivity', // Webhook automations for IFTTT, Zapier, etc.
    books: 'entertainment', // Book tracking, recommendations, reading lists
    podcasts: 'entertainment', // Podcast discovery, listening history
    video: 'entertainment', // Video content recommendations and tracking
    // New Life Coaching Domains (Expansion)
    boundaries: 'lifestyle', // Boundary setting, people pleasing recovery
    'social-skills': 'lifestyle', // Adult friendship, conversation skills
    'body-relationship': 'lifestyle', // Body image healing, intuitive eating
    anger: 'lifestyle', // Anger management and healthy expression
    shame: 'lifestyle', // Understanding and healing from shame
    envy: 'lifestyle', // Understanding and transforming envy
    resentment: 'lifestyle', // Processing and releasing resentments
    caregiver: 'lifestyle', // Supporting caregivers
    divorce: 'lifestyle', // Navigating divorce
    'new-parent': 'lifestyle', // Parenthood transition
    'empty-nest': 'lifestyle', // Kids leaving home
    infidelity: 'lifestyle', // Betrayal recovery
    'health-diagnosis': 'lifestyle', // Chronic illness
    'job-loss': 'lifestyle', // Unemployment support
    sobriety: 'lifestyle', // Recovery support
    'sandwich-generation': 'lifestyle', // Multi-gen caregiving
    'blended-family': 'lifestyle', // Step-families
    'coming-out': 'lifestyle', // LGBTQ+ identity
    'faith-transition': 'lifestyle', // Spiritual changes
    dating: 'lifestyle', // Modern dating navigation
    neurodiversity: 'lifestyle', // ADHD, autism support
    'trauma-support': 'lifestyle', // Trauma-informed support
    procrastination: 'productivity', // Overcoming procrastination
    'digital-wellness': 'lifestyle', // Healthy tech relationship
    perfectionism: 'lifestyle', // Perfectionism and imposter syndrome
    intimacy: 'lifestyle', // Sexual wellness and intimacy
    'burnout-recovery': 'lifestyle', // Recovering from burnout
    'chronic-conditions': 'lifestyle', // Living well with chronic illness
    midlife: 'lifestyle', // Midlife transitions and aging
    'breakup-recovery': 'lifestyle', // Healing from relationship endings
    scheduling: 'communication', // Scheduled messages, calls, emails
    concierge: 'communication', // AI-powered outreach: hotels, restaurants, appointments
    travel: 'lifestyle', // Travel planning, flights, hotels
    settings: 'core', // User preferences: language, voice, session settings
    insights: 'core', // Analytics summaries, progress tracking, weekly reviews
    // Nayan's Superhuman Wisdom
    'nayan-wisdom': 'information', // Nayan's superhuman wisdom tools (paradox keeper, mortality perspective, etc.)
    'maya-coaching': 'lifestyle', // Maya's superhuman coaching tools (habit DNA, friction mapping, etc.)
    'superhuman-communication': 'communication', // Alex's 10 superhuman communication capabilities
    'jordan-planning': 'lifestyle', // Jordan's superhuman planning tools
    'peter-analytics': 'information', // Peter's superhuman analytics tools
    'local-search': 'information', // Local search for nearby restaurants, services, places
    // Developer Platform
    'developer-custom': 'core', // API-registered custom tools from Developer Platform
    // Life Automation Domains
    commerce: 'productivity', // Grocery ordering, subscription management
    documents: 'productivity', // Receipts, warranties, IDs, expiration tracking
    'email-intelligence': 'communication', // Email prioritization, follow-ups, unsubscribe
    'meal-planning': 'lifestyle', // Recipes, weekly plans, shopping lists
    projects: 'productivity', // Multi-task projects with templates
    'social-events': 'lifestyle', // Birthdays, anniversaries, gift tracking
    transportation: 'lifestyle', // Uber/Lyft rides, commute tracking
    vehicle: 'lifestyle', // Maintenance schedules, registration alerts
    workflows: 'productivity', // Custom automations, IFTTT-style triggers
    routines: 'lifestyle', // Ferni's care routines - "What I Do For You"
};
/**
 * Type guard to check if an object has the minimum Tool structure
 */
export function isTool(obj) {
    if (typeof obj !== 'object' || obj === null)
        return false;
    const tool = obj;
    return typeof tool.description === 'string' && typeof tool.execute === 'function';
}
/**
 * Assert that an object is a valid Tool, throwing if not
 */
export function assertTool(obj, name = 'tool') {
    if (!isTool(obj)) {
        throw new Error(`${name} must be a valid Tool with 'description' (string) and 'execute' (function)`);
    }
}
// ============================================================================
// VALIDATION
// ============================================================================
/**
 * Validate a tool definition
 */
export function validateToolDefinition(def) {
    const errors = [];
    if (!def.id) {
        errors.push('Tool ID is required');
    }
    else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(def.id)) {
        errors.push('Tool ID must be alphanumeric and start with a letter');
    }
    if (!def.name) {
        errors.push('Tool name is required');
    }
    if (!def.domain) {
        errors.push('Tool domain is required');
    }
    else if (!ALL_TOOL_DOMAINS.includes(def.domain)) {
        errors.push(`Invalid domain: ${def.domain}`);
    }
    if (!def.create || typeof def.create !== 'function') {
        errors.push('Tool create function is required');
    }
    return errors;
}
/**
 * Validate a tool set specification
 */
export function validateToolSetSpec(spec) {
    const errors = [];
    if (spec.domains) {
        for (const domain of spec.domains) {
            if (!ALL_TOOL_DOMAINS.includes(domain)) {
                errors.push(`Invalid domain in spec: ${domain}`);
            }
        }
    }
    // Check for conflicts
    if (spec.required && spec.forbidden) {
        const conflicts = spec.required.filter((id) => spec.forbidden?.includes(id));
        if (conflicts.length > 0) {
            errors.push(`Tools cannot be both required and forbidden: ${conflicts.join(', ')}`);
        }
    }
    return errors;
}
/**
 * Default service registry implementation (no services)
 */
export class EmptyServiceRegistry {
    has() {
        return false;
    }
    get(service) {
        throw new Error(`Service not available: ${service}`);
    }
    getOptional() {
        return undefined;
    }
}
/**
 * Environment-based service registry
 *
 * Checks environment variables to determine if services are available.
 * Use this instead of EmptyServiceRegistry to enable tools that require
 * external services like Twilio, Plaid, etc.
 */
export class EnvironmentServiceRegistry {
    serviceChecks = {
        twilio: () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        plaid: () => !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
        'google-calendar': () => !!process.env.GOOGLE_CALENDAR_CREDENTIALS,
        'google-contacts': () => !!process.env.GOOGLE_CONTACTS_CREDENTIALS,
        spotify: () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
        sonos: () => !!(process.env.SONOS_CLIENT_ID && process.env.SONOS_CLIENT_SECRET),
        sendgrid: () => !!process.env.SENDGRID_API_KEY,
        openweather: () => !!process.env.OPENWEATHER_API_KEY,
        newsapi: () => !!process.env.NEWS_API_KEY,
        'alpha-vantage': () => !!process.env.ALPHA_VANTAGE_API_KEY,
        finnhub: () => !!process.env.FINNHUB_API_KEY,
        firebase: () => !!process.env.GOOGLE_CLOUD_PROJECT,
        ecobee: () => !!process.env.ECOBEE_API_KEY,
    };
    has(service) {
        const check = this.serviceChecks[service];
        return check ? check() : false;
    }
    get(service) {
        if (!this.has(service)) {
            throw new Error(`Service not available: ${service}`);
        }
        // Services would be instantiated here in a full implementation
        throw new Error(`Service ${service} not implemented in get()`);
    }
    getOptional() {
        return undefined;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    ALL_TOOL_DOMAINS,
    DOMAIN_TO_CATEGORY,
    validateToolDefinition,
    validateToolSetSpec,
    EmptyServiceRegistry,
    EnvironmentServiceRegistry,
};
// CI trigger: 1765115360
//# sourceMappingURL=types.js.map