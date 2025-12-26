/**
 * Calendar & Time Pronunciations (Alex's domain)
 *
 * @module ssml/constants/calendar
 */

import type { PronunciationEntry } from './types.js';

export const CALENDAR_PRONUNCIATIONS: PronunciationEntry[] = [
  // -------------------------------------------------------------------------
  // Quarters
  // -------------------------------------------------------------------------
  { pattern: /\bQ1\b/g, replacement: 'Q one', description: 'First quarter' },
  { pattern: /\bQ2\b/g, replacement: 'Q two', description: 'Second quarter' },
  { pattern: /\bQ3\b/g, replacement: 'Q three', description: 'Third quarter' },
  { pattern: /\bQ4\b/g, replacement: 'Q four', description: 'Fourth quarter' },

  // -------------------------------------------------------------------------
  // Time Zones
  // -------------------------------------------------------------------------
  { pattern: /\bPST\b/g, replacement: 'Pacific time', description: 'Pacific Standard Time' },
  { pattern: /\bPDT\b/g, replacement: 'Pacific time', description: 'Pacific Daylight Time' },
  { pattern: /\bEST\b/g, replacement: 'Eastern time', description: 'Eastern Standard Time' },
  { pattern: /\bEDT\b/g, replacement: 'Eastern time', description: 'Eastern Daylight Time' },
  { pattern: /\bCST\b/g, replacement: 'Central time', description: 'Central Standard Time' },
  { pattern: /\bCDT\b/g, replacement: 'Central time', description: 'Central Daylight Time' },
  { pattern: /\bMST\b/g, replacement: 'Mountain time', description: 'Mountain Standard Time' },
  { pattern: /\bMDT\b/g, replacement: 'Mountain time', description: 'Mountain Daylight Time' },
  { pattern: /\bUTC\b/g, replacement: 'U T C', description: 'Coordinated Universal Time' },
  { pattern: /\bGMT\b/g, replacement: 'G M T', description: 'Greenwich Mean Time' },
  { pattern: /\bJST\b/g, replacement: 'Japan time', description: 'Japan Standard Time' },

  // -------------------------------------------------------------------------
  // Scheduling Abbreviations
  // -------------------------------------------------------------------------
  { pattern: /\bRSVP\b/gi, replacement: 'R S V P', description: 'Please respond' },
  { pattern: /\bEOD\b/g, replacement: 'end of day', description: 'End of Day' },
  { pattern: /\bEOW\b/g, replacement: 'end of week', description: 'End of Week' },
  { pattern: /\bEOM\b/g, replacement: 'end of month', description: 'End of Month' },
  { pattern: /\bEOY\b/g, replacement: 'end of year', description: 'End of Year' },
  { pattern: /\bETA\b/g, replacement: 'E T A', description: 'Estimated Time of Arrival' },
  { pattern: /\bTBD\b/g, replacement: 'T B D', description: 'To Be Determined' },
  { pattern: /\bTBC\b/g, replacement: 'T B C', description: 'To Be Confirmed' },
  { pattern: /\bTBA\b/g, replacement: 'T B A', description: 'To Be Announced' },
  { pattern: /\bOOO\b/g, replacement: 'out of office', description: 'Out of Office' },
  { pattern: /\bWFH\b/g, replacement: 'working from home', description: 'Work From Home' },
  { pattern: /\bPTO\b/g, replacement: 'P T O', description: 'Paid Time Off' },

  // -------------------------------------------------------------------------
  // Life Events (Jordan's domain)
  // -------------------------------------------------------------------------
  { pattern: /\bDOB\b/g, replacement: 'date of birth', description: 'Date of Birth' },
  { pattern: /\bSSN\b/g, replacement: 'social security number', description: 'Social Security Number' },
];

