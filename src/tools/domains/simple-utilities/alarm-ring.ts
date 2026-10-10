/**
 * Nothing rings a saved alarm yet: no job reads the alarms collection, so
 * "Alarm set" made people rely on a wake-up that never came. Say so.
 *
 * @module simple-utilities/alarm-ring
 */
export const ALARM_CANT_RING =
  "Heads up, I can't ring you when it goes off yet, so set it on your phone too.";
