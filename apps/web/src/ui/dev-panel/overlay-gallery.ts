/**
 * Overlay gallery (dev server only)
 *
 * Opens one real overlay of each kind with realistic content, so overlay
 * spacing, stacking and contrast can be screenshotted and reviewed together.
 * src/index.ts loads this module only when import.meta.env.DEV is true and
 * the URL carries ?e2e=1&gallery=overlays, so production builds drop it.
 *
 *   ?e2e=1&gallery=overlays              -> exposes the scene list only
 *   ?e2e=1&gallery=overlays&scene=<id>   -> opens that scene on load
 *
 * window.__overlayGallery exposes { scenes, ready, show, probe } for the
 * Playwright screenshot script.
 */

import { createLogger } from '../../utils/logger.js';
import { captionHeardListening, captionHeardReply } from './overlay-gallery-captions.js';

const log = createLogger('OverlayGallery');

type Scene = () => Promise<void> | void;

const isPhone = (): boolean => window.innerWidth <= 768;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Long enough to screenshot; real toasts use the Moments defaults. */
const HOLD_MS = 60_000;

/**
 * Run `show` with its self-dismiss timers stretched to HOLD_MS. Outreach and
 * notification cards close themselves after 15 s, achievement toasts after
 * 3-8 s, and a busy CI runner can spend longer than that settling the page,
 * so a check missed the overlay. Timers of 3 s or more scheduled
 * synchronously inside `show` are affected; shorter ones (animations) are not.
 */
function holdOpen(show: () => void): void {
  const realSetTimeout = window.setTimeout;
  window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
    realSetTimeout(
      handler,
      ms !== undefined && ms >= 3_000 ? HOLD_MS : ms,
      ...args
    )) as typeof window.setTimeout;
  try {
    show();
  } finally {
    window.setTimeout = realSetTimeout;
  }
}

async function twoToasts(): Promise<void> {
  const { showWhisper } = await import('../whisper.ui.js');
  showWhisper({
    message: 'Saved. Ferni will remember you prefer mornings.',
    type: 'success',
    duration: HOLD_MS,
  });
  showWhisper({ message: 'Maya is joining the conversation.', type: 'info', duration: HOLD_MS });
}

async function toastError(): Promise<void> {
  const { showWhisper } = await import('../whisper.ui.js');
  showWhisper({ message: "Couldn't reach Ferni. Try again?", type: 'error', duration: HOLD_MS });
}

/** An error long enough that a two-line clamp would cut off what to do about it. */
async function toastLong(): Promise<void> {
  const message =
    'We could not save your reminder because the calendar connection expired. Reconnect your calendar from Settings and try again.';
  (await import('../whisper.ui.js')).showWhisper({ message, type: 'error', duration: HOLD_MS });
}

async function toastWarning(): Promise<void> {
  const { showWhisper } = await import('../whisper.ui.js');
  showWhisper({
    message: 'Your voice profile needs a refresh',
    type: 'warning',
    duration: HOLD_MS,
  });
}

async function noticeWithAction(): Promise<void> {
  const { moments } = await import('../moments/index.js');
  moments.notice('Maya left you a note about your sleep goal.', {
    type: 'info',
    duration: HOLD_MS,
    action: { label: 'View', callback: () => undefined },
  });
}

async function achievement(): Promise<void> {
  // A real easter-egg achievement (the Konami code), through its own unlock path.
  const { easterEggsUI } = await import('../easter-eggs.ui.js');
  holdOpen(() => easterEggsUI.triggerKonamiCode());
}

async function celebration(): Promise<void> {
  const { moments } = await import('../moments/index.js');
  holdOpen(() => void moments.celebrate('streak', { count: 7 }));
}

async function milestone(): Promise<void> {
  const { moments } = await import('../moments/index.js');
  void moments.milestone('team_unlock', {
    eyebrow: 'New teammate',
    title: 'Meet Maya',
    message: 'Maya helps you build habits that stick. She is ready when you are.',
    action: { label: 'Say hello', callback: () => undefined },
  });
}

/** A first call's milestone card: what lands on the call controls if placement slips. */
async function firstMilestone(): Promise<void> {
  const { initFerniMilestones } = await import('../ferni-milestones.ui.js');
  initFerniMilestones();
  // Outside a real call there is no opening to wait out, so it shows at once.
  holdOpen(() =>
    window.dispatchEvent(
      new CustomEvent('ferni:connection-state', { detail: { state: 'connected' } })
    )
  );
  await wait(400);
}

async function notificationCard(): Promise<void> {
  const { showRitualReminder } = await import('../notifications.ui.js');
  holdOpen(() => showRitualReminder('Evening reflection', 'ferni', () => undefined));
}

async function outreach(): Promise<void> {
  const ui = await import('../proactive-outreach.ui.js');
  ui.initProactiveOutreachUI();
  holdOpen(() =>
    ui.showOutreach({
      id: 'gallery-outreach',
      type: 'thinking_of_you',
      message: 'Thinking of you before your interview tomorrow. You have prepared well.',
      personaId: 'ferni',
      personaName: 'Ferni',
    })
  );
}

