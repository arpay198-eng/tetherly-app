import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tetherly.app',
  appName: 'Tetherly',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // LIVE MODE: the app is a WebView shell pointing at the deployed Firebase
    // App Hosting server so all server-side features (login/deposit/withdraw)
    // work inside the APK.
    url: 'https://tetherly-app--arwalletp2p.asia-southeast1.hosted.app',
  },
  android: {
    backgroundColor: '#f3f5f7',
    overrideUserAgent: undefined,
    appendUserAgent: undefined,
    buildOptions: {},
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#f3f5f7',
    }
  },
};

export default config;
