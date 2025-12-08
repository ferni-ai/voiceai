/**
 * Persona-Specific Learning
 *
 * Phase 5: Each persona learns and remembers differently
 *
 * Philosophy:
 * - Each persona has their own "memory" of the user
 * - Ferni (main coach) has the deepest knowledge
 * - Specialist personas (Maya, Peter, etc.) learn domain-specific things
 * - Transfer learning shares relevant insights between personas
 * - Relationship dynamics vary per persona
 *
 * PERSONAS:
 * - Ferni: Life coach, deep emotional understanding
 * - Jack: Sage mentor, wisdom and philosophy
 * - Peter: Research, analytical insights
 * - Alex: Communications, social dynamics
 * - Maya: Habits & routines, behavioral patterns
 * - Jordan: Events & planning, scheduling preferences
 * - Nayan: Premium partner, advanced synthesis
 */

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

export interface PersonaMemory {
  personaId: PersonaId;
  userId: string;

  // Interaction history with this persona
  interactions: {
    totalConversations: number;
    totalMinutes: number;
    lastInteraction: Date | null;
    firstInteraction: Date | null;
  };

  // What this persona has learned
  domainKnowledge: DomainKnowledge;

  // Relationship with this specific persona
  rapport: {
    comfortLevel: number; // 0-1
    trustLevel: number; // 0-1
    preferredTone: 'casual' | 'professional' | 'warm' | 'direct' | null;
    topicsDiscussed: string[];
    avoidedTopics: string[];
  };

  // Persona-specific observations
  observations: PersonaObservation[];

  // Transfer learning: what to share with other personas
  shareable: ShareableInsight[];

  lastUpdated: Date;
}

export type DomainKnowledge = Record<string, unknown>;

export interface PersonaObservation {
  id: string;
  date: Date;
  type: string;
  observation: string;
  confidence: number;
  sharedWithOthers: boolean;
}

export interface ShareableInsight {
  id: string;
  fromPersona: PersonaId;
  insightType: 'preference' | 'boundary' | 'pattern' | 'milestone' | 'context';
  summary: string;
  relevantPersonas: PersonaId[];
  createdAt: Date;
  expiresAt: Date | null;
}

// ============================================================================
// PERSONA DEFINITIONS
// ============================================================================

const PERSONA_DOMAINS: Record<
  PersonaId,
  {
    name: string;
    specialty: string;
    learnsAbout: string[];
    sharesInsights: PersonaId[];
    receivesFrom: PersonaId[];
  }
> = {
  ferni: {
    name: 'Ferni',
    specialty: 'Life coaching & emotional support',
    learnsAbout: ['emotions', 'life_goals', 'relationships', 'growth', 'challenges'],
    sharesInsights: ['jack', 'peter', 'alex', 'maya', 'jordan', 'nayan'],
    receivesFrom: ['jack', 'maya', 'alex'],
  },
  jack: {
    name: 'Jack',
    specialty: 'Wisdom & philosophical guidance',
    learnsAbout: ['values', 'beliefs', 'life_philosophy', 'decisions', 'meaning'],
    sharesInsights: ['ferni', 'nayan'],
    receivesFrom: ['ferni'],
  },
  peter: {
    name: 'Peter',
    specialty: 'Research & analytical thinking',
    learnsAbout: [
      'interests',
      'learning_style',
      'curiosities',
      'knowledge_gaps',
      'research_topics',
    ],
    sharesInsights: ['ferni', 'maya'],
    receivesFrom: ['ferni'],
  },
  alex: {
    name: 'Alex',
    specialty: 'Communications & social dynamics',
    learnsAbout: [
      'communication_style',
      'relationships',
      'social_challenges',
      'networking',
      'conflicts',
    ],
    sharesInsights: ['ferni', 'jordan'],
    receivesFrom: ['ferni', 'jordan'],
  },
  maya: {
    name: 'Maya',
    specialty: 'Habits & daily routines',
    learnsAbout: ['routines', 'habits', 'productivity', 'health', 'energy_patterns', 'sleep'],
    sharesInsights: ['ferni', 'jordan'],
    receivesFrom: ['ferni', 'peter'],
  },
  jordan: {
    name: 'Jordan',
    specialty: 'Events & planning',
    learnsAbout: ['schedule', 'commitments', 'events', 'deadlines', 'planning_style'],
    sharesInsights: ['ferni', 'maya', 'alex'],
    receivesFrom: ['ferni', 'maya', 'alex'],
  },
  nayan: {
    name: 'Nayan',
    specialty: 'Premium synthesis & advanced coaching',
    learnsAbout: ['everything'], // Nayan learns from all
    sharesInsights: ['ferni'],
    receivesFrom: ['ferni', 'jack', 'peter', 'alex', 'maya', 'jordan'],
  },
};

