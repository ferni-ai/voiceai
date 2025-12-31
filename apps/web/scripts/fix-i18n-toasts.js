#!/usr/bin/env node
/**
 * Automated i18n Toast Fixer
 * 
 * Automatically replaces hardcoded toast messages with t() calls
 * and adds the necessary translation keys.
 * 
 * Usage:
 *   node scripts/fix-i18n-toasts.js --dry-run   # Preview changes
 *   node scripts/fix-i18n-toasts.js             # Apply changes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UI_DIR = join(__dirname, '../src/ui');
const SERVICES_DIR = join(__dirname, '../src/services');
const LOCALES_DIR = join(__dirname, '../src/i18n/locales');
const EN_US_PATH = join(LOCALES_DIR, 'en-US.json');

const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose');

// Files to skip (already localized or dev-only)
const SKIP_FILES = [
  'dev-panel.ui.ts',
  'admin.ui.ts',
  'evalops-dashboard.ui.ts',
  'insights-debug-panel.ui.ts',
  'trigger-debug-panel.ui.ts',
];

// Toast message to translation key mapping
// Format: exact message -> key name
const TOAST_KEY_MAP = {
  // Success messages
  "Saved!": "saved",
  "Settings saved!": "settingsSaved",
  "Copied!": "copied",
  "Copied to clipboard!": "copiedToClipboard",
  "Deleted": "deleted",
  "Removed": "removed",
  "Updated!": "updated",
  "Added!": "added",
  "Shared!": "shared",
  "Link copied!": "linkCopied",
  "Token copied!": "tokenCopied",
  "Dates saved!": "datesSaved",
  "Entry saved!": "entrySaved",
  "Audio saved!": "audioSaved",
  "Profile saved!": "profileSaved",
  "Photo updated!": "photoUpdated",
  "Gift recorded!": "giftRecorded",
  "Moment saved!": "momentSaved",
  "Memory added": "memoryAdded",
  "Memory deleted": "memoryDeleted",
  "Voice updated": "voiceUpdated",
  "Changes saved": "changesSaved",
  "Agent deleted": "agentDeleted",
  "Invite sent!": "inviteSent",
  "Item approved!": "itemApproved",
  "Item rejected": "itemRejected",
  "Focus time blocked!": "focusTimeBlocked",
  "Disconnected": "disconnected",
  "Bridge found!": "bridgeFound",
  "Token created! Copy it now.": "tokenCreated",
  "Token deleted": "tokenDeleted",
  "Webhook created!": "webhookCreated",
  "Webhook deleted": "webhookDeleted",
  "Webhook works!": "webhookWorks",
  "Member promoted to admin": "memberPromoted",
  "Member removed": "memberRemoved",
  "All agents valid!": "allAgentsValid",
  "Backstory updated!": "backstoryUpdated",
  "Quirk added!": "quirkAdded",
  "Catchphrase added!": "catchphraseAdded",
  "Relationship added!": "relationshipAdded",
  
  // Connection success
  "Hue connected!": "hueConnected",
  "Ecobee connected!": "ecobeeConnected",
  "Sonos connected!": "sonosConnected",
  "HomeKit is connected!": "homeKitConnected",
  "Apple Health disconnected": "appleHealthDisconnected",
  "Eight Sleep disconnected": "eightSleepDisconnected",
  "LinkedIn disconnected": "linkedInDisconnected",
  "Voice clone created with Cartesia!": "voiceCloneCreated",
  "Voice profile created! (Simulated in dev mode)": "voiceProfileCreatedDev",
  "Got it! I'll remember you now.": "voiceEnrollmentSuccess",
  
  // Info messages
  "Refreshing...": "refreshing",
  "Transcribing...": "transcribing",
  "Entry removed": "entryRemoved",
  "New entry synced": "newEntrySynced",
  "Changes saved": "infoChangesSaved",
  "Team order saved": "teamOrderSaved",
  "Sample deleted": "sampleDeleted",
  "Syncing LinkedIn...": "syncingLinkedIn",
  "Stripe not configured. Using dev mode.": "stripeDevMode",
  "Don't have the app? Get it from the App Store!": "getIosApp",
  "Edit notes coming soon": "editNotesComingSoon",
  "Aggregates refreshing...": "aggregatesRefreshing",
  "Ferni always joins the roundtable": "ferniAlwaysJoins",
  "Running criticals...": "runningCriticals",
  "Running full suite...": "runningFullSuite",
  "Breath sync shimmer triggered": "breathSyncTriggered",
  
  // Warning messages
  "Enter a valid email": "enterValidEmail",
  "Enter a valid user ID": "enterValidUserId",
  "Enter your API key first": "enterApiKeyFirst",
  "Enter your token first": "enterTokenFirst",
  "Enter your bridge IP address": "enterBridgeIp",
  "Enter a name and valid phone number": "enterNameAndPhone",
  "Press the link button and try again": "pressLinkButton",
  "Unlock this team member first": "unlockTeamMemberFirst",
  "HomeKit not connected yet. Open the iOS app first.": "homeKitNotConnected",
  "Issues found (see console)": "issuesFoundConsole",
  "Transcription unavailable. Saving audio only.": "transcriptionUnavailable",
  "Voice journal is only available for Digital Twin agents": "voiceJournalTwinOnly",
  "Profile setup is only for Digital Twin agents": "profileSetupTwinOnly",
  "Samples saved, but cloning failed. You can retry later.": "samplesSavedCloningFailed",
  
  // Error messages - generic
  "Something went wrong. Try again?": "somethingWentWrong",
  "Hmm, that didn't work. Want to try again?": "hmmmTryAgain",
  "Hmm, that didn't work. Try again?": "hmmmTryAgainAlt",
  "That didn't go through. Try again?": "didntGoThrough",
  "Could not copy": "couldNotCopy",
  "Could not share": "couldNotShare",
  "Could not save dates": "couldNotSaveDates",
  "Could not save photo": "couldNotSavePhoto",
  "Could not save settings": "couldNotSaveSettings",
  "Could not load relationship data": "couldNotLoadRelationship",
  "Agent not found": "agentNotFound",
  "Enter a valid email": "enterValidEmail",
  
  // Error messages - couldn't patterns
  "Couldn't save. Try again?": "couldntSave",
  "Couldn't save changes": "couldntSaveChanges",
  "Couldn't save entry. Try again?": "couldntSaveEntry",
  "Couldn't save agent": "couldntSaveAgent",
  "Couldn't save order": "couldntSaveOrder",
  "Couldn't copy. Try again?": "couldntCopy",
  "Couldn't copy link": "couldntCopyLink",
  "Couldn't delete. Try again?": "couldntDelete",
  "Couldn't delete entry": "couldntDeleteEntry",
  "Couldn't delete memory": "couldntDeleteMemory",
  "Couldn't delete agent": "couldntDeleteAgent",
  "Couldn't delete agent. Try again?": "couldntDeleteAgentRetry",
  "Couldn't delete that. Try again?": "couldntDeleteThat",
  "Couldn't delete token": "couldntDeleteToken",
  "Couldn't delete webhook": "couldntDeleteWebhook",
  "Couldn't load agent": "couldntLoadAgent",
  "Couldn't load your data. Try again?": "couldntLoadData",
  "Couldn't load the queue. Try refreshing?": "couldntLoadQueue",
  "Couldn't add memory": "couldntAddMemory",
  "Couldn't create token": "couldntCreateToken",
  "Couldn't create webhook": "couldntCreateWebhook",
  "Couldn't create that. Try again?": "couldntCreateThat",
  "Couldn't create voice clone. Try again?": "couldntCreateVoiceClone",
  "Couldn't update agent": "couldntUpdateAgent",
  "Couldn't update webhook": "couldntUpdateWebhook",
  "Couldn't test webhook": "couldntTestWebhook",
  "Couldn't send invite": "couldntSendInvite",
  "Couldn't approve that. Try again?": "couldntApprove",
  "Couldn't reject that. Try again?": "couldntReject",
  "Couldn't remove. Try again?": "couldntRemove",
  "Couldn't remove them. Try again?": "couldntRemoveThem",
  "Couldn't find user feedback": "couldntFindFeedback",
  "Couldn't find this agent": "couldntFindAgent",
  "Couldn't find this assistant": "couldntFindAssistant",
  "Couldn't find this character": "couldntFindCharacter",
  "Couldn't find this legacy": "couldntFindLegacy",
  "Couldn't find this mentor": "couldntFindMentor",
  "Couldn't get voice URL": "couldntGetVoiceUrl",
  "Couldn't set temperature. Try again?": "couldntSetTemp",
  "Couldn't block focus time": "couldntBlockFocus",
  "Couldn't run validation": "couldntRunValidation",
  "Couldn't refresh aggregates": "couldntRefreshAggregates",
  "Couldn't access microphone": "couldNotAccessMic",
  
  // Connection errors
  "Couldn't connect. Try again?": "couldntConnect",
  "Couldn't connect. Make sure you're on the same network.": "couldntConnectNetwork",
  "Couldn't connect to bridge. Try again.": "couldntConnectBridge",
  "Couldn't connect to Ecobee. Try again?": "couldntConnectEcobee",
  "Couldn't connect to Eight Sleep. Try again?": "couldntConnectEightSleep",
  "Couldn't connect to Oura. Try again?": "couldntConnectOura",
  "Couldn't connect to Sonos. Try again?": "couldntConnectSonos",
  "Couldn't connect Sonos. Try again?": "couldntConnectSonosAlt",
  "Couldn't connect LinkedIn. Try again?": "couldntConnectLinkedIn",
  "Couldn't disconnect. Try again?": "couldntDisconnect",
  "Couldn't disconnect LinkedIn": "couldntDisconnectLinkedIn",
  "Couldn't reach that IP. Check the address.": "couldntReachIp",
  "Couldn't start Sonos connection. Try again?": "couldntStartSonos",
  
  // Action errors
  "Couldn't open journal. Try again?": "couldntOpenJournal",
  "Couldn't open profile. Try again?": "couldntOpenProfile",
  "Couldn't open stories. Try again?": "couldntOpenStories",
  "Couldn't open teachings. Try again?": "couldntOpenTeachings",
  "Couldn't open character. Try again?": "couldntOpenCharacter",
  "Couldn't open tasks. Try again?": "couldntOpenTasks",
  "Couldn't open sharing. Try again?": "couldntOpenSharing",
  "Couldn't open voice recorder. Try again?": "couldntOpenVoiceRecorder",
  "Couldn't start conversation. Try again?": "couldntStartConversation",
  "Couldn't start coaching. Try again?": "couldntStartCoaching",
  "Couldn't start roleplay. Try again?": "couldntStartRoleplay",
  "Couldn't start work mode. Try again?": "couldntStartWorkMode",
  "Couldn't submit review. Try again?": "couldntSubmitReview",
  "Could not open journal": "couldNotOpenJournal",
  "Could not open profile setup": "couldNotOpenProfileSetup",
  "Could not load your journals": "couldNotLoadJournals",
  
  // Dev panel messages (keep for reference but skip fixing)
  "Reset to first-time user. Reload the page to test.": "devResetFirstTime",
  "Simulated 1 conversation. Reload to see changes.": "devSimulated1",
  "Simulated 3 conversations. Reload to see changes.": "devSimulated3",
  "Simulated 5 conversations. Reload to see changes.": "devSimulated5",
  "Simulated 10 conversations. Reload to see changes.": "devSimulated10",
};

function getAllFiles(dir, files = []) {
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        getAllFiles(fullPath, files);
      } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Directory doesn't exist
  }
  return files;
}

function shouldSkip(filePath) {
  return SKIP_FILES.some(skip => filePath.endsWith(skip));
}

function generateKey(message) {
  // Check if we have a predefined key
  if (TOAST_KEY_MAP[message]) {
    return TOAST_KEY_MAP[message];
  }
  
  // Generate a key from the message
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
    .slice(0, 40);
}

function processFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const relPath = relative(process.cwd(), filePath);
  
  // Check if file already imports from i18n
  const hasI18nImport = /import\s*{[^}]*\bt\b[^}]*}\s*from\s*['"][^'"]*i18n/.test(content);
  
  // Find all toast calls with hardcoded strings
  const toastRegex = /toast\.(success|error|info|warning)\(\s*(['"`])([^'"`]+)\2\s*\)/g;
  
  const newKeys = {};
  let match;
  let replacements = [];
  
  while ((match = toastRegex.exec(content)) !== null) {
    const [fullMatch, type, quote, message] = match;
    const key = generateKey(message);
    const fullKey = `toasts.${key}`;
    
    newKeys[key] = message;
    replacements.push({
      original: fullMatch,
      replacement: `toast.${type}(t('${fullKey}'))`,
      message,
      key: fullKey,
    });
  }
  
  if (replacements.length === 0) {
    return { file: relPath, changes: 0, newKeys: {} };
  }
  
  // Apply replacements
  for (const r of replacements) {
    content = content.replace(r.original, r.replacement);
  }
  
  // Add i18n import if needed
  if (!hasI18nImport && replacements.length > 0) {
    // Find the best place to add the import
    const importMatch = content.match(/^(import\s+.*;\n)+/m);
    if (importMatch) {
      const insertPos = importMatch.index + importMatch[0].length;
      const i18nImport = "import { t } from '../i18n/index.js';\n";
      
      // Check relative path depth
      const depth = relPath.split('/').length - 4; // src/ui/file.ts = depth 0
      let importPath = '../i18n/index.js';
      if (relPath.includes('/ui/voice-journal/')) importPath = '../../i18n/index.js';
      if (relPath.includes('/ui/marketplace/')) importPath = '../../i18n/index.js';
      if (relPath.includes('/ui/trust-journey/')) importPath = '../../i18n/index.js';
      if (relPath.includes('/ui/visualizations/')) importPath = '../../i18n/index.js';
      if (relPath.includes('/ui/admin/')) importPath = '../../i18n/index.js';
      if (relPath.includes('/services/')) importPath = '../i18n/index.js';
      
      content = content.slice(0, insertPos) + 
                `import { t } from '${importPath}';\n` + 
                content.slice(insertPos);
    }
  }
  
  return {
    file: relPath,
    changes: replacements.length,
    newKeys,
    content: content !== originalContent ? content : null,
    replacements,
  };
}

function main() {
  console.log('🌍 Automated i18n Toast Fixer\n');
  console.log(isDryRun ? '📋 DRY RUN - No files will be modified\n' : '🔧 APPLYING CHANGES\n');
  console.log('='.repeat(60));
  
  const uiFiles = getAllFiles(UI_DIR);
  const serviceFiles = getAllFiles(SERVICES_DIR);
  const allFiles = [...uiFiles, ...serviceFiles];
  
  let totalChanges = 0;
  const allNewKeys = {};
  const modifiedFiles = [];
  
  for (const file of allFiles) {
    if (shouldSkip(file)) {
      if (isVerbose) console.log(`⏭️  Skipping: ${relative(process.cwd(), file)}`);
      continue;
    }
    
    const result = processFile(file);
    
    if (result.changes > 0) {
      totalChanges += result.changes;
      Object.assign(allNewKeys, result.newKeys);
      modifiedFiles.push(result);
      
      console.log(`\n📁 ${result.file} (${result.changes} changes)`);
      if (isVerbose) {
        for (const r of result.replacements) {
          console.log(`   ${r.message.slice(0, 40)}... → t('${r.key}')`);
        }
      }
      
      if (!isDryRun && result.content) {
        writeFileSync(file, result.content, 'utf-8');
      }
    }
  }
  
  // Update en-US.json with new keys
  if (Object.keys(allNewKeys).length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log(`\n📝 New translation keys to add: ${Object.keys(allNewKeys).length}`);
    
    const enUS = JSON.parse(readFileSync(EN_US_PATH, 'utf-8'));
    
    // Add new keys to toasts section
    if (!enUS.toasts) enUS.toasts = {};
    
    let addedCount = 0;
    for (const [key, value] of Object.entries(allNewKeys)) {
      if (!enUS.toasts[key]) {
        enUS.toasts[key] = value;
        addedCount++;
        if (isVerbose) console.log(`   + toasts.${key}: "${value}"`);
      }
    }
    
    if (!isDryRun && addedCount > 0) {
      // Sort keys alphabetically
      enUS.toasts = Object.fromEntries(
        Object.entries(enUS.toasts).sort(([a], [b]) => a.localeCompare(b))
      );
      writeFileSync(EN_US_PATH, JSON.stringify(enUS, null, 2) + '\n', 'utf-8');
      console.log(`\n✅ Added ${addedCount} new keys to en-US.json`);
    } else if (isDryRun) {
      console.log(`\n📋 Would add ${addedCount} new keys to en-US.json`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Files modified: ${modifiedFiles.length}`);
  console.log(`   Toast calls fixed: ${totalChanges}`);
  console.log(`   New translation keys: ${Object.keys(allNewKeys).length}`);
  
  if (isDryRun) {
    console.log(`\n💡 Run without --dry-run to apply changes`);
  } else {
    console.log(`\n✅ Changes applied!`);
    console.log(`\n⚠️  Remember to run: npm run i18n:sync-missing`);
    console.log(`   to sync new keys to other locales`);
  }
}

main();
