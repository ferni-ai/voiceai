/**
 * The agent editor's voice library names come from the server. A name is text, so a
 * hostile one must render as text, never as markup in the editor.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no Web Animations API; the editor animates its open and close
if (!HTMLElement.prototype.animate) {
  HTMLElement.prototype.animate = () =>
    ({ finished: Promise.resolve(), cancel() {}, addEventListener() {} }) as unknown as Animation;
}

const HOSTILE = '<img src=x onerror="alert(1)">Ava';
const voices = [
  {
    id: 'voice-1',
    name: HOSTILE,
    description: 'Warm and clear',
    previewUrl: '/sounds/voice-library/voice-1.mp3',
    gender: 'female',
    age: 'adult',
    accent: 'american',
    tags: [],
  },
];

vi.mock('../../services/voice-library.service.js', () => ({
  getVoiceLibrary: () => voices,
  getVoiceLibraryState: () => 'ready',
  getVoiceLibraryFailedAt: () => 0,
  loadVoiceLibrary: async () => voices,
}));

vi.mock('../../services/custom-agent.service.js', () => ({
  getCustomAgent: async () => ({
    id: 'agent-1',
    name: 'Test agent',
    voice: {
      type: 'selected',
      voiceId: 'voice-1',
      status: 'ready',
      settings: { speed: 1, stability: 0.5, similarityBoost: 0.5 },
    },
    personality: {},
    memories: [],
  }),
  getVoiceLibrary: () => voices,
  selectPreMadeVoice: vi.fn(),
  updateCustomAgent: vi.fn(),
  deleteMemory: vi.fn(),
  addMemory: vi.fn(),
  dispatchCustomAgentEvent: vi.fn(),
}));

vi.mock('../sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const { openAgentEditor, closeAgentEditor } = await import('../custom-agent-editor.ui.js');

afterEach(async () => {
  await closeAgentEditor();
  document.querySelectorAll('.agent-editor-overlay').forEach((el) => el.remove());
});

describe('the agent editor voice library', () => {
  it('shows a hostile voice name as text, not markup', async () => {
    await openAgentEditor('agent-1');
    document.querySelector<HTMLElement>('[data-tab="voice"]')!.click();

    const grid = document.querySelector('.editor-voice-grid')!;
    expect(grid).not.toBeNull();
    expect(grid.querySelector('img')).toBeNull();
    expect(grid.querySelector('.voice-name')!.textContent).toBe(HOSTILE);
  });
});
