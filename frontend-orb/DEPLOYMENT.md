# Deployment Checklist

## Pre-Deployment

- [ ] All tests passing (`npm test`)
- [ ] Production build successful (`npm run build`)
- [ ] Environment variables configured for production
- [ ] Audio files present in `public/` directory
- [ ] Backend API endpoint accessible
- [ ] SSL certificate configured (HTTPS required for microphone access)

## Environment Configuration

### Production `.env`
```env
VITE_API_URL=https://api.yourdomain.com
```

## Deployment Steps

### Option 1: Vercel (Recommended)
```bash
npm install -g vercel
vercel --prod
```

### Option 2: Netlify
1. Connect repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variables in Netlify dashboard

### Option 3: AWS S3 + CloudFront
```bash
# Build
npm run build

# Upload to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### Option 4: Docker
```bash
# Build image
docker build -t vanguard-advisor-ui .

# Run container
docker run -p 80:80 vanguard-advisor-ui
```

## Post-Deployment Verification

- [ ] Application loads without errors
- [ ] WebGL/Three.js renders correctly
- [ ] Audio playback works (test on mobile)
- [ ] LiveKit connection establishes
- [ ] Microphone permission prompt appears
- [ ] Particle system animates smoothly
- [ ] Responsive design works on mobile/tablet
- [ ] Error boundary catches and displays errors gracefully

## Performance Monitoring

### Metrics to Track
- **First Contentful Paint (FCP)**: < 1.8s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **Time to Interactive (TTI)**: < 3.8s
- **Cumulative Layout Shift (CLS)**: < 0.1
- **First Input Delay (FID)**: < 100ms

### Tools
- Google Lighthouse
- WebPageTest
- Chrome DevTools Performance tab

## Rollback Plan

If issues occur:
1. Revert to previous deployment
2. Check error logs in browser console
3. Verify backend API is responding
4. Test on different devices/browsers

## Security Considerations

- [ ] HTTPS enabled (required for microphone access)
- [ ] Content Security Policy (CSP) configured
- [ ] CORS headers properly set on backend
- [ ] No sensitive data in client-side code
- [ ] Environment variables not exposed in build

## Browser Testing Matrix

Test on:
- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS 14+)
- [ ] Chrome Mobile (Android 10+)

## Known Issues

### Font Loading
- Mark Pro fonts may not load (proprietary)
- Fallback to Inter font (Google Fonts) is automatic

### Large Bundle Size
- Three.js contributes ~400KB gzipped
- Consider code splitting for future optimization

### Mobile Audio
- iOS requires user gesture before audio playback
- "Tap to connect" flow handles this automatically
