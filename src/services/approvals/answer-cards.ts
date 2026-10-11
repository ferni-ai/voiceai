/**
 * Answer cards: a recommendation or answer, with the pages it came from,
 * that Ferni texts as a link (/a/:id) so the person can read it signed in.
 *
 * Google Search grounding asks that its search suggestions be shown with the
 * answer; a text message can't show them, the card page can. The card is the
 * owner's data: ids are 256-bit random (never guessable), reads check the
 * owner's uid on the server, and a card that is missing or someone else's
 * reads the same, so a probe learns nothing. Cards carry deleteAt (90 days,
 * for a Firestore TTL policy) and are in account export and erasure.
 *
 * Off unless APPROVALS_PAGE=on (services/approvals/flag.ts).
 *
 * @module services/approvals/answer-cards
 */

import { randomBytes } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { APP_URL } from '../../config/api-urls.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export const ANSWER_CARDS_COLLECTION = 'answer_cards';
export const ANSWER_CARD_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export type AnswerCardKind = 'answer' | 'recommendation';

export interface AnswerCardSource {
  title: string;
  url: string;
}

/** The one checked pick on a recommendation card. */
export interface AnswerCardPick {
  kind: 'video' | 'book' | 'place' | 'product';
  title: string;
  by: string;
  url: string;
  length?: string;
  why?: string;
}

/** What a producer (the grounded coaching tool, pick delivery) hands over. */
export interface AnswerCardInput {
  kind: AnswerCardKind;
  answerText: string;
  sources: AnswerCardSource[];
  /** Google's searchEntryPoint.renderedContent, verbatim; sanitized again when shown. */
  searchSuggestionsHtml?: string;
  webSearchQueries?: string[];
  /** The topic-only search query, already free of names. */
  query?: string;
  personaId?: string;
  pick?: AnswerCardPick;
  /** After this (epoch ms) the card reads as missing. */
  expiresAt?: number;
}

export interface AnswerCard {
  id: string;
  userId: string;
  kind: AnswerCardKind;
  answerText: string;
  sources: AnswerCardSource[];
  searchSuggestionsHtml: string;
  webSearchQueries: string[];
  query?: string;
  personaId?: string;
  pick?: AnswerCardPick;
  expiresAt?: number;
  createdAt: number;
  deleteAt: Date;
}

type NormalizedCard = Omit<AnswerCard, 'id' | 'userId' | 'createdAt' | 'deleteAt'>;

const MAX_ANSWER_CHARS = 4000;
const MAX_SOURCES = 8;
const MAX_TEXT_CHARS = 300;
const MAX_URL_CHARS = 2048;
const MAX_QUERIES = 10;
const MAX_SUGGESTIONS_HTML_CHARS = 64 * 1024;
const PICK_KINDS = new Set(['video', 'book', 'place', 'product']);
/** Shared service identities (API key auth) that no card may belong to. */
const SHARED_IDS = new Set(['api-user', 'system']);
/** Markup Google's suggestion chips never contain; HTML carrying it is dropped whole. */
const ACTIVE_HTML =
  /<\s*\/?\s*(script|iframe|frame|object|embed|form|base|meta|link)\b|\bon[a-z]+\s*=|javascript:/i;

/** 32 random bytes as base64url: 43 characters, 256 bits. */
const CARD_ID = /^[A-Za-z0-9_-]{43}$/;

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

const text = (raw: unknown, max = MAX_TEXT_CHARS): string =>
  String(raw ?? '')
    .trim()
    .slice(0, max);

function normalizePick(raw: AnswerCardPick | undefined): AnswerCardPick | undefined {
  const url = webUrl(raw?.url);
  if (!raw || !url || !PICK_KINDS.has(raw.kind) || !text(raw.title)) return undefined;
  const pick: AnswerCardPick = { kind: raw.kind, title: text(raw.title), by: text(raw.by), url };
  if (raw.length) pick.length = text(raw.length, 40);
  if (raw.why) pick.why = text(raw.why, 600);
  return pick;
}

/**
 * The input reduced to what the page may show; throws when nothing is left.
 * Optional fields are left out rather than set to undefined (Firestore rejects undefined).
 */