async function offlineBanner(): Promise<void> {
  const { offlineBanner: banner } = await import('../offline-banner.ui.js');
  banner.init();
  banner.show();
}

/** A call that dropped and is coming back (status island with the flag on). */
async function reconnecting(): Promise<void> {
  (await import('../status-island-connection.js')).initStatusIslandConnection();
  window.dispatchEvent(
    new CustomEvent('ferni:connection-state', { detail: { state: 'reconnecting' } })
  );
}

/** A call on a poor link; the island shows it after its 3 s debounce. */
async function weakConnection(): Promise<void> {
  (await import('../status-island-connection.js')).initStatusIslandConnection();
  const cq = await import('../connection-quality.ui.js');
  window.dispatchEvent(
    new CustomEvent('ferni:connection-state', { detail: { state: 'connected' } })
  );
  cq.setQuality('poor');
  cq.show();
  await wait(3200);
}

/** Every bottom/top-right transient at once: what a busy first minute looks like. */
async function collision(): Promise<void> {
  await twoToasts();
  await notificationCard();
  await outreach();
  await achievement();
}

async function modal(): Promise<void> {
  const { confirm } = await import('../confirm-modal.ui.js');
  void confirm({
    title: 'Forget this memory?',
    message: 'Ferni will no longer remember that you are training for a half marathon.',
    confirmText: 'Forget',
    cancelText: 'Keep',
    destructive: true,
    icon: 'delete',
  });
}

async function sheet(): Promise<void> {
  if (isPhone()) {
    // app.ts initialises the sheet on a deferred timer; init is idempotent.
    const { initMobileBottomSheet, open } = await import('../mobile-bottom-sheet.ui.js');
    initMobileBottomSheet();
    open();
  } else {
    const { showSettingsMenu } = await import('../settings-menu.ui.js');
    showSettingsMenu();
  }
}

async function toastOverSheet(): Promise<void> {
  await sheet();
  await wait(400);
  const { showWhisper } = await import('../whisper.ui.js');
  showWhisper({ message: 'Reminder set for 7:30 tomorrow.', type: 'success', duration: HOLD_MS });
}

async function permission(): Promise<void> {
  const { showLocationPrompt } = await import('../location-prompt.ui.js');
  void showLocationPrompt('weather');
}

async function actionConfirmation(): Promise<void> {
  const { showActionConfirmation } = await import('../action-confirmation.ui.js');
  showActionConfirmation({
    id: 'gallery-action',
    actionType: 'send_email',
    category: 'email',
    description: 'Send a follow-up email',
    preview: {
      title: 'Email Sam about Saturday',
      summary: 'Confirming the 9am trail run and asking about parking.',
      details: ['To: sam@example.com', 'Subject: Saturday run'],
      canUndo: false,
    },
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    metadata: {},
  });
}

async function callNotice(): Promise<void> {
  const { showCallNotice } = await import('../call-status.ui.js');
  showCallNotice(
    {
      kind: 'mic_denied',
      message: 'Ferni cannot hear you. Allow the microphone to talk.',
      action: 'mic-help',
    },
    { onRetry: () => undefined }
  );
}

async function commandPalette(): Promise<void> {
  const palette = await import('../command-palette.ui.js');
  palette.initCommandPalette();
  palette.open();
}

async function coachMark(): Promise<void> {
  const { modalCoordinator } = await import('../../services/modal-coordinator.service.js');
  modalCoordinator.simulateConversations(3);
  const hints = await import('../feature-hints.ui.js');
  hints.initFeatureHints();
  hints.registerHint({
    id: 'gallery-hint',
    type: 'tooltip',
    targetSelector: '#connectBtn',
    title: 'Talk any time',
    message: 'Tap Connect and just start speaking.',
  });
  hints.showHint('gallery-hint');
}

/** In-call captions with a long user line and a long Ferni line still streaming. */
async function captions(): Promise<void> {
  const { setConnectionState } = await import('../../state/app.state.js');
  setConnectionState('connected');
  const say = (type: string, text: string, isFinal: boolean): boolean =>
    window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
  say(
    'user',
    'Yeah I think I rushed it because he was already checking his watch and I just wanted to get to the migration project I led last spring',
    true
  );
  say(
    'agent',
    'That makes a lot of sense. When you said the interview went sideways after the second question, I wonder if it was less about your answer and more about how fast you were trying to get to the end of it. Want to walk through it together?',
    false
  );
  await wait(400);
}

/** Captions plus a moment Ferni is holding on to (moment chip). */
async function captionMoments(): Promise<void> {
  await captions();
  window.dispatchEvent(
    new CustomEvent('ferni:backend-trust-signal', {
      detail: {
        type: 'callback',
        message: 'You started martial arts on Tuesdays',
      },
    })
  );
  await wait(400);
}

