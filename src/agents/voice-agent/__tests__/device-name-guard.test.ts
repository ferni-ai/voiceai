import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';

const { identifyFromMetadata } = vi.hoisted(() => ({ identifyFromMetadata: vi.fn() }));

vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({
  prefetchUserCommitments: vi.fn(async () => {}),
}));
vi.mock('../../../services/identity/user-identification.js', () => ({ identifyFromMetadata }));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: vi.fn(async () => ({})),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));

const { identifyUser } = await import('../user-identification-handler.js');
const { isDeviceOrHandleName } = await import('../device-name-guard.js');

const room = {} as Room;

/** A first-time caller: no profile, so the metadata display name is the only name. */
async function nameFor(metadataName: string, profileName?: string): Promise<string | undefined> {
  identifyFromMetadata.mockResolvedValue({
    userId: 'uid-1',
    source: { type: 'firebase' },
    profile: profileName ? { name: profileName } : null,
  });
  const result = await identifyUser({
    jobMetadata: JSON.stringify({ user_name: metadataName, firebase_uid: 'uid-1' }),
    room,
    sessionId: `s-${metadataName}`,
  });
  return result.userName;
}

describe('DEVICE_NAME_GUARD in identifyUser (#2061)', () => {
  beforeEach(() => identifyFromMetadata.mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it('flag off: a device word is still taken as the name, as before', async () => {
    vi.stubEnv('DEVICE_NAME_GUARD', 'off');
    expect(await nameFor('iphone')).toBe('iphone');
    expect(await nameFor('guest-ab12cd')).toBe('guest-ab12cd');
  });

  it('flag unset reads as off', async () => {
    vi.stubEnv('DEVICE_NAME_GUARD', '');
    expect(await nameFor('iphone')).toBe('iphone');
  });

  it('flag on: "iphone" is no name, so Ferni asks instead of greeting the device', async () => {
    vi.stubEnv('DEVICE_NAME_GUARD', 'on');
    expect(await nameFor('iphone')).toBeUndefined();
  });

  it("flag on: generated handles and the phone's own name are no name", async () => {
    vi.stubEnv('DEVICE_NAME_GUARD', 'on');
    expect(await nameFor('guest-ab12cd')).toBeUndefined();
    expect(await nameFor('ios-6e193758')).toBeUndefined();
    expect(await nameFor("Seth's iPhone")).toBeUndefined();
  });

  it('flag on: a real name is kept, from metadata or the profile', async () => {
    vi.stubEnv('DEVICE_NAME_GUARD', 'on');
    expect(await nameFor('Sam')).toBe('Sam');
    expect(await nameFor('iphone', 'Priya')).toBe('Priya');
  });
});

describe('isDeviceOrHandleName', () => {
  it.each([
    'iphone',
    'iPhone',
    ' iPad ',
    'android',
    'web',
    'my phone',
    'guest-ab12cd',
    'guest-xkqzpa',
    'ios-6e193758',
    'web_1a2b3c',
    'iphone12',
    'guest 2',
    "Seth's iPhone",
    'Ana’s Galaxy',
  ])('%s is a device or a handle', (name) => {
    expect(isDeviceOrHandleName(name)).toBe(true);
  });

  it.each([
    'Sam',
    'Iris',
    'Phoenix',
    'Webster',
    'Mac',
    'Iosif',
    'Guestina',
    'Mobley',
    'Anon Smith',
  ])('%s is a name', (name) => {
    expect(isDeviceOrHandleName(name)).toBe(false);
  });
});
