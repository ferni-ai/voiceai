#!/usr/bin/env npx tsx
/**
 * Integration Validation Script
 *
 * Quick validation of all "Better than Human" integrations.
 * Run with: npx tsx scripts/validate-integrations.ts
 *
 * @module scripts/validate-integrations
 */

/* eslint-disable no-console */

import chalk from 'chalk';

// ============================================================================
// TYPES
// ============================================================================

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

// ============================================================================
// HELPERS
// ============================================================================

function log(result: ValidationResult): void {
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
  const color =
    result.status === 'pass'
      ? chalk.green
      : result.status === 'fail'
        ? chalk.red
        : chalk.yellow;

  console.log(`${icon} ${color(result.name)}: ${result.message}`);
  if (result.details) {
    console.log(chalk.gray(`   ${result.details}`));
  }
  results.push(result);
}

async function validate(
  name: string,
  fn: () => Promise<{ success: boolean; message: string; details?: string }>
): Promise<void> {
  try {
    const result = await fn();
    log({
      name,
      status: result.success ? 'pass' : 'fail',
      message: result.message,
      details: result.details,
    });
  } catch (error) {
    log({
      name,
      status: 'fail',
      message: 'Exception thrown',
      details: String(error),
    });
  }
}

// ============================================================================
// VALIDATIONS
// ============================================================================

async function validateSECEdgar(): Promise<void> {
  console.log(chalk.bold('\n📊 SEC EDGAR (Peter)'));

  const { getCIKByTicker, getCompanyFilings, generateSECInsight } = await import(
    '../src/services/finance/sec-edgar.js'
  );

  await validate('CIK Lookup', async () => {
    const result = await getCIKByTicker('AAPL');
    return {
      success: result.success,
      message: result.success ? `AAPL CIK: ${result.data}` : 'Failed to lookup CIK',
      details: result.error,
    };
  });

  await validate('Company Filings', async () => {
    const result = await getCompanyFilings('MSFT', { forms: ['10-K'], limit: 1 });
    if (result.success && result.data && result.data.length > 0) {
      return {
        success: true,
        message: `Found ${result.data.length} filing(s)`,
        details: `Latest: ${result.data[0].form} on ${result.data[0].filingDate}`,
      };
    }
    return { success: false, message: 'No filings found', details: result.error };
  });

  await validate('SEC Insight Generation', async () => {
    const insight = await generateSECInsight('NVDA');
    return {
      success: insight !== null,
      message: insight ? 'Generated insight' : 'No insight available',
      details: insight || undefined,
    };
  });
}

async function validateLifeExpectancy(): Promise<void> {
  console.log(chalk.bold('\n🧘 Life Expectancy (Nayan)'));

  const { calculateLifeExpectancy, generateMortalityPerspective } = await import(
    '../src/services/wisdom/life-expectancy.js'
  );

  await validate('Life Expectancy Calculation', async () => {
    const result = calculateLifeExpectancy({
      birthDate: new Date('1985-06-15'),
      sex: 'male',
    });
    return {
      success: result.expectedYearsRemaining > 0,
      message: `~${Math.round(result.expectedYearsRemaining)} years remaining`,
      details: `${result.timeRemaining.summers} summers, ${result.timeRemaining.tuesdays.toLocaleString()} Tuesdays`,
    };
  });

  await validate('Mortality Perspective', async () => {
    const lifeExp = calculateLifeExpectancy({
      birthDate: new Date('1985-06-15'),
      sex: 'male',
    });
    const perspective = generateMortalityPerspective('someday', lifeExp);
    return {
      success: !!perspective.statement,
      message: 'Generated perspective',
      details: perspective.statement.substring(0, 80) + '...',
    };
  });

  await validate('Parent Visits Calculation', async () => {
    const { calculateParentVisitsRemaining } = await import(
      '../src/intelligence/context-builders/mortality-perspective.js'
    );
    const result = calculateParentVisitsRemaining(70, 'monthly');
    return {
      success: result !== null && result.visits > 0,
      message: result ? `~${result.visits} visits remaining` : 'Calculation failed',
    };
  });
}

async function validateMarketData(): Promise<void> {
  console.log(chalk.bold('\n📈 Market Data (Peter)'));

  const hasAlphaVantage = !!process.env.ALPHA_VANTAGE_API_KEY;
  const hasFRED = !!process.env.FRED_API_KEY;

  log({
    name: 'Alpha Vantage API Key',
    status: hasAlphaVantage ? 'pass' : 'skip',
    message: hasAlphaVantage ? 'Configured' : 'Not configured (set ALPHA_VANTAGE_API_KEY)',
  });

  log({
    name: 'FRED API Key',
    status: hasFRED ? 'pass' : 'skip',
    message: hasFRED ? 'Configured' : 'Not configured (set FRED_API_KEY)',
  });
}

