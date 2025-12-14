#!/usr/bin/env node

/**
 * Build the Design System documentation site
 *
 * Copies all necessary files to a deployable site directory:
 * - Static HTML pages
 * - Design tokens CSS
 * - Assets (logos, icons, sounds)
 * - Playground
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, 'site-build');

// ============================================================================
// Configuration
// ============================================================================

const COPY_PATHS = [
  // HTML pages
  { src: 'site/index.html', dest: 'index.html' },
  { src: 'playground/index.html', dest: 'playground/index.html' },

  // Design tokens
  { src: 'dist/tokens.css', dest: 'dist/tokens.css' },

  // Assets
  { src: 'assets/logos', dest: 'assets/logos', recursive: true },
  { src: 'assets/icons', dest: 'assets/icons', recursive: true },
  { src: 'assets/favicons', dest: 'assets/favicons', recursive: true },

  // Brand docs
  { src: 'brand', dest: 'brand', recursive: true },
];

// ============================================================================
// Build Functions
// ============================================================================

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dest) {
  const srcPath = path.join(__dirname, src);
  const destPath = path.join(BUILD_DIR, dest);

  ensureDir(path.dirname(destPath));

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ ${dest}`);
  } else {
    console.log(`  ⚠ Skipping ${src} (not found)`);
  }
}

function copyDir(src, dest) {
  const srcPath = path.join(__dirname, src);
  const destPath = path.join(BUILD_DIR, dest);

  if (!fs.existsSync(srcPath)) {
    console.log(`  ⚠ Skipping ${src} (not found)`);
    return;
  }

  ensureDir(destPath);

  const entries = fs.readdirSync(srcPath, { withFileTypes: true });

  for (const entry of entries) {
    const srcEntry = path.join(srcPath, entry.name);
    const destEntry = path.join(destPath, entry.name);

    if (entry.isDirectory()) {
      copyDir(path.join(src, entry.name), path.join(dest, entry.name));
    } else {
      fs.copyFileSync(srcEntry, destEntry);
    }
  }

  console.log(`  ✓ ${dest}/`);
}

function generateRedirects() {
  // Firebase hosting redirects
  const firebaseConfig = {
    hosting: {
      public: 'site-build',
      rewrites: [
        { source: '/playground', destination: '/playground/index.html' },
        { source: '/playground/**', destination: '/playground/index.html' },
      ],
      headers: [
        {
          source: '**/*.css',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000' }],
        },
        {
          source: '**/*.js',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000' }],
        },
      ],
    },
  };

  fs.writeFileSync(path.join(BUILD_DIR, 'firebase.json'), JSON.stringify(firebaseConfig, null, 2));

  // Netlify redirects
  const netlifyRedirects = `/playground    /playground/index.html    200
/playground/*  /playground/index.html    200
`;

  fs.writeFileSync(path.join(BUILD_DIR, '_redirects'), netlifyRedirects);

  console.log('  ✓ Generated redirect configs');
}

function generateRobots() {
  const robots = `User-agent: *
Allow: /

Sitemap: https://design.ferni.ai/sitemap.xml
`;

  fs.writeFileSync(path.join(BUILD_DIR, 'robots.txt'), robots);
  console.log('  ✓ robots.txt');
}

function generateSitemap() {
  const pages = ['/', '/playground'];
  const baseUrl = 'https://design.ferni.ai';

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>weekly</changefreq>
    <priority>${page === '/' ? '1.0' : '0.8'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(BUILD_DIR, 'sitemap.xml'), sitemap);
  console.log('  ✓ sitemap.xml');
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('\n🏗️  Building Ferni Design System site...\n');

  // Clean build directory
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true });
  }
  ensureDir(BUILD_DIR);

  console.log('📁 Copying files...');

  // Copy all configured paths
  for (const item of COPY_PATHS) {
    if (item.recursive) {
      copyDir(item.src, item.dest);
    } else {
      copyFile(item.src, item.dest);
    }
  }

  console.log('\n📄 Generating configs...');
  generateRedirects();
  generateRobots();
  generateSitemap();

  console.log('\n✨ Build complete!');
  console.log(`   Output: ${BUILD_DIR}\n`);
  console.log('   Deploy with:');
  console.log('   - Firebase: firebase deploy --only hosting:design');
  console.log('   - Netlify: netlify deploy --prod --dir=design-system/site-build');
  console.log('   - Vercel: vercel --prod design-system/site-build\n');
}

main();
