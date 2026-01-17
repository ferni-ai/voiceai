#!/usr/bin/env npx tsx
/**
 * LiveKit AgentSession Test
 * 
 * Tests the full LiveKit → Gemini flow to identify where the slowness is.
 * This mimics what the actual agent does, but without a LiveKit room.
 */

import 'dotenv/config';

async function test(): Promise<void> {
  console.log('🧪 LIVEKIT AGENT SESSION TEST');
  console.log('='.repeat(60));
  
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found');
    process.exit(1);
  }
  
  console.log(`✅ API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
  console.log('');

  const startTime = Date.now();
  
  console.log('📦 Importing modules...');
  const importStart = Date.now();
  const genai = await import('@google/genai');
  const google = await import('@livekit/agents-plugin-google');
  const { initializeLogger } = await import('@livekit/agents');
  initializeLogger({ pretty: false });
  console.log(`   ⏱️ Imports: ${Date.now() - importStart}ms`);
  
  console.log('');
  console.log('🔧 Creating RealtimeModel...');
  const modelStart = Date.now();
  const llm = new google.beta.realtime.RealtimeModel({
    model: 'gemini-2.0-flash-exp',
    apiKey,
    modalities: [genai.Modality.TEXT],
    temperature: 0.8,
    instructions: 'You are a helpful assistant. Be concise.',
  });
  console.log(`   ⏱️ Model created: ${Date.now() - modelStart}ms`);
  
  console.log('');
  console.log('📡 Getting internal session from model...');
  
  // The RealtimeModel has an internal session() method
  // This is what the LiveKit AgentSession uses
  const sessionStart = Date.now();
  const session = llm.session();
  console.log(`   ⏱️ Session object created: ${Date.now() - sessionStart}ms`);
  
  // Listen for events on the session
  console.log('');
  console.log('👂 Attaching event listeners...');
  
  session.on('generation_created', () => {
    console.log(`   📡 generation_created event at ${Date.now() - startTime}ms`);
  });
  
  session.on('agent_state_changed', (state: unknown) => {
    console.log(`   📡 agent_state_changed: ${state} at ${Date.now() - startTime}ms`);
  });
  
  session.on('user_state_changed', (state: unknown) => {
    console.log(`   📡 user_state_changed: ${state} at ${Date.now() - startTime}ms`);
  });
  
  session.on('error', (err: Error) => {
    console.log(`   ❌ Session error at ${Date.now() - startTime}ms: ${err.message}`);
  });
  
  // Now try to call generateReply (this is what the prewarm does)
  console.log('');
  console.log('🚀 Calling generateReply (this is what prewarm does)...');
  const genStart = Date.now();
  
  try {
    const handle = session.generateReply({
      instructions: 'Say "Hello"',
      allowInterruptions: true,
    });
    
    console.log(`   📤 generateReply called: ${Date.now() - genStart}ms`);
    
    // Set up timeout warning
    const warnInterval = setInterval(() => {
      console.log(`   ⏳ Still waiting... ${Date.now() - genStart}ms`);
    }, 5000);
    
    const hardTimeout = setTimeout(() => {
      console.log(`   ❌ HARD TIMEOUT at ${Date.now() - genStart}ms`);
      clearInterval(warnInterval);
      process.exit(1);
    }, 30000);
    
    console.log('   ⏳ Waiting for waitForPlayout()...');
    await handle.waitForPlayout();
    
    clearInterval(warnInterval);
    clearTimeout(hardTimeout);
    
    console.log(`   ✅ generateReply complete: ${Date.now() - genStart}ms`);
  } catch (err) {
    console.log(`   ❌ generateReply error at ${Date.now() - genStart}ms: ${err}`);
  }
  
  console.log('');
  console.log(`Total time: ${Date.now() - startTime}ms`);
  console.log('='.repeat(60));
  
  // Cleanup
  try {
    session.close();
  } catch {
    // ignore
  }
  
  // Force exit (event loops may keep running)
  setTimeout(() => process.exit(0), 1000);
}

test().catch(console.error);
