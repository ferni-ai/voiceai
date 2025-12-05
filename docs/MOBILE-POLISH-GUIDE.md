# Mobile App Polish Guide

Comprehensive checklist and implementation guide for polishing the Ferni Voice AI mobile apps.

## Current Status

| Platform | Status | Notes |
|----------|--------|-------|
| iOS | Beta | Capacitor-based, functional |
| Android | Beta | Capacitor-based, functional |
| Web (PWA) | Production | Full features |

## Priority Polish Items

### 1. Native Feel Improvements

#### Haptic Feedback System
```typescript
// src/mobile/haptics.ts
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const MobileHaptics = {
  // Subtle tap for UI interactions
  async tap() {
    await Haptics.impact({ style: ImpactStyle.Light });
  },

  // Medium impact for confirmations
  async confirm() {
    await Haptics.impact({ style: ImpactStyle.Medium });
  },

  // Success vibration pattern
  async success() {
    await Haptics.notification({ type: NotificationType.Success });
  },

  // Error vibration
  async error() {
    await Haptics.notification({ type: NotificationType.Error });
  },

  // Voice activation feedback
  async voiceStart() {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  },

  // Persona switch
  async personaChange() {
    await Haptics.vibrate({ duration: 100 });
    setTimeout(async () => {
      await Haptics.vibrate({ duration: 50 });
    }, 150);
  },

  // Handoff transition
  async handoff() {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    setTimeout(async () => {
      await Haptics.impact({ style: ImpactStyle.Medium });
    }, 100);
    setTimeout(async () => {
      await Haptics.impact({ style: ImpactStyle.Light });
    }, 200);
  },
};
```

#### Native Gestures
- **Swipe up**: Quick voice activation
- **Long press**: Toggle mute
- **Swipe left/right**: Navigate conversation history
- **Pinch**: Adjust text size (accessibility)

### 2. Performance Optimizations

#### Splash Screen Optimization
```typescript
// Preload critical resources during splash
async function onSplashLoad() {
  await Promise.all([
    preloadAudioContext(),
    prefetchPersonaManifests(),
    initializeLiveKitClient(),
    loadUserProfile(),
  ]);
  
  // Hide splash after critical path loaded
  await SplashScreen.hide({ fadeOutDuration: 300 });
}
```

#### WebRTC Performance
```typescript
// iOS-specific audio session configuration
if (Capacitor.getPlatform() === 'ios') {
  // Use native AVAudioSession for better audio
  await NativeAudio.configure({
    category: 'playAndRecord',
    mode: 'voiceChat',
    options: {
      defaultToSpeaker: true,
      allowBluetooth: true,
      mixWithOthers: false,
    },
  });
}
```

### 3. UI/UX Polish

#### Safe Area Handling
```css
/* Proper safe area insets for notched devices */
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}

.app-container {
  padding-top: var(--safe-area-top);
  padding-bottom: var(--safe-area-bottom);
  padding-left: var(--safe-area-left);
  padding-right: var(--safe-area-right);
}

/* Bottom action bar - above home indicator */
.action-bar {
  padding-bottom: calc(var(--safe-area-bottom) + var(--ma-breath));
}
```

#### Loading States
```typescript
// Skeleton screens for perceived performance
const ConversationSkeleton = () => (
  <div class="conversation-skeleton">
    <div class="skeleton-avatar pulse" />
    <div class="skeleton-lines">
      <div class="skeleton-line w-80" />
      <div class="skeleton-line w-60" />
      <div class="skeleton-line w-40" />
    </div>
  </div>
);
```

### 4. Offline Support

#### Service Worker for PWA
```typescript
// Cache voice persona assets
const PERSONA_CACHE = 'ferni-personas-v1';
const PERSONA_ASSETS = [
  '/voiceai-agents/agents/ferni/persona.manifest.json',
  '/voiceai-agents/agents/maya-santos/persona.manifest.json',
  '/voiceai-agents/agents/alex-chen/persona.manifest.json',
  // ... other personas
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PERSONA_CACHE).then((cache) => {
      return cache.addAll(PERSONA_ASSETS);
    })
  );
});
```

#### Offline UI State
```typescript
import { Network } from '@capacitor/network';

export async function initNetworkMonitor() {
  Network.addListener('networkStatusChange', (status) => {
    if (!status.connected) {
      showOfflineBanner();
      disableVoiceFeatures();
    } else {
      hideOfflineBanner();
      enableVoiceFeatures();
    }
  });
}
```

### 5. Push Notifications

