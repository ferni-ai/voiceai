/**
 * RECALL_ACTIVITY through callStatus: with the records side's `activity` installed, the answer
 * about one person carries everything else Ferni did, and an empty query ("is anything still
 * open?") gets that list instead of "ask who they mean". Without it, exactly as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { callStatusReply, setCallRecallPort, type CallRecallPort } from '../call-status-tool.js';
import { installCallRecallPort } from '../../../../services/outreach/call-recall.js';

vi.mock('../call-on-behalf.js', () => ({ findContact: vi.fn(async () => null) }));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

const UID = 'testOwnerUid0000000000000000';
const LIST = 'Everything Ferni did for the caller in the last 30 days ...';

function port(activity?: CallRecallPort['activity']): CallRecallPort {
  return {
    enabled: () => true,
    mayRecall: (u): u is string => u === UID,
    queryWords: (t) => t.toLowerCase().split(/\s+/),
    recall: vi.fn(async () => undefined),
    line: (_c, who) => `No call to ${who} in the last 30 days.`,
    blocksNewCall: () => false,
    windowMs: 30 * 86_400_000,
    ...(activity ? { activity } : {}),
  };
}

function ownerSession(): object {
  const session = { agentState: 'listening' };
  outreachConfirmListeners(session, () => true);
  return session;
}

afterEach(() => setCallRecallPort(undefined));

describe('callStatus with RECALL_ACTIVITY', () => {
  it('an empty query answers with everything Ferni did', async () => {
    setCallRecallPort(port(async () => LIST));
    expect(await callStatusReply(UID, '  ', ownerSession())).toBe(LIST);
  });

  it('a person query gets their status, then the whole list', async () => {
    setCallRecallPort(port(async () => LIST));
    const reply = await callStatusReply(UID, 'aunt', ownerSession());
    expect(reply).toBe(`No call to aunt in the last 30 days.\n\n${LIST}`);
  });

  it('off (no activity, or it returns nothing): exactly as before', async () => {
    setCallRecallPort(port());
    expect(await callStatusReply(UID, '', ownerSession())).toBe('Ask the caller who they mean.');
    expect(await callStatusReply(UID, 'aunt', ownerSession())).toBe(
      'No call to aunt in the last 30 days.'
    );
    setCallRecallPort(port(async () => undefined));
    expect(await callStatusReply(UID, 'aunt', ownerSession())).toBe(
      'No call to aunt in the last 30 days.'
    );
  });

  it('never lists anything for a speaker not proven the owner', async () => {
    const activity = vi.fn(async () => LIST);
    setCallRecallPort(port(activity));
    const stranger = { agentState: 'listening' };
    outreachConfirmListeners(stranger, () => false);
    const reply = await callStatusReply(UID, '', stranger);
    expect(reply).not.toContain(LIST);
    expect(activity).not.toHaveBeenCalled();
  });
});

describe('the installed records side', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists everything only with RECALL_ACTIVITY on', async () => {
    installCallRecallPort();
    vi.stubEnv('RECALL_ACTIVITY', 'on');
    expect(await callStatusReply(UID, '', ownerSession())).toMatch(
      /^Nothing else Ferni did for the caller in the last 30 days/
    );
    vi.stubEnv('RECALL_ACTIVITY', 'off');
    expect(await callStatusReply(UID, '', ownerSession())).toBe('Ask the caller who they mean.');
  });
});
