/**
 * CLI API Command
 *
 * Call and validate Ferni API endpoints.
 *
 * Usage:
 *   ferni api list                           # List all API endpoints
 *   ferni api list --category <category>     # List endpoints in category
 *   ferni api call <method> <path>           # Call an API endpoint
 *   ferni api call GET /api/health           # Example GET call
 *   ferni api call POST /api/contacts --body '{}' # Example POST call
 *   ferni api validate <path>                # Validate an endpoint
 *   ferni api validate --all                 # Validate all endpoints
 */

import { join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import * as http from 'http';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = process.env.FERNI_PROJECT_ROOT || process.cwd();
const API_DIR = join(PROJECT_ROOT, 'src', 'api');

// Default server URL
const DEFAULT_HOST = process.env.API_HOST || 'localhost';
const DEFAULT_PORT = parseInt(process.env.API_PORT || '3002', 10);

// ============================================================================
// COLORS & STYLING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  api: '🌐',
  arrow: '→',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}${icons.info}${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}${icons.success}${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}${icons.warning}${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}${icons.error}${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`  ${colors.dim}${icons.arrow}${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
};

// ============================================================================
// TYPES
// ============================================================================

interface ApiEndpoint {
  method: string;
  path: string;
  description?: string;
  category: string;
  file: string;
}

interface CallResult {
  success: boolean;
  status?: number;
  statusText?: string;
  data?: unknown;
  error?: string;
  duration: number;
}

interface ValidationResult {
  endpoint: string;
  method: string;
  valid: boolean;
  issues: string[];
  response?: CallResult;
}

// ============================================================================
// ENDPOINT DISCOVERY
// ============================================================================

/**
 * Extract endpoints from a route file by parsing comments and code patterns.
 */
function extractEndpointsFromFile(filePath: string): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const fileName = filePath.split('/').pop() || '';
  const category = fileName.replace(/-routes\.ts$/, '').replace(/\.ts$/, '');

  // Pattern 1: Extract from JSDoc comments (Routes: - GET /api/...)
  const routeCommentRegex = /\* - (GET|POST|PUT|DELETE|PATCH) (\/api\/[^\s-]+)(?:\s+-\s+(.+))?/g;
  let match;
  while ((match = routeCommentRegex.exec(content)) !== null) {
    endpoints.push({
      method: match[1],
      path: match[2],
      description: match[3]?.trim(),
      category,
      file: fileName,
    });
  }

  // Pattern 2: Extract from code patterns (if (pathname === '/api/...')
  const codePatternRegex =
    /pathname\s*===?\s*['"`](\/api\/[^'"`]+)['"`]\s*&&\s*req\.method\s*===?\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`]/g;
  while ((match = codePatternRegex.exec(content)) !== null) {
    // Don't add duplicates
    const exists = endpoints.some((e) => e.path === match[1] && e.method === match[2]);
    if (!exists) {
      endpoints.push({
        method: match[2],
        path: match[1],
        category,
        file: fileName,
      });
    }
  }

  // Pattern 3: Alternative code pattern (req.method === 'GET' && pathname.startsWith('/api/...'))
  const altPatternRegex =
    /req\.method\s*===?\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`]\s*&&\s*pathname\s*===?\s*['"`](\/api\/[^'"`]+)['"`]/g;
  while ((match = altPatternRegex.exec(content)) !== null) {
    const exists = endpoints.some((e) => e.path === match[2] && e.method === match[1]);
    if (!exists) {
      endpoints.push({
        method: match[1],
        path: match[2],
        category,
        file: fileName,
      });
    }
  }

  return endpoints;
}

/**
 * Get all API endpoints by scanning route files.
 */
function getAllEndpoints(): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  if (!existsSync(API_DIR)) {
    return endpoints;
  }

  const files = readdirSync(API_DIR);
  for (const file of files) {
    if (!file.endsWith('-routes.ts') && !file.endsWith('.routes.ts')) continue;

    const filePath = join(API_DIR, file);
    const fileEndpoints = extractEndpointsFromFile(filePath);
    endpoints.push(...fileEndpoints);
  }

  // Sort by path then method
  return endpoints.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path);
    if (pathCompare !== 0) return pathCompare;
    return a.method.localeCompare(b.method);
  });
}

/**
 * Get unique categories from endpoints.
 */
function getCategories(endpoints: ApiEndpoint[]): string[] {
  return Array.from(new Set(endpoints.map((e) => e.category))).sort();
}

// ============================================================================
// API LISTING
// ============================================================================