// ============================================================================
// STATE
// ============================================================================

const personaMemories = new Map<string, PersonaMemory>(); // key: `${userId}:${personaId}`

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

function getMemoryKey(userId: string, personaId: PersonaId): string {
  return `${userId}:${personaId}`;
}

function getOrCreateMemory(userId: string, personaId: PersonaId): PersonaMemory {
  const key = getMemoryKey(userId, personaId);
  let memory = personaMemories.get(key);

  if (!memory) {
    memory = {
      personaId,
      userId,
      interactions: {
        totalConversations: 0,
        totalMinutes: 0,
        lastInteraction: null,
        firstInteraction: null,
      },
      domainKnowledge: {},
      rapport: {
        comfortLevel: 0.3, // Start neutral
        trustLevel: 0.3,
        preferredTone: null,
        topicsDiscussed: [],
        avoidedTopics: [],
      },
      observations: [],
      shareable: [],
      lastUpdated: new Date(),
    };
    personaMemories.set(key, memory);
  }

  return memory;
}

export function getPersonaMemory(userId: string, personaId: PersonaId): PersonaMemory | null {
  return personaMemories.get(getMemoryKey(userId, personaId)) || null;
}

export function getAllPersonaMemories(userId: string): PersonaMemory[] {
  const memories: PersonaMemory[] = [];
  for (const personaId of Object.keys(PERSONA_DOMAINS) as PersonaId[]) {
    const memory = getPersonaMemory(userId, personaId);
    if (memory) {
      memories.push(memory);
    }
  }
  return memories;
}

// ============================================================================
// INTERACTION TRACKING
// ============================================================================

/**
 * Record a conversation with a specific persona
 */
export function recordPersonaInteraction(
  userId: string,
  personaId: PersonaId,
  durationMinutes: number,
  topicsDiscussed: string[]
): void {
  const memory = getOrCreateMemory(userId, personaId);

  // Update interaction stats
  memory.interactions.totalConversations += 1;
  memory.interactions.totalMinutes += durationMinutes;
  memory.interactions.lastInteraction = new Date();
  if (!memory.interactions.firstInteraction) {
    memory.interactions.firstInteraction = new Date();
  }

  // Track topics
  for (const topic of topicsDiscussed) {
    if (!memory.rapport.topicsDiscussed.includes(topic)) {
      memory.rapport.topicsDiscussed.push(topic);
    }
  }

  // Increase rapport with interaction
  memory.rapport.comfortLevel = Math.min(1, memory.rapport.comfortLevel + 0.02);
  memory.rapport.trustLevel = Math.min(1, memory.rapport.trustLevel + 0.01);

  memory.lastUpdated = new Date();
}

// ============================================================================
// DOMAIN-SPECIFIC LEARNING
// ============================================================================

/**
 * Learn domain-specific knowledge for a persona
 */
export function learnDomainKnowledge(
  userId: string,
  personaId: PersonaId,
  domain: string,
  knowledge: unknown
): void {
  const memory = getOrCreateMemory(userId, personaId);
  const personaDef = PERSONA_DOMAINS[personaId];

  // Only learn if it's relevant to this persona
  if (personaDef.learnsAbout.includes(domain) || personaDef.learnsAbout.includes('everything')) {
    memory.domainKnowledge[domain] = knowledge;
    memory.lastUpdated = new Date();
  }
}

/**
 * Get what a persona knows about a domain
 */
