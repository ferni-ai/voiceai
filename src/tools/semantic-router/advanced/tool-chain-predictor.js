/**
 * Tool Chain Predictor
 *
 * Predicts multi-step tool sequences based on:
 * 1. Co-occurrence patterns (A often followed by B)
 * 2. Goal decomposition (complex intent → tool sequence)
 * 3. Dependency analysis (B requires output from A)
 *
 * Example: "Plan my morning routine"
 * → weather_check → calendar_list → music_play → habit_suggest
 *
 * @module tools/semantic-router/advanced/tool-chain-predictor
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'semantic-router:chain-predictor' });
// ============================================================================
// TOOL CHAIN PREDICTOR
// ============================================================================
export class ToolChainPredictor {
    // Pre-defined chain patterns (expert knowledge)
    patterns = [];
    // Learned co-occurrence statistics
    coOccurrence = new Map();
    // Per-user chain history
    userHistory = new Map();
    // Recent tool executions (for learning)
    recentExecutions = [];
    constructor() {
        this.initializePatterns();
    }
    /**
     * Predict tool chain for a complex intent
     */
    async predict(intent, primaryTool, availableTools, userId) {
        // 1. Check explicit patterns first
        const patternChain = this.matchPattern(intent);
        if (patternChain) {
            log.debug({ intent, pattern: patternChain.steps.map((s) => s.toolId) }, 'Matched explicit pattern');
            return patternChain;
        }
        // 2. Check co-occurrence predictions
        const likelyNext = this.predictNextFromCoOccurrence(primaryTool.toolId);
        // 3. Check user's personal patterns
        let userPatterns = [];
        if (userId) {
            userPatterns = this.getUserPatterns(userId, primaryTool.toolId);
        }
        // 4. Build chain based on combined signals
        if (likelyNext.length > 0 || userPatterns.length > 0) {
            const chain = this.buildChainFromSignals(primaryTool.toolId, likelyNext, userPatterns, availableTools);
            if (chain) {
                return chain;
            }
        }
        // 5. No chain predicted - single tool execution
        return null;
    }
    /**
     * Record tool execution for learning
     */
    recordExecution(toolId, userId, context) {
        const now = Date.now();
        // Add to recent executions
        this.recentExecutions.push({
            toolId,
            timestamp: now,
            userId,
            context,
        });
        // Keep only last 1000 executions
        if (this.recentExecutions.length > 1000) {
            this.recentExecutions.shift();
        }
        // Update co-occurrence for recent tools
        const recentByUser = this.recentExecutions
            .filter((e) => e.userId === userId && e.timestamp > now - 60000) // Last minute
            .map((e) => e.toolId);
        if (recentByUser.length >= 2) {
            const prevTool = recentByUser[recentByUser.length - 2];
            this.updateCoOccurrence(prevTool, toolId);
        }
        // Update user history
        this.updateUserHistory(userId, toolId);
    }
    /**
     * Get likely next tools based on current execution
     */
    getLikelyNext(toolId, k = 3) {
        return this.predictNextFromCoOccurrence(toolId).slice(0, k);
    }
    // ============================================================================
    // PATTERN MATCHING
    // ============================================================================
    initializePatterns() {
        // Morning routine pattern
        this.patterns.push({
            trigger: /morning|wake up|start.*day/i,
            chain: [
                'weather_current',
                'calendar_list_today',
                'habit_morning_check',
                'music_play_energizing',
            ],
            conditionals: [{ afterStep: 0, condition: 'weather.rain', thenContinue: true }],
        });
        // Planning session pattern
        this.patterns.push({
            trigger: /plan|schedule|organize/i,
            chain: ['calendar_list_events', 'tasks_list', 'goals_review'],
        });
        // Focus session pattern
        this.patterns.push({
            trigger: /focus|work|concentrate|productive/i,
            chain: ['spotify_play_focus', 'calendar_check_interruptions', 'notifications_pause'],
        });
        // Wind down pattern
        this.patterns.push({
            trigger: /wind down|relax|end.*day|evening/i,
            chain: ['habit_evening_check', 'journal_prompt', 'spotify_play_relaxing'],
        });
        // Research pattern
        this.patterns.push({
            trigger: /research|look up|find.*about/i,
            chain: ['web_search', 'notes_create', 'calendar_schedule_review'],
        });
        // Financial check pattern
        this.patterns.push({
            trigger: /finances|money|budget|spending/i,
            chain: ['finance_summary', 'transactions_recent', 'budget_status'],
        });
        // Health check pattern
        this.patterns.push({
            trigger: /health|wellness|how.*doing|check.*in/i,
            chain: ['mood_check', 'habit_status', 'wellness_summary'],
        });
        // Social planning pattern
        this.patterns.push({
            trigger: /meet.*friend|social|hang out|get together/i,
            chain: ['contacts_lookup', 'calendar_check_availability', 'message_compose'],
        });
        log.info({ patternCount: this.patterns.length }, 'Initialized chain patterns');
    }
    matchPattern(intent) {
        for (const pattern of this.patterns) {
            let matches = false;
            if (typeof pattern.trigger === 'string') {
                matches = intent.toLowerCase().includes(pattern.trigger.toLowerCase());
            }
            else {
                matches = pattern.trigger.test(intent);
            }
            if (matches) {
                return {
                    steps: pattern.chain.map((toolId, idx) => ({
                        toolId,
                        dependsOn: idx > 0 ? [idx - 1] : [],
                    })),
                    executionStrategy: 'sequential',
                    estimatedDuration: pattern.chain.length * 500, // ~500ms per tool
                    confidence: 0.85,
                };
            }
        }
        return null;
    }
    // ============================================================================
    // CO-OCCURRENCE LEARNING
    // ============================================================================
    updateCoOccurrence(from, to) {
        const key = from;
        let stats = this.coOccurrence.get(key);
        if (!stats) {
            stats = [];
            this.coOccurrence.set(key, stats);
        }
        // Find or create entry for this transition
        let entry = stats.find((s) => s.to === to);
        if (!entry) {
            entry = {
                from,
                to,
                count: 0,
                probability: 0,
                avgTimeBetween: 0,
            };
            stats.push(entry);
        }
        entry.count++;
        // Recalculate probabilities
        const totalCount = stats.reduce((sum, s) => sum + s.count, 0);
        for (const s of stats) {
            s.probability = s.count / totalCount;
        }
    }
    predictNextFromCoOccurrence(toolId) {
        const stats = this.coOccurrence.get(toolId);
        if (!stats || stats.length === 0) {
            return [];
        }
        return stats
            .filter((s) => s.probability > 0.1) // Minimum 10% probability
            .sort((a, b) => b.probability - a.probability)
            .map((s) => ({
            toolId: s.to,
            probability: s.probability,
        }));
    }
    // ============================================================================
    // USER PATTERNS
    // ============================================================================
    updateUserHistory(userId, toolId) {
        let history = this.userHistory.get(userId);
        if (!history) {
            history = {
                userId,
                chains: [],
            };
            this.userHistory.set(userId, history);
        }
        // Check if this extends the current chain or starts a new one
        const lastChain = history.chains[history.chains.length - 1];
        const now = new Date();
        if (lastChain) {
            const timeSinceLastUpdate = now.getTime() - lastChain.timestamp.getTime();
            if (timeSinceLastUpdate < 60000) {
                // Within 1 minute - extend chain
                lastChain.sequence.push(toolId);
                lastChain.timestamp = now;
                return;
            }
        }
        // Start new chain
        history.chains.push({
            sequence: [toolId],
            timestamp: now,
        });
        // Keep only last 100 chains
        if (history.chains.length > 100) {
            history.chains.shift();
        }
    }
    getUserPatterns(userId, currentTool) {
        const history = this.userHistory.get(userId);
        if (!history || history.chains.length === 0) {
            return [];
        }
        // Find chains that started with this tool
        const matchingChains = history.chains.filter((c) => c.sequence[0] === currentTool && c.sequence.length > 1);
        if (matchingChains.length === 0) {
            return [];
        }
        // Count what typically comes next
        const nextCounts = new Map();
        for (const chain of matchingChains) {
            const nextTool = chain.sequence[1];
            nextCounts.set(nextTool, (nextCounts.get(nextTool) || 0) + 1);
        }
        // Return sorted by frequency
        return Array.from(nextCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([toolId]) => toolId);
    }
    // ============================================================================
    // CHAIN BUILDING
    // ============================================================================
    buildChainFromSignals(primaryTool, coOccurrence, userPatterns, availableTools) {
        const steps = [{ toolId: primaryTool, dependsOn: [] }];
        const availableIds = new Set(availableTools.map((t) => t.id));
        // Add most likely next tool
        let nextTool = null;
        let confidence = 0;
        // Prefer user patterns if available
        if (userPatterns.length > 0 && availableIds.has(userPatterns[0])) {
            nextTool = userPatterns[0];
            confidence = 0.75; // User pattern confidence
        }
        else if (coOccurrence.length > 0 && availableIds.has(coOccurrence[0].toolId)) {
            nextTool = coOccurrence[0].toolId;
            confidence = coOccurrence[0].probability * 0.6; // Scale co-occurrence confidence
        }
        if (nextTool) {
            steps.push({
                toolId: nextTool,
                dependsOn: [0],
                optional: true, // Suggest but don't force
            });
            return {
                steps,
                executionStrategy: 'sequential',
                estimatedDuration: steps.length * 500,
                confidence,
            };
        }
        return null;
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let predictorInstance = null;
export function getChainPredictor() {
    if (!predictorInstance) {
        predictorInstance = new ToolChainPredictor();
    }
    return predictorInstance;
}
//# sourceMappingURL=tool-chain-predictor.js.map