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
export type PersonaId = 'jack-b' | 'nayan-patel' | 'peter-john' | 'spend-save' | 'event-planner' | 'comm-specialist';
export interface Memory {
    id: string;
    userId: string;
    personaId: PersonaId;
    type: string;
    name: string;
    details?: string;
    sentiment?: 'positive' | 'negative' | 'neutral' | 'watchful';
    tags: string[];
    notes?: string;
    timesReferenced: number;
    lastReferencedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface FerniMemory extends Memory {
    personaId: 'jack-b';
    type: 'preference' | 'win' | 'topic' | 'style' | 'music' | 'inside_joke';
}
export interface BogleMemory extends Memory {
    personaId: 'nayan-patel';
    type: 'fund' | 'philosophy' | 'allocation' | 'wisdom' | 'avoid';
    ticker?: string;
    expenseRatio?: number;
    category?: 'index' | 'bond' | 'international' | 'balanced' | 'sector';
}
export interface PeterMemory extends Memory {
    personaId: 'peter-john';
    type: 'stock' | 'company' | 'watchlist' | 'story' | 'ten_bagger' | 'avoid';
    ticker?: string;
    sector?: string;
    reason?: string;
    priceWhenAdded?: number;
    targetPrice?: number;
}
export interface MayaMemory extends Memory {
    personaId: 'spend-save';
    type: 'merchant' | 'bill' | 'subscription' | 'savings_goal' | 'trigger' | 'category' | 'win';
    merchantCategory?: string;
    averageSpend?: number;
    dueDate?: number;
    amount?: number;
    isAutoPay?: boolean;
    targetAmount?: number;
    currentAmount?: number;
    targetDate?: Date;
}
export interface JordanMemory extends Memory {
    personaId: 'event-planner';
    type: 'date' | 'venue' | 'vendor' | 'destination' | 'milestone' | 'preference';
    date?: string;
    recurring?: 'yearly' | 'monthly' | 'once';
    person?: string;
    location?: string;
    contact?: string;
    priceRange?: string;
    rating?: number;
}
export interface AlexMemory extends Memory {
    personaId: 'comm-specialist';
    type: 'communication_preference' | 'scheduling_note' | 'contact_note' | 'reminder_style';
    preferredChannel?: 'text' | 'call' | 'email' | 'in-person';
    preferredTime?: string;
    recurring?: boolean;
    availability?: string;
    contactName?: string;
    relationship?: string;
}
/**
 * Clear ALL cached data for a specific user.
 * Called by SessionDataManager when a session ends.
 * This is CRITICAL for preventing memory leaks.
 */
export declare function clearUserMemoriesCache(userId: string): void;
/**
 * Clear ALL cached data (for shutdown).
 */
export declare function clearAllMemoriesCache(): void;
/**
 * Get cache statistics for monitoring.
 */
export declare function getMemoriesCacheStats(): {
    users: number;
    entries: number;
};
/**
 * Register with SessionDataManager (call during initialization).
 */
export declare function registerWithSessionDataManager(): Promise<void>;
/**
 * Save memories back to user profile
 */
export declare function saveMemoriesForUser(userId: string): Promise<void>;
/**
 * Remember something for a persona (persists to UserProfile)
 */
export declare function remember<T extends Memory>(userId: string, personaId: PersonaId, data: Omit<T, 'id' | 'userId' | 'personaId' | 'timesReferenced' | 'createdAt' | 'updatedAt'>): Promise<T>;
/**
 * Recall memories for a persona
 */
export declare function recall(userId: string, personaId: PersonaId, options?: {
    type?: string;
    sentiment?: Memory['sentiment'];
    tags?: string[];
    search?: string;
    limit?: number;
}): Promise<Memory[]>;
/**
 * Find a specific memory
 */
export declare function findMemory(userId: string, personaId: PersonaId, nameOrTicker: string): Promise<Memory | null>;
/**
 * Update a memory
 */
export declare function updateMemory(memoryId: string, updates: Partial<Memory>): Promise<Memory | null>;
/**
 * Mark a memory as referenced (used in conversation)
 */
export declare function touchMemory(memoryId: string): Promise<void>;
/**
 * Forget a memory
 */
export declare function forget(memoryId: string): Promise<boolean>;
/**
 * Get all memories for a user across all personas
 */
export declare function getAllUserMemories(userId: string): Promise<Memory[]>;
export declare function rememberPreference(userId: string, name: string, details?: string): Promise<FerniMemory>;
export declare function rememberWin(userId: string, win: string, details?: string): Promise<FerniMemory>;
export declare function getFerniMemories(userId: string): Promise<FerniMemory[]>;
export declare function rememberFund(userId: string, name: string, options?: {
    ticker?: string;
    category?: BogleMemory['category'];
    expenseRatio?: number;
    sentiment?: Memory['sentiment'];
}): Promise<BogleMemory>;
export declare function rememberInvestingPhilosophy(userId: string, philosophy: string): Promise<BogleMemory>;
export declare function getBogleMemories(userId: string, type?: BogleMemory['type']): Promise<BogleMemory[]>;
export declare function addToWatchlist(userId: string, name: string, options?: {
    ticker?: string;
    sector?: string;
    reason?: string;
    price?: number;
}): Promise<PeterMemory>;
export declare function rememberCompany(userId: string, name: string, options?: {
    ticker?: string;
    reason?: string;
    sentiment?: Memory['sentiment'];
}): Promise<PeterMemory>;
export declare function markAsTenBagger(memoryId: string): Promise<PeterMemory | null>;
export declare function getWatchlist(userId: string): Promise<PeterMemory[]>;
export declare function getPeterMemories(userId: string, type?: PeterMemory['type']): Promise<PeterMemory[]>;
export declare function rememberMerchant(userId: string, name: string, options?: {
    category?: string;
    sentiment?: Memory['sentiment'];
    averageSpend?: number;
    notes?: string;
}): Promise<MayaMemory>;
export declare function rememberBill(userId: string, name: string, options?: {
    amount?: number;
    dueDate?: number;
    isAutoPay?: boolean;
}): Promise<MayaMemory>;
export declare function rememberSavingsGoal(userId: string, name: string, options?: {
    targetAmount?: number;
    targetDate?: Date;
    currentAmount?: number;
}): Promise<MayaMemory>;
export declare function rememberSpendingTrigger(userId: string, trigger: string, notes?: string): Promise<MayaMemory>;
export declare function getMayaMemories(userId: string, type?: MayaMemory['type']): Promise<MayaMemory[]>;
export declare function rememberDate(userId: string, name: string, options: {
    date: string;
    person?: string;
    recurring?: JordanMemory['recurring'];
}): Promise<JordanMemory>;
export declare function rememberVenue(userId: string, name: string, options?: {
    location?: string;
    priceRange?: string;
    rating?: number;
    sentiment?: Memory['sentiment'];
    notes?: string;
}): Promise<JordanMemory>;
export declare function rememberDestination(userId: string, name: string, options?: {
    notes?: string;
    sentiment?: Memory['sentiment'];
}): Promise<JordanMemory>;
export declare function getImportantDates(userId: string): Promise<JordanMemory[]>;
export declare function getJordanMemories(userId: string, type?: JordanMemory['type']): Promise<JordanMemory[]>;
/**
 * Get Alex's memories (communication preferences, scheduling notes)
 */
export declare function getAlexMemories(userId: string, type?: AlexMemory['type']): Promise<AlexMemory[]>;
export declare function formatMemoryForSpeech(memory: Memory): string;
declare const _default: {
    remember: typeof remember;
    recall: typeof recall;
    findMemory: typeof findMemory;
    updateMemory: typeof updateMemory;
    touchMemory: typeof touchMemory;
    forget: typeof forget;
    getAllUserMemories: typeof getAllUserMemories;
    rememberPreference: typeof rememberPreference;
    rememberWin: typeof rememberWin;
    getFerniMemories: typeof getFerniMemories;
    rememberFund: typeof rememberFund;
    rememberInvestingPhilosophy: typeof rememberInvestingPhilosophy;
    getBogleMemories: typeof getBogleMemories;
    addToWatchlist: typeof addToWatchlist;
    rememberCompany: typeof rememberCompany;
    markAsTenBagger: typeof markAsTenBagger;
    getWatchlist: typeof getWatchlist;
    getPeterMemories: typeof getPeterMemories;
    rememberMerchant: typeof rememberMerchant;
    rememberBill: typeof rememberBill;
    rememberSavingsGoal: typeof rememberSavingsGoal;
    rememberSpendingTrigger: typeof rememberSpendingTrigger;
    getMayaMemories: typeof getMayaMemories;
    rememberDate: typeof rememberDate;
    rememberVenue: typeof rememberVenue;
    rememberDestination: typeof rememberDestination;
    getImportantDates: typeof getImportantDates;
    getJordanMemories: typeof getJordanMemories;
    formatMemoryForSpeech: typeof formatMemoryForSpeech;
};
export default _default;
//# sourceMappingURL=persona-memories.d.ts.map