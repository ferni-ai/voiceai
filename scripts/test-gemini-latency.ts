#!/usr/bin/env npx tsx
/**
 * Gemini Latency Test
 * 
 * Tests raw Gemini API latency to validate if the connection issue
 * is with Gemini itself or something in our agent code.
 * 
 * Usage: npx tsx scripts/test-gemini-latency.ts
 */

import 'dotenv/config';

async function testGeminiLatency(): Promise<void> {
  console.log('🧪 GEMINI LATENCY TEST');
  console.log('='.repeat(60));
  
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY');
    process.exit(1);
  }
  
  console.log(`✅ API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
  console.log('');

  // Test 1: Simple REST API call (non-streaming)
  console.log('📡 Test 1: REST API (non-streaming)...');
  const restStart = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "Hello"' }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      }
    );
    const restDuration = Date.now() - restStart;
    
    if (!response.ok) {
      const error = await response.text();
      console.log(`   ❌ REST API failed: ${response.status} - ${error}`);
    } else {
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
      console.log(`   ✅ REST API: ${restDuration}ms`);
      console.log(`   📝 Response: "${text.trim()}"`);
    }
  } catch (err) {
    console.log(`   ❌ REST API error: ${err}`);
  }
  
  console.log('');

  // Test 2: Using @google/genai SDK
  console.log('📡 Test 2: @google/genai SDK...');
  const sdkStart = Date.now();
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });
    
    const result = await client.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: 'Say "Hello"',
    });
    const sdkDuration = Date.now() - sdkStart;
    
    const text = result.text || 'No response';
    console.log(`   ✅ SDK: ${sdkDuration}ms`);
    console.log(`   📝 Response: "${text.trim()}"`);
  } catch (err) {
    console.log(`   ❌ SDK error: ${err}`);
  }
  
  console.log('');

  // Test 3: Raw Gemini Live WebSocket (bypasses LiveKit)
  console.log('📡 Test 3: Gemini Live WebSocket (raw)...');
  const wsStart = Date.now();
  try {
    const WebSocket = (await import('ws')).default;
    
    // Gemini Live API WebSocket URL
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    
    const ws = new WebSocket(wsUrl);
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout (10s)'));
      }, 10000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`   ✅ WebSocket connected: ${Date.now() - wsStart}ms`);
        
        // Send setup message
        const setupMsg = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['TEXT'],
            },
          },
        };
        ws.send(JSON.stringify(setupMsg));
        console.log(`   📤 Setup sent: ${Date.now() - wsStart}ms`);
      });
      
      let setupComplete = false;
      let responseStart = 0;
      let fullResponse = '';
      
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.setupComplete) {
            setupComplete = true;
            console.log(`   ✅ Setup complete: ${Date.now() - wsStart}ms`);
            
            // Send a simple message
            responseStart = Date.now();
            const clientContent = {
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [{ text: 'Say "Hello"' }],
                }],
                turnComplete: true,
              },
            };
            ws.send(JSON.stringify(clientContent));
            console.log(`   📤 Message sent: ${Date.now() - wsStart}ms`);
          }
          
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.text) {
                fullResponse += part.text;
              }
            }
          }
          
          if (msg.serverContent?.turnComplete) {
            console.log(`   ✅ Response received: ${Date.now() - responseStart}ms`);
            console.log(`   📝 Response: "${fullResponse.trim()}"`);
            ws.close();
            resolve();
          }
        } catch (e) {
          console.log(`   ⚠️ Parse error: ${e}`);
        }
      });
      
      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        console.log(`   ❌ WebSocket error: ${err.message}`);
        reject(err);
      });
      
      ws.on('close', (code, reason) => {
        if (!setupComplete) {
          reject(new Error(`Connection closed before setup: ${code} ${reason}`));
        }
      });
    });
    
    const totalWsDuration = Date.now() - wsStart;
    console.log(`   ✅ Total WebSocket flow: ${totalWsDuration}ms`);
    
  } catch (err) {
    const wsDuration = Date.now() - wsStart;
    console.log(`   ❌ WebSocket error after ${wsDuration}ms: ${err}`);
  }
  
  console.log('');
  
  // Test 4: Large prompt (simulating 83KB system prompt)
  console.log('📡 Test 4: Large system prompt (like the agent uses)...');
  const largeStart = Date.now();
  try {
    const WebSocket = (await import('ws')).default;
    
    // Create a ~80KB system prompt (similar to what the agent uses)
    const largePrompt = `You are Ferni, a helpful AI life coach. ${'Here are some detailed instructions. '.repeat(3000)}`;
    console.log(`   📝 Prompt size: ${(largePrompt.length / 1024).toFixed(1)}KB (~${Math.round(largePrompt.length / 4)} tokens)`);
    
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    
    const ws = new WebSocket(wsUrl);
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket timeout (20s)'));
      }, 20000);
      
      ws.on('open', () => {
        console.log(`   ✅ WebSocket connected: ${Date.now() - largeStart}ms`);
        
        // Send setup with large system instruction
        const setupMsg = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['TEXT'],
            },
            systemInstruction: {
              parts: [{ text: largePrompt }],
            },
          },
        };
        ws.send(JSON.stringify(setupMsg));
        console.log(`   📤 Setup with large prompt sent: ${Date.now() - largeStart}ms`);
      });
      
      let setupComplete = false;
      let responseStart = 0;
      let fullResponse = '';
      
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.setupComplete) {
            setupComplete = true;
            console.log(`   ✅ Setup complete (large prompt processed!): ${Date.now() - largeStart}ms`);
            
            // Send a simple message
            responseStart = Date.now();
            const clientContent = {
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [{ text: 'Say "Hello"' }],
                }],
                turnComplete: true,
              },
            };
            ws.send(JSON.stringify(clientContent));
            console.log(`   📤 Message sent: ${Date.now() - largeStart}ms`);
          }
          
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.text) {
                fullResponse += part.text;
              }
            }
          }
          
          if (msg.serverContent?.turnComplete) {
            clearTimeout(timeout);
            console.log(`   ✅ Response received: ${Date.now() - responseStart}ms`);
            console.log(`   📝 Response: "${fullResponse.trim()}"`);
            ws.close();
            resolve();
          }
        } catch (e) {
          console.log(`   ⚠️ Parse error: ${e}`);
        }
      });
      
      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    
    const totalLargeDuration = Date.now() - largeStart;
    console.log(`   ✅ Total large prompt flow: ${totalLargeDuration}ms`);
    
  } catch (err) {
    const largeDuration = Date.now() - largeStart;
    console.log(`   ❌ Large prompt error after ${largeDuration}ms: ${err}`);
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('Test complete.');
}

testGeminiLatency().catch(console.error);
