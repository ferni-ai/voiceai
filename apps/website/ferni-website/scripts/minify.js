#!/usr/bin/env node
/**
 * Minify CSS and JS files for production
 * Usage: node scripts/minify.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE_DIR = '_site';

// Colors for output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, msg) {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return (stats.size / 1024).toFixed(1) + 'KB';
}

function minifyCSS() {
  log('blue', '\n📦 Minifying CSS...');
  
  const cssDir = path.join(SITE_DIR, 'css');
  if (!fs.existsSync(cssDir)) {
    log('yellow', '  No CSS directory found');
    return;
  }
  
  const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
  let totalSaved = 0;
  
  for (const file of cssFiles) {
    const filePath = path.join(cssDir, file);
    const originalSize = fs.statSync(filePath).size;
    
    try {
      // Use clean-css-cli
      execSync(`npx cleancss -o "${filePath}" "${filePath}"`, { stdio: 'pipe' });
      
      const newSize = fs.statSync(filePath).size;
      const saved = originalSize - newSize;
      totalSaved += saved;
      
      const percent = ((saved / originalSize) * 100).toFixed(0);
      log('green', `  ✓ ${file}: ${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB (-${percent}%)`);
    } catch (error) {
      log('yellow', `  ⚠ ${file}: skipped (${error.message})`);
    }
  }
  
  log('green', `  Total CSS saved: ${(totalSaved/1024).toFixed(1)}KB`);
}

function minifyJS() {
  log('blue', '\n📦 Minifying JS...');
  
  const jsDir = path.join(SITE_DIR, 'js');
  if (!fs.existsSync(jsDir)) {
    log('yellow', '  No JS directory found');
    return;
  }
  
  const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
  let totalSaved = 0;
  
  for (const file of jsFiles) {
    const filePath = path.join(jsDir, file);
    const originalSize = fs.statSync(filePath).size;
    
    try {
      // Use esbuild for JS minification
      execSync(`npx esbuild "${filePath}" --minify --outfile="${filePath}" --allow-overwrite`, { stdio: 'pipe' });
      
      const newSize = fs.statSync(filePath).size;
      const saved = originalSize - newSize;
      totalSaved += saved;
      
      const percent = ((saved / originalSize) * 100).toFixed(0);
      log('green', `  ✓ ${file}: ${(originalSize/1024).toFixed(1)}KB → ${(newSize/1024).toFixed(1)}KB (-${percent}%)`);
    } catch (error) {
      log('yellow', `  ⚠ ${file}: skipped (${error.message})`);
    }
  }
  
  log('green', `  Total JS saved: ${(totalSaved/1024).toFixed(1)}KB`);
}

function minifyHTML() {
  log('blue', '\n📦 Minifying HTML...');

  // Find all HTML files
  const htmlFiles = [];
  function findHTML(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findHTML(fullPath);
      } else if (entry.name.endsWith('.html')) {
        htmlFiles.push(fullPath);
      }
    }
  }
  findHTML(SITE_DIR);

  let totalSaved = 0;
  let count = 0;

  for (const filePath of htmlFiles) {
    const originalSize = fs.statSync(filePath).size;

    // Simple HTML minification: remove comments, collapse whitespace
    let content = fs.readFileSync(filePath, 'utf8');
    const originalLength = content.length;

    // IMPORTANT: Extract inline scripts BEFORE minification to preserve them
    // The regex minification breaks JavaScript by collapsing whitespace
    const scriptPlaceholders = [];
    content = content.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match, scriptContent) => {
      const placeholder = `__SCRIPT_PLACEHOLDER_${scriptPlaceholders.length}__`;
      scriptPlaceholders.push(match);
      return placeholder;
    });

    // Also preserve <style> tags
    const stylePlaceholders = [];
    content = content.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, styleContent) => {
      const placeholder = `__STYLE_PLACEHOLDER_${stylePlaceholders.length}__`;
      stylePlaceholders.push(match);
      return placeholder;
    });

    // Also preserve <pre> and <code> blocks
    const prePlaceholders = [];
    content = content.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, (match) => {
      const placeholder = `__PRE_PLACEHOLDER_${prePlaceholders.length}__`;
      prePlaceholders.push(match);
      return placeholder;
    });

    // Remove HTML comments (but keep conditional comments)
    content = content.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');

    // Collapse multiple spaces/newlines
    content = content.replace(/\s+/g, ' ');

    // Remove spaces around tags
    content = content.replace(/>\s+</g, '><');

    // Restore preserved content
    prePlaceholders.forEach((pre, i) => {
      content = content.replace(`__PRE_PLACEHOLDER_${i}__`, pre);
    });
    stylePlaceholders.forEach((style, i) => {
      content = content.replace(`__STYLE_PLACEHOLDER_${i}__`, style);
    });
    scriptPlaceholders.forEach((script, i) => {
      content = content.replace(`__SCRIPT_PLACEHOLDER_${i}__`, script);
    });

    fs.writeFileSync(filePath, content);

    const newSize = fs.statSync(filePath).size;
    totalSaved += originalSize - newSize;
    count++;
  }

  log('green', `  ✓ Minified ${count} HTML files`);
  log('green', `  Total HTML saved: ${(totalSaved/1024).toFixed(1)}KB`);
}

// Main
console.log('🚀 Ferni Website Minification');
console.log('==============================');

if (!fs.existsSync(SITE_DIR)) {
  log('yellow', `\n⚠ ${SITE_DIR} not found. Run 'npm run build' first.`);
  process.exit(1);
}

minifyCSS();
minifyJS();
minifyHTML();

log('green', '\n✅ Minification complete!');

