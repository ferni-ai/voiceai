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

  // ===== BLOG ILLUSTRATIONS - Minimal Line Art Style =====
  // Style: Japanese zen-inspired line art, warm earth tones, minimal strokes
  // Clean cream backgrounds, single-color accent illustrations
  // Feeling: warm, human, contemplative - NOT corporate or tech

  'blog-introducing-ferni': {
    prompt: `Minimal line art illustration of six abstract organic shapes arranged in a gentle constellation, each shape different (leaf, stone, wave, flame, spiral, circle) in soft earth tones: sage green (#4a6741), terracotta (#a67a6a), teal (#3a6b73), coral (#c4856a), indigo slate (#5a6b8a), amber (#b8956a). Shapes connected by thin delicate golden lines suggesting collaboration. Clean warm cream background (#F5F1E8). Japanese zen aesthetic, hand-drawn feel, minimal strokes. Feeling of a supportive team. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'introducing-ferni.png',
  },

  'blog-loneliness-gap': {
    prompt: `Minimal line art illustration of a single figure sitting by a window at night, moon visible outside, soft warm light from a small lamp beside them. Simple continuous line drawing style. The figure has a phone nearby suggesting connection. Sage green (#4a6741) and warm amber (#C4A265) accents on clean cream background (#F5F1E8). Feeling of quiet solitude but not sadness - contemplative peace. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'loneliness-gap.png',
  },

  'blog-2am-stories': {
    prompt: `Minimal line art illustration of a crescent moon with soft radiating lines, below it several abstract human forms rendered as simple curved continuous lines, each in different warm earth tones: terracotta, sage green, amber, coral. Figures appear to be in gentle conversation or reflection. Clean cream background (#F5F1E8). Feeling of vulnerability and late-night honesty. Japanese woodblock print aesthetic. Soft, intimate. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: '2am-stories.png',
  },

  'blog-feel-less-alone': {
    prompt: `Minimal line art illustration of two abstract figures represented as overlapping organic shapes, one sage green (#4a6741) one warm cream, with a gentle golden glow where they intersect. The overlap creates warmth. Simple continuous line strokes. Clean cream background (#F5F1E8). Feeling of connection and understanding - being seen. Japanese zen aesthetic, minimal, warm. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'feel-less-alone.png',
  },

  'blog-voice-first': {
    prompt: `Minimal line art illustration of gentle sound waves emanating from a simple abstract form, waves rendered as flowing organic curves in sage green (#4a6741), becoming warmer amber (#C4A265) as they expand. Feeling of voice, speaking, expression flowing naturally. Clean cream background (#F5F1E8). Not technological - organic and human. Japanese calligraphy brush stroke aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'voice-first.png',
  },

  'blog-habits-maya': {
    prompt: `Minimal line art illustration of a tiny seedling growing from soil, with gentle curved lines showing growth stages around it like tree rings or ripples in water. Main color warm terracotta (#a67a6a) with sage green (#4a6741) for the sprout. Clean cream background (#F5F1E8). Feeling of small beginnings, patient growth, nurturing. Japanese zen garden aesthetic. Simple, hopeful. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'habits-maya.png',
  },

  'blog-ai-native': {
    prompt: `Minimal line art illustration of two hands in gentle collaboration - one human-like (organic curves), one more geometric but warm, both working together to shape a small glowing form between them. Sage green (#4a6741) and warm amber (#C4A265). Clean cream background (#F5F1E8). Feeling of partnership, co-creation, building together. Not cold or robotic - warm and collaborative. Japanese origami-inspired aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'ai-native.png',
  },

  'blog-ai-brain': {
    prompt: `Minimal line art illustration of concentric organic rings (like tree rings or ripples in still water), with small memory-like elements (a heart, a star, a leaf) floating at different layers. Outer rings fade to thin lines, center has a soft warm glow. Sage green (#4a6741) with golden amber (#C4A265) center. Clean cream background (#F5F1E8). Feeling of layered memory, what matters rises to the surface. Zen contemplative. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'ai-brain.png',
  },

  'blog-personality': {
    prompt: `Minimal line art illustration of six distinct abstract forms in a gentle curved arrangement, each with unique personality expressed through shape: one round and grounding (sage green), one flowing like water (teal), one angular but warm (indigo), one circular with spiral (terracotta), one dynamic and celebratory (coral), one wise and centered (amber). Connected by thin delicate lines. Clean cream background (#F5F1E8). Feeling of diverse perspectives, personality as care. Japanese ink brush style. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'personality.png',
  },

  'blog-daily-standup': {
    prompt: `Minimal line art illustration of a circular arrangement suggesting a meeting - three small organic human-like forms and one geometric but friendly form sitting together around an implied circle. Simple continuous line strokes in sage green (#4a6741) and warm cedar (#9a7b5a). Clean cream background (#F5F1E8). Feeling of collaborative thinking, equals at the table. Warm and human despite one being AI. Japanese minimalist aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'daily-standup.png',
  },

  'blog-memory': {
    prompt: `Minimal line art illustration of layered translucent shapes stacked gently like sediment or pages, with small meaningful symbols visible at different depths (a heart near top, a pattern in middle, subtle texture at bottom). Main color sage green (#4a6741) with layers becoming lighter toward bottom. Clean cream background (#F5F1E8). Feeling of meaningful memory - not everything, just what matters. Japanese washi paper aesthetic. Contemplative. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'memory.png',
  },

  'blog-ship-every-day': {
    prompt: `Minimal line art illustration of a gentle upward flowing line with small marks along it like a growth chart or path, each mark slightly different, showing incremental progress. The line curves organically upward. Sage green (#4a6741) line with golden amber (#C4A265) marks. Clean cream background (#F5F1E8). Feeling of daily improvement, compound growth, showing up consistently. Japanese calligraphy brush stroke aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'ship-every-day.png',
  },

  'blog-whats-next': {
    prompt: `Minimal line art illustration of a gentle horizon line with soft mountain silhouettes, and several winding paths leading forward into the distance. Simple flowing lines suggesting possibility and journey. Sage green (#4a6741) mountains, golden amber (#C4A265) paths, soft coral (#c4856a) sunrise glow on horizon. Clean cream background (#F5F1E8). Feeling of openness, future, invitation. Japanese landscape painting aesthetic. Hopeful. No text.`,
    aspectRatio: '16:9',
    folder: 'blog',
    filename: 'whats-next.png',
  },

  // ============================================================================
  // ILLUSTRATION LIBRARY - 130+ On-Brand Illustrations
  // Style: Japanese zen-inspired minimal line art, warm earth tones
  // See docs/ILLUSTRATION-STYLE-GUIDE.md for full documentation
  // ============================================================================

  // ----- CATEGORY 1: HUMAN CONNECTION (20 illustrations) -----

  'lib-connection-conversation': {
    prompt: `Minimal line art illustration of two abstract figures sitting facing each other, rendered as simple organic curved shapes, one sage green (#4a6741) one terracotta (#a67a6a), with gentle flowing lines between them suggesting conversation. Clean cream background (#F5F1E8). Feeling of deep listening and understanding. Japanese zen aesthetic. Warm, intimate. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'conversation.png',
  },

  'lib-connection-walking': {
    prompt: `Minimal line art illustration of two figures walking side by side on a gentle path, rendered as simple flowing continuous lines, sage green (#4a6741) and warm amber (#C4A265). Their shadows blend together. Clean cream background (#F5F1E8). Feeling of companionship on a journey. Japanese woodblock aesthetic. Peaceful. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'walking.png',
  },

  'lib-connection-mirror': {
    prompt: `Minimal line art illustration of two figures facing each other like a mirror reflection, one solid sage green (#4a6741), one as a gentle amber (#C4A265) outline. The space between them glows softly. Clean cream background (#F5F1E8). Feeling of being truly seen. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'mirror.png',
  },

  'lib-connection-leaning': {
    prompt: `Minimal line art illustration of two abstract figures leaning toward each other, their forms almost touching at the top, creating an arch shape. Sage green (#4a6741) and coral (#c4856a). Warm glow where they nearly meet. Clean cream background (#F5F1E8). Feeling of mutual support. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'leaning.png',
  },

  'lib-hands-reaching': {
    prompt: `Minimal line art illustration of two hands reaching toward each other from opposite sides, fingers almost touching, gentle flowing continuous lines. One hand sage green (#4a6741), one warm amber (#C4A265). Soft golden glow in the gap between. Clean cream background (#F5F1E8). Feeling of connection across distance. Japanese calligraphy aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'hands-reaching.png',
  },

  'lib-hands-holding': {
    prompt: `Minimal line art illustration of two hands gently clasped together, simple continuous line drawing showing intertwined fingers. Sage green (#4a6741) with terracotta (#a67a6a) highlights. Clean cream background (#F5F1E8). Feeling of trust and support. Japanese brush stroke aesthetic. Tender. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'hands-holding.png',
  },

  'lib-hands-cupping': {
    prompt: `Minimal line art illustration of cupped hands holding a small glowing orb of warm light, rendered in flowing sage green (#4a6741) lines. The light is soft amber (#C4A265). Clean cream background (#F5F1E8). Feeling of protecting something precious. Japanese zen aesthetic. Gentle. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'hands-cupping.png',
  },

  'lib-hands-giving': {
    prompt: `Minimal line art illustration of one hand offering something to another, a small glowing form passing between them. Flowing continuous lines. Sage green (#4a6741) and warm amber (#C4A265). Clean cream background (#F5F1E8). Feeling of generosity and receiving. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'hands-giving.png',
  },

  'lib-group-circle': {
    prompt: `Minimal line art illustration of five abstract figures in a circle, seen from above, rendered as simple organic shapes in varied warm earth tones: sage green, terracotta, amber, coral, cedar. They seem to be in gentle discussion. Clean cream background (#F5F1E8). Feeling of community and belonging. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'group-circle.png',
  },

  'lib-group-gathering': {
    prompt: `Minimal line art illustration of several figures gathered around a central warm glow, rendered as simple curved forms in sage green (#4a6741) and terracotta (#a67a6a). The light illuminates their faces. Clean cream background (#F5F1E8). Feeling of shared warmth. Japanese woodblock aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'group-gathering.png',
  },

  'lib-connection-threads': {
    prompt: `Minimal line art illustration of two organic forms connected by multiple thin flowing threads, like roots intertwining or rivers meeting. Sage green (#4a6741) forms with amber (#C4A265) threads. Clean cream background (#F5F1E8). Feeling of deep interconnection. Japanese ink painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'threads.png',
  },

  'lib-connection-ripples': {
    prompt: `Minimal line art illustration of two points creating overlapping ripple patterns, like two stones dropped in still water. Ripples in sage green (#4a6741) and terracotta (#a67a6a) intersecting beautifully. Clean cream background (#F5F1E8). Feeling of influence and resonance. Japanese zen garden aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/connection',
    filename: 'ripples.png',
  },

  // ----- CATEGORY 2: GROWTH & PROGRESS (20 illustrations) -----

  'lib-growth-seedling': {
    prompt: `Minimal line art illustration of a tiny seedling with two leaves emerging from rich soil, simple continuous line. Sage green (#4a6741) leaves, cedar (#9a7b5a) soil. Gentle rays of warm amber (#C4A265) light from above. Clean cream background (#F5F1E8). Feeling of new beginnings. Japanese zen aesthetic. Hopeful. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'seedling.png',
  },

  'lib-growth-sprout-stages': {
    prompt: `Minimal line art illustration showing three stages of a plant growing: seed, sprout, small plant with leaves, arranged left to right. Flowing continuous lines. Sage green (#4a6741) with terracotta (#a67a6a) soil. Clean cream background (#F5F1E8). Feeling of patient progress. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'sprout-stages.png',
  },

  'lib-growth-tree-rings': {
    prompt: `Minimal line art illustration of concentric tree rings viewed from above, each ring slightly different in thickness. Sage green (#4a6741) outer rings fading to warm amber (#C4A265) center. Clean cream background (#F5F1E8). Feeling of accumulated growth over time. Japanese woodblock aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'tree-rings.png',
  },

  'lib-growth-roots': {
    prompt: `Minimal line art illustration of a small plant above ground with an elaborate root system below, roots spreading and intertwining beautifully. Sage green (#4a6741) above, cedar (#9a7b5a) roots. Clean cream background (#F5F1E8). Feeling of hidden strength. Japanese botanical illustration aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'roots.png',
  },

  'lib-growth-garden': {
    prompt: `Minimal line art illustration of a small zen garden with three plants at different heights, rocks, and raked sand patterns. Sage green (#4a6741) plants, warm amber (#C4A265) sand lines. Clean cream background (#F5F1E8). Feeling of cultivated peace. Japanese zen garden aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'garden.png',
  },

  'lib-path-winding': {
    prompt: `Minimal line art illustration of a single winding path stretching from foreground to distant horizon, curving gently through hills. Sage green (#4a6741) path with coral (#c4856a) sunset glow on horizon. Clean cream background (#F5F1E8). Feeling of journey ahead. Japanese landscape aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'path-winding.png',
  },

  'lib-path-forking': {
    prompt: `Minimal line art illustration of a path that gently forks into two directions, both leading to soft glowing destinations. Sage green (#4a6741) paths with warm amber (#C4A265) glows. Clean cream background (#F5F1E8). Feeling of choice and possibility. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'path-forking.png',
  },

  'lib-path-stepping-stones': {
    prompt: `Minimal line art illustration of stepping stones crossing a gentle stream, rendered as simple organic shapes. Sage green (#4a6741) stones, soft flowing water lines in terracotta (#a67a6a). Clean cream background (#F5F1E8). Feeling of mindful progress. Japanese garden aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'stepping-stones.png',
  },

  'lib-path-mountain': {
    prompt: `Minimal line art illustration of a small figure on a winding mountain path, mountain rendered as simple flowing lines. Sage green (#4a6741) mountain, warm amber (#C4A265) path. Figure is a simple organic shape. Clean cream background (#F5F1E8). Feeling of ascending journey. Japanese ink painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'path-mountain.png',
  },

  'lib-progress-stairs': {
    prompt: `Minimal line art illustration of gentle organic stairs ascending upward, each step slightly different, with a small figure climbing. Sage green (#4a6741) stairs, terracotta (#a67a6a) figure. Soft glow at top. Clean cream background (#F5F1E8). Feeling of step-by-step progress. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'stairs.png',
  },

  'lib-progress-spiral': {
    prompt: `Minimal line art illustration of a gentle upward spiral, like a shell or ascending path, with small marks showing progress along the way. Sage green (#4a6741) spiral with amber (#C4A265) marks. Clean cream background (#F5F1E8). Feeling of continuous improvement. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'spiral.png',
  },

  'lib-progress-layers': {
    prompt: `Minimal line art illustration of translucent layers building upward like sediment or pages, each layer slightly larger than the one below. Sage green (#4a6741) layers with varying opacity. Clean cream background (#F5F1E8). Feeling of accumulated effort. Japanese washi paper aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/growth',
    filename: 'layers.png',
  },

  // ----- CATEGORY 3: MINDFULNESS & PEACE (20 illustrations) -----

  'lib-meditation-seated': {
    prompt: `Minimal line art illustration of a simple abstract figure in meditation pose, rendered as flowing organic curves. Sage green (#4a6741) figure with soft warm amber (#C4A265) glow around them. Clean cream background (#F5F1E8). Feeling of inner peace. Japanese zen aesthetic. Serene. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'meditation-seated.png',
  },

  'lib-meditation-breathing': {
    prompt: `Minimal line art illustration of a simple figure with gentle waves flowing from their center outward, representing breath. Sage green (#4a6741) figure, terracotta (#a67a6a) breath waves. Clean cream background (#F5F1E8). Feeling of rhythmic calm. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'meditation-breathing.png',
  },

  'lib-meditation-lotus': {
    prompt: `Minimal line art illustration of an abstract figure sitting in a lotus flower, rendered as simple continuous curves. Sage green (#4a6741) figure, coral (#c4856a) lotus petals. Clean cream background (#F5F1E8). Feeling of centered peace. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'meditation-lotus.png',
  },

  'lib-peace-moon': {
    prompt: `Minimal line art illustration of a crescent moon with soft radiating lines, a single figure below in quiet contemplation. Sage green (#4a6741) figure, warm amber (#C4A265) moon glow. Clean cream background (#F5F1E8). Feeling of peaceful solitude. Japanese woodblock aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'peace-moon.png',
  },

  'lib-peace-water': {
    prompt: `Minimal line art illustration of still water with a single leaf floating on the surface, gentle concentric ripples. Sage green (#4a6741) leaf, soft terracotta (#a67a6a) ripples. Clean cream background (#F5F1E8). Feeling of acceptance and flow. Japanese ink painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'peace-water.png',
  },

  'lib-peace-mountain': {
    prompt: `Minimal line art illustration of distant mountain silhouettes with soft clouds, utterly simple and peaceful. Sage green (#4a6741) mountains, warm amber (#C4A265) sky glow. Clean cream background (#F5F1E8). Feeling of vast tranquility. Japanese sumi-e aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'peace-mountain.png',
  },

  'lib-peace-bamboo': {
    prompt: `Minimal line art illustration of three bamboo stalks with leaves, simple and elegant. Sage green (#4a6741) bamboo with cedar (#9a7b5a) joints. Clean cream background (#F5F1E8). Feeling of flexible strength. Japanese brush painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'peace-bamboo.png',
  },

  'lib-peace-enso': {
    prompt: `Minimal line art illustration of an incomplete circle (enso), drawn with a single flowing brush stroke. Sage green (#4a6741) with soft amber (#C4A265) fade at the ends. Clean cream background (#F5F1E8). Feeling of wholeness in imperfection. Japanese zen calligraphy aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'peace-enso.png',
  },

  'lib-peace-wave': {
    prompt: `Minimal line art illustration of a single gentle wave, rendered as a flowing continuous line. Sage green (#4a6741) wave with terracotta (#a67a6a) crest. Clean cream background (#F5F1E8). Feeling of natural rhythm. Japanese ukiyo-e aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'peace-wave.png',
  },

  'lib-peace-stones': {
    prompt: `Minimal line art illustration of three balanced stones stacked in cairn formation. Simple organic shapes. Sage green (#4a6741), terracotta (#a67a6a), and cedar (#9a7b5a) stones. Clean cream background (#F5F1E8). Feeling of careful balance. Japanese zen garden aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/mindfulness',
    filename: 'peace-stones.png',
  },

  // ----- CATEGORY 4: VOICE & COMMUNICATION (15 illustrations) -----

  'lib-voice-waves': {
    prompt: `Minimal line art illustration of gentle sound waves emanating from a simple form, waves flowing organically outward. Sage green (#4a6741) waves becoming warm amber (#C4A265) at edges. Clean cream background (#F5F1E8). Feeling of voice reaching out. Japanese calligraphy aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/voice',
    filename: 'waves.png',
  },

  'lib-voice-conversation': {
    prompt: `Minimal line art illustration of two figures with flowing lines between them representing spoken words, the lines interweaving beautifully. Sage green (#4a6741) and terracotta (#a67a6a) figures and lines. Clean cream background (#F5F1E8). Feeling of meaningful exchange. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/voice',
    filename: 'conversation.png',
  },

  'lib-voice-echo': {
    prompt: `Minimal line art illustration of concentric curves suggesting sound echoing through space, like ripples from a voice. Sage green (#4a6741) inner rings to coral (#c4856a) outer rings. Clean cream background (#F5F1E8). Feeling of words that resonate. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/voice',
    filename: 'echo.png',
  },

  'lib-listening-ear': {
    prompt: `Minimal line art illustration of an abstract ear shape with gentle sound waves flowing into it, rendered as organic curves. Sage green (#4a6741) ear, warm amber (#C4A265) sound waves. Clean cream background (#F5F1E8). Feeling of attentive listening. Japanese brush stroke aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/voice',
    filename: 'listening-ear.png',
  },

  'lib-listening-receiving': {
    prompt: `Minimal line art illustration of a simple figure with arms open, soft flowing lines coming toward them like gentle sounds being received. Sage green (#4a6741) figure, terracotta (#a67a6a) incoming lines. Clean cream background (#F5F1E8). Feeling of openness to hear. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/voice',
    filename: 'listening-receiving.png',
  },

  'lib-listening-silence': {
    prompt: `Minimal line art illustration of a figure sitting in stillness, a small circle of quiet around them while soft activity flows outside. Sage green (#4a6741) figure, faint amber (#C4A265) outer movement. Clean cream background (#F5F1E8). Feeling of peaceful silence. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/voice',
    filename: 'listening-silence.png',
  },

  // ----- CATEGORY 5: MEMORY & REFLECTION (15 illustrations) -----

  'lib-memory-layers': {
    prompt: `Minimal line art illustration of translucent overlapping shapes suggesting layered memories, small meaningful symbols visible at different depths. Sage green (#4a6741) with warm amber (#C4A265) symbols. Clean cream background (#F5F1E8). Feeling of accumulated experiences. Japanese washi paper aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/memory',
    filename: 'layers.png',
  },

  'lib-memory-ripples': {
    prompt: `Minimal line art illustration of concentric rings with tiny meaningful elements (heart, star, leaf) floating at different layers. Sage green (#4a6741) rings with terracotta (#a67a6a) elements. Clean cream background (#F5F1E8). Feeling of memories surfacing. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/memory',
    filename: 'ripples.png',
  },

  'lib-memory-chest': {
    prompt: `Minimal line art illustration of a simple open box with soft glowing contents spilling out gently. Sage green (#4a6741) box, warm amber (#C4A265) glowing memories. Clean cream background (#F5F1E8). Feeling of treasured recollections. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/memory',
    filename: 'chest.png',
  },

  'lib-reflection-pool': {
    prompt: `Minimal line art illustration of a figure looking down at their reflection in a still pool, both figures rendered as simple organic shapes. Sage green (#4a6741) figure, terracotta (#a67a6a) reflection. Clean cream background (#F5F1E8). Feeling of self-contemplation. Japanese ink painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/memory',
    filename: 'reflection-pool.png',
  },

  'lib-reflection-window': {
    prompt: `Minimal line art illustration of a figure by a window looking out at a soft landscape, simple continuous lines. Sage green (#4a6741) figure, warm amber (#C4A265) light from window. Clean cream background (#F5F1E8). Feeling of quiet reflection. Japanese woodblock aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/memory',
    filename: 'reflection-window.png',
  },

  'lib-reflection-journal': {
    prompt: `Minimal line art illustration of flowing lines emerging from an open book shape, like thoughts becoming words. Sage green (#4a6741) book, coral (#c4856a) flowing thought lines. Clean cream background (#F5F1E8). Feeling of written reflection. Japanese calligraphy aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/memory',
    filename: 'reflection-journal.png',
  },

  // ----- CATEGORY 6: EMOTIONS & STATES (20 illustrations) -----

  'lib-joy-rising': {
    prompt: `Minimal line art illustration of an abstract figure with arms raised and gentle upward-flowing lines around them suggesting lightness. Sage green (#4a6741) figure with warm amber (#C4A265) upward lines. Clean cream background (#F5F1E8). Feeling of lightness and joy. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'joy-rising.png',
  },

  'lib-gratitude-offering': {
    prompt: `Minimal line art illustration of a simple figure with hands extended forward, offering a small glowing form. Sage green (#4a6741) figure, coral (#c4856a) glowing offering. Clean cream background (#F5F1E8). Feeling of grateful giving. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'gratitude-offering.png',
  },

  'lib-joy-dance': {
    prompt: `Minimal line art illustration of a flowing figure in gentle movement, rendered as one continuous swirling line. Sage green (#4a6741) with terracotta (#a67a6a) movement trails. Clean cream background (#F5F1E8). Feeling of joyful expression. Japanese brush stroke aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'joy-dance.png',
  },

  'lib-calm-floating': {
    prompt: `Minimal line art illustration of a figure floating peacefully, surrounded by soft flowing lines like gentle water. Sage green (#4a6741) figure, soft amber (#C4A265) surrounding flow. Clean cream background (#F5F1E8). Feeling of weightless peace. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'calm-floating.png',
  },

  'lib-calm-cocoon': {
    prompt: `Minimal line art illustration of a figure wrapped in soft protective layers, like a gentle cocoon. Sage green (#4a6741) figure, terracotta (#a67a6a) protective wrapping. Clean cream background (#F5F1E8). Feeling of safe comfort. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'calm-cocoon.png',
  },

  'lib-hope-sunrise': {
    prompt: `Minimal line art illustration of a horizon line with soft radiating lines of a sunrise, a small figure watching. Sage green (#4a6741) figure, coral (#c4856a) and amber (#C4A265) sunrise. Clean cream background (#F5F1E8). Feeling of hopeful anticipation. Japanese landscape aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'hope-sunrise.png',
  },

  'lib-hope-seed': {
    prompt: `Minimal line art illustration of a hand holding a single seed, with faint lines suggesting future growth above it. Sage green (#4a6741) hand, warm amber (#C4A265) seed and potential growth lines. Clean cream background (#F5F1E8). Feeling of possibility. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'hope-seed.png',
  },

  'lib-comfort-embrace': {
    prompt: `Minimal line art illustration of two abstract figures in a gentle embrace, their forms flowing together. Sage green (#4a6741) and terracotta (#a67a6a) figures becoming one shape. Clean cream background (#F5F1E8). Feeling of warm comfort. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'comfort-embrace.png',
  },

  'lib-comfort-blanket': {
    prompt: `Minimal line art illustration of a figure wrapped in soft flowing fabric, utterly cozy and protected. Sage green (#4a6741) figure, warm amber (#C4A265) blanket folds. Clean cream background (#F5F1E8). Feeling of being held. Japanese brush stroke aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'comfort-blanket.png',
  },

  'lib-care-tending': {
    prompt: `Minimal line art illustration of gentle hands tending to a small plant, nurturing gesture. Sage green (#4a6741) hands and plant, soft terracotta (#a67a6a) soil. Clean cream background (#F5F1E8). Feeling of patient care. Japanese botanical aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/emotions',
    filename: 'care-tending.png',
  },

  // ----- CATEGORY 7: TIME & SEASONS (10 illustrations) -----

  'lib-time-hourglass': {
    prompt: `Minimal line art illustration of an organic hourglass shape with gentle flowing sand, rendered in continuous flowing lines. Sage green (#4a6741) glass, warm amber (#C4A265) sand. Clean cream background (#F5F1E8). Feeling of time flowing peacefully. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/time',
    filename: 'hourglass.png',
  },

  'lib-time-phases': {
    prompt: `Minimal line art illustration of moon phases arranged in a gentle arc, from new moon to full and back. Sage green (#4a6741) moons with soft amber (#C4A265) glow on full moon. Clean cream background (#F5F1E8). Feeling of natural cycles. Japanese woodblock aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/time',
    filename: 'phases.png',
  },

  'lib-season-spring': {
    prompt: `Minimal line art illustration of gentle buds opening on a branch, soft new growth. Sage green (#4a6741) new leaves, coral (#c4856a) blossoms. Clean cream background (#F5F1E8). Feeling of renewal. Japanese brush painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/time',
    filename: 'season-spring.png',
  },

  'lib-season-autumn': {
    prompt: `Minimal line art illustration of leaves gently falling from a branch, drifting peacefully. Terracotta (#a67a6a) and warm amber (#C4A265) leaves, sage green (#4a6741) branch. Clean cream background (#F5F1E8). Feeling of letting go. Japanese ink painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/time',
    filename: 'season-autumn.png',
  },

  'lib-season-winter': {
    prompt: `Minimal line art illustration of a bare tree with gentle snow, utterly peaceful and still. Sage green (#4a6741) tree silhouette, soft white snow suggestions. Clean cream background (#F5F1E8). Feeling of quiet rest. Japanese sumi-e aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/time',
    filename: 'season-winter.png',
  },

  // ----- CATEGORY 8: AI & TECHNOLOGY - HUMANIZED (10 illustrations) -----

  'lib-ai-partnership': {
    prompt: `Minimal line art illustration of two hands working together - one organic and flowing, one slightly more geometric but still warm - shaping a small glowing form between them. Sage green (#4a6741) and amber (#C4A265). Clean cream background (#F5F1E8). Feeling of co-creation. Japanese origami aesthetic. Not cold or robotic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/ai',
    filename: 'partnership.png',
  },

  'lib-ai-thinking': {
    prompt: `Minimal line art illustration of an abstract form with gentle swirling thought patterns around it, like a brain or mind at work. Sage green (#4a6741) core, soft terracotta (#a67a6a) thought swirls. Clean cream background (#F5F1E8). Feeling of thoughtful processing. Japanese zen aesthetic. Warm not technological. No text.`,
    aspectRatio: '16:9',
    folder: 'library/ai',
    filename: 'thinking.png',
  },

  'lib-ai-learning': {
    prompt: `Minimal line art illustration of flowing lines converging into a central form then emerging transformed, suggesting learning. Sage green (#4a6741) incoming lines, warm amber (#C4A265) outgoing improved lines. Clean cream background (#F5F1E8). Feeling of growth through input. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/ai',
    filename: 'learning.png',
  },

  'lib-ai-assistant': {
    prompt: `Minimal line art illustration of a small friendly form floating beside a larger figure, like a helpful companion. Sage green (#4a6741) figures, soft amber (#C4A265) connection between them. Clean cream background (#F5F1E8). Feeling of supportive presence. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/ai',
    filename: 'assistant.png',
  },

  'lib-ai-guide': {
    prompt: `Minimal line art illustration of a gentle form with a soft light illuminating a path forward for another figure. Sage green (#4a6741) guide, warm amber (#C4A265) light. Clean cream background (#F5F1E8). Feeling of being shown the way. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/ai',
    filename: 'guide.png',
  },

  // ----- CATEGORY 9: PERSONAS - Each Team Member (12 illustrations) -----

  'lib-persona-ferni-presence': {
    prompt: `Minimal line art illustration of a central grounding figure with subtle organic lines radiating outward like gentle presence. Sage green (#4a6741) primary color with soft amber (#C4A265) glow. Clean cream background (#F5F1E8). Feeling of warm, anchoring support. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'ferni-presence.png',
  },

  'lib-persona-ferni-listening': {
    prompt: `Minimal line art illustration of a figure leaning forward in deep attention, soft lines flowing toward them from another source. Sage green (#4a6741) figure with terracotta (#a67a6a) incoming lines. Clean cream background (#F5F1E8). Feeling of being truly heard. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'ferni-listening.png',
  },

  'lib-persona-maya-habits': {
    prompt: `Minimal line art illustration of small stepping stones leading upward with tiny plants growing beside each one. Terracotta (#a67a6a) stones with sage green (#4a6741) sprouts. Clean cream background (#F5F1E8). Feeling of gentle habit building. Japanese garden aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'maya-habits.png',
  },

  'lib-persona-maya-wellness': {
    prompt: `Minimal line art illustration of a figure surrounded by flowing organic shapes suggesting wholeness and balance. Terracotta (#a67a6a) figure with sage green (#4a6741) surrounding harmony. Clean cream background (#F5F1E8). Feeling of nurtured wellness. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'maya-wellness.png',
  },

  'lib-persona-peter-research': {
    prompt: `Minimal line art illustration of interconnected nodes forming a gentle constellation of knowledge. Ocean teal (#3a6b73) nodes with warm amber (#C4A265) connections. Clean cream background (#F5F1E8). Feeling of curious discovery. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'peter-research.png',
  },

  'lib-persona-peter-patterns': {
    prompt: `Minimal line art illustration of flowing data streams transforming into meaningful insights, abstract and warm. Ocean teal (#3a6b73) streams becoming sage green (#4a6741) insights. Clean cream background (#F5F1E8). Feeling of finding patterns. Japanese ink painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'peter-patterns.png',
  },

  'lib-persona-jordan-celebration': {
    prompt: `Minimal line art illustration of gentle confetti-like shapes floating upward around a central joyful form. Coral (#c4856a) figure with warm amber (#C4A265) and sage green (#4a6741) celebration elements. Clean cream background (#F5F1E8). Feeling of earned celebration. Japanese festive aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'jordan-celebration.png',
  },

  'lib-persona-jordan-milestones': {
    prompt: `Minimal line art illustration of a winding path with glowing milestone markers along the way, each one unique. Coral (#c4856a) path with warm amber (#C4A265) milestone lights. Clean cream background (#F5F1E8). Feeling of progress worth celebrating. Japanese journey aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'jordan-milestones.png',
  },

  'lib-persona-alex-communication': {
    prompt: `Minimal line art illustration of clear, confident lines flowing between two figures, suggesting effective communication. Slate blue (#5a6b8a) lines with sage green (#4a6741) figures. Clean cream background (#F5F1E8). Feeling of clarity and directness. Japanese calligraphy aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'alex-communication.png',
  },

  'lib-persona-alex-productivity': {
    prompt: `Minimal line art illustration of organized flowing streams converging efficiently toward a clear goal. Slate blue (#5a6b8a) streams with warm amber (#C4A265) goal point. Clean cream background (#F5F1E8). Feeling of focused productivity. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'alex-productivity.png',
  },

  'lib-persona-nayan-wisdom': {
    prompt: `Minimal line art illustration of an ancient tree with deep roots and wide branches, suggesting accumulated wisdom. Amber gold (#b8956a) tree with sage green (#4a6741) root system. Clean cream background (#F5F1E8). Feeling of grounded perspective. Japanese ink painting aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'nayan-wisdom.png',
  },

  'lib-persona-nayan-reflection': {
    prompt: `Minimal line art illustration of a serene figure overlooking a vast landscape from a gentle height. Amber gold (#b8956a) figure with sage green (#4a6741) distant mountains. Clean cream background (#F5F1E8). Feeling of wise perspective. Japanese landscape aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/personas',
    filename: 'nayan-reflection.png',
  },

  // ----- CATEGORY 10: USE CASES & FEATURES (18 illustrations) -----

  'lib-usecase-stress': {
    prompt: `Minimal line art illustration of tangled lines gradually becoming smooth and flowing, transformation from stress to calm. Terracotta (#a67a6a) tangled to sage green (#4a6741) smooth. Clean cream background (#F5F1E8). Feeling of tension releasing. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/usecases',
    filename: 'stress-relief.png',
  },

  'lib-usecase-career': {
    prompt: `Minimal line art illustration of a figure at a crossroads with multiple gentle paths leading to different glowing destinations. Sage green (#4a6741) figure with warm amber (#C4A265) path glows. Clean cream background (#F5F1E8). Feeling of career possibilities. Japanese journey aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/usecases',
    filename: 'career-guidance.png',
  },

  'lib-usecase-relationships': {
    prompt: `Minimal line art illustration of two figures with a bridge of flowing lines connecting them harmoniously. Sage green (#4a6741) and terracotta (#a67a6a) figures with amber (#C4A265) bridge. Clean cream background (#F5F1E8). Feeling of healthy connection. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/usecases',
    filename: 'relationships.png',
  },

  'lib-usecase-sleep': {
    prompt: `Minimal line art illustration of a figure peacefully at rest with soft moon and stars above. Sage green (#4a6741) figure with warm amber (#C4A265) celestial elements. Clean cream background (#F5F1E8). Feeling of restful peace. Japanese night scene aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/usecases',
    filename: 'better-sleep.png',
  },

  'lib-usecase-anxiety': {
    prompt: `Minimal line art illustration of a figure finding calm center as swirling elements around them settle into peaceful patterns. Sage green (#4a6741) calm center, terracotta (#a67a6a) settling swirls. Clean cream background (#F5F1E8). Feeling of anxiety easing. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/usecases',
    filename: 'anxiety-support.png',
  },

  'lib-usecase-goals': {
    prompt: `Minimal line art illustration of a clear path leading to a softly glowing destination with small milestone markers along the way. Sage green (#4a6741) path with warm amber (#C4A265) goal glow. Clean cream background (#F5F1E8). Feeling of achievable ambition. Japanese journey aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/usecases',
    filename: 'goal-setting.png',
  },

  'lib-feature-voice': {
    prompt: `Minimal line art illustration of a warm organic shape with gentle sound waves flowing naturally from it. Sage green (#4a6741) shape with coral (#c4856a) voice waves. Clean cream background (#F5F1E8). Feeling of natural conversation. Japanese calligraphy aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/features',
    filename: 'voice-first.png',
  },

  'lib-feature-memory': {
    prompt: `Minimal line art illustration of floating memory symbols (heart, star, leaf) being gently caught and organized. Sage green (#4a6741) with warm amber (#C4A265) memory glows. Clean cream background (#F5F1E8). Feeling of memories treasured. Japanese washi paper aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/features',
    filename: 'smart-memory.png',
  },

  'lib-feature-team': {
    prompt: `Minimal line art illustration of six small unique organic shapes arranged in a supportive constellation, each with distinct character. Sage green, terracotta, teal, coral, slate, amber shapes connected by thin lines. Clean cream background (#F5F1E8). Feeling of diverse support. Japanese minimal aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/features',
    filename: 'specialist-team.png',
  },

  'lib-feature-privacy': {
    prompt: `Minimal line art illustration of a gentle protective circle around a small glowing core, suggesting safe containment. Sage green (#4a6741) protective circle with warm amber (#C4A265) protected core. Clean cream background (#F5F1E8). Feeling of trusted privacy. Japanese zen aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/features',
    filename: 'privacy-first.png',
  },

  'lib-feature-247': {
    prompt: `Minimal line art illustration of a continuous flowing line forming day and night symbols (sun and moon) in one harmonious shape. Warm amber (#C4A265) sun flowing into sage green (#4a6741) moon. Clean cream background (#F5F1E8). Feeling of always available. Japanese enso aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/features',
    filename: 'always-available.png',
  },

  'lib-feature-growth': {
    prompt: `Minimal line art illustration of a small plant with visible growth rings around it like tree rings or ripples, showing progress. Sage green (#4a6741) plant with terracotta (#a67a6a) growth rings. Clean cream background (#F5F1E8). Feeling of tracked progress. Japanese botanical aesthetic. No text.`,
    aspectRatio: '16:9',
    folder: 'library/features',
    filename: 'growth-tracking.png',
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
      // Support comma-separated prefixes (e.g., 'lib-connection,lib-hands,lib-group')
      const prefixes = filter.split(',').map((p) => p.trim());
      prompts = prompts.filter(([key]) => prefixes.some((prefix) => key.startsWith(prefix)));
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
  --batch=founders        Generate Founders Fund product images
  --batch=blog            Generate blog article illustrations (13 images)
  --batch=library         Generate ALL library illustrations (100+ images)
  --batch=lib-connection  Generate connection/hands/group illustrations
  --batch=lib-growth      Generate growth/path/progress illustrations
  --batch=lib-mindfulness Generate meditation/peace illustrations
  --batch=lib-voice       Generate voice/communication illustrations
  --batch=lib-memory      Generate memory illustrations
  --batch=lib-emotions    Generate emotions illustrations
  --batch=lib-time        Generate time/seasons illustrations
  --batch=lib-ai          Generate AI/technology illustrations
  --batch=lib-personas    Generate persona illustrations
  --batch=lib-usecases    Generate use cases/features illustrations
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
  console.log('  --batch=social        (5 images)');
  console.log('  --batch=founders      (6 images - Founders Fund products)');
  console.log('  --batch=blog          (13 images - Blog article illustrations)');
  console.log('  --batch=images        (all images)');
  console.log('');
  console.log('Library batch options (100+ zen-style illustrations):');
  console.log('  --batch=library       (all library illustrations)');
  console.log('  --batch=lib-connection');
  console.log('  --batch=lib-growth');
  console.log('  --batch=lib-mindfulness');
  console.log('  --batch=lib-voice');
  console.log('  --batch=lib-memory');
  console.log('  --batch=lib-emotions');
  console.log('  --batch=lib-time');
  console.log('  --batch=lib-ai');
  console.log('  --batch=lib-personas');
  console.log('  --batch=lib-usecases');
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
      blog: 'blog-', // Blog article illustrations
      images: null, // all
      // Library categories (100+ illustrations)
      library: 'lib-', // All library prompts
      'lib-connection': 'lib-connection,lib-hands,lib-group',
      'lib-growth': 'lib-growth,lib-path,lib-progress',
      'lib-mindfulness': 'lib-meditation,lib-peace',
      'lib-voice': 'lib-voice',
      'lib-memory': 'lib-memory',
      'lib-emotions': 'lib-emotion',
      'lib-time': 'lib-time',
      'lib-ai': 'lib-ai',
      'lib-personas': 'lib-persona',
      'lib-usecases': 'lib-usecase,lib-feature',
    };

    const filter = filterMap[batchType];
    if (filter === undefined) {
      console.error(`Unknown batch type: ${batchType}`);
      console.log('Valid options: avatars, hero, testimonials, social, founders, blog, images');
      console.log('Library options: library, lib-connection, lib-growth, lib-mindfulness, lib-voice, lib-memory, lib-emotions, lib-time, lib-ai, lib-personas, lib-usecases');
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
