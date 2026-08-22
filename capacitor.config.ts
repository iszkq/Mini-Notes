import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.mininotes.mobile",
  appName: "Mini Notes",
  webDir: "dist",
  bundledWebRuntime: false,
  backgroundColor: "#f8f7f3",
  android: {
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: "#f8f7f3",
      showSpinner: false
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#f8f7f3"
    }
  }
};

export default config;
