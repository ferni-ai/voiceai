/**
 * Answer cards: a recommendation or answer, with the pages it came from,
 * that Ferni texts as a link (/a/:id) so the person can read it signed in.
 *
 * Google Search grounding asks that its search suggestions be shown with the
 * answer; a text message can't show them, the card page can. The card is the
 * owner's data: ids are 256-bit random (never guessable), reads check the
 * owner's uid on the server, and a card that is missing or someone else's
 * reads the same, so a probe learns nothing.
 *
 * Off unless APPROVALS_PAGE=on.
 *
 * @module services/approvals/answer-cards
 */

import { randomBytes } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { APP_URL } from '../../config/api-urls.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export const ANSWER_CARDS_COLLECTION = 'answer_cards';

export type AnswerCardKind = 'answer' | 'recommendation';

export interface AnswerCardSource {
  title: string;
  url: string;
}

/** What a producer (e.g. the grounded coaching tool) hands over. */
export interface AnswerCardInput {
  kind: AnswerCardKind;
  answerText: string;
  sources: AnswerCardSource[];
  /** Google's searchEntryPoint.renderedContent, verbatim; sanitized when shown. */
  searchSuggestionsHtml?: string;
}

export interface AnswerCard extends Required<AnswerCardInput> {
  id: string;
  userId: string;
  createdAt: number;
}

const MAX_ANSWER_CHARS = 4000;
const MAX_SOURCES = 8;
const MAX_TITLE_CHARS = 300;
const MAX_URL_CHARS = 2048;
const MAX_SUGGESTIONS_HTML_CHARS = 64 * 1024;

/** 32 random bytes as base64url: 43 characters, 256 bits. */
const CARD_ID = /^[A-Za-z0-9_-]{43}$/;

export function isApprovalsPageEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.APPROVALS_PAGE === 'on';
}

export function newCardId(): string {
  return randomBytes(32).toString('base64url');
}

export function isCardId(value: string): boolean {
  return CARD_ID.test(value);
}

/** An http(s) link, or null for javascript:, data:, relative or malformed ones. */
function webUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_URL_CHARS) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The input reduced to what the page may show; throws when nothing is left. */
export function normalizeCardInput(input: AnswerCardInput): Required<AnswerCardInput> {
  const answerText = String(input.answerText ?? '')
    .trim()
    .slice(0, MAX_ANSWER_CHARS);
  const sources = (Array.isArray(input.sources) ? input.sources : [])
    .map((s) => ({
      title: String(s?.title ?? '')
        .trim()
        .slice(0, MAX_TITLE_CHARS),
      url: webUrl(s?.url),
    }))
    .filter((s): s is AnswerCardSource => s.url !== null)
    .slice(0, MAX_SOURCES);
  const html = typeof input.searchSuggestionsHtml === 'string' ? input.searchSuggestionsHtml : '';
  if (!answerText && sources.length === 0)
    throw new Error('answer card has no answer and no sources');
  return {
    kind: input.kind === 'recommendation' ? 'recommendation' : 'answer',
    answerText,
    sources,
    // Truncated HTML could render half a chip; drop it whole instead.
    searchSuggestionsHtml: html.length <= MAX_SUGGESTIONS_HTML_CHARS ? html : '',
  };
}

/** Store a card for userId and return the link to text them. */
export async function createAnswerCard(
  userId: string,
  input: AnswerCardInput,
  db: Firestore | null = getFirestoreDb()
): Promise<{ id: string; url: string }> {
  if (!userId) throw new Error('answer card needs an owner');
  if (!db) throw new Error('answer cards need Firestore');
  const id = newCardId();
  const card: AnswerCard = { ...normalizeCardInput(input), id, userId, createdAt: Date.now() };
  await db.collection(ANSWER_CARDS_COLLECTION).doc(id).set(card);
  return { id, url: `${APP_URL}/a/${id}` };
}

/** The card when userId owns it; null when it is missing, malformed or someone else's. */
export async function getAnswerCardForUser(
  id: string,
  userId: string,
  db: Firestore | null = getFirestoreDb()
): Promise<AnswerCard | null> {
  if (!db || !userId || !isCardId(id)) return null;
  const snap = await db.collection(ANSWER_CARDS_COLLECTION).doc(id).get();
  const card = snap.exists ? (snap.data() as AnswerCard) : null;
  return card && card.userId === userId ? card : null;
}