export function normalizeCardInput(input: AnswerCardInput): NormalizedCard {
  const answerText = text(input.answerText, MAX_ANSWER_CHARS);
  const sources = (Array.isArray(input.sources) ? input.sources : [])
    .map((s) => ({ title: text(s?.title), url: webUrl(s?.url) }))
    .filter((s): s is AnswerCardSource => s.url !== null)
    .slice(0, MAX_SOURCES);
  if (!answerText && sources.length === 0)
    throw new Error('answer card has no answer and no sources');
  const html = typeof input.searchSuggestionsHtml === 'string' ? input.searchSuggestionsHtml : '';
  const card: NormalizedCard = {
    kind: input.kind === 'recommendation' ? 'recommendation' : 'answer',
    answerText,
    sources,
    // Oversized or active HTML is dropped whole: half a chip, or a script, is never shown.
    searchSuggestionsHtml:
      html.length <= MAX_SUGGESTIONS_HTML_CHARS && !ACTIVE_HTML.test(html) ? html : '',
    webSearchQueries: (Array.isArray(input.webSearchQueries) ? input.webSearchQueries : [])
      .map((q) => text(q))
      .filter(Boolean)
      .slice(0, MAX_QUERIES),
  };
  const pick = normalizePick(input.pick);
  if (pick) card.pick = pick;
  if (input.query) card.query = text(input.query);
  if (input.personaId && /^[A-Za-z0-9_-]{1,64}$/.test(input.personaId))
    card.personaId = input.personaId;
  if (typeof input.expiresAt === 'number' && Number.isFinite(input.expiresAt))
    card.expiresAt = input.expiresAt;
  return card;
}

/** Store a card for userId and return the link to text them. */
export async function createAnswerCard(
  userId: string,
  input: AnswerCardInput,
  db: Firestore | null = getFirestoreDb(),
  now = Date.now()
): Promise<{ id: string; url: string }> {
  if (!userId || SHARED_IDS.has(userId)) throw new Error('answer card needs a person as owner');
  if (!db) throw new Error('answer cards need Firestore');
  const id = newCardId();
  const card: AnswerCard = {
    ...normalizeCardInput(input),
    id,
    userId,
    createdAt: now,
    deleteAt: new Date(now + ANSWER_CARD_KEEP_MS),
  };
  await db.collection(ANSWER_CARDS_COLLECTION).doc(id).set(card);
  return { id, url: `${APP_URL}/a/${id}` };
}

/** The card when userId owns it; null when missing, malformed, expired or someone else's. */
export async function getAnswerCardForUser(
  id: string,
  userId: string,
  db: Firestore | null = getFirestoreDb(),
  now = Date.now()
): Promise<AnswerCard | null> {
  if (!db || !userId || !isCardId(id)) return null;
  const snap = await db.collection(ANSWER_CARDS_COLLECTION).doc(id).get();
  const card = snap.exists ? (snap.data() as AnswerCard) : null;
  if (!card || card.userId !== userId) return null;
  return card.expiresAt !== undefined && now > card.expiresAt ? null : card;
}

/** Every card userId owns (account export). */
export async function listAnswerCardsForUser(
  userId: string,
  db: Firestore | null = getFirestoreDb()
): Promise<AnswerCard[]> {
  if (!db || !userId) return [];
  const snap = await db.collection(ANSWER_CARDS_COLLECTION).where('userId', '==', userId).get();
  return snap.docs.map((d) => d.data() as AnswerCard);
}

/** Delete every card userId owns (account erasure); returns how many. */
export async function deleteAnswerCardsForUser(
  userId: string,
  db: Firestore | null = getFirestoreDb()
): Promise<number> {
  if (!userId) return 0;
  if (!db) throw new Error('answer cards need Firestore');
  let deleted = 0;
  for (;;) {
    const snap = await db
      .collection(ANSWER_CARDS_COLLECTION)
      .where('userId', '==', userId)
      .limit(400)
      .get();
    if (snap.empty) return deleted;
    await Promise.all(snap.docs.map(async (d) => d.ref.delete()));
    deleted += snap.docs.length;
  }
}
