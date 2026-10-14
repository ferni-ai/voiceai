/**
 * coachingPick send_text applies the outbound confirm gate's own checks before
 * anything is sent: no text for a test account, and none when the person on the
 * line is known not to be the account owner. Delivery itself is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deliverPick = vi.fn(async () => 'Texted it to them.');
vi.mock('../../../../services/coach-media/pick-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deliverPick,
}));

const { runCoachingPick } = await import('../coaching-resources-tool.js');
const { outreachConfirmListeners } =
  await import('../../communication/outreach/outreach-confirm.js');

beforeEach(() => deliverPick.mockClear());

describe('coachingPick send_text', () => {
  it('sends nothing for a test account', async () => {
    const said = await runCoachingPick(
      { action: 'send_text' },
      { session: {}, userData: {} },
      'voice-eval-caller-1',
      'ferni'
    );
    expect(said).toContain('test account');
    expect(deliverPick).not.toHaveBeenCalled();
  });

  it("sends nothing when the speaker isn't the account owner", async () => {
    const session = {};
    outreachConfirmListeners(session, () => false);
    const said = await runCoachingPick(
      { action: 'send_text' },
      { session, userData: {} },
      'user-1',
      'ferni'
    );
    expect(said).toContain('only the account owner');
    expect(deliverPick).not.toHaveBeenCalled();
  });

  it('texts for the owner, and still lets a non-owner put it in the app', async () => {
    const owner = {};
    outreachConfirmListeners(owner, () => true);
    await runCoachingPick({ action: 'send_text' }, { session: owner, userData: {} }, 'user-1', 'f');
    expect(deliverPick).toHaveBeenLastCalledWith(owner, 'user-1', 'text', 'f');
    const guest = {};
    outreachConfirmListeners(guest, () => false);
    await runCoachingPick({ action: 'send_app' }, { session: guest, userData: {} }, 'user-1', 'f');
    expect(deliverPick).toHaveBeenLastCalledWith(guest, 'user-1', 'app', 'f');
  });
});
