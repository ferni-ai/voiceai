/**
 * The consent judge (CALL_CONSENT_CLASSIFIER, a kill switch, on by default): one flash-lite call
 * reads the answer as yes, no or unclear. It can only take a plain yes away (consent-window.ts),
 * never make one. A timeout, an error or an unusable reply is unclear and changes nothing.
 * @module tools/domains/communication/outreach/consent-judge
 */

import { flagOn, type Env } from '../../../../config/env-flag.js';
import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

const REASONS = [
  ...['agreed', 'declined', 'redirect', 'other_person', 'other_channel'],
  ...['deferred', 'conditional', 'question', 'off_topic', 'error'],
] as const;
type ConsentReason = (typeof REASONS)[number];
export interface ConsentJudgement {
  verdict: 'yes' | 'no' | 'unclear';
  reason: ConsentReason;
}

/** What the judge is told: no number beyond its last four digits, no message text. */
export interface ConsentInput {
  channel: 'call' | 'text' | 'other';
  person: string;
  last4?: string;
  turns: string[];
}
export function consentClassifierOn(env: Env = process.env): boolean {
  return flagOn('CALL_CONSENT_CLASSIFIER', env);
}
const CONSENT_MODEL = 'gemini-3.5-flash-lite';
/** Started on the owner's last final, so it is usually done before the model calls the tool. */
const CONSENT_TIMEOUT_MS = 1200;

const CONSENT_PROMPT = `Ferni, a voice assistant, read an action back to its owner and asked whether to go ahead. Decide whether the owner's reply agrees to THAT action, to THAT person, now. Return JSON only: {"verdict":"yes"|"no"|"unclear","reason":"${REASONS.slice(0, -1).join('"|"')}"}
yes (reason agreed): the owner plainly agreed to this action to this person now, e.g. "Yeah, go ahead and call.", "Yes, it's okay with me. Give him a call.", "Yes, you should call him.", "That's fine with me.", "Yep, call him." for a call to a man, "Sure, text her." for a text to a woman. Saying why, as the read-back's own errand ("and check in", "see how he's doing", "say hi"), is still agreement.
no (reason declined): the owner declined or cancelled, e.g. "No.", "Don't call him.", "Not now.", "Never mind.", "I'll call him myself."
unclear: everything else, including
- redirect: someone else should do it, or it should come to the owner ("He can call you.", "Call me instead.", "Check in with me.");
- other_person: a different person ("Call her." or "Call Mom." when the read-back is a call to Dad or a man);
- other_channel: a different channel (any call when the read-back is a text, any text when it is a call);
- deferred: a later time ("later", "tomorrow", "on Monday", "again tonight");
- conditional: a condition, a change or an extra instruction ("Yes, but...", "call him and tell him...");
- question: a question, or a fresh request with no agreement word ("You should call.", "Call.");
- off_topic: about something else, grudging or sarcastic ("Fine, whatever.", "Wow, yes, what a brilliant plan.").
Turns may be split mid-sentence, and the owner may call Ferni by name ("Yes," then "Ferni."): neither is a refusal. Never answer yes when unsure.`;

/** The owner's words as data, one per line, so nothing in them reads as an instruction. */
export const WHAT = { call: 'a phone call', text: 'a text', other: 'a message' } as const;
export function consentUserText(input: ConsentInput): string {
  const what = WHAT[input.channel];
  const number = input.last4 ? ` (number ending ${input.last4})` : '';
  const turns = input.turns.map((t, i) => `${i + 1}. ${JSON.stringify(t)}`).join('\n');
  return `Read-back: ${what} to ${JSON.stringify(input.person)}${number}, now.\nOwner's reply, in order:\n${turns}`;
}

/** The model's JSON, or null when it is not one of the closed answers. */
function parseConsent(reply: string): ConsentJudgement | null {
  try {
    const p = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? '') as Record<string, unknown>;
    const verdict = p.verdict as ConsentJudgement['verdict'];
    if (!['yes', 'no', 'unclear'].includes(verdict)) return null;
    const reason = (REASONS as readonly unknown[]).includes(p.reason)
      ? (p.reason as ConsentReason)
      : 'off_topic';
    // A yes must be agreement and a no a decline; any other reason asks once instead.
    const fits = verdict === 'unclear' || reason === (verdict === 'yes' ? 'agreed' : 'declined');
    return { verdict: fits ? verdict : 'unclear', reason };
  } catch {
    return null;
  }
}

