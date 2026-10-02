/**
 * Sensitive Memory Service
 *
 * Client for the sensitive-memory API: the consent switches for health, money
 * and beliefs (`/api/memory/me/consent`), health memory
 * (`/api/memory/me/health`) and the mood timeline (`/api/memory/me/mood`).
 * Every call returns a Result so the UI decides how to tell the user.
 *
 * @module services/sensitive-memory
 */

import { apiDelete, apiGet, apiPatch, apiPut } from '../utils/api.js';
import { ApiError, err, ok, type AsyncResult, type Result } from '../types/result.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SensitiveMemory');

const BASE = '/api/memory/me';

// ============================================================================
// TYPES (mirror the API contract)
// ============================================================================

export type SensitiveCategory = 'health' | 'finances' | 'beliefs';
export const SENSITIVE_CATEGORIES: readonly SensitiveCategory[] = ['health', 'finances', 'beliefs'];

export interface CategoryConsent {
  enabled: boolean;
  updatedAt: string | null;
  source: string | null;
}

export interface MemoryConsent {
  version: number;
  answeredAt: string | null;
  categories: Record<SensitiveCategory, CategoryConsent>;
  updatedAt: string | null;
}

export interface ConsentView {
  consent: MemoryConsent;
  stored: Record<SensitiveCategory, number>;
  safetyExceptions: Array<{ category: SensitiveCategory; kind: string; description: string }>;
}

export type HealthKind =
  | 'condition'
  | 'medication'
  | 'injury'
  | 'appointment'
  | 'symptom'
  | 'sleep'
  | 'exercise'
  | 'energy';

export interface HealthItem {
  id: string;
  kind: HealthKind;
  subject: string;
  text: string;
  status: 'current' | 'past' | 'upcoming';
  when?: string;
  day?: string;
  confidence: number;
  source: string;
  sourceConversationIds: string[];
  userEdited: boolean;
  lastMentionedAt: string;
  updatedAt: string;
}

export interface HealthSnapshot {
  enabled: boolean;
  items: HealthItem[];
  safety: {
    allergies: Array<{ item: string; severity?: string }>;
    intolerances: Array<{ item: string }>;
    note: string;
  };
  updatedAt: string | null;
}

export interface MoodConversation {
  id: string;
  personaId?: string;
  startedAt: string;
  endedAt: string;
  dominantMood: string;
  averageValence: number;
  arc: 'lifting' | 'steady' | 'heavier' | 'mixed';
}

export interface MoodSnapshot {
  enabled: boolean;
  timeline: MoodConversation[];
  insight: string | null;
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
    log.warn(
      { status: response.status, error: response.error },
      `Sensitive memory: ${what} failed`
    );
    return err(new ApiError(response.error || `Couldn't ${what}`, response.status));
  }
  return ok(response.data);
}

const enc = encodeURIComponent;

// ============================================================================
// API
// ============================================================================

export async function getConsent(): AsyncResult<ConsentView, ApiError> {
  return unwrap(await apiGet<ConsentView>(`${BASE}/consent`), 'load your memory settings');
}

/** The upfront question: yes turns all three on, no records the answer with all off. */
export async function answerConsent(agree: boolean): AsyncResult<ConsentView, ApiError> {
  return unwrap(await apiPut<ConsentView>(`${BASE}/consent`, { agreeAll: agree }), 'save that');
}

export async function setCategory(
  category: SensitiveCategory,
  enabled: boolean
): AsyncResult<ConsentView, ApiError> {
  return unwrap(
    await apiPut<ConsentView>(`${BASE}/consent`, { categories: { [category]: enabled } }),
    'save that'
  );
}

export async function deleteCategoryData(
  category: SensitiveCategory
): AsyncResult<{ deleted: number }, ApiError> {
  return unwrap(
    await apiDelete<{ deleted: number }>(`${BASE}/consent/${enc(category)}/data`),
    'delete that'
  );
}

export async function getHealth(): AsyncResult<HealthSnapshot, ApiError> {
  const result = unwrap(await apiGet<HealthSnapshot>(`${BASE}/health`), 'load your health notes');
  if (!result.ok) return result;
  return ok({
    ...result.value,
    items: Array.isArray(result.value.items) ? result.value.items : [],
  });
}

export async function editHealthItem(
  id: string,
  edit: { text?: string; status?: HealthItem['status'] }
): AsyncResult<HealthItem, ApiError> {
  const result = unwrap(
    await apiPatch<{ item: HealthItem }>(`${BASE}/health/${enc(id)}`, edit),
    'save that'
  );
  return result.ok ? ok(result.value.item) : result;
}

export async function deleteHealthItem(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(`${BASE}/health/${enc(id)}`), 'forget that');
}

export async function getMood(): AsyncResult<MoodSnapshot, ApiError> {
  const result = unwrap(await apiGet<MoodSnapshot>(`${BASE}/mood`), 'load your mood timeline');
  if (!result.ok) return result;
  return ok({
    ...result.value,
    timeline: Array.isArray(result.value.timeline) ? result.value.timeline : [],
  });
}

export async function deleteMoodEntry(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(`${BASE}/mood/${enc(id)}`), 'forget that');
}
