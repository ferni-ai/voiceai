/**
 * GTM Command Handlers
 *
 * Individual command implementations for the GTM CLI.
 * Separated from the router for maintainability.
 *
 * @module cli/commands/brand/gtm-handlers
 */

import chalk from 'chalk';
import type { ContentCategory } from '../../../../../src/services/gtm/types.js';

// Re-export content management handlers
export { gtmApprove, gtmPreview, gtmTest, gtmVerify } from './gtm-content-handlers.js';

// Valid content categories for validation
const VALID_CATEGORIES: ContentCategory[] = [
  'tutorial',
  'deep-dive',
  'changelog',
  'case-study',
  'community-spotlight',
  'quick-tip',
  'industry-insight',
  'week-preview',
  'milestone',
  'announcement',
];

// ============================================================================
// CONFIGURATION
// ============================================================================

const UI_SERVER_URL =
  process.env.UI_SERVER_URL || 'https://john-bogle-ui-784391336098.us-central1.run.app';

// ============================================================================
// STATUS COMMAND
// ============================================================================

export async function gtmStatus(): Promise<void> {
  console.log(chalk.bold('\n📊 GTM Dashboard\n'));

  try {
    const { getGTMStatus } = await import('../../../../../src/services/gtm/gtm-service.js');
    const { MONTHLY_THEMES } = await import('../../../../../src/services/gtm/brand-voice.js');

    const status = await getGTMStatus();
    const currentMonth = new Date().getMonth() + 1;
    const monthTheme = MONTHLY_THEMES.find((t) => t.month === currentMonth);

    // Header
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.bold(`  ${monthTheme?.name || 'Current'} Theme`));
    console.log(chalk.gray(`  ${monthTheme?.description || ''}`));
    console.log(chalk.gray('═'.repeat(60)));
    console.log();

    // Calendar Stats
    console.log(chalk.bold('📅 Content Calendar'));
    console.log(
      chalk.gray('  ') +
        `Planned: ${chalk.yellow(status.calendarStats.byStatus.planned)} | ` +
        `In Progress: ${chalk.cyan(status.calendarStats.byStatus['in-progress'])} | ` +
        `Ready: ${chalk.green(status.calendarStats.byStatus.ready)} | ` +
        `Published: ${chalk.blue(status.calendarStats.byStatus.published)}`
    );
    console.log();

    // Social Status
    console.log(chalk.bold('🌐 Social Platforms'));
    const getPlatform = (name: string) =>
      status.socialStatus.platforms.find((p) => p.platform === name);
    const twitter = getPlatform('twitter');
    const linkedin = getPlatform('linkedin');
    const discord = getPlatform('discord');
    console.log(
      chalk.gray('  ') +
        `Twitter: ${twitter?.configured ? chalk.green('✓ configured') : chalk.red('✗ not configured')} | ` +
        `LinkedIn: ${linkedin?.configured ? chalk.green('✓ configured') : chalk.red('✗ not configured')} | ` +
        `Discord: ${discord?.configured ? chalk.green('✓ configured') : chalk.red('✗ not configured')}`
    );
    console.log();

    // Suggestion
    console.log(chalk.bold('💡 Recommendation'));
    console.log(
      chalk.gray('  ') +
        `Create more ${chalk.cyan(status.suggestion.category)} content (${status.suggestion.reason})`
    );
    console.log();

    // Config
    console.log(chalk.bold('⚙️ Configuration'));
    console.log(
      chalk.gray('  ') +
        `Auto-publish: ${status.config.autoPublish ? chalk.green('enabled') : chalk.yellow('disabled (review required)')}`
    );
    console.log(chalk.gray('  ') + `Timezone: ${status.config.defaultTimezone}`);
    console.log();

    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.gray('  Run `ferni brand gtm calendar` to see upcoming content'));
    console.log(chalk.gray('═'.repeat(60)));
  } catch (error) {
    console.log(chalk.red('Failed to load GTM status:'), String(error));
    console.log(chalk.gray('\nTrying remote endpoint...'));

    // Fallback to HTTP endpoint
    try {
      const response = await fetch(`${UI_SERVER_URL}/api/jobs/gtm-daily-publishing`, {
        method: 'GET',
      });
      if (response.ok) {
        const data = await response.json();
        console.log(chalk.green('Remote status:'), JSON.stringify(data, null, 2));
      }
    } catch {
      console.log(chalk.red('Remote endpoint also failed'));
    }
  }
}

// ============================================================================
// CALENDAR COMMAND
// ============================================================================

export async function gtmCalendar(days: number = 7): Promise<void> {
  console.log(chalk.bold(`\n📅 Content Calendar (Next ${days} days)\n`));

  try {
    const { getPendingEntries, getReadyToPublish, getContentForEntry, initializeGTMCache } = await import(
      '../../../../../src/services/gtm/content-calendar.js'
    );

    // Ensure cache is hydrated from Firestore
    await initializeGTMCache();

    const pending = getPendingEntries();
    const ready = getReadyToPublish();

    if (pending.length === 0 && ready.length === 0) {
      console.log(chalk.yellow('No scheduled content found.'));
      console.log(chalk.gray('Run `ferni brand gtm generate` to create content for this week.'));
      return;
    }

    // Ready to publish
    if (ready.length > 0) {
      console.log(chalk.green.bold('Ready to Publish:'));
      for (const entry of ready.slice(0, 5)) {
        const content = getContentForEntry(entry.id);
        console.log(
          chalk.gray('  ') +
            chalk.green('●') +
            ` ${entry.date.toLocaleDateString()} - ${chalk.cyan(entry.category)}`
        );
        if (content) {
          console.log(chalk.gray(`    "${content.title.substring(0, 50)}..."`));
        }
      }
      console.log();
    }

    // Pending
    if (pending.length > 0) {
      console.log(chalk.yellow.bold('Pending:'));
      for (const entry of pending.slice(0, 10)) {
        const content = getContentForEntry(entry.id);
        const statusIcon = entry.status === 'in-progress' ? '◐' : '○';
        console.log(
          chalk.gray('  ') +
            chalk.yellow(statusIcon) +
            ` ${entry.date.toLocaleDateString()} - ${chalk.cyan(entry.category)} (${entry.status})`
        );
        if (content) {
          console.log(chalk.gray(`    "${content.title.substring(0, 50)}..."`));
        }
      }
    }

    console.log();
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.gray('  Run `ferni brand gtm publish` to publish ready content'));
    console.log(chalk.gray('═'.repeat(60)));
  } catch (error) {
    console.log(chalk.red('Failed to load calendar:'), String(error));
  }
}

