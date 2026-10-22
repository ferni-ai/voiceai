/**
 * "Team Insights" in What's Ahead used to be filled with buildSuperhumanContext()
 * output: the model's prompt blocks ("[COMMITMENT KEEPER - Better Than Human
 * Accountability] You remember EVERYTHING ..."), cut at 200 chars and shown to
 * the person verbatim. Prompt context is for the model; the practice view must
 * never send it to the client.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/calendar/index.js', () => ({ getEvents: vi.fn(async () => []) }));
vi.mock('../../../services/superhuman/semantic-intelligence/index.js', () => ({
  buildSemanticIntelligenceContext: vi.fn(async () => ({ activeCorrelations: [] })),
}));
vi.mock('../../../services/superhuman/index.js', () => ({
  buildSuperhumanContext: vi.fn(async () => ({
    commitments:
      '[COMMITMENT KEEPER - Better Than Human Accountability]\nYou remember EVERYTHING they commit to. This is your superpower.\n**Active Commitments:** call mom',
    capacity: '[CAPACITY GUARDIAN] Watch their energy.',
    dreams: '[DREAM KEEPER] They dream of <b>sailing</b>.',
    milestones: '[RELATIONSHIP MILESTONES] Anniversary soon.',
  })),
}));
vi.mock('../../../services/superhuman/predictive-coaching.js', () => ({
  generatePredictions: vi.fn(async () => []),
}));

const { handleGetPracticeView } = await import('../practice-view.js');

async function getView(): Promise<Record<string, any>> {
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      raw = data ?? '';
    }),
  } as unknown as ServerResponse;
  const req = {
    headers: { 'x-firebase-uid': 'user-1' },
    method: 'GET',
  } as unknown as IncomingMessage;
  await handleGetPracticeView(req, res, new URL('http://localhost/api/practice-view'));
  return JSON.parse(raw) as Record<string, any>;
}

describe('GET /api/practice-view cross-persona insights', () => {
  it('never carries model prompt text to the client', async () => {
    const body = await getView();
    expect(body.success).toBe(true);
    const sent = JSON.stringify(body);
    for (const marker of [
      '[COMMITMENT KEEPER',
      'Better Than Human',
      'You remember EVERYTHING',
      '[CAPACITY GUARDIAN',
      '[DREAM KEEPER',
      '[RELATIONSHIP MILESTONES',
    ]) {
      expect(sent).not.toContain(marker);
    }
    expect(body.crossPersonaInsights).toEqual([]);
  });
});
