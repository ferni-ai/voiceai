/**
 * What I Do For You: load the routines and decide which state the panel shows.
 *
 * Every load ends in one state (menu rubric §3): ready, empty, signed out, offline or
 * error. A failed route is an error with Try again, never "Nothing set up yet".
 */

import { t } from '../../i18n/index.js';
import {
  getLifeAutomationService,
  WorkflowsLoadError,
  type Workflow,
} from '../../services/life-automation.service.js';
import { getUserId } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('RoutinesLoad');

export type RoutinesNotice = 'signed-out' | 'offline' | 'error';
export type RoutinesLoad = { kind: 'ready'; workflows: Workflow[] } | { kind: RoutinesNotice };

/** Fetch the person's routines; signed out is decided before anything waits */
export async function loadRoutines(): Promise<RoutinesLoad> {
  const userId = getUserId();
  if (!userId) return { kind: 'signed-out' };
  try {
    return { kind: 'ready', workflows: await getLifeAutomationService().listWorkflows(userId) };
  } catch (error) {
    if (error instanceof WorkflowsLoadError && error.status === 401) return { kind: 'signed-out' };
    if (error instanceof WorkflowsLoadError && error.offline) return { kind: 'offline' };
    log.error('Failed to load routines', { error });
    return { kind: 'error' };
  }
}

/** The panel root's data-state (rubric §3: loading, ready, empty or error) */
export function routinesDataState(load: RoutinesLoad): 'ready' | 'empty' | 'error' {
  if (load.kind !== 'ready') return 'error';
  return load.workflows.length === 0 ? 'empty' : 'ready';
}

/** Copy from menu rubric §3 (and §2: the error words of EMPTY-ERROR-STATES §7.2) */
const NOTICES: Record<RoutinesNotice, [string, string, 'sign-in' | 'retry']> = {
  'signed-out': ['ferniCare.states.signedOut', 'ferniCare.states.signIn', 'sign-in'],
  offline: ['ferniCare.states.offline', 'ferniCare.states.tryAgain', 'retry'],
  error: ['ferniCare.states.somethingUnexpected', 'ferniCare.states.tryAgain', 'retry'],
};

/** A state that isn't the routine list, with its one action */
export function routinesNoticeHtml(kind: RoutinesNotice): string {
  const [message, label, action] = NOTICES[kind];
  return `
    <div class="ferni-empty" data-notice="${kind}" role="status">
      <p class="ferni-empty__description">${t(message)}</p>
      <button class="ferni-empty__btn" data-notice-action="${action}">${t(label)}</button>
    </div>
  `;
}

/** Wire the notice's button: Sign in opens the sign-in gate, then loads again */
export function bindRoutinesNotice(root: Element, reload: () => void): void {
  root.querySelector<HTMLElement>('[data-notice-action]')?.addEventListener('click', (e) => {
    const action = (e.currentTarget as HTMLElement).dataset.noticeAction;
    if (action !== 'sign-in') return reload();
    void import('../sign-in-gate.ui.js')
      .then(({ showSignInGate }) => showSignInGate())
      .then(reload)
      .catch((error: unknown) => log.error('Sign-in gate failed to open', { error }));
  });
}
