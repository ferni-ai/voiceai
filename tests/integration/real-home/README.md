# 🏠 Real Home Integration Tests

Test Ferni's smart home capabilities against your **actual devices** - Ecobee, HomeKit, TVs, and more.

## Quick Start

```bash
# 1. Set up your environment variables (see below)
# 2. Run the discovery test (safe - read-only)
pnpm test:real-home:discover

# 3. Run read-only tests (check status only)
pnpm test:real-home:status

# 4. Run control tests (WILL CHANGE YOUR HOME!)
pnpm test:real-home:control
```

## Required Setup

We support **direct integrations** with your devices.

### Option A: Ecobee Thermostat (Recommended First Step)

The easiest integration to start with!

```bash
# 1. Get API key from https://www.ecobee.com/developers/
# 2. Add to .env.local:
ECOBEE_API_KEY=your_api_key
TEST_USER_ID=your-name

# 3. Run the interactive auth script:
pnpm ecobee:auth

# 4. Check status:
pnpm ecobee:status
```

### Option B: Philips Hue (Direct Bridge API)

No cloud required - talks directly to your Hue Bridge!

```bash
# 1. Find your bridge IP (check router or Hue app)
# 2. Press link button on bridge
# 3. Run this to get username:
curl -X POST http://<bridge-ip>/api -d '{"devicetype":"ferni#test"}'

# 4. Add to .env.local:
HUE_BRIDGE_IP=192.168.1.x
HUE_USERNAME=your_username
```

### Option C: LIFX (Cloud API)

Simple cloud-based control for LIFX bulbs.

```bash
# 1. Get token from https://cloud.lifx.com/settings
# 2. Add to .env.local:
LIFX_TOKEN=your_token
```

## Test Categories

| Test | What It Does | Safe? |
|------|--------------|-------|
| `discover` | Lists all devices | ✅ Read-only |
| `status` | Gets current state | ✅ Read-only |
| `control` | Changes device state | ⚠️ Modifies home |
| `vibe` | Tests full vibe flow | ⚠️ Modifies home |
| `restore` | Restores previous state | ✅ Restores |

## Running Tests

```bash
# Discover devices (safe)
pnpm test:real-home:discover

# Check device status (safe)  
pnpm test:real-home:status

# Test device control (changes state!)
pnpm test:real-home:control

# Full vibe E2E test
pnpm test:real-home:vibe

# Interactive test mode
pnpm test:real-home:interactive
```

## Safety Features

- **State snapshot** - Before control tests, we save current state
- **Auto-restore** - After tests, restore to original state
- **Confirmation prompts** - Interactive mode asks before each action
- **Dry-run mode** - See what would happen without doing it

```bash
# Dry-run mode
DRY_RUN=true pnpm test:real-home:control
```

## Troubleshooting

### Ecobee Issues

**"Ecobee not connected"**
- Run PIN authorization: `pnpm ecobee:auth`
- Check API key is valid at ecobee.com/developers

**"Token expired"**
- Delete saved tokens and re-run auth: `rm -f .ecobee-tokens.json && pnpm ecobee:auth`

### Philips Hue Issues

**"Cannot connect to bridge"**
- Check bridge IP (may have changed after DHCP renewal)
- Ensure you're on the same network

**"Invalid username"**
- Press link button and create new username (old one may have expired)

### LIFX Issues

**"401 Unauthorized"**
- Regenerate token at cloud.lifx.com/settings

## HomeKit Control

HomeKit devices can be controlled via:

1. **iOS App** - Native `HomeKitService.swift` integration (already implemented!)
2. **Homebridge** - Exposes HomeKit to a REST API

For Node.js testing, we recommend Homebridge if you want HomeKit control from the test runner.
