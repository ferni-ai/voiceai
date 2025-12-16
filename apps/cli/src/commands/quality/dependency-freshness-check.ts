#!/usr/bin/env npx tsx
/**
 * Dependency Freshness Check Script
 *
 * Identifies outdated dependencies that may have security issues or
 * are missing important updates:
 * - Direct dependencies that are significantly outdated
 * - Dependencies with known security vulnerabilities (via npm audit)
 * - Pinned versions that should be ranges
 *
 * Run: npx tsx scripts/dependency-freshness-check.ts
 * Exit codes: 0 = pass, 1 = fail (security issues found)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const PACKAGE_JSON = join(ROOT_DIR, 'package.json');

const THRESHOLDS = {
  maxMajorVersionsBehind: 2,    // Alert if 2+ major versions behind
  maxHighVulnerabilities: 0,   // No high/critical vulnerabilities allowed
  maxModerateVulnerabilities: 5, // Allow some moderate
};

// Dependencies that are intentionally pinned or have special requirements
const PINNED_EXCEPTIONS = [
  // Add packages that must be pinned for compatibility
  'typescript', // Often pinned for build stability
];

// ============================================================================
// TYPES
// ============================================================================

interface PackageInfo {
  name: string;
  current: string;
  latest: string;
  wanted: string;
  type: 'dependencies' | 'devDependencies';
  majorsBehind: number;
  isPinned: boolean;
}

interface VulnerabilityInfo {
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  count: number;
}

interface FreshnessReport {
  outdatedPackages: PackageInfo[];
  significantlyOutdated: PackageInfo[];
  pinnedPackages: PackageInfo[];
  vulnerabilities: VulnerabilityInfo[];
  totalDependencies: number;
  hasSecurityIssues: boolean;
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  // Remove version prefix (^, ~, etc)
  const cleaned = version.replace(/^[^0-9]*/, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }
  return null;
}

function getMajorVersionDiff(current: string, latest: string): number {
  const currentParsed = parseVersion(current);
  const latestParsed = parseVersion(latest);

  if (currentParsed && latestParsed) {
    return latestParsed.major - currentParsed.major;
  }
  return 0;
}

function isPinnedVersion(version: string): boolean {
  // A pinned version starts with a digit (no ^, ~, >=, etc)
  return /^\d/.test(version);
}

function getOutdatedPackages(): PackageInfo[] {
  try {
    // Run npm outdated and capture output
    const result = execSync('npm outdated --json 2>/dev/null || true', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
    });

    if (!result || result.trim() === '') {
      return [];
    }

    const outdated = JSON.parse(result);
    const packages: PackageInfo[] = [];

    // Read package.json to determine dependency type
    const pkgJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
    const deps = pkgJson.dependencies || {};
    const devDeps = pkgJson.devDependencies || {};

    for (const [name, info] of Object.entries(outdated)) {
      const pkgInfo = info as { current: string; wanted: string; latest: string };

      const type = deps[name] ? 'dependencies' : 'devDependencies';
      const declaredVersion = deps[name] || devDeps[name] || '';

      packages.push({
        name,
        current: pkgInfo.current || 'unknown',
        wanted: pkgInfo.wanted || pkgInfo.current,
        latest: pkgInfo.latest || pkgInfo.current,
        type,
        majorsBehind: getMajorVersionDiff(pkgInfo.current, pkgInfo.latest),
        isPinned: isPinnedVersion(declaredVersion),
      });
    }

    return packages;
  } catch (error) {
    console.error('Warning: Could not check outdated packages');
    return [];
  }
}

function getVulnerabilities(): VulnerabilityInfo[] {
  try {
    const result = execSync('npm audit --json 2>/dev/null || true', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
    });

    if (!result || result.trim() === '') {
      return [];
    }

    const audit = JSON.parse(result);
    const vulnerabilities: VulnerabilityInfo[] = [];

    // npm audit format varies by version, try both formats
    if (audit.metadata?.vulnerabilities) {
      // npm v7+ format
      const vulns = audit.metadata.vulnerabilities;
      for (const [severity, count] of Object.entries(vulns)) {
        if (count && count > 0) {
          vulnerabilities.push({
            severity: severity as VulnerabilityInfo['severity'],
            count: count as number,
          });
        }
      }
    } else if (audit.advisories) {
      // npm v6 format
      const counts: Record<string, number> = {};
      for (const advisory of Object.values(audit.advisories)) {
        const sev = (advisory as { severity: string }).severity;
        counts[sev] = (counts[sev] || 0) + 1;
      }
      for (const [severity, count] of Object.entries(counts)) {
        vulnerabilities.push({
          severity: severity as VulnerabilityInfo['severity'],
          count,
        });
      }
    }

    return vulnerabilities;
  } catch {
    // npm audit may fail on some systems
    return [];
  }
}

