/**
 * Live captions (captions-v2 flag). Layout geometry is pinned in jsdom through
 * captionsLayout(); the rendered no-overlap / no-clip contract runs in a real
 * browser in tests/e2e/captions-layout.spec.ts.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTIONS_V2_STORAGE_KEY, isCaptionsV2Enabled } from '@/ui/captions/captions-flag.js';
import {
  applyTranscript,
  captionsLayout,
  currentTurn,
  initLiveCaptions,
  revealWords,
  renderLine,
  type CaptionEntry,
} from '@/ui/captions/live-captions.js';
import { captionsOn, mountCaptionsToggle } from '@/ui/captions/captions-toggle.js';
import { PREFERENCE_KEYS } from '@/config/storage-keys.js';
import { CAPTIONS_CALL_CLASS } from '@/ui/captions/live-captions.styles.js';

const say = (type: string, text: string, isFinal?: boolean): void => {
  window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
};

describe('captions-v2 flag', () => {
  afterEach(() => {
    localStorage.removeItem(CAPTIONS_V2_STORAGE_KEY);
    vi.unstubAllEnvs();
  });

  it('is off by default', () => {
    expect(isCaptionsV2Enabled()).toBe(false);
  });

  it('turns on from the build env', () => {
    vi.stubEnv('VITE_CAPTIONS_V2', 'true');
    expect(isCaptionsV2Enabled()).toBe(true);
  });

  it('lets one browser override the build default either way', () => {
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'true');
    expect(isCaptionsV2Enabled()).toBe(true);
    vi.stubEnv('VITE_CAPTIONS_V2', 'true');
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'false');
    expect(isCaptionsV2Enabled()).toBe(false);
  });
});

describe('applyTranscript', () => {
  it('replaces the open interim utterance instead of stacking copies', () => {
    let entries: CaptionEntry[] = [];
    entries = applyTranscript(entries, 'user', 'I think', false);
    entries = applyTranscript(entries, 'user', 'I think I rushed it', false);
    entries = applyTranscript(entries, 'user', 'I think I rushed it.', true);
    expect(entries).toEqual([{ speaker: 'user', text: 'I think I rushed it.', final: true }]);
  });

  it('keeps both speakers, in order, so earlier lines stay readable', () => {
    let entries: CaptionEntry[] = [];
    entries = applyTranscript(entries, 'user', 'Hi', true);
    entries = applyTranscript(entries, 'agent', 'Hey there', false);
    expect(entries.map((e) => e.speaker)).toEqual(['user', 'agent']);
  });

  it('starts a new utterance after a final one, but drops an exact repeat', () => {
    let entries: CaptionEntry[] = [{ speaker: 'agent', text: 'One.', final: true }];
    entries = applyTranscript(entries, 'agent', 'One.', true);
    expect(entries).toHaveLength(1);
    entries = applyTranscript(entries, 'agent', 'Two.', true);
    expect(entries.map((e) => e.text)).toEqual(['One.', 'Two.']);
  });

  it('ignores blank text', () => {
    expect(applyTranscript([], 'agent', '   ', true)).toEqual([]);
  });
});

describe('currentTurn', () => {
  const e = (speaker: CaptionEntry['speaker'], text: string): CaptionEntry => ({
    speaker,
    text,
    final: true,
  });

  it("returns the newest speaker's run with notes inside it", () => {
    const entries = [e('agent', 'a'), e('user', 'b'), e('agent', 'c'), e('note', 'n')];
    expect(currentTurn(entries).map((x) => x.text)).toEqual(['c', 'n']);
  });

  it('caps a long turn at the last three utterances', () => {
    const entries = ['1', '2', '3', '4'].map((t) => e('user', t));
    expect(currentTurn(entries).map((x) => x.text)).toEqual(['2', '3', '4']);
  });
});

describe('captionsLayout', () => {
  it('sits a gap above the controls and stops a gap below the avatar', () => {
    // 1440x900 desktop: controls top 649, persona header bottom 516.
    const layout = captionsLayout(900, 649, 516, 16);
    expect(layout.bottom).toBe(900 - 633);
    expect(layout.maxHeight).toBe(633 - 532);
    // The region's top edge can never reach the avatar.
    expect(900 - layout.bottom - layout.maxHeight).toBeGreaterThanOrEqual(516 + 16);
  });

  it('reports no room rather than a negative height when the avatar crowds the controls', () => {
    expect(captionsLayout(390, 200, 190, 16).maxHeight).toBe(0);
  });

  it('falls back to the viewport edges when controls or avatar are not on screen', () => {
    expect(captionsLayout(800, null, null, 16)).toEqual({ bottom: 16, maxHeight: 768 });
  });
});

describe('renderLine', () => {
  it('wraps text in full: no ellipsis, nowrap or line clamp', () => {
    const text = 'That makes a lot of sense. '.repeat(10).trim();
    const line = renderLine({ speaker: 'agent', text, final: false }, false);
    expect(line.textContent).toBe(text);
    expect(line.style.textOverflow).toBe('');
    expect(line.style.whiteSpace).toBe('');
  });

  it('names the speaker only when asked', () => {
    const named = renderLine({ speaker: 'user', text: 'Hi', final: true }, true);
    expect(named.querySelector('.ferni-caption-line__name')?.textContent).toBe('You');
    const plain = renderLine({ speaker: 'user', text: 'Hi', final: true }, false);
    expect(plain.querySelector('.ferni-caption-line__name')).toBeNull();
  });
});

describe('revealWords', () => {
  it('appends only the newly spoken words, so just they fade in', () => {
    const line = document.createElement('p');
    revealWords(line, '', 'That makes');
    revealWords(line, 'That makes', 'That makes a lot of sense');
    const spans = [...line.querySelectorAll('.ferni-caption-words')].map((w) => w.textContent);
    expect(spans).toEqual(['That makes', ' a lot of sense']);
    expect(line.textContent).toBe('That makes a lot of sense');
  });

  it('replaces the text when speech is corrected rather than extended', () => {
    const line = document.createElement('p');
    revealWords(line, '', 'I think I rush');
    revealWords(line, 'I think I rush', 'I think I rushed it');
    revealWords(line, 'I think I rushed it', 'I thought I rushed it');
    expect([...line.querySelectorAll('.ferni-caption-words')]).toHaveLength(1);
    expect(line.textContent).toBe('I thought I rushed it');
  });
});

describe('captions toggle', () => {
  afterEach(() => localStorage.removeItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION));

  it('is off until someone chooses captions; the old desktop default does not count', () => {
    expect(captionsOn()).toBe(false);
    localStorage.setItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION, 'false');
    expect(captionsOn()).toBe(false);
    localStorage.setItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION, 'true');
    expect(captionsOn()).toBe(true);
  });

  it('joins the in-call quick actions and flips captions with one tap', () => {
    const row = document.createElement('div');
    row.className = 'engagement-triggers';
    document.body.append(row);
    const onChange = vi.fn();
    mountCaptionsToggle(onChange);
    const button = row.querySelector<HTMLButtonElement>('.ferni-captions-toggle');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    button?.click();
    expect(captionsOn()).toBe(true);
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenCalledTimes(1);
    button?.click();
    expect(captionsOn()).toBe(false);
  });
});

describe('live captions region', () => {
  let enabled = true;
  const captions = initLiveCaptions(() => enabled);
  const lines = (): string[] =>
    [...document.querySelectorAll('.ferni-captions .ferni-caption-line')].map(
      (l) => l.textContent ?? ''
    );

  beforeEach(() => {
    enabled = true;
    captions.reset();
  });

  it('renders the current turn as plain words in their own region, no panel or labels', () => {
    say('user', 'I rushed it because he kept checking his watch', true);
    say('agent', 'That makes a lot of sense', false);
    const region = document.querySelector('.ferni-captions');
    expect(region?.classList.contains('ferni-captions--visible')).toBe(true);
    expect(region?.closest('#statusIsland')).toBeNull();
    expect(lines()).toEqual(['That makes a lot of sense']);
    expect(document.querySelector('.ferni-captions .ferni-caption-line__name')).toBeNull();
    expect(captions.history().map((e) => e.speaker)).toEqual(['user', 'agent']);
  });

  it('grows the live line word by word instead of redrawing it', () => {
    say('agent', 'That makes', false);
    const line = document.querySelector('.ferni-captions .ferni-caption-line');
    say('agent', 'That makes a lot of sense', false);
    expect(document.querySelector('.ferni-captions .ferni-caption-line')).toBe(line);
    expect(line?.querySelectorAll('.ferni-caption-words')).toHaveLength(2);
  });

  it('keeps only the last three utterances on screen and the rest in history', () => {
    for (let i = 0; i < 5; i++) say('agent', `line ${i}`, true);
    expect(lines()).toHaveLength(3);
    expect(captions.history()).toHaveLength(5);
  });

  it('hides while captions are off, and shows the turn in progress when switched on', () => {
    enabled = false;
    say('agent', 'Still talking', false);
    const region = document.querySelector('.ferni-captions');
    expect(region?.classList.contains('ferni-captions--visible') ?? false).toBe(false);
    enabled = true;
    captions.refresh();
    expect(document.querySelector('.ferni-captions--visible')).not.toBeNull();
    expect(lines()).toEqual(['Still talking']);
  });

  it('forgets the conversation when the call disconnects', () => {
    say('agent', 'Bye for now', true);
    window.dispatchEvent(
      new CustomEvent('ferni:connection-state', { detail: { state: 'disconnected' } })
    );
    expect(captions.history()).toHaveLength(0);
    expect(lines()).toHaveLength(0);
  });

  it('shows in-call feedback as a quiet note in the current turn', () => {
    say('agent', 'Saving that for you', true);
    window.dispatchEvent(
      new CustomEvent('ferni:inline-feedback', {
        detail: { message: 'Reminder set for 7:30', tone: 'success', key: 'reminder' },
      })
    );
    expect(document.querySelector('.ferni-captions .ferni-caption-note')?.textContent).toBe(
      'Reminder set for 7:30'
    );
  });

  it('moves the persona picker aside for the whole call while captions are on', () => {
    const connect = (state: string): void => {
      if (state === 'connected') document.body.dataset.connected = 'true';
      else delete document.body.dataset.connected;
      window.dispatchEvent(new CustomEvent('ferni:connection-state', { detail: { state } }));
    };
    const yielded = (): boolean => document.body.classList.contains(CAPTIONS_CALL_CLASS);
    expect(yielded()).toBe(false);
    connect('connected');
    expect(yielded()).toBe(true); // at connect, before anyone speaks: no jump mid-call
    enabled = false;
    say('agent', 'Captions turned off', true);
    expect(yielded()).toBe(false);
    enabled = true;
    say('agent', 'And back on', true);
    expect(yielded()).toBe(true);
    connect('disconnected');
    expect(yielded()).toBe(false);
    const css = document.getElementById('ferni-captions-styles')?.textContent ?? '';
    expect(css).toContain(`.${CAPTIONS_CALL_CLASS} #teamRoster { display: none; }`);
  });

  it('moves the picker with the captions switch, before anyone speaks again', () => {
    document.body.dataset.connected = 'true';
    enabled = false;
    captions.refresh();
    expect(document.body.classList.contains(CAPTIONS_CALL_CLASS)).toBe(false);
    enabled = true; // the captions button turned them on mid-call
    captions.refresh();
    expect(document.body.classList.contains(CAPTIONS_CALL_CLASS)).toBe(true);
    enabled = false; // and off again: the picker comes back
    captions.refresh();
    expect(document.body.classList.contains(CAPTIONS_CALL_CLASS)).toBe(false);
    delete document.body.dataset.connected;
  });

  it('retires the status-island pill once captions v2 is on', () => {
    const css = document.getElementById('ferni-captions-styles')?.textContent ?? '';
    expect(css).toMatch(/#transcriptContainer\s*\{\s*display:\s*none/);
  });

  it('opens the conversation so far from the words, by tap or keyboard', () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.showModal = showModal;
    say('user', 'First thing', true);
    say('agent', 'Second thing', true);
    const words = document.querySelector<HTMLElement>('.ferni-captions__viewport');
    expect(words?.getAttribute('role')).toBe('button');
    words?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(showModal).toHaveBeenCalledTimes(1);
    const items = [...document.querySelectorAll('.ferni-transcript-sheet li')];
    expect(items.map((li) => li.textContent)).toEqual(['YouFirst thing', 'FerniSecond thing']);
  });
});
