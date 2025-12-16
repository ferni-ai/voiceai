#!/usr/bin/env node
/**
 * Asset Optimization Script
 * Optimizes images and videos for web delivery
 * 
 * Usage:
 *   node optimize-assets.js                    # Optimize all
 *   node optimize-assets.js --images           # Images only
 *   node optimize-assets.js --videos           # Videos only
 *   node optimize-assets.js --path=images/hero # Specific path
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  imageDir: path.join(__dirname, '..', 'images'),
  videoDir: path.join(__dirname, '..', 'videos'),
  outputDir: path.join(__dirname, '..', 'dist', 'optimized'),
  
  // Image optimization settings
  imageQuality: 85,
  maxWidth: 2400,
  webpQuality: 80,
  
  // Video optimization settings
  videoBitrate: '2M',
  audioBitrate: '128k',
};

// Parse arguments
const args = process.argv.slice(2);
const flags = {
  images: args.includes('--images') || !args.some(a => a.startsWith('--')),
  videos: args.includes('--videos') || !args.some(a => a.startsWith('--')),
  path: args.find(a => a.startsWith('--path='))?.split('=')[1],
  dryRun: args.includes('--dry-run'),
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

/**
 * Check if required tools are installed
 */
function checkDependencies() {
  const tools = ['convert', 'ffmpeg'];
  const missing = [];
  
  for (const tool of tools) {
    try {
      execSync(`which ${tool}`, { stdio: 'ignore' });
    } catch {
      missing.push(tool);
    }
  }
  
  if (missing.length > 0) {
    log(`⚠️  Missing tools: ${missing.join(', ')}`, 'yellow');
    log('Install with:', 'yellow');
    log('  brew install imagemagick ffmpeg', 'blue');
    return false;
  }
  
  return true;
}

/**
 * Get all files in directory recursively
 */
function getFiles(dir, extensions) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      files.push(...getFiles(fullPath, extensions));
    } else if (extensions.some(ext => item.name.toLowerCase().endsWith(ext))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Optimize a single image
 */
function optimizeImage(inputPath) {
  const relativePath = path.relative(CONFIG.imageDir, inputPath);
  const outputPath = path.join(CONFIG.outputDir, 'images', relativePath);
  const outputDir = path.dirname(outputPath);
  
  // Ensure output directory exists
  if (!flags.dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Get file info
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, ext);
  
  log(`  📷 ${relativePath}`, 'blue');
  
  if (flags.dryRun) {
    log(`     → Would optimize and create WebP`, 'yellow');
    return;
  }
  
  try {
    // Optimize original format
    execSync(`convert "${inputPath}" -quality ${CONFIG.imageQuality} -resize "${CONFIG.maxWidth}x>" "${outputPath}"`, { stdio: 'ignore' });
    
    // Create WebP version
    const webpPath = path.join(outputDir, `${baseName}.webp`);
    execSync(`convert "${inputPath}" -quality ${CONFIG.webpQuality} -resize "${CONFIG.maxWidth}x>" "${webpPath}"`, { stdio: 'ignore' });
    
    // Log sizes
    const originalSize = fs.statSync(inputPath).size;
    const optimizedSize = fs.statSync(outputPath).size;
    const webpSize = fs.statSync(webpPath).size;
    
    const savings = Math.round((1 - optimizedSize / originalSize) * 100);
    const webpSavings = Math.round((1 - webpSize / originalSize) * 100);
    
    log(`     ✓ Optimized: ${formatBytes(optimizedSize)} (${savings}% smaller)`, 'green');
    log(`     ✓ WebP: ${formatBytes(webpSize)} (${webpSavings}% smaller)`, 'green');
  } catch (err) {
    log(`     ✗ Error: ${err.message}`, 'red');
  }
}

/**
 * Optimize a single video
 */
function optimizeVideo(inputPath) {
  const relativePath = path.relative(CONFIG.videoDir, inputPath);
  const outputPath = path.join(CONFIG.outputDir, 'videos', relativePath);
  const outputDir = path.dirname(outputPath);
  
  // Ensure output directory exists
  if (!flags.dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, ext);
  
  log(`  🎬 ${relativePath}`, 'blue');
  
  if (flags.dryRun) {
    log(`     → Would optimize and create WebM`, 'yellow');
    return;
  }
  
  try {
    // Optimize MP4
    execSync(`ffmpeg -y -i "${inputPath}" -c:v libx264 -b:v ${CONFIG.videoBitrate} -c:a aac -b:a ${CONFIG.audioBitrate} "${outputPath}" 2>/dev/null`, { stdio: 'ignore' });
    
    // Create WebM version
    const webmPath = path.join(outputDir, `${baseName}.webm`);
    execSync(`ffmpeg -y -i "${inputPath}" -c:v libvpx-vp9 -b:v ${CONFIG.videoBitrate} -c:a libopus -b:a ${CONFIG.audioBitrate} "${webmPath}" 2>/dev/null`, { stdio: 'ignore' });
    
    // Log sizes
    const originalSize = fs.statSync(inputPath).size;
    const optimizedSize = fs.statSync(outputPath).size;
    const webmSize = fs.statSync(webmPath).size;
    
    const savings = Math.round((1 - optimizedSize / originalSize) * 100);
    const webmSavings = Math.round((1 - webmSize / originalSize) * 100);
    
    log(`     ✓ Optimized: ${formatBytes(optimizedSize)} (${savings}% smaller)`, 'green');
    log(`     ✓ WebM: ${formatBytes(webmSize)} (${webmSavings}% smaller)`, 'green');
  } catch (err) {
    log(`     ✗ Error: ${err.message}`, 'red');
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Main execution
 */
async function main() {
  log('\n🎨 Ferni Asset Optimizer\n', 'green');
  
  // Check dependencies
  if (!checkDependencies()) {
    log('\nSkipping optimization - install missing tools first.\n', 'yellow');
    process.exit(1);
  }
  
  // Determine source directories
  const imageDir = flags.path ? path.join(CONFIG.imageDir, flags.path) : CONFIG.imageDir;
  const videoDir = flags.path ? path.join(CONFIG.videoDir, flags.path) : CONFIG.videoDir;
  
  // Optimize images
  if (flags.images) {
    log('📷 Optimizing Images...\n', 'blue');
    const images = getFiles(imageDir, ['.jpg', '.jpeg', '.png', '.gif']);
    
    if (images.length === 0) {
      log('  No images found.\n', 'yellow');
    } else {
      log(`  Found ${images.length} images\n`);
      for (const img of images) {
        optimizeImage(img);
      }
    }
  }
  
  // Optimize videos
  if (flags.videos) {
    log('\n🎬 Optimizing Videos...\n', 'blue');
    const videos = getFiles(videoDir, ['.mp4', '.mov', '.avi']);
    
    if (videos.length === 0) {
      log('  No videos found.\n', 'yellow');
    } else {
      log(`  Found ${videos.length} videos\n`);
      for (const vid of videos) {
        optimizeVideo(vid);
      }
    }
  }
  
  log('\n✨ Optimization complete!\n', 'green');
  log(`Output: ${CONFIG.outputDir}\n`);
}

main().catch(err => {
  log(`\n❌ Error: ${err.message}\n`, 'red');
  process.exit(1);
});

