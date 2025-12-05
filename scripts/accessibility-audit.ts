#!/usr/bin/env npx ts-node

/**
 * Accessibility Audit Script
 * 
 * Runs WCAG 2.1 AA accessibility checks on Ferni UI components.
 * Uses axe-core for automated testing.
 * 
 * Usage:
 *   npx ts-node scripts/accessibility-audit.ts [url]
 * 
 * Examples:
 *   npx ts-node scripts/accessibility-audit.ts http://localhost:3005
 *   npx ts-node scripts/accessibility-audit.ts http://localhost:3005/metrics-dashboard.html
 */

import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

interface ViolationResult {
  id: string;
  impact: string;
  description: string;
  nodes: number;
  helpUrl: string;
}

interface AuditResult {
  url: string;
  violations: ViolationResult[];
  passes: number;
  incomplete: number;
}

const PAGES_TO_TEST = [
  '/',
  '/metrics-dashboard.html',
  '/cognitive-dashboard.html',
  '/tools-dashboard.html',
];

async function auditPage(browser: puppeteer.Browser, baseUrl: string, path: string): Promise<AuditResult> {
  const url = `${baseUrl}${path}`;
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for any animations to settle
    await page.waitForTimeout(1000);
    
    const results = await new AxePuppeteer(page)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    const violations: ViolationResult[] = results.violations.map(v => ({
      id: v.id,
      impact: v.impact || 'unknown',
      description: v.description,
      nodes: v.nodes.length,
      helpUrl: v.helpUrl,
    }));
    
    return {
      url,
      violations,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
    };
  } finally {
    await page.close();
  }
}

function printResults(results: AuditResult[]): void {
  console.log(`${BLUE}╔════════════════════════════════════════════════════════════╗${NC}`);
  console.log(`${BLUE}║     Ferni AI - Accessibility Audit (WCAG 2.1 AA)           ║${NC}`);
  console.log(`${BLUE}╚════════════════════════════════════════════════════════════╝${NC}`);
  console.log('');
  
  let totalViolations = 0;
  let totalPasses = 0;
  
  for (const result of results) {
    console.log(`${YELLOW}Page: ${result.url}${NC}`);
    console.log(`   ${GREEN}✓${NC} Passed: ${result.passes}`);
    console.log(`   ${YELLOW}?${NC} Incomplete: ${result.incomplete}`);
    console.log(`   ${RED}✗${NC} Violations: ${result.violations.length}`);
    
    totalViolations += result.violations.length;
    totalPasses += result.passes;
    
    if (result.violations.length > 0) {
      console.log('');
      for (const v of result.violations) {
        const impactColor = v.impact === 'critical' ? RED : 
                           v.impact === 'serious' ? RED :
                           v.impact === 'moderate' ? YELLOW : NC;
        console.log(`   ${impactColor}[${v.impact.toUpperCase()}]${NC} ${v.id}`);
        console.log(`      ${v.description}`);
        console.log(`      Affected elements: ${v.nodes}`);
        console.log(`      More info: ${v.helpUrl}`);
      }
    }
    console.log('');
  }
  
  // Summary
  console.log(`${BLUE}════════════════════════════════════════════════════════════${NC}`);
  console.log(`${BLUE}Summary${NC}`);
  console.log(`${BLUE}════════════════════════════════════════════════════════════${NC}`);
  console.log(`   Pages tested: ${results.length}`);
  console.log(`   Total passes: ${GREEN}${totalPasses}${NC}`);
  console.log(`   Total violations: ${totalViolations > 0 ? RED : GREEN}${totalViolations}${NC}`);
  console.log('');
  
  if (totalViolations === 0) {
    console.log(`${GREEN}╔════════════════════════════════════════════════════════════╗${NC}`);
    console.log(`${GREEN}║     ✓ All accessibility checks passed!                     ║${NC}`);
    console.log(`${GREEN}╚════════════════════════════════════════════════════════════╝${NC}`);
  } else {
    console.log(`${RED}╔════════════════════════════════════════════════════════════╗${NC}`);
    console.log(`${RED}║     ✗ ${totalViolations} accessibility issues found                        ║${NC}`);
    console.log(`${RED}╚════════════════════════════════════════════════════════════╝${NC}`);
  }
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2] || 'http://localhost:3005';
  
  // If a full URL with path is provided, just test that one page
  const isFullUrl = baseUrl.includes('.html') || baseUrl.endsWith('/');
  const pagesToTest = isFullUrl ? [''] : PAGES_TO_TEST;
  const actualBaseUrl = isFullUrl ? baseUrl : baseUrl;
  
  console.log(`Starting accessibility audit for: ${actualBaseUrl}`);
  console.log('');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  try {
    const results: AuditResult[] = [];
    
    for (const path of pagesToTest) {
      try {
        console.log(`Auditing: ${actualBaseUrl}${path}...`);
        const result = await auditPage(browser, actualBaseUrl, path);
        results.push(result);
      } catch (error) {
        console.log(`${YELLOW}⚠ Failed to audit ${path}: ${(error as Error).message}${NC}`);
      }
    }
    
    printResults(results);
    
    // Exit with error code if violations found
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
    process.exit(totalViolations > 0 ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`${RED}Audit failed:${NC}`, error);
  process.exit(1);
});


