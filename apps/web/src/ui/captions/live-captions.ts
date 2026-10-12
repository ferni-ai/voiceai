/**
 * Live captions (behind the captions-v2 flag, see captions-flag.ts).
 *
 * Modelled on iOS Live Captions and FaceTime Live Captions:
 * - Captions live in their own region, bottom-anchored just above the
 *   waveform and the call controls, never over the avatar: the region's
 *   height is capped by the space between the avatar and the waveform
 *   (captionsLayout).
 * - In a call with captions on, the persona picker under the avatar steps
 *   aside (CAPTIONS_CALL_CLASS): with it there is no room for even one line
 *   above the waveform, and mid-call switching is a voice request anyway.
 * - At most three lines show. Text wraps; it is never cut with an ellipsis.
 *   When an utterance runs longer, earlier lines scroll up and fade out under
 *   a top mask, the way Live Captions does.
 * - The newest line is full strength; earlier lines step down to the
 *   secondary text colour. The current speaker shows as a small dot and name
 *   above the text (as in FaceTime). Only the current turn shows, so text
 *   never sits under the wrong name; the history keeps every turn.
 *
 * Reads the same `ferni:transcript` window events transcriptUI does, so the
 * transport is unchanged; it also honours transcriptUI's on/off setting.
 *
 * @module ui/captions/live-captions
 */

import { t } from '../../i18n/index.js';
import { appState } from '../../state/app.state.js';
import { CAPTIONS_CALL_CLASS, injectCaptionStyles } from './live-captions.styles.js';
import { transcriptUI } from '../transcript.ui.js';

/** 'note' is quiet in-call feedback (ferni:inline-feedback), not speech. */
export type CaptionSpeaker = 'user' | 'agent' | 'note';

export interface CaptionEntry {
  speaker: CaptionSpeaker;
  text: string;
  final: boolean;
}

const HISTORY_LIMIT = 200; // utterances kept in the history
const RENDERED = 3; // utterances rendered in the live region
const MAX_LINES = 3; // Apple's Live Captions show two to three lines, never more
const IDLE_MS = 6000; // captions fade after this long without speech

/**
 * Fold one transcript event into the history. Interim text replaces the open
 * utterance from the same speaker; anything else starts a new one.
 */
export function applyTranscript(
  entries: CaptionEntry[],
  speaker: CaptionSpeaker,
  text: string,
  final: boolean
): CaptionEntry[] {
  const clean = text.trim();
  if (!clean) return entries;
  const last = entries[entries.length - 1];
  if (last && last.speaker === speaker && !last.final) {
    return [...entries.slice(0, -1), { speaker, text: clean, final }];
  }
  if (last && last.speaker === speaker && last.text === clean) return entries;
  return [...entries, { speaker, text: clean, final }].slice(-HISTORY_LIMIT);
}

/**
 * The newest speaker's turn (with any feedback notes inside it), up to the
 * last RENDERED utterances: what the live region shows under that name.
 */
export function currentTurn(entries: readonly CaptionEntry[]): CaptionEntry[] {
  const speaker = [...entries].reverse().find((e) => e.speaker !== 'note')?.speaker;
  let start = entries.length;
  while (start > 0 && [speaker, 'note'].includes(entries[start - 1]?.speaker)) start--;
  return entries.slice(Math.max(start, entries.length - RENDERED));
}

export interface CaptionsLayout {
  bottom: number; // viewport bottom to the region's bottom edge
  maxHeight: number; // tallest the region may grow without reaching the avatar
}

/**
 * Bottom-anchor the region `gap` above the controls and stop it `gap` below
 * the avatar. With no controls on screen it sits `gap` above the viewport
 * bottom; with no avatar it may use the full height.
 */
