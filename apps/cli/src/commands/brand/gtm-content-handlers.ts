/**
 * GTM Content Management Handlers
 *
 * Handlers for content approval, preview, testing, and verification.
 *
 * @module cli/commands/brand/gtm-content-handlers
 */

import chalk from 'chalk';

// ============================================================================
// APPROVE COMMAND
// ============================================================================

export async function gtmApprove(contentId: string): Promise<void> {
  console.log(chalk.bold('\n✅ Approving Content\n'));

  try {
    const { approveContent } = await import('../../../../../src/services/gtm/gtm-service.js');
    const { getContent: getContentFromCalendar, initializeGTMCache } = await import(
      '../../../../../src/services/gtm/content-calendar.js'
    );

    // Ensure cache is hydrated from Firestore
    await initializeGTMCache();

    const content = getContentFromCalendar(contentId);
    if (!content) {
      console.log(chalk.red(`Content not found: ${contentId}`));
      return;
    }

    console.log(chalk.gray(`  Title: "${content.title}"`));
    console.log(chalk.gray(`  Category: ${content.brief.category}`));
    console.log();

    const success = approveContent(contentId);

    if (success) {
      console.log(chalk.green('✓ Content approved for publishing'));
      console.log(chalk.gray('  It will be published in the next scheduled run.'));
    } else {
      console.log(chalk.red('✗ Failed to approve content'));
    }
  } catch (error) {
    console.log(chalk.red('Approval failed:'), String(error));
  }
}

// ============================================================================
// PREVIEW COMMAND
// ============================================================================

export async function gtmPreview(contentId: string): Promise<void> {
  console.log(chalk.bold('\n👁️ Content Preview\n'));

  try {
    const { getContent, initializeGTMCache } = await import('../../../../../src/services/gtm/content-calendar.js');

    // Ensure cache is hydrated from Firestore
    await initializeGTMCache();

    const content = getContent(contentId);
    if (!content) {
      console.log(chalk.red(`Content not found: ${contentId}`));
      return;
    }

    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.bold(`  ${content.title}`));
    console.log(chalk.gray('═'.repeat(60)));
    console.log();

    console.log(chalk.bold('Category:'), chalk.cyan(content.brief.category));
    console.log(chalk.bold('Status:'), content.status);
    console.log(chalk.bold('Created:'), content.createdAt.toLocaleString());
    console.log();

    console.log(chalk.bold('Excerpt:'));
    console.log(chalk.gray(content.excerpt));
    console.log();

    console.log(chalk.bold('Hashtags:'), content.hashtags.map((h) => `#${h}`).join(' '));
    console.log();

    console.log(chalk.bold('Platform Previews:'));
    for (const platform of content.platforms) {
      console.log(chalk.cyan(`\n  ${platform.platform.toUpperCase()}:`));
      console.log(chalk.gray(`  ${platform.content.substring(0, 200)}...`));
    }

    console.log();
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.bold('Full Body:'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(content.body);
  } catch (error) {
    console.log(chalk.red('Preview failed:'), String(error));
  }
}

// ============================================================================
// TEST COMMAND
// ============================================================================

