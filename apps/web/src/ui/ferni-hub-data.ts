/**
 * "Your Day" hub data: the three routes the hub reads, and which of the four
 * panel states (ready, empty, error, signed out) their answers add up to.
 *
 * A failed route used to come back as an empty list, so a failure looked like
 * "All caught up". Any failed route is now an error, and the whole load ends
 * within LOAD_DEADLINE_MS so the loading state never hangs.
 */

import { apiGet, type ApiResponse } from '../utils/api.js';
import { getAuthState } from '../services/firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('FerniHubData');

/** After this the hub stops waiting and shows its error state. */
export const LOAD_DEADLINE_MS = 9000;

// One attempt each, bounded, so three parallel reads finish inside the deadline
const ROUTE_OPTIONS = { maxRetries: 0, timeout: 8000 };

export interface BackgroundResult {
  id: string;
  type: string;
  summary: string;
  status: 'success' | 'partial_success' | 'failed' | 'requires_action';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  contactName?: string;
  capturedAt: string;
  initiatedBy: string;
  actionItems?: string[];
  requiresCallback?: boolean;
}

export interface OpenThread {
  id: string;
  topic: string;
  lastMessage: string;
  personaId: string;
  personaName: string;
  updatedAt: string;
  isActive: boolean;
}

/** One row of GET /api/commitments (src/api/routes/commitments.ts). */
export interface TrackedItem {
  id: string;
  type: string;
  description: string;
  dueDate?: string | number;
  personaId?: string;
  status: string;
}

export interface HubData {
  backgroundResults: BackgroundResult[];
  openThreads: OpenThread[];
  trackedItems: TrackedItem[];
  lastUpdated: string;
}

export type HubState = 'ready' | 'empty' | 'error' | 'signed-out';

export interface HubLoad {
  state: HubState;
  data: HubData;
}

function emptyData(): HubData {
  return {
    backgroundResults: [],
    openThreads: [],
    trackedItems: [],
    lastUpdated: new Date().toISOString(),
  };
}

function listFrom<T>(res: ApiResponse<Record<string, unknown>>, field: string): T[] {
  const value = res.data?.[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

async function readRoutes(userId: string): Promise<HubLoad> {
  const [results, threads, tracked] = await Promise.all([
    apiGet<Record<string, unknown>>(
      '/api/background-results/pending',
      { userId, limit: '10' },
      ROUTE_OPTIONS
    ),
    apiGet<Record<string, unknown>>(
      '/api/conversations/threads',
      { userId, status: 'open', limit: '5' },
      ROUTE_OPTIONS
    ),
    // The keeper stores a live commitment as 'active'; asking for 'pending' always returned []
    apiGet<Record<string, unknown>>(
      '/api/commitments',
      { userId, status: 'active', limit: '8' },
      ROUTE_OPTIONS
    ),
  ]);

  const responses = [results, threads, tracked];
  if (responses.some((res) => res.status === 401))
    return { state: 'signed-out', data: emptyData() };
  const failed = responses.filter((res) => !res.ok);
  if (failed.length > 0) {
    log.warn('Hub routes failed', {
      failures: failed.map((res) => `${res.status} ${res.error ?? ''}`),
    });
    return { state: 'error', data: emptyData() };
  }

  const data: HubData = {
    backgroundResults: listFrom<BackgroundResult>(results, 'results'),
    openThreads: listFrom<OpenThread>(threads, 'threads'),
    trackedItems: listFrom<TrackedItem>(tracked, 'items'),
    lastUpdated: new Date().toISOString(),
  };
  const hasAny =
    data.backgroundResults.length + data.openThreads.length + data.trackedItems.length > 0;
  return { state: hasAny ? 'ready' : 'empty', data };
}

/** Load the hub. Never rejects and always settles within LOAD_DEADLINE_MS. */
export async function fetchHubData(): Promise<HubLoad> {
  const userId = getAuthState()?.uid;
  if (!userId) return { state: 'signed-out', data: emptyData() };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<HubLoad>((resolve) => {
    timer = setTimeout(() => {
      log.warn('Hub load passed its deadline', { deadlineMs: LOAD_DEADLINE_MS });
      resolve({ state: 'error', data: emptyData() });
    }, LOAD_DEADLINE_MS);
  });
  const load = readRoutes(userId).catch((error: unknown) => {
    log.warn('Hub load failed', { error: String(error) });
    return { state: 'error', data: emptyData() } satisfies HubLoad;
  });
  try {
    return await Promise.race([load, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
