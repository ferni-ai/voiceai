/**
 * Real Home Integration Tests
 *
 * Tests Ferni's smart home capabilities against ACTUAL devices.
 *
 * Run with:
 *   pnpm test:real-home          # All tests
 *   pnpm test:real-home:discover # Discovery only (safe)
 *   pnpm test:real-home:status   # Status only (safe)
 *   pnpm test:real-home:control  # Control tests (modifies home!)
 *   pnpm test:real-home:vibe     # Vibe E2E tests
 *
 * Set DRY_RUN=true to preview without making changes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getRealHomeClient,
  resetRealHomeClient,
  type RealDevice,
  type HomeState,
} from './real-home-client.js';

// =============================================================================
// TEST SETUP
// =============================================================================

const client = getRealHomeClient();
const config = client.getConfig();

// Skip all tests if no platforms configured
// Home Assistant is OPTIONAL - direct integrations work great!
const hasAnyPlatform =
  config.homeAssistant.configured ||
  config.ecobee.configured ||
  config.hue.configured ||
  config.lifx.configured;

// Direct integrations (preferred)
const hasDirectIntegration =
  config.ecobee.configured ||
  config.hue.configured ||
  config.lifx.configured;

// State management
let discoveredDevices: RealDevice[] = [];
let savedState: HomeState | null = null;

// =============================================================================
// CONNECTION TESTS (Always run first)
// =============================================================================

describe('Real Home - Connection Check', () => {
  it('should have at least one platform configured', ({ skip }) => {
    if (!hasAnyPlatform) {
      console.log('\n⚠️  No smart home platforms configured!');
      console.log('📖 See tests/integration/real-home/README.md for setup instructions.\n');
      console.log('📝 Create .env.local with your credentials:\n');
      console.log('   DIRECT INTEGRATIONS (Recommended):');
      console.log('   ──────────────────────────────────');
      console.log('   ECOBEE_API_KEY=your_key        # Thermostat');
      console.log('   HUE_BRIDGE_IP=192.168.1.x      # Philips Hue lights');
      console.log('   HUE_USERNAME=your_username');
      console.log('   LIFX_TOKEN=your_token          # LIFX lights\n');
      console.log('   OPTIONAL (for advanced users):');
      console.log('   ──────────────────────────────────');
      console.log('   HOME_ASSISTANT_URL=http://ha.local:8123');
      console.log('   HOME_ASSISTANT_TOKEN=your_token\n');
      console.log('   Quick start: pnpm ecobee:auth\n');
      // Skip the test when no platforms are configured (this is expected in CI)
      skip();
      return;
    }
    // Pass if ANY platform is configured
    expect(hasAnyPlatform).toBe(true);
  });

  it('should connect to configured platforms', async () => {
    if (!hasAnyPlatform) return;

    const connections = await client.checkConnections();

    console.log('\n🔌 Platform Connections:');
    console.log('   DIRECT INTEGRATIONS (preferred):');
    console.log(`     Ecobee: ${connections.ecobee ? '✅ Connected' : '⏭️ Not configured'}`);
    console.log(`     Hue: ${connections.hue ? '✅ Connected' : '⏭️ Not configured'}`);
    console.log(`     LIFX: ${connections.lifx ? '✅ Connected' : '⏭️ Not configured'}`);
    console.log('   OPTIONAL:');
    console.log(`     Home Assistant: ${connections.homeAssistant ? '✅ Connected' : '⏭️ Not configured'}\n`);

    // At least one should be connected
    const anyConnected =
      connections.homeAssistant || connections.ecobee || connections.hue || connections.lifx;

    if (!anyConnected) {
      console.log('⚠️  No platforms connected! Check credentials and network.\n');
    }

    // Show a helpful tip if using HA but not direct integrations
    if (connections.homeAssistant && !connections.anyDirectIntegration) {
      console.log('💡 Tip: Direct integrations (Ecobee, Hue, LIFX) are simpler to set up!');
      console.log('   They work without Home Assistant and have fewer moving parts.\n');
    }

    expect(anyConnected).toBe(true);
  });

  it('should show integration preference', () => {
    console.log('\n📊 Integration Strategy:');
    
    if (hasDirectIntegration) {
      console.log('   ✅ Using direct integrations (recommended)');
      if (config.homeAssistant.configured) {
        console.log('   ℹ️  Home Assistant also configured (will use for other devices)');
      }
    } else if (config.homeAssistant.configured) {
      console.log('   ⚠️ Using Home Assistant only');
      console.log('   💡 Consider direct integrations for simpler setup!');
    }
    console.log('');
  });
});

// =============================================================================
// DEVICE DISCOVERY (Safe - Read Only)
// =============================================================================

describe('Real Home - Device Discovery', () => {
  beforeAll(async () => {
    if (!hasAnyPlatform) return;
    discoveredDevices = await client.discoverDevices();
  });

  it('should discover devices', async () => {
    if (!hasAnyPlatform) return;

    console.log(`\n🔍 Discovered ${discoveredDevices.length} devices:\n`);

    // Group by type
    const byType: Record<string, RealDevice[]> = {};
    for (const device of discoveredDevices) {
      byType[device.type] = byType[device.type] || [];
      byType[device.type].push(device);
    }

    for (const [type, devices] of Object.entries(byType)) {
      const emoji =
        type === 'light' ? '💡' :
        type === 'climate' || type === 'thermostat' ? '🌡️' :
        type === 'lock' ? '🔒' :
        type === 'media' ? '📺' :
        type === 'sensor' ? '📊' :
        type === 'switch' ? '🔌' :
        type === 'fan' ? '💨' :
        type === 'cover' ? '🪟' : '📱';

      console.log(`${emoji} ${type.toUpperCase()} (${devices.length}):`);
      for (const d of devices) {
        console.log(`   • ${d.name}: ${d.state}`);
        if (type === 'climate' || type === 'thermostat') {
          const temp = d.attributes.current_temperature || d.attributes.currentTemp;
          const target = d.attributes.temperature || d.attributes.targetHeat;
          console.log(`     Current: ${temp}°F, Target: ${target}°F`);
        }
      }
      console.log('');
    }

    expect(discoveredDevices.length).toBeGreaterThan(0);
  });

  it('should find lights', async () => {
    if (!hasAnyPlatform) return;

    const lights = discoveredDevices.filter((d) => d.type === 'light');
    console.log(`💡 Found ${lights.length} lights`);

    // Don't fail if no lights - user might not have any
    if (lights.length === 0) {
      console.log('   (No lights found - this is OK if you don\'t have smart lights)');
    }
  });

  it('should find thermostat', async () => {
    if (!hasAnyPlatform) return;

    const thermostats = discoveredDevices.filter(
      (d) => d.type === 'thermostat' || d.type === 'climate'
    );

    console.log(`🌡️ Found ${thermostats.length} thermostats`);

    for (const t of thermostats) {
      console.log(`   • ${t.name} (${t.platform})`);
      console.log(`     State: ${t.state}`);
      console.log(`     Attributes:`, JSON.stringify(t.attributes, null, 2).split('\n').map(l => '     ' + l).join('\n'));
    }
  });

  it('should find media players (TVs)', async () => {
    if (!hasAnyPlatform) return;

    const media = discoveredDevices.filter((d) => d.type === 'media');
    console.log(`📺 Found ${media.length} media players`);

    for (const m of media) {
      console.log(`   • ${m.name}: ${m.state}`);
    }
  });
});

// =============================================================================
// STATE CAPTURE (Safe - Read Only)
// =============================================================================

describe('Real Home - State Capture', () => {
  it('should capture current home state', async () => {
    if (!hasAnyPlatform) return;

    savedState = await client.captureState();

    console.log(`\n📸 Captured state for ${savedState.devices.length} devices`);
    console.log(`   Captured at: ${savedState.capturedAt.toISOString()}`);

    if (savedState.thermostat) {
      console.log(`   Thermostat: ${savedState.thermostat.currentTemp}°F → ${savedState.thermostat.targetTemp}°F`);
    }

    expect(savedState.devices.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// DEVICE CONTROL TESTS (⚠️ MODIFIES HOME!)
// =============================================================================

describe.skip('Real Home - Device Control', () => {
  // Skip by default - enable with: pnpm test:real-home:control
  const isDryRun = config.options.dryRun;

  beforeAll(async () => {
    if (!hasAnyPlatform) return;

    // Capture state before tests
    savedState = await client.captureState();
    console.log('\n⚠️  DEVICE CONTROL TESTS - These will modify your home!');
    console.log(`   Dry-run mode: ${isDryRun ? 'ON (no changes will be made)' : 'OFF (changes will be made!)'}\n`);
  });

  afterAll(async () => {
    if (!hasAnyPlatform || isDryRun || config.options.skipRestore) return;

    // Restore state after tests
    console.log('\n🔄 Restoring home state...');
    const { restored, failed } = await client.restoreState();
    console.log(`   Restored: ${restored}, Failed: ${failed}\n`);
  });

  it('should turn a light on', async () => {
    if (!hasAnyPlatform) return;

    const light = discoveredDevices.find((d) => d.type === 'light');
    if (!light) {
      console.log('   ⏭️ Skipping - no lights found');
      return;
    }

    console.log(`\n💡 Turning ON: ${light.name}`);
    const result = await client.controlDevice(light.id, 'on');

    console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
    if (result.dryRun) console.log('   (Dry-run mode - no actual change)');

    expect(result.success).toBe(true);
  });

  it('should set light brightness to 50%', async () => {
    if (!hasAnyPlatform) return;

    const light = discoveredDevices.find((d) => d.type === 'light');
    if (!light) {
      console.log('   ⏭️ Skipping - no lights found');
      return;
    }

    console.log(`\n💡 Setting brightness to 50%: ${light.name}`);
    const result = await client.controlDevice(light.id, 'set', 50);

    console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
    expect(result.success).toBe(true);
  });

  it('should turn a light off', async () => {
    if (!hasAnyPlatform) return;

    const light = discoveredDevices.find((d) => d.type === 'light');
    if (!light) {
      console.log('   ⏭️ Skipping - no lights found');
      return;
    }

    console.log(`\n💡 Turning OFF: ${light.name}`);
    const result = await client.controlDevice(light.id, 'off');

    console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
    expect(result.success).toBe(true);
  });

  it('should adjust thermostat', async () => {
    if (!hasAnyPlatform) return;

    const thermostat = discoveredDevices.find(
      (d) => d.type === 'thermostat' || d.type === 'climate'
    );

    if (!thermostat) {
      console.log('   ⏭️ Skipping - no thermostat found');
      return;
    }

    // Get current temp and adjust by 1 degree
    const currentTarget =
      (thermostat.attributes.temperature as number) ||
      (thermostat.attributes.targetHeat as number) ||
      70;

    const newTarget = currentTarget + 1;

    console.log(`\n🌡️ Adjusting thermostat: ${currentTarget}°F → ${newTarget}°F`);
    const result = await client.controlDevice(thermostat.id, 'set', newTarget);

    console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
    if (result.error) console.log(`   Error: ${result.error}`);

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// VIBE E2E TESTS (⚠️ MODIFIES HOME!)
// =============================================================================

describe.skip('Real Home - Vibe E2E', () => {
  // Skip by default - enable with: pnpm test:real-home:vibe
  const isDryRun = config.options.dryRun;

  beforeAll(async () => {
    if (!hasAnyPlatform) return;

    savedState = await client.captureState();
    console.log('\n🌟 VIBE E2E TESTS - Testing full vibe activation\n');
  });

  afterAll(async () => {
    if (!hasAnyPlatform || isDryRun || config.options.skipRestore) return;

    console.log('\n🔄 Restoring home state...');
    await client.restoreState();
  });

  it('should activate FOCUS vibe', async () => {
    if (!hasAnyPlatform) return;

    console.log('🎯 Activating FOCUS vibe...');
    const result = await client.testVibe('focus');

    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   Lights set: ${result.lightsSet ? '✅' : '❌'}`);
    console.log(`   Temperature set: ${result.temperatureSet ? '✅' : '❌'}`);
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.join(', ')}`);
    }

    // We expect at least partial success
    expect(result.lightsSet || result.temperatureSet).toBe(true);
  });

  it('should activate RELAX vibe', async () => {
    if (!hasAnyPlatform) return;

    console.log('😌 Activating RELAX vibe...');
    const result = await client.testVibe('relax');

    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   Lights set: ${result.lightsSet ? '✅' : '❌'} (expected: dim, warm)`);
    console.log(`   Temperature set: ${result.temperatureSet ? '✅' : '❌'} (expected: 72°F)`);

    expect(result.lightsSet || result.temperatureSet).toBe(true);
  });

  it('should activate SLEEP vibe', async () => {
    if (!hasAnyPlatform) return;

    console.log('😴 Activating SLEEP vibe...');
    const result = await client.testVibe('sleep');

    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   Lights set: ${result.lightsSet ? '✅' : '❌'} (expected: very dim)`);
    console.log(`   Temperature set: ${result.temperatureSet ? '✅' : '❌'} (expected: 67°F)`);

    expect(result.lightsSet || result.temperatureSet).toBe(true);
  });

  it('should activate MOVIE vibe', async () => {
    if (!hasAnyPlatform) return;

    console.log('🎬 Activating MOVIE vibe...');
    const result = await client.testVibe('movie');

    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   Lights set: ${result.lightsSet ? '✅' : '❌'} (expected: dim)`);
    console.log(`   Temperature set: ${result.temperatureSet ? '✅' : '❌'}`);

    expect(result.lightsSet || result.temperatureSet).toBe(true);
  });
});

// =============================================================================
// ECOBEE-SPECIFIC TESTS
// =============================================================================

describe('Real Home - Ecobee', () => {
  const ecobeeConfigured = config.ecobee.configured;

  it('should check Ecobee configuration', async () => {
    console.log(`\n🌡️ Ecobee API Key: ${ecobeeConfigured ? '✅ Configured' : '❌ Not configured'}`);

    if (!ecobeeConfigured) {
      console.log('   Set ECOBEE_API_KEY in .env.local to test Ecobee');
      return;
    }
  });

  it('should get thermostat status', async () => {
    if (!ecobeeConfigured) return;

    try {
      const { getThermostatStatus } = await import('../../../src/services/identity/ecobee-api.js');
      const result = await getThermostatStatus(config.ecobee.userId);

      if (result.success && result.data) {
        console.log('\n🌡️ Ecobee Thermostat Status:');
        console.log(`   Name: ${result.data.name}`);
        console.log(`   Current: ${result.data.currentTemp}°F`);
        console.log(`   Target Heat: ${result.data.targetHeat}°F`);
        console.log(`   Target Cool: ${result.data.targetCool}°F`);
        console.log(`   Humidity: ${result.data.humidity}%`);
        console.log(`   Mode: ${result.data.mode}`);
        console.log(`   Running: ${result.data.isRunning ? 'Yes' : 'No'}`);

        expect(result.data.currentTemp).toBeGreaterThan(0);
      } else {
        console.log(`   ⚠️ ${result.error}`);
        console.log('   Run "pnpm ecobee:auth" to connect your Ecobee');
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  });

  it('should get sensor readings', async () => {
    if (!ecobeeConfigured) return;

    try {
      const { getSensorReadings } = await import('../../../src/services/identity/ecobee-api.js');
      const result = await getSensorReadings(config.ecobee.userId);

      if (result.success && result.data && result.data.length > 0) {
        console.log(`\n📊 Ecobee Sensors (${result.data.length}):`);
        for (const sensor of result.data) {
          console.log(`   • ${sensor.name}: ${sensor.temperature}°F`);
          if (sensor.humidity !== undefined) {
            console.log(`     Humidity: ${sensor.humidity}%`);
          }
          if (sensor.occupied !== undefined) {
            console.log(`     Occupied: ${sensor.occupied ? 'Yes' : 'No'}`);
          }
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  });
});

// =============================================================================
// PHILIPS HUE TESTS (Direct Bridge API)
// =============================================================================

describe('Real Home - Philips Hue', () => {
  const hueConfigured = config.hue.configured;

  it('should check Hue configuration', () => {
    console.log(`\n💡 Philips Hue Bridge: ${hueConfigured ? '✅ Configured' : '❌ Not configured'}`);

    if (hueConfigured) {
      console.log(`   Bridge IP: ${config.hue.bridgeIp}`);
      console.log(`   Username: ${config.hue.username.slice(0, 8)}...`);
    } else {
      console.log('\n   To set up Hue (no Home Assistant needed!):');
      console.log('   1. Find your bridge IP (router or Hue app)');
      console.log('   2. Press the link button on your bridge');
      console.log('   3. Run: curl -X POST http://<bridge-ip>/api -d \'{"devicetype":"ferni#test"}\'');
      console.log('   4. Add to .env.local:\n');
      console.log('      HUE_BRIDGE_IP=192.168.1.x');
      console.log('      HUE_USERNAME=<username-from-response>\n');
    }
  });

  it('should list Hue lights', async () => {
    if (!hueConfigured) return;

    const lights = discoveredDevices.filter((d) => d.platform === 'hue');
    console.log(`\n💡 Hue Lights (${lights.length}):`);

    for (const light of lights) {
      console.log(`   • ${light.name}: ${light.state}`);
      if (light.attributes.brightness !== undefined) {
        console.log(`     Brightness: ${light.attributes.brightness}%`);
      }
    }

    expect(lights.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// LIFX TESTS (Cloud API)
// =============================================================================

describe('Real Home - LIFX', () => {
  const lifxConfigured = config.lifx.configured;

  it('should check LIFX configuration', () => {
    console.log(`\n💡 LIFX Cloud: ${lifxConfigured ? '✅ Configured' : '❌ Not configured'}`);

    if (!lifxConfigured) {
      console.log('\n   To set up LIFX:');
      console.log('   1. Go to https://cloud.lifx.com/settings');
      console.log('   2. Generate a personal access token');
      console.log('   3. Add to .env.local:\n');
      console.log('      LIFX_TOKEN=your_token\n');
    }
  });

  it('should list LIFX lights', async () => {
    if (!lifxConfigured) return;

    const lights = discoveredDevices.filter((d) => d.platform === 'lifx');
    console.log(`\n💡 LIFX Lights (${lights.length}):`);

    for (const light of lights) {
      console.log(`   • ${light.name}: ${light.state}`);
      if (light.attributes.brightness !== undefined) {
        console.log(`     Brightness: ${light.attributes.brightness}%`);
      }
      if (light.attributes.colorTemp !== undefined) {
        console.log(`     Color Temp: ${light.attributes.colorTemp}K`);
      }
    }

    if (lights.length > 0) {
      expect(lights[0].type).toBe('light');
    }
  });
});

// =============================================================================
// HOME ASSISTANT TESTS (Optional - for power users)
// =============================================================================

describe('Real Home - Home Assistant (Optional)', () => {
  const haConfigured = config.homeAssistant.configured;

  it('should check Home Assistant configuration', () => {
    console.log(`\n🏠 Home Assistant URL: ${haConfigured ? config.homeAssistant.url : '❌ Not configured'}`);
    console.log(`   Token: ${haConfigured ? '✅ Set' : '❌ Not set'}`);

    if (!haConfigured) {
      console.log('\n   To enable Home Assistant:');
      console.log('   1. Get your HA URL (e.g., http://homeassistant.local:8123)');
      console.log('   2. Create a Long-Lived Access Token in HA Profile → Security');
      console.log('   3. Add to .env.local:\n');
      console.log('      HOME_ASSISTANT_URL=http://your-ha:8123');
      console.log('      HOME_ASSISTANT_TOKEN=your_token\n');
    }
  });

  it('should list Home Assistant areas/rooms', async () => {
    if (!haConfigured) return;

    const devices = discoveredDevices.filter((d) => d.platform === 'home_assistant');
    const areas = new Set(devices.map((d) => d.room).filter(Boolean));

    console.log(`\n🏠 Home Assistant Rooms: ${areas.size}`);
    for (const area of areas) {
      const areaDevices = devices.filter((d) => d.room === area);
      console.log(`   • ${area}: ${areaDevices.length} devices`);
    }
  });
});

// =============================================================================
// CLEANUP
// =============================================================================

afterAll(() => {
  resetRealHomeClient();
});
