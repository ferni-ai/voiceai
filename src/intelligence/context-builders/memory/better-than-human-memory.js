/**
 * Better Than Human Memory Context Builder
 *
 * The unified memory context builder that brings together:
 * - Proactive surfacing with timing intelligence
 * - Natural phrasing for human-like callbacks
 * - Learning from feedback
 * - Graph-based association
 *
 * This replaces fragmented memory context builders with a single,
 * coherent source of memory context.
 *
 * @module intelligence/context-builders/memory/better-than-human-memory
 */
// Note: Deep imports are necessary here as context builders live in nested directory
import { buildProactiveMemoryContext, } from '../../../services/proactive-memory-surfacing.js';
import { getUnifiedMemoryService, } from '../../../services/unified-memory-service.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createHintInjection, createStandardInjection, registerContextBuilder } from '../index.js';
const log = createLogger({ module: 'BetterThanHumanMemory' });
const DEFAULT_CONFIG = {
    minTurnForProactive: 3,
    maxInjectionsPerTurn: 2,
    enableGraphTraversal: true,
    enableLearning: true,
};
let config = { ...DEFAULT_CONFIG };
export function configureBetterThanHumanMemory(newConfig) {
    config = { ...config, ...newConfig };
}
// ============================================================================
// HELPERS
// ============================================================================
function extractPersonMention(text) {
    const personPatterns = [
        /my (mom|dad|mother|father|sister|brother|wife|husband|partner|friend|boss|colleague|son|daughter)/i,
        /(?:my friend |my coworker |my partner )(\w+)/i,
    ];
    for (const pattern of personPatterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
            return match[1];
        }
    }
    return undefined;
}
function formatReactiveMemories(memories) {
    if (memories.length === 0)
        return null;
    const topMemories = memories.slice(0, 2);
    const formatted = topMemories
        .map((m) => {
        const confidence = m.connectionStrength === 'strong'
            ? ' (strong match)'
            : m.connectionStrength === 'moderate'
                ? ' (moderate match)'
                : '';
        return `• ${m.item.content.slice(0, 200)}${confidence}`;
    })
        .join('\n');
    return `[RELEVANT MEMORIES - May be useful for this response]
${formatted}

Use these only if genuinely relevant to what they're saying.`;
}
function formatCallbackSuggestions(callbacks) {
    if (callbacks.length === 0)
        return null;
    const suggestions = callbacks.slice(0, 2).join('\n• ');
    return `[POTENTIAL CALLBACKS - Natural ways to reference memory]
• ${suggestions}

These are just ideas - find your own natural way to make the connection.`;
}
function buildGreeting(sessionCount) {
    if (sessionCount > 10) {
        return `[RETURNING USER - ${sessionCount} conversations]`;
    }
    if (sessionCount > 0) {
        return `[DEVELOPING RELATIONSHIP - ${sessionCount} conversations]`;
    }
    return '[NEW USER - First conversation]';
}
// ============================================================================
// SESSION START CONTEXT
// ============================================================================
async function buildSessionStartContext(userId, userProfile) {
    try {
        const unifiedMemory = getUnifiedMemoryService();
        const recallContext = {
            userId,
            currentInput: '',
            turnNumber: 0,
            sessionId: `session_${userId}_${Date.now()}`,
        };
        const recallResult = await unifiedMemory.simpleRecall(recallContext);
        if (recallResult.primaryMemories.length === 0) {
            return null;
        }
        const sessionCount = userProfile?.totalConversations ?? 0;
        const userName = userProfile?.name;
        const primingMemories = recallResult.primaryMemories.slice(0, 3);
        const formatted = primingMemories.map((m) => `• ${m.item.content.slice(0, 150)}`).join('\n');
        const greeting = buildGreeting(sessionCount);
        return createStandardInjection('session_priming', `${greeting}
${userName ?? ''}

[MEMORIES TO DRAW ON - Reference naturally as conversation develops]
${formatted}

Remember: Don't dump these memories upfront. Weave them in naturally as topics arise.`);
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Session priming failed');
        return null;
    }
}
// ============================================================================
// PROACTIVE SURFACING
// ============================================================================
async function buildProactiveSurfacing(surfacingContext, turnCount) {
    if (turnCount < config.minTurnForProactive) {
        return null;
    }
    const proactiveContext = await buildProactiveMemoryContext(surfacingContext);
    if (!proactiveContext) {
        return null;
    }
    return createHintInjection('proactive_memory', proactiveContext, {
        category: BuilderCategory.MEMORY,
    });
}
// ============================================================================
// REACTIVE RETRIEVAL
// ============================================================================
async function buildReactiveMemories(recallContext, currentInjectionCount) {
    const injections = [];
    if (currentInjectionCount >= config.maxInjectionsPerTurn) {
        return injections;
    }
    const unifiedMemory = getUnifiedMemoryService();
    const recallResult = await unifiedMemory.simpleRecall(recallContext);
    // Add reactive memories
    if (recallResult.primaryMemories.length > 0) {
        const reactiveContext = formatReactiveMemories(recallResult.primaryMemories);
        if (reactiveContext !== null) {
            injections.push(createStandardInjection('reactive_memory', reactiveContext, {
                category: BuilderCategory.MEMORY,
            }));
        }
    }
    // Add callback suggestions if room
    const hasCallbacks = recallResult.callbacks !== undefined && recallResult.callbacks.length > 0;
    const hasRoom = currentInjectionCount + injections.length < config.maxInjectionsPerTurn;
    if (hasCallbacks && hasRoom) {
        const callbackContext = formatCallbackSuggestions(recallResult.callbacks.map((c) => c.suggestedReference));
        if (callbackContext !== null) {
            injections.push(createHintInjection('memory_callback', callbackContext, {
                category: BuilderCategory.MEMORY,
            }));
        }
    }
    return injections;
}
// ============================================================================
// SURFACING CONTEXT BUILDER
// ============================================================================
function buildSurfacingContext(input, turnCount, userId) {
    const { userText, services, persona, analysis } = input;
    return {
        userId,
        currentInput: userText,
        currentEmotion: analysis?.emotion?.primary,
        currentTopic: analysis?.topics?.primary ?? analysis?.topics?.detected?.[0],
        personaId: persona?.id ?? 'ferni',
        turnNumber: turnCount,
        sessionId: services?.sessionId ?? `session_${userId}_${Date.now()}`,
        recentTopics: analysis?.topics?.detected,
        personMentioned: extractPersonMention(userText),
    };
}
// ============================================================================
// MAIN BUILDER
// ============================================================================
async function buildBetterThanHumanMemoryContext(input) {
    const { userText, services, userData, userProfile, analysis } = input;
    const userId = services?.userId;
    const turnCount = userData?.turnCount ?? 0;
    if (userId === undefined || userId === null) {
        return [];
    }
    try {
        // Session start: return priming only
        if (turnCount === 0) {
            const profileData = userProfile
                ? { name: userProfile.name, totalConversations: userProfile.totalConversations }
                : undefined;
            const primingContext = await buildSessionStartContext(userId, profileData);
            return primingContext !== null ? [primingContext] : [];
        }
        const surfacingContext = buildSurfacingContext(input, turnCount, userId);
        const injections = [];
        // Proactive surfacing
        const proactiveInjection = await buildProactiveSurfacing(surfacingContext, turnCount);
        if (proactiveInjection !== null) {
            injections.push(proactiveInjection);
        }
        // Reactive memories
        const recallContext = {
            userId,
            currentInput: userText,
            currentEmotion: analysis?.emotion?.primary,
            currentTopic: surfacingContext.currentTopic,
            turnNumber: turnCount,
            sessionId: surfacingContext.sessionId,
            personaId: surfacingContext.personaId,
        };
        const reactiveInjections = await buildReactiveMemories(recallContext, injections.length);
        injections.push(...reactiveInjections);
        if (injections.length > 0) {
            log.debug({
                userId,
                turnCount,
                injectionCount: injections.length,
                types: injections.map((i) => i.id),
            }, '🧠 Better Than Human memory context built');
        }
        return injections;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Memory context building failed');
        return [];
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export { buildBetterThanHumanMemoryContext, buildBetterThanHumanMemoryContext as default };
export const betterThanHumanMemoryBuilder = {
    name: 'better_than_human_memory',
    description: 'Unified memory context with proactive surfacing, timing intelligence, and learning',
    build: buildBetterThanHumanMemoryContext,
    priority: 25,
    category: BuilderCategory.MEMORY,
};
registerContextBuilder(betterThanHumanMemoryBuilder);
//# sourceMappingURL=better-than-human-memory.js.map