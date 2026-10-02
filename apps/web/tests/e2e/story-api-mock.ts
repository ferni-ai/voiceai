/**
 * Stateful mock of the life story API (/api/memory/me/story, /beliefs) for
 * E2E specs. Registered after the memory control mock, so it wins for these
 * paths. Requests are recorded on the state.
 */

import type { Page, Route } from '@playwright/test';

interface Item {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  period?: string;
  people?: Array<{ name: string }>;
  source: string;
  userEdited: boolean;
  sourceConversationIds: string[];
  updatedAt: string;
}

interface Value {
  id: string;
  label: string;
  category: string;
  statement: string;
  source: string;
  userEdited: boolean;
  sourceConversationIds: string[];
  updatedAt: string;
}

export interface StoryState {
  items: Item[];
  values: Value[];
  beliefs: Item[];
  requests: Array<{ method: string; path: string; body: unknown }>;
}

const T = '2026-09-30T10:00:00.000Z';

export function freshStoryState(): StoryState {
  const item = (p: Partial<Item> & Pick<Item, 'id' | 'kind' | 'title'>): Item => ({
    source: 'stated',
    userEdited: false,
    sourceConversationIds: ['c-1'],
    updatedAt: T,
    ...p,
  });
  return {
    items: [
      item({ id: 'story_origin', kind: 'origin', title: 'Grew up in Columbus, Ohio' }),
      item({
        id: 'story_tree',
        kind: 'story',
        title: 'Building a treehouse with Sam',
        period: 'age 9',
        people: [{ name: 'Sam' }],
        sourceConversationIds: ['c-1', 'c-2'],
      }),
      item({ id: 'story_berlin', kind: 'chapter', title: 'My Berlin years', period: '2012-2016' }),
    ],
    values: [
      {
        id: 'value_family',
        label: 'family',
        category: 'family',
        statement: 'Family matters most to me',
        source: 'stated',
        userEdited: false,
        sourceConversationIds: ['c-1'],
        updatedAt: T,
      },
    ],
    beliefs: [item({ id: 'belief_mass', kind: 'practice', title: 'Goes to mass on Sundays' })],
    requests: [],
  };
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `beliefsEnabled` reads the sensitive mock's switch, so both mocks agree. */
export async function mockStoryApi(
  page: Page,
  state: StoryState,
  beliefsEnabled: () => boolean = () => false
): Promise<void> {
  await page.route(/\/api\/memory\/me\/(story|beliefs)(\/|\?|$)/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/memory\/me/, '');
    const method = request.method();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    state.requests.push({ method, path, body });
    const b = (body ?? {}) as Record<string, string | null>;

    if (path === '/story' && method === 'GET') {
      return json(route, { items: state.items, values: state.values, updatedAt: T });
    }
    if (path === '/story' && method === 'POST') {
      if (b.kind === 'value') {
        const v: Value = {
          id: `value_${String(b.title).toLowerCase()}`,
          label: String(b.title).toLowerCase(),
          category: 'purpose',
          statement: String(b.title),
          source: 'user',
          userEdited: false,
          sourceConversationIds: [],
          updatedAt: T,
        };
        state.values.unshift(v);
        return json(route, { item: v }, 201);
      }
      const item: Item = {
        id: `story_new${state.items.length}`,
        kind: String(b.kind),
        title: String(b.title),
        ...(b.period ? { period: b.period } : {}),
        source: 'user',
        userEdited: false,
        sourceConversationIds: [],
        updatedAt: T,
      };
      state.items.unshift(item);
      return json(route, { item }, 201);
    }
    const story = path.match(/^\/story\/([^/]+)$/);
    if (story && method === 'PATCH') {
      const id = decodeURIComponent(story[1]!);
      if (id.startsWith('value_')) {
        state.values = state.values.map((v) =>
          v.id === id ? { ...v, label: String(b.title ?? v.label), userEdited: true } : v
        );
        return json(route, { item: state.values.find((v) => v.id === id) });
      }
      state.items = state.items.map((i) =>
        i.id === id
          ? {
              ...i,
              title: String(b.title ?? i.title),
              period: b.period === null ? undefined : (b.period ?? i.period),
              userEdited: true,
            }
          : i
      );
      return json(route, { item: state.items.find((i) => i.id === id) });
    }
    if (story && method === 'DELETE') {
      const id = decodeURIComponent(story[1]!);
      state.items = state.items.filter((i) => i.id !== id);
      state.values = state.values.filter((v) => v.id !== id);
      return json(route, { deleted: true });
    }
    if (path === '/beliefs' && method === 'GET') {
      return json(route, { enabled: beliefsEnabled(), items: state.beliefs, updatedAt: T });
    }
    const belief = path.match(/^\/beliefs\/([^/]+)$/);
    if (belief && method === 'PATCH') {
      const id = decodeURIComponent(belief[1]!);
      state.beliefs = state.beliefs.map((i) =>
        i.id === id ? { ...i, title: String(b.title ?? i.title), userEdited: true } : i
      );
      return json(route, { item: state.beliefs.find((i) => i.id === id) });
    }
    if (belief && method === 'DELETE') {
      state.beliefs = state.beliefs.filter((i) => i.id !== decodeURIComponent(belief[1]!));
      return json(route, { deleted: true });
    }
    return json(route, { error: 'Not found' }, 404);
  });
}
