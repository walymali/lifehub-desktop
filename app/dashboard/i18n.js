/*!
 * LifeHub i18n — minimal client-side translation helper.
 * Usage:
 *   <script src="../dashboard/i18n.js" data-default-locale="en"></script>
 *   later: <span data-i18n="dashboard.welcome">Welcome</span>
 *          window.t('dashboard.welcome', { name: 'Ali' })
 */
(function () {
	'use strict';

	const LOCALES_DIR = '../dashboard/locales/';
	const STORAGE_KEY = 'lifehub:locale';
	const DEFAULT_LOCALE = (() => {
		const script = document.currentScript;
		if (script && script.dataset.defaultLocale) return script.dataset.defaultLocale;
		// Try browser language
		const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
		return ['en', 'ar'].includes(nav) ? nav : 'en';
	})();

	const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'];

	let currentLocale = localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE;
	let strings = {};
	let listeners = [];

	function getNested(obj, path) {
		return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
	}

	function interpolate(s, params) {
		if (!params) return s;
		return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
	}

	function t(key, params) {
		const v = getNested(strings, key);
		if (v == null) return key; // fallback to key
		return interpolate(String(v), params);
	}

	async function loadLocale(locale) {
		try {
			const res = await fetch(`${LOCALES_DIR}${locale}.json?v=${Date.now()}`);
			if (!res.ok) throw new Error('Locale fetch failed');
			strings = await res.json();
			currentLocale = locale;
			localStorage.setItem(STORAGE_KEY, locale);
			applyDom();
			document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
			document.documentElement.lang = locale;
			listeners.forEach(fn => { try { fn(locale); } catch (e) { console.error(e); } });
			return true;
		} catch (e) {
			console.warn('[i18n] Failed to load locale', locale, e);
			return false;
		}
	}

	function applyDom() {
		// data-i18n="key" → text content
		document.querySelectorAll('[data-i18n]').forEach(el => {
			el.textContent = t(el.dataset.i18n);
		});
		// data-i18n-placeholder="key" → placeholder attr
		document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
			el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
		});
		// data-i18n-title="key" → title attr (tooltip)
		document.querySelectorAll('[data-i18n-title]').forEach(el => {
			el.setAttribute('title', t(el.dataset.i18nTitle));
		});
		// data-i18n-aria="key" → aria-label
		document.querySelectorAll('[data-i18n-aria]').forEach(el => {
			el.setAttribute('aria-label', t(el.dataset.i18nAria));
		});
	}

	function setLocale(locale) { return loadLocale(locale); }
	function getLocale() { return currentLocale; }
	function isRtl() { return RTL_LOCALES.includes(currentLocale); }
	function onChange(fn) { listeners.push(fn); }

	// Boot
	const ready = loadLocale(currentLocale);

	// Expose
	window.LifeHubI18n = { t, setLocale, getLocale, isRtl, onChange, applyDom, ready };
	window.t = t; // shortcut
})();
