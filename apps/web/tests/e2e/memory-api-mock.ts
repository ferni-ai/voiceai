/**
 * Stateful mock of the memory control API (/api/memory/me/**) for E2E specs.
 * Requests are recorded on the state so tests can assert what was sent.
 */

import type { Page, Route } from '@playwright/test';

export interface Fact {
  id: string;
  text: string;
  category: string;
  confidence: number;
  sourceConversationIds: string[];
  userEdited: boolean;
  updatedAt: string;
}

export interface MockState {
  facts: Fact[];
  people: Array<{
    id: string;
    name: string;
    relationship?: string;
    notes?: string;
    updatedAt: string;
  }>;
  conversations: Array<{
    id: string;
    startedAt: string;
    personaId?: string;
    summary?: string;
    turnCount: number;
  }>;
  failMemories?: boolean;
  requests: Array<{ method: string; path: string; body: unknown }>;
}

export function freshState(): MockState {
  return {
    facts: [
      {
        id: 'f-hike',
        text: 'Loves hiking on weekends',
        category: 'interests',
        confidence: 0.9,
        sourceConversationIds: ['c-1', 'c-2'],
        userEdited: false,
        updatedAt: '2026-09-12T10:00:00.000Z',
      },
      {
        id: 'f-job',
        text: 'Works as a nurse',
        category: 'work',
        confidence: 0.8,
        sourceConversationIds: ['c-1'],
        userEdited: true,
        updatedAt: '2026-09-20T10:00:00.000Z',
      },
    ],
    people: [
      {
        id: 'p-sarah',
        name: 'Sarah',
        relationship: 'Sister',
        updatedAt: '2026-09-15T10:00:00.000Z',
      },
    ],
    conversations: [
      {
        id: 'c-1',
        startedAt: '2026-09-20T18:30:00.000Z',
        personaId: 'ferni',
        summary: 'We talked about your night shifts and sleep',
        turnCount: 2,
      },
      {
        id: 'c-2',
        startedAt: '2026-09-12T09:00:00.000Z',
        personaId: 'maya-santos',
        summary: 'Planning a weekend hike',
        turnCount: 6,
      },
    ],
    requests: [],
  };
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function mockMemoryApi(page: Page, state: MockState): Promise<void> {
  await page.route(/\/api\/memory\/me(\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/memory\/me/, '') || '/';
    const method = request.method();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    state.requests.push({ method, path, body });

    if (path === '/' && method === 'GET') {
      if (state.failMemories) return json(route, { error: 'boom' }, 500);
      return json(route, {
        facts: state.facts,
        people: state.people,
        updatedAt: new Date().toISOString(),
      });
    }
    if (path === '/' && method === 'DELETE') {
      state.facts = [];
      state.people = [];
      state.conversations = [];
      return json(route, { deleted: true });
    }
    const fact = path.match(/^\/facts\/([^/]+)$/);
    if (fact) {
      const id = decodeURIComponent(fact[1]!);
      if (method === 'PATCH') {
        const edit = body as { text: string; category?: string };
        state.facts = state.facts.map((f) =>
          f.id === id
            ? { ...f, text: edit.text, userEdited: true, updatedAt: new Date().toISOString() }
            : f
        );
        return json(
          route,
          state.facts.find((f) => f.id === id)
        );
      }
      if (method === 'DELETE') {
        state.facts = state.facts.filter((f) => f.id !== id);
        return json(route, { deleted: true });
      }
    }
    const person = path.match(/^\/people\/([^/]+)$/);
    if (person && method === 'DELETE') {
      state.people = state.people.filter((p) => p.id !== decodeURIComponent(person[1]!));
      return json(route, { deleted: true });
    }
    if (path === '/conversations' && method === 'GET') {
      return json(route, { conversations: state.conversations });
    }
    const conversation = path.match(/^\/conversations\/([^/]+)$/);
    if (conversation) {
      const id = decodeURIComponent(conversation[1]!);
      const summary = state.conversations.find((c) => c.id === id);
      if (method === 'GET' && summary) {
        return json(route, {
          conversation: summary,
          turns: [
            {
              role: 'user',
              text: "I can't sleep after night shifts",
              timestamp: '2026-09-20T18:31:00.000Z',
            },
            {
              role: 'assistant',
              text: "That sounds exhausting. Let's look at your wind-down.",
              timestamp: '2026-09-20T18:31:10.000Z',
            },
          ],
        });
      }
      if (method === 'DELETE') {
        state.conversations = state.conversations.filter((c) => c.id !== id);
        return json(route, { deleted: { turns: 2, facts: 1, embeddings: 1 } });
      }
    }
    if (path === '/export' && method === 'GET') {
      const format = url.searchParams.get('format') ?? 'json';
      return route.fulfill({
        status: 200,
        contentType: format === 'csv' ? 'text/csv' : 'application/json',
        headers: { 'Content-Disposition': `attachment; filename="ferni-memories.${format}"` },
        body:
          format === 'csv' ? 'section,id,text\nfact,f-hike,Loves hiking\n' : JSON.stringify(state),
      });
    }
    return json(route, { error: 'Not found' }, 404);
  });
}
