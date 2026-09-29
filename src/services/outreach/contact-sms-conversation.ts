/**
 * Two-way texting with a user's contacts ("Ferni texts my mom, mom texts back").
 *
 * When Ferni texts a contact on a user's behalf, a thread is recorded under the
 * contact's E.164 number. If that number texts back, Ferni replies in persona
 * using the recent thread, and the exchange is saved for the user to read.
 *
 * Guardrails: only numbers Ferni has texted get replies; replies are capped per
 * day; crisis language gets a safe, human response and is flagged for the user;
 * STOP/HELP keywords are left to Twilio's opt-out handling.
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ service: 'contact-sms-conversation' });

export const MAX_REPLIES_PER_DAY = 20;
const HISTORY_TURNS = 12;
const OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|help|info)\s*$/i;
const CRISIS = /\b(suicid|kill myself|end my life|want to die|hurt myself|self[- ]harm|overdose)\w*/i;

export interface ContactThread {
  userId: string;
  contactId?: string;
  contactName: string;
  userName?: string;
  personaId: string;
  repliesDate?: string;
  repliesToday?: number;
  flagged?: boolean;
}

export interface ThreadMessage {
  from: 'ferni' | 'contact';
  body: string;
  at: string;
}

/** Persistence seam (Firestore in production, in-memory in tests). */
export interface ThreadStore {
  get(phone: string): Promise<ContactThread | null>;
  upsert(phone: string, thread: Partial<ContactThread>): Promise<void>;
  recent(phone: string, limit: number): Promise<ThreadMessage[]>;
  append(phone: string, message: ThreadMessage): Promise<void>;
  notifyUser(userId: string, note: { contactName: string; body: string; flagged: boolean }): Promise<void>;
}

export type ReplyGenerator = (systemPrompt: string, transcript: string) => Promise<string>;

/** +1XXXXXXXXXX for 10-digit US numbers; keeps an explicit +country code. */
export function toE164(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

const PERSONA_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  maya: 'Maya',
  'maya-santos': 'Maya',
  peter: 'Peter',
  'peter-john': 'Peter',
  jordan: 'Jordan',
  'jordan-taylor': 'Jordan',
  alex: 'Alex',
  'alex-chen': 'Alex',
  nayan: 'Nayan',
  'nayan-patel': 'Nayan',
};

function systemPrompt(thread: ContactThread): string {
  const persona = PERSONA_NAMES[thread.personaId] ?? 'Ferni';
  const user = thread.userName || 'their friend';
  return `You are ${persona}, a warm AI companion from Ferni, texting ${thread.contactName} on behalf of ${user}.
Reply by SMS: 1-3 short sentences, plain text, no emojis, no links. Be kind, curious and human.
You are an AI; if asked, say so honestly. Never invent facts about ${user} or make commitments for them.
If ${thread.contactName} asks for something only ${user} can answer, say you'll pass it along.`;
}

/** Record an outbound text so replies from this number continue the thread. */
export async function recordOutboundText(
  store: ThreadStore,
  input: { phone: string; userId: string; contactId?: string; contactName: string; userName?: string; personaId?: string; body: string }
): Promise<void> {
  const phone = toE164(input.phone);
  await store.upsert(phone, {
    userId: input.userId,
    contactId: input.contactId,
    contactName: input.contactName,
    userName: input.userName,
    personaId: input.personaId || 'ferni',
  });
  await store.append(phone, { from: 'ferni', body: input.body, at: new Date().toISOString() });
}

/**
 * Handle an inbound text. Returns the reply to send back (as TwiML), or null
 * when this number isn't a contact thread or nothing should be sent.
 */
export async function handleContactReply(
  store: ThreadStore,
  generate: ReplyGenerator,
  fromPhone: string,
  body: string,
  now = new Date()
): Promise<string | null> {
  const phone = toE164(fromPhone);
  if (OPT_OUT.test(body)) return null; // Twilio handles STOP/HELP

  const thread = await store.get(phone);
  if (!thread) return null;

  await store.append(phone, { from: 'contact', body, at: now.toISOString() });

  if (CRISIS.test(body)) {
    const reply = `I'm really glad you told me. You deserve support right now: please call or text 988 (Suicide & Crisis Lifeline) or 911 if you're in danger. I'm letting ${thread.userName || 'your friend'} know too.`;
    await store.append(phone, { from: 'ferni', body: reply, at: now.toISOString() });
    await store.upsert(phone, { flagged: true });
    await store.notifyUser(thread.userId, { contactName: thread.contactName, body, flagged: true });
    return reply;
  }

  const today = now.toISOString().slice(0, 10);
  const repliesToday = thread.repliesDate === today ? (thread.repliesToday ?? 0) : 0;
  await store.notifyUser(thread.userId, { contactName: thread.contactName, body, flagged: false });
  if (repliesToday >= MAX_REPLIES_PER_DAY) {
    log.info({ userId: thread.userId }, 'Daily reply cap reached; message passed to the user only');
    return null;
  }

  const history = await store.recent(phone, HISTORY_TURNS);
  const persona = PERSONA_NAMES[thread.personaId] ?? 'Ferni';
  const transcript = history
    .map((m) => `${m.from === 'ferni' ? persona : thread.contactName}: ${m.body}`)
    .join('\n');

  let reply: string;
  try {
    reply = (await generate(systemPrompt(thread), transcript)).trim().slice(0, 480);
  } catch (error) {
    log.warn({ error: String(error) }, 'Reply generation failed');
    reply = '';
  }
  if (!reply) {
    reply = `Thanks for writing back! I'll make sure ${thread.userName || 'they'} sees this.`;
  }

  await store.append(phone, { from: 'ferni', body: reply, at: now.toISOString() });
  await store.upsert(phone, { repliesDate: today, repliesToday: repliesToday + 1 });
  return reply;
}

// ============================================================================
// Production wiring (Firestore + Gemini)
// ============================================================================

const THREADS = 'contact_sms_threads';

export function firestoreThreadStore(): ThreadStore | null {
  const db = getFirestoreDb();
  if (!db) return null;
  const doc = (phone: string) => db.collection(THREADS).doc(phone);
  return {
    async get(phone) {
      const snap = await doc(phone).get();
      return snap.exists ? (snap.data() as ContactThread) : null;
    },
    async upsert(phone, thread) {
      await doc(phone).set({ ...thread, updatedAt: new Date().toISOString() }, { merge: true });
    },
    async recent(phone, limit) {
      const snap = await doc(phone).collection('messages').orderBy('at', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as ThreadMessage).reverse();
    },
    async append(phone, message) {
      await doc(phone).collection('messages').add(message);
    },
    async notifyUser(userId, note) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('contact_messages')
        .add({ ...note, at: new Date().toISOString(), read: false });
    },
  };
}

export const geminiReplyGenerator: ReplyGenerator = async (system, transcript) => {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return '';
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const { getContentGenerationModel } = await import('../../config/gemini-config.js');
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: process.env.GEMINI_OUTREACH_MODEL || getContentGenerationModel(),
  });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${system}\n\nConversation so far:\n${transcript}\n\nYour reply:` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 160 },
  });
  return result.response.text();
};
