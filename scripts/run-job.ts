#!/usr/bin/env npx tsx
/**
 * Scheduled Job Runner
 *
 * Run scheduled wellbeing jobs manually or via cron.
 *
 * Usage:
 *   npx tsx scripts/run-job.ts <job-name>
 *
 * Available jobs:
 *   - weeklyANTReport: Weekly cognitive distortion insights
 *   - dailyWarningCheck: Daily early warning system scan
 *   - wisdomAggregation: Population pattern learning
 *   - checkInNudge: Re-engagement nudges
 *   - all: Run all jobs
 *
 * Examples:
 *   npm run job:weekly-ant
 *   npm run job:daily-warnings
 *   npm run job:all
 */

import { wellbeingJobs } from '../src/tasks/scheduled/wellbeing-jobs.js';

const JOB_NAMES = [
  'weeklyANTReport',
  'dailyWarningCheck',
  'wisdomAggregation',
  'checkInNudge',
  'thinkingOfYouOutreach', // BETTER-THAN-HUMAN: Proactive outreach
] as const;

type JobName = (typeof JOB_NAMES)[number];

async function main(): Promise<void> {
  const jobName = process.argv[2];

  if (!jobName) {
    console.log('Usage: npx tsx scripts/run-job.ts <job-name>');
    console.log('\nAvailable jobs:');
    JOB_NAMES.forEach((name) => console.log(`  - ${name}`));
    console.log('  - all (run all jobs)');
    process.exit(1);
  }

  console.log(`\n🚀 Running job: ${jobName}\n`);

  try {
    if (jobName === 'all') {
      // Run all jobs sequentially
      for (const name of JOB_NAMES) {
        console.log(`\n--- Running ${name} ---`);
        const result = await wellbeingJobs.runJob(name);
        console.log(`Result:`, result);
      }
    } else if (JOB_NAMES.includes(jobName as JobName)) {
      const result = await wellbeingJobs.runJob(jobName);
      console.log(`\n✅ Job completed successfully`);
      console.log(`Result:`, result);
    } else {
      console.error(`❌ Unknown job: ${jobName}`);
      console.log('\nAvailable jobs:');
      JOB_NAMES.forEach((name) => console.log(`  - ${name}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Job failed:`, error);
    process.exit(1);
  }
}

main();
