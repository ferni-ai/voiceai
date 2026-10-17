/**
 * A call writes the person's journal (CALL_JOURNAL, off by default).
 *
 * Journal audit 2026-10-13, section 3: the voice `journal` tool returned a
 * prompt and saved nothing, though its description promised "write" and
 * "history"; saveNote reflections went to the agent process's RAM store; and
 * addGratitude was never registered. With the flag on, all three save to the
 * one journal store, `bogle_users/{uid}/journal` (#1562), so what someone says
 * in a call shows up in the Chronicle. Each entry is tagged source 'call' and
 * the call's session id.
 *
 * The uid is the caller this session identified (`ctx.userData.userId`). It is
 * never a tool argument, so the model cannot write into someone else's journal.
 * The store is the one JOURNAL_ONE_STORE switches on, so these tools need both
 * flags; with either off the productivity domain registers the legacy tools
 * exactly as before. The agent process wires the store in
 * agents/journal-store-register.ts.
 *
 * @module tools/domains/productivity/call-journal
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { flagOn } from '../../../config/env-flag.js';
import { getJournalService } from '../../../services/journal/index.js';
import { sanitizePlainText } from '../../validation.js';
import { getLogger, getSessionId } from '../../utils/tool-helpers.js';
import type { createNotesTools } from './notes.js';

type NotesTools = ReturnType<typeof createNotesTools>;

/** The longest entry a call saves: a short summary, not a transcript. */
const MAX_ENTRY_CHARS = 1000;
const HISTORY_COUNT = 5;
const HISTORY_PREVIEW_CHARS = 140;
/** Ids the session uses when it doesn't know who is calling. */
const UNKNOWN_CALLERS = new Set(['', 'default', 'anonymous', 'unknown', 'guest']);

const SAVED =
  'Saved to their journal. Confirm in one short, plain line that it is in their journal; do not read the entry back.';
const NO_CALLER =
  "Not saved: this caller isn't signed in, so there is no journal to save to. Tell them you can't keep journal notes until they sign in.";
const FAILED =
  "Not saved: the journal couldn't be reached. Tell them plainly it didn't save this time; never say it was saved.";

export function callJournalOn(): boolean {
  return flagOn('CALL_JOURNAL') && flagOn('JOURNAL_ONE_STORE');
}

/** The identified caller's uid from the session, or undefined for an unknown caller. */
export function callerUid(opts: { ctx?: unknown }): string | undefined {
  const userData = (opts.ctx as { userData?: { userId?: unknown } } | undefined)?.userData;
  const uid = userData?.userId;
  if (typeof uid !== 'string' || UNKNOWN_CALLERS.has(uid.trim().toLowerCase())) return undefined;
  return uid;
}

/** Saves one entry for the session's caller and returns what the model should tell them. */
export async function saveCallJournalEntry(
  opts: { ctx?: unknown },
  text: string,
  momentType: 'journal' | 'reflection' | 'gratitude'
): Promise<string> {
  const uid = callerUid(opts);
  if (!uid) return NO_CALLER;
  const content = sanitizePlainText(text, MAX_ENTRY_CHARS).trim();
  if (!content) return 'Nothing saved: the entry was empty. Ask what they want to keep.';
  try {
    await getJournalService().createEntry(uid, {
      content,
      source: 'call',
      momentType,
      conversationId: getSessionId(opts),
    });
    getLogger().info({ momentType, length: content.length }, 'Call journal entry saved');
    return SAVED;
  } catch (error) {
    getLogger().error({ error: String(error), momentType }, 'Call journal entry not saved');
    return FAILED;
  }
}

/** The person's latest entries, for "what did I write in my journal". */
async function journalHistory(opts: { ctx?: unknown }): Promise<string> {
  const uid = callerUid(opts);
  if (!uid) return NO_CALLER;
  try {
    const entries = await getJournalService().getAllEntries(uid, { limit: HISTORY_COUNT });
    if (entries.length === 0) return 'No journal entries found for them.';
    const lines = entries.map((entry) => {
      const day = entry.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const words = entry.content.replace(/\s+/g, ' ').trim();
      const cut = words.lastIndexOf(' ', HISTORY_PREVIEW_CHARS);
      const preview =
        words.length > HISTORY_PREVIEW_CHARS
          ? words.slice(0, cut > 0 ? cut : HISTORY_PREVIEW_CHARS)
          : words;
      return `${day}: ${preview}`;
    });
    return `Their latest journal entries, newest first:\n${lines.join('\n')}`;
  } catch (error) {
    getLogger().error({ error: String(error) }, 'Call journal history not read');
    return "Their journal couldn't be reached right now. Say so plainly.";
  }
}

const ENTRY_RULE =
  'What they asked to keep, as a short summary in their own voice and words. Never add anything they did not say.';

/** `journal` with real write and history actions; start and prompt run the legacy tool. */
export function callJournalTool(legacy: NotesTools['startJournal']) {
  return llm.tool({
    description:
      'Their journal. Use "write" when they ask to put something in their journal, or say "remember this" about their day or how they feel; save their own words. Use "history" when they ask what they wrote. Use "start" or "prompt" to begin a guided journaling moment.',
    parameters: z.object({
      action: z.enum(['start', 'write', 'prompt', 'history']).optional().default('start'),
      type: z
        .enum(['evening', 'morning', 'gratitude'])
        .optional()
        .default('evening')
        .describe('Type of journaling, for start and prompt'),
      entry: z.string().optional().describe(`For write: ${ENTRY_RULE}`),
    }),
    execute: async ({ action, type, entry }, opts) => {
      if (action === 'write') return saveCallJournalEntry(opts, entry ?? '', 'journal');
      if (action === 'history') return journalHistory(opts);
      return legacy.execute({ type }, opts);
    },
  });
}

/** saveNote, where reflections and gratitude go to the journal; other notes are unchanged. */
export function callJournalSaveNote(legacy: NotesTools['saveNote']) {
  return llm.tool({
    description:
      'Save a note or thought. Use type "reflection" or "gratitude" for something about their day, feelings or what they are grateful for; those go in their journal.',
    parameters: z.object({
      content: z.string().describe(`The note. For reflection or gratitude: ${ENTRY_RULE}`),
      title: z.string().optional().describe('Optional title'),
      type: z
        .enum(['quick', 'idea', 'reminder', 'reflection', 'gratitude'])
        .optional()
        .default('quick'),
      tags: z.array(z.string()).optional().describe('Tags for organization'),
    }),
    execute: async ({ content, title, type, tags }, opts) => {
      if (type === 'reflection' || type === 'gratitude') {
        return saveCallJournalEntry(opts, content, type);
      }
      return legacy.execute({ content, title, type, tags }, opts);
    },
  });
}

/** addGratitude, saved as one journal entry in the person's words. */
export function callJournalGratitude() {
  return llm.tool({
    description:
      'Save what they said they are grateful for to their journal. Use their own words, one item each.',
    parameters: z.object({
      gratitudes: z.array(z.string()).min(1).max(5).describe('Things they are grateful for'),
    }),
    execute: async ({ gratitudes }, opts) =>
      saveCallJournalEntry(opts, gratitudes.map((g) => g.trim()).join('\n'), 'gratitude'),
  });
}
