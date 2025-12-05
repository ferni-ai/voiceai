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

// Telephony domain - phone calls, callbacks
export { getToolDefinitions as getTelephonyToolDefinitions } from './telephony/index.js';

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

// ============================================================================
// LEGACY DOMAIN EXPORTS (for backwards compatibility)
// These will be deprecated once all consumers migrate to registry-based system
// ============================================================================

export * from './financial.js';
export * from './human-connection.js';
export * from './conversation.js';
export * from './banking.js';
export * from './agent.js';
export * from './personas.js';

// NOTE: communication.js, information.js, entertainment.js, life-planning.js
// are being replaced by the registry-based domains above

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
    import('./telephony/index.js').then(async (m) => m.getToolDefinitions()),
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
  telephony: {
    name: 'Telephony',
    description: 'Phone calls and callbacks',
    icon: '📞',
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
} as const;
