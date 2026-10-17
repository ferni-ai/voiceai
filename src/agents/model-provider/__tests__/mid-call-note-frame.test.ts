/**
 * Pins MID_CALL_NOTE_FRAME in our @livekit/agents patch
 * (patches/@livekit__agents@1.8.1.patch, provider_format/google.js).
 *
 * The SDK turns every system message after the first into a USER message reading
 * "New instructions received. Apply them carefully: <note>", and the formatter
 * merges it into the caller's turn, so Gemini reads our private context notes as
 * the caller's words. With the flag on the note is framed as private instead.
 * Runs the real converter through ChatContext.toProviderFormat('google'), the call
 * the google plugin's LLM and realtime model make.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MID_CALL_NOTE_FRAME_OPENING, isOwnContextNote } from '../../../tools/utils/own-note.js';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
const load = <T>(file: string): Promise<T> => import(pathToFileURL(join(agentsDist, file)).href);

type Turn = { role: string; parts: Array<{ text?: string }> };
interface ChatCtx {
  addMessage(m: { role: string; content: string }): unknown;
  toProviderFormat(format: 'google'): Promise<[Turn[], { systemMessages: string[] | null }]>;
}
interface Llm {
  ChatContext: { empty(): ChatCtx };
}

let llm: Llm;

beforeAll(async () => {
  const { initializeLogger } = await load<{ initializeLogger: (o: object) => void }>('log.js');
  initializeLogger({ pretty: false, level: 'silent' });
  llm = await load<Llm>('llm/index.js');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const NOTE = 'Never guess how someone is related to them.';
const STOCK = `New instructions received. Apply them carefully: ${NOTE}`;

/** Instructions, a short exchange, then a recall note added after the caller's request. */
async function convert() {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are a friendly voice companion.' });
  ctx.addMessage({ role: 'user', content: 'I talked to my sister today.' });
  ctx.addMessage({ role: 'assistant', content: 'How did it go?' });
  ctx.addMessage({ role: 'user', content: 'Can you put that in my journal?' });
  ctx.addMessage({ role: 'system', content: NOTE });
  const [turns, extra] = await ctx.toProviderFormat('google');
  const last = turns.at(-1) ?? { role: 'none', parts: [] };
  return { turns, extra, last, texts: last.parts.map((p) => p.text ?? '') };
}

describe('MID_CALL_NOTE_FRAME', () => {
  it('on: the note reaches Gemini framed as private, not as the caller asking', async () => {
    vi.stubEnv('MID_CALL_NOTE_FRAME', 'on');
    const { turns, extra, last, texts } = await convert();

    // Still user role, merged into the caller's turn (Gemini has no mid-chat system role).
    expect(turns.map((t) => t.role)).toEqual(['user', 'model', 'user']);
    expect(last.role).toBe('user');
    expect(texts[0]).toBe('Can you put that in my journal?');
    // The note is framed, and the stock "request" wording is gone.
    expect(texts[1]).toMatch(new RegExp(`^${escape(MID_CALL_NOTE_FRAME_OPENING)}`));
    expect(texts[1]).toContain('not words the caller said');
    expect(texts[1].endsWith(`\n${NOTE}`)).toBe(true);
    expect(texts.join('\n')).not.toContain('New instructions received');
    // The top instruction is untouched (prefix caching).
    expect(extra.systemMessages).toEqual(['You are a friendly voice companion.']);
    // The save tools' predicate recognises what the converter really produced.
    expect(isOwnContextNote(texts[1])).toBe(true);
  });

  it('off (the default): the stock SDK text is unchanged', async () => {
    vi.stubEnv('MID_CALL_NOTE_FRAME', '');
    const { last, texts } = await convert();

    expect(last.role).toBe('user');
    expect(texts).toEqual(['Can you put that in my journal?', STOCK]);
    expect(texts.join('\n')).not.toContain(MID_CALL_NOTE_FRAME_OPENING);
  });

  it('off explicitly: the stock SDK text is unchanged', async () => {
    vi.stubEnv('MID_CALL_NOTE_FRAME', 'off');
    const { texts } = await convert();

    expect(texts).toEqual(['Can you put that in my journal?', STOCK]);
  });
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
