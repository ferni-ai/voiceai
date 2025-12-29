#!/usr/bin/env npx tsx
/**
 * Direct LLM Latency Test
 * 
 * Tests Gemini API vs Vertex AI latency DIRECTLY, bypassing LiveKit SDK.
 * This helps isolate whether performance issues are in:
 * - The LLM itself (Google's servers)
 * - The LiveKit SDK's WebSocket handling
 * - Our application code
 */

// We need to import from the same package the SDK uses
import { GoogleGenAI } from '@google/genai';

const SMALL_PROMPT = 'Say hello in one word';
const MEDIUM_PROMPT = `You are Ferni, a warm and supportive life coach.
Your role is to help users with their daily lives.
Be warm, friendly, and conversational.

User says: "Hi Ferni, how are you today?"`;

// Simulate our actual prompt size (~20K tokens)
const LARGE_PROMPT = `You are Ferni, a warm life coach with access to tools.
${Array(200).fill('When a user asks for something, respond naturally and helpfully.').join('\n')}

User says: "What's the weather like?"`;

async function testGeminiAPI(prompt: string, label: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: Gemini API (AI Studio) - ${label}`);
  console.log(`${'='.repeat(60)}`);
  
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.log('❌ GOOGLE_API_KEY not set - skipping Gemini API test');
    return null;
  }
  
  console.log(`Prompt size: ${prompt.length} chars (~${Math.round(prompt.length/4)} tokens)`);
  
  const client = new GoogleGenAI({ apiKey });
  const start = Date.now();
  
  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const elapsed = Date.now() - start;
    const responseText = response.text || '';
    console.log(`✅ Response (${responseText.length} chars): ${responseText.slice(0, 100)}...`);
    console.log(`⏱️  Latency: ${elapsed}ms`);
    return elapsed;
  } catch (error: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ Error after ${elapsed}ms: ${error.message || error}`);
    if (error.status === 429) {
      console.log('🚨 RATE LIMITED (429) - Quota exceeded!');
    }
    return null;
  }
}

async function testVertexAI(prompt: string, label: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: Vertex AI - ${label}`);
  console.log(`${'='.repeat(60)}`);
  
  const project = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  
  console.log(`Project: ${project}`);
  console.log(`Location: ${location}`);
  console.log(`Prompt size: ${prompt.length} chars (~${Math.round(prompt.length/4)} tokens)`);
  
  const client = new GoogleGenAI({ 
    vertexai: true,
    project,
    location,
  });
  
  const start = Date.now();
  
  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const elapsed = Date.now() - start;
    const responseText = response.text || '';
    console.log(`✅ Response (${responseText.length} chars): ${responseText.slice(0, 100)}...`);
    console.log(`⏱️  Latency: ${elapsed}ms`);
    return elapsed;
  } catch (error: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ Error after ${elapsed}ms: ${error.message || error}`);
    return null;
  }
}

async function main() {
  console.log('\n');
  console.log('🔬 LLM LATENCY TEST - Direct API calls (bypassing LiveKit SDK)');
  console.log('================================================================\n');
  console.log('This test calls Gemini/Vertex AI DIRECTLY using @google/genai');
  console.log('to measure raw LLM latency without SDK overhead.\n');
  
  const results: Record<string, number | null> = {};
  
  // Test small prompt
  results['gemini_small'] = await testGeminiAPI(SMALL_PROMPT, 'Small Prompt');
  results['vertex_small'] = await testVertexAI(SMALL_PROMPT, 'Small Prompt');
  
  // Test medium prompt  
  results['gemini_medium'] = await testGeminiAPI(MEDIUM_PROMPT, 'Medium Prompt');
  results['vertex_medium'] = await testVertexAI(MEDIUM_PROMPT, 'Medium Prompt');
  
  // Test large prompt (simulates our actual use case)
  results['gemini_large'] = await testGeminiAPI(LARGE_PROMPT, 'Large Prompt (~5K tokens)');
  results['vertex_large'] = await testVertexAI(LARGE_PROMPT, 'Large Prompt (~5K tokens)');
  
  // Summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log('\n| Test            | Gemini API | Vertex AI |');
  console.log('|-----------------|------------|-----------|');
  console.log(`| Small Prompt    | ${results.gemini_small ? `${results.gemini_small}ms` : 'FAIL'}      | ${results.vertex_small ? `${results.vertex_small}ms` : 'FAIL'}     |`);
  console.log(`| Medium Prompt   | ${results.gemini_medium ? `${results.gemini_medium}ms` : 'FAIL'}      | ${results.vertex_medium ? `${results.vertex_medium}ms` : 'FAIL'}     |`);
  console.log(`| Large Prompt    | ${results.gemini_large ? `${results.gemini_large}ms` : 'FAIL'}      | ${results.vertex_large ? `${results.vertex_large}ms` : 'FAIL'}     |`);
  
  console.log('\n');
  console.log('INTERPRETATION:');
  console.log('- If Gemini API times < Vertex AI: Vertex AI has more latency');
  console.log('- If both are slow (~2-5s): LLM itself is slow');
  console.log('- If both are fast (<1s): SDK/WebSocket overhead is the issue');
  console.log('- If Gemini API fails (429): Rate limited - use Vertex AI');
  console.log('\n');
}

main().catch(console.error);
