/**
 * Common Abbreviations (all personas)
 *
 * @module ssml/constants/common-abbreviations
 */

import type { PronunciationEntry } from './types.js';

export const COMMON_ABBREVIATIONS: PronunciationEntry[] = [
  // -------------------------------------------------------------------------
  // Communication Shortcuts
  // -------------------------------------------------------------------------
  { pattern: /\bASAP\b/gi, replacement: 'A sap', description: 'As Soon As Possible' },
  { pattern: /\bFYI\b/gi, replacement: 'F Y I', description: 'For Your Information' },
  { pattern: /\bFWIW\b/gi, replacement: 'for what its worth', description: 'For What Its Worth' },
  { pattern: /\bIMO\b/g, replacement: 'in my opinion', description: 'In My Opinion' },
  { pattern: /\bIMHO\b/g, replacement: 'in my humble opinion', description: 'In My Humble Opinion' },
  { pattern: /\bBTW\b/gi, replacement: 'by the way', description: 'By The Way' },
  { pattern: /\bFAQ\b/g, replacement: 'F A Q', description: 'Frequently Asked Questions' },
  { pattern: /\bFAQs\b/g, replacement: 'F A Qs', description: 'Frequently Asked Questions' },
  { pattern: /\bAKA\b/gi, replacement: 'also known as', description: 'Also Known As' },
  { pattern: /\ba\.k\.a\./gi, replacement: 'also known as', description: 'Also Known As' },
  { pattern: /\bTL;?DR\b/gi, replacement: 'T L D R', description: 'Too Long Didnt Read' },
  { pattern: /\bDIY\b/g, replacement: 'D I Y', description: 'Do It Yourself' },
  { pattern: /\bN\/A\b/gi, replacement: 'not applicable', description: 'Not Applicable' },
  { pattern: /\bvs\.?\b/gi, replacement: 'versus', description: 'Versus' },
  { pattern: /\bw\/\b/g, replacement: 'with', description: 'With' },
  { pattern: /\bw\/o\b/gi, replacement: 'without', description: 'Without' },

  // -------------------------------------------------------------------------
  // Business Titles
  // -------------------------------------------------------------------------
  { pattern: /\bCEO\b/g, replacement: 'C E O', description: 'Chief Executive Officer' },
  { pattern: /\bCFO\b/g, replacement: 'C F O', description: 'Chief Financial Officer' },
  { pattern: /\bCTO\b/g, replacement: 'C T O', description: 'Chief Technology Officer' },
  { pattern: /\bCOO\b/g, replacement: 'C O O', description: 'Chief Operating Officer' },
  { pattern: /\bCMO\b/g, replacement: 'C M O', description: 'Chief Marketing Officer' },
  { pattern: /\bVP\b/g, replacement: 'V P', description: 'Vice President' },
  { pattern: /\bHR\b/g, replacement: 'H R', description: 'Human Resources' },
  { pattern: /\bPM\b(?!\s*(am|pm))/gi, replacement: 'P M', description: 'Project Manager or Product Manager' },

  // -------------------------------------------------------------------------
  // Countries & Languages
  // -------------------------------------------------------------------------
  { pattern: /\bUS\b/g, replacement: 'U S', description: 'United States' },
  { pattern: /\bUSA\b/g, replacement: 'U S A', description: 'United States of America' },
  { pattern: /\bUK\b/g, replacement: 'U K', description: 'United Kingdom' },
  { pattern: /\bEU\b/g, replacement: 'E U', description: 'European Union' },
  { pattern: /\bUN\b/g, replacement: 'U N', description: 'United Nations' },

  // -------------------------------------------------------------------------
  // Units & Measurements
  // -------------------------------------------------------------------------
  { pattern: /\b(\d+)\s*lbs?\b/gi, replacement: '$1 pounds', description: 'Pounds' },
  { pattern: /\b(\d+)\s*kgs?\b/gi, replacement: '$1 kilograms', description: 'Kilograms' },
  { pattern: /\b(\d+)\s*oz\b/gi, replacement: '$1 ounces', description: 'Ounces' },
  { pattern: /\b(\d+)\s*ft\b/gi, replacement: '$1 feet', description: 'Feet' },
  { pattern: /\b(\d+)\s*mi\b/gi, replacement: '$1 miles', description: 'Miles' },
  { pattern: /\b(\d+)\s*km\b/gi, replacement: '$1 kilometers', description: 'Kilometers' },

  // -------------------------------------------------------------------------
  // Medical & Health
  // -------------------------------------------------------------------------
  { pattern: /\bRx\b/g, replacement: 'prescription', description: 'Prescription' },
  { pattern: /\bOTC\b/g, replacement: 'over the counter', description: 'Over The Counter' },
  { pattern: /\bER\b/g, replacement: 'E R', description: 'Emergency Room' },
  { pattern: /\bICU\b/g, replacement: 'I C U', description: 'Intensive Care Unit' },
  { pattern: /\bMD\b/g, replacement: 'M D', description: 'Medical Doctor' },
  { pattern: /\bPhD\b/g, replacement: 'P H D', description: 'Doctor of Philosophy' },

  // -------------------------------------------------------------------------
  // COVID-related (still relevant)
  // -------------------------------------------------------------------------
  { pattern: /\bCOVID-19\b/gi, replacement: 'covid nineteen', description: 'COVID-19' },
  { pattern: /\bCOVID\b/gi, replacement: 'covid', description: 'COVID' },
  { pattern: /\bPCR\b/g, replacement: 'P C R', description: 'PCR test' },
];

