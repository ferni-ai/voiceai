#!/usr/bin/env npx tsx
/**
 * AI-Powered Documentation Generation
 * 
 * Generates documentation from code using Gemini.
 * 
 * @module @ferni/cli/docs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { dirname, join, basename } from 'path';
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
  info: (msg: string) => console.log(`${colors.cyan}i${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}v${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}!${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}x${colors.reset} ${msg}`),
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
        generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

const DOC_SYSTEM_PROMPT = `You are Ferni, writing documentation for the Ferni AI codebase.

Style: Clear, concise, human-readable. Use examples. Explain why.

Structure for Module Docs:
# Module Name
Brief description.

## Overview
What this module does.

## Usage
Code example

## API Reference
Functions/classes with params and returns.`;

async function generateModuleDocs(filePath: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}Generate Module Documentation${colors.reset}\n`);

  const fullPath = filePath.startsWith('/') ? filePath : join(PROJECT_ROOT, filePath);
  
  if (!existsSync(fullPath)) {
    log.error(`File not found: ${filePath}`);
    return;
  }

  const content = readFileSync(fullPath, 'utf8');
  const fileName = basename(fullPath);

  log.info(`Analyzing ${fileName}...`);

  try {
    const docs = await callGemini(
      `Generate documentation for this TypeScript module:\n\n${content}`,
      DOC_SYSTEM_PROMPT
    );

    console.log(`\n${colors.dim}${'='.repeat(60)}${colors.reset}`);
    console.log(docs);
    console.log(`${colors.dim}${'='.repeat(60)}${colors.reset}\n`);

    const docPath = fullPath.replace(/\.ts$/, '.md');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Save to ${basename(docPath)}? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      writeFileSync(docPath, docs);
      log.success(`Saved to ${docPath}`);
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

async function generateAPIDocs(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}Generate API Documentation${colors.reset}\n`);

  const routeFiles = ['ui-server.js', 'token-server.js'];
  const existingFiles = routeFiles.filter(f => existsSync(join(PROJECT_ROOT, f)));
  
  if (existingFiles.length === 0) {
    log.warn('No API route files found');
    return;
  }

  log.info(`Found ${existingFiles.length} API file(s)`);

  let combined = '';
  for (const file of existingFiles) {
    const content = readFileSync(join(PROJECT_ROOT, file), 'utf8');
    combined += `\n// === ${file} ===\n${content.substring(0, 5000)}\n`;
  }

  try {
    const docs = await callGemini(
      `Generate API documentation for these route files:\n\n${combined}`,
      DOC_SYSTEM_PROMPT
    );

    console.log(`\n${colors.dim}${'='.repeat(60)}${colors.reset}`);
    console.log(docs);
    console.log(`${colors.dim}${'='.repeat(60)}${colors.reset}\n`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Save to docs/API.md? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      const docsDir = join(PROJECT_ROOT, 'docs');
      if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'API.md'), docs);
      log.success('Saved to docs/API.md');
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

async function generateComponentDocs(componentPath?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}Generate Component Documentation${colors.reset}\n`);

  const uiDir = join(PROJECT_ROOT, 'frontend-typescript/src/ui');
  
  if (!existsSync(uiDir)) {
    log.error('UI directory not found');
    return;
  }

  if (componentPath) {
    const fullPath = componentPath.startsWith('/') ? componentPath : join(PROJECT_ROOT, componentPath);
    const content = readFileSync(fullPath, 'utf8');
    
    const docs = await callGemini(
      `Generate component documentation:\n\n${content}`,
      DOC_SYSTEM_PROMPT
    );

    console.log(docs);
  } else {
    const files = readdirSync(uiDir).filter(f => f.endsWith('.ui.ts'));
    
    console.log(`${colors.bold}UI Components (${files.length}):${colors.reset}\n`);
    files.forEach(f => console.log(`  ${colors.cyan}*${colors.reset} ${f.replace('.ui.ts', '')}`));
    console.log(`\n${colors.dim}Generate docs: ferni docs component path/to/file.ts${colors.reset}`);
  }
}

export async function handleDocs(args: string[]): Promise<void> {
  const subcommand = args[0] || 'help';

  if (!process.env.GOOGLE_API_KEY && ['generate', 'api', 'component'].includes(subcommand)) {
    log.error('GOOGLE_API_KEY not set');
    return;
  }

  switch (subcommand) {
    case 'generate':
    case 'gen':
      const filePath = args[1];
      if (!filePath) {
        log.error('Provide file path: ferni docs generate path/to/file.ts');
        return;
      }
      await generateModuleDocs(filePath);
      break;
    
    case 'api':
      await generateAPIDocs();
      break;
    
    case 'component':
    case 'comp':
      await generateComponentDocs(args[1]);
      break;
    
    default:
      console.log(`${colors.bold}Documentation Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}generate <file>${colors.reset}   Generate docs for a module`);
      console.log(`  ${colors.cyan}api${colors.reset}               Generate API documentation`);
      console.log(`  ${colors.cyan}component${colors.reset}         Generate component docs`);
  }
}

