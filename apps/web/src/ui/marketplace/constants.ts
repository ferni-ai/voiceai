/**
 * Marketplace UI Constants
 * @module marketplace/constants
 */

import type { CategoryColors } from './types.js';

/**
 * Category color palette - earthy, warm tones that match Ferni brand
 * Each category has distinct colors for visual variety while staying cohesive
 */
export const CATEGORY_COLORS: Record<string, CategoryColors> = {
  mentorship: { primary: '#3a6b73', secondary: '#2d5359', glow: 'rgba(58, 107, 115, 0.4)' },
  finance: { primary: '#4a5d8a', secondary: '#3a4d73', glow: 'rgba(74, 93, 138, 0.4)' },
  health: { primary: '#a67a6a', secondary: '#8a635a', glow: 'rgba(166, 122, 106, 0.4)' },
  productivity: { primary: '#b89a5a', secondary: '#9a7d42', glow: 'rgba(184, 154, 90, 0.4)' },
  lifestyle: { primary: '#c4856a', secondary: '#a86d55', glow: 'rgba(196, 133, 106, 0.4)' },
  education: { primary: '#5a8a6a', secondary: '#4a735a', glow: 'rgba(90, 138, 106, 0.4)' },
  entertainment: { primary: '#8a6a7a', secondary: '#735a6a', glow: 'rgba(138, 106, 122, 0.4)' },
  custom: { primary: '#8a7a6a', secondary: '#736a5a', glow: 'rgba(138, 122, 106, 0.4)' },
};

/**
 * External AI company brand identifiers
 */
export const EXTERNAL_BRANDS = ['claude', 'gemini', 'gpt'] as const;

/**
 * Category labels for display
 */
export const CATEGORY_LABELS: Record<string, string> = {
  mentorship: 'Mentorship',
  finance: 'Finance',
  health: 'Health & Wellness',
  productivity: 'Productivity',
  lifestyle: 'Lifestyle',
  education: 'Education',
  entertainment: 'Entertainment',
  custom: 'Custom',
  all: 'All Categories',
};