/** Sends the prompt and the owner's words to a model and returns its raw text. */
export type ConsentAsk = (system: string, input: string, signal: AbortSignal) => Promise<string>;

const VERDICT = { type: 'string', enum: ['yes', 'no', 'unclear'] };
const SCHEMA = {
  type: 'object',
  properties: { verdict: VERDICT, reason: { type: 'string', enum: REASONS.slice(0, -1) } },
  required: ['verdict', 'reason'],
};

/** The repo's fast classifier call (as turn-understanding.ts): flash-lite, JSON, no thinking.
 * Also reads Ferni's turns (consent-readback.ts), with that schema. */
export const geminiAsk =
  (schema: object): ConsentAsk =>
  async (system, input, signal) => {
    const { getGeminiClient } = await import('../../../../config/gemini-config.js');
    const client = (await getGeminiClient()) as {
      models: { generateContent: (req: unknown) => Promise<{ text?: string }> };
    } | null;
    if (!client) return '';
    const response = await client.models.generateContent({
      model: CONSENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: input }] }],
      config: {
        systemInstruction: system,
        temperature: 0,
        maxOutputTokens: 40,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });
    return response.text ?? '';
  };
const geminiConsentAsk = geminiAsk(SCHEMA);

/** The model's reply within the cap, or null when it took longer (the call is then aborted). */
export async function replyWithin(
  model: ConsentAsk,
  system: string,
  input: string,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => (controller.abort(), resolve(null)), timeoutMs);
  });
  try {
    return await Promise.race([model(system, input, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

let ask: ConsentAsk = geminiConsentAsk;
let waitMs = CONSENT_TIMEOUT_MS;
/** Tests and replays: another judge (undefined restores the model) and how long to wait for it. */
export function setConsentAsk(next: ConsentAsk | undefined, timeoutMs = CONSENT_TIMEOUT_MS): void {
  ask = next ?? geminiConsentAsk;
  waitMs = timeoutMs;
}

const UNCLEAR: ConsentJudgement = { verdict: 'unclear', reason: 'error' };

/** Never throws, and never says yes for a timeout, an error or a reply it can't read. */
async function classifyConsent(input: ConsentInput, timeoutMs = waitMs): Promise<ConsentJudgement> {
  const started = Date.now();
  try {
    const reply = await replyWithin(ask, CONSENT_PROMPT, consentUserText(input), timeoutMs);
    const judged = (reply === null ? null : parseConsent(reply)) ?? UNCLEAR;
    log.info({ ...judged, latencyMs: Date.now() - started }, 'CALL_CONSENT_JUDGE');
    return judged;
  } catch (error) {
    log.warn({ error: String(error), latencyMs: Date.now() - started }, 'CALL_CONSENT_JUDGE');
    return UNCLEAR;
  }
}

interface Once {
  done?: unknown;
  run: Promise<unknown>;
}
/** One model call per stored action and input: the turn's end, the turn note and the tool share it. */
const calls = new WeakMap<object, Map<string, Once>>();
export async function once<T>(action: object, key: string, start: () => Promise<T>): Promise<T> {
  const mine = calls.get(action) ?? new Map<string, Once>();
  calls.set(action, mine);
  const entry: Once = mine.get(key) ?? { run: start() };
  if (!mine.has(key)) void entry.run.then((v) => (entry.done = v));
  mine.set(key, entry);
  return entry.run as Promise<T>;
}
/** That call's answer, once it has one. */
export const onceDone = <T>(action: object, key: string): T | undefined =>
  calls.get(action)?.get(key)?.done as T | undefined;

/** Starts (or joins) the judgement of these turns for this pending action. */
export const judge = async (pending: object, input: ConsentInput): Promise<ConsentJudgement> =>
  once(pending, `consent:${input.turns.join('\n')}`, async () => classifyConsent(input));
/** The finished judgement of exactly these turns, if there is one yet. */
export const judgedNow = (pending: object, turns: string[]): ConsentJudgement | undefined =>
  onceDone(pending, `consent:${turns.join('\n')}`);
