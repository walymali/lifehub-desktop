/**
 * LifeHub Firebase Auth + Cloud Sync
 * Requires firebase-config.js to be loaded first
 *
 * Uses Firebase Web SDK v10+ (compat version from CDN for simplicity)
 */
(function(){
  'use strict';

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestore = null;
  let currentUser = null;
  let syncTimer = null;
  let authStateListeners = [];

  const SYNC_INTERVAL_MS = 30000; // 30 seconds
  const STORAGE_KEY = 'lifehub:v1';

  // ── Init Firebase ──
  async function initFirebase() {
    if (!window.LIFEHUB_FIREBASE_ENABLED) {
      console.log('[LifeHubAuth] Firebase disabled - local mode only');
      return false;
    }
    if (typeof firebase === 'undefined') {
      console.warn('[LifeHubAuth] Firebase SDK not loaded');
      return false;
    }
    try {
      firebaseApp = firebase.initializeApp(window.LIFEHUB_FIREBASE_CONFIG);
      firebaseAuth = firebase.auth();
      firestore = firebase.firestore();

      // Listen to auth state
      firebaseAuth.onAuthStateChanged((user) => {
        currentUser = user;
        if (user) {
          console.log('[LifeHubAuth] Signed in:', user.email);
          startCloudSync();
          pullFromCloud();
        } else {
          console.log('[LifeHubAuth] Signed out');
          stopCloudSync();
        }
        // Notify listeners
        authStateListeners.forEach(fn => {
          try { fn(user); } catch(e) { console.error(e); }
        });
      });

      return true;
    } catch(e) {
      console.error('[LifeHubAuth] Init failed:', e);
      return false;
    }
  }

  // ── Auth Methods ──
  async function signUp(email, password, displayName) {
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    const cred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
    if (displayName) {
      await cred.user.updateProfile({ displayName });
    }
    // Create user doc in Firestore
    await firestore.collection('users').doc(cred.user.uid).set({
      email: cred.user.email,
      displayName: displayName || '',
      plan: 'free',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return cred.user;
  }

  async function signIn(email, password) {
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    const cred = await firebaseAuth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function signInWithGoogle() {
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await firebaseAuth.signInWithPopup(provider);
    // Ensure user doc exists
    const userRef = firestore.collection('users').doc(cred.user.uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        email: cred.user.email,
        displayName: cred.user.displayName || '',
        plan: 'free',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    return cred.user;
  }

  async function signOut() {
    if (firebaseAuth) await firebaseAuth.signOut();
    currentUser = null;
    stopCloudSync();
  }

  async function resetPassword(email) {
    if (!firebaseAuth) throw new Error('Firebase not initialized');
    await firebaseAuth.sendPasswordResetEmail(email);
  }

  // ── Cloud Sync ──
  function startCloudSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(pushToCloud, SYNC_INTERVAL_MS);
    // Also sync on window blur
    window.addEventListener('blur', pushToCloud);
  }

  function stopCloudSync() {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  }

  async function pushToCloud() {
    if (!currentUser || !firestore) return;
    try {
      const localData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      await firestore.collection('users').doc(currentUser.uid).collection('sync').doc('data').set({
        data: localData,
        lastSync: firebase.firestore.FieldValue.serverTimestamp(),
        device: navigator.userAgent
      }, { merge: true });
      console.log('[LifeHubAuth] Synced to cloud');
    } catch(e) {
      console.error('[LifeHubAuth] Push failed:', e);
    }
  }

  async function pullFromCloud() {
    if (!currentUser || !firestore) return;
    try {
      const doc = await firestore.collection('users').doc(currentUser.uid).collection('sync').doc('data').get();
      if (!doc.exists) {
        // First time user - push local data to cloud
        await pushToCloud();
        return;
      }
      const cloudData = doc.data();
      if (cloudData && cloudData.data) {
        const localData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        // Smart merge: cloud wins for licenses, local wins for recent sessions
        const merged = {
          tools: { ...localData.tools, ...cloudData.data.tools },
          sessions: [...(localData.sessions || []), ...(cloudData.data.sessions || [])].slice(-500),
          licenses: { ...cloudData.data.licenses, ...localData.licenses },
          global: { ...localData.global, ...cloudData.data.global }
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        console.log('[LifeHubAuth] Pulled from cloud');
        // Trigger UI refresh if on dashboard
        if (typeof window.renderAll === 'function') window.renderAll();
      }
    } catch(e) {
      console.error('[LifeHubAuth] Pull failed:', e);
    }
  }

  // ── Events ──
  function onAuthChange(callback) {
    authStateListeners.push(callback);
    // Fire immediately with current state
    if (currentUser !== null) callback(currentUser);
  }

  function getUser() { return currentUser; }
  function isSignedIn() { return !!currentUser; }
  function isConfigured() { return !!window.LIFEHUB_FIREBASE_ENABLED; }

  // ── Expose API ──
  window.LifeHubAuth = {
    init: initFirebase,
    signUp, signIn, signInWithGoogle, signOut, resetPassword,
    pushToCloud, pullFromCloud,
    onAuthChange, getUser, isSignedIn, isConfigured
  };

  // Auto-init if Firebase SDK is already loaded
  if (typeof firebase !== 'undefined') {
    initFirebase();
  } else {
    // Wait for firebase to load
    window.addEventListener('load', () => {
      setTimeout(initFirebase, 500);
    });
  }
})();
