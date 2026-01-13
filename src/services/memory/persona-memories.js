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
import { getDefaultStore } from '../../memory/index.js';
import { getLogger } from '../../utils/safe-logger.js';
// Map persona IDs to profile field names
const PERSONA_FIELD_MAP = {
    'jack-b': 'jackie',
    'nayan-patel': 'bogle',
    'peter-john': 'peter',
    'spend-save': 'maya',
    'event-planner': 'jordan',
    'comm-specialist': 'alex',
};
// ============================================================================
// STORAGE - Uses persistent UserProfile.personaMemories
// ============================================================================
// In-memory cache for current session (synced to DB on save)
const memoriesCache = new Map();
const dirtyUsers = new Set();
const loadedUsers = new Set();
// ============================================================================
// SESSION DATA MANAGER INTEGRATION
// ============================================================================
/**
 * Clear ALL cached data for a specific user.
 * Called by SessionDataManager when a session ends.
 * This is CRITICAL for preventing memory leaks.
 */
export function clearUserMemoriesCache(userId) {
    let cleared = 0;
    // Clear memories for this user
    for (const [id, mem] of memoriesCache) {
        if (mem.userId === userId) {
            memoriesCache.delete(id);
            cleared++;
        }
    }
    // Clear tracking sets
    loadedUsers.delete(userId);
    dirtyUsers.delete(userId);
    getLogger().debug({ userId, cleared }, '🧹 PersonaMemories user cache cleared');
}
/**
 * Clear ALL cached data (for shutdown).
 */
export function clearAllMemoriesCache() {
    memoriesCache.clear();
    loadedUsers.clear();
    dirtyUsers.clear();
    getLogger().info('🧹 PersonaMemories all caches cleared');
}
/**
 * Get cache statistics for monitoring.
 */
export function getMemoriesCacheStats() {
    const users = new Set();
    for (const mem of memoriesCache.values()) {
        users.add(mem.userId);
    }
    return { users: users.size, entries: memoriesCache.size };
}
/**
 * Register with SessionDataManager (call during initialization).
 */