#### iOS Push Setup
```swift
// AppDelegate.swift
import UserNotifications
import Firebase

func application(_ application: UIApplication, didFinishLaunchingWithOptions...) -> Bool {
    FirebaseApp.configure()
    UNUserNotificationCenter.current().delegate = self
    
    let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
    UNUserNotificationCenter.current().requestAuthorization(options: authOptions) { _, _ in }
    application.registerForRemoteNotifications()
    
    return true
}
```

#### Notification Types
| Type | Trigger | Priority |
|------|---------|----------|
| Session reminder | User-scheduled | Normal |
| Goal milestone | Achievement | High |
| Persona message | Proactive outreach | Low |
| Handoff complete | Background process | Silent |

### 6. Deep Linking

#### URL Scheme Configuration
```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  // ...
  plugins: {
    App: {
      // voiceai://conversation?persona=ferni
      appUrlOpen: {
        handlers: ['handleDeepLink'],
      },
    },
  },
};
```

#### Universal Links (iOS) / App Links (Android)
```json
// apple-app-site-association
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.sethdford.voiceai",
        "paths": ["/app/*", "/share/*"]
      }
    ]
  }
}
```

### 7. Accessibility Improvements

#### VoiceOver/TalkBack Support
```typescript
// Add ARIA labels to dynamic content
function updateTranscript(text: string) {
  const element = document.getElementById('transcript');
  element.textContent = text;
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-label', `${currentPersona} said: ${text}`);
}
```

#### Dynamic Type Support (iOS)
```css
/* Respect system font size */
body {
  font-size: clamp(14px, 1rem, 24px);
  -webkit-text-size-adjust: 100%;
}

/* Scale icons with text */
.icon {
  width: 1.25em;
  height: 1.25em;
}
```

### 8. Analytics & Crash Reporting

#### Sentry Configuration
```typescript
// apps/ios/sentry.ts
import * as Sentry from '@sentry/capacitor';
import * as SentryBrowser from '@sentry/browser';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  dist: '1',
  integrations: [new SentryBrowser.BrowserTracing()],
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  beforeSend(event) {
    // Scrub PII
    if (event.user) {
      delete event.user.ip_address;
      delete event.user.email;
    }
    return event;
  },
});
```

### 9. App Store Optimization

#### Screenshots Requirements
| Store | Size | Count |
|-------|------|-------|
| iOS 6.7" | 1290×2796 | 3-10 |
| iOS 6.5" | 1242×2688 | 3-10 |
| iOS 5.5" | 1242×2208 | 3-10 |
| Android Phone | 1080×1920 | 2-8 |
| Android Tablet | 1200×1920 | 2-8 |

#### Localization Checklist
- [ ] App name localized
- [ ] Description translated
- [ ] Screenshots per locale
- [ ] Keywords research per market
- [ ] Privacy policy links

### 10. Beta Testing Checklist

#### Pre-Launch Tests
- [ ] Cold start < 2 seconds
- [ ] Voice activation latency < 100ms
- [ ] Background audio continues
- [ ] Push notifications work
- [ ] Deep links route correctly
- [ ] Offline graceful degradation
- [ ] Memory usage under 150MB
- [ ] Battery drain acceptable
- [ ] Haptics feel natural
- [ ] Safe areas respected

#### Device Coverage
| iOS | Android |
|-----|---------|
| iPhone 15 Pro | Pixel 8 |
| iPhone 14 | Samsung S24 |
| iPhone SE (3rd) | Samsung A54 |
| iPad Pro 12.9" | Pixel Tablet |
| iPad Air | Samsung Tab S9 |

## Implementation Roadmap

### Phase 1: Core Polish (Week 1)
1. Implement haptic feedback system
2. Optimize splash screen loading
3. Fix safe area issues
4. Add offline detection UI

### Phase 2: Performance (Week 2)
1. Native audio session (iOS)
2. Preloading strategy
3. Memory optimization
4. Cache strategy

### Phase 3: Features (Week 3)
1. Push notifications
2. Deep linking
3. Widget (iOS 17+, Android)
4. Shortcuts/Siri integration

### Phase 4: Store Prep (Week 4)
1. Screenshot generation
2. Store listing optimization
3. Beta tester feedback
4. Final QA pass

## Quick Commands

```bash
# iOS Development
cd apps/ios && npm run build && npm run open

# Android Development
cd apps/android && npm run build && npm run open

# Generate icons
npm run generate:icons

# Run on device
npm run run:ios    # Requires Xcode + device
npm run run:android # Requires Android Studio + device

# Build for release
npm run build:release
```

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design 3](https://m3.material.io/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy](https://play.google.com/about/developer-content-policy/)

