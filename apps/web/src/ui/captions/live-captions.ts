/**
 * Live captions (behind the captions-v2 flag, see captions-flag.ts).
 *
 * Words, not a window. Modelled on iOS Live Captions, but with no panel:
 * - Ferni's words sit in the open space between the persona and the call
 *   controls, never over the avatar, controls or anything else: the region
 *   is capped by that space (captionsLayout) and holds whole lines only.
 * - Only the last line or two of the current turn. New words fade in as
 *   they are spoken; earlier text scrolls up under a soft fade. Nothing is
 *   ever ellipsized.
 * - Ferni speaks in the primary voice (larger, full strength); your words
 *   use a quieter register, so the speaker shows without labels.
 * - Tap the words for the conversation so far (transcript-sheet.ts).
 * - Moments Ferni is holding on to appear as small chips under the words
 *   (moment-chips.ts), even with captions off.
 * - Off by default on a voice call; the captions button in the controls
 *   turns them on (captions-toggle.ts).
 *
 * Reads the same `ferni:transcript` window events transcriptUI does, so the
 * transport and transcriptUI's screen-reader live region are unchanged.
 *
 * @module ui/captions/live-captions
 */

import { t } from '../../i18n/index.js';
import { appState } from '../../state/app.state.js';
import { injectCaptionStyles } from './live-captions.styles.js';
import { captionsOn, mountCaptionsToggle } from './captions-toggle.js';
import {
  MomentChips,
  momentFromDetail,
  momentFromTrustSignal,
  type Moment,
} from './moment-chips.js';
import { injectTranscriptSheetStyles, openTranscriptSheet } from './transcript-sheet.js';

export type CaptionSpeaker = 'user' | 'agent';

export interface CaptionEntry {
  speaker: CaptionSpeaker;
  text: string;
  final: boolean;
}

const HISTORY_LIMIT = 200; // utterances kept in the history
const RENDERED = 3; // utterances rendered in the live region
const MAX_LINES = 2; // the last line or two; the sheet keeps the rest
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

/** The newest speaker's turn, up to the last RENDERED utterances. */
export function currentTurn(entries: readonly CaptionEntry[]): CaptionEntry[] {
  const speaker = entries[entries.length - 1]?.speaker;
  let start = entries.length;
  while (start > 0 && entries[start - 1]?.speaker === speaker) start--;
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
  return speaker === 'user' ? t('common.you') : appState.get('activePersona').name;
}

/** One utterance as a paragraph, optionally led by its speaker's name. */
export function renderLine(entry: CaptionEntry, showName: boolean): HTMLParagraphElement {
  const line = document.createElement('p');
  line.className = 'ferni-caption-line';
  line.dataset.speaker = entry.speaker;
  if (showName) {
    const name = document.createElement('span');
    name.className = 'ferni-caption-line__name';
    name.textContent = speakerName(entry.speaker);
    line.append(name);
  }
  line.append(document.createTextNode(entry.text));
  return line;
}

/**
 * Grow `line` from `before` to `after`. Speech arrives as the text so far, so
 * when it only adds words, those words fade in on their own, as they are
 * spoken; anything else (a correction) replaces the text quietly.
 */
export function revealWords(line: HTMLElement, before: string, after: string): void {
  const words = document.createElement('span');
  words.className = 'ferni-caption-words';
  if (before && after.startsWith(before)) {
    if (after.length === before.length) return;
    words.textContent = after.slice(before.length);
    line.append(words);
  } else {
    words.textContent = after;
    line.replaceChildren(words);
  }
  line.dataset.text = after;
}

class LiveCaptions {
  private root: HTMLElement | null = null;
  private viewport: HTMLElement | null = null;
  private entries: CaptionEntry[] = [];
  private idle: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;
  private wordsShown = false;
  private chips: MomentChips | null = null;

  constructor(private readonly isEnabled: () => boolean) {}

  /** A moment chip (see moment-chips.ts); shows even with captions off. */
  moment(moment: Moment | null): void {
    if (!moment) return;
    this.mount();
    this.chips?.show(moment);
  }

