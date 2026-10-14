/**
 * Judges for the outreach dry run: Gemini (callLLM, Vertex) on every item and
 * a local Ollama model (qwen3:30b-a3b) on a sample. Same rubric, 1-5 each.
 */
import { callLLM } from '../../src/services/llm-utils.js';

// prettier-ignore
export const CRITERIA = ['grounded', 'well_timed', 'warm_not_creepy', 'specific', 'friend_would_send'] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Scores = Record<Criterion, number> & { note: string };

export interface JudgeInput {
  text: string;
  channel: string;
  /** "Wed Oct 14, 5:00 PM" in the caller's time zone. */
  sendLocal: string;
  lastTalkedLocal: string;
  quote?: string;
  quoteDate?: string;
  eventDate?: string;
  /** Recent calls (date: topics), for context. */
  recentCalls: string[];
  /** What the person said, word for word, on the call the message comes from. */
  callerLines?: string[];
}

export function judgePrompt(i: JudgeInput): string {
  return `You are judging a message an AI friend named Ferni would send, unprompted, to a person between their phone calls. The best messages are what a close friend would text: about something the person actually told them, at a moment that makes sense, warm, short, never creepy.

The person's recent calls with Ferni (date: topics):
${i.recentCalls.map((c) => `- ${c}`).join('\n') || '- none'}
${i.callerLines?.length ? `\nWhat the person said, word for word, on the call this message comes from (Ferni's lines left out; speech-to-text, so expect typos):\n${i.callerLines.map((l) => `- "${l}"`).join('\n')}\n` : ''}
Last time they talked: ${i.lastTalkedLocal}
The message would arrive: ${i.sendLocal} (their time), as ${i.channel === 'in_app' ? 'a note in the app' : i.channel}
${i.quote ? `What the person said that it follows up on (${i.quoteDate}): "${i.quote}"` : 'It cites nothing the person said.'}
${i.eventDate ? `The thing it asks about was due on ${i.eventDate}.` : ''}
MESSAGE: "${i.text}"

Score each from 1 (bad) to 5 (excellent):
- grounded: is it about something the person actually said about their own life (5), or nothing they said, something invented, or something that was really about Ferni (1)?
- well_timed: does it land at a sensible moment for what it asks about and for when they last talked (5), or is it a random time (1)?
- warm_not_creepy: warm and natural (5), or cold, presumptuous, intrusive or surveillance-like (1)?
- specific: clearly about one specific thing in this person's life (5), or could be sent to anyone (1)?
- friend_would_send: would a close friend actually send this, right then (5), or never (1)?

Return JSON only: {"grounded":n,"well_timed":n,"warm_not_creepy":n,"specific":n,"friend_would_send":n,"note":"one short sentence"}`;
}

export function parseScores(reply: string | null | undefined): Scores | undefined {
  const json = reply?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;
  try {
    const r = JSON.parse(json) as Record<string, unknown>;
    const out: Partial<Scores> = { note: typeof r.note === 'string' ? r.note : '' };
    for (const c of CRITERIA) {
      const n = Number(r[c]);
      if (!Number.isFinite(n) || n < 1 || n > 5) return undefined;
      out[c] = n;
    }
    return out as Scores;
  } catch {
    return undefined;
  }
}

export async function judgeGemini(i: JudgeInput): Promise<Scores | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const s = parseScores(await callLLM(judgePrompt(i), { maxTokens: 400, temperature: 0 }));
    if (s) return s;
  }
  return undefined;
}

export async function judgeLocal(
  i: JudgeInput,
  model = process.env.LOCAL_JUDGE_MODEL ?? 'qwen3:30b-a3b'
): Promise<Scores | undefined> {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `${judgePrompt(i)}\n/no_think` }],
      format: 'json',
      stream: false,
      think: false,
      options: { temperature: 0, num_ctx: 4096 },
    }),
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { message?: { content?: string } };
  return parseScores(body.message?.content);
}

/** Mean per criterion, and overall, of the scored items. */
export function means(
  all: ReadonlyArray<Scores | undefined>
): Record<string, number> & { n: number } {
  const scored = all.filter((s): s is Scores => s !== undefined);
  const out: Record<string, number> = {};
  for (const c of CRITERIA) {
    out[c] = scored.length ? scored.reduce((a, s) => a + s[c], 0) / scored.length : NaN;
  }
  out.overall = CRITERIA.reduce((a, c) => a + out[c], 0) / CRITERIA.length;
  return { ...out, n: scored.length };
}
