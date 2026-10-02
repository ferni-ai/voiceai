/**
 * Work & Places Service
 *
 * Client for `/api/memory/me/work` and `/api/memory/me/places`: the user's
 * jobs (with history), projects, wins, stresses and goals, and their home,
 * trips, favourite spots, meaningful places and bucket list. Every call
 * returns a Result so the UI decides how to tell the user.
 *
 * @module services/work-places
 */

import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/api.js';
import { ApiError, err, ok, type AsyncResult, type Result } from '../types/result.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WorkPlaces');

export type LifeArea = 'work' | 'places';
export type WorkKind = 'job' | 'project' | 'win' | 'stress' | 'goal' | 'event' | 'application';
export type PlaceKind = 'home' | 'trip' | 'favorite' | 'meaningful' | 'bucket_list';
export type LifeKind = WorkKind | PlaceKind;
export type LifeStatus = 'current' | 'past' | 'planned' | 'done';

export interface LinkedPerson {
  name: string;
  personId?: string;
}

export interface LifeItem {
  id: string;
  area: LifeArea;
  kind: LifeKind;
  title: string;
  status: LifeStatus;
  employer?: string;
  role?: string;
  team?: string;
  previousRoles?: string[];
  eventType?: string;
  place?: string;
  category?: string;
  meaning?: string;
  withPeople?: LinkedPerson[];
  startDate?: string;
  endDate?: string;
  notes?: string;
  source: 'stated' | 'inferred' | 'user';
  userEdited: boolean;
  sourceConversationIds: string[];
  updatedAt: string;
}

export interface Colleague {
  id: string;
  name: string;
  relationship?: string;
}

export interface LifeAreaSnapshot {
  items: LifeItem[];
  colleagues: Colleague[];
  updatedAt?: string | null;
}

export interface NewLifeItem {
  kind: LifeKind;
  title: string;
  status?: LifeStatus;
  employer?: string;
  role?: string;
  place?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface LifeItemEdit {
  title?: string;
  status?: LifeStatus;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

const BASE = '/api/memory/me';

interface WrappedResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

function unwrap<T>(response: WrappedResponse<T>, what: string): Result<T, ApiError> {
  if (!response.ok || response.data === undefined || response.data === null) {
    log.warn({ status: response.status, error: response.error }, `Work/places API: ${what} failed`);
    return err(new ApiError(response.error || `Couldn't ${what}`, response.status));
  }
  return ok(response.data);
}

const path = (area: LifeArea, id?: string): string =>
  `${BASE}/${area}${id ? `/${encodeURIComponent(id)}` : ''}`;

export async function listLifeArea(area: LifeArea): AsyncResult<LifeAreaSnapshot, ApiError> {
  const result = unwrap(
    await apiGet<Partial<LifeAreaSnapshot>>(path(area)),
    area === 'work' ? 'load your work' : 'load your places'
  );
  if (!result.ok) return result;
  return ok({
    items: Array.isArray(result.value.items) ? result.value.items : [],
    colleagues: Array.isArray(result.value.colleagues) ? result.value.colleagues : [],
    updatedAt: result.value.updatedAt,
  });
}

export async function addLifeItem(
  area: LifeArea,
  item: NewLifeItem
): AsyncResult<LifeItem, ApiError> {
  const result = unwrap(await apiPost<{ item: LifeItem }>(path(area), item), 'add that');
  return result.ok ? ok(result.value.item) : result;
}

export async function editLifeItem(
  area: LifeArea,
  id: string,
  edit: LifeItemEdit
): AsyncResult<LifeItem, ApiError> {
  const result = unwrap(await apiPatch<{ item: LifeItem }>(path(area, id), edit), 'save that');
  return result.ok ? ok(result.value.item) : result;
}

export async function deleteLifeItem(
  area: LifeArea,
  id: string
): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(path(area, id)), 'forget that');
}