export const SCENES: Readonly<Record<string, Scene>> = {
  'toast-pair': twoToasts,
  'toast-error': toastError,
  'toast-long': toastLong,
  'toast-warning': toastWarning,
  'notice-action': noticeWithAction,
  achievement,
  celebration,
  milestone,
  'first-milestone': firstMilestone,
  'notification-card': notificationCard,
  outreach,
  'offline-banner': offlineBanner,
  reconnecting,
  'weak-connection': weakConnection,
  collision,
  modal,
  sheet,
  'toast-over-sheet': toastOverSheet,
  permission,
  'action-confirmation': actionConfirmation,
  'call-notice': callNotice,
  'command-palette': commandPalette,
  'coach-mark': coachMark,
  captions,
  'caption-moments': captionMoments,
  // The captions scene with the captions-breath flag on (set by the spec).
  'caption-breath': captions,
  'caption-heard': captionHeardListening,
  'caption-heard-reply': captionHeardReply,
};

// Probe: measurements of every visible fixed overlay, for the screenshot report.

interface OverlayProbe {
  selector: string;
  rect: { x: number; y: number; w: number; h: number };
  zIndex: string;
  padding: string;
  radius: string;
  color: string;
  background: string;
  role: string | null;
  lowContrast: string[];
}

function describe(el: Element): string {
  const cls =
    typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
}

// WCAG 2.x relative-luminance contrast of visible overlay text, so the
// screenshot report can flag text under 4.5:1 (3:1 for large text).
type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba | null {
  const parts = value
    .match(/rgba?\(([^)]+)\)/)?.[1]
    ?.split(/[\s,/]+/)
    .filter(Boolean);
  if (!parts || parts.length < 3) return null;
  const [r, g, b, a = '1'] = parts;
  return [Number(r), Number(g), Number(b), Number(a)];
}

function luminance([r, g, b]: Rgba): number {
  const ch = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
    1,
  ];
}

/** First opaque-enough background behind el (gradients use their first stop). */
function backdropOf(el: Element): Rgba {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    const solid = parseColor(cs.backgroundColor);
    if (solid && solid[3] >= 0.6) return solid;
    const stop = cs.backgroundImage.includes('gradient') ? parseColor(cs.backgroundImage) : null;
    if (stop && stop[3] >= 0.6) return stop;
  }
  const page = parseColor(getComputedStyle(document.body).backgroundColor);
  return page && page[3] > 0 ? page : [255, 255, 255, 1];
}

function lowContrastText(root: Element): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent?.trim();
    const el = n.parentElement;
    if (!text || !el || el.getClientRects().length === 0) continue;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg || cs.visibility === 'hidden') continue;
    const bg = backdropOf(el);
    const alpha = fg[3] * Number(cs.opacity || '1');
    const shown = over([fg[0], fg[1], fg[2], alpha], bg);
    const lf = luminance(shown);
    const lb = luminance(bg);
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5))
      out.push(`${ratio.toFixed(2)}:1 "${text.slice(0, 40)}" (${size}px)`);
  }
  return out;
}

function probe(): {
  overlays: OverlayProbe[];
  active: string;
  controls: OverlayProbe['rect'] | null;
} {
  const overlays: OverlayProbe[] = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    overlays.push({
      selector: describe(el),
      rect: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      zIndex: cs.zIndex,
      padding: cs.padding,
      radius: cs.borderRadius,
      color: cs.color,
      background: cs.backgroundColor,
      role: el.getAttribute('role'),
      lowContrast: lowContrastText(el),
    });
  }
  const controls = document.querySelector('.controls-row')?.getBoundingClientRect();
  return {
    overlays,
    active: document.activeElement ? describe(document.activeElement) : 'none',
    controls: controls
      ? {
          x: Math.round(controls.x),
          y: Math.round(controls.y),
          w: Math.round(controls.width),
          h: Math.round(controls.height),
        }
      : null,
  };
}

/** Resolves once the app shell has rendered and its deferred UI has settled. */
async function waitForApp(): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (document.body.classList.contains('app-loaded') && document.getElementById('connectBtn'))
      break;
    await wait(100);
  }
  await wait(1500); // app.ts deferredInit timers run 200-1000 ms after init
}

export async function mountOverlayGallery(): Promise<void> {
  await waitForApp();
  const api = {
    scenes: Object.keys(SCENES),
    ready: false,
    show: async (id: string): Promise<void> => {
      const scene = SCENES[id];
      if (!scene) throw new Error(`Unknown overlay scene: ${id}`);
      await scene();
    },
    probe,
  };
  (window as unknown as { __overlayGallery: typeof api }).__overlayGallery = api;

  const scene = new URLSearchParams(window.location.search).get('scene');
  if (scene) {
    try {
      await api.show(scene);
    } catch (err) {
      log.warn({ error: err, scene }, 'Overlay gallery scene failed');
    }
  }
  api.ready = true;
}
