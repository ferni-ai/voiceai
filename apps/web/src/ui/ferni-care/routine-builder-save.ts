/**
 * Routine Builder - saving
 *
 * Saves a routine and tells the user when that didn't happen. The automation
 * service returns null (it does not throw) when the server refuses a save, so a
 * bare `await` used to close the builder as if the routine had been created.
 */

import { t } from '../../i18n/index.js';
import {
  getLifeAutomationService,
  type Workflow,
  type WorkflowAction,
  type WorkflowTemplate,
  type WorkflowTrigger,
} from '../../services/life-automation.service.js';
import { getUserId } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';
import { toast } from '../whisper.ui.js';
import { calendarTriggerOn } from './routine-builder-calendar.js';

const log = createLogger('RoutineBuilder');

export interface RoutineDraft {
  editing: Workflow | null;
  template: WorkflowTemplate | null;
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
  variables: Record<string, unknown>;
}

/** The trigger to save; a calendar one always carries the `triggerOn` the server matches on. */
export function buildTrigger(draft: Pick<RoutineDraft, 'triggerType' | 'triggerConfig'>): WorkflowTrigger {
  const trigger = { type: draft.triggerType, ...draft.triggerConfig } as WorkflowTrigger;
  if (trigger.type === 'calendar') trigger.triggerOn = calendarTriggerOn(trigger.triggerOn);
  return trigger;
}

/** True when the routine was saved; otherwise the user has been told why not. */
export async function saveRoutine(draft: RoutineDraft): Promise<boolean> {
  const userId = getUserId();
  if (!userId) {
    toast.error(t('routineBuilder.errors.signInRequired'));
    return false;
  }

  const service = getLifeAutomationService();
  const trigger = buildTrigger(draft);

  try {
    let saved: Workflow | null;
    if (draft.editing) {
      saved = await service.updateWorkflow(draft.editing.id, userId, {
        name: draft.name,
        trigger,
        actions: draft.actions,
        variables: draft.variables,
      });
    } else if (draft.template) {
      saved = await service.createFromTemplate(draft.template.id, userId, draft.variables);
    } else {
      saved = await service.createWorkflow(userId, {
        name: draft.name,
        trigger,
        actions: draft.actions,
      });
    }
    if (saved) return true;
  } catch (error) {
    log.error('Failed to save routine', error);
  }
  toast.error(t('routineBuilder.errors.saveFailed'));
  return false;
}
