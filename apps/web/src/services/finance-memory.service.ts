/**
 * Finance Memory Service
 *
 * Client for `/api/memory/me/finances`: what Ferni remembers about the user's
 * money (only kept while the Money switch is on). Every call returns a Result
 * so the UI decides how to tell the user.
 *
 * @module services/finance-memory
 */

import { apiDelete, apiGet, apiPatch } from '../utils/api.js';
import { ApiError, err, ok, type AsyncResult, type Result } from '../types/result.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('FinanceMemory');

const BASE = '/api/memory/me/finances';

export type FinanceKind =
  | 'income'
  | 'budget'
  | 'savings'
  | 'debt'
  | 'purchase'
  | 'bill'
  | 'worry'
  | 'win'
  | 'feeling'
  | 'decision';
export const FINANCE_KINDS: readonly FinanceKind[] = [
  'debt',
  'savings',
  'bill',
  'purchase',
  'decision',
  'income',
  'budget',
  'worry',
  'win',
  'feeling',
];

export interface FinanceAmount {
  value: number;
  currency: 'USD' | 'GBP' | 'EUR';
  period?: 'week' | 'biweekly' | 'month' | 'year';
  said: string;
}

export interface FinanceItem {
  id: string;
  kind: FinanceKind;
  subject: string;
  text: string;
  status: 'active' | 'planned' | 'done';
  amount?: FinanceAmount;
  dueDay?: number;
  aspirationId?: string;
  source: string;
  sourceConversationIds: string[];
  userEdited: boolean;
  lastMentionedAt: string;
  updatedAt: string;
}

export interface FinanceSnapshot {
  enabled: boolean;
  items: FinanceItem[];
  updatedAt: string | null;
}

export interface FinanceEdit {
  text?: string;
  status?: FinanceItem['status'];
  amount?: null;
  dueDay?: number | null;
}

interface WrappedResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

function unwrap<T>(response: WrappedResponse<T>, what: string): Result<T, ApiError> {
  if (!response.ok || response.data === undefined || response.data === null) {
    log.warn({ status: response.status, error: response.error }, `Finance memory: ${what} failed`);
    return err(new ApiError(response.error || `Couldn't ${what}`, response.status));
  }
  return ok(response.data);
}

export async function getFinances(): AsyncResult<FinanceSnapshot, ApiError> {
  const result = unwrap(await apiGet<FinanceSnapshot>(BASE), 'load your money notes');
  if (!result.ok) return result;
  return ok({
    ...result.value,
    items: Array.isArray(result.value.items) ? result.value.items : [],
  });
}

export async function editFinanceItem(
  id: string,
  edit: FinanceEdit
): AsyncResult<FinanceItem, ApiError> {
  const result = unwrap(
    await apiPatch<{ item: FinanceItem }>(`${BASE}/${encodeURIComponent(id)}`, edit),
    'save that'
  );
  return result.ok ? ok(result.value.item) : result;
}

export async function deleteFinanceItem(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(
    await apiDelete<{ deleted: true }>(`${BASE}/${encodeURIComponent(id)}`),
    'forget that'
  );
}
