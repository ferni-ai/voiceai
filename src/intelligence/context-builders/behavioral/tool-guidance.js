/**
 * Tool Guidance System
 *
 * This module provides guidance about WHEN to call tools, rather than
 * injecting all the data into context (which causes leakage).
 *
 * PHILOSOPHY:
 * - Instead of: "[MEMORY: User mentioned their dog Max, birthday is 3/15...]"
 * - We use: Tool `searchMemories` available. Call when referencing past conversations.
 *
 * The model learns to ASK for information rather than having it pre-loaded.
 * This eliminates leakage because the model only gets facts when it explicitly
 * requests them through tool calls.
 *
 * @module intelligence/context-builders/behavioral/tool-guidance
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'behavioral:tool-guidance' });
/**
 * Get the tools available for this session
 *
 * Note: We list tools as available and let the actual tool implementation
 * handle whether the user has connected the integration. This simplifies
 * the type system and provides consistent guidance.
 */
export async function getAvailableTools(_input) {
    const tools = [];
    // =========================================
    // MEMORY TOOLS (always available)
    // =========================================
    tools.push({
        category: 'memory',
        toolName: 'searchMemories',
        description: 'Search past conversations and learned facts',
        whenToUse: 'When you want to reference something from previous conversations or check what you know about them',
        available: true,
    });
    tools.push({
        category: 'memory',
        toolName: 'saveMemory',
        description: 'Save an important fact or moment for later',
        whenToUse: 'When they share something significant you want to remember',
        available: true,
    });
    // =========================================
    // CALENDAR TOOLS
    // =========================================
    tools.push({
        category: 'calendar',
        toolName: 'getCalendar',
        description: 'View their schedule for today or upcoming days',
        whenToUse: 'When they mention meetings, schedule, or being busy',
        available: true,
    });
    tools.push({
        category: 'calendar',
        toolName: 'createEvent',
        description: 'Add something to their calendar',
        whenToUse: 'When they want to schedule something or set a reminder',
        available: true,
    });
    // =========================================
    // MUSIC TOOLS
    // =========================================
    tools.push({
        category: 'music',
        toolName: 'playMusic',
        description: 'Play music based on mood or request',
        whenToUse: 'When they ask for music or you sense music would help',
        available: true,
    });
    // =========================================
    // PERSONA/HANDOFF TOOLS (always available)
    // =========================================
    tools.push({
        category: 'persona',
        toolName: 'handoff',
        description: 'Transfer to another team member (Maya, Peter, Jordan, Alex, Nayan)',
        whenToUse: 'When the conversation would benefit from a specialized perspective',
        available: true,
    });
    // =========================================
    // TASK TOOLS (always available)
    // =========================================
    tools.push({
        category: 'tasks',
        toolName: 'createCommitment',
        description: 'Record a commitment or action item',
        whenToUse: 'When they commit to doing something and want accountability',
        available: true,
    });
    tools.push({
        category: 'tasks',
        toolName: 'checkCommitments',
        description: 'Review their open commitments',
        whenToUse: 'When checking in on progress or accountability',
        available: true,
    });
    return tools;
}
// ============================================================================
// FORMATTING
// ============================================================================
/**
 * Format tool guidance for the prompt.
 *
 * This tells the model WHAT tools are available and WHEN to use them,
 * without pre-loading all the data that might leak.
 */
