/**
 * Avatar Soul: the real webapp avatar in an /avatar-lab frame, with a control
 * for each turn, face, moment, name lift and the crisis hold (#4069: every
 * admin control is real). Each control posts one lab command and the status
 * line says what the lab answered: the export that ran, why it was refused,
 * or that the lab did not answer. The motion switches set this browser's
 * overrides (config/motion-flags.ts) and reload the lab to show them.
 *
 * @module AvatarSoulSection
 */

import { motionFlagOverride, setMotionFlagOverride } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';
import { createLabClient, isLabNotReady } from './avatar-lab-client.js';
import {
  describeAnswer,
  describeReducedMotion,
  describeSwitch,
  describeSwitchNotStored,
  labControl,
  motionFlagFrom,
  overrideChoice,
  renderLabControls,
  renderMotionSwitches,
  type LabControl,
} from './avatar-lab-controls.js';

const log = createLogger('AvatarSoulSection');

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const STYLES = `<style>
  .soul-lab { padding: var(--space-6); display: grid; gap: var(--space-6); }
  .soul-lab h1 { font-size: var(--text-2xl); margin: 0; }
  .soul-lab h2 { font-size: var(--text-lg); margin: 0 0 var(--space-3); }
  .soul-lab-top { display: flex; flex-wrap: wrap; gap: var(--space-6); align-items: flex-start; }
  .soul-lab-frame {
    width: min(320px, 100%); height: 380px; flex-shrink: 0;
    border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg);
  }
  .soul-lab-controls { display: grid; gap: var(--space-3); flex: 1; min-width: 260px; }
  .soul-row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .soul-row-name { min-width: 7rem; font-weight: 600; }
  .soul-muted, .soul-lab-note { color: var(--color-text-muted); font-size: var(--text-sm); }
  .soul-switches { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
</style>`;

export function render(): string {
  return `${STYLES}
    <div class="soul-lab">
      <header>
        <h1>Avatar Soul</h1>
        <p class="soul-lab-note">The real avatar, live</p>
      </header>
      <div class="soul-lab-top">
        <iframe id="avatarLabFrame" class="soul-lab-frame" src="/avatar-lab" title="The real avatar"></iframe>
        <div class="soul-lab-controls">
          ${renderLabControls()}
          <p id="avatarLabHeld" class="soul-muted">Held: not known yet</p>
          <p id="avatarLabReducedMotion" class="soul-muted"></p>
          <p id="avatarLabStatus" role="status" aria-live="polite"></p>
        </div>
      </div>
      <section>
        <h2>Motion switches (this browser; also changes your webapp)</h2>
        ${renderMotionSwitches()}
      </section>
      <section id="avatarSoulFieldData"></section>
    </div>`;
}

/** What setupEvents started, so cleanup can stop exactly that. */
let stop: (() => void) | null = null;

export function setupEvents(root: HTMLElement): Promise<void> {
  cleanup(); // a second setup without a cleanup must not leave the first one listening
  const frame = root.querySelector<HTMLIFrameElement>('#avatarLabFrame');
  if (!frame) {
    log.warn('Avatar Soul has no lab frame to drive');
    return Promise.resolve();
  }
  const client = createLabClient(frame, window);
  const events = new AbortController();
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  const text = (id: string, value: string): void => {
    const el = root.querySelector(`#${id}`);
    if (el && !events.signal.aborted) el.textContent = value;
  };
  /** Only the newest action (a lab click or a switch change) may write the status line. */
  let latestAction = 0;
  const startAction = (): ((value: string) => void) => {
    const mine = ++latestAction;
    return (value) => {
      if (mine === latestAction) text('avatarLabStatus', value);
    };
  };
  const showReducedMotion = (): void =>
    text('avatarLabReducedMotion', describeReducedMotion(media.matches));

  /** Asks the lab whether the crisis hold is on; `tries` > 1 asks again while the lab is still booting. */
  const refreshHeld = async (tries = 1): Promise<void> => {
    const answer = await client.send({ name: 'status' });
    if (isLabNotReady(answer) && tries > 1 && !events.signal.aborted) return refreshHeld(tries - 1);
    const status = isLabNotReady(answer) ? undefined : answer.status;
    text('avatarLabHeld', `Held: ${status ? (status.crisisHeld ? 'yes' : 'no') : 'not known'}`);
  };

  const run = async (control: LabControl): Promise<void> => {
    const say = startAction();
    say(`${control.label}: asking the lab`);
    const answer = await client.send(control.command);
    say(describeAnswer(control.label, answer));
    if (control.command.name === 'crisisHold') await refreshHeld();
  };

  const { signal } = events;
  root.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const btn = target?.closest<HTMLButtonElement>('button[data-lab-control]');
      if (!btn) return;
      const face = root.querySelector<HTMLSelectElement>('select[data-lab-face]')?.value;
      const control = labControl(btn.dataset.labControl ?? '', face);
      if (control) void run(control);
    },
    { signal }
  );
  root.addEventListener(
    'change',
    (event) => {
      const select = event.target instanceof HTMLSelectElement ? event.target : null;
      const flag = motionFlagFrom(select?.dataset.motionFlag);
      const choice = overrideChoice(select?.value ?? '');
      if (!select || !flag || !choice) return;
      const say = startAction();
      const wanted = choice === 'default' ? null : choice;
      setMotionFlagOverride(flag, wanted);
      const stored = motionFlagOverride(flag);
      if (stored !== wanted) {
        // storage is blocked (private mode, site data off): the lab would boot unchanged
        select.value = stored ?? 'default';
        say(describeSwitchNotStored(flag));
        return;
      }
      const src = frame.src;
      frame.src = src; // the same address again reloads the lab, which boots with the new switch
      say(describeSwitch(flag, choice));
    },
    { signal }
  );
  // The lab answers only once its bridge has booted, which can be after the frame's load event
  frame.addEventListener('load', () => void refreshHeld(3), { signal });

  showReducedMotion();
  media.addEventListener('change', showReducedMotion);

  stop = () => {
    events.abort();
    client.dispose();
    media.removeEventListener('change', showReducedMotion);
  };
  return Promise.resolve();
}

/** Stops the lab client and every listener setupEvents added. */
export function cleanup(): void {
  stop?.();
  stop = null;
}
