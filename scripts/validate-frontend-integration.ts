#!/usr/bin/env npx ts-node
/**
 * Frontend Integration Validation Script
 *
 * Validates that API changes are properly integrated with frontend components.
 * Checks for:
 * - API endpoint usage in frontend code
 * - Type consistency
 * - Missing error handling
 *
 * Usage:
 *   npx ts-node scripts/validate-frontend-integration.ts
 *   npx ts-node scripts/validate-frontend-integration.ts --verbose
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const FRONTEND_DIR = 'apps/web/src';

interface ValidationResult {
  feature: string;
  component: string;
  apiEndpoint: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
}

const results: ValidationResult[] = [];

// Define expected frontend integrations
const INTEGRATION_CHECKS = [
  {
    feature: 'Conversation Threads',
    component: 'ThreadsView',
    apiEndpoint: '/api/conversations/threads',
    patterns: ['threads', 'conversation'],
    required: true,
  },
  {
    feature: 'Voice Preview',
    component: 'CustomAgentEditor',
    apiEndpoint: '/api/custom-agents/:agentId/voice/preview',
    patterns: ['voice/preview', 'generatePreview', 'audioBase64'],
    required: true,
  },
  {
    feature: 'Share Invites',
    component: 'ShareModal',
    apiEndpoint: '/api/custom-agent-features/share/invite',
    patterns: ['share/invite', 'sendInvite', 'shareLink'],
    required: true,
  },
  {
    feature: 'Memory Metrics',
    component: 'InsightsPanel',
    apiEndpoint: '/api/memory/metrics',
    patterns: ['memory/metrics', 'learningMetrics', 'surfacingMetrics'],
    required: false,
  },
  {
    feature: 'Team Analytics',
    component: 'TeamDashboard',
    apiEndpoint: '/api/team/analytics',
    patterns: ['mostActiveDay', 'team/analytics', 'engagement'],
    required: false,
  },
  {
    feature: 'Garden Stats',
    component: 'GardenView',
    apiEndpoint: '/api/garden/founder-stats',
    patterns: ['founder-stats', 'founderStats', 'totalFounders'],
    required: false,
  },
  {
    feature: 'Subscription Status',
    component: 'SubscriptionView',
    apiEndpoint: '/api/subscription/status',
    patterns: ['subscription/status', 'canStart', 'tier'],
    required: true,
  },
  {
    feature: 'Calendar Integration',
    component: 'CalendarView',
    apiEndpoint: '/api/calendar/events',
    patterns: ['calendar/events', 'upcomingEvents'],
    required: false,
  },
];

/**
 * Search for patterns in frontend code
 */
function searchFrontendCode(pattern: string): string[] {
  try {
    const result = execSync(
      `rg -l "${pattern}" ${FRONTEND_DIR} --type ts --type tsx 2>/dev/null || true`,
      { encoding: 'utf-8' }
    );
    return result
      .split('\n')
      .filter(Boolean)
      .map((f) => f.trim());
  } catch {
    return [];
  }
}

/**
 * Check if a component file exists
 */
