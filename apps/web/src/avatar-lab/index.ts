/**
 * The avatar lab page (/avatar-lab): only the real webapp avatar, for the
 * admin Avatar Soul page to frame. It runs the same avatar boot as the app
 * (src/ui/avatar-boot.ts), so the lab shows exactly what users get, and
 * nothing else: no sign-in, no call, no auth, connection service or LiveKit.
 *
 * The avatar follows turns from a turn driver this page owns (there is no
 * room to watch), kept here for the command bridge to drive.
 */
import { initializeTheme } from '../app/app-theme.js';
import { initI18n } from '../i18n/index.js';
import { bootAvatarNow, scheduleAvatar, type AvatarBootRunner } from '../ui/avatar-boot.js';
import {
  createTurnDriver,
  defaultTargets,
  turnSettleMs,
  type TurnDriver,
} from '../ui/avatar-motion/turn-driver.js';
import { initWaveformUI } from '../ui/waveform.ui.js';
import { initGSAP } from '../utils/gsap-animations.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AvatarLab');

const LAB_STYLE_ID = 'avatar-lab-style';

/**
 * Hides everything but the avatar (#coach) and the waveform, wherever they sit
 * in #app. The ID selectors outrank the app's ordinary rules. Two things could
 * still win: an inline display, which app.ts never sets on the lab because it
 * starts the lab before sign-in, the call controls or revealApp run; and an
 * important rule in the app's stylesheets (the one that shows on the lab is
 * handled by FORCED_VISIBLE_IDS).
 */
const LAB_STYLE = `
html[data-avatar-lab='on'] body > :not(#app) { display: none; }
html[data-avatar-lab='on'] #app :not(:has(#coach, #waveformContainer)):not(#coach, #coach *, #waveformContainer, #waveformContainer *) {
  display: none;
}
`;

/**
 * Elements the app's stylesheet forces visible with an important display
 * (#helperText in styles/inline-styles.css), which no lab rule outranks. The lab
 * never runs the code that uses them (ui/message.ui.ts), so it removes them.
 */
const FORCED_VISIBLE_IDS = ['helperText'] as const;

const lab: { turnDriver: TurnDriver | null } = { turnDriver: null };

async function runStep(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    log.error(`Failed to initialize ${name}:`, error);
  }
}

/** Runs each boot step now, or after its delay, logging any that fail. */
const runner: AvatarBootRunner = {
  now: (name, fn) => void runStep(name, fn),
  later: (name, delayMs, fn) => {
    setTimeout(() => void runStep(name, fn), delayMs);
  },
};

function addLabStyle(): void {
  if (document.getElementById(LAB_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LAB_STYLE_ID;
  style.textContent = LAB_STYLE;
  document.head.appendChild(style);
}

function removeForcedVisible(): void {
  for (const id of FORCED_VISIBLE_IDS) document.getElementById(id)?.remove();
}

export async function startAvatarLab(): Promise<void> {
  document.documentElement.setAttribute('data-avatar-lab', 'on');
  addLabStyle();
  removeForcedVisible();
  document.body.classList.add('app-loaded'); // runs the avatar's entrance, as in the app

  await initI18n(); // the circadian theme and the thinking label use t()
  initializeTheme(); // no listener: no theme toggle, so the lab never changes the saved theme
  initGSAP(); // the app's tween defaults, which the avatar's animations rely on
  initWaveformUI();
  bootAvatarNow(runner);
  scheduleAvatar(runner, { startTurns: () => true });
  // The app's settle time: slower when the viewer prefers reduced motion
  lab.turnDriver = createTurnDriver(defaultTargets, turnSettleMs());

  document.querySelector('.avatar-container')?.classList.add('entrance-complete');
  log.info('Avatar lab started');
}
