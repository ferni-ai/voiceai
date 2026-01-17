#!/usr/bin/env npx tsx
/**
 * Quick Spotify Connection Test
 */
import 'dotenv/config';

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

async function testSpotify() {
  console.log('🎵 Testing Spotify connection...\n');

  // Check env vars
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.log('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
    return;
  }
  console.log('✅ Client credentials found');

  if (!SPOTIFY_REFRESH_TOKEN) {
    console.log('❌ Missing SPOTIFY_REFRESH_TOKEN in .env');
    console.log('   Run: ferni auth spotify');
    return;
  }
  console.log('✅ Refresh token found');

  // Get access token
  console.log('\n📡 Getting access token...');
  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: SPOTIFY_REFRESH_TOKEN,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.log('❌ Token refresh failed:', tokenResponse.status);
      console.log('   ', error);
      return;
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const accessToken = tokenData.access_token;
    console.log('✅ Got access token');

    // Get user profile
    console.log('\n👤 Checking user profile...');
    const userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      console.log('❌ Failed to get user profile:', userResponse.status);
      return;
    }

    const user = await userResponse.json() as {
      display_name: string;
      product: string;
      email: string;
    };
    console.log('✅ Connected as:', user.display_name);
    console.log('   Email:', user.email);
    console.log('   Account:', user.product === 'premium' ? '⭐ Premium (full playback!)' : '⚠️ Free (limited to 30s previews)');

    // Get devices
    console.log('\n🔊 Checking devices...');
    const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!devicesResponse.ok) {
      console.log('⚠️ Could not get devices:', devicesResponse.status);
      return;
    }

    const devicesData = await devicesResponse.json() as {
      devices: Array<{ name: string; type: string; is_active: boolean; volume_percent: number }>;
    };

    if (devicesData.devices.length === 0) {
      console.log('⚠️ No devices found');
      console.log('   💡 Open Spotify on your phone, computer, or speaker to see it here');
    } else {
      console.log(`✅ Found ${devicesData.devices.length} device(s):`);
      for (const device of devicesData.devices) {
        const active = device.is_active ? ' ★ ACTIVE' : '';
        console.log(`   - ${device.name} (${device.type}) Vol: ${device.volume_percent}%${active}`);
      }
    }

    console.log('\n✨ Spotify is ready to use!');
    console.log('   Try: "Play some jazz" in a voice call');

  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : error);
  }
}

testSpotify();
