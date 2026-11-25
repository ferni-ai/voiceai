/**
 * The words a guest says yes to, with the owner's first name in them, and which
 * names from an account are fit to show her.
 */
import { describe, expect, it } from 'vitest';
import { guestInviteWording, inviteOwnerName, isLiveInvite } from '../guest-invite.js';

describe('guestInviteWording', () => {
  it("is the brief's wording with the owner's first name", () => {
    expect(guestInviteWording('Rowan')).toBe(
      'Rowan would like Ferni, their AI friend, to be able to bring you into their calls. ' +
        'Ferni takes notes for Rowan on those calls. ' +
        'You can say no on any call, or stop this any time.'
    );
  });

  it('says "Your friend" without a name', () => {
    expect(guestInviteWording(null)).toBe(
      'Your friend would like Ferni, their AI friend, to be able to bring you into their calls. ' +
        'Ferni takes notes for your friend on those calls. ' +
        'You can say no on any call, or stop this any time.'
    );
  });
});

describe('inviteOwnerName', () => {
  it('takes the first word of a plain name', () => {
    expect(inviteOwnerName('Rowan Ellery')).toBe('Rowan');
    expect(inviteOwnerName('  Zoë ')).toBe('Zoë');
  });

  it('is null for no name, or one the guest-name cleaner refuses or flags', () => {
    for (const raw of [
      undefined,
      null,
      42,
      '',
      '   ',
      'R0wan',
      'Rowan\u200b',
      '<b>Rowan</b>',
      'unclear',
    ]) {
      expect(inviteOwnerName(raw)).toBeNull();
    }
  });
});

describe('isLiveInvite', () => {
  const invite = { uid: 'u-fictional-owner', phoneHash: 'ab', createdAt: 0, expiresAt: 100 };

  it('is live until its expiry, and never with a field missing', () => {
    expect(isLiveInvite(invite, 99)).toBe(true);
    expect(isLiveInvite(invite, 100)).toBe(false);
    expect(isLiveInvite({ ...invite, uid: ' ' }, 0)).toBe(false);
    expect(isLiveInvite({ ...invite, phoneHash: '' }, 0)).toBe(false);
    expect(isLiveInvite(null, 0)).toBe(false);
  });
});
