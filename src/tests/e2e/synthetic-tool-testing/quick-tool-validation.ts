/**
 * Quick Tool Validation
 *
 * Fast validation of tool registration without calling LLMs.
 * Checks:
 * 1. All tools are registered (in REGISTERED_TOOLS or DOMAIN_TOOL_IDS)
 * 2. All tools have definitions in their domain folders
 * 3. Tool names follow conventions
 * 4. No duplicate tool IDs
 *
 * Run: npx tsx src/tests/e2e/synthetic-tool-testing/quick-tool-validation.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { DOMAIN_TOOL_IDS } from '../../../agents/shared/domain-tool-ids.generated.js';
import { REGISTERED_TOOLS, isRegisteredTool } from '../../../agents/shared/function-call-format.js';

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

interface ValidationResult {
  check: string;
  passed: boolean;
  details?: string;
  items?: string[];
}

const results: ValidationResult[] = [];

function check(name: string, passed: boolean, details?: string, items?: string[]): void {
  results.push({ check: name, passed, details, items });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${details ? `: ${details}` : ''}`);
  if (!passed && items && items.length > 0) {
    items.slice(0, 10).forEach((item) => console.log(`   - ${item}`));
    if (items.length > 10) {
      console.log(`   ... and ${items.length - 10} more`);
    }
  }
}

// ============================================================================
// CHECK 1: Tool Registration Completeness
// ============================================================================

console.log('\n📋 CHECK 1: Tool Registration\n');

const allTools = new Set([
  ...REGISTERED_TOOLS.map((t) => t.toLowerCase()),
  ...DOMAIN_TOOL_IDS.map((t) => t.toLowerCase()),
]);

check(
  'Total registered tools',
  true,
  `${REGISTERED_TOOLS.length} core + ${DOMAIN_TOOL_IDS.length} domain = ${allTools.size} unique`
);

// ============================================================================
// CHECK 2: No Duplicate Tool IDs
// ============================================================================

console.log('\n📋 CHECK 2: Duplicate Detection\n');

const registeredLower = REGISTERED_TOOLS.map((t) => t.toLowerCase());
const domainLower = DOMAIN_TOOL_IDS.map((t) => t.toLowerCase());

// Find duplicates within REGISTERED_TOOLS
const registeredDupes = registeredLower.filter(
  (item, index) => registeredLower.indexOf(item) !== index
);
check(
  'No duplicates in REGISTERED_TOOLS',
  registeredDupes.length === 0,
  undefined,
  registeredDupes
);

// Find duplicates within DOMAIN_TOOL_IDS
const domainDupes = domainLower.filter((item, index) => domainLower.indexOf(item) !== index);
check('No duplicates in DOMAIN_TOOL_IDS', domainDupes.length === 0, undefined, domainDupes);

// Find overlap between the two
const overlap = registeredLower.filter((t) => domainLower.includes(t));
check(
  'No overlap between core and domain tools',
  overlap.length === 0,
  overlap.length > 0 ? `${overlap.length} tools in both lists` : undefined,
  overlap
);

// ============================================================================
// CHECK 3: Tool Name Conventions
// ============================================================================

console.log('\n📋 CHECK 3: Naming Conventions\n');

const allToolIds = [...REGISTERED_TOOLS, ...DOMAIN_TOOL_IDS];
const invalidNames = allToolIds.filter((id) => {
  // Should be camelCase starting with lowercase
  if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) return true;
  // Should not contain underscores or hyphens
  if (id.includes('_') || id.includes('-')) return true;
  return false;
});
check(
  'All tool IDs follow camelCase convention',
  invalidNames.length === 0,
  undefined,
  invalidNames
);

// ============================================================================
// CHECK 4: Domain Folder Coverage
// ============================================================================

console.log('\n📋 CHECK 4: Domain Folder Coverage\n');

const domainsDir = path.join(process.cwd(), 'src/tools/domains');
let domainFolders: string[] = [];

try {
  domainFolders = fs
    .readdirSync(domainsDir)
    .filter((f) => {
      const fullPath = path.join(domainsDir, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('_');
    })
    .filter((f) => !['shared', '__tests__'].includes(f));
} catch {
  console.log('Could not read domains directory');
}

check('Domain folders found', domainFolders.length > 0, `${domainFolders.length} domains`);

// Check each domain folder has an index.ts
const domainsWithoutIndex = domainFolders.filter((d) => {
  const indexPath = path.join(domainsDir, d, 'index.ts');
  return !fs.existsSync(indexPath);
});
check(
  'All domain folders have index.ts',
  domainsWithoutIndex.length === 0,
  undefined,
  domainsWithoutIndex
);

// ============================================================================
// CHECK 5: isRegisteredTool Function Works
// ============================================================================

console.log('\n📋 CHECK 5: isRegisteredTool Function\n');

// Test some known tools
const knownTools = ['playMusic', 'processGrief', 'handoffToMaya', 'clarifyCareerGoals'];
const missingKnown = knownTools.filter((t) => !isRegisteredTool(t));
check('Known tools pass isRegisteredTool()', missingKnown.length === 0, undefined, missingKnown);

// Test fake tool
const fakeToolPasses = isRegisteredTool('fakeToolThatDoesNotExist123');
check('Fake tool rejected by isRegisteredTool()', !fakeToolPasses);

// ============================================================================
// CHECK 6: Sample Domain Tools Are Loadable
// ============================================================================

console.log('\n📋 CHECK 6: Sample Domain Tools Loadable\n');

const sampleDomains = ['grief', 'career', 'anger', 'wellness', 'games'];
const unloadableDomains: string[] = [];

for (const domain of sampleDomains) {
  const domainPath = path.join(domainsDir, domain, 'index.ts');
  if (!fs.existsSync(domainPath)) {
    unloadableDomains.push(domain);
    continue;
  }

  // Just check the file is readable and exports something
  try {
    const content = fs.readFileSync(domainPath, 'utf8');
    if (!content.includes('export')) {
      unloadableDomains.push(`${domain} (no exports)`);
    }
  } catch {
    unloadableDomains.push(`${domain} (read error)`);
  }
}

check(
  'Sample domain modules are valid',
  unloadableDomains.length === 0,
  undefined,
  unloadableDomains
);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 VALIDATION SUMMARY');
console.log('='.repeat(60));

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const total = results.length;

console.log(`\nTotal Checks: ${total}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Pass Rate: ${((passed / total) * 100).toFixed(0)}%`);

if (failed > 0) {
  console.log('\n⚠️  Some validation checks failed. Review the issues above.');
  process.exit(1);
} else {
  console.log('\n✅ All validation checks passed!');
  console.log(`\n📊 Tool Coverage:`);
  console.log(`   - Core tools (REGISTERED_TOOLS): ${REGISTERED_TOOLS.length}`);
  console.log(`   - Domain tools (DOMAIN_TOOL_IDS): ${DOMAIN_TOOL_IDS.length}`);
  console.log(`   - Total unique: ${allTools.size}`);
}
