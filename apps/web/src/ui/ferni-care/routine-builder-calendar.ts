/**
 * Routine Builder - calendar trigger
 *
 * The server only fires a calendar routine when the saved trigger's `triggerOn`
 * equals the event it is handling (workflow-engine.handleCalendarTrigger), so a
 * calendar trigger saved without one never runs. This picks that value.
 */

import { t } from '../../i18n/index.js';
import type { CalendarTriggerOn } from '../../services/life-automation.service.js';

const OPTIONS: ReadonlyArray<{ value: CalendarTriggerOn; labelKey: string; summaryKey: string }> = [
  {
    value: 'event_reminder',
    labelKey: 'routineBuilder.triggerConfig.calendar.reminder',
    summaryKey: 'ferniCare.triggers.calendar',
  },
  {
    value: 'event_start',
    labelKey: 'routineBuilder.triggerConfig.calendar.start',
    summaryKey: 'ferniCare.triggers.calendarStart',
  },
  {
    value: 'event_end',
    labelKey: 'routineBuilder.triggerConfig.calendar.end',
    summaryKey: 'ferniCare.triggers.calendarEnd',
  },
];

/** The value to save: the chosen one, or "shortly before" when none (or a location's) is set. */
export function calendarTriggerOn(value: unknown): CalendarTriggerOn {
  return OPTIONS.find((o) => o.value === value)?.value ?? 'event_reminder';
}

/** How a saved calendar routine reads in the "What I Do For You" list. */
export function calendarTriggerSummary(triggerOn: unknown): string {
  const option = OPTIONS.find((o) => o.value === calendarTriggerOn(triggerOn)) ?? OPTIONS[0];
  return t(option?.summaryKey ?? 'ferniCare.triggers.calendar');
}

export function renderCalendarTriggerFields(triggerOn: unknown): string {
  const selected = calendarTriggerOn(triggerOn);
  return `
    <div class="rb-field">
      <label class="rb-field__label">${t('routineBuilder.triggerConfig.calendar.when')}</label>
      <select class="rb-input" id="rb-calendar-trigger">
        ${OPTIONS.map((o) => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${t(o.labelKey)}</option>`).join('')}
      </select>
    </div>
  `;
}
