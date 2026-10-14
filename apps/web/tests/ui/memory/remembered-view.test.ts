/**
 * With the memory view on, the existing "What Ferni Knows" entry (#955)
 * opens it instead of the facts-only panel, and the entry shows even
 * without VITE_MEMORY_CONTROL. With it off, nothing changes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/i18n/index.js', () => ({ t: (key: string) => key, formatDate: () => '' }));
vi.mock('../../../src/ui/whisper.ui.js', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}));
vi.mock('../../../src/utils/api.js', () => api);
const panel = vi.hoisted(() => ({ openFerniKnowsPanel: vi.fn(), closeFerniKnowsPanel: vi.fn() }));
vi.mock('../../../src/ui/memory/ferni-knows.ui.js', () => panel);
vi.mock('../../../src/ui/memory/memory-correction.ui.js', () => ({ openCorrectionModal: vi.fn() }));
const view = vi.hoisted(() => ({ openMemoryView: vi.fn(async () => undefined) }));
vi.mock('../../../src/ui/memory/known-view.ui.js', () => view);

import { memoryControlEnabled, showRemembered } from '../../../src/ui/memory/remembered.js';
import { MEMORY_VIEW_STORAGE_KEY } from '../../../src/ui/memory/known.js';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('the What Ferni Knows entry', () => {
  it('opens the memory view when it is on', async () => {
    vi.stubEnv('VITE_MEMORY_CONTROL', '');
    localStorage.setItem(MEMORY_VIEW_STORAGE_KEY, 'true');
    expect(memoryControlEnabled()).toBe(true);
    await showRemembered();
    expect(view.openMemoryView).toHaveBeenCalled();
    expect(api.apiGet).not.toHaveBeenCalled();
  });

  it('keeps the facts panel when it is off', async () => {
    vi.stubEnv('VITE_MEMORY_CONTROL', 'true');
    vi.stubEnv('VITE_MEMORY_VIEW', '');
    api.apiGet.mockResolvedValue({ ok: true, status: 200, data: { facts: [] } });
    await showRemembered();
    expect(view.openMemoryView).not.toHaveBeenCalled();
    expect(panel.openFerniKnowsPanel).toHaveBeenCalled();
  });
});