export async function registerWithSessionDataManager() {
    try {
        const { getSessionDataManager } = await import('../session-data-manager.js');
        getSessionDataManager().registerService({
            name: 'PersonaMemories',
            clearUserData: clearUserMemoriesCache,
            clearAllData: clearAllMemoriesCache,
            getStats: getMemoriesCacheStats,
        });
    }
    catch {
        // SessionDataManager may not be initialized yet
        getLogger().debug('SessionDataManager not available for PersonaMemories registration');
    }
}
// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================
function generateId() {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
/**
 * Load memories from user profile into cache
 */
async function loadMemoriesForUser(userId) {
    if (loadedUsers.has(userId))
        return;
    try {
        const store = getDefaultStore();
        const profile = await store.getProfile(userId);
        if (!profile?.personaMemories) {
            loadedUsers.add(userId);
            return;
        }
        // Load each persona's memories into cache
        for (const [personaKey, memories] of Object.entries(profile.personaMemories)) {
            if (!memories)
                continue;
            const personaId = Object.entries(PERSONA_FIELD_MAP).find(([, v]) => v === personaKey)?.[0];
            if (!personaId)
                continue;
            for (const mem of memories) {
                const memory = {
                    id: mem.id,
                    userId,
                    personaId,
                    type: mem.type,
                    name: mem.name,
                    details: mem.details,
                    sentiment: mem.sentiment,
                    tags: mem.tags || [],
                    notes: mem.notes,
                    timesReferenced: mem.timesReferenced || 0,
                    createdAt: new Date(mem.createdAt),
                    updatedAt: new Date(mem.createdAt),
                };
                memoriesCache.set(mem.id, memory);
            }
        }
        loadedUsers.add(userId);
        getLogger().debug({ userId, count: memoriesCache.size }, 'Loaded persona memories from profile');
    }
    catch (error) {
        getLogger().warn({ error, userId }, 'Failed to load persona memories');
        loadedUsers.add(userId); // Mark as loaded to prevent repeated failures
    }
}
/**
 * Save memories back to user profile
 */
export async function saveMemoriesForUser(userId) {
    if (!dirtyUsers.has(userId))
        return;
    try {
        const store = getDefaultStore();
        const profile = await store.getProfile(userId);
        if (!profile)
            return;
        const userMemories = Array.from(memoriesCache.values()).filter((m) => m.userId === userId);
        // Organize by persona
        const personaMemories = {};
        for (const mem of userMemories) {
            const field = PERSONA_FIELD_MAP[mem.personaId];
            if (!field)
                continue;
            if (!personaMemories[field]) {
                personaMemories[field] = [];
            }
            // Build memory entry conforming to base persona memory structure
            const memoryEntry = {
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
            personaMemories[field].push(memoryEntry);
        }
        profile.personaMemories = personaMemories;
        profile.updatedAt = new Date();
        await store.saveProfile(profile);
        dirtyUsers.delete(userId);
        getLogger().info({ userId, count: userMemories.length }, '🧠 Persona memories saved');
    }
    catch (error) {
        getLogger().error({ error, userId }, 'Failed to save persona memories');
    }
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Remember something for a persona (persists to UserProfile)
 */
export async function remember(userId, personaId, data) {
    await loadMemoriesForUser(userId);
    const id = generateId();
    const memory = {
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
        ...data,
    };
    memoriesCache.set(id, memory);
    dirtyUsers.add(userId);
    // Save immediately
    await saveMemoriesForUser(userId);
    getLogger().info({
        id,
        personaId,
        type: data.type,
        name: data.name,
    }, '🧠 Memory saved');
    return memory;
}
/**
 * Recall memories for a persona
 */
export async function recall(userId, personaId, options) {
    await loadMemoriesForUser(userId);
    let memories = Array.from(memoriesCache.values()).filter((m) => m.userId === userId && m.personaId === personaId);
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
        memories = memories.filter((m) => m.name.toLowerCase().includes(searchLower) ||
            m.details?.toLowerCase().includes(searchLower) ||
            m.tags.some((t) => t.includes(searchLower)));
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
export async function findMemory(userId, personaId, nameOrTicker) {
    await loadMemoriesForUser(userId);
    const searchLower = nameOrTicker.toLowerCase();
    return (Array.from(memoriesCache.values()).find((m) => m.userId === userId &&
        m.personaId === personaId &&
        (m.name.toLowerCase() === searchLower ||
            m.ticker?.toLowerCase() === searchLower ||
            m.ticker?.toLowerCase() === searchLower)) || null);
}
/**
 * Update a memory
 */
export async function updateMemory(memoryId, updates) {
    const memory = memoriesCache.get(memoryId);
    if (!memory)
        return null;
    Object.assign(memory, updates, { updatedAt: new Date() });
    memoriesCache.set(memoryId, memory);
    dirtyUsers.add(memory.userId);
    await saveMemoriesForUser(memory.userId);
    return memory;
}
/**
 * Mark a memory as referenced (used in conversation)
 */
export async function touchMemory(memoryId) {
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
export async function forget(memoryId) {
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
export async function getAllUserMemories(userId) {
    await loadMemoriesForUser(userId);
    return Array.from(memoriesCache.values()).filter((m) => m.userId === userId);
}
// ============================================================================
// PERSONA-SPECIFIC HELPERS
// ============================================================================
// ----- Ferni (Life Coach) -----
export async function rememberPreference(userId, name, details) {
    return remember(userId, 'jack-b', {
        type: 'preference',
        name,
        details,
        sentiment: 'positive',
        tags: ['preference'],
    });
}
export async function rememberWin(userId, win, details) {
    return remember(userId, 'jack-b', {
        type: 'win',
        name: win,
        details,
        sentiment: 'positive',
        tags: ['win', 'celebration'],
    });
}
export async function getFerniMemories(userId) {
    return (await recall(userId, 'jack-b'));
}
// ----- Jack Bogle (Index Investing) -----
export async function rememberFund(userId, name, options) {
    return remember(userId, 'nayan-patel', {
        type: 'fund',
        name,
        ticker: options?.ticker,
        category: options?.category,
        expenseRatio: options?.expenseRatio,
        sentiment: options?.sentiment || 'positive',
        tags: ['fund', options?.category || 'index'].filter(Boolean),
    });
}
export async function rememberInvestingPhilosophy(userId, philosophy) {
    return remember(userId, 'nayan-patel', {
        type: 'philosophy',
        name: philosophy,
        sentiment: 'positive',
        tags: ['philosophy', 'wisdom'],
    });
}
export async function getBogleMemories(userId, type) {
    return (await recall(userId, 'nayan-patel', { type }));
}
// ----- Peter John (Stock Picking) -----
export async function addToWatchlist(userId, name, options) {
    return remember(userId, 'peter-john', {
        type: 'watchlist',
        name,
        ticker: options?.ticker,
        sector: options?.sector,
        reason: options?.reason,
        priceWhenAdded: options?.price,
        sentiment: 'watchful',
        tags: ['watchlist', options?.sector || ''].filter(Boolean),
    });
}
export async function rememberCompany(userId, name, options) {
    return remember(userId, 'peter-john', {
        type: 'company',
        name,
        ticker: options?.ticker,
        reason: options?.reason,
        sentiment: options?.sentiment || 'positive',
        tags: ['company', 'invest-what-you-know'],
    });
}
export async function markAsTenBagger(memoryId) {
    return (await updateMemory(memoryId, {
        type: 'ten_bagger',
        sentiment: 'positive',
        tags: ['ten_bagger', 'winner'],
    }));
}
export async function getWatchlist(userId) {
    return (await recall(userId, 'peter-john', { type: 'watchlist' }));
}
export async function getPeterMemories(userId, type) {
    return (await recall(userId, 'peter-john', { type }));
}
// ----- Maya (Spend & Save) -----
export async function rememberMerchant(userId, name, options) {
    return remember(userId, 'spend-save', {
        type: 'merchant',
        name,
        merchantCategory: options?.category,
        averageSpend: options?.averageSpend,
        sentiment: options?.sentiment || 'neutral',
        notes: options?.notes,
        tags: ['merchant', options?.category || ''].filter(Boolean),
    });
}
export async function rememberBill(userId, name, options) {
    return remember(userId, 'spend-save', {
        type: 'bill',
        name,
        amount: options?.amount,
        dueDate: options?.dueDate,
        isAutoPay: options?.isAutoPay,
        sentiment: 'neutral',
        tags: ['bill', 'recurring'],
    });
}
export async function rememberSavingsGoal(userId, name, options) {
    return remember(userId, 'spend-save', {
        type: 'savings_goal',
        name,
        targetAmount: options?.targetAmount,
        targetDate: options?.targetDate,
        currentAmount: options?.currentAmount || 0,
        sentiment: 'positive',
        tags: ['savings', 'goal'],
    });
}
export async function rememberSpendingTrigger(userId, trigger, notes) {
    return remember(userId, 'spend-save', {
        type: 'trigger',
        name: trigger,
        notes,
        sentiment: 'negative',
        tags: ['trigger', 'awareness'],
    });
}
export async function getMayaMemories(userId, type) {
    return (await recall(userId, 'spend-save', { type }));
}
// ----- Jordan (Event Planner) -----
export async function rememberDate(userId, name, options) {
    return remember(userId, 'event-planner', {
        type: 'date',
        name,
        date: options.date,
        person: options.person,
        recurring: options.recurring || 'yearly',
        sentiment: 'positive',
        tags: ['date', 'important', options.recurring || 'yearly'],
    });
}
export async function rememberVenue(userId, name, options) {
    return remember(userId, 'event-planner', {
        type: 'venue',
        name,
        location: options?.location,
        priceRange: options?.priceRange,
        rating: options?.rating,
        sentiment: options?.sentiment || 'positive',
        notes: options?.notes,
        tags: ['venue', options?.priceRange || ''].filter(Boolean),
    });
}
export async function rememberDestination(userId, name, options) {
    return remember(userId, 'event-planner', {
        type: 'destination',
        name,
        notes: options?.notes,
        sentiment: options?.sentiment || 'positive',
        tags: ['destination', 'dream', 'travel'],
    });
}
export async function getImportantDates(userId) {
    return (await recall(userId, 'event-planner', { type: 'date' }));
}
export async function getJordanMemories(userId, type) {
    return (await recall(userId, 'event-planner', { type }));
}
/**
 * Get Alex's memories (communication preferences, scheduling notes)
 */
export async function getAlexMemories(userId, type) {
    return (await recall(userId, 'comm-specialist', { type }));
}
// ============================================================================
// FORMATTING
// ============================================================================
export function formatMemoryForSpeech(memory) {
    let result = memory.name;
    if (memory.details) {
        result += ` - ${memory.details}`;
    }
    // Add persona-specific details
    switch (memory.personaId) {
        case 'peter-john': {
            const pm = memory;
            if (pm.ticker)
                result = `${pm.ticker} (${pm.name})`;
            if (pm.reason)
                result += ` - ${pm.reason}`;
            break;
        }
        case 'nayan-patel': {
            const bm = memory;
            if (bm.ticker)
                result = `${bm.ticker} (${bm.name})`;
            if (bm.expenseRatio)
                result += ` - ${bm.expenseRatio}% expense ratio`;
            break;
        }
        case 'spend-save': {
            const mm = memory;
            if (mm.amount)
                result += ` - $${mm.amount}`;
            if (mm.targetAmount)
                result += ` (goal: $${mm.targetAmount})`;
            break;
        }
        case 'event-planner': {
            const jm = memory;
            if (jm.date)
                result += ` - ${jm.date}`;
            if (jm.person)
                result += ` (${jm.person})`;
            break;
        }
        case 'comm-specialist': {
            const am = memory;
            if (am.preferredChannel)
                result += ` - prefers ${am.preferredChannel}`;
            if (am.preferredTime)
                result += ` (${am.preferredTime})`;
            if (am.contactName)
                result += ` - re: ${am.contactName}`;
            break;
        }
    }
    // Sentiment indicators
    if (memory.sentiment === 'negative') {
        result += ' ⚠️';
    }
    else if (memory.sentiment === 'positive') {
        result += ' ✨';
    }
    else if (memory.sentiment === 'watchful') {
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
//# sourceMappingURL=persona-memories.js.map