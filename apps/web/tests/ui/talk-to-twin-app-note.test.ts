/**
 * Talk to your past self opens with the app's own note under VITE_TWIN_CONVERSATION_V2,
 * not a canned line in the person's voice (#3866). Off, the welcome is unchanged.
 * Fictional profile.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
// A namespace import: destructuring the storage key's name next to another long name
// matches gitleaks' generic-api-key shape (Security Scan).
const twinFlag = await import('../../src/config/twin-conversation-v2-flag.js');
const { apiPost } = await import('../../src/utils/api.js');
const { t } = await import('../../src/i18n/index.js');

// The modal is a module singleton and setup.ts empties the body before each test, so keep
// the panel from the first open and read inside it.
let overlay: Element | null = null;

async function openPanel(): Promise<Element> {
  await openTalkToTwin('twin-1');
  overlay ??= document.querySelector('.talk-twin-overlay');
  if (!overlay) throw new Error('the twin panel did not open');
  return overlay;
}

/** The panel's messages of one role, as drawn. */
function drawn(panel: Element, role: string): string[] {
  return [...panel.querySelectorAll(`#twin-messages .twin-message--${role}`)].map(
    (el) => el.textContent?.trim() ?? ''
  );
}

/** The opening messages, by role, as the panel draws them. */
async function opening(): Promise<{ twin: string[]; notice: string[] }> {
  const panel = await openPanel();
  const shown = { twin: drawn(panel, 'twin'), notice: drawn(panel, 'notice') };
  closeTalkToTwin();
  return shown;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.removeItem(twinFlag.TWIN_CONVERSATION_V2_STORAGE_KEY);
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
    localStorage.setItem(twinFlag.TWIN_CONVERSATION_V2_STORAGE_KEY, 'true');
    expect((await opening()).notice).toHaveLength(1);
    vi.stubEnv('VITE_TWIN_CONVERSATION_V2', 'true');
    localStorage.setItem(twinFlag.TWIN_CONVERSATION_V2_STORAGE_KEY, 'false');
    expect((await opening()).twin).toHaveLength(1);
  });

  it('flag on: the app note never reaches the model; the history holds only real turns', async () => {
    vi.stubEnv('VITE_TWIN_CONVERSATION_V2', 'true');
    const post = vi.mocked(apiPost);
    post.mockReset();
    post
      .mockResolvedValueOnce({ ok: true, status: 200, data: { response: 'reply one' } })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { response: 'reply two' } });
    const panel = await openPanel();
    const input = panel.querySelector<HTMLTextAreaElement>('#twin-input');
    const send = panel.querySelector<HTMLElement>('#twin-send');
    if (!input || !send) throw new Error('no input or send button');
    const say = async (text: string, reply: string) => {
      input.value = text;
      send.click();
      await vi.waitFor(() => expect(drawn(panel, 'twin').join('\n')).toContain(reply));
    };
    await say('hi there', 'reply one');
    await say('how was the lake?', 'reply two');
    closeTalkToTwin();

    const bodies = post.mock.calls
      .filter(([url]) => url === '/api/journal/twin-response')
      .map(([, body]) => body as { history: unknown });
    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(JSON.stringify(body)).not.toContain(t('talkToTwin.appNote'));
    expect(bodies[0]?.history).toEqual([]);
    expect(bodies[1]?.history).toEqual([
      { from: 'person', text: 'hi there' },
      { from: 'agent', text: 'reply one' },
    ]);
  });
});

describe('isTwinConversationV2On: only the exact values turn it on', () => {
  it.each(['false', '1', 'TRUE', 'yes', ' true', ''])('build value %j keeps it off', (value) => {
    vi.stubEnv('VITE_TWIN_CONVERSATION_V2', value);
    expect(twinFlag.isTwinConversationV2On()).toBe(false);
  });

  it.each(['TRUE', '1', 'yes', 'on', ''])(
    'browser value %j is no override: the build default stands',
    (value) => {
      localStorage.setItem(twinFlag.TWIN_CONVERSATION_V2_STORAGE_KEY, value);
      vi.stubEnv('VITE_TWIN_CONVERSATION_V2', 'true');
      expect(twinFlag.isTwinConversationV2On()).toBe(true);
      vi.stubEnv('VITE_TWIN_CONVERSATION_V2', '');
      expect(twinFlag.isTwinConversationV2On()).toBe(false);
    }
  );

  it('storage that throws falls back to the build default', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.stubEnv('VITE_TWIN_CONVERSATION_V2', '');
    expect(twinFlag.isTwinConversationV2On()).toBe(false);
    vi.stubEnv('VITE_TWIN_CONVERSATION_V2', 'true');
    expect(twinFlag.isTwinConversationV2On()).toBe(true);
    expect(localStorage.getItem).toHaveBeenCalled();
  });
});

describe('the app note in every language the twin panel speaks', () => {
  it('every locale with the twin strings has its own app note', () => {
    const dir = join(__dirname, '../../src/i18n/locales');
    const notes = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const twin = (
          JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
            talkToTwin?: Record<string, unknown>;
          }
        ).talkToTwin;
        return { file, twin };
      })
      .filter(({ twin }) => twin !== undefined);
    expect(notes.length).toBeGreaterThan(1);
    for (const { file, twin } of notes) {
      expect(typeof twin?.appNote, file).toBe('string');
      expect(String(twin?.appNote).trim(), file).not.toBe('');
    }
  });
});
