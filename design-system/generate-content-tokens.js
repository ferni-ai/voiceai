#!/usr/bin/env node
/**
 * Generate Content Tokens
 * 
 * Processes content.json and generates TypeScript utilities for accessing
 * brand-compliant microcopy throughout the application.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load content tokens
const content = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'tokens/content.json'), 'utf8')
);

// Generate TypeScript types and utilities
function generateContentTypes() {
  const output = `/**
 * Ferni Content Tokens
 * Auto-generated from tokens/content.json - DO NOT EDIT DIRECTLY
 * 
 * Usage:
 *   import { CONTENT, getContent, validateCopy } from '@design-system/content';
 *   
 *   // Get content by path
 *   const headline = getContent('empty.firstTime.conversations.headline');
 *   
 *   // Validate copy for banned words
 *   const issues = validateCopy('Welcome to our AI chatbot!');
 */

// ============================================================================
// CONTENT TOKENS
// ============================================================================

export const CONTENT = ${JSON.stringify(content, null, 2)} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ContentPath = 
  | 'loading.app.default'
  | 'loading.app.startup'
  | 'loading.app.connecting'
  | 'loading.app.almostReady'
  | 'loading.persona.thinking'
  | 'loading.persona.processing'
  | 'loading.content.fetching'
  | 'loading.content.saving'
  | 'loading.action.default'
  | 'empty.firstTime.conversations.headline'
  | 'empty.firstTime.conversations.body'
  | 'empty.firstTime.conversations.cta'
  | 'empty.firstTime.team.headline'
  | 'empty.firstTime.team.body'
  | 'empty.firstTime.progress.headline'
  | 'empty.collection.wins.headline'
  | 'empty.collection.boundaries.headline'
  | 'empty.search.noResults.headline'
  | 'empty.search.noResults.body'
  | 'error.connection.temporary.headline'
  | 'error.connection.temporary.body'
  | 'error.connection.failed.headline'
  | 'error.connection.failed.body'
  | 'error.api.generic.headline'
  | 'error.api.generic.body'
  | 'error.validation.email'
  | 'error.validation.password'
  | 'error.validation.required'
  | 'offline.banner'
  | 'offline.backOnline'
  | 'success.saved'
  | 'success.updated'
  | 'success.connected'
  | 'toast.info.newTeamMember'
  | 'toast.success.progressSaved'
  | 'toast.warning.sessionExpiring'
  | 'toast.error.connectionLost'
  | 'celebration.smallWin.messages'
  | 'celebration.bigWin.messages'
  | 'persona.ferni.title'
  | 'persona.ferni.tagline'
  | 'persona.ferni.greeting'
  | 'cta.primary.startConversation'
  | 'cta.primary.continue'
  | 'cta.secondary.learnMore'
  | 'cta.secondary.cancel'
  | 'labels.eyebrows.journey'
  | 'labels.eyebrows.team'
  | 'placeholders.search'
  | 'placeholders.message'
  | 'accessibility.close'
  | 'accessibility.menu'
  | (string & {}); // Allow any string for flexibility

export type PersonaId = 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get content by dot-notation path
 * @param path - Dot-notation path like 'empty.firstTime.conversations.headline'
 * @param interpolations - Object of values to interpolate into the string
 */
