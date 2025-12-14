#!/usr/bin/env npx tsx
/**
 * Translation/i18n
 * 
 * AI-powered internationalization support.
 * 
 * @module @ferni/cli/translate
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// Colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

// Gemini API
async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// SCAN FOR HARDCODED STRINGS
// =============================================================================

interface HardcodedString {
  file: string;
  line: number;
  text: string;
  context: string;
}

function scanForHardcodedStrings(): HardcodedString[] {
  const results: HardcodedString[] = [];

  // Scan UI files for hardcoded strings
  // Note: We scan for patterns in the code below, not via grep

  // Pattern to find user-facing strings
  const patterns = [
    /textContent\s*=\s*['"]([^'"]+)['"]/g,
    /innerHTML\s*=\s*['"]([^'"]+)['"]/g,
    /title\s*[:=]\s*['"]([^'"]+)['"]/g,
    /placeholder\s*[:=]\s*['"]([^'"]+)['"]/g,
    /label\s*[:=]\s*['"]([^'"]+)['"]/g,
    /aria-label\s*=\s*['"]([^'"]+)['"]/g,
    /toast\.[a-z]+\(['"]([^'"]+)['"]/g,
    /console\.(log|error|warn)\(['"]([^'"]+)['"]/g,
  ];

  const uiDir = join(PROJECT_ROOT, 'frontend-typescript/src/ui');
  if (existsSync(uiDir)) {
    const uiFiles = execSync(`find ${uiDir} -name "*.ts"`, { encoding: 'utf8' }).trim().split('\n');

    for (const file of uiFiles) {
      if (!file) continue;
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, i) => {
        // Skip imports, comments, and technical strings
        if (line.trim().startsWith('import ') || line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        if (line.includes('console.') || line.includes('.log(')) return;

        for (const pattern of patterns) {
          const matches = line.matchAll(pattern);
          for (const match of matches) {
            const text = match[1] || match[2];
            if (text && text.length > 3 && /[a-zA-Z]{3,}/.test(text)) {
              results.push({
                file: file.replace(PROJECT_ROOT + '/', ''),
                line: i + 1,
                text,
                context: line.trim().substring(0, 80),
              });
            }
          }
        }
      });
    }
  }

  return results;
}

async function scan(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔍 Scan for Hardcoded Strings${colors.reset}\n`);

  log.info('Scanning UI files...');
  const strings = scanForHardcodedStrings();

  if (strings.length === 0) {
    log.success('No hardcoded strings found!');
    return;
  }

  console.log(`\n${colors.bold}Found ${strings.length} potential hardcoded strings:${colors.reset}\n`);

  // Group by file
  const byFile: Record<string, HardcodedString[]> = {};
  strings.forEach(s => {
    if (!byFile[s.file]) byFile[s.file] = [];
    byFile[s.file].push(s);
  });

  for (const [file, items] of Object.entries(byFile).slice(0, 10)) {
    console.log(`${colors.cyan}${file}${colors.reset}`);
    items.slice(0, 5).forEach(item => {
      console.log(`  ${colors.dim}L${item.line}:${colors.reset} "${item.text}"`);
    });
    if (items.length > 5) {
      console.log(`  ${colors.dim}... and ${items.length - 5} more${colors.reset}`);
    }
    console.log();
  }

  if (Object.keys(byFile).length > 10) {
    console.log(`${colors.dim}... and ${Object.keys(byFile).length - 10} more files${colors.reset}\n`);
  }
}

// =============================================================================
// GENERATE TRANSLATIONS
// =============================================================================

const TRANSLATE_PROMPT = `You are a professional translator for the Ferni AI platform.

Translate the given strings to the target language while:
1. Preserving Ferni's warm, human brand voice
2. Keeping technical terms where appropriate
3. Maintaining placeholder tokens like {name} or {{count}}
4. Adapting idioms to natural equivalents

Output format: JSON object with original as key, translation as value.
Example: { "Hello": "Hola", "Welcome, {name}": "Bienvenido, {name}" }`;

async function generateTranslations(targetLang: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🌍 Generate Translations${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  // Check if we have a source file
  const i18nDir = join(PROJECT_ROOT, 'frontend-typescript/src/i18n');
  const enPath = join(i18nDir, 'en.json');

  let sourceStrings: Record<string, string> = {};

  if (existsSync(enPath)) {
    sourceStrings = JSON.parse(readFileSync(enPath, 'utf8'));
    log.info(`Found ${Object.keys(sourceStrings).length} strings in en.json`);
  } else {
    // Generate from scan
    log.info('No en.json found, scanning for strings...');
    const scanned = scanForHardcodedStrings();
    scanned.forEach(s => {
      sourceStrings[s.text] = s.text;
    });
  }

  const stringsToTranslate = Object.values(sourceStrings).slice(0, 100); // Limit for API

  log.info(`Translating ${stringsToTranslate.length} strings to ${targetLang}...`);

  try {
    const result = await callGemini(
      `Translate these UI strings to ${targetLang}:\n\n${JSON.stringify(stringsToTranslate, null, 2)}`,
      TRANSLATE_PROMPT
    );

    // Parse result
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const translations = JSON.parse(jsonMatch[0]);

      console.log(`\n${colors.bold}Translations:${colors.reset}\n`);
      Object.entries(translations).slice(0, 10).forEach(([en, trans]) => {
        console.log(`  "${en}"`);
        console.log(`  ${colors.green}→ "${trans}"${colors.reset}\n`);
      });

      // Save
      if (!existsSync(i18nDir)) mkdirSync(i18nDir, { recursive: true });
      
      const targetPath = join(i18nDir, `${targetLang}.json`);
      writeFileSync(targetPath, JSON.stringify(translations, null, 2));
      log.success(`Saved to ${targetPath}`);
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// REVIEW TRANSLATIONS
// =============================================================================

const REVIEW_PROMPT = `You are reviewing translations for Ferni AI's brand voice.

Check for:
1. Brand voice consistency (warm, human, not corporate)
2. Forbidden words (chatbot, user, utilize, leverage, solution, platform)
3. Accuracy and natural flow
4. Placeholder preservation

For each issue:
- Original text
- Current translation
- Problem description
- Suggested fix`;

async function reviewTranslations(lang: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}✅ Review Translations${colors.reset}\n`);

  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  const i18nDir = join(PROJECT_ROOT, 'frontend-typescript/src/i18n');
  const langPath = join(i18nDir, `${lang}.json`);

  if (!existsSync(langPath)) {
    log.error(`Translation file not found: ${lang}.json`);
    return;
  }

  const translations = JSON.parse(readFileSync(langPath, 'utf8'));
  log.info(`Reviewing ${Object.keys(translations).length} translations...`);

  try {
    const review = await callGemini(
      `Review these ${lang} translations for Ferni's brand voice:\n\n${JSON.stringify(translations, null, 2)}`,
      REVIEW_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(review);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleTranslate(args: string[]): Promise<void> {
  const subcommand = args[0] || 'scan';

  switch (subcommand) {
    case 'scan':
      await scan();
      break;
    
    case 'generate':
    case 'gen':
      const targetLang = args[1];
      if (!targetLang) {
        log.error('Usage: ferni translate generate <language>');
        console.log(`\n${colors.dim}Examples: es, fr, de, ja, zh${colors.reset}`);
        return;
      }
      await generateTranslations(targetLang);
      break;
    
    case 'review':
      const lang = args[1];
      if (!lang) {
        log.error('Usage: ferni translate review <language>');
        return;
      }
      await reviewTranslations(lang);
      break;
    
    default:
      console.log(`${colors.bold}Translation Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}scan${colors.reset}       Find hardcoded strings`);
      console.log(`  ${colors.cyan}generate${colors.reset}   AI translate to target language`);
      console.log(`  ${colors.cyan}review${colors.reset}     Review translations for brand voice`);
      console.log();
      console.log(`${colors.dim}Examples:${colors.reset}`);
      console.log(`  ferni translate scan`);
      console.log(`  ferni translate generate es`);
      console.log(`  ferni translate review es`);
  }
}

