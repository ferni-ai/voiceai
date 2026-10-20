import { describe, expect, it, vi } from 'vitest';
import { dataOf, loadDoc } from '../load-state.js';

const log = () => ({ warn: vi.fn() });
const doc = (get: () => Promise<{ exists: boolean; data(): unknown }>) => ({ path: 'a/b', get });

describe('loadDoc', () => {
  it('returns the data when the doc exists', async () => {
    const result = await loadDoc<{ n: number }>(
      doc(async () => ({ exists: true, data: () => ({ n: 1 }) })),
      log()
    );
    expect(result).toEqual({ status: 'found', data: { n: 1 } });
    expect(dataOf(result)).toEqual({ n: 1 });
  });

  it('reports missing when nothing is stored', async () => {
    const result = await loadDoc(
      doc(async () => ({ exists: false, data: () => undefined })),
      log()
    );
    expect(result).toEqual({ status: 'missing' });
    expect(dataOf(result)).toBeNull();
  });

  it('reports missing with no Firestore configured', async () => {
    expect(await loadDoc(undefined, log())).toEqual({ status: 'missing' });
  });

  it('reports error, not missing, when the read throws, and warns once', async () => {
    const logger = log();
    const result = await loadDoc(
      doc(async () => {
        throw new Error('14 UNAVAILABLE');
      }),
      logger
    );
    expect(result).toEqual({ status: 'error' });
    expect(dataOf(result)).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatchObject({ path: 'a/b' });
  });
});
