/**
 * The Financial Legends landing page: Henry Caldwell and Nate Holloway
 * (fictional characters inspired by investing philosophies; ids john-bogle,
 * joel-dickson). Data only, so a test can render it without deploying
 * (deploy-financial-legends.ts deploys it).
 *
 * @module scripts/financial-legends-page
 */

import type { MultiAdvisorPageConfig } from '../src/services/page-generator/index.js';

export const FINANCIAL_LEGENDS_PAGE: MultiAdvisorPageConfig = {
  title: 'Financial Legends',
  description:
    'Two fictional mentors, each inspired by a great investing philosophy, ready to guide your financial journey.',

  advisors: [
    {
      id: 'john-bogle',
      name: 'Henry Caldwell',
      initials: 'HC',
      tagline: 'The Index Investor',
      description:
        'Inspired by index investing. Champion of low-cost, long-term investing for everyday investors.',
      color: '#8b0000', // Deep red
      icon: '🏛️',
      voiceId: 'ed82c17b-4704-4d34-be43-5d19065acdf1', // Cartesia stock voice "Carl - Steady Storyteller"
    },
    {
      id: 'joel-dickson',
      name: 'Nate Holloway',
      initials: 'NH',
      tagline: 'The Life Mentor',
      description:
        'Inspired by evidence-based planning and behavioral coaching. Helps navigate life decisions, career changes, and finding purpose.',
      color: '#96151D', // Burgundy
      icon: '🧭',
      voiceId: 'bbee10a8-4f08-4c5c-8282-e69299115055', // Cartesia stock voice "Ben - Helpful Man"
    },
  ],

  brand: {
    primary: '#1a365d', // Deep financial blue
    secondary: '#2c5282',
  },

  theme: 'zen',

  deployment: {
    environment: 'production',
  },

  seo: {
    title: 'Financial Legends - Investment Wisdom, Two Philosophies',
    description:
      'Get personalized guidance from Henry and Nate: fictional mentors inspired by index investing and behavioral coaching.',
    twitterCard: 'summary_large_image',
  },
};
