/**
 * What a request to the model carries, by the module that put each part there,
 * measured and never kept: for the turn receipt (turn-receipt.ts).
 *
 * Read from the request as llmNode sends it, not from each injector. Sizes
 * are characters and an estimate of chars/4 tokens (the repo's estimate, as
 * in memory/recall/semantic-recall.ts); tool schemas are not part of it.
 *
 * @module agents/shared/prompt-sections
 */
import { RECALL_NOTE_ID_PREFIX, TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

const SECTION_SOURCES = {
  instructions: 'agent-instructions.ts',
  memory_recall: 'memory-recall-hook.ts',
  turn_context: 'turn-intelligence.ts',
  tool_announcement: 'tool-updater.ts',
  system_other: 'chat-context',
  history_user: 'chat-history',
  history_assistant: 'chat-history',
  caller_turn: 'chat-history',
  tool_io: 'tool-calls',
  director_notes: 'director-notes.ts',
  turn_reminder: 'turn-request.ts',
  crisis_guidance: 'crisis-gate.ts',
} as const;
export type SectionName = keyof typeof SECTION_SOURCES;

export interface PromptSection {
  name: SectionName;
  source: string;
  items: number;
  chars: number;
  tokensEst: number;
}

/** The per-turn reminder of the request being built (turn-request.ts withTurnReminder). */
export interface ReminderNote {
  reminder: string;
  directorNotes: string;
  offered: number;
  droppedIdx: number[];
}

/** A chat item as far as this reads it (llm.ChatItem). */
export interface ItemView {
  type?: string;
  role?: string;
  id?: string;
  content?: readonly unknown[];
  name?: string;
  args?: string;
  output?: string;
}

type Add = (name: SectionName, chars: number) => void;

const INSTRUCTIONS_ID = 'lk.agent_task.instructions'; // @livekit/agents generation.js
/** Per-turn notes ride on the caller's latest words after a blank line (turn-style.ts). */
const APPENDED = '\n\n(';

function systemSection(item: ItemView, first: string): SectionName {
  if (item.id === INSTRUCTIONS_ID) return 'instructions';
  if (item.id?.startsWith(RECALL_NOTE_ID_PREFIX)) return 'memory_recall';
  if (first.startsWith('[SYSTEM: New tools')) return 'tool_announcement';
  return 'system_other';
}

/** The caller's latest words, and what rides on them: the reminder, crisis guidance. */
function callerTexts(texts: string[], note: ReminderNote | undefined, add: Add): void {
  for (const text of texts) {
    if (!text.startsWith(APPENDED)) add('caller_turn', text.length);
    else if (note?.reminder && text.includes(note.reminder)) {
      if (note.directorNotes) add('director_notes', note.directorNotes.length);
      add('turn_reminder', text.length - note.directorNotes.length);
    } else add('crisis_guidance', text.length);
  }
}

function measure(
  item: ItemView,
  thisTurn: boolean,
  note: ReminderNote | undefined,
  add: Add
): void {
  if (item.type === 'function_call')
    return add('tool_io', (item.name?.length ?? 0) + (item.args?.length ?? 0));
  if (item.type === 'function_call_output') return add('tool_io', item.output?.length ?? 0);
  if (item.type !== 'message') return;
  const texts = (item.content ?? []).filter((c): c is string => typeof c === 'string');
  const chars = texts.reduce((n, t) => n + t.length, 0);
  const first = texts[0] ?? '';
  if (item.role === 'system' || item.role === 'developer')
    return add(systemSection(item, first), chars);
  if (item.role === 'assistant') return add('history_assistant', chars);
  if (first.startsWith(TURN_CONTEXT_HEADER)) return add('turn_context', chars);
  if (thisTurn) return callerTexts(texts, note, add);
  return add('history_user', chars);
}

/** The request's chat context by where each part came from. Measures, keeps no text. */
export function promptSections(items: readonly ItemView[], note?: ReminderNote): PromptSection[] {
  const acc = new Map<SectionName, { items: number; chars: number }>();
  const add: Add = (name, chars) => {
    const s = acc.get(name) ?? { items: 0, chars: 0 };
    acc.set(name, { items: s.items + 1, chars: s.chars + chars });
  };
  let lastAssistant = -1;
  items.forEach((item, i) => {
    if (item.type === 'message' && item.role === 'assistant') lastAssistant = i;
  });
  items.forEach((item, i) => measure(item, i > lastAssistant, note, add));
  return [...acc].map(([name, s]) => ({
    name,
    source: SECTION_SOURCES[name],
    items: s.items,
    chars: s.chars,
    tokensEst: Math.ceil(s.chars / 4),
  }));
}
