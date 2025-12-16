#!/usr/bin/env node

/**
 * Ferni Setup Script
 * Reads from .forms.env and updates all configuration files
 * 
 * Usage: node scripts/setup-from-env.js
 */

const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}→${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${msg}${colors.reset}\n${'─'.repeat(40)}`)
};

// Parse .env file
function parseEnvFile(filePath) {
  const env = {};
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        env[key.trim()] = value;
      }
    }
  }
  
  return env;
}

// Update file with replacements
function updateFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    log.error(`File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;
  
  for (const [search, replace] of Object.entries(replacements)) {
    if (content.includes(search) && replace) {
      content = content.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
      changed = true;
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  
  return false;
}

// Main setup function
async function main() {
  console.log(`
${colors.green}🌿 Ferni Setup Script${colors.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  const websiteDir = path.join(__dirname, '..');
  const envPath = path.join(websiteDir, '.forms.env');
  
  // Check for .forms.env
  if (!fs.existsSync(envPath)) {
    log.error('.forms.env file not found!');
    log.info('Copy .forms.env.example to .forms.env and fill in your details');
    log.info('  cp .forms.env.example .forms.env');
    process.exit(1);
  }
  
  const env = parseEnvFile(envPath);
  
  if (!env) {
    log.error('Could not parse .forms.env');
    process.exit(1);
  }
  
  log.success('Loaded .forms.env');
  
  // Track what we're updating
  const updates = {
    googleAnalytics: false,
    formspreeNewsletter: false,
    formspreesDeveloper: false,
    socialLinks: false,
    comingSoon: false
  };
  
  // ─────────────────────────────────────────
  // Update index.html
  // ─────────────────────────────────────────
  log.header('Updating index.html');
  
  const indexPath = path.join(websiteDir, 'index.html');
  const indexReplacements = {};
  
  // Google Analytics
  if (env.GOOGLE_ANALYTICS_ID) {
    indexReplacements['G-XXXXXXXXXX'] = env.GOOGLE_ANALYTICS_ID;
    updates.googleAnalytics = true;
    log.success(`Google Analytics: ${env.GOOGLE_ANALYTICS_ID}`);
  } else {
    log.warn('Google Analytics ID not set (GOOGLE_ANALYTICS_ID)');
  }
  
  // Newsletter Form (Mailchimp, Formspree, or Google Forms)
  if (env.MAILCHIMP_FORM_ACTION) {
    indexReplacements['https://formspree.io/f/YOUR_NEWSLETTER_FORM_ID'] = env.MAILCHIMP_FORM_ACTION;
    updates.formspreeNewsletter = true;
    log.success(`Newsletter Form (Mailchimp): configured`);
  } else if (env.FORMSPREE_NEWSLETTER_ID) {
    indexReplacements['YOUR_NEWSLETTER_FORM_ID'] = env.FORMSPREE_NEWSLETTER_ID;
    updates.formspreeNewsletter = true;
    log.success(`Newsletter Form (Formspree): ${env.FORMSPREE_NEWSLETTER_ID}`);
  } else if (env.GOOGLE_FORM_NEWSLETTER_URL) {
    // For Google Forms, we'll need to handle differently (redirect)
    log.info(`Newsletter Form (Google): Will redirect to Google Form`);
    updates.formspreeNewsletter = true;
  } else {
    log.warn('Newsletter form not configured (MAILCHIMP_FORM_ACTION, FORMSPREE_NEWSLETTER_ID, or GOOGLE_FORM_NEWSLETTER_URL)');
  }
  
  // Developer Waitlist Form
  if (env.FORMSPREE_DEVELOPER_ID) {
    indexReplacements['YOUR_FORM_ID'] = env.FORMSPREE_DEVELOPER_ID;
    updates.formspreesDeveloper = true;
    log.success(`Developer Form (Formspree): ${env.FORMSPREE_DEVELOPER_ID}`);
  } else if (env.GOOGLE_FORM_DEVELOPER_URL) {
    log.info(`Developer Form (Google): Will redirect to Google Form`);
    updates.formspreesDeveloper = true;
  } else {
    log.warn('Developer form not configured (FORMSPREE_DEVELOPER_ID or GOOGLE_FORM_DEVELOPER_URL)');
  }
  
  // Social media usernames
  if (env.TWITTER_USERNAME && env.TWITTER_USERNAME !== 'ferniAI') {
    indexReplacements['twitter.com/ferniAI'] = `twitter.com/${env.TWITTER_USERNAME}`;
    updates.socialLinks = true;
  }
  if (env.INSTAGRAM_USERNAME && env.INSTAGRAM_USERNAME !== 'ferni.ai') {
    indexReplacements['instagram.com/ferni.ai'] = `instagram.com/${env.INSTAGRAM_USERNAME}`;
    updates.socialLinks = true;
  }
  if (env.TIKTOK_USERNAME && env.TIKTOK_USERNAME !== 'ferni.ai') {
    indexReplacements['tiktok.com/@ferni.ai'] = `tiktok.com/@${env.TIKTOK_USERNAME}`;
    updates.socialLinks = true;
  }
  if (env.YOUTUBE_HANDLE && env.YOUTUBE_HANDLE !== 'ferniAI') {
    indexReplacements['youtube.com/@ferniAI'] = `youtube.com/@${env.YOUTUBE_HANDLE}`;
    updates.socialLinks = true;
  }
  
  if (Object.keys(indexReplacements).length > 0) {
    if (updateFile(indexPath, indexReplacements)) {
      log.success('Updated index.html');
    }
  }
  
  // ─────────────────────────────────────────
  // Update links.html
  // ─────────────────────────────────────────
  log.header('Updating links.html');
  
  const linksPath = path.join(websiteDir, 'links.html');
  const linksReplacements = { ...indexReplacements };
  
  // Check if we should remove "coming soon" badges
  const hasAllSocials = env.TWITTER_USERNAME && env.INSTAGRAM_USERNAME && 
                        env.TIKTOK_USERNAME && env.YOUTUBE_HANDLE && env.LINKEDIN_COMPANY;
  
  if (hasAllSocials && env.GOOGLE_ANALYTICS_ID) {
    // Remove coming-soon class
    let linksContent = fs.readFileSync(linksPath, 'utf-8');
    if (linksContent.includes('coming-soon')) {
      linksContent = linksContent.replace(/ coming-soon/g, '');
      fs.writeFileSync(linksPath, linksContent);
      updates.comingSoon = true;
      log.success('Removed "Coming Soon" badges');
    }
  }
  
  if (Object.keys(linksReplacements).length > 0) {
    if (updateFile(linksPath, linksReplacements)) {
      log.success('Updated links.html');
    }
  }
  
  // ─────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────
  log.header('Summary');
  
  const completed = Object.values(updates).filter(Boolean).length;
  const total = Object.keys(updates).length;
  
  console.log(`
${colors.green}Completed: ${completed}/${total} configurations${colors.reset}

${updates.googleAnalytics ? '✓' : '○'} Google Analytics
${updates.formspreeNewsletter ? '✓' : '○'} Newsletter Form
${updates.formspreesDeveloper ? '✓' : '○'} Developer Waitlist Form
${updates.socialLinks ? '✓' : '○'} Social Media Links
${updates.comingSoon ? '✓' : '○'} Coming Soon Badges Removed
`);

  // Show what's still needed
  const missing = [];
  if (!env.GOOGLE_ANALYTICS_ID) missing.push('GOOGLE_ANALYTICS_ID');
  if (!env.MAILCHIMP_FORM_ACTION && !env.FORMSPREE_NEWSLETTER_ID && !env.GOOGLE_FORM_NEWSLETTER_URL) {
    missing.push('Newsletter form (MAILCHIMP_FORM_ACTION, FORMSPREE_NEWSLETTER_ID, or GOOGLE_FORM_NEWSLETTER_URL)');
  }
  if (!env.FORMSPREE_DEVELOPER_ID && !env.GOOGLE_FORM_DEVELOPER_URL) {
    missing.push('Developer form (FORMSPREE_DEVELOPER_ID or GOOGLE_FORM_DEVELOPER_URL)');
  }
  
  if (missing.length > 0) {
    console.log(`${colors.yellow}Still needed in .forms.env:${colors.reset}`);
    missing.forEach(m => console.log(`  - ${m}`));
    console.log('');
  }
  
  // Show account info if present
  if (env.ADMIN_FIRST_NAME || env.SIGNUP_EMAIL) {
    log.header('Account Creation Info');
    if (env.ADMIN_FIRST_NAME) console.log(`  Name: ${env.ADMIN_FIRST_NAME} ${env.ADMIN_LAST_NAME || ''}`);
    if (env.SIGNUP_EMAIL) console.log(`  Email: ${env.SIGNUP_EMAIL}`);
    if (env.PHONE_NUMBER) console.log(`  Phone: ${env.PHONE_NUMBER}`);
    console.log('');
    console.log(`${colors.cyan}Use this info when creating accounts at:${colors.reset}`);
    console.log('  → https://twitter.com/i/flow/signup');
    console.log('  → https://www.instagram.com/accounts/emailsignup/');
    console.log('  → https://www.tiktok.com/signup');
    console.log('  → https://www.linkedin.com/company/setup/new/');
    console.log('  → https://www.youtube.com/channel_switcher');
    console.log('');
  }
  
  console.log(`${colors.green}🌿 Setup complete!${colors.reset}
  
Next steps:
1. Fill in any missing values in .forms.env
2. Run this script again: node scripts/setup-from-env.js
3. Test your forms and analytics
4. Deploy your site!
`);
}

main().catch(console.error);

