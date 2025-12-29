#!/usr/bin/env npx tsx
/**
 * Special call to Mom Betty from Seth!
 */

import 'dotenv/config';
import { makeNaturalCall } from '../src/services/voice/natural-call.service.js';

async function callMomBetty() {
  console.log('\n🎄 Calling Mom Betty with love from Seth! 🎄\n');

  const result = await makeNaturalCall({
    phone: '8018983303',
    recipientName: 'Betty',
    type: 'gratitude',
    context: {
      customContext: {
        reason: 'Christmas and those amazing donuts',
      },
    },
    customMessage: `Hey Betty! It's Ferni, calling on behalf of your son Seth. He wanted me to wish you an absolutely amazing morning! And he wanted to say thank you so much for Christmas and for those donuts... they were incredible. You're the best mom. Seth loves you! Have a wonderful day!`,
  });

  console.log('\n📞 CALL TO MOM BETTY:');
  console.log('   Status:', result.success ? '✅ SUCCESS' : '❌ FAILED');
  console.log('   Call SID:', result.callSid);
  console.log('   Ferni Voice:', result.usedCartesiaVoice ? '✓ Yes!' : '✗ Twilio fallback');
  console.log('');
}

callMomBetty().catch(console.error);
