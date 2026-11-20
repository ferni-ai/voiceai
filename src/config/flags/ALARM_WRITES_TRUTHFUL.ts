import type { FlagSpec } from '../flag-spec.js';

// on: when Firestore is there but an alarm save or delete fails, the write rejects and the in-memory copy is left alone, and setAlarm, deleteAlarm and snoozeAlarm (voice tools and the chat path) say they couldn't (tools/domains/simple-utilities/alarm-store.ts). Off: as on main, the change goes to the in-memory copy and the tool reports it done, though the next read is Firestore's.
export const ALARM_WRITES_TRUTHFUL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4262',
  context:
    'Turn on in dev; promote after a dev night with no ALARM_WRITES_TRUTHFUL warning on a healthy Firestore and no alarm tool reporting a change the next read lacks.',
} as const satisfies FlagSpec;
