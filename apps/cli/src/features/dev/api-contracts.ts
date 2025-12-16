#!/usr/bin/env npx tsx
/**
 * API Contract Testing
 * 
 * Generate mocks, detect breaking changes, and document APIs.
 * 
 * @module @ferni/cli/api-contracts
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// EXTRACT ENDPOINTS
// =============================================================================

interface Endpoint {
  method: string;
  path: string;
  file: string;
  line: number;
}

function extractEndpoints(): Endpoint[] {
  const endpoints: Endpoint[] = [];
  
  // Scan server files
  const serverFiles = ['ui-server.js', 'token-server.js'];
  
  for (const file of serverFiles) {
    const filePath = join(PROJECT_ROOT, file);
    if (!existsSync(filePath)) continue;
    
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, i) => {
      // Match app.get/post/put/delete patterns
      const match = line.match(/app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (match) {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file,
          line: i + 1,
        });
      }
    });
  }

  return endpoints;
}

// =============================================================================
// GENERATE MOCKS
// =============================================================================

const MOCK_PROMPT = `You are generating mock API responses for testing.

For each endpoint, generate:
1. Success response (200)
2. Error response (400/500)
3. TypeScript types

Output format:
\`\`\`typescript
// types.ts
export interface EndpointResponse {
  // ...
}

// mocks.ts
export const mockEndpoint = {
  success: { /* ... */ },
  error: { /* ... */ },
};
\`\`\`

Use realistic data that matches Ferni's domain (AI coaching, personas, conversations).`;

async function generateMocks(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🎭 Generate API Mocks${colors.reset}\n`);

  const endpoints = extractEndpoints();

  if (endpoints.length === 0) {
    log.warn('No endpoints found');
    return;
  }

  console.log(`${colors.bold}Found ${endpoints.length} endpoints:${colors.reset}\n`);
  endpoints.forEach(e => {
    console.log(`  ${colors.cyan}${e.method.padEnd(6)}${colors.reset} ${e.path}`);
  });

  if (!process.env.GOOGLE_API_KEY) {
    log.warn('Set GOOGLE_API_KEY to generate AI-powered mocks');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(`\n${colors.cyan}Generate mocks for all endpoints? (y/n): ${colors.reset}`, resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'y') return;

  log.info('Generating mocks...');

  try {
    const endpointList = endpoints.map(e => `${e.method} ${e.path}`).join('\n');
    
    const mocks = await callGemini(
      `Generate TypeScript mocks for these API endpoints:\n\n${endpointList}`,
      MOCK_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(mocks);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Save mocks
    const mocksDir = join(PROJECT_ROOT, 'src/__mocks__/api');
    if (!existsSync(mocksDir)) mkdirSync(mocksDir, { recursive: true });

    const mocksPath = join(mocksDir, 'endpoints.ts');
    
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const saveAnswer = await new Promise<string>(resolve => {
      rl2.question(`${colors.cyan}Save to ${mocksPath}? (y/n): ${colors.reset}`, resolve);
    });
    rl2.close();

    if (saveAnswer.toLowerCase() === 'y') {
      writeFileSync(mocksPath, mocks);
      log.success(`Saved to ${mocksPath}`);
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// DIFF API
// =============================================================================

async function diffAPI(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔍 API Diff${colors.reset}\n`);

  // Get current endpoints
  const currentEndpoints = extractEndpoints();

  // Get endpoints from last commit
  log.info('Comparing with last commit...');

  const serverFiles = ['ui-server.js', 'token-server.js'];
  const previousEndpoints: Endpoint[] = [];

  for (const file of serverFiles) {
    try {
      const previousContent = execSync(`git show HEAD~1:${file} 2>/dev/null`, {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      });

      const lines = previousContent.split('\n');
      lines.forEach((line, i) => {
        const match = line.match(/app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
        if (match) {
          previousEndpoints.push({
            method: match[1].toUpperCase(),
            path: match[2],
            file,
            line: i + 1,
          });
        }
      });
    } catch {
      // File didn't exist in previous commit
    }
  }

  // Compare
  const currentSet = new Set(currentEndpoints.map(e => `${e.method} ${e.path}`));
  const previousSet = new Set(previousEndpoints.map(e => `${e.method} ${e.path}`));

  const added = currentEndpoints.filter(e => !previousSet.has(`${e.method} ${e.path}`));
  const removed = previousEndpoints.filter(e => !currentSet.has(`${e.method} ${e.path}`));

  if (added.length === 0 && removed.length === 0) {
    log.success('No API changes detected');
    return;
  }

  if (added.length > 0) {
    console.log(`${colors.green}Added endpoints:${colors.reset}`);
    added.forEach(e => {
      console.log(`  ${colors.green}+${colors.reset} ${e.method} ${e.path}`);
    });
    console.log();
  }

  if (removed.length > 0) {
    console.log(`${colors.red}Removed endpoints (BREAKING):${colors.reset}`);
    removed.forEach(e => {
      console.log(`  ${colors.red}-${colors.reset} ${e.method} ${e.path}`);
    });
    console.log();
    log.error('Breaking changes detected!');
  }
}

