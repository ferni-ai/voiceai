import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sethdford.voiceai',
  appName: 'Voice AI',
  webDir: '../../frontend-typescript/dist',
  bundledWebRuntime: false,
  
  // Server configuration for development
  server: {
    // Uncomment for live reload during development:
    // url: 'http://YOUR_LOCAL_IP:3004',
    // cleartext: true,
    
    // Allow inline scripts and styles
    allowNavigation: ['*'],
  },
  
  // Android-specific configuration
  android: {
    // Allow mixed content (http in https context)
    allowMixedContent: true,
    
    // WebView settings
    backgroundColor: '#0d0d1a',
    
    // Build flavor (can be 'debug' or 'release')
    // flavor: 'release',
  },
  
  // Plugin configurations
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0d0d1a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0d0d1a',
    },
    
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    
    Haptics: {
      // Use default haptic settings
    },
  },
};

export default config;

