/**
 * User Response Gap
 *
 * The pause between the agent finishing a reply and the user starting to
 * answer. lastAgentResponseTime is set when the session commits the reply
 * (after playout, or at the interruption), so subtracting it from the moment
 * the user started speaking gives the gap, excluding the user's own speech.
 *
 * @module voice-agent/user-response-gap
 */

import type { UserData } from '../shared/types.js';

/**
 * How long the user waited after the agent's last reply before speaking (ms).
 * 0 when they started before it finished (an interruption); undefined when
 * either time is unknown.
 */
export function getUserResponseGapMs(
  userData: Pick<UserData, 'lastAgentResponseTime' | 'userSpeakingStartTime'>
): number | undefined {
  const { lastAgentResponseTime, userSpeakingStartTime } = userData;
  if (!lastAgentResponseTime || !userSpeakingStartTime) return undefined;
  return Math.max(0, userSpeakingStartTime - lastAgentResponseTime);
}
