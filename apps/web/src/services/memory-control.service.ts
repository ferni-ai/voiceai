/**
 * Memory Control Service
 *
 * Client for the user memory control API (`/api/memory/me/**`): what Ferni
 * has learned (facts and people), past conversations with their transcripts,
 * export, and deletion. Every call returns a Result so the UI decides how to
 * tell the user something went wrong.
 *
 * @module services/memory-control
 */

import { apiDelete, apiGet, apiPatch, getApiHeadersAsync } from '../utils/api.js';
import { ApiError, err, ok, type AsyncResult, type Result } from '../types/result.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MemoryControl');

const BASE = '/api/memory/me';

// ============================================================================
// TYPES (mirror the API contract)
// ============================================================================

export interface MemoryFact {
  id: string;
  text: string;
  category: string;
  confidence: number;
  sourceConversationIds: string[];
  userEdited: boolean;
  updatedAt: string;
}

export interface MemoryPerson {
  id: string;
  name: string;
  relationship?: string;
  notes?: string;
  updatedAt: string;
}

export interface MemorySnapshot {
  facts: MemoryFact[];
  people: MemoryPerson[];
  updatedAt?: string;
}

export interface ConversationSummary {
  id: string;
  startedAt: string;
  endedAt?: string;
  personaId?: string;
  summary?: string;
  turnCount: number;
}

export interface ConversationPage {
  conversations: ConversationSummary[];
  nextCursor?: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  turns: ConversationTurn[];
}

export interface ConversationDeletion {
  deleted: { turns: number; facts: number; embeddings: number };
}

export type ExportFormat = 'json' | 'csv';

export interface ExportFile {
  blob: Blob;
  filename: string;
}

export interface FactEdit {
  text: string;
  category?: string;
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

/** Unwrap an api.ts response wrapper into a Result. */
function unwrap<T>(response: WrappedResponse<T>, what: string): Result<T, ApiError> {
  if (!response.ok || response.data === undefined || response.data === null) {
    log.warn({ status: response.status, error: response.error }, `Memory API: ${what} failed`);
    return err(new ApiError(response.error || `Couldn't ${what}`, response.status));
  }
  return ok(response.data);
}

function enc(id: string): string {
  return encodeURIComponent(id);
}

/** Today's date as YYYY-MM-DD, for download names. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Pick a filename from Content-Disposition, falling back to a dated name. */
export function exportFilename(
  disposition: string | null,
  contentType: string | null,
  format: ExportFormat
): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (match?.[1]) {
    const name = decodeURIComponent(match[1]).split(/[\\/]/).pop();
    if (name) return name;
  }
  const ext = contentType?.includes('zip') ? 'zip' : format;
  return `ferni-memories-${today()}.${ext}`;
}

// ============================================================================
// API
// ============================================================================

export async function listMemories(): AsyncResult<MemorySnapshot, ApiError> {
  const result = unwrap(await apiGet<MemorySnapshot>(BASE), 'load your memories');
  if (!result.ok) return result;
  const { facts, people, updatedAt } = result.value;
  return ok({
    facts: Array.isArray(facts) ? facts : [],
    people: Array.isArray(people) ? people : [],
    updatedAt,
  });
}

export async function editFact(id: string, edit: FactEdit): AsyncResult<MemoryFact, ApiError> {
  return unwrap(await apiPatch<MemoryFact>(`${BASE}/facts/${enc(id)}`, edit), 'save that');
}

export async function deleteFact(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(`${BASE}/facts/${enc(id)}`), 'forget that');
}

export async function deletePerson(id: string): AsyncResult<{ deleted: true }, ApiError> {
  return unwrap(await apiDelete<{ deleted: true }>(`${BASE}/people/${enc(id)}`), 'forget them');
}

export async function listConversations(
  cursor?: string,
  limit = 20
): AsyncResult<ConversationPage, ApiError> {
  const params: Record<string, string> = { limit: String(limit) };
  if (cursor) params.cursor = cursor;
  const result = unwrap(
    await apiGet<ConversationPage>(`${BASE}/conversations`, params),
    'load your conversations'
  );
  if (!result.ok) return result;
  return ok({
    conversations: Array.isArray(result.value.conversations) ? result.value.conversations : [],
    nextCursor: result.value.nextCursor || undefined,
  });
}

export async function getConversation(id: string): AsyncResult<ConversationDetail, ApiError> {
  const result = unwrap(
    await apiGet<ConversationDetail>(`${BASE}/conversations/${enc(id)}`),
    'open that conversation'
  );
  if (!result.ok) return result;
  return ok({
    ...result.value,
    turns: Array.isArray(result.value.turns) ? result.value.turns : [],
  });
}

export async function deleteConversation(id: string): AsyncResult<ConversationDeletion, ApiError> {
  return unwrap(
    await apiDelete<ConversationDeletion>(`${BASE}/conversations/${enc(id)}`),
    'delete that conversation'
  );
}

/** Raw fetch for calls the JSON wrappers can't make (a DELETE body, a file download). */
async function rawRequest(path: string, init: RequestInit): AsyncResult<Response, ApiError> {
  try {
    const headers = await getApiHeadersAsync(init.body !== undefined);
    const response = await fetch(new URL(path, window.location.origin).toString(), {
      ...init,
      headers,
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string') message = body.error;
      } catch {
        // Not JSON; keep the status message
      }
      return err(new ApiError(message, response.status));
    }
    return ok(response);
  } catch (error) {
    log.warn({ error: String(error), path }, 'Memory API request failed');
    return err(new ApiError(String(error), 0));
  }
}

export async function exportMemories(format: ExportFormat): AsyncResult<ExportFile, ApiError> {
  const result = await rawRequest(`${BASE}/export?format=${format}`, { method: 'GET' });
  if (!result.ok) return result;
  const response = result.value;
  const blob = await response.blob();
  return ok({
    blob,
    filename: exportFilename(
      response.headers.get('content-disposition'),
      response.headers.get('content-type'),
      format
    ),
  });
}

export async function deleteAllMemories(): AsyncResult<true, ApiError> {
  const result = await rawRequest(BASE, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: 'DELETE' }),
  });
  return result.ok ? ok(true) : result;
}

/** Hand a file to the browser as a download. */
export function downloadFile(file: ExportFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
