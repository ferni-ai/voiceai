/**
 * Stateful mock of the sensitive-memory API (/api/memory/me/consent, /health,
 * /mood) for E2E specs. Registered after the memory control mock, so it wins
 * for these paths. Requests are recorded on the state.
 */

import type { Page, Route } from '@playwright/test';

type Cat = 'health' | 'finances' | 'beliefs';

export interface SensitiveState {
  answeredAt: string | null;
  enabled: Record<Cat, boolean>;
  items: Array<{
    id: string;
    kind: string;
    subject: string;
    text: string;
    status: string;
    userEdited: boolean;
    lastMentionedAt: string;
    sourceConversationIds: string[];
  }>;
  timeline: Array<{
    id: string;
    personaId?: string;
    startedAt: string;
    endedAt: string;
    dominantMood: string;
    averageValence: number;
    arc: string;
  }>;
  requests: Array<{ method: string; path: string; body: unknown }>;
}

export function freshSensitiveState(): SensitiveState {
  return {
    answeredAt: null,
    enabled: { health: false, finances: false, beliefs: false },
    items: [
      {
        id: 'health_aaaaaaaaaaaaaaaaaaaaaaaa',
        kind: 'condition',
        subject: 'asthma',
        text: 'Has asthma',
        status: 'current',
        userEdited: false,
        lastMentionedAt: '2026-09-28T10:00:00.000Z',
        sourceConversationIds: ['c-1'],
      },
    ],
    timeline: [
      {
        id: 'sess-1',
        personaId: 'ferni',
        startedAt: '2026-09-30T18:00:00.000Z',
        endedAt: '2026-09-30T18:20:00.000Z',
        dominantMood: 'calm',
        averageValence: 0.4,
        arc: 'lifting',
      },
    ],
    requests: [],
  };
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function consentView(state: SensitiveState) {
  const cat = (c: Cat) => ({ enabled: state.enabled[c], updatedAt: null, source: null });
  return {
    consent: {
      version: 1,
      answeredAt: state.answeredAt,
      categories: { health: cat('health'), finances: cat('finances'), beliefs: cat('beliefs') },
      updatedAt: null,
    },
    stored: { health: state.items.length + state.timeline.length, finances: 0, beliefs: 0 },
    safetyExceptions: [{ category: 'health', kind: 'allergies', description: '' }],
  };
}

export async function mockSensitiveApi(page: Page, state: SensitiveState): Promise<void> {
  await page.route(/\/api\/memory\/me\/(consent|health|mood)(\/|\?|$)/, async (route) => {
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

    if (path === '/consent' && method === 'GET') return json(route, consentView(state));
    if (path === '/consent' && method === 'PUT') {
      const b = body as { agreeAll?: boolean; categories?: Partial<Record<Cat, boolean>> };
      state.answeredAt = state.answeredAt ?? new Date().toISOString();
      if (typeof b.agreeAll === 'boolean') {
        state.enabled = { health: b.agreeAll, finances: b.agreeAll, beliefs: b.agreeAll };
      }
      for (const [c, on] of Object.entries(b.categories ?? {}))
        state.enabled[c as Cat] = Boolean(on);
      return json(route, consentView(state));
    }
    const data = path.match(/^\/consent\/(health|finances|beliefs)\/data$/);
    if (data && method === 'DELETE') {
      const deleted = data[1] === 'health' ? state.items.length + state.timeline.length : 0;
      if (data[1] === 'health') {
        state.items = [];
        state.timeline = [];
      }
      return json(route, { deleted });
    }
    if (path === '/health' && method === 'GET') {
      return json(route, {
        enabled: state.enabled.health,
        items: state.items,
        safety: { allergies: [{ item: 'peanut', severity: 'severe' }], intolerances: [], note: '' },
        updatedAt: null,
      });
    }
    const item = path.match(/^\/health\/([^/]+)$/);
    if (item && method === 'PATCH') {
      const id = decodeURIComponent(item[1]!);
      const text = (body as { text: string }).text;
      state.items = state.items.map((i) => (i.id === id ? { ...i, text, userEdited: true } : i));
      return json(route, { item: state.items.find((i) => i.id === id) });
    }
    if (item && method === 'DELETE') {
      state.items = state.items.filter((i) => i.id !== decodeURIComponent(item[1]!));
      return json(route, { deleted: true });
    }
    if (path === '/mood' && method === 'GET') {
      return json(route, {
        enabled: state.enabled.health,
        timeline: state.timeline,
        insight: state.timeline.length ? "You've seemed in good spirits lately." : null,
      });
    }
    const mood = path.match(/^\/mood\/([^/]+)$/);
    if (mood && method === 'DELETE') {
      state.timeline = state.timeline.filter((c) => c.id !== decodeURIComponent(mood[1]!));
      return json(route, { deleted: true });
    }
    return json(route, { error: 'Not found' }, 404);
  });
}
