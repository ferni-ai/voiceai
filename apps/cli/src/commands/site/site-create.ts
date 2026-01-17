#!/usr/bin/env npx tsx
/**
 * Site Create Command
 *
 * Generate a static website for a custom agent.
 *
 * Usage:
 *   ferni site create --agent <agent-id>
 *   ferni site create --agent <agent-id> --template memorial
 *   ferni site create --agent <agent-id> --output ./my-site
 */

import * as p from '@clack/prompts';
import * as picocolorsModule from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { cliAuth, isAuthenticated } from '../../services/cli-auth.service.js';

const color = picocolorsModule.default || picocolorsModule;

// ============================================================================
// TYPES
// ============================================================================

interface CustomAgent {
  id: string;
  displayName: string;
  type: string;
  status: string;
  description?: string;
  personality?: {
    warmth?: number;
    humorLevel?: number;
  };
  voice?: {
    status: string;
  };
}

interface SiteTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  features: string[];
}

// ============================================================================
// TEMPLATES
// ============================================================================

const SITE_TEMPLATES: Record<string, SiteTemplate> = {
  landing: {
    id: 'landing',
    name: 'Landing Page',
    description: 'Professional landing page with chat button',
    icon: '📄',
    features: ['Hero section', 'About section', 'Chat widget', 'Mobile responsive'],
  },
  fullscreen: {
    id: 'fullscreen',
    name: 'Full Screen Voice',
    description: 'Immersive full-screen voice interface',
    icon: '🎙️',
    features: ['Full-screen experience', 'Voice-first design', 'Minimal UI', 'Auto-connect'],
  },
  memorial: {
    id: 'memorial',
    name: 'Memorial Tribute',
    description: 'Beautiful memorial page with photos and memories',
    icon: '🕯️',
    features: ['Photo gallery', 'Memory timeline', 'Voice connection', 'Guest book'],
  },
};

// ============================================================================
// TEMPLATE GENERATION
// ============================================================================

function generateLandingPage(agent: CustomAgent, apiBaseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agent.displayName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #fff;
    }
    .hero {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    .avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4a6741 0%, #6b8c5f 100%);
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      box-shadow: 0 10px 40px rgba(74, 103, 65, 0.3);
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 1rem;
      font-weight: 700;
    }
    .description {
      font-size: 1.25rem;
      opacity: 0.8;
      max-width: 500px;
      margin-bottom: 2rem;
      line-height: 1.6;
    }
    .talk-button {
      background: linear-gradient(135deg, #4a6741 0%, #5a7a51 100%);
      color: white;
      border: none;
      padding: 1rem 2.5rem;
      font-size: 1.25rem;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(74, 103, 65, 0.4);
    }
    .talk-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 30px rgba(74, 103, 65, 0.5);
    }
    .footer {
      position: fixed;
      bottom: 1rem;
      opacity: 0.5;
      font-size: 0.875rem;
    }
    .footer a { color: inherit; }
  </style>
</head>
<body>
  <div class="hero">
    <div class="avatar">👤</div>
    <h1>${agent.displayName}</h1>
    <p class="description">${agent.description || 'Start a conversation'}</p>
    <button class="talk-button" onclick="startConversation()">
      Talk Now
    </button>
  </div>
  <div class="footer">
    Powered by <a href="https://ferni.ai">Ferni</a>
  </div>

  <!-- Ferni Widget SDK -->
  <script>
    window.FERNI_CONFIG = {
      agentId: '${agent.id}',
      apiUrl: '${apiBaseUrl}',
      theme: 'dark'
    };
  </script>
  <script src="${apiBaseUrl}/api/widget/embed.js" async></script>
  <script>
    function startConversation() {
      if (window.FerniWidget) {
        window.FerniWidget.open();
      } else {
        alert('Loading... please try again.');
      }
    }
  </script>
</body>
</html>`;
}

function generateFullscreenPage(agent: CustomAgent, apiBaseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agent.displayName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .orb-container {
      width: 200px;
      height: 200px;
      margin: 0 auto 2rem;
      position: relative;
    }
    .orb {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #6b8c5f, #4a6741);
      cursor: pointer;
      transition: all 0.3s ease;
      animation: pulse 4s ease-in-out infinite;
      box-shadow: 0 0 60px rgba(74, 103, 65, 0.4);
    }
    .orb:hover { transform: scale(1.05); }
    .orb.active {
      animation: speak 0.5s ease-in-out infinite;
      box-shadow: 0 0 80px rgba(74, 103, 65, 0.6);
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.02); opacity: 0.95; }
    }
    @keyframes speak {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    h1 {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .status {
      opacity: 0.6;
      font-size: 1rem;
    }
    .hint {
      position: fixed;
      bottom: 2rem;
      opacity: 0.4;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="orb-container">
      <div class="orb" id="orb" onclick="toggleConversation()"></div>
    </div>
    <h1>${agent.displayName}</h1>
    <p class="status" id="status">Tap to start talking</p>
  </div>
  <p class="hint">Press and hold to talk</p>

  <script>
    window.FERNI_CONFIG = {
      agentId: '${agent.id}',
      apiUrl: '${apiBaseUrl}',
      mode: 'fullscreen',
      autoConnect: false
    };
  </script>
  <script src="${apiBaseUrl}/api/widget/embed.js" async></script>
  <script>
    let isActive = false;
    const orb = document.getElementById('orb');
    const status = document.getElementById('status');

    function toggleConversation() {
      if (!window.FerniWidget) {
        status.textContent = 'Loading...';
        return;
      }

      isActive = !isActive;
      orb.classList.toggle('active', isActive);

      if (isActive) {
        status.textContent = 'Listening...';
        window.FerniWidget.open();
      } else {
        status.textContent = 'Tap to start talking';
        window.FerniWidget.close();
      }
    }
  </script>
</body>
</html>`;
}

