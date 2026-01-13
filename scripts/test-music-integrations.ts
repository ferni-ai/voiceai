#!/usr/bin/env npx tsx
/**
 * Music & Smart Home Integration Tester
 *
 * Tests all music services:
 * - iTunes (always works - no auth needed)
 * - Spotify (needs OAuth token)
 * - Sonos (needs OAuth + connected speakers)
 *
 * Run: npx tsx scripts/test-music-integrations.ts
 *      npx tsx scripts/test-music-integrations.ts --user YOUR_USER_ID
 */

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const NC = '\x1b[0m';

interface TestResult {
  service: string;
  test: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

async function runTest(
  service: string,
  test: string,
  fn: () => Promise<string>
): Promise<void> {
  process.stdout.write(`  ${GRAY}[${service}]${NC} ${test}...`);

  try {
    const message = await fn();
    results.push({ service, test, passed: true, message });
    console.log(`${GREEN} ✓${NC}`);
    if (message) {
      console.log(`    ${GRAY}└─ ${message}${NC}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ service, test, passed: false, message });
    console.log(`${RED} ✗${NC}`);
    console.log(`    ${RED}└─ ${message}${NC}`);
  }
}

// ============================================================================
// ITUNES TESTS
// ============================================================================

async function testITunes(): Promise<void> {
  console.log(`\n${CYAN}━━━ iTunes (Previews) ━━━${NC}`);

  await runTest('iTunes', 'Search for music', async () => {
    const { searchItunes } = await import('../src/services/itunes.js');
    const data = await searchItunes('Bohemian Rhapsody Queen', 1);

    if (data.resultCount === 0) throw new Error('No results found');
    const track = data.results[0];
    return `Found: "${track.trackName}" by ${track.artistName}`;
  });

  await runTest('iTunes', 'Search for jazz', async () => {
    const { searchItunes } = await import('../src/services/itunes.js');
    const data = await searchItunes('jazz', 5);

    if (data.resultCount === 0) throw new Error('No jazz tracks found');
    return `Found ${data.resultCount} jazz tracks`;
  });

  await runTest('iTunes', 'Get preview URL', async () => {
    const { searchItunes } = await import('../src/services/itunes.js');
    const data = await searchItunes('Let It Be Beatles', 1);

    if (data.resultCount === 0) throw new Error('No results');
    const track = data.results[0];
    if (!track?.previewUrl) throw new Error('No preview URL');
    return `Preview: ${track.trackName} - ${track.previewUrl.slice(0, 40)}...`;
  });
}

// ============================================================================
// SPOTIFY TESTS
// ============================================================================

async function testSpotify(): Promise<void> {
  console.log(`\n${CYAN}━━━ Spotify ━━━${NC}`);

  await runTest('Spotify', 'Token file exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const tokenPath = path.join(process.cwd(), '.spotify-token.json');

    if (!fs.existsSync(tokenPath)) {
      throw new Error('No .spotify-token.json - run: ferni auth spotify');
    }
    return 'Token file found';
  });

  await runTest('Spotify', 'Client credentials configured', async () => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
    }
    return `Client ID: ${clientId.slice(0, 8)}...`;
  });

  await runTest('Spotify', 'Token is valid', async () => {
    const { validateSpotifyToken } = await import('../src/services/identity/spotify-auth.js');
    const valid = await validateSpotifyToken();

    if (!valid) throw new Error('Token is invalid or expired');
    return 'Token validated successfully';
  });

  await runTest('Spotify', 'Check Premium status', async () => {
    const { getSpotifyAccessToken } = await import('../src/services/identity/spotify-auth.js');
    const token = await getSpotifyAccessToken();

    if (!token) throw new Error('Could not get access token');

    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const user = (await response.json()) as { product?: string; display_name?: string };
    const isPremium = user.product === 'premium';

    return `${user.display_name} - ${isPremium ? '✅ Premium' : '⚠️ Free (limited playback)'}`;
  });

  await runTest('Spotify', 'List available devices', async () => {
    const { getSpotifyAccessToken } = await import('../src/services/identity/spotify-auth.js');
    const token = await getSpotifyAccessToken();

    if (!token) throw new Error('Could not get access token');

    const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = (await response.json()) as { devices: Array<{ name: string; type: string; is_active: boolean }> };

    if (data.devices.length === 0) {
      return 'No devices found - open Spotify on a device!';
    }

    const deviceList = data.devices
      .map((d) => `${d.name} (${d.type})${d.is_active ? ' ★' : ''}`)
      .join(', ');

    return `Devices: ${deviceList}`;
  });
}

// ============================================================================
// SONOS TESTS
// ============================================================================

async function testSonos(): Promise<void> {
  console.log(`\n${CYAN}━━━ Sonos ━━━${NC}`);

  // Get user ID from args or use default
  const userIdArg = process.argv.find((arg) => arg.startsWith('--user='));
  const userId = userIdArg?.split('=')[1] || process.env.TEST_USER_ID;

  await runTest('Sonos', 'Environment configured', async () => {
    const clientId = process.env.SONOS_CLIENT_ID;
    const clientSecret = process.env.SONOS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing SONOS_CLIENT_ID or SONOS_CLIENT_SECRET in .env');
    }
    return `Client ID: ${clientId.slice(0, 8)}...`;
  });

  await runTest('Sonos', 'Circuit breaker status', async () => {
    const { getSonosCircuitBreakerStatus } = await import('../src/services/smart-home/sonos.js');
    const status = getSonosCircuitBreakerStatus();

    if (status.isOpen) {
      throw new Error(`Circuit breaker OPEN - ${status.failures} failures`);
    }
    return 'Circuit breaker closed ✓';
  });

  if (!userId) {
    console.log(`\n  ${YELLOW}⚠️ Skipping user-specific Sonos tests${NC}`);
    console.log(`    ${GRAY}Run with --user=YOUR_USER_ID to test Sonos connection${NC}`);
    return;
  }

  await runTest('Sonos', 'User credentials exist', async () => {
    const { getUserSmartHomeCredentials } = await import(
      '../src/services/smart-home/user-credentials.js'
    );
    const creds = await getUserSmartHomeCredentials(userId);

    if (!creds.sonos) {
      throw new Error('No Sonos credentials - connect via Settings → Smart Home');
    }
    return 'Credentials found';
  });

  await runTest('Sonos', 'List households', async () => {
    const { getUserSmartHomeCredentials } = await import(
      '../src/services/smart-home/user-credentials.js'
    );
    const { getHouseholds } = await import('../src/services/smart-home/sonos.js');

    const creds = await getUserSmartHomeCredentials(userId);
    if (!creds.sonos) throw new Error('No Sonos credentials');

    const households = await getHouseholds(creds.sonos);
    if (households.length === 0) throw new Error('No households found');

    return `Found ${households.length} household(s)`;
  });

  await runTest('Sonos', 'List rooms/groups', async () => {
    const { getUserSmartHomeCredentials } = await import(
      '../src/services/smart-home/user-credentials.js'
    );
    const { getHouseholds, getGroups } = await import('../src/services/smart-home/sonos.js');

    const creds = await getUserSmartHomeCredentials(userId);
    if (!creds.sonos) throw new Error('No Sonos credentials');

    const households = await getHouseholds(creds.sonos);
    let totalGroups = 0;
    const roomNames: string[] = [];

    for (const household of households) {
      const groups = await getGroups(creds.sonos, household.id);
      totalGroups += groups.length;
      roomNames.push(...groups.map((g) => g.name));
    }

    if (totalGroups === 0) throw new Error('No rooms/groups found');
    return `Rooms: ${roomNames.join(', ')}`;
  });

  await runTest('Sonos', 'List favorites', async () => {
    const { getUserSmartHomeCredentials } = await import(
      '../src/services/smart-home/user-credentials.js'
    );
    const { getHouseholds, getFavorites } = await import('../src/services/smart-home/sonos.js');

    const creds = await getUserSmartHomeCredentials(userId);
    if (!creds.sonos) throw new Error('No Sonos credentials');

    const households = await getHouseholds(creds.sonos);
    let allFavorites: string[] = [];

    for (const household of households) {
      const favorites = await getFavorites(creds.sonos, household.id);
      allFavorites.push(...favorites.map((f) => f.name));
    }

    if (allFavorites.length === 0) {
      return '⚠️ No favorites - add some in Sonos app!';
    }
    return `Favorites: ${allFavorites.slice(0, 5).join(', ')}${allFavorites.length > 5 ? '...' : ''}`;
  });
}

// ============================================================================
// HOMEKIT STATUS
// ============================================================================

async function testHomeKit(): Promise<void> {
  console.log(`\n${CYAN}━━━ HomeKit ━━━${NC}`);

  console.log(`  ${GRAY}HomeKit is controlled through the iOS app.${NC}`);
  console.log(`  ${GRAY}The iOS app syncs HomeKit data to Ferni.${NC}`);

  const userIdArg = process.argv.find((arg) => arg.startsWith('--user='));
  const userId = userIdArg?.split('=')[1] || process.env.TEST_USER_ID;

  if (!userId) {
    console.log(`\n  ${YELLOW}⚠️ Run with --user=YOUR_USER_ID to check HomeKit sync status${NC}`);
    return;
  }

  await runTest('HomeKit', 'Check sync status', async () => {
    // HomeKit data is stored in Firestore, synced from iOS
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const configDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('homekit')
      .doc('config')
      .get();

    if (!configDoc.exists) {
      throw new Error('No HomeKit data synced - use iOS app to sync');
    }

    const data = configDoc.data();
    return `Last synced: ${data?.syncedAt || 'unknown'}`;
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n${CYAN}🎵 Music & Smart Home Integration Tester${NC}`);
  console.log('='.repeat(50));

  // Initialize Firebase if needed
  try {
    const { initializeApp, getApps } = await import('firebase-admin/app');
    if (getApps().length === 0) {
      initializeApp();
    }
  } catch {
    // Firebase not needed for all tests
  }

  await testITunes();
  await testSpotify();
  await testSonos();
  await testHomeKit();

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${CYAN}Summary:${NC} ${GREEN}${passed} passed${NC}, ${failed > 0 ? RED : GRAY}${failed} failed${NC}`);

  if (failed > 0) {
    console.log(`\n${YELLOW}Failed tests:${NC}`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  ${RED}✗${NC} [${r.service}] ${r.test}: ${r.message}`));
  }

  console.log('\n');
}

main().catch(console.error);