function findComponent(componentName: string): string | null {
  const possiblePaths = [
    `${FRONTEND_DIR}/ui/${componentName.toLowerCase()}.ui.ts`,
    `${FRONTEND_DIR}/ui/${componentName.toLowerCase()}.ts`,
    `${FRONTEND_DIR}/components/${componentName}.tsx`,
    `${FRONTEND_DIR}/components/${componentName}.ts`,
    `${FRONTEND_DIR}/views/${componentName}.tsx`,
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Try glob search
  try {
    const result = execSync(
      `find ${FRONTEND_DIR} -name "*${componentName}*" -type f 2>/dev/null | head -1`,
      { encoding: 'utf-8' }
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check for error handling in component
 */
function checkErrorHandling(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return (
      content.includes('catch') ||
      content.includes('.catch(') ||
      content.includes('try {') ||
      content.includes('onError') ||
      content.includes('toast.error')
    );
  } catch {
    return false;
  }
}

/**
 * Run validation checks
 */
function runValidation(): void {
  console.log('\n🔍 Frontend Integration Validation');
  console.log('─'.repeat(60));

  for (const check of INTEGRATION_CHECKS) {
    if (VERBOSE) {
      console.log(`\nChecking: ${check.feature}`);
    }

    // Find component
    const componentPath = findComponent(check.component);

    if (!componentPath) {
      results.push({
        feature: check.feature,
        component: check.component,
        apiEndpoint: check.apiEndpoint,
        status: check.required ? 'warning' : 'ok',
        message: `Component not found: ${check.component}`,
      });
      continue;
    }

    // Check for API usage patterns
    let patternFound = false;
    const foundPatterns: string[] = [];

    for (const pattern of check.patterns) {
      const files = searchFrontendCode(pattern);
      if (files.length > 0) {
        patternFound = true;
        foundPatterns.push(pattern);
      }
    }

    // Check error handling
    const hasErrorHandling = checkErrorHandling(componentPath);

    if (patternFound) {
      results.push({
        feature: check.feature,
        component: check.component,
        apiEndpoint: check.apiEndpoint,
        status: hasErrorHandling ? 'ok' : 'warning',
        message: hasErrorHandling
          ? `Integration found (patterns: ${foundPatterns.join(', ')})`
          : `Integration found but missing error handling`,
      });
    } else {
      results.push({
        feature: check.feature,
        component: check.component,
        apiEndpoint: check.apiEndpoint,
        status: check.required ? 'error' : 'warning',
        message: `API patterns not found in frontend code`,
      });
    }
  }

  // Print results
  console.log('\nResults:\n');

  let okCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  for (const result of results) {
    const icon =
      result.status === 'ok' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';

    console.log(`${icon} ${result.feature}`);
    console.log(`   Component: ${result.component}`);
    console.log(`   Endpoint: ${result.apiEndpoint}`);
    console.log(`   ${result.message}`);
    console.log('');

    if (result.status === 'ok') okCount++;
    if (result.status === 'warning') warningCount++;
    if (result.status === 'error') errorCount++;
  }

  console.log('─'.repeat(60));
  console.log(`Summary: ${okCount} ok, ${warningCount} warnings, ${errorCount} errors`);

  if (errorCount > 0) {
    console.log('\n⚠️  Some required integrations are missing!');
    console.log('   Run with --verbose for details.\n');
    process.exit(1);
  }

  console.log('\n✨ Validation complete!\n');
}

/**
 * Check API types match frontend types
 */
function checkTypeConsistency(): void {
  console.log('\n📋 Type Consistency Check');
  console.log('─'.repeat(60));

  const apiTypePaths = [
    'src/api/routes/conversation-threads.ts',
    'src/api/custom-agent-routes.ts',
    'src/api/memory-routes.ts',
  ];

  const frontendTypePaths = [
    'apps/web/src/types/api.ts',
    'apps/web/src/types/index.ts',
  ];

  // This is a basic check - in production you'd use ts-morph or similar
  console.log('   Checking for shared type definitions...');

  let sharedTypesFound = false;
  for (const path of frontendTypePaths) {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      if (
        content.includes('ConversationThread') ||
        content.includes('MemoryMetrics') ||
        content.includes('CustomAgent')
      ) {
        sharedTypesFound = true;
        console.log(`   ✅ Found types in ${path}`);
      }
    }
  }

  if (!sharedTypesFound) {
    console.log('   ⚠️  Consider adding shared API types to frontend');
  }
}

// Main
function main(): void {
  console.log('\n🚀 API Production Readiness - Frontend Validation\n');

  if (!existsSync(FRONTEND_DIR)) {
    console.error(`❌ Frontend directory not found: ${FRONTEND_DIR}`);
    process.exit(1);
  }

  runValidation();
  checkTypeConsistency();
}

main();
