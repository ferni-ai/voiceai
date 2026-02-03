#!/usr/bin/env npx tsx
/**
 * Display an enhanced PersonaPlex prompt
 * 
 * Usage: pnpm tsx scripts/personaplex/show-enhanced-prompt.ts [persona]
 */

import { buildEnhancedPersonaPlexPrompt } from '../../src/integrations/personaplex/enhanced-prompt-builder.js';

async function main() {
  const personaId = process.argv[2] || 'ferni';
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Enhanced PersonaPlex Prompt Preview                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Persona: ${personaId}\n`);
  
  const result = await buildEnhancedPersonaPlexPrompt(personaId, {
    userId: 'demo-user',
    trustLevel: 0.6,
    isReturningUser: true,
    userName: 'Sarah',
    emotionalState: 'feeling a bit overwhelmed but hopeful',
    memoryContext: `- Sarah is a software engineer at a startup
- She's been working on a big project deadline
- Last time she mentioned feeling burned out
- She loves hiking and has a dog named Max`,
    recentTopics: ['work stress', 'work-life balance', 'self-care'],
    availableTools: [
      { name: 'music', triggerPhrase: "I'll play some music", description: 'Play calming music' },
      { name: 'breathing', triggerPhrase: "Let's do a breathing exercise", description: 'Guide a breathing exercise' },
    ],
  });
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TEXT PROMPT:');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(result.textPrompt);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('METADATA:');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Voice Prompt: ${result.voicePrompt}`);
  console.log(`Estimated Tokens: ${result.estimatedTokens}`);
  console.log(`Prompt Length: ${result.textPrompt.length} characters`);
}

main().catch(console.error);
