/**
 * Tools Domains - Registry-Based Exports
 *
 * Exports all domain tool definitions for the new registry-based system.
 * Each domain provides a getToolDefinitions() function that returns
 * ToolDefinition[] for registration with the tool registry.
 *
 * DOMAIN STRUCTURE:
 *   === FUNCTIONAL DOMAINS ===
 *   domains/memory/       - Memory and recall tools
 *   domains/productivity/ - Tasks, notes, routines, shopping
 *   domains/information/  - News, weather, sports, search
 *   domains/handoff/      - Team handoffs
 *   domains/calendar/     - Appointments, delivery, places, contacts
 *   domains/habits/       - Habit tracking, coaching, gamification
 *   domains/finance/      - Banking, calculators, personal finance
 *   domains/wellness/     - Emotional wellness, medications
 *   domains/wisdom/       - Quotes, principles, history
 *   domains/communication/ - Email, SMS, scheduling
 *   domains/research/     - Stock research, analysis
 *   domains/life-planning/ - Goals, milestones
 *   domains/entertainment/ - Music, media
 *   domains/telephony/    - Phone calls, callbacks
 *   domains/concierge/    - AI-powered outreach (hotels, restaurants, appointments, services)
 *
 *   === DEEP HUMAN ENGAGEMENT DOMAINS ===
 *   domains/relationships/ - Connection, conflict, nurturing relationships
 *   domains/meaning/       - Purpose, values, spirituality, existential
 *   domains/grief/         - Loss, transition, endings, transformation
 *   domains/stories/       - Life story, legacy, narrative identity
 *   domains/vulnerability/ - Shame, secrets, authenticity, self-forgiveness
 *   domains/curiosity/     - Wonder, questions, mystery, exploration
 *   domains/dreams/        - Aspirations, imagination, possibility
 *   domains/self-compassion/ - Inner critic, self-kindness, acceptance
 *   domains/play/          - Joy, fun, playfulness, lightness
 *   domains/presence/      - Grounding, mindfulness, savoring, flow
 *
 *   === LIFE COACHING DOMAINS (NEW) ===
 *   domains/crisis/        - Crisis support, grounding, safety planning
 *   domains/health/        - Exercise, nutrition, sleep, energy
 *   domains/career/        - Job search, interviews, professional development
 *   domains/decisions/     - Decision frameworks, analysis, values alignment
 *   domains/family/        - Parenting, family dynamics, elder care
 *   domains/home/          - Home maintenance, organization, moving
 *   domains/learning/      - Education, skill development, study planning
 *   domains/creativity/    - Hobbies, creative projects, artistic pursuits
 *   domains/community/     - Volunteering, giving, civic engagement
 *   domains/legal-admin/   - Documents, estate planning, insurance
 *   domains/second-chances/ - Fresh starts, reinvention, rebuilding
 *   domains/connection/     - Loneliness, friendship, belonging, community
 */

// ============================================================================
// NEW REGISTRY-BASED DOMAIN EXPORTS
// ============================================================================

// Memory domain - user memory, recall, relationships
export { getToolDefinitions as getMemoryToolDefinitions } from './memory/index.js';

// Productivity domain - tasks, notes, routines, shopping
export { getToolDefinitions as getProductivityToolDefinitions } from './productivity/index.js';

// Information domain - news, weather, sports, search
export { getToolDefinitions as getInformationToolDefinitions } from './information/index.js';

// Handoff domain - team coordination
export { getToolDefinitions as getHandoffToolDefinitions } from './handoff/index.js';

// Calendar domain - appointments, delivery, places, contacts
export { getToolDefinitions as getCalendarToolDefinitions } from './calendar/index.js';

// Habits domain - tracking, coaching, gamification
export { getToolDefinitions as getHabitsToolDefinitions } from './habits/index.js';

// Proactive domain - coaching, follow-ups, goal tracking
export { getToolDefinitions as getProactiveToolDefinitions } from './proactive/index.js';

// Finance domain - banking, calculators, personal finance
export { getToolDefinitions as getFinanceToolDefinitions } from './finance/index.js';

// Wellness domain - emotional wellness, medications
export { getToolDefinitions as getWellnessToolDefinitions } from './wellness/index.js';

// Wisdom domain - quotes, principles, history
export { getToolDefinitions as getWisdomToolDefinitions } from './wisdom/index.js';

// Communication domain - email, SMS, scheduling
export { getToolDefinitions as getCommunicationToolDefinitions } from './communication/index.js';

// Research domain - stock analysis, market data
export { getToolDefinitions as getResearchToolDefinitions } from './research/index.js';

