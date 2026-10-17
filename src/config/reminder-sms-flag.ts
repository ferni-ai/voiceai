/**
 * REMINDER_SMS_DEFAULT=on lets a reminder the user asks to get "by text"
 * actually be texted: to the verified number on their account only (never a
 * number the model passes in), sent through the guarded sender so STOP, texts
 * turned off and quiet hours apply. Without a verified number it stays in the
 * app and Ferni says so. Off by default. Read on every call.
 *
 * Needed both where the tools run (the voice agent) and where the delivery job
 * runs (the server behind /api/jobs/deliver-reminders).
 *
 * @module config/reminder-sms-flag
 */

export function isReminderSmsDefaultOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REMINDER_SMS_DEFAULT === 'on';
}