// ============================================================================
// GENERATE COMMAND
// ============================================================================

export async function gtmGenerate(options: {
  category?: string;
  topic?: string;
  week?: boolean;
}): Promise<void> {
  console.log(chalk.bold('\n✨ Generating Content\n'));

  try {
    if (options.week) {
      // Generate for the whole week
      console.log(chalk.cyan('Generating content for the upcoming week...'));
      console.log(chalk.gray('This may take a few minutes.'));
      console.log();

      const { generateWeeklyContent } = await import(
        '../../../../../src/services/gtm/gtm-service.js'
      );

      const result = await generateWeeklyContent(new Date());

      console.log(chalk.green(`\n✓ Generated ${result.content.length} content pieces:`));
      for (const content of result.content) {
        console.log(
          chalk.gray('  ') +
            chalk.cyan(content.brief.category) +
            `: "${content.title.substring(0, 50)}..."`
        );
      }
    } else if (options.category && options.topic) {
      // Validate category
      const category = options.category as string;
      if (!VALID_CATEGORIES.includes(category as ContentCategory)) {
        console.log(chalk.red(`Invalid category: ${category}`));
        console.log(chalk.gray(`Valid categories: ${VALID_CATEGORIES.join(', ')}`));
        return;
      }

      // Generate specific content
      console.log(chalk.cyan(`Generating ${category} content about "${options.topic}"...`));

      const { createContent } = await import('../../../../../src/services/gtm/gtm-service.js');

      const content = await createContent({
        pillar: 'tutorials',
        category: category as ContentCategory,
        topic: options.topic,
        targetAudience: 'developers',
        tone: 'warm',
      });

      console.log(chalk.green('\n✓ Generated content:'));
      console.log(chalk.bold(`  Title: ${content.title}`));
      console.log(chalk.gray(`  Status: ${content.status}`));
      console.log(chalk.gray(`  ID: ${content.id}`));
      console.log();
      console.log(chalk.bold('  Excerpt:'));
      console.log(chalk.gray(`  ${content.excerpt}`));
    } else {
      console.log(chalk.yellow('Usage:'));
      console.log(chalk.gray('  ferni brand gtm generate --week'));
      console.log(chalk.gray('  ferni brand gtm generate --category tutorial --topic "MCP Servers"'));
    }
  } catch (error) {
    console.log(chalk.red('Generation failed:'), String(error));
  }
}

// ============================================================================
// PUBLISH COMMAND
// ============================================================================

export async function gtmPublish(options: { contentId?: string; all?: boolean }): Promise<void> {
  console.log(chalk.bold('\n📣 Publishing Content\n'));

  try {
    if (options.contentId) {
      // Publish specific content
      console.log(chalk.cyan(`Publishing content ${options.contentId}...`));

      const { publishNow } = await import('../../../../../src/services/gtm/gtm-service.js');
      const result = await publishNow(options.contentId);

      if (result.success) {
        console.log(chalk.green('\n✓ Published successfully!'));
        for (const r of result.results.results) {
          console.log(
            chalk.gray('  ') +
              (r.success ? chalk.green('✓') : chalk.red('✗')) +
              ` ${r.platform}` +
              (r.postUrl ? `: ${r.postUrl}` : '')
          );
        }
      } else {
        console.log(chalk.red('\n✗ Publishing failed'));
        for (const r of result.results.results) {
          if (!r.success) {
            console.log(chalk.gray('  ') + chalk.red(`${r.platform}: ${r.error}`));
          }
        }
      }
    } else if (options.all) {
      // Run full publishing job
      console.log(chalk.cyan('Running daily publishing job...'));

      const { runDailyPublishing } = await import('../../../../../src/services/gtm/gtm-service.js');
      const result = await runDailyPublishing();

      console.log(
        result.success ? chalk.green('\n✓ Publishing complete!') : chalk.yellow('\n⚠ Completed with issues')
      );
      console.log(chalk.gray(`  Generated: ${result.generated}`));
      console.log(chalk.gray(`  Published: ${result.published}`));
      if (result.errors.length > 0) {
        console.log(chalk.red(`  Errors: ${result.errors.length}`));
        for (const err of result.errors) {
          console.log(chalk.gray(`    - ${err}`));
        }
      }
    } else {
      console.log(chalk.yellow('Usage:'));
      console.log(chalk.gray('  ferni brand gtm publish --content-id <id>  # Publish specific content'));
      console.log(chalk.gray('  ferni brand gtm publish --all              # Run full publishing job'));
    }
  } catch (error) {
    console.log(chalk.red('Publishing failed:'), String(error));
  }
}
