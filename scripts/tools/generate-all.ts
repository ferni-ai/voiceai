/**
 * Tool Schema Generator (All)
 *
 * Runs all generators in sequence:
 * 1. Validates all schemas
 * 2. Generates markdown documentation
 * 3. Generates Gemini declarations
 *
 * Run: pnpm tools:generate
 *
 * Options:
 *   --check    Check if all generated files are up to date (exits 1 if not)
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const checkMode = args.includes('--check');

interface ScriptConfig {
  name: string;
  script: string;
}

const scripts: ScriptConfig[] = [
  { name: 'Validation', script: 'validate-tool-schemas.ts' },
  { name: 'Markdown', script: 'generate-markdown-docs.ts' },
  { name: 'Declarations', script: 'generate-gemini-declarations.ts' },
];

async function runScript(config: ScriptConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const scriptPath = join(__dirname, config.script);
    const args = checkMode ? ['--check'] : [];
    
    console.log(`\n[${config.name}] Running...`);
    
    const child = spawn('npx', ['tsx', scriptPath, ...args], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[${config.name}] Done`);
        resolve(true);
      } else {
        console.error(`[${config.name}] Failed with code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (error) => {
      console.error(`[${config.name}] Error: ${error.message}`);
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Tool Schema Generator');
  console.log(checkMode ? 'Mode: CHECK' : 'Mode: GENERATE');
  console.log('='.repeat(60));

  let allPassed = true;

  for (const script of scripts) {
    const passed = await runScript(script);
    if (!passed) {
      allPassed = false;
      if (checkMode) {
        // In check mode, continue to report all failures
        continue;
      } else {
        // In generate mode, stop on first failure
        process.exit(1);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  
  if (allPassed) {
    console.log(checkMode ? 'All checks PASSED' : 'All generators COMPLETED');
    process.exit(0);
  } else {
    console.log('Some checks FAILED');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