async function listEndpoints(categoryFilter?: string): Promise<void> {
  log.header(`${icons.api} API Endpoints`);

  const allEndpoints = getAllEndpoints();

  if (allEndpoints.length === 0) {
    log.warn('No API endpoints found');
    return;
  }

  const categories = getCategories(allEndpoints);

  if (categoryFilter) {
    // Filter to specific category
    const filtered = allEndpoints.filter((e) => e.category === categoryFilter);

    if (filtered.length === 0) {
      log.error(`No endpoints found in category "${categoryFilter}"`);
      console.log(`\n  Available categories: ${categories.join(', ')}`);
      process.exit(1);
    }

    console.log(`${colors.bold}Category: ${categoryFilter}${colors.reset}`);
    console.log(`  Endpoints: ${filtered.length}`);
    console.log('');

    for (const endpoint of filtered) {
      const methodColor =
        endpoint.method === 'GET'
          ? colors.green
          : endpoint.method === 'POST'
            ? colors.yellow
            : endpoint.method === 'DELETE'
              ? colors.red
              : colors.cyan;

      console.log(`  ${methodColor}${endpoint.method.padEnd(7)}${colors.reset} ${endpoint.path}`);
      if (endpoint.description) {
        console.log(`          ${colors.dim}${endpoint.description}${colors.reset}`);
      }
    }
  } else {
    // Show summary by category
    console.log(`${colors.bold}${categories.length} categories, ${allEndpoints.length} endpoints:${colors.reset}\n`);

    for (const category of categories) {
      const categoryEndpoints = allEndpoints.filter((e) => e.category === category);
      console.log(`  ${colors.cyan}${category.padEnd(30)}${colors.reset} ${categoryEndpoints.length} endpoints`);
    }

    console.log(`\n${colors.bold}Total: ${allEndpoints.length} endpoints${colors.reset}`);
    console.log(`\n  Use ${colors.cyan}ferni api list --category <category>${colors.reset} to see endpoints`);
  }
}

// ============================================================================
// API CALLING
// ============================================================================

async function callEndpoint(
  method: string,
  path: string,
  options: {
    body?: string;
    headers?: Record<string, string>;
    userId?: string;
    host?: string;
    port?: number;
  }
): Promise<CallResult> {
  const startTime = Date.now();
  const host = options.host || DEFAULT_HOST;
  const port = options.port || DEFAULT_PORT;

  return new Promise((resolve) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

      // Add dev mode for local testing
      if (options.userId) {
        headers['X-User-Id'] = options.userId;
        headers['X-Dev-Mode'] = 'true';
      }

      const requestOptions = {
        hostname: host,
        port,
        path,
        method: method.toUpperCase(),
        headers,
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsedData: unknown;
          try {
            parsedData = JSON.parse(data);
          } catch {
            parsedData = data;
          }

          resolve({
            success: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            data: parsedData,
            duration: Date.now() - startTime,
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          duration: Date.now() - startTime,
        });
      });

      if (options.body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        req.write(options.body);
      }

      req.end();
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
    }
  });
}

async function handleCall(args: string[]): Promise<void> {
  // Parse arguments
  const method = args[0]?.toUpperCase();
  const path = args[1];

  if (!method || !path) {
    log.error('Missing method or path');
    console.log(`\n  Usage: ${colors.cyan}ferni api call <METHOD> <PATH> [options]${colors.reset}`);
    console.log(`\n  Examples:`);
    console.log(`    ferni api call GET /api/health`);
    console.log(`    ferni api call POST /api/contacts --body '{"name": "Test"}'`);
    console.log(`    ferni api call GET /api/contacts --userId test-user`);
    process.exit(1);
  }

  // Parse options
  let body: string | undefined;
  let userId = 'cli-test-user';
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--body' && args[i + 1]) {
      body = args[i + 1];
      i++;
    } else if (args[i] === '--userId' && args[i + 1]) {
      userId = args[i + 1];
      i++;
    } else if (args[i] === '--host' && args[i + 1]) {
      host = args[i + 1];
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }

  log.header(`${icons.api} API Call: ${method} ${path}`);

  log.info(`Method: ${method}`);
  log.info(`Path: ${path}`);
  log.info(`Host: ${host}:${port}`);
  log.info(`User: ${userId}`);
  if (body) {
    log.info(`Body: ${body}`);
  }
  console.log('');

  const result = await callEndpoint(method, path, { body, userId, host, port });

  if (result.success) {
    log.success(`${result.status} ${result.statusText} (${result.duration}ms)`);
    console.log('\n' + colors.bold + 'Response:' + colors.reset);
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    if (result.status) {
      log.error(`${result.status} ${result.statusText} (${result.duration}ms)`);
      console.log('\n' + colors.bold + 'Response:' + colors.reset);
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      log.error(`Connection failed: ${result.error}`);
    }
    process.exit(1);
  }
}

// ============================================================================
// API VALIDATION
// ============================================================================

