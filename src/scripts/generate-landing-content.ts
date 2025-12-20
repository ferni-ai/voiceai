#!/usr/bin/env npx tsx
/**
 * Generate Landing Page Content
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Pre-generates AI content for the landing page and caches it in Firestore.
 * Run daily at 4am via Cloud Scheduler or manually before deployments.
 * 
 * Usage:
 *   pnpm landing:generate          # Generate all content
 *   pnpm landing:generate:heroes   # Generate hero variations only
 *   pnpm landing:generate:social   # Generate social proof only
 *   
 * Cost: ~$0.05 per full generation (vs $$$$ for real-time)
 */

import 'dotenv/config';
import { createLogger } from '../utils/safe-logger.js';
import { 
  runBatchGeneration, 
  generateAndCacheHeroes,
  generateAndCacheSocialProof,
} from '../services/landing-intelligence/content-cache.js';

const log = createLogger({ module: 'GenerateLandingContent' });

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';
  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           FERNI LANDING CONTENT GENERATOR                    ║');
  console.log('║           Pre-generate AI content for cost savings           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    switch (mode) {
      case 'heroes':
        console.log('📝 Generating hero variations...');
        const heroCount = await generateAndCacheHeroes();
        console.log(`✅ Generated ${heroCount} hero variations`);
        break;
        
      case 'social':
        console.log('💬 Generating social proof messages...');
        const socialCount = await generateAndCacheSocialProof();
        console.log(`✅ Generated ${socialCount} social proof messages`);
        break;
        
      case 'all':
      default:
        console.log('🚀 Generating all content...');
        console.log('');
        
        const result = await runBatchGeneration();
        
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║                    GENERATION COMPLETE                       ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║  Heroes generated:      ${String(result.heroes).padStart(3)}                              ║`);
        console.log(`║  Social proof:          ${String(result.socialProof).padStart(3)}                              ║`);
        console.log(`║  Estimated cost:        ${result.totalCost.padStart(7)}                          ║`);
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║  Content cached in Firestore with 24h-7d TTL                 ║');
        console.log('║  Edge cache headers set for CDN distribution                 ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        break;
    }
    
    console.log('');
    console.log('Next steps:');
    console.log('  1. Deploy to production: ferni deploy ui');
    console.log('  2. Set up Cloud Scheduler for daily generation at 4am');
    console.log('  3. Monitor cache hit rates in logs');
    console.log('');
    
    process.exit(0);
    
  } catch (error) {
    log.error({ error: String(error) }, 'Content generation failed');
    console.error('');
    console.error('❌ Content generation failed:', error);
    console.error('');
    process.exit(1);
  }
}

main();

