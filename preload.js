/**
 * Preload script — runs in the renderer before web pages load.
 * Exposes a small, safe surface to the web app so it can detect
 * that it's running inside the LifeHub Desktop wrapper.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('LIFEHUB_DESKTOP', {
	platform: process.platform,
	version: process.env.npm_package_version || '1.0.0',
	isDesktop: true,
	openExternal: (url) => ipcRenderer.invoke('open-external', url),
	getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
