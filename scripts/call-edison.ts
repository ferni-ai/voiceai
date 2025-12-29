#!/usr/bin/env npx tsx
/**
 * Call to Edison - Safe travels back to Seattle!
 */

import 'dotenv/config';
import { makeNaturalCall } from '../src/services/voice/natural-call.service.js';

async function callEdison() {
  console.log('\n✈️ Calling Edison - Safe travels to Seattle! ✈️\n');

  const result = await makeNaturalCall({
    phone: '8014403410',
    recipientName: 'Edison',
    type: 'gratitude',
    context: {
      customContext: {
        reason: 'spending Christmas together',
      },
    },
    customMessage: `Hey Edison! It's Ferni, calling on behalf of your dad Seth. He wanted me to catch you before you head back to Seattle. He had such an amazing time with you this Christmas... it meant the world to him having you home. He wanted to say thank you for coming, and to wish you a very happy New Year and a safe flight back. He loves you, Edison. Take care of yourself out there!`,
  });

  console.log('\n📞 CALL TO EDISON:');
  console.log('   Status:', result.success ? '✅ SUCCESS' : '❌ FAILED');
  console.log('   Call SID:', result.callSid);
  console.log('   Ferni Voice:', result.usedCartesiaVoice ? '✓ Yes!' : '✗ Twilio fallback');
  console.log('');
}

callEdison().catch(console.error);