export function getPersonaDomainKnowledge(
  userId: string,
  personaId: PersonaId,
  domain: string
): unknown | null {
  const memory = getPersonaMemory(userId, personaId);
  return memory?.domainKnowledge[domain] || null;
}

// ============================================================================
// PERSONA-SPECIFIC OBSERVATIONS
// ============================================================================

/**
 * Record an observation from a persona's perspective
 */
export function recordPersonaObservation(
  userId: string,
  personaId: PersonaId,
  type: string,
  observation: string,
  confidence = 0.7
): PersonaObservation {
  const memory = getOrCreateMemory(userId, personaId);

  const obs: PersonaObservation = {
    id: `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    date: new Date(),
    type,
    observation,
    confidence,
    sharedWithOthers: false,
  };

  memory.observations.push(obs);

  // Keep only recent observations (last 100)
  if (memory.observations.length > 100) {
    memory.observations = memory.observations.slice(-100);
  }

  memory.lastUpdated = new Date();

  // Check if this should be shared
  if (confidence >= 0.7) {
    maybeCreateShareableInsight(userId, personaId, obs);
  }

  return obs;
}

/**
 * Get a persona's observations about the user
 */
export function getPersonaObservations(
  userId: string,
  personaId: PersonaId,
  type?: string
): PersonaObservation[] {
  const memory = getPersonaMemory(userId, personaId);
  if (!memory) return [];

  const { observations } = memory;
  if (type) {
    return observations.filter((o) => o.type === type);
  }
  return observations;
}

// ============================================================================
// TRANSFER LEARNING
// ============================================================================

/**
 * Create a shareable insight from an observation
 */
function maybeCreateShareableInsight(
  userId: string,
  fromPersonaId: PersonaId,
  observation: PersonaObservation
): void {
  const personaDef = PERSONA_DOMAINS[fromPersonaId];
  if (personaDef.sharesInsights.length === 0) return;

  // Map observation types to insight types
  const typeMap: Record<string, ShareableInsight['insightType']> = {
    preference: 'preference',
    boundary: 'boundary',
    pattern: 'pattern',
    growth: 'milestone',
    context: 'context',
  };

  const insightType = typeMap[observation.type] || 'context';

  const insight: ShareableInsight = {
    id: `insight_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fromPersona: fromPersonaId,
    insightType,
    summary: observation.observation,
    relevantPersonas: personaDef.sharesInsights,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  };

  // Add to originating persona's memory
  const memory = getOrCreateMemory(userId, fromPersonaId);
  memory.shareable.push(insight);
  observation.sharedWithOthers = true;

  // Share with relevant personas
  for (const targetPersonaId of personaDef.sharesInsights) {
    receiveSharedInsight(userId, targetPersonaId, insight);
  }
}

/**
 * Receive a shared insight from another persona
 */
function receiveSharedInsight(
  userId: string,
  personaId: PersonaId,
  insight: ShareableInsight
): void {
  const memory = getOrCreateMemory(userId, personaId);
  const personaDef = PERSONA_DOMAINS[personaId];

  // Only receive if this persona is configured to receive from the source
  if (!personaDef.receivesFrom.includes(insight.fromPersona)) return;

  // Avoid duplicates
  if (memory.shareable.some((s) => s.id === insight.id)) return;

  // Add with proper attribution
  memory.shareable.push({
    ...insight,
    relevantPersonas: [personaId], // Mark as received
  });
}

/**
 * Get insights shared with a persona
 */
export function getSharedInsights(userId: string, personaId: PersonaId): ShareableInsight[] {
  const memory = getPersonaMemory(userId, personaId);
  if (!memory) return [];

  const now = new Date();
  return memory.shareable.filter(
    (s) =>
      s.fromPersona !== personaId && // Not from self
      (!s.expiresAt || s.expiresAt > now) // Not expired
  );
}

// ============================================================================
// RAPPORT MANAGEMENT
// ============================================================================

/**
 * Update rapport with a persona based on interaction quality
 */