export function getContent(
  path: ContentPath,
  interpolations?: Record<string, string | number>
): string {
  const parts = path.split('.');
  let current: any = CONTENT;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      console.warn(\`[Content] Path not found: \${path}\`);
      return path; // Return the path as fallback
    }
  }
  
  if (typeof current !== 'string') {
    console.warn(\`[Content] Path does not resolve to string: \${path}\`);
    return path;
  }
  
  // Handle interpolations like {name} or {countdown}
  if (interpolations) {
    return current.replace(/\\{(\\w+)\\}/g, (match, key) => {
      return key in interpolations ? String(interpolations[key]) : match;
    });
  }
  
  return current;
}

/**
 * Get a random message from an array of messages (for celebrations)
 */
export function getRandomMessage(messages: readonly string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get persona content
 */
export function getPersonaContent(personaId: PersonaId) {
  return CONTENT.persona[personaId] || CONTENT.persona.ferni;
}

/**
 * Get streak message for a given number of days
 */
export function getStreakMessage(days: number): string {
  const streaks = CONTENT.celebration.streak as Record<string, string>;
  
  // Find the closest milestone
  const milestones = [3, 7, 14, 30, 60, 100, 365];
  const milestone = milestones.find(m => m >= days) || 365;
  
  return streaks[String(milestone)] || \`\${days} days!\`;
}

/**
 * Format relative time
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return CONTENT.timeAgo.now;
  if (diffMins === 1) return CONTENT.timeAgo.minute.replace('{n}', '1');
  if (diffMins < 60) return CONTENT.timeAgo.minutes.replace('{n}', String(diffMins));
  if (diffHours === 1) return CONTENT.timeAgo.hour.replace('{n}', '1');
  if (diffHours < 24) return CONTENT.timeAgo.hours.replace('{n}', String(diffHours));
  if (diffDays === 1) return CONTENT.timeAgo.day;
  if (diffDays < 7) return CONTENT.timeAgo.days.replace('{n}', String(diffDays));
  if (diffDays < 14) return CONTENT.timeAgo.week;
  if (diffDays < 30) return CONTENT.timeAgo.weeks.replace('{n}', String(Math.floor(diffDays / 7)));
  if (diffDays < 60) return CONTENT.timeAgo.month;
  return CONTENT.timeAgo.months.replace('{n}', String(Math.floor(diffDays / 30)));
}

// ============================================================================
// BRAND COMPLIANCE
// ============================================================================

export const BANNED_WORDS = ${JSON.stringify(content.voice.bannedWords, null, 2)};

export const BANNED_PHRASES = ${JSON.stringify(content.voice.bannedPhrases, null, 2)};

export interface CopyValidationIssue {
  type: 'banned-word' | 'banned-phrase';
  match: string;
  suggestion?: string;
}

const WORD_SUGGESTIONS: Record<string, string> = {
  'chatbot': 'Ferni, companion',
  'bot': 'Ferni, companion',
  'user': 'you, people',
  'users': 'people, everyone',
  'utilize': 'use',
  'leverage': 'use, with',
  'solution': 'help, support, way',
  'platform': 'Ferni (or omit)',
  'features': 'what makes us different',
  'functionality': 'what it does',
  'therapist': 'coach, mentor, friend',
  'advisor': 'coach, mentor, guide',
  'therapy': 'support, guidance, coaching',
};

/**
 * Validate copy for banned words and phrases
 * @returns Array of issues found, empty if copy is compliant
 */
export function validateCopy(text: string): CopyValidationIssue[] {
  const issues: CopyValidationIssue[] = [];
  const lowerText = text.toLowerCase();
  
  // Check banned phrases first
  for (const phrase of BANNED_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      issues.push({
        type: 'banned-phrase',
        match: phrase,
      });
    }
  }
  
  // Check banned words
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(\`\\\\b\${word}\\\\b\`, 'gi');
    if (regex.test(text)) {
      issues.push({
        type: 'banned-word',
        match: word,
        suggestion: WORD_SUGGESTIONS[word.toLowerCase()],
      });
    }
  }
  
  return issues;
}

/**
 * Check if copy is brand-compliant
 */
export function isBrandCompliant(text: string): boolean {
  return validateCopy(text).length === 0;
}
`;

  return output;
}

// Main execution
console.log('📝 Generating content tokens...');

const outputPath = path.join(__dirname, 'dist/content.ts');
fs.writeFileSync(outputPath, generateContentTypes());

console.log(`✅ Generated: ${outputPath}`);
console.log('');
console.log('Usage:');
console.log('  import { CONTENT, getContent, validateCopy } from "@design-system/content";');
console.log('');

