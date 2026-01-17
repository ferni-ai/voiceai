/**
 * Voice Memos Tools
 *
 * Record, save, and playback voice memos using Google Cloud Storage.
 * Simple voice notes that users can capture and retrieve later.
 *
 * @module simple-utilities/voice-memos-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceMemo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  audioUrl?: string;
  duration?: number; // seconds
  transcript?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

// In-memory memo storage (fallback if Firestore unavailable)
const memoCache = new Map<string, VoiceMemo[]>();

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Get memos from Firestore or cache
 */
async function getMemos(userId: string): Promise<VoiceMemo[]> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('voice_memos')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as VoiceMemo[];
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load memos from Firestore, using cache');
  }

  return memoCache.get(userId) || [];
}

/**
 * Save memo to Firestore or cache
 */
async function saveMemo(memo: VoiceMemo): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(memo.userId)
        .collection('voice_memos')
        .doc(memo.id)
        .set(cleanForFirestore(memo));
      log.info({ memoId: memo.id, userId: memo.userId }, '📝 Voice memo saved to Firestore');
      return;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to save memo to Firestore, using cache');
  }

  // Fallback to in-memory
  const existing = memoCache.get(memo.userId) || [];
  existing.unshift(memo);
  memoCache.set(memo.userId, existing.slice(0, 50)); // Keep last 50
}

/**
 * Delete memo from Firestore or cache
 */
async function deleteMemo(userId: string, memoId: string): Promise<boolean> {
  try {
    const db = getFirestoreDb();
    if (db) {
      await db.collection('bogle_users').doc(userId).collection('voice_memos').doc(memoId).delete();
      log.info({ memoId, userId }, '🗑️ Voice memo deleted from Firestore');
      return true;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to delete memo from Firestore');
  }

  // Fallback to in-memory
  const existing = memoCache.get(userId) || [];
  const filtered = existing.filter((m) => m.id !== memoId);
  if (filtered.length !== existing.length) {
    memoCache.set(userId, filtered);
    return true;
  }
  return false;
}

/**
 * Generate unique memo ID
 */
function generateMemoId(): string {
  return `memo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Format relative time
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Save a voice memo
 */
export const saveVoiceMemoDef: ToolDefinition = {
  id: 'saveVoiceMemo',
  name: 'Save Voice Memo',
  description: 'Save a voice memo with a title and optional transcript.',
  domain: 'simple-utilities',
  tags: ['voice', 'memo', 'recording', 'note', 'save'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save a voice memo. Used when the user wants to record or save a quick audio note or reminder.`,
      parameters: z.object({
        title: z.string().describe('Title or subject of the memo'),
        transcript: z.string().optional().describe('The spoken content or transcript of the memo'),
        tags: z.array(z.string()).optional().describe('Optional tags for organization'),
      }),
      execute: async ({ title, transcript, tags }) => {
        const userId = ctx.userId;
        log.info({ userId, title }, '🎤 Saving voice memo');

        try {
          const memo: VoiceMemo = {
            id: generateMemoId(),
            userId,
            title,
            transcript,
            tags,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await saveMemo(memo);

          if (transcript) {
            return `Got it! I've saved your memo "${title}": "${transcript.slice(0, 50)}${transcript.length > 50 ? '...' : ''}"`;
          }
          return `Saved your memo: "${title}"`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to save voice memo');
          return "I couldn't save that memo. Try again?";
        }
      },
    });
  },
};

/**
 * List voice memos
 */
export const listVoiceMemosDef: ToolDefinition = {
  id: 'listVoiceMemos',
  name: 'List Voice Memos',
  description: 'List all saved voice memos.',
  domain: 'simple-utilities',
  tags: ['voice', 'memo', 'recording', 'list', 'show'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `List voice memos. Returns all saved audio notes and reminders.`,
      parameters: z.object({
        limit: z.number().optional().describe('Max memos to show (default 10)'),
        tag: z.string().optional().describe('Filter by tag'),
      }),
      execute: async ({ limit = 10, tag }) => {
        const userId = ctx.userId;
        log.info({ userId, limit, tag }, '📋 Listing voice memos');

        try {
          let memos = await getMemos(userId);

          if (tag) {
            memos = memos.filter((m) => m.tags?.includes(tag));
          }

          memos = memos.slice(0, limit);

          if (memos.length === 0) {
            if (tag) {
              return `No memos found with tag "${tag}".`;
            }
            return "You don't have any voice memos yet. Say 'save a memo' to create one.";
          }

          const formatted = memos
            .map((memo, i) => {
              const time = formatRelativeTime(memo.createdAt);
              const preview = memo.transcript
                ? `: "${memo.transcript.slice(0, 40)}${memo.transcript.length > 40 ? '...' : ''}"`
                : '';
              return `${i + 1}. ${memo.title} (${time})${preview}`;
            })
            .join('\n');

          return `Your voice memos:\n\n${formatted}`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to list memos');
          return "I couldn't load your memos right now.";
        }
      },
    });
  },
};