export function updatePersonaRapport(
  userId: string,
  personaId: PersonaId,
  update: {
    comfortDelta?: number;
    trustDelta?: number;
    preferredTone?: PersonaMemory['rapport']['preferredTone'];
    avoidTopic?: string;
  }
): void {
  const memory = getOrCreateMemory(userId, personaId);

  if (update.comfortDelta !== undefined) {
    memory.rapport.comfortLevel = Math.max(
      0,
      Math.min(1, memory.rapport.comfortLevel + update.comfortDelta)
    );
  }

  if (update.trustDelta !== undefined) {
    memory.rapport.trustLevel = Math.max(
      0,
      Math.min(1, memory.rapport.trustLevel + update.trustDelta)
    );
  }

  if (update.preferredTone) {
    memory.rapport.preferredTone = update.preferredTone;
  }

  if (update.avoidTopic && !memory.rapport.avoidedTopics.includes(update.avoidTopic)) {
    memory.rapport.avoidedTopics.push(update.avoidTopic);
  }

  memory.lastUpdated = new Date();
}

/**
 * Get the preferred communication style for a persona with this user
 */
export function getPersonaCommunicationStyle(
  userId: string,
  personaId: PersonaId
): {
  tone: string;
  formality: number;
  emoji: boolean;
  verbosity: 'concise' | 'moderate' | 'detailed';
} {
  const memory = getPersonaMemory(userId, personaId);

  // Default styles per persona
  const defaults: Record<
    PersonaId,
    {
      tone: string;
      formality: number;
      emoji: boolean;
      verbosity: 'concise' | 'moderate' | 'detailed';
    }
  > = {
    ferni: { tone: 'warm', formality: 0.3, emoji: true, verbosity: 'moderate' },
    jack: { tone: 'wise', formality: 0.5, emoji: false, verbosity: 'detailed' },
    peter: { tone: 'analytical', formality: 0.6, emoji: false, verbosity: 'detailed' },
    alex: { tone: 'friendly', formality: 0.3, emoji: true, verbosity: 'moderate' },
    maya: { tone: 'encouraging', formality: 0.3, emoji: true, verbosity: 'concise' },
    jordan: { tone: 'organized', formality: 0.4, emoji: true, verbosity: 'concise' },
    nayan: { tone: 'insightful', formality: 0.4, emoji: false, verbosity: 'moderate' },
  };

  const base = defaults[personaId];

  if (!memory) return base;

  // Adjust based on learned preferences
  return {
    tone: memory.rapport.preferredTone || base.tone,
    formality: memory.rapport.comfortLevel < 0.5 ? base.formality : base.formality * 0.7,
    emoji: base.emoji && memory.rapport.comfortLevel > 0.4,
    verbosity: base.verbosity,
  };
}

// ============================================================================
// CONTEXT FOR LLM
// ============================================================================

/**
 * Build context about the user for a specific persona
 */
