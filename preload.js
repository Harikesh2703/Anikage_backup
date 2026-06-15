const { contextBridge, ipcRenderer } = require('electron');

// SECURITY: Whitelist allowed IPC channels to prevent XSS from invoking
// dangerous handlers like factory-reset, open-path, etc. (VULN-05)
const ALLOWED_INVOKE_CHANNELS = [
  'select-download-directory',
  'open-path',
  'show-item-in-folder',
  'factory-reset',
  'patch-scraper',
  'check-for-updates',
  'get-local-versions',
  'get-available-patches',
  'install-patch',
  'auto-install-patches',
  'restart-app',
  'export-db',
  'import-db'
];

const ALLOWED_ON_CHANNELS = [
  'update-available',
  'update-downloaded',
  'broadcast-message'
];

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, data) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      console.error(`[Preload] Blocked invoke on disallowed channel: ${channel}`);
      return Promise.reject(new Error(`IPC channel "${channel}" is not allowed`));
    }
    return ipcRenderer.invoke(channel, data);
  },
  on: (channel, func) => {
    if (!ALLOWED_ON_CHANNELS.includes(channel)) {
      console.error(`[Preload] Blocked listener on disallowed channel: ${channel}`);
      return () => {};
    }
    const subscription = (event, ...args) => func(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  }
});
