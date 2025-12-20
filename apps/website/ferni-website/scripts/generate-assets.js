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
const { execSync } = require('child_process');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API Key for Generative Language API (fallback)
  apiKey: process.env.GOOGLE_API_KEY,

  // Vertex AI settings (preferred - supports style references!)
  vertexProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID,
  vertexLocation: 'us-central1',

  // Imagen models
  model: 'imagen-4.0-generate-001', // Generative Language API model
  vertexModel: 'imagen-3.0-generate-002', // Vertex AI model with style support

  outputDir: path.join(__dirname, '..', 'images', 'generated'),

  // Default settings
  defaults: {
    numberOfImages: 4,
    aspectRatio: '1:1',
    personGeneration: 'ALLOW_ADULT',
    safetyFilterLevel: 'BLOCK_MEDIUM_AND_ABOVE',
  },
};

// ============================================================================
// IMAGE PROMPTS
// ============================================================================

const IMAGE_PROMPTS = {
  // ===== ZEN BOWL AVATARS - EXACT Maya style =====
  // KEY: TOP-DOWN bird's eye view of nested concentric ceramic rings
  // Face in exact center, white ring accent, matte terracotta-like texture
  // Clean white/cream background, soft even lighting from above

  'avatar-ferni': {
    prompt: `TOP-DOWN bird's eye view of nested concentric ceramic bowls. 5 sage green (#4a6741) matte ceramic rings, largest outer ring about 1024px diameter, progressively smaller toward center. One white ceramic ring accent near the center. In the very center: a small round face with CLOSED happy eyes (curved lines like ^_^), subtle eyebrows, and gentle warm smile. Face is same sage green color as bowls. Matte grainy ceramic texture like handmade terracotta pottery. Pure white background. Soft even lighting from directly above. Style: EXACTLY like Japanese zen nesting bowls. Premium 3D render. NO text, NO labels, NO side view.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-ferni.png',
  },

  'avatar-peter': {
    prompt: `TOP-DOWN bird's eye view of nested concentric ceramic bowls. 5 ocean teal (#3a6b73) matte ceramic rings, largest outer ring about 1024px diameter, progressively smaller toward center. One white ceramic ring accent near the center. In the very center: a small round face with CLOSED happy eyes (curved lines like ^_^), subtle eyebrows, and gentle curious smile. Face is same teal color as bowls. Matte grainy ceramic texture like handmade terracotta pottery. Pure white background. Soft even lighting from directly above. Style: EXACTLY like Japanese zen nesting bowls. Premium 3D render. NO text, NO labels, NO side view.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-peter.png',
  },

  'avatar-alex': {
    prompt: `TOP-DOWN bird's eye view of nested concentric ceramic bowls. 5 soft slate blue (#6a7a8a) matte ceramic rings, largest outer ring about 1024px diameter, progressively smaller toward center. One white ceramic ring accent near the center. In the very center: a small round face with CLOSED happy eyes (curved lines like ^_^), subtle eyebrows, and gentle confident smile. Face is same slate blue color as bowls. Matte grainy ceramic texture like handmade terracotta pottery. Pure white background. Soft even lighting from directly above. Style: EXACTLY like Japanese zen nesting bowls. Premium 3D render. NO text, NO labels, NO side view.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-alex.png',
  },

  'avatar-maya': {
    prompt: `TOP-DOWN bird's eye view of nested concentric ceramic bowls. 5 warm terracotta (#a67a6a) matte ceramic rings, largest outer ring about 1024px diameter, progressively smaller toward center. One white ceramic ring accent near the center. In the very center: a small round face with CLOSED happy eyes (curved lines like ^_^), subtle eyebrows, and gentle nurturing smile. Face is same terracotta color as bowls. Matte grainy ceramic texture like handmade terracotta pottery. Pure white background. Soft even lighting from directly above. Style: EXACTLY like Japanese zen nesting bowls. Premium 3D render. NO text, NO labels, NO side view.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-maya.png',
  },

  'avatar-jordan': {
    prompt: `TOP-DOWN bird's eye view of nested concentric ceramic bowls. 5 warm coral (#c4856a) matte ceramic rings, largest outer ring about 1024px diameter, progressively smaller toward center. One white ceramic ring accent near the center. In the very center: a small round face with CLOSED happy eyes (curved lines like ^_^), subtle eyebrows, and gentle joyful smile. Face is same coral color as bowls. Matte grainy ceramic texture like handmade terracotta pottery. Pure white background. Soft even lighting from directly above. Style: EXACTLY like Japanese zen nesting bowls. Premium 3D render. NO text, NO labels, NO side view.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-jordan.png',
  },

  'avatar-nayan': {
    prompt: `TOP-DOWN bird's eye view of nested concentric ceramic bowls. 5 warm amber gold (#b8956a) matte ceramic rings, largest outer ring about 1024px diameter, progressively smaller toward center. One white ceramic ring accent near the center. In the very center: a small round face with CLOSED happy eyes (curved lines like ^_^), subtle eyebrows, and gentle wise smile. Face is same amber color as bowls. Matte grainy ceramic texture like handmade terracotta pottery. Pure white background. Soft even lighting from directly above. Style: EXACTLY like Japanese zen nesting bowls. Premium 3D render. NO text, NO labels, NO side view.`,
    aspectRatio: '1:1',
    folder: 'avatars',
    filename: 'avatar-nayan.png',
  },

  // ===== TEAM ASSEMBLY - Matching zen bowl style =====
  'avatar-team': {
    prompt: `Six zen ceramic bowl characters in a gentle curved line, viewed from slightly above. Each character is nested concentric ceramic rings (TOP-DOWN style) in different warm colors from left to right: sage green (#4a6741), terracotta (#a67a6a), slate blue (#6a7a8a), ocean teal (#3a6b73), coral (#c4856a), amber gold (#b8956a). Sage green (Ferni) is largest and in front/center. Each has a small face in center with CLOSED eyes and gentle smile. Matte ceramic texture. Warm cream (#F5F1E8) background. Soft lighting. Style: Japanese zen pottery family portrait. NO text, NO labels. Premium 3D render.`,
    aspectRatio: '16:9',
    folder: 'avatars',
    filename: 'avatar-team.png',
  },

  // ===== HERO BACKGROUNDS =====
  'hero-meadow': {
    prompt: `Serene alpine meadow at golden hour, Park City Utah style. Tall grass swaying gently in warm amber light. Snow-capped mountains in soft focus background. Wildflowers in muted cream and soft terracotta. Color palette: warm paper cream (#F5F1E8), sage green grass (#4a6741), golden amber sunrise (#C4A265). Extremely peaceful, contemplative. 8K quality, shallow depth of field, cinematic. Apple commercial meets Studio Ghibli warmth.`,
    aspectRatio: '16:9',
    folder: 'hero',
    filename: 'hero-meadow.jpg',
  },

  'hero-zen-garden': {
    prompt: `Serene Japanese zen garden at golden hour. Perfectly raked sand patterns in warm cream tones. Moss-covered stones in deep sage green (#4a6741). Traditional wooden elements in cedar brown (#9a7b5a). Soft volumetric fog catching golden sunlight. Peaceful reflecting pond with subtle ripples. Color palette strictly warm earth tones: cream, sage, cedar, amber. No cool blues. 8K quality, deeply peaceful, cinematic.`,
    aspectRatio: '16:9',
    folder: 'hero',
    filename: 'hero-zen-garden.jpg',
  },

  'hero-conversation': {
    prompt: `Two friends sitting together on a grassy mountain meadow overlooking a valley at golden hour, backs to camera. Warm sunlight bathes scene in soft amber. Tall grass sways gently in sage green. Snow-capped peaks in distance. Feeling of deep connection, being truly heard. Intimate, human. Warm earth tones: cream, sage, amber. Cinematic shallow depth of field, 8K.`,
    aspectRatio: '16:9',
    folder: 'hero',
    filename: 'hero-conversation.jpg',
  },

  // ===== TESTIMONIAL BACKGROUNDS =====
  'testimonial-bg-1': {
    prompt: `Soft, warm abstract background. Gentle gradient from warm cream (#F5F1E8) to soft sage green (#4a6741) undertones. Subtle organic texture like handmade paper or soft fabric. Warm, inviting, human feeling. Minimal, premium aesthetic. Clean and elegant.`,
    aspectRatio: '4:3',
    folder: 'testimonials',
    filename: 'testimonial-bg-1.jpg',
  },

  'testimonial-bg-2': {
    prompt: `Soft, warm abstract background. Gentle gradient from warm cream (#F5F1E8) to soft cedar brown (#9a7b5a) undertones. Subtle organic texture like natural linen. Warm, cozy, trustworthy feeling. Minimal, premium aesthetic. Clean and elegant.`,
    aspectRatio: '4:3',
    folder: 'testimonials',
    filename: 'testimonial-bg-2.jpg',
  },

  'testimonial-bg-3': {
    prompt: `Soft, warm abstract background. Gentle gradient from warm cream (#F5F1E8) to soft terracotta (#a67a6a) undertones. Subtle organic texture like woven fabric. Warm, nurturing feeling. Minimal, premium aesthetic. Clean and elegant.`,
    aspectRatio: '4:3',
    folder: 'testimonials',
    filename: 'testimonial-bg-3.jpg',
  },

  // ===== SOCIAL/OG IMAGES =====
  'og-image': {
    prompt: `Warm, inviting marketing image for AI life coach app. Soft golden hour meadow background, beautifully out of focus, with warm cream and sage green tones. Elegant composition with negative space on left for text. Subtle sage green botanical leaf elements. Warm, human, feels like a trusted friend. NOT corporate or tech-looking. Apple-style sophistication meets Studio Ghibli warmth. Premium quality.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'og-image.jpg',
  },

  // ===== SOCIAL MEDIA ASSETS =====
  'social-profile': {
    prompt: `Minimalist logo on sage green background (#4a6741). White letters "FN" in modern geometric sans-serif font, centered and bold. Clean, professional, Apple-inspired simplicity. Square format, solid background, no gradients or patterns. Premium, trustworthy, minimal.`,
    aspectRatio: '1:1',
    folder: 'social',
    filename: 'profile-400x400.png',
  },

  'social-twitter-banner': {
    prompt: `Wide minimalist banner design on warm paper cream background (#F5F1E8). Subtle sage green (#4a6741) organic wave flowing along bottom third. Soft golden hour glow on right side. Clean negative space in center for text overlay. Premium, warm, inviting. Apple-style sophistication. Wide landscape composition with content concentrated in center band.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'twitter-banner-wide.jpg',
  },

  'social-linkedin-banner': {
    prompt: `Professional wide banner design on warm paper cream background (#F5F1E8). Subtle sage green (#4a6741) gradient on right side. Clean, minimal composition with space for company name in center. Warm, trustworthy, premium. NOT corporate blue. Soft golden accents. Wide landscape with content in center horizontal band.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'linkedin-banner-wide.jpg',
  },

  'social-youtube-banner': {
    prompt: `Wide cinematic banner for YouTube channel. Warm golden hour meadow scene, beautifully blurred. Sage green (#4a6741) and warm cream (#F5F1E8) color palette. Soft, inviting, human warmth. Safe area in center for logo and text. Apple-style premium quality. Ultra-wide landscape.`,
    aspectRatio: '16:9',
    folder: 'social',
    filename: 'youtube-banner-2560x1440.jpg',
  },

  'social-instagram-post': {
    prompt: `Instagram post template background. Warm paper cream (#F5F1E8) with subtle sage green (#4a6741) accent bar on left side. Clean minimal design with space for quote text. Soft organic texture. Premium, warm, Apple-inspired minimalism. Square format.`,
    aspectRatio: '1:1',
    folder: 'social',
    filename: 'instagram-quote-template.jpg',
  },

  // ===== FOUNDERS FUND - Stripe Product Images =====
  // Style: Clean 3D render OR soft watercolor, warm cream background, minimal, zen aesthetic
  
  'founders-member': {
    prompt: `Beautiful 3D render of cupped hands holding a tiny glowing green seedling, soft warm lighting from above, clean cream background, minimalist zen aesthetic, the seedling has two small leaves and emits a gentle golden glow, hands are stylized and gentle, feeling of nurturing care, premium quality render, centered composition, no text`,
    aspectRatio: '1:1',
    folder: 'founders',
    filename: 'founding-member.png',
  },

  'founders-patron': {
    prompt: `Beautiful 3D render of a majestic tree with golden and sage green leaves on a small grass island, smaller seedlings and plants growing beneath in its shelter, warm cream background, soft natural lighting, zen garden aesthetic, feeling of protection and growth, the tree is centered and full, premium quality render, no text`,
    aspectRatio: '1:1',
    folder: 'founders',
    filename: 'founding-patron.png',
  },

  'seed-plant': {
    prompt: `Soft watercolor illustration of a single tiny seedling sprouting from a small mound of brown earth, two delicate green leaves reaching upward, warm cream paper background, simple and hopeful, zen minimalist style, gentle soft edges, feeling of new beginnings, centered composition, premium watercolor quality, no text`,
    aspectRatio: '1:1',
    folder: 'founders',
    filename: 'seed-plant-5.png',
  },

  'seed-sponsor': {
    prompt: `Beautiful 3D render of two gentle abstract figures facing each other with a warm golden glow between them forming a heart shape, one figure sage green one figure warm terracotta, clean cream background, minimalist zen style, feeling of connection and conversation, soft lighting, centered composition, premium quality, no text`,
    aspectRatio: '1:1',
    folder: 'founders',
    filename: 'seed-sponsor-10.png',
  },

  'seed-help': {
    prompt: `Soft watercolor illustration of two hands reaching toward each other, one hand reaching down from above one hand reaching up from below, warm terracotta and sage green colors, cream paper background, moment of connection and support, zen minimalist style, soft gentle brushstrokes, feeling of helping, centered, no text`,
    aspectRatio: '1:1',
    folder: 'founders',
    filename: 'seed-help-25.png',
  },

  'seed-mission': {
    prompt: `Beautiful 3D render of a circle of small stylized figures holding hands around a central glowing warm light, viewed from above, figures in sage green coral and cream colors, clean cream background, zen minimalist style, sense of unity and community, soft ethereal glow in center, feeling of togetherness, premium quality, no text`,
    aspectRatio: '1:1',
    folder: 'founders',
    filename: 'seed-mission-50.png',
  },
};

// ============================================================================
// IMAGEN API CLIENT
// ============================================================================

class ImagenGenerator {
  constructor() {
    this.styleReferenceBase64 = null;
    this.accessToken = null;

    // Check for Vertex AI (preferred) or API key (fallback)
    if (CONFIG.vertexProject) {
      console.log(`\n✅ Vertex AI project: ${CONFIG.vertexProject}`);
      this.useVertexAI = true;
    } else if (CONFIG.apiKey) {
      console.log('\n⚠️  Using Generative Language API (no style reference support)');
      this.useVertexAI = false;
    } else {
      console.error('\n❌ No credentials found');
      console.log('\nNeed either:');
      console.log('  - GOOGLE_CLOUD_PROJECT or GCP_PROJECT_ID (for Vertex AI)');
      console.log('  - GOOGLE_API_KEY (for Generative Language API)');
      process.exit(1);
    }
  }

  /**
   * Get OAuth2 access token from gcloud
   */
  getAccessToken() {
    if (!this.accessToken) {
      try {
        this.accessToken = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
      } catch (error) {
        console.error('\n❌ Failed to get access token. Run: gcloud auth login');
        process.exit(1);
      }
    }
    return this.accessToken;
  }

  /**
   * Load a style reference image for consistent generation
   * @param {string} imagePath - Path to the reference image
   */
  loadStyleReference(imagePath) {
    const fullPath = path.resolve(imagePath);
    if (fs.existsSync(fullPath)) {
      const imageBuffer = fs.readFileSync(fullPath);
      this.styleReferenceBase64 = imageBuffer.toString('base64');
      console.log(`\n✅ Loaded style reference: ${path.basename(imagePath)}`);
      return true;
    } else {
      console.error(`\n❌ Style reference not found: ${imagePath}`);
      return false;
    }
  }

  async generateImage(promptConfig, useStyleReference = false) {
    const { prompt, aspectRatio = '1:1', folder, filename } = promptConfig;

    // Use Vertex AI if style reference is requested AND we have Vertex AI configured
    const shouldUseVertexAI = useStyleReference && this.useVertexAI && this.styleReferenceBase64;

    console.log(`\n🎨 Generating: ${filename}`);
    console.log(`   API: ${shouldUseVertexAI ? 'Vertex AI' : 'Generative Language'}`);
    console.log(`   Model: ${shouldUseVertexAI ? CONFIG.vertexModel : CONFIG.model}`);
    console.log(`   Aspect: ${aspectRatio}`);
    if (useStyleReference && this.styleReferenceBase64) {
      console.log(`   Style: Using reference image`);
    }

    let url, requestBody, headers;

    if (shouldUseVertexAI) {
      // Vertex AI endpoint with style reference support
      // Using imagegeneration@006 model with styleImageConfig
      const vertexModel = 'imagegeneration@006';
      url = `https://${CONFIG.vertexLocation}-aiplatform.googleapis.com/v1/projects/${CONFIG.vertexProject}/locations/${CONFIG.vertexLocation}/publishers/google/models/${vertexModel}:predict`;

      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getAccessToken()}`,
      };

      requestBody = {
        instances: [
          {
            prompt: prompt,
          },
        ],
        parameters: {
          sampleCount: CONFIG.defaults.numberOfImages,
          aspectRatio: aspectRatio,
          styleImageConfig: {
            styleImage: {
              bytesBase64Encoded: this.styleReferenceBase64,
            },
            styleStrength: 0.8, // 0.0-1.0, higher = more faithful to reference
          },
        },
      };
    } else {
      // Generative Language API (no style reference)
      url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:predict?key=${CONFIG.apiKey}`;

      headers = {
        'Content-Type': 'application/json',
      };

      requestBody = {
        instances: [
          {
            prompt: prompt,
          },
        ],
        parameters: {
          sampleCount: CONFIG.defaults.numberOfImages,
          aspectRatio: aspectRatio,
          personGeneration: CONFIG.defaults.personGeneration,
          safetyFilterLevel: CONFIG.defaults.safetyFilterLevel,
        },
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`   ✗ API Error: ${data.error?.message || JSON.stringify(data)}`);

        // If style reference fails with Vertex AI, try without it
        if (shouldUseVertexAI) {
          console.log(`   ⟳ Retrying without style reference...`);
          return this.generateImage(promptConfig, false);
        }
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
            const variantFilename =
              i === 0 ? filename : filename.replace(/(\.[^.]+)$/, `-v${i + 1}$1`);

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

  async generateBatch(filter = null, useStyleRef = false) {
    console.log('\n========================================');
    console.log(`Generating ${filter || 'all'} images...`);
    if (useStyleRef && this.styleReferenceBase64) {
      console.log('🎨 Using style reference for consistency');
    }
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

      const success = await this.generateImage(config, useStyleRef);

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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage() {
  console.log(`
Ferni Asset Generator (Imagen 4.0)
==================================

Usage:
  node generate-assets.js [options]

Options:
  --key=<prompt-key>      Generate a specific image
  --batch=images          Generate ALL images
  --batch=avatars         Generate team avatars only
  --batch=hero            Generate hero backgrounds only
  --batch=testimonials    Generate testimonial backgrounds only
  --batch=social          Generate social/OG images only
  --style-ref=<path>      Use reference image for style consistency
  --list                  List all available prompts
  --help                  Show this help

Examples:
  export GOOGLE_API_KEY="your-key"
  
  # Basic generation
  node generate-assets.js --key=avatar-ferni
  node generate-assets.js --batch=avatars
  
  # WITH STYLE REFERENCE (recommended for consistency!)
  node generate-assets.js --batch=avatars --style-ref=images/generated/avatars/avatar-maya.png
  node generate-assets.js --key=avatar-ferni --style-ref=images/generated/avatars/avatar-maya.png

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
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };

  const batchType = getArg('batch');
  const promptKey = getArg('key');
  const styleRef = getArg('style-ref');

  // Load style reference if provided
  let useStyleRef = false;
  if (styleRef) {
    useStyleRef = generator.loadStyleReference(styleRef);
    if (useStyleRef) {
      console.log(`\n🎨 Style Reference Mode: ON`);
      console.log(`   All generated images will match the style of: ${path.basename(styleRef)}`);
    }
  }

  if (batchType) {
    const filterMap = {
      avatars: 'avatar-',
      hero: 'hero-',
      testimonials: 'testimonial-',
      social: 'social-',
      founders: 'founders-,seed-', // Founders Fund product images
      images: null, // all
    };

    const filter = filterMap[batchType];
    if (filter === undefined) {
      console.error(`Unknown batch type: ${batchType}`);
      console.log('Valid options: avatars, hero, testimonials, social, images');
      return;
    }

    const results = await generator.generateBatch(filter, useStyleRef);

    console.log('\n========================================');
    console.log('RESULTS');
    console.log('========================================');
    console.log(`✓ Success: ${results.success.length}`);
    console.log(`✗ Failed:  ${results.failed.length}`);
    if (useStyleRef) {
      console.log(`🎨 Style Reference: ${path.basename(styleRef)}`);
    }

    if (results.failed.length > 0) {
      console.log('\nFailed:');
      results.failed.forEach((k) => console.log(`  - ${k}`));
    }
  } else if (promptKey) {
    if (IMAGE_PROMPTS[promptKey]) {
      await generator.generateImage(IMAGE_PROMPTS[promptKey], useStyleRef);
    } else {
      console.error(`Unknown prompt key: ${promptKey}`);
      console.log('Use --list to see available keys');
    }
  } else {
    printUsage();
  }
}

main().catch(console.error);