export function captionsLayout(
  viewportHeight: number,
  controlsTop: number | null,
  avatarBottom: number | null,
  gap: number
): CaptionsLayout {
  const floor = (controlsTop ?? viewportHeight) - gap;
  const ceiling = (avatarBottom ?? 0) + gap;
  return { bottom: viewportHeight - floor, maxHeight: Math.max(0, floor - ceiling) };
}

function speakerName(speaker: CaptionSpeaker): string {
  if (speaker === 'note') return '';
  return speaker === 'user' ? t('transcript.you') : appState.get('activePersona').name;
}

/** One utterance as a paragraph, optionally led by its speaker's name. */
export function renderLine(entry: CaptionEntry, showName: boolean): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className =
    entry.speaker === 'note' ? 'ferni-caption-line ferni-caption-note' : 'ferni-caption-line';
  line.dataset.speaker = entry.speaker;
  if (showName && entry.speaker !== 'note') {
    const name = document.createElement('span');
    name.className = 'ferni-caption-line__name';
    name.textContent = speakerName(entry.speaker);
    line.append(name);
  }
  line.append(document.createTextNode(entry.text));
  return line;
}

class LiveCaptions {
  private root: HTMLElement | null = null;
  private speaker: HTMLElement | null = null;
  private viewport: HTMLElement | null = null;
  private entries: CaptionEntry[] = [];
  private idle: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;

  constructor(private readonly isEnabled: () => boolean) {}

  push(speaker: CaptionSpeaker, text: string, final: boolean): void {
    this.entries = applyTranscript(this.entries, speaker, text, final);
    this.syncCall();
    if (!this.isEnabled()) return this.hide();
    if (this.entries.length === 0) return;
    this.render();
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.hide(), IDLE_MS);
  }

  hide(): void {
    this.root?.classList.remove('ferni-captions--visible');
  }

  /**
   * Captions on in a call: the picker yields for the whole call, not per
   * utterance, so the header does not jump each time captions fade.
   */
  syncCall(): void {
    const inCall = document.body.dataset.connected === 'true';
    document.body.classList.toggle(CAPTIONS_CALL_CLASS, inCall && this.isEnabled());
    this.schedule();
  }

  /** Call ended: forget the conversation and take the region down. */
  reset(): void {
    this.entries = [];
    this.hide();
    document.body.classList.remove(CAPTIONS_CALL_CLASS);
    if (this.viewport) this.viewport.replaceChildren();
  }

  history(): readonly CaptionEntry[] {
    return this.entries;
  }

  private mount(): HTMLElement {
    if (this.root) {
      // Something replaced the body (route swap, HMR): put the region back.
      if (!this.root.isConnected) document.body.append(this.root);
      return this.root;
    }
    document.querySelectorAll('.ferni-captions').forEach((el) => el.remove()); // HMR
    const root = document.createElement('section');
    root.className = 'ferni-captions';
    root.setAttribute('aria-label', t('transcript.captionsLabel'));
    // Header: who is speaking now (FaceTime puts the name above the caption).
    const header = document.createElement('div');
    header.className = 'ferni-captions__header';
    const speaker = document.createElement('span');
    speaker.className = 'ferni-caption-line__name';
    header.append(speaker);
    const viewport = document.createElement('div');
    viewport.className = 'ferni-captions__viewport';
    root.append(header, viewport);
    document.body.append(root);
    window.addEventListener('resize', () => this.schedule());
    // The avatar grows and the controls move when a call connects; follow them.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.schedule());
      const watched = '.header, .avatar-container, #waveformContainer, .controls-row';
      for (const el of document.querySelectorAll(watched)) {
        observer.observe(el);
      }
    }
    this.root = root;
    this.speaker = speaker;
    this.viewport = viewport;
    return root;
  }

  private render(): void {
    const root = this.mount();
    const shown = currentTurn(this.entries);
    this.viewport?.replaceChildren(...shown.map((entry) => renderLine(entry, false)));
    const newest = shown.filter((e) => e.speaker !== 'note').pop();
    if (newest && this.speaker) {
      this.speaker.textContent = speakerName(newest.speaker);
      this.speaker.dataset.speaker = newest.speaker;
    }
    root.classList.add('ferni-captions--visible');
    this.schedule();
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layout());
  }

  private layout(): void {
    if (!this.root || !this.viewport) return;
    const rectOf = (selector: string): DOMRect | null => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect && rect.height > 0 ? rect : null;
    };
    const bottomOf = (selector: string): number | null => rectOf(selector)?.bottom ?? null;
    // The waveform sits just above the controls: captions stop above both.
    const below = [rectOf('#waveformContainer'), rectOf('.controls-row')].filter((r) => r !== null);
    const floor = below.length ? Math.min(...below.map((r) => r.top)) : null;
    // One rem (--space-md) between the region, the waveform and the avatar.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const gap = Number.isFinite(rem) ? rem : 0;
    const place = (ceiling: number | null): CaptionsLayout =>
      captionsLayout(window.innerHeight, floor, ceiling, gap);
    // Keep clear of the whole persona header (avatar, name, roster) when that
    // leaves room for a line; never closer than the avatar itself.
    let { bottom, maxHeight } = place(bottomOf('.header'));
    if (this.fit(maxHeight) < 1) ({ bottom, maxHeight } = place(bottomOf('.avatar-container')));
    this.root.style.setProperty('--ferni-captions-bottom', `${bottom}px`);
    this.root.style.setProperty('--ferni-captions-room', `${maxHeight}px`);
    const lines = this.fit(maxHeight);
    this.root.style.setProperty('--ferni-captions-lines', String(Math.max(1, lines)));
    // Not even one line fits beside the avatar: stay hidden rather than cover it.
    this.root.classList.toggle('ferni-captions--no-room', lines < 1);
    this.viewport.scrollTop = this.viewport.scrollHeight;
    this.root.classList.toggle(
      'ferni-captions--overflowing',
      lines > 1 && this.viewport.scrollHeight > this.viewport.clientHeight
    );
  }

  /** Whole caption lines (max three) that fit in `room` px with the header. */
  private fit(room: number): number {
    if (!this.root || !this.viewport) return 0;
    const style = getComputedStyle(this.root);
    const chrome =
      (this.speaker?.parentElement?.offsetHeight ?? 0) +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom);
    const line = parseFloat(getComputedStyle(this.viewport).lineHeight) || 1;
    return Math.min(MAX_LINES, Math.floor((room - chrome) / line));
  }
}