export function formatToolGuidance(tools) {
    if (tools.length === 0) {
        return '';
    }
    const lines = [];
    lines.push('## Available Tools');
    lines.push('');
    lines.push('Call these tools to get information rather than guessing:');
    lines.push('');
    // Group by category
    const byCategory = new Map();
    for (const tool of tools) {
        const list = byCategory.get(tool.category) || [];
        list.push(tool);
        byCategory.set(tool.category, list);
    }
    for (const [category, categoryTools] of byCategory) {
        lines.push(`### ${categoryLabel(category)}`);
        for (const tool of categoryTools) {
            lines.push(`- **${tool.toolName}**: ${tool.description}`);
            lines.push(`  *Use when:* ${tool.whenToUse}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
function categoryLabel(category) {
    const labels = {
        memory: 'Memory & History',
        calendar: 'Calendar',
        external: 'Real-Time Data',
        persona: 'Team',
        music: 'Music',
        tasks: 'Tasks & Commitments',
        biometrics: 'Health Data',
    };
    return labels[category] || category;
}
/**
 * Compact tool list for system prompt
 */
export function formatToolsCompact(tools) {
    const toolNames = tools.map((t) => t.toolName);
    return `[TOOLS: ${toolNames.join(', ')}]`;
}
import { createCallback } from './signals.js';
/**
 * Analyze context and suggest tools the model might want to use.
 *
 * Instead of pre-loading data, we suggest "you might want to call X".
 */
export function suggestTools(input, availableTools) {
    const suggestions = [];
    const userText = input.userText?.toLowerCase() || '';
    const topics = input.analysis?.topics?.detected || [];
    // =========================================
    // MEMORY SUGGESTIONS
    // =========================================
    const memoryTriggers = [
        'remember',
        'last time',
        'before',
        'we talked about',
        'mentioned',
        'you said',
        'i told you',
    ];
    const hasMemoryTrigger = memoryTriggers.some((t) => userText.includes(t));
    if (hasMemoryTrigger && availableTools.some((t) => t.toolName === 'searchMemories')) {
        suggestions.push(createCallback('pattern', 'They referenced the past. Consider calling searchMemories to recall relevant context.', 'natural'));
    }
    // =========================================
    // CALENDAR SUGGESTIONS
    // =========================================
    const calendarTriggers = [
        'schedule',
        'meeting',
        'busy',
        'free',
        'calendar',
        'appointment',
        'tomorrow',
        'this week',
    ];
    const hasCalendarTrigger = calendarTriggers.some((t) => userText.includes(t));
    if (hasCalendarTrigger && availableTools.some((t) => t.toolName === 'getCalendar')) {
        suggestions.push(createCallback('pattern', 'They mentioned schedule/time. Consider checking their calendar.', 'natural'));
    }
    // =========================================
    // MUSIC SUGGESTIONS
    // =========================================
    const musicTriggers = ['music', 'song', 'playlist', 'play', 'listen'];
    const hasMusicTrigger = musicTriggers.some((t) => userText.includes(t));
    if (hasMusicTrigger && availableTools.some((t) => t.toolName === 'playMusic')) {
        suggestions.push(createCallback('pattern', 'They mentioned music. You can play something for them.', 'natural'));
    }
    // =========================================
    // COMMITMENT SUGGESTIONS
    // =========================================
    const commitmentPatterns = [
        'i will',
        'i promise',
        "i'm going to",
        'i need to',
        'i should',
        'remind me',
        'hold me accountable',
    ];
    const hasCommitmentTrigger = commitmentPatterns.some((p) => userText.includes(p));
    if (hasCommitmentTrigger && availableTools.some((t) => t.toolName === 'createCommitment')) {
        suggestions.push(createCallback('pattern', 'They made a commitment. Consider using createCommitment for accountability.', 'subtle'));
    }
    // =========================================
    // HANDOFF SUGGESTIONS (based on topic)
    // =========================================
    const handoffTopics = {
        habits: 'Maya',
        routine: 'Maya',
        research: 'Peter',
        data: 'Peter',
        communication: 'Alex',
        relationships: 'Alex',
        planning: 'Jordan',
        event: 'Jordan',
        milestone: 'Jordan',
        philosophy: 'Nayan',
        meaning: 'Nayan',
        purpose: 'Nayan',
    };
    for (const topic of topics) {
        const specialist = handoffTopics[topic.toLowerCase()];
        if (specialist && availableTools.some((t) => t.toolName === 'handoff')) {
            suggestions.push(createCallback('pattern', `Topic "${topic}" might benefit from ${specialist}'s perspective.`, 'subtle'));
            break; // Only one handoff suggestion
        }
    }
    return suggestions;
}
//# sourceMappingURL=tool-guidance.js.map