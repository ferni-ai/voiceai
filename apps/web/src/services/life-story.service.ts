/**
 * Life Story Service
 *
 * Client for `/api/memory/me/story` (where the user comes from, stories
 * they've told, turning points, chapters, themes, how they decide, and their
 * values) and `/api/memory/me/beliefs` (faith & beliefs, only kept while the
 * Beliefs switch is on). Every call returns a Result so the UI decides how to
 * tell the user.
 *
 * @module services/life-story
 */

import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/api.js';
import { ApiError, err, ok, type AsyncResult, type Result } from '../types/result.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LifeStory');

export type StoryKind =
  | 'origin'
  | 'family'
  | 'school'
  | 'story'
  | 'moment'
  | 'turning_point'
  | 'chapter'
  | 'theme'
  | 'decision';

export type BeliefKind = 'faith' | 'practice' | 'belief' | 'questioning';

export interface StoryItem {
  id: string;
  kind: StoryKind;
  title: string;
  detail?: string;
  period?: string;
  date?: string;
  people?: Array<{ name: string; personId?: string }>;
  place?: { name: string; placeId?: string };
  source: 'stated' | 'inferred' | 'user';
  userEdited: boolean;
  sourceConversationIds: string[];
  updatedAt: string;
}

export interface ValueItem {
  id: string;
  label: string;
  category: string;
  statement: string;
  source: 'stated' | 'inferred' | 'user';
  userEdited: boolean;
  sourceConversationIds: string[];
  updatedAt: string;
}

export interface BeliefItem {
  id: string;
  kind: BeliefKind;
  title: string;
  detail?: string;
  source: 'stated' | 'inferred' | 'user';
  userEdited: boolean;
  sourceConversationIds: string[];
  updatedAt: string;
}

export interface StorySnapshot {
  items: StoryItem[];
  values: ValueItem[];
}

export interface BeliefsSnapshot {
  enabled: boolean;
  items: BeliefItem[];
}

export interface NewStoryItem {
  kind: StoryKind | 'value';
  title: string;
  detail?: string;
  period?: string;
  date?: string;
}

export interface StoryItemEdit {
  title?: string;
  detail?: string | null;
  period?: string | null;
  date?: string | null;
}

const STORY = '/api/memory/me/story';
const BELIEFS = '/api/memory/me/beliefs';

interface WrappedResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

function unwrap<T>(response: WrappedResponse<T>, what: string): Result<T, ApiError> {
  if (!response.ok || response.data === undefined || response.data === null) {
    log.warn({ status: response.status, error: response.error }, `Life story API: ${what} failed`);
    return err(new ApiError(response.error || `Couldn't ${what}`, response.status));
  }
  return ok(response.data);
}

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const at = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

export async function getStory(): AsyncResult<StorySnapshot, ApiError> {
  const r = unwrap(await apiGet<Partial<StorySnapshot>>(STORY), 'load your story');
  if (!r.ok) return r;
  return ok({ items: list<StoryItem>(r.value.items), values: list<ValueItem>(r.value.values) });
}

/** Adds a story item, or a value with `kind: 'value'`. */
export async function addStoryItem(
  item: NewStoryItem
): AsyncResult<StoryItem | ValueItem, ApiError> {
  const r = unwrap(await apiPost<{ item: StoryItem | ValueItem }>(STORY, item), 'add that');
  return r.ok ? ok(r.value.item) : r;
}

export async function editStoryItem<T extends StoryItem | ValueItem>(
  id: string,
  edit: StoryItemEdit
): AsyncResult<T, ApiError> {
  const r = unwrap(await apiPatch<{ item: T }>(at(STORY, id), edit), 'save that');
  return r.ok ? ok(r.value.item) : r;
}

export async function deleteStoryItem(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(at(STORY, id)), 'forget that');
}

export async function getBeliefs(): AsyncResult<BeliefsSnapshot, ApiError> {
  const r = unwrap(await apiGet<Partial<BeliefsSnapshot>>(BELIEFS), 'load your beliefs');
  if (!r.ok) return r;
  return ok({ enabled: r.value.enabled === true, items: list<BeliefItem>(r.value.items) });
}

export async function editBelief(
  id: string,
  edit: { title?: string; detail?: string | null }
): AsyncResult<BeliefItem, ApiError> {
  const r = unwrap(await apiPatch<{ item: BeliefItem }>(at(BELIEFS, id), edit), 'save that');
  return r.ok ? ok(r.value.item) : r;
}

export async function deleteBelief(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(at(BELIEFS, id)), 'forget that');
}
