/**
 * POST /api/jobs/room-sweep (#4125): the room sweep as a Cloud Scheduler job. It runs only for
 * an authenticated scheduler request, skips while another run holds the job lock, and keeps its
 * grace clocks in Firestore, so a pass on a fresh instance finishes what another one started.
 */
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'http';
import { ParticipantInfo_Kind as Kind, ParticipantInfo_State as State } from '@livekit/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PATH = '/api/jobs/room-sweep';
const ROOM = 'voice-riley-test-1';
const MIN = 60_000;

const fake = vi.hoisted(() => ({
  /** Firestore: collection → doc id → data. Survives vi.resetModules, as the database does. */
  db: new Map<string, Map<string, Record<string, unknown>>>(),
  firestoreUp: true,
  lockHeld: false,
  listRooms: vi.fn(async () => [{ name: 'voice-riley-test-1' }]),
  deleteRoom: vi.fn(async (_room: string) => undefined),
}));

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => {
    if (!fake.firestoreUp) return null;
    return {
      collection: (name: string) => {
        const docs = fake.db.get(name) ?? new Map<string, Record<string, unknown>>();
        fake.db.set(name, docs);
        return {
          get: async () => ({
            docs: [...docs].map(([id, data]) => ({ id, data: () => data })),
          }),
          doc: (id: string) => ({
            set: async (data: Record<string, unknown>) => void docs.set(id, data),
            delete: async () => void docs.delete(id),
          }),
        };
      },
    };
  },
}));
vi.mock('../../../servers/token/livekit.js', () => ({
  getRoomService: () => ({
    listRooms: fake.listRooms,
    listParticipants: async () => [{ kind: Kind.STANDARD, state: State.ACTIVE }],
  }),
}));
vi.mock('../../../agents/shared/phone-goodbye.js', () => ({ deleteRoom: fake.deleteRoom }));
vi.mock('../job-lock-store.js', () => ({
  firestoreJobLockStore: () => ({
    acquire: async () =>
      fake.lockHeld ? { acquired: false, holder: 'other-run', expiresAt: 1 } : { acquired: true },
    release: async () => undefined,
  }),
}));

function request(): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  req.url = PATH;
  req.headers = {};
  Object.defineProperty(req, 'socket', { value: { setTimeout: vi.fn() } });
  return req;
}

/** One POST on a freshly loaded server, as Cloud Scheduler may reach a new instance each minute. */
async function post(): Promise<{ status: number; body: Record<string, unknown> }> {
  vi.resetModules();
  const { handleScheduledJobsRoutes } = await import('../index.js');
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(status: number) {
      out.status = status;
      this.headersSent = true;
    },
    end(data?: string) {
      out.body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
      this.writableEnded = true;
    },
    setHeader: vi.fn(),
  };
  expect(await handleScheduledJobsRoutes(request(), res as unknown as ServerResponse, PATH)).toBe(
    true
  );
  return out;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(0);
  vi.stubEnv('ROOM_SWEEP_NO_AGENT', 'on');
  vi.stubEnv('ROOM_SWEEP_GRACE_MINUTES', '1');
  vi.stubEnv('SCHEDULED_JOBS_AUTH', 'off');
  vi.stubEnv('SCHEDULED_JOB_LOCK', 'off');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  fake.db.clear();
  fake.firestoreUp = true;
  fake.lockHeld = false;
});

describe('POST /api/jobs/room-sweep', () => {
  it('refuses a request without a scheduler token (401) and reads no rooms', async () => {
    vi.stubEnv('SCHEDULED_JOBS_AUTH', '');
    const { JOB_PATHS } = await import('../job-paths.js');
    expect(JOB_PATHS.has(PATH)).toBe(true);
    expect((await post()).status).toBe(401);
    expect(fake.listRooms).not.toHaveBeenCalled();
  });

  it('skips the run while another run holds the job lock', async () => {
    vi.stubEnv('SCHEDULED_JOB_LOCK', '');
    fake.lockHeld = true;
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({ skipped: true, reason: 'already_running' });
    expect(fake.listRooms).not.toHaveBeenCalled();
  });

  it('keeps the grace clock across two requests on different instances, then deletes through the shared deleteRoom', async () => {
    expect((await post()).body).toMatchObject({ counts: { within_grace: 1 } });
    expect(fake.deleteRoom).not.toHaveBeenCalled();
    const clocks = [...(fake.db.get('livekit_room_sweep_clocks') ?? new Map()).values()];
    expect(clocks).toHaveLength(1);
    expect(Object.keys(clocks[0]).sort()).toEqual(['aloneSince', 'expireAt']); // no identities
    // a Timestamp, which a Firestore TTL policy reads (a Date would be written as a string)
    expect((clocks[0].expireAt as { toMillis: () => number }).toMillis()).toBe(24 * 60 * MIN);

    vi.setSystemTime(MIN);
    expect((await post()).body).toMatchObject({ counts: { swept: 1 } });
    expect(fake.deleteRoom).toHaveBeenCalledWith(ROOM);
    expect(fake.db.get('livekit_room_sweep_clocks')?.size).toBe(0);
  });

  it('flag off: answers skipped and reads nothing', async () => {
    vi.stubEnv('ROOM_SWEEP_NO_AGENT', '');
    expect((await post()).body).toMatchObject({ success: true, skipped: 'flag-off' });
    expect(fake.listRooms).not.toHaveBeenCalled();
  });

  it('Firestore unavailable: answers 500 and deletes nothing', async () => {
    fake.firestoreUp = false;
    expect((await post()).status).toBe(500);
    expect(fake.deleteRoom).not.toHaveBeenCalled();
  });
});