async function validateBiometrics(): Promise<void> {
  console.log(chalk.bold('\n💓 Biometrics (Maya)'));

  const hasOura = !!process.env.OURA_CLIENT_ID;
  const hasWhoop = !!process.env.WHOOP_CLIENT_ID;
  const hasTerra = !!process.env.TERRA_API_KEY;
  const hasGoogleFit = !!process.env.GOOGLE_FIT_CLIENT_ID;

  log({
    name: 'Oura Ring',
    status: hasOura ? 'pass' : 'skip',
    message: hasOura ? 'Configured' : 'Not configured (set OURA_CLIENT_ID)',
  });

  log({
    name: 'Whoop',
    status: hasWhoop ? 'pass' : 'skip',
    message: hasWhoop ? 'Configured' : 'Not configured (set WHOOP_CLIENT_ID)',
  });

  log({
    name: 'Terra (300+ wearables)',
    status: hasTerra ? 'pass' : 'skip',
    message: hasTerra ? 'Configured' : 'Not configured (set TERRA_API_KEY)',
  });

  log({
    name: 'Google Fit',
    status: hasGoogleFit ? 'pass' : 'skip',
    message: hasGoogleFit ? 'Configured' : 'Not configured (set GOOGLE_FIT_CLIENT_ID)',
  });
}

async function validateReservations(): Promise<void> {
  console.log(chalk.bold('\n🍽️ Restaurant Reservations (Jordan)'));

  const hasOpenTable = !!process.env.OPENTABLE_API_KEY;
  const hasResy = !!process.env.RESY_API_KEY;
  const hasYelp = !!process.env.YELP_API_KEY;

  log({
    name: 'OpenTable',
    status: hasOpenTable ? 'pass' : 'skip',
    message: hasOpenTable ? 'Configured' : 'Not configured (set OPENTABLE_API_KEY)',
  });

  log({
    name: 'Resy',
    status: hasResy ? 'pass' : 'skip',
    message: hasResy ? 'Configured' : 'Not configured (set RESY_API_KEY)',
  });

  log({
    name: 'Yelp',
    status: hasYelp ? 'pass' : 'skip',
    message: hasYelp ? 'Configured' : 'Not configured (set YELP_API_KEY)',
  });
}

async function validateGmail(): Promise<void> {
  console.log(chalk.bold('\n📧 Gmail (Alex)'));

  const hasGoogle = !!process.env.GOOGLE_CLIENT_ID;

  log({
    name: 'Google OAuth',
    status: hasGoogle ? 'pass' : 'skip',
    message: hasGoogle
      ? 'Configured (Gmail requires user OAuth)'
      : 'Not configured (set GOOGLE_CLIENT_ID)',
  });

  await validate('Gmail Service Module', async () => {
    const gmail = await import('../src/services/gmail/gmail-service.js');
    const hasReadFunctions =
      typeof gmail.getInboxMessages === 'function' &&
      typeof gmail.triageUnreadEmails === 'function';
    const hasSendFunctions =
      typeof gmail.sendEmail === 'function' &&
      typeof gmail.createDraft === 'function' &&
      typeof gmail.replyToThread === 'function';

    return {
      success: hasReadFunctions && hasSendFunctions,
      message: hasSendFunctions ? 'Read + Send capabilities available' : 'Read-only mode',
      details: hasSendFunctions
        ? 'sendEmail, createDraft, replyToThread all available'
        : undefined,
    };
  });
}

async function validateContextBuilders(): Promise<void> {
  console.log(chalk.bold('\n🧠 Context Builders'));

  await validate('SEC Intelligence Builder', async () => {
    const { buildSECIntelligenceContext } = await import(
      '../src/intelligence/context-builders/sec-intelligence.js'
    );
    // Just verify it loads and is callable
    return {
      success: typeof buildSECIntelligenceContext === 'function',
      message: 'Module loaded',
    };
  });

  await validate('Mortality Perspective Builder', async () => {
    const { buildMortalityPerspectiveContext } = await import(
      '../src/intelligence/context-builders/mortality-perspective.js'
    );
    return {
      success: typeof buildMortalityPerspectiveContext === 'function',
      message: 'Module loaded',
    };
  });

  await validate('Biometrics Builder', async () => {
    const biometrics = await import('../src/intelligence/context-builders/biometrics.js');
    return {
      success: !!biometrics,
      message: 'Module loaded',
    };
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(chalk.bold.blue('\n🔍 Ferni Integration Validation\n'));
  console.log(chalk.gray('Validating "Better than Human" integrations...\n'));

  await validateSECEdgar();
  await validateLifeExpectancy();
  await validateMarketData();
  await validateBiometrics();
  await validateReservations();
  await validateGmail();
  await validateContextBuilders();

  // Summary
  console.log(chalk.bold('\n📋 Summary'));
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  console.log(chalk.green(`  ✅ Passed: ${passed}`));
  console.log(chalk.red(`  ❌ Failed: ${failed}`));
  console.log(chalk.yellow(`  ⏭️ Skipped: ${skipped}`));

  if (failed > 0) {
    console.log(chalk.red('\n⚠️ Some validations failed. Check the details above.'));
    process.exit(1);
  } else if (skipped > 0) {
    console.log(
      chalk.yellow(
        '\n⚠️ Some integrations are not configured. Set the required environment variables.'
      )
    );
  } else {
    console.log(chalk.green('\n🎉 All integrations validated successfully!'));
  }
}

main().catch(console.error);
