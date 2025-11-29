# Vanguard Personal Advisor - Frontend Orb

Enterprise-grade conversational AI interface with a stunning 3D particle-based visualization.

## Features

### 🎨 Visual Excellence
- **GPU-Accelerated Particles**: 3,000-15,000 particles rendered via WebGL shaders
- **Adaptive Quality**: Automatically adjusts particle count based on device capabilities
- **Vanguard Branding**: Official color palette (Burgundy #8B2332, Gold #FFB81C, Navy #002F6C)
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices

### 🚀 Performance
- **Device Tier Detection**: Automatically optimizes for high/medium/low-end devices
- **Ping-Pong Buffering**: Prevents GPU read/write conflicts in particle simulation
- **Lazy Loading**: Three.js components load on-demand with Suspense fallbacks
- **Production Build**: Minified bundle with tree-shaking (431 KB gzipped)

### 🔒 Enterprise Ready
- **Error Boundaries**: Graceful error handling with user-friendly fallbacks
- **TypeScript**: Full type safety across the codebase
- **Testing Suite**: Vitest + React Testing Library with WebGL mocks
- **Cross-Browser**: Tested on Chrome, Safari, Firefox, Edge

### 🎙️ Real-Time Communication
- **LiveKit Integration**: Low-latency audio streaming
- **Audio Level Detection**: Visual feedback based on voice activity
- **Mobile Audio Unlock**: Handles iOS/Android autoplay restrictions
- **Connection States**: Clear visual indicators (Connecting, Listening, Speaking)

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm 9+

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### Production Build
```bash
npm run build
npm run preview
```

### Testing
```bash
npm test
```

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:8081
```

- `VITE_API_URL`: Backend API endpoint for LiveKit token generation

## Architecture

### Component Structure
```
src/
├── components/
│   ├── ErrorBoundary.tsx    # Global error handling
│   ├── JackOrb.tsx           # Main 3D orb component
│   └── GPUParticles.tsx      # GPGPU particle system
├── theme/
│   └── vanguard.ts           # Vanguard brand colors & design tokens
├── App.tsx                   # Main application logic
├── App.css                   # Application styles
└── index.css                 # Global styles & CSS variables
```

### Key Technologies
- **React 18**: UI framework with concurrent features
- **TypeScript**: Type-safe development
- **Three.js**: 3D graphics rendering
- **@react-three/fiber**: React renderer for Three.js
- **@react-three/drei**: Three.js helpers (Float, MeshDistortMaterial)
- **LiveKit**: Real-time audio/video communication
- **Framer Motion**: UI animations
- **Vite**: Build tool and dev server
- **Vitest**: Unit testing framework

## Performance Optimization

### Device Tiers
The application automatically detects device capabilities:

| Tier | Criteria | Particle Count |
|------|----------|----------------|
| High | Desktop, 8+ CPU cores | 15,000 |
| Medium | Desktop 4-7 cores, or High-end mobile | 8,000 |
| Low | Mobile, <8 cores | 3,000 |

### GPU Particle System
- **Simulation Shader**: Curl noise for organic movement
- **Facial Regions**: Eyes and mouth influence particle behavior
- **Audio Reactivity**: Particles respond to speaking/listening states
- **Blink Animation**: Periodic eye blink simulation

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Fully Supported |
| Safari | 14+ | ✅ Fully Supported |
| Firefox | 88+ | ✅ Fully Supported |
| Edge | 90+ | ✅ Fully Supported |
| Mobile Safari | iOS 14+ | ✅ Fully Supported |
| Chrome Mobile | Android 10+ | ✅ Fully Supported |

## Deployment

### Static Hosting (Recommended)
The `dist/` folder can be deployed to any static hosting service:

- **Vercel**: `vercel --prod`
- **Netlify**: Drag & drop `dist/` folder
- **AWS S3 + CloudFront**: Upload `dist/` to S3 bucket
- **GitHub Pages**: Push `dist/` to `gh-pages` branch

### Docker
```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Environment Configuration
For production, update `VITE_API_URL` to point to your production backend:
```env
VITE_API_URL=https://api.yourdomain.com
```

## Troubleshooting

### Audio Not Playing on Mobile
- Ensure user has tapped the screen (iOS requires user gesture)
- Check browser console for autoplay policy errors
- Verify `connect.mp3` and `disconnect.mp3` are in `public/` folder

### Particles Not Rendering
- Check WebGL support: Visit [webglreport.com](https://webglreport.com)
- Verify GPU drivers are up to date
- Check browser console for shader compilation errors

### Build Warnings
- Font warnings are expected (Mark Pro is proprietary, falls back to Inter)
- Large chunk warning is normal for Three.js (can be optimized with code splitting)

## Development

### Adding New Features
1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test: `npm test`
3. Build production bundle: `npm run build`
4. Create pull request

### Code Style
- Use TypeScript for all new files
- Follow existing naming conventions
- Add JSDoc comments for complex functions
- Run tests before committing

## License

Proprietary - Vanguard Personal Advisor Services

## Support

For technical support, contact the development team or file an issue in the repository.

---

**Built with ❤️ for Vanguard**