/*!
 * LifeHub SDK v2.1
 * Shared analytics + licensing + branding for LifeHub tools
 * v2.1: 7-day free trial (device-bound, auto-starts on first Pro tool open)
 * v2.0: bundle-aware access check, server-side license validation,
 *       usage tracking via WP REST, device fingerprinting.
 * Usage: <script src="../dashboard/lifehub-sdk.js"
 *                data-tool-id="habit-tracker"
 *                data-tool-name="Habit Tracker"
 *                data-category="productivity"></script>
 */
(function(){
  'use strict';

  const STORAGE_KEY = 'lifehub:v1';
  const MAX_SESSIONS = 500;

  // ── Endpoints (set to empty string to enable client-side dev fallback) ──
  // Override via window.LIFEHUB_CONFIG before this script loads, or edit here.
  // Note: usageApi uses ?rest_route= form so it works on servers that don't
  //       handle WP pretty permalinks (OpenLiteSpeed default, plain Nginx, etc.).
  const ENDPOINTS = (window.LIFEHUB_CONFIG && window.LIFEHUB_CONFIG.endpoints) || {
    licenseApi: 'https://lifehub-license-server.waly-wali30.workers.dev',  // e.g. 'https://api.trylifehub.com'  — Cloudflare Worker base
    usageApi:   'https://trylifehub.com/?rest_route=/lifehub/v1',  // e.g. 'https://trylifehub.com/?rest_route=/lifehub/v1' — WP REST
    marketing:  'https://trylifehub.com',
    purchase:   'https://trylifehub.com/#pricing'
  };

  // Build a WP REST URL that works whether or not pretty permalinks are enabled.
  function wpRestUrl(path) {
    const base = ENDPOINTS.usageApi || '';
    if (!base) return '';
    // If usageApi already contains ?rest_route, append path with /
    if (base.indexOf('?rest_route=') !== -1) {
      const sep = base.endsWith('/') ? '' : '/';
      return base + sep + path.replace(/^\//, '');
    }
    // Otherwise treat as /wp-json/... base
    const sep = base.endsWith('/') ? '' : '/';
    return base + sep + path.replace(/^\//, '');
  }

  // Bundle config (sales display only — actual access uses BUNDLES below)
  const BUNDLE = {
    name: 'LifeHub Bundles',
    tagline: '5 bundles. 43 tools. Pick yours.',
    launchPrice: 9,    // entry tier
    regularPrice: 49,  // enterprise tier
    fullPrice: 799,    // enterprise lifetime
    purchaseUrl: ENDPOINTS.purchase,
    landingUrl: ENDPOINTS.marketing
  };

  // Free tier - these tools work without a license
  const FREE_TOOLS = ['password-gen-pro', 'qr-generator', 'countdown-timer', 'unit-converter', 'markdown-editor'];

  // Bundle → tool IDs mapping (mirrors dashboard/config.json bundles).
  // Kept in-memory so individual tools don't need to fetch config.json.
  const BUNDLES = {
    freelancer: { code: 'FRL', tools: ['quickinvoice-pro','client-crm','pricing-calculator','freelancer-toolkit','contract-bundle','resume-builder','email-signature-gen','portfolio-site','timezone-converter','markdown-editor'] },
    productivity: { code: 'PRD', tools: ['lifeboard-pro','student-planner','workout-plan','habit-tracker','mood-tracker','meal-planner','recipe-box','wedding-planner','typing-test','countdown-timer','markdown-editor'] },
    creator: { code: 'CRT', tools: ['instagram-templates','youtube-thumbnail','social-media-kit','color-palette-gen','business-card-gen','wireframe-kit','portfolio-site','pitch-deck','prompt-vault-pro','email-signature-gen','resume-builder'] },
    smallbusiness: { code: 'SMB', tools: ['quickinvoice-pro','client-crm','pricing-calculator','freelancer-toolkit','contract-bundle','resume-builder','email-signature-gen','portfolio-site','timezone-converter','markdown-editor','employee-directory','meeting-agenda','gantt-timeline','receipt-scanner','budget-tracker','ab-test-calc','social-analytics','pitch-deck','wireframe-kit','password-gen-pro','countdown-timer','qr-generator'] },
    enterprise: { code: 'ENT', tools: '*' }  // wildcard = all tools
  };

  // Map bundle CODE → bundle ID (for parsing license keys)
  const CODE_TO_BUNDLE = Object.keys(BUNDLES).reduce((acc, id) => {
    acc[BUNDLES[id].code] = id;
    return acc;
  }, {});

  const VALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;  // 24h server re-check
  const USAGE_BATCH_INTERVAL_MS = 30 * 1000;         // flush usage events every 30s

  // Read config from the script tag that loaded this file
  const script = document.currentScript || (function(){
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('lifehub-sdk') !== -1) return scripts[i];
    }
    return null;
  })();

  const cfg = {
    toolId: script ? script.dataset.toolId : 'unknown',
    toolName: script ? (script.dataset.toolName || script.dataset.toolId) : 'Unknown Tool',
    category: script ? (script.dataset.category || 'utility') : 'utility'
  };

  // ── Storage helpers ──
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      // Ensure structure
      if (!parsed.tools) parsed.tools = {};
      if (!parsed.sessions) parsed.sessions = [];
      if (!parsed.licenses) parsed.licenses = {};
      if (!parsed.global) parsed.global = { cloudEndpoint: '', version: 1 };
      return parsed;
    } catch(e) {
      console.warn('[LifeHub] Failed to load store:', e);
      return defaultStore();
    }
  }

  function defaultStore() {
    return { tools: {}, sessions: [], licenses: {}, global: { cloudEndpoint: '', version: 1 } };
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch(e) {
      console.warn('[LifeHub] Failed to save store:', e);
    }
  }

  // ── Tool state ──
  function ensureTool(store, toolId) {
    if (!store.tools[toolId]) {
      store.tools[toolId] = {
        opens: 0,
        timeSpent: 0,
        lastSeen: 0,
        firstSeen: 0,
        events: {},
        name: cfg.toolName,
        category: cfg.category
      };
    }
    return store.tools[toolId];
  }

  // ── Session timer ──
  let sessionStart = Date.now();
  let sessionId = null;

  function beginSession() {
    const store = loadStore();
    const tool = ensureTool(store, cfg.toolId);
    tool.opens = (tool.opens || 0) + 1;
    tool.lastSeen = Date.now();
    if (!tool.firstSeen) tool.firstSeen = Date.now();
    tool.name = cfg.toolName;
    tool.category = cfg.category;

    sessionId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    store.sessions.push({
      id: sessionId,
      toolId: cfg.toolId,
      start: sessionStart,
      duration: 0
    });
    // Cap sessions (FIFO)
    if (store.sessions.length > MAX_SESSIONS) {
      store.sessions = store.sessions.slice(-MAX_SESSIONS);
    }
    saveStore(store);
    maybeSyncCloud('session_start', { toolId: cfg.toolId, sessionId });
  }

  function endSession() {
    const duration = Date.now() - sessionStart;
    const store = loadStore();
    const tool = ensureTool(store, cfg.toolId);
    tool.timeSpent = (tool.timeSpent || 0) + duration;
    tool.lastSeen = Date.now();
    const session = store.sessions.find(s => s.id === sessionId);
    if (session) session.duration = duration;
    saveStore(store);
    maybeSyncCloud('session_end', { toolId: cfg.toolId, sessionId, duration });
  }

  // ── Custom events ──
  function track(eventName, payload) {
    if (!eventName) return;
    const store = loadStore();
    const tool = ensureTool(store, cfg.toolId);
    if (!tool.events) tool.events = {};
    tool.events[eventName] = (tool.events[eventName] || 0) + 1;
    saveStore(store);
    maybeSyncCloud('event', { toolId: cfg.toolId, name: eventName, payload });
  }

  // ── Device ID (stable per browser, anonymous) ──
  function getDeviceId() {
    let id = localStorage.getItem('lifehub:device-id');
    if (!id) {
      id = 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('lifehub:device-id', id);
    }
    return id;
  }

  // ── Free trial (7 days, device-bound) ──
  // Anyone can download + use any Pro tool for the first 7 days.
  // After that, Pro tools lock until they activate a real license.
  // Storage: localStorage 'lifehub:trial' = { startedAt: <ms>, alertedExpired: bool }
  const TRIAL_DAYS = 7;
  const TRIAL_KEY = 'lifehub:trial';
  const DAY_MS = 24 * 60 * 60 * 1000;

  function getTrialState() {
    let raw, t;
    try { raw = localStorage.getItem(TRIAL_KEY); } catch { raw = null; }
    if (!raw) return { status: 'never_started', daysLeft: TRIAL_DAYS, startedAt: 0 };
    try { t = JSON.parse(raw); } catch { return { status: 'never_started', daysLeft: TRIAL_DAYS, startedAt: 0 }; }
    const startedAt = t.startedAt || 0;
    if (!startedAt) return { status: 'never_started', daysLeft: TRIAL_DAYS, startedAt: 0 };
    const elapsed = Date.now() - startedAt;
    const daysLeft = Math.max(0, Math.ceil((TRIAL_DAYS * DAY_MS - elapsed) / DAY_MS));
    if (elapsed >= TRIAL_DAYS * DAY_MS) {
      return { status: 'expired', daysLeft: 0, startedAt };
    }
    return { status: 'active', daysLeft, startedAt };
  }

  function startTrialIfNeeded() {
    if (isFreeTool(cfg.toolId)) return getTrialState(); // free tools don't trigger trial
    const state = getTrialState();
    if (state.status === 'never_started') {
      try {
        localStorage.setItem(TRIAL_KEY, JSON.stringify({ startedAt: Date.now() }));
      } catch (e) { /* ignore */ }
      try { trackUsage('trial_started', { tool: cfg.toolId }); } catch (e) {}
      return getTrialState();
    }
    return state;
  }

  // ── License system (v2: bundle-aware + server-validated) ──
  // Storage shape (single account-wide license per bundle):
  //   store.account = {
  //     license: { key, bundleId, tier, expiresAt, lastValidated, deviceId, features }
  //   }
  // Backward compat: old per-tool store.licenses[toolId] is still read.

  function getLicense() {
    const store = loadStore();
    // v2 format
    if (store.account && store.account.license && store.account.license.key) {
      const lic = store.account.license;
      const expired = lic.expiresAt && lic.expiresAt < Date.now();
      if (expired) return { status: 'expired', tier: 'free', features: [], bundleId: null };
      return {
        status: 'active',
        tier: lic.tier || 'pro',
        bundleId: lic.bundleId,
        features: lic.features || ['*'],
        key: lic.key,
        expiresAt: lic.expiresAt,
        lastValidated: lic.lastValidated,
        issuedAt: lic.issuedAt
      };
    }
    // Legacy v1 per-tool store
    const legacy = store.licenses && store.licenses[cfg.toolId];
    if (legacy && !legacy.revoked) {
      return {
        status: 'active',
        tier: legacy.tier || 'pro',
        bundleId: parseBundleFromKey(legacy.key),
        features: legacy.features || ['*'],
        key: legacy.key,
        legacy: true
      };
    }
    return { status: 'free', tier: 'free', features: [], bundleId: null };
  }

  function parseBundleFromKey(key) {
    if (!key) return null;
    const m = key.match(/^LH-([A-Z]{2,4})-/);
    if (!m) return null;
    return CODE_TO_BUNDLE[m[1]] || null;
  }

  function isPro(feature) {
    const license = getLicense();
    if (license.status !== 'active') return false;
    if (!feature) return true;
    return license.features.indexOf(feature) !== -1 || license.features.indexOf('*') !== -1;
  }

  // ── Bundle-aware access check (the main public API) ──
  // Returns true if the current tool is unlocked under the user's bundle.
  // Free tools always pass. Enterprise bundle ('*') always passes.
  function bundleHasTool(bundleId, toolId) {
    if (!bundleId) return false;
    const bundle = BUNDLES[bundleId];
    if (!bundle) return false;
    if (bundle.tools === '*') return true;
    return bundle.tools.indexOf(toolId) !== -1;
  }

  function hasAccessToTool(toolId) {
    toolId = toolId || cfg.toolId;
    // Always free
    if (FREE_TOOLS.indexOf(toolId) !== -1) return true;
    // A real license takes precedence: bundle-aware
    const license = getLicense();
    if (license.status === 'active') {
      return bundleHasTool(license.bundleId, toolId);
    }
    // No license — fall back to trial. Active trial unlocks all Pro tools
    // (treat trial as Enterprise-level access for the duration).
    const trial = getTrialState();
    if (trial.status === 'active') return true;
    // Expired or never started — no access (free tools were handled above)
    return false;
  }

  // ── Server-side activate (calls Cloudflare Worker) ──
  // Falls back to client-only dev mode if no licenseApi configured.
  async function activate(key) {
    if (!key || typeof key !== 'string') {
      return { ok: false, message: 'Invalid key format' };
    }
    // v2 format: LH-{BUNDLE}-{XXXX}-{XXXX}-{HMAC4}  OR  v1 legacy: LH-XXX-XXXX-XXXX
    const v2Pattern = /^LH-[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    const v1Pattern = /^LH-[A-Z0-9]{2,6}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!v2Pattern.test(key) && !v1Pattern.test(key)) {
      return { ok: false, message: 'Key format invalid' };
    }

    const deviceId = getDeviceId();

    // Server validation
    if (ENDPOINTS.licenseApi) {
      try {
        const res = await fetch(ENDPOINTS.licenseApi + '/api/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, deviceId })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.valid) {
          return { ok: false, message: data.message || 'License rejected by server' };
        }
        // Persist to store.account
        const store = loadStore();
        if (!store.account) store.account = {};
        store.account.license = {
          key,
          bundleId: data.bundleId,
          tier: data.tier || 'pro',
          features: data.features || ['*'],
          expiresAt: data.expiry || null,
          lastValidated: Date.now(),
          deviceId,
          issuedAt: data.issuedAt || Date.now()
        };
        saveStore(store);
        return { ok: true, message: 'License activated', bundleId: data.bundleId };
      } catch (e) {
        return { ok: false, message: 'Network error: ' + (e.message || e) };
      }
    }

    // Dev fallback: client-only activation, derive bundle from key prefix
    const bundleId = parseBundleFromKey(key) || 'enterprise';
    const store = loadStore();
    if (!store.account) store.account = {};
    store.account.license = {
      key,
      bundleId,
      tier: 'pro',
      features: ['*'],
      expiresAt: null,
      lastValidated: Date.now(),
      deviceId,
      issuedAt: Date.now()
    };
    saveStore(store);
    return { ok: true, message: 'License activated (dev mode — no server)', bundleId };
  }

  // ── Periodic server re-validation (called every 24h) ──
  async function validateLicense() {
    if (!ENDPOINTS.licenseApi) return { ok: true, skipped: true };
    const license = getLicense();
    if (license.status !== 'active' || !license.key) return { ok: true, skipped: true };

    const sinceLastCheck = Date.now() - (license.lastValidated || 0);
    if (sinceLastCheck < VALIDATE_INTERVAL_MS) return { ok: true, cached: true };

    try {
      const res = await fetch(ENDPOINTS.licenseApi + '/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: license.key, deviceId: getDeviceId() })
      });
      const data = await res.json().catch(() => ({}));
      const store = loadStore();
      if (!store.account) store.account = {};
      if (!store.account.license) store.account.license = {};

      if (!res.ok || !data.valid) {
        // Server says license is invalid (revoked, expired, etc.)
        // Cache the failure but don't immediately lock — give 7-day grace
        const grace = (license.lastValidated || 0) + (7 * 24 * 60 * 60 * 1000);
        if (Date.now() > grace) {
          // Lock out
          delete store.account.license;
          saveStore(store);
          return { ok: false, message: data.message || 'License invalid', locked: true };
        }
        return { ok: true, graceMode: true };
      }

      store.account.license.lastValidated = Date.now();
      if (data.expiry) store.account.license.expiresAt = data.expiry;
      if (data.features) store.account.license.features = data.features;
      saveStore(store);
      return { ok: true };
    } catch (e) {
      // Network failure — treat as cached (don't lock the user out for offline)
      return { ok: true, networkError: true };
    }
  }

  function deactivate() {
    const store = loadStore();
    if (store.account && store.account.license) {
      delete store.account.license;
    }
    if (store.licenses && store.licenses[cfg.toolId]) {
      delete store.licenses[cfg.toolId];
    }
    saveStore(store);
    applyProGating();
    return { ok: true };
  }

  // ── Usage tracking (sends events to WP REST API in batched fashion) ──
  let usageQueue = [];
  let usageFlushTimer = null;

  function trackUsage(action, payload) {
    if (!action) return;
    const license = getLicense();
    usageQueue.push({
      tool: cfg.toolId,
      action,
      ts: Date.now(),
      sessionId,
      deviceId: getDeviceId(),
      licenseKey: license.key || null,
      payload: payload || null
    });
    scheduleUsageFlush();
  }

  function scheduleUsageFlush() {
    if (usageFlushTimer) return;
    usageFlushTimer = setTimeout(flushUsage, USAGE_BATCH_INTERVAL_MS);
  }

  async function flushUsage() {
    usageFlushTimer = null;
    if (usageQueue.length === 0) return;
    if (!ENDPOINTS.usageApi) {
      // Dev mode: just log + clear
      console.debug('[LifeHub] Usage events (dev mode, no usageApi):', usageQueue);
      usageQueue = [];
      return;
    }
    const events = usageQueue.slice();
    usageQueue = [];
    try {
      const license = getLicense();
      await fetch(wpRestUrl('track-usage'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': license.key || ''
        },
        body: JSON.stringify({ events }),
        keepalive: true
      });
    } catch (e) {
      // Network error — re-queue and retry on next flush
      usageQueue = events.concat(usageQueue);
    }
  }

  // Flush on page unload
  function flushUsageBeacon() {
    if (usageQueue.length === 0 || !ENDPOINTS.usageApi) return;
    const license = getLicense();
    const blob = new Blob([JSON.stringify({ events: usageQueue })], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(wpRestUrl('track-usage'), blob);
      usageQueue = [];
    }
  }

  // ── Pro gating (trial-aware) ──
  // During an active trial, gating treats Pro features as unlocked.
  // After expiry (and without a license), they re-lock.
  function gate(element, feature) {
    if (!element) return;
    const trial = getTrialState();
    const trialActive = trial.status === 'active';
    if (isPro(feature) || trialActive) {
      element.classList.remove('lifehub-locked');
      element.style.pointerEvents = '';
      element.style.opacity = '';
      const old = element.querySelector('.lifehub-lock-overlay');
      if (old) old.remove();
      return;
    }
    element.classList.add('lifehub-locked');
    element.style.position = element.style.position || 'relative';
    if (!element.querySelector('.lifehub-lock-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'lifehub-lock-overlay';
      overlay.innerHTML = '<div class="lifehub-lock-inner">🔒 <strong>Pro Feature</strong><br><small>Upgrade to unlock</small></div>';
      overlay.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        showUpgradeModal(feature);
      });
      element.appendChild(overlay);
    }
  }

  function applyProGating() {
    const elements = document.querySelectorAll('[data-pro]');
    elements.forEach(function(el){
      const feature = el.getAttribute('data-pro');
      gate(el, feature);
    });
  }

  function showUpgradeModal(feature) {
    const existing = document.getElementById('lifehub-upgrade-modal');
    if (existing) { existing.remove(); }
    const modal = document.createElement('div');
    modal.id = 'lifehub-upgrade-modal';
    modal.innerHTML = `
      <div class="lifehub-modal-backdrop"></div>
      <div class="lifehub-modal-body">
        <button class="lifehub-modal-close">&times;</button>
        <div class="lifehub-modal-icon">✨</div>
        <h2>Unlock Pro</h2>
        <p>This feature requires a Pro license${feature ? ' for <code>' + feature + '</code>' : ''}.</p>
        <p class="lifehub-modal-sub">Enter your license key to activate:</p>
        <input type="text" id="lifehub-key-input" placeholder="LH-XXX-XXXX-XXXX">
        <button class="lifehub-modal-activate">Activate</button>
        <p class="lifehub-modal-help">Don't have a key? Get yours from the admin dashboard.</p>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.lifehub-modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.lifehub-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.lifehub-modal-activate').addEventListener('click', async function(){
      const input = document.getElementById('lifehub-key-input');
      const btn = this;
      btn.disabled = true;
      btn.textContent = 'Activating…';
      try {
        const result = await activate(input.value.trim().toUpperCase());
        if (result.ok) {
          modal.remove();
          applyProGating();
          showToast('✓ Activated! Reloading...');
          setTimeout(() => location.reload(), 800);
        } else {
          input.style.borderColor = '#dc2626';
          showToast('✕ ' + result.message);
          btn.disabled = false;
          btn.textContent = 'Activate';
        }
      } catch (e) {
        showToast('✕ ' + (e.message || 'Activation failed'));
        btn.disabled = false;
        btn.textContent = 'Activate';
      }
    });
    setTimeout(() => document.getElementById('lifehub-key-input').focus(), 100);
  }

  function showToast(msg) {
    const existing = document.querySelector('.lifehub-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'lifehub-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ── Cloud sync (future hook) ──
  function maybeSyncCloud(eventType, data) {
    const store = loadStore();
    const endpoint = store.global && store.global.cloudEndpoint;
    if (!endpoint) return;
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventType, data, timestamp: Date.now() }),
        keepalive: true
      }).catch(()=>{}); // silent fail
    } catch(e) {}
  }

  // ── Inject CSS ──
  function injectStyles() {
    if (document.getElementById('lifehub-styles')) return;
    const style = document.createElement('style');
    style.id = 'lifehub-styles';
    style.textContent = `
      .lifehub-locked { position:relative; overflow:hidden; }
      .lifehub-lock-overlay { position:absolute; inset:0; background:rgba(245,245,243,0.85); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:1000; border-radius:inherit; }
      .lifehub-lock-inner { text-align:center; color:#1a1a1a; font-family:'Sora',system-ui,sans-serif; font-size:0.8rem; padding:10px 18px; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,0.06); }
      .lifehub-lock-inner strong { display:block; font-weight:600; margin:4px 0 2px; }
      .lifehub-lock-inner small { color:#999; font-size:0.68rem; }
      #lifehub-upgrade-modal { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; font-family:'Sora',system-ui,sans-serif; }
      .lifehub-modal-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); }
      .lifehub-modal-body { position:relative; background:#fff; border-radius:20px; padding:40px 36px; max-width:400px; width:90%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
      .lifehub-modal-close { position:absolute; top:14px; right:14px; width:30px; height:30px; border:none; background:#f5f5f3; border-radius:50%; cursor:pointer; font-size:1.1rem; color:#999; }
      .lifehub-modal-icon { font-size:3rem; margin-bottom:10px; }
      #lifehub-upgrade-modal h2 { font-size:1.4rem; font-weight:700; color:#1a1a1a; margin-bottom:8px; }
      #lifehub-upgrade-modal p { font-size:0.85rem; color:#666; margin-bottom:10px; }
      #lifehub-upgrade-modal p.lifehub-modal-sub { color:#999; font-size:0.75rem; margin-bottom:6px; }
      #lifehub-upgrade-modal code { background:#f5f5f3; padding:2px 6px; border-radius:4px; font-family:monospace; font-size:0.78rem; }
      #lifehub-key-input { width:100%; padding:12px 14px; background:#f5f5f3; border:1px solid rgba(0,0,0,0.06); border-radius:10px; color:#1a1a1a; font-family:monospace; font-size:0.85rem; margin-bottom:12px; letter-spacing:0.05em; text-align:center; }
      #lifehub-key-input:focus { outline:none; border-color:#1a1a1a; }
      .lifehub-modal-activate { width:100%; padding:12px; background:#1a1a1a; color:#fff; border:none; border-radius:10px; font-weight:600; font-size:0.82rem; cursor:pointer; font-family:inherit; }
      .lifehub-modal-activate:hover { background:#333; }
      .lifehub-modal-help { font-size:0.68rem; color:#bbb; margin-top:14px; }
      .lifehub-toast { position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#1a1a1a; color:#fff; padding:12px 24px; border-radius:99px; font-family:'Sora',system-ui,sans-serif; font-size:0.82rem; z-index:10001; box-shadow:0 4px 16px rgba(0,0,0,0.2); animation:lifehubSlideUp 0.3s; }
      @keyframes lifehubSlideUp { from { opacity:0; transform:translate(-50%,20px); } to { opacity:1; transform:translate(-50%,0); } }

      /* ── LifeHub Footer ── */
      #lifehub-footer { position:fixed; bottom:0; left:0; right:0; background:rgba(26,26,26,0.96); backdrop-filter:blur(12px); color:rgba(255,255,255,0.75); font-family:'Sora',system-ui,sans-serif; font-size:0.68rem; padding:10px 20px; z-index:9998; border-top:1px solid rgba(255,255,255,0.08); }
      .lh-footer-inner { max-width:1400px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
      .lh-footer-brand { display:flex; align-items:center; gap:8px; }
      .lh-footer-brand strong { color:#fff; font-weight:700; letter-spacing:-0.01em; }
      .lh-footer-dot { width:7px; height:7px; background:#6366f1; border-radius:50%; display:inline-block; }
      .lh-footer-sep { color:rgba(255,255,255,0.3); }
      .lh-footer-tool { color:rgba(255,255,255,0.5); }
      .lh-footer-links { display:flex; align-items:center; gap:10px; }
      .lh-footer-links a { color:rgba(255,255,255,0.6); text-decoration:none; transition:color 0.2s; }
      .lh-footer-links a:hover { color:#fff; }
      .lh-badge { font-size:0.58rem; padding:2px 8px; border-radius:99px; font-weight:700; letter-spacing:0.05em; margin-left:6px; }
      .lh-badge.lh-free { background:rgba(16,185,129,0.15); color:#34d399; }
      .lh-badge.lh-pro { background:linear-gradient(135deg,#f59e0b,#dc2626); color:#fff; }
      .lh-badge.lh-locked { background:rgba(239,68,68,0.15); color:#f87171; }

      /* Body padding to prevent footer overlap */
      body { padding-bottom:44px !important; }

      /* ── Upgrade Banner ── */
      #lifehub-upgrade-banner { position:fixed; top:0; left:0; right:0; background:linear-gradient(135deg,#1a1a1a,#111); color:#fff; padding:14px 20px; z-index:9997; box-shadow:0 4px 16px rgba(0,0,0,0.3); font-family:'Sora',system-ui,sans-serif; animation:lhSlideDown 0.4s; }
      @keyframes lhSlideDown { from { transform:translateY(-100%); } to { transform:translateY(0); } }
      .lh-banner-inner { max-width:1200px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
      .lh-banner-text { font-size:0.82rem; line-height:1.5; }
      .lh-banner-text strong { color:#f59e0b; display:block; margin-bottom:2px; font-size:0.85rem; }
      .lh-banner-text span { color:rgba(255,255,255,0.7); font-size:0.74rem; }
      .lh-banner-text s { color:rgba(255,255,255,0.3); }
      .lh-banner-actions { display:flex; gap:8px; flex-shrink:0; }
      .lh-banner-btn { padding:9px 20px; border-radius:99px; border:none; font-size:0.72rem; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.2s; text-decoration:none; display:inline-flex; align-items:center; }
      .lh-banner-primary { background:linear-gradient(135deg,#f59e0b,#dc2626); color:#fff; }
      .lh-banner-primary:hover { transform:translateY(-1px); box-shadow:0 4px 16px rgba(245,158,11,0.3); }
      .lh-banner-ghost { background:rgba(255,255,255,0.08); color:#fff; border:1px solid rgba(255,255,255,0.15); }
      .lh-banner-ghost:hover { background:rgba(255,255,255,0.15); }
      body:has(#lifehub-upgrade-banner) { padding-top:68px !important; }

      /* Trial-expired variant — red gradient instead of orange */
      #lifehub-upgrade-banner.lh-banner-expired { background:linear-gradient(135deg,#7f1d1d,#1a1a1a); }
      #lifehub-upgrade-banner.lh-banner-expired .lh-banner-text strong { color:#fca5a5; }

      /* ── Trial ribbon (active trial countdown) ── */
      #lifehub-trial-ribbon { position:fixed; top:14px; right:14px; display:flex; align-items:center; gap:8px; padding:7px 11px 7px 7px; background:rgba(26,26,26,0.94); backdrop-filter:blur(12px); color:#fff; border:1px solid rgba(245,158,11,0.3); border-radius:99px; font-family:'Sora',system-ui,sans-serif; font-size:0.7rem; z-index:9995; box-shadow:0 4px 16px rgba(0,0,0,0.2); animation:lhSlideIn 0.4s }
      @keyframes lhSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
      .lh-trial-pill { background:linear-gradient(135deg,#f59e0b,#dc2626); color:#fff; font-size:0.55rem; font-weight:700; letter-spacing:0.1em; padding:3px 7px; border-radius:99px }
      .lh-trial-text { color:rgba(255,255,255,0.85); font-weight:600 }
      .lh-trial-cta { color:#f59e0b; text-decoration:none; font-weight:600; padding:0 4px }
      .lh-trial-cta:hover { color:#fbbf24 }
      .lh-trial-close { background:transparent; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:0.95rem; padding:0 2px; line-height:1 }
      .lh-trial-close:hover { color:#fff }

      /* ── Watermark ── */
      #lifehub-watermark { position:fixed; bottom:60px; right:20px; background:rgba(26,26,26,0.9); color:#f59e0b; padding:6px 14px; border-radius:99px; font-family:'Sora',system-ui,sans-serif; font-size:0.6rem; font-weight:700; letter-spacing:0.1em; z-index:9996; pointer-events:none; border:1px solid rgba(245,158,11,0.3); }

      /* Responsive */
      @media(max-width:768px) {
        .lh-banner-inner { flex-direction:column; text-align:center; }
        .lh-footer-inner { flex-direction:column; gap:6px; }
        #lifehub-footer { padding:8px 14px; font-size:0.62rem; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Free tier check ──
  function isFreeTool(toolId) {
    return FREE_TOOLS.indexOf(toolId || cfg.toolId) !== -1;
  }

  // Now bundle-aware: checks if the current tool is included in the user's bundle
  function hasAccess(toolId) {
    return hasAccessToTool(toolId);
  }

  // ── LifeHub Footer ──
  function injectFooter() {
    if (document.getElementById('lifehub-footer')) return;
    const footer = document.createElement('div');
    footer.id = 'lifehub-footer';
    const license = getLicense();
    const isLicensed = license.status === 'active';
    const badge = isFreeTool() ? '<span class="lh-badge lh-free">FREE</span>' : (isLicensed ? '<span class="lh-badge lh-pro">✨ PRO</span>' : '<span class="lh-badge lh-locked">🔒 LOCKED</span>');
    footer.innerHTML = `
      <div class="lh-footer-inner">
        <div class="lh-footer-brand">
          <span class="lh-footer-dot"></span>
          <strong>LifeHub</strong>
          <span class="lh-footer-sep">·</span>
          <span class="lh-footer-tool">${cfg.toolName}</span>
          ${badge}
        </div>
        <div class="lh-footer-links">
          <a href="${BUNDLE.landingUrl}" target="_blank">Get Bundle</a>
          <span class="lh-footer-sep">·</span>
          <a href="#" onclick="LifeHub.showUpgradeModal();return false;">License Key</a>
        </div>
      </div>`;
    document.body.appendChild(footer);
  }

  // ── Upgrade Banner for locked tools (trial-aware) ──
  // Three states the customer can be in (besides licensed/free):
  //   • Trial active   → blue banner showing days left + soft CTA
  //   • Trial expired  → red banner: "Your 7-day trial ended" + hard CTA
  //   • Never started  → trial auto-starts on init, so this state is rare
  function injectUpgradeBanner() {
    if (hasAccess()) return; // licensed, free tool, or active trial unlocks → no banner
    if (document.getElementById('lifehub-upgrade-banner')) return;

    const trial = getTrialState();
    const banner = document.createElement('div');
    banner.id = 'lifehub-upgrade-banner';

    // Trial-expired state — full lock + strong CTA
    if (trial.status === 'expired') {
      banner.classList.add('lh-banner-expired');
      banner.innerHTML = `
        <div class="lh-banner-inner">
          <div class="lh-banner-text">
            <strong>⏰ Your 7-day free trial has ended.</strong>
            <span>Pick a bundle to keep using all 43 tools — from <strong>$9/mo</strong> or <strong>$149 lifetime</strong>.</span>
          </div>
          <div class="lh-banner-actions">
            <a href="${BUNDLE.purchaseUrl}" target="_blank" class="lh-banner-btn lh-banner-primary">See pricing</a>
            <button class="lh-banner-btn lh-banner-ghost" onclick="LifeHub.showUpgradeModal()">I have a key</button>
          </div>
        </div>`;
      document.body.appendChild(banner);
      applyLockWatermark();
      return;
    }

    // Fallback (trial not started or never_started but isFreeTool=false somehow)
    // — show generic Pro lock banner. In practice this almost never fires
    // because trial auto-starts in init().
    banner.innerHTML = `
      <div class="lh-banner-inner">
        <div class="lh-banner-text">
          <strong>🔒 This is a Pro tool.</strong>
          <span>Start your <strong>7-day free trial</strong> — no credit card needed. Or paste a license key.</span>
        </div>
        <div class="lh-banner-actions">
          <button class="lh-banner-btn lh-banner-primary" onclick="LifeHub.startTrial()">Start free trial</button>
          <button class="lh-banner-btn lh-banner-ghost" onclick="LifeHub.showUpgradeModal()">I have a key</button>
        </div>
      </div>`;
    document.body.appendChild(banner);
    applyLockWatermark();
  }

  // Subtle countdown ribbon shown during ACTIVE trial (doesn't lock the tool).
  function injectTrialRibbon() {
    if (document.getElementById('lifehub-trial-ribbon')) return;
    const license = getLicense();
    if (license.status === 'active') return; // licensed users don't see this
    if (isFreeTool()) return;                 // free tools don't show trial UI
    const trial = getTrialState();
    if (trial.status !== 'active') return;

    const r = document.createElement('div');
    r.id = 'lifehub-trial-ribbon';
    const dayWord = trial.daysLeft === 1 ? 'day' : 'days';
    r.innerHTML = `
      <span class="lh-trial-pill">FREE TRIAL</span>
      <span class="lh-trial-text">${trial.daysLeft} ${dayWord} left</span>
      <a href="${BUNDLE.purchaseUrl}" target="_blank" class="lh-trial-cta">Upgrade →</a>
      <button class="lh-trial-close" onclick="this.parentElement.remove()" aria-label="Dismiss">×</button>
    `;
    document.body.appendChild(r);
  }

  function applyLockWatermark() {
    if (document.getElementById('lifehub-watermark')) return;
    const wm = document.createElement('div');
    wm.id = 'lifehub-watermark';
    wm.textContent = 'DEMO · UNLOCK AT LIFEHUB.PRO';
    document.body.appendChild(wm);
  }

  function removeLock() {
    const b = document.getElementById('lifehub-upgrade-banner');
    if (b) b.remove();
    const w = document.getElementById('lifehub-watermark');
    if (w) w.remove();
  }

  // ── Init ──
  function init() {
    injectStyles();
    beginSession();
    // Track tool open as a usage event (Phase 1 telemetry)
    trackUsage('opened', { tool: cfg.toolId });

    // Auto-start the 7-day trial the first time anyone opens any Pro tool.
    // Free tools and licensed users skip this. Idempotent.
    const license = getLicense();
    if (license.status !== 'active' && !isFreeTool(cfg.toolId)) {
      startTrialIfNeeded();
    }

    const onReady = () => {
      applyProGating();
      injectFooter();
      injectUpgradeBanner();
      injectTrialRibbon();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }

    // Periodic license re-validation (24h cache, runs once per page load)
    setTimeout(() => { validateLicense().catch(() => {}); }, 2000);
  }

  // End session on unload + flush usage
  window.addEventListener('beforeunload', () => {
    endSession();
    flushUsageBeacon();
  });
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') {
      endSession();
      flushUsageBeacon();
    }
  });

  // ── Expose API ──
  window.LifeHub = {
    version: '2.1',
    tool: cfg,
    bundle: BUNDLE,
    bundles: BUNDLES,
    freeTools: FREE_TOOLS,
    endpoints: ENDPOINTS,
    isFreeTool: isFreeTool,
    hasAccess: hasAccess,
    hasAccessToTool: hasAccessToTool,
    bundleHasTool: bundleHasTool,
    parseBundleFromKey: parseBundleFromKey,
    getDeviceId: getDeviceId,
    track: track,
    trackUsage: trackUsage,
    flushUsage: flushUsage,
    getLicense: getLicense,
    isPro: isPro,
    gate: gate,
    activate: activate,
    validateLicense: validateLicense,
    deactivate: deactivate,
    applyProGating: applyProGating,
    showUpgradeModal: showUpgradeModal,
    removeLock: removeLock,
    // Trial API
    getTrialState: getTrialState,
    startTrial: () => {
      const s = startTrialIfNeeded();
      // Refresh UI: remove banner if present + add ribbon
      const b = document.getElementById('lifehub-upgrade-banner');
      if (b) b.remove();
      const w = document.getElementById('lifehub-watermark');
      if (w) w.remove();
      injectTrialRibbon();
      applyProGating();
      return s;
    },
    get cloudEndpoint() {
      const store = loadStore();
      return store.global.cloudEndpoint || '';
    },
    set cloudEndpoint(url) {
      const store = loadStore();
      store.global.cloudEndpoint = url || '';
      saveStore(store);
    }
  };

  init();
})();
