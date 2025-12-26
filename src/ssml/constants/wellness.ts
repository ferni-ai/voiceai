/**
 * Wellness & Fitness Pronunciations (Maya's domain)
 *
 * @module ssml/constants/wellness
 */

import type { PronunciationEntry } from './types.js';

export const WELLNESS_PRONUNCIATIONS: PronunciationEntry[] = [
  // -------------------------------------------------------------------------
  // Exercise & Training
  // -------------------------------------------------------------------------
  { pattern: /\bHIIT\b/g, replacement: 'hit training', description: 'High Intensity Interval Training' },
  { pattern: /\bLISS\b/g, replacement: 'liss', description: 'Low Intensity Steady State' },
  { pattern: /\bAMRAP\b/g, replacement: 'am-rap', description: 'As Many Reps As Possible' },
  { pattern: /\bEMOM\b/g, replacement: 'ee-mom', description: 'Every Minute On the Minute' },
  { pattern: /\bWOD\b/g, replacement: 'W O D', description: 'Workout of the Day' },
  { pattern: /\bPR\b(?=\s+(in|for|on))/gi, replacement: 'personal record', description: 'Personal Record' },
  { pattern: /\bPB\b(?=\s+(in|for|on))/gi, replacement: 'personal best', description: 'Personal Best' },

  // -------------------------------------------------------------------------
  // Health Metrics
  // -------------------------------------------------------------------------
  { pattern: /\bBMI\b/g, replacement: 'B M I', description: 'Body Mass Index' },
  { pattern: /\bBMR\b/g, replacement: 'B M R', description: 'Basal Metabolic Rate' },
  { pattern: /\bTDEE\b/g, replacement: 'T D E E', description: 'Total Daily Energy Expenditure' },
  { pattern: /\bVO2\s*max\b/gi, replacement: 'V O two max', description: 'Maximum oxygen uptake' },
  { pattern: /\bHRV\b/g, replacement: 'H R V', description: 'Heart Rate Variability' },
  { pattern: /\bRHR\b/g, replacement: 'resting heart rate', description: 'Resting Heart Rate' },
  { pattern: /\bBPM\b/g, replacement: 'beats per minute', description: 'Beats Per Minute' },

  // -------------------------------------------------------------------------
  // Sleep & Recovery
  // -------------------------------------------------------------------------
  { pattern: /\bREM\b/g, replacement: 'rem', description: 'Rapid Eye Movement sleep' },
  { pattern: /\bNREM\b/g, replacement: 'non-rem', description: 'Non-REM sleep' },

  // -------------------------------------------------------------------------
  // Nutrition
  // -------------------------------------------------------------------------
  { pattern: /\bIF\b(?=\s+(diet|fasting|protocol))/gi, replacement: 'intermittent fasting', description: 'Intermittent Fasting' },
  { pattern: /\bOMAD\b/g, replacement: 'oh-mad', description: 'One Meal A Day' },
  { pattern: /\bCICO\b/g, replacement: 'calories in calories out', description: 'Calories In Calories Out' },
];

