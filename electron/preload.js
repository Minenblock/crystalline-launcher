const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  discordLogin: () => ipcRenderer.invoke('discord-login'),
  discordLogout: () => ipcRenderer.invoke('discord-logout'),
  checkDiscordAuth: () => ipcRenderer.invoke('check-discord-auth'),
  login: () => ipcRenderer.invoke('msmc-login'),
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  logout: () => ipcRenderer.invoke('logout'),
  launch: (instanceId) => ipcRenderer.invoke('launch-minecraft', instanceId),
  createInstance: (options) => ipcRenderer.invoke('create-instance', options),
  getInstances: () => ipcRenderer.invoke('get-instances'),
  deleteInstance: (instanceId) => ipcRenderer.invoke('delete-instance', instanceId),
  deleteInstanceFile: (instanceId, folder, fileName) => ipcRenderer.invoke('delete-instance-file', instanceId, folder, fileName),
  getInstanceContents: (instanceId) => ipcRenderer.invoke('get-instance-contents', instanceId),
  getMcVersions: () => ipcRenderer.invoke('get-mc-versions'),
  getLoaderVersions: (mcVersion, loader) => ipcRenderer.invoke('get-loader-versions', mcVersion, loader),
  importModpack: (filePath, name) => ipcRenderer.invoke('import-modpack', filePath, name),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openInstanceFolder: (instanceId) => ipcRenderer.invoke('open-instance-folder', instanceId),
  downloadModrinthFile: (url, instanceId, folderName, fileName) => ipcRenderer.invoke('download-modrinth-file', url, instanceId, folderName, fileName),
  downloadModpackUrls: (urls, instanceId) => ipcRenderer.invoke('download-modpack-urls', urls, instanceId),
  checkModpackInstalled: () => ipcRenderer.invoke('check-modpack-installed'),
  checkModpackUpdate: () => ipcRenderer.invoke('check-modpack-update'),
  installOfficialModpack: (url, version) => ipcRenderer.invoke('install-official-modpack', url, version),
  selectVanillaFolder: () => ipcRenderer.invoke('select-vanilla-folder'),
  getDefaultVanillaPath: () => ipcRenderer.invoke('get-default-vanilla-path'),
  selectSkinFile: () => ipcRenderer.invoke('select-skin-file'),
  loadSkins: () => ipcRenderer.invoke('load-skins'),
  deleteSkin: (fileName) => ipcRenderer.invoke('delete-skin', fileName),
  applyMinecraftSkin: (path, variant) => ipcRenderer.invoke('apply-minecraft-skin', path, variant),
  fetchPlayerSkin: (username) => ipcRenderer.invoke('fetch-player-skin', username),
  getFilePath: (file) => webUtils.getPathForFile(file),
  onDiscordStatus: (callback) => ipcRenderer.on('discord-status', (_event, value) => callback(value)),
  onDiscordLocalUser: (callback) => ipcRenderer.on('discord-local-user', (_event, user) => callback(user)),
  onLaunchStatus: (callback) => ipcRenderer.on('launch-status', (_event, value) => callback(value)),
  onMcLog: (callback) => ipcRenderer.on('mc-log', (_event, value) => callback(value)),
  onDiscordActivityJoin: (callback) => ipcRenderer.on('discord-activity-join', (_event, secret) => callback(secret)),
  onDiscordBridgeUpdate: (callback) => ipcRenderer.on('discord-bridge-update', (_event, serverIp) => callback(serverIp)),
  onDiscordJoinRequest: (callback) => ipcRenderer.on('discord-join-request', (_event, user) => callback(user)),
  approveJoinRequest: (userId) => ipcRenderer.invoke('approve-join-request', userId),
  denyJoinRequest: (userId) => ipcRenderer.invoke('deny-join-request', userId),
  updateDiscordPresence: (opts) => ipcRenderer.invoke('update-discord-presence', opts),
  setPendingJoinServer: (serverIp) => ipcRenderer.invoke('set-pending-join-server', serverIp),
  resetInstanceLock: (instanceId) => ipcRenderer.invoke('reset-instance-lock', instanceId),
  repairInstance: (instanceId) => ipcRenderer.invoke('repair-instance', instanceId),
  forceQuit: () => ipcRenderer.invoke('force-quit'),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  showSettings: () => ipcRenderer.invoke('show-settings'),
  showFriends: () => ipcRenderer.invoke('show-friends'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onNavigateTo: (callback) => ipcRenderer.on('navigate-to', (_event, tab) => callback(tab)),
  onShowTrayToast: (callback) => ipcRenderer.on('show-tray-toast', () => callback()),
  onShowQuitWarning: (callback) => ipcRenderer.on('show-quit-warning', () => callback()),

  // CurseForge API
  getCurseForgeCategories: (classId) => ipcRenderer.invoke('get-curseforge-categories', classId),
  searchCurseForge: (query) => ipcRenderer.invoke('search-curseforge', query),
  getCurseForgeFiles: (modId, gameVersion, modLoaderType) => ipcRenderer.invoke('get-curseforge-files', modId, gameVersion, modLoaderType),
  downloadCurseForgeFile: (url, instanceId, folderName, fileName) => ipcRenderer.invoke('download-curseforge-file', url, instanceId, folderName, fileName),

  // Party System
  createParty: (user) => ipcRenderer.invoke('create-party', user),
  joinParty: (groupId, aesKey, user) => ipcRenderer.invoke('join-party', groupId, aesKey, user),
  leaveParty: (userId) => ipcRenderer.invoke('leave-party', userId),
  sendPartyChatMessage: (user, message) => ipcRenderer.invoke('send-party-chat-message', user, message),
  updatePartyStatus: (statusText, userId) => ipcRenderer.invoke('update-party-status', statusText, userId),
  startPartyInstance: (payload) => ipcRenderer.invoke('start-party-instance', payload),
  onPartyUpdate: (callback) => ipcRenderer.on('party-update', (_event, state) => callback(state)),
  onPartyStartInstance: (callback) => ipcRenderer.on('party-start-instance', (_event, payload) => callback(payload)),
  sendPartyChat: (message, user) => ipcRenderer.invoke('send-party-chat', message, user),
  onPartyChatMessage: (callback) => ipcRenderer.on('party-chat-message', (_event, msg) => callback(msg)),

  // Premium Features Helpers
  getSystemRam: () => ipcRenderer.invoke('get-system-ram'),
  scanInstanceMods: (instanceId) => ipcRenderer.invoke('scan-instance-mods', instanceId),
  deleteModFiles: (filePaths) => ipcRenderer.invoke('delete-mod-files', filePaths),

  // Auto-Updater
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (_event, err) => callback(err)),
  startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),

  // File watcher
  onInstancesChanged: (callback) => ipcRenderer.on('instances-changed', () => callback()),

  // Instance Stats
  onInstanceStats: (callback) => ipcRenderer.on('instance-stats', (_event, stats) => callback(stats)),

  // Version / Storage management
  listVersions: () => ipcRenderer.invoke('list-versions'),
  deleteVersion: (versionName) => ipcRenderer.invoke('delete-version', versionName),
  getPatchNotes: () => ipcRenderer.invoke('get-patch-notes')
});