let instance: LiveCaptions | null = null;

/** Start listening for transcript events. Idempotent. */
export function initLiveCaptions(isEnabled: () => boolean = transcriptUI.isEnabled): LiveCaptions {
  if (instance) return instance;
  // Styles first: they also retire the status-island pill this replaces.
  injectCaptionStyles();
  const captions = new LiveCaptions(isEnabled);
  window.addEventListener('ferni:transcript', ((e: CustomEvent) => {
    const { type, text, isFinal } = e.detail as { type: string; text: string; isFinal?: boolean };
    if (type !== 'user' && type !== 'agent') return;
    // Same defaults as app.ts: user text is interim until final, agent text final.
    captions.push(type, text, isFinal ?? type === 'agent');
  }) as EventListener);
  // In-call success/info toasts arrive here instead (toast in-call gate) and
  // show as a quiet line in the captions, fading with them.
  window.addEventListener('ferni:inline-feedback', ((e: CustomEvent) => {
    const message = (e.detail as { message?: unknown })?.message;
    if (typeof message === 'string') captions.push('note', message, true);
  }) as EventListener);
  window.addEventListener('ferni:connection-state', ((e: CustomEvent) => {
    if ((e.detail as { state?: string })?.state === 'disconnected') captions.reset();
    else captions.syncCall();
  }) as EventListener);
  captions.syncCall(); // the call may already be up
  instance = captions;
  return captions;
}
