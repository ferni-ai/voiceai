#!/usr/bin/env node
/**
 * Ferni Asset Generator
 * 
 * Uses Google Imagen 4.0 to generate images
 * 
 * SETUP:
 * 1. Set your API key: export GOOGLE_API_KEY="your-api-key"
 * 
 * USAGE:
 * node generate-assets.js --key=avatar-ferni  # Generate specific asset
 * node generate-assets.js --batch=avatars     # Generate all avatars
 * node generate-assets.js --batch=images      # Generate all images
 * node generate-assets.js --list              # List available prompts
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  apiKey: process.env.GOOGLE_API_KEY,
  
  // Imagen 4.0 models available
  model: 'imagen-4.0-generate-001',  // Standard quality
  // model: 'imagen-4.0-fast-generate-001',  // Faster, good quality
  // model: 'imagen-4.0-ultra-generate-001', // Best quality, slower
  
  outputDir: path.join(__dirname, '..', 'images', 'generated'),
  
  // Default settings
  defaults: {
    numberOfImages: 4,
    aspectRatio: '1:1',
    personGeneration: 'ALLOW_ADULT',
    safetyFilterLevel: 'BLOCK_MEDIUM_AND_ABOVE',
  }
};

// ============================================================================
// IMAGE PROMPTS
// ============================================================================

const IMAGE_PROMPTS = {
  // ===== TEAM AVATARS =====
  'avatar-ferni': {
    prompt: `Abstract geometric portrait representing a wise, grounded AI life coach. Soft overlapping organic shapes in deep sage green (#4a6741) forming a friendly, approachable composition - like leaves or river stones. Warm cream (#F5F1E8) accents and subtle golden amber highlights. Feels like a wise friend in a garden, natural and trustworthy. Circular composition with soft warm shadow. Premium minimal aesthetic, Japanese zen influence. NOT cold or robotic. Clean warm cream background.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-ferni.png'
  },
  
  'avatar-nayan': {
    prompt: `Abstract geometric portrait representing wisdom, steadiness, and calm mentorship. Soft geometric shapes in warm cedar brown (#9a7b5a) suggesting tree rings, aged wood, or stacked stones. Cream highlights and subtle amber accents. Feels like a trusted elder, warm and reliable - the kind of person you'd sit with on a porch at sunset. Organic shapes, not sharp or cold. Circular composition, zen aesthetic. Clean warm cream background.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-nayan.png'
  },
  
  'avatar-peter': {
    prompt: `Abstract geometric portrait representing curiosity, depth, and discovery. Flowing shapes in ocean teal (#3a6b73) suggesting water, depth, exploration - like looking into a calm deep pool. Warm cream and soft golden accents suggesting light filtering through water. Curious but calm energy, thoughtful depth. NOT cold blue - warm teal with green undertones. Circular composition, organic shapes, zen aesthetic. Clean warm cream background.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-peter.png'
  },
  
  'avatar-alex': {
    prompt: `Abstract geometric portrait representing clarity, flow, and communication. Soft flowing shapes in muted indigo slate (#5a6b8a) suggesting gentle waves or flowing conversation. Warm cream highlights. Feels clear and calm, like a mountain stream - communication that flows naturally. Organic, soft shapes - NOT sharp or corporate. Warm undertones despite the cooler color. Circular composition, zen aesthetic. Clean warm cream background.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-alex.png'
  },
  
  'avatar-maya': {
    prompt: `Abstract geometric portrait representing gentle growth, consistency, and nurturing routine. Soft rounded shapes in warm terracotta coral (#a67a6a) suggesting stacked pebbles or growing plants. Cream and soft sage green accents. Feels like a patient gardener, someone who celebrates small wins. Organic, flowing composition - cycles and gentle progress. Circular composition, zen aesthetic. Clean warm cream background.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-maya.png'
  },
  
  'avatar-jordan': {
    prompt: `Abstract geometric portrait representing vision, planning, and celebration. Warm shapes in sunset coral (#c4856a) suggesting horizons, paths, and destinations. Cream and golden amber accents like warm sunlight. Feels like the excitement of planning a great adventure - hopeful and forward-looking. Organic shapes suggesting movement and journey. Circular composition, zen aesthetic. Clean warm cream background.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-jordan.png'
  },
  
  // ===== HERO BACKGROUNDS =====
  'hero-meadow': {
    prompt: `Serene alpine meadow at golden hour, Park City Utah style. Tall grass swaying gently in warm amber light. Snow-capped mountains in soft focus background. Wildflowers in muted cream and soft terracotta. Color palette: warm paper cream (#F5F1E8), sage green grass (#4a6741), golden amber sunrise (#C4A265). Extremely peaceful, contemplative. 8K quality, shallow depth of field, cinematic. Apple commercial meets Studio Ghibli warmth.`,
    aspectRatio: '16:9',
    folder: 'hero',
    filename: 'hero-meadow.jpg'
  },
  
  'hero-zen-garden': {
    prompt: `Serene Japanese zen garden at golden hour. Perfectly raked sand patterns in warm cream tones. Moss-covered stones in deep sage green (#4a6741). Traditional wooden elements in cedar brown (#9a7b5a). Soft volumetric fog catching golden sunlight. Peaceful reflecting pond with subtle ripples. Color palette strictly warm earth tones: cream, sage, cedar, amber. No cool blues. 8K quality, deeply peaceful, cinematic.`,
    aspectRatio: '16:9',
    folder: 'hero',
    filename: 'hero-zen-garden.jpg'
  },
  
  'hero-conversation': {
    prompt: `Two friends sitting together on a grassy mountain meadow overlooking a valley at golden hour, backs to camera. Warm sunlight bathes scene in soft amber. Tall grass sways gently in sage green. Snow-capped peaks in distance. Feeling of deep connection, being truly heard. Intimate, human. Warm earth tones: cream, sage, amber. Cinematic shallow depth of field, 8K.`,
    aspectRatio: '16:9',
    folder: 'hero',
    filename: 'hero-conversation.jpg'
  },
  
  // ===== TESTIMONIAL BACKGROUNDS =====
  'testimonial-bg-1': {
    prompt: `Soft, warm abstract background. Gentle gradient from warm cream (#F5F1E8) to soft sage green (#4a6741) undertones. Subtle organic texture like handmade paper or soft fabric. Warm, inviting, human feeling. Minimal, premium aesthetic. Clean and elegant.`,
    aspectRatio: '4:3',
    folder: 'testimonials',
    filename: 'testimonial-bg-1.jpg'
  },
  
  'testimonial-bg-2': {
    prompt: `Soft, warm abstract background. Gentle gradient from warm cream (#F5F1E8) to soft cedar brown (#9a7b5a) undertones. Subtle organic texture like natural linen. Warm, cozy, trustworthy feeling. Minimal, premium aesthetic. Clean and elegant.`,
    aspectRatio: '4:3',
    folder: 'testimonials',
    filename: 'testimonial-bg-2.jpg'
  },
  
  'testimonial-bg-3': {
    prompt: `Soft, warm abstract background. Gentle gradient from warm cream (#F5F1E8) to soft terracotta (#a67a6a) undertones. Subtle organic texture like woven fabric. Warm, nurturing feeling. Minimal, premium aesthetic. Clean and elegant.`,
    aspectRatio: '4:3',
    folder: 'testimonials',
    filename: 'testimonial-bg-3.jpg'
  },
  
  // ===== SOCIAL/OG IMAGES =====
  'og-image': {
    prompt: `Warm, inviting marketing image for AI life coach app. Soft golden hour meadow background, beautifully out of focus, with warm cream and sage green tones. Elegant composition with negative space on left for text. Subtle sage green botanical leaf elements. Warm, human, feels like a trusted friend. NOT corporate or tech-looking. Apple-style sophistication meets Studio Ghibli warmth. Premium quality.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'og-image.jpg'
  },
};

// ============================================================================
// IMAGEN API CLIENT
// ============================================================================

class ImagenGenerator {
  constructor() {
    if (!CONFIG.apiKey) {
      console.error('\n❌ GOOGLE_API_KEY not set');
      console.log('\nRun: export GOOGLE_API_KEY="your-api-key"');
      process.exit(1);
    }
  }
  
  async generateImage(promptConfig) {
    const { prompt, aspectRatio = '1:1', folder, filename } = promptConfig;
    
    console.log(`\n🎨 Generating: ${filename}`);
    console.log(`   Model: ${CONFIG.model}`);
    console.log(`   Aspect: ${aspectRatio}`);
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:predict?key=${CONFIG.apiKey}`;
    
    const requestBody = {
      instances: [
        {
          prompt: prompt,
        }
      ],
      parameters: {
        sampleCount: CONFIG.defaults.numberOfImages,
        aspectRatio: aspectRatio,
        personGeneration: CONFIG.defaults.personGeneration,
        safetyFilterLevel: CONFIG.defaults.safetyFilterLevel,
      }
    };
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error(`   ✗ API Error: ${data.error?.message || JSON.stringify(data)}`);
        return false;
      }
      
      // Save generated images
      if (data.predictions && data.predictions.length > 0) {
        const outputFolder = path.join(CONFIG.outputDir, folder);
        ensureDir(outputFolder);
        
        let savedCount = 0;
        for (let i = 0; i < data.predictions.length; i++) {
          const prediction = data.predictions[i];
          
          if (prediction.bytesBase64Encoded) {
            const variantFilename = i === 0 
              ? filename 
              : filename.replace(/(\.[^.]+)$/, `-v${i + 1}$1`);
            
            const outputPath = path.join(outputFolder, variantFilename);
            const buffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
            fs.writeFileSync(outputPath, buffer);
            console.log(`   ✓ Saved: ${folder}/${variantFilename}`);
            savedCount++;
          }
        }
        
        return savedCount > 0;
      }
      
      console.log('   ⚠ No images in response');
      return false;
      
    } catch (error) {
      console.error(`   ✗ Error: ${error.message}`);
      return false;
    }
  }
  
  async generateBatch(filter = null) {
    console.log('\n========================================');
    console.log(`Generating ${filter || 'all'} images...`);
    console.log('========================================');
    
    const results = { success: [], failed: [] };
    
    let prompts = Object.entries(IMAGE_PROMPTS);
    
    if (filter) {
      prompts = prompts.filter(([key]) => key.startsWith(filter));
    }
    
    console.log(`Found ${prompts.length} prompts to generate\n`);
    
    for (let i = 0; i < prompts.length; i++) {
      const [key, config] = prompts[i];
      console.log(`[${i + 1}/${prompts.length}] ${key}`);
      
      const success = await this.generateImage(config);
      
      if (success) {
        results.success.push(key);
      } else {
        results.failed.push(key);
      }
      
      // Rate limiting
      if (i < prompts.length - 1) {
        console.log('   Waiting 3s before next request...');
        await sleep(3000);
      }
    }
    
    return results;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printUsage() {
  console.log(`
Ferni Asset Generator (Imagen 4.0)
==================================

Usage:
  node generate-assets.js [options]

Options:
  --key=<prompt-key>    Generate a specific image
  --batch=images        Generate ALL images
  --batch=avatars       Generate team avatars only
  --batch=hero          Generate hero backgrounds only
  --batch=testimonials  Generate testimonial backgrounds only
  --batch=social        Generate social/OG images only
  --list                List all available prompts
  --help                Show this help

Examples:
  export GOOGLE_API_KEY="your-key"
  node generate-assets.js --key=avatar-ferni
  node generate-assets.js --batch=avatars
  node generate-assets.js --batch=images

Output:
  Images saved to: ../images/generated/<folder>/
`);
}

function listPrompts() {
  console.log('\n📋 Available Prompts:\n');
  
  const categories = {};
  Object.entries(IMAGE_PROMPTS).forEach(([key, config]) => {
    const cat = config.folder;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ key, aspectRatio: config.aspectRatio });
  });
  
  Object.entries(categories).forEach(([cat, items]) => {
    console.log(`  ${cat}/ (${items.length} images)`);
    items.forEach(({ key, aspectRatio }) => {
      console.log(`    --key=${key}  [${aspectRatio}]`);
    });
    console.log('');
  });
  
  console.log('Batch options:');
  console.log('  --batch=avatars       (6 images)');
  console.log('  --batch=hero          (3 images)');
  console.log('  --batch=testimonials  (3 images)');
  console.log('  --batch=social        (1 image)');
  console.log('  --batch=images        (all 13 images)');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    return;
  }
  
  if (args.includes('--list')) {
    listPrompts();
    return;
  }
  
  const generator = new ImagenGenerator();
  
  const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };
  
  const batchType = getArg('batch');
  const promptKey = getArg('key');
  
  if (batchType) {
    const filterMap = {
      'avatars': 'avatar-',
      'hero': 'hero-',
      'testimonials': 'testimonial-',
      'social': 'og-',
      'images': null, // all
    };
    
    const filter = filterMap[batchType];
    if (filter === undefined) {
      console.error(`Unknown batch type: ${batchType}`);
      console.log('Valid options: avatars, hero, testimonials, social, images');
      return;
    }
    
    const results = await generator.generateBatch(filter);
    
    console.log('\n========================================');
    console.log('RESULTS');
    console.log('========================================');
    console.log(`✓ Success: ${results.success.length}`);
    console.log(`✗ Failed:  ${results.failed.length}`);
    
    if (results.failed.length > 0) {
      console.log('\nFailed:');
      results.failed.forEach(k => console.log(`  - ${k}`));
    }
    
  } else if (promptKey) {
    if (IMAGE_PROMPTS[promptKey]) {
      await generator.generateImage(IMAGE_PROMPTS[promptKey]);
    } else {
      console.error(`Unknown prompt key: ${promptKey}`);
      console.log('Use --list to see available keys');
    }
  } else {
    printUsage();
  }
}

main().catch(console.error);
