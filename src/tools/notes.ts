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
import { z } from 'zod';
import { sanitizePlainText } from './validation.js';
import {
  getProductivityStore,
  type NoteData,
  type JournalEntryData,
} from '../services/productivity-store.js';
import { getLogger, generateId } from './utils/tool-helpers.js';

import { getToolDescription } from './utils/tool-descriptions.js';
// Bridge functions for persistence
function noteDataToNote(data: NoteData, userId: string): Note {
  return {
    id: data.id,
    userId,
    type: data.type as NoteType,
    content: data.content,
    title: data.title,
    tags: data.tags,
    mood: data.mood,
    linkedDate: data.linkedDate ? new Date(data.linkedDate) : undefined,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function noteToNoteData(note: Note): NoteData {
  return {
    id: note.id,
    type: note.type,
    content: note.content,
    title: note.title,
    tags: note.tags,
    mood: note.mood,
    linkedDate: note.linkedDate?.toISOString(),
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function journalDataToJournal(data: JournalEntryData, userId: string): JournalEntry {
  return {
    id: data.id,
    userId,
    date: new Date(data.date),
    gratitudes: data.gratitudes,
    highlight: data.highlight,
    challenge: data.challenge,
    learnings: data.learnings,
    tomorrowIntention: data.tomorrowIntention,
    mood: data.mood,
    notes: data.notes,
    createdAt: new Date(data.createdAt),
  };
}

function journalToJournalData(journal: JournalEntry): JournalEntryData {
  return {
    id: journal.id,
    date: journal.date.toISOString(),
    gratitudes: journal.gratitudes,
    highlight: journal.highlight,
    challenge: journal.challenge,
    learnings: journal.learnings,
    tomorrowIntention: journal.tomorrowIntention,
    mood: journal.mood,
    notes: journal.notes,
    createdAt: journal.createdAt.toISOString(),
  };
}

// ============================================================================
// TYPES
// ============================================================================

export type NoteType = 'quick' | 'journal' | 'gratitude' | 'reflection' | 'idea' | 'reminder';

export interface Note {
  id: string;
  userId: string;
  type: NoteType;
  content: string;
  title?: string;
  tags: string[];
  mood?: number; // 1-5 scale
  linkedDate?: Date; // For journal entries
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntry {
  id: string;
  userId: string;
  date: Date;
  gratitudes: string[]; // 3 things grateful for
  highlight?: string; // Best part of day
  challenge?: string; // Biggest challenge
  learnings?: string; // What I learned
  tomorrowIntention?: string;
  mood: number; // 1-5
  notes?: string;
  createdAt: Date;
}

// ============================================================================
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================

const notesCache = new Map<string, Note>();
const journalsCache = new Map<string, JournalEntry>();
const loadedUsers = new Set<string>();

async function ensureUserNotesLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const noteDataList = store.getUserNotes(userId);
    for (const data of noteDataList) {
      notesCache.set(data.id, noteDataToNote(data, userId));
    }

    const journalDataList = store.getUserJournals(userId);
    for (const data of journalDataList) {
      journalsCache.set(data.id, journalDataToJournal(data, userId));
    }

    loadedUsers.add(userId);
    getLogger().debug({ userId, notes: noteDataList.length }, 'Loaded notes from store');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load notes from store');
    loadedUsers.add(userId);
  }
}

function persistNote(userId: string, note: Note): void {
  try {
    const store = getProductivityStore();
    store.setNote(userId, noteToNoteData(note));
  } catch (error) {
    getLogger().warn({ error, noteId: note.id }, 'Failed to persist note');
  }
}

function persistJournal(userId: string, journal: JournalEntry): void {
  try {
    const store = getProductivityStore();
    store.setJournal(userId, journalToJournalData(journal));
  } catch (error) {
    getLogger().warn({ error, journalId: journal.id }, 'Failed to persist journal');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getUserNotes(userId: string, type?: NoteType): Note[] {
  return Array.from(notesCache.values())
    .filter((n) => n.userId === userId && (!type || n.type === type))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function searchUserNotes(userId: string, query: string): Note[] {
  const lower = query.toLowerCase();
  return getUserNotes(userId).filter(
    (n) =>
      n.content.toLowerCase().includes(lower) ||
      n.title?.toLowerCase().includes(lower) ||
      n.tags.some((t) => t.toLowerCase().includes(lower))
  );
}

function getTodayJournal(userId: string): JournalEntry | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    Array.from(journalsCache.values()).find((j) => {
      if (j.userId !== userId) return false;
      const entryDate = new Date(j.date);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate.getTime() === today.getTime();
    }) || null
  );
}

function getRecentJournals(userId: string, days = 7): JournalEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return Array.from(journalsCache.values())
    .filter((j) => j.userId === userId && j.date >= cutoff)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

function getJournalStreak(userId: string): number {
  const entries = Array.from(journalsCache.values())
    .filter((j) => j.userId === userId)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (entries.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 60; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    checkDate.setHours(0, 0, 0, 0);

    const hasEntry = entries.some((e) => {
      const entryDate = new Date(e.date);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate.getTime() === checkDate.getTime();
    });

    if (hasEntry) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return streak;
}

const MOOD_EMOJI: Record<number, string> = {
  1: '😔',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😊',
};

/**
 * Legacy static journal prompts - used as fallback
 * New code should use generateDynamicPrompt() from journaling-prompts.ts
 */
const JOURNAL_PROMPTS: Record<string, string[]> = {
  gratitude: [
    'What made you smile today?',
    'Who helped you today?',
    'What simple pleasure did you enjoy?',
    'What challenge taught you something?',
    "What's working well in your life right now?",
  ],
  reflection: [
    'What was the best part of today?',
    'What would you do differently?',
    'What surprised you today?',
    'How did you take care of yourself?',
    'What are you looking forward to tomorrow?',
  ],
  morning: [
    'What are your top 3 priorities today?',
    'What would make today great?',
    "What's one thing you're grateful for this morning?",
    'How do you want to feel by the end of today?',
  ],
};

// Note: For dynamic journal prompts, use:
// import { generateDynamicPrompt } from '../services/trust-systems/journaling-prompts.js';

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export function createNote(params: {
  userId: string;
  content: string;
  type?: NoteType;
  title?: string;
  tags?: string[];
  mood?: number;
}): Note {
  const note: Note = {
    id: generateId('note'),
    userId: params.userId,
    type: params.type || 'quick',
    content: sanitizePlainText(params.content, 5000),
    title: params.title ? sanitizePlainText(params.title, 200) : undefined,
    tags: params.tags || [],
    mood: params.mood,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save to cache and persist
  notesCache.set(note.id, note);
  persistNote(params.userId, note);

  getLogger().info(
    { noteId: note.id, type: note.type, length: note.content.length },
    '📝 Note created'
  );

  return note;
}

export function createJournalEntry(params: {
  userId: string;
  gratitudes?: string[];
  highlight?: string;
  challenge?: string;
  learnings?: string;
  tomorrowIntention?: string;
  mood: number;
  notes?: string;
}): JournalEntry {
  // Check if today's entry exists
  const existing = getTodayJournal(params.userId);
  if (existing) {
    // Update existing
    if (params.gratitudes) existing.gratitudes = params.gratitudes;
    if (params.highlight) existing.highlight = params.highlight;
    if (params.challenge) existing.challenge = params.challenge;
    if (params.learnings) existing.learnings = params.learnings;
    if (params.tomorrowIntention) existing.tomorrowIntention = params.tomorrowIntention;
    if (params.mood) existing.mood = params.mood;
    if (params.notes) existing.notes = params.notes;

    // Save to cache and persist
    journalsCache.set(existing.id, existing);
    persistJournal(params.userId, existing);
    return existing;
  }

  const entry: JournalEntry = {
    id: generateId('journal'),
    userId: params.userId,
    date: new Date(),
    gratitudes: params.gratitudes || [],
    highlight: params.highlight,
    challenge: params.challenge,
    learnings: params.learnings,
    tomorrowIntention: params.tomorrowIntention,
    mood: params.mood,
    notes: params.notes,
    createdAt: new Date(),
  };

  // Save to cache and persist
  journalsCache.set(entry.id, entry);
  persistJournal(params.userId, entry);

  getLogger().info({ entryId: entry.id, mood: entry.mood }, '📓 Journal entry created');

  return entry;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

// Export helper functions for use by other modules
export { getTodayJournal, getJournalStreak, getUserNotes };

export function createNotesTools() {
  return {
    saveNote: llm.tool({
      description: getToolDescription('saveNote'),
      parameters: z.object({
        content: z.string().describe('The note content'),
        title: z.string().optional().describe('Optional title'),
        type: z.enum(['quick', 'idea', 'reminder', 'reflection']).optional().default('quick'),
        tags: z.array(z.string()).optional().describe('Tags for organization'),
      }),
      execute: async ({ content, title, type, tags }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const note = createNote({
          userId,
          content,
          title,
          type,
          tags,
        });

        const typeEmoji: Record<NoteType, string> = {
          quick: '📝',
          idea: '💡',
          reminder: '⏰',
          reflection: '🤔',
          journal: '📓',
          gratitude: '🙏',
        };
        const emoji = typeEmoji[note.type] || '📝';

        let response = `${emoji} Saved: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}"`;
        if (tags && tags.length > 0) {
          response += `\nTags: ${tags.map((t) => `#${t}`).join(' ')}`;
        }

        return response;
      },
    }),

    getRecentNotes: llm.tool({
      description: getToolDescription('getRecentNotes'),
      parameters: z.object({
        limit: z.number().optional().default(5),
        type: z.enum(['quick', 'idea', 'reminder', 'reflection', 'all']).optional().default('all'),
      }),
      execute: async ({ limit, type }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const userNotes = type === 'all' ? getUserNotes(userId) : getUserNotes(userId, type);

        if (userNotes.length === 0) {
          return `No notes found. Say "note to self" followed by anything you want to remember!`;
        }

        let response = `📝 **Recent Notes** (${Math.min(limit, userNotes.length)} of ${userNotes.length})\n\n`;

        userNotes.slice(0, limit).forEach((note, i) => {
          const date = note.createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          const preview =
            note.content.length > 60 ? `${note.content.slice(0, 60)}...` : note.content;
          response += `${i + 1}. ${note.title || preview} (${date})\n`;
        });

        return response;
      },
    }),

    searchNotes: llm.tool({
      description: getToolDescription('searchNotes'),
      parameters: z.object({
        query: z.string().describe('What to search for'),
      }),
      execute: async ({ query }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const results = searchUserNotes(userId, query);

        if (results.length === 0) {
          return `No notes found matching "${query}".`;
        }

        let response = `🔍 Found ${results.length} note${results.length > 1 ? 's' : ''} for "${query}":\n\n`;

        results.slice(0, 5).forEach((note, i) => {
          const date = note.createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          response += `${i + 1}. ${note.content.slice(0, 100)}${note.content.length > 100 ? '...' : ''}\n   (${date})\n\n`;
        });

        return response;
      },
    }),

    startJournal: llm.tool({
      description: getToolDescription('startJournal'),
      parameters: z.object({
        type: z
          .enum(['evening', 'morning', 'gratitude'])
          .optional()
          .default('evening')
          .describe('Type of journaling'),
      }),
      execute: async ({ type }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const existing = getTodayJournal(userId);
        const streak = getJournalStreak(userId);

        let response = `📓 **${type === 'morning' ? 'Morning' : type === 'gratitude' ? 'Gratitude' : 'Evening'} Journal**\n\n`;

        if (streak > 0) {
          response += `🔥 ${streak} day journaling streak!\n\n`;
        }

        if (existing && type !== 'morning') {
          response += `You've already started today's entry. Let's add to it!\n\n`;
        }

        const prompts =
          JOURNAL_PROMPTS[
            type === 'evening' ? 'reflection' : type === 'morning' ? 'morning' : 'gratitude'
          ];
        const prompt = prompts[Math.floor(Math.random() * prompts.length)];

        response += `**${prompt}**`;

        return response;
      },
    }),

    addGratitude: llm.tool({
      description: getToolDescription('addGratitude'),
      parameters: z.object({
        gratitudes: z.array(z.string()).min(1).max(5).describe('Things to be grateful for'),
      }),
      execute: async ({ gratitudes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const entry = createJournalEntry({
          userId,
          gratitudes,
          mood: 4, // Default positive mood
        });

        let response = `🙏 **Gratitude Recorded**\n\n`;
        gratitudes.forEach((g, i) => {
          response += `${i + 1}. ${g}\n`;
        });

        const streak = getJournalStreak(userId);
        if (streak > 1) {
          response += `\n🔥 ${streak} day streak! Keep it up!`;
        }

        return response;
      },
    }),

    recordMood: llm.tool({
      description: getToolDescription('recordMood'),
      parameters: z.object({
        mood: z.number().min(1).max(5).describe('Mood 1-5 (1=low, 5=great)'),
        notes: z.string().optional().describe('Any additional context'),
      }),
      execute: async ({ mood, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const entry = createJournalEntry({
          userId,
          mood,
          notes,
        });

        const emoji = MOOD_EMOJI[mood];

        let response = `${emoji} Mood recorded: ${mood}/5\n`;
        if (notes) {
          response += `Note: ${notes}\n`;
        }

        // Get recent mood trend
        const recent = getRecentJournals(userId, 7);
        if (recent.length > 1) {
          const avgMood = recent.reduce((sum, e) => sum + e.mood, 0) / recent.length;
          response += `\n📊 Week average: ${avgMood.toFixed(1)}/5`;
        }

        return response;
      },
    }),

    completeJournal: llm.tool({
      description: getToolDescription('completeJournal'),
      parameters: z.object({
        highlight: z.string().optional().describe('Best part of the day'),
        challenge: z.string().optional().describe('Biggest challenge'),
        learnings: z.string().optional().describe('What you learned'),
        tomorrowIntention: z.string().optional().describe('Intention for tomorrow'),
        mood: z.number().min(1).max(5).describe('Overall mood 1-5'),
      }),
      execute: async ({ highlight, challenge, learnings, tomorrowIntention, mood }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const entry = createJournalEntry({
          userId,
          highlight,
          challenge,
          learnings,
          tomorrowIntention,
          mood,
        });

        const emoji = MOOD_EMOJI[mood];

        let response = `📓 **Journal Entry Complete** ${emoji}\n\n`;

        if (highlight) response += `✨ **Highlight:** ${highlight}\n`;
        if (challenge) response += `💪 **Challenge:** ${challenge}\n`;
        if (learnings) response += `📚 **Learned:** ${learnings}\n`;
        if (tomorrowIntention) response += `🎯 **Tomorrow:** ${tomorrowIntention}\n`;

        const streak = getJournalStreak(userId);
        response += `\n🔥 ${streak} day journaling streak!`;

        return response;
      },
    }),

    getJournalHistory: llm.tool({
      description: getToolDescription('getJournalHistory'),
      parameters: z.object({
        days: z.number().optional().default(7).describe('How many days back'),
      }),
      execute: async ({ days }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserNotesLoaded(userId);
        const entries = getRecentJournals(userId, days);

        if (entries.length === 0) {
          return `No journal entries in the last ${days} days. Ready to start? Say "let's journal"!`;
        }

        let response = `📓 **Journal History** (${entries.length} entries)\n\n`;

        entries.forEach((entry) => {
          const date = entry.date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          const emoji = MOOD_EMOJI[entry.mood];

          response += `**${date}** ${emoji}\n`;
          if (entry.gratitudes.length > 0) {
            response += `  🙏 ${entry.gratitudes[0]}${entry.gratitudes.length > 1 ? ` (+${entry.gratitudes.length - 1} more)` : ''}\n`;
          }
          if (entry.highlight) {
            response += `  ✨ ${entry.highlight.slice(0, 50)}${entry.highlight.length > 50 ? '...' : ''}\n`;
          }
          response += '\n';
        });

        // Mood trend
        const avgMood = entries.reduce((sum, e) => sum + e.mood, 0) / entries.length;
        response += `📊 Average mood: ${avgMood.toFixed(1)}/5`;

        return response;
      },
    }),

    getJournalPrompt: llm.tool({
      description: getToolDescription('getJournalPrompt'),
      parameters: z.object({
        type: z.enum(['gratitude', 'reflection', 'morning']).optional().default('reflection'),
      }),
      execute: async ({ type }) => {
        const prompts = JOURNAL_PROMPTS[type];
        const prompt = prompts[Math.floor(Math.random() * prompts.length)];

        return `✨ **Journal Prompt:**\n\n${prompt}`;
      },
    }),
  };
}

export default createNotesTools;
