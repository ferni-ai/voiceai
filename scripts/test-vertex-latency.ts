import { GoogleGenAI } from '@google/genai';

const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';
const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

async function testLatency() {
  console.log('Testing LLM latency...');
  console.log('USE_VERTEX_AI:', USE_VERTEX_AI);
  console.log('Project:', project);
  console.log('Location:', location);
  
  let client: GoogleGenAI;
  if (USE_VERTEX_AI && project) {
    console.log('🔷 Using Vertex AI');
    client = new GoogleGenAI({ vertexai: true, project, location });
  } else {
    console.log('🔶 Using Gemini API');
    client = new GoogleGenAI({ apiKey: apiKey! });
  }

  // Simple test
  const start1 = Date.now();
  const response1 = await client.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: 'Say hello in 5 words.',
  });
  console.log(`\n✅ Simple test: ${Date.now() - start1}ms`);
  console.log('Response:', response1.text?.slice(0, 50));

  // Test with larger prompt (simulating system prompt)
  const start2 = Date.now();
  const largePrompt = `You are Ferni, a warm life coach. ${'Remember this is important. '.repeat(500)} Now say hello briefly.`;
  const response2 = await client.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: largePrompt,
  });
  console.log(`\n✅ Large prompt test (${largePrompt.length} chars): ${Date.now() - start2}ms`);
  console.log('Response:', response2.text?.slice(0, 50));
}

testLatency().catch(console.error);
