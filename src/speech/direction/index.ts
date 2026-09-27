/**
 * Directed speech: stage directions in code, the character's own words.
 *
 * @module speech/direction
 */

export { acceptLine, CUE_BUDGET_MS, type Cue, type CueUrgency } from './cue.js';
export {
  buildDirection,
  directLine,
  directionMode,
  type DirectedLine,
  type Scene,
} from './director.js';
export { cueSay, directedText, sayInOwnWords, sceneForSession } from './cue-say.js';