// =============================================================================
// GENERATE DOCS
// =============================================================================

const DOCS_PROMPT = `You are generating API documentation in OpenAPI 3.0 format.

For each endpoint, include:
- Summary and description
- Request parameters and body
- Response schemas
- Example requests/responses
- Error responses

Use Ferni's domain context:
- Personas (ferni, peter, alex, maya, jordan, nayan)
- Conversations and sessions
- User authentication
- Subscriptions and billing`;

async function generateDocs(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📚 Generate API Docs${colors.reset}\n`);

  const endpoints = extractEndpoints();

  if (endpoints.length === 0) {
    log.warn('No endpoints found');
    return;
  }

  // Read server files for context
  let serverCode = '';
  for (const file of ['ui-server.js', 'token-server.js']) {
    const filePath = join(PROJECT_ROOT, file);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8');
      // Truncate to reasonable size
      serverCode += `\n// === ${file} ===\n${content.substring(0, 5000)}\n`;
    }
  }

  if (!process.env.GOOGLE_API_KEY) {
    // Manual listing
    console.log(`${colors.bold}Endpoints:${colors.reset}\n`);
    endpoints.forEach(e => {
      console.log(`${colors.cyan}${e.method}${colors.reset} ${e.path}`);
      console.log(`  ${colors.dim}${e.file}:${e.line}${colors.reset}\n`);
    });
    return;
  }

  log.info('Generating OpenAPI documentation...');

  try {
    const docs = await callGemini(
      `Generate OpenAPI 3.0 documentation for these endpoints:\n\nEndpoints:\n${endpoints.map(e => `${e.method} ${e.path}`).join('\n')}\n\nServer code context:\n${serverCode}`,
      DOCS_PROMPT
    );

    console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    console.log(docs);
    console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

    // Save
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`${colors.cyan}Save to docs/api.yaml? (y/n): ${colors.reset}`, resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      const docsDir = join(PROJECT_ROOT, 'docs');
      if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
      writeFileSync(join(docsDir, 'api.yaml'), docs);
      log.success('Saved to docs/api.yaml');
    }
  } catch (error) {
    log.error(`Failed: ${error}`);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleAPIContracts(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'mock':
    case 'mocks':
      await generateMocks();
      break;
    
    case 'diff':
      await diffAPI();
      break;
    
    case 'docs':
      await generateDocs();
      break;
    
    case 'list':
    default:
      const endpoints = extractEndpoints();
      console.log(`\n${colors.bold}${colors.cyan}📡 API Endpoints${colors.reset}\n`);
      
      if (endpoints.length === 0) {
        log.info('No endpoints found');
        return;
      }
      
      endpoints.forEach(e => {
        console.log(`  ${colors.cyan}${e.method.padEnd(6)}${colors.reset} ${e.path} ${colors.dim}(${e.file}:${e.line})${colors.reset}`);
      });
      
      console.log(`\n${colors.dim}Commands: mock, diff, docs${colors.reset}`);
      break;
  }
}

