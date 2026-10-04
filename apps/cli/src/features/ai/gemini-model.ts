/**
 * The Gemini model the CLI's AI helpers call (AI review, docs, release notes, ...).
 *
 * These helpers had `gemini-2.0-flash` hard-coded into each request URL. Google
 * retired that model (404 "no longer available"), which broke every helper,
 * including the PR AI Code Review job. Follow the server's default instead (see
 * GEMINI_MODEL in src/config/gemini-config.ts) so the next retirement is a
 * one-line change.
 */
export const CLI_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