// Life Planning domain - goals, milestones, events
export { getToolDefinitions as getLifePlanningToolDefinitions } from './life-planning/index.js';

// Entertainment domain - music, media
export { getToolDefinitions as getEntertainmentToolDefinitions } from './entertainment/index.js';

// Games domain - interactive music games
export { getToolDefinitions as getGamesToolDefinitions } from './games/index.js';

// Telephony domain - phone calls, callbacks
export { getToolDefinitions as getTelephonyToolDefinitions } from './telephony/index.js';

// Cameo domain - team member pop-in interactions
export { getToolDefinitions as getCameoToolDefinitions } from './cameo/index.js';

// Group Conversation domain - team roundtables, conference calls
export { getToolDefinitions as getGroupConversationToolDefinitions } from './group-conversation/index.js';

// Behavior domain - modes, pacing, processing, presence (bidirectional behavior system)
export { getToolDefinitions as getBehaviorToolDefinitions } from './behavior/index.js';

// ============================================================================
// DEEP HUMAN ENGAGEMENT DOMAINS
// ============================================================================

// Relationships domain - connection, conflict, nurturing
export { getToolDefinitions as getRelationshipsToolDefinitions } from './relationships/index.js';

// Meaning domain - purpose, values, spirituality, existential
export { getToolDefinitions as getMeaningToolDefinitions } from './meaning/index.js';

// Grief domain - loss, transition, endings, transformation
export { getToolDefinitions as getGriefToolDefinitions } from './grief/index.js';

// Stories domain - life story, legacy, narrative identity
export { getToolDefinitions as getStoriesToolDefinitions } from './stories/index.js';

// Vulnerability domain - shame, secrets, authenticity, self-forgiveness
export { getToolDefinitions as getVulnerabilityToolDefinitions } from './vulnerability/index.js';

// Curiosity domain - wonder, questions, mystery, exploration
export { getToolDefinitions as getCuriosityToolDefinitions } from './curiosity/index.js';

// Dreams domain - aspirations, imagination, possibility
export { getToolDefinitions as getDreamsToolDefinitions } from './dreams/index.js';

// Self-Compassion domain - inner critic, self-kindness, acceptance
export { getToolDefinitions as getSelfCompassionToolDefinitions } from './self-compassion/index.js';

// Play domain - joy, fun, playfulness, lightness
export { getToolDefinitions as getPlayToolDefinitions } from './play/index.js';

// Presence domain - grounding, mindfulness, savoring, flow
export { getToolDefinitions as getPresenceToolDefinitions } from './presence/index.js';

// Engagement domain - daily rituals, games, persona-specific activities
export { getToolDefinitions as getEngagementToolDefinitions } from './engagement/index.js';

// Awareness domain - time, context, environment awareness
export { getToolDefinitions as getAwarenessToolDefinitions } from './awareness/index.js';

// Simple Utilities domain - everyday helper tools (timers, conversions, quick math)
export { getToolDefinitions as getSimpleUtilitiesToolDefinitions } from './simple-utilities/index.js';

// ============================================================================
// LIFE COACHING DOMAINS (NEW)
// ============================================================================

// Crisis domain - crisis resources, grounding, safety planning
export { getToolDefinitions as getCrisisToolDefinitions } from './crisis/index.js';

// Health domain - exercise, nutrition, sleep, energy
export { getToolDefinitions as getHealthToolDefinitions } from './health/index.js';

// Career domain - job search, interviews, professional development
export { getToolDefinitions as getCareerToolDefinitions } from './career/index.js';

// Decisions domain - frameworks, analysis, values alignment
export { getToolDefinitions as getDecisionsToolDefinitions } from './decisions/index.js';

// Family domain - parenting, family dynamics, elder care
export { getToolDefinitions as getFamilyToolDefinitions } from './family/index.js';

// Home domain - maintenance, organization, moving
export { getToolDefinitions as getHomeToolDefinitions } from './home/index.js';

// Learning domain - education, skill development, study
export { getToolDefinitions as getLearningToolDefinitions } from './learning/index.js';

// Creativity domain - hobbies, creative projects, artistic pursuits
export { getToolDefinitions as getCreativityToolDefinitions } from './creativity/index.js';

// Community domain - volunteering, giving, civic engagement
export { getToolDefinitions as getCommunityToolDefinitions } from './community/index.js';

// Legal-Admin domain - documents, estate planning, insurance
export { getToolDefinitions as getLegalAdminToolDefinitions } from './legal-admin/index.js';

