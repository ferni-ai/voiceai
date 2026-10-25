/**
 * Shared pieces of the voice library picker (agent wizard and agent editor): the
 * message shown while the server's voice list loads or after it fails, a load that
 * redraws once, and one preview clip playing at a time.
 */
import { t } from '../i18n/index.js';
import { escapeHtml } from './ferni-care/escape-html.js';
import {
  getVoiceLibrary,
  getVoiceLibraryFailedAt,
  getVoiceLibraryState,
  loadVoiceLibrary,
  type PreMadeVoice,
} from '../services/voice-library.service.js';

const GENDER: Record<PreMadeVoice['gender'], string> = { female: 'Woman', male: 'Man' };
const ACCENT: Record<PreMadeVoice['accent'], string> = {
  american: 'American',
  british: 'British',
  australian: 'Australian',
  indian: 'Indian English',
};

/** "Woman · British", shown under a voice's name. */
export function voiceMetaLabel(voice: PreMadeVoice): string {
  return `${t(`voiceLibrary.gender.${voice.gender}`, GENDER[voice.gender])} · ${t(
    `voiceLibrary.accent.${voice.accent}`,
    ACCENT[voice.accent]
  )}`;
}

/** What to show instead of the cards, or null once there are voices to show. */
export function voiceLibraryStatusHtml(): string | null {
  const state = getVoiceLibraryState();
  if (state === 'ready' && getVoiceLibrary().length > 0) return null;
  const text =
    state === 'failed' || state === 'ready'
      ? t('voiceLibrary.loadFailed', "Couldn't load the voices. Close this and try again.")
      : t('voiceLibrary.loading', 'Loading voices...');
  return `<p class="voice-library-status" role="status">${text}</p>`;
}

/** A failed load is retried no sooner than this, so a redraw after a failure can't loop. */
export const VOICE_LIBRARY_RETRY_MS = 30_000;

/** Starts loading the library if it isn't loaded yet, and calls redraw when it settles. */
export function ensureVoiceLibrary(redraw: () => void, now = Date.now()): void {
  const state = getVoiceLibraryState();
  if (state === 'ready' || state === 'loading') return;
  if (state === 'failed' && now - getVoiceLibraryFailedAt() < VOICE_LIBRARY_RETRY_MS) return;
  void loadVoiceLibrary().then(redraw);
}

let preview: HTMLAudioElement | null = null;
let previewButton: HTMLElement | null = null;

export function stopVoicePreview(): void {
  preview?.pause();
  preview = null;
  previewButton?.setAttribute('aria-pressed', 'false');
  previewButton = null;
}

/** Plays the button's `data-preview` clip, or stops it if it is the one playing. */
export function toggleVoicePreview(button: HTMLElement): void {
  const url = button.dataset.preview;
  if (!url) return;
  if (previewButton === button) {
    stopVoicePreview();
    return;
  }
  stopVoicePreview();
  const audio = new Audio(url);
  preview = audio;
  previewButton = button;
  button.setAttribute('aria-pressed', 'true');
  audio.onended = () => {
    if (preview === audio) stopVoicePreview();
  };
  audio.play().catch(() => {
    if (preview === audio) stopVoicePreview();
  });
}

/** The microphone icon on a voice card. */
export function voiceAvatarSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>`;
}

function tagLabel(tag: string): string {
  return t(`voiceLibrary.tags.${tag}`, tag.charAt(0).toUpperCase() + tag.slice(1));
}

/**
 * The wizard's voice cards: a pick button and a separate preview button per card
 * (a button inside a button is invalid HTML, and the old preview never played).
 */
export function renderVoiceLibrary(voices: PreMadeVoice[], selectedId: string | undefined): string {
  const status = voiceLibraryStatusHtml();
  if (status) return `<div class="voice-library-section">${status}</div>`;
  const cards = voices.map((voice) => {
    const selected = selectedId === voice.id;
    const tags = voice.tags
      .map((tag) => `<span class="voice-tag">${escapeHtml(tagLabel(tag))}</span>`)
      .join('');
    const sample = t('voiceLibrary.playSample', 'Play a sample of {name}', { name: voice.name });
    return `
      <div class="voice-card ${selected ? 'voice-card--selected' : ''}" data-voice-id="${escapeHtml(voice.id)}">
        <button type="button" class="voice-card-pick" aria-pressed="${selected}">
          <span class="voice-avatar">${voiceAvatarSvg(24)}</span>
          <span class="voice-info">
            <span class="voice-name">${escapeHtml(voice.name)}</span>
            <span class="voice-meta">${escapeHtml(voiceMetaLabel(voice))}</span>
            <span class="voice-description">${escapeHtml(voice.description)}</span>
            <span class="voice-tags">${tags}</span>
          </span>
        </button>
        <button type="button" class="voice-preview-btn" data-preview="${escapeHtml(voice.previewUrl)}" aria-pressed="false" aria-label="${escapeHtml(sample)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      </div>`;
  });
  return `<div class="voice-library-section"><div class="voice-grid">${cards.join('')}</div></div>`;
}

/** Wires each card's pick and preview buttons inside root; onPick gets the voice id. */
export function bindVoiceCards(root: ParentNode, onPick: (voiceId: string) => void): void {
  root.querySelectorAll<HTMLElement>('.voice-card-pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest<HTMLElement>('.voice-card');
      const voiceId = card?.dataset.voiceId;
      if (!card || !voiceId) return;
      root.querySelectorAll('.voice-card').forEach((c) => {
        c.classList.toggle('voice-card--selected', c === card);
        c.querySelector('.voice-card-pick')?.setAttribute('aria-pressed', String(c === card));
      });
      onPick(voiceId);
    });
  });
  root.querySelectorAll<HTMLElement>('.voice-preview-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleVoicePreview(btn));
  });
}

/** Styles the wizard adds after its own voice-card rules. */
export const VOICE_PICKER_CSS = `
    .voice-card-pick { display: flex; align-items: center; gap: var(--space-md, 16px); flex: 1; min-width: 0;
      padding: 0; background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .voice-card-pick:focus-visible, .voice-preview-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
    .voice-avatar, .voice-preview-btn { flex: none; }
    .voice-name, .voice-description { display: block; }
    .voice-meta { display: block; font-size: 0.75rem; color: var(--color-text-dimmed); margin: 0 0 var(--space-2xs, 2px); }
    .voice-preview-btn[aria-pressed="true"] { background: var(--color-accent); color: var(--color-text-on-accent); }
    .voice-library-status { text-align: center; color: var(--color-text-muted); padding: var(--space-lg, 24px); margin: 0; }
`;
