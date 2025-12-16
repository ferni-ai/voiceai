#!/usr/bin/env npx tsx
/**
 * Security Scanning
 * 
 * Scans for security vulnerabilities, leaked secrets, and dependency issues.
 * 
 * @module @ferni/cli/security
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

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
// SECRET PATTERNS
// =============================================================================

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', pattern: /[0-9a-zA-Z/+]{40}/ },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'GitHub Token', pattern: /ghp_[0-9a-zA-Z]{36}/ },
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'Bearer Token', pattern: /Bearer [a-zA-Z0-9_-]{20,}/ },
  { name: 'Basic Auth', pattern: /Basic [a-zA-Z0-9+/=]{20,}/ },
  { name: 'Password in URL', pattern: /:\/\/[^:]+:[^@]+@/ },
  { name: 'Stripe Key', pattern: /sk_(?:live|test)_[0-9a-zA-Z]{24,}/ },
  { name: 'SendGrid Key', pattern: /SG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}/ },
  { name: 'Firebase Key', pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ },
];

// =============================================================================
// SECRET SCANNING
// =============================================================================

async function scanSecrets(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔐 Secret Scanning${colors.reset}\n`);

  const ignorePatterns = [
    'node_modules',
    '.git',
    'dist',
    '.env.example',
    '*.md',
    'package-lock.json',
    'pnpm-lock.yaml',
  ];

  log.info('Scanning for leaked secrets...');

  const findings: { file: string; line: number; type: string; match: string }[] = [];

  // Scan TypeScript/JavaScript files
  const extensions = ['ts', 'tsx', 'js', 'jsx', 'json'];
  
  for (const ext of extensions) {
    try {
      const files = execSync(
        `find . -name "*.${ext}" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*"`,
        { encoding: 'utf8', cwd: PROJECT_ROOT }
      ).trim().split('\n').filter(Boolean);

      for (const file of files) {
        const content = readFileSync(join(PROJECT_ROOT, file), 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Skip comments and .env references
          if (line.trim().startsWith('//') || line.includes('process.env')) continue;

          for (const { name, pattern } of SECRET_PATTERNS) {
            if (pattern.test(line)) {
              // Don't include actual secret in output
              const match = line.match(pattern)?.[0] || '';
              const masked = match.length > 8 
                ? match.substring(0, 4) + '...' + match.substring(match.length - 4)
                : '***';
              
              findings.push({
                file: file,
                line: i + 1,
                type: name,
                match: masked,
              });
            }
          }
        }
      }
    } catch {
      // File scan failed
    }
  }

  if (findings.length === 0) {
    log.success('No leaked secrets found!');
  } else {
    log.error(`Found ${findings.length} potential secret(s):\n`);
    
    for (const finding of findings) {
      console.log(`  ${colors.red}⚠${colors.reset} ${finding.file}:${finding.line}`);
      console.log(`    ${colors.dim}Type: ${finding.type}${colors.reset}`);
      console.log(`    ${colors.dim}Match: ${finding.match}${colors.reset}`);
      console.log();
    }
  }
}

// =============================================================================
// DEPENDENCY AUDIT
// =============================================================================

async function auditDependencies(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📦 Dependency Audit${colors.reset}\n`);

  log.info('Checking for vulnerable dependencies...');

  try {
    const result = spawnSync('npm', ['audit', '--json'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (result.stdout) {
      const audit = JSON.parse(result.stdout);
      
      const summary = audit.metadata?.vulnerabilities || {};
      const total = Object.values(summary).reduce((a: number, b: any) => a + (b || 0), 0);

      if (total === 0) {
        log.success('No known vulnerabilities!');
        return;
      }

      console.log(`${colors.bold}Vulnerabilities found:${colors.reset}\n`);
      
      if (summary.critical > 0) {
        console.log(`  ${colors.red}Critical: ${summary.critical}${colors.reset}`);
      }
      if (summary.high > 0) {
        console.log(`  ${colors.red}High: ${summary.high}${colors.reset}`);
      }
      if (summary.moderate > 0) {
        console.log(`  ${colors.yellow}Moderate: ${summary.moderate}${colors.reset}`);
      }
      if (summary.low > 0) {
        console.log(`  ${colors.dim}Low: ${summary.low}${colors.reset}`);
      }

      console.log(`\n${colors.dim}Run 'npm audit fix' to auto-fix where possible${colors.reset}`);
    }
  } catch (error) {
    log.warn('Audit failed. Running basic check...');
    execSync('npm audit', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }
}

// =============================================================================
// SECURITY HEADERS CHECK
// =============================================================================

async function checkSecurityHeaders(url?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔒 Security Headers Check${colors.reset}\n`);

  const targetUrl = url || 'https://app.ferni.ai';
  
  log.info(`Checking ${targetUrl}...`);

  const requiredHeaders = [
    { name: 'Content-Security-Policy', required: true },
    { name: 'X-Frame-Options', required: true },
    { name: 'X-Content-Type-Options', required: true },
    { name: 'Strict-Transport-Security', required: true },
    { name: 'X-XSS-Protection', required: false }, // Deprecated but nice to have
    { name: 'Referrer-Policy', required: true },
    { name: 'Permissions-Policy', required: false },
  ];

  try {
    const result = execSync(`curl -sI "${targetUrl}"`, { encoding: 'utf8' });
    const headers = result.toLowerCase();

    console.log(`${colors.bold}Security Headers:${colors.reset}\n`);

    let issues = 0;
    for (const { name, required } of requiredHeaders) {
      const present = headers.includes(name.toLowerCase());
      const status = present 
        ? `${colors.green}✓${colors.reset}`
        : required 
          ? `${colors.red}✗${colors.reset}`
          : `${colors.yellow}○${colors.reset}`;
      
      console.log(`  ${status} ${name}`);
      
      if (!present && required) issues++;
    }

    console.log();
    if (issues === 0) {
      log.success('All required security headers present!');
    } else {
      log.error(`Missing ${issues} required header(s)`);
    }
  } catch (error) {
    log.error(`Failed to check: ${error}`);
  }
}

// =============================================================================
// FULL SECURITY SCAN
// =============================================================================

async function fullScan(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🛡️  Full Security Scan${colors.reset}`);
  console.log(`${'═'.repeat(50)}\n`);

  await scanSecrets();
  await auditDependencies();
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`${colors.bold}Scan Complete${colors.reset}\n`);
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleSecurity(args: string[]): Promise<void> {
  const subcommand = args[0] || 'scan';

  switch (subcommand) {
    case 'scan':
    case 'full':
      await fullScan();
      break;
    
    case 'secrets':
      await scanSecrets();
      break;
    
    case 'deps':
    case 'audit':
      await auditDependencies();
      break;
    
    case 'headers':
      await checkSecurityHeaders(args[1]);
      break;
    
    default:
      console.log(`${colors.bold}Security Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}scan${colors.reset}      Full security scan`);
      console.log(`  ${colors.cyan}secrets${colors.reset}   Scan for leaked secrets`);
      console.log(`  ${colors.cyan}deps${colors.reset}      Audit dependencies`);
      console.log(`  ${colors.cyan}headers${colors.reset}   Check security headers`);
  }
}

