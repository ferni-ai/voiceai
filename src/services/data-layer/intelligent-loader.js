/**
 * Intelligent Data Loader
 *
 * Lazy-loads user data by domain on-demand, rather than loading everything upfront.
 * This dramatically reduces session startup time and memory usage.
 *
 * Philosophy: Load what you need, when you need it. Like a human brain,
 * we don't recall everything at once - we retrieve relevant memories.
 *
 * @module services/data-layer/intelligent-loader
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'IntelligentLoader' });
// ============================================================================
// DOMAIN CONFIGURATION
// ============================================================================
const DOMAIN_CONFIG = {
    // CRITICAL - Always load at session start
    profile: {
        priority: 'critical',
        cacheTTLMs: 5 * 60 * 1000, // 5 minutes
        triggerKeywords: ['name', 'who am i', 'my profile', 'settings'],
    },
    // BACKGROUND - Load async after session starts
    insights: {
        priority: 'background',
        cacheTTLMs: 2 * 60 * 1000, // 2 minutes
        dependencies: ['profile'],
        triggerKeywords: ['team', 'insight', 'notice', 'pattern'],
    },
    intelligence: {
        priority: 'background',
        cacheTTLMs: 5 * 60 * 1000, // 5 minutes
        dependencies: ['profile'],
        triggerKeywords: ['learn', 'remember', 'pattern', 'style'],
    },
    // ON-DEMAND - Only load when user talks about them
    habits: {
        priority: 'on-demand',
        cacheTTLMs: 3 * 60 * 1000, // 3 minutes
        triggerKeywords: [
            'habit',
            'routine',
            'morning',
            'evening',
            'daily',
            'streak',
            'track',
            'exercise',
            'workout',
            'meditation',
        ],
        maxItems: 50,
    },
    tasks: {
        priority: 'on-demand',
        cacheTTLMs: 2 * 60 * 1000, // 2 minutes
        triggerKeywords: ['task', 'todo', 'remind', 'deadline', 'due', 'list', 'to-do'],
        maxItems: 100,
    },
    finance: {
        priority: 'on-demand',
        cacheTTLMs: 3 * 60 * 1000, // 3 minutes
        triggerKeywords: [
            'money',
            'budget',
            'saving',
            'spend',
            'bill',
            'subscription',
            'financial',
            'invest',
            'goal',
        ],
        maxItems: 50,
    },
    calendar: {
        priority: 'on-demand',
        cacheTTLMs: 1 * 60 * 1000, // 1 minute (events change frequently)
        triggerKeywords: ['calendar', 'meeting', 'schedule', 'event', 'appointment', 'busy', 'free'],
        maxItems: 50,
    },
    social: {
        priority: 'on-demand',
        cacheTTLMs: 5 * 60 * 1000, // 5 minutes
        dependencies: ['profile'],
        triggerKeywords: [
            'friend',
            'family',
            'mom',
            'dad',
            'brother',
            'sister',
            'partner',
            'wife',
            'husband',
            'coworker',
            'boss',
            'relationship',
        ],
        maxItems: 100,
    },
    health: {
        priority: 'on-demand',
        cacheTTLMs: 3 * 60 * 1000, // 3 minutes
        triggerKeywords: [
            'health',
            'medication',
            'medicine',
            'doctor',
            'sleep',
            'wellness',
            'anxiety',
            'stress',
        ],
        maxItems: 50,
    },
    coaching: {
        priority: 'on-demand',
        cacheTTLMs: 5 * 60 * 1000, // 5 minutes
        dependencies: ['profile'],
        triggerKeywords: ['progress', 'growth', 'coaching', 'breakthrough', 'stuck', 'help'],
    },
    milestones: {
        priority: 'on-demand',
        cacheTTLMs: 5 * 60 * 1000, // 5 minutes
        triggerKeywords: [
            'milestone',
            'goal',
            'achievement',
            'plan',
            'wedding',
            'baby',
            'home',
            'retirement',
        ],
        maxItems: 30,
    },
    music: {
        priority: 'on-demand',
        cacheTTLMs: 10 * 60 * 1000, // 10 minutes
        triggerKeywords: ['music', 'song', 'play', 'artist', 'playlist', 'spotify'],
    },
    games: {
        priority: 'on-demand',
        cacheTTLMs: 10 * 60 * 1000, // 10 minutes
        triggerKeywords: ['game', 'play', 'trivia', 'quiz', 'fun'],
    },
    trust: {
        priority: 'on-demand',
        cacheTTLMs: 5 * 60 * 1000, // 5 minutes
        dependencies: ['profile'],
        triggerKeywords: ['promise', 'commitment', 'boundary', 'avoid', 'sensitive'],
    },
};
// ============================================================================
// INTELLIGENT LOADER CLASS
// ============================================================================
export class IntelligentDataLoader {
    userId;
    sessionId;
    domainCache = new Map();
    loadingPromises = new Map();
    stats;
    constructor(userId, sessionId) {
        this.userId = userId;
        this.sessionId = sessionId;
        this.stats = {
            domainsLoaded: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalLoadTimeMs: 0,
            domainBreakdown: {},
        };
        // Initialize breakdown
        for (const domain of Object.keys(DOMAIN_CONFIG)) {
            this.stats.domainBreakdown[domain] = { loaded: false, loadTimeMs: 0 };
        }
    }
    // ============================================================================
    // PUBLIC API
    // ============================================================================
    /**
     * Initialize session - loads ONLY critical domains, others load on-demand
     */
    async initializeSession() {
        const startTime = performance.now();
        const criticalDomains = this.getDomainsByPriority('critical');
        const backgroundDomains = this.getDomainsByPriority('background');
        log.info({
            userId: this.userId,
            sessionId: this.sessionId,
            critical: criticalDomains,
            background: backgroundDomains.length,
        }, '🚀 Intelligent loader starting session');
        // Load critical domains (blocking)
        await Promise.all(criticalDomains.map((domain) => this.loadDomain(domain)));
        // Start background domains (non-blocking)
        for (const domain of backgroundDomains) {
            // Fire and forget - these load in background
            this.loadDomain(domain).catch((err) => log.debug({ domain, error: String(err) }, 'Background domain load failed (non-critical)'));
        }
        log.info({
            userId: this.userId,
            initTimeMs: Math.round(performance.now() - startTime),
            loadedDomains: criticalDomains.length,
        }, '✅ Session initialized (critical domains only)');
    }
    /**
     * Get domain data - loads on-demand if not cached
     */
    async getDomain(domain) {
        // Check cache first
        const cached = this.getCachedDomain(domain);
        if (cached !== null) {
            this.stats.cacheHits++;
            return cached;
        }
        this.stats.cacheMisses++;
        // Load dependencies first
        const config = DOMAIN_CONFIG[domain];
        if (config.dependencies) {
            await Promise.all(config.dependencies.map((dep) => this.loadDomain(dep)));
        }
        // Load the domain
        return this.loadDomain(domain);
    }
    /**
     * Detect domains from user message and preload them
     * Call this BEFORE processing the user message for predictive loading
     */
    async preloadFromMessage(message) {
        const detectedDomains = this.detectDomainsFromText(message);
        if (detectedDomains.length === 0) {
            return [];
        }
        log.debug({
            userId: this.userId,
            message: message.slice(0, 50),
            domains: detectedDomains,
        }, '🔮 Predictive loading domains from message');
        // Load detected domains in parallel (but don't wait)
        const loadPromises = detectedDomains.map((domain) => this.loadDomain(domain).catch(() => null));
        // Return immediately - loading happens in background
        Promise.all(loadPromises);
        return detectedDomains;
    }
    /**
     * Get loader statistics for observability
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Clear all cached data (call at session end)
     */
    clearCache() {
        this.domainCache.clear();
        this.loadingPromises.clear();
        log.debug({ userId: this.userId, sessionId: this.sessionId }, 'Intelligent loader cache cleared');
    }
    // ============================================================================
    // DOMAIN DETECTION
    // ============================================================================
    /**
     * Detect which domains are relevant based on text content
     */
    detectDomainsFromText(text) {
        const textLower = text.toLowerCase();
        const detected = [];
        for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
            // Skip already loaded domains
            if (this.isCacheValid(domain)) {
                continue;
            }
            // Check if any trigger keywords match
            const matches = config.triggerKeywords.some((keyword) => textLower.includes(keyword.toLowerCase()));
            if (matches) {
                detected.push(domain);
            }
        }
        return detected;
    }
    // ============================================================================
    // PRIVATE: LOADING LOGIC
    // ============================================================================
    getDomainsByPriority(priority) {
        return Object.entries(DOMAIN_CONFIG)
            .filter(([, config]) => config.priority === priority)
            .map(([domain]) => domain);
    }
    getCachedDomain(domain) {
        const cached = this.domainCache.get(domain);
        if (!cached)
            return null;
        const config = DOMAIN_CONFIG[domain];
        const isExpired = Date.now() - cached.loadedAt > config.cacheTTLMs;
        if (isExpired) {
            this.domainCache.delete(domain);
            return null;
        }
        return cached.data;
    }
    isCacheValid(domain) {
        const cached = this.domainCache.get(domain);
        if (!cached)
            return false;
        const config = DOMAIN_CONFIG[domain];
        return Date.now() - cached.loadedAt < config.cacheTTLMs;
    }
    async loadDomain(domain) {
        // Return existing promise if already loading
        const existing = this.loadingPromises.get(domain);
        if (existing) {
            return existing;
        }
        // Return cached data if valid
        const cached = this.getCachedDomain(domain);
        if (cached !== null) {
            return cached;
        }
        const loadPromise = this.doLoadDomain(domain);
        this.loadingPromises.set(domain, loadPromise);
        try {
            const result = await loadPromise;
            return result;
        }
        finally {
            this.loadingPromises.delete(domain);
        }
    }
    async doLoadDomain(domain) {
        const startTime = performance.now();
        const config = DOMAIN_CONFIG[domain];
        try {
            let data;
            switch (domain) {
                case 'profile':
                    data = await this.loadProfile();
                    break;
                case 'habits':
                    data = await this.loadHabits(config.maxItems);
                    break;
                case 'tasks':
                    data = await this.loadTasks(config.maxItems);
                    break;
                case 'finance':
                    data = await this.loadFinance(config.maxItems);
                    break;
                case 'calendar':
                    data = await this.loadCalendar(config.maxItems);
                    break;
                case 'social':
                    data = await this.loadSocialGraph(config.maxItems);
                    break;
                case 'health':
                    data = await this.loadHealth(config.maxItems);
                    break;
                case 'coaching':
                    data = await this.loadCoaching();
                    break;
                case 'milestones':
                    data = await this.loadMilestones(config.maxItems);
                    break;
                case 'music':
                    data = await this.loadMusicPreferences();
                    break;
                case 'games':
                    data = await this.loadGameHistory();
                    break;
                case 'trust':
                    data = await this.loadTrustData();
                    break;
                case 'insights':
                    data = await this.loadCrossPersonaInsights();
                    break;
                case 'intelligence':
                    data = await this.loadIntelligenceState();
                    break;
                default:
                    data = null;
            }
            const loadTimeMs = Math.round(performance.now() - startTime);
            // Cache the result
            this.domainCache.set(domain, {
                data,
                loadedAt: Date.now(),
                source: 'firestore',
                loadTimeMs,
            });
            // Update stats
            this.stats.domainsLoaded++;
            this.stats.totalLoadTimeMs += loadTimeMs;
            this.stats.domainBreakdown[domain] = { loaded: true, loadTimeMs };
            log.debug({
                domain,
                userId: this.userId,
                loadTimeMs,
                hasData: data !== null,
            }, `📦 Loaded domain: ${domain}`);
            return data;
        }
        catch (error) {
            log.warn({ domain, userId: this.userId, error: String(error) }, 'Failed to load domain');
            return null;
        }
    }
    // ============================================================================
    // DOMAIN LOADERS (with pagination/limits)
    // ============================================================================
    async loadProfile() {
        const { getStore } = await import('../../memory/store-factory.js');
        const store = await getStore();
        return store.getProfile(this.userId);
    }
    async loadHabits(maxItems = 50) {
        const { getProductivityStore } = await import('../stores/productivity-store.js');
        const store = getProductivityStore();
        // Only load active habits, limited
        const allData = await store.loadUserData(this.userId);
        return {
            habits: (allData.habits || []).filter((h) => h.isActive).slice(0, maxItems),
            // Only include recent logs (last 30 days)
            habitLogs: (allData.habitLogs || [])
                .filter((l) => {
                const logDate = new Date(l.date);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return logDate > thirtyDaysAgo;
            })
                .slice(0, 200),
        };
    }
    async loadTasks(maxItems = 100) {
        const { getProductivityStore } = await import('../stores/productivity-store.js');
        const store = getProductivityStore();
        const allData = await store.loadUserData(this.userId);
        return {
            // Only incomplete tasks
            tasks: (allData.tasks || []).filter((t) => t.status !== 'completed').slice(0, maxItems),
            // Only active bills
            bills: (allData.bills || []).filter((b) => b.isActive).slice(0, 30),
        };
    }
    async loadFinance(maxItems = 50) {
        const { getFinancialStore } = await import('../stores/financial-store.js');
        const store = getFinancialStore();
        const allData = await store.loadUserData(this.userId);
        return {
            // Only active savings goals
            savingsGoals: (allData.savingsGoals || [])
                .filter((g) => g.status === 'active')
                .slice(0, maxItems),
            // Current budgets only
            budgets: (allData.budgets || []).filter((b) => b.remaining > 0).slice(0, 20),
            // Recent spending triggers
            spendingTriggers: (allData.spendingTriggers || []).slice(0, 30),
        };
    }
    async loadCalendar(maxItems = 50) {
        try {
            const { getEvents } = await import('../calendar/unified-calendar-store.js');
            // Only load upcoming events (next 14 days)
            const now = new Date();
            const twoWeeksFromNow = new Date();
            twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
            const events = await getEvents(this.userId, now, twoWeeksFromNow);
            return { events: events.slice(0, maxItems) };
        }
        catch {
            return { events: [] };
        }
    }
    async loadSocialGraph(maxItems = 100) {
        try {
            const { loadGraphFromFirestore, getImportantPeople, getSocialInsights } = await import('../social-graph/index.js');
            await loadGraphFromFirestore(this.userId);
            return {
                importantPeople: getImportantPeople(this.userId).slice(0, maxItems),
                insights: getSocialInsights(this.userId),
            };
        }
        catch {
            return { importantPeople: [], insights: [] };
        }
    }
    async loadHealth(maxItems = 50) {
        const { getProductivityStore } = await import('../stores/productivity-store.js');
        const store = getProductivityStore();
        const allData = await store.loadUserData(this.userId);
        return {
            // Active medications only
            medications: (allData.medications || []).filter((m) => m.isActive).slice(0, maxItems),
            // Recent dose logs (last 7 days) - only include logs with valid dates
            doseLogs: (allData.doseLogs || [])
                .filter((l) => {
                // Use takenAt if available, otherwise scheduledTime
                const dateStr = l.takenAt || l.scheduledTime;
                if (!dateStr)
                    return false;
                const logDate = new Date(dateStr);
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                return logDate > sevenDaysAgo;
            })
                .slice(0, 50),
        };
    }
    async loadCoaching() {
        try {
            const { getDomainStats, getAllStats } = await import('../coaching/semantic-confidence-tracker.js');
            // Get all domain stats as an approximation of coaching state
            const allStats = getAllStats();
            return {
                domainStats: allStats,
                recentProgress: [],
            };
        }
        catch {
            return { domainStats: [], recentProgress: [] };
        }
    }
    async loadMilestones(maxItems = 30) {
        const { getLifeDataStore } = await import('../stores/life-data-store.js');
        const store = getLifeDataStore();
        const allData = await store.getUserLifeData(this.userId);
        return {
            // Only non-completed milestones
            milestones: (allData?.milestones || [])
                .filter((m) => m.status !== 'completed')
                .slice(0, maxItems),
        };
    }
    async loadMusicPreferences() {
        // Music prefs are typically in user profile
        const profile = await this.getDomain('profile');
        return profile?.musicMemory || null;
    }
    async loadGameHistory() {
        // Game history is typically in user profile
        const profile = await this.getDomain('profile');
        // Only return recent games (last 20)
        const gameMemory = profile?.gameMemory;
        if (gameMemory?.recentGames) {
            return {
                ...gameMemory,
                recentGames: gameMemory.recentGames.slice(0, 20),
            };
        }
        return gameMemory || null;
    }
    async loadTrustData() {
        try {
            const { loadUserCommitments } = await import('../superhuman/index.js');
            const commitments = await loadUserCommitments(this.userId);
            return {
                // Only active commitments (status is 'active' not 'completed' or 'abandoned')
                commitments: commitments.filter((c) => c.status === 'active').slice(0, 50),
            };
        }
        catch {
            return { commitments: [] };
        }
    }
    async loadCrossPersonaInsights() {
        try {
            const { loadInsights } = await import('../cross-persona-insights.js');
            await loadInsights(this.userId);
            return { loaded: true };
        }
        catch {
            return { loaded: false };
        }
    }
    async loadIntelligenceState() {
        // Intelligence state is typically in user profile
        const profile = await this.getDomain('profile');
        return {
            cognitiveIntelligence: profile?.cognitiveIntelligence,
            intelligenceState: profile?.intelligenceState,
        };
    }
}
// ============================================================================
// SINGLETON MANAGEMENT (per session)
// ============================================================================
const activeLoaders = new Map();
/**
 * Get or create an intelligent loader for a session
 */
export function getIntelligentLoader(userId, sessionId) {
    const key = `${userId}_${sessionId}`;
    let loader = activeLoaders.get(key);
    if (!loader) {
        loader = new IntelligentDataLoader(userId, sessionId);
        activeLoaders.set(key, loader);
    }
    return loader;
}
/**
 * Clean up loader for a session
 */
export function cleanupLoader(userId, sessionId) {
    const key = `${userId}_${sessionId}`;
    const loader = activeLoaders.get(key);
    if (loader) {
        loader.clearCache();
        activeLoaders.delete(key);
    }
}
/**
 * Clean up all loaders (for shutdown)
 */
export function cleanupAllLoaders() {
    for (const loader of activeLoaders.values()) {
        loader.clearCache();
    }
    activeLoaders.clear();
    log.info({ count: activeLoaders.size }, 'All intelligent loaders cleaned up');
}
// ============================================================================
// EXPORTS
// ============================================================================
export { DOMAIN_CONFIG };
//# sourceMappingURL=intelligent-loader.js.map