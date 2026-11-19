/**
 * Spanish words as the Spanish readers match them: accents off, lower case, the end of a long turn
 * only. Speech-to-text often drops the accents, so one word list reads "desmayó" and "desmayo".
 *
 * @module utils/fold-spanish
 */
import { flagOn } from '../config/env-flag.js';

/** CRISIS_SPANISH_READERS (#4060): the one switch every Spanish reader and Spanish reply reads. */
export const spanishReadersOn = (): boolean => flagOn('CRISIS_SPANISH_READERS');

/** At most this much of a turn is read, its end: the cut keeps every Spanish read linear. */
const SPANISH_MAX_CHARS = 4000;

/** "Se DESMAYÓ" reads as "se desmayo". */
export const foldSpanish = (text: string): string =>
  text.slice(-SPANISH_MAX_CHARS).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
