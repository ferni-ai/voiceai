/**
 * No caller turn approves or rejects a pending action from what the caller said.
 *
 * The turn handler used to: a short reply starting with a confirm word ("yes im suicidal",
 * "ok kill me") resolved the newest pending action, bumped its trust profile and spoke
 * "[ACTION CONFIRMED]", then returned before processTurn, which holds the turn's crisis read.
 * That branch ran only with contextOnly false; the live hook (turn-intelligence.ts) passes
 * true, so it was dead in production and was deleted with its parser. These cases drive the
 * real live entry, createTurnIntelligenceHook, and the handler directly with contextOnly false
 * (any other caller), with a pending action queued. All lines are fictional.
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

const { createTurnIntelligenceHook } = await import('../../multi-agent/turn-intelligence.js');
const { handleUserTurn } = await import('../turn-handler.js');
type Deps = Parameters<typeof createTurnIntelligenceHook>[0];
type Ctx = Parameters<typeof handleUserTurn>[0];

const persona = { id: 'ferni', name: 'Ferni', displayName: 'Ferni' };
const services = { sessionId: 'fict-session-approval', userId: 'fict-uid-9' };

/** One caller turn through the live hook, with the real turn handler behind it. */
async function liveTurn(userText: string): Promise<string[]> {
  events.length = 0;
  const hook = createTurnIntelligenceHook({
    persona,
    services,
    userData: { turnCount: 3 },
    revivedStore: { summaries: async () => [] },
  } as unknown as Deps);
  await hook(llm.ChatContext.empty(), llm.ChatMessage.create({ role: 'user', content: userText }));
  return [...events];
}

/** One turn straight into the handler with contextOnly false, the shape the branch ran on. */
async function directTurn(userText: string): Promise<string[]> {
  events.length = 0;
  await handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText,
    contextOnly: false,
    persona,
    services,
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
const PLAIN_REPLIES = ['yes', 'ok', 'yes please', 'no', 'stop please'];

beforeEach(() => vi.stubEnv('CRISIS_GUARD_MODE', 'live'));

describe('no voice approval of pending actions', () => {
  describe.each([
    ['the live hook', liveTurn],
    ['the handler with contextOnly false', directTurn],
  ])('%s', (_name, turn) => {
    it.each([...CRISIS_LINES, ...PLAIN_REPLIES])(
      '"%s" reaches processTurn and resolves nothing',
      async (line) => {
        const ev = await turn(line);
        expect(ev.filter((e) => e.startsWith('side-effect:'))).toEqual([]);
        expect(ev).toContain(`processTurn:${line}`);
      }
    );
  });

  it('turn-handler.ts does not import a voice approval handler', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../turn-handler.ts', import.meta.url)),
      'utf8'
    );
    expect(source).not.toMatch(/action-approval-handler|handleActionApprovalIntent/);
  });
});
