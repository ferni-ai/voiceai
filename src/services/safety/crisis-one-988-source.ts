/**
 * CRISIS_ONE_988_SOURCE (off by default): the prompt builders that tell the model which crisis
 * line to give name the line the shared policy picks, not their own "always mention 988".
 *
 * Three builders named 988 on their own: the transfer awareness context (human-transfer), the
 * safety injection's resource line (safety-coaching-builders) and the first-aid voice
 * instructions (emotional-first-aid). With the flag on, each names the line guideLineOf picks for
 * the caller's last line, in the words the guided-line floor says (lineWordsOf):
 * - the caller's own crisis: 988;
 * - the caller's own imminent read: 911, then 988;
 * - someone the caller is worried about: the for-them 988 line;
 * - an emergency for someone else: 911 for them, and no 988 (owner, 2026-11-02);
 *
 * Spanish for someone else has no line in the policy only because main has no Spanish for-them
 * wording: who and how urgently still come from guideLineOf (read as English), and the model is
 * asked to give that line in the caller's language, so no 988 or 911 is lost.
 *
 * Where the patterns read no crisis in the caller's last line (a builder's own detector fired on
 * words the crisis guard doesn't read), the policy has nothing to say and the site keeps its own
 * line. A line that doesn't name 988 (the abuse, elder or substance lines) is not 988's to
 * replace and stays. Off: every site says what it said before, byte for byte.
 *
 * @module CrisisOne988Source
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { detectCrisis } from './crisis-guard.js';
import { guideLineOf, lineWordsOf } from './crisis-guided-line-floor.js';
import { names988 } from './crisis-line-speech.js';

/** Whether the prompt builders take their crisis line from the shared policy. */
const oneLineSource = (env: Env = process.env): boolean => flagOn('CRISIS_ONE_988_SOURCE', env);

/**
 * The instruction naming the policy's line for the caller's last line, or null when the
 * patterns read no crisis in it: the policy speaks only to a crisis read.
 */
function lineInstruction(latest: string): string | null {
  const read = detectCrisis(latest);
  if (!read.isCrisis) return null;
  const own = guideLineOf(read, false, latest);
  const line = own ?? guideLineOf({ ...read, language: 'en' });
  if (!line) return null;
  const words = lineWordsOf(line).map((said) => `"${said.replace(/\s+/g, ' ')}"`);
  const give = `${own ? 'Line to give' : "Line to give, in the caller's language"}: ${words.join(' Then: ')}`;
  return line.who === 'them' && line.urgent
    ? `${give} This is an emergency for someone else: give 911 only, not the crisis line.`
    : give;
}

/**
 * The crisis-line sentence a builder adds: the shared policy's line for `latest`, after `bullet`,
 * when the flag is on, `said` names 988 and the patterns read a crisis in `latest`; otherwise
 * `said` itself.
 */
export function crisisLineFor(
  said: string,
  latest: string,
  bullet = '',
  env: Env = process.env
): string {
  const instruction = oneLineSource(env) && names988(said) ? lineInstruction(latest) : null;
  return instruction === null ? said : `${bullet}${instruction}`;
}
