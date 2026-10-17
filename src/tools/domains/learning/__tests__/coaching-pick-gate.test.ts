/**
 * coachingPick send_text texts only when the speaker is known to be the account
 * owner: no text for a test account, none for a known non-owner, and none when
 * nobody registered an owner check (unknown counts as no). The owner check is
 * registered the way a live call does it (installLiveCallBehaviors), except on
 * paths that never call it. Delivery itself is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deliverPick = vi.fn(async () => 'Texted it to them.');
vi.mock('../../../../services/coach-media/pick-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deliverPick,
}));

const { runCoachingPick } = await import('../coaching-resources-tool.js');
const { outreachConfirmListeners } =
  await import('../../communication/outreach/outreach-confirm.js');
const { installLiveCallBehaviors } =
  await import('../../../../agents/multi-agent/live-call-behaviors.js');
const { rememberDispatchIdentity } =
  await import('../../../../agents/voice-agent-entry/caller-recognition.js');

/** A live call's AgentSession as installLiveCallBehaviors sees it. */
function liveCall(sessionId: string): object {
  const session = { on: vi.fn(), interrupt: vi.fn(), agentState: 'listening' };
  installLiveCallBehaviors({
    session: session as never,
    sessionWithEvents: session,
    sessionEventHandlers: [],
    cleanupFunctions: [],
    sessionId,
    userId: 'user-1',
  });
  return session;
}

const sendText = (session: object | undefined, userId = 'user-1') =>
  runCoachingPick({ action: 'send_text' }, { session, userData: {} }, userId, 'ferni');

beforeEach(() => {
  deliverPick.mockClear();
  vi.stubEnv('INTERRUPT_TRACE', 'off');
  vi.stubEnv('BARGE_IN_FASTPATH', 'off');
  vi.stubEnv('TURN_KEEPER', 'off');
});
afterEach(() => vi.unstubAllEnvs());

describe('coachingPick send_text', () => {
  it('texts the owner of a live call', async () => {
    rememberDispatchIdentity('owner-call', 'firebase', undefined);
    const session = liveCall('owner-call');
    expect(await sendText(session)).toBe('Texted it to them.');
    expect(deliverPick).toHaveBeenCalledWith(session, 'user-1', 'text', 'ferni');
  });

  it('single-agent session with no owner check registered: nothing sent', async () => {
    // voice-agent-entry/session-creator.ts builds its session without installLiveCallBehaviors.
    expect(await sendText({})).toContain('Nothing was sent');
    expect(await sendText(undefined)).toContain('Nothing was sent');
    expect(deliverPick).not.toHaveBeenCalled();
  });

  it('OUTBOUND_CONFIRM=off outside production registers no owner check: nothing sent', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    rememberDispatchIdentity('dev-call', 'firebase', undefined);
    expect(await sendText(liveCall('dev-call'))).toContain('Nothing was sent');
    expect(deliverPick).not.toHaveBeenCalled();
  });

  it('a known non-owner or a test account: nothing sent', async () => {
    const guest = {};
    outreachConfirmListeners(guest, () => false);
    expect(await sendText(guest)).toContain('Nothing was sent');
    rememberDispatchIdentity('eval-call', 'firebase', undefined);
    expect(await sendText(liveCall('eval-call'), 'voice-eval-caller-1')).toContain('test account');
    expect(deliverPick).not.toHaveBeenCalled();
  });

  it('still lets anyone on the call put it in the app', async () => {
    const guest = {};
    outreachConfirmListeners(guest, () => false);
    await runCoachingPick({ action: 'send_app' }, { session: guest, userData: {} }, 'user-1', 'f');
    expect(deliverPick).toHaveBeenLastCalledWith(guest, 'user-1', 'app', 'f');
  });
});
