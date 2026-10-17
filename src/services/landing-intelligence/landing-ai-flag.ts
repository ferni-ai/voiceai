/**
 * LANDING_AI gates every landing-page call to Gemini (demo chat, persona
 * preview, FAQ, hero, hover, sentiment copy and the AI variants in
 * gemini-client). Those routes are public and the demo chat is rate-limited by a
 * client-supplied visitorId, so with the flag off they serve their static
 * fallbacks and never reach the model. Read at call time, so an env change
 * flips it without a code change.
 *
 * @module services/landing-intelligence/landing-ai-flag
 */

import { flagOn } from '../../config/env-flag.js';

export function landingAiEnabled(): boolean {
  return flagOn('LANDING_AI');
}
