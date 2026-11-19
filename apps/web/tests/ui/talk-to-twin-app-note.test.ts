/**
 * Talk to your past self opens with the app's own note under VITE_TWIN_CONVERSATION_V2,
 * not a canned line in the person's voice (#3866). Off, the welcome is unchanged.
 * Fictional profile.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({ apiPost: vi.fn(), apiGet: vi.fn() }));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));
vi.mock('../../src/services/custom-agent.service.js', () => ({
  getCustomAgent: vi.fn().mockResolvedValue({
    id: 'twin-1',
    type: 'twin',
    name: 'Riley Test',
    displayName: 'Riley Test',
    personality: { values: ['honesty'], worldview: 'keep going' },
    behaviors: { catchphrases: ['honestly,'] },
    memories: {},
  }),
  listMemories: vi.fn().mockResolvedValue([{ id: 'j1', content: 'Walked by the lake.' }]),
}));

const { openTalkToTwin, closeTalkToTwin } = await import('../../src/ui/talk-to-twin.ui.js');
const { TWIN_CONVERSATION_V2_STORAGE_KEY } =
  await import('../../src/config/twin-conversation-v2-flag.js');
const { t } = await import('../../src/i18n/index.js');

// The modal is a module singleton and setup.ts empties the body before each test, so keep
// the message list from the first open and read inside it.
let messages: Element | null = null;

/** The opening messages, by role, as the panel draws them. */
async function opening(): Promise<{ twin: string[]; notice: string[] }> {
  await openTalkToTwin('twin-1');
  messages ??= document.querySelector('#twin-messages');
  if (!messages) throw new Error('the twin panel did not open');
  const texts = (role: string) =>
    [...(messages?.querySelectorAll(`.twin-message--${role}`) ?? [])].map(
      (el) => el.textContent?.trim() ?? ''
    );
  const drawn = { twin: texts('twin'), notice: texts('notice') };
  closeTalkToTwin();
  return drawn;
}

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.removeItem(TWIN_CONVERSATION_V2_STORAGE_KEY);
});

describe('Talk to your past self: the opening', () => {
  it('flag off: the welcome in the twin voice, as before', async () => {
    const { twin, notice } = await opening();
    expect(notice).toEqual([]);
    expect(twin).toHaveLength(1);
    expect(twin[0]).toContain('honestly,');
    expect(twin[0]).toContain(t('talkToTwin.welcome.prompt'));
  });

  it('flag on: the app note, with no mannerism and no "I", and nothing in the twin voice', async () => {
    vi.stubEnv('VITE_TWIN_CONVERSATION_V2', 'true');
    const { twin, notice } = await opening();
    expect(twin).toEqual([]);
    expect(notice).toHaveLength(1);
    expect(notice[0]).toContain(t('talkToTwin.appNote'));
    expect(notice[0]).not.toContain('honestly,');
    expect(t('talkToTwin.appNote')).not.toMatch(/\b(I|I'm|I've|me|my|we|our)\b/);
  });

  it('one browser can turn it on, or force it off over the build', async () => {
    localStorage.setItem(TWIN_CONVERSATION_V2_STORAGE_KEY, 'true');
    expect((await opening()).notice).toHaveLength(1);
    vi.stubEnv('VITE_TWIN_CONVERSATION_V2', 'true');
    localStorage.setItem(TWIN_CONVERSATION_V2_STORAGE_KEY, 'false');
    expect((await opening()).twin).toHaveLength(1);
  });
});
