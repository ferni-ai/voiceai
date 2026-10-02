import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDynamicDomainLoadReport = vi.fn();

vi.mock('../../shared/tool-executors/dynamic-domain-executor.js', () => ({
  getDynamicDomainLoadReport,
}));

const { startDynamicDomainWarmup } = await import('../dynamic-domain-warmup.js');

describe('startDynamicDomainWarmup', () => {
  beforeEach(() => {
    getDynamicDomainLoadReport.mockReset();
  });

  it('initializes the dynamic domain executor and logs what loaded', async () => {
    getDynamicDomainLoadReport.mockResolvedValue({
      configured: ['career', 'grief', 'family'],
      loaded: ['career', 'grief'],
      failed: { family: 'Error: boom' },
    });
    const log = vi.fn();

    await startDynamicDomainWarmup(log);

    expect(getDynamicDomainLoadReport).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Dynamic domain executor'),
      expect.objectContaining({ loaded: 2, failed: ['family'] })
    );
  });

  it('logs a warning instead of rejecting when init fails', async () => {
    getDynamicDomainLoadReport.mockRejectedValue(new Error('import exploded'));
    const log = vi.fn();

    await expect(startDynamicDomainWarmup(log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('⚠️'),
      expect.objectContaining({ error: expect.stringContaining('import exploded') })
    );
  });

  it('stays pending without logging while init is still running', async () => {
    getDynamicDomainLoadReport.mockReturnValue(new Promise(() => {}));
    const log = vi.fn();

    const warmup = startDynamicDomainWarmup(log);
    await vi.waitFor(() => expect(getDynamicDomainLoadReport).toHaveBeenCalledTimes(1));

    const settled = await Promise.race([warmup.then(() => 'settled'), Promise.resolve('pending')]);
    expect(settled).toBe('pending');
    expect(log).not.toHaveBeenCalled();
  });
});
