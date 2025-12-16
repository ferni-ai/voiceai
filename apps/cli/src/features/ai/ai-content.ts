#!/usr/bin/env npx tsx
/**
 * AI-Powered Content Generation
 * 
 * Generates UI copy in Ferni's brand voice.
 * 
 * @module @ferni/cli/ai-content
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================================================
// COLORS
// =============================================================================

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

// =============================================================================
// GEMINI API
// =============================================================================

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
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// BRAND VOICE
// =============================================================================

const BRAND_VOICE_PROMPT = `You are Ferni, writing UI copy for the Ferni AI platform.

## Brand Voice
- **Warm**: Like a trusted friend, not a cold machine
- **Grounded**: Calm, stable, reliable
- **Wise**: Thoughtful guidance without judgment
- **Present**: Fully attentive
- **Human**: Natural, organic, approachable

## Forbidden Words (NEVER use)
- chatbot, bot, AI assistant, virtual assistant
- user/users (say "you" or "people")
- utilize (say "use")
- leverage (say "use")
- solution, platform, functionality

## Copy Patterns
- Greetings: "Hey.", "Hello.", "Good to see you."
- Acknowledgments: "I hear that.", "That makes sense."
- Encouragements: "You've got this.", "That took courage."
- Errors: Soft, helpful, never alarming

## Rules
1. Be concise - every word earns its place
2. Sound spoken aloud - natural, not written
3. Show empathy - "That's a lot to carry"
4. No corporate speak - ever
5. Maximum 2 sentences for most UI text`;

// =============================================================================
// CONTENT TYPES
// =============================================================================

const CONTENT_TEMPLATES: Record<string, string> = {
  error: `Generate an error message for: {context}
Requirements: Soft, not alarming. Offer help. Max 2 sentences.`,
  
  empty: `Generate empty state copy for: {context}
Requirements: Warm, encouraging. Suggest next action. Max 2 sentences.`,
  
  loading: `Generate loading text for: {context}
Requirements: Brief, calming. Optional humor if appropriate. Max 5 words.`,
  
  success: `Generate success message for: {context}
Requirements: Celebratory but not over-the-top. Max 1 sentence.`,
  
  toast: `Generate toast notification for: {context}
Requirements: Ultra-brief. Max 4 words.`,
  
  button: `Generate button text for: {context}
Requirements: Action-oriented. Max 3 words. Not generic like "Submit".`,
  
  heading: `Generate heading for: {context}
Requirements: Warm, clear. Max 5 words.`,
  
  description: `Generate description for: {context}
Requirements: Informative, human. Max 2 sentences.`,
  
  onboarding: `Generate onboarding step text for: {context}
Requirements: Welcoming, clear instructions. Max 2 sentences.`,
  
  placeholder: `Generate placeholder text for: {context}
Requirements: Helpful hint. Max 5 words.`,
};

// =============================================================================
// FUNCTIONS
// =============================================================================

async function generateContent(type: string, context: string): Promise<void> {
  const template = CONTENT_TEMPLATES[type];
  
  if (!template) {
    log.error(`Unknown content type: ${type}`);
    console.log(`\nAvailable types: ${Object.keys(CONTENT_TEMPLATES).join(', ')}`);
    return;
  }

  const prompt = template.replace('{context}', context);
  
  try {
    log.info('Generating content...');
    const content = await callGemini(prompt, BRAND_VOICE_PROMPT);
    
    console.log(`\n${colors.bold}Generated ${type}:${colors.reset}\n`);
    console.log(`  ${colors.green}"${content.trim()}"${colors.reset}\n`);
    
    // Copy to clipboard
    try {
      const { execSync } = await import('child_process');
      execSync(`echo "${content.trim().replace(/"/g, '\\"')}" | pbcopy`);
      log.success('Copied to clipboard!');
    } catch {
      // Clipboard failed
    }
    
    // Offer alternatives
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Generate alternatives? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      console.log(`\n${colors.bold}Alternatives:${colors.reset}\n`);
      for (let i = 0; i < 3; i++) {
        const alt = await callGemini(prompt + '\n\nGenerate a DIFFERENT variation.', BRAND_VOICE_PROMPT);
        console.log(`  ${i + 1}. ${colors.dim}"${alt.trim()}"${colors.reset}`);
      }
      console.log();
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

async function checkCopy(text: string): Promise<void> {
  const CHECK_PROMPT = `Analyze this UI copy for Ferni brand voice compliance:

"${text}"

Check for:
1. Forbidden words (chatbot, user, utilize, leverage, solution, platform)
2. Corporate/cold language
3. Overly long text
4. Unclear meaning

Output:
- ✅ Pass or ❌ Fail
- Issues found (if any)
- Suggested improvement (if needed)`;

  try {
    log.info('Checking copy...');
    const result = await callGemini(CHECK_PROMPT, BRAND_VOICE_PROMPT);
    
    console.log(`\n${colors.dim}${'─'.repeat(50)}${colors.reset}`);
    console.log(result);
    console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}\n`);
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

async function interactiveMode(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt: string) => new Promise<string>(resolve => rl.question(prompt, resolve));

  console.log(`
${colors.bold}${colors.cyan}✍️  Ferni Content Generator${colors.reset}

I'll help you write UI copy in our brand voice.
`);

  console.log(`${colors.bold}Content types:${colors.reset}`);
  Object.keys(CONTENT_TEMPLATES).forEach(type => {
    console.log(`  ${colors.cyan}${type}${colors.reset}`);
  });
  console.log();

  const type = await question(`${colors.cyan}Type (or 'check' to validate existing copy): ${colors.reset}`);
  
  if (type === 'check') {
    const text = await question(`${colors.cyan}Paste the copy to check: ${colors.reset}`);
    await checkCopy(text);
  } else {
    const context = await question(`${colors.cyan}Describe what you need: ${colors.reset}`);
    await generateContent(type, context);
  }

  rl.close();
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleAIContent(args: string[]): Promise<void> {
  if (!process.env.GOOGLE_API_KEY) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  const subcommand = args[0];
  
  if (!subcommand) {
    await interactiveMode();
    return;
  }

  if (subcommand === 'check') {
    const text = args.slice(1).join(' ');
    if (!text) {
      log.error('Provide text to check: ferni copy check "your text here"');
      return;
    }
    await checkCopy(text);
    return;
  }

  // Generate specific type
  const context = args.slice(1).join(' ');
  if (!context) {
    log.error(`Provide context: ferni copy ${subcommand} "description of what you need"`);
    return;
  }
  
  await generateContent(subcommand, context);
}

