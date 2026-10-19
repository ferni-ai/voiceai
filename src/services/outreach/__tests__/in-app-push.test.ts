import { describe, expect, it, vi } from 'vitest';
import { pushIfSavedInApp, pushInAppIfOn, pushInAppNote, type SendPush } from '../in-app-push.js';

const note = { text: 'How has the week been?', kind: 'momentum_check' };

describe('pushInAppNote', () => {
  it('sends one push with a lock-screen line of the note', async () => {
    const send = vi.fn<SendPush>(async () => true);
    const long = `${'word '.repeat(60)}end`;
    expect(await pushInAppNote('uid-1', { ...note, text: long, messageId: 'inapp-1' }, send)).toBe(
      true
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [, payload] = send.mock.calls[0];
    expect(payload).toMatchObject({
      title: 'Ferni',
      type: 'ferni_checkin',
      data: { kind: 'momentum_check', messageId: 'inapp-1' },
    });
    expect(payload.body.length).toBeLessThanOrEqual(140);
    expect(payload.body.endsWith('…')).toBe(true);
  });

  it('never throws: the note is saved either way', async () => {
    const send = vi.fn<SendPush>(async () => {
      throw new Error('web push down');
    });
    await expect(pushInAppNote('uid-1', note, send)).resolves.toBe(false);
  });
});

describe('pushIfSavedInApp', () => {
  it('pushes only for a note that was saved in the app', async () => {
    const send = vi.fn<SendPush>(async () => true);
    await pushIfSavedInApp('uid-1', { success: true, channel: 'sms' }, note, send);
    await pushIfSavedInApp('uid-1', { success: false, channel: 'in_app' }, note, send);
    expect(send).not.toHaveBeenCalled();
    await pushIfSavedInApp(
      'uid-1',
      { success: true, channel: 'in_app', messageId: 'm1' },
      note,
      send
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].data).toEqual({ kind: 'momentum_check', messageId: 'm1' });
  });
});

describe('pushInAppIfOn (the daily run)', () => {
  const saved = { success: true, channel: 'in_app', messageId: 'm1' };
  it('sends nothing with OUTREACH_IN_APP_PUSH off', async () => {
    vi.stubEnv('OUTREACH_IN_APP_PUSH', 'off');
    const send = vi.fn<SendPush>(async () => true);
    expect(await pushInAppIfOn('uid-1', saved, note, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it('pushes a saved note with OUTREACH_IN_APP_PUSH on', async () => {
    vi.stubEnv('OUTREACH_IN_APP_PUSH', 'on');
    const send = vi.fn<SendPush>(async () => true);
    expect(await pushInAppIfOn('uid-1', saved, note, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