  push(speaker: CaptionSpeaker, text: string, final: boolean): void {
    const before = this.entries;
    this.entries = applyTranscript(before, speaker, text, final);
    if (this.entries === before) return;
    if (!this.isEnabled()) return this.hide();
    // Same length and same second-to-last entry: the open utterance grew.
    const grew =
      this.entries.length === before.length &&
      this.entries[this.entries.length - 2] === before[before.length - 2];
    this.render(grew);
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.hide(), IDLE_MS);
  }

  /** Captions were switched on or off mid-call. */
  refresh(): void {
    if (this.isEnabled() && this.entries.length > 0) this.render(false);
    else this.hide();
  }

  hide(): void {
    this.wordsShown = false;
    this.update();
  }

  /** Visible while there are words to show or moments to keep. */
  private update(): void {
    if (!this.root) return;
    const chips = this.chips?.count() ?? 0;
    this.root.classList.toggle('ferni-captions--words-off', !this.wordsShown);
    this.root.classList.toggle('ferni-captions--visible', this.wordsShown || chips > 0);
    this.schedule();
  }

  /** Call ended: forget the conversation and take the region down. */
  reset(): void {
    this.entries = [];
    this.chips?.clear();
    this.hide();
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
    // No panel, no labels: the words sit in the open space between Ferni and
    // the controls. Tapping them (or Enter) opens the conversation so far.
    const viewport = document.createElement('div');
    viewport.className = 'ferni-captions__viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'button');
    viewport.setAttribute('aria-label', t('transcript.showAll'));
    const open = (): void => openTranscriptSheet(this.entries, (e) => renderLine(e, true));
    viewport.addEventListener('click', open);
    viewport.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open();
    });
    const moments = document.createElement('ol');
    moments.className = 'ferni-captions__moments';
    moments.setAttribute('role', 'status');
    this.chips = new MomentChips(moments, () => this.update());
    root.append(viewport, moments);
    document.body.append(root);
    window.addEventListener('resize', () => this.schedule());
    // The avatar grows and the controls move when a call connects; follow them.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.schedule());
      for (const el of document.querySelectorAll('.header, .avatar-container, .controls-row')) {
        observer.observe(el);
      }
    }
    this.root = root;
    this.viewport = viewport;
    return root;
  }

  /** `grew`: the newest utterance only gained words, so reveal just those. */
  private render(grew: boolean): void {
    const root = this.mount();
    const viewport = this.viewport;
    if (!viewport) return;
    const shown = currentTurn(this.entries);
    const last = viewport.lastElementChild as HTMLElement | null;
    const newest = shown[shown.length - 1];
    if (grew && last && newest && viewport.childElementCount === shown.length) {
      revealWords(last, last.dataset.text ?? '', newest.text);
    } else {
      viewport.replaceChildren(
        ...shown.map((entry, i) => {
          const line = renderLine({ ...entry, text: '' }, false);
          // Earlier lines arrive settled; the newest one reveals its words.
          if (i < shown.length - 1) line.classList.add('ferni-caption-line--settled');
          revealWords(line, '', entry.text);
          return line;
        })
      );
    }
    this.wordsShown = true;
    this.update();
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layout());
  }

  private layout(): void {
    if (!this.root || !this.viewport) return;
    const controls = document.querySelector('.controls-row')?.getBoundingClientRect();
    const bottomOf = (selector: string): number | null => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect && rect.height > 0 ? rect.bottom : null;
    };
    // One rem (--space-md) between the region, the controls and the avatar.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const gap = Number.isFinite(rem) ? rem : 0;
    const place = (ceiling: number | null): CaptionsLayout =>
      captionsLayout(window.innerHeight, controls?.height ? controls.top : null, ceiling, gap);
    // Keep clear of the whole persona header (avatar, name, roster) when that
    // leaves room for a line (and the chip); never closer than the avatar.
    let { bottom, maxHeight } = place(bottomOf('.header'));
    if (this.fit(maxHeight, true) < 1) {
      ({ bottom, maxHeight } = place(bottomOf('.avatar-container')));
    }
    this.root.style.setProperty('--ferni-captions-bottom', `${bottom}px`);
    this.root.style.setProperty('--ferni-captions-room', `${maxHeight}px`);
    // Words come first (captions are access; chips are delight): if both
    // don't fit, the chips step aside. Not even one line, or no room for
    // chips alone: stay hidden rather than cover the avatar.
    const withChips = this.fit(maxHeight, true);
    const lines = withChips >= 1 ? withChips : this.fit(maxHeight, false);
    const chipsAside = this.wordsShown ? withChips < 1 : maxHeight < this.chrome(true);
    this.root.style.setProperty('--ferni-captions-lines', String(Math.max(1, lines)));
    this.root.classList.toggle('ferni-captions--moments-aside', chipsAside);
    this.root.classList.toggle('ferni-captions--no-room', this.wordsShown ? lines < 1 : chipsAside);
    this.viewport.scrollTop = this.viewport.scrollHeight;
    this.root.classList.toggle(
      'ferni-captions--overflowing',
      lines > 1 && this.viewport.scrollHeight > this.viewport.clientHeight
    );
  }

  /** Padding, plus the moment chips when they are counted. */
  private chrome(withChips: boolean): number {
    if (!this.root) return 0;
    const style = getComputedStyle(this.root);
    const chips = withChips ? (this.chips?.list.offsetHeight ?? 0) : 0;
    return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + chips;
  }

  /** Whole caption lines (at most MAX_LINES) that fit in `room` px. */
  private fit(room: number, withChips: boolean): number {
    if (!this.viewport) return 0;
    const line = parseFloat(getComputedStyle(this.viewport).lineHeight) || 1;
    return Math.min(MAX_LINES, Math.floor((room - this.chrome(withChips)) / line));
  }
}

let instance: LiveCaptions | null = null;

/** Start listening for transcript events. Idempotent. */
export function initLiveCaptions(isEnabled: () => boolean = captionsOn): LiveCaptions {
  if (instance) return instance;
  // Styles first: they also retire the status-island pill this replaces.
  injectCaptionStyles();
  injectTranscriptSheetStyles();
  const captions = new LiveCaptions(isEnabled);
  mountCaptionsToggle(() => captions.refresh());
  window.addEventListener('ferni:transcript', ((e: CustomEvent) => {
    const { type, text, isFinal } = e.detail as { type: string; text: string; isFinal?: boolean };
    if (type !== 'user' && type !== 'agent') return;
    // Same defaults as app.ts: user text is interim until final, agent text final.
    captions.push(type, text, isFinal ?? type === 'agent');
  }) as EventListener);
  // Moments: what Ferni heard and is holding on to (moment-chips.ts).
  const on = (name: string, toMoment: (detail: unknown) => Moment | null): void =>
    window.addEventListener(name, ((e: CustomEvent) =>
      captions.moment(toMoment(e.detail))) as EventListener);
  on('ferni:backend-trust-signal', momentFromTrustSignal);
  on('ferni:inline-feedback', (d) => momentFromDetail(d, 'feedback'));
  on('ferni:moment', (d) => momentFromDetail(d, 'moment'));
  window.addEventListener('ferni:connection-state', ((e: CustomEvent) => {
    if ((e.detail as { state?: string })?.state === 'disconnected') captions.reset();
  }) as EventListener);
  instance = captions;
  return captions;
}
