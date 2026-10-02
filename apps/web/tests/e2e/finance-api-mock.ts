/**
 * Stateful mock of the money memory API (/api/memory/me/finances) for E2E
 * specs. Register after the sensitive mock. Requests are recorded on the state.
 */

import type { Page, Route } from '@playwright/test';

export interface FinanceState {
  items: Array<Record<string, unknown> & { id: string; text: string }>;
  requests: Array<{ method: string; path: string; body: unknown }>;
}

export function freshFinanceState(): FinanceState {
  return {
    items: [
      {
        id: 'fin_aaaaaaaaaaaaaaaaaaaaaaaa',
        kind: 'debt',
        subject: 'credit card',
        text: 'Paying off their credit card',
        status: 'active',
        amount: { value: 4000, currency: 'USD', said: '$4,000' },
        source: 'explicit',
        sourceConversationIds: ['c-1'],
        userEdited: false,
        lastMentionedAt: '2026-09-28T10:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
      },
      {
        id: 'fin_bbbbbbbbbbbbbbbbbbbbbbbb',
        kind: 'savings',
        subject: 'house',
        text: 'Saving for a house',
        status: 'active',
        aspirationId: 'asp_aaaaaaaaaaaaaaaaaaaaaaaa',
        source: 'explicit',
        sourceConversationIds: ['c-1'],
        userEdited: false,
        lastMentionedAt: '2026-09-27T10:00:00.000Z',
        updatedAt: '2026-09-27T10:00:00.000Z',
      },
    ],
    requests: [],
  };
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `enabled` reads the Money switch from the sensitive mock's state. */
export async function mockFinanceApi(
  page: Page,
  state: FinanceState,
  enabled: () => boolean
): Promise<void> {
  await page.route(/\/api\/memory\/me\/finances(\/|\?|$)/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/memory\/me\/finances/, '');
    const method = request.method();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    state.requests.push({ method, path, body });

    if (path === '' && method === 'GET') {
      return json(route, { enabled: enabled(), items: state.items, updatedAt: null });
    }
    const id = decodeURIComponent(path.replace(/^\//, ''));
    const item = state.items.find((i) => i.id === id);
    if (!item) return json(route, { error: 'Not found' }, 404);
    if (method === 'PATCH') {
      const edit = body as Record<string, unknown>;
      const next: Record<string, unknown> & { id: string; text: string } = {
        ...item,
        ...edit,
        userEdited: true,
      };
      if (edit.amount === null) delete next.amount;
      state.items = state.items.map((i) => (i.id === id ? next : i));
      return json(route, { item: next });
    }
    if (method === 'DELETE') {
      state.items = state.items.filter((i) => i.id !== id);
      return json(route, { deleted: true });
    }
    return json(route, { error: 'Method not allowed' }, 405);
  });
}
