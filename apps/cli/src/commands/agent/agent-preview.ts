#!/usr/bin/env npx tsx
/**
 * Agent Preview Command
 *
 * Starts a local development server for testing an agent.
 * Provides hot reload, voice testing, and a preview page.
 *
 * Usage:
 *   ferni agent preview <agent-id>
 *   ferni agent preview <agent-id> --port 3333
 *   ferni agent preview <agent-id> --no-open
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as readline from 'readline';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface AgentManifest {
  identity: {
    id: string;
    name: string;
    display_name: string;
    tagline: string;
    description: string;
    icon?: string;
    initials?: string;
  };
  voice: {
    provider: string;
    voice_id: string;
  };
  brand?: {
    primary?: string;
    secondary?: string;
    theme?: string;
  };
}

interface PreviewOptions {
  port: number;
  open: boolean;
  watch: boolean;
}

// ============================================================================
// PREVIEW PAGE GENERATOR
// ============================================================================

function generatePreviewPage(manifest: AgentManifest, port: number): string {
  const primary = manifest.brand?.primary || '#4a6741';
  const secondary = manifest.brand?.secondary || '#3d5a35';
  const initials = manifest.identity.initials || manifest.identity.name.split(' ').map(w => w[0]).join('').slice(0, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${manifest.identity.name} - Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #fff;
    }

    .preview-banner {
      background: linear-gradient(90deg, #f59e0b, #d97706);
      color: #000;
      text-align: center;
      padding: 8px;
      font-size: 12px;
      font-weight: 600;
    }

    .preview-banner code {
      background: rgba(0,0,0,0.2);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', monospace;
    }

    .container {
      min-height: calc(100vh - 36px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .avatar {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${secondary}, ${primary});
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      box-shadow: 0 0 60px ${primary}40;
      position: relative;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .avatar:hover {
      transform: scale(1.05);
      box-shadow: 0 0 80px ${primary}60;
    }

    .avatar.active {
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 60px ${primary}40; }
      50% { transform: scale(1.08); box-shadow: 0 0 100px ${primary}60; }
    }

    .avatar-icon {
      font-size: 4rem;
    }

    .status-dot {
      position: absolute;
      bottom: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #22c55e;
      border: 3px solid #1a1a2e;
    }

    .status-dot.connecting { background: #f59e0b; }
    .status-dot.error { background: #ef4444; }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    .tagline {
      color: ${primary};
      font-size: 1.1rem;
      margin-bottom: 1rem;
    }

    .description {
      opacity: 0.7;
      max-width: 500px;
      text-align: center;
      line-height: 1.6;
      margin-bottom: 2rem;
    }

    .buttons {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .btn {
      padding: 12px 24px;
      border-radius: 50px;
      border: none;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, ${secondary}, ${primary});
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px ${primary}40;
    }

    .btn-secondary {
      background: rgba(255,255,255,0.1);
      color: white;
      border: 1px solid rgba(255,255,255,0.2);
    }

    .btn-secondary:hover {
      background: rgba(255,255,255,0.15);
    }

    .status {
      font-size: 0.9rem;
      opacity: 0.6;
      margin-bottom: 2rem;
    }

    .status.listening { color: #22c55e; opacity: 1; }
    .status.speaking { color: ${primary}; opacity: 1; }
    .status.error { color: #ef4444; opacity: 1; }

    .transcript {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 1rem;
      max-width: 600px;
      width: 100%;
      max-height: 200px;
      overflow-y: auto;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    .transcript-item {
      margin-bottom: 0.5rem;
      padding: 0.5rem;
      border-radius: 8px;
    }

    .transcript-item.user {
      background: rgba(255,255,255,0.1);
      text-align: right;
    }

    .transcript-item.agent {
      background: ${primary}30;
    }

    .footer {
      position: fixed;
      bottom: 1rem;
      display: flex;
      gap: 2rem;
      font-size: 0.8rem;
      opacity: 0.4;
    }

    .footer a { color: inherit; }

    .keyboard-hint {
      position: fixed;
      bottom: 3rem;
      font-size: 0.75rem;
      opacity: 0.5;
    }

    kbd {
      background: rgba(255,255,255,0.15);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'SF Mono', monospace;
    }
  </style>
</head>
<body>
  <div class="preview-banner">
    🛠️ PREVIEW MODE • Hot reload enabled • <code>ferni agent preview ${manifest.identity.id}</code>
  </div>

  <div class="container">
    <div class="avatar" id="avatar" onclick="toggleVoice()">
      ${manifest.identity.icon ? `<span class="avatar-icon">${manifest.identity.icon}</span>` : initials}
      <div class="status-dot" id="statusDot"></div>
    </div>

    <h1>${manifest.identity.name}</h1>
    <p class="tagline">${manifest.identity.tagline}</p>
    <p class="description">${manifest.identity.description}</p>

    <div class="buttons">
      <button class="btn btn-primary" onclick="toggleVoice()">
        <span id="voiceBtn">Start Conversation</span>
      </button>
      <button class="btn btn-secondary" onclick="reloadAgent()">
        ⟳ Reload Agent
      </button>
    </div>

    <p class="status" id="status">Click or press Space to start</p>

    <div class="transcript" id="transcript" style="display: none;">
      <!-- Transcript items will appear here -->
    </div>
  </div>

  <p class="keyboard-hint">
    <kbd>Space</kbd> toggle voice &nbsp; <kbd>R</kbd> reload &nbsp; <kbd>Esc</kbd> stop
  </p>

  <div class="footer">
    <span>Voice ID: <code>${manifest.voice.voice_id.slice(0, 8)}...</code></span>
    <span>Port: ${port}</span>
    <a href="http://localhost:8080/health" target="_blank">Health Check</a>
  </div>

  <script>
    let isConnected = false;
    let isListening = false;

    const avatar = document.getElementById('avatar');
    const statusDot = document.getElementById('statusDot');
    const status = document.getElementById('status');
    const voiceBtn = document.getElementById('voiceBtn');
    const transcript = document.getElementById('transcript');

    function updateStatus(state, message) {
      status.className = 'status ' + state;
      status.textContent = message;

      if (state === 'listening') {
        statusDot.className = 'status-dot';
        avatar.classList.add('active');
      } else if (state === 'speaking') {
        statusDot.className = 'status-dot';
        avatar.classList.add('active');
      } else if (state === 'error') {
        statusDot.className = 'status-dot error';
        avatar.classList.remove('active');
      } else {
        statusDot.className = 'status-dot connecting';
        avatar.classList.remove('active');
      }
    }

    function addTranscriptItem(text, type) {
      transcript.style.display = 'block';
      const item = document.createElement('div');
      item.className = 'transcript-item ' + type;
      item.textContent = text;
      transcript.appendChild(item);
      transcript.scrollTop = transcript.scrollHeight;
    }

    async function toggleVoice() {
      if (!isConnected) {
        await connect();
      } else {
        disconnect();
      }
    }

    async function connect() {
      updateStatus('connecting', 'Connecting...');
      voiceBtn.textContent = 'Connecting...';

      try {
        // Get LiveKit token
        const tokenRes = await fetch('/token?persona=${manifest.identity.id}');
        if (!tokenRes.ok) throw new Error('Failed to get token');
        const { token, url } = await tokenRes.json();

        isConnected = true;
        isListening = true;
        updateStatus('listening', 'Listening...');
        voiceBtn.textContent = 'End Conversation';

        // In a real implementation, connect to LiveKit here
        addTranscriptItem('Connected to ${manifest.identity.name}', 'agent');

      } catch (err) {
        updateStatus('error', 'Connection failed: ' + err.message);
        voiceBtn.textContent = 'Retry';
        isConnected = false;
      }
    }

    function disconnect() {
      isConnected = false;
      isListening = false;
      updateStatus('', 'Click or press Space to start');
      voiceBtn.textContent = 'Start Conversation';
      avatar.classList.remove('active');
    }

    function reloadAgent() {
      updateStatus('', 'Reloading agent...');
      fetch('/api/reload')
        .then(() => {
          updateStatus('', 'Agent reloaded! Click to test.');
        })
        .catch(() => {
          updateStatus('error', 'Reload failed');
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        toggleVoice();
      }
      if (e.code === 'KeyR' && e.target === document.body) {
        e.preventDefault();
        reloadAgent();
      }
      if (e.code === 'Escape') {
        disconnect();
      }
    });

    // Auto-reload on file changes (via SSE)
    const evtSource = new EventSource('/events');
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'reload') {
        console.log('File changed:', data.file);
        updateStatus('', '📝 Changes detected, reloading...');
        setTimeout(() => window.location.reload(), 500);
      }
    };
  </script>
</body>
</html>`;
}

// ============================================================================
// DEV SERVER
// ============================================================================

let sseClients: http.ServerResponse[] = [];

function createDevServer(manifest: AgentManifest, bundlePath: string, options: PreviewOptions): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${options.port}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Routes
    switch (url.pathname) {
      case '/':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(generatePreviewPage(manifest, options.port));
        break;

      case '/events':
        // Server-Sent Events for hot reload
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('data: {"type":"connected"}\n\n');
        sseClients.push(res);
        req.on('close', () => {
          sseClients = sseClients.filter((c) => c !== res);
        });
        break;

      case '/api/reload':
        // Trigger agent reload
        broadcastReload('manual');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        break;

      case '/api/manifest':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(manifest));
        break;

      case '/token':
        // Proxy to token server
        const persona = url.searchParams.get('persona') || manifest.identity.id;
        const tokenUrl = `http://localhost:3001/token?persona=${persona}`;
        http.get(tokenUrl, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        }).on('error', (err) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Token server unavailable', details: err.message }));
        });
        break;

      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
  });

  return server;
}

function broadcastReload(file: string): void {
  const message = JSON.stringify({ type: 'reload', file });
  for (const client of sseClients) {
    client.write(`data: ${message}\n\n`);
  }
}

// ============================================================================
// FILE WATCHER
// ============================================================================

function watchBundle(bundlePath: string, callback: (file: string) => void): void {
  const watched = new Set<string>();

  function watchDir(dir: string) {
    if (!fs.existsSync(dir)) return;

    try {
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.json') || filename.endsWith('.md'))) {
          callback(filename);
        }
      });
      watched.add(dir);
    } catch {
      // Fallback to polling for systems without recursive watch
      const checkFiles = () => {
        const files = fs.readdirSync(dir, { recursive: true }) as string[];
        // Simple polling implementation would go here
      };
    }
  }

  watchDir(bundlePath);
}

// ============================================================================
// PROCESS MANAGER
// ============================================================================

let childProcesses: ChildProcess[] = [];

function startProcess(name: string, command: string, args: string[], cwd: string): ChildProcess | null {
  try {
    const proc = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    proc.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        // Filter verbose logs
        if (!line.includes('[DEBUG]') && !line.includes('verbose')) {
          console.log(`  ${color.dim(`[${name}]`)} ${line}`);
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      console.log(`  ${color.red(`[${name}]`)} ${data.toString().trim()}`);
    });

    proc.on('error', (err) => {
      console.log(`  ${color.red(`[${name}]`)} Error: ${err.message}`);
    });

    childProcesses.push(proc);
    return proc;
  } catch {
    return null;
  }
}

function cleanup(): void {
  for (const proc of childProcesses) {
    proc.kill('SIGTERM');
  }
  childProcesses = [];
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse agent ID
  const agentId = args.find((a) => !a.startsWith('-'));

  // Parse options
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3333;
  const noOpen = args.includes('--no-open');
  const noWatch = args.includes('--no-watch');

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${color.bold('ferni agent preview')} - Start local development server

${color.bold('Usage:')}
  ferni agent preview <agent-id> [options]

${color.bold('Options:')}
  --port <port>   Preview server port (default: 3333)
  --no-open       Don't open browser automatically
  --no-watch      Disable file watching
  --help, -h      Show this help

${color.bold('Requirements:')}
  The following services should be running:
  • Token Server (port 3001): node token-server.js
  • Voice Agent (port 8080): pnpm dev

${color.bold('Examples:')}
  ferni agent preview joel-advisor
  ferni agent preview my-coach --port 4000
  ferni agent preview my-agent --no-open
`);
    process.exit(0);
  }

  if (!agentId) {
    console.log(color.red('Error: Agent ID is required'));
    console.log(color.dim('Usage: ferni agent preview <agent-id>'));
    process.exit(1);
  }

  // Find bundle
  const bundlePath = path.join(process.cwd(), 'src', 'personas', 'bundles', agentId);
  const manifestPath = path.join(bundlePath, 'persona.manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.log(color.red(`Agent not found: ${agentId}`));
    console.log(color.dim(`Expected: ${manifestPath}`));
    console.log(color.dim('Create one with: ferni agent init ' + agentId));
    process.exit(1);
  }

  // Load manifest
  let manifest: AgentManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    console.log(color.red(`Invalid manifest: ${(err as Error).message}`));
    process.exit(1);
  }

  p.intro(color.bgCyan(color.black(' 🛠️ Agent Preview ')));

  p.log.info(`Agent: ${color.cyan(manifest.identity.name)}`);
  p.log.info(`Path: ${color.dim(bundlePath)}`);

  // Check if required services are running
  const spinner = p.spinner();
  spinner.start('Checking required services...');

  const services: { name: string; url: string; status: 'ok' | 'error' }[] = [];

  // Check token server
  try {
    await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) });
    services.push({ name: 'Token Server', url: 'localhost:3001', status: 'ok' });
  } catch {
    services.push({ name: 'Token Server', url: 'localhost:3001', status: 'error' });
  }

  // Check voice agent
  try {
    await fetch('http://localhost:8080/health', { signal: AbortSignal.timeout(2000) });
    services.push({ name: 'Voice Agent', url: 'localhost:8080', status: 'ok' });
  } catch {
    services.push({ name: 'Voice Agent', url: 'localhost:8080', status: 'error' });
  }

  spinner.stop('Services checked.');

  console.log('');
  for (const svc of services) {
    const icon = svc.status === 'ok' ? color.green('✓') : color.yellow('⚠');
    const statusText = svc.status === 'ok' ? color.green('running') : color.yellow('not running');
    console.log(`  ${icon} ${svc.name.padEnd(15)} ${color.dim(svc.url.padEnd(18))} ${statusText}`);
  }
  console.log('');

  const missingServices = services.filter((s) => s.status === 'error');
  if (missingServices.length > 0) {
    p.log.warn('Some services are not running. Voice testing may not work.');
    p.log.info(color.dim('Start them with:'));
    if (services.find((s) => s.name === 'Token Server' && s.status === 'error')) {
      console.log(color.dim('  node token-server.js'));
    }
    if (services.find((s) => s.name === 'Voice Agent' && s.status === 'error')) {
      console.log(color.dim('  pnpm dev'));
    }
    console.log('');
  }

  // Start preview server
  const options: PreviewOptions = { port, open: !noOpen, watch: !noWatch };
  const server = createDevServer(manifest, bundlePath, options);

  server.listen(port, () => {
    console.log('');
    p.log.success(`Preview server running!`);
    console.log('');
    console.log(`  ${color.cyan('→')} ${color.bold(`http://localhost:${port}`)}`);
    console.log('');

    // Open browser
    if (options.open) {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(cmd, [`http://localhost:${port}`], { shell: true, stdio: 'ignore' });
    }
  });

  // Watch for file changes
  if (options.watch) {
    watchBundle(bundlePath, (file) => {
      console.log(`  ${color.cyan('📝')} Changed: ${file}`);

      // Reload manifest if it changed
      if (file === 'persona.manifest.json') {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          console.log(`  ${color.green('✓')} Manifest reloaded`);
        } catch (err) {
          console.log(`  ${color.red('✗')} Manifest error: ${(err as Error).message}`);
        }
      }

      broadcastReload(file);
    });
    p.log.info(color.dim('Watching for changes...'));
  }

  // Keyboard controls
  console.log('');
  console.log(color.dim('  Press:'));
  console.log(color.dim('    o → Open browser'));
  console.log(color.dim('    r → Reload manifest'));
  console.log(color.dim('    q → Quit'));
  console.log('');

  // Enable raw mode for keyboard input
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        console.log('');
        p.outro(color.dim('Preview server stopped.'));
        cleanup();
        server.close();
        process.exit(0);
      }

      if (key.name === 'o') {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        spawn(cmd, [`http://localhost:${port}`], { shell: true, stdio: 'ignore' });
        console.log(`  ${color.cyan('→')} Opened browser`);
      }

      if (key.name === 'r') {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          broadcastReload('persona.manifest.json');
          console.log(`  ${color.green('✓')} Manifest reloaded`);
        } catch (err) {
          console.log(`  ${color.red('✗')} Error: ${(err as Error).message}`);
        }
      }
    });
  }

  // Cleanup on exit
  process.on('SIGINT', () => {
    cleanup();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
