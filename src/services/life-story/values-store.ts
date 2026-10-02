/**
 * Values: what matters most to the user.
 *
 * One store, shared with the values-alignment superhuman service
 * (`bogle_users/{uid}/values/{id}`, the `UserValue` shape it reads), now with
 * provenance: `label`, `sourceConversationIds`, `sourceFactIds`, `source`,
 * `userEdited`. New values get a deterministic id (`value_` + hash of the
 * label), so hearing "family matters most" again updates one document.
 * Older values (random ids, no label) are matched by category.
 *
 * Values are not a sensitive category. Faith is: "my faith matters most to
 * me" is a belief and goes through the beliefs store (with consent) instead.
 *
 * @module services/life-story/values-store
 */

import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import { sensitiveCategoriesOf } from '../memory-consent/index.js';
import { textAllowed } from './consent.js';
import { cleanText, normalizeSubject } from './rules.js';
import {
  TOMBSTONE_COLLECTION,
  USERS_COLLECTION,
  VALUES_COLLECTION,
  type TombstoneReason,
  type ValueCategory,
  type ValueInput,
  type ValueItem,
} from './types.js';

const log = createLogger({ module: 'LifeStoryValues' });

type Listener = (userId: string) => void;
const changeListeners = new Set<Listener>();

/** values-alignment keeps a cache of this collection; it subscribes here. */
export function onValuesChanged(listener: Listener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function changed(userId: string): void {
  for (const l of changeListeners) {
    try {
      l(userId);
    } catch (error) {
      log.debug({ error: String(error) }, 'Values listener failed');
    }
  }
}

const CATEGORY_WORDS: ReadonlyArray<[ValueCategory, RegExp]> = [
  ['family', /\b(family|kids|children|parents|my (wife|husband|partner|son|daughter))\b/],
  ['authenticity', /\b(honest|honesty|truth|integrity|authentic|being real|being myself)\b/],
  ['connection', /\b(friends?|friendship|loyalty|community|belonging|being there for|people)\b/],
  ['freedom', /\b(freedom|independence|autonomy|choice)\b/],
  ['security', /\b(security|stability|safety)\b/],
  ['growth', /\b(growth|learning|growing|curiosity|becoming)\b/],
  ['achievement', /\b(success|achievement|excellence|hard work|ambition)\b/],
  [
    'service',
    /\b(helping|service|giving back|kindness|compassion|generosity|making a difference)\b/,
  ],
  ['creativity', /\b(creativity|creating|art|music|making things)\b/],
  ['health', /\b(health|wellbeing|well-being|fitness)\b/],
  ['adventure', /\b(adventure|travel|exploring|new experiences)\b/],
  ['peace', /\b(peace|calm|harmony|balance|quiet)\b/],
  ['wealth', /\b(money|wealth|financial)\b/],
  ['fun', /\b(fun|joy|laughter|play)\b/],
];

/** Best-effort category for a free-form value label; 'purpose' when nothing fits. */
export function categoryForValue(label: string): ValueCategory {
  const text = label.toLowerCase();
  for (const [category, re] of CATEGORY_WORDS) if (re.test(text)) return category;
  return 'purpose';
}

export function valueIdFor(label: string): string {
  const hash = createHash('sha256')
    .update(`value|${normalizeSubject(label)}`)
    .digest('hex');
  return `value_${hash.slice(0, 24)}`;
}

function db(): Firestore | null {
  return getFirestoreDb();
}

function col(fs: Firestore, userId: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(VALUES_COLLECTION);
}

function tombstone(fs: Firestore, userId: string, id: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(TOMBSTONE_COLLECTION).doc(id);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  return new Date(0).toISOString();
}

type Doc = Record<string, unknown>;

export function parseValueDoc(id: string, data: Doc | undefined): ValueItem | null {
  if (!data || typeof data.category !== 'string') return null;
  const category = data.category as ValueCategory;
  const statement = typeof data.statement === 'string' ? data.statement : '';
  return {
    id,
    label: typeof data.label === 'string' && data.label ? data.label : category,
    category,
    statement,
    importance: typeof data.importance === 'number' ? data.importance : 0.5,
    mentions: typeof data.mentions === 'number' ? data.mentions : 1,
    source:
      data.source === 'user' || data.source === 'stated'
        ? (data.source as 'user' | 'stated')
        : 'inferred',
    userEdited: data.userEdited === true,
    sourceConversationIds: strings(data.sourceConversationIds),
    sourceFactIds: strings(data.sourceFactIds),
    updatedAt: isoOf(data.updatedAt ?? data.lastMentioned),
  };
}

async function rawDocs(userId: string): Promise<Array<{ id: string; data: Doc }>> {
  const fs = db();
  if (!fs || !userId) return [];
  const snap = await col(fs, userId).get();
  return (snap.docs ?? []).map((d) => ({ id: d.id, data: d.data() as Doc }));
}

export async function listValues(userId: string): Promise<ValueItem[]> {
  try {
    return (await rawDocs(userId))
      .map((d) => parseValueDoc(d.id, d.data))
      .filter((v): v is ValueItem => v !== null)
      .sort((a, b) => b.importance - a.importance);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not load values');
    return [];
  }
}

export type ValueOutcome =
  | 'created'
  | 'reinforced'
  | 'skipped_user_edited'
  | 'skipped_tombstoned'
  | 'skipped_no_consent'
  | 'invalid';

/**
 * Record a value (capture, values-alignment detection, or the page with
 * `source: 'user'`). Never throws.
 */
export async function recordValue(
  userId: string,
  input: ValueInput
): Promise<{ outcome: ValueOutcome; item?: ValueItem }> {
  const label = cleanText(input.label, 60).toLowerCase();
  const statement = cleanText(input.statement, 300) || label;
  if (!userId || userId === 'anonymous' || label.length < 2) return { outcome: 'invalid' };
  // Faith is a belief, never a value: it lives in the beliefs store, behind consent.
  if (sensitiveCategoriesOf(`${label} ${statement}`).includes('beliefs')) {
    return { outcome: 'skipped_no_consent' };
  }
  if (input.source !== 'user' && !(await textAllowed(userId, `${label} ${statement}`))) {
    return { outcome: 'skipped_no_consent' };
  }
  const fs = db();
  if (!fs) return { outcome: 'invalid' };
  try {
    const category = input.category ?? categoryForValue(label);
    const docs = await rawDocs(userId);
    const existing =
      docs.find((d) => d.id === valueIdFor(label)) ??
      docs.find(
        (d) =>
          typeof d.data.label === 'string' &&
          normalizeSubject(d.data.label) === normalizeSubject(label)
      ) ??
      docs.find((d) => !d.data.label && d.data.category === category && label === category);
    const id = existing?.id ?? valueIdFor(label);
    if (input.source === 'user') await tombstone(fs, userId, id).delete();
    else if ((await tombstone(fs, userId, id).get()).exists)
      return { outcome: 'skipped_tombstoned' };

    const now = Date.now();
    const prev = existing?.data;
    const conversations = strings(prev?.sourceConversationIds);
    const facts = strings(prev?.sourceFactIds);
    if (input.conversationId && !conversations.includes(input.conversationId))
      conversations.push(input.conversationId);
    if (input.factId && !facts.includes(input.factId)) facts.push(input.factId);
    const userOwned = prev?.userEdited === true || prev?.source === 'user';
    const keepWording = userOwned && input.source !== 'user';
    const examples = strings(prev?.contextExamples);
    if (!keepWording && statement && !examples.includes(statement) && examples.length < 10)
      examples.push(statement);
    const doc: Doc = {
      ...(prev ?? {}),
      id,
      userId,
      label: keepWording ? (prev?.label ?? label) : label,
      category: keepWording ? (prev?.category ?? category) : category,
      statement: keepWording
        ? (prev?.statement ?? statement)
        : input.source === 'user' || !prev
          ? statement
          : (prev.statement ?? statement),
      importance: Math.min(
        1,
        typeof prev?.importance === 'number' ? prev.importance + 0.05 : 0.6 + input.confidence * 0.3
      ),
      mentions: (typeof prev?.mentions === 'number' ? prev.mentions : 0) + 1,
      firstMentioned: prev?.firstMentioned ?? now,
      lastMentioned: now,
      contextExamples: examples,
      conflictCount: typeof prev?.conflictCount === 'number' ? prev.conflictCount : 0,
      sourceConversationIds: conversations,
      sourceFactIds: facts,
      source: keepWording
        ? prev?.source
        : input.source === 'user'
          ? 'user'
          : prev?.source === 'stated'
            ? 'stated'
            : input.source,
      userEdited: input.source === 'user' ? false : prev?.userEdited === true,
      updatedAt: new Date(now).toISOString(),
    };
    await col(fs, userId)
      .doc(id)
      .set(JSON.parse(JSON.stringify(doc)) as Doc);
    changed(userId);
    const item = parseValueDoc(id, doc) ?? undefined;
    if (keepWording) return { outcome: 'skipped_user_edited', item };
    return { outcome: prev ? 'reinforced' : 'created', item };
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not save value');
    return { outcome: 'invalid' };
  }
}

/** A user correction from the page. */
export async function editValue(
  userId: string,
  id: string,
  patch: { label?: string; statement?: string }
): Promise<Result<ValueItem, 'not_found' | 'invalid' | 'storage'>> {
  const fs = db();
  if (!fs) return failure('storage');
  const snap = await col(fs, userId).doc(id).get();
  if (!snap.exists) return failure('not_found');
  const prev = snap.data() as Doc;
  const label = patch.label === undefined ? undefined : cleanText(patch.label, 60).toLowerCase();
  if (label !== undefined && label.length < 2) return failure('invalid');
  const statement = patch.statement === undefined ? undefined : cleanText(patch.statement, 300);
  const doc: Doc = {
    ...prev,
    ...(label ? { label, category: categoryForValue(label) } : {}),
    ...(statement !== undefined ? { statement: statement || label || prev.statement } : {}),
    userEdited: true,
    editedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    await col(fs, userId).doc(id).set(doc);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not save value edit');
    return failure('storage');
  }
  changed(userId);
  const item = parseValueDoc(id, doc);
  return item ? success(item) : failure('invalid');
}

export async function deleteValue(
  userId: string,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): Promise<ValueItem | null> {
  const fs = db();
  if (!fs) return null;
  const snap = await col(fs, userId).doc(id).get();
  if (!snap.exists) return null;
  const item = parseValueDoc(id, snap.data() as Doc);
  await tombstone(fs, userId, id).set({
    createdAt: new Date().toISOString(),
    reason,
    kind: 'value',
    key: item?.label ?? id,
  });
  await col(fs, userId).doc(id).delete();
  changed(userId);
  return item;
}

/** Drop conversation/fact provenance; automated values left with none are deleted. */
export async function removeValueProvenance(
  userId: string,
  matches: (v: ValueItem) => boolean,
  strip: (ids: { conversations: string[]; facts: string[] }) => {
    conversations: string[];
    facts: string[];
  }
): Promise<{ changed: number; deleted: number }> {
  const fs = db();
  if (!fs) return { changed: 0, deleted: 0 };
  let changedCount = 0;
  let deleted = 0;
  for (const { id, data } of await rawDocs(userId)) {
    const item = parseValueDoc(id, data);
    if (!item || !matches(item)) continue;
    changedCount += 1;
    const next = strip({
      conversations: [...item.sourceConversationIds],
      facts: [...item.sourceFactIds],
    });
    if (
      !item.userEdited &&
      item.source !== 'user' &&
      next.conversations.length === 0 &&
      next.facts.length === 0
    ) {
      await deleteValue(userId, id, 'conversation_deleted');
      deleted += 1;
    } else {
      await col(fs, userId)
        .doc(id)
        .set({ ...data, sourceConversationIds: next.conversations, sourceFactIds: next.facts });
    }
  }
  if (changedCount) changed(userId);
  return { changed: changedCount, deleted };
}

/** Everything in the values store, plus recorded value conflicts. */
export async function deleteAllValues(userId: string): Promise<number> {
  const fs = db();
  if (!fs) return 0;
  let removed = 0;
  for (const name of [VALUES_COLLECTION, 'value_conflicts']) {
    const snap = await fs.collection(USERS_COLLECTION).doc(userId).collection(name).get();
    for (const doc of snap.docs ?? []) {
      await doc.ref.delete();
      removed += 1;
    }
  }
  changed(userId);
  return removed;
}
