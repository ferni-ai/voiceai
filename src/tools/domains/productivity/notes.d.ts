/**
 * Notes & Journaling Tool
 *
 * Quick note capture and daily journaling for voice-first interaction.
 *
 * Features:
 * - Quick voice notes
 * - Daily journal entries
 * - Gratitude journaling
 * - Tag-based organization
 * - Search and recall
 */
import { llm } from '@livekit/agents';
export type NoteType = 'quick' | 'journal' | 'gratitude' | 'reflection' | 'idea' | 'reminder';
export interface Note {
    id: string;
    userId: string;
    type: NoteType;
    content: string;
    title?: string;
    tags: string[];
    mood?: number;
    linkedDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface JournalEntry {
    id: string;
    userId: string;
    date: Date;
    gratitudes: string[];
    highlight?: string;
    challenge?: string;
    learnings?: string;
    tomorrowIntention?: string;
    mood: number;
    notes?: string;
    createdAt: Date;
}
declare function getUserNotes(userId: string, type?: NoteType): Note[];
declare function getTodayJournal(userId: string): JournalEntry | null;
declare function getJournalStreak(userId: string): number;
export declare function createNote(params: {
    userId: string;
    content: string;
    type?: NoteType;
    title?: string;
    tags?: string[];
    mood?: number;
}): Note;
export declare function createJournalEntry(params: {
    userId: string;
    gratitudes?: string[];
    highlight?: string;
    challenge?: string;
    learnings?: string;
    tomorrowIntention?: string;
    mood: number;
    notes?: string;
}): JournalEntry;
export { getTodayJournal, getJournalStreak, getUserNotes };
export declare function createNotesTools(): {
    saveNote: llm.FunctionTool<{
        content: string;
        type: "reflection" | "quick" | "reminder" | "idea";
        title?: string | undefined;
        tags?: string[] | undefined;
    }, unknown, string>;
    getRecentNotes: llm.FunctionTool<{
        limit: number;
        type: "reflection" | "all" | "quick" | "reminder" | "idea";
    }, unknown, string>;
    searchNotes: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    startJournal: llm.FunctionTool<{
        type: "morning" | "evening" | "gratitude";
    }, unknown, string>;
    addGratitude: llm.FunctionTool<{
        gratitudes: string[];
    }, unknown, string>;
    recordMood: llm.FunctionTool<{
        mood: number;
        notes?: string | undefined;
    }, unknown, string>;
    completeJournal: llm.FunctionTool<{
        mood: number;
        highlight?: string | undefined;
        challenge?: string | undefined;
        learnings?: string | undefined;
        tomorrowIntention?: string | undefined;
    }, unknown, string>;
    getJournalHistory: llm.FunctionTool<{
        days: number;
    }, unknown, string>;
    getJournalPrompt: llm.FunctionTool<{
        type: "reflection" | "morning" | "gratitude";
    }, unknown, string>;
};
export default createNotesTools;
//# sourceMappingURL=notes.d.ts.map