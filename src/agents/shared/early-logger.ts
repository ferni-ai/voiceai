/**
 * Early Logger
 *
 * Safe early logging utility for use before LiveKit logger is initialized.
 * Uses console.log intentionally as LiveKit logger isn't available yet.
 */

const DEBUG_STARTUP =
  process.env['DEBUG_AGENT'] === 'true' || process.env['NODE_ENV'] !== 'production';

/**
 * Safe early logger for before LiveKit initializes
 */
export const earlyLog = {
  info: (msg: string, data?: Record<string, unknown>) => {
    if (DEBUG_STARTUP) {
      console.log(`[voice-agent] ${msg}`, data ? JSON.stringify(data) : '');
    }
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(`[voice-agent] ${msg}`, data ? JSON.stringify(data) : '');
  },
};

export { DEBUG_STARTUP };
