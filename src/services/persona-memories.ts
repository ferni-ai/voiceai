/**
 * Persona Memories Service
 *
 * Each persona remembers things naturally, like a friend would:
 *
 * Ferni (Life Coach): Your preferences, wins, favorite topics
 * Jack Bogle: Your investing philosophy, funds discussed
 * Peter John: Stocks researched, companies you know, watchlist
 * Maya: Merchants, bills, savings goals, spending patterns
 * Jordan: Important dates, venues, vendors, dream plans
 * Alex: Contacts (separate service), communication preferences
 *
 * Designed to feel human, not database-like:
 * - "Remember I like Vanguard funds"
 * - "Peter, add Apple to my watchlist"
 * - "Maya, I always overspend at Target"
 * - "Jordan, my anniversary is June 15th"
 *
 * PERSISTENCE: Memories are stored in UserProfile.personaMemories and
 * persist across sessions via Firestore/PostgreSQL.
 */

import { getDefaultStore } from '../memory/index.js';
import type { UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId =
  | 'jack-b'
  | 'nayan-patel'
  | 'peter-john'
  | 'spend-save'
  | 'event-planner'
  | 'comm-specialist';

// Map persona IDs to profile field names
const PERSONA_FIELD_MAP: Record<PersonaId, keyof NonNullable<UserProfile['personaMemories']>> = {
  'jack-b': 'jackie',
  'nayan-patel': 'bogle',
  'peter-john': 'peter',
  'spend-save': 'maya',
  'event-planner': 'jordan',
  'comm-specialist': 'alex',
};

/**
 * Base type for persona memory entries stored in UserProfile
 * All persona memory arrays share this structure
 */
interface BasePersonaMemoryEntry {
  id: string;
  type: string;
  name: string;
  details?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  tags: string[];
  notes?: string;
  createdAt: Date;
  timesReferenced: number;
}

export interface Memory {
  id: string;
  userId: string;
  personaId: PersonaId;

  // What's being remembered
  type: string; // Persona-specific types
  name: string; // Display name
  details?: string;

  // User sentiment
  sentiment?: 'positive' | 'negative' | 'neutral' | 'watchful';

  // Metadata
  tags: string[];
  notes?: string;

  // Tracking
  timesReferenced: number;
  lastReferencedAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// JACKIE (COACH) MEMORIES
// ============================================================================

export interface FerniMemory extends Memory {
  personaId: 'jack-b';
  type: 'preference' | 'win' | 'topic' | 'style' | 'music' | 'inside_joke';
}

// ============================================================================
// JACK BOGLE MEMORIES
// ============================================================================

export interface BogleMemory extends Memory {
  personaId: 'nayan-patel';
  type: 'fund' | 'philosophy' | 'allocation' | 'wisdom' | 'avoid';

  // Fund-specific
  ticker?: string;
  expenseRatio?: number;
  category?: 'index' | 'bond' | 'international' | 'balanced' | 'sector';
}

// ============================================================================
// PETER JOHN MEMORIES
// ============================================================================

export interface PeterMemory extends Memory {
  personaId: 'peter-john';
  type: 'stock' | 'company' | 'watchlist' | 'story' | 'ten_bagger' | 'avoid';

  // Stock-specific
  ticker?: string;
  sector?: string;
  reason?: string; // "I use their products", "local growth story", etc.
  priceWhenAdded?: number;
  targetPrice?: number;
}

// ============================================================================
// MAYA (SPEND & SAVE) MEMORIES
// ============================================================================

export interface MayaMemory extends Memory {
  personaId: 'spend-save';
  type: 'merchant' | 'bill' | 'subscription' | 'savings_goal' | 'trigger' | 'category' | 'win';

  // Merchant-specific
  merchantCategory?: string;
  averageSpend?: number;

  // Bill-specific
  dueDate?: number; // Day of month
  amount?: number;
  isAutoPay?: boolean;

  // Savings goal specific
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: Date;
}

// ============================================================================
// JORDAN (EVENT PLANNER) MEMORIES
// ============================================================================

export interface JordanMemory extends Memory {
  personaId: 'event-planner';
  type: 'date' | 'venue' | 'vendor' | 'destination' | 'milestone' | 'preference';

  // Date-specific
  date?: string; // "June 15" or "2024-06-15"
  recurring?: 'yearly' | 'monthly' | 'once';
  person?: string; // Whose birthday/anniversary

  // Venue/Vendor specific
  location?: string;
  contact?: string;
  priceRange?: string;
  rating?: number;
}

// ============================================================================
// ALEX (COMMUNICATIONS SPECIALIST) MEMORIES
// ============================================================================

export interface AlexMemory extends Memory {
  personaId: 'comm-specialist';
  type: 'communication_preference' | 'scheduling_note' | 'contact_note' | 'reminder_style';

  // Communication preference specific
  preferredChannel?: 'text' | 'call' | 'email' | 'in-person';
  preferredTime?: string; // "morning" | "afternoon" | "evening"

  // Scheduling specific
  recurring?: boolean;
  availability?: string;

  // Contact specific
  contactName?: string;
  relationship?: string;
}

// ============================================================================
// STORAGE - Uses persistent UserProfile.personaMemories
// ============================================================================

// In-memory cache for current session (synced to DB on save)
const memoriesCache = new Map<string, Memory>();
const dirtyUsers = new Set<string>();
const loadedUsers = new Set<string>();

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Load memories from user profile into cache
 */
async function loadMemoriesForUser(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    if (!profile?.personaMemories) {
      loadedUsers.add(userId);
      return;
    }

    // Load each persona's memories into cache
    for (const [personaKey, memories] of Object.entries(profile.personaMemories)) {
      if (!memories) continue;

      const personaId = Object.entries(PERSONA_FIELD_MAP).find(
        ([, v]) => v === personaKey
      )?.[0] as PersonaId;
      if (!personaId) continue;

      for (const mem of memories) {
        const memory: Memory = {
          id: mem.id,
          userId,
          personaId,
          type: mem.type,
          name: mem.name,
          details: (mem as { details?: string }).details,
          sentiment: (mem as { sentiment?: Memory['sentiment'] }).sentiment,
          tags: mem.tags || [],
          notes: (mem as { notes?: string }).notes,
          timesReferenced: mem.timesReferenced || 0,
          createdAt: new Date(mem.createdAt),
          updatedAt: new Date(mem.createdAt),
        };
        memoriesCache.set(mem.id, memory);
      }
    }

    loadedUsers.add(userId);
    getLogger().debug(
      { userId, count: memoriesCache.size },
      'Loaded persona memories from profile'
    );
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load persona memories');
    loadedUsers.add(userId); // Mark as loaded to prevent repeated failures
  }
}

/**
 * Save memories back to user profile
 */
export async function saveMemoriesForUser(userId: string): Promise<void> {
  if (!dirtyUsers.has(userId)) return;

  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);
    if (!profile) return;

    const userMemories = Array.from(memoriesCache.values()).filter((m) => m.userId === userId);

    // Organize by persona
    const personaMemories: NonNullable<UserProfile['personaMemories']> = {};

    for (const mem of userMemories) {
      const field = PERSONA_FIELD_MAP[mem.personaId];
      if (!field) continue;

      if (!personaMemories[field]) {
        personaMemories[field] = [];
      }

      // Build memory entry conforming to base persona memory structure
      const memoryEntry: BasePersonaMemoryEntry = {
        id: mem.id,
        type: mem.type,
        name: mem.name,
        details: mem.details,
        sentiment: mem.sentiment === 'watchful' ? 'neutral' : mem.sentiment,
        tags: mem.tags,
        notes: mem.notes,
        createdAt: mem.createdAt,
        timesReferenced: mem.timesReferenced,
      };

      // Push to the appropriate persona array
      // Type assertion needed because field is computed at runtime
      (personaMemories[field] as BasePersonaMemoryEntry[]).push(memoryEntry);
    }

    profile.personaMemories = personaMemories;
    profile.updatedAt = new Date();
    await store.saveProfile(profile);

    dirtyUsers.delete(userId);
    getLogger().info({ userId, count: userMemories.length }, '🧠 Persona memories saved');
  } catch (error) {
    getLogger().error({ error, userId }, 'Failed to save persona memories');
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Remember something for a persona (persists to UserProfile)
 */
export async function remember<T extends Memory>(
  userId: string,
  personaId: PersonaId,
  data: Omit<T, 'id' | 'userId' | 'personaId' | 'timesReferenced' | 'createdAt' | 'updatedAt'>
): Promise<T> {
  await loadMemoriesForUser(userId);

  const id = generateId();

  const memory: Memory = {
    id,
    userId,
    personaId,
    type: data.type,
    name: data.name,
    details: data.details,
    sentiment: data.sentiment,
    tags: data.tags || [],
    notes: data.notes,
    timesReferenced: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(data as object),
  };

  memoriesCache.set(id, memory);
  dirtyUsers.add(userId);

  // Save immediately
  await saveMemoriesForUser(userId);

  getLogger().info(
    {
      id,
      personaId,
      type: data.type,
      name: data.name,
    },
    '🧠 Memory saved'
  );

  return memory as T;
}

/**
 * Recall memories for a persona
 */
export async function recall(
  userId: string,
  personaId: PersonaId,
  options?: {
    type?: string;
    sentiment?: Memory['sentiment'];
    tags?: string[];
    search?: string;
    limit?: number;
  }
): Promise<Memory[]> {
  await loadMemoriesForUser(userId);

  let memories = Array.from(memoriesCache.values()).filter(
    (m) => m.userId === userId && m.personaId === personaId
  );

  if (options?.type) {
    memories = memories.filter((m) => m.type === options.type);
  }

  if (options?.sentiment) {
    memories = memories.filter((m) => m.sentiment === options.sentiment);
  }

  if (options?.tags?.length) {
    const { tags } = options; // Store for closure - already checked for existence
    memories = memories.filter((m) => tags.some((tag) => m.tags.includes(tag.toLowerCase())));
  }

  if (options?.search) {
    const searchLower = options.search.toLowerCase();
    memories = memories.filter(
      (m) =>
        m.name.toLowerCase().includes(searchLower) ||
        m.details?.toLowerCase().includes(searchLower) ||
        m.tags.some((t) => t.includes(searchLower))
    );
  }

  // Sort by relevance (most referenced, most recent)
  memories.sort((a, b) => {
    // Prioritize frequently referenced
    if (b.timesReferenced !== a.timesReferenced) {
      return b.timesReferenced - a.timesReferenced;
    }
    // Then by recency
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  if (options?.limit) {
    memories = memories.slice(0, options.limit);
  }

  return memories;
}

/**
 * Find a specific memory
 */
export async function findMemory(
  userId: string,
  personaId: PersonaId,
  nameOrTicker: string
): Promise<Memory | null> {
  await loadMemoriesForUser(userId);

  const searchLower = nameOrTicker.toLowerCase();

  return (
    Array.from(memoriesCache.values()).find(
      (m) =>
        m.userId === userId &&
        m.personaId === personaId &&
        (m.name.toLowerCase() === searchLower ||
          (m as PeterMemory).ticker?.toLowerCase() === searchLower ||
          (m as BogleMemory).ticker?.toLowerCase() === searchLower)
    ) || null
  );
}

/**
 * Update a memory
 */
export async function updateMemory(
  memoryId: string,
  updates: Partial<Memory>
): Promise<Memory | null> {
  const memory = memoriesCache.get(memoryId);
  if (!memory) return null;

  Object.assign(memory, updates, { updatedAt: new Date() });
  memoriesCache.set(memoryId, memory);
  dirtyUsers.add(memory.userId);

  await saveMemoriesForUser(memory.userId);

  return memory;
}

/**
 * Mark a memory as referenced (used in conversation)
 */
export async function touchMemory(memoryId: string): Promise<void> {
  const memory = memoriesCache.get(memoryId);
  if (memory) {
    memory.timesReferenced++;
    memory.lastReferencedAt = new Date();
    memoriesCache.set(memoryId, memory);
    dirtyUsers.add(memory.userId);
    // Don't save immediately for touch - batch with other saves
  }
}

/**
 * Forget a memory
 */
export async function forget(memoryId: string): Promise<boolean> {
  const memory = memoriesCache.get(memoryId);
  if (memory) {
    dirtyUsers.add(memory.userId);
    memoriesCache.delete(memoryId);
    await saveMemoriesForUser(memory.userId);
    return true;
  }
  return false;
}

/**
 * Get all memories for a user across all personas
 */
export async function getAllUserMemories(userId: string): Promise<Memory[]> {
  await loadMemoriesForUser(userId);
  return Array.from(memoriesCache.values()).filter((m) => m.userId === userId);
}

// ============================================================================
// PERSONA-SPECIFIC HELPERS
// ============================================================================

// ----- Ferni (Life Coach) -----

export async function rememberPreference(
  userId: string,
  name: string,
  details?: string
): Promise<FerniMemory> {
  return remember<FerniMemory>(userId, 'jack-b', {
    type: 'preference',
    name,
    details,
    sentiment: 'positive',
    tags: ['preference'],
  });
}

export async function rememberWin(
  userId: string,
  win: string,
  details?: string
): Promise<FerniMemory> {
  return remember<FerniMemory>(userId, 'jack-b', {
    type: 'win',
    name: win,
    details,
    sentiment: 'positive',
    tags: ['win', 'celebration'],
  });
}

export async function getFerniMemories(userId: string): Promise<FerniMemory[]> {
  return (await recall(userId, 'jack-b')) as FerniMemory[];
}

// ----- Jack Bogle (Index Investing) -----

export async function rememberFund(
  userId: string,
  name: string,
  options?: {
    ticker?: string;
    category?: BogleMemory['category'];
    expenseRatio?: number;
    sentiment?: Memory['sentiment'];
  }
): Promise<BogleMemory> {
  return remember<BogleMemory>(userId, 'nayan-patel', {
    type: 'fund',
    name,
    ticker: options?.ticker,
    category: options?.category,
    expenseRatio: options?.expenseRatio,
    sentiment: options?.sentiment || 'positive',
    tags: ['fund', options?.category || 'index'].filter(Boolean) as string[],
  });
}

export async function rememberInvestingPhilosophy(
  userId: string,
  philosophy: string
): Promise<BogleMemory> {
  return remember<BogleMemory>(userId, 'nayan-patel', {
    type: 'philosophy',
    name: philosophy,
    sentiment: 'positive',
    tags: ['philosophy', 'wisdom'],
  });
}

export async function getBogleMemories(
  userId: string,
  type?: BogleMemory['type']
): Promise<BogleMemory[]> {
  return (await recall(userId, 'nayan-patel', { type })) as BogleMemory[];
}

// ----- Peter John (Stock Picking) -----

export async function addToWatchlist(
  userId: string,
  name: string,
  options?: { ticker?: string; sector?: string; reason?: string; price?: number }
): Promise<PeterMemory> {
  return remember<PeterMemory>(userId, 'peter-john', {
    type: 'watchlist',
    name,
    ticker: options?.ticker,
    sector: options?.sector,
    reason: options?.reason,
    priceWhenAdded: options?.price,
    sentiment: 'watchful',
    tags: ['watchlist', options?.sector || ''].filter(Boolean) as string[],
  });
}

export async function rememberCompany(
  userId: string,
  name: string,
  options?: { ticker?: string; reason?: string; sentiment?: Memory['sentiment'] }
): Promise<PeterMemory> {
  return remember<PeterMemory>(userId, 'peter-john', {
    type: 'company',
    name,
    ticker: options?.ticker,
    reason: options?.reason,
    sentiment: options?.sentiment || 'positive',
    tags: ['company', 'invest-what-you-know'],
  });
}

export async function markAsTenBagger(memoryId: string): Promise<PeterMemory | null> {
  return (await updateMemory(memoryId, {
    type: 'ten_bagger',
    sentiment: 'positive',
    tags: ['ten_bagger', 'winner'],
  })) as PeterMemory;
}

export async function getWatchlist(userId: string): Promise<PeterMemory[]> {
  return (await recall(userId, 'peter-john', { type: 'watchlist' })) as PeterMemory[];
}

export async function getPeterMemories(
  userId: string,
  type?: PeterMemory['type']
): Promise<PeterMemory[]> {
  return (await recall(userId, 'peter-john', { type })) as PeterMemory[];
}

// ----- Maya (Spend & Save) -----

export async function rememberMerchant(
  userId: string,
  name: string,
  options?: {
    category?: string;
    sentiment?: Memory['sentiment'];
    averageSpend?: number;
    notes?: string;
  }
): Promise<MayaMemory> {
  return remember<MayaMemory>(userId, 'spend-save', {
    type: 'merchant',
    name,
    merchantCategory: options?.category,
    averageSpend: options?.averageSpend,
    sentiment: options?.sentiment || 'neutral',
    notes: options?.notes,
    tags: ['merchant', options?.category || ''].filter(Boolean) as string[],
  });
}

export async function rememberBill(
  userId: string,
  name: string,
  options?: { amount?: number; dueDate?: number; isAutoPay?: boolean }
): Promise<MayaMemory> {
  return remember<MayaMemory>(userId, 'spend-save', {
    type: 'bill',
    name,
    amount: options?.amount,
    dueDate: options?.dueDate,
    isAutoPay: options?.isAutoPay,
    sentiment: 'neutral',
    tags: ['bill', 'recurring'],
  });
}

export async function rememberSavingsGoal(
  userId: string,
  name: string,
  options?: { targetAmount?: number; targetDate?: Date; currentAmount?: number }
): Promise<MayaMemory> {
  return remember<MayaMemory>(userId, 'spend-save', {
    type: 'savings_goal',
    name,
    targetAmount: options?.targetAmount,
    targetDate: options?.targetDate,
    currentAmount: options?.currentAmount || 0,
    sentiment: 'positive',
    tags: ['savings', 'goal'],
  });
}

export async function rememberSpendingTrigger(
  userId: string,
  trigger: string,
  notes?: string
): Promise<MayaMemory> {
  return remember<MayaMemory>(userId, 'spend-save', {
    type: 'trigger',
    name: trigger,
    notes,
    sentiment: 'negative',
    tags: ['trigger', 'awareness'],
  });
}

export async function getMayaMemories(
  userId: string,
  type?: MayaMemory['type']
): Promise<MayaMemory[]> {
  return (await recall(userId, 'spend-save', { type })) as MayaMemory[];
}

// ----- Jordan (Event Planner) -----

export async function rememberDate(
  userId: string,
  name: string,
  options: { date: string; person?: string; recurring?: JordanMemory['recurring'] }
): Promise<JordanMemory> {
  return remember<JordanMemory>(userId, 'event-planner', {
    type: 'date',
    name,
    date: options.date,
    person: options.person,
    recurring: options.recurring || 'yearly',
    sentiment: 'positive',
    tags: ['date', 'important', options.recurring || 'yearly'],
  });
}

export async function rememberVenue(
  userId: string,
  name: string,
  options?: {
    location?: string;
    priceRange?: string;
    rating?: number;
    sentiment?: Memory['sentiment'];
    notes?: string;
  }
): Promise<JordanMemory> {
  return remember<JordanMemory>(userId, 'event-planner', {
    type: 'venue',
    name,
    location: options?.location,
    priceRange: options?.priceRange,
    rating: options?.rating,
    sentiment: options?.sentiment || 'positive',
    notes: options?.notes,
    tags: ['venue', options?.priceRange || ''].filter(Boolean) as string[],
  });
}

export async function rememberDestination(
  userId: string,
  name: string,
  options?: { notes?: string; sentiment?: Memory['sentiment'] }
): Promise<JordanMemory> {
  return remember<JordanMemory>(userId, 'event-planner', {
    type: 'destination',
    name,
    notes: options?.notes,
    sentiment: options?.sentiment || 'positive',
    tags: ['destination', 'dream', 'travel'],
  });
}

export async function getImportantDates(userId: string): Promise<JordanMemory[]> {
  return (await recall(userId, 'event-planner', { type: 'date' })) as JordanMemory[];
}

export async function getJordanMemories(
  userId: string,
  type?: JordanMemory['type']
): Promise<JordanMemory[]> {
  return (await recall(userId, 'event-planner', { type })) as JordanMemory[];
}

/**
 * Get Alex's memories (communication preferences, scheduling notes)
 */
export async function getAlexMemories(
  userId: string,
  type?: AlexMemory['type']
): Promise<AlexMemory[]> {
  return (await recall(userId, 'comm-specialist', { type })) as AlexMemory[];
}

// ============================================================================
// FORMATTING
// ============================================================================

export function formatMemoryForSpeech(memory: Memory): string {
  let result = memory.name;

  if (memory.details) {
    result += ` - ${memory.details}`;
  }

  // Add persona-specific details
  switch (memory.personaId) {
    case 'peter-john': {
      const pm = memory as PeterMemory;
      if (pm.ticker) result = `${pm.ticker} (${pm.name})`;
      if (pm.reason) result += ` - ${pm.reason}`;
      break;
    }
    case 'nayan-patel': {
      const bm = memory as BogleMemory;
      if (bm.ticker) result = `${bm.ticker} (${bm.name})`;
      if (bm.expenseRatio) result += ` - ${bm.expenseRatio}% expense ratio`;
      break;
    }
    case 'spend-save': {
      const mm = memory as MayaMemory;
      if (mm.amount) result += ` - $${mm.amount}`;
      if (mm.targetAmount) result += ` (goal: $${mm.targetAmount})`;
      break;
    }
    case 'event-planner': {
      const jm = memory as JordanMemory;
      if (jm.date) result += ` - ${jm.date}`;
      if (jm.person) result += ` (${jm.person})`;
      break;
    }
    case 'comm-specialist': {
      const am = memory as AlexMemory;
      if (am.preferredChannel) result += ` - prefers ${am.preferredChannel}`;
      if (am.preferredTime) result += ` (${am.preferredTime})`;
      if (am.contactName) result += ` - re: ${am.contactName}`;
      break;
    }
  }

  // Sentiment indicators
  if (memory.sentiment === 'negative') {
    result += ' ⚠️';
  } else if (memory.sentiment === 'positive') {
    result += ' ✨';
  } else if (memory.sentiment === 'watchful') {
    result += ' 👀';
  }

  return result;
}

export default {
  remember,
  recall,
  findMemory,
  updateMemory,
  touchMemory,
  forget,
  getAllUserMemories,
  // Ferni
  rememberPreference,
  rememberWin,
  getFerniMemories,
  // Bogle
  rememberFund,
  rememberInvestingPhilosophy,
  getBogleMemories,
  // Peter
  addToWatchlist,
  rememberCompany,
  markAsTenBagger,
  getWatchlist,
  getPeterMemories,
  // Maya
  rememberMerchant,
  rememberBill,
  rememberSavingsGoal,
  rememberSpendingTrigger,
  getMayaMemories,
  // Jordan
  rememberDate,
  rememberVenue,
  rememberDestination,
  getImportantDates,
  getJordanMemories,
  // Formatting
  formatMemoryForSpeech,
};
