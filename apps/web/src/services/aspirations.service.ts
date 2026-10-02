/**
 * Aspirations Service
 *
 * Client for the user's dreams, goals and habits (`/api/memory/me/aspirations`),
 * part of the memory control API. Every call returns a Result so the UI
 * decides how to tell the user something went wrong.
 *
 * @module services/aspirations
 */

import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/api.js';
import { ApiError, err, ok, type AsyncResult, type Result } from '../types/result.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Aspirations');

const BASE = '/api/memory/me/aspirations';

// ============================================================================
// TYPES (mirror the API contract)
// ============================================================================

export type AspirationLevel = 'dream' | 'goal' | 'habit';
export type AspirationStatus = 'active' | 'paused' | 'achieved' | 'let-go' | 'dormant';
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  doneAt?: string;
  targetDate?: string;
}

export interface HabitCheckIn {
  date: string;
  status: 'done' | 'missed';
  note?: string;
}

export interface HabitView {
  frequency: HabitFrequency;
  days?: number[];
  timesPerDay: number;
  reminderTime?: string;
  glidepathLevel?: number;
  cue?: string;
  routine?: string;
  reward?: string;
  stackAnchor?: string;
  streak: number;
  longestStreak: number;
  dueToday: boolean;
  recentCheckIns: HabitCheckIn[];
}

export interface Aspiration {
  id: string;
  level: AspirationLevel;
  title: string;
  why?: string;
  status: AspirationStatus;
  parentId: string | null;
  category?: string;
  targetDate?: string;
  progress?: number;
  milestones: Milestone[];
  source: 'explicit' | 'inferred';
  confirmed: boolean;
  userEdited: boolean;
  createdAt: string;
  updatedAt: string;
  habit?: HabitView;
}

export interface AspirationList {
  aspirations: Aspiration[];
  timeZone?: string;
}

export interface AspirationEdit {
  title?: string;
  why?: string | null;
  status?: AspirationStatus;
  parentId?: string | null;
  targetDate?: string | null;
  progress?: number | null;
}

export interface NewAspiration {
  level: AspirationLevel;
  title: string;
  why?: string;
  parentId?: string | null;
  targetDate?: string;
  schedule?: { frequency: HabitFrequency };
}

// ============================================================================
// HELPERS
// ============================================================================

interface WrappedResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

function unwrap<T>(response: WrappedResponse<T>, what: string): Result<T, ApiError> {
  if (!response.ok || response.data === undefined || response.data === null) {
    log.warn({ status: response.status, error: response.error }, `Aspirations API: ${what} failed`);
    return err(new ApiError(response.error || `Couldn't ${what}`, response.status));
  }
  return ok(response.data);
}

const enc = (id: string): string => encodeURIComponent(id);

function unwrapOne(
  response: WrappedResponse<{ aspiration: Aspiration }>,
  what: string
): Result<Aspiration, ApiError> {
  const result = unwrap(response, what);
  if (!result.ok) return result;
  return result.value.aspiration
    ? ok(result.value.aspiration)
    : err(new ApiError(`Couldn't ${what}`, response.status));
}

// ============================================================================
// API
// ============================================================================

export async function listAspirations(): AsyncResult<AspirationList, ApiError> {
  const result = unwrap(await apiGet<AspirationList>(BASE), 'load your goals');
  if (!result.ok) return result;
  return ok({
    aspirations: Array.isArray(result.value.aspirations) ? result.value.aspirations : [],
    timeZone: result.value.timeZone,
  });
}

export async function createAspiration(input: NewAspiration): AsyncResult<Aspiration, ApiError> {
  return unwrapOne(await apiPost<{ aspiration: Aspiration }>(BASE, input), 'add that');
}

export async function editAspiration(
  id: string,
  edit: AspirationEdit
): AsyncResult<Aspiration, ApiError> {
  return unwrapOne(
    await apiPatch<{ aspiration: Aspiration }>(`${BASE}/${enc(id)}`, edit),
    'save that'
  );
}

export async function deleteAspiration(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(`${BASE}/${enc(id)}`), 'remove that');
}

export async function checkInHabit(
  id: string,
  status: 'done' | 'missed' = 'done',
  note?: string
): AsyncResult<Aspiration, ApiError> {
  return unwrapOne(
    await apiPost<{ aspiration: Aspiration }>(`${BASE}/${enc(id)}/check-ins`, {
      status,
      ...(note ? { note } : {}),
    }),
    'mark that'
  );
}
