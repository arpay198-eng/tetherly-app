import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tetherly.app',
  appName: 'Tetherly',
  webDir: 'out',
  server: {
    androidScheme: 'https'
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