export function buildPersonaContext(userId: string, personaId: PersonaId): string {
  const memory = getPersonaMemory(userId, personaId);
  const sharedInsights = getSharedInsights(userId, personaId);
  const personaDef = PERSONA_DOMAINS[personaId];

  const lines: string[] = [];

  lines.push(`## What ${personaDef.name} knows about this user\n`);

  // Relationship status
  if (memory) {
    lines.push(`### Our history`);
    lines.push(`- Conversations: ${memory.interactions.totalConversations}`);
    lines.push(`- Time together: ${Math.round(memory.interactions.totalMinutes)} minutes`);
    lines.push(`- Comfort level: ${Math.round(memory.rapport.comfortLevel * 100)}%`);
    lines.push(`- Trust level: ${Math.round(memory.rapport.trustLevel * 100)}%`);

    if (memory.rapport.preferredTone) {
      lines.push(`- They prefer a ${memory.rapport.preferredTone} tone with me`);
    }

    if (memory.rapport.avoidedTopics.length > 0) {
      lines.push(`- Topics to avoid: ${memory.rapport.avoidedTopics.join(', ')}`);
    }

    lines.push('');

    // Domain knowledge
    const domainKeys = Object.keys(memory.domainKnowledge);
    if (domainKeys.length > 0) {
      lines.push(`### What I've learned (${personaDef.specialty})`);
      for (const key of domainKeys) {
        const value = memory.domainKnowledge[key];
        if (typeof value === 'string') {
          lines.push(`- ${key}: ${value}`);
        } else if (Array.isArray(value)) {
          lines.push(`- ${key}: ${value.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Recent observations
    const recentObs = memory.observations.slice(-5);
    if (recentObs.length > 0) {
      lines.push(`### My recent observations`);
      for (const obs of recentObs) {
        lines.push(`- [${obs.type}] ${obs.observation}`);
      }
      lines.push('');
    }
  }

  // Shared insights from other personas
  if (sharedInsights.length > 0) {
    lines.push(`### What my colleagues shared with me`);
    for (const insight of sharedInsights.slice(-5)) {
      const sourceName = PERSONA_DOMAINS[insight.fromPersona].name;
      lines.push(`- From ${sourceName}: ${insight.summary}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Export all persona memories for a user
 */
export function exportPersonaMemories(userId: string): Record<PersonaId, unknown> {
  const result: Partial<Record<PersonaId, unknown>> = {};

  for (const personaId of Object.keys(PERSONA_DOMAINS) as PersonaId[]) {
    const memory = getPersonaMemory(userId, personaId);
    if (memory) {
      result[personaId] = {
        ...memory,
        interactions: {
          ...memory.interactions,
          lastInteraction: memory.interactions.lastInteraction?.toISOString(),
          firstInteraction: memory.interactions.firstInteraction?.toISOString(),
        },
        observations: memory.observations.map((o) => ({
          ...o,
          date: o.date.toISOString(),
        })),
        shareable: memory.shareable.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt?.toISOString(),
        })),
        lastUpdated: memory.lastUpdated.toISOString(),
      };
    }
  }

  return result as Record<PersonaId, unknown>;
}

/**
 * Import persona memories from Firestore
 */
export function importPersonaMemories(userId: string, data: Record<string, unknown>): void {
  for (const [personaId, memoryData] of Object.entries(data)) {
    if (!PERSONA_DOMAINS[personaId as PersonaId]) continue;

    const md = memoryData as Record<string, unknown>;
    const interactions = md.interactions as Record<string, unknown>;

    const memory: PersonaMemory = {
      personaId: personaId as PersonaId,
      userId,
      interactions: {
        totalConversations: (interactions?.totalConversations as number) || 0,
        totalMinutes: (interactions?.totalMinutes as number) || 0,
        lastInteraction: interactions?.lastInteraction
          ? new Date(interactions.lastInteraction as string)
          : null,
        firstInteraction: interactions?.firstInteraction
          ? new Date(interactions.firstInteraction as string)
          : null,
      },
      domainKnowledge: (md.domainKnowledge as DomainKnowledge) || {},
      rapport: (md.rapport as PersonaMemory['rapport']) || {
        comfortLevel: 0.3,
        trustLevel: 0.3,
        preferredTone: null,
        topicsDiscussed: [],
        avoidedTopics: [],
      },
      observations: ((md.observations as Array<Record<string, unknown>>) || []).map((o) => ({
        ...o,
        date: new Date(o.date as string),
      })) as PersonaObservation[],
      shareable: ((md.shareable as Array<Record<string, unknown>>) || []).map((s) => ({
        ...s,
        createdAt: new Date(s.createdAt as string),
        expiresAt: s.expiresAt ? new Date(s.expiresAt as string) : null,
      })) as ShareableInsight[],
      lastUpdated: md.lastUpdated ? new Date(md.lastUpdated as string) : new Date(),
    };

    personaMemories.set(getMemoryKey(userId, personaId as PersonaId), memory);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const personaLearning = {
  recordInteraction: recordPersonaInteraction,
  learnDomain: learnDomainKnowledge,
  getDomainKnowledge: getPersonaDomainKnowledge,
  recordObservation: recordPersonaObservation,
  getObservations: getPersonaObservations,
  getSharedInsights,
  updateRapport: updatePersonaRapport,
  getCommunicationStyle: getPersonaCommunicationStyle,
  buildContext: buildPersonaContext,
  getMemory: getPersonaMemory,
  getAllMemories: getAllPersonaMemories,
  exportMemories: exportPersonaMemories,
  importMemories: importPersonaMemories,
  PERSONA_DOMAINS,
};
