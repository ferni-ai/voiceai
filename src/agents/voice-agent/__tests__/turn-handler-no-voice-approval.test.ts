/**
 * The turn handler never approves or rejects a pending action from what the caller said.
 *
 * It used to: a short reply starting with a confirm word ("yes im suicidal", "ok kill me")
 * resolved the newest pending action, bumped its trust profile and spoke "[ACTION CONFIRMED]",
 * then returned before processTurn, which holds the turn's crisis read. That branch only ran
 * with contextOnly false, and the live hook (turn-intelligence.ts) always passes true, so it
 * was dead in production and was deleted. This pins both halves: no turn shape resolves an
 * action, and every turn reaches processTurn. All lines are fictional.
 */
import { llm } from '@livekit/agents';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const events = vi.hoisted(() => [] as string[]);

vi.mock('../../../services/automation/trust-level-system.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getPendingActions: vi.fn(async () => [
    {
      id: 'pa-fict-1',
      userId: 'fict-uid-9',
      actionType: 'create_event',
      category: 'calendar',
      status: 'pending',
    },
  ]),
  resolvePendingAction: vi.fn(async (_u: string, id: string, approved: boolean) => {
    events.push(`side-effect:resolvePendingAction:${approved ? 'approved' : 'rejected'}`);
    return { id, status: approved ? 'approved' : 'rejected' };
  }),
  updateTrustProfile: vi.fn(async () => void events.push('side-effect:updateTrustProfile')),
}));
vi.mock('../../realtime/action-event-dispatcher.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  dispatchActionApproved: vi.fn(async () => void events.push('side-effect:ACTION CONFIRMED')),
  dispatchActionRejected: vi.fn(async () => void events.push('side-effect:ACTION REJECTED')),
}));
vi.mock('../../processors/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTurn: vi.fn(async (ctx: { userText: string }) => {
    events.push(`processTurn:${ctx.userText}`);
    throw new Error('stop after the crisis read point');
  }),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

async function turn(userText: string, contextOnly: boolean): Promise<string[]> {
  events.length = 0;
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText,
    contextOnly,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: 'fict-session-approval', userId: 'fict-uid-9' },
    userData: { turnCount: 3 },
    turnNumber: 3,
    sendDataMessage: async () => undefined,
  } as unknown as Ctx).catch(() => undefined);
  return [...events];
}

const CRISIS_LINES = [
  'yes im suicidal',
  'ok kill me',
  'yeah overdose tonight',
  'ok im done 💊',
  'yes. goodbye forever',
  'sure, end my life',
  'yes i want to die',
];
const PLAIN_REPLIES = ['yes', 'ok', 'yes please', 'sure.', 'no', 'yes but cancel the payment'];

beforeEach(() => vi.stubEnv('CRISIS_GUARD_MODE', 'live'));

describe('turn handler: no voice approval of pending actions', () => {
  // contextOnly true is what the live hook sends; false is the shape the deleted branch ran on.
  describe.each([true, false])('contextOnly %s', (contextOnly) => {
    it.each([...CRISIS_LINES, ...PLAIN_REPLIES])(
      '"%s" reaches processTurn and resolves nothing',
      async (line) => {
        const ev = await turn(line, contextOnly);
        expect(ev.filter((e) => e.startsWith('side-effect:'))).toEqual([]);
        expect(ev).toContain(`processTurn:${line}`);
      }
    );
  });

  it('turn-handler.ts does not import the voice approval handler', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../turn-handler.ts', import.meta.url)),
      'utf8'
    );
    expect(source).not.toMatch(/action-approval-handler|handleActionApprovalIntent/);
  });
});
