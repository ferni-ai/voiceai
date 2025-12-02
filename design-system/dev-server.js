#!/usr/bin/env node
/**
 * Design System Development Server
 *
 * Serves the style guide and watches for token changes.
 *
 * Usage:
 *   node design-system/dev-server.js
 *   npm run design-system:dev
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Simple static file server
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/preview/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      // Add cache-busting headers for development
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(content);
    }
  });
});

// Watch for token changes
const tokensDir = path.join(__dirname, 'tokens');
let rebuildTimeout = null;

function rebuild() {
  console.log('🔄 Token change detected, rebuilding...');
  exec('node ' + path.join(__dirname, 'build.js'), (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Build error:', stderr);
    } else {
      console.log(stdout);
      console.log('✨ Reload the browser to see changes');
    }
  });
}

fs.watch(tokensDir, { recursive: true }, (eventType, filename) => {
  if (filename && filename.endsWith('.json')) {
    // Debounce rebuilds
    clearTimeout(rebuildTimeout);
    rebuildTimeout = setTimeout(rebuild, 100);
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎨  VoiceAI Design System                                   ║
║                                                               ║
║   Style Guide:  http://localhost:${PORT}                        ║
║   Tokens CSS:   http://localhost:${PORT}/dist/tokens.css        ║
║                                                               ║
║   Watching tokens/*.json for changes...                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
