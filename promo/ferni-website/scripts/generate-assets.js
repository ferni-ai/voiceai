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
  // ===== ZEN STONE AVATARS - Matching maya-v3 and team style =====
  // Three concentric circles: outer body, white eye, dark pupil
  // Warm, friendly, Pixar meets Japanese zen aesthetic
  
  'avatar-ferni': {
    prompt: `Friendly character portrait in zen minimalist style. A warm sage green (#4a6741) circular face like a smooth river stone. Three concentric stone elements: outer ring as nurturing body, white circle as attentive eye, dark pupil with soft catchlight. Below the eye, a warm gentle smile, welcoming and kind. The character radiates calm attention and care, like a life coach who truly listens. Soft cream (#F5F1E8) background. Style: Pixar meets Japanese zen, Studio Ghibli warmth. Feels like a trusted guide, NOT robotic. Premium 3D render.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-ferni.png'
  },
  
  'avatar-peter': {
    prompt: `Friendly character portrait in zen minimalist style. A warm ocean teal (#3a6b73) circular face like a polished sea stone. Three concentric stone elements: outer ring as thoughtful body, white circle as curious eye, dark pupil with soft catchlight. Below the eye, a warm curious smile, gentle and inquisitive. The character radiates intellectual warmth and wonder, like a researcher who loves discovery. Soft cream (#F5F1E8) background. Style: Pixar meets Japanese zen, warm teal NOT cold blue. Feels like a curious friend, NOT robotic. Premium 3D render.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-peter.png'
  },
  
  'avatar-alex': {
    prompt: `Friendly character portrait in zen minimalist style. A soft indigo slate (#5a6b8a) circular face like a smooth meditation stone. Three concentric stone elements: outer ring as calm body, white circle as clear eye, dark pupil with soft catchlight. Below the eye, a warm confident smile, clear and reassuring. The character radiates calm clarity and presence, like someone who communicates with care. Soft cream (#F5F1E8) background. Style: Pixar meets Japanese zen, warm indigo NOT cold blue. Feels like a trusted communicator, NOT robotic. Premium 3D render.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-alex.png'
  },
  
  'avatar-maya': {
    prompt: `Friendly character portrait in zen minimalist style. A dusty terracotta (#a67a6a) circular face like sun-baked clay. Three concentric stone elements: outer ring as nurturing body, white circle as patient eye, dark pupil with soft catchlight. Below the eye, a warm motherly smile, gentle and encouraging. The character radiates patience and care, like a yoga teacher or gardener. Soft cream (#F5F1E8) background. Style: Pixar meets Japanese zen, earth mother energy. Feels like a nurturing guide, NOT robotic. Premium 3D render.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-maya.png'
  },
  
  'avatar-jordan': {
    prompt: `Friendly character portrait in zen minimalist style. A warm sunset coral (#c4856a) circular face like a warm beach pebble. Three concentric stone elements: outer ring as joyful body, white circle as bright eye, dark pupil with soft catchlight. Below the eye, a warm excited smile, full of happy anticipation. The character radiates optimism and warmth, like someone who makes wonderful things happen. Soft cream (#F5F1E8) background. Style: Pixar meets Japanese zen, sunset warmth. Feels like an enthusiastic friend, NOT robotic. Premium 3D render.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-jordan.png'
  },
  
  'avatar-nayan': {
    prompt: `Friendly character portrait in zen minimalist style. A warm gold (#b8956a) circular face like aged honey or polished amber. Three concentric stone elements: outer ring as wise body, white circle as knowing eye, dark pupil with soft catchlight. Below the eye, a warm knowing smile, gentle and wise. The character radiates calm wisdom and timeless warmth, like a trusted mentor with years of experience. Soft cream (#F5F1E8) background. Style: Pixar meets Japanese zen, elder warmth. Feels like a wise guide, NOT robotic. Premium 3D render.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-nayan.png'
  },
  
  // ===== TEAM ASSEMBLY =====
  'avatar-team': {
    prompt: `Six friendly zen stone characters arranged in gentle arc, each a different warm color: sage green (center front, the leader), ocean teal, soft indigo, dusty terracotta, warm coral, warm gold. Each character has the three-stone eye design with white eye and dark pupil, plus gentle smile. They look at each other and the viewer with warmth, like a team of trusted friends. Subtle golden connection threads between them suggest collaboration. Soft cream (#F5F1E8) background. Style: Pixar meets Japanese zen, Studio Ghibli team warmth. NOT robotic or tech-looking. Premium 3D render.`,
    aspectRatio: '16:9',
    folder: 'avatars',
    filename: 'avatar-team.png'
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
  
  // ===== SOCIAL MEDIA ASSETS =====
  'social-profile': {
    prompt: `Minimalist logo on sage green background (#4a6741). White letters "FN" in modern geometric sans-serif font, centered and bold. Clean, professional, Apple-inspired simplicity. Square format, solid background, no gradients or patterns. Premium, trustworthy, minimal.`,
    aspectRatio: '1:1',
    folder: 'social',
    filename: 'profile-400x400.png'
  },
  
  'social-twitter-banner': {
    prompt: `Wide minimalist banner design on warm paper cream background (#F5F1E8). Subtle sage green (#4a6741) organic wave flowing along bottom third. Soft golden hour glow on right side. Clean negative space in center for text overlay. Premium, warm, inviting. Apple-style sophistication. Wide landscape composition with content concentrated in center band.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'twitter-banner-wide.jpg'
  },
  
  'social-linkedin-banner': {
    prompt: `Professional wide banner design on warm paper cream background (#F5F1E8). Subtle sage green (#4a6741) gradient on right side. Clean, minimal composition with space for company name in center. Warm, trustworthy, premium. NOT corporate blue. Soft golden accents. Wide landscape with content in center horizontal band.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'linkedin-banner-wide.jpg'
  },
  
  'social-youtube-banner': {
    prompt: `Wide cinematic banner for YouTube channel. Warm golden hour meadow scene, beautifully blurred. Sage green (#4a6741) and warm cream (#F5F1E8) color palette. Soft, inviting, human warmth. Safe area in center for logo and text. Apple-style premium quality. Ultra-wide landscape.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'youtube-banner-2560x1440.jpg'
  },
  
  'social-instagram-post': {
    prompt: `Instagram post template background. Warm paper cream (#F5F1E8) with subtle sage green (#4a6741) accent bar on left side. Clean minimal design with space for quote text. Soft organic texture. Premium, warm, Apple-inspired minimalism. Square format.`,
    aspectRatio: '1:1',
    folder: 'social',
    filename: 'instagram-quote-template.jpg'
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
  console.log('  --batch=avatars       (7 images - Living Avatar Orbs)');
  console.log('  --batch=hero          (3 images)');
  console.log('  --batch=testimonials  (3 images)');
  console.log('  --batch=social        (1 image)');
  console.log('  --batch=images        (all 14 images)');
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