function generateMemorialPage(agent: CustomAgent, apiBaseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>In Loving Memory of ${agent.displayName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      min-height: 100vh;
      background: linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #f5f5f5;
    }
    .header {
      text-align: center;
      padding: 4rem 2rem;
      background: linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%);
    }
    .memorial-frame {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4a6741 0%, #6b8c5f 100%);
      margin: 0 auto 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 4rem;
      border: 4px solid rgba(255,255,255,0.2);
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    }
    .name {
      font-size: 2.5rem;
      font-weight: 400;
      margin-bottom: 0.5rem;
      letter-spacing: 0.05em;
    }
    .dates {
      opacity: 0.6;
      font-size: 1.1rem;
      font-style: italic;
    }
    .content {
      max-width: 600px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }
    .message {
      font-size: 1.2rem;
      line-height: 1.8;
      text-align: center;
      font-style: italic;
      margin-bottom: 3rem;
      opacity: 0.9;
    }
    .connect-section {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .connect-section h2 {
      font-size: 1.5rem;
      font-weight: 400;
      margin-bottom: 1rem;
    }
    .connect-section p {
      opacity: 0.7;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    .talk-button {
      background: linear-gradient(135deg, #4a6741 0%, #5a7a51 100%);
      color: white;
      border: none;
      padding: 1rem 2rem;
      font-size: 1.1rem;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: inherit;
    }
    .talk-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(74, 103, 65, 0.4);
    }
    .candle {
      font-size: 2rem;
      animation: flicker 3s ease-in-out infinite;
    }
    @keyframes flicker {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }
    .footer {
      text-align: center;
      padding: 2rem;
      opacity: 0.4;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="memorial-frame">
      <span class="candle">🕯️</span>
    </div>
    <h1 class="name">${agent.displayName}</h1>
    <p class="dates">Forever in our hearts</p>
  </header>

  <main class="content">
    <p class="message">
      ${agent.description || 'Their light continues to shine through the memories we share and the love that remains.'}
    </p>

    <div class="connect-section">
      <h2>Share a Moment</h2>
      <p>Connect with the memories and wisdom of ${agent.displayName}.
         Their voice lives on through the stories and love they shared.</p>
      <button class="talk-button" onclick="startConversation()">
        Begin Conversation
      </button>
    </div>
  </main>

  <footer class="footer">
    A living tribute powered by <a href="https://ferni.ai" style="color: inherit;">Ferni</a>
  </footer>

  <script>
    window.FERNI_CONFIG = {
      agentId: '${agent.id}',
      apiUrl: '${apiBaseUrl}',
      theme: 'memorial'
    };
  </script>
  <script src="${apiBaseUrl}/api/widget/embed.js" async></script>
  <script>
    function startConversation() {
      if (window.FerniWidget) {
        window.FerniWidget.open();
      } else {
        alert('Loading... please try again.');
      }
    }
  </script>
</body>
</html>`;
}

function generatePackageJson(agent: CustomAgent): string {
  return JSON.stringify(
    {
      name: `${agent.id}-site`,
      version: '1.0.0',
      private: true,
      scripts: {
        serve: 'npx serve .',
        dev: 'npx serve . -p 8888',
      },
    },
    null,
    2
  );
}

function generateReadme(agent: CustomAgent, template: string): string {
  return `# ${agent.displayName} - Website

This website was generated with the Ferni CLI.

## Quick Start

\`\`\`bash
# Preview locally
npx serve .
# or
npm run dev
\`\`\`

Then open http://localhost:3000 (or http://localhost:8888 with npm run dev)

## Deploy Options

### Firebase Hosting

\`\`\`bash
firebase init hosting
firebase deploy
\`\`\`

### Ferni Hosting

\`\`\`bash
ferni site deploy --ferni
\`\`\`

### Other Platforms

This is a static site - deploy to:
- Vercel: \`vercel --prod\`
- Netlify: Drag & drop the folder
- GitHub Pages: Push to gh-pages branch
- AWS S3: Upload to S3 bucket with static hosting

## Customization

- Edit \`index.html\` to customize content
- Replace the avatar/photo as needed
- Modify colors in the \`<style>\` section

## Template

This site uses the **${template}** template.

---

Generated with [Ferni CLI](https://ferni.ai)
`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const agentIdIdx = args.indexOf('--agent');
  const agentId = agentIdIdx !== -1 ? args[agentIdIdx + 1] : null;

  const templateIdx = args.indexOf('--template');
  const templateArg = templateIdx !== -1 ? args[templateIdx + 1] : null;

  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : './site';

  p.intro(color.bgCyan(color.black(' Create Agent Website ')));

  // Check authentication
  if (!isAuthenticated()) {
    p.log.warn("You're not logged in.");
    p.log.info(`Run ${color.cyan('ferni auth login')} first.`);
    process.exit(1);
  }

  // Get agent ID
  let finalAgentId = agentId;
  if (!finalAgentId) {
    const agentInput = await p.text({
      message: 'Agent ID:',
      placeholder: 'agent_abc123',
      validate: (value) => {
        if (!value) return 'Agent ID is required';
        return undefined;
      },
    });

    if (p.isCancel(agentInput)) {
      p.cancel('Site creation cancelled.');
      process.exit(0);
    }
    finalAgentId = agentInput as string;
  }

  const spinner = p.spinner();

  // Fetch agent details
  spinner.start('Loading agent...');

  let agent: CustomAgent;
  try {
    agent = await cliAuth.apiRequest<CustomAgent>(`/api/custom-agents/${finalAgentId}`);
    spinner.stop(`Agent: ${color.cyan(agent.displayName)}`);
  } catch (error) {
    spinner.stop('Agent not found.');
    p.log.error(`${error instanceof Error ? error.message : 'Could not find agent'}`);
    process.exit(1);
  }

  // Check agent status
  if (agent.status !== 'active') {
    p.log.warn(`Agent is ${agent.status}. Consider deploying first.`);
    p.log.info(`Deploy: ${color.cyan(`ferni agent deploy ${agent.id}`)}`);
  }

  // Select template
  let template = templateArg;
  if (!template || !SITE_TEMPLATES[template]) {
    const templateChoice = await p.select({
      message: 'Choose a website template:',
      options: Object.values(SITE_TEMPLATES).map((t) => ({
        value: t.id,
        label: `${t.icon} ${t.name}`,
        hint: t.description,
      })),
    });

    if (p.isCancel(templateChoice)) {
      p.cancel('Site creation cancelled.');
      process.exit(0);
    }
    template = templateChoice as string;
  }

  const templateInfo = SITE_TEMPLATES[template];
  p.log.info(`Template: ${templateInfo.icon} ${templateInfo.name}`);

  // Show features
  console.log('');
  p.log.info(color.dim('Features:'));
  for (const feature of templateInfo.features) {
    console.log(`  ${color.green('•')} ${feature}`);
  }
  console.log('');

  // Confirm output directory
  const finalOutputDir = path.resolve(process.cwd(), outputDir);

  if (fs.existsSync(finalOutputDir)) {
    const overwrite = await p.confirm({
      message: `Directory ${color.cyan(outputDir)} exists. Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Site creation cancelled.');
      process.exit(0);
    }
  }

  // Generate site
  spinner.start('Generating site...');

  try {
    // Create directory
    fs.mkdirSync(finalOutputDir, { recursive: true });

    // Determine API URL
    const apiBaseUrl =
      process.env.NODE_ENV === 'development' ? 'http://localhost:3002' : 'https://app.ferni.ai';

    // Generate HTML based on template
    let html: string;
    switch (template) {
      case 'fullscreen':
        html = generateFullscreenPage(agent, apiBaseUrl);
        break;
      case 'memorial':
        html = generateMemorialPage(agent, apiBaseUrl);
        break;
      default:
        html = generateLandingPage(agent, apiBaseUrl);
    }

    // Write files
    fs.writeFileSync(path.join(finalOutputDir, 'index.html'), html);
    fs.writeFileSync(path.join(finalOutputDir, 'package.json'), generatePackageJson(agent));
    fs.writeFileSync(path.join(finalOutputDir, 'README.md'), generateReadme(agent, templateInfo.name));

    spinner.stop('Site generated!');

    // Show success
    console.log('');
    p.log.success(`${color.green('✓')} Created ${color.cyan(outputDir)}/`);
    console.log('');

    // List files
    const files = fs.readdirSync(finalOutputDir);
    for (const file of files) {
      console.log(`  ${color.dim('•')} ${file}`);
    }
    console.log('');

    // Next steps
    p.note(
      [
        `Preview locally:`,
        `  ${color.cyan(`cd ${outputDir} && npx serve .`)}`,
        '',
        `Deploy to Ferni:`,
        `  ${color.cyan('ferni site deploy --ferni')}`,
        '',
        `Deploy to Firebase:`,
        `  ${color.cyan('firebase deploy --only hosting')}`,
      ].join('\n'),
      'Next Steps'
    );

    p.outro(color.green('Your agent website is ready!'));
  } catch (error) {
    spinner.stop('Site generation failed.');
    p.log.error(`${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(color.red('Error:'), error.message);
  process.exit(1);
});
