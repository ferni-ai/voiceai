#!/usr/bin/env npx tsx
/**
 * Call to Annette - Safe travels back to Seattle!
 */

import 'dotenv/config';
import { makeNaturalCall } from '../src/services/voice/natural-call.service.js';

async function callAnnette() {
  console.log('\n✈️ Calling Annette - Safe travels to Seattle! ✈️\n');

  const result = await makeNaturalCall({
    phone: '8016713493',
    recipientName: 'Annette',
    type: 'gratitude',
    context: {
      customContext: {
        reason: 'spending Christmas together',
      },
    },
    customMessage: `Hey Annette! It's Ferni, calling on behalf of your dad Seth. He wanted me to catch you before you head back to Seattle. Having you home for Christmas meant everything to him... he had such a wonderful time with you. He wanted to say thank you for coming, and to wish you a very happy New Year and a safe flight back. He loves you so much, Annette. Take care of yourself!`,
  });

  console.log('\n📞 CALL TO ANNETTE:');
  console.log('   Status:', result.success ? '✅ SUCCESS' : '❌ FAILED');
  console.log('   Call SID:', result.callSid);
  console.log('   Ferni Voice:', result.usedCartesiaVoice ? '✓ Yes!' : '✗ Twilio fallback');
  console.log('');
}

callAnnette().catch(console.error);
