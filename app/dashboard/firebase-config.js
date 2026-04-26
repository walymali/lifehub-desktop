/**
 * Firebase Configuration
 *
 * To enable cloud sync, follow the setup guide in FIREBASE_SETUP.md:
 * 1. Create a Firebase project at https://console.firebase.google.com
 * 2. Enable Authentication (Email/Password + Google)
 * 3. Create a Firestore database
 * 4. Get your config from Project Settings → General → Your apps → Web
 * 5. Replace the placeholder values below with your actual config
 *
 * If Firebase is not configured, the app works in LOCAL-ONLY mode.
 */

window.LIFEHUB_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Set to true when you've filled in the real config above
window.LIFEHUB_FIREBASE_ENABLED = false;

// Auto-detect: if config is still the placeholder, disable Firebase
if (window.LIFEHUB_FIREBASE_CONFIG.apiKey === "YOUR_API_KEY_HERE") {
  window.LIFEHUB_FIREBASE_ENABLED = false;
  console.log('[LifeHub] Firebase not configured - running in local-only mode');
}
