import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voiceai.app',
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
  
  // iOS-specific configuration
  ios: {
    // Use WKWebView (default, but explicit)
    contentInset: 'automatic',
    
    // Allow mixed content (http in https context)
    allowsLinkPreview: false,
    
    // Scroll behavior
    scrollEnabled: true,
    
    // Background modes
    backgroundColor: '#0d0d1a',
    
    // Preferred content mode
    preferredContentMode: 'mobile',
    
    // Scheme for local files
    scheme: 'voiceai',
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
    
    // ScreenOrientation plugin will use defaults
    
    Haptics: {
      // Use default haptic settings
    },
  },
};

export default config;

