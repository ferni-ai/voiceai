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
  TURN_SETTLE_MS,
  type TurnDriver,
} from '../ui/avatar-motion/turn-driver.js';
import { initWaveformUI } from '../ui/waveform.ui.js';
import { initGSAP } from '../utils/gsap-animations.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AvatarLab');

const LAB_STYLE_ID = 'avatar-lab-style';

/** Hides everything but the avatar (#coach) and the waveform, wherever they sit in #app. */
const LAB_STYLE = `
html[data-avatar-lab='on'] body > :not(#app) { display: none !important; }
html[data-avatar-lab='on'] #app :not(:has(#coach, #waveformContainer)):not(#coach, #coach *, #waveformContainer, #waveformContainer *) {
  display: none !important;
}
`;

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

export async function startAvatarLab(): Promise<void> {
  document.documentElement.setAttribute('data-avatar-lab', 'on');
  addLabStyle();
  document.body.classList.add('app-loaded'); // runs the avatar's entrance, as in the app

  await initI18n(); // the circadian theme and the thinking label use t()
  initializeTheme();
  initGSAP(); // the app's tween defaults, which the avatar's animations rely on
  initWaveformUI();
  bootAvatarNow(runner);
  scheduleAvatar(runner, { startTurns: () => true });
  lab.turnDriver = createTurnDriver(defaultTargets, TURN_SETTLE_MS);

  document.querySelector('.avatar-container')?.classList.add('entrance-complete');
  log.info('Avatar lab started');
}
