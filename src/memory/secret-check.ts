/**
 * Whether a remembered fact holds a secret, read by a model (#2514 round 3).
 *
 * The lexical filters (spoken-credential.ts, credential-shapes.ts) fixed every
 * form in one sweep, then a fresh set leaked 29 of 48: "the password's
 * tacotuesday", a door code with no credential word, a seed phrase. Each rule
 * has nearby phrasings it misses, the wall the crisis word lists hit before a
 * classifier replaced them (#2491, #2648). So they stay a cheap first pass, and
 * what they let through gets one question before it is stored or embedded.
 *
 * Fails closed: a timeout, an error, an unusable reply or no model registered
 * reads as 'failed', and the caller keeps nothing. The log carries the error
 * class, never the fact.
 *
 * The model is handed in by the agent process (agents/remembered-fact-store-register.ts:
 * the crisis classifier's Gemini call, LLM_CLASSIFICATION_MODEL, Vertex at
 * GEMINI_LOCATION); tests hand in a fake.
 *
 * @module memory/secret-check
 */

import { errorClass } from '../utils/error-class.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SecretCheck' });

/** Sends the prompt and input to a model and returns its raw text (crisis-classifier.ts's shape). */
export type SecretModel = (
  systemPrompt: string,
  userContent: string,
  signal: AbortSignal
) => Promise<string>;

/** 'clear' is the only read that lets a fact be kept. */
export type SecretRead = 'secret' | 'clear' | 'failed';

/** As the crisis classifier's: above its measured p95 (crisis-classifier.ts). */
export const SECRET_CHECK_TIMEOUT_MS = 1000;

export const SECRET_CHECK_PROMPT = `A caller asked a voice companion app to remember TEXT. Decide one thing: does TEXT contain a secret someone could use to get into an account, device, door, vehicle, safe or money?

Secrets: a password or passphrase, a PIN, a code or combination for a door, gate, garage, alarm, lock, safe, phone or screen time, a username with its password, a card, bank account or routing number, an ID number or part of one (SSN, passport, licence, insurance or Medicare number, "ends in"), a crypto seed or recovery phrase, an API key or token, a one-time code, or the answer to a security question.

It is a secret however it is said: digits spoken as words or split by spaces, dashes or commas, words joined by "'s" or a colon, "the same as" another secret, plain words, or a number with no credential word at all when it says what it opens.

It is not a secret when TEXT only talks about a secret without giving it (which app keeps them, that one was reset, that a reminder is set, how long it is), or holds only an ordinary number (a phone number, address, date, time, price, score or zip code).

Return JSON only: {"secret":true} or {"secret":false}`;

/** The model's yes or no, or null when the reply is not one. */
export function parseSecretReply(reply: string): boolean | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const { secret } = JSON.parse(json) as { secret?: unknown };
    return typeof secret === 'boolean' ? secret : null;
  } catch {
    return null;
  }
}

let registered: SecretModel | null = null;

/** Called once by the agent process; null unplugs (tests). */
export function useSecretModel(model: SecretModel | null): void {
  registered = model;
}

export interface SecretCheckDeps {
  model?: SecretModel;
  timeoutMs?: number;
}

/** Whether `text` holds a secret, by the model. Never throws. */
export async function readSecret(text: string, deps: SecretCheckDeps = {}): Promise<SecretRead> {
  const model = deps.model ?? registered;
  if (!model) {
    log.warn('No secret-check model registered: not kept');
    return 'failed';
  }
  const controller = new globalThis.AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, deps.timeoutMs ?? SECRET_CHECK_TIMEOUT_MS);
  });
  try {
    const content = JSON.stringify({ text });
    const reply = await Promise.race([model(SECRET_CHECK_PROMPT, content, controller.signal), timeout]); // prettier-ignore
    const secret = reply === null ? null : parseSecretReply(reply);
    if (secret === null) log.warn({ timedOut: reply === null }, 'Secret check gave no answer: not kept'); // prettier-ignore
    return secret === null ? 'failed' : secret ? 'secret' : 'clear';
  } catch (error) {
    log.warn({ error: errorClass(error) }, 'Secret check failed: not kept');
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
