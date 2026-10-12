/**
 * Live captions (behind the captions-v2 flag, see captions-flag.ts).
 *
 * Variant B, "Pixar": a conversation of two bubbles around Ferni.
 * - Ferni's bubble grows out of the face on the avatar's right, springing
 *   from its tail each time Ferni starts a new thought. The caller's words
 *   answer in a smaller, quieter bubble from the left (iMessage alignment,
 *   but tiny and airy). Whoever spoke last is full strength; the other rests.
 * - Where there is no room on the left (landscape) or beside the avatar at
 *   all (portrait phones, under it) the two take turns in one spot.
 * - Never over the face, the roster, the waveform or the controls
 *   (caption-bubble.ts). Moment chips sit inside Ferni's bubble.
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
import { TAIL_SVG, placeBubble, popIn } from './caption-bubble.js';

export type CaptionSpeaker = 'user' | 'agent';

export interface CaptionEntry {
  speaker: CaptionSpeaker;
  text: string;
  final: boolean;
}

const HISTORY_LIMIT = 200; // utterances kept in the history
const RENDERED = 3; // utterances rendered in the live region
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
  private bubbles = new Map<CaptionSpeaker, HTMLElement>();
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
    // Captions on: the slot keeps its height even between sentences.
    this.root.classList.toggle('ferni-captions--on', this.isEnabled());
    this.root.classList.toggle('ferni-captions--words-off', !this.wordsShown);
    this.root.classList.toggle('ferni-captions--visible', this.wordsShown || chips > 0);
    this.schedule();
  }

  /** Call ended: forget the conversation and take the region down. */
  reset(): void {
    this.entries = [];
    this.chips?.clear();
    this.hide();
    for (const bubble of this.bubbles.values()) {
      bubble.classList.remove('ferni-bubble--has-words');
      bubble.querySelector('.ferni-captions__viewport')?.replaceChildren();
    }
  }

  history(): readonly CaptionEntry[] {
    return this.entries;
  }

  private mount(): HTMLElement {
    if (this.root) {
      // Something replaced the body (route swap, HMR): put the region back.
      if (!this.root.isConnected) placeBesideAvatar(this.root);
      return this.root;
    }
    document.querySelectorAll('.ferni-captions').forEach((el) => el.remove()); // HMR
    const root = document.createElement('section');
    root.className = 'ferni-captions ferni-pixar';
    root.setAttribute('aria-label', t('transcript.captionsLabel'));
    // Tapping the words (or Enter) opens the conversation so far.
    const viewport = document.createElement('div');
    viewport.className = 'ferni-captions__viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'button');
    viewport.setAttribute('aria-label', t('transcript.showAll'));
    const open = (): void => openTranscriptSheet(this.entries, (e) => renderLine(e, true));
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open();
    };
    const callerWords = viewport.cloneNode() as HTMLElement;
    for (const words of [viewport, callerWords]) {
      words.addEventListener('click', open);
      words.addEventListener('keydown', onKey);
    }
    const bubble = (who: CaptionSpeaker, words: HTMLElement): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'ferni-bubble';
      el.dataset.who = who;
      const bg = document.createElement('div');
      bg.className = 'ferni-bubble__bg';
      el.append(bg, words);
      el.insertAdjacentHTML('beforeend', TAIL_SVG);
      this.bubbles.set(who, el);
      return el;
    };
    const ferni = bubble('agent', viewport);
    const caller = bubble('user', callerWords);
    const moments = document.createElement('ol');
    moments.className = 'ferni-captions__moments';
    moments.setAttribute('role', 'status');
    this.chips = new MomentChips(moments, () => this.update());
    ferni.append(moments);
    root.append(ferni, caller);
    placeBesideAvatar(root);
    // Re-place only when the layout around Ferni actually changes.
    window.addEventListener('resize', () => this.schedule());
    if (typeof ResizeObserver !== 'undefined' && root.parentElement) {
      new ResizeObserver(() => this.schedule()).observe(root.parentElement);
    }
    this.root = root;
    this.viewport = viewport;
    return root;
  }

  /** `grew`: the newest utterance only gained words, so reveal just those. */
  private render(grew: boolean): void {
    const root = this.mount();
    const newest = this.entries[this.entries.length - 1];
    const bubble = newest && this.bubbles.get(newest.speaker);
    const words = bubble?.querySelector<HTMLElement>('.ferni-captions__viewport');
    if (!newest || !bubble || !words) return;
    const last = words.lastElementChild as HTMLElement | null;
    if (grew && last) {
      revealWords(last, last.dataset.text ?? '', newest.text);
    } else {
      // A new thought: the speaker's bubble grows out again from its tail.
      const line = renderLine({ ...newest, text: '' }, false);
      revealWords(line, '', newest.text);
      words.replaceChildren(line);
      bubble.classList.add('ferni-bubble--has-words');
      popIn(bubble);
    }
    root.dataset.current = newest.speaker;
    this.wordsShown = true;
    this.update();
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layout());
  }

  /** Keep the newest words in view; fade the top when older text scrolls. */
  private layout(): void {
    if (!this.root || !this.viewport) return;
    placeBubble(this.root);
    for (const bubble of this.bubbles.values()) {
      const words = bubble.querySelector<HTMLElement>('.ferni-captions__viewport');
      if (!words) continue;
      words.scrollTop = words.scrollHeight;
      bubble.classList.toggle('ferni-bubble--overflowing', words.scrollHeight > words.clientHeight);
    }
  }
}

/** In #coach right after the avatar: a layer beside it on wide layouts,
 * in the flow under it on portrait phones (caption-bubble.ts). */
function placeBesideAvatar(root: HTMLElement): void {
  const avatar = document.querySelector('#coach .avatar-container');
  if (avatar) avatar.after(root);
  else (document.getElementById('coach') ?? document.body).append(root);
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
