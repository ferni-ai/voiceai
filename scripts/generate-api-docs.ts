#!/usr/bin/env npx tsx
/**
 * Generate API Documentation
 * 
 * Scans route handlers and generates markdown documentation.
 */

import * as fs from 'fs';
import * as path from 'path';

interface RouteInfo {
  method: string;
  path: string;
  description: string;
  file: string;
  parameters?: string[];
  response?: string;
}

const ROUTES_DIR = path.join(process.cwd(), 'src/api/routes');
const OUTPUT_FILE = path.join(process.cwd(), 'docs/API.md');

// Extract route info from a file
function extractRoutes(filePath: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  
  // Match JSDoc comments followed by function declarations
  const jsdocPattern = /\/\*\*\s*\n([^*]|(\*(?!\/)))*\*\/\s*\n\s*(export\s+)?(async\s+)?function\s+(\w+)/g;
  
  let match;
  while ((match = jsdocPattern.exec(content)) !== null) {
    const jsdoc = match[0];
    const funcName = match[5];
    
    // Extract description from JSDoc
    const descMatch = jsdoc.match(/\*\s+([A-Z][^*@\n]+)/);
    const description = descMatch ? descMatch[1].trim() : '';
    
    // Extract HTTP method and path from comment
    const methodMatch = jsdoc.match(/(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^\s*]+)/);
    if (methodMatch) {
      routes.push({
        method: methodMatch[1],
        path: methodMatch[2],
        description,
        file: fileName,
      });
    }
  }
  
  return routes;
}

// Generate markdown documentation
function generateMarkdown(routes: RouteInfo[]): string {
  // Group routes by file/domain
  const byDomain: Record<string, RouteInfo[]> = {};
  
  routes.forEach(route => {
    const domain = route.file.replace('.ts', '');
    if (!byDomain[domain]) {
      byDomain[domain] = [];
    }
    byDomain[domain].push(route);
  });
  
  let md = `# Ferni API Documentation

Generated automatically from route handlers.

## Table of Contents

`;

  // TOC
  Object.keys(byDomain).sort().forEach(domain => {
    md += `- [${domain.charAt(0).toUpperCase() + domain.slice(1)}](#${domain})\n`;
  });
  
  md += '\n---\n\n';
  
  // Route documentation
  Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b)).forEach(([domain, domainRoutes]) => {
    const title = domain.charAt(0).toUpperCase() + domain.slice(1);
    md += `## ${title}

File: \`src/api/routes/${domain}.ts\`

`;
    
    domainRoutes.forEach(route => {
      md += `### \`${route.method} ${route.path}\`

${route.description || 'No description available.'}

---

`;
    });
  });
  
  md += `
## Authentication

All routes support multiple authentication methods:

1. **API Key**: \`X-API-Key: <your-key>\`
2. **Bearer Token**: \`Authorization: Bearer <jwt>\`
3. **Query Parameter**: \`?user_id=<id>\` (development only)

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request / validation error |
| 401 | Unauthorized |
| 404 | Resource not found |
| 500 | Internal server error |

---

*Last updated: ${new Date().toISOString().split('T')[0]}*
`;
  
  return md;
}

// Main
async function main() {
  console.log('📚 Generating API documentation...\n');
  
  // Check if routes directory exists
  if (!fs.existsSync(ROUTES_DIR)) {
    console.log(`❌ Routes directory not found: ${ROUTES_DIR}`);
    process.exit(1);
  }
  
  // Get all route files
  const files = fs.readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts');
  
  console.log(`Found ${files.length} route files:\n`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log('');
  
  // Extract routes from each file
  const allRoutes: RouteInfo[] = [];
  
  files.forEach(file => {
    const filePath = path.join(ROUTES_DIR, file);
    const routes = extractRoutes(filePath);
    console.log(`  ${file}: ${routes.length} routes`);
    allRoutes.push(...routes);
  });
  
  console.log(`\nTotal: ${allRoutes.length} routes\n`);
  
  // Generate documentation
  const markdown = generateMarkdown(allRoutes);
  
  // Ensure docs directory exists
  const docsDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  // Write documentation
  fs.writeFileSync(OUTPUT_FILE, markdown);
  console.log(`✅ Documentation written to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

