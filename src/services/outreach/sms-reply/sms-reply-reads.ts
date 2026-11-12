/**
 * What SMS_REPLY reads, behind one interface so its rules (sms-reply.ts) test without a
 * database or a model. Unreadable crisis signals count as a crisis now (fails closed).
 *
 * @module services/outreach/sms-reply/sms-reply-reads
 */
import { firestoreRecallStore } from '../../../agents/multi-agent/recall-firestore-store.js';
import * as memory from '../../../memory/index.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { crisisLevelSignalsSince } from '../../human-transfer/crisis-signals.js';
import { CRISIS_QUIET_MS } from '../../messaging/policy.js';
import { phoneHash } from '../checkin-replies.js';
import { firestoreTextStore } from '../guarded-text-store.js';
import { smsConsentRefusal, type ConsentRefusal } from '../text-consent.js';

export interface SmsReplyReads {
  refusal: (phone: string, now: Date) => Promise<ConsentRefusal | null>;
  lastCrisisAt: (userId: string, now: Date) => Promise<Date | undefined>;
  /** The recall note for this text, and how many facts it holds. */
  recall: (userId: string, text: string) => Promise<{ note: string | null; count: number }>;
  identity: (persona: string) => Promise<string | null>;
  generate: (system: string, contents: string, signal: AbortSignal) => Promise<string>;
}

/**
 * Fit for a lock screen: not what the facts mapper marks sensitive (a health fact,
 * mapDynamicFact), nor what recall never raises first (isSensitiveThread). No new list.
 */
export function smsSafeFact(f: memory.RecallFact): boolean {
  const fact = { entityName: f.entity, key: f.key, value: f.value };
  const mapped = memory.mapDynamicFact(fact, '', '');
  const sensitive = mapped.op !== 'noop' && mapped.proposal.sensitive === true;
  return !sensitive && !memory.isSensitiveThread(`${f.key} ${f.value}`);
}

async function lastCrisisAt(userId: string, now: Date): Promise<Date | undefined> {
  const db = getFirestoreDb();
  const since = new Date(now.getTime() - CRISIS_QUIET_MS);
  const newest = db ? await crisisLevelSignalsSince(db, userId, since).catch(() => null) : null;
  if (!newest) return now;
  const first = newest.at(0);
  const at = first ? new Date(first.timestamp) : undefined;
  return at && Number.isNaN(at.getTime()) ? now : at;
}

async function recall(userId: string, text: string): ReturnType<SmsReplyReads['recall']> {
  const snapshot = await memory.loadRecallSnapshot(firestoreRecallStore, userId);
  const safe = { ...snapshot, facts: snapshot.facts.filter(smsSafeFact) };
  const facts = memory.recallForTurn(safe, text);
  return { note: memory.formatRecall(facts, []), count: facts.length };
}

interface Models {
  models: { generateContent: (r: object) => Promise<{ text?: string }> };
}

/** The voice path's model and location (buildCascadeLLMOptions), on Vertex only: else no reply. */
async function generate(system: string, contents: string, signal: AbortSignal): Promise<string> {
  const config = await import('../../../config/gemini-config.js');
  if (!config.USE_VERTEX_AI || !config.GOOGLE_CLOUD_PROJECT) return '';
  const cascade = await import('../../../agents/model-provider/cartesia-cascade.js');
  const { model, location, thinkingConfig } = cascade.buildCascadeLLMOptions(process.env);
  const client = (await config.getGeminiClient(location)) as Models | null;
  const options = { systemInstruction: system, maxOutputTokens: 256, thinkingConfig };
  const res = await client?.models.generateContent({
    ...{ model, contents },
    config: { ...options, temperature: 0.8, abortSignal: signal },
  });
  return res?.text ?? '';
}

export const defaultSmsReplyReads: SmsReplyReads = {
  refusal: async (phone, now) => {
    const hash = phoneHash(phone);
    return hash ? smsConsentRefusal(hash, firestoreTextStore, false, now) : 'consent-unknown';
  },
  lastCrisisAt,
  recall,
  identity: async (persona) => {
    const prompts = await import('../../../agents/personas/prompt-loader.js'); // loads the voice stack
    return prompts.loadCoreIdentityPrompt(persona).catch(() => null);
  },
  generate,
};
