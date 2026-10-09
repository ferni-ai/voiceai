/**
 * Quiz routes localization tests
 *
 * Quiz copy must follow the request's Accept-Language, and scoring must keep
 * working (it is index-based) when the locale is not English.
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockProfile, mockMemories, mockBody } = vi.hoisted(() => ({
  mockProfile: { current: null as Record<string, unknown> | null },
  mockMemories: { current: [] as Array<{ id: string; content: string }> },
  mockBody: { current: {} as unknown },
}));

vi.mock('../../../i18n/index.js', () => ({
  localeForRequest: vi.fn(async (header: string | undefined) => header ?? 'en-US'),
  tFor: vi.fn((locale: string, key: string) => `${locale}|${key}`),
}));

vi.mock('../../../memory/store-factory.js', () => ({
  getStore: async () => ({
    getProfile: vi.fn(async () => mockProfile.current),
    saveProfile: vi.fn(async () => undefined),
  }),
}));

vi.mock('../../../services/memory/persona-memories.js', () => ({
  getAllUserMemories: vi.fn(async () => mockMemories.current),
}));

vi.mock('../../helpers.js', async () => {
  const actual = await vi.importActual<typeof import('../../helpers.js')>('../../helpers.js');
  return { ...actual, parseBody: vi.fn(async () => mockBody.current) };
});

import { handleQuizRoutes } from '../quiz.js';

interface Captured {
  status: number;
  body: any;
}

async function call(
  method: 'GET' | 'POST',
  pathname: string,
  acceptLanguage: string
): Promise<Captured> {
  const req = {
    method,
    headers: { 'accept-language': acceptLanguage, 'x-firebase-uid': 'user-1' },
  } as unknown as IncomingMessage;
  const captured: Captured = { status: 0, body: null };
  const res = {
    writeHead: (status: number) => {
      captured.status = status;
    },
    end: (payload: string) => {
      captured.body = JSON.parse(payload);
    },
  } as unknown as ServerResponse;
  const handled = await handleQuizRoutes(req, res, pathname, new URL(`http://x${pathname}`));
  expect(handled).toBe(true);
  return captured;
}

describe('quiz routes localization', () => {
  beforeEach(() => {
    mockProfile.current = {
      communicationStyle: 'warm',
      preferredTopics: ['music', 'travel', 'books'],
      totalConversations: 12,
      totalMinutesTalked: 90,
    };
    mockMemories.current = [{ id: 'm1', content: 'You mentioned loving long walks by the sea.' }];
  });

  it('returns question text and options translated for the request locale', async () => {
    const { status, body } = await call('GET', '/api/quiz/knowledge', 'ja');
    expect(status).toBe(200);
    expect(body.questions.length).toBeGreaterThan(0);

    for (const q of body.questions) {
      expect(q.question).toMatch(/^ja\|quiz\.questions\./);
      for (const option of q.options) {
        const isUserTopic = ['music', 'travel', 'books'].includes(option);
        expect(isUserTopic || /^ja\|quiz\.questions\./.test(option)).toBe(true);
      }
    }
    const texts = body.questions.map((q: { question: string }) => q.question);
    expect(texts).toContain('ja|quiz.questions.communicationStyle.text');
    expect(texts).toContain('ja|quiz.questions.memoryRecall.text');
  });

  it('keeps user data (topics) untranslated and the response shape unchanged', async () => {
    const { body } = await call('GET', '/api/quiz/knowledge', 'ja');
    const topicQ = body.questions.find(
      (q: { question: string }) => q.question === 'ja|quiz.questions.favoriteTopic.text'
    );
    expect(topicQ.options).toContain('music');
    expect(Object.keys(topicQ).sort()).toEqual(['category', 'correctIndex', 'difficulty', 'id', 'options', 'question']);
    expect(topicQ.options[topicQ.correctIndex]).toBe('music');
    expect(typeof body.quizId).toBe('string');
    expect(body.timeLimit).toBe(60);
    expect(body.totalQuestions).toBe(body.questions.length);
  });

  it('scores a correct answer as correct when the locale is not English', async () => {
    mockProfile.current = { communicationStyle: 'warm' };
    mockMemories.current = [];
    const { body: quiz } = await call('GET', '/api/quiz/knowledge', 'ja');
    const styleQ = quiz.questions.find(
      (q: { question: string }) => q.question === 'ja|quiz.questions.communicationStyle.text'
    );
    expect(styleQ.options[2]).toBe('ja|quiz.questions.communicationStyle.options.warm');

    mockBody.current = { quizId: quiz.quizId, answers: [{ questionId: styleQ.id, selectedIndex: 2 }] };
    const right = await call('POST', '/api/quiz/knowledge/results', 'ja');
    expect(right.body.result.correctAnswers).toBe(1);
    expect(right.body.result.scorePercent).toBe(100);
    expect(right.body.result.celebration).toBe('ja|quiz.celebrations.soulmate');

    mockBody.current = { quizId: quiz.quizId, answers: [{ questionId: styleQ.id, selectedIndex: 0 }] };
    const wrong = await call('POST', '/api/quiz/knowledge/results', 'ja');
    expect(wrong.body.result.correctAnswers).toBe(0);
    expect(wrong.body.result.celebration).toBe('ja|quiz.celebrations.stranger');
  });

  it('scores against the quiz that was served, shuffles and all', async () => {
    // Several questions plus a shuffled topic question: regenerating without the
    // quiz's seed picked and ordered them differently, so right answers scored wrong.
    for (let run = 0; run < 5; run++) {
      const { body: quiz } = await call('GET', '/api/quiz/knowledge', 'de');
      mockBody.current = {
        quizId: quiz.quizId,
        answers: quiz.questions.map((q: { id: string; correctIndex: number }) => ({
          questionId: q.id,
          selectedIndex: q.correctIndex,
        })),
      };
      const { body } = await call('POST', '/api/quiz/knowledge/results', 'de');
      expect(body.result.correctAnswers).toBe(quiz.questions.length);
      expect(body.result.scorePercent).toBe(100);
    }
  });

  it('accepts the older results payload, trusting its correct flags', async () => {
    mockBody.current = {
      results: [
        { questionId: 'q-1', selectedIndex: 0, correct: true },
        { questionId: 'q-2', selectedIndex: 1, correct: false },
      ],
    };
    const { status, body } = await call('POST', '/api/quiz/knowledge/results', 'en-US');
    expect(status).toBe(200);
    expect(body.result.correctAnswers).toBe(1);
    expect(body.result.totalQuestions).toBe(2);
  });

  it('declares every quiz. key used in quiz.ts in en-US', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, '../quiz.ts'), 'utf8');
    const used = new Set(Array.from(source.matchAll(/'(quiz\.[A-Za-z0-9_.]+)'/g), (m) => m[1]!));
    expect(used.size).toBeGreaterThan(30);

    const fragment: Record<string, unknown> = JSON.parse(
      readFileSync(resolve(here, '../../../i18n/locales/en-US.json'), 'utf8')
    );
    const lookup = (key: string): unknown =>
      key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], fragment);
    const missing = [...used].filter((k) => typeof lookup(k) !== 'string');
    expect(missing).toEqual([]);
  });
});