async function validateEndpoint(
  endpoint: ApiEndpoint,
  options: { userId?: string; host?: string; port?: number }
): Promise<ValidationResult> {
  const issues: string[] = [];

  // Basic structure validation
  if (!endpoint.path.startsWith('/api/')) {
    issues.push('Path should start with /api/');
  }

  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(endpoint.method)) {
    issues.push(`Invalid method: ${endpoint.method}`);
  }

  // Try to call the endpoint (for GET endpoints only to avoid side effects)
  let response: CallResult | undefined;
  if (endpoint.method === 'GET') {
    response = await callEndpoint(endpoint.method, endpoint.path, {
      userId: options.userId || 'cli-test-user',
      host: options.host,
      port: options.port,
    });

    // Check for common error responses
    if (!response.success && response.status !== 404 && response.status !== 401) {
      issues.push(`Endpoint returned ${response.status}: ${JSON.stringify(response.data)}`);
    }
  }

  return {
    endpoint: endpoint.path,
    method: endpoint.method,
    valid: issues.length === 0,
    issues,
    response,
  };
}

async function handleValidate(args: string[]): Promise<void> {
  log.header(`${icons.success} API Validation`);

  // Parse options
  let pathFilter: string | undefined;
  let categoryFilter: string | undefined;
  let validateAll = false;
  let verbose = false;
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;
  let userId = 'cli-test-user';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') {
      validateAll = true;
    } else if (args[i] === '--category' && args[i + 1]) {
      categoryFilter = args[i + 1];
      i++;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    } else if (args[i] === '--host' && args[i + 1]) {
      host = args[i + 1];
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--userId' && args[i + 1]) {
      userId = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      pathFilter = args[i];
    }
  }

  if (!pathFilter && !categoryFilter && !validateAll) {
    log.error('Specify a path, --category, or --all');
    console.log(`\n  Usage:`);
    console.log(`    ${colors.cyan}ferni api validate /api/contacts${colors.reset}     # Single endpoint`);
    console.log(`    ${colors.cyan}ferni api validate --category contacts${colors.reset} # All in category`);
    console.log(`    ${colors.cyan}ferni api validate --all${colors.reset}               # All endpoints`);
    process.exit(1);
  }

  // Get endpoints to validate
  const allEndpoints = getAllEndpoints();
  let endpointsToValidate: ApiEndpoint[];

  if (pathFilter) {
    endpointsToValidate = allEndpoints.filter((e) => e.path === pathFilter);
    if (endpointsToValidate.length === 0) {
      log.error(`No endpoint found matching: ${pathFilter}`);
      process.exit(1);
    }
  } else if (categoryFilter) {
    endpointsToValidate = allEndpoints.filter((e) => e.category === categoryFilter);
    if (endpointsToValidate.length === 0) {
      log.error(`No endpoints found in category: ${categoryFilter}`);
      process.exit(1);
    }
  } else {
    endpointsToValidate = allEndpoints;
  }

  log.info(`Validating ${endpointsToValidate.length} endpoint(s)`);
  console.log('');

  const results: ValidationResult[] = [];

  for (const endpoint of endpointsToValidate) {
    const result = await validateEndpoint(endpoint, { userId, host, port });
    results.push(result);

    if (verbose || !result.valid) {
      if (result.valid) {
        console.log(
          `  ${colors.green}${icons.success}${colors.reset} ${endpoint.method} ${endpoint.path}`
        );
      } else {
        console.log(
          `  ${colors.red}${icons.error}${colors.reset} ${endpoint.method} ${endpoint.path}`
        );
        for (const issue of result.issues) {
          console.log(`      ${colors.dim}${issue}${colors.reset}`);
        }
      }
    }
  }

  // Summary
  const passed = results.filter((r) => r.valid);
  const failed = results.filter((r) => !r.valid);

  console.log('');
  console.log(
    `${colors.bold}Results: ${passed.length} passed, ${failed.length} failed${colors.reset}`
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleApi(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'list': {
      let category: string | undefined;
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--category' && subArgs[i + 1]) {
          category = subArgs[i + 1];
          break;
        }
      }
      await listEndpoints(category);
      break;
    }

    case 'call':
      await handleCall(subArgs);
      break;

    case 'validate':
      await handleValidate(subArgs);
      break;

    default:
      log.error(`Unknown subcommand: ${subcommand}`);
      console.log(`\n  Available subcommands:`);
      console.log(`    ${colors.cyan}list${colors.reset}      List API endpoints`);
      console.log(`    ${colors.cyan}call${colors.reset}      Call an API endpoint`);
      console.log(`    ${colors.cyan}validate${colors.reset}  Validate endpoints`);
      console.log(`\n  Examples:`);
      console.log(`    ferni api list --category contacts`);
      console.log(`    ferni api call GET /api/health`);
      console.log(`    ferni api call POST /api/contacts --body '{"name": "Test"}'`);
      console.log(`    ferni api validate --all`);
      process.exit(1);
  }
}
