/**
 * Talk to a teammate ("Can I talk to Jordan?") is the call, not a key moment. The write
 * checks are behind TEAMMATE_TALK_FILTER (off: as before); isTalk (read time) is always on.
 * @module intelligence/user-learning-engine/teammate-moment
 */
import { flagOn } from '../../config/env-flag.js';
import * as talk from '../../utils/teammate-talk.js';

const filterOn = (): boolean => flagOn('TEAMMATE_TALK_FILTER');

/** The caller's line without teammate talk ('' when that was all), flag on. */
export const ownWords = (message: string): string =>
  filterOn() ? talk.callerOwnWords(message) : message;

/** Flag on: the line (already ownWords) was only teammate talk, or names one on the call. */
export const saidTo = (message: string, turns: readonly talk.CallTurn[]): boolean =>
  filterOn() && (!message || talk.namesTeammateOnCall(message, turns));

/** A moment from outside the engine is kept unless, flag on, it is teammate talk. */
export const keepsMoment = (m: { summary: string }): boolean =>
  !filterOn() || !talk.isTeammateTalk(m.summary);

/** Read time: a stored moment about going to a teammate. */
export const isTalk = talk.isTeammateTalk;
