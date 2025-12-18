# Voice AI Frontend (TypeScript)

A production-grade TypeScript frontend for the Voice AI application, built with clean architecture principles.

## Architecture

```
apps/web/
├── src/
│   ├── types/          # TypeScript interfaces and type guards
│   ├── config/         # Configuration (personas, API endpoints, constants)
│   ├── state/          # Centralized state management
│   ├── services/       # Business logic services
│   │   ├── connection  # LiveKit connection management
│   │   ├── audio       # Audio playback and visualization
│   │   ├── handoff     # Agent handoff handling
│   │   └── spotify     # Spotify Web Playback SDK
│   ├── ui/             # UI components
│   │   ├── coach       # Main avatar display
│   │   ├── team        # Team roster display
│   │   ├── message     # Message/quote display
│   │   ├── waveform    # Audio visualization
│   │   └── controls    # Button controls
│   └── app.ts          # Main application orchestrator
├── tests/
│   ├── unit/           # Unit tests (Vitest)
│   └── e2e/            # End-to-end tests (Playwright)
└── public/
    └── sounds/         # Audio assets
```

## Features

- **Type Safety**: Full TypeScript with strict mode enabled
- **Clean Architecture**: Separation of concerns between services, state, and UI
- **Observable State**: Centralized state with subscription support
- **Comprehensive Testing**: Unit tests with Vitest, E2E with Playwright
- **Accessibility**: ARIA labels, focus management, reduced motion support
- **Modern Tooling**: Vite for development and builds

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd apps/web
npm install
```

### Development

```bash
# Start dev server (port 3004)
npm run dev

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Type check
npm run typecheck

# Lint
npm run lint
```

### Production Build

```bash
npm run build
npm run preview
```

## Dev Panel 🛠️

The Dev Panel provides testing tools for personas, celebrations, tier simulation, and more.

### Accessing the Dev Panel

| Environment | Method |
|-------------|--------|
| **Development** | `?dev` URL param, or `Cmd/Ctrl+Shift+D` keyboard shortcut |
| **Production** | `?dev=YOUR_KEY` URL param (key required) |

### Production Access

In production, you need the admin key to access the dev panel:

```bash
# Option 1: URL parameter (stores key for future visits)
https://your-site.com/?dev=ferni2024

# Option 2: Browser console
localStorage.setItem('ferni_admin_key', 'ferni2024');
location.reload();
```

Once authenticated, use `Cmd/Ctrl+Shift+D` to toggle the panel anytime.

### Environment Variables

```bash
# In .env or deployment config

# Option 1: Custom key (still requires ?dev=key or localStorage once)
VITE_DEV_PANEL_KEY=your-super-secret-key

# Option 2: Auto-enable (no authentication needed - great for admin deployments)
VITE_DEV_PANEL_AUTO=true
```

**With `VITE_DEV_PANEL_AUTO=true`**: Dev panel is always available, just hit `Cmd/Ctrl+Shift+D`!

**With custom key**: Access with `?dev=your-super-secret-key` (only needed once per browser)

### Dev Panel Features

- **Persona Switching**: Test handoffs between team members
- **Tier Simulation**: Test Free/Friend/Partner tier behaviors
- **Relationship Stage**: Override progression stages
- **Celebrations**: Trigger unlock celebrations and effects
- **Avatar Expressions**: Test all avatar states and emotions
- **Voice Modes**: Simulate listening/speaking states
- **Weather Effects**: Toggle ambient atmosphere effects
- **Favicon States**: Test living favicon animations

## Design Decisions

### State Management

Uses a lightweight observable pattern instead of Redux/Zustand:
- Simpler for this application size
- Type-safe subscriptions
- Automatic localStorage persistence for key values

### Services Pattern

Each service is a singleton that encapsulates related functionality:
- Clear boundaries between concerns
- Easy to test in isolation
- No prop drilling or context providers needed

### UI Components

Functional components that subscribe to relevant state:
- Initialize once on DOM ready
- Update reactively to state changes
- Clean separation from business logic

## Testing Strategy

### Unit Tests

- Services: Test public APIs, mock dependencies
- State: Test updates and subscriptions
- Types: Test type guards

### E2E Tests

- Connection flow
- Handoff flow
- Spotify integration

## API Integration

The frontend communicates with:
- **ui-server.js**: Token generation and agent dispatch (`/token`)
- **LiveKit**: Real-time audio/video via WebRTC
- **Spotify**: Web Playback SDK for music

## Browser Support

- Chrome/Edge 88+
- Safari 14+
- Firefox 85+

## License

MIT

