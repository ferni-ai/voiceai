/**
 * Proactive Intelligence Types
 *
 * Type definitions for proactive alerts and notifications.
 * This is the "Better Than Human" core - we reach out BEFORE you ask.
 */
// ============================================================================
// DEFAULTS
// ============================================================================
export const DEFAULT_ALERT_PREFERENCES = {
    enabledCategories: ['weather', 'traffic', 'environmental', 'sports', 'relationship'],
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    maxAlertsPerDay: 10,
    minimumUrgency: 'medium',
};
export const DEFAULT_CHECK_INTERVALS = {
    weather: 30, // Check every 30 minutes
    traffic: 15, // Check every 15 minutes
    environmental: 60, // Check every hour
    finance: 15, // Check every 15 minutes
    sports: 30, // Check every 30 minutes
    health: 60, // Check every hour
    relationship: 1440, // Check daily
    calendar: 30, // Check every 30 minutes
};
//# sourceMappingURL=types.js.map