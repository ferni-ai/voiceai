#!/usr/bin/env npx tsx
/**
 * Quick script to call someone and say goodnight
 */

import 'dotenv/config';
import { callWithPersonaVoice } from '../src/services/voice/voice-call.js';

async function main() {
  const to = process.argv[2] || '+18012017497';
  const message = process.argv[3] || 'goodnight';

  console.log(`📞 Calling ${to} to say "${message}"...`);

  const result = await callWithPersonaVoice(to, message, 'ferni');

  console.log('\n✅ Call result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
