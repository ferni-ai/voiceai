#!/usr/bin/env npx tsx
/**
 * Clean Tool Descriptions
 *
 * Removes meta-instructions and makes descriptions follow Google's best practices:
 * - Descriptions should clearly describe what the function does
 * - Include when to use the function (use cases)
 * - DO NOT include behavior instructions like "DO NOT announce", "EXECUTE SILENTLY"
 *
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(ROOT, 'src/tools/config/tool-descriptions.json');

interface ToolEntry {
  description: string;
  file?: string;
  _original?: string;
}

interface Config {
  tools: Record<string, ToolEntry>;
  [key: string]: unknown;
}

// Patterns to remove from descriptions
const PATTERNS_TO_REMOVE = [
  // Execution instructions
  /^EXECUTE\s*(SILENTLY|IMMEDIATELY)?\s*(to\s+)?/gi,
  /^CALL\s*(SILENTLY|IMMEDIATELY|immediately)?\s*(to\s+)?/gi,
  /^Execute\s*(silently|immediately)?\s*[-–]?\s*/gi,
  
  // Announcement prohibitions  
  /\s*DO NOT\s*(announce|say|read|output)[^.]*\.?/gi,
  /\s*Execute without announcing[^.]*\.?/gi,
  /\s*-?\s*call and (share|speak|ask|use)[^.]*naturally\.?/gi,
  /\s*Execute\s*-\s*DO NOT say\.?/gi,
  
  // Trailing instructions
  /\s*Call and use the returned[^.]*\.?$/gi,
  /\s*DO NOT read tool output verbatim[^.]*\.?$/gi,
  /\s*respond naturally\.?$/gi,
];

// Clean a single description
function cleanDescription(desc: string): string {
  let cleaned = desc;
  
  for (const pattern of PATTERNS_TO_REMOVE) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Clean up whitespace and punctuation
  cleaned = cleaned
    .replace(/\s+/g, ' ')           // Multiple spaces to single
    .replace(/^\s*[-–]\s*/, '')     // Leading dash
    .replace(/\.\s*$/, '')          // Trailing period
    .replace(/^\s+|\s+$/g, '')      // Trim
    .replace(/^,\s*/, '')           // Leading comma
    .replace(/\s+\./g, '.')         // Space before period
    ;
  
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  // Add period if missing
  if (cleaned.length > 0 && !cleaned.endsWith('.') && !cleaned.endsWith('?')) {
    cleaned = cleaned + '.';
  }
  
  return cleaned;
}

// Better descriptions for common tools
const BETTER_DESCRIPTIONS: Record<string, string> = {
  // Music
  playMusic: 'Plays music matching the user\'s request. Use when user asks to play, start, or listen to music.',
  pauseMusic: 'Pauses the currently playing music.',
  resumeMusic: 'Resumes paused music playback.',
  searchMusic: 'Searches for music by artist, song, album, or genre.',
  suggestMusic: 'Suggests music based on mood, activity, or user preferences.',
  
  // Weather & News
  getWeather: 'Gets the current weather conditions for a location.',
  getWeatherForecast: 'Gets the weather forecast for upcoming days.',
  getNews: 'Gets current news headlines.',
  getFinancialNews: 'Gets financial and market news.',
  getSportsScore: 'Gets live or recent sports scores.',
  
  // Memory
  rememberAboutUser: 'Stores an important fact about the user for future reference.',
  recallFromMemory: 'Recalls previously stored information about the user.',
  deleteMemory: 'Deletes stored information about the user.',
  
  // Communication
  softTeamIntro: 'Lets a teammate briefly introduce themselves while you remain the active speaker.',
  meetTheTeam: 'Gets information about the team members and their specialties.',
  introduceMember: 'Formally introduces a team member to the user for the first time.',
  
  // Context & Awareness
  acknowledgeHoliday: 'Gets holiday-relevant context for the conversation.',
  checkIn: 'Checks in on how the user is feeling emotionally.',
  getFollowUp: 'Gets a relevant follow-up question to continue the conversation.',
  callbackReference: 'References something mentioned earlier in the conversation.',
  
  // Notes & Tasks
  noteEmotionalState: 'Records the user\'s current emotional state.',
  noteTopicInterest: 'Records that the user is interested in a topic.',
  recordName: 'Records the user\'s name.',
  
  // Utilities
  getDefinition: 'Gets the definition of a word or term.',
  disconnect: 'Ends the conversation gracefully.',
};

async function main(): Promise<void> {
  console.log('🧹 Cleaning tool descriptions...\n');
  
  const config: Config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  let updatedCount = 0;
  let betterCount = 0;
  
  for (const [toolId, entry] of Object.entries(config.tools)) {
    const original = entry.description;
    
    // Check if we have a better description
    if (BETTER_DESCRIPTIONS[toolId]) {
      entry.description = BETTER_DESCRIPTIONS[toolId];
      if (original !== entry.description) {
        betterCount++;
        console.log(`   ✨ ${toolId}: replaced with better description`);
      }
      continue;
    }
    
    // Otherwise, clean the existing description
    const cleaned = cleanDescription(original);
    
    if (cleaned !== original) {
      entry.description = cleaned;
      updatedCount++;
      
      if (original.length - cleaned.length > 20) {
        console.log(`   🧹 ${toolId}:`);
        console.log(`      Before: "${original.slice(0, 80)}..."`);
        console.log(`      After:  "${cleaned.slice(0, 80)}..."`);
      }
    }
  }
  
  // Save
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  
  console.log(`\n📊 Summary:`);
  console.log(`   Better descriptions: ${betterCount}`);
  console.log(`   Cleaned descriptions: ${updatedCount}`);
  console.log(`   Total: ${Object.keys(config.tools).length}`);
}

main().catch(console.error);

