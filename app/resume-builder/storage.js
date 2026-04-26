/**
 * LifeHub Resume Builder — Multi-CV Storage
 * Persists CVs to localStorage so refresh doesn't lose data.
 *
 * Schema:
 *   "lifehub:resume-builder:cvs"     → { activeId, cvs: { [id]: CV } }
 *   "lifehub:resume-builder:gemini-key" → "AIza..."
 *   "lifehub:resume-builder:settings"   → { model, language }
 */
(function () {
  'use strict';

  const KEY_CVS = 'lifehub:resume-builder:cvs';
  const KEY_API = 'lifehub:resume-builder:gemini-key';
  const KEY_SETTINGS = 'lifehub:resume-builder:settings';
  const KEY_VERSIONS_PREFIX = 'lifehub:resume-builder:versions:';
  const MAX_VERSIONS_PER_CV = 50;

  // ── Defaults ──
  const DEFAULT_SETTINGS = {
    model: 'gemini-2.0-flash',
    language: 'en'
  };

  function defaultCV(name) {
    return {
      id: 'cv-' + Math.random().toString(36).slice(2, 10),
      name: name || 'Untitled CV',
      updatedAt: Date.now(),
      template: 'modern',
      themeColor: '#1a1a1a',
      photo: null,
      personal: {
        name: 'Sarah Johnson',
        title: 'Senior Product Designer',
        email: 'sarah@email.com',
        phone: '+1 555 123 4567',
        location: 'New York, NY',
        website: 'sarahjohnson.com'
      },
      summary: 'Product designer with 8+ years of experience creating user-centered digital products. Led design teams at Fortune 500 companies and startups, driving a 40% increase in user engagement.',
      experience: [
        { title: 'Senior Product Designer', company: 'TechCorp', period: '2021 - Present', desc: 'Led redesign of flagship product, increasing user retention by 35%. Managed a team of 4 designers.' },
        { title: 'Product Designer', company: 'StartupXYZ', period: '2018 - 2021', desc: 'Designed mobile app from 0 to 1, reaching 500K downloads in first year. Established design system.' }
      ],
      education: [
        { title: 'M.Sc. Human-Computer Interaction', company: 'Stanford University', period: '2016 - 2018', desc: '' },
        { title: 'B.A. Visual Communication', company: 'NYU', period: '2012 - 2016', desc: '' }
      ],
      skills: ['Figma', 'Sketch', 'Prototyping', 'User Research', 'Design Systems', 'HTML/CSS', 'React', 'Accessibility', 'Data Visualization', 'Agile'],
      targetJob: '',
      atsScore: null,        // { score, missingKeywords:[], suggestions:[] }
      coverLetter: ''
    };
  }

  // ── Read/Write Bag ──
  function readBag() {
    try {
      const raw = localStorage.getItem(KEY_CVS);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[storage] readBag failed:', e);
      return null;
    }
  }

  function writeBag(bag) {
    try {
      localStorage.setItem(KEY_CVS, JSON.stringify(bag));
    } catch (e) {
      console.error('[storage] writeBag failed:', e);
      if (e.name === 'QuotaExceededError') {
        alert('Storage full. Delete some CVs or clear photos to free space.');
      }
    }
  }

  function ensureBag() {
    let bag = readBag();
    if (!bag || !bag.cvs || Object.keys(bag.cvs).length === 0) {
      const cv = defaultCV('My CV');
      bag = { activeId: cv.id, cvs: { [cv.id]: cv } };
      writeBag(bag);
    }
    return bag;
  }

  // ── Public CV API ──
  function listCVs() {
    const bag = ensureBag();
    return Object.values(bag.cvs)
      .map(cv => ({ id: cv.id, name: cv.name, updatedAt: cv.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function loadCV(id) {
    const bag = ensureBag();
    return bag.cvs[id] || null;
  }

  function getActiveCV() {
    const bag = ensureBag();
    return bag.cvs[bag.activeId] || Object.values(bag.cvs)[0];
  }

  function setActiveCV(id) {
    const bag = ensureBag();
    if (!bag.cvs[id]) return false;
    bag.activeId = id;
    writeBag(bag);
    return true;
  }

  let saveTimer = null;
  function saveCV(cv, immediate) {
    if (!cv || !cv.id) return;
    cv.updatedAt = Date.now();
    if (immediate) {
      const bag = ensureBag();
      bag.cvs[cv.id] = cv;
      writeBag(bag);
      return;
    }
    // Debounced
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const bag = ensureBag();
      bag.cvs[cv.id] = cv;
      writeBag(bag);
    }, 500);
  }

  function createCV(name) {
    const bag = ensureBag();
    const cv = defaultCV(name || 'New CV');
    bag.cvs[cv.id] = cv;
    bag.activeId = cv.id;
    writeBag(bag);
    return cv;
  }

  function createBlankCV(name) {
    const cv = defaultCV(name || 'Blank CV');
    cv.personal = { name: '', title: '', email: '', phone: '', location: '', website: '' };
    cv.summary = '';
    cv.experience = [];
    cv.education = [];
    cv.skills = [];
    const bag = ensureBag();
    bag.cvs[cv.id] = cv;
    bag.activeId = cv.id;
    writeBag(bag);
    return cv;
  }

  function duplicateCV(id) {
    const bag = ensureBag();
    const src = bag.cvs[id];
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 'cv-' + Math.random().toString(36).slice(2, 10);
    copy.name = src.name + ' (Copy)';
    copy.updatedAt = Date.now();
    bag.cvs[copy.id] = copy;
    bag.activeId = copy.id;
    writeBag(bag);
    return copy;
  }

  function deleteCV(id) {
    const bag = ensureBag();
    if (!bag.cvs[id]) return false;
    delete bag.cvs[id];
    // Also delete its version history
    clearVersions(id);
    if (Object.keys(bag.cvs).length === 0) {
      const cv = defaultCV('My CV');
      bag.cvs[cv.id] = cv;
      bag.activeId = cv.id;
    } else if (bag.activeId === id) {
      bag.activeId = Object.keys(bag.cvs)[0];
    }
    writeBag(bag);
    return true;
  }

  function renameCV(id, name) {
    const bag = ensureBag();
    if (!bag.cvs[id]) return false;
    bag.cvs[id].name = name;
    bag.cvs[id].updatedAt = Date.now();
    writeBag(bag);
    return true;
  }

  // ── API Key ──
  function getApiKey() {
    return localStorage.getItem(KEY_API) || '';
  }

  function setApiKey(key) {
    if (key) localStorage.setItem(KEY_API, key);
    else localStorage.removeItem(KEY_API);
  }

  // ── Version History (per CV) ──
  function versionsKey(cvId) {
    return KEY_VERSIONS_PREFIX + cvId;
  }

  function readVersions(cvId) {
    try {
      const raw = localStorage.getItem(versionsKey(cvId));
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.error('[storage] readVersions failed:', e);
      return [];
    }
  }

  function writeVersions(cvId, arr) {
    try {
      localStorage.setItem(versionsKey(cvId), JSON.stringify(arr));
    } catch (e) {
      console.error('[storage] writeVersions failed:', e);
      if (e.name === 'QuotaExceededError') {
        // Auto-prune older half and retry
        const half = Math.floor(arr.length / 2);
        try {
          localStorage.setItem(versionsKey(cvId), JSON.stringify(arr.slice(0, half)));
          return { pruned: half };
        } catch (e2) {
          alert('Version history storage full. Delete some versions or CVs to free space.');
        }
      }
    }
    return { pruned: 0 };
  }

  function listVersions(cvId) {
    const arr = readVersions(cvId);
    // Newest first; tie-break by id (which embeds a counter+random) for stable order
    return arr
      .map(v => ({
        id: v.id,
        createdAt: v.createdAt,
        source: v.source,
        note: v.note || '',
        sizeBytes: JSON.stringify(v.snapshot || {}).length
      }))
      .sort((a, b) => (b.createdAt - a.createdAt) || (a.id < b.id ? 1 : -1));
  }

  function loadVersion(cvId, versionId) {
    const arr = readVersions(cvId);
    return arr.find(v => v.id === versionId) || null;
  }

  function saveVersion(cvId, snapshot, source, note) {
    if (!cvId || !snapshot) return null;
    const arr = readVersions(cvId);
    const v = {
      id: 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(),
      source: source || 'manual',
      note: note || '',
      snapshot: JSON.parse(JSON.stringify(snapshot))
    };
    arr.push(v);
    // Auto-prune to keep newest MAX_VERSIONS
    if (arr.length > MAX_VERSIONS_PER_CV) {
      arr.sort((a, b) => a.createdAt - b.createdAt);
      arr.splice(0, arr.length - MAX_VERSIONS_PER_CV);
    }
    writeVersions(cvId, arr);
    return v;
  }

  // De-duplicate auto-snapshots: skip if last snapshot was <30s ago AND content is identical
  function maybeSaveAutoVersion(cvId, snapshot, source, note) {
    const arr = readVersions(cvId);
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      const recent = (Date.now() - last.createdAt) < 30000;
      if (recent && last.source !== 'manual') {
        const sameContent = JSON.stringify(last.snapshot) === JSON.stringify(snapshot);
        if (sameContent) return null;
      }
    }
    return saveVersion(cvId, snapshot, source, note);
  }

  function deleteVersion(cvId, versionId) {
    const arr = readVersions(cvId);
    const filtered = arr.filter(v => v.id !== versionId);
    writeVersions(cvId, filtered);
    return arr.length !== filtered.length;
  }

  function clearVersions(cvId) {
    localStorage.removeItem(versionsKey(cvId));
  }

  // ── Settings ──
  function getSettings() {
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function setSettings(patch) {
    const next = { ...getSettings(), ...patch };
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(next));
    return next;
  }

  // ── Export ──
  window.RBStorage = {
    listCVs, loadCV, getActiveCV, setActiveCV,
    saveCV, createCV, createBlankCV, duplicateCV, deleteCV, renameCV,
    getApiKey, setApiKey,
    getSettings, setSettings,
    defaultCV,
    // versions
    listVersions, loadVersion, saveVersion, maybeSaveAutoVersion,
    deleteVersion, clearVersions
  };
})();
