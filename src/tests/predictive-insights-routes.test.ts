/**
 * Predictive Insights Routes Tests
 *
 * Focus: ensure insight feedback is fully integrated end-to-end:
 * API handler → persistence layer.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSet = vi.fn().mockResolvedValue(undefined);

const mockFeedbackDoc = vi.fn(() => ({ set: mockSet }));
const mockFeedbackCollection = vi.fn(() => ({
  doc: mockFeedbackDoc,
}));

const mockProfileDoc = vi.fn(() => ({
  collection: mockFeedbackCollection,
}));

const mockCollection = vi.fn(() => ({
  doc: mockProfileDoc,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: mockCollection,
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => new Date()),
  },
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../services/predictive-insights/index.js', () => ({
  runPredictiveAnalysis: vi.fn(async () => []),
}));

import { handlePredictiveInsightsRequest } from '../api/predictive-insights-routes.js';

function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: string;
}): IncomingMessage {
  const { method = 'POST', url = '/', body = '' } = options;

  const req = {
    method,
    url,
    headers: { host: 'localhost:3002' },
    on: vi.fn((event: string, callback: (chunk?: unknown) => void) => {
      if (event === 'data' && body) {
        setTimeout(() => callback(Buffer.from(body)), 0);
      }
      if (event === 'end') {
        setTimeout(() => callback(), 1);
      }
      return req;
    }),
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;

  return req;
}

function createMockResponse(): {
  res: ServerResponse;
  getWrittenData: () => { status?: number; body?: string };
} {
  let status: number | undefined;
  let body = '';

  const res = {
    writeHead: vi.fn((s: number) => {
      status = s;
      return res;
    }),
    end: vi.fn((data?: string) => {
      if (data) body = data;
    }),
  } as unknown as ServerResponse;

  return { res, getWrittenData: () => ({ status, body }) };
}

describe('Predictive Insights Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should persist insight feedback via Firestore', async () => {
    const req = createMockRequest({
      method: 'POST',
      url: '/api/insights/feedback',
      body: JSON.stringify({
        insightId: 'insight-123',
        helpful: true,
        accurate: false,
        notes: 'This felt off for today',
      }),
    });
    const { res, getWrittenData } = createMockResponse();
    const parsedUrl = new URL('/api/insights/feedback', 'http://localhost:3002');

    const handled = await handlePredictiveInsightsRequest(req, res, parsedUrl, 'user-abc');

    expect(handled).toBe(true);
    expect(mockCollection).toHaveBeenCalledWith('profiles');
    // Note: mockSet may be called multiple times - once for the main record and
    // optionally again for cross-system analytics via createFeedbackPrompt
    expect(mockSet).toHaveBeenCalled();

    const json = JSON.parse(getWrittenData().body || '{}') as {
      success?: boolean;
      recorded?: boolean;
    };
    expect(json.success).toBe(true);
    expect(json.recorded).toBe(true);
  });
});