export async function gtmTest(): Promise<void> {
  console.log(chalk.bold('\n🧪 GTM System Test\n'));

  try {
    // Test content generation
    console.log(chalk.cyan('1. Testing content generation...'));
    const { generateContent } = await import('../../../../../src/services/gtm/content-generator.js');

    const testContent = await generateContent({
      pillar: 'tutorials',
      category: 'quick-tip',
      topic: 'Test quick tip for GTM system validation',
      targetAudience: 'developers',
      tone: 'direct',
    });

    console.log(chalk.green('   ✓ Content generated successfully'));
    console.log(chalk.gray(`     Title: "${testContent.title.substring(0, 40)}..."`));

    // Test brand voice validation
    console.log(chalk.cyan('\n2. Testing brand voice validation...'));
    const { validateBrandVoice } = await import('../../../../../src/services/gtm/brand-voice.js');

    const validation = validateBrandVoice(testContent.body);
    console.log(
      validation.isValid
        ? chalk.green('   ✓ Brand voice validation passed')
        : chalk.yellow(`   ⚠ Brand voice warnings: ${validation.warnings.length}`)
    );

    // Test social formatting
    console.log(chalk.cyan('\n3. Testing platform formatting...'));
    for (const platform of testContent.platforms) {
      const lengthOk = platform.content.length <= 3000;
      console.log(
        chalk.gray('   ') +
          (lengthOk ? chalk.green('✓') : chalk.red('✗')) +
          ` ${platform.platform}: ${platform.content.length} chars`
      );
    }

    // Test social status
    console.log(chalk.cyan('\n4. Checking social platform configuration...'));
    const { getSocialStatus } = await import('../../../../../src/services/social/social-service.js');
    const socialStatus = getSocialStatus();
    const findPlatform = (name: string) =>
      socialStatus.platforms.find((p) => p.platform === name);

    console.log(
      chalk.gray('   ') +
        `Twitter: ${findPlatform('twitter')?.configured ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      chalk.gray('   ') +
        `LinkedIn: ${findPlatform('linkedin')?.configured ? chalk.green('✓') : chalk.red('✗')}`
    );
    console.log(
      chalk.gray('   ') +
        `Discord: ${findPlatform('discord')?.configured ? chalk.green('✓') : chalk.red('✗')}`
    );

    console.log(chalk.green('\n✓ GTM system test complete!'));
  } catch (error) {
    console.log(chalk.red('\n✗ GTM system test failed:'), String(error));
  }
}

// ============================================================================
// VERIFY COMMAND
// ============================================================================

export async function gtmVerify(): Promise<void> {
  console.log(chalk.bold('\n🔐 Brand Account Verification\n'));

  try {
    const { verifyBrandAccountConfig } = await import(
      '../../../../../src/services/gtm/gtm-config.js'
    );

    const result = verifyBrandAccountConfig();

    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.bold('  Social Account Configuration'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log();

    // Account type
    const accountType = process.env.SOCIAL_ACCOUNT_TYPE;
    console.log(
      chalk.bold('Account Type: ') +
        (accountType === 'brand'
          ? chalk.green('✓ brand (correct)')
          : chalk.red(`✗ ${accountType || 'not set'} (should be "brand")`))
    );
    console.log();

    // LinkedIn Organization
    const linkedinOrg = process.env.LINKEDIN_ORGANIZATION_URN;
    console.log(chalk.bold('LinkedIn Organization:'));
    if (linkedinOrg) {
      if (linkedinOrg.startsWith('urn:li:organization:')) {
        console.log(chalk.green(`  ✓ ${linkedinOrg}`));
      } else {
        console.log(chalk.red(`  ✗ Invalid format: ${linkedinOrg}`));
      }
    } else {
      console.log(chalk.yellow('  ⚠ Not configured'));
    }
    console.log();

    // Twitter
    console.log(chalk.bold('Twitter:'));
    if (process.env.TWITTER_ACCESS_TOKEN || process.env.TWITTER_CLIENT_ID) {
      console.log(chalk.green('  ✓ Credentials configured'));
    } else {
      console.log(chalk.yellow('  ⚠ Not configured'));
    }

    // Discord
    console.log(chalk.bold('Discord:'));
    if (process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_BOT_TOKEN) {
      console.log(chalk.green('  ✓ Credentials configured'));
    } else {
      console.log(chalk.yellow('  ⚠ Not configured'));
    }
    console.log();

    // Summary
    console.log(chalk.gray('═'.repeat(60)));
    if (result.isValid) {
      console.log(chalk.green.bold('  ✓ Brand account configuration is VALID'));
      console.log(chalk.green('    Posts will go out as Ferni brand, not personal'));
    } else {
      console.log(chalk.red.bold('  ✗ Brand account configuration has ERRORS'));
      for (const error of result.errors) {
        console.log(chalk.red(`    • ${error}`));
      }
    }

    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\n  Warnings:'));
      for (const warning of result.warnings) {
        console.log(chalk.yellow(`    • ${warning}`));
      }
    }
    console.log(chalk.gray('═'.repeat(60)));

    // Action items
    if (!result.isValid) {
      console.log(chalk.bold('\n📋 Required Actions:'));
      console.log(chalk.gray('  1. Set SOCIAL_ACCOUNT_TYPE=brand in your .env'));
      console.log(chalk.gray('  2. Set LINKEDIN_ORGANIZATION_URN=urn:li:organization:YOUR_ORG_ID'));
      console.log(chalk.gray('  3. Redeploy with `ferni deploy gce`'));
    }
  } catch (error) {
    console.log(chalk.red('Verification failed:'), String(error));
  }
}