function countDependencies(): number {
  const pkgJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
  const deps = Object.keys(pkgJson.dependencies || {}).length;
  const devDeps = Object.keys(pkgJson.devDependencies || {}).length;
  return deps + devDeps;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(): FreshnessReport {
  const outdated = getOutdatedPackages();
  const vulnerabilities = getVulnerabilities();
  const totalDeps = countDependencies();

  const significantlyOutdated = outdated.filter(
    p => p.majorsBehind >= THRESHOLDS.maxMajorVersionsBehind
  );

  const pinnedPackages = outdated.filter(
    p => p.isPinned && !PINNED_EXCEPTIONS.includes(p.name)
  );

  const highCriticalCount = vulnerabilities
    .filter(v => v.severity === 'high' || v.severity === 'critical')
    .reduce((sum, v) => sum + v.count, 0);

  const moderateCount = vulnerabilities
    .filter(v => v.severity === 'moderate')
    .reduce((sum, v) => sum + v.count, 0);

  const hasSecurityIssues =
    highCriticalCount > THRESHOLDS.maxHighVulnerabilities ||
    moderateCount > THRESHOLDS.maxModerateVulnerabilities;

  return {
    outdatedPackages: outdated,
    significantlyOutdated,
    pinnedPackages,
    vulnerabilities,
    totalDependencies: totalDeps,
    hasSecurityIssues,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: FreshnessReport): void {
  console.log('\n======================================================================');
  console.log('  DEPENDENCY FRESHNESS REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total dependencies: ${report.totalDependencies}`);
  console.log(`  Outdated packages: ${report.outdatedPackages.length}`);
  console.log(`  Significantly outdated (${THRESHOLDS.maxMajorVersionsBehind}+ majors behind): ${report.significantlyOutdated.length}`);
  console.log(`  Pinned packages: ${report.pinnedPackages.length}`);
  console.log();

  // Vulnerabilities
  if (report.vulnerabilities.length > 0) {
    console.log(`🔒 Security Vulnerabilities`);
    console.log('----------------------------------------------------------------------');
    for (const vuln of report.vulnerabilities) {
      const icon = vuln.severity === 'critical' || vuln.severity === 'high' ? '🔴' :
                   vuln.severity === 'moderate' ? '🟡' : '🟢';
      console.log(`  ${icon} ${vuln.severity}: ${vuln.count}`);
    }
    console.log();
  } else {
    console.log(`🔒 No security vulnerabilities found`);
    console.log();
  }

  // Significantly outdated
  if (report.significantlyOutdated.length > 0) {
    console.log(`⚠️  Significantly Outdated (${THRESHOLDS.maxMajorVersionsBehind}+ major versions behind)`);
    console.log('----------------------------------------------------------------------');
    for (const pkg of report.significantlyOutdated.slice(0, 15)) {
      console.log(`  ${pkg.name}`);
      console.log(`    Current: ${pkg.current} → Latest: ${pkg.latest} (${pkg.majorsBehind} majors behind)`);
    }
    if (report.significantlyOutdated.length > 15) {
      console.log(`  ... and ${report.significantlyOutdated.length - 15} more`);
    }
    console.log();
  }

  // All outdated (brief)
  if (report.outdatedPackages.length > 0 && report.outdatedPackages.length !== report.significantlyOutdated.length) {
    console.log(`📦 All Outdated Packages (${report.outdatedPackages.length})`);
    console.log('----------------------------------------------------------------------');

    // Group by majors behind
    const byMajor = new Map<number, PackageInfo[]>();
    for (const pkg of report.outdatedPackages) {
      if (!byMajor.has(pkg.majorsBehind)) {
        byMajor.set(pkg.majorsBehind, []);
      }
      byMajor.get(pkg.majorsBehind)!.push(pkg);
    }

    for (const [major, packages] of [...byMajor.entries()].sort((a, b) => b[0] - a[0])) {
      console.log(`  ${major} major${major !== 1 ? 's' : ''} behind: ${packages.map(p => p.name).slice(0, 5).join(', ')}${packages.length > 5 ? ` (+${packages.length - 5} more)` : ''}`);
    }
    console.log();
  }

  // Pinned packages
  if (report.pinnedPackages.length > 0) {
    console.log(`📌 Pinned Packages (consider using ranges)`);
    console.log('----------------------------------------------------------------------');
    for (const pkg of report.pinnedPackages.slice(0, 10)) {
      console.log(`  ${pkg.name}: ${pkg.current}`);
    }
    if (report.pinnedPackages.length > 10) {
      console.log(`  ... and ${report.pinnedPackages.length - 10} more`);
    }
    console.log();
  }

  // Update commands
  if (report.outdatedPackages.length > 0) {
    console.log(`💡 Update Commands`);
    console.log('----------------------------------------------------------------------');
    console.log('  Update all (safe):     npm update');
    console.log('  Update all (breaking): npm update --latest');
    console.log('  Interactive update:    npx npm-check-updates -i');
    console.log();
  }

  // Status
  console.log('======================================================================');
  if (report.hasSecurityIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');

    const highCritical = report.vulnerabilities
      .filter(v => v.severity === 'high' || v.severity === 'critical')
      .reduce((sum, v) => sum + v.count, 0);

    if (highCritical > 0) {
      console.log(`  ✗ ${highCritical} high/critical vulnerabilities found`);
      console.log('    Run: npm audit fix');
    }

    const moderate = report.vulnerabilities
      .filter(v => v.severity === 'moderate')
      .reduce((sum, v) => sum + v.count, 0);

    if (moderate > THRESHOLDS.maxModerateVulnerabilities) {
      console.log(`  ✗ ${moderate} moderate vulnerabilities (max: ${THRESHOLDS.maxModerateVulnerabilities})`);
    }
  } else {
    console.log('  STATUS: PASSED');
    if (report.significantlyOutdated.length > 0) {
      console.log('----------------------------------------------------------------------');
      console.log(`  ⚠ ${report.significantlyOutdated.length} packages are significantly outdated`);
    }
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('Checking dependency freshness...\n');

  if (!existsSync(PACKAGE_JSON)) {
    console.log('No package.json found');
    process.exit(1);
  }

  const report = generateReport();
  printReport(report);

  process.exit(report.hasSecurityIssues ? 1 : 0);
}

main();
