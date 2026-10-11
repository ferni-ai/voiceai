/**
 * Runs the former bare-require() Firestore stores under plain Node ESM (via the
 * tsx loader), where `require` is not defined, the same as the built app in
 * prod. Vitest injects `require` into every module, so it cannot reproduce
 * the bug.
 *
 * Firestore is pointed at a local TCP sink on a free port (FIRESTORE_EMULATOR_HOST)
 * that counts connections and drops them, so nothing can reach a real
 * database. A store that really reaches Firestore opens a connection; one whose
 * import failed silently opens none.
 *
 * Usage: driver.ts <store>[,<store>...]   Prints one RESULT line of JSON.
 */
import { createServer, type Socket } from 'node:net';

type Outcome = { ok: true } | { ok: false; error: string };

const DEADLINE_MS = 3_000;
const SETTLE_MS = 300;

const sockets = new Set<Socket>();
let connections = 0;
const sink = createServer((socket) => {
  connections++;
  sockets.add(socket);
  socket.destroy();
});
await new Promise<void>((resolve) => {
  sink.listen(0, '127.0.0.1', resolve);
});
const address = sink.address();
if (!address || typeof address === 'string') throw new Error('sink has no port');
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${address.port}`;

const unhandled: string[] = [];
const describe = (err: unknown): string =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);
process.on('unhandledRejection', (err) => unhandled.push(describe(err)));
process.on('uncaughtException', (err) => unhandled.push(describe(err)));

async function run(fn: () => Promise<unknown>): Promise<Outcome> {
  try {
    await Promise.race([
      fn(),
      new Promise((resolve) => {
        setTimeout(resolve, DEADLINE_MS);
      }),
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

const stores: Record<string, () => Promise<unknown>> = {
  ambient: async () => {
    const { storeAmbientState } =
      await import('../../../services/ambient-mode/ambient-state-manager.js');
    await storeAmbientState({ userId: 'esm-driver-user', locationType: 'home' } as never);
  },
  health: async () => {
    const { storeHealthSummary } = await import('../../../services/health/health-data-store.js');
    await storeHealthSummary({ userId: 'esm-driver-user', date: '2026-10-11' } as never);
  },
  embedding: async () => {
    const { saveSemanticAvoidance } =
      await import('../../../intelligence/predictive/embeddings/embedding-persistence.js');
    await saveSemanticAvoidance('esm-driver-user', {} as never);
  },
  preferences: async () => {
    const { saveUserPreferences } =
      await import('../../../tools/domains/information/preferences/storage.js');
    const { DEFAULT_PREFERENCES } =
      await import('../../../tools/domains/information/preferences/types.js');
    await saveUserPreferences('esm-driver-user', { ...DEFAULT_PREFERENCES });
  },
  visual: async () => {
    const { uploadVisualMemory } =
      await import('../../../services/visual-memory/visual-memory-store.js');
    await uploadVisualMemory({
      userId: 'esm-driver-user',
      imageData: Buffer.from('img').toString('base64'),
      mimeType: 'image/png',
      source: 'upload',
    } as never);
  },
};

const outcomes: Record<string, Outcome> = {};
for (const name of (process.argv[2] ?? '').split(',').filter(Boolean)) {
  const store = stores[name];
  outcomes[name] = store ? await run(store) : { ok: false, error: `unknown store ${name}` };
}
await new Promise((resolve) => {
  setTimeout(resolve, SETTLE_MS);
});

const result = {
  requireDefined: typeof (globalThis as { require?: unknown }).require !== 'undefined',
  connections,
  outcomes,
  unhandled,
};
process.stdout.write(`RESULT:${JSON.stringify(result)}\n`);
process.exit(0);
