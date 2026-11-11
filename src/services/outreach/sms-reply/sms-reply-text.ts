/**
 * SMS_REPLY's words: the fixed replies, the prompt, and the limits on the sent text.
 *
 * @module services/outreach/sms-reply/sms-reply-text
 */
import type { TypedTurn } from '../../../agents/personas/crisis-gate-text.js';
import { MINOR_CARE_NOTE } from '../../../utils/minor-care.js';

/** Seth, 2026-11-11: the 14 days after a crisis get this, never silence and never a model's words. */
export const SMS_AFTER_CRISIS_REPLY =
  "I'm here. Want me to give you a call? And if things feel heavy, you can call or text 988 anytime.";
/** What a reply with crisis guidance always carries when the model's words don't: Seth's line above. */
export const SMS_LIFELINE = 'If things feel heavy, you can call or text 988 anytime.';
/** Seth, 2026-11-11: a minor under care sees this on the first reply, and again 3 h after the last. */
export const SMS_AI_REMINDER = "(just a reminder, I'm an AI)";
/** Two SMS segments. */
export const SMS_REPLY_MAX_CHARS = 320;

const TEXTING_NOTE =
  "[You're texting with them, not on a call. Write the way a friend texts back: one to three short sentences, plain words, no lists, markdown, emoji strings, stage directions or speech markup. Don't say you looked anything up or mention notes or memory.]";

const LIFELINE = /\b988\b/;

/** At most `max` characters, cut after the last sentence that fits (else the last whole word). */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max + 1);
  const end = Math.max(...['. ', '! ', '? '].map((p) => head.lastIndexOf(p)));
  if (end > 0) return head.slice(0, end + 1);
  const space = head.lastIndexOf(' ');
  return space > 0 ? head.slice(0, space) : head.slice(0, max);
}

/**
 * The sent text, or null when the model wrote nothing: two segments, and only the model's words
 * are cut. `lifeline` (crisis guidance): 988 is always sent, the model's if it survives the cut.
 */
export function smsReplyText(
  modelText: string,
  { lifeline = false, reminder = false }: { lifeline?: boolean; reminder?: boolean } = {}
): string | null {
  const words = modelText.replace(/\s+/g, ' ').trim();
  const join = (...parts: string[]): string => parts.filter(Boolean).join(' ');
  const tail = reminder ? SMS_AI_REMINDER : '';
  const room = (extra: string): number => SMS_REPLY_MAX_CHARS - join('x', extra).length + 1;
  const plain = fit(words, room(tail));
  if (!lifeline || LIFELINE.test(plain)) return plain ? join(plain, tail) : null;
  return join(fit(words, room(join(SMS_LIFELINE, tail))), SMS_LIFELINE, tail);
}

export interface SmsPromptParts {
  /** The routed persona's core identity, when it loads. */
  identity: string | null;
  /** A held minor: the care note, and nothing recalled. */
  minorCare: boolean;
  recall: string | null;
  earlier: readonly TypedTurn[];
  message: string;
  /** The crisis read's guidance (readTypedMessageForCrisis): always the last words of the prompt. */
  guidanceNote?: string;
}

/** The system instruction and the conversation; the crisis guidance, when there is one, ends it. */
export function smsReplyPrompt(p: SmsPromptParts): { system: string; contents: string } {
  const care = p.minorCare ? MINOR_CARE_NOTE : null;
  const system = [p.identity, TEXTING_NOTE, care, p.recall].filter(Boolean).join('\n\n');
  const said = (t: TypedTurn): string => `${t.from === 'person' ? 'They' : 'You'}: ${t.text}`;
  const before = p.earlier.length ? `Texts so far:\n${p.earlier.map(said).join('\n')}\n\n` : '';
  const ask = `${before}They text you now:\n${p.message}`;
  return { system, contents: p.guidanceNote ? `${ask}\n\n${p.guidanceNote}` : ask };
}
