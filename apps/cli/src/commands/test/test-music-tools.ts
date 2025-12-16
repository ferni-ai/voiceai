import { initializeToolRegistry, toolRegistry } from '../../../../../src/tools/registry/index.js';

async function test() {
  console.log("Initializing tool registry...");
  const result = await initializeToolRegistry();
  console.log("Total tools loaded:", result.loaded);
  console.log("Domains loaded:", Object.entries(result.byDomain).filter(([k, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(', '));
  
  // Check for entertainment tools
  const allTools = toolRegistry.getAll();
  const entertainmentTools = allTools.filter(t => t.domain === "entertainment");
  console.log("\nEntertainment tools found:", entertainmentTools.length);
  console.log("Entertainment tool IDs:", entertainmentTools.map(t => t.id));
  
  // Check for playMusic specifically
  const playMusic = toolRegistry.get("playMusic");
  console.log("\nplayMusic found:", !!playMusic);
  if (playMusic) {
    console.log("playMusic description:", playMusic.description?.substring(0, 150));
  }
}

test().catch(console.error);
