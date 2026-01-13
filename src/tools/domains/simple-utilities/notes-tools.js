/**
 * Quick Notes Utilities
 *
 * Session-only quick notes for temporary reminders.
 *
 * @module simple-utilities/notes-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { quickNotes } from './shared-state.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const quickNoteDef = {
    id: 'quickNote',
    name: 'Quick Note',
    description: 'Save a quick transient note for this session',
    domain: 'simple-utilities',
    tags: ['note', 'remember', 'quick', 'temp'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('quickNote'),
            parameters: z.object({
                note: z.string().describe('The note to remember'),
            }),
            execute: async ({ note }, { ctx: toolCtx }) => {
                const userData = toolCtx.userData;
                const userId = userData?.userId || 'session';
                if (!quickNotes.has(userId)) {
                    quickNotes.set(userId, []);
                }
                const notes = quickNotes.get(userId);
                notes.push({ note, createdAt: new Date() });
                // Keep only last 10 notes
                if (notes.length > 10) {
                    notes.shift();
                }
                return `📝 Got it: "${note}"`;
            },
        });
    },
};
const recallNoteDef = {
    id: 'recallNote',
    name: 'Recall Note',
    description: 'Recall quick notes from this session',
    domain: 'simple-utilities',
    tags: ['note', 'recall', 'remember'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('recallNote'),
            parameters: z.object({
                search: z.string().optional().describe('Search term to filter notes'),
            }),
            execute: async ({ search }, { ctx: toolCtx }) => {
                const userData = toolCtx.userData;
                const userId = userData?.userId || 'session';
                const notes = quickNotes.get(userId) || [];
                if (notes.length === 0) {
                    return "You haven't saved any quick notes this session.";
                }
                let filtered = notes;
                if (search) {
                    const searchLower = search.toLowerCase();
                    filtered = notes.filter((n) => n.note.toLowerCase().includes(searchLower));
                }
                if (filtered.length === 0) {
                    return `No notes matching "${search}". Your notes: ${notes.map((n) => n.note).join(', ')}`;
                }
                if (filtered.length === 1) {
                    return `📝 ${filtered[0].note}`;
                }
                return `📝 Your notes:\n${filtered.map((n, i) => `${i + 1}. ${n.note}`).join('\n')}`;
            },
        });
    },
};
const clearNotesDef = {
    id: 'clearNotes',
    name: 'Clear Notes',
    description: 'Clear all quick notes',
    domain: 'simple-utilities',
    tags: ['note', 'clear', 'delete'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('clearNotes'),
            parameters: z.object({}),
            execute: async (_, { ctx: toolCtx }) => {
                const userData = toolCtx.userData;
                const userId = userData?.userId || 'session';
                quickNotes.delete(userId);
                return '📝 All quick notes cleared.';
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const notesToolDefinitions = [quickNoteDef, recallNoteDef, clearNotesDef];
export { quickNoteDef, recallNoteDef, clearNotesDef };
//# sourceMappingURL=notes-tools.js.map