// Second Chances domain - fresh starts, reinvention, rebuilding after setbacks
export { getToolDefinitions as getSecondChancesToolDefinitions } from './second-chances/index.js';

// Connection domain - loneliness, friendship, belonging, community
export { getToolDefinitions as getConnectionToolDefinitions } from './connection/index.js';

// Difficult Conversations domain - preparing for and having hard conversations
export { getToolDefinitions as getDifficultConversationsToolDefinitions } from './difficult-conversations/index.js';

// Life Transitions domain - emotional journey through major life changes
export { getToolDefinitions as getLifeTransitionsToolDefinitions } from './life-transitions/index.js';

// Reflection Games domain - deep coaching games for self-discovery
export { getToolDefinitions as getReflectionGamesToolDefinitions } from './reflection-games/index.js';

// Quiet Growth domain - anti-hustle growth: rest, seasons, plateaus, sufficiency
export { getToolDefinitions as getQuietGrowthToolDefinitions } from './quiet-growth/index.js';

// Boundaries domain - setting and maintaining healthy boundaries
export { getToolDefinitions as getBoundariesToolDefinitions } from './boundaries/index.js';

// Social Skills domain - communication and social interaction
export { getToolDefinitions as getSocialSkillsToolDefinitions } from './social-skills/index.js';

// Anger Management domain - healthy anger expression and management
export { getToolDefinitions as getAngerToolDefinitions } from './anger/index.js';

// Procrastination domain - understanding and overcoming procrastination
export { getToolDefinitions as getProcrastinationToolDefinitions } from './procrastination/index.js';

// Burnout Recovery domain - recognizing and recovering from burnout
export { getToolDefinitions as getBurnoutRecoveryToolDefinitions } from './burnout-recovery/index.js';

// Perfectionism domain - healing from perfectionism and imposter syndrome
export { getToolDefinitions as getPerfectionismToolDefinitions } from './perfectionism/index.js';

// Digital Wellness domain - healthy relationship with technology
export { getToolDefinitions as getDigitalWellnessToolDefinitions } from './digital-wellness/index.js';

// Breakup Recovery domain - healing from heartbreak
export { getToolDefinitions as getBreakupRecoveryToolDefinitions } from './breakup-recovery/index.js';

// Body Relationship domain - healthy relationship with your body
export { getToolDefinitions as getBodyRelationshipToolDefinitions } from './body-relationship/index.js';

// Dating domain - navigating modern dating
export { getToolDefinitions as getDatingToolDefinitions } from './dating/index.js';

// Neurodiversity domain - support for ADHD, autism, and neurodivergent needs
export { getToolDefinitions as getNeurodiversityToolDefinitions } from './neurodiversity/index.js';

// Trauma Support domain - grounding and support for trauma responses
export { getToolDefinitions as getTraumaSupportToolDefinitions } from './trauma-support/index.js';

// Intimacy domain - building and maintaining intimate connection
export { getToolDefinitions as getIntimacyToolDefinitions } from './intimacy/index.js';

// Chronic Conditions domain - living well with chronic illness
export { getToolDefinitions as getChronicConditionsToolDefinitions } from './chronic-conditions/index.js';

// Midlife domain - navigating midlife transitions and meaning
export { getToolDefinitions as getMidlifeToolDefinitions } from './midlife/index.js';

// Scheduling domain - scheduled messages, calls, emails
export { getToolDefinitions as getSchedulingToolDefinitions } from './scheduling/index.js';

// Concierge domain - AI-powered outreach for hotels, restaurants, appointments, services
export { getToolDefinitions as getConciergeToolDefinitions } from './concierge/index.js';

// ============================================================================
// PERSONA-SPECIFIC "BETTER THAN HUMAN" DOMAINS
// ============================================================================

// Pattern Mastery domain (Peter John) - superhuman pattern recognition
export { getToolDefinitions as getPatternMasteryToolDefinitions } from './pattern-mastery/index.js';

// Workflow Mastery domain (Alex Chen) - superhuman organization and communication
export { getToolDefinitions as getWorkflowMasteryToolDefinitions } from './workflow-mastery/index.js';

// Milestone Mastery domain (Jordan Taylor) - superhuman celebration and event planning
export { getToolDefinitions as getMilestoneMasteryToolDefinitions } from './milestone-mastery/index.js';

// Habit Persistence domain (Maya Santos) - superhuman patience for behavior change
export { getToolDefinitions as getHabitPersistenceToolDefinitions } from './habit-persistence/index.js';

