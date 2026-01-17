#!/usr/bin/env npx ts-node
/**
 * GCS Bucket Setup Script
 *
 * Creates and configures the voiceai-custom-agents bucket for voice uploads.
 *
 * Usage:
 *   npx ts-node scripts/setup-gcs-bucket.ts
 *   npx ts-node scripts/setup-gcs-bucket.ts --dry-run
 */

import { Storage } from '@google-cloud/storage';

const BUCKET_NAME = process.env.CUSTOM_AGENT_BUCKET || 'voiceai-custom-agents';
const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const DRY_RUN = process.argv.includes('--dry-run');

interface BucketConfig {
  location: string;
  storageClass: string;
  lifecycle: {
    rule: Array<{
      action: { type: string };
      condition: { age?: number; matchesPrefix?: string[] };
    }>;
  };
  cors: Array<{
    origin: string[];
    method: string[];
    responseHeader: string[];
    maxAgeSeconds: number;
  }>;
}

const bucketConfig: BucketConfig = {
  location: 'US-CENTRAL1',
  storageClass: 'STANDARD',
  lifecycle: {
    rule: [
      {
        // Delete orphaned uploads after 7 days
        action: { type: 'Delete' },
        condition: {
          age: 7,
          matchesPrefix: ['temp/', 'orphaned/'],
        },
      },
      {
        // Delete old preview cache after 30 days
        action: { type: 'Delete' },
        condition: {
          age: 30,
          matchesPrefix: ['voice-previews/'],
        },
      },
    ],
  },
  cors: [
    {
      origin: [
        'https://app.ferni.ai',
        'https://ferni-prod.web.app',
        'http://localhost:3004',
        'http://localhost:3002',
      ],
      method: ['GET', 'PUT', 'POST', 'DELETE'],
      responseHeader: ['Content-Type', 'Content-Length', 'Content-Disposition'],
      maxAgeSeconds: 3600,
    },
  ],
};

async function setupBucket(): Promise<void> {
  console.log(`\n🪣 GCS Bucket Setup: ${BUCKET_NAME}`);
  console.log(`Project: ${PROJECT_ID || 'default'}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('─'.repeat(50));

  if (!PROJECT_ID) {
    console.warn('⚠️  No GCP_PROJECT_ID set, using default project');
  }

  const storage = new Storage({ projectId: PROJECT_ID });

  try {
    // Check if bucket exists
    const [exists] = await storage.bucket(BUCKET_NAME).exists();

    if (exists) {
      console.log(`✅ Bucket already exists: ${BUCKET_NAME}`);

      if (!DRY_RUN) {
        // Update CORS configuration
        console.log('   Updating CORS configuration...');
        await storage.bucket(BUCKET_NAME).setCorsConfiguration(bucketConfig.cors);
        console.log('   ✅ CORS updated');

        // Update lifecycle rules
        console.log('   Updating lifecycle rules...');
        await storage.bucket(BUCKET_NAME).setMetadata({
          lifecycle: bucketConfig.lifecycle,
        });
        console.log('   ✅ Lifecycle rules updated');
      } else {
        console.log('   [DRY RUN] Would update CORS and lifecycle rules');
      }
    } else {
      console.log(`📦 Creating bucket: ${BUCKET_NAME}`);

      if (!DRY_RUN) {
        await storage.createBucket(BUCKET_NAME, {
          location: bucketConfig.location,
          storageClass: bucketConfig.storageClass,
        });
        console.log(`   ✅ Bucket created in ${bucketConfig.location}`);

        // Set CORS
        await storage.bucket(BUCKET_NAME).setCorsConfiguration(bucketConfig.cors);
        console.log('   ✅ CORS configured');

        // Set lifecycle
        await storage.bucket(BUCKET_NAME).setMetadata({
          lifecycle: bucketConfig.lifecycle,
        });
        console.log('   ✅ Lifecycle rules configured');

        // Set uniform bucket-level access
        await storage.bucket(BUCKET_NAME).setMetadata({
          iamConfiguration: {
            uniformBucketLevelAccess: {
              enabled: true,
            },
          },
        });
        console.log('   ✅ Uniform bucket-level access enabled');
      } else {
        console.log('   [DRY RUN] Would create bucket with config:');
        console.log(`   - Location: ${bucketConfig.location}`);
        console.log(`   - Storage Class: ${bucketConfig.storageClass}`);
        console.log(`   - Lifecycle Rules: ${bucketConfig.lifecycle.rule.length}`);
        console.log(`   - CORS Origins: ${bucketConfig.cors[0].origin.length}`);
      }
    }

    // Verify configuration
    if (!DRY_RUN) {
      const [metadata] = await storage.bucket(BUCKET_NAME).getMetadata();
      console.log('\n📋 Current Configuration:');
      console.log(`   Location: ${metadata.location}`);
      console.log(`   Storage Class: ${metadata.storageClass}`);
      console.log(`   Versioning: ${metadata.versioning?.enabled ? 'Enabled' : 'Disabled'}`);
    }

    console.log('\n✨ Setup complete!\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

// Create directory structure
async function createDirectoryStructure(): Promise<void> {
  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would create directory placeholders:');
    console.log('   - voice-samples/');
    console.log('   - voice-previews/');
    console.log('   - temp/');
    return;
  }

  const storage = new Storage({ projectId: PROJECT_ID });
  const bucket = storage.bucket(BUCKET_NAME);

  const directories = ['voice-samples/', 'voice-previews/', 'temp/'];

  console.log('\n📁 Creating directory structure...');

  for (const dir of directories) {
    const file = bucket.file(`${dir}.keep`);
    const [exists] = await file.exists();

    if (!exists) {
      await file.save('');
      console.log(`   ✅ Created ${dir}`);
    } else {
      console.log(`   ✓ ${dir} exists`);
    }
  }
}

// Main
async function main(): Promise<void> {
  await setupBucket();
  await createDirectoryStructure();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
