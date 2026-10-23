/**
 * The wizard's voice cards: valid markup (the preview used to be a button inside the
 * card's button, and never played), escaped server text, and a pick that selects
 * exactly one card and reports its Cartesia voice id.
 */
import { describe, expect, it, vi } from 'vitest';

const JANICE = '69092565-1c93-4a88-9f2c-ac8cddaf9f65';
const LIAM = '41f3c367-e0a8-4a85-89e0-c27bae9c9b6d';
const voices = [
  {
    id: JANICE,
    name: 'Janice',
    description: 'Bright <b>and</b> friendly',
    previewUrl: `/sounds/voice-library/${JANICE}.mp3`,
    gender: 'female' as const,
    age: 'adult' as const,
    accent: 'american' as const,
    tags: ['upbeat'],
  },
  {
    id: LIAM,
    name: 'Liam',
    description: 'Casual, friendly young Australian',
    previewUrl: `/sounds/voice-library/${LIAM}.mp3`,
    gender: 'male' as const,
    age: 'young' as const,
    accent: 'australian' as const,
    tags: ['casual'],
  },
];
vi.mock('../../services/voice-library.service.js', () => ({
  getVoiceLibrary: () => voices,
  getVoiceLibraryState: () => 'ready',
  getVoiceLibraryFailedAt: () => 0,
  loadVoiceLibrary: async () => voices,
}));

const { renderVoiceLibrary, bindVoiceCards } = await import('../voice-library-picker.js');

function mount(selected?: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderVoiceLibrary(voices, selected);
  return root;
}

describe('the voice cards', () => {
  it('never nests a button inside a button', () => {
    const root = mount();
    expect(root.querySelectorAll('.voice-card')).toHaveLength(2);
    expect(root.querySelectorAll('button button')).toHaveLength(0);
    expect(root.querySelectorAll('.voice-card-pick')).toHaveLength(2);
    expect(root.querySelectorAll('.voice-preview-btn')).toHaveLength(2);
  });

  it('shows the server text escaped, with who the voice is', () => {
    const card = mount().querySelector(`[data-voice-id="${JANICE}"]`)!;
    expect(card.querySelector('.voice-description')!.textContent).toBe(
      'Bright <b>and</b> friendly'
    );
    expect(card.querySelector('b')).toBeNull();
    expect(card.querySelector('.voice-meta')!.textContent).toBe('Woman · American');
    expect(card.querySelector('.voice-tag')!.textContent).toBe('Upbeat');
    expect(card.querySelector<HTMLElement>('.voice-preview-btn')!.dataset.preview).toBe(
      `/sounds/voice-library/${JANICE}.mp3`
    );
  });

  it('escapes the name and tags too', () => {
    const root = document.createElement('div');
    root.innerHTML = renderVoiceLibrary(
      [{ ...voices[0], name: '<img src=x>Jan', tags: ['<i>odd</i>'] }],
      undefined
    );
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.voice-tags i')).toBeNull();
    expect(root.querySelector('.voice-name')!.textContent).toBe('<img src=x>Jan');
  });

  it('marks the current pick, and a new pick selects only that card', () => {
    const root = mount(JANICE);
    const onPick = vi.fn();
    bindVoiceCards(root, onPick);
    const liam = root.querySelector(`[data-voice-id="${LIAM}"]`)!;
    liam.querySelector<HTMLElement>('.voice-card-pick')!.click();
    expect(onPick).toHaveBeenCalledWith(LIAM);
    const selected = [...root.querySelectorAll('.voice-card--selected')];
    expect(selected).toEqual([liam]);
    expect(liam.querySelector('.voice-card-pick')!.getAttribute('aria-pressed')).toBe('true');
    expect(
      root
        .querySelector(`[data-voice-id="${JANICE}"] .voice-card-pick`)!
        .getAttribute('aria-pressed')
    ).toBe('false');
  });
});