// Timeless Perspective domain (Nayan Patel) - superhuman long view and wisdom
export { getToolDefinitions as getTimelessPerspectiveToolDefinitions } from './timeless-perspective/index.js';

// ============================================================================
// DEVELOPER TOOLS DOMAIN
// ============================================================================

// Developer domain - CLI commands, file editing, bash
export { getToolDefinitions as getDeveloperToolDefinitions } from './developer/index.js';

// Marketing domain - social media management (Alex's dogfooding tools)
export { getToolDefinitions as getMarketingToolDefinitions } from './marketing/index.js';

// Referral domain - viral growth via voice calls
export { getToolDefinitions as getReferralToolDefinitions } from './referral/index.js';

// ============================================================================
// MEDIA DISCOVERY DOMAINS
// ============================================================================

// Podcasts domain - podcast discovery and recommendations
export { getToolDefinitions as getPodcastsToolDefinitions } from './podcasts/index.js';

// Video domain - YouTube video discovery
export { getToolDefinitions as getVideoToolDefinitions } from './video/index.js';

// Books domain - book discovery and reading lists
export { getToolDefinitions as getBooksToolDefinitions } from './books/index.js';

// ============================================================================
// LEGACY DOMAIN EXPORTS (for backwards compatibility)
// These will be deprecated once all consumers migrate to registry-based system
// ============================================================================

export * from './agent.js';
export * from './banking.js';
export * from './conversation/index.js';
export * from './personas.js';

// NOTE: financial.js, human-connection.js, entertainment.js, information.js, life-planning.js
// have been removed - use the registry-based domains instead:
// - finance/index.js instead of financial.js
// - connection/index.js instead of human-connection.js
// - entertainment/index.js instead of entertainment.js
// - information/index.js instead of information.js
// - life-planning/index.js instead of life-planning.js

// ============================================================================
// HELPER: Get all domain tool definitions
// ============================================================================

import type { ToolDefinition } from '../registry/types.js';

/**
 * Get all tool definitions from all migrated domains
 * Use this to register all domain tools with the registry at once
 */