/**
 * Play/recall a voice memo
 */
export const recallVoiceMemoDef: ToolDefinition = {
  id: 'recallVoiceMemo',
  name: 'Recall Voice Memo',
  description: 'Recall and read back a specific voice memo.',
  domain: 'simple-utilities',
  tags: ['voice', 'memo', 'play', 'recall', 'read'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Recall a voice memo by title or search term. Reads back the memo content.`,
      parameters: z.object({
        query: z.string().describe('Title or keyword to search for'),
      }),
      execute: async ({ query }) => {
        const userId = ctx.userId;
        log.info({ userId, query }, '🔊 Recalling voice memo');

        try {
          const memos = await getMemos(userId);
          const queryLower = query.toLowerCase();

          // Search by title, transcript, or tags
          const match = memos.find(
            (m) =>
              m.title.toLowerCase().includes(queryLower) ||
              m.transcript?.toLowerCase().includes(queryLower) ||
              m.tags?.some((t) => t.toLowerCase().includes(queryLower))
          );

          if (!match) {
            return `I couldn't find a memo matching "${query}". Try listing all your memos?`;
          }

          const time = formatRelativeTime(match.createdAt);
          if (match.transcript) {
            return `"${match.title}" from ${time}:\n\n"${match.transcript}"`;
          }
          return `Found "${match.title}" from ${time}, but no transcript was saved.`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to recall memo');
          return "I couldn't find that memo.";
        }
      },
    });
  },
};

/**
 * Delete a voice memo
 */
export const deleteVoiceMemoDef: ToolDefinition = {
  id: 'deleteVoiceMemo',
  name: 'Delete Voice Memo',
  description: 'Delete a saved voice memo.',
  domain: 'simple-utilities',
  tags: ['voice', 'memo', 'delete', 'remove'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Delete a voice memo by title.`,
      parameters: z.object({
        query: z.string().describe('Title or keyword to identify the memo to delete'),
      }),
      execute: async ({ query }) => {
        const userId = ctx.userId;
        log.info({ userId, query }, '🗑️ Deleting voice memo');

        try {
          const memos = await getMemos(userId);
          const queryLower = query.toLowerCase();

          const match = memos.find((m) => m.title.toLowerCase().includes(queryLower));

          if (!match) {
            return `I couldn't find a memo matching "${query}" to delete.`;
          }

          const deleted = await deleteMemo(userId, match.id);
          if (deleted) {
            return `Deleted the memo "${match.title}".`;
          }
          return "Couldn't delete that memo. Try again?";
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to delete memo');
          return "I couldn't delete that memo right now.";
        }
      },
    });
  },
};

/**
 * Search voice memos
 */
export const searchVoiceMemosDef: ToolDefinition = {
  id: 'searchVoiceMemos',
  name: 'Search Voice Memos',
  description: 'Search through voice memos for specific content.',
  domain: 'simple-utilities',
  tags: ['voice', 'memo', 'search', 'find'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Search voice memos for specific words or phrases.`,
      parameters: z.object({
        query: z.string().describe('Text to search for in memos'),
        limit: z.number().optional().describe('Max results (default 5)'),
      }),
      execute: async ({ query, limit = 5 }) => {
        const userId = ctx.userId;
        log.info({ userId, query }, '🔍 Searching voice memos');

        try {
          const memos = await getMemos(userId);
          const queryLower = query.toLowerCase();

          const matches = memos.filter(
            (m) =>
              m.title.toLowerCase().includes(queryLower) ||
              m.transcript?.toLowerCase().includes(queryLower) ||
              m.tags?.some((t) => t.toLowerCase().includes(queryLower))
          );

          if (matches.length === 0) {
            return `No memos found containing "${query}".`;
          }

          const formatted = matches.slice(0, limit).map((memo) => {
            const time = formatRelativeTime(memo.createdAt);
            const preview = memo.transcript ? `: "${memo.transcript.slice(0, 40)}..."` : '';
            return `• ${memo.title} (${time})${preview}`;
          });

          return `Found ${matches.length} memo${matches.length > 1 ? 's' : ''} with "${query}":\n\n${formatted.join('\n')}`;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to search memos');
          return "I couldn't search your memos right now.";
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceMemosToolDefinitions: ToolDefinition[] = [
  saveVoiceMemoDef,
  listVoiceMemosDef,
  recallVoiceMemoDef,
  deleteVoiceMemoDef,
  searchVoiceMemosDef,
];

export default voiceMemosToolDefinitions;
