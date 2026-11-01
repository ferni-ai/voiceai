/**
 * The two mood groups the conductor's character policy treats alike.
 */
import type { Mood } from './call-types.js';

/** Upset or in crisis: no delight, no happy faces, haptics softened to softTap. */
export const upsetLike = (mood: Mood): boolean => mood === 'upset' || mood === 'crisis';

/** Tender, upset or in crisis: nothing bounces, grows or teases. */
export const softMood = (mood: Mood): boolean => mood !== 'neutral';