export async function getAllDomainToolDefinitions(): Promise<ToolDefinition[]> {
  const results = await Promise.allSettled([
    // Functional domains
    import('./memory/index.js').then(async (m) => m.getToolDefinitions()),
    import('./productivity/index.js').then(async (m) => m.getToolDefinitions()),
    import('./information/index.js').then(async (m) => m.getToolDefinitions()),
    import('./handoff/index.js').then(async (m) => m.getToolDefinitions()),
    import('./calendar/index.js').then(async (m) => m.getToolDefinitions()),
    import('./habits/index.js').then(async (m) => m.getToolDefinitions()),
    import('./proactive/index.js').then(async (m) => m.getToolDefinitions()),
    import('./finance/index.js').then(async (m) => m.getToolDefinitions()),
    import('./wellness/index.js').then(async (m) => m.getToolDefinitions()),
    import('./wisdom/index.js').then(async (m) => m.getToolDefinitions()),
    import('./communication/index.js').then(async (m) => m.getToolDefinitions()),
    import('./research/index.js').then(async (m) => m.getToolDefinitions()),
    import('./life-planning/index.js').then(async (m) => m.getToolDefinitions()),
    import('./entertainment/index.js').then(async (m) => m.getToolDefinitions()),
    import('./games/index.js').then(async (m) => m.getToolDefinitions()),
    import('./telephony/index.js').then(async (m) => m.getToolDefinitions()),
    // Cameo domain - team member pop-ins
    import('./cameo/index.js').then(async (m) => m.getToolDefinitions()),
    // Group Conversation domain - team roundtables, conference calls
    import('./group-conversation/index.js').then(async (m) => m.getToolDefinitions()),
    // Deep human engagement domains
    import('./relationships/index.js').then(async (m) => m.getToolDefinitions()),
    import('./meaning/index.js').then(async (m) => m.getToolDefinitions()),
    import('./grief/index.js').then(async (m) => m.getToolDefinitions()),
    import('./stories/index.js').then(async (m) => m.getToolDefinitions()),
    import('./vulnerability/index.js').then(async (m) => m.getToolDefinitions()),
    import('./curiosity/index.js').then(async (m) => m.getToolDefinitions()),
    import('./dreams/index.js').then(async (m) => m.getToolDefinitions()),
    import('./self-compassion/index.js').then(async (m) => m.getToolDefinitions()),
    import('./play/index.js').then(async (m) => m.getToolDefinitions()),
    import('./presence/index.js').then(async (m) => m.getToolDefinitions()),
    // Engagement domain - daily rituals, games, persona activities
    import('./engagement/index.js').then(async (m) => m.getToolDefinitions()),
    // Awareness domain - time, context, environment
    import('./awareness/index.js').then(async (m) => m.getToolDefinitions()),
    // Simple Utilities domain - everyday helpers
    import('./simple-utilities/index.js').then(async (m) => m.getToolDefinitions()),
    // Life Coaching domains (NEW)
    import('./crisis/index.js').then(async (m) => m.getToolDefinitions()),
    import('./health/index.js').then(async (m) => m.getToolDefinitions()),
    import('./career/index.js').then(async (m) => m.getToolDefinitions()),
    import('./decisions/index.js').then(async (m) => m.getToolDefinitions()),
    import('./family/index.js').then(async (m) => m.getToolDefinitions()),
    import('./home/index.js').then(async (m) => m.getToolDefinitions()),
    import('./learning/index.js').then(async (m) => m.getToolDefinitions()),
    import('./creativity/index.js').then(async (m) => m.getToolDefinitions()),
    import('./community/index.js').then(async (m) => m.getToolDefinitions()),
    import('./legal-admin/index.js').then(async (m) => m.getToolDefinitions()),
    // Second Chances domain - fresh starts, reinvention, rebuilding
    import('./second-chances/index.js').then(async (m) => m.getToolDefinitions()),
    // Connection domain - loneliness, friendship, belonging
    import('./connection/index.js').then(async (m) => m.getToolDefinitions()),
    // Difficult Conversations domain - preparing for and having hard conversations
    import('./difficult-conversations/index.js').then(async (m) => m.getToolDefinitions()),
    // Life Transitions domain - emotional journey through major life changes
    import('./life-transitions/index.js').then(async (m) => m.getToolDefinitions()),
    // Note: reflection-games has a different export format and is loaded separately
    // Quiet Growth domain - anti-hustle growth: rest, seasons, plateaus
    import('./quiet-growth/index.js').then(async (m) => m.getToolDefinitions()),
    // NEW Life Coaching Expansion domains
    import('./boundaries/index.js').then(async (m) => m.getToolDefinitions()),
    import('./social-skills/index.js').then(async (m) => m.getToolDefinitions()),
    import('./anger/index.js').then(async (m) => m.getToolDefinitions()),
    import('./procrastination/index.js').then(async (m) => m.getToolDefinitions()),
    import('./burnout-recovery/index.js').then(async (m) => m.getToolDefinitions()),
    import('./perfectionism/index.js').then(async (m) => m.getToolDefinitions()),
    import('./digital-wellness/index.js').then(async (m) => m.getToolDefinitions()),
    import('./breakup-recovery/index.js').then(async (m) => m.getToolDefinitions()),
    import('./body-relationship/index.js').then(async (m) => m.getToolDefinitions()),
    import('./dating/index.js').then(async (m) => m.getToolDefinitions()),
    import('./neurodiversity/index.js').then(async (m) => m.getToolDefinitions()),
    import('./trauma-support/index.js').then(async (m) => m.getToolDefinitions()),
    import('./intimacy/index.js').then(async (m) => m.getToolDefinitions()),
    import('./chronic-conditions/index.js').then(async (m) => m.getToolDefinitions()),
    import('./midlife/index.js').then(async (m) => m.getToolDefinitions()),
    // Persona-specific "Better Than Human" domains
    import('./pattern-mastery/index.js').then(async (m) => m.getToolDefinitions()),
    import('./workflow-mastery/index.js').then(async (m) => m.getToolDefinitions()),
    import('./milestone-mastery/index.js').then(async (m) => m.getToolDefinitions()),
    import('./habit-persistence/index.js').then(async (m) => m.getToolDefinitions()),
    import('./timeless-perspective/index.js').then(async (m) => m.getToolDefinitions()),
    // Developer tools domain - CLI commands, file editing, bash
    import('./developer/index.js').then(async (m) => m.getToolDefinitions()),
    // Marketing domain - social media management (Alex's dogfooding tools)
    import('./marketing/index.js').then(async (m) => m.getToolDefinitions()),
    // Referral domain - viral growth via voice calls
    import('./referral/index.js').then(async (m) => m.getToolDefinitions()),
    // Media Discovery domains
    import('./podcasts/index.js').then(async (m) => m.getToolDefinitions()),
    import('./video/index.js').then(async (m) => m.getToolDefinitions()),
    import('./books/index.js').then(async (m) => m.getToolDefinitions()),
    // Scheduling domain - scheduled messages, calls, emails
    import('./scheduling/index.js').then(async (m) => m.getToolDefinitions()),
    // Concierge domain - AI-powered outreach for hotels, restaurants, appointments
    import('./concierge/index.js').then(async (m) => m.getToolDefinitions()),
  ]);

  // Collect successful results
  const allTools: ToolDefinition[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allTools.push(...result.value);
    }
  }

  return allTools;
}

