import { beforeEach, describe, expect, it, vi } from 'vitest';

const whisper = vi.fn(() => 'moment-1');
vi.mock('../../src/ui/moments/index.js', () => ({
  moments: { whisper, notice: vi.fn(() => 'notice-1'), dismiss: vi.fn(), dismissAll: vi.fn() },
  resetMomentsManager: vi.fn(),
}));

const { toast } = await import('../../src/ui/whisper.ui.js');

describe('toasts with no content are not shown', () => {
  beforeEach(() => whisper.mockClear());

  it.each(['', '   ', ': ', '…', 'Ferni: {summary}', '{Summary}'])('drops %j', (message) => {
    expect(toast.info(message)).toBe('');
    expect(whisper).not.toHaveBeenCalled();
  });

  it('shows a real message', () => {
    expect(toast.success('Saved!')).toBe('moment-1');
    expect(whisper).toHaveBeenCalledWith('Saved!', { type: 'success', duration: undefined });
  });
});