/**
 * Domain metadata for documentation and UI
 */
export const DOMAIN_METADATA = {
  memory: {
    name: 'Memory',
    description: 'User memory, recall, and relationship tracking',
    icon: '🧠',
    status: 'active',
  },
  productivity: {
    name: 'Productivity',
    description: 'Tasks, notes, routines, and shopping lists',
    icon: '✅',
    status: 'active',
  },
  information: {
    name: 'Information',
    description: 'News, weather, sports, and web search',
    icon: '📰',
    status: 'active',
  },
  handoff: {
    name: 'Handoff',
    description: 'Team coordination and agent handoffs',
    icon: '🤝',
    status: 'active',
  },
  calendar: {
    name: 'Calendar',
    description: 'Appointments, reservations, and contacts',
    icon: '📅',
    status: 'active',
  },
  habits: {
    name: 'Habits',
    description: 'Habit tracking, coaching, and gamification',
    icon: '🎯',
    status: 'active',
  },
  proactive: {
    name: 'Proactive Coaching',
    description: 'Goal tracking, follow-ups, and coaching triggers',
    icon: '🚀',
    status: 'active',
  },
  finance: {
    name: 'Finance',
    description: 'Banking, calculators, and budgeting',
    icon: '💰',
    status: 'active',
  },
  wellness: {
    name: 'Wellness',
    description: 'Emotional wellness and medications',
    icon: '💚',
    status: 'active',
  },
  wisdom: {
    name: 'Wisdom',
    description: 'Quotes, principles, and historical perspective',
    icon: '📚',
    status: 'active',
  },
  communication: {
    name: 'Communication',
    description: 'Email, SMS, and messaging',
    icon: '✉️',
    status: 'active',
  },
  research: {
    name: 'Research',
    description: 'Stock research and company analysis',
    icon: '🔬',
    status: 'active',
  },
  'life-planning': {
    name: 'Life Planning',
    description: 'Goals, milestones, and life events',
    icon: '🗓️',
    status: 'active',
  },
  entertainment: {
    name: 'Entertainment',
    description: 'Music and media',
    icon: '🎵',
    status: 'active',
  },
  games: {
    name: 'Games',
    description: 'Interactive music games - Name That Tune, Desert Island Discs, etc.',
    icon: '🎮',
    status: 'active',
  },
  telephony: {
    name: 'Telephony',
    description: 'Phone calls and callbacks',
    icon: '📞',
    status: 'active',
  },
  cameo: {
    name: 'Team Cameos',
    description: 'Invite team members to briefly pop in and share quick insights',
    icon: '🎬',
    status: 'active',
  },
  // Deep Human Engagement Domains
  relationships: {
    name: 'Relationships',
    description: 'Connection, conflict resolution, and nurturing relationships',
    icon: '💞',
    status: 'active',
  },
  meaning: {
    name: 'Meaning & Spirituality',
    description: 'Purpose, values, spirituality, and existential exploration',
    icon: '✨',
    status: 'active',
  },
  grief: {
    name: 'Grief & Transition',
    description: 'Loss, endings, transitions, and transformation',
    icon: '🕊️',
    status: 'active',
  },
  stories: {
    name: 'Stories & Legacy',
    description: 'Life story, legacy building, and narrative identity',
    icon: '📖',
    status: 'active',
  },
  vulnerability: {
    name: 'Vulnerability & Authenticity',
    description: 'Shame resilience, secrets, authenticity, and self-forgiveness',
    icon: '💎',
    status: 'active',
  },
  curiosity: {
    name: 'Curiosity & Wonder',
    description: 'Wonder, questions, mystery, and intellectual exploration',
    icon: '🔮',
    status: 'active',
  },
  dreams: {
    name: 'Dreams & Imagination',
    description: 'Aspirations, imagination, and possibility',
    icon: '🌟',
    status: 'active',
  },
  'self-compassion': {
    name: 'Self-Compassion',
    description: 'Inner critic management, self-kindness, and acceptance',
    icon: '🤗',
    status: 'active',
  },
  play: {
    name: 'Play & Joy',
    description: 'Joy, fun, playfulness, and lightness',
    icon: '🎈',
    status: 'active',
  },
  presence: {
    name: 'Presence & Embodiment',
    description: 'Grounding, mindfulness, savoring, and flow',
    icon: '🧘',
    status: 'active',
  },
  engagement: {
    name: 'Engagement & Rituals',
    description: 'Daily rituals, persona games, team interactions, and streak tracking',
    icon: '🎮',
    status: 'active',
  },
  awareness: {
    name: 'Awareness & Context',
    description: 'Time awareness, environmental context, and situational understanding',
    icon: '👁️',
    status: 'active',
  },
  'simple-utilities': {
    name: 'Simple Utilities',
    description: 'Everyday helper tools: timers, tip calculator, unit conversions, timezone lookup',
    icon: '🛠️',
    status: 'active',
  },
  // Life Coaching Domains (NEW)
  crisis: {
    name: 'Crisis & Safety',
    description: 'Crisis resources, grounding exercises, safety planning, recovery support',
    icon: '🆘',
    status: 'active',
  },
  health: {
    name: 'Health & Fitness',
    description: 'Exercise tracking, nutrition coaching, sleep hygiene, energy management',
    icon: '💪',
    status: 'active',
  },
  career: {
    name: 'Career & Professional',
    description: 'Job search, interview prep, salary negotiation, career development',
    icon: '💼',
    status: 'active',
  },
  decisions: {
    name: 'Decision Support',
    description: 'Decision frameworks, pros/cons analysis, values alignment, risk assessment',
    icon: '🎯',
    status: 'active',
  },
  family: {
    name: 'Family & Parenting',
    description: 'Parenting coaching, family dynamics, elder care, traditions',
    icon: '👨‍👩‍👧‍👦',
    status: 'active',
  },
  home: {
    name: 'Home & Living',
    description: 'Home maintenance, organization, decluttering, moving, emergency prep',
    icon: '🏠',
    status: 'active',
  },
  learning: {
    name: 'Education & Learning',
    description: 'Learning goals, study planning, spaced repetition, knowledge testing',
    icon: '📚',
    status: 'active',
  },
  creativity: {
    name: 'Creativity & Hobbies',
    description: 'Creative projects, hobby exploration, artistic blocks, inspiration',
    icon: '🎨',
    status: 'active',
  },
  community: {
    name: 'Community & Impact',
    description: 'Volunteering, charitable giving, civic engagement, social impact',
    icon: '🤲',
    status: 'active',
  },
  'legal-admin': {
    name: 'Legal & Administrative',
    description: 'Document organization, estate planning, insurance review, tax prep',
    icon: '📋',
    status: 'active',
  },
  'second-chances': {
    name: 'Second Chances',
    description:
      'Fresh starts, reinvention, rebuilding after setbacks - because second chances are sacred',
    icon: '🌅',
    status: 'active',
  },
  connection: {
    name: 'Loneliness & Connection',
    description: 'Loneliness support, adult friendship, belonging, and community building',
    icon: '🤗',
    status: 'active',
  },
  'difficult-conversations': {
    name: 'Difficult Conversations',
    description: 'Preparing for, practicing, and recovering from hard conversations',
    icon: '💬',
    status: 'active',
  },
  'life-transitions': {
    name: 'Life Transitions',
    description: 'Emotional support for navigating major life changes and identity shifts',
    icon: '🦋',
    status: 'active',
  },
  'reflection-games': {
    name: 'Reflection Games',
    description:
      'Deep coaching games for self-discovery - Letters to Future Self, Values Auction, Rose/Thorn/Bud',
    icon: '🎯',
    status: 'active',
  },
  'quiet-growth': {
    name: 'Quiet Growth',
    description:
      'Anti-hustle growth: rest, seasons, plateaus, and sufficiency. Growth without comparison or urgency.',
    icon: '🌱',
    status: 'active',
  },
  // NEW Life Coaching Expansion Domains
  boundaries: {
    name: 'Boundaries',
    description: 'Setting and maintaining healthy boundaries in all relationships',
    icon: '🛡️',
    status: 'active',
  },
  'social-skills': {
    name: 'Social Skills',
    description: 'Communication, active listening, small talk, and social confidence',
    icon: '💬',
    status: 'active',
  },
  anger: {
    name: 'Anger Management',
    description: 'Healthy anger expression, triggers, and regulation strategies',
    icon: '🌋',
    status: 'active',
  },
  procrastination: {
    name: 'Procrastination',
    description: 'Understanding and overcoming procrastination patterns',
    icon: '⏰',
    status: 'active',
  },
  'burnout-recovery': {
    name: 'Burnout Recovery',
    description: 'Recognizing, recovering from, and preventing burnout',
    icon: '🔋',
    status: 'active',
  },
  perfectionism: {
    name: 'Perfectionism',
    description: 'Healing from perfectionism and imposter syndrome',
    icon: '✨',
    status: 'active',
  },
  'digital-wellness': {
    name: 'Digital Wellness',
    description: 'Healthy relationship with technology and social media',
    icon: '📱',
    status: 'active',
  },
  'breakup-recovery': {
    name: 'Breakup Recovery',
    description: 'Healing from heartbreak and rebuilding after relationships end',
    icon: '💔',
    status: 'active',
  },
  'body-relationship': {
    name: 'Body Relationship',
    description: 'Developing a healthier relationship with your body',
    icon: '🪞',
    status: 'active',
  },
  dating: {
    name: 'Dating',
    description: 'Navigating modern dating with intention and self-respect',
    icon: '💕',
    status: 'active',
  },
  neurodiversity: {
    name: 'Neurodiversity',
    description: 'Support for ADHD, autism, and neurodivergent needs',
    icon: '🧠',
    status: 'active',
  },
  'trauma-support': {
    name: 'Trauma Support',
    description: 'Grounding, regulation, and support for trauma responses',
    icon: '🌿',
    status: 'active',
  },
  intimacy: {
    name: 'Intimacy',
    description: 'Building and maintaining intimate connection in relationships',
    icon: '❤️',
    status: 'active',
  },
  'chronic-conditions': {
    name: 'Chronic Conditions',
    description: 'Living well with chronic illness, pain, or disability',
    icon: '🥄',
    status: 'active',
  },
  midlife: {
    name: 'Midlife',
    description: 'Navigating midlife transitions, meaning, and reinvention',
    icon: '🌅',
    status: 'active',
  },
  // Persona-specific "Better Than Human" Domains
  'pattern-mastery': {
    name: 'Pattern Mastery',
    description:
      "Peter John's specialty: superhuman pattern recognition, cross-domain connections, and data insights",
    icon: '🔬',
    status: 'active',
  },
  'workflow-mastery': {
    name: 'Workflow Mastery',
    description:
      "Alex Chen's specialty: superhuman organization, communication clarity, and calendar optimization",
    icon: '📋',
    status: 'active',
  },
  'milestone-mastery': {
    name: 'Milestone Mastery',
    description:
      "Jordan Taylor's specialty: superhuman celebration, event anticipation, and life milestone navigation",
    icon: '🎉',
    status: 'active',
  },
  'habit-persistence': {
    name: 'Habit Persistence',
    description:
      "Maya Santos's specialty: superhuman patience for behavior change, compassionate coaching, and gentle accountability",
    icon: '🌿',
    status: 'active',
  },
  'timeless-perspective': {
    name: 'Timeless Perspective',
    description:
      "Nayan Patel's specialty: superhuman patience, wisdom across decades, and the long view that transcends current struggles",
    icon: '🏔️',
    status: 'active',
  },
  // Developer Tools Domain
  developer: {
    name: 'Developer Tools',
    description:
      'Voice-driven development: Ferni CLI commands, file editing, bash, and code search',
    icon: '💻',
    status: 'active',
  },
  marketing: {
    name: 'Marketing & Social Media',
    description:
      "Alex's marketing tools: social content generation, Twitter/X posting, LinkedIn publishing, analytics",
    icon: '📣',
    status: 'active',
  },
  referral: {
    name: 'Voice Referrals',
    description:
      'Viral growth via voice calls - Ferni personally calls friends to introduce herself',
    icon: '📞',
    status: 'active',
  },
  // Media Discovery Domains
  podcasts: {
    name: 'Podcasts',
    description: 'Podcast discovery, search, and recommendations via iTunes',
    icon: '🎙️',
    status: 'active',
  },
  video: {
    name: 'Video',
    description: 'YouTube video discovery, search, and trending content',
    icon: '📺',
    status: 'active',
  },
  books: {
    name: 'Books',
    description: 'Book discovery, reading lists, and progress tracking via Google Books',
    icon: '📖',
    status: 'active',
  },
  scheduling: {
    name: 'Scheduling',
    description: 'Schedule text messages, phone calls, and emails for later delivery',
    icon: '📲',
    status: 'active',
  },
  concierge: {
    name: 'AI Concierge',
    description:
      'AI-powered outreach: hotel quotes, restaurant reservations, healthcare appointments, service provider quotes',
    icon: '🛎️',
    status: 'active',
  },
} as const;